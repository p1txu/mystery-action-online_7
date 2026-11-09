/**
 * Aldea que evoluciona (0.43) en línea, con Colyseus REAL, clientes SDK y SQLite en disco:
 *  - evento regional en grupo: el invasor sale en el piso compartido; quien tiene el evento lo resuelve una
 *    vez; quien ayuda gana +5; ni ceder el liderazgo ni reconectarse lo repite; persiste tras reiniciar;
 *  - forja: el contrato de la herrera construye la mejora en el servidor; la entrega y la compra repetidas
 *    con el mismo opId no se aplican dos veces; persiste tras reiniciar.
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

const PORT = 3700 + Math.floor(Math.random() * 100), URL0 = `http://127.0.0.1:${PORT}`;
const DB = join(mkdtempSync(join(tmpdir(), 'ma-town-')), 'mystery-action.db');
const cfg = { port: PORT, secret: 't'.repeat(48), store: 'sqlite', sqliteFile: DB, tokenTtlHours: 1, allowProfileImport: false, clientOrigins: [], reconnectSeconds: 30, logLevel: 'error' };
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


test('evento regional en grupo online: el invasor sale, Ana lo resuelve una vez; Beto ayuda; ni el cambio de líder ni la reconexión lo repiten; persiste tras reiniciar', { timeout: 90000 }, async () => {
  const s = veteran('guerrero'); s.points = 120;
  s.events = { active: { id: 'inv-online-1', type: 'invasor', dungeon: 'gruta', floor: 2, variant: 'rataCristal', name: 'Garrafría', startRun: 0, endsRun: 3 }, history: [], nextRun: 0 };
  const ana = await player('ana', s), beto = await player('beto', Object.assign(veteran('mago'), { points: 100 }));
  const room = await start(ana, [beto]), X = room.exp, id = X.id;
  // Preparación: bajar al piso 2
  while (X.seq[X.stepIdx].floorNo !== 2 || X.seq[X.stepIdx].kind !== 'normal') X.nextStep();
  room.flushEvents(); await wait(300);
  const inv = X.g.actors.find(a => a.invader && a.alive);
  assert.ok(inv, 'el invasor está en el piso'); assert.equal(inv.nameTag, 'Invasor: Garrafría');
  assert.ok(Object.values(st(beto).enemies).some(e => e.elite), 'los dos lo ven (élite en el estado compartido)');
  const [A, B] = [...X.members.values()];
  B.player.placeAt(inv.x + 20, inv.y); A.player.placeAt(inv.x - 20, inv.y);
  X.E.Combat.hit(X.g, inv, { team: 'player', fixed: 1e8, src: A.player });
  await until(() => ev(ana, 'regionEvent').length && ev(beto, 'regionEvent').length, 4000, 'avisos del evento');
  assert.equal(ev(ana, 'regionEvent')[0].won, true); assert.equal(ev(beto, 'regionEvent')[0].won, false);
  // Cambio de líder (Ana cede) y Beto se reconecta: no se repite nada
  ana.room.send(C.HOST, { to: beto.room.sessionId });
  await until(() => room.state.players.get(beto.room.sessionId)?.host === true, 4000, 'Beto es el líder');
  const bSid = beto.room.sessionId; beto.room.reconnection.maxRetries = 0;
  room.clients.find(c => c.sessionId === bSid).ref.terminate();
  await until(() => room.state.players.get(bSid)?.connected === false, 4000, 'Beto desconectado');
  const beto2 = Object.assign({}, beto, { client: newClient(beto.token), inbox: [] });
  listen(beto2, await beto2.client.reconnect(beto.room.reconnectionToken));
  X.invaderDown(inv, { [A.id]: 1, [B.id]: 1 });                                       // un segundo aviso de muerte (como tras reconectarse): nada
  X.finish('return');
  await Promise.all([ana, beto2].map(p => until(() => got(p, S.RESULT), 8000, 'resultado ' + p.name)));
  const pa = (await profile(ana)).save, pb = (await profile(beto)).save;
  assert.equal(pa.events.active, null); assert.deepEqual(pa.events.history.map(h => h.result), ['won']); assert.ok(pa.guild.claims.includes('event:inv-online-1'));
  assert.equal(pa.points, 120 + 30, 'Ana: +30, una vez'); assert.equal(pb.points, 100 + 5, 'Beto: +5 por ayudar, una vez');
  assert.equal(pa.bank, 100 + 160);
  for (const p of [ana, beto2]) await p.room.leave().catch(() => {});
  // Reiniciar el servidor: sigue igual
  await app.close(); await boot();
  const again = (await profile(ana)).save; assert.equal(again.points, 150); assert.equal(again.events.active, null);
  const sum = (await api('GET', '/api/profile', null, (await relogin(ana)).token)).body;
  assert.equal(sum.summary.reputation.points, 150); assert.deepEqual(sum.summary.town, { upgrades: [] });
});

test('forja online: contrato de la herrera → mejora construida en el servidor; compra con opId sin duplicar; persiste tras reiniciar', { timeout: 60000 }, async () => {
  const s = veteran('guerrero'); s.points = 220; s.bank = 1000;
  const eva = await player('eva', s);
  let p = await profile(eva);
  const board = await api('POST', '/api/profile/op', { op: 'arrive', args: {}, version: p.version, opId: 'eva-arrive-01' }, eva.token);
  p = await profile(eva);
  const pj = p.save.board.find(j => j.project === 'forja'); assert.ok(pj, 'el tablón del servidor ofrece el proyecto');
  let r = await api('POST', '/api/profile/op', { op: 'acceptJob', args: { id: pj.id }, version: p.version, opId: 'eva-accept-01' }, eva.token); assert.equal(r.status, 200, JSON.stringify(r.body));
  r = await api('POST', '/api/profile/op', { op: 'buy', args: { id: 'insigniaGremio' }, version: r.body.version, opId: 'eva-buy-00' }, eva.token);
  assert.equal(r.status, 400, 'sin forja no hay insignia');
  // Preparación: los fragmentos ya traídos (como al volver de la Gruta)
  await app.store.mutateProfile(eva.id, sv => { const j = sv.jobs.find(q => q.project); j.progress = j.goal; j.state = 'done'; return { save: sv }; }, { origin: 'test' });
  p = await profile(eva);
  r = await api('POST', '/api/profile/op', { op: 'deliverJob', args: { id: pj.id }, version: p.version, opId: 'eva-deliver-01' }, eva.token);
  assert.equal(r.status, 200); assert.ok(r.body.info.built[0].includes('Brasa'));
  const dup = await api('POST', '/api/profile/op', { op: 'deliverJob', args: { id: pj.id }, version: p.version, opId: 'eva-deliver-01' }, eva.token);
  assert.equal(dup.body.duplicate, true, 'la misma entrega repetida');
  const buy = { op: 'buy', args: { id: 'insigniaGremio' }, version: r.body.version, opId: 'eva-buy-01' };
  const b1 = await api('POST', '/api/profile/op', buy, eva.token), b2 = await api('POST', '/api/profile/op', buy, eva.token);
  assert.equal(b1.status, 200); assert.equal(b2.body.duplicate, true);
  p = await profile(eva);
  assert.deepEqual(p.save.town.upgrades, ['forja']); assert.equal(p.save.inv.filter(x => x.id === 'insigniaGremio').length, 1, 'una insignia');
  assert.equal(p.save.bank, 1000 + pj.reward.gems - 420, 'cobrado y pagado una vez');
  await app.close(); await boot();
  const after = (await profile(eva)).save; assert.deepEqual(after.town.upgrades, ['forja']); assert.equal(after.inv.filter(x => x.id === 'insigniaGremio').length, 1);
});
