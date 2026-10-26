/**
 * Anfitrión LÓGICO frente a servidor TÉCNICO, con Colyseus real y clientes SDK reales:
 *  - solo el anfitrión cambia las opciones de expedición (mazmorra y tiempo de reconexión), validadas;
 *  - el anfitrión cede el liderazgo a mano;
 *  - si el anfitrión pierde la conexión, el liderazgo pasa a otro tras HOST_GRACE_SECONDS (en la sala
 *    de espera y en plena expedición), y si vuelve a tiempo lo conserva;
 *  - la sala y la expedición siguen en el servidor aunque el anfitrión desaparezca;
 *  - tools/check-server.mjs (lo que se ejecuta en un segundo ordenador) entra en una sala, ve al
 *    anfitrión y lo ve moverse.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@colyseus/sdk';
import { createGameServer } from '../../server/src/app.js';
import { MemoryProfileStore } from '../../server/src/persistence/ProfileStore.js';
import { C, S, PROTOCOL_VERSION, ROOM_NAME } from '../../shared/protocol.js';
import { E, freshSave } from '../helpers.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const PORT = 3800 + Math.floor(Math.random() * 100), URL0 = `http://127.0.0.1:${PORT}`;
const wait = ms => new Promise(r => setTimeout(r, ms));
const until = async (fn, ms = 6000, what = 'condición') => { const t0 = Date.now(); while (Date.now() - t0 < ms) { const v = await fn(); if (v) return v; await wait(20); } throw new Error('Tiempo agotado: ' + what); };
const api = async (method, path, body, token) => { const r = await fetch(URL0 + path, { method, headers: Object.assign({ 'content-type': 'application/json' }, token ? { authorization: 'Bearer ' + token } : {}), body: body && JSON.stringify(body) }); return { status: r.status, body: await r.json().catch(() => null) }; };

let app;
test.before(async () => {
  app = await createGameServer({ port: PORT, secret: 'h'.repeat(48), store: 'memory', tokenTtlHours: 1, clientOrigins: [], reconnectSeconds: 30, reconnectMaxSeconds: 120, hostGraceSeconds: 1, logLevel: 'warn' }, { store: new MemoryProfileStore() });
  await app.listen();
});
test.after(async () => { await app.close(); });

async function player(name, species) {
  const g = await api('POST', '/api/auth/guest', { name });
  await app.store.putProfile(g.body.account.id, E.Save.sanitize(freshSave(species)).data);
  const p = { name, token: g.body.token, client: new Client(URL0), inbox: [], room: null };
  return p;
}
function listen(p, room) { p.room = room; p.joinedAt = Date.now(); for (const t of [S.WELCOME, S.FLOOR, S.EVENT, S.REJECT, S.RESULT]) room.onMessage(t, m => p.inbox.push([t, m])); return room; }
const opts = (p, x = {}) => Object.assign({ protocol: PROTOCOL_VERSION, token: p.token }, x);
async function group(n) {
  const ps = [];
  for (const [i, sp] of ['guerrero', 'mago', 'arquero', 'guerrero'].slice(0, n).entries()) ps.push(await player('J' + i, sp));
  listen(ps[0], await ps[0].client.create(ROOM_NAME, opts(ps[0], { creating: true, dungeon: 'bosque' })));
  const code = (await until(() => ps[0].inbox.find(([t]) => t === S.WELCOME)))[1].code, roomId = (await api('GET', '/api/rooms/' + code)).body.roomId;
  for (const p of ps.slice(1)) { listen(p, await p.client.joinById(roomId, opts(p, { code }))); await wait(15); }
  const room = app.matchMaker.getLocalRoomById(roomId);
  await until(() => ps.every(p => Object.keys(p.room.state.toJSON().players).length === n), 3000, 'todos dentro');
  return { ps, room, code, roomId };
}
const hostName = room => [...room.state.players.values()].find(p => p.host)?.name;
const cut = (room, p) => { p.room.reconnection.maxRetries = 0; room.clients.find(c => c.sessionId === p.room.sessionId).ref.terminate(); };

test('opciones de expedición: solo el anfitrión, validadas por el servidor; los demás confirman de nuevo', async () => {
  const { ps: [A, B], room } = await group(2);
  const welcome = A.inbox.find(([t]) => t === S.WELCOME)[1];
  assert.deepEqual(welcome.reconnectChoices, [30, 45, 60, 120], 'el máximo del servidor (120 s) limita lo que puede elegir el anfitrión');
  B.room.send(C.READY, { ready: true }); await until(() => room.state.players.get(B.room.sessionId).ready);
  // Un invitado no puede cambiar nada
  B.room.send(C.OPTIONS, { dungeon: 'gruta', reconnect: 120 });
  await until(() => B.inbox.find(([t, m]) => t === S.REJECT && m.what === 'options'), 2000, 'rechazo al invitado');
  assert.equal(room.state.dungeon, 'bosque'); assert.equal(room.state.reconnectSeconds, 30);
  // Valores no permitidos: rechazados
  A.room.send(C.OPTIONS, { reconnect: 7 }); A.room.send(C.OPTIONS, { reconnect: 300 }); A.room.send(C.OPTIONS, { dungeon: 'no-existe' });
  await until(() => A.inbox.filter(([t, m]) => t === S.REJECT && m.what === 'options').length === 3, 2000, 'tres rechazos');
  assert.equal(room.state.reconnectSeconds, 30);
  // El anfitrión cambia la mazmorra y el tiempo de reconexión: todos lo ven y B debe confirmar otra vez
  const dng = E.DUNGEONS.find(d => d.id !== 'bosque').id;
  A.room.send(C.OPTIONS, { dungeon: dng, reconnect: 120 });
  await until(() => room.state.reconnectSeconds === 120 && room.state.dungeon === dng, 2000, 'opciones aplicadas');
  await until(() => B.room.state.reconnectSeconds === 120 && B.room.state.dungeon === dng, 2000, 'B ve las opciones');
  assert.equal(room.state.players.get(B.room.sessionId).ready, false, 'B vuelve a «no listo»');
  assert.equal(room.reconnectSeconds, 120, 'la sala usará 120 s para guardar el sitio');
  for (const p of [A, B]) await p.room.leave();
});

test('ceder el liderazgo a mano; si el anfitrión se desconecta pasa a otro tras el margen; si vuelve a tiempo lo conserva', { timeout: 60000 }, async () => {
  const { ps: [A, B, Cc], room } = await group(3);
  // Cesión manual: solo el anfitrión, solo a alguien conectado
  B.room.send(C.HOST, { to: Cc.room.sessionId });
  await until(() => B.inbox.find(([t, m]) => t === S.REJECT && m.what === 'host'), 2000, 'B no es anfitrión');
  A.room.send(C.HOST, { to: B.room.sessionId });
  await until(() => hostName(room) === 'J1', 2000, 'B anfitrión');
  const ev = await until(() => Cc.inbox.find(([t, m]) => t === S.EVENT && m.type === 'host'), 2000, 'aviso');
  assert.deepEqual([ev[1].id, ev[1].reason], [B.room.sessionId, 'manual']);
  assert.equal([...room.state.players.values()].filter(p => p.host).length, 1, 'un solo anfitrión');
  A.room.send(C.OPTIONS, { reconnect: 60 });
  await until(() => A.inbox.find(([t, m]) => t === S.REJECT && m.what === 'options'), 2000, 'A ya no cambia opciones');

  // El anfitrión (B) se corta y vuelve ANTES del margen: sigue siendo anfitrión
  await wait(Math.max(0, 5200 - (Date.now() - B.joinedAt)));
  const back = new Promise(r => B.room.onReconnect(() => r(true)));
  room.clients.find(c => c.sessionId === B.room.sessionId).ref.terminate();   // corte brusco: el SDK reintenta solo
  await back; await wait(1300);
  assert.equal(hostName(room), 'J1', 'volvió a tiempo: conserva el liderazgo');

  // Ahora se corta y NO vuelve: tras 1 s (HOST_GRACE_SECONDS) el liderazgo pasa al conectado más antiguo (A)
  cut(room, B);
  await until(() => room.state.players.get(B.room.sessionId)?.connected === false, 3000, 'B desconectado');
  await until(() => hostName(room) === 'J0', 4000, 'traspaso por desconexión');
  const drop = A.inbox.filter(([t, m]) => t === S.EVENT && m.type === 'host').at(-1)[1];
  assert.equal(drop.reason, 'drop');
  assert.equal(room.state.phase, 'lobby'); assert.ok(room.state.players.has(B.room.sessionId), 'B conserva su sitio mientras dure la reconexión');
  for (const p of [A, Cc]) await p.room.leave();
});

test('en plena expedición: el anfitrión desaparece y la partida sigue en el servidor con otro líder', { timeout: 60000 }, async () => {
  const { ps: [A, B], room } = await group(2);
  B.room.send(C.READY, { ready: true }); await wait(150);
  A.room.send(C.START, { dungeon: 'bosque' });
  await until(() => room.exp && B.inbox.find(([t]) => t === S.FLOOR), 6000, 'expedición');
  const floorN = room.state.floorN, enemies = Object.keys(room.state.toJSON().enemies).sort();
  await wait(Math.max(0, 5200 - (Date.now() - A.joinedAt)));
  cut(room, A);                                   // el navegador del anfitrión desaparece
  await until(() => hostName(room) === 'J1', 5000, 'B pasa a ser anfitrión');
  // La simulación sigue: el servidor consume las entradas de B (ack avanza) y lo mueve
  const mB = room.exp.members.get(B.room.sessionId), ack0 = mB.ack, p0 = [mB.player.x, mB.player.y];
  for (let k = 0; k < 40; k++) { B.room.send(C.INPUT, { s: mB.nextSeq, m: Array(6).fill(k < 20 ? [1, 0] : [0, 1]) }); await wait(50); }   // derecha y luego abajo
  await wait(200);
  assert.ok(mB.ack - ack0 >= 150, 'entradas aplicadas: ' + (mB.ack - ack0));
  assert.ok(Math.hypot(mB.player.x - p0[0], mB.player.y - p0[1]) > 5, 'B se ha movido: ' + [mB.player.x - p0[0], mB.player.y - p0[1]].map(Math.round));
  assert.equal(room.state.phase, 'playing'); assert.equal(room.state.floorN, floorN, 'misma mazmorra, sin reinicio');
  assert.ok(enemies.some(id => id in room.state.toJSON().enemies), 'los mismos enemigos siguen en el piso');
  await B.room.leave();
});

test('comprobador de conexión de un segundo ordenador: entra en la sala, se prepara y ve moverse al anfitrión', { timeout: 90000 }, async () => {
  // Primero, la comprobación básica (salud, base de datos, WebSocket, latencia)
  const LOADER = process.execArgv.filter((a, i, all) => a === '--import' || all[i - 1] === '--import');
  const run = (...args) => { const p = spawn(process.execPath, [...LOADER, join(ROOT, 'tools/check-server.mjs'), URL0, ...args], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] }); p.out = ''; p.stdout.on('data', d => { p.out += d; }); p.stderr.on('data', d => { p.out += d; }); p.done = new Promise(r => p.on('exit', r)); return p; };
  const basic = run(); assert.equal(await basic.done, 0, basic.out);
  for (const t of ['El servidor responde', 'Base de datos conectada', 'WebSocket abierto', 'Latencia mediana']) assert.match(basic.out, new RegExp(t));
  // Dirección equivocada: falla con una explicación
  const wrong = spawn(process.execPath, [join(ROOT, 'tools/check-server.mjs'), 'http://127.0.0.1:1'], { stdio: ['ignore', 'pipe', 'pipe'] }); let wout = ''; wrong.stdout.on('data', d => { wout += d; });
  assert.equal(await new Promise(r => wrong.on('exit', r)), 1); assert.match(wout, /Nadie escucha|No se puede contactar/);

  // El anfitrión (cliente SDK) crea la sala; el «segundo ordenador» entra con el comprobador
  const A = await player('Anfitriona', 'arquero');
  listen(A, await A.client.create(ROOM_NAME, opts(A, { creating: true, dungeon: 'bosque' })));
  const code = (await until(() => A.inbox.find(([t]) => t === S.WELCOME)))[1].code, room = app.matchMaker.getLocalRoomById(A.room.roomId);
  const probe = run('--join', code, '--name', 'Portátil', '--wait', '30');
  await until(() => [...room.state.players.values()].some(p => p.name === 'Portátil' && p.ready), 15000, 'el comprobador entra y marca listo');
  A.room.send(C.START, { dungeon: 'bosque' });
  await until(() => A.inbox.find(([t]) => t === S.FLOOR), 6000, 'expedición');
  // La anfitriona se mueve mientras el comprobador observa
  let s = 0; const t = setInterval(() => { A.room.send(C.INPUT, { s, m: Array(6).fill([Math.cos(s / 50), Math.sin(s / 50)]) }); s += 6; }, 50);
  const code2 = await probe.done; clearInterval(t);
  assert.equal(code2, 0, probe.out);
  assert.match(probe.out, /Has entrado en la sala/); assert.match(probe.out, /Anfitriona \(arquero, anfitrión\)/);
  assert.match(probe.out, /Ves moverse en tiempo real a: Anfitriona/);
  assert.match(probe.out, /El servidor mueve a tu criatura de prueba/);
  await A.room.leave();
});
