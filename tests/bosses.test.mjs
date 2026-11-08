/** Jefes con mecánicas propias (BossKit) y Gromgar, el jefe de referencia, en la simulación real del servidor:
 *  fases una sola vez, colisiones y aturdimientos, ventanas de vulnerabilidad con motivo, nada ataca tras morir,
 *  recompensas una vez, sin atascos, avisos suficientes, resistencias, escalado y estado para la red. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { Expedition } from '../server/src/sim/Expedition.js';
import { viewToState } from '../server/src/rooms/plainState.js';
import { E, freshSave, seeded, STEP } from './helpers.mjs';

const party = n => ['guerrero', 'mago', 'arquero', 'asesino'].slice(0, n).map((sp, i) => ({ id: 'p' + i, name: 'J' + i, profile: freshSave(sp) }));
/** Guarida de Gromgar (Mina Olvidada) con `n` jugadores muy resistentes. */
function lair(n = 1, seed = 5) {
  const x = new Expedition({ dungeonId: 'mina', seed, members: party(n), random: seeded(3) });
  x.loadStep(x.seq.length - 1);
  for (const m of x.members.values()) m.player.maxHp = m.player.hp = 1e6;
  x.boss.aggro = true; x.drainEvents();
  return x;
}
const run = (x, s, each) => { for (let i = 0; i < Math.round(s / STEP); i++) { if (each) each(i * STEP); x.step(STEP); if (x.pauseT > 0) x.pauseT = 0; } };
const S = b => E.BossKit.st(b);
const hero = (x, i = 0) => [...x.members.values()][i].player;
/** Lleva a Gromgar a la furia y espera a que caigan las rocas. */
function toRage(x) { const b = x.boss; b.hp = Math.floor(b.maxHp * .59); run(x, .1); assert.equal(S(b).phase, 1); run(x, 4); S(b).hits = 0; return (x.g.boulders || []).filter(r => r.solid); }   // (choques de la espera, a cero)
/** Gromgar justo delante de una roca, el héroe detrás, y la carga lista para salir (ya apuntada). */
function chargeAtRock(x, name = 0) {
  const b = x.boss, p = hero(x, name);
  for (const rk of x.g.boulders.filter(o => o.solid)) for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) for (const [bd, pd] of [[120, 96], [104, 84], [140, 110], [96, 80]]) {
    const bx = rk.cx - dx * bd, by = rk.cy - dy * bd, px = rk.cx + dx * pd, py = rk.cy + dy * pd;
    if (b.free(x.world, bx, by) && p.free(x.world, px, py)) {
      b.x = b.px = bx; b.y = b.py = by; p.placeAt(px, py);
      for (const m of x.members.values()) if (m.player !== p) { m.player.placeAt(bx - dx * 40, by - dy * 40); E.BossArena.unstick(m.player, x.g); }   // los demás, pegados a él (provoca el que está lejos)
      E.BossKit.begin(b, x.g, E.BossKit.DEFS.gromgar.moves.carga, S(b), E.BossKit.DEFS.gromgar, p);
      return rk;
    }
  }
  throw new Error('ninguna roca con sitio a los dos lados');
}

test('Gromgar es el guardián de la Mina Olvidada y usa la base común (BossKit), con resistencias coherentes', () => {
  assert.equal(E.dungeonById('mina').boss, 'gromgar');
  const k = E.makeBossKind('gromgar');
  assert.equal(k.bk, 'gromgar'); assert.equal(k.isBoss, true);
  const x = lair(), b = x.boss, p = hero(x);
  assert.equal(b.kind.name, 'Gromgar');
  // Roca: resiste lo físico y le duele lo mágico
  assert.equal(b.damageTakenMul({ cat: 'fis' }), .85); assert.equal(b.damageTakenMul({ cat: 'esp' }), 1.15);
  const hp0 = b.hp; E.Combat.hit(x.g, b, { team: 'player', fixed: 100, cat: 'fis', src: p, noCrit: true }); const fis = hp0 - b.hp;
  const hp1 = b.hp; E.Combat.hit(x.g, b, { team: 'player', fixed: 100, cat: 'esp', src: p, noCrit: true }); const mag = hp1 - b.hp;
  assert.equal(fis, 85); assert.equal(mag, 115);
});

test('avisos: todo ataque avisa al menos 0,6 s y la carga fija su dirección con tiempo para apartarse', () => {
  const D = E.BossKit.DEFS.gromgar;
  for (const [i, ph] of D.phases.entries()) for (const id of ph.moves) {
    const M = D.moves[id];
    for (const chain of [0, 1]) {
      const tele = Math.max(E.BOSS_MIN_TELE, (typeof M.tele === 'function' ? M.tele(null, null, { phase: i, chain }) : M.tele) * (ph.teleMul || 1));
      assert.ok(tele >= .6, `${id} fase ${i}: ${tele}`);
      if (id === 'carga') assert.ok(tele * M.lock >= .26, `la carga se fija con ${tele * M.lock} s de margen`);
    }
  }
});

test('fases: cada una se activa una sola vez, en orden, aunque un golpe se salte dos umbrales', () => {
  const x = lair(), b = x.boss, rage = [];
  x.g.onBossRage = (e, st) => rage.push(st);
  run(x, .5); assert.equal(S(b).phase, 0);
  b.hp = Math.floor(b.maxHp * .9); run(x, .5); assert.equal(S(b).phase, 0, 'sin cruzar el 60 %');
  b.hp = Math.floor(b.maxHp * .2);           // un golpe enorme: del 90 % al 20 %
  run(x, 6);
  assert.deepEqual(rage, [1, 2], 'furia y fase final, una vez cada una y en orden');
  assert.deepEqual(S(b).done, [0, 1, 2]);
  b.hp = Math.floor(b.maxHp * .1); run(x, 2); b.hp = Math.floor(b.maxHp * .05); run(x, 2);
  assert.deepEqual(rage, [1, 2], 'no se repiten');
  // eventos: una fase por evento tampoco se repite
  const D = E.BossKit.DEFS.gromgar; D.phases.push({ id: 'prueba', event: 'test', moves: ['golpe'] });
  try { assert.equal(E.BossKit.event(b, x.g, 'test'), true); assert.equal(E.BossKit.event(b, x.g, 'test'), false); }
  finally { D.phases.pop(); }
});

test('furia (60 %): derrumbe con rocas sólidas de verdad, más rocas con más jugadores', () => {
  for (const n of [1, 2, 4]) {
    const x = lair(n), rocks = toRage(x);
    assert.equal(rocks.length, E.GROMGAR.rocks[n - 1], `${n} jugadores`);
    for (const r of rocks) { assert.ok(x.world.isSolid(r.tx, r.ty) && x.world.isSolid(r.tx + 1, r.ty + 1)); assert.ok(r.hp >= 1 && r.hp <= E.GROMGAR.rockHp); }
    for (const a of x.g.actors) if (a.alive) assert.ok(a.free(x.world, a.x, a.y), 'nadie queda dentro de una roca');
  }
});

test('carga contra una roca: aturdido y roca agrietada; al tercer choque, derribado con la defensa −40 % y el motivo', () => {
  const x = lair(), b = x.boss, p = hero(x); toRage(x);
  const notes = []; const ob = x.g.onBossEvent; x.g.onBossEvent = (e, what, info) => { notes.push([what, info]); ob(e, what, info); };
  for (let k = 1; k <= 3; k++) {
    const rk = chargeAtRock(x), hp0 = rk.hp, php = p.hp;
    run(x, 1.6);
    assert.equal(S(b).hits >= k || S(b).stage === 'vuln', true, `choque ${k}: ${S(b).hits}`);
    assert.equal(rk.hp, hp0 - 1, 'la roca se agrieta');
    assert.ok(p.hp >= php, 'el héroe, detrás de la roca, no recibe la carga');
    assert.ok(b.free(x.world, b.x, b.y), 'el jefe no queda dentro de la roca');
    if (k < 3) { assert.equal(S(b).stage, 'stun'); assert.equal(b.state, 'dazed'); run(x, E.GROMGAR.stun + 1.2); if (rk.hp <= 0) assert.ok(!x.g.boulders.includes(rk)); }
  }
  assert.equal(S(b).stage, 'vuln'); assert.equal(b.state, 'dazed');
  assert.ok(Math.abs(b.damageTakenMul({ cat: 'fis' }) - .85 / .6) < 1e-9, 'defensa −40 % (× la resistencia física)');
  const why = notes.find(([w]) => w === 'vuln')[1].why; assert.match(why, /3 choques contra las rocas/);
  assert.match(E.BossKit.hudTag(b), /DERRIBADO.*Defensa −40 %.*choques contra las rocas/);
  // al terminar: se levanta, el contador vuelve a cero y no se queda sin rocas
  run(x, E.GROMGAR.down + 1);
  assert.notEqual(S(b).stage, 'vuln'); assert.equal(S(b).hits, 0); assert.equal(b.damageTakenMul({ cat: 'esp' }), 1.15);
  assert.ok(E.BossArena.solidRocks(x.g).length >= E.GROMGAR.rocks[0] - 1);
});

test('contra la pared solo se detiene: no cuenta, no se queda pegado y avisa una vez', () => {
  const x = lair(), b = x.boss, p = hero(x); toRage(x);
  for (const r of x.g.boulders.slice()) E.BossArena.shatter(x.g, r);     // sin rocas: todo choque es contra la pared
  S(b).said = {}; x.drainEvents();
  const evs = [];
  for (let k = 0; k < 6; k++) {
    // carga hacia una pared: el héroe pegado a la pared opuesta
    const room = x.L.rooms[0];
    b.x = b.px = (room.x + 7) * 32; b.y = b.py = (room.y + room.h / 2) * 32;
    p.placeAt((room.x + 1) * 32, b.y);
    E.BossKit.begin(b, x.g, E.BossKit.DEFS.gromgar.moves.carga, S(b), E.BossKit.DEFS.gromgar, p);
    run(x, 2.2);
    evs.push(...x.drainEvents().filter(e => e.type === 'bossEvent').map(e => e.what));
    assert.ok(b.free(x.world, b.x, b.y), 'libre tras chocar');
    assert.equal(S(b).hits, 0, 'la pared no cuenta');
    assert.notEqual(S(b).stage, 'stun');
  }
  assert.equal(evs.filter(w => w === 'wall').length, 1, 'el aviso de «busca una roca» sale una vez');
});

test('fase final (25 %): rompe la mitad de las coberturas, añade la avalancha y bastan 2 choques', () => {
  const x = lair(), b = x.boss; const before = toRage(x).length;
  b.hp = Math.floor(b.maxHp * .24); run(x, 3);
  assert.equal(S(b).phase, 2);
  const now = x.g.boulders.filter(r => r.solid).length;
  assert.ok(now < before && now >= E.GROMGAR.minRocks, `${before} → ${now}`);
  assert.equal(E.BossKit.DEFS.gromgar.need(b, S(b)), 2);
  assert.ok(E.BossKit.DEFS.gromgar.phases[2].moves.includes('avalancha'));
  for (let k = 0; k < 2; k++) { chargeAtRock(x); run(x, 1.6); if (k === 0) run(x, E.GROMGAR.stun + 1.2); }
  assert.equal(S(b).stage, 'vuln');
});

test('al morir no sigue atacando: se cancelan su carga, sus piedras pendientes y las rocas que caen', () => {
  const x = lair(), b = x.boss, p = hero(x); toRage(x);
  const D = E.BossKit.DEFS.gromgar;
  E.BossKit.begin(b, x.g, D.moves.avalancha, S(b), D, p); run(x, 1.05);          // piedras ya avisadas en el suelo
  E.BossArena.dropRocks(b, x.g, 1, { hp: 3, fall: 2 });                          // y una roca cayendo
  assert.ok(x.g.zones.some(z => z.owner === b)); assert.ok(x.g.boulders.some(r => r.fall > 0));
  E.Combat.hit(x.g, b, { team: 'player', fixed: 1e7, src: p });
  assert.equal(b.alive, false); assert.equal(S(b).stage, 'dead');
  p.hp = p.maxHp; const php = p.hp;            // (la experiencia del jefe puede subirle de nivel)
  assert.ok(!x.g.zones.some(z => z.owner === b) && !x.g.boulders.some(r => r.fall > 0));
  x.drainEvents(); run(x, 4);
  assert.equal(p.hp, php, 'nadie recibe daño después');
  assert.ok(!x.drainEvents().some(e => e.type === 'eatk' || e.type === 'bossEvent'), 'sin ataques ni avisos');
  assert.equal(x.view().boss.alive, false);
});

test('recompensas: trofeo único la primera vez y una sola vez por jugador; después solo cuenta la victoria', () => {
  const x = lair(2), b = x.boss;
  E.Combat.hit(x.g, b, { team: 'player', fixed: 1e7, src: hero(x) }); run(x, .2);
  x.finish('clear'); x.finish('clear');
  for (const [id, r] of x.ended.results) {
    const prof = r.profile, n = prof.inv.filter(s => s.id === 'colmilloGromgar').reduce((t, s) => t + s.qty, 0);
    assert.equal(n, 1, id); assert.equal(prof.bosses.gromgar.kills, 1); assert.equal(prof.bosses.gromgar.trophy, true);
    assert.ok(r.lines.some(l => /Trofeo único/.test(l)));
    // segunda expedición con ese perfil: no hay segundo trofeo
    const y = new Expedition({ dungeonId: 'mina', seed: 9, members: [{ id: 'z', name: 'Z', profile: prof }], random: seeded(2) });
    y.loadStep(y.seq.length - 1); E.Combat.hit(y.g, y.boss, { team: 'player', fixed: 1e7, src: [...y.members.values()][0].player }); y.finish('clear');
    const p2 = y.ended.results.get('z').profile;
    assert.equal(p2.bosses.gromgar.kills, 2);
    assert.equal(p2.inv.filter(s => s.id === 'colmilloGromgar').reduce((t, s) => t + s.qty, 0), 1);
  }
  // el trofeo no sale en cofres ni se puede falsificar el progreso
  for (let i = 0; i < 300; i++) assert.ok(!E.Loot.roll('cofreJefe', E.dungeonById('mina'), seeded(i)).items.some(it => it.id === 'colmilloGromgar'));
  assert.deepEqual(E.BossKit.sanitize({ gromgar: { kills: -4, trophy: 'x' }, inventado: { kills: 9 } }), { gromgar: { kills: 0, trophy: true } });
});

test('no se queda bloqueado: 3 minutos de combate con héroes moviéndose al azar, siempre libre y siempre actuando', () => {
  for (const n of [1, 3]) {
    const x = lair(n, 11), b = x.boss, rnd = seeded(77 + n), hs = [...x.members.values()].map(m => m.player);
    let still = 0, lastStage = '', stageT = 0;
    b.hp = Math.floor(b.maxHp * .55); b.maxHp = b.hp * 4;   // furia sin acercarse a la muerte
    run(x, 180, () => {
      for (const p of hs) { const a = rnd() * Math.PI * 2; p.moveBy(x.world, Math.cos(a) * 3, Math.sin(a) * 3); if (rnd() < .002) { const r = x.L.rooms[0]; p.placeAt((r.x + 1 + rnd() * (r.w - 2)) * 32, (r.y + 1 + rnd() * (r.h - 2)) * 32); E.BossArena.unstick(p, x.g); } }
      assert.ok(b.free(x.world, b.x, b.y), 'nunca dentro de un muro o roca');
      const st = S(b).stage; if (st === lastStage) stageT += STEP; else { stageT = 0; lastStage = st; }
      assert.ok(stageT < 12, `estado ${st} demasiado tiempo`);
      if (st === 'idle' && Math.hypot(b.vx, b.vy) < 1) still += STEP;
    });
    const evs = x.drainEvents();
    assert.ok(evs.filter(e => e.type === 'eatk').length > 30, 'sigue atacando');
    assert.ok(still < 60, `parado sin hacer nada ${still.toFixed(1)} s`);
  }
});

test('en solitario se puede derribar: un héroe que se esconde tras una roca provoca las cargas y lo tumba', () => {
  for (const seed of [5, 7, 13]) {
    const x = lair(1, seed), b = x.boss, p = hero(x); toRage(x);
    let downAt = -1;
    run(x, 90, t => {
      if (downAt < 0 && S(b).stage === 'vuln') downAt = t;
      const rocks = x.g.boulders.filter(r => r.solid); if (!rocks.length || S(b).stage !== 'idle' && S(b).stage !== 'rec' && S(b).stage !== 'tele') return;
      const r = rocks.sort((a, c) => Math.hypot(a.cx - b.x, a.cy - b.y) - Math.hypot(c.cx - b.x, c.cy - b.y))[0];
      const dx = r.cx - b.x, dy = r.cy - b.y, l = Math.hypot(dx, dy) || 1, gx = r.cx + dx / l * 84, gy = r.cy + dy / l * 84;
      const ex = gx - p.x, ey = gy - p.y, d = Math.hypot(ex, ey); if (d > 3) { const v = Math.min(d, p.moveSpeed() * STEP); p.moveBy(x.world, ex / d * v, ey / d * v); }
    });
    assert.ok(downAt > 0 && downAt < 60, `semilla ${seed}: derribado a los ${downAt.toFixed(1)} s`);
  }
});

test('en grupo: embiste al que está más lejos (uno provoca, los demás golpean) y a veces encadena otra carga', () => {
  const x = lair(3), b = x.boss; toRage(x);
  const hs = [...x.members.values()].map(m => m.player), r = x.L.rooms[0];
  hs[0].placeAt(b.x + 60, b.y); E.BossArena.unstick(hs[0], x.g); hs[1].placeAt(b.x - 60, b.y); E.BossArena.unstick(hs[1], x.g);
  hs[2].placeAt((r.x + 1.5) * 32, (r.y + 1.5) * 32); E.BossArena.unstick(hs[2], x.g);
  const far = hs.slice().sort((a, c) => Math.hypot(c.x - b.x, c.y - b.y) - Math.hypot(a.x - b.x, a.y - b.y))[0];
  assert.equal(E.BossKit.DEFS.gromgar.chargeTarget(b, x.g), far);
  // solo hay segundas cargas en grupo
  let chains = 0; const rnd = seeded(5);
  for (let k = 0; k < 40; k++) { for (const o of x.g.boulders.slice()) E.BossArena.shatter(x.g, o); const S0 = S(b); S0.chain = 0; S0.stage = 'act'; S0.mv = E.BossKit.DEFS.gromgar.moves.carga; b.atk = { x: 1, y: 0 }; b.target = hs[0]; E.BossKit.DEFS.gromgar.impact(b, x.g, S0); if (S0.chain) chains++; }
  assert.ok(chains > 5, `segundas cargas: ${chains}`);
  const solo = lair(1); toRage(solo); let c1 = 0;
  for (let k = 0; k < 40; k++) { for (const o of solo.g.boulders.slice()) E.BossArena.shatter(solo.g, o); const S1 = S(solo.boss); S1.chain = 0; S1.stage = 'act'; S1.mv = E.BossKit.DEFS.gromgar.moves.carga; solo.boss.atk = { x: 1, y: 0 }; E.BossKit.DEFS.gromgar.impact(solo.boss, solo.g, S1); if (S1.chain) c1++; }
  assert.equal(c1, 0, 'en solitario no hay tareas simultáneas: nunca encadena');
  void rnd;
});

test('escalado moderado: con 4 jugadores, 2,6 veces la vida (antes 3,5) y +15 % de daño', () => {
  const v = [1, 2, 3, 4].map(n => { const x = lair(n); return { hp: x.boss.maxHp, dmg: x.boss.dmgMul }; });
  assert.ok(Math.abs(v[3].hp / v[0].hp - 2.6) < .02, JSON.stringify(v));
  assert.ok(Math.abs(v[3].dmg / v[0].dmg - 1.15) < .01);
  // al entrar en furia el daño sube y se mantiene aunque cambie el grupo
  const x = lair(2), b = x.boss, d0 = b.dmgMul; toRage(x); const d1 = b.dmgMul; x.setScaling(3);
  assert.ok(d1 > d0 && Math.abs(b.dmgMul / d1 - 1.1 / 1.05) < 1e-9);
});

test('red: el estado del jefe viaja en la sala y el cliente entiende fase, choques y motivo', () => {
  const x = lair(2), b = x.boss; toRage(x);
  chargeAtRock(x); for (let i = 0; i < 400 && S(b).stage !== 'stun'; i++) run(x, STEP);
  const st = viewToState(x.view());
  assert.equal(st.boss.stage, 1); assert.equal(st.boss.hits, 1);
  const [ph, stage, , hits, need] = st.boss.bk.split('|');
  assert.deepEqual([+ph, stage, +hits, +need], [1, 'stun', 1, 3]);
  // un cliente (otro motor) aplica la cadena y muestra lo mismo
  const C = E.makeBossKind('gromgar'), ghost = { kind: C, netId: 'e1' };
  E.BossKit.apply(ghost, st.boss.bk);
  assert.match(E.BossKit.hudTag(ghost), /aturdido · se ha estrellado contra una roca/);
  // las rocas también viajan (mismas casillas en el cliente)
  assert.equal(st.boss.rocks.split(',').length, x.g.boulders.length);
});

// ---------------------------------------------------------------------------------------------------
// Robletón, el Guardián de Espinas (Bosque): el mismo BossKit con otro escenario
function grove(n = 1, seed = 5) {
  const x = new Expedition({ dungeonId: 'bosque', seed, members: party(n), random: seeded(3) });
  x.loadStep(x.seq.length - 1);
  for (const m of x.members.values()) m.player.maxHp = m.player.hp = 1e6;
  x.boss.aggro = true; run(x, .3); x.drainEvents();
  return x;
}
const plants = x => x.g.actors.filter(a => a.alive && a.kind && a.kind.id === 'broteSavia');
const stumps = x => (x.g.boulders || []).filter(r => r.solid);

test('todos los jefes de BossKit: avisos ≥ 0,6 s en todas sus fases, fases en orden y trofeo único que no sale en cofres', () => {
  for (const [id, D] of Object.entries(E.BossKit.DEFS)) {
    const ats = D.phases.filter(p => p.at != null).map(p => p.at);
    assert.deepEqual(ats, ats.slice().sort((a, b) => b - a), id);
    for (const [i, ph] of D.phases.entries()) for (const mid of ph.moves) {
      const M = D.moves[mid]; assert.ok(M, `${id}.${mid}`);
      const tele = Math.max(E.BOSS_MIN_TELE, (typeof M.tele === 'function' ? M.tele(null, null, { phase: i, chain: 1 }) : M.tele) * (ph.teleMul || 1));
      assert.ok(tele >= .6, `${id}.${mid}`);
    }
    assert.ok(E.ITEMS[D.reward.item] && E.ITEMS[D.reward.item].unique, id);
  }
  assert.equal(E.dungeonById('bosque').boss, 'robleton'); assert.equal(E.makeBossKind('robleton').bk, 'espinas');
});

test('Guardián de Espinas: tocones con colisión desde el principio (más con más jugadores)', () => {
  for (const n of [1, 3]) {
    const x = grove(n), s = stumps(x);
    assert.equal(s.length, [4, 4, 5, 5][n - 1]);
    for (const r of s) assert.ok(x.world.isSolid(r.tx, r.ty) && x.world.isSolid(r.tx + 1, r.ty + 1));
    for (const a of x.g.actors) if (a.alive) assert.ok(a.free(x.world, a.x, a.y));
  }
});

test('Guardián de Espinas: si su salto cae junto a un tocón, lo astilla y queda enredado (vulnerable, con motivo); lejos, no', () => {
  const x = grove(), b = x.boss, p = hero(x), D = E.BossKit.DEFS.espinas;
  // lejos de los tocones
  const r = x.L.rooms[0]; let spot = null;
  for (let ty = r.y + 1; ty < r.y + r.h - 1 && !spot; ty++) for (let tx = r.x + 1; tx < r.x + r.w - 1 && !spot; tx++) { const px = (tx + .5) * 32, py = (ty + .5) * 32; if (p.free(x.world, px, py) && !stumps(x).some(s => s.touches(px, py, 90)) && Math.hypot(px - b.x, py - b.y) > 150) spot = { x: px, y: py }; }
  p.placeAt(spot.x, spot.y); E.BossKit.begin(b, x.g, D.moves.salto, S(b), D, p); run(x, 2.2);
  assert.notEqual(S(b).stage, 'vuln', 'lejos de un tocón no se enreda');
  assert.ok(b.free(x.world, b.x, b.y));
  // junto a un tocón: el héroe se aparta a tiempo (el salto cae donde estaba al fijarse)
  const st = stumps(x)[0], hp0 = st.hp; p.placeAt(st.cx + 52, st.cy); E.BossArena.unstick(p, x.g);
  E.BossKit.begin(b, x.g, D.moves.salto, S(b), D, p);
  run(x, 1.0); p.placeAt(p.x + 120, p.y + 40); E.BossArena.unstick(p, x.g); run(x, 1.0);
  assert.equal(S(b).stage, 'vuln'); assert.match(S(b).why, /tocón/);
  assert.ok(st.hp < hp0 || !x.g.boulders.includes(st));
  assert.ok(b.free(x.world, b.x, b.y), 'nunca dentro del tocón');
  assert.ok(Math.abs(b.damageTakenMul({ cat: 'fis' }) - .9 / .65) < 1e-9);
  assert.match(E.BossKit.hudTag(b, x.g), /DERRIBADO.*−35 %.*tocón/);
});

test('Guardián de Espinas: brotes de savia al 65 % (le curan y le protegen); sin ellos queda aturdido; mueren con él', () => {
  const x = grove(2), b = x.boss;
  b.hp = Math.floor(b.maxHp * .64); run(x, .2); assert.equal(S(b).phase, 1); run(x, 2);
  const ps = plants(x); assert.equal(ps.length, 2);
  for (const pl of ps) assert.equal(pl.summoner, b);
  const v = x.view(); assert.equal(v.enemies.filter(q => q.kind === 'v:broteSavia').length, 2, 'los brotes viajan a los clientes'); assert.equal(E.makeKind('broteSavia').name, 'Brote de savia');
  const hp0 = b.hp; run(x, 2); assert.ok(b.hp > hp0, 'se cura con los brotes');
  assert.ok(Math.abs(b.damageTakenMul({ cat: 'esp' }) - 1.2 * .6) < 1e-9, 'protegido: −40 % de daño');
  assert.match(E.BossKit.hudTag(b, x.g), /protegido por la savia \(2 brotes\)/);
  for (const pl of ps) E.Combat.hit(x.g, pl, { team: 'player', fixed: 1e5, src: hero(x) });
  run(x, .2);
  assert.equal(S(b).stage, 'stun'); assert.match(S(b).why, /sin savia/);
  assert.equal(b.damageTakenMul({ cat: 'esp' }), 1.2);
  const h1 = b.hp; run(x, 2); assert.ok(b.hp <= h1, 'ya no se cura');
  // furia: vuelven a brotar y caen con él
  b.hp = Math.floor(b.maxHp * .29); run(x, 4); assert.equal(S(b).phase, 2); assert.ok(plants(x).length >= 2);
  E.Combat.hit(x.g, b, { team: 'player', fixed: 1e8, src: hero(x) }); run(x, .2);
  assert.equal(plants(x).length, 0, 'los brotes caen con él');
});

test('Guardián de Espinas: en solitario se le enreda con solo esperar junto a un tocón y apartarse del salto; nunca se bloquea', () => {
  for (const seed of [5, 9]) {
    const x = grove(1, seed), b = x.boss, p = hero(x);
    let tangled = -1, lastStage = '', stageT = 0;
    run(x, 90, t => {
      if (tangled < 0 && S(b).stage === 'vuln') tangled = t;
      assert.ok(b.free(x.world, b.x, b.y));
      const st = S(b).stage; if (st === lastStage) stageT += STEP; else { lastStage = st; stageT = 0; } assert.ok(stageT < 12, st);
      const s = stumps(x); if (!s.length) return;
      let gx, gy;
      if (st === 'tele' && b.pattern === 'salto' && b.timer < b.windupTime * .3) { gx = p.x + 90; gy = p.y + 50; }   // la sombra ya está fijada: apartarse
      else if (st === 'act' && b.pattern === 'salto') return;
      else { const r = s.sort((a, c) => Math.hypot(a.cx - p.x, a.cy - p.y) - Math.hypot(c.cx - p.x, c.cy - p.y))[0]; gx = r.cx + 54; gy = r.cy; }
      const ex = gx - p.x, ey = gy - p.y, d = Math.hypot(ex, ey); if (d > 3) { const v = Math.min(d, p.moveSpeed() * STEP); p.moveBy(x.world, ex / d * v, ey / d * v); }
    });
    assert.ok(tangled > 0 && tangled < 70, `semilla ${seed}: enredado a los ${tangled.toFixed(1)} s`);
  }
});
