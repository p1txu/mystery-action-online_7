/** Dejar objetos en el suelo en cooperativo: el servidor lo valida, lo pone al lado y otro jugador lo recoge. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { Expedition } from '../server/src/sim/Expedition.js';
import { freshSave, seeded, STEP } from './helpers.mjs';

const make = () => new Expedition({ dungeonId: 'bosque', seed: 5, members: [{ id: 'a', name: 'Ana', profile: freshSave('voltrino') }, { id: 'b', name: 'Beto', profile: freshSave('aurin') }], random: seeded(2) });
const run = (x, s) => { for (let i = 0; i < Math.round(s / STEP); i++) x.step(STEP); };
const evs = (x, t) => x.drainEvents().filter(e => e.type === t);

test('soltar: sale de la mochila de quien lo suelta y aparece al lado; otro jugador lo recoge', () => {
  const x = make(); x.g.actors = x.g.actors.filter(a => !(a instanceof x.E.Enemy)); x.items.clear(); x.drainEvents();
  const A = x.members.get('a').player, B = x.members.get('b').player;
  A.bag.add('pocion', 2); const nA = A.bag.count('pocion'), nB = B.bag.count('pocion');
  assert.equal(x.drop('a', 'pocion'), true);
  assert.equal(A.bag.count('pocion'), nA - 1);
  const ev = evs(x, 'itemDrop'); assert.equal(ev.length, 1); assert.equal(ev[0].by, 'a'); assert.equal(ev[0].id, 'pocion');
  const it = x.items.get(ev[0].key); assert.ok(it && it.amount === 1);
  assert.ok(Math.hypot(it.x - A.x, it.y - A.y) < 3 * 32, 'al lado de quien lo suelta');
  assert.ok(x.view().items.some(v => v.key === it.key), 'todos lo ven (estado)');
  // Quien lo suelta no lo recoge sin querer aunque pase por encima (2 s)
  A.placeAt(it.x, it.y); run(x, .5); assert.ok(x.items.has(it.key)); assert.equal(A.bag.count('pocion'), nA - 1);
  A.placeAt(it.x + 120, it.y); A.free(x.world, A.x, A.y) || A.placeAt(it.x, it.y + 120);
  // El compañero llega y lo coge
  B.placeAt(it.x, it.y); run(x, STEP * 2);
  assert.ok(!x.items.has(it.key)); assert.equal(B.bag.count('pocion'), nB + 1);
  assert.ok(evs(x, 'pickup').some(e => e.by === 'b' && e.id === 'pocion'));
});

test('soltar: no se puede soltar lo que no llevas, objetos inventados ni llenar el suelo', () => {
  const x = make(); x.drainEvents();
  const A = x.members.get('a').player;
  assert.equal(x.drop('a', 'manzanaDorada'), false);
  assert.equal(x.drop('a', '__proto__'), false);
  assert.equal(x.drop('zzz', 'pocion'), false);
  assert.equal(evs(x, 'reject').filter(r => r.what === 'drop').length, 2);
  A.bag.add('pocion', 1);
  for (let i = 0; i < 100; i++) x.items.set('x' + i, { key: 'x' + i, id: 'gems', amount: 1, x: 0, y: 0, tx: 0, ty: 0 });
  assert.equal(x.drop('a', 'pocion'), false, 'tope de objetos en el suelo'); assert.ok(A.bag.count('pocion') >= 1);
});

test('quien lo soltó puede recuperarlo pasado un momento', () => {
  const x = make(); x.g.actors = x.g.actors.filter(a => !(a instanceof x.E.Enemy)); x.items.clear(); x.drainEvents();
  const A = x.members.get('a').player; A.bag.add('baya', 1); const n = A.bag.count('baya');
  x.drop('a', 'baya'); const it = [...x.items.values()][0];
  A.placeAt(it.x, it.y); run(x, 2.2);
  assert.equal(A.bag.count('baya'), n);
});
