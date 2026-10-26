/**
 * El servidor tal como se despliega: proceso propio (`node server/src/index.js`), NODE_ENV=production,
 * variables de entorno, base de datos en disco (SQLite, o PostgreSQL si PERSIST_DATABASE_URL), detrás
 * de un proxy de confianza. Comprueba:
 *   - que no arranca con una configuración insegura (sin secreto, sin origen, origen http);
 *   - salud y disponibilidad (/api/health, /api/ready con la base de datos);
 *   - CORS y WebSockets solo desde CLIENT_ORIGIN;
 *   - IP real tras el proxy (X-Forwarded-For) en los límites de intentos;
 *   - registros JSON, sin tokens ni secretos;
 *   - cierre ordenado (SIGTERM, como al desplegar una versión nueva) en plena expedición: cada
 *     jugador recibe su resultado «interrumpida», su progreso queda guardado y el proceso sale con 0.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@colyseus/sdk';
import { C, S, PROTOCOL_VERSION, ROOM_NAME } from '../../shared/protocol.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const LOADER = existsSync(join(ROOT, 'node_modules/@colyseus/core')) ? [] : ['--import', join(ROOT, 'tests/.vendor/loader.mjs')];
const PORT = 3100 + Math.floor(Math.random() * 300), URL0 = `http://127.0.0.1:${PORT}`;
const ORIGIN = 'https://juego.ejemplo.test', SECRET = randomBytes(48).toString('base64url');
const wait = ms => new Promise(r => setTimeout(r, ms));
const until = async (fn, ms = 6000, what = 'condición') => { const t0 = Date.now(); while (Date.now() - t0 < ms) { const v = await fn(); if (v) return v; await wait(25); } throw new Error('Tiempo agotado: ' + what); };

function start(env, { expectExit = false } = {}) {
  const p = spawn(process.execPath, [...LOADER, join(ROOT, 'server/src/index.js')], { cwd: ROOT, env: Object.assign({ PATH: process.env.PATH }, env), stdio: ['ignore', 'pipe', 'pipe'] });
  p.out = ''; p.err = '';
  p.stdout.on('data', d => { p.out += d; }); p.stderr.on('data', d => { p.err += d; });
  p.exited = new Promise(r => p.on('exit', (code, sig) => r({ code, sig })));
  return p;
}
const lines = p => (p.out + p.err).split('\n').filter(l => l.startsWith('{')).map(l => JSON.parse(l));
const http = (method, path, { body, token, headers = {} } = {}) => fetch(URL0 + path, { method, headers: Object.assign({ 'content-type': 'application/json' }, token ? { authorization: 'Bearer ' + token } : {}, headers), body: body && JSON.stringify(body) })
  .then(async r => ({ status: r.status, headers: r.headers, body: await r.json().catch(() => null) }));

test('configuración insegura: el servidor se niega a arrancar en producción', async () => {
  const base = { NODE_ENV: 'production', PORT: String(PORT), DATA_DIR: mkdtempSync(join(tmpdir(), 'ma-prod-')) };
  for (const [env, why] of [
    [base, /AUTH_SECRET/],
    [Object.assign({ AUTH_SECRET: SECRET }, base), /CLIENT_ORIGIN/],
    [Object.assign({ AUTH_SECRET: SECRET, CLIENT_ORIGIN: 'http://juego.ejemplo.test' }, base), /HTTPS/],
    [Object.assign({ AUTH_SECRET: SECRET, CLIENT_ORIGIN: ORIGIN, PROFILE_STORE: 'memory' }, base), /memoria|memory/],
  ]) {
    const p = start(env), r = await p.exited;
    assert.equal(r.code, 78, 'código de salida de configuración');
    assert.match(p.err, why);
    assert.ok(!p.err.includes(SECRET), 'el secreto no aparece en la salida');
  }
});

test('servidor de producción: salud, orígenes, IP tras el proxy, registros y cierre ordenado en plena expedición', { timeout: 90000 }, async () => {
  const dir = mkdtempSync(join(tmpdir(), 'ma-prod-'));
  const db = process.env.PERSIST_DATABASE_URL ? { PROFILE_STORE: 'postgres', DATABASE_URL: process.env.PERSIST_DATABASE_URL } : { PROFILE_STORE: 'sqlite', SQLITE_FILE: join(dir, 'perfiles.db') };
  const srv = start(Object.assign({ NODE_ENV: 'production', PORT: String(PORT), AUTH_SECRET: SECRET, CLIENT_ORIGIN: ORIGIN, TRUST_PROXY: '1', DATA_DIR: dir, RECONNECT_SECONDS: '30', LOG_LEVEL: 'info' }, db));
  try {
    await until(() => lines(srv).find(l => l.msg === 'server.ready'), 15000, 'arranque (' + srv.err.slice(-300) + ')');
    const ready = lines(srv).find(l => l.msg === 'server.listening');
    assert.deepEqual([ready.port, ready.origins, ready.trustProxy, ready.reconnectSeconds], [PORT, [ORIGIN], 1, 30]);

    // --- Salud y disponibilidad
    const h = await http('GET', '/api/health');
    assert.equal(h.status, 200); assert.equal(h.body.ok, true); assert.equal(typeof h.body.uptime, 'number');
    const rd = await http('GET', '/api/ready');
    assert.equal(rd.status, 200); assert.equal(rd.body.db, 'ok');

    // --- CORS: API y peticiones de sala solo para el origen del juego
    assert.equal((await http('GET', '/api/health', { headers: { origin: ORIGIN } })).headers.get('access-control-allow-origin'), ORIGIN);
    const evil = (await http('GET', '/api/health', { headers: { origin: 'https://malo.test' } })).headers.get('access-control-allow-origin');
    assert.ok(evil !== 'https://malo.test' && evil !== '*', 'un sitio ajeno no recibe permiso CORS: ' + evil);
    const mm = await fetch(URL0 + '/matchmake/create/' + ROOM_NAME, { method: 'OPTIONS', headers: { origin: 'https://malo.test', 'access-control-request-method': 'POST' } });
    assert.notEqual(mm.headers.get('access-control-allow-origin'), 'https://malo.test', 'el matchmaking no se abre a otros sitios');
    assert.notEqual(mm.headers.get('access-control-allow-origin'), '*');

    // --- WebSocket: una página de otro sitio no puede conectar
    const { default: WS } = await import(process.env.WS_MODULE ? process.env.WS_MODULE + '/wrapper.mjs' : 'ws').then(m => ({ default: m.WebSocket || m.default }));
    const tryWs = origin => new Promise(r => { const w = new WS(`ws://127.0.0.1:${PORT}/x/y?sessionId=z`, { headers: { origin } }); w.on('unexpected-response', (_q, res) => r(res.statusCode)); w.on('open', () => { r('open'); w.close(); }); w.on('error', () => r('error')); });
    assert.equal(await tryWs('https://malo.test'), 403, 'origen ajeno rechazado en el handshake');
    assert.notEqual(await tryWs(ORIGIN), 403, 'el origen del juego pasa el control de origen');
    await until(() => lines(srv).find(l => l.msg === 'ws.origin_rejected' && l.origin === 'https://malo.test'), 3000, 'registro del rechazo');

    // --- IP real tras el proxy: cada IP tiene su propio límite de cuentas nuevas
    let last;
    for (let i = 0; i < 21; i++) last = await http('POST', '/api/auth/guest', { body: { name: 'Spam' + i }, headers: { 'x-forwarded-for': '203.0.113.7' } });
    assert.equal(last.status, 429, 'la IP que abusa queda limitada');
    assert.equal((await http('POST', '/api/auth/guest', { body: { name: 'Otra' }, headers: { 'x-forwarded-for': '198.51.100.9' } })).status, 201, 'otra IP no se ve afectada');

    // --- Dos jugadores en una expedición
    const players = [];
    for (const [name, sp] of [['Ana', 'voltrino'], ['Beto', 'magmolo']]) {
      const g = await http('POST', '/api/auth/guest', { body: { name }, headers: { 'x-forwarded-for': '192.0.2.' + (players.length + 1) } });
      assert.equal(g.status, 201);
      assert.equal((await http('POST', '/api/profile/new', { body: { species: sp }, token: g.body.token })).status, 201);
      const c = new Client(URL0); c.auth.token = g.body.token;
      players.push({ name, token: g.body.token, account: g.body.account, client: c, inbox: [], closed: null });
    }
    const listen = (p, room) => { p.room = room; for (const t of [S.WELCOME, S.FLOOR, S.RESULT, S.EVENT]) room.onMessage(t, m => p.inbox.push([t, m])); room.onLeave(code => { p.closed = code; }); return room; };
    const [A, B] = players;
    listen(A, await A.client.create(ROOM_NAME, { protocol: PROTOCOL_VERSION, token: A.token, creating: true, dungeon: 'bosque' }));
    const code = (await until(() => A.inbox.find(([t]) => t === S.WELCOME)))[1].code;
    const roomId = (await http('GET', '/api/rooms/' + code)).body.roomId;
    listen(B, await B.client.joinById(roomId, { protocol: PROTOCOL_VERSION, token: B.token, code }));
    B.room.send(C.READY, { ready: true }); await wait(200);
    A.room.send(C.START, { dungeon: 'bosque' });
    await until(() => A.inbox.find(([t]) => t === S.FLOOR) && B.inbox.find(([t]) => t === S.FLOOR), 6000, 'expedición iniciada');
    for (let k = 0; k < 10; k++) { for (const [i, p] of players.entries()) p.room.send(C.INPUT, { s: k * 6, m: Array(6).fill([i ? -1 : 1, 0]) }); await wait(50); }
    assert.equal((await http('GET', '/api/health')).body.players, 2);

    // --- Despliegue de una versión nueva: SIGTERM con la expedición en marcha
    srv.kill('SIGTERM');
    const results = await Promise.all(players.map(p => until(() => p.inbox.find(([t]) => t === S.RESULT), 15000, 'resultado de ' + p.name)));
    for (const [, r] of results) { assert.equal(r.result, 'interrupted'); assert.equal(r.success, true); assert.ok(r.version >= 2, 'guardado en la base de datos'); }
    assert.ok(players.every(p => p.inbox.some(([t, m]) => t === S.EVENT && m.type === 'shutdown')), 'aviso de reinicio');
    const exit = await srv.exited;
    assert.equal(exit.code, 0, 'sale limpio: ' + srv.err.slice(-400));
    await until(() => players.every(p => p.closed != null), 5000, 'clientes desconectados');
    assert.ok(players.every(p => p.closed === 4001), 'código de cierre SERVER_SHUTDOWN: ' + players.map(p => p.closed));

    // --- Registros: JSON, con los sucesos clave y sin secretos
    const L = lines(srv), msgs = new Set(L.map(l => l.msg));
    for (const m of ['room.create', 'room.join', 'room.start', 'room.shutdown', 'room.end', 'reward.saved', 'server.shutdown']) assert.ok(msgs.has(m), 'registro ' + m);
    assert.ok(L.find(l => l.msg === 'http' && l.status === 429 && l.ip === '203.0.113.7'), 'la IP real aparece en el registro');
    const all = srv.out + srv.err;
    for (const p of players) assert.ok(!all.includes(p.token), 'ningún token en los registros');
    assert.ok(!all.includes(SECRET), 'ni el secreto');
    assert.ok((srv.out + srv.err).split('\n').filter(Boolean).every(l => l.startsWith('{') || /ExperimentalWarning|trace-warnings/.test(l)), 'todas las líneas en JSON');

    // --- Tras reiniciar, el progreso sigue ahí (la recompensa se guardó una vez)
    const again = start(Object.assign({ NODE_ENV: 'production', PORT: String(PORT), AUTH_SECRET: SECRET, CLIENT_ORIGIN: ORIGIN, TRUST_PROXY: '1', DATA_DIR: dir }, db));
    try {
      await until(() => lines(again).find(l => l.msg === 'server.ready'), 15000, 'segundo arranque');
      for (const p of players) {
        const rw = await http('GET', '/api/profile/rewards', { token: p.token });
        assert.equal(rw.status, 200); assert.equal(rw.body.rewards.length, 1); assert.equal(rw.body.rewards[0].result, 'interrupted');
        const prof = await http('GET', '/api/profile', { token: p.token });
        assert.equal(prof.body.profile.runs, 1, 'la expedición cuenta en SU perfil');
      }
    } finally { again.kill('SIGTERM'); await again.exited; }
  } finally { if (srv.exitCode == null) { srv.kill('SIGKILL'); await srv.exited; } }
});
