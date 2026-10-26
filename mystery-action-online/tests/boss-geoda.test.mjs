/**
 * Reina Geoda (Gruta de Cuarzo): grito y furia al 60 % con la Carga nueva; al 30 % segundo grito y
 * rocas; rebotes contra las rocas; aturdida al tercer choque (sin furia y −30 % de defensa); si no
 * muere a tiempo, salta y derriba de un golpe. Todo en la simulación del servidor.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { Expedition } from '../server/src/sim/Expedition.js';
import { E, freshSave, seeded, STEP } from './helpers.mjs';

const TS = 32;
const lair = (n = 1) => {
  const members = ['a', 'b'].slice(0, n).map((id, i) => ({ id, name: id.toUpperCase(), profile: freshSave(['voltrino', 'aurin'][i]) }));
  const x = new Expedition({ dungeonId: 'gruta', seed: 11, members, random: seeded(4) });
  x.loadStep(x.seq.length - 1); x.drainEvents();
  for (const m of x.members.values()) { m.player.maxHp = m.player.hp = 99999; }
  return { x, p: x.members.get('a').player, b: x.boss };
};
const run = (x, s) => { for (let i = 0; i < Math.round(s / STEP); i++) x.step(STEP); };
const evs = (x, type) => x.drainEvents().filter(e => e.type === type);
/** Ordena una Carga ya apuntada hacia (dx, dy). */
const dash = (b, dx, dy) => { const l = Math.hypot(dx, dy); b.state = 'windup'; b.pattern = 'dash'; b.timer = 0; b.windupTime = .55; b.atk = { x: dx / l, y: dy / l }; b.cd = 99; };

test('la Reina Geoda: mazmorra 2 con guardián de nivel moderado y sin la carga al principio', () => {
  const { b } = lair();
  assert.equal(b.kind.script, 'geoda');
  assert.ok(!b.kind.patterns.includes('dash') && !b.kind.patterns.includes('charge'), 'la Carga es nueva al 60 %');
  assert.ok(b.level <= 9, `nivel ${b.level}`);
  for (let k = 0; k < 40; k++) assert.notEqual(E.Geoda.pickPattern(b), 'dash');
});

test('60 %: grito (pausa para todos), furia +20 % daño y recargas, y la Carga entra en sus patrones', () => {
  const { x, b } = lair();
  const dmg0 = b.dmgMul; b.aggro = true;
  b.hp = Math.floor(b.maxHp * .61); run(x, .2);
  assert.ok(!b.geodaStage);
  b.hp = Math.floor(b.maxHp * .59); x.step(STEP);
  assert.equal(b.geodaStage, 1); assert.equal(b.enraged, true); assert.ok(Math.abs(b.dmgMul - dmg0 * 1.2) < 1e-9);
  const r = evs(x, 'bossRage'); assert.equal(r.length, 1); assert.equal(r[0].stage, 1);
  assert.equal(x.pauseT > 2, true, 'pausa del grito');
  const v = x.view().boss; assert.equal(v.stage, 1); assert.equal(v.rage, true);
  const seen = new Set(); for (let k = 0; k < 60; k++) { b.lastPattern = null; seen.add(E.Geoda.pickPattern(b)); }
  assert.ok(seen.has('dash'));
  // La recarga tras la Carga también es un 20 % más corta
  dash(b, 1, 0); b.kind.brain(b, STEP, x.g, 100); assert.equal(b.state, 'dashing'); assert.ok(b.cd <= 1.6 * .8 + 1e-9);
});

test('30 %: segundo grito y caen rocas sólidas de 2×2 lejos de los jugadores; se sincronizan', () => {
  const { x, p, b } = lair();
  b.aggro = true; b.hp = Math.floor(b.maxHp * .59); x.step(STEP); run(x, 3);
  x.drainEvents(); b.hp = Math.floor(b.maxHp * .29); x.step(STEP);
  assert.equal(b.geodaStage, 2); assert.equal(evs(x, 'bossRage')[0].stage, 2);
  const rocks = x.g.boulders; assert.ok(rocks.length >= 3, `rocas: ${rocks.length}`);
  for (const r of rocks) assert.ok(r.fall > 0 && !r.solid, 'primero caen (con aviso)');
  assert.match(x.view().boss.rocks, /^\d+:\d+:\d+:2:[\d.]+(,\d+:\d+:\d+:2:[\d.]+)+$/);
  run(x, 3 + 2.5);
  for (const r of x.g.boulders) {
    assert.ok(r.solid);
    for (const [i, j] of [[0, 0], [1, 0], [0, 1], [1, 1]]) assert.ok(x.world.isSolid(r.tx + i, r.ty + j), 'bloquea el paso');
    assert.ok(!x.world.los(r.cx - 50, r.cy, r.cx + 50, r.cy), 'y tapa los disparos');
  }
  assert.ok(p.free(x.world, p.x, p.y), 'nadie queda atrapado');
});

test('rebote: la Carga choca con una roca (la agrieta y la rompe al 2.º choque); al 3.º, aturdida −30 % defensa y sin furia', () => {
  const { x, p, b } = lair();
  b.aggro = true; b.hp = Math.floor(b.maxHp * .59); x.step(STEP); run(x, 3);
  b.hp = Math.floor(b.maxHp * .29); x.step(STEP); run(x, 6);
  x.drainEvents();
  const hitRock = () => {
    const r = x.g.boulders.find(o => o.solid);
    // El guardián, a 3 casillas a la izquierda de la roca; el jugador, detrás (a la derecha)
    b.x = b.px = r.tx * TS - 70; b.y = b.py = r.cy; p.x = r.tx * TS + 64 + 40; p.y = r.cy;
    E.Geoda.unstick(b, x.g);
    x.g.zones.length = 0; x.g.projectiles.length = 0; p.hp = p.maxHp;   // solo cuenta la carga
    dash(b, 1, 0);
    for (let i = 0; i < 200 && b.state !== 'bounce'; i++) x.step(STEP);
    return r;
  };
  const r1 = hitRock();
  assert.equal(b.state, 'bounce'); assert.equal(b.rockHits, 1); assert.equal(r1.hp, 1, 'agrietada');
  assert.equal(p.hp, p.maxHp, 'el jugador detrás de la roca no recibe la carga');
  run(x, .6);
  const r2 = hitRock(); assert.equal(b.rockHits, 2);
  if (r2 === r1) assert.ok(!x.g.boulders.includes(r1) && !x.world.isSolid(r1.tx, r1.ty), 'segundo choque: la roca se rompe');
  run(x, .6);
  const before = b.dmgMul;
  hitRock(); assert.equal(b.rockHits, 3);
  run(x, .5);
  assert.equal(b.state, 'dazed'); assert.equal(b.enraged, false); assert.ok(Math.abs(b.dmgMul - before / 1.2) < 1e-9, 'pierde la furia');
  const ev = x.drainEvents().filter(e => e.type === 'bossEvent').map(e => e.what);
  assert.deepEqual(ev, ['bounce', 'bounce', 'bounce', 'daze']);
  // −30 % de defensa: recibe 1/0,7 del daño
  const hit = () => { const h = b.hp; b.iframes = 0; x.E.Combat.hit(x.g, b, { team: 'player', dmg: 20, src: p, type: 'normal', cat: 'fis' }); return h - b.hp; };
  const dz = hit(); b.vuln = 1; const normal = hit(); b.vuln = 1 / .7;
  assert.ok(Math.abs(dz / normal - 1 / .7) < .08, `aturdida ${dz} vs normal ${normal}`);
  // No ataca mientras está aturdida
  const cd = b.cd; run(x, 3); assert.equal(b.state, 'dazed'); void cd;
});

test('si sigue viva al acabar el aturdimiento salta y derriba de un golpe (aunque esté esquivando); luego vuelve la furia y más rocas', () => {
  const { x, p, b } = lair(2);
  const q = x.members.get('b').player;
  b.aggro = true; b.hp = Math.floor(b.maxHp * .59); x.step(STEP); run(x, 3);
  b.hp = Math.floor(b.maxHp * .29); x.step(STEP); run(x, 6);
  b.target = p; E.Geoda.daze(b, x.g); b.timer = .05;
  q.x = p.x + 400; q.y = p.y; E.Geoda.unstick(q, x.g);
  x.drainEvents();
  for (let i = 0; i < 40 && b.state !== 'leap'; i++) x.step(STEP);
  assert.equal(b.state, 'leap');
  let downed = false;
  for (let i = 0; i < Math.round(2 / STEP) && !downed; i++) { p.iframes = 1; x.step(STEP); downed = x.members.get('a').downed; }
  assert.ok(downed, 'el objetivo cae de un golpe');
  assert.equal(x.members.get('b').downed, false, 'el compañero lejos de la sombra no');
  assert.ok(Math.hypot(b.x - p.x, b.y - p.y) < 70, 'aterriza sobre él');
  assert.equal(b.enraged, true, 'vuelve a enfurecerse'); assert.equal(b.rockHits, 0);
  assert.ok(x.g.boulders.filter(r => r.hp > 0).length >= E.GEODA.minRocks, 'vuelve a haber rocas');
  const ev = x.drainEvents().filter(e => e.type === 'bossEvent').map(e => e.what);
  assert.ok(ev.includes('leap') && ev.includes('land'));
});

test('los demás guardianes conservan la furia del 30 % (sin rocas)', () => {
  const x = new Expedition({ dungeonId: 'bosque', seed: 11, members: [{ id: 'a', name: 'A', profile: freshSave() }], random: seeded(4) });
  x.loadStep(x.seq.length - 1); x.drainEvents(); const b = x.boss; b.aggro = true;
  b.hp = Math.floor(b.maxHp * .59); x.step(STEP); assert.ok(!b.enraged);
  b.hp = Math.floor(b.maxHp * .29); x.step(STEP); assert.equal(b.enraged, true);
  assert.equal(evs(x, 'bossRage')[0].stage, 0); assert.ok(!(x.g.boulders || []).length);
});
