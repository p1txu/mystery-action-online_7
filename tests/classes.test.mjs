/** Clases (Guerrero, Arquero, Mago, Asesino): atributos, fórmulas de daño, alcances, apuntado, enfriamientos,
 *  costes, aturdimiento, carga del Arquero, área del Mago, los dos tajos del Asesino y los 4 ticks de sangrado.
 *  Todo se prueba en la simulación del SERVIDOR (Expedition), que es la que decide en cooperativo. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { Expedition } from '../server/src/sim/Expedition.js';
import { parseInput } from '../shared/protocol.js';
import { E, freshSave, seeded, STEP } from './helpers.mjs';

const TABLE = {   // valores de nivel 1 pedidos (vida, maná, ataque, poder mágico, defensa, resistencia, velocidad, vel. ataque, crítico, daño crítico)
  // velocidad: un 15 % menos desde la 0.36 (se podrá subir con botas)
  guerrero: [180, 60, 12, 0, 16, 10, 128, .85, .05, 1.5],
  arquero: [105, 80, 14, 0, 6, 5, 148, 1, .1, 1.75],
  mago: [85, 140, 5, 18, 4, 10, 124, .75, .05, 1.5],
  asesino: [100, 70, 11, 0, 5, 5, 162, 1.5, .15, 1.75],
};
const KEYS = ['hp', 'mp', 'atk', 'spa', 'def', 'spd', 'spe', 'aspd', 'crit', 'critMul'];

/** Expedición de un jugador en una sala abierta y sin enemigos (para medir sin interferencias). */
function solo(cls, o = {}) {
  const profile = freshSave(cls); if (o.level) profile.prog = E.Progress.fresh(cls, o.level);
  const members = [{ id: 'a', name: 'A', profile }, ...(o.second ? [{ id: 'b', name: 'B', profile: freshSave(o.second) }] : [])];
  const x = new Expedition({ dungeonId: 'bosque', seed: 21, members, random: seeded(5) });
  x.drainEvents();
  x.g.actors = x.g.actors.filter(a => !(a instanceof x.E.Enemy));
  const W = x.g.world; for (let ty = 1; ty < W.h - 1; ty++) for (let tx = 1; tx < W.w - 1; tx++) W.tiles[ty * W.w + tx] = x.E.T.FLOOR;
  W.blk = new Uint8Array(W.w * W.h);
  const p = x.members.get('a').player;
  p.x = p.px = W.w * x.E.CONFIG.TILE / 2; p.y = p.py = W.h * x.E.CONFIG.TILE / 2; p.stats.crit = 0;   // sin críticos salvo donde se prueban
  p.hp = p.maxHp; p.energy = p.maxEnergy;
  if (o.second) { const q = x.members.get('b').player; q.x = q.px = p.x - 200; q.y = q.py = p.y; }
  return { x, p, W };
}
/** Muñeco quieto con muchos PS; cuenta cada golpe que recibe. */
function dummy(x, px, py, o = {}) {
  const e = new x.E.Enemy(x.E.makeKind(o.kind || 'pedrolon'), px, py, { level: o.level || 3 });
  e.kind = Object.assign({}, e.kind, { brain: () => x.E.STOP }); e.aggro = false;
  e.maxHp = e.hp = o.hp || 50000; e.hits = []; x.addEnemy(e, 'v:dummy');
  return e;
}
function countHits(x) {
  const orig = x.E.Combat.hit;
  x.E.Combat.hit = function (g, t, o) { const h = t.hp, r = orig.call(this, g, t, o); if (r && t.hits) t.hits.push({ dmg: h - t.hp, o, at: x.time }); return r; };
  return () => { x.E.Combat.hit = orig; };
}
let N = 0;
/** Acción del cliente (como la envía la red) y un paso de simulación para que se aplique. */
const act = (x, a) => { const m = x.members.get('a'); x.applyInput('a', parseInput({ s: m.nextSeq, m: [[0, 0]], a: [Object.assign({ n: ++N, at: m.nextSeq }, a)] })); x.step(STEP); };
const near = (a, b, e = .5) => Math.abs(a - b) <= e;
const run = (x, s) => { for (let i = 0; i < Math.round(s / STEP); i++) x.step(STEP); };
const calc = (p, e, mult, mag = false) => Math.max(1, Math.round(mult * (mag ? p.stats.spa : p.stats.atk) / (1 + (mag ? e.stats.spd : e.stats.def) / E.DMG.HERO_DEF)));
const casts = x => x.drainEvents().filter(e => e.type === 'cast' || e.type === 'reject');

test('atributos de nivel 1 de las cuatro clases (tabla pedida) y crecimiento por nivel', () => {
  for (const [cls, row] of Object.entries(TABLE)) {
    const st = E.calcStats(E.FORMS[cls].base, 1);
    KEYS.forEach((k, i) => assert.equal(st[k], row[i], `${cls}.${k}`));
    const L = 10, g = E.FORMS[cls].base.growth, s10 = E.calcStats(E.FORMS[cls].base, L);
    for (const k of KEYS) {
      const want = row[KEYS.indexOf(k)] + (g[k] || 0) * (L - 1);
      assert.ok(Math.abs(s10[k] - (E.FRACTION_STATS.has(k) ? want : Math.round(want))) < 1e-9, `${cls}.${k} a nivel ${L}: ${s10[k]} ≠ ${want}`);
    }
  }
  assert.equal(E.calcStats(E.FORMS.arquero.base, 1).range, 300);
  assert.equal(E.calcStats(E.FORMS.mago.base, 1).range, 340);
});

test('el equipo modifica los atributos sin tocar la base de la clase', () => {
  const base = structuredClone(E.FORMS.guerrero.base);
  const eq = E.freshEquip(); eq.accesorio = { id: 'brazalPiedra', uid: 'x1' };
  const plain = E.finalStats(E.FORMS.guerrero.base, 1, E.freshEquip(), null), withEq = E.finalStats(E.FORMS.guerrero.base, 1, eq, null);
  assert.ok(withEq.def > plain.def, `defensa con brazal ${withEq.def} > ${plain.def}`);
  assert.deepEqual(E.FORMS.guerrero.base, base, 'la base no cambia');
  assert.equal(E.calcStats(E.FORMS.guerrero.base, 1).def, 16);
});

test('fórmula de daño: físico con Ataque/Defensa, mágico con Poder mágico/Resistencia; críticos con el multiplicador de la clase', () => {
  const { x, p } = solo('guerrero');
  const e = dummy(x, p.x + 40, p.y);
  e.stats.def = 30; e.stats.spd = 60;
  assert.ok(Math.abs(x.E.Combat.calc(p, e, { mult: 1, cat: 'fis' }) - p.stats.atk / (1 + 30 / E.DMG.HERO_DEF)) < 1e-9, 'físico: mult × atk / (1 + def/75)');
  const m = solo('mago'), em = dummy(m.x, m.p.x + 40, m.p.y); em.stats.spd = 60; em.stats.def = 0;
  assert.ok(Math.abs(m.x.E.Combat.calc(m.p, em, { mult: 3, cat: 'mag' }) - 3 * m.p.stats.spa / (1 + 60 / E.DMG.HERO_DEF)) < 1e-9, 'mágico: mult × poder / (1 + resistencia/75)');
  // Criatura → héroe: potencia × ataque × 0,035 / (1 + def/36)
  const want = 20 * e.stats.atk * E.DMG.CREATURE_K / (1 + p.stats.def / E.DMG.VS_HERO_DEF);
  assert.ok(Math.abs(x.E.Combat.calc(e, p, { dmg: 20, cat: 'fis' }) - want) < 1e-9);
  // Crítico seguro: daño × daño crítico de la clase
  p.stats.crit = 1; const h0 = e.hp; e.iframes = 0;
  x.E.Combat.hit(x.g, e, { team: 'player', mult: 1, cat: 'fis', src: p });
  assert.equal(h0 - e.hp, Math.max(1, Math.round(p.stats.atk / (1 + 30 / E.DMG.HERO_DEF) * p.stats.critMul)));
});

test('Guerrero: espadazo (140 % desde la 0.36, alcance 52, arco frontal) y ritmo = 1 / velocidad de ataque', () => {
  const { x, p } = solo('guerrero'); const done = countHits(x);
  const near = dummy(x, p.x + 52, p.y), far = dummy(x, p.x + 52 + near.radius + 6, p.y + 60), back = dummy(x, p.x - 40, p.y);
  act(x, { k: 'b', dx: 1, dy: 0, d: 52 }); run(x, .05);
  assert.equal(near.hits.length, 1); assert.equal(near.hits[0].dmg, calc(p, near, 1.4), 'espadazo: 140 % del ataque');
  assert.equal(far.hits.length, 0, 'fuera de alcance'); assert.equal(back.hits.length, 0, 'detrás: fuera del arco');
  // Enfriamiento del básico: 1/0,85 ≈ 1,18 s
  act(x, { k: 'b', dx: 1, dy: 0 }); run(x, 1); assert.equal(near.hits.length, 1, 'antes de 1,18 s no repite');
  run(x, .25); act(x, { k: 'b', dx: 1, dy: 0 }); run(x, .05); assert.equal(near.hits.length, 2);
  done();
});

test('Guerrero: Golpetazo de escudo — preparación, 100 % del ataque, aturde 1 s, 15 de energía, 6 s de enfriamiento y no atraviesa muros', () => {
  const { x, p, W } = solo('guerrero'); const done = countHits(x);
  const e = dummy(x, p.x + 50, p.y, { kind: 'mordisquin' }), en0 = p.energy;   // (los gólems y guardianes resisten el aturdimiento: ×0,5 y ×0,15)
  act(x, { k: 'm', i: 0, dx: 1, dy: 0 }); run(x, .1);
  assert.equal(e.hits.length, 0, 'durante la preparación (0,18 s) aún no golpea');
  assert.ok(near(p.energy, en0 - 15 + .3), `cuesta 15 (${p.energy})`);
  run(x, .12);
  assert.equal(e.hits.length, 1); assert.equal(e.hits[0].dmg, calc(p, e, 1));
  assert.ok(Math.abs(e.status.stun - (1 - .04)) < .02, `aturdido ~1 s (${e.status.stun})`);
  run(x, 1); assert.ok(e.status.stun <= 0, 'el aturdimiento acaba al segundo');
  // Enfriamiento de 6 s desde el lanzamiento
  x.drainEvents(); p.energy = p.maxEnergy;
  run(x, 6 - 1.22 - .1); act(x, { k: 'm', i: 0, dx: 1, dy: 0 });
  assert.ok(casts(x).some(c => c.type === 'reject' && c.what === 'move0'), 'a los 5,9 s aún en enfriamiento');
  run(x, .2); act(x, { k: 'm', i: 0, dx: 1, dy: 0 });
  assert.ok(casts(x).some(c => c.type === 'cast' && c.move === 'golpetazo'), 'a los 6,1 s ya se puede');
  // Sin energía suficiente: rechazado
  run(x, 6.2); p.energy = 14; act(x, { k: 'm', i: 0, dx: 1, dy: 0 });
  assert.ok(casts(x).some(c => c.type === 'reject'), 'con 14 de energía no se puede');
  // Muro entre el guerrero y el enemigo: no le alcanza
  run(x, 6.2); p.energy = p.maxEnergy;
  const T = x.E.CONFIG.TILE, wx = Math.floor((p.x + 26) / T), wy = Math.floor(p.y / T);
  for (let dy = -2; dy <= 2; dy++) W.blk[(wy + dy) * W.w + wx] = 1;
  const n = e.hits.length; act(x, { k: 'm', i: 0, dx: 1, dy: 0 }); run(x, .3);
  assert.equal(e.hits.length, n, 'el muro lo protege');
  done();
});

test('Arquero: flecha hacia el cursor con alcance 300; el Flechazo cargado va del 150 % (sin cargar) al 250 % (1,5 s)', () => {
  const { x, p } = solo('arquero'); const done = countHits(x);
  const inR = dummy(x, p.x, p.y - 280), out = dummy(x, p.x + 300 + 40, p.y);
  act(x, { k: 'b', dx: 0, dy: -1, d: 280 }); run(x, .8);
  assert.equal(inR.hits.length, 1, 'acierta hacia donde apunta (arriba)'); assert.equal(inR.hits[0].dmg, calc(p, inR, 1.15), 'flecha: 115 % desde la 0.36');
  run(x, 1); act(x, { k: 'b', dx: 1, dy: 0, d: 340 }); run(x, 1);
  assert.equal(out.hits.length, 0, 'a 340 la flecha ya no llega (alcance 300)');
  // Carga: se paga al tensar; se suelta con «r»; la potencia la mide el servidor
  const t = dummy(x, p.x + 200, p.y + 100); t.stats.def = 0;
  const shots = [];
  for (const hold of [0, .75, 1.5, 3]) {
    run(x, 5.1); p.energy = p.maxEnergy; x.drainEvents();
    const en0 = p.energy, n0 = t.hits.length;
    act(x, { k: 'm', i: 0, dx: 1, dy: 0 }); assert.ok(near(p.energy, en0 - 15, .1), 'cuesta 15 al tensar');
    assert.ok(p.charging, 'tensando');
    run(x, hold);
    const a = Math.atan2(t.y - p.y, t.x - p.x);   // apunta al soltar (el cursor puede haberse movido)
    act(x, { k: 'r', i: 0, dx: Math.cos(a), dy: Math.sin(a), d: 223 });
    const ev = casts(x).find(c => c.type === 'cast' && c.k === 'r');
    run(x, .6);
    assert.equal(t.hits.length, n0 + 1, `acierta tras ${hold} s`);
    shots.push({ hold, frac: ev.c, dmg: t.hits.at(-1).dmg, mult: t.hits.at(-1).o.mult });
    assert.ok(p.cds[0] > 4.3, 'el enfriamiento (5 s) empieza al soltar');
  }
  const nearM = (a, b) => Math.abs(a - b) <= .02;
  assert.ok(nearM(shots[0].mult, 1.5) && nearM(shots[1].mult, 2.0) && nearM(shots[2].mult, 2.5) && nearM(shots[3].mult, 2.5), JSON.stringify(shots));
  for (const s of shots) assert.equal(s.dmg, Math.max(1, Math.round(s.mult * p.stats.atk)), 'daño = mult × ataque (objetivo sin defensa)');
  assert.ok(nearM(shots[1].frac, .5) && shots[3].frac === 1, 'el evento lleva la carga para los demás jugadores');
  done();
});

test('Mago: orbe (alcance 340, mágico) y Lluvia de fuego — punto en mundo (máx. 450), aviso 0,8 s, 12 bolas que pueden golpear varias veces al mismo enemigo, 30 de maná', () => {
  const { x, p, W } = solo('mago'); const done = countHits(x);
  const o1 = dummy(x, p.x + 320, p.y);
  act(x, { k: 'b', dx: 1, dy: 0, d: 320 }); run(x, 1.2);
  assert.equal(o1.hits.length, 1); assert.equal(o1.hits[0].dmg, calc(p, o1, 1, true), 'el orbe usa Poder mágico contra Resistencia mágica');
  // Lluvia: 12 bolas pequeñas en 1,8 s; cada una es un golpe aparte, así que el mismo enemigo puede recibir varias
  const L = E.MOVES.lluvia, cx = p.x + 300, cy = p.y;
  const ins = [dummy(x, cx, cy), dummy(x, cx + 60, cy), dummy(x, cx, cy + 70)], outside = dummy(x, cx - 135, cy - 30);
  const spots = L.spots(L, cx, cy), want = e => spots.filter(b => Math.hypot(e.x - b.x, e.y - b.y) <= L.ballR + e.radius).length;
  const en0 = p.energy; x.drainEvents();
  act(x, { k: 'm', i: 0, dx: 1, dy: 0, d: 300 });
  assert.ok(near(p.energy, en0 - 30, .1), `30 de maná (${p.energy})`);
  run(x, .75); assert.ok(ins.every(e => e.hits.length === 0), 'nada antes de 0,8 s (aviso)');
  run(x, .1); assert.ok(ins.reduce((t, e) => t + e.hits.length, 0) <= 1, 'la primera bola cae a los 0,8 s');
  run(x, 2.2);
  assert.ok(want(ins[0]) >= 3, `en el centro caen varias bolas (${want(ins[0])})`);
  for (const e of ins) {
    assert.equal(e.hits.length, want(e), 'cada bola que le alcanza es un golpe');
    for (const h of e.hits) assert.equal(h.dmg, calc(p, e, .7, true), 'cada bola: 70 % del Poder mágico');
  }
  const times = ins[0].hits.map(h => h.at); for (let k = 1; k < times.length; k++) assert.ok(times[k] - times[k - 1] >= .149, 'golpes en momentos distintos');
  assert.ok(Math.max(...ins.flatMap(e => e.hits.map(h => h.at))) - (x.time - 2.2 - .1 - .75) <= 2.65, 'la lluvia dura 1,8 s tras el aviso');
  assert.equal(outside.hits.length, 0, 'fuera del área: nada');
  const total = ins.reduce((t, e) => t + e.hits.length, 0); run(x, 2); assert.equal(ins.reduce((t, e) => t + e.hits.length, 0), total, 'no sigue después');
  // El punto se limita a 450 y no atraviesa muros
  const far = E.groundTarget(x.g, p, { tx: p.x + 900, ty: p.y }, 450);
  assert.ok(Math.abs(far.x - (p.x + 450)) < 1e-6 && Math.abs(far.y - p.y) < 1e-6, JSON.stringify(far));
  const T = x.E.CONFIG.TILE, wx = Math.floor((p.x + 200) / T); for (let ty = 0; ty < W.h; ty++) W.blk[ty * W.w + wx] = 1;
  const wall = E.groundTarget(x.g, p, { tx: p.x + 400, ty: p.y }, 450);
  assert.ok(wall.x < wx * T && wall.x > wx * T - 12, `se queda antes del muro (${wall.x} < ${wx * T})`);
  // Enfriamiento de 8 s
  x.drainEvents(); p.energy = p.maxEnergy; act(x, { k: 'm', i: 0, dx: 1, dy: 0, d: 100 });
  assert.ok(casts(x).some(c => c.type === 'reject'));
  done();
});

test('Asesino: dos tajos que golpean por separado; Tajo en X (150 %, −30 % 2 s) y sangrado de exactamente 4 ticks de ceil(10 % del básico)', () => {
  const { x, p } = solo('asesino'); const done = countHits(x);
  const e = dummy(x, p.x + 40, p.y);
  act(x, { k: 'b', dx: 1, dy: 0, d: 40 }); run(x, .3);
  assert.equal(e.hits.length, 2, 'los dos tajos aciertan');
  for (const h of e.hits) assert.equal(h.dmg, calc(p, e, .52));   // 52 % cada tajo desde la 0.36
  assert.ok(e.hits[1].at - e.hits[0].at >= .14, 'el segundo llega 0,15 s después');
  // Si el enemigo se aparta tras el primero, el segundo falla
  const f = dummy(x, p.x, p.y + 40); run(x, 1);
  act(x, { k: 'b', dx: 0, dy: 1, d: 40 }); run(x, .05); f.x = p.x + 300; run(x, .3);
  assert.equal(f.hits.length, 1, 'el segundo tajo puede fallar por separado');
  // Tajo en X + sangrado
  const t = dummy(x, p.x - 40, p.y), basic = calc(p, t, .52) * 2, tick = Math.ceil(basic * .1), en0 = p.energy, spe0 = t.speed;
  act(x, { k: 'm', i: 0, dx: -1, dy: 0, d: 40 }); run(x, .02);
  assert.ok(near(p.energy, en0 - 20, .2), '20 de energía');
  assert.equal(t.hits.length, 1); assert.equal(t.hits[0].dmg, calc(p, t, 1.5));
  assert.ok(Math.abs(t.status.slowAmt - .3) < 1e-9 && t.status.slow > 1.9, 'ralentizado un 30 % durante 2 s');
  run(x, 4.5);
  const ticks = t.hits.filter(h => h.o.team === 'bleed');
  assert.equal(ticks.length, 4, 'exactamente 4 ticks');
  assert.ok(ticks.every(h => h.dmg === tick), `cada tick ${tick} (ceil(10 % de ${basic}))`);
  for (let i = 1; i < 4; i++) assert.ok(Math.abs(ticks[i].at - ticks[i - 1].at - 1) < .02, 'uno por segundo');
  // Reaplicar durante el sangrado (p. ej. dos asesinos, o el Tajo en X de nuevo): renueva la duración a 4 ticks sin acumular daño
  run(x, 3); const n0 = t.hits.length, X = E.MOVES.tajoX, hitX = () => { t.iframes = 0; x.E.Combat.hit(x.g, t, { team: 'player', mult: X.mult, cat: 'fis', src: p, bleed: X.bleed, slow: X.slow }); };
  hitX(); run(x, 2.2);                     // 2 ticks
  hitX(); run(x, 4.5);                     // se renueva: 4 ticks más (no 2 + 4 apilados)
  const later = t.hits.slice(n0).filter(h => h.o.team === 'bleed');
  assert.ok(later.every(h => h.dmg === tick), 'el daño por tick no se acumula');
  assert.equal(later.length, 2 + 4, 'renovado: 2 ticks del primero y 4 del segundo (no 2 + 2 + 4)');
  assert.ok(t.status.bleedTicks === 0, 'y se acaba');
  done();
});

test('el servidor valida la clase: sin habilidades de otra clase ni del básico en los huecos; clases desconocidas rechazadas', () => {
  const s = freshSave('guerrero'); s.prog.known = ['golpetazo', 'tajoX', 'espadazo', 'lluvia']; s.prog.equipped = ['tajoX', 'golpetazo'];
  const clean = E.Save.sanitize(s).data;
  assert.deepEqual(clean.prog.known, ['golpetazo']); assert.deepEqual(clean.prog.equipped, ['golpetazo']);
  assert.throws(() => new Expedition({ dungeonId: 'bosque', seed: 1, members: [{ id: 'a', name: 'x', profile: Object.assign(freshSave(), { species: 'voltrino' }) }] }), /Perfil/);
  // Un guerrero no puede soltar una carga que no ha empezado
  const { x } = solo('guerrero'); act(x, { k: 'r', i: 0, dx: 1, dy: 0 });
  assert.ok(x.drainEvents().some(e => e.type === 'reject' && e.what === 'move0'));
});

test('cooperativo: los ataques de cada clase se emiten a todos con su habilidad y su carga', () => {
  const { x, p } = solo('arquero', { second: 'mago' });
  x.drainEvents();
  act(x, { k: 'm', i: 0, dx: 1, dy: 0 }); run(x, .6); act(x, { k: 'r', i: 0, dx: 0, dy: 1, d: 200 });
  const evs = x.drainEvents().filter(e => e.type === 'cast');
  assert.deepEqual(evs.map(e => [e.by, e.k, e.move]), [['a', 'm', 'flechazo'], ['a', 'r', 'flechazo']]);
  assert.ok(Math.abs(evs[1].c - .4) < .02 && evs[1].dy === 1, 'la carga y la dirección del momento de soltar');
  const q = x.members.get('b').player; assert.equal(q.sp.id, 'mago'); assert.equal(q.maxEnergy, 140);
  const v = x.view(); assert.deepEqual(v.players.map(z => z.species).sort(), ['arquero', 'mago']);
});
