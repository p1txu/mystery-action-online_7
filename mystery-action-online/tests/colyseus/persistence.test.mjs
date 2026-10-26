/**
 * Persistencia individual en cooperativo, con Colyseus REAL y la base de datos SQLite en disco.
 * Dos jugadores con criaturas, niveles e inventarios distintos comparten expedición sin que
 * los datos de uno sobrescriban los del otro; las recompensas se guardan una sola vez por
 * jugador aunque haya reconexiones o finales repetidos; quien abandona conserva su progreso;
 * los perfiles sobreviven a un reinicio del servidor.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Client } from '@colyseus/sdk';
import { spawn } from 'node:child_process';
import { createGameServer } from '../../server/src/app.js';
import { C, S, PROTOCOL_VERSION, ROOM_NAME } from '../../shared/protocol.js';
import { E, freshSave } from '../helpers.mjs';

const PORT = 2950 + Math.floor(Math.random() * 40), URL0 = `http://127.0.0.1:${PORT}`;
const DB = join(mkdtempSync(join(tmpdir(), 'ma-persist-')), 'mystery-action.db');
// SQLite por defecto; con PERSIST_DATABASE_URL, la misma batería contra PostgreSQL real
const PGURL = process.env.PERSIST_DATABASE_URL || '';
const cfg = { port: PORT, secret: 'p'.repeat(48), store: PGURL ? 'postgres' : 'sqlite', sqliteFile: DB, databaseUrl: PGURL, tokenTtlHours: 1, allowProfileImport: false, clientOrigins: [] };
const wait = ms => new Promise(r => setTimeout(r, ms));
const until = async (fn, ms = 5000, what = 'condición') => { const t0 = Date.now(); while (Date.now() - t0 < ms) { const v = await fn(); if (v) return v; await wait(20); } throw new Error('Tiempo agotado: ' + what); };
const api = async (method, path, body, token) => { const r = await fetch(URL0 + path, { method, headers: Object.assign({ 'content-type': 'application/json' }, token ? { authorization: 'Bearer ' + token } : {}), body: body && JSON.stringify(body) }); return { status: r.status, body: await r.json().catch(() => null) }; };
const inv = save => Object.fromEntries(new E.Inventory(save.inv, () => 99).stacks.map(s => [s.id, (new E.Inventory(save.inv, () => 99)).count(s.id)]));

let app;
const boot = async () => { const w = console.warn; console.warn = () => {}; app = await createGameServer(cfg); console.warn = w; await app.listen(); };
test.before(async () => {
  if (PGURL) { const { PostgresProfileStore } = await import('../../server/src/persistence/PostgresProfileStore.js'); const s = await PostgresProfileStore.connect(PGURL); await s.pool.query('drop table if exists rewards, profiles, profile_events, accounts cascade'); await s.close(); }
  await boot();
});
test.after(async () => { await app.close(); });

/** Jugador con cuenta (usuario y contraseña) y perfil propio sembrado en la base de datos. */
async function player(username, save) {
  const r = await api('POST', '/api/auth/register', { username, password: 'clave-de-' + username, name: username });
  assert.equal(r.status, 201, 'registro ' + username);
  await app.store.putProfile(r.body.account.id, E.Save.sanitize(save).data, { origin: 'seed' });
  const client = new Client(URL0); client.auth.token = r.body.token;
  return { name: username, token: r.body.token, id: r.body.account.id, client, inbox: [], room: null };
}
function listen(p, room) { p.room = room; for (const t of [S.WELCOME, S.FLOOR, S.EVENT, S.REJECT, S.RESULT]) room.onMessage(t, m => p.inbox.push([t, m])); return room; }
const opts = (p, x = {}) => Object.assign({ protocol: PROTOCOL_VERSION, token: p.token }, x);
async function group(host, guests) {
  listen(host, await host.client.create(ROOM_NAME, opts(host, { creating: true, dungeon: 'bosque' })));
  const code = (await until(() => host.inbox.find(([t]) => t === S.WELCOME)))[1].code;
  for (const g of guests) listen(g, await g.client.joinById(host.room.roomId, opts(g, { code })));
  for (const g of guests) g.room.send(C.READY, { ready: true });
  await until(() => Object.values(host.room.state.toJSON().players || {}).filter(p => p.ready).length === guests.length, 4000, 'listos');
  host.room.send(C.START, { dungeon: 'bosque' });
  await until(() => [host, ...guests].every(p => p.inbox.some(([t]) => t === S.FLOOR)), 5000, 'piso');
  return app.matchMaker.getLocalRoomById(host.room.roomId);
}
const kill = (room, p, variant = 'pufon') => {
  const x = room.exp, m = x.members.get(p.room.sessionId), pl = m.player;
  const e = x.addEnemy(new x.E.Enemy(x.E.makeKind(variant), pl.x + 30, pl.y, { level: 4 }), 'v:' + variant);
  x.E.Combat.hit(x.g, e, { team: 'player', dmg: 99999, src: pl });
  return m;
};

test('dos jugadores distintos en la misma expedición: cada uno con SU perfil y SUS recompensas, sin pisarse', async () => {
  const sa = freshSave('voltrino', { bank: 900 }); sa.prog = E.Progress.fresh('voltrino', 14); sa.inv = [{ uid: 'iA1', id: 'superpocion', qty: 3 }, { uid: 'iA2', id: 'elixir', qty: 1 }];
  sa.team = [{ uid: 'cA', kind: 'pufon', name: 'Pufi', level: 6, exp: 0, active: true }];
  sa.jobs = [{ id: 11, type: 'hunt', dungeon: 'bosque', client: 'Lumi', stars: 'E', target: 'mordisquin', goal: 1, progress: 0, state: 'accepted', reward: { exp: 30, gems: 40, item: 'manzana', points: 10 } }];
  const sb = freshSave('magmolo', { bank: 15 }); sb.prog = E.Progress.fresh('magmolo', 6); sb.inv = [{ uid: 'iB1', id: 'manzana', qty: 1 }];
  const A = await player('alba', sa), B = await player('bruno', sb);
  const before = { a: await app.store.getProfile(A.id), b: await app.store.getProfile(B.id) };
  const room = await group(A, [B]);
  // Al unirse, cada uno recibe y juega con SU perfil (no el del anfitrión)
  const wb = B.inbox.find(([t]) => t === S.WELCOME)[1];
  assert.equal(wb.save.species, 'magmolo'); assert.equal(wb.save.prog.level, 6); assert.equal(wb.save.bank, 15); assert.deepEqual(Object.keys(inv(wb.save)), ['manzana']);
  const MA = room.exp.members.get(A.room.sessionId), MB = room.exp.members.get(B.room.sessionId);
  assert.deepEqual([MA.player.sp.id, MA.player.level, MB.player.sp.id, MB.player.level], ['voltrino', 14, 'magmolo', 6]);
  assert.notDeepEqual(MA.player.stats, MB.player.stats);
  assert.equal(MA.accountId, A.id); assert.equal(MB.accountId, B.id);
  await until(() => { const ps = Object.values(A.room.state.toJSON().players); return ps.length === 2 && ps.find(p => p.name === 'bruno').level === 6 && ps.find(p => p.name === 'alba').level === 14; }, 3000, 'niveles en el estado');
  // Recompensas individuales: B derrota un enemigo; A recoge monedas
  const p0 = { a: MA.save.prog.exp, b: MB.save.prog.exp };
  MA.player.x = MB.player.x + 2000;                                   // A lejos: no participa
  kill(room, B, 'mordisquin');
  assert.ok(MB.rewards.exp > 0 && MA.rewards.exp === 0, 'la experiencia va a quien participa');
  assert.equal(MA.save.jobs[0].state, 'accepted', 'la misión de A no avanza con la caza de B');
  room.exp.items.set('t', { key: 't', id: 'gems', amount: 50, x: MA.player.x, y: MA.player.y, tx: 0, ty: 0 });
  room.exp.pickUp(MA, room.exp.items.get('t'));
  assert.equal(MA.rewards.gems, 50); assert.equal(MB.rewards.gems, 0);
  // Final con éxito (portal): se guarda cada perfil por separado
  room.exp.finish('return'); room.tick(16);
  await until(() => A.inbox.some(([t]) => t === S.RESULT) && B.inbox.some(([t]) => t === S.RESULT), 5000, 'resultados');
  const pa = await app.store.getProfile(A.id), pb = await app.store.getProfile(B.id);
  assert.equal(pa.save.species, 'voltrino'); assert.equal(pb.save.species, 'magmolo');
  assert.equal(pa.save.bank, 950); assert.equal(pb.save.bank, 15);
  assert.equal(pa.save.prog.level, 14); assert.ok(pb.save.prog.exp + pb.save.prog.level * 1000 > p0.b + 6 * 1000);
  assert.equal(inv(pa.save).superpocion, 3); assert.equal(inv(pa.save).manzana, undefined); assert.equal(inv(pb.save).superpocion, undefined);
  assert.equal(pa.save.team.length, 1); assert.equal(pb.save.team.length, 0);
  assert.equal(pa.version, before.a.version + 1); assert.equal(pb.version, before.b.version + 1);
  assert.equal(pa.origin, 'expedition');
  const ra = A.inbox.find(([t]) => t === S.RESULT)[1], rb = B.inbox.find(([t]) => t === S.RESULT)[1];
  assert.equal(ra.expeditionId, rb.expeditionId); assert.equal(ra.summary.gems, 50); assert.equal(rb.summary.gems, 0); assert.ok(rb.summary.exp > 0);
  assert.equal(E.Save.importText(rb.envelope).save.species, 'magmolo', 'cada uno recibe su propio perfil actualizado');

  // Sin duplicados: repetir el final, repetir la confirmación y aplicar otra vez la recompensa
  await room.end(); await room.commit(B.room.sessionId, room.exp.ended.results.get(B.room.sessionId));
  const again = await app.profiles.applyResult({ expeditionId: ra.expeditionId, accountId: A.id, result: 'return', summary: {}, save: Object.assign(structuredClone(pa.save), { bank: 99999 }) });
  assert.equal(again.applied, false);
  assert.equal((await app.store.getProfile(A.id)).version, pa.version); assert.equal((await app.store.getProfile(A.id)).save.bank, 950);
  assert.equal((await app.store.listRewards(A.id)).length, 1); assert.equal((await app.store.listRewards(B.id)).length, 1);
  // Reconexión tras el final: llega el mismo resultado y no se vuelve a aplicar
  const n0 = B.inbox.filter(([t]) => t === S.RESULT).length;
  const token = B.room.reconnectionToken;
  B.room.reconnection.enabled = false;                                   // reconexión manual (como el botón «Reintentar»)
  room.clients.find(c => c.sessionId === B.room.sessionId).ref.terminate();
  await wait(300);
  listen(B, await B.client.reconnect(token));
  await until(() => B.inbox.filter(([t]) => t === S.RESULT).length > n0, 6000, 'resultado reenviado');
  assert.equal(B.inbox.filter(([t]) => t === S.RESULT).at(-1)[1].expeditionId, rb.expeditionId);
  assert.equal((await app.store.getProfile(B.id)).version, pb.version, 'la reconexión no duplica la recompensa');
  for (const p of [A, B]) await p.room.leave().catch(() => {});
});

test('quien abandona conserva su progreso (nivel y experiencia) y pierde lo temporal según las reglas', async () => {
  const sc = freshSave('aurin', { bank: 100 }); sc.prog = E.Progress.fresh('aurin', 8); sc.inv = [{ uid: 'c1', id: 'pocion', qty: 2 }, { uid: 'c2', id: 'baya', qty: 1 }, { uid: 'c3', id: 'manzana', qty: 1 }, { uid: 'c4', id: 'elixir', qty: 1 }];
  const C1 = await player('carla', sc), D1 = await player('dario', freshSave('voltrino', { bank: 60 }));
  const room = await group(C1, [D1]);
  const MC = room.exp.members.get(C1.room.sessionId);
  kill(room, C1, 'pedrolon'); const expGained = MC.rewards.exp;
  MC.rewards.gems = 30;                                                   // monedas recogidas en la expedición
  C1.room.send(C.LEAVE, {});
  const res = await until(() => C1.inbox.find(([t]) => t === S.RESULT), 5000, 'resultado de abandono');
  assert.equal(res[1].result, 'abandon');
  const pc = (await app.store.getProfile(C1.id)).save;
  const totalExp = l => { let t = 0; for (let i = 8; i < l; i++) t += E.expNeed(i); return t; };
  assert.ok(totalExp(pc.prog.level) + pc.prog.exp >= expGained, 'la experiencia ganada se conserva');
  assert.ok(pc.prog.level >= 8, 'nunca se pierde nivel');
  assert.equal(pc.bank, 100, 'las monedas de la expedición se pierden (regla de retirada)');
  assert.equal(pc.inv.length, 4 - Math.floor(4 / 2), 'se pierde la mitad de las casillas');
  // El otro sigue y termina: su perfil se guarda aparte; el de C no se vuelve a tocar
  const vC = (await app.store.getProfile(C1.id)).version;
  room.exp.finish('return'); room.tick(16);
  await until(() => D1.inbox.some(([t]) => t === S.RESULT), 5000, 'resultado de D');
  assert.equal((await app.store.getProfile(C1.id)).version, vC);
  assert.equal((await app.store.getProfile(D1.id)).save.species, 'voltrino');
  await D1.room.leave().catch(() => {});
});

test('el cliente no puede cambiar su perfil desde la sala: usos inválidos rechazados y mensajes inventados expulsan', async () => {
  const E1 = await player('elena', freshSave('magmolo', { bank: 10 })), F1 = await player('fede', freshSave('aurin'));
  const room = await group(E1, [F1]);
  const v0 = (await app.store.getProfile(E1.id)).version;
  E1.room.send(C.USE, { id: 'manzanaDorada' }); E1.room.send(C.USE, { id: 'superpocion' });     // no los lleva
  await until(() => E1.inbox.filter(([t, m]) => t === S.EVENT && m.type === 'reject' && m.what === 'use').length === 2, 3000, 'rechazos de «use»');
  // Durante el grupo tampoco se puede usar la API de operaciones del perfil
  const op = await api('POST', '/api/profile/op', { op: 'buy', args: { id: 'pocion' } }, E1.token);
  assert.equal(op.status, 400); assert.match(op.body.error, /grupo/);
  // Un mensaje que el servidor no conoce (p. ej. «result» con monedas) hace que Colyseus cierre esa conexión
  E1.room.send('result', { bank: 99999, level: 50 });
  await until(() => !room.clients.some(c => c.sessionId === E1.room.sessionId), 3000, 'expulsión');
  const ME = room.exp.members.get(E1.room.sessionId);
  assert.equal(ME.save.bank, 10); assert.equal(ME.save.prog.level, 5);
  assert.equal((await app.store.getProfile(E1.id)).version, v0, 'su perfil guardado no cambia');
  assert.equal(room.exp.members.get(F1.room.sessionId).save.species, 'aurin', 'el otro jugador sigue con lo suyo');
  await F1.room.leave().catch(() => {});
  await wait(200);
});

test('los perfiles persisten tras reiniciar el servidor y se pueden usar desde otro dispositivo', async () => {
  const before = await app.store.getAccountByUsername('alba'), pa = await app.store.getProfile(before.id);
  await app.close();                                                    // se apaga el servidor…
  // …y arranca otro PROCESO con el mismo archivo de base de datos (un reinicio real)
  const port2 = PORT + 50, child = spawn(process.execPath, [...process.execArgv, new URL('./serve.mjs', import.meta.url).pathname], { env: Object.assign({}, process.env, { PORT: String(port2), AUTH_SECRET: cfg.secret, SQLITE_FILE: DB, PROFILE_STORE: cfg.store, DATABASE_URL: PGURL }), stdio: ['ignore', 'pipe', 'inherit'] });
  await new Promise((ok, ko) => { child.stdout.on('data', d => { if (String(d).includes('ready')) ok(); }); child.on('exit', c => ko(new Error('el servidor salió con ' + c))); });
  const api2 = async (method, path, body, token) => { const r = await fetch(`http://127.0.0.1:${port2}` + path, { method, headers: Object.assign({ 'content-type': 'application/json' }, token ? { authorization: 'Bearer ' + token } : {}), body: body && JSON.stringify(body) }); return { status: r.status, body: await r.json().catch(() => null) }; };
  try {
  const login = await api2('POST', '/api/auth/login', { username: 'ALBA', password: 'clave-de-alba' });
  assert.equal(login.status, 200);
  const p = await api2('GET', '/api/profile', undefined, login.body.token);
  assert.equal(p.body.version, pa.version); assert.equal(p.body.profile.bank, pa.save.bank);
  assert.equal(p.body.summary.creature.species, 'voltrino'); assert.equal(p.body.summary.level, 14);
  assert.equal((await api2('GET', '/api/profile/rewards', undefined, login.body.token)).body.rewards.length, 1);
  } finally { child.kill('SIGTERM'); }
});
