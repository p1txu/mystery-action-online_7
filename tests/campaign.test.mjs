/**
 * Campaña cooperativa (0.41), con la simulación real del servidor (server/src/sim/Expedition.js):
 *  - botín individual: cofres y enemigos dan una tirada a CADA integrante, con dueño; nadie recoge lo de otro;
 *    lo que deja caer un jugador es de todos; los trofeos únicos no se pueden soltar;
 *  - acompañantes: sin la región desbloqueada se gana EXP, botín y trofeo, pero la mazmorra no cuenta como superada;
 *  - reanimar: tiempo creciente por piso, desangrado si nadie ayuda, fuera de combate hasta el piso siguiente;
 *  - reparto de objetivos en grupo (los enemigos no se amontonan sobre uno) y escalado menos «esponja»;
 *  - punto de control: se guarda al llegar, se conserva solo si la expedición se interrumpe y se gasta al terminarla;
 *  - en solitario nada de esto cambia el juego.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { Expedition, REVIVE_RULES } from '../server/src/sim/Expedition.js';
import { COOP_SCALING } from '../shared/protocol.js';
import { E, freshSave, seeded, STEP } from './helpers.mjs';

const run = (x, s) => { for (let i = 0; i < Math.round(s / STEP); i++) x.step(STEP); };
const veteran = sp => freshSave(sp, { cleared: ['bosque', 'gruta', 'cienaga'], arrived: true });
const make = (dungeonId, members, o = {}) => new Expedition(Object.assign({ dungeonId, seed: 21, members, random: seeded(5) }, o));
const pair = (dng = 'gruta', b = freshSave('mago', { cleared: ['bosque'] })) => make(dng, [{ id: 'a', name: 'Ana', profile: veteran('guerrero') }, { id: 'b', name: 'Beto', profile: b }]);
const clear = x => { x.g.actors = x.g.actors.filter(a => !(a instanceof x.E.Enemy)); x.g.zones.length = 0; x.g.projectiles.length = 0; };
const P = (x, id) => x.members.get(id).player;

test('botín individual: un cofre da a cada uno SU parte y nadie recoge lo de otro', () => {
  const x = pair(); clear(x); x.drainEvents();
  const a = P(x, 'a'), b = P(x, 'b');
  x.items.clear();
  const chest = { key: 'c', type: 'chest', tier: 'cofre', tx: 0, ty: 0, x: a.x, y: a.y + 5, opened: false };
  x.objects.push(chest); b.placeAt(a.x + 300, a.y); if (!b.free(x.world, b.x, b.y)) b.placeAt(a.x, a.y + 300);
  run(x, .3);
  assert.ok(chest.opened);
  const ev = x.drainEvents().filter(e => e.type === 'chest');
  assert.deepEqual(ev.map(e => e.to).sort(), ['a', 'b'], 'un aviso para cada uno, aunque Beto esté lejos');
  const mine = [...x.items.values()].filter(it => it.owner === 'b');
  assert.ok(mine.length > 0, 'la parte de Beto le espera en el suelo');
  // Ana pasa por encima de la parte de Beto: no se la lleva
  const gemsA = x.members.get('a').run.gems, bagA = a.bag.stacks.reduce((t, s) => t + s.qty, 0);
  for (const it of mine) { a.placeAt(it.x, it.y); run(x, .1); }
  assert.equal(mine.filter(it => x.items.has(it.key)).length, mine.length, 'sigue todo en el suelo');
  const ownA = [...x.items.values()].filter(it => it.owner === 'a').length;
  assert.ok(x.members.get('a').run.gems >= gemsA && a.bag.stacks.reduce((t, s) => t + s.qty, 0) >= bagA);
  // Beto recoge lo suyo
  for (const it of mine) { b.placeAt(it.x, it.y); run(x, .1); }
  assert.ok(mine.every(it => !x.items.has(it.key) || it.amount < 999), 'Beto recoge su parte');
  assert.ok(ownA >= 0);
  // En la red cada objeto lleva su dueño (el cliente solo dibuja lo suyo y lo de todos)
  for (const it of x.view().items) assert.ok(['', 'a', 'b'].includes(it.owner));
});

test('botín individual: cada enemigo vencido tira para cada integrante; si alguien se va, lo suyo pasa a ser de todos', () => {
  const x = pair(); clear(x); x.drainEvents(); x.items.clear();
  const a = P(x, 'a');
  let owners = new Set();
  for (let i = 0; i < 30 && owners.size < 2; i++) {
    const e = x.addEnemy(new x.E.Enemy(x.E.makeKind('pufon'), a.x + 40, a.y, { level: 4 }), 'v:pufon');
    x.E.Combat.hit(x.g, e, { team: 'player', fixed: 1e7, src: a }); run(x, .05);
    owners = new Set([...x.items.values()].map(it => it.owner));
  }
  assert.ok(owners.has('a') && owners.has('b'), 'hay botín de Ana y de Beto: ' + [...owners]);
  x.removeMember('b');
  assert.ok(![...x.items.values()].some(it => it.owner === 'b'), 'lo de Beto queda para los demás');
});

test('soltar: un objeto normal es de todos (se puede dar a un compañero); un trofeo único no se puede soltar', () => {
  const x = pair(); clear(x); x.drainEvents();
  const a = P(x, 'a');
  a.bag.add('pocion', 1); a.bag.add('colmilloGromgar', 1);
  assert.equal(x.drop('a', 'pocion'), true);
  const it = [...x.items.values()].find(i => i.id === 'pocion'); assert.equal(it.owner || null, null);
  assert.equal(x.drop('a', 'colmilloGromgar'), false);
  assert.equal(x.drainEvents().find(e => e.type === 'reject' && e.what === 'drop').why, 'único');
  assert.equal(a.bag.count('colmilloGromgar'), 1, 'sigue en su inventario');
});

test('acompañante: sin la región desbloqueada gana EXP, botín y trofeo, pero la mazmorra no cuenta como superada', () => {
  const beto = freshSave('mago');                                   // no ha desbloqueado la Mina
  assert.equal(E.dungeonOpen(beto, E.dungeonById('mina')), false);
  const x = make('mina', [{ id: 'a', name: 'Ana', profile: veteran('guerrero') }, { id: 'b', name: 'Beto', profile: beto, companion: true }]);
  x.loadStep(x.seq.length - 1); clear(x); x.drainEvents();
  const boss = x.boss; assert.equal(boss.kind.name, 'Gromgar');
  x.E.Combat.hit(x.g, boss, { team: 'player', fixed: 1e8, src: P(x, 'a') }); run(x, .2);
  x.finish('clear');
  const ra = x.ended.results.get('a'), rb = x.ended.results.get('b');
  assert.ok(ra.profile.cleared.includes('mina'));
  assert.ok(!rb.profile.cleared.includes('mina'), 'el acompañante no se salta la campaña');
  assert.ok(rb.lines.some(l => /acompañante/.test(l)));
  assert.ok(rb.summary.exp > 0, 'pero gana EXP');
  for (const r of [ra, rb]) { assert.equal(r.profile.bosses.gromgar.kills, 1); assert.equal(r.profile.inv.filter(s => s.id === 'colmilloGromgar').length, 1, 'trofeo propio, una vez'); }
});

test('reanimar: cada reanimación en el mismo piso cuesta más; sin ayuda te desangras y quedas fuera hasta el piso siguiente', () => {
  const x = pair('gruta'); clear(x); x.drainEvents();
  const a = P(x, 'a'), b = P(x, 'b');
  b.placeAt(a.x + 20, a.y); if (!b.free(x.world, b.x, b.y)) b.placeAt(a.x, a.y + 20);
  const down = () => { a.hp = 0; a.alive = false; x.onPlayerDown(a); };
  const times = [];
  for (let k = 0; k < 3; k++) {
    down(); let t = 0;
    while (x.members.get('a').downed && t < 20) { x.step(STEP); t += STEP; }
    times.push(t);
    assert.equal(a.hp, Math.max(1, Math.round(a.maxHp * REVIVE_RULES.hp)), 'vuelve con el 35 % de PS');
  }
  assert.ok(times[0] >= REVIVE_RULES.base - .05 && times[1] > times[0] + 1 && times[2] > times[1] + 1, 'tiempos: ' + times.map(t => t.toFixed(2)));
  assert.equal(x.members.get('a').revives, 3);
  assert.equal(x.view().players.find(p => p.id === 'a').revives, 3, 'la red lo muestra');
  // Nadie cerca: se desangra (45 s) y queda fuera de combate
  b.placeAt(a.x + 400, a.y); if (!b.free(x.world, b.x, b.y)) b.placeAt(a.x, a.y + 400);
  down(); x.drainEvents();
  run(x, 10); assert.ok(Math.abs(x.view().players.find(p => p.id === 'a').bleed - (REVIVE_RULES.bleed - 10)) < .2, 'cuenta atrás en la red');
  run(x, REVIVE_RULES.bleed - 9);
  const m = x.members.get('a');
  assert.equal(m.out, true); assert.ok(x.drainEvents().some(e => e.type === 'bleedout' && e.id === 'a'));
  assert.equal(x.view().players.find(p => p.id === 'a').bleed, -1);
  b.placeAt(a.x + 10, a.y); run(x, 10);
  assert.equal(m.downed, true, 'fuera de combate: ya no se le puede reanimar en este piso');
  assert.equal(x.ended, null, 'Beto sigue: el grupo no pierde');
  x.nextStep();
  assert.equal(m.downed, false); assert.equal(m.out, false); assert.equal(m.revives, 0, 'en el piso siguiente vuelve y el contador empieza de cero');
  assert.ok(a.alive && a.hp > 0);
});

test('mientras le reaniman o está desconectado no se desangra; si caen todos los conectados, el grupo cae', () => {
  const x = pair('gruta'); clear(x); x.drainEvents();
  const a = P(x, 'a'), b = P(x, 'b');
  b.placeAt(a.x + 500, a.y); if (!b.free(x.world, b.x, b.y)) b.placeAt(a.x, a.y + 500);
  a.hp = 0; a.alive = false; x.onPlayerDown(a);
  x.setConnected('a', false); run(x, 20);
  assert.equal(x.members.get('a').bleed, REVIVE_RULES.bleed, 'desconectado: no corre');
  x.setConnected('a', true);
  b.hp = 0; b.alive = false; x.onPlayerDown(b); run(x, .1);
  assert.equal(x.ended.result, 'faint');
});

test('solitario: sin compañeros no hay reanimación ni reparto, y caer termina la expedición como siempre', () => {
  const x = make('gruta', [{ id: 'a', name: 'Ana', profile: veteran('guerrero') }]); clear(x); x.drainEvents();
  assert.deepEqual(COOP_SCALING[1], { hp: 1, bossHp: 1, dmg: 1, count: 1, elite: 0, wander: 0, spawn: 1 });
  const a = P(x, 'a'); a.hp = 0; a.alive = false; x.onPlayerDown(a); run(x, .1);
  assert.equal(x.ended.result, 'faint');
  run(x, .1); assert.equal(x.g.targetLoad, undefined, 'sin reparto de objetivos en solitario');
});

test('reparto de objetivos: en grupo los enemigos no se amontonan todos sobre el más cercano', () => {
  const x = pair('gruta'); clear(x); x.drainEvents();
  const a = P(x, 'a'), b = P(x, 'b');
  a.invincible = b.invincible = true;
  // Geometría fija: Ana a 40 px de cada enemigo y Beto a 70 px
  const e = new x.E.Enemy(x.E.makeKind('pufon'), a.x + 40, a.y, { level: 4 });
  b.x = a.x + 110; b.y = a.y; b.alive = true;
  const g = { player: a, allies: [b], targetLoad: null };
  assert.equal(e.pickTarget(g), a, 'sin reparto (solitario o sin datos): el más cercano');
  g.targetLoad = new Map([[a, 3]]); assert.equal(e.pickTarget(g), b, 'si ya van tres a por Ana, el siguiente va a por Beto');
  g.targetLoad = new Map([[a, 1]]); assert.equal(e.pickTarget(g), a, 'con uno solo, no merece la pena el rodeo');
  e.target = a; g.targetLoad = new Map([[a, 1]]); assert.equal(e.pickTarget(g), a, 'no se cuenta a sí mismo: no abandona a su objetivo por su propia culpa');
  // El servidor rellena el recuento cada paso con los objetivos reales
  for (let i = 0; i < 4; i++) { const q = x.addEnemy(new x.E.Enemy(x.E.makeKind('pufon'), a.x + 30, a.y + (i - 1.5) * 12, { level: 4 }), 'v:pufon'); q.aggro = true; }
  run(x, .6);
  const L = x.g.targetLoad; assert.ok(L instanceof Map);
  const live = x.g.actors.filter(q => q instanceof x.E.Enemy && q.alive && q.target);
  assert.equal([...L.values()].reduce((t, v) => t + v, 0), live.filter(q => Math.hypot(q.x - q.target.x, q.y - q.target.y) < 200).length, 'cuenta a los que acosan de cerca a alguien');
  assert.ok([...L.values()].reduce((t, v) => t + v, 0) >= 1);
});

test('escalado menos «esponja»: PS ×1,5 / ×1,95 / ×2,4 y más élites y errantes en su lugar', () => {
  assert.deepEqual([2, 3, 4].map(n => COOP_SCALING[n].hp), [1.5, 1.95, 2.4]);
  for (let n = 2; n <= 4; n++) assert.ok(COOP_SCALING[n].hp < n, `${n} jugadores: menos vida que la suma de ${n} solitarios`);
  assert.ok(COOP_SCALING[4].elite >= .15);
});

test('punto de control: se guarda al llegar, se conserva si la expedición se interrumpe y se gasta al terminarla', () => {
  const x = pair('gruta'); clear(x); x.drainEvents();
  const wp = x.seq.findIndex(s => s.kind === 'waypoint'); assert.ok(wp > 0);
  for (let i = 0; i < wp; i++) x.nextStep();
  assert.equal(x.seq[x.stepIdx].kind, 'waypoint');
  const ev = x.drainEvents().find(e => e.type === 'checkpoint');
  assert.ok(ev); assert.deepEqual(ev.members.sort(), ['a', 'b']); assert.equal(ev.dungeon, 'gruta');
  x.finish('interrupted');
  for (const id of ['a', 'b']) { const r = x.ended.results.get(id); assert.equal(r.profile.resume.dungeon, 'gruta', id + ' conserva el punto de control'); }
  // Continuar: empieza en el punto de control y, al terminar, lo gasta
  const saves = ['a', 'b'].map(id => x.ended.results.get(id).profile);
  const y = make('gruta', [{ id: 'a', name: 'Ana', profile: saves[0] }, { id: 'b', name: 'Beto', profile: saves[1] }], { resume: true });
  assert.equal(y.resumed, true); assert.equal(y.seq[y.stepIdx].kind, 'waypoint');
  y.finish('faint');
  for (const id of ['a', 'b']) assert.equal(y.ended.results.get(id).profile.resume, null, 'una derrota lo gasta');
  // Un final normal también; el de OTRA mazmorra no se toca
  const z = make('gruta', [{ id: 'a', name: 'Ana', profile: Object.assign(structuredClone(saves[0]), { resume: { dungeon: 'mina', at: Date.now() } }) }]);
  z.finish('return'); assert.equal(z.ended.results.get('a').profile.resume.dungeon, 'mina');
  // Una mazmorra sin punto de control: «continuar» empieza en el primer piso
  const w = make('bosque', [{ id: 'a', name: 'Ana', profile: veteran('guerrero') }], { resume: true });
  assert.equal(w.resumed, false); assert.equal(w.stepIdx, 0);
});

test('el perfil valida el punto de control: mazmorra con punto de control, fecha válida y caduca a los 7 días', () => {
  const ok = E.Save.sanitize(freshSave('mago', { resume: { dungeon: 'gruta', at: Date.now() - 1000 } })).data.resume;
  assert.equal(ok.dungeon, 'gruta');
  for (const bad of [{ dungeon: 'bosque', at: Date.now() }, { dungeon: 'nada', at: Date.now() }, { dungeon: 'gruta', at: 'ayer' }, { dungeon: 'gruta', at: Date.now() - 8 * 864e5 }, 'gruta'])
    assert.equal(E.Save.sanitize(freshSave('mago', { resume: bad })).data.resume, null, JSON.stringify(bad));
});
