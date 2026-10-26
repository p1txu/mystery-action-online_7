/** Mazmorras renovadas: decoración por reglas (sin bloquear nada), obstáculos con colisión, seis familias de
 *  enemigos pequeños con IA propia, élites, menos botín suelto, cofres como fuente principal y equipo por clase. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { Expedition } from '../server/src/sim/Expedition.js';
import { applyOp } from '../server/src/profile/rules.js';
import { E, freshSave, seeded, STEP } from './helpers.mjs';

const gen = (d, seed, floor = 2, players = 1) => E.FloorGen.generate(seed, E.dungeonById(d), floor, 'normal', [], players);
const run = (x, s) => { for (let i = 0; i < Math.round(s / STEP); i++) x.step(STEP); };

test('decoración: misma semilla ⇒ mismo escenario; nunca en entrada, escalera, puertas, pasillos, cofres, objetos, trampas ni enemigos; no toca colisiones', () => {
  for (const d of E.DUNGEONS) for (let seed = 1; seed <= 6; seed++) {
    const a = gen(d.id, seed * 97), b = gen(d.id, seed * 97), L = a.layout, W = L.w;
    const tiles0 = a.world.tiles.slice();
    const A = E.Deco.build(a.world, L, a.biome.id), B = E.Deco.build(b.world, b.layout, b.biome.id);
    assert.deepEqual(JSON.stringify([...A.map]), JSON.stringify([...B.map]), 'determinista');
    assert.deepEqual([...a.world.tiles], [...tiles0], 'la decoración no cambia el mapa');
    assert.ok(A.map.size > 4, `${d.id}: hay decoración (${A.map.size})`);
    const bad = new Set(), mark = (tx, ty, r) => { for (let j = -r; j <= r; j++) for (let i = -r; i <= r; i++) bad.add((ty + j) * W + tx + i); };
    mark(L.spawn.tx, L.spawn.ty, 2); if (L.stairs) mark(L.stairs.tx, L.stairs.ty, 1);
    for (const e of L.edges) for (const i of e.tiles) mark(i % W, (i / W) | 0, 1);
    for (const o of L.objects) mark(o.tx, o.ty, 1); for (const it of L.items) mark(it.tx, it.ty, 0); for (const t of L.traps) mark(t.tx, t.ty, 0); for (const e of L.enemies) mark(e.tx, e.ty, 1);
    for (const k of A.map.keys()) {
      assert.ok(!bad.has(k), `${d.id}/${seed}: decoración en una casilla reservada (${k % W},${(k / W) | 0})`);
      assert.ok(!E.SOLID[a.world.tiles[k]], 'nunca sobre casillas sólidas');
      assert.ok(L.rooms.some(r => k % W >= r.x && k % W < r.x + r.w && ((k / W) | 0) >= r.y && ((k / W) | 0) < r.y + r.h), 'solo dentro de salas');
    }
  }
});

test('obstáculos grandes (rocas, troncos, cristales) con colisión: pegados a los muros y sin cortar rutas', () => {
  let logs = 0, n = 0;
  for (const d of E.DUNGEONS) for (let seed = 1; seed <= 12; seed++) for (const players of [1, 4]) {
    const g = gen(d.id, seed * 31 + players, 1 + (seed % 3), players);
    assert.ok(g.validation.ok, JSON.stringify(g.validation.checks));
    n++; logs += [...g.world.tiles].filter(t => t === E.T.LOG).length;
  }
  assert.ok(logs > 0, 'hay troncos caídos en bosque y ciénaga');
  assert.ok(E.SOLID[E.T.LOG] === 1 && !E.BLOCKS_SHOT[E.T.LOG], 'el tronco bloquea el paso pero se puede disparar por encima');
});

test('seis familias de enemigos pequeños en las cinco mazmorras; por pisos; ratas en grupo; más pequeños que los héroes', () => {
  const fams = new Set();
  for (const d of E.DUNGEONS) for (const v of Object.keys(d.enemies)) { const k = E.makeKind(v); fams.add(k.family); assert.ok(k.pixel && E.FAMILIES[k.family], `${v} es de una familia nueva`); assert.ok(k.radius <= 10 && k.height <= 18, `${v}: pequeño`); }
  assert.deepEqual([...fams].sort(), ['ave', 'hongo', 'lagarto', 'limo', 'planta', 'rata']);
  const b = E.dungeonById('bosque');
  assert.ok(!('zarza' in E.floorEnemies(b, 1)) && 'zarza' in E.floorEnemies(b, 2) && !('cuervo' in E.floorEnemies(b, 2)), 'algunas familias solo en pisos más profundos');
  // Grupos de ratas: las del mismo grupo aparecen juntas
  let packs = 0;
  for (let seed = 1; seed <= 20; seed++) { const L = gen('bosque', seed, 1).layout; for (const e of L.enemies) if (e.pack != null) { packs++; assert.ok(L.enemies.some(o => o !== e && o.variant === e.variant && Math.hypot(o.tx - e.tx, o.ty - e.ty) <= 3)); } }
  assert.ok(packs > 5, 'hay grupos de ratas');
});

/** Un jugador y un enemigo de la familia en una sala abierta (simulación del servidor). */
function arena(variant, o = {}) {
  const x = new Expedition({ dungeonId: o.dng || 'bosque', seed: 3, members: [{ id: 'a', name: 'A', profile: freshSave('guerrero') }], random: seeded(9) });
  x.drainEvents(); x.g.actors = x.g.actors.filter(a => !(a instanceof x.E.Enemy));
  const W = x.g.world; for (let ty = 1; ty < W.h - 1; ty++) for (let tx = 1; tx < W.w - 1; tx++) W.tiles[ty * W.w + tx] = x.E.T.FLOOR;
  const p = x.members.get('a').player; p.x = p.px = W.w * 16; p.y = p.py = W.h * 16; p.maxHp = p.hp = 99999;
  const es = (o.n ? [...Array(o.n)] : [0]).map((_, i) => { const e = new x.E.Enemy(x.E.makeKind(variant), p.x + (o.dist || 120) * Math.cos(i * 1.7), p.y + (o.dist || 120) * Math.sin(i * 1.7), { level: 3 }); e.aggro = true; x.addEnemy(e, 'v:' + variant); return e; });
  return { x, p, e: es[0], es };
}
const track = (x, e, s) => { const states = new Set(), pos = []; for (let i = 0; i < Math.round(s / STEP); i++) { x.step(STEP); states.add(e.state); if (i % 12 === 0) pos.push([e.x, e.y]); } return { states, pos }; };

test('comportamientos distintos: rata muerde, lagarto se recoloca, limo salta, ave cae en picado, hongo dispara esporas, planta no se mueve y lanza raíces', () => {
  { const { x, p, e } = arena('rataRaiz'); const h = p.hp, t = track(x, e, 6); assert.ok(t.states.has('windup') && t.states.has('recover') && p.hp < h, 'rata: prepara y muerde'); }
  { const { x, p, e } = arena('lagartoCieno'); const t = track(x, e, 6); assert.ok(t.states.has('reposition'), 'lagarto: se aparta tras morder'); assert.ok(p.status.burn > 0 || p.hp < 99999, 'lagarto venenoso: daña o envenena'); }
  { const { x, e } = arena('limoMusgo'); const t = track(x, e, 6); assert.ok(t.states.has('hop') && t.states.has('windup'), 'limo: se comprime y salta');
    // solo se desplaza durante los saltos
    const y = arena('limoMusgo'); let still = 0; for (let i = 0; i < 600; i++) { const bx = y.e.x, by = y.e.y; y.x.step(STEP); if (y.e.state === 'idle' && Math.hypot(y.e.x - bx, y.e.y - by) < .2) still++; } assert.ok(still > 50, 'limo: quieto entre saltos'); }
  { const { x, p, e } = arena('cuervo', { dist: 150 }); const h = p.hp, t = track(x, e, 8); assert.ok(t.states.has('windup') && t.states.has('dive') && t.states.has('retreat'), 'ave: aviso, picado y retirada'); assert.ok(p.hp < h, 'el picado hace daño'); }
  { const { x, p, e } = arena('setaBruma', { dist: 160 }); let shots = 0; for (let i = 0; i < 6 * 120; i++) { x.step(STEP); shots = Math.max(shots, x.g.projectiles.filter(q => q.team === 'enemy').length); } assert.ok(shots > 0, 'hongo: lanza esporas'); assert.ok(Math.hypot(e.x - p.x, e.y - p.y) > 90, 'hongo: guarda distancia'); }
  { const { x, p, e } = arena('zarza', { dist: 120 }); const x0 = e.x, y0 = e.y, h = p.hp; let zones = 0; for (let i = 0; i < 6 * 120; i++) { x.step(STEP); zones = Math.max(zones, x.g.zones.length); } assert.ok(Math.hypot(e.x - x0, e.y - y0) < 4, 'planta fija'); assert.ok(zones > 0 && p.hp < h, 'raíces bajo el objetivo con aviso, y hacen daño'); assert.ok(p.status.slow > 0 || p.status.slowAmt >= 0); }
});

test('los grupos no atacan todos a la vez (turnos de ataque)', () => {
  const { x, es } = arena('rataRaiz', { n: 5, dist: 34 });
  const starts = []; const prev = new Map(es.map(e => [e, e.state]));
  for (let i = 0; i < 4 * 120; i++) { x.step(STEP); for (const e of es) { if (e.state === 'windup' && prev.get(e) !== 'windup') starts.push(x.g.time); prev.set(e, e.state); } }
  starts.sort((a, b) => a - b);
  assert.ok(starts.length >= 4, 'atacan varias veces');
  for (let i = 1; i < starts.length; i++) assert.ok(starts[i] - starts[i - 1] >= .15, `inicios separados (${(starts[i] - starts[i - 1]).toFixed(3)} s)`);
});

test('élites: ~5 % (ajustable por bioma y profundidad), como mucho uno por sala, ×2,5 PS, ×1,5 daño y ×2 experiencia', () => {
  assert.equal(E.eliteChance(E.dungeonById('bosque'), 1), 0, 'ninguno en el primer piso del Bosque');
  const c2 = E.eliteChance(E.dungeonById('bosque'), 2), cc = E.eliteChance(E.dungeonById('crater'), 6);
  assert.ok(c2 > .045 && c2 < .08 && cc > c2, `bosque ${c2} < cráter ${cc}`);
  let n = 0, el = 0;
  for (let seed = 1; seed <= 150; seed++) {
    const L = gen('cienaga', seed, 3).layout, per = {};
    for (const e of L.enemies) { n++; if (e.elite) { el++; per[e.room] = (per[e.room] || 0) + 1; } }
    for (const v of Object.values(per)) assert.ok(v <= E.ELITE.maxPerRoom);
  }
  const rate = el / n; assert.ok(rate > .02 && rate < .12, `élites ${(rate * 100).toFixed(1)} %`);
  const k = E.makeKind('rataRaiz'), a = new E.Enemy(k, 0, 0, { level: 5 }), b = new E.Enemy(k, 0, 0, { level: 5, elite: true });
  assert.equal(b.maxHp, Math.round(a.maxHp * 2.5)); assert.equal(b.dmgMul, a.dmgMul * 1.5);
  assert.equal(E.expYield(b, 5), Math.max(1, Math.round((k.exp || 20) * 5 * .17 * 1 * 2)));
});

test('élites dan mejor botín que los normales (más oro, más objetos, equipo posible) y sin legendarios al principio', () => {
  const d = E.dungeonById('bosque'), r = seeded(5); let gN = 0, gE = 0, iN = 0, iE = 0, eqE = 0;
  for (let i = 0; i < 3000; i++) { const a = E.Loot.roll('enemigo', d, r), b = E.Loot.roll('elite', d, r); gN += a.gems; gE += b.gems; iN += a.items.length; iE += b.items.length; eqE += b.items.filter(x => E.ITEMS[x.id].cat === 'equipo').length; }
  assert.ok(gE > gN * 5 && iE > iN * 10 && eqE > 300, JSON.stringify({ gN, gE, iN, iE, eqE }));
  for (let i = 0; i < 4000; i++) for (const src of ['elite', 'cofreRaro']) assert.ok(!E.Loot.roll(src, d, r).items.some(x => E.ITEMS[x.id].rarity === 'legendaria'));
});

test('botín suelto ≈75 % menos (como mucho uno por sala); los enemigos casi nunca sueltan objetos', () => {
  let floors = 0, items = 0;
  for (const d of E.DUNGEONS) for (let seed = 1; seed <= 25; seed++) {
    const L = gen(d.id, seed * 13, 2).layout; floors++;
    const loose = L.items.filter(it => it.id !== 'llave' && it.id !== 'cofre' && it.id !== 'job' && !it.price && L.rooms[it.room] && L.rooms[it.room].type !== 'treasure');
    items += loose.length;
    const per = {}; for (const it of loose) per[it.room] = (per[it.room] || 0) + 1; for (const v of Object.values(per)) assert.ok(v <= 1, 'uno por sala');
  }
  assert.ok(items / floors < .7, `objetos sueltos por piso: ${(items / floors).toFixed(2)} (antes ≈1,7)`);
  const r = seeded(2); let drops = 0; for (let i = 0; i < 4000; i++) drops += E.Loot.roll('enemigo', E.dungeonById('gruta'), r).items.length;
  assert.ok(drops / 4000 < .04, `objetos por enemigo: ${drops / 4000}`);
});

test('cofres: 1-3 por piso, separados, alcanzables, fuera de la sala inicial; común < plata < raro; oro y pociones casi siempre', () => {
  const tiers = {};
  for (const d of E.DUNGEONS) for (let seed = 1; seed <= 25; seed++) {
    const g = gen(d.id, seed * 7, 2), L = g.layout, ch = L.objects.filter(o => o.type === 'chest' && L.rooms[o.room] && L.rooms[o.room].type === 'normal');
    assert.ok(ch.length >= 1 && ch.length <= 3, `${d.id}/${seed}: ${ch.length} cofres`);
    for (let i = 0; i < ch.length; i++) for (let j = i + 1; j < ch.length; j++) assert.ok(Math.hypot(ch[i].tx - ch[j].tx, ch[i].ty - ch[j].ty) >= E.LOOT.chests.minGap);
    for (const c of ch) { tiers[c.tier] = (tiers[c.tier] || 0) + 1; assert.notEqual(L.rooms[c.room].type, 'start'); }
    if (ch.some(c => c.guarded)) assert.ok(L.enemies.some(e => e.guard));
  }
  assert.ok(tiers.cofre > tiers.cofrePlata && tiers.cofrePlata > (tiers.cofreRaro || 0) && tiers.cofreRaro > 0, JSON.stringify(tiers));
  const d = E.dungeonById('gruta'), r = seeded(3), stat = {};
  for (const t of ['cofre', 'cofrePlata', 'cofreRaro']) { let eq = 0, gems = 0, cons = 0, N = 2000; for (let i = 0; i < N; i++) { const x = E.Loot.roll(t, d, r); gems += x.gems > 0; cons += x.items.some(y => E.ITEMS[y.id].cat === 'consumible'); eq += x.items.some(y => E.ITEMS[y.id].cat === 'equipo'); } stat[t] = { eq: eq / N, gems: gems / N, cons: cons / N }; }
  assert.ok(stat.cofre.gems === 1 && stat.cofre.cons > .95, JSON.stringify(stat));
  assert.ok(stat.cofre.eq < stat.cofrePlata.eq && stat.cofrePlata.eq < stat.cofreRaro.eq && stat.cofre.eq > .1, JSON.stringify(stat));
});

test('servidor: un cofre se abre una sola vez aunque lleguen dos jugadores; el aviso lleva lo que había', () => {
  const x = new Expedition({ dungeonId: 'bosque', seed: 8, members: [{ id: 'a', name: 'A', profile: freshSave('guerrero') }, { id: 'b', name: 'B', profile: freshSave('mago') }], random: seeded(4) });
  x.drainEvents(); x.g.actors = x.g.actors.filter(a => !(a instanceof x.E.Enemy));
  const ch = x.objects.find(o => o.type === 'chest'); assert.ok(ch, 'hay cofre');
  for (const id of ['a', 'b']) { const p = x.members.get(id).player; p.placeAt(ch.x, ch.y + 4); }
  const items0 = x.items.size; run(x, .3); run(x, .3);
  const ev = x.drainEvents().filter(e => e.type === 'chest');
  assert.equal(ev.length, 1); assert.ok(ev[0].loot && (ev[0].loot.gems > 0 || ev[0].loot.items.length));
  assert.ok(x.items.size > items0 || ev[0].loot.items.length === 0, 'el botín aparece en el suelo, para el grupo');
  run(x, 1); assert.equal(x.drainEvents().filter(e => e.type === 'chest').length, 0, 'no se repite');
});

test('equipo por clase: seis huecos, clase y nivel validados en el servidor; las partidas antiguas pasan al accesorio', () => {
  assert.deepEqual(Object.keys(E.EQUIP_SLOTS), ['arma', 'armadura', 'casco', 'guantes', 'botas', 'accesorio']);
  for (const s of ['arma', 'armadura', 'casco', 'guantes', 'botas', 'accesorio']) assert.ok(Object.values(E.ITEMS).some(it => it.slot === s), s);
  for (const c of ['guerrero', 'arquero', 'mago', 'asesino']) assert.ok(Object.values(E.ITEMS).some(it => it.slot === 'arma' && it.classes.includes(c)), 'arma para ' + c);
  assert.ok(E.canEquip('guerrero', 1, E.ITEMS.espadaHierro).ok);
  assert.match(E.canEquip('mago', 10, E.ITEMS.espadaHierro).reason, /Guerrero/);
  assert.match(E.canEquip('guerrero', 3, E.ITEMS.espadaAcero).reason, /nivel 5/);
  const s = E.Save.sanitize(Object.assign(freshSave('mago'), { inv: [{ uid: 'w1', id: 'espadaHierro', qty: 1 }, { uid: 'w2', id: 'bastonRoble', qty: 1 }] })).data;
  assert.throws(() => applyOp(E, structuredClone(s), 'equip', { uid: 'w1' }), /Guerrero/);
  const ok = applyOp(E, structuredClone(s), 'equip', { uid: 'w2' }).save;
  assert.equal(ok.equip.arma.id, 'bastonRoble');
  assert.ok(E.finalStats(E.FORMS.mago.base, 1, ok.equip, null).spa === E.calcStats(E.FORMS.mago.base, 1).spa + 3);
  // Partida con los huecos antiguos
  const old = Object.assign(freshSave('guerrero'), { equip: { panuelo: { uid: 'a', id: 'panueloRojo' }, brazalete: { uid: 'b', id: 'brazalPiedra' }, talisman: null } });
  const m = E.Save.sanitize(old).data;
  assert.equal(m.equip.accesorio.id, 'panueloRojo'); assert.ok(m.inv.some(x => x.id === 'brazalPiedra'), 'el segundo va a la mochila');
  // Un objeto equipado que no es de su clase vuelve a la mochila
  const wrong = E.Save.sanitize(Object.assign(freshSave('arquero'), { equip: Object.assign(E.freshEquip(), { arma: { uid: 'z', id: 'espadaHierro' } }) })).data;
  assert.equal(wrong.equip.arma, null); assert.ok(wrong.inv.some(x => x.id === 'espadaHierro'));
});

test('red: ningún enemigo nuevo envía valores no numéricos (NaN) en su estado ni en sus avisos', () => {
  for (const d of E.DUNGEONS) {
    const x = new Expedition({ dungeonId: d.id, seed: 5, members: [{ id: 'a', name: 'A', profile: freshSave('guerrero') }], random: seeded(7) });
    const p = x.members.get('a').player; p.maxHp = p.hp = 1e9;
    for (let i = 0; i < 120 * 12; i++) {
      x.step(STEP);
      if (i % 240 === 0) { const en = x.g.actors.find(a => a instanceof x.E.Enemy && !a.dead); if (en) p.placeAt(en.x + 30, en.y); }
      for (const ev of x.drainEvents()) if (ev.type === 'eatk') assert.ok(Number.isFinite(ev.ax) && Number.isFinite(ev.ay), JSON.stringify(ev));
      for (const e of x.g.actors) if (e instanceof x.E.Enemy && e.atk && 'x' in e.atk) assert.ok(Number.isFinite(e.atk.x) && Number.isFinite(e.atk.y), `${e.kindId} ${e.state}`);
    }
    for (const e of x.g.actors) if (e instanceof x.E.Enemy && e.atk) assert.ok(Number.isFinite(e.atk.x ?? 0), e.kindId);
  }
});
