/**
 * Historia (0.44) en línea, con Colyseus REAL, clientes SDK y SQLite en disco: sitios fijos leídos con el perfil de
 * cada uno, eventos solo para su dueño, la rueda del sello y la decisión de Bernardo por el mensaje «choose».
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
const DB = join(mkdtempSync(join(tmpdir(), 'ma-story-')), 'mystery-action.db');
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



/** Lleva la expedición al piso `floorNo` (normal) o a la guarida. */
function goTo(X, floorNo) { while (!(floorNo === 'boss' ? X.seq[X.stepIdx].kind === 'boss' : X.seq[X.stepIdx].kind === 'normal' && X.seq[X.stepIdx].floorNo === floorNo)) X.nextStep(); }

test('historia online: dos jugadores con progreso distinto leen el mismo sitio y cada uno recibe SOLO lo suyo; persiste en su perfil', { timeout: 90000 }, async () => {
  const sa = Object.assign(veteran('mago'), {}); E.StoryChain.visit(sa, 'marca_irene'); E.StoryChain.talk(sa, 'ulula_irene');   // Ana tiene la clave de Ulula
  const ana = await player('ana', sa), beto = await player('beto', veteran('guerrero'));
  const room = await start(ana, [beto], 'bosque'), X = room.exp;
  goTo(X, 4); room.flushEvents(); await wait(300);
  assert.equal(X.story.length, 1, 'la pared hueca del piso 4 está (piso compartido)');
  X.g.actors = X.g.actors.filter(e => !(e instanceof X.E.Enemy));
  const site = X.story[0], [A, B] = [...X.members.values()];
  A.player.placeAt(site.x, site.y); B.player.placeAt(site.x + 4, site.y);
  await until(() => ev(ana, 'story').length && ev(beto, 'story').length, 4000, 'los dos lo leen');
  const ea = ev(ana, 'story'), eb = ev(beto, 'story');
  assert.equal(ea.length, 1); assert.equal(eb.length, 1, 'cada uno recibe solo su evento');
  assert.equal(ea[0].res.state, 'ok'); assert.match(ea[0].res.text, /Ulula te ha enseñado/);
  assert.equal(eb[0].res.state, 'locked'); assert.ok(!/Ulula te ha enseñado/.test(eb[0].res.text), 'Beto no ve la página');
  X.finish('return');
  await Promise.all([ana, beto].map(p => until(() => got(p, S.RESULT), 8000, 'resultado ' + p.name)));
  const pa = await profile(ana), pb = await profile(beto);
  assert.deepEqual(pa.save.codex.pages, ['p1'], 'guardado en el perfil de Ana'); assert.deepEqual(pb.save.codex.pages, []);
});

test('historia online: la rueda de la Mina y la decisión de Bernardo por la sala (mensaje «choose»), solo para quien se le ofreció y una vez', { timeout: 90000 }, async () => {
  const sc = veteran('asesino'); sc.cleared = ['bosque', 'gruta', 'cienaga']; E.StoryChain.visit(sc, 'marca_irene');
  const carla = await player('carla', sc), dani = await player('dani', Object.assign(veteran('arquero'), { cleared: ['bosque', 'gruta', 'cienaga'] }));
  const room = await start(carla, [dani], 'mina'), X = room.exp;
  goTo(X, 'boss'); room.flushEvents(); await wait(300);
  for (const m of X.members.values()) { m.player.maxHp = m.player.hp = 1e6; }
  const [C1, D1] = [...X.members.values()];
  X.E.Combat.hit(X.g, X.boss, { team: 'player', fixed: 1e9, src: C1.player });
  await until(() => Object.values(st(carla).objects || {}).some(o => o.type === 'seal'), 4000, 'la rueda llega a los clientes');
  dani.room.send(C.CHOOSE, { topic: 'bernardo', option: 'liberar' }); await wait(200);
  assert.ok(!D1.save.story.choices.bernardo, 'sin haberle visto no se decide');
  const seal = X.objects.find(o => o.type === 'seal'); C1.player.placeAt(seal.x, seal.y);
  await until(() => ev(carla, 'story').some(e => e.res.choice === 'bernardo'), 4000, 'Bernardo pregunta a Carla');
  assert.equal(ev(dani, 'story').length, 0, 'Dani no lo ha leído');
  carla.room.send(C.CHOOSE, { topic: 'bernardo', option: 'liberar' });
  await until(() => ev(carla, 'story').some(e => String(e.res.id).startsWith('choice:')), 4000, 'consecuencia');
  carla.room.send(C.CHOOSE, { topic: 'bernardo', option: 'dejar' }); await wait(200);
  assert.equal(C1.save.story.choices.bernardo, 'liberar', 'una vez');
  X.finish('clear');
  await until(() => got(carla, S.RESULT), 8000, 'resultado');
  assert.equal((await profile(carla)).save.story.choices.bernardo, 'liberar');
  assert.ok((await profile(carla)).save.codex.lemas.includes('peso'));
  assert.deepEqual((await profile(dani)).save.story.choices, {});
});
