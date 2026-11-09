/**
 * Guardado y recuperación (0.42) con Colyseus REAL, clientes SDK reales y SQLite en disco:
 *  - caída del servidor DE GOLPE en plena expedición: al volver, la expedición está pendiente (la aldea
 *    bloqueada), el grupo la continúa (la MISMA: mismo id, mismo piso, los vencidos no vuelven) y al
 *    terminarla cada uno cobra una vez;
 *  - cierre ordenado del servidor: la expedición queda «suspendida»; una jugadora la cierra quedándose lo
 *    conseguido y su compañero la continúa en solitario;
 *  - reconexión durante la entrega de recompensas: el mismo resultado, sin aplicarlo otra vez;
 *  - entrega simultánea y repetida (dos cierres, cierre por la API, reintento): una recompensa por jugador;
 *  - la base de datos falla al guardar el resultado: el cliente NO lo da por guardado; tras reiniciar, el
 *    servidor lo aplica una vez;
 *  - intentos de duplicar oro con la API: la misma venta repetida (mismo opId), versión antigua y ventas a la vez.
 * Preparación marcada: avanzar pisos, vencer enemigos y forzar un punto seguro desde el servidor.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Client } from '@colyseus/sdk';
import { createGameServer } from '../../server/src/app.js';
import { C, S, PROTOCOL_VERSION, ROOM_NAME } from '../../shared/protocol.js';
import { E, freshSave } from '../helpers.mjs';

const PORT = 3500 + Math.floor(Math.random() * 100), URL0 = `http://127.0.0.1:${PORT}`;
const DB = join(mkdtempSync(join(tmpdir(), 'ma-recovery-')), 'mystery-action.db');
const cfg = { port: PORT, secret: 'r'.repeat(48), store: 'sqlite', sqliteFile: DB, tokenTtlHours: 1, allowProfileImport: false, clientOrigins: [], reconnectSeconds: 30, logLevel: 'error' };
const wait = ms => new Promise(r => setTimeout(r, ms));
const until = async (fn, ms = 6000, what = 'condición') => { const t0 = Date.now(); while (Date.now() - t0 < ms) { const v = await fn(); if (v) return v; await wait(20); } throw new Error('Tiempo agotado: ' + what); };
const api = async (method, path, body, token, retry = 1) => { let r; try { r = await fetch(URL0 + path, { method, headers: Object.assign({ 'content-type': 'application/json' }, token ? { authorization: 'Bearer ' + token } : {}), body: body && JSON.stringify(body) }); } catch (e) { if (retry) return api(method, path, body, token, 0); throw e; } return { status: r.status, body: await r.json().catch(() => null) }; };

let app;
const boot = async () => { const w = console.warn, i = console.info; console.warn = () => {}; console.info = () => {}; app = await createGameServer(cfg); console.warn = w; console.info = i; await app.listen(); };
test.before(boot);
test.after(async () => { await app.close(); });
/** Apagón: la sala no llega a guardar nada más (ni la instantánea final ni resultados). */
async function crash() {
  for (const r of app.registry.rooms.values()) if (r.exp) { r.persist = () => Promise.resolve(); r.commit = async () => {}; r.onBeforeShutdown = async function () { this.shuttingDown = true; this.disconnect().catch(() => {}); }; }
  await app.close(); await boot();
}

async function player(username, save) {
  const r = await api('POST', '/api/auth/register', { username, password: 'clave-de-' + username, name: username });
  assert.equal(r.status, 201, 'registro ' + username);
  await app.store.putProfile(r.body.account.id, E.Save.sanitize(save).data, { origin: 'seed' });
  return { name: username, token: r.body.token, id: r.body.account.id, client: newClient(r.body.token), inbox: [], room: null };
}
const newClient = token => { const c = new Client(URL0); c.auth.token = token; return c; };
const relogin = async p => { const r = await api('POST', '/api/auth/login', { username: p.name, password: 'clave-de-' + p.name }); p.token = r.body.token; p.client = newClient(p.token); p.inbox = []; return p; };
function listen(p, room) { p.room = room; for (const t of [S.WELCOME, S.FLOOR, S.EVENT, S.REJECT, S.RESULT]) room.onMessage(t, m => p.inbox.push([t, m])); return room; }
const opts = (p, x = {}) => Object.assign({ protocol: PROTOCOL_VERSION, token: p.token }, x);
const st = p => p.room.state.toJSON();
const got = (p, type, pred = () => true) => p.inbox.find(([t, m]) => t === type && pred(m));
const ev = (p, type) => p.inbox.filter(([t, m]) => t === S.EVENT && m.type === type).map(([, m]) => m);
const server = p => app.matchMaker.getLocalRoomById(p.room.roomId);
const veteran = sp => freshSave(sp, { cleared: ['bosque', 'gruta', 'cienaga'], arrived: true, bank: 100 });
const profile = async p => (await app.store.getProfile(p.id));
/** Sala con código y expedición empezada. */
async function start(host, guests, dungeon = 'gruta', { expectResume = false } = {}) {
  listen(host, await host.client.create(ROOM_NAME, opts(host, { creating: true, dungeon })));
  const code = (await until(() => got(host, S.WELCOME), 4000, 'welcome'))[1].code;
  for (const g of guests) listen(g, await g.client.joinById(host.room.roomId, opts(g, { code })));
  await until(() => Object.keys(st(host).players).length === guests.length + 1, 3000, 'todos dentro');
  if (expectResume) await until(() => st(host).resume === true, 3000, 'continuar disponible');
  for (const g of guests) g.room.send(C.READY, { ready: true });
  await until(() => Object.values(st(host).players).filter(q => q.ready).length === guests.length, 3000, 'listos');
  host.room.send(C.START, {});
  await until(() => [host, ...guests].every(p => got(p, S.FLOOR)), 6000, 'primer piso');
  return server(host);
}
const saved = async id => app.store.getExpedition(id);

test('caída de golpe en plena expedición: queda pendiente, la aldea se bloquea y el grupo la continúa (la misma); cada uno cobra una vez', { timeout: 90000 }, async () => {
  const ana = await player('ana', veteran('guerrero')), beto = await player('beto', veteran('mago'));
  const room = await start(ana, [beto]), X = room.exp, id = X.id;
  await until(async () => (await saved(id))?.seq >= 1, 4000, 'instantánea del primer piso');
  // Preparación: bajar al piso 2, vencer a dos enemigos y cumplir un objetivo (punto seguro)
  X.nextStep(); room.flushEvents();
  await until(() => got(ana, S.FLOOR, m => m.step === 1), 4000, 'piso 2');
  const es = X.g.actors.filter(a => a instanceof X.E.Enemy && a.alive && a.spawnIdx != null).slice(0, 2);
  for (const e of es) X.E.Combat.hit(X.g, e, { team: 'player', fixed: 1e7, src: [...X.members.values()][0].player });
  const killed = es.map(e => e.spawnIdx);
  for (const m of X.members.values()) m.rewards.gems += 25;
  X.safepoint('objective'); room.flushEvents();
  await until(() => ev(ana, 'saved').some(e => e.reason === 'objective') && ev(beto, 'saved').some(e => e.reason === 'objective'), 4000, 'aviso «guardado» tras confirmarlo la base de datos');
  const snap = await saved(id);
  assert.equal(snap.status, 'active'); assert.equal(snap.state.step, 1); assert.deepEqual(snap.state.floor.killed.slice().sort(), killed.slice().sort());
  // --- Apagón
  for (const p of [ana, beto]) p.room.reconnection.maxRetries = 0;
  await crash();
  for (const p of [ana, beto]) { await relogin(p); assert.equal((await app.store.listRewards(p.id)).length, 0, 'sin resultado'); }
  const pend = (await api('GET', '/api/expedition', null, ana.token)).body.pending;
  assert.equal(pend.id, id); assert.equal(pend.dungeon, 'gruta'); assert.match(pend.label, /Gruta/);
  // La aldea queda bloqueada: vender ahora duplicaría lo que la expedición aún lleva
  const pa = await profile(ana), sell = await api('POST', '/api/profile/op', { op: 'sell', args: { uid: pa.save.inv[0].uid }, version: pa.version, opId: 'venta-pendiente-1' }, ana.token);
  assert.equal(sell.status, 423); assert.equal(sell.body.errorCode, 'PENDING_EXPEDITION'); assert.equal((await profile(ana)).version, pa.version);
  // --- Continuar: la misma expedición, en el piso guardado y sin los enemigos vencidos
  const room2 = await start(ana, [beto], 'gruta', { expectResume: true }), Y = room2.exp;
  assert.equal(Y.id, id, 'misma expedición'); assert.equal(Y.seed, X.seed); assert.equal(Y.stepIdx, 1);
  assert.ok(ev(ana, 'resumed').length && ev(beto, 'resumed').length);
  const alive = new Set(Y.g.actors.filter(a => a instanceof Y.E.Enemy && a.alive).map(a => a.spawnIdx));
  for (const k of killed) assert.ok(!alive.has(k), 'el enemigo vencido no vuelve');
  for (const m of Y.members.values()) assert.equal(m.rewards.gems, 25, 'las monedas de la expedición siguen');
  Y.finish('return');
  await Promise.all([ana, beto].map(p => until(() => got(p, S.RESULT), 6000, 'resultado ' + p.name)));
  for (const p of [ana, beto]) {
    const r = got(p, S.RESULT)[1]; assert.equal(r.saved, true); assert.equal(r.expeditionId, id);
    assert.equal((await app.store.listRewards(p.id)).length, 1); assert.equal((await profile(p)).save.bank, 125, 'cobra una vez');
    assert.equal((await api('GET', '/api/expedition', null, p.token)).body.pending, null);
  }
  for (const p of [ana, beto]) await p.room.leave().catch(() => {});
});

test('cierre ordenado: la expedición queda suspendida; Eva la cierra quedándose lo conseguido y Fer la continúa en solitario', { timeout: 90000 }, async () => {
  const eva = await player('eva', veteran('arquero')), fer = await player('fer', veteran('guerrero'));
  const room = await start(eva, [fer]), X = room.exp, id = X.id;
  X.nextStep(); room.flushEvents();
  for (const m of X.members.values()) { m.rewards.gems += 10; m.player.bag.add('lagrimaEstelar', 1); }
  for (const p of [eva, fer]) p.room.reconnection.maxRetries = 0;
  await app.close();                                                   // cierre ordenado (SIGTERM)
  await boot();
  await until(() => ev(eva, 'shutdown').length, 2000, 'aviso de reinicio').catch(() => null);
  assert.ok(ev(eva, 'shutdown').some(e => e.resumable), 'aviso: se podrá continuar ' + JSON.stringify(ev(eva, 'shutdown')));
  const e = await saved(id); assert.equal(e.status, 'suspended'); assert.equal(e.state.reason, 'shutdown'); assert.equal(e.state.step, 1);
  for (const p of [eva, fer]) { await relogin(p); assert.equal((await app.store.listRewards(p.id)).length, 0, 'no se ha cobrado nada todavía'); }
  // Eva la cierra con la API: se queda lo conseguido hasta el último punto seguro (el cierre)
  const bad = await api('POST', '/api/expedition/close', { id: 'otra' }, eva.token); assert.equal(bad.status, 404);
  const c = await api('POST', '/api/expedition/close', { id }, eva.token);
  assert.equal(c.status, 200); assert.equal(c.body.result, 'interrupted');
  assert.equal((await profile(eva)).save.bank, 110); assert.ok((await profile(eva)).save.inv.some(s => s.id === 'lagrimaEstelar'));
  assert.equal((await api('POST', '/api/expedition/close', { id }, eva.token)).status, 404, 'cerrarla otra vez no da nada');
  assert.equal((await app.store.listRewards(eva.id)).length, 1);
  // Fer entra en solitario en la Gruta: continúa la misma expedición (sin Eva)
  listen(fer, await fer.client.create(ROOM_NAME, opts(fer, { creating: true, solo: true, dungeon: 'gruta' })));
  await until(() => st(fer).resume === true, 3000, 'continuar en solitario');
  fer.room.send(C.START, { dungeon: 'gruta' });
  await until(() => got(fer, S.FLOOR), 6000, 'piso');
  const Y = server(fer).exp;
  assert.equal(Y.id, id); assert.equal(Y.members.size, 1); assert.equal(Y.stepIdx, 1);
  Y.finish('return');
  await until(() => got(fer, S.RESULT), 6000, 'resultado');
  assert.equal((await profile(fer)).save.bank, 110); assert.equal((await app.store.listRewards(fer.id)).length, 1);
  assert.equal((await app.store.listRewards(eva.id)).length, 1, 'Eva no cobra dos veces');
  await fer.room.leave().catch(() => {});
});

test('empezar otra expedición con una pendiente: se cierra antes conservando lo conseguido (y se avisa)', { timeout: 60000 }, async () => {
  const gil = await player('gil', veteran('mago'));
  listen(gil, await gil.client.create(ROOM_NAME, opts(gil, { creating: true, solo: true, dungeon: 'gruta' })));
  gil.room.send(C.START, { dungeon: 'gruta' }); await until(() => got(gil, S.FLOOR), 6000, 'piso');
  const X = server(gil).exp, id = X.id; X.members.values().next().value.rewards.gems = 7;
  X.safepoint('objective'); server(gil).flushEvents(); await until(() => ev(gil, 'saved').length, 4000, 'guardado');
  gil.room.reconnection.maxRetries = 0; await crash(); await relogin(gil);
  listen(gil, await gil.client.create(ROOM_NAME, opts(gil, { creating: true, solo: true, dungeon: 'bosque' })));
  gil.room.send(C.START, { dungeon: 'bosque' }); await until(() => got(gil, S.FLOOR), 6000, 'piso');
  assert.ok(ev(gil, 'pendingClosed').length, 'aviso');
  assert.notEqual(server(gil).exp.id, id);
  assert.equal((await app.store.getReward(id, gil.id)).result, 'interrupted');
  assert.equal((await profile(gil)).save.bank, 107);
  server(gil).exp.finish('return'); await until(() => got(gil, S.RESULT), 6000, 'resultado');
  assert.equal((await app.store.listRewards(gil.id)).length, 2, 'una por expedición');
  await gil.room.leave().catch(() => {});
});

test('reconexión durante la entrega y entrega simultánea/repetida: una recompensa por jugador', { timeout: 60000 }, async () => {
  const hugo = await player('hugo', veteran('guerrero')), ines = await player('ines', veteran('asesino'));
  const room = await start(hugo, [ines]), X = room.exp, id = X.id, iSid = ines.room.sessionId;
  for (const m of X.members.values()) m.rewards.gems = 50;
  // Ines pierde la conexión justo cuando termina la expedición
  ines.room.reconnection.maxRetries = 0;
  room.clients.find(c => c.sessionId === iSid).ref.terminate();
  await until(() => room.state.players.get(iSid)?.connected === false, 4000, 'Ines desconectada');
  X.finish('return');
  // A la vez: la sala cierra dos veces, la API intenta cerrar la expedición y se reintenta el guardado
  const [, , ch, ci] = await Promise.all([room.end(), room.end(), app.expeditions.close(hugo.id, id, 'test'), app.expeditions.close(ines.id, id, 'test'),
    app.profiles.applyResult({ expeditionId: id, accountId: ines.id, result: 'return', summary: {}, save: (await profile(ines)).save })]);
  assert.ok(ch.live && ci.live && !ch.applied, 'cerrarla desde fuera mientras la sala la lleva no hace nada (la sala guarda el resultado real)');
  await until(() => got(hugo, S.RESULT), 6000, 'resultado de Hugo');
  // Ines vuelve a su sitio con el token de reconexión de su pestaña (como hace el juego al recargar): recibe el MISMO resultado
  const ines2 = Object.assign({}, ines, { client: newClient(ines.token), inbox: [] });
  listen(ines2, await ines2.client.reconnect(ines.room.reconnectionToken));
  const r = (await until(() => got(ines2, S.RESULT), 4000, 'resultado de Ines'))[1];
  assert.equal(r.expeditionId, id);
  for (const p of [hugo, ines]) { assert.equal((await app.store.listRewards(p.id)).length, 1, p.name + ': una recompensa'); }
  const bankH = (await profile(hugo)).save.bank;
  assert.equal(bankH, 150, 'Hugo cobra una vez');
  for (const p of [hugo, ines2]) await p.room.leave().catch(() => {});
});

test('la base de datos falla al guardar el resultado: el cliente no lo da por guardado; tras reiniciar se aplica una vez', { timeout: 90000 }, async () => {
  const jon = await player('jon', veteran('guerrero')), kai = await player('kai', veteran('mago'));
  const room = await start(jon, [kai]), X = room.exp, id = X.id;
  for (const m of X.members.values()) m.rewards.gems = 30;
  const real = app.profiles.applyResult.bind(app.profiles);
  app.profiles.applyResult = async () => { throw new Error('base de datos no disponible'); };
  X.finish('clear');
  const rs = await Promise.all([jon, kai].map(p => until(() => got(p, S.RESULT), 15000, 'resultado ' + p.name)));
  for (const [, r] of rs) { assert.equal(r.saved, false, 'no se da por guardado'); assert.match(r.error, /No se ha podido guardar/); }
  assert.equal((await saved(id)).status, 'ended', 'los resultados quedaron en la expedición');
  for (const p of [jon, kai]) assert.equal((await app.store.listRewards(p.id)).length, 0);
  app.profiles.applyResult = real;
  for (const p of [jon, kai]) p.room.reconnection.maxRetries = 0;
  await crash();                                                        // al arrancar: ExpeditionService.recover()
  for (const p of [jon, kai]) {
    assert.equal((await app.store.listRewards(p.id)).length, 1, p.name + ': aplicado al arrancar');
    const s = (await profile(p)).save; assert.equal(s.bank, 130); assert.ok(s.cleared.includes('gruta'));
  }
  await app.expeditions.recover();
  for (const p of [jon, kai]) assert.equal((await app.store.listRewards(p.id)).length, 1, 'y no se repite');
});

test('intentos de duplicar oro con la API: misma venta repetida, versión antigua y ventas a la vez', { timeout: 30000 }, async () => {
  const lia = await player('lia', veteran('mago'));
  const p0 = await profile(lia), item = p0.save.inv.find(s => s.qty === 1) || p0.save.inv[0];
  const body = { op: 'sell', args: { uid: item.uid }, version: p0.version, opId: 'venta-lia-0001' };
  const a = await api('POST', '/api/profile/op', body, lia.token), b = await api('POST', '/api/profile/op', body, lia.token);
  assert.equal(a.status, 200); assert.equal(b.status, 200); assert.equal(b.body.duplicate, true, 'la misma petición: no se aplica otra vez');
  const bank1 = (await profile(lia)).save.bank;
  assert.equal(bank1, 100 + a.body.info.price);
  // Otra venta con la versión antigua (sin opId nuevo de la misma petición): conflicto, no se aplica
  const old = await api('POST', '/api/profile/op', { op: 'sell', args: { uid: p0.save.inv.find(s => s.uid !== item.uid).uid }, version: p0.version, opId: 'venta-lia-0002' }, lia.token);
  assert.equal(old.status, 409); assert.equal((await profile(lia)).save.bank, bank1);
  // Dos ventas distintas a la vez con la misma versión: una sola pasa
  const p1 = await profile(lia), uids = p1.save.inv.slice(0, 2).map(s => s.uid);
  const both = await Promise.all(uids.map((uid, i) => api('POST', '/api/profile/op', { op: 'sell', args: { uid }, version: p1.version, opId: 'venta-lia-1' + i + '00' }, lia.token)));
  assert.deepEqual(both.map(r => r.status).sort(), [200, 409]);
  assert.equal((await profile(lia)).version, p1.version + 1);
});
