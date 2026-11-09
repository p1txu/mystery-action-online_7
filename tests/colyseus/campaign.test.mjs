/**
 * Campaña cooperativa, FASE 1: «una expedición sencilla con dos jugadores y un jefe», con Colyseus REAL,
 * clientes SDK reales y la base de datos SQLite en disco.
 *  - sala privada con código: un intruso sin código o con otro código no entra; se ven clases y conexión;
 *  - la anfitriona elige la Mina Olvidada; Beto no la tiene desbloqueada: va como acompañante (se ve en la sala);
 *  - no se empieza hasta que Beto está listo;
 *  - Gromgar: el mismo estado (fase, vida, choques) en el servidor y en los dos clientes; Beto pierde la
 *    conexión en plena pelea, el jefe sigue, y Beto vuelve a SU sitio desde otro dispositivo;
 *  - recompensas: una sola vez por jugador aunque la sala intente cerrar dos veces y aunque se reintente el
 *    guardado con la misma expedición; el trofeo único, una vez; Beto, como acompañante, no se salta la campaña;
 *  - (expediciones interrumpidas y su reanudación: tests/colyseus/recovery.test.mjs);
 *  - solitario: la misma sala con una plaza sigue funcionando igual.
 * Lo que es preparación (no lo haría un jugador) está marcado: saltar al piso del jefe y rematarlo.
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

const PORT = 3300 + Math.floor(Math.random() * 100), URL0 = `http://127.0.0.1:${PORT}`;
const DB = join(mkdtempSync(join(tmpdir(), 'ma-campaign-')), 'mystery-action.db');
const cfg = { port: PORT, secret: 'k'.repeat(48), store: 'sqlite', sqliteFile: DB, tokenTtlHours: 1, allowProfileImport: false, clientOrigins: [], reconnectSeconds: 30, logLevel: 'warn' };
const wait = ms => new Promise(r => setTimeout(r, ms));
const until = async (fn, ms = 6000, what = 'condición') => { const t0 = Date.now(); while (Date.now() - t0 < ms) { const v = await fn(); if (v) return v; await wait(20); } throw new Error('Tiempo agotado: ' + what); };
const api = async (method, path, body, token, retry = 1) => { let r; try { r = await fetch(URL0 + path, { method, headers: Object.assign({ 'content-type': 'application/json' }, token ? { authorization: 'Bearer ' + token } : {}), body: body && JSON.stringify(body) }); } catch (e) { if (retry) return api(method, path, body, token, 0); throw e; } return { status: r.status, body: await r.json().catch(() => null) }; };   // tras reiniciar el servidor, la conexión reutilizada está cerrada

let app;
const boot = async () => { const w = console.warn, i = console.info; console.warn = () => {}; console.info = () => {}; app = await createGameServer(cfg); console.warn = w; console.info = i; await app.listen(); };
test.before(boot);
test.after(async () => { await app.close(); });

async function player(username, save) {
  const r = await api('POST', '/api/auth/register', { username, password: 'clave-de-' + username, name: username });
  assert.equal(r.status, 201, 'registro ' + username);
  if (save) await app.store.putProfile(r.body.account.id, E.Save.sanitize(save).data, { origin: 'seed' });
  return { name: username, token: r.body.token, id: r.body.account.id, client: newClient(r.body.token), inbox: [], room: null, seq: 0, n: 0 };
}
const newClient = token => { const c = new Client(URL0); c.auth.token = token; return c; };
const relogin = async p => { const r = await api('POST', '/api/auth/login', { username: p.name, password: 'clave-de-' + p.name }); p.token = r.body.token; p.client = newClient(p.token); p.inbox = []; return p; };
function listen(p, room) {
  p.room = room;
  room.onMessage(S.WELCOME, m => { p.inbox.push([S.WELCOME, m]); if (m.input) { p.seq = Math.max(p.seq, m.input.seq); p.n = Math.max(p.n, m.input.act); } });
  for (const t of [S.FLOOR, S.EVENT, S.REJECT, S.RESULT]) room.onMessage(t, m => p.inbox.push([t, m]));
  return room;
}
const opts = (p, x = {}) => Object.assign({ protocol: PROTOCOL_VERSION, token: p.token }, x);
const st = p => p.room.state.toJSON();
const got = (p, type, pred = () => true) => p.inbox.find(([t, m]) => t === type && pred(m));
const ev = (p, type) => p.inbox.filter(([t, m]) => t === S.EVENT && m.type === type).map(([, m]) => m);
const server = p => app.matchMaker.getLocalRoomById(p.room.roomId);
const veteran = sp => freshSave(sp, { cleared: ['bosque', 'gruta', 'cienaga'], arrived: true });
/** Entrada como la del juego: 6 muestras de eje y, si toca, un ataque numerado hacia el objetivo. */
function input(p, ax, ay, attackAt) {
  const me = st(p).players[p.room.sessionId]; if (!me) return;
  const a = [];
  if (attackAt) { const dx = attackAt.x - me.x, dy = attackAt.y - me.y, d = Math.hypot(dx, dy) || 1; a.push({ n: ++p.n, at: p.seq + 2, k: 'b', dx: dx / d, dy: dy / d, d: Math.round(d) }); }
  try { p.room.send(C.INPUT, { s: p.seq, m: Array(6).fill([ax, ay]), a }); } catch { /* sin conexión */ }
  p.seq += 6;
}
async function openRoom(host, dungeon = 'bosque') {
  listen(host, await host.client.create(ROOM_NAME, opts(host, { creating: true, dungeon })));
  return (await until(() => got(host, S.WELCOME), 4000, 'welcome'))[1].code;
}

test('fase 1: dos jugadores y un jefe — sala con código, acompañante, Gromgar sincronizado, corte y vuelta, recompensas una vez', { timeout: 90000 }, async () => {
  const ana = await player('ana', veteran('guerrero')), beto = await player('beto', freshSave('mago', { cleared: ['bosque'], arrived: true }));
  const ivan = await player('ivan', freshSave('arquero')), otra = await player('otra', freshSave('guerrero'));
  const code = await openRoom(ana);
  const roomId = ana.room.roomId;
  // --- Intrusos: sin código, con un código inventado o con el de otra sala
  await assert.rejects(ivan.client.joinById(roomId, opts(ivan)), 'sin código no se entra');
  await assert.rejects(ivan.client.joinById(roomId, opts(ivan, { code: 'ZZZZZZ' })), 'código falso');
  const other = await openRoom(otra);
  await assert.rejects(ivan.client.joinById(roomId, opts(ivan, { code: other })), 'código de otra sala');
  await otra.room.leave();
  // --- Beto entra con el código; los dos ven a los dos, con su clase y su conexión
  listen(beto, await beto.client.joinById(roomId, opts(beto, { code })));
  await until(() => Object.keys(st(ana).players).length === 2 && Object.keys(st(beto).players).length === 2, 3000, 'dos dentro');
  for (const p of [ana, beto]) {
    const ps = Object.values(st(p).players).sort((a, b) => a.joinedAt - b.joinedAt);
    assert.deepEqual(ps.map(q => [q.name, q.species, q.connected, q.host]), [['ana', 'guerrero', true, true], ['beto', 'mago', true, false]]);
  }
  assert.ok(![...server(ana).state.players.values()].some(q => q.name === 'ivan'), 'el intruso no está');
  // --- La anfitriona elige la Mina: Beto no la tiene, va como acompañante y se ve en la sala
  ana.room.send(C.OPTIONS, { dungeon: 'mina' });
  await until(() => st(beto).dungeon === 'mina' && st(beto).players[beto.room.sessionId].companion === true, 3000, 'acompañante visible');
  assert.equal(st(ana).players[ana.room.sessionId].companion, false);
  // --- No se empieza sin Beto listo; Beto no puede empezar ni cambiar opciones
  ana.room.send(C.START, {}); await until(() => got(ana, S.REJECT, m => m.what === 'start'), 3000, 'rechazo por no listo');
  beto.room.send(C.START, {}); beto.room.send(C.OPTIONS, { dungeon: 'bosque' });
  await until(() => got(beto, S.REJECT, m => m.what === 'start') && got(beto, S.REJECT, m => m.what === 'options'), 3000, 'Beto no manda');
  beto.room.send(C.READY, { ready: true }); await until(() => st(ana).players[beto.room.sessionId].ready, 3000, 'listo');
  ana.room.send(C.START, {});
  await until(() => got(ana, S.FLOOR) && got(beto, S.FLOOR), 6000, 'primer piso');
  assert.ok(ev(beto, 'companions').length === 1 && ev(beto, 'companions')[0].names.includes('beto'));
  const room = server(ana), X = room.exp, aSid = ana.room.sessionId, bSid = beto.room.sessionId;
  assert.equal(X.members.get(bSid).companion, true);
  // --- Preparación: saltar al piso de Gromgar
  X.loadStep(X.seq.length - 1); room.flushEvents();
  await until(() => got(ana, S.FLOOR, m => m.kind === 'boss') && got(beto, S.FLOOR, m => m.kind === 'boss'), 4000, 'guarida');
  const boss = X.boss; assert.equal(boss.kind.name, 'Gromgar');
  assert.equal(boss.maxHp, Math.round(boss.netBaseMaxHp * X.E.BossKit.COOP_HP[1]), 'vida del jefe escalada para 2');
  for (const p of [ana, beto]) for (const m of X.members.values()) m.player.invincible = true;   // preparación: que nadie caiga durante la prueba
  // Los dos atacan con entradas reales del protocolo
  const hp0 = boss.hp;
  for (let k = 0; k < 50; k++) {
    for (const p of [ana, beto]) { const b = st(p).boss, me = st(p).players[p.room.sessionId]; if (!b || !me) continue; const e = Object.values(st(p).enemies).find(q => q.kind === boss.netKind) || { x: boss.x, y: boss.y }; const d = Math.hypot(e.x - me.x, e.y - me.y) || 1; input(p, (e.x - me.x) / d, (e.y - me.y) / d, k % 3 === 0 ? e : null); }
    await wait(50);
  }
  assert.ok(boss.hp < hp0, `el jefe recibe daño de las entradas: ${hp0} → ${boss.hp}`);
  // El mismo estado del jefe en el servidor y en los dos clientes (congelado para comparar)
  room.frozen = true; room.sync();
  await until(() => [ana, beto].every(p => st(p).boss && st(p).boss.hp === room.state.boss.hp && st(p).boss.bk === room.state.boss.bk), 3000, 'jefe igual en los dos');
  room.frozen = false;
  // --- Beto pierde la conexión en plena pelea: el jefe sigue y Ana lo ve desconectado
  beto.room.reconnection.maxRetries = 0;
  room.clients.find(c => c.sessionId === bSid).ref.terminate();
  await until(() => st(ana).players[bSid] && st(ana).players[bSid].connected === false, 4000, 'Ana ve a Beto desconectado');
  const t0 = room.state.time; await wait(400); assert.ok(room.state.time > t0, 'la pelea sigue');
  assert.equal(room.state.phase, 'playing');
  // Vuelve desde OTRO dispositivo a SU sitio
  const seat = await api('POST', '/api/rooms/resume', {}, beto.token);
  assert.equal(seat.status, 200, JSON.stringify(seat.body));
  const beto2 = Object.assign({}, beto, { client: newClient(beto.token), inbox: [], seq: 0, n: 0 });
  listen(beto2, await beto2.client.reconnect(seat.body.reconnectionToken));
  assert.equal(beto2.room.sessionId, bSid, 'mismo asiento');
  await until(() => got(beto2, S.FLOOR, m => m.kind === 'boss'), 4000, 'vuelve a la guarida');
  await until(() => st(ana).players[bSid].connected === true, 3000, 'Ana lo ve conectado');
  room.frozen = true; room.sync();
  await until(() => st(beto2).boss && st(beto2).boss.hp === room.state.boss.hp && st(beto2).boss.bk === room.state.boss.bk, 3000, 'Beto ve el jefe como está');
  room.frozen = false;
  assert.equal(X.g.actors.filter(a => a instanceof X.E.Player).length, 2, 'sin personajes duplicados');
  // --- Preparación: rematar a Gromgar y llevar a los dos al portal de salida
  X.E.Combat.hit(X.g, boss, { team: 'player', fixed: 1e8, src: X.members.get(aSid).player });
  await until(() => X.objects.some(o => o.type === 'warp'), 4000, 'portal tras el jefe');
  const warp = X.objects.find(o => o.type === 'warp');
  for (const m of X.members.values()) m.player.placeAt(warp.x, warp.y);
  const [ra, rb] = await Promise.all([ana, beto2].map(p => until(() => got(p, S.RESULT), 6000, 'resultado ' + p.name)));
  assert.equal(ra[1].result, 'clear'); assert.equal(rb[1].result, 'clear');
  // --- Recompensas: una vez, aunque la sala cierre dos veces y se reintente el guardado
  await room.end(); await room.end(); await wait(200);
  const again = await app.profiles.applyResult({ expeditionId: X.id, accountId: beto.id, result: 'clear', summary: {}, save: (await app.store.getProfile(beto.id)).save });
  assert.equal(again.applied, false, 'el mismo resultado no se aplica dos veces');
  for (const p of [ana, beto]) assert.equal((await app.store.listRewards(p.id)).length, 1, p.name + ': una recompensa');
  const pa = (await app.store.getProfile(ana.id)).save, pb = (await app.store.getProfile(beto.id)).save;
  for (const s of [pa, pb]) { assert.equal(s.bosses.gromgar.kills, 1); assert.equal(s.inv.filter(x => x.id === 'colmilloGromgar').length, 1, 'trofeo único, una vez'); }
  assert.ok(pa.cleared.includes('mina'));
  assert.ok(!pb.cleared.includes('mina'), 'el acompañante no se salta la campaña');
  assert.ok(rb[1].lines.some(l => /acompañante/.test(l)));
  assert.equal(pb.species, 'mago'); assert.equal(pa.species, 'guerrero', 'cada uno su perfil');
  for (const p of [ana, beto2]) await p.room.leave().catch(() => {});
});

test('solitario: la sala de una plaza funciona igual (entra, juega, recompensa una vez) y nadie más puede entrar', { timeout: 30000 }, async () => {
  const gil = await player('gil', veteran('asesino')), hugo = await player('hugo', freshSave('mago'));
  listen(gil, await gil.client.create(ROOM_NAME, opts(gil, { creating: true, solo: true, dungeon: 'bosque' })));
  const code = (await until(() => got(gil, S.WELCOME), 4000, 'welcome'))[1].code;
  await assert.rejects(hugo.client.joinById(gil.room.roomId, opts(hugo, { code })), 'una plaza');
  gil.room.send(C.START, { dungeon: 'bosque' });
  await until(() => got(gil, S.FLOOR), 6000, 'piso');
  const room = server(gil), X = room.exp;
  assert.equal(X.partySize, 1); assert.deepEqual(X.floorInfo.coop.players, 1);
  for (let k = 0; k < 20; k++) { input(gil, 1, 0); await wait(50); }
  assert.ok(st(gil).players[gil.room.sessionId].x !== undefined);
  X.finish('return');
  await until(() => got(gil, S.RESULT), 6000, 'resultado');
  await room.end();
  assert.equal((await app.store.listRewards(gil.id)).length, 1);
  await gil.room.leave().catch(() => {});
});
