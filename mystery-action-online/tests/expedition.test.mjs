import test from 'node:test';
import assert from 'node:assert/strict';
import { Expedition, ASSIST_R } from '../server/src/sim/Expedition.js';
import { parseInput, MAX_INPUT_BACKLOG } from '../shared/protocol.js';
import { E, freshSave, seeded, STEP } from './helpers.mjs';

const party = (n = 2, patch = {}) => ['voltrino', 'magmolo', 'aurin', 'voltrino'].slice(0, n).map((sp, i) => ({ id: 'p' + i, name: 'J' + i, profile: freshSave(sp, patch) }));
const make = (o = {}) => new Expedition(Object.assign({ dungeonId: 'bosque', seed: 99, members: party(o.n || 2), random: seeded(3) }, o));
/** Envía `n` muestras con el mismo eje (y acciones opcionales en la primera), como haría el cliente. */
function feed(x, id, n, ax, ay, actions = []) {
  const m = x.members.get(id), s = m.nextSeq;
  for (let k = 0; k < n; k += 16) {
    const len = Math.min(16, n - k);
    x.applyInput(id, parseInput({ s: s + k, m: Array(len).fill([ax, ay]), a: k === 0 ? actions.map(a => Object.assign({ at: s }, a)) : [] }));
  }
}
const run = (x, seconds) => { for (let i = 0; i < Math.round(seconds / STEP); i++) x.step(STEP); };
const clearEnemies = x => { x.g.actors = x.g.actors.filter(a => !(a instanceof x.E.Enemy)); };
const P = (x, id) => x.members.get(id).player;

test('hasta 4 jugadores, cada uno con su propio perfil y su criatura', () => {
  const x = make({ n: 4 });
  assert.deepEqual([...x.members.values()].map(m => m.player.sp.id), ['voltrino', 'magmolo', 'aurin', 'voltrino']);
  assert.throws(() => new Expedition({ dungeonId: 'bosque', seed: 1, members: [...party(4), { id: 'p4', name: 'x', profile: freshSave() }] }), /jugadores/);
  assert.throws(() => new Expedition({ dungeonId: 'bosque', seed: 1, members: [{ id: 'a', name: 'x', profile: { species: 'pikachu' } }] }), /Perfil/);
  const lv = freshSave('aurin'); lv.prog.level = 12;
  const y = new Expedition({ dungeonId: 'bosque', seed: 1, members: [{ id: 'a', name: 'A', profile: lv }, { id: 'b', name: 'B', profile: freshSave() }] });
  assert.equal(P(y, 'a').level, 12); assert.equal(P(y, 'b').level, 5);
  assert.ok(P(y, 'a').maxHp > P(y, 'b').maxHp);
});

test('el piso del servidor es el mismo que genera el cliente con la semilla enviada', () => {
  const x = make(), f = x.floorInfo;
  const client = E.FloorGen.generate(f.seed, E.dungeonById(f.dungeon), f.genNo, f.kind, [], f.size);
  assert.deepEqual([...client.world.tiles], [...x.world.tiles]);
  assert.equal(client.world.w, f.w);
});

test('movimiento validado: el eje se limita, la velocidad la pone el motor y no se atraviesan muros', () => {
  const x = make(); clearEnemies(x);
  const p = P(x, 'p0'), x0 = p.x, y0 = p.y;
  // Un cliente tramposo pide eje 50: se normaliza a 1
  x.applyInput('p0', parseInput({ s: 0, m: Array(16).fill([50, 0]) }));
  run(x, 16 * STEP);
  const v = Math.hypot(p.x - x0, p.y - y0) / (16 * STEP);
  assert.ok(v <= p.moveSpeed() + 1, `velocidad ${v} > ${p.moveSpeed()}`);
  // Inundar con muestras no adelanta el reloj: la cola está limitada
  const m = x.members.get('p0'); let accepted = 0;
  for (let k = 0; k < 40; k++) accepted += x.applyInput('p0', parseInput({ s: m.nextSeq, m: Array(16).fill([1, 0]) }));
  assert.ok(m.queue.length <= MAX_INPUT_BACKLOG && accepted <= MAX_INPUT_BACKLOG, `aceptadas ${accepted}`);
  // Andar contra un muro durante 3 s: nunca dentro de una casilla sólida
  for (const dir of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    for (let t = 0; t < 360; t += 16) feed(x, 'p0', 16, dir[0], dir[1]);
    for (let i = 0; i < 360; i++) { x.step(STEP); assert.ok(p.free(x.world, p.x, p.y), `dentro de muro en ${p.x},${p.y}`); }
  }
});

test('sin muestras el jugador se para (el servidor no repite la última entrada)', () => {
  const x = make(); clearEnemies(x);
  const p = P(x, 'p0');
  feed(x, 'p0', 12, 1, 0); run(x, .5);
  const xa = p.x; run(x, .5);
  assert.ok(Math.abs(p.x - xa) < 3, 'se ha seguido moviendo sin entrada');
});

test('ataques validados por el servidor: cargas del básico, enfriamientos y energía', () => {
  const x = make(); clearEnemies(x);
  const p = P(x, 'p0'), m = x.members.get('p0');
  // 12 básicos seguidos (uno por muestra): solo caben las cargas disponibles
  x.applyInput('p0', parseInput({ s: m.nextSeq, m: Array(12).fill([0, 0]), a: Array.from({ length: 12 }, (_, i) => ({ at: m.nextSeq + i, k: 'b', dx: 1, dy: 0 })) }));
  x.drainEvents(); run(x, 12 * STEP);
  const ev = x.drainEvents(), casts = ev.filter(e => e.type === 'cast' && e.k === 'b').length;
  assert.ok(casts >= 1 && casts <= E.CONFIG.BASIC_CHARGES, `básicos aceptados: ${casts}`);
  assert.ok(ev.some(e => e.type === 'reject' && e.what === 'basic'));
  // El mismo movimiento dos veces seguidas: el segundo está en enfriamiento
  run(x, 1);
  feed(x, 'p0', 2, 0, 0, [{ k: 'm', i: 0, dx: 1, dy: 0 }]);
  x.applyInput('p0', parseInput({ s: m.nextSeq, m: [[0, 0]], a: [{ at: m.nextSeq, k: 'm', i: 0, dx: 1, dy: 0 }] }));
  x.drainEvents(); run(x, 4 * STEP);
  const e2 = x.drainEvents();
  assert.equal(e2.filter(e => e.type === 'cast' && e.k === 'm').length, 1);
  assert.ok(e2.some(e => e.type === 'reject' && e.what === 'move0'));
  // Sin energía no hay movimiento especial
  run(x, 10); p.energy = 0; p.cds = [0, 0, 0, 0];
  feed(x, 'p0', 1, 0, 0, [{ k: 'm', i: 1, dx: 1, dy: 0 }]); x.drainEvents(); run(x, 2 * STEP);
  assert.ok(x.drainEvents().some(e => e.type === 'reject' && e.what === 'move1'));
});

test('daño calculado en el servidor con la fórmula del juego; la experiencia se da una vez por enemigo y jugador', () => {
  const x = make(); clearEnemies(x);
  const a = P(x, 'p0'), b = P(x, 'p1');
  const e = x.addEnemy(new x.E.Enemy(x.E.makeKind('pufon'), a.x + 60, a.y, { level: 3 }), 'v:pufon');
  e.kind = Object.assign({}, e.kind, { brain: () => x.E.STOP });       // quieto, para medir
  const hp0 = e.hp;
  feed(x, 'p0', 1, 0, 0, [{ k: 'b', dx: 1, dy: 0, d: 60 }]);
  run(x, .5);
  const dmg = hp0 - e.hp;
  const m = E.MOVES[a.sp.basic], expect = m.power * (a.stats.spa / e.stats.spd) * (.4 + .04 * a.level) * 1.25 * E.typeEff(m.type, e.type);
  assert.ok(dmg >= 1 && Math.abs(dmg - Math.max(1, Math.round(expect))) <= 1, `daño ${dmg}, esperado ≈ ${expect.toFixed(1)}`);
  // Rematar: experiencia para los dos jugadores, una sola vez
  const ex0 = [x.members.get('p0').save.prog.exp, x.members.get('p1').save.prog.exp];
  x.E.Combat.hit(x.g, e, { team: 'player', dmg: 9999, src: a }); x.E.Combat.hit(x.g, e, { team: 'player', dmg: 9999, src: a });
  x.onEnemyDown(e);
  const gained = [x.members.get('p0').run.exp, x.members.get('p1').run.exp];
  assert.ok(gained[0] > 0 && gained[1] > 0);
  assert.equal(gained[0], E.expYield(e, a.level), 'quien golpea recibe toda la experiencia');
  assert.equal(gained[1], Math.max(1, Math.round(E.expYield(e, b.level) * .5)), 'quien está cerca sin golpear recibe la mitad');
  assert.equal(x.drainEvents().filter(v => v.type === 'enemyDown').length, 1);
  void ex0;
});

test('los enemigos del servidor persiguen y dañan a cualquiera de los jugadores', () => {
  const x = make(); clearEnemies(x);
  const a = P(x, 'p0'), b = P(x, 'p1'); b.placeAt(a.x + 300, a.y); if (!b.free(x.world, b.x, b.y)) b.placeAt(a.x, a.y);
  const e = x.addEnemy(new x.E.Enemy(x.E.makeKind('mordisquin'), b.x + 40, b.y, { level: 6 }), 'v:mordisquin'); e.aggro = true;
  const hp = [a.hp, b.hp];
  run(x, 6);
  assert.ok(a.hp < hp[0] || b.hp < hp[1], 'nadie ha recibido daño');
  assert.ok(e.target === a || e.target === b);
});

test('botín: se recoge solo cerca, las monedas son de quien las coge y un cofre se abre una vez', () => {
  const x = make(); clearEnemies(x);
  const a = P(x, 'p0'), b = P(x, 'p1');
  b.placeAt(a.x, a.y + 200); if (!b.free(x.world, b.x, b.y)) b.placeAt(a.x - 1, a.y);
  x.items.clear();
  x.items.set('t1', { key: 't1', id: 'gems', amount: 25, x: a.x + 10, y: a.y, tx: 0, ty: 0 });
  x.items.set('t2', { key: 't2', id: 'pocion', amount: 1, x: a.x + 400, y: a.y + 400, tx: 0, ty: 0 });
  const potions = a.bag.count('pocion');
  run(x, .1);
  assert.equal(x.members.get('p0').run.gems, 25); assert.equal(x.members.get('p1').run.gems, 0);
  assert.ok(!x.items.has('t1') && x.items.has('t2'));
  assert.equal(a.bag.count('pocion'), potions);
  const chest = { key: 'c', type: 'chest', tier: 'cofre', tx: 0, ty: 0, x: a.x, y: a.y + 5, opened: false };
  x.objects.push(chest); const before = x.items.size;
  run(x, .5); run(x, .5);
  assert.ok(chest.opened); assert.ok(x.items.size > before);
  assert.equal(x.drainEvents().filter(e => e.type === 'chest').length, 1);
});

test('objetos: el servidor comprueba que lo llevas y que tiene efecto', () => {
  const x = make(); clearEnemies(x);
  const p = P(x, 'p0'), n = p.bag.count('pocion');
  assert.equal(x.use('p0', 'pocion'), false);              // PS completos: sin efecto, no se gasta
  assert.equal(p.bag.count('pocion'), n);
  p.hp = 5; assert.equal(x.use('p0', 'pocion'), true); assert.equal(p.bag.count('pocion'), n - 1); assert.ok(p.hp > 5);
  assert.equal(x.use('p0', 'superpocion'), false);          // no la lleva
  assert.equal(x.use('p0', 'orbeEscape'), false);           // necesita el piso local: no se permite online
});

test('escalera: un jugador solo no hace bajar al grupo; con todos, avanza el piso', () => {
  const x = make(); clearEnemies(x);
  const s = x.L.stairs, sx = (s.tx + .5) * 32, sy = (s.ty + .5) * 32;
  P(x, 'p0').placeAt(sx, sy); run(x, .5);
  assert.equal(x.floorInfo.n, 1);
  assert.ok(x.drainEvents().some(e => e.type === 'waiting'));
  P(x, 'p1').placeAt(sx + 4, sy); run(x, .2);
  assert.equal(x.floorInfo.n, 2); assert.equal(x.floorInfo.floorNo, 2);
});

test('caer y reanimar: un compañero al lado durante 2,5 s; si caen todos, la expedición falla', () => {
  const x = make(); clearEnemies(x);
  const a = P(x, 'p0'), b = P(x, 'p1');
  x.E.Combat.hit(x.g, a, { team: 'enemy', dmg: 1, pct: 2, dot: true }); run(x, STEP);
  assert.equal(a.alive, false); assert.ok(x.members.get('p0').downed);
  b.placeAt(a.x + 10, a.y); run(x, 2.7);
  assert.equal(a.alive, true); assert.ok(a.hp > 0);
  x.E.Combat.hit(x.g, a, { team: 'enemy', dmg: 1, pct: 2, dot: true }); run(x, STEP); run(x, .1);
  x.E.Combat.hit(x.g, b, { team: 'enemy', dmg: 1, pct: 2, dot: true }); run(x, .1);
  assert.equal(x.ended.result, 'faint');
});

test('derrota: se pierden las monedas de la expedición y la mitad del inventario, nunca el nivel', () => {
  const x = make(); clearEnemies(x);
  const m = x.members.get('p0'), lv = m.save.prog.level, stacks = m.player.bag.stacks.length, bank = m.save.bank;
  m.run.gems = 40; x.gainExp(m, 30);
  x.finish('faint');
  const r = x.ended.results.get('p0');
  assert.equal(r.success, false); assert.equal(r.profile.bank, bank);
  assert.equal(r.profile.inv.length, stacks - Math.floor(stacks / 2));
  assert.ok(r.profile.prog.level >= lv);
  assert.ok(E.Save.sanitize(r.profile).ok);
});

test('victoria: derrotar al guardián abre la salida; con todos en ella se cobra y se marca la mazmorra', () => {
  const x = make();
  while (x.floorInfo.kind !== 'boss') x.nextStep();
  assert.ok(x.boss && x.boss.kind.isBoss);
  x.drainEvents();
  x.E.Combat.hit(x.g, x.boss, { team: 'player', dmg: 1e6, src: P(x, 'p0') });
  const warp = x.objects.find(o => o.type === 'warp'); assert.ok(warp);
  clearEnemies(x);
  const m0 = x.members.get('p0'); m0.run.gems = 50; const bank = m0.save.bank;
  P(x, 'p0').placeAt(warp.x, warp.y); P(x, 'p1').placeAt(warp.x + 6, warp.y);
  run(x, .1);
  assert.equal(x.ended.result, 'clear');
  const r = x.ended.results.get('p0');
  assert.ok(r.success); assert.equal(r.profile.bank, bank + 50); assert.ok(r.profile.cleared.includes('bosque'));
  assert.ok(r.summary.exp >= 80);
});

test('desconexión: el jugador queda inmóvil e intocable y la partida espera; al volver sigue', () => {
  const x = make();
  const a = P(x, 'p0'), b = P(x, 'p1');
  clearEnemies(x);
  x.setConnected('p0', false);
  assert.equal(x.E.Combat.hit(x.g, a, { team: 'enemy', dmg: 50 }), false);
  feed(x, 'p0', 16, 1, 0);
  const ax = a.x; run(x, .3); assert.equal(a.x, ax);
  // Si nadie más está despierto, los enemigos se congelan
  x.setConnected('p1', false);
  const e = x.addEnemy(new x.E.Enemy(x.E.makeKind('mordisquin'), b.x + 50, b.y, { level: 4 }), 'v:mordisquin'); e.aggro = true;
  const ex = e.x; run(x, 1); assert.equal(e.x, ex);
  assert.equal(x.ended, null);
  x.setConnected('p0', true); x.setConnected('p1', true);
  feed(x, 'p0', 16, 1, 0); run(x, .2);
  assert.ok(a.x !== ax || !a.free(x.world, ax + 1, a.y));
  assert.deepEqual(x.drainEvents().filter(v => v.type === 'dropped' || v.type === 'reconnected').map(v => v.type), ['dropped', 'dropped', 'reconnected', 'reconnected']);
});

test('quien abandona recibe su resultado de retirada y los demás siguen', () => {
  const x = make(); clearEnemies(x);
  x.members.get('p1').run.gems = 30;
  const r = x.removeMember('p1');
  assert.equal(r.result, 'abandon'); assert.equal(r.success, false);
  assert.equal(x.ended, null);
  assert.equal(x.humans.length, 1);
  assert.equal(x.view().players.length, 1);
});

test('vista para la red: serializable, sin referencias al motor y de tamaño razonable', () => {
  const x = make({ n: 4 });
  for (let i = 0; i < 4; i++) feed(x, 'p' + i, 120, 1, 0, [{ k: 'b', dx: 1, dy: 0 }]);
  run(x, 1);
  const v = x.view(), json = JSON.stringify(v);
  assert.equal(JSON.stringify(JSON.parse(json)), json);
  assert.equal(v.players.length, 4);
  assert.ok(json.length < 20000, `vista de ${json.length} bytes`);
  for (const p of v.players) for (const k of ['x', 'y', 'hp', 'maxHp', 'ack', 'energy']) assert.ok(Number.isFinite(p[k]), k);
});

test('rendimiento: 4 jugadores con combate, 120 pasos por segundo con margen', () => {
  const x = make({ n: 4 });
  const t0 = performance.now();
  for (let s = 0; s < 10; s++) { for (let i = 0; i < 4; i++) feed(x, 'p' + i, 120, Math.cos(s + i), Math.sin(s + i), [{ k: 'b', dx: 1, dy: 0 }, { k: 'm', i: s % 4, dx: 0, dy: 1 }]); run(x, 1); }
  const ms = (performance.now() - t0) / 10;
  assert.ok(ms < 250, `${ms.toFixed(1)} ms por segundo simulado`);
  console.log(`# simulación: ${ms.toFixed(1)} ms de CPU por segundo de juego (4 jugadores)`);
});

test('participación: lejos, caído o desconectado no recibe experiencia; dos atacantes la reciben entera', () => {
  const x = make({ n: 4 }); clearEnemies(x);
  const [a, b, c, d] = [0, 1, 2, 3].map(i => P(x, 'p' + i));
  const e = x.addEnemy(new x.E.Enemy(x.E.makeKind('pedrolon'), a.x + 40, a.y, { level: 4 }), 'v:pedrolon');
  e.kind = Object.assign({}, e.kind, { brain: () => x.E.STOP });
  c.x = a.x + ASSIST_R + 200; c.y = a.y;                                         // lejos
  x.E.Combat.hit(x.g, d, { team: 'enemy', dmg: 1, pct: 5, dot: true }); run(x, STEP);   // caído
  x.E.Combat.hit(x.g, e, { team: 'player', dmg: 3, src: a });
  x.E.Combat.hit(x.g, e, { team: 'player', dmg: 99999, src: b });              // golpe final de B
  const r = id => x.members.get(id).rewards;
  assert.ok(r('p0').exp === x.E.expYield(e, a.level) && r('p1').exp === x.E.expYield(e, b.level), 'los dos que golpean, completa');
  assert.equal(r('p2').exp, 0, 'lejos: nada'); assert.equal(r('p3').exp, 0, 'caído: nada');
  assert.ok(r('p0').damage > 0 && r('p1').damage > r('p0').damage);
  assert.equal(r('p1').defeated, 1);
});

test('datos separados: cada integrante lleva su propia copia del perfil; nada se comparte por referencia', () => {
  const host = freshSave('voltrino', { bank: 900 }); host.prog = E.Progress.fresh('voltrino', 14); host.inv = [{ uid: 'iH', id: 'superpocion', qty: 3 }];
  const guest = freshSave('magmolo', { bank: 15 }); guest.prog = E.Progress.fresh('magmolo', 6); guest.inv = [{ uid: 'iG', id: 'manzana', qty: 1 }];
  const x = new Expedition({ dungeonId: 'bosque', seed: 5, members: [{ id: 'h', accountId: 'u_host', name: 'H', profile: host }, { id: 'g', accountId: 'u_guest', name: 'G', profile: guest }] });
  const H = x.members.get('h'), G = x.members.get('g');
  assert.notEqual(H.profile, G.profile); assert.notEqual(H.profile.prog, G.profile.prog); assert.notEqual(H.profile.inv, G.profile.inv);
  assert.notEqual(H.profile, host, 'la expedición trabaja con una copia, no con el objeto recibido');
  assert.deepEqual([H.player.sp.id, H.player.level, G.player.sp.id, G.player.level], ['voltrino', 14, 'magmolo', 6]);
  assert.ok(H.player.maxHp > G.player.maxHp);
  assert.deepEqual(G.player.bag.stacks.map(s => s.id), ['manzana']);
  const sh = x.shared();
  for (const k of ['expeditionId', 'dungeon', 'seed', 'floor', 'enemies']) assert.ok(k in sh, k);
  assert.ok(!('profile' in sh) && !JSON.stringify(sh).includes('superpocion'));
  x.members.get('g').rewards.gems = 40; x.finish('return');
  const rh = x.ended.results.get('h'), rg = x.ended.results.get('g');
  assert.equal(rh.accountId, 'u_host'); assert.equal(rg.accountId, 'u_guest');
  assert.equal(rh.profile.bank, 900); assert.equal(rg.profile.bank, 55);
  assert.equal(rh.profile.species, 'voltrino'); assert.equal(rg.profile.species, 'magmolo');
  assert.equal(rh.expeditionId, x.id); assert.equal(host.bank, 900, 'el objeto original no se modifica');
});

test('misiones: cada jugador avanza las SUYAS (cazar, recoger y explorar)', () => {
  const mk = sp => { const s = freshSave(sp); s.jobs = [{ id: 1, type: 'hunt', dungeon: 'bosque', client: 'Lumi', stars: 'E', target: 'pufon', goal: 1, progress: 0, state: 'accepted', reward: { exp: 30, gems: 40, item: 'manzana', points: 10 } }]; return E.Save.sanitize(s).data; };
  const x = new Expedition({ dungeonId: 'bosque', seed: 8, members: [{ id: 'a', name: 'A', profile: mk('voltrino') }, { id: 'b', name: 'B', profile: freshSave('aurin') }] }); clearEnemies(x);
  const a = P(x, 'a'), e = x.addEnemy(new x.E.Enemy(x.E.makeKind('pufon'), a.x + 30, a.y, { level: 3 }), 'v:pufon');
  x.E.Combat.hit(x.g, e, { team: 'player', dmg: 99999, src: a });
  assert.equal(x.members.get('a').save.jobs[0].state, 'done');
  assert.equal(x.members.get('b').save.jobs.length, 0, 'B no tenía esa misión: no se le añade nada');
  assert.ok(x.drainEvents().some(v => v.type === 'quest' && v.to === 'a'));
});

/* ---------- Combate en tiempo real: mundo compartido y ataques sin duplicar ---------- */
const stepIdx = (x, floorNo, kind = 'normal') => x.seq.findIndex(s => s.floorNo === floorNo && s.kind === kind);
const events = (x, type) => x.events.filter(e => e.type === type);
/** Casilla libre a menos de `r` px de (x, y) para colocar a un jugador. */
function freeNear(x, px, py, r = 48) {
  for (let d = 20; d <= r; d += 4) for (let a = 0; a < 16; a++) { const tx = px + Math.cos(a / 16 * 6.283) * d, ty = py + Math.sin(a / 16 * 6.283) * d; if (P(x, 'p0').free(x.world, tx, ty)) return [tx, ty]; }
  throw new Error('sin hueco libre');
}

test('puertas con llave: estado compartido, la abre quien lleva la llave (de SU mochila) y solo una vez', () => {
  const x = make({ seed: 22 }); x.loadStep(stepIdx(x, 2)); clearEnemies(x); x.drainEvents();
  assert.ok(x.doors.length >= 1, 'el piso 2 de la semilla 22 (2 jugadores) tiene cámara del tesoro');
  const dr = x.doors[0], p0 = P(x, 'p0'), p1 = P(x, 'p1');
  assert.ok(dr.tiles.every(i => x.world.tiles[i] === x.E.T.DOOR), 'cerrada: casillas sólidas');
  p0.bag.take('llave', p0.bag.count('llave')); p1.bag.take('llave', p1.bag.count('llave'));
  const [ax, ay] = freeNear(x, dr.x, dr.y); p0.placeAt(ax, ay);
  run(x, .2);
  assert.equal(dr.open, false, 'sin llave no se abre');
  assert.equal(events(x, 'reject').filter(e => e.what === 'door' && e.to === 'p0').length, 1, 'aviso (limitado) a quien no tiene llave');
  p0.bag.add('llave', 1); p1.bag.add('llave', 1); x.drainEvents();
  run(x, .5);
  assert.equal(dr.open, true);
  assert.ok(dr.tiles.every(i => x.world.tiles[i] === x.corrTile && !x.E.SOLID[x.world.tiles[i]]), 'abierta: se puede pasar (también para los enemigos y los disparos)');
  assert.equal(events(x, 'door').length, 1, 'un solo evento de apertura');
  assert.equal(events(x, 'door')[0].by, 'p0');
  assert.equal(p0.bag.count('llave'), 0, 'gasta la llave de quien abre');
  assert.equal(p1.bag.count('llave'), 1, 'la del compañero no se toca');
  const [bx, by] = freeNear(x, dr.x, dr.y); p1.placeAt(bx, by); run(x, .5);
  assert.equal(p1.bag.count('llave'), 1, 'una puerta abierta no gasta más llaves');
  assert.deepEqual(x.view().doors, x.doors.map(d => ({ key: d.key, open: d.open })));
  assert.deepEqual(x.shared().doors[0], { key: dr.key, open: true });
});

test('cada acción tiene un número: una acción repetida nunca se aplica dos veces', () => {
  const hitsFor = repeat => {
    const x = make({ seed: 5 }); clearEnemies(x);
    const p = P(x, 'p0'), e = new x.E.Enemy(x.E.makeKind(Object.keys(x.dng.enemies)[0]), p.x + 30, p.y, { level: 3 });
    e.maxHp = e.hp = 5000; e.aggro = false; e.update = function (dt) { this.flash = 0; }; x.addEnemy(e, 'v:dummy');
    let hits = 0; const orig = x.E.Combat.hit;
    x.E.Combat.hit = function (g, t, o) { const r = orig.call(this, g, t, o); if (t === e && r) hits++; return r; };
    const act = { n: 1, at: 0, k: 'b', dx: 1, dy: 0 };
    x.applyInput('p0', parseInput({ s: 0, m: Array(16).fill([0, 0]), a: [act] }));
    for (let k = 0; k < repeat; k++) x.applyInput('p0', parseInput({ s: 0, m: Array(16).fill([0, 0]), a: [act] }));      // mismo mensaje otra vez
    run(x, .3);
    // la misma acción (mismo n) en un mensaje nuevo, ya fuera de enfriamiento: se descarta
    for (let k = 0; k < repeat; k++) { const s = x.members.get('p0').nextSeq; x.applyInput('p0', parseInput({ s, m: Array(16).fill([0, 0]), a: [Object.assign({}, act, { at: s })] })); run(x, 1); }
    run(x, 1);
    x.E.Combat.hit = orig;
    const m = x.members.get('p0');
    return { hits, casts: m.stats.casts, dup: m.stats.duplicates, aids: events(x, 'cast').map(c => c.aid), hp: e.hp };
  };
  const once = hitsFor(0), many = hitsFor(3);
  assert.ok(once.hits >= 1, 'el ataque golpea');
  assert.equal(many.hits, once.hits, 'mismos golpes aunque el mensaje llegue repetido');
  assert.equal(many.casts, 1); assert.equal(many.dup, 3, 'las 3 repeticiones con número viejo se descartan');
  assert.deepEqual(many.aids, ['p0:1'], 'un único evento de ataque con identificador propio');
  assert.equal(many.hp, once.hp);
  // Las acciones siguientes (n mayor) sí se aplican
  const x = make({ seed: 5 }); clearEnemies(x);
  feed(x, 'p0', 16, 0, 0, [{ n: 1, k: 'b', dx: 1, dy: 0 }]); run(x, 1);
  feed(x, 'p0', 16, 0, 0, [{ n: 2, k: 'b', dx: 0, dy: 1 }]); run(x, 1);
  assert.deepEqual(events(x, 'cast').map(c => c.aid), ['p0:1', 'p0:2']);
  assert.deepEqual(x.resumeInfo('p0'), { seq: x.members.get('p0').nextSeq, act: 2 }, 'al volver desde otro dispositivo se sigue la numeración');
});

test('dos jugadores golpean a la vez al mismo enemigo: una sola muerte, un solo botín, experiencia una vez a cada uno', () => {
  const x = make({ seed: 8 }); clearEnemies(x); x.drainEvents();
  const p0 = P(x, 'p0'), p1 = P(x, 'p1');
  const e = new x.E.Enemy(x.E.makeKind(Object.keys(x.dng.enemies)[0]), p0.x + 26, p0.y, { level: 2 });
  x.addEnemy(e, 'v:' + Object.keys(x.dng.enemies)[0]); e.hp = 1;
  p1.placeAt(p0.x + 52, p0.y);
  const items0 = x.items.size, exp0 = [x.members.get('p0').rewards.exp, x.members.get('p1').rewards.exp];
  feed(x, 'p0', 16, 0, 0, [{ n: 1, k: 'b', dx: 1, dy: 0 }]);
  feed(x, 'p1', 16, 0, 0, [{ n: 1, k: 'b', dx: -1, dy: 0 }]);
  run(x, 1);
  assert.equal(e.alive, false);
  assert.equal(events(x, 'enemyDown').filter(v => v.id === e.netId).length, 1, 'una sola muerte');
  const gainedBy = id => x.members.get(id).rewards.exp - exp0[id === 'p0' ? 0 : 1];
  assert.ok(gainedBy('p0') > 0 && gainedBy('p1') > 0, 'cada uno recibe su parte');
  assert.equal(events(x, 'exp').filter(v => v.to === 'p0').length, 1); assert.equal(events(x, 'exp').filter(v => v.to === 'p1').length, 1);
  assert.ok(x.items.size - items0 <= 4, 'un solo reparto de botín');
  const before = x.items.size; x.onEnemyDown(e); x.onEnemyDown(e);       // finalización repetida
  assert.equal(x.items.size, before); assert.equal(events(x, 'enemyDown').filter(v => v.id === e.netId).length, 1);
});

test('ataques de los enemigos: aviso sincronizado (dirección y punto) y un evento con id único al ejecutarse', () => {
  const x = make({ seed: 4 }); clearEnemies(x); x.drainEvents();
  const p = P(x, 'p0'); p.maxHp = p.hp = 99999;
  const v = Object.keys(x.dng.enemies)[0];
  for (let k = 0; k < 3; k++) { const e = new x.E.Enemy(x.E.makeKind(v), p.x + 40 + k * 10, p.y + (k - 1) * 20, { level: 3 }); e.aggro = true; x.addEnemy(e, 'v:' + v); }
  let sawWindup = false;
  for (let i = 0; i < 6 * 120; i++) { x.step(STEP); if (i % 6 === 0) for (const en of x.view().enemies) if (en.state === 'windup') { sawWindup = true; assert.ok(Math.hypot(en.ax, en.ay) > .5, 'dirección del ataque en el estado'); } }
  const atks = events(x, 'eatk');
  assert.ok(sawWindup, 'se ve el aviso'); assert.ok(atks.length >= 2, 'los enemigos atacan: ' + atks.length);
  assert.equal(new Set(atks.map(a => a.aid)).size, atks.length, 'identificadores únicos');
  assert.ok(atks.every(a => typeof a.id === 'string' && a.id.startsWith('e')));
});

test('jefe: mismo estado para todos (PS, fase y patrón) y aviso de fase 2 una sola vez', () => {
  const x = make({ seed: 11 }); x.loadStep(x.seq.length - 1); x.drainEvents();
  for (const m of x.members.values()) { m.player.maxHp = m.player.hp = 99999; }
  const b = x.boss; assert.ok(b && b.kind.isBoss);
  let v = x.view().boss;
  assert.deepEqual([v.id, v.phase, v.alive, v.maxHp], [b.netId, 1, true, b.maxHp]);
  b.hp = Math.floor(b.maxHp * .45); b.aggro = true;
  run(x, 4);
  v = x.view().boss;
  assert.equal(v.phase, 2); assert.equal(events(x, 'bossPhase').length, 1, 'el aviso de fase 2 llega una vez');
  assert.ok(events(x, 'eatk').some(a => a.boss), 'el jefe ejecuta patrones');
  assert.deepEqual(x.shared().boss, v);
  run(x, 2); assert.equal(events(x, 'bossPhase').length, 1);
});
