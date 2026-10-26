/** Llegada a la aldea (escena de la carretilla y el alcalde): se ve una sola vez y lo guarda el servidor. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { applyOp } from '../server/src/profile/rules.js';
import { E, freshSave } from './helpers.mjs';

test('perfil nuevo: aún no ha llegado; la operación «arrive» lo guarda y se conserva al validar', () => {
  const s = E.Save.sanitize(E.Save.fresh('guerrero')).data;
  assert.equal(s.arrived, false);
  const r = applyOp(E, structuredClone(s), 'arrive', {});
  assert.equal(r.save.arrived, true);
  assert.equal(E.Save.sanitize(r.save).data.arrived, true);
});
test('partidas de antes de la escena: si ya habían jugado cuentan como llegadas; si no, la verán', () => {
  const played = Object.assign(freshSave('mago'), { runs: 3 }); delete played.arrived;
  assert.equal(E.Save.sanitize(played).data.arrived, true);
  const nuevo = freshSave('mago'); delete nuevo.arrived;
  assert.equal(E.Save.sanitize(nuevo).data.arrived, false);
});
