/**
 * Dificultad del cooperativo según el número de jugadores (COOP_SCALING en shared/protocol.js):
 * PS y daño de los enemigos, cuántos hay, élites, errantes, nido de monstruos y guardián.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { Expedition } from '../server/src/sim/Expedition.js';
import { COOP_SCALING, coopScaling, coopSummary, MAX_PLAYERS } from '../shared/protocol.js';
import { freshSave, seeded, STEP } from './helpers.mjs';

const party = n => ['guerrero', 'mago', 'arquero', 'guerrero'].slice(0, n).map((sp, i) => ({ id: 'p' + i, name: 'J' + i, profile: freshSave(sp) }));
const make = (n, seed = 99, random = seeded(3)) => new Expedition({ dungeonId: 'bosque', seed, members: party(n), random });
const enemies = x => x.g.actors.filter(a => a instanceof x.E.Enemy && a.alive);
const run = (x, s) => { for (let i = 0; i < Math.round(s / STEP); i++) x.step(STEP); };

test('tabla: con 1 jugador todo vale 1 y cada jugador más lo pone más difícil', () => {
  assert.deepEqual(Object.values(coopScaling(1)), [1, 1, 1, 1, 0, 0, 1]);
  for (let n = 2; n <= MAX_PLAYERS; n++) for (const k of Object.keys(COOP_SCALING[1])) assert.ok(COOP_SCALING[n][k] > COOP_SCALING[n - 1][k], `${k} crece con ${n}`);
  assert.equal(coopScaling(0), coopScaling(1)); assert.equal(coopScaling(9), coopScaling(4));
  assert.match(coopSummary(4), /4 jugadores: enemigos \+20 %, PS ×2,9/);
  for (let n = 2; n <= MAX_PLAYERS; n++) assert.ok(COOP_SCALING[n].count <= 1.2, 'casi los mismos enemigos que en solitario');
  assert.equal(coopSummary(1), '1 jugador: dificultad normal');
});

test('más jugadores ⇒ más enemigos en el piso, con más PS y más daño', () => {
  const rows = [1, 2, 3, 4].map(n => { const x = make(n), es = enemies(x); return { n, x, count: es.length, hp: es.map(e => e.maxHp), base: es.map(e => e.netBaseMaxHp), dmg: es.map(e => e.dmgMul / e.netBaseDmg) }; });
  const solo = rows[0];
  assert.equal(solo.count, solo.x.L.enemies.filter(s => !s.outlaw).length, 'en solitario, los mismos enemigos de siempre');
  assert.deepEqual(solo.hp, solo.base, 'en solitario, los mismos PS de siempre');
  for (const r of rows.slice(1)) {
    const c = coopScaling(r.n);
    const own = r.x.L.enemies.filter(s => !s.outlaw).length;   // los del generador de ese piso
    assert.ok(r.count >= Math.round(own * c.count) - 1, `${r.n} jugadores: ${r.count} enemigos (${own} del piso)`);
    r.hp.forEach((h, i) => assert.equal(h, Math.max(1, Math.round(r.base[i] * c.hp))));
    r.dmg.forEach(d => assert.ok(Math.abs(d - c.dmg) < 1e-9));
    assert.equal(r.x.floorInfo.coop.players, r.n); assert.match(r.x.floorInfo.coop.text, new RegExp(`^${r.n} jugadores`));
  }
  // En media (el mapa cambia con el grupo, así que se compara sobre varias semillas): 1 < 2 < 4
  const avg = n => { let t = 0; for (let seed = 1; seed <= 40; seed++) t += enemies(make(n, seed)).length; return t / 40; };
  const [a1, a2, a4] = [avg(1), avg(2), avg(4)];
  assert.ok(a1 < a2 && a2 < a4, `media de enemigos: ${a1} < ${a2} < ${a4}`);
  // Los extra no aparecen junto a la entrada
  const x = rows[3].x, sp = x.world.spawn;
  for (const e of enemies(x).slice(x.L.enemies.length)) assert.ok(Math.hypot(e.x - sp.x, e.y - sp.y) >= 8 * 32 - 1);
  // Todos llegan a la red con sus PS escalados
  const v = x.view(); assert.equal(v.enemies.length, rows[3].count);
  for (const ve of v.enemies) assert.equal(ve.maxHp, x.g.actors.find(a => a.netId === ve.id).maxHp);
});

test('el guardián escala con bossHp; si alguien sale del grupo, los enemigos se reajustan conservando su proporción', () => {
  const x = make(4, 11); x.loadStep(x.seq.length - 1); x.drainEvents();
  const b = x.boss; assert.equal(b.maxHp, Math.round(b.netBaseMaxHp * coopScaling(4).bossHp));
  b.hp = Math.round(b.maxHp / 2);
  x.removeMember('p3');
  assert.equal(b.maxHp, Math.round(b.netBaseMaxHp * coopScaling(3).bossHp));
  assert.ok(Math.abs(b.hp / b.maxHp - .5) < .01, 'sigue a la mitad');
  const ev = x.drainEvents().find(e => e.type === 'coop'); assert.ok(ev); assert.equal(ev.coop.players, 3);
  assert.equal(x.floorInfo.coop.players, 3, 'quien vuelve a conectarse recibe la dificultad actual');
  x.removeMember('p2'); x.removeMember('p1');
  assert.equal(b.maxHp, b.netBaseMaxHp, 'con 1 jugador, PS normales');
  // Una desconexión NO baja la dificultad (puede volver)
  const y = make(2); y.setConnected('p1', false); assert.equal(y.coopN, 2);
});

test('invocaciones del guardián: se sincronizan por red (antes no tenían id) y escalan como los demás', () => {
  const x = make(3, 11); x.loadStep(x.seq.length - 1);
  for (const m of x.members.values()) { m.player.maxHp = m.player.hp = 99999; }
  const b = x.boss, E = x.E;
  const m = new E.Enemy(E.makeKind(b.kind.minion), b.x + 40, b.y, { level: 3 });
  m.summoner = b; m.aggro = true; x.g.actors.push(m);       // como hace bossExec('summon') del motor
  const base = m.maxHp;
  run(x, STEP);
  assert.ok(m.netId, 'recibe id de red');
  assert.equal(m.maxHp, Math.round(base * coopScaling(3).hp));
  assert.ok(x.view().enemies.some(e => e.id === m.netId), 'aparece en la vista que reciben los clientes');
  // Y las invocaciones reales del motor también
  b.aggro = true; b.hp = Math.floor(b.maxHp * .4); run(x, 12);
  const minions = x.g.actors.filter(a => a.summoner === b);
  for (const mm of minions) assert.ok(mm.netId);
});

test('errantes y nido de monstruos: más con más jugadores', () => {
  const solo = make(1), four = make(4);
  assert.ok(four.coop.wander > solo.coop.wander && four.coop.spawn > solo.coop.spawn);
  const nest = x => { const r = x.L.rooms.find(r => r.type === 'normal' && r.w * r.h >= 30) || x.L.rooms[1]; const before = enemies(x).length; x.triggerMonsterHouse(r, { x: -9999, y: -9999 }); return enemies(x).length - before; };
  const a = nest(make(1, 5, seeded(7))), d = nest(make(4, 5, seeded(7)));
  assert.ok(d > a, `nido: ${d} con 4 frente a ${a} solo`);
});

test('mapa según el grupo: en solitario el de siempre; en cooperativo más grande y con pasillos de 3', () => {
  const E = make(1).E, d = E.dungeonById('bosque');
  const sizes = [1, 2, 3, 4].map(n => { let a = 0; for (let seed = 1; seed <= 30; seed++) { const g = E.FloorGen.generate(seed, d, 2, 'normal', [], n); a += g.world.w * g.world.h; } return a / 30; });
  assert.ok(sizes[0] < sizes[1] && sizes[1] < sizes[2] && sizes[2] < sizes[3], 'crece con cada jugador: ' + sizes.map(Math.round));
  assert.deepEqual([1, 2, 3, 4].map(n => E.FloorGen.size(n).corr), [2, 3, 3, 3]);
  // Solitario: idéntico a llamar sin indicar jugadores (como hace la partida local)
  const a = E.FloorGen.generate(7, d, 3, 'normal', []), b = E.FloorGen.generate(7, d, 3, 'normal', [], 1);
  assert.deepEqual([...a.world.tiles], [...b.world.tiles]);
  // La expedición genera el piso con su número de jugadores y se lo dice al cliente (`size`)
  for (const n of [1, 2, 4]) {
    const x = make(n), f = x.floorInfo; assert.equal(f.size, n);
    const client = E.FloorGen.generate(f.seed, E.dungeonById(f.dungeon), f.genNo, f.kind, [], f.size);
    assert.deepEqual([...client.world.tiles], [...x.world.tiles], 'el cliente genera el mismo piso');
    assert.equal(x.floor.windLimit, Math.round(d.wind * E.FloorGen.size(n).wind), 'más tiempo en mapas más grandes');
  }
  // Guarida más grande con el grupo; el guardián sigue viendo a los jugadores desde la entrada
  const g4 = make(4, 11); g4.loadStep(g4.seq.length - 1);
  const g1 = make(1, 11); g1.loadStep(g1.seq.length - 1);
  assert.ok(g4.world.w > g1.world.w);
  for (const x of [g1, g4]) { const sp = x.world.spawn; assert.ok(Math.hypot(x.boss.x - sp.x, x.boss.y - sp.y) < x.boss.kind.aggro); }
  assert.equal(g1.boss.kind.aggro, 380, 'en solitario, el de siempre');
  // Si el grupo cambia, el piso actual no cambia; el siguiente se genera con los que quedan
  const y = make(3); const w0 = y.world.w; y.removeMember('p2'); assert.equal(y.world.w, w0); y.nextStep(); assert.equal(y.floorInfo.size, 2);
});
