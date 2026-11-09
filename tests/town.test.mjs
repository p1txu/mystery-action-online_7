/**
 * Aldea que evoluciona (0.43), con el núcleo real y la simulación real del servidor:
 *  - reputación del gremio: fuentes con límite, penalización que no baja de rango, títulos;
 *  - contratos: solo los que el rango permite, solo donde se pueden cumplir, estrellas según el rango,
 *    sin repetir los recientes; caza de élites, investigación y cámara secreta avanzan en el servidor;
 *  - mejora de la aldea: proyecto de la forja → construida una vez → equipo especial según el rango;
 *  - evento regional «invasor»: aparece y caduca de forma determinista; el invasor sale en su piso,
 *    se resuelve una vez (también en grupo y al reanudar), quien ayuda gana +5 una vez;
 *  - formato 8: migración desde el 7 y guardar/cargar sin perder nada.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { Expedition } from '../server/src/sim/Expedition.js';
import { applyOp } from '../server/src/profile/rules.js';
import { E, freshSave, seeded, STEP } from './helpers.mjs';

const run = (x, s) => { for (let i = 0; i < Math.round(s / STEP); i++) x.step(STEP); };
const vet = (extra = {}) => E.Save.sanitize(freshSave('guerrero', Object.assign({ cleared: ['bosque', 'gruta'], arrived: true, points: 80 }, extra))).data;
const roundTrip = s => E.Save.sanitize(JSON.parse(JSON.stringify(s))).data;

test('reputación: la primera victoria contra cada guardián da +40 una vez; una penalización no baja de rango; títulos por rango', () => {
  const s = vet({ points: 70 }), d = E.dungeonById('gruta');
  assert.equal(E.Guild.bossDefeated(s, d).length, 1); assert.equal(s.points, 110);
  assert.deepEqual(E.Guild.bossDefeated(s, d), [], 'la segunda vez no'); assert.equal(s.points, 110);
  E.Guild.addRep(s, -500); assert.equal(s.points, 60, 'se queda en el mínimo de Bronce');
  assert.equal(E.Guild.title(s), 'Explorador de Bronce'); assert.deepEqual(E.Guild.titles(s), ['Explorador novato', 'Explorador de Bronce']);
  s.guild.title = 'Explorador de Oro'; assert.equal(E.Guild.title(roundTrip(s)), 'Explorador de Bronce', 'un título no desbloqueado no vale');
});

test('contratos: rango, viabilidad, estrellas y variedad en 300 tablones', () => {
  const seen = new Set();
  for (const pts of [0, 80, 250, 500, 1000]) {
    const s = vet({ points: pts, cleared: ['bosque', 'gruta', 'cienaga', 'mina'] }), rank = E.Guild.rankIndex(s);
    for (let seed = 1; seed <= 60; seed++) for (const j of E.Jobs.board(s, seed * 101)) {
      seen.add(j.type);
      if (j.project) continue;
      assert.ok((E.Jobs.minRank[j.type] || 0) <= rank, `${j.type} con rango ${rank}`);
      assert.ok(E.Jobs.feasible(j.type, E.dungeonById(j.dungeon)), `${j.type} imposible en ${j.dungeon}`);
      assert.ok('EDCBAS'.indexOf(j.stars) <= E.RANK_STARS[rank], `★${j.stars} con rango ${rank}`);
      if (j.type === 'lore' || j.type === 'secret') assert.equal(j.dungeon, 'bosque', 'textos y salas secretas solo donde existen (hoy, el Bosque)');
      if (j.type === 'elite') assert.ok(j.goal >= 1 && j.goal <= 3);
    }
  }
  for (const t of ['elite', 'lore', 'secret']) assert.ok(seen.has(t), 'sale ' + t);
  const normal = vet({ points: 0 });
  for (let seed = 1; seed <= 60; seed++) assert.ok(!E.Jobs.board(normal, seed).some(j => j.type === 'elite' || j.type === 'secret'), 'sin rango no hay élites ni cámaras');
});

test('contratos: el tablón no repite lo aceptado ni lo entregado hace poco', () => {
  const s = vet({ points: 250, cleared: ['bosque', 'gruta', 'cienaga'] });
  let repeats = 0, total = 0;
  for (let seed = 1; seed <= 80; seed++) {
    const b = E.Jobs.board(s, seed * 7 + 3), j = b.find(q => !q.project);
    const recent = new Set([...s.jobs, ...s.log.jobs.slice(-6)].map(q => E.Jobs.sig(q)));
    for (const q of b) { total++; if (!q.project && recent.has(E.Jobs.sig(q))) repeats++; }
    E.logJob(s, j);                                                     // se entrega uno de cada tablón
    assert.equal(new Set(b.map(q => E.Jobs.sig(q))).size, b.length, 'sin repetidos en el mismo tablón');
  }
  assert.ok(repeats / total < .03, `repeticiones recientes: ${repeats}/${total}`);
});

test('servidor: la caza de élites, la investigación y la cámara secreta avanzan con lo que hace cada uno', () => {
  const s = vet({ points: 250 });
  s.jobs = [{ id: 1, type: 'elite', dungeon: 'bosque', goal: 1 }, { id: 2, type: 'lore', dungeon: 'bosque', goal: 2 }, { id: 3, type: 'secret', dungeon: 'bosque', goal: 1 }]
    .map(j => Object.assign({ client: 'Lumi', stars: 'C', state: 'accepted', progress: 0, reward: { exp: 10, gems: 10, item: 'baya', points: 10 } }, j));
  const x = new Expedition({ dungeonId: 'bosque', seed: 3, random: seeded(4), members: [{ id: 'a', name: 'Ana', profile: s }] });
  const p = x.members.get('a').player; p.invincible = true;
  const jobs = () => x.members.get('a').save.jobs;
  // Recorre los pisos leyendo los textos y entrando en las salas secretas (como haría el jugador)
  for (let i = 0; i < x.seq.length - 1 && jobs().filter(j => j.type !== 'elite').some(j => j.state !== 'done'); i++) {
    if (i) x.nextStep();
    x.g.actors = x.g.actors.filter(a => !(a instanceof x.E.Enemy));
    for (const l of x.L.lore || []) { p.placeAt((l.tx + .5) * 32, (l.ty + .5) * 32 + 2); run(x, .05); }
    for (const r of x.L.rooms.filter(q => q.role === 'secret')) { p.placeAt((r.x + r.w / 2) * 32, (r.y + r.h / 2) * 32); run(x, .05); }
  }
  // Leer otra vez el mismo texto en el mismo piso no cuenta dos veces
  const before = jobs().find(j => j.type === 'lore').progress;
  const el = x.addEnemy(new x.E.Enemy(x.E.makeKind('pufon'), p.x + 30, p.y, { level: 3, elite: true }), 'v:pufon');
  const plain = x.addEnemy(new x.E.Enemy(x.E.makeKind('pufon'), p.x - 30, p.y, { level: 3 }), 'v:pufon');
  x.E.Combat.hit(x.g, plain, { team: 'player', fixed: 1e7, src: p }); run(x, .1);
  assert.equal(jobs().find(j => j.type === 'elite').progress, 0, 'un enemigo normal no cuenta');
  x.E.Combat.hit(x.g, el, { team: 'player', fixed: 1e7, src: p }); run(x, .1);
  assert.deepEqual(jobs().map(j => [j.type, j.state]), [['elite', 'done'], ['lore', 'done'], ['secret', 'done']]);
  assert.ok(before <= 2);
  // Entregar en la aldea (rules.js): +reputación, y al registro
  x.finish('return'); let save = x.ended.results.get('a').profile; const p0 = save.points;
  for (const id of [1, 2, 3]) save = applyOp(E, save, 'deliverJob', { id }).save;
  assert.equal(save.points, p0 + 30); assert.deepEqual(save.log.jobs.map(j => j.type), ['elite', 'lore', 'secret']);
});

test('mejora de la aldea: el proyecto de la forja se construye una vez y abre el equipo especial según el rango', () => {
  let s = vet({ points: 80 });
  assert.equal(E.Jobs.board(vet({ points: 30 }), 5).some(j => j.project), false, 'sin rango Bronce no hay proyecto');
  assert.equal(E.Jobs.board(vet({ points: 80, cleared: ['bosque'] }), 5).some(j => j.project), false, 'ni sin la Gruta');
  s.board = E.Jobs.board(s, 5); const pj = s.board.find(j => j.project === 'forja'); assert.ok(pj, 'el contrato de la herrera');
  assert.equal(pj.target, 'fragmentoCuarzo'); assert.equal(pj.dungeon, 'gruta');
  assert.deepEqual(E.forgeStock(s), [], 'sin forja no hay equipo especial');
  assert.throws(() => applyOp(E, s, 'buy', { id: 'yelmoBrasa' }), /no vende/);
  s = applyOp(E, s, 'acceptJob', { id: pj.id }).save;
  assert.ok(!E.Jobs.board(s, 99).some(j => j.project), 'aceptado: no se ofrece otra vez');
  const j = s.jobs.find(q => q.project); j.progress = j.goal; j.state = 'done';
  const r = applyOp(E, s, 'deliverJob', { id: j.id }); s = r.save;
  assert.deepEqual(s.town.upgrades, ['forja']); assert.ok(r.info.built[0].includes('Brasa')); assert.ok(s.guild.claims.includes('project:forja'));
  assert.ok(!E.Jobs.board(s, 99).some(q => q.project), 'construida: nunca más');
  assert.deepEqual(E.forgeStock(s), ['yelmoBrasa', 'botasExplorador'], 'Bronce: dos piezas');
  s.bank = 1000; s = applyOp(E, s, 'buy', { id: 'yelmoBrasa' }).save; assert.ok(s.inv.some(x => x.id === 'yelmoBrasa'));
  assert.throws(() => applyOp(E, s, 'buy', { id: 'insigniaGremio' }), /no vende/, 'la insignia es de Plata');
  s.points = 220; assert.equal(E.forgeStock(s).length, 4, 'Plata: cuatro');
  assert.deepEqual(roundTrip(s).town.upgrades, ['forja'], 'se guarda y se carga');
});

test('evento regional: aparece y caduca igual en el juego local y en el servidor (sin reloj); la caducidad cuesta −10 sin bajar de rango', () => {
  const a = vet({ points: 70 }), b = roundTrip(a);
  const la = [], lb = [];
  for (let r = 1; r <= 15; r++) { a.runs = b.runs = r; la.push(...E.RegionEvents.tick(a)); lb.push(...E.RegionEvents.tick(b)); }
  assert.deepEqual(la, lb, 'determinista'); assert.deepEqual(a.events, b.events);
  assert.ok(a.events.history.some(h => h.result === 'expired'));
  assert.ok(a.points >= 60, 'nunca baja de Bronce');
  const c = vet({ points: 20 }); for (let r = 1; r <= 15; r++) { c.runs = r; E.RegionEvents.tick(c); } assert.equal(c.events.history.length, 0, 'sin rango Bronce no hay eventos');
});

/** Perfil con un invasor en curso en el piso 2 de la Gruta. */
const withEvent = (id = 'inv-test-1', extra = {}) => { const s = vet(extra); s.events.active = { id, type: 'invasor', dungeon: 'gruta', floor: 2, variant: 'rataCristal', name: 'Garrafría', startRun: 0, endsRun: 3 }; return roundTrip(s); };
const toFloor2 = x => { while (x.seq[x.stepIdx].floorNo !== 2 || x.seq[x.stepIdx].kind !== 'normal') x.nextStep(); };
const invader = x => x.g.actors.find(a => a.invader && a.alive);

test('evento en grupo: el invasor sale en su piso; Ana (con el evento) lo resuelve una vez; Beto (sin él) gana +5 por ayudar, una vez', () => {
  const x = new Expedition({ dungeonId: 'gruta', seed: 9, random: seeded(2), members: [{ id: 'a', accountId: 'A', name: 'Ana', profile: withEvent() }, { id: 'b', accountId: 'B', name: 'Beto', profile: vet({ points: 100 }) }] });
  assert.equal(invader(x), undefined, 'en el piso 1 no');
  toFloor2(x); x.drainEvents();
  const inv = invader(x); assert.ok(inv, 'en el piso 2 sí'); assert.equal(inv.nameTag, 'Invasor: Garrafría'); assert.ok(inv.elite);
  const plain = new x.E.Enemy(x.E.makeKind('rataCristal'), 0, 0, { level: inv.level - 2, elite: true });
  assert.ok(inv.maxHp > plain.maxHp * 2, 'más duro que un élite normal');
  const A = x.members.get('a'), B = x.members.get('b'), bank0 = A.save.bank, pa = A.save.points, pb = B.save.points;
  B.player.placeAt(inv.x + 20, inv.y); A.player.placeAt(inv.x - 20, inv.y);
  x.E.Combat.hit(x.g, inv, { team: 'player', fixed: 1e8, src: A.player }); run(x, .1);
  assert.ok(!inv.alive);
  assert.equal(A.save.bank, bank0 + 160); assert.equal(A.save.points, pa + 30); assert.equal(A.save.events.active, null); assert.ok(A.save.guild.claims.includes('event:inv-test-1'));
  assert.equal(B.save.points, pb + 5, 'ayuda');
  const ev = x.drainEvents().filter(e => e.type === 'regionEvent'); assert.deepEqual(ev.map(e => [e.to, e.won]).sort(), [['a', true], ['b', false]]);
  // Otro invasor (otro evento) en la misma expedición: Beto ya cobró su ayuda
  x.invaderDown({ invader: 'otro', x: -9999, y: -9999, nameTag: 'X' }, { b: 10 });                // solo Beto golpeó a este otro
  assert.equal(B.save.points, pb + 5, 'la ayuda, una vez por expedición');
  // Se intenta resolver otra vez el mismo (p. ej. tras reconectarse o cambiar de líder): nada
  x.invaderDown({ invader: 'inv-test-1', x: inv.x, y: inv.y }, { a: 1 });
  assert.equal(A.save.bank, bank0 + 160); assert.equal(A.save.points, pa + 30);
  x.finish('return');
  const ra = x.ended.results.get('a').profile; assert.equal(ra.events.history.at(-1).result, 'won'); assert.ok(ra.inv.some(s => s.id === 'elixir'));
});

test('evento y reanudación: si cae después de vencerlo, al reanudar el invasor no vuelve y no se cobra dos veces', () => {
  const x = new Expedition({ dungeonId: 'gruta', seed: 9, random: seeded(2), members: [{ id: 'a', accountId: 'A', name: 'Ana', profile: withEvent('inv-r') }] });
  toFloor2(x);
  const before = x.snapshot('floor');
  const y0 = new Expedition({ restore: JSON.parse(JSON.stringify(before)), members: [{ id: 's', accountId: 'A', name: 'Ana' }] });
  assert.ok(invader(y0), 'reanudar antes de vencerlo: sigue ahí');
  x.E.Combat.hit(x.g, invader(x), { team: 'player', fixed: 1e8, src: x.members.get('a').player }); run(x, .1);
  const bank = x.members.get('a').save.bank, after = x.snapshot('objective');
  const y = new Expedition({ restore: JSON.parse(JSON.stringify(after)), members: [{ id: 's', accountId: 'A', name: 'Ana' }] });
  assert.equal(invader(y), undefined, 'ya vencido: no vuelve');
  const m = [...y.members.values()][0]; assert.equal(m.save.bank, bank); assert.equal(m.save.events.active, null);
});

test('formato 8: migración desde el 7 (guardianes ya vencidos no dan reputación otra vez) y guardar/cargar sin perder nada', () => {
  const v7 = structuredClone(vet({ points: 300, bosses: { gromgar: { kills: 1, trophy: true } }, cleared: ['bosque', 'gruta'] }));
  v7.v = 7; delete v7.guild; delete v7.town; delete v7.events;
  const r = E.Save.sanitize(v7); assert.ok(r.ok); assert.equal(r.from, 7); assert.equal(r.data.v, E.SAVE_VERSION);
  assert.deepEqual(r.data.guild.claims.sort(), ['boss:gromgar', 'boss:reinageoda', 'boss:robleton']);
  assert.equal(E.Guild.bossDefeated(r.data, E.dungeonById('gruta')).length, 0, 'ya contaba');
  assert.equal(r.data.points, 300);
  const s = withEvent('inv-p'); s.town.upgrades = ['forja']; s.guild.title = 'Explorador de Bronce'; E.Guild.claim(s, 'event:viejo');
  const back = roundTrip(s);
  for (const k of ['guild', 'town', 'events', 'points']) assert.deepEqual(back[k], s[k], k);
  const bad = roundTrip(Object.assign(structuredClone(s), { town: { upgrades: ['forja', 'castillo'] }, guild: { claims: ['boss:x', 'hack', 7], title: 'Rey' }, events: { active: { id: 'x', type: 'invasor', dungeon: 'nada', floor: 2 } } }));
  assert.deepEqual(bad.town.upgrades, ['forja']); assert.deepEqual(bad.guild.claims, ['boss:x']); assert.equal(bad.guild.title, ''); assert.equal(bad.events.active, null);
});
