/**
 * Capítulo 1 (0.45) en línea, con Colyseus REAL, clientes SDK, la API HTTP real y SQLite en disco: el Linde en grupo,
 * contadores y rastros por perfil, salida a la aldea y entregas de misiones por la API una sola vez.
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
const DB = join(mkdtempSync(join(tmpdir(), 'ma-chapter1-')), 'mystery-action.db');
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



/** Operación de la aldea por la API real (con la versión del perfil que tenga el servidor). */
async function villageOp(p, name, args) {
  const g = await api('GET', '/api/profile', null, p.token);
  return api('POST', '/api/profile/op', { op: name, args, version: g.body.version, opId: name + ':' + JSON.stringify(args) + ':' + Date.now() }, p.token);
}

test('capítulo 1 en línea: dos jugadores exploran el Linde juntos; cada perfil cuenta sus criaturas y rastros; cada uno entrega su misión por la API, una vez', { timeout: 120000 }, async () => {
  const mk = sp => { const s = freshSave(sp, { arrived: true }); E.StoryChain.talk(s, 'c1_intro'); E.StoryChain.talk(s, 'nara_c1'); return s; };
  const ana = await player('ana', mk('mago')), beto = await player('beto', mk('guerrero'));
  // Ana acepta «Espinas negras» antes de salir; Beto no (también le cuenta)
  const acc = await villageOp(ana, 'questAccept', { id: 'c1_elite' }); assert.equal(acc.status, 200, JSON.stringify(acc.body));
  const room = await start(ana, [beto], 'linde'), X = room.exp;
  assert.equal(X.seq.length, 1, 'zona sin guarida');
  await until(() => Object.keys(st(beto).enemies || {}).length > 0, 4000, 'enemigos en el cliente');
  const [A, B] = [...X.members.values()]; for (const m of [A, B]) m.player.maxHp = m.player.hp = 1e6;
  const el = X.g.actors.find(e => e instanceof X.E.Enemy && e.elite && e.alive); assert.ok(el, 'la zarza élite está');
  A.player.placeAt(el.x + 30, el.y); B.player.placeAt(el.x - 30, el.y);
  X.E.Combat.hit(X.g, el, { team: 'player', fixed: 1e9, src: A.player }); await wait(300);
  for (const m of [A, B]) assert.equal(m.save.story.counters.c1_elites, 1, m.name);
  // (0.46) El progreso llega a cada cliente durante la expedición: Ana tenía «Espinas negras» aceptada; Beto no
  await until(() => ev(ana, 'campaign').some(e => (e.ready || []).includes('c1_elite')) && ev(beto, 'campaign').some(e => e.counters && e.counters.c1_elites === 1), 4000, 'progreso de la campaña en los clientes');
  assert.ok(!ev(beto, 'campaign').some(e => (e.ready || []).length), 'a Beto no se le anuncia una misión que no tiene');
  X.g.actors = X.g.actors.filter(e => !(e instanceof X.E.Enemy));
  for (const s0 of X.story) { A.player.placeAt(s0.x, s0.y); B.player.placeAt(s0.x + 4, s0.y); await wait(150); }
  await until(() => ev(ana, 'story').length === 4 && ev(beto, 'story').length === 4, 4000, 'los 4 rastros para cada uno');
  // Salida por el sendero: vuelta a la aldea para los dos
  for (const m of [A, B]) m.player.placeAt((X.L.stairs.tx + .5) * 32, (X.L.stairs.ty + .5) * 32);
  await Promise.all([ana, beto].map(p => until(() => got(p, S.RESULT), 8000, 'resultado ' + p.name)));
  const pa = (await profile(ana)).save, pb = (await profile(beto)).save;
  for (const s of [pa, pb]) { assert.equal(s.story.counters.c1_elites, 1); assert.ok(['z_raiz', 'z_savia', 'z_huellas', 'z_campamento'].every(z => s.codex.lore.includes(z))); assert.ok(!s.cleared.includes('linde')); }
  // Entregas: Ana la suya; Beto la acepta después (ya hecha) y la entrega; ninguno cobra dos veces
  const t1 = await villageOp(ana, 'questTurnIn', { id: 'c1_elite' }); assert.equal(t1.status, 200, JSON.stringify(t1.body)); assert.ok(t1.body.info.exp > 0);
  const t2 = await villageOp(ana, 'questTurnIn', { id: 'c1_elite' }); assert.equal(t2.status, 400, 'una vez');
  assert.equal((await villageOp(beto, 'questAccept', { id: 'c1_elite' })).status, 200);
  const t3 = await villageOp(beto, 'questTurnIn', { id: 'c1_elite' }); assert.equal(t3.status, 200);
  const fa = (await profile(ana)).save, fb = (await profile(beto)).save;
  assert.equal(fa.story.quests.c1_elite, 'done'); assert.equal(fb.story.quests.c1_elite, 'done');
  assert.equal(fa.guild.claims.filter(c => c === 'quest:c1_elite').length, 1); assert.equal(fb.guild.claims.filter(c => c === 'quest:c1_elite').length, 1);
  // La conversación de Nara con los rastros vistos, y la introducción no se repite
  assert.equal((await villageOp(beto, 'talk', { id: 'nara_rastros' })).status, 200);
  assert.equal((await villageOp(beto, 'talk', { id: 'c1_intro' })).status, 400);
});
