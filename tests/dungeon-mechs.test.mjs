/** Mazmorras con propósito (etapa 1: Bosque, capítulo 1): papeles de sala, plantillas, mecanismos, resolutor,
 *  minijefe, emboscadas y sincronización en línea. Comprueba que las rutas son válidas, que todo se puede
 *  resolver en solitario y que los objetos importantes son accesibles. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { Expedition } from '../server/src/sim/Expedition.js';
import { viewToState } from '../server/src/rooms/plainState.js';
import { E, freshSave, seeded, STEP } from './helpers.mjs';

const BOSQUE = E.dungeonById('bosque');
const gen = (seed, floor, size = 1, d = BOSQUE) => { const args = [seed, d, floor, 'normal', [], size], g = E.FloorGen.generate(...args); g.args = args; return g; };
/** Primer piso del Bosque cuya sala usa la plantilla pedida. */
function find(prefab, size = 1) {
  for (let seed = 1; seed < 400; seed++) for (let f = 1; f <= BOSQUE.floors; f++) {
    const g = gen(seed, f, size); const r = g.layout.rooms.find(q => q.prefab === prefab);
    if (r) return { g, r, seed, f };
  }
  throw new Error('no hay piso con ' + prefab);
}
const px = (W, i) => ({ x: (i % W + .5) * 32, y: (((i / W) | 0) + .5) * 32 });
function mk(g, extra = {}) {
  const hurt = [], spawned = [], acts = [];
  const host = Object.assign({ floorTile: g.biome.roomTile, actors: () => acts, players: () => acts.filter(a => a.cls), hurt: (a, o) => hurt.push([a, o]), spawn: (m, n) => { const out = []; for (let k = 0; k < n; k++) { const e = { alive: true, x: 0, y: 0, team: 'enemy' }; out.push(e); spawned.push(e); } return out; }, fx: () => {} }, extra);
  return { M: new E.Mechs(g.world, g.layout, host), hurt, spawned, acts };
}
const run = (M, s, players, actors) => { for (let i = 0; i < Math.round(s / .05); i++) M.update(.05, players, actors); };

test('generación del Bosque: todos los pisos válidos, resolubles en solitario, deterministas y con ids únicos', () => {
  let n = 0, mechs = 0;
  for (let seed = 1; seed <= 50; seed++) for (let f = 1; f <= BOSQUE.floors; f++) for (const size of [1, 2, 4]) {
    const g = gen(seed * 13 + size, f, size), c = g.validation.checks;
    assert.ok(g.validation.ok, `${seed}/${f}/${size}: ${JSON.stringify(Object.entries(c).filter(([k, v]) => !v && k !== 'mechDetail'))}`);
    for (const k of ['stairsReachable', 'roomsReachable', 'mechsSolvable', 'mechIdsUnique', 'mechsInside', 'loreReachable', 'chestsInRooms', 'spawnClear']) assert.equal(c[k], true, k);
    n++; mechs += g.layout.mechs.length;
  }
  const a = gen(777, 3, 2), b = gen(777, 3, 2);
  assert.equal(JSON.stringify(a.layout.mechs), JSON.stringify(b.layout.mechs), 'misma semilla ⇒ mismos mecanismos');
  assert.deepEqual([...a.world.tiles], [...b.world.tiles]);
  assert.equal(JSON.stringify(a.layout.lore), JSON.stringify(b.layout.lore));
  assert.ok(mechs > n, `hay mecanismos (${mechs} en ${n} pisos)`);
});

test('variedad: todas las plantillas y papeles aparecen; minijefe solo en el penúltimo piso, con su cofre oculto', () => {
  const pre = new Set(), roles = new Set();
  for (let seed = 1; seed <= 80; seed++) for (let f = 1; f <= BOSQUE.floors; f++) {
    const g = gen(seed, f, 1 + (seed % 4)), L = g.layout;
    L.rooms.forEach(r => { if (r.prefab) pre.add(r.prefab); if (r.role) roles.add(r.role); });
    const mini = L.enemies.filter(e => e.mini);
    if (f !== BOSQUE.floors - 1) assert.equal(mini.length, 0, 'minijefe fuera de su piso');
    for (const m of mini) {
      assert.equal(m.variant, 'zarza'); assert.equal(m.mini, 3); assert.equal(m.name, 'Zarzal Madre');
      const room = L.rooms.find(r => r.id === m.room); assert.equal(room.role, 'miniboss');
      assert.ok(L.objects.some(o => o.hiddenUntil === 'mini' && o.room === m.room), 'cofre del minijefe');
    }
  }
  for (const p of E.Prefabs.list) assert.ok(pre.has(p.id), 'plantilla sin usar: ' + p.id);
  for (const r of ['start', 'combat', 'puzzle', 'story', 'secret', 'trap', 'ambush', 'elite', 'rest', 'event', 'breakable', 'coop', 'miniboss']) assert.ok(roles.has(r), 'papel sin usar: ' + r);
});

test('etapa 1: los demás biomas siguen con el generador de siempre (sin mecanismos) y válidos', () => {
  for (const d of E.DUNGEONS) if (d.id !== 'bosque') for (let seed = 1; seed <= 8; seed++) {
    const g = gen(seed, 1 + (seed % 3), 1, d);
    assert.ok(g.validation.ok); assert.equal(g.layout.mechs.length, 0, d.id); assert.equal(g.layout.lore.length, 0, d.id);
  }
});

test('nichos: el camino principal no depende de ningún mecanismo; los premios quedan detrás de su mecanismo', () => {
  const { g, r } = find('raices_tiempo'), L = g.layout, W = L.w;
  const a = L.alcoves.find(q => q.room === r.id), chest = L.objects.find(o => o.alcove && o.room === r.id && o.tx === a.inner[0] && o.ty === a.inner[1]);
  assert.ok(chest, 'cofre en el fondo del nicho');
  const gate = L.mechs.find(m => m.type === 'gate' && m.room === r.id);
  assert.deepEqual(gate.tiles.slice().sort(), a.mouth.slice().sort(), 'la reja tapa la boca del nicho');
  // Con la reja cerrada, la escalera se alcanza igual (resolutor: stairsWithoutMechs)
  const S = E.MechSolver.solve(g.world, L);
  assert.equal(S.checks.stairsWithoutMechs, true); assert.equal(S.checks.noPermanentLock, true); assert.equal(S.checks.goalsReachable, true);
  assert.ok(W > 0);
});

test('resolutor: detecta premios inalcanzables y mecanismos sin solución', () => {
  const { g, r } = find('palanca_puente'), L = structuredClone(g.layout);
  const br = L.mechs.find(m => m.type === 'bridge' && m.room === r.id);
  br.inputs = ['no_existe'];
  const S = E.MechSolver.solve(g.world, L);
  assert.equal(S.ok, false); assert.equal(S.checks.goalsReachable, false);
  assert.ok(S.missing.length > 0, 'dice qué falta');
  // Dos placas de peso (solo en grupo) sin la palanca alternativa: no vale como solución en solitario
  const k = find('peso_compartido'), L2 = structuredClone(k.g.layout), gate = L2.mechs.find(m => m.type === 'gate' && m.room === k.r.id);
  gate.inputs = gate.inputs.filter(id => !id.startsWith('lv'));
  assert.equal(E.MechSolver.solve(k.g.world, L2).checks.goalsReachable, false, 'las placas de peso no cuentan en solitario');
});

test('placas de tiempo: las dos a tiempo abren y fijan la reja; si se apaga la primera, no', () => {
  const { g, r } = find('raices_tiempo'), L = g.layout, W = L.w;
  const plates = L.mechs.filter(m => m.type === 'plate' && m.room === r.id), gateL = L.mechs.find(m => m.type === 'gate' && m.room === r.id);
  // Tarde: se pisa la primera, se esperan 7 s y luego la segunda
  { const { M, acts } = mk(g), p = { alive: true, cls: true, x: 0, y: 0 }; acts.push(p);
    Object.assign(p, px(W, plates[0].ty * W + plates[0].tx)); run(M, .2, [p], acts);
    p.x = p.y = -999; run(M, 7, [p], acts);
    Object.assign(p, px(W, plates[1].ty * W + plates[1].tx)); run(M, .2, [p], acts);
    assert.equal(M.byId.get(gateL.id).open, false, 'demasiado tarde');
    assert.ok(gateL.tiles.every(i => g.world.isSolid(i % W, (i / W) | 0)), 'sigue bloqueando'); }
  // A tiempo: abre, desbloquea las casillas y se queda abierta
  const fresh = E.FloorGen.generate(...g.args), { M, acts } = mk(fresh), p = { alive: true, cls: true, x: 0, y: 0 }; acts.push(p);
  const W2 = fresh.layout.w;
  Object.assign(p, px(W2, plates[0].ty * W2 + plates[0].tx)); run(M, .2, [p], acts);
  p.x = p.y = -999; run(M, 2, [p], acts);
  Object.assign(p, px(W2, plates[1].ty * W2 + plates[1].tx)); run(M, .2, [p], acts);
  const gate = M.byId.get(gateL.id);
  assert.equal(gate.open, true); assert.ok(gate.tiles.every(i => !fresh.world.isSolid(i % W2, (i / W2) | 0)), 'paso libre');
  p.x = p.y = -999; run(M, 10, [p], acts);
  assert.equal(gate.open, true, 'fijada');
});

test('palanca y puente, raíces rompibles, pared falsa; los compañeros no tocan los mecanismos', () => {
  const pp = find('palanca_puente'), W = pp.g.layout.w, { M } = mk(pp.g);
  const lv = M.list.find(m => m.type === 'lever' && m.room === pp.r.id), br = M.list.find(m => m.type === 'bridge' && m.room === pp.r.id);
  assert.ok(br.tiles.every(i => pp.g.world.isSolid(i % W, (i / W) | 0)), 'agua sin puente: no se pasa');
  const c = M.center(lv);
  M.hit('player', c.x, c.y, 10, { cls: undefined }); run(M, .1, [], []);
  assert.equal(lv.on, false, 'un compañero (sin clase) no la mueve');
  M.hit('player', c.x, c.y, 10, { cls: 'guerrero' }); run(M, .1, [], []);
  assert.equal(lv.on, true); assert.equal(br.on, true);
  assert.ok(br.tiles.every(i => !pp.g.world.isSolid(i % W, (i / W) | 0)), 'el puente se cruza');
  run(M, .6, [], []); M.hit('shot', c.x, c.y, 6, null); run(M, .1, [], []);
  assert.equal(br.on, false, 'un disparo también la mueve'); assert.ok(br.tiles.every(i => pp.g.world.isSolid(i % W, (i / W) | 0)));
  run(M, .6, [], []); assert.equal(M.shotAt(c.x, c.y - 8, null), true, 'un disparo que pasa por encima la activa'); run(M, .1, [], []); assert.equal(br.on, true);

  const rr = find('raices_rompibles'), W2 = rr.g.layout.w, k = mk(rr.g), bk = k.M.list.find(m => m.type === 'breakable' && m.room === rr.r.id), bc = k.M.center(bk);
  for (let h = 0; h < bk.hp0 - 1; h++) { k.M.hit('player', bc.x, bc.y, 20, null); run(k.M, .3, [], []); }
  assert.equal(bk.broken, false); assert.ok(bk.tiles.every(i => rr.g.world.isSolid(i % W2, (i / W2) | 0)));
  k.M.hit('player', bc.x, bc.y, 20, null);
  assert.equal(bk.broken, true); assert.ok(bk.tiles.every(i => !rr.g.world.isSolid(i % W2, (i / W2) | 0)), 'rotas: paso libre');

  const fw = find('muro_agrietado'), W3 = fw.g.layout.w, set = [], k3 = mk(fw.g, { setTile: (i, t) => set.push([i, t]) }), wall = k3.M.list.find(m => m.type === 'falsewall'), wc = k3.M.center(wall);
  assert.ok(wall.tiles.every(i => fw.g.world.tiles[i] === E.T.SECRET));
  k3.M.hit('shot', wc.x, wc.y, 6, null); run(k3.M, .3, [], []); k3.M.hit('player', wc.x, wc.y, 10, null);
  assert.equal(wall.broken, true); assert.ok(wall.tiles.every(i => fw.g.world.tiles[i] === fw.g.biome.roomTile && !fw.g.world.isSolid(i % W3, (i / W3) | 0)));
  assert.equal(set.length, wall.tiles.length, 'avisa al dibujo de las casillas cambiadas');
});

test('raíces punzantes: hieren a jugadores y enemigos (no a los vecinos neutrales); la palanca las detiene', () => {
  const { g, r } = find('raices_punzantes'), W = g.layout.w, { M, hurt, acts } = mk(g);
  const sp = M.list.find(m => m.type === 'spikes' && m.room === r.id), lv = M.byId.get(sp.inputs[0]);
  const foe = Object.assign({ alive: true, team: 'enemy' }, px(W, sp.tiles[0])), npc = Object.assign({ alive: true, team: 'neutral' }, px(W, sp.tiles[1]));
  acts.push(foe, npc);
  run(M, sp.period * 1.2, [], acts);
  assert.ok(hurt.some(([a]) => a === foe), 'el enemigo se pincha'); assert.ok(!hurt.some(([a]) => a === npc), 'el vecino no');
  assert.equal(hurt[0][1].team, 'trap');
  const c = M.center(lv); M.hit('player', c.x, c.y, 10, null); run(M, .1, [], acts);
  hurt.length = 0; run(M, sp.period * 2, [], acts);
  assert.equal(hurt.length, 0, 'detenidas');
});

test('esporas: el veneno daña a todos en su zona hasta que se rompe la seta', () => {
  const { g, r } = find('esporas'), { M, hurt, acts } = mk(g);
  const hz = M.list.find(m => m.type === 'hazard' && m.room === r.id), sh = M.byId.get(hz.inputs[0]);
  const [rx, ry] = hz.rect, foe = { alive: true, team: 'enemy', x: (rx + .5) * 32, y: (ry + .5) * 32 };
  acts.push(foe); run(M, 1.2, [], acts);
  assert.ok(hurt.length >= 2 && hurt.every(([, o]) => o.dot && o.team === 'trap'));
  const c = M.center(sh); for (let h = 0; h < sh.hp0; h++) { M.hit('player', c.x, c.y, 20, null); run(M, .3, [], acts); }
  assert.equal(sh.broken, true); hurt.length = 0; run(M, 2, [], acts);
  assert.equal(hurt.length, 0, 'sin esporas');
});

test('emboscada: al entrar se cierran las salidas, aparece la oleada y se abre al vencerla', () => {
  let g = null, am = null;
  for (let seed = 1; seed < 300 && !am; seed++) for (let f = 2; f <= BOSQUE.floors && !am; f++) { g = gen(seed, f, 1); am = g.layout.mechs.find(m => m.type === 'ambush'); }
  assert.ok(am, 'hay emboscadas');
  const W = g.layout.w, { M, spawned, acts } = mk(g), m = M.byId.get(am.id), [rx, ry, rw, rh] = m.rect;
  const p = { alive: true, cls: true, x: (rx + rw / 2) * 32, y: (ry + rh / 2) * 32 }; acts.push(p);
  run(M, .2, [p], acts);
  assert.equal(m.state, 'armed'); assert.equal(spawned.length, m.wave);
  assert.ok(m.tiles.every(i => g.world.isSolid(i % W, (i / W) | 0)), 'salidas cerradas');
  spawned.forEach(e => e.alive = false); run(M, 2, [p], acts);
  assert.equal(m.state, 'done'); assert.ok(m.tiles.every(i => !g.world.isSolid(i % W, (i / W) | 0)), 'abiertas');
});

test('red: el estado serializado reproduce los mismos bloqueos en un cliente', () => {
  const pp = find('palanca_puente'), { M } = mk(pp.g), lv = M.list.find(m => m.type === 'lever');
  const c = M.center(lv); M.hit('player', c.x, c.y, 10, null); run(M, .1, [], []);
  const client = E.FloorGen.generate(...pp.g.args), K = new E.Mechs(client.world, client.layout, { fx: () => {}, setTile: (i, t) => { client.world.tiles[i] = t; } });
  K.apply(M.serialize());
  assert.deepEqual([...(client.world.blk || [])], [...(pp.g.world.blk || [])]);
  assert.deepEqual([...(client.world.pass || [])], [...(pp.g.world.pass || [])]);
  assert.equal(K.serialize().split(',').length, M.list.length);
});

// ---- Servidor: la expedición mueve los mecanismos y los envía en el estado ----
const party = n => ['guerrero', 'mago', 'arquero', 'asesino'].slice(0, n).map((sp, i) => ({ id: 'p' + i, name: 'J' + i, profile: freshSave(sp) }));
function expeditionWith(pred, n = 2) {
  for (let seed = 1; seed < 400; seed++) {
    const x = new Expedition({ dungeonId: 'bosque', seed, members: party(n), random: seeded(3) });
    for (let i = 0; i < x.seq.length; i++) { if (i) x.loadStep(i); if (pred(x)) return x; }
  }
  throw new Error('sin expedición');
}

test('servidor: un golpe real (Combat) mueve la palanca, el estado lo lleva y el cliente lo aplica', () => {
  const x = expeditionWith(x => x.mechs && x.mechs.list.some(m => m.type === 'lever'));
  const lv = x.mechs.list.find(m => m.type === 'lever'), c = x.mechs.center(lv), p = x.members.get('p0').player;
  const before = x.view().mech;
  x.E.Combat.circle(x.g, 'player', c.x, c.y, 20, { dmg: 1, src: p });
  assert.equal(lv.on, true);
  x.step(STEP);
  const v = x.view(); assert.notEqual(v.mech, before); assert.equal(viewToState(v).mech, v.mech, 'va en el estado de la sala');
  const f = x.floorInfo, client = E.FloorGen.generate(f.seed, E.dungeonById(f.dungeon), f.genNo, f.kind, [], f.size);
  const K = new E.Mechs(client.world, client.layout, { fx: () => {} }); K.apply(v.mech);
  assert.deepEqual([...(client.world.blk || [])], [...(x.world.blk || [])]);
  assert.deepEqual([...(client.world.pass || [])], [...(x.world.pass || [])]);
  // El aliado (sin clase) no la mueve
  x.g.onCombatArea('player', c.x, c.y, 20, { cls: undefined });
  for (let i = 0; i < 80; i++) x.step(STEP);
  x.g.onCombatArea('player', c.x, c.y, 20, { cls: undefined });
  assert.equal(x.mechs.byId.get(lv.id).on, true);
});

test('servidor: minijefe con el triple de PS; su cofre no existe para nadie hasta que cae', () => {
  const x = expeditionWith(x => x.g.actors.some(a => a.mini), 1);
  const mini = x.g.actors.find(a => a.mini);
  const ref = new x.E.Enemy(x.E.makeKind(mini.kindId || 'zarza'), 0, 0, { level: mini.level, elite: mini.elite, hpMul: x.dng.hpMul || 1 });
  x.scaleEnemy(ref);
  assert.ok(Math.abs(mini.maxHp / ref.maxHp - 3) < .05, `PS ×3 (${mini.maxHp} / ${ref.maxHp})`);
  const hidden = x.objects.find(o => o.hiddenUntil === 'mini');
  assert.ok(hidden); assert.ok(!x.view().objects.some(o => o.key === hidden.key), 'oculto en el estado');
  const m = x.members.get('p0'); m.player.placeAt(hidden.x, hidden.y); x.step(STEP);
  assert.equal(hidden.opened, false, 'no se puede abrir antes');
  mini.hp = 0; mini.alive = false; x.onEnemyDown(mini);
  assert.ok(x.view().objects.some(o => o.key === hidden.key)); x.step(STEP);
  assert.equal(hidden.opened, true, 'ahora sí');
  assert.ok(x.drainEvents().some(e => e.type === 'miniDown'));
});

test('servidor: el altar cambia vida por daño solo a quien lo usa, una vez, y se reinicia al cambiar de piso', () => {
  const x = expeditionWith(x => x.mechs && x.mechs.list.some(m => m.type === 'altar'));
  const al = x.mechs.list.find(m => m.type === 'altar'), c = x.mechs.center(al), p = x.members.get('p0').player, q = x.members.get('p1').player;
  p.placeAt(c.x + 10, c.y); q.placeAt(c.x + 200, c.y);
  const hp = p.hp, dm = p.dmgMul;
  x.E.Combat.circle(x.g, 'player', c.x, c.y, 20, { dmg: 1, src: p });
  assert.equal(p.altarMul, 1.2); assert.ok(Math.abs(p.dmgMul / dm - 1.2) < 1e-9); assert.ok(p.hp < hp);
  assert.equal(q.altarMul, 1, 'al otro no');
  const hp2 = p.hp; for (let i = 0; i < 80; i++) x.step(STEP); x.E.Combat.circle(x.g, 'player', c.x, c.y, 20, { dmg: 1, src: p });
  assert.ok(p.hp >= hp2, 'una vez por jugador');
  x.loadStep(x.stepIdx + 1); assert.equal(p.altarMul, 1);
});

test('peso compartido: en grupo, dos placas a la vez; en solitario, romper las raíces y usar la palanca', () => {
  const k = find('peso_compartido'), W = k.g.layout.w;
  const ids = M => ({ gate: M.list.find(m => m.type === 'gate' && m.room === k.r.id), plates: M.list.filter(m => m.type === 'plate' && m.room === k.r.id), lv: M.list.find(m => m.type === 'lever' && m.room === k.r.id), bk: M.list.find(m => m.type === 'breakable' && m.room === k.r.id) });
  { // grupo: una sola placa no basta; las dos a la vez sí (y queda fijada)
    const { M, acts } = mk(k.g), { gate, plates } = ids(M), a = { alive: true, cls: true }, b = { alive: true, cls: true };
    Object.assign(a, px(W, plates[0].ty * W + plates[0].tx)); acts.push(a); run(M, .3, [a], acts);
    assert.equal(gate.open, false, 'una placa no basta');
    Object.assign(b, px(W, plates[1].ty * W + plates[1].tx)); acts.push(b); run(M, .3, [a, b], acts);
    assert.equal(gate.open, true); a.x = b.x = -999; run(M, 2, [a, b], acts); assert.equal(gate.open, true, 'fijada');
  }
  { // solo: la palanca está tras raíces rompibles
    const g = E.FloorGen.generate(...k.g.args), { M } = mk(g), { gate, lv, bk } = ids(M);
    const al = g.layout.alcoves.find(q => q.inner[0] === lv.tx && q.inner[1] === lv.ty), lc = M.center(lv), bc = M.center(bk);
    const dir = [[-1, 0], [1, 0], [0, -1], [0, 1]][al.side], from = { x: bc.x + dir[0] * 32, y: bc.y + dir[1] * 32 }, reach = Math.hypot(lc.x - from.x, lc.y - from.y);
    M.hit('player', from.x, from.y, reach, null); run(M, .1, [], []);
    assert.equal(lv.on, false, 'a través de las raíces no se alcanza');
    for (let h = 0; h < bk.hp0; h++) { M.hit('player', bc.x, bc.y, 20, null); run(M, .3, [], []); }
    assert.equal(bk.broken, true);
    run(M, .6, [], []); M.hit('player', bc.x, bc.y, Math.hypot(lc.x - bc.x, lc.y - bc.y), null); run(M, .1, [], []);   // desde la boca, ya abierta
    assert.equal(lv.on, true); assert.equal(gate.open, true, 'abre en solitario');
  }
});
