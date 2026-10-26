import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { E } from './helpers.mjs';
import { createEngineCore, SOURCE_HASH } from '../shared/engine-core.generated.js';
import { parseInput, cleanAxis, isValidCode, normalizeCode, MAX_SAMPLES_PER_MSG } from '../shared/protocol.js';

test('los archivos generados están al día con el prototipo', () => {
  const out = execFileSync('node', ['tools/split-prototype.mjs', '--check'], { encoding: 'utf8' });
  assert.match(out, /al día/);
  assert.match(SOURCE_HASH, /^[0-9a-f]{16}$/);
});

test('el núcleo carga en Node en modo estricto, sin DOM, y exporta las reglas', () => {
  for (const k of ['FloorGen', 'Player', 'Enemy', 'Combat', 'MOVES', 'Save', 'Loot', 'Inventory', 'expYield', 'DUNGEONS']) assert.ok(E[k], k);
  assert.equal(typeof globalThis.document, 'undefined');
});

test('cada instancia del núcleo es independiente (una sala no afecta a otra)', () => {
  const a = createEngineCore(), b = createEngineCore();
  a.MOVES.espadazo.mult = 999;
  assert.notEqual(b.MOVES.espadazo.mult, 999);
  assert.notEqual(a.Combat, b.Combat);
});

test('FloorGen es determinista: misma semilla, mismo piso', () => {
  for (const d of E.DUNGEONS) for (const kind of ['normal', 'waypoint', 'boss']) {
    const x = E.FloorGen.generate(1234, d, 3, kind, []), y = E.FloorGen.generate(1234, d, 3, kind, []);
    assert.deepEqual([...x.world.tiles], [...y.world.tiles]);
    assert.deepEqual(JSON.stringify(x.layout), JSON.stringify(y.layout));
    assert.ok(x.validation.ok);
  }
});

test('protocolo: el eje nunca supera longitud 1 y se descartan valores no numéricos', () => {
  assert.deepEqual(cleanAxis(5, 0), [1, 0]);
  const [x, y] = cleanAxis(3, 4); assert.ok(Math.abs(Math.hypot(x, y) - 1) < 1e-9);
  assert.deepEqual(cleanAxis(NaN, 1), [0, 0]);
  assert.deepEqual(cleanAxis('1', 0), [0, 0]);
});

test('protocolo: mensajes de entrada mal formados se rechazan', () => {
  assert.equal(parseInput(null), null);
  assert.equal(parseInput({ s: -1, m: [] }), null);
  assert.equal(parseInput({ s: 0, m: Array(MAX_SAMPLES_PER_MSG + 1).fill([0, 0]) }), null);
  const p = parseInput({ s: 10, m: [[1, 0], [9, 9]], a: [{ at: 10, k: 'b', dx: 3, dy: 4 }, { at: 99, k: 'b' }, { at: 11, k: 'x' }, { at: 11, k: 'm', i: 7 }, { at: 11, k: 'm', i: 2, dx: 0, dy: 0, d: 99999 }] });
  assert.equal(p.actions.length, 2);
  assert.ok(Math.abs(Math.hypot(p.actions[0].dx, p.actions[0].dy) - 1) < 1e-9);
  assert.equal(p.actions[1].d, 600);
  assert.ok(Math.hypot(...p.samples[1]) <= 1 + 1e-9);
});

test('códigos de invitación: formato y normalización', () => {
  assert.ok(isValidCode('ABC234'));
  assert.ok(!isValidCode('ABC0I1'));        // 0 e I no se usan (se confunden)
  assert.equal(normalizeCode(' abc-234 '), 'ABC234');
});
