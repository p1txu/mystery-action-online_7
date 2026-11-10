/**
 * Persistencia del progreso (0.42), con la simulación real del servidor y el formato real del perfil:
 *  - formato del perfil v7 y migración desde la 6 (sin perder nada; registro, reliquias e historia deducidos);
 *  - estado de expedición: instantánea en puntos seguros y reanudación de la MISMA expedición (id, semilla,
 *    piso) sin que vuelvan enemigos vencidos, cofres abiertos, objetos ya recogidos ni misiones ya contadas;
 *  - el jefe que muere varias veces en la misma transición de fase solo cuenta una vez;
 *  - el resultado «interrumpida» precalculado no toca la expedición en curso;
 *  - códice (textos, salas secretas, reliquias), misiones entregadas e historia, también en el servidor.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { Expedition } from '../server/src/sim/Expedition.js';
import { applyOp } from '../server/src/profile/rules.js';
import { E, freshSave, seeded, STEP } from './helpers.mjs';

const run = (x, s) => { for (let i = 0; i < Math.round(s / STEP); i++) x.step(STEP); };
const veteran = (sp, extra = {}) => freshSave(sp, Object.assign({ cleared: ['bosque', 'gruta', 'cienaga'], arrived: true }, extra));
const make = (dungeonId, n = 2, o = {}) => new Expedition(Object.assign({ dungeonId, seed: 31, random: seeded(9),
  members: [{ id: 'a', accountId: 'A', name: 'Ana', profile: veteran('guerrero') }, { id: 'b', accountId: 'B', name: 'Beto', profile: veteran('mago') }].slice(0, n) }, o));
const P = (x, id) => x.members.get(id).player;
const enemies = x => x.g.actors.filter(a => a instanceof x.E.Enemy && a.alive);
/** Reanuda desde la instantánea (pasando por JSON, como la base de datos) con sesiones nuevas. */
const resume = (snap, accounts = ['A', 'B']) => new Expedition({ restore: JSON.parse(JSON.stringify(snap)), members: accounts.map((a, i) => ({ id: 's' + i, accountId: a, name: a })) });
const byAcc = (x, a) => [...x.members.values()].find(m => m.accountId === a);

test('perfil v7+: partida nueva con registro, códice e historia vacíos', () => {
  const s = freshSave('arquero');
  assert.equal(s.v, E.SAVE_VERSION); assert.ok(E.SAVE_VERSION >= 7);
  assert.deepEqual(s.codex, { lore: [], secrets: [], relics: [], pages: [], lemas: [], memories: [], talks: [], offerings: [] }); assert.deepEqual(s.log, { jobs: [] }); assert.deepEqual(s.story, { flags: [], endings: [], choices: {}, quests: {}, counters: {} });
});

test('migración 6 → 7 (y siguientes): no se pierde nada; reliquias que ya tenía e historia vivida se apuntan; repetirla no cambia nada', () => {
  const v6 = structuredClone(veteran('guerrero', { bank: 777, points: 340, runs: 12, delivered: 4, bosses: { gromgar: { kills: 2, trophy: true } } }));
  v6.v = 6; delete v6.codex; delete v6.log; delete v6.story;
  v6.inv.push({ uid: 'x1', id: 'colmilloGromgar', qty: 1 }, { uid: 'x2', id: 'pocion', qty: 3 });
  const r = E.Save.sanitize(v6);
  assert.ok(r.ok); assert.equal(r.from, 6); assert.equal(r.data.v, E.SAVE_VERSION);
  for (const k of ['species', 'bank', 'points', 'runs', 'delivered', 'cleared', 'bosses', 'equip', 'prog']) assert.deepEqual(r.data[k], E.Save.sanitize(Object.assign({}, v6, { v: 7 })).data[k], k + ' se conserva');
  assert.deepEqual(r.data.inv.map(x => [x.id, x.qty]), E.Save.sanitize(Object.assign({}, v6, { v: 7 })).data.inv.map(x => [x.id, x.qty]), 'inventario intacto');
  assert.ok(r.data.codex.relics.includes('colmilloGromgar'), 'el trofeo que ya tenía cuenta como reliquia');
  assert.deepEqual(r.data.story.flags.sort(), ['llegada', 'mercader', 'tablon'], 'llegada, mercader (Bosque) y tablón (Gruta) ya vividos');
  const again = E.Save.sanitize(r.data);
  assert.equal(again.from, E.SAVE_VERSION); assert.deepEqual(again.data, r.data, 'idempotente');
  // Sin número de versión pero con clase: se trata como 6
  const nov = structuredClone(v6); delete nov.v; assert.equal(E.Save.sanitize(nov).from, 6);
  // De una versión más nueva: no se toca (no se pierde al abrirlo con un juego antiguo)
  assert.equal(E.Save.sanitize(Object.assign({}, r.data, { v: 99 })).ok, false);
  // Criaturas (antes de la 6): no compatible
  assert.equal(E.Save.sanitize({ v: 5, species: 'pikachu', prog: {} }).ok, false);
});

test('registro validado: ids desconocidos fuera, sin duplicados y con tope', () => {
  const s = E.Save.sanitize(freshSave('mago', { codex: { lore: ['f_carro', 'f_carro', 'nada'], secrets: ['bosque:muro_agrietado', 'bosque:inventada', 'nada:muro_agrietado'], relics: ['pocion', 'lagrimaEstelar'] },
    story: { flags: ['llegada', 'trampa'], endings: ['final_falso'] }, log: { jobs: [{ id: 3, type: 'hunt', dungeon: 'bosque', stars: 'C', at: 5 }, { id: 4, type: 'nada', dungeon: 'bosque' }] } })).data;
  assert.deepEqual(s.codex, { lore: ['f_carro'], secrets: ['bosque:muro_agrietado'], relics: ['lagrimaEstelar'], pages: [], lemas: [], memories: [], talks: [], offerings: [] });
  assert.deepEqual(s.story.flags, ['llegada']); assert.deepEqual(s.story.endings, []);
  assert.equal(s.log.jobs.length, 1);
  const many = freshSave('mago'); for (let i = 0; i < E.LOG_MAX + 30; i++) E.logJob(many, { id: i, type: 'hunt', dungeon: 'bosque', stars: 'E' });
  assert.equal(many.log.jobs.length, E.LOG_MAX); assert.equal(many.log.jobs.at(-1).id, E.LOG_MAX + 29, 'se guardan las más recientes');
});

test('misión entregada: va al registro una sola vez (rules.js, igual que en solitario)', () => {
  const s = veteran('guerrero'); s.board = E.Jobs.board(s, s.boardSeed); const j = s.board.find(q => !E.isLegacyJob(q)); assert.ok(j);
  let r = applyOp(E, s, 'acceptJob', { id: j.id }).save;
  r.jobs[0].progress = r.jobs[0].goal; r.jobs[0].state = 'done';
  const out = applyOp(E, r, 'deliverJob', { id: j.id }).save;
  assert.equal(out.log.jobs.length, 1); assert.equal(out.log.jobs[0].id, j.id); assert.equal(out.delivered, 1);
  assert.throws(() => applyOp(E, out, 'deliverJob', { id: j.id }), /no está lista/, 'entregarla otra vez no da nada');
});

test('servidor: leer un texto, entrar en una sala secreta y conseguir una reliquia quedan en el códice de quien lo hace', () => {
  for (let seed = 1; seed < 400; seed++) {
    const x = new Expedition({ dungeonId: 'bosque', seed, random: seeded(2), members: [{ id: 'a', name: 'Ana', profile: freshSave('guerrero') }] });
    for (let i = 0; i < x.seq.length - 1 && !(x.L.lore || []).length; i++) x.nextStep();
    const l = (x.L.lore || [])[0]; if (!l) continue;
    x.g.actors = x.g.actors.filter(a => !(a instanceof x.E.Enemy)); x.drainEvents();
    P(x, 'a').placeAt((l.tx + .5) * 32, (l.ty + .5) * 32 + 2); run(x, .1);
    assert.ok(x.members.get('a').save.codex.lore.includes(l.id), 'texto ' + l.id);
    assert.ok(x.drainEvents().some(e => e.type === 'codex' && e.kind === 'lore'));
    const sec = x.L.rooms.find(r => r.role === 'secret');
    if (sec) { P(x, 'a').placeAt((sec.x + sec.w / 2) * 32, (sec.y + sec.h / 2) * 32); run(x, .1); assert.ok(x.members.get('a').save.codex.secrets.includes('bosque:' + sec.prefab)); }
    P(x, 'a').bag.add('lagrimaEstelar', 1); x.finish('return');
    assert.ok(x.ended.results.get('a').profile.codex.relics.includes('lagrimaEstelar'), 'reliquia al guardar');
    return;
  }
  assert.fail('ningún piso con textos');
});

test('instantánea y reanudación: misma expedición; lo vencido, abierto o recogido no vuelve', () => {
  const x = make('gruta'); x.drainEvents();
  const a = P(x, 'a'), b = P(x, 'b'); a.invincible = b.invincible = true;
  // Vence a dos enemigos del piso, abre un cofre y deja un objeto en el suelo
  const es = enemies(x).filter(e => e.spawnIdx != null).slice(0, 2); assert.equal(es.length, 2);
  for (const e of es) x.E.Combat.hit(x.g, e, { team: 'player', fixed: 1e7, src: a });
  run(x, .1);
  const ch = x.objects.find(o => o.type === 'chest' && !o.hiddenUntil);
  if (ch) { a.placeAt(ch.x, ch.y + 4); run(x, .3); assert.ok(ch.opened); }
  a.bag.add('pocion', 2); x.drop('a', 'pocion');
  x.members.get('a').rewards.gems += 33; a.hp = Math.round(a.maxHp * .6);
  x.E.Boons.apply(a, x.E.Boons.offer(seeded(1), {})[0]);
  const snap = x.snapshot('test'), gemsA = byAcc(x, 'A').rewards.gems, bagA = a.bag.stacks.reduce((t, s) => t + s.qty, 0);
  assert.equal(snap.id, x.id); assert.equal(snap.seed, x.seed); assert.ok(JSON.stringify(snap).length < 200000, 'tamaño razonable');
  // Reanudar con sesiones nuevas (otro proceso de servidor)
  const y = resume(snap);
  assert.equal(y.id, x.id, 'mismo id: la clave de recompensas sigue siendo la misma'); assert.equal(y.seed, x.seed); assert.equal(y.stepIdx, x.stepIdx);
  assert.equal(y.world.tiles.join(), x.world.tiles.join(), 'el piso se regenera idéntico con la semilla');
  for (const e of es) assert.ok(!enemies(y).some(q => q.spawnIdx === e.spawnIdx), 'el enemigo vencido no vuelve');
  if (ch) assert.ok(y.objects.find(o => o.key === ch.key).opened, 'el cofre sigue abierto');
  assert.deepEqual([...y.items.values()].map(it => [it.key, it.id, it.amount, it.owner || null]).sort(), [...x.items.values()].map(it => [it.key, it.id, it.amount, it.owner || null]).sort(), 'objetos del suelo (con su dueño)');
  const ya = byAcc(y, 'A');
  assert.equal(ya.rewards.gems, gemsA, 'monedas de la expedición'); assert.equal(ya.player.bag.stacks.reduce((t, s) => t + s.qty, 0), bagA, 'mochila');
  assert.deepEqual(ya.player.boons, a.boons, 'dones'); assert.equal(Math.ceil(ya.player.hp), Math.ceil(a.hp));
  assert.equal(y.drainEvents().filter(e => e.type === 'safepoint').length, 1, 'al reanudar se guarda de nuevo');
  // Si se vuelve a guardar y a reanudar, sigue igual (no se acumula nada)
  const y2 = resume(y.snapshot('again'));
  assert.equal(byAcc(y2, 'A').rewards.gems, gemsA); assert.equal(enemies(y2).length, enemies(y).length);
});

test('volver a entrar en una sala después de reanudar no vuelve a contar para las misiones de exploración', () => {
  const x = make('gruta', 1); x.drainEvents();
  const m = x.members.get('a'); m.rewards.rooms.add(0); m.rewards.rooms.add(1);
  const y = resume(x.snapshot('t'), ['A']);
  assert.deepEqual([...byAcc(y, 'A').rewards.rooms].sort(), [0, 1]);
});

test('jefe derrotado: punto seguro; al reanudar no vuelve, el portal sigue y el trofeo se da una vez al terminar', () => {
  const x = make('mina'); x.loadStep(x.seq.length - 1); x.drainEvents();
  const boss = x.boss; assert.equal(boss.kind.name, 'Gromgar');
  x.E.Combat.hit(x.g, boss, { team: 'player', fixed: 1e8, src: P(x, 'a') }); run(x, .1);
  assert.ok(x.drainEvents().some(e => e.type === 'safepoint' && e.reason === 'boss'));
  const y = resume(x.snapshot('boss'));
  assert.equal(y.boss, null, 'el jefe no vuelve'); assert.ok(!enemies(y).some(e => e.kind.isBoss));
  assert.ok(y.objects.some(o => o.type === 'warp') && y.objects.some(o => o.key === 'bossChest'), 'portal y cofre del jefe');
  y.finish('clear');
  for (const a of ['A', 'B']) { const r = y.ended.results.get(byAcc(y, a).id); assert.equal(r.profile.bosses.gromgar.kills, 1); assert.equal(r.profile.inv.filter(s => s.id === 'colmilloGromgar').length, 1); }
});

test('el jefe recibe varios golpes mortales durante una transición de fase: muere una vez (EXP, portal, cofre y victoria una vez)', () => {
  const x = make('mina'); x.loadStep(x.seq.length - 1); x.drainEvents();
  const b = x.boss, K = x.E.BossKit, S = K.st(b);
  b.aggro = true; run(x, .5);
  b.hp = Math.floor(b.maxHp * .59); run(x, 1 / 60);                     // cruza el 60 %: transición (rugido)
  assert.equal(S.stage, 'trans', 'en transición');
  const exp0 = ['a', 'b'].map(id => x.members.get(id).rewards.exp), single = x.E.expYield(b, P(x, 'a').level);
  for (let k = 0; k < 4; k++) for (const id of ['a', 'b']) x.E.Combat.hit(x.g, b, { team: 'player', fixed: 1e8, src: P(x, id) });
  run(x, .2);
  for (let k = 0; k < 3; k++) x.E.Combat.hit(x.g, b, { team: 'player', fixed: 1e8, src: P(x, 'a') });
  run(x, .2);
  assert.equal(b.alive, false);
  const ev = x.drainEvents();
  assert.equal(ev.filter(e => e.type === 'enemyDown' && e.boss).length, 1, 'una muerte');
  assert.equal(x.objects.filter(o => o.type === 'warp').length, 1); assert.equal(x.objects.filter(o => o.key === 'bossChest').length, 1);
  const gained = ['a', 'b'].map((id, i) => x.members.get(id).rewards.exp - exp0[i]);
  assert.ok(gained[0] > 0 && gained[0] <= Math.round(single) + 1, `EXP del jefe una sola vez (${single}): ${gained}`);
  x.finish('clear');
  for (const id of ['a', 'b']) assert.equal(x.ended.results.get(id).profile.bosses.gromgar.kills, 1);
});

test('el resultado «interrumpida» de la instantánea es una copia: no cambia la expedición en curso', () => {
  const x = make('gruta'); x.drainEvents();
  const m = x.members.get('a'); m.rewards.gems = 50; P(x, 'a').bag.add('pocion', 3);
  const before = JSON.stringify([m.save, P(x, 'a').bag.stacks, m.rewards.gems, m.bossGranted]);
  const snap = x.snapshot('t'), r = snap.members[0].result;
  assert.equal(JSON.stringify([m.save, P(x, 'a').bag.stacks, m.rewards.gems, m.bossGranted]), before, 'nada cambia');
  assert.equal(r.result, 'interrupted'); assert.equal(r.profile.bank, m.save.bank + 50, 'cobraría las monedas de la expedición');
  assert.ok(r.profile.inv.some(s => s.id === 'pocion'));
  assert.equal(r.expeditionId, x.id);
});

test('reanudar con menos jugadores: el piso conserva su tamaño; quien no vuelve no está en la expedición', () => {
  const x = make('gruta'); x.drainEvents();
  const size = x.floor.size, y = resume(x.snapshot('t'), ['A']);
  assert.equal(y.floor.size, size); assert.equal(y.members.size, 1); assert.equal(y.world.w, x.world.w);
  assert.throws(() => resume(x.snapshot('t'), ['Z']), /Nadie/);
});
