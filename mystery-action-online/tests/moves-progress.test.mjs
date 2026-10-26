/** Progresión de movimientos: 1 hueco al empezar, otro a los niveles 7, 10 y 14; el definitivo (G) al evolucionar. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { Expedition } from '../server/src/sim/Expedition.js';
import { parseInput } from '../shared/protocol.js';
import { E, freshSave, seeded, STEP } from './helpers.mjs';

test('huecos por nivel y movimientos que se aprenden (las tres especies)', () => {
  assert.deepEqual([1, 6, 7, 9, 10, 13, 14, 30].map(l => E.Progress.slots(l)), [1, 1, 2, 2, 3, 3, 4, 4]);
  for (const [sp, order] of [['voltrino', ['saeta', 'embestida', 'campo', 'rayo']], ['magmolo', ['brasas', 'magma', 'caparazon', 'erupcion']], ['aurin', ['pasoveloz', 'esfera', 'contragolpe', 'onda']]]) {
    assert.deepEqual(E.Progress.fresh(sp, 5).equipped, order.slice(0, 1), `${sp}: un solo ataque al empezar`);
    const pr = E.Progress.fresh(sp, 5);
    for (const [lv, n] of [[7, 2], [10, 3], [14, 4]]) { pr.level = lv; E.Progress.learn(pr, E.FORMS[sp], lv); assert.deepEqual(pr.equipped, order.slice(0, n), `${sp} nivel ${lv}`); }
    pr.level = 20; const more = E.Progress.learn(pr, E.FORMS[sp], 20);
    assert.equal(more.length, 2, 'a los 17 y 20 aprende otros dos para elegir'); assert.equal(pr.equipped.length, 4, 'sin pasar de 4 huecos');
  }
});

test('al evolucionar: un movimiento definitivo propio (tecla G), mucho más fuerte, que no ocupa hueco', () => {
  for (const [from, to, ult] of [['voltrino', 'voltaurio', 'tormenta'], ['magmolo', 'magmoloso', 'columna'], ['aurin', 'aurion', 'punoAural']]) {
    assert.equal(E.FORMS[from].ultimate, undefined); assert.equal(E.FORMS[to].ultimate, ult);
    const strongest = Math.max(...E.FORMS[from].learn.map(([m]) => E.MOVES[m].power || 0));
    assert.ok(E.MOVES[ult].power >= strongest * 1.4, `${ult} (${E.MOVES[ult].power}) es notablemente más fuerte que los demás (${strongest})`);
    const p = new E.Player(E.FORMS[to], 0, 0, E.Progress.fresh(to, 14)); assert.equal(p.ult, ult); assert.equal(p.moveAt(4), ult);
    assert.equal(new E.Player(E.FORMS[from], 0, 0, E.Progress.fresh(from, 14)).moveAt(4), null);
  }
});

test('partidas antiguas: se conservan los movimientos conocidos pero se equipan solo los huecos del nivel', () => {
  const old = freshSave('voltrino'); old.prog.level = 8; old.prog.known = ['saeta', 'embestida', 'campo', 'rayo', 'cadena']; old.prog.equipped = ['saeta', 'embestida', 'campo', 'rayo'];
  const c = E.Save.sanitize(old).data;
  assert.deepEqual(c.prog.equipped, ['saeta', 'embestida']); assert.equal(c.prog.known.length, 5);
  const evo = freshSave('voltrino'); evo.species = 'voltaurio'; evo.prog.level = 19; evo.prog.known = ['saeta', 'embestida', 'campo', 'rayo', 'tormenta']; evo.prog.equipped = ['tormenta', 'saeta', 'rayo'];
  assert.deepEqual(E.Save.sanitize(evo).data.prog.equipped, ['saeta', 'rayo'], 'el definitivo sale de los huecos normales');
});

test('servidor: el definitivo (acción m, hueco 4) solo funciona en la forma evolucionada', () => {
  const evolved = freshSave('voltrino'); evolved.species = 'voltaurio'; evolved.prog = E.Progress.fresh('voltaurio', 14);
  const x = new Expedition({ dungeonId: 'bosque', seed: 9, members: [{ id: 'a', name: 'A', profile: evolved }, { id: 'b', name: 'B', profile: freshSave('magmolo') }], random: seeded(2) });
  x.g.actors = x.g.actors.filter(a => !(a instanceof x.E.Enemy)); x.drainEvents();
  for (const id of ['a', 'b']) x.applyInput(id, parseInput({ s: 0, m: [[0, 0]], a: [{ n: 1, at: 0, k: 'm', i: 4, dx: 1, dy: 0, d: 100 }] }));
  for (let i = 0; i < 10; i++) x.step(STEP);
  const ev = x.drainEvents();
  assert.ok(ev.some(e => e.type === 'cast' && e.by === 'a' && e.move === 'tormenta'), 'Voltaurio lanza Tormenta Voltaica');
  assert.ok(!ev.some(e => e.type === 'cast' && e.by === 'b' && e.k === 'm'), 'Magmolo no tiene definitivo');
  assert.equal(parseInput({ s: 0, m: [], a: [{ n: 1, at: 0, k: 'm', i: 5, dx: 1, dy: 0 }] }).actions.length, 0, 'el hueco 5 no existe');
});
