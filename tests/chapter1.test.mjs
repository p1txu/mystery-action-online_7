/** Capítulo 1 · «Las raíces enfermas» (0.45, docs/CAPITULO_1.md), con el núcleo real, la simulación real del
 *  servidor y las operaciones reales del perfil:
 *  - el Linde de Brumaverde (zona de exploración): 4 rastros fijos, élite fijo, mecanismo ambiental y ruta válida en
 *    todas las semillas y tamaños de grupo; sin guarida; la salida devuelve a la aldea sin contar como mazmorra;
 *  - el primer piso del Bosque: estela tibia y refugio de Gil siempre;
 *  - misiones: introducción, aceptar, pasos con hechos guardados (lo hecho antes cuenta), entregar una sola vez,
 *    recompensas en el perfil, cambio de la aldea (c1_done);
 *  - en grupo: cada perfil cuenta sus criaturas y lee sus rastros; cada uno entrega su misión. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { Expedition } from '../server/src/sim/Expedition.js';
import { applyOp } from '../server/src/profile/rules.js';
import { E, freshSave, seeded, STEP } from './helpers.mjs';

const C = E.Campaign, SC = E.StoryChain;
const run = (x, s) => { for (let i = 0; i < Math.round(s / STEP); i++) { x.step(STEP); if (x.pauseT > 0) x.pauseT = 0; } };
const party = profiles => profiles.map((profile, i) => ({ id: 'p' + i, name: 'J' + i, profile }));
const op = (s, name, args) => applyOp(E, s, name, args);
const vecina = (sp = 'guerrero') => freshSave(sp, { arrived: true });

test('el Linde de Brumaverde: zona de exploración con 4 rastros, élite y mecanismo ambiental fijos y ruta válida (1-4 jugadores, 150 semillas)', () => {
  const d = E.dungeonById('linde'); assert.ok(d.zone && !d.boss);
  for (let seed = 1; seed <= 150; seed++) for (const n of [1, 2, 3, 4]) {
    const g = E.FloorGen.generate(seed * 131 + n, d, 1, 'normal', [], n), L = g.layout;
    assert.ok(g.validation.ok, `semilla ${seed}/${n}: ${JSON.stringify(Object.entries(g.validation.checks).filter(([, v]) => !v))}`);
    assert.deepEqual(L.story.map(s => s.id).sort(), ['z_campamento', 'z_huellas', 'z_raiz', 'z_savia']);
    assert.ok(L.story.every(s => !s.hidden), 'los rastros están a la vista');
    const el = L.enemies.filter(e => e.fixed && e.elite); assert.equal(el.length, 1); assert.equal(el[0].variant, 'zarza');
    assert.ok(L.rooms.some(r => ['esporas', 'raices_punzantes', 'raices_rompibles'].includes(r.prefab)), 'mecanismo ambiental');
    assert.ok(L.stairs, 'sendero de salida');
  }
  // Primer piso del Bosque: la estela tibia y el refugio de Gil (tras una pared hueca) en todas las semillas
  for (let seed = 1; seed <= 120; seed++) {
    const g = E.FloorGen.generate(seed * 17, E.dungeonById('bosque'), 1, 'normal', [], 1 + seed % 4);
    assert.ok(g.validation.ok); assert.deepEqual(g.layout.story.map(s => s.id).sort(), ['estela_tibia', 'refugio_gil']);
  }
  // Las zonas no dan contratos del tablón ni cuentan como mazmorra para la campaña
  const s = vecina(); for (let k = 1; k < 200; k++) assert.ok(E.Jobs.board(s, k).every(j => j.dungeon !== 'linde'));
});

test('servidor: el Linde con dos jugadores — rastros con el perfil de cada uno, criaturas y élite contados para quien participa, y salida a la aldea', () => {
  const a = vecina('mago'), b = vecina('arquero');
  for (const s of [a, b]) SC.talk(s, 'c1_intro');
  op(a, 'questAccept', { id: 'c1_main' });   // (Ana tiene la misión; Beto no: también cuenta para él)
  const x = new Expedition({ dungeonId: 'linde', seed: 21, members: party([a, b]), random: seeded(3) });
  assert.deepEqual(x.seq, [{ kind: 'normal', floorNo: 1 }], 'sin guarida');
  x.loadStep(0); x.drainEvents();
  const [A, B] = [...x.members.values()];
  for (const m of [A, B]) m.player.maxHp = m.player.hp = 1e6;
  // Élite fijo: lo abate Ana con Beto al lado
  const elite = x.g.actors.find(e => e instanceof x.E.Enemy && e.elite && e.alive);
  assert.ok(elite, 'la zarza élite está en el piso'); assert.equal(elite.kindId, 'zarza');
  A.player.placeAt(elite.x + 30, elite.y); B.player.placeAt(elite.x - 30, elite.y);
  E.Combat.hit(x.g, elite, { team: 'player', fixed: 1e9, src: A.player }); run(x, .3);
  for (const m of [A, B]) assert.equal(m.save.story.counters.c1_elites, 1, m.name);
  // El resto de criaturas: las que abate Ana
  const others = x.g.actors.filter(e => e instanceof x.E.Enemy && e.alive && !e.elite).slice(0, 5);
  for (const e of others) { A.player.placeAt(e.x + 20, e.y); E.Combat.hit(x.g, e, { team: 'player', fixed: 1e9, src: A.player }); run(x, .1); }
  assert.equal(A.save.story.counters.c1_kills, 1 + others.length);
  // Rastros: los dos leen los cuatro sitios (sin enemigos cerca)
  x.g.actors = x.g.actors.filter(e => !(e instanceof x.E.Enemy)); x.drainEvents();
  for (const st of x.story) { A.player.placeAt(st.x, st.y); B.player.placeAt(st.x + 4, st.y); run(x, .1); }
  for (const m of [A, B]) assert.deepEqual(['z_raiz', 'z_savia', 'z_huellas', 'z_campamento'].filter(id => m.save.codex.lore.includes(id)).length, 4);
  // Salida por el sendero: vuelta a la aldea (no «completada»)
  A.player.placeAt((x.L.stairs.tx + .5) * 32, (x.L.stairs.ty + .5) * 32); B.player.placeAt((x.L.stairs.tx + .5) * 32, (x.L.stairs.ty + .5) * 32); run(x, .5);
  const end = x.drainEvents().find(e => e.type === 'end'); assert.ok(end, 'la expedición termina'); assert.equal(end.result, 'return');
  const res = x.settle(A, 'return'); assert.ok(res.success); assert.ok(!res.profile.cleared.includes('linde'), 'la zona no cuenta como mazmorra');
  assert.equal(res.profile.story.counters.c1_elites, 1);
});

test('misiones del capítulo: introducción, aceptar, pasos con hechos guardados, entregar una vez, recompensas y cambio de la aldea', () => {
  let s = vecina('guerrero');
  assert.equal(C.state(s, 'c1_main'), 'locked', 'sin la introducción no hay capítulo');
  assert.throws(() => op(s, 'questAccept', { id: 'c1_main' }), /no se puede aceptar/);
  s = op(s, 'talk', { id: 'c1_intro' }).save;
  assert.ok(s.story.flags.includes('c1_intro'));
  assert.deepEqual(C.at(s, 'guild').sort(), ['c1_irene', 'c1_main']); assert.deepEqual(C.at(s, 'mayor'), ['c1_lenador']);
  assert.deepEqual(C.at(s, 'nara'), [], 'Nara Vey ofrece sus misiones después de hablar con ella');
  const acc = op(s, 'questAccept', { id: 'c1_main' }); s = acc.save; assert.ok(acc.info.lines.length);
  assert.throws(() => op(s, 'questAccept', { id: 'c1_main' }), /no se puede aceptar/, 'no se acepta dos veces');
  assert.throws(() => op(s, 'questTurnIn', { id: 'c1_main' }), /aún no está lista/);
  s = op(s, 'talk', { id: 'nara_c1' }).save;
  assert.throws(() => op(s, 'talk', { id: 'nara_rastros' }), /nada que contarte/, 'sin los tres rastros, Nara no saca conclusiones');
  for (const z of ['z_raiz', 'z_savia', 'z_huellas']) SC.visit(s, z);
  s = op(s, 'talk', { id: 'nara_rastros' }).save;
  SC.visit(s, 'estela_tibia');
  assert.deepEqual(C.steps(s, 'c1_main').map(p => p.ok), [true, true, true, true, false]);
  s.cleared.push('bosque');                                                  // (el guardián vencido: ver la prueba de la guarida)
  assert.equal(C.state(s, 'c1_main'), 'ready');
  const bank = s.bank, pts = s.points, lv = s.prog.level;
  const t = op(s, 'questTurnIn', { id: 'c1_main' }); s = t.save;
  assert.equal(s.bank, bank + 260); assert.equal(s.points, pts + 30); assert.ok(s.prog.level > lv || s.prog.exp > 0);
  assert.equal(new E.Inventory(s.inv, () => 99).count('brocheRoble'), 1); assert.ok(s.codex.relics.includes('brocheRoble'));
  assert.ok(s.story.flags.includes('c1_done') && t.info.built.length, 'la aldea cambia');
  assert.throws(() => op(s, 'questTurnIn', { id: 'c1_main' }), /aún no está lista/, 'una sola vez');
  assert.equal(C.state(s, 'c1_main'), 'done');
  // Guardado: sobrevive a guardar y cargar
  const back = E.Save.sanitize(JSON.parse(JSON.stringify(s))).data; assert.equal(back.story.quests.c1_main, 'done'); assert.ok(back.guild.claims.includes('quest:c1_main'));
});

test('secundarias: no se bloquea nada — lo hecho antes de aceptarlas cuenta; se pueden entregar después de la principal; inventario lleno', () => {
  let s = vecina('asesino'); SC.talk(s, 'c1_intro'); SC.talk(s, 'nara_c1');
  for (let i = 0; i < 12; i++) E.Quests.progress({ save: s }, 'defeat', { dungeon: i % 2 ? 'bosque' : 'linde', elite: i === 3 });
  E.Quests.progress({ save: s }, 'defeat', { dungeon: 'gruta' }); E.Quests.progress({ save: s }, 'defeat', { dungeon: 'bosque', boss: true });
  assert.deepEqual(s.story.counters, { c1_kills: 12, c1_elites: 1 }, 'solo criaturas de Brumaverde, sin el guardián');
  for (const id of ['c1_poda', 'c1_elite']) { assert.equal(C.state(s, id), 'available'); s = op(s, 'questAccept', { id }).save; assert.equal(C.state(s, id), 'ready', id + ': ya hecha al aceptarla'); }
  // Gil: campamento en el Linde y refugio en el Bosque, antes de hablar con Bartolo
  SC.visit(s, 'z_campamento'); const g = SC.visit(s, 'refugio_gil'); assert.ok(g.gains.length && s.story.flags.includes('gil_rescatado'));
  s = op(s, 'questAccept', { id: 'c1_lenador' }).save; assert.equal(C.state(s, 'c1_lenador'), 'ready');
  // Inventario lleno: lo que no cabe se cobra
  s.inv = Array.from({ length: E.rankOf(s.points).bag }, (_, i) => ({ uid: 'f' + i, id: 'cofre', qty: 1 }));
  const bank = s.bank, r = op(s, 'questTurnIn', { id: 'c1_lenador' }); assert.ok(r.info.got.some(t => /vendido/.test(t))); assert.ok(r.save.bank > bank + 110);
  // Marca de Irene: los pasos reutilizan la conversación con Ulula y la página 1 (StoryChain)
  s = r.save; s = op(s, 'questAccept', { id: 'c1_irene' }).save; SC.visit(s, 'marca_irene'); s = op(s, 'talk', { id: 'ulula_irene' }).save; SC.visit(s, 'irene_p1');
  assert.equal(C.state(s, 'c1_irene'), 'ready');
});

test('guarida: Robletón vencido en grupo de tres; cada perfil elegible cuenta el paso y recibe su trofeo una vez', () => {
  const ps = ['guerrero', 'mago', 'arquero'].map(sp => { const s = vecina(sp); SC.talk(s, 'c1_intro'); return s; });
  ps[2].cleared = []; const x = new Expedition({ dungeonId: 'bosque', seed: 9, members: party(ps), random: seeded(5) });
  x.loadStep(x.seq.length - 1); for (const m of x.members.values()) m.player.maxHp = m.player.hp = 1e6;
  const b = x.boss; assert.equal(b.kind.bk, 'espinas'); assert.ok(b.maxHp < E.makeBossKind('robleton').base.hp * 40, 'escalado moderado');
  E.Combat.hit(x.g, b, { team: 'player', fixed: 1e9, src: [...x.members.values()][0].player }); run(x, .3);
  for (const m of x.members.values()) {
    const r = x.settle(m, 'clear'); assert.ok(r.profile.cleared.includes('bosque'));
    assert.equal(C.steps(r.profile, 'c1_main')[4].ok, true, m.name);
    assert.equal(new E.Inventory(r.profile.inv, () => 99).count('coronaEspinas'), 1, 'trofeo para cada uno');
    const again = x.settle(m, 'clear', true); assert.equal(new E.Inventory(again.profile.inv, () => 99).count('coronaEspinas'), 1, 'una vez');
  }
});

test('auditoría 0.46: seguimiento en pantalla, orden de las conversaciones con Nara y progreso de la campaña en línea durante la expedición', () => {
  // Contar los rastros a Nara exige haberla conocido antes
  const s = vecina(); SC.talk(s, 'c1_intro'); for (const z of ['z_raiz', 'z_savia', 'z_huellas']) E.Codex.add(s, 'lore', z);
  assert.deepEqual(SC.talks(s, 'nara'), ['nara_c1']);
  SC.talk(s, 'nara_c1'); assert.ok(SC.talks(s, 'nara').includes('nara_rastros'));
  // Seguimiento: la principal primero, con su siguiente paso; si está lista, a quién entregarla
  C.accept(s, 'c1_poda'); C.accept(s, 'c1_main');
  let t = C.tracker(s); assert.equal(t[0].id, 'c1_main'); assert.match(t[0].text, /Cuéntale a Nara/); assert.match(t[1].text, /\(0\/12\)/);
  for (let i = 0; i < 12; i++) C.event(s, 'defeat', { dungeon: 'linde' });
  t = C.tracker(s); assert.equal(t[1].text, 'Entrégala a Nara Vey'); assert.ok(t[1].ready);
  assert.deepEqual(C.tracker(vecina()), []);
  // En línea: el servidor manda el progreso al jugador (contadores, misión lista) y avisa si un rastro no se puede leer aún
  const a = vecina(); SC.talk(a, 'c1_intro'); SC.talk(a, 'nara_c1'); C.accept(a, 'c1_elite');
  const x = new Expedition({ dungeonId: 'linde', seed: 9, members: party([a, vecina('mago')]), random: seeded(2) });
  const [A, B] = [...x.members.values()]; for (const m of [A, B]) m.player.maxHp = m.player.hp = 1e6; x.drainEvents();
  const el = x.g.actors.find(e => e instanceof x.E.Enemy && e.elite && e.alive);
  A.player.placeAt(el.x + 20, el.y); B.player.placeAt(el.x - 20, el.y);
  x.E.Combat.hit(x.g, el, { team: 'player', fixed: 1e9, src: A.player }); run(x, .2);
  const ev = x.drainEvents().filter(e => e.type === 'campaign');
  const toA = ev.find(e => e.to === A.id), toB = ev.find(e => e.to === B.id);
  assert.ok(toA && toB, 'cada jugador recibe su progreso'); assert.equal(toA.counters.c1_elites, 1); assert.deepEqual(toA.ready, ['c1_elite']); assert.deepEqual(toB.ready, []);
  // Rastro con un enemigo en alerta cerca: un aviso (una vez), sin leerlo
  const st = x.story[0], foe = x.g.actors.find(e => e instanceof x.E.Enemy && e.alive);
  assert.ok(foe, 'hay criaturas en el Linde');
  foe.aggro = true; A.player.placeAt(st.x, st.y); foe.x = st.x + 60; foe.y = st.y; x.readStory(A, x.story[0]); x.readStory(A, x.story[0]);
  const notes = x.drainEvents().filter(e => e.type === 'storyNote' && e.to === A.id);
  assert.equal(notes.length, 1, 'un solo aviso'); assert.ok(!A.storyRead.has(st.id), 'se podrá leer después');
});
