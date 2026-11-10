/** Secretos de la historia, registro de descubrimientos y cadena «El diario de Irene» (0.44, docs/SECRETOS.md):
 *  sitios fijos que aparecen en todas las semillas y tamaños de grupo (y se alcanzan en solitario), reglas de la cadena
 *  con sus bloqueos, decisión única, ofrendas desde el combate real, tercera vía, migración 8 → 9, servidor con dos
 *  jugadores de progreso distinto (cada uno con SU perfil), Raíces Hondas y operaciones de la aldea (talk, setTitle). */
import test from 'node:test';
import assert from 'node:assert/strict';
import { Expedition } from '../server/src/sim/Expedition.js';
import { applyOp } from '../server/src/profile/rules.js';
import { E, freshSave, seeded, STEP } from './helpers.mjs';

const SC = E.StoryChain;
const run = (x, s, each) => { for (let i = 0; i < Math.round(s / STEP); i++) { if (each) each(i * STEP); x.step(STEP); if (x.pauseT > 0) x.pauseT = 0; } };
const party = profiles => profiles.map((profile, i) => ({ id: 'p' + i, name: 'J' + i, profile }));
const visit = (s, id) => SC.visit(s, id);
/** Perfil con el progreso de la cadena hasta `upto` (lo hace con las mismas funciones del juego). */
function chainTo(upto, sp = 'mago') {
  const s = freshSave(sp); s.arrived = true;
  const steps = [['marca_irene'], ['talk', 'ulula_irene'], ['irene_p1'], ['nido_cuervo'], ['archivo_fieles'], ['sello_memoria'], ['sello_peso'], ['choose', 'liberar'], ['sello_fuego']];
  for (const [a, b] of steps.slice(0, upto)) { if (a === 'talk') SC.talk(s, b); else if (a === 'choose') SC.choose(s, 'bernardo', b); else SC.visit(s, a); }
  return s;
}

test('sitios fijos: aparecen en todas las semillas y tamaños de grupo, en su piso, y el piso sigue siendo válido (alcanzable en solitario)', () => {
  for (const [id, S0] of Object.entries(E.STORY_SITES)) {
    const dng = E.dungeonById(S0.dungeon); assert.ok(dng, id);
    let hidden = 0;
    for (let seed = 1; seed <= 100; seed++) for (const size of [1, 2, 3, 4]) {
      const g = E.FloorGen.generate(seed * 7919 + 13, dng, S0.floor, 'normal', [], size), st = g.layout.story.find(q => q.id === id);
      assert.ok(st, `${id} semilla ${seed} tamaño ${size}`);
      assert.ok(g.validation.ok && g.validation.checks.storyPlaced && g.validation.checks.mechsSolvable, `${id} ${seed}/${size}`);
      if (st.hidden) {
        hidden++;
        const fw = g.layout.mechs.find(m => m.type === 'falsewall' && m.room === st.room); assert.ok(fw, 'tras una pared falsa');
        assert.ok(fw.tiles.every(i => g.world.tiles[i] === E.T.SECRET));
      }
    }
    if (S0.hidden) assert.ok(hidden >= 390, `${id}: casi siempre oculto (${hidden}/400)`); else assert.equal(hidden, 0, id);
  }
  // Mismo piso cada vez (el navegador y el servidor lo generan igual; no depende de ningún perfil)
  const a = E.FloorGen.generate(77, E.dungeonById('gruta'), 4, 'normal', [], 2), b = E.FloorGen.generate(77, E.dungeonById('gruta'), 4, 'normal', [], 2);
  assert.deepEqual(a.layout.story, b.layout.story); assert.deepEqual([...a.world.tiles], [...b.world.tiles]);
  // En los pisos con un sitio que pone un texto fijo, ese texto no se repite al azar
  for (let seed = 1; seed <= 60; seed++) { const g = E.FloorGen.generate(seed, E.dungeonById('bosque'), 3, 'normal', [], 1); assert.ok(!g.layout.lore.some(l => l.id === 'f_explorador'), 'sin repetir la marca'); }
});

test('cadena: cada pieza exige la anterior y lo dice; leer otra vez no da nada; el orden de la Raíz y la Luz cambia la lectura', () => {
  const s = freshSave('mago');
  assert.equal(visit(s, 'irene_p1').state, 'locked', 'sin la clave de Ulula no se entiende');
  assert.equal(SC.talks(s, 'guild').length, 0, 'Ulula no tiene nada que contar sin haber leído la marca');
  assert.equal(SC.talk(s, 'ulula_irene'), null);
  assert.equal(visit(s, 'marca_irene').state, 'ok'); assert.ok(s.codex.lore.includes('f_explorador'));
  assert.deepEqual(SC.talks(s, 'guild'), ['ulula_irene']);
  const t = SC.talk(s, 'ulula_irene'); assert.ok(t.lines.length && s.story.flags.includes('codigo_tiza'));
  assert.deepEqual(SC.talk(s, 'ulula_irene').gains, [], 'la segunda vez solo repite');
  const p1 = visit(s, 'irene_p1'); assert.equal(p1.state, 'ok'); assert.deepEqual(s.codex.pages, ['p1']);
  assert.deepEqual(visit(s, 'irene_p1').gains, [], 'leer otra vez no da nada');
  const a1 = visit(s, 'archivo_fieles'); assert.equal(a1.state, 'locked'); assert.match(a1.text, /hebilla/);
  visit(s, 'nido_cuervo'); assert.ok(s.story.flags.includes('hebilla') && s.codex.lore.includes('f_nido'));
  assert.equal(visit(s, 'archivo_fieles').state, 'ok'); assert.deepEqual(s.codex.pages, ['p1', 'p2']);
  // La rueda del Bosque no se entiende hasta leer la de la Gruta; después, la Gruta da también la del Bosque
  const r0 = visit(s, 'sello_raiz'); assert.ok(!s.codex.lemas.includes('raiz') && s.story.flags.includes('rueda_raiz'), r0.text);
  const pts = s.points; visit(s, 'sello_luz'); assert.deepEqual(s.codex.lemas.sort(), ['luz', 'raiz']); assert.equal(s.points, pts + 4, '+2 de reputación por lema nuevo');
  // Memoria sin la página 2 no da la 3 (otro perfil); con ella, sí
  const other = freshSave('guerrero'); visit(other, 'sello_memoria'); assert.ok(other.codex.memories.includes('r1') && !other.codex.pages.includes('p3'));
  visit(s, 'sello_memoria'); assert.ok(s.codex.pages.includes('p3') && s.codex.memories.includes('r1'));
  const peso = visit(s, 'sello_peso'); assert.equal(peso.choice, 'bernardo'); assert.ok(s.codex.pages.includes('p4'));
  visit(s, 'sello_fuego'); assert.deepEqual(s.codex.pages, ['p1', 'p2', 'p3', 'p4', 'p5']); assert.ok(s.codex.memories.includes('r2'));
  assert.equal(SC.visit(s, 'sitio_inventado'), null);
});

test('decisión de Bernardo: solo tras verle, una vez, y «dejarle» cierra la tercera vía de ESE perfil', () => {
  const s = freshSave('arquero');
  assert.equal(SC.choose(s, 'bernardo', 'liberar'), null, 'sin haberle visto no se puede decidir');
  visit(s, 'sello_peso');
  assert.equal(SC.choose(s, 'bernardo', 'nada'), null);
  const r = SC.choose(s, 'bernardo', 'dejar'); assert.ok(r.ok); assert.equal(s.story.choices.bernardo, 'dejar');
  assert.equal(SC.choose(s, 'bernardo', 'liberar'), null, 'no se cambia');
  assert.equal(SC.thirdWay(s).lost, true);
  assert.deepEqual(SC.talks(s, 'mayor'), ['bartolo_bernardo']); assert.match(SC.talk(s, 'bartolo_bernardo').lines.join(' '), /No me lo creo/);
});

test('tercera vía: se descubre al completar lo que existe (páginas 1-5, recuerdos 1-2, 3 ofrendas, Bernardo libre); +30 y título una vez', () => {
  const s = chainTo(9);
  let tw = SC.thirdWay(s); assert.equal(tw.ready, false); assert.deepEqual(tw.items.map(i => i.have), [5, 2, 0, 1]);
  assert.equal(SC.offering(s, 'robleton', { down: true }).length, 0, 'Robletón: tiene que ser enredado');
  assert.ok(SC.offering(s, 'robleton', { tangle: true, down: true }).length);
  SC.offering(s, 'reinageoda', { daze: true });
  const p0 = s.points, lines = SC.offering(s, 'gromgar', { down: true });
  assert.ok(lines.some(l => /Tercera vía/.test(l))); assert.equal(s.points, p0 + 30);
  assert.ok(s.story.flags.includes('tercera_via')); assert.ok(E.Guild.titles(s).includes('Lector del diario de Irene'));
  assert.deepEqual(SC.check(s), [], 'una sola vez'); assert.deepEqual(SC.offering(s, 'gromgar', { down: true }), [], 'ofrenda repetida: nada');
  tw = SC.thirdWay(s); assert.ok(tw.unlocked && tw.future.length >= 3, 'el registro dice lo que llegará con los capítulos 6 a 8');
  assert.deepEqual(SC.talks(s, 'guild').sort(), ['ulula_irene', 'ulula_tercera']);
});

test('guardado: la partida guarda y valida el registro nuevo; la migración 8 → 9 no pierde nada y apunta la hebilla si ya leyó el nido', () => {
  const s = chainTo(9); SC.offering(s, 'gromgar', { down: true });
  const c = E.Save.sanitize(structuredClone(s)); assert.ok(c.ok);
  for (const k of ['pages', 'lemas', 'memories', 'talks', 'offerings']) assert.deepEqual(c.data.codex[k], s.codex[k], k);
  assert.deepEqual(c.data.story.choices, { bernardo: 'liberar' });
  const bad = E.Save.sanitize(Object.assign(structuredClone(s), { codex: Object.assign({}, s.codex, { pages: ['p1', 'p9', 'p1'], offerings: ['cosa'] }), story: Object.assign({}, s.story, { choices: { bernardo: 'raro', otra: 'x' } }) }));
  assert.deepEqual(bad.data.codex.pages, ['p1']); assert.deepEqual(bad.data.codex.offerings, []); assert.deepEqual(bad.data.story.choices, {});
  const v8 = structuredClone(freshSave('guerrero', { bank: 321, cleared: ['bosque'] })); v8.v = 8; v8.codex = { lore: ['f_nido', 'f_carro'], secrets: [], relics: [] }; v8.story = { flags: ['llegada'], endings: [] };
  const m = E.Save.sanitize(v8); assert.ok(m.ok); assert.equal(m.from, 8); assert.equal(m.data.v, E.SAVE_VERSION);
  assert.equal(m.data.bank, 321); assert.deepEqual(m.data.codex.lore, ['f_nido', 'f_carro']);
  assert.ok(m.data.story.flags.includes('hebilla'), 'ya tenía la hebilla'); assert.deepEqual(m.data.story.choices, {});
  assert.deepEqual(E.Save.sanitize(m.data).data, m.data, 'idempotente');
});

test('servidor: dos jugadores en el piso 4 del Bosque; cada uno lee el sitio con SU perfil (uno ve la página y el otro el texto bloqueado), una vez', () => {
  const a = chainTo(2), b = freshSave('guerrero');
  let x = null;
  for (let seed = 1; seed < 40 && !x; seed++) { const y = new Expedition({ dungeonId: 'bosque', seed, members: party([a, b]), random: seeded(3) }); const i = y.seq.findIndex(q => q.kind === 'normal' && q.floorNo === 4); if (i < 0) continue; y.loadStep(i); x = y; }
  assert.ok(x); assert.equal(x.story.length, 1);
  x.g.actors = x.g.actors.filter(e => !(e instanceof E.Enemy)); x.drainEvents();
  const st = x.story[0], [ma, mb] = [...x.members.values()];
  // La pared falsa se rompe a golpes (es de todos)
  const fw = x.mechs.list.find(m => m.type === 'falsewall'), W = x.L.w;
  for (let k = 0; k < 6 && !fw.broken; k++) { const i = fw.tiles[0]; x.mechs.hit('player', (i % W + .5) * 32, ((i / W | 0) + .5) * 32, 20, ma.player); run(x, .3); }
  assert.ok(fw.broken, 'pared rota');
  ma.player.placeAt(st.x, st.y); mb.player.placeAt(st.x + 4, st.y); run(x, .2);
  const ev = x.drainEvents().filter(e => e.type === 'story');
  assert.equal(ev.length, 2);
  const ea = ev.find(e => e.to === ma.id), eb = ev.find(e => e.to === mb.id);
  assert.equal(ea.res.state, 'ok'); assert.ok(ma.save.codex.pages.includes('p1'));
  assert.equal(eb.res.state, 'locked'); assert.ok(!mb.save.codex.pages.length, 'el otro no se lleva la página');
  run(x, .5); assert.equal(x.drainEvents().filter(e => e.type === 'story').length, 0, 'una vez por piso');
  // El resultado de la expedición guarda lo descubierto en el perfil de cada uno
  const res = x.settle(ma, 'return'); assert.ok(res.profile.codex.pages.includes('p1'));
});

test('servidor: Robletón enredado → ofrenda para los dos; la rueda aparece junto a la salida y cada uno la lee', () => {
  const x = new Expedition({ dungeonId: 'bosque', seed: 5, members: party([freshSave('mago'), freshSave('asesino')]), random: seeded(3) });
  x.loadStep(x.seq.length - 1); for (const m of x.members.values()) m.player.maxHp = m.player.hp = 1e6;
  x.boss.aggro = true; run(x, .3); x.drainEvents();
  const b = x.boss, D = E.BossKit.DEFS.espinas, st = x.g.boulders.find(r => r.solid), p = [...x.members.values()][0].player;
  p.placeAt(st.cx + 52, st.cy); E.BossArena.unstick(p, x.g);
  E.BossKit.begin(b, x.g, D.moves.salto, E.BossKit.st(b), D, p); run(x, 1.0); p.placeAt(p.x + 120, p.y + 40); E.BossArena.unstick(p, x.g); run(x, 1.0);
  assert.ok(b.feats && b.feats.tangle, 'enredado');
  E.Combat.hit(x.g, b, { team: 'player', fixed: 1e9, src: p }); run(x, .3);
  const notes = x.drainEvents().filter(e => e.type === 'storyNote'); assert.equal(notes.length, 2);
  for (const m of x.members.values()) assert.deepEqual(m.save.codex.offerings, ['bellotaMirla']);
  const seal = x.objects.find(o => o.type === 'seal'); assert.ok(seal && x.view().objects.some(o => o.type === 'seal'), 'la rueda viaja a los clientes');
  for (const m of x.members.values()) m.player.placeAt(seal.x, seal.y);
  run(x, .2); const ev = x.drainEvents().filter(e => e.type === 'story'); assert.equal(ev.length, 2);
  for (const m of x.members.values()) assert.ok(m.save.story.flags.includes('rueda_raiz'));
  // Al reanudar la guarida desde la instantánea, la rueda sigue ahí
  const snap = x.snapshot('boss'); assert.ok(snap.floor.extra.some(o => o.type === 'seal'));
});

test('servidor: la decisión de Bernardo solo se acepta si se le ofreció a ESE jugador, una vez', () => {
  const s = chainTo(6);
  const x = new Expedition({ dungeonId: 'mina', seed: 3, members: party([s, freshSave('guerrero')]), random: seeded(3) });
  x.loadStep(x.seq.length - 1); for (const m of x.members.values()) m.player.maxHp = m.player.hp = 1e6;
  const [ma, mb] = [...x.members.values()];
  E.Combat.hit(x.g, x.boss, { team: 'player', fixed: 1e9, src: ma.player }); run(x, .3); x.drainEvents();
  assert.equal(x.choose(ma.id, 'bernardo', 'liberar'), false, 'aún no se le ha ofrecido');
  const seal = x.objects.find(o => o.type === 'seal'); ma.player.placeAt(seal.x, seal.y); run(x, .2);
  const ev = x.drainEvents().find(e => e.type === 'story' && e.to === ma.id); assert.equal(ev.res.choice, 'bernardo'); assert.ok(ma.save.codex.pages.includes('p4'));
  assert.equal(x.choose(mb.id, 'bernardo', 'liberar'), false, 'al otro no se le ofreció');
  assert.equal(x.choose(ma.id, 'bernardo', 'cosa'), false);
  assert.equal(x.choose(ma.id, 'bernardo', 'liberar'), true); assert.equal(ma.save.story.choices.bernardo, 'liberar');
  assert.equal(x.choose(ma.id, 'bernardo', 'dejar'), false, 'una vez');
  assert.ok(!mb.save.story.choices.bernardo);
});

test('ofrendas desde el combate real: Reina Geoda aturdida y Gromgar derribado dejan su marca', () => {
  const g = new Expedition({ dungeonId: 'mina', seed: 5, members: party([freshSave('guerrero')]), random: seeded(3) }); g.loadStep(g.seq.length - 1);
  E.BossKit.vulnerable(g.boss, g.g, 1, 'prueba', .4); assert.ok(g.boss.feats.down);
  const q = new Expedition({ dungeonId: 'gruta', seed: 5, members: party([freshSave('guerrero')]), random: seeded(3) }); q.loadStep(q.seq.length - 1);
  E.Geoda.daze(q.boss, q.g); assert.ok(q.boss.feats.daze);
});

test('Raíces Hondas: se abre tras el Cráter, jefe opcional con BossKit y trofeo único, reliquia de la Cámara del latido una sola vez', () => {
  const d = E.dungeonById('raices'); assert.ok(d && d.optional); assert.equal(d.unlock, 'crater');
  assert.equal(E.dungeonOpen(freshSave('mago', { cleared: ['bosque', 'gruta', 'cienaga', 'mina'] }), d), false);
  assert.equal(E.dungeonOpen(freshSave('mago', { cleared: ['bosque', 'gruta', 'cienaga', 'mina', 'crater'] }), d), true);
  const k = E.makeBossKind('ecoRobleton'); assert.equal(k.bk, 'ecoEspinas'); assert.ok(E.BossKit.DEFS.ecoEspinas.moves.persecucion);
  const s = freshSave('mago', { cleared: ['bosque', 'gruta', 'cienaga', 'mina', 'crater'] });
  const r1 = visit(s, 'raiz_corazon'); assert.equal(r1.relic, 'corazonRaiz'); assert.equal(visit(s, 'raiz_corazon').relic, undefined, 'una vez');
  assert.deepEqual(E.BossKit.grant(s, 'ecoRobleton', new E.Inventory(s.inv, () => 40)), ['Trofeo único por vencer a Eco de Robletón: Corteza del Eco.']);
  // El Eco persigue: sus raíces nacen hacia donde está ahora el héroe
  const x = new Expedition({ dungeonId: 'raices', seed: 4, members: party([freshSave('guerrero')]), random: seeded(3) }); x.loadStep(x.seq.length - 1);
  const b = x.boss, p = [...x.members.values()][0].player; p.maxHp = p.hp = 1e6; b.aggro = true; run(x, .3);
  p.placeAt(b.x + 200, b.y); E.BossArena.unstick(p, x.g);
  E.BossKit.begin(b, x.g, E.BossKit.DEFS.ecoEspinas.moves.persecucion, E.BossKit.st(b), E.BossKit.DEFS.ecoEspinas, p);
  run(x, 1.2); const z0 = x.g.zones.filter(z => z.owner === b).length; assert.ok(z0 >= 1, 'raíz avisada');
  run(x, 1.6); assert.ok(x.g.zones.some(z => z.owner === b), 'la siguiente raíz sale tras la anterior');
});

test('trofeo de Robletón: la Corona de Espinas se da de verdad (antes no la encontraba por su id) y se valida al cargar', () => {
  const s = freshSave('guerrero'), bag = new E.Inventory(s.inv, () => 40);
  assert.match(E.BossKit.grant(s, 'robleton', bag).join(), /Corona de Espinas/); assert.equal(bag.count('coronaEspinas'), 1);
  assert.deepEqual(E.Save.sanitize(s).data.bosses.robleton, { kills: 1, trophy: true });
});

test('aldea (servidor): conversación y título con las mismas reglas que sin red', () => {
  const s = freshSave('mago'); s.arrived = true;
  assert.throws(() => applyOp(E, s, 'talk', { id: 'ulula_irene' }), /nada que contarte/);
  assert.throws(() => applyOp(E, s, 'talk', { id: 'inventada' }), /no válida/);
  s.codex.lore.push('f_explorador');
  const r = applyOp(E, s, 'talk', { id: 'ulula_irene' }); assert.ok(r.save.story.flags.includes('codigo_tiza')); assert.ok(r.info.lines.length);
  assert.throws(() => applyOp(E, r.save, 'setTitle', { title: 'Lector del diario de Irene' }), /aún no lo tienes/);
  const t = chainTo(9); SC.offering(t, 'robleton', { tangle: true }); SC.offering(t, 'reinageoda', { daze: true }); SC.offering(t, 'gromgar', { down: true });
  const r2 = applyOp(E, t, 'setTitle', { title: 'Lector del diario de Irene' }); assert.equal(r2.info.title, 'Lector del diario de Irene');
  assert.equal(applyOp(E, r2.save, 'setTitle', { title: '' }).info.title, E.RANK_TITLES[E.Guild.rankIndex(t)]);
});
