/** Guardianes: sin desventaja de tipo y furia al 30 % (pausa para todos, +20 % daño, recargas −20 %). */
import test from 'node:test';
import assert from 'node:assert/strict';
import { Expedition } from '../server/src/sim/Expedition.js';
import { parseInput } from '../shared/protocol.js';
import { E, freshSave, seeded, STEP } from './helpers.mjs';

const bossFloor = (sp = 'voltrino') => {
  const x = new Expedition({ dungeonId: 'bosque', seed: 11, members: [{ id: 'a', name: 'A', profile: freshSave(sp) }], random: seeded(4) });
  x.loadStep(x.seq.length - 1); x.drainEvents();
  const p = x.members.get('a').player; p.maxHp = p.hp = 99999;
  return { x, p, b: x.boss };
};

test('sin desventaja de tipo contra guardianes (las ventajas se mantienen)', () => {
  const { x, p, b } = bossFloor('voltrino');
  assert.ok(E.typeEff('electrico', b.type) < 1, `la prueba necesita un tipo poco eficaz (${b.type})`);
  const twin = new E.Enemy(Object.assign({}, b.kind, { isBoss: false }), b.x, b.y, { level: b.level }); twin.maxHp = twin.hp = b.maxHp; twin.stats = b.stats; twin.type = b.type;
  const hit = t => { const h = t.hp; t.iframes = 0; x.E.Combat.hit(x.g, t, { team: 'player', dmg: 20, src: p, type: 'electrico', cat: 'esp' }); return h - t.hp; };
  const vsBoss = hit(b), vsNormal = hit(twin);
  assert.ok(Math.abs(vsBoss - vsNormal / E.typeEff('electrico', b.type)) <= 1, `al guardián: ${vsBoss}; a un enemigo igual pero normal: ${vsNormal}`);
});

test('furia al 30 %: una sola vez, pausa la simulación para todos y la reanuda; +20 % daño y recargas más cortas', () => {
  const { x, p, b } = bossFloor();
  const dmg0 = b.dmgMul; b.aggro = true;
  b.hp = Math.floor(b.maxHp * .31); for (let i = 0; i < 30; i++) x.step(STEP);
  assert.equal(b.enraged, undefined, 'al 31 % aún no');
  b.hp = Math.floor(b.maxHp * .29); x.step(STEP);
  assert.equal(b.enraged, true); assert.ok(Math.abs(b.dmgMul - dmg0 * 1.2) < 1e-9);
  const ev = x.drainEvents().filter(e => e.type === 'bossRage'); assert.equal(ev.length, 1); assert.equal(ev[0].id, b.netId);
  assert.equal(x.view().boss.rage, true, 'se sincroniza (quien se reconecta lo ve)');
  // Pausa: nadie se mueve ni el guardián actúa; el tiempo del piso no avanza
  const pos = [p.x, p.y, b.x, b.y, b.state, x.floor.time];
  x.applyInput('a', parseInput({ s: x.members.get('a').nextSeq, m: Array(16).fill([1, 0]), a: [] }));
  for (let i = 0; i < Math.round(1.5 / STEP); i++) x.step(STEP);
  assert.deepEqual([p.x, p.y, b.x, b.y, b.state, x.floor.time], pos, 'todo quieto durante la animación');
  for (let i = 0; i < Math.round(1 / STEP); i++) x.step(STEP);
  assert.ok(x.floor.time > pos[5], 'tras la animación sigue la partida');
  for (let i = 0; i < Math.round(6 / STEP); i++) x.step(STEP);
  assert.equal(x.drainEvents().filter(e => e.type === 'bossRage').length, 0, 'no se repite');
  // Recarga de patrones un 20 % más corta (fase 2: 1,3-1,9 s → ×0,8)
  b.state = 'windup'; b.timer = 0; b.pattern = b.kind.patterns[0]; b.atk = { x: 1, y: 0 }; b.target = { x: b.x + 50, y: b.y };
  b.kind.brain(b, STEP, x.g, 80);
  assert.ok(b.cd <= 1.9 * .8 + 1e-9, `recarga ${b.cd.toFixed(2)} ≤ 1,52`);
});

test('en cooperativo el ajuste de PS al salir alguien no quita la furia', () => {
  const x = new Expedition({ dungeonId: 'bosque', seed: 11, members: [{ id: 'a', name: 'A', profile: freshSave() }, { id: 'b', name: 'B', profile: freshSave('magmolo') }], random: seeded(4) });
  x.loadStep(x.seq.length - 1);
  const b = x.boss; b.aggro = true; b.hp = Math.floor(b.maxHp * .2); x.step(STEP);
  const enraged = b.dmgMul; x.removeMember('b');
  assert.ok(Math.abs(b.dmgMul - b.netBaseDmg * 1.2) < 1e-9 && b.dmgMul < enraged, 'sigue con +20 % sobre el daño del grupo nuevo');
});
