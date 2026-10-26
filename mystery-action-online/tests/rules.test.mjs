import test from 'node:test';
import assert from 'node:assert/strict';
import { applyOp, gainExp, RuleError } from '../server/src/profile/rules.js';
import { E, freshSave, seeded } from './helpers.mjs';

const op = (save, name, args) => applyOp(E, structuredClone(save), name, args, seeded(3));
const rich = () => { const s = freshSave('voltrino', { bank: 5000, points: 0, cleared: ['bosque', 'gruta'] }); s.inv.push({ uid: 'iEq', id: 'panueloRojo', qty: 1 }, { uid: 'iBox', id: 'cofre', qty: 1 }); return E.Save.sanitize(s).data; };

test('comprar y vender: precio, existencias de la tienda, monedas e inventario los decide el servidor', () => {
  const s = rich();
  const r = op(s, 'buy', { id: 'pocion' });
  assert.equal(r.save.bank, s.bank - E.ITEMS.pocion.price); assert.equal(new E.Inventory(r.save.inv, () => 99).count('pocion'), new E.Inventory(s.inv, () => 99).count('pocion') + 1);
  assert.throws(() => op(s, 'buy', { id: 'bayaAurea' }), RuleError, 'no está en la tienda de este rango');
  assert.throws(() => op(freshSave('voltrino', { bank: 0, cleared: ['bosque'] }), 'buy', { id: 'pocion' }), /monedas/);
  assert.throws(() => op(freshSave('voltrino', { bank: 5000 }), 'buy', { id: 'pocion' }), /Bosque Brumoso/, 'sin el Topo Mercader no hay tienda');
  assert.throws(() => op(freshSave('voltrino', { bank: 5000 }), 'craft', { i: 0 }), /Bosque Brumoso/);
  const uid = s.inv.find(x => x.id === 'manzana').uid;
  const v = op(s, 'sell', { uid });
  assert.equal(v.save.bank, s.bank + E.sellPrice('manzana')); assert.equal(v.info.price, E.sellPrice('manzana'));
  assert.throws(() => op(s, 'sell', { uid: 'inventado' }), /No llevas/);
});

test('los argumentos extra del cliente se ignoran: no puede fijar precio, nivel ni monedas', () => {
  const s = rich();
  const r = op(s, 'buy', { id: 'pocion', price: 0, bank: 999999, level: 50 });
  assert.equal(r.save.bank, s.bank - E.ITEMS.pocion.price); assert.equal(r.save.prog.level, s.prog.level);
  assert.throws(() => op(s, 'setLevel', { level: 50 }), /desconocida/);
  assert.throws(() => op(s, '__proto__', {}), /desconocida/);
  assert.throws(() => op(s, 'buy', [1, 2]), /no válidos/);
});

test('equipar, quitar, movimientos y evolución con las reglas del juego', () => {
  const s = rich();
  const e = op(s, 'equip', { uid: 'iEq' });
  assert.equal(e.save.equip.panuelo.id, 'panueloRojo'); assert.ok(!e.save.inv.some(x => x.uid === 'iEq'));
  const u = op(e.save, 'unequip', { slot: 'panuelo' });
  assert.equal(u.save.equip.panuelo, null); assert.ok(u.save.inv.some(x => x.id === 'panueloRojo'));
  assert.throws(() => op(s, 'equip', { uid: s.inv.find(x => x.id === 'manzana').uid }), /no se puede equipar/);
  // Huecos según el nivel: 1 al empezar (nivel 5 = 1 hueco), 2 al 7, 3 al 10 y 4 al 14
  assert.deepEqual(s.prog.known, ['saeta']); assert.deepEqual(s.prog.equipped, ['saeta']);
  assert.throws(() => op(s, 'setMoves', { equipped: ['saeta', 'embestida'] }), /conoces|entre 1 y 1/);
  assert.throws(() => op(s, 'setMoves', { equipped: ['tormenta'] }), /conoces/);
  assert.throws(() => op(s, 'setMoves', { equipped: [] }), /entre 1 y 1 movimiento/);
  const v14 = structuredClone(s); v14.prog = E.Progress.fresh('voltrino', 14);
  assert.deepEqual(v14.prog.equipped, ['saeta', 'embestida', 'campo', 'rayo']);
  assert.deepEqual(op(v14, 'setMoves', { equipped: ['rayo', 'saeta'] }).save.prog.equipped, ['rayo', 'saeta']);
  assert.throws(() => op(v14, 'setMoves', { equipped: ['saeta', 'embestida', 'campo', 'rayo', 'saeta'] }), /entre 1 y 4/);
  const v20 = structuredClone(s); v20.prog = E.Progress.fresh('voltrino', 20);
  assert.throws(() => op(v20, 'setMoves', { equipped: ['saeta', 'embestida', 'campo', 'rayo', 'cadena'] }), /entre 1 y 4/, 'nunca más de 4 (el definitivo va aparte)');
  const evo = structuredClone(v20); evo.species = 'voltaurio'; evo.prog.known.push('tormenta');
  assert.throws(() => op(evo, 'setMoves', { equipped: ['tormenta'] }), /definitivo/);
  assert.throws(() => op(s, 'evolve', {}), /requisitos/);
  const ready = structuredClone(s); ready.prog = E.Progress.fresh('voltrino', 12);
  const ev = op(ready, 'evolve', {});
  assert.equal(ev.save.species, 'voltaurio'); assert.equal(ev.save.prog.level, 12); assert.equal(ev.save.prog.evolutions.at(-1).from, 'voltrino');
});

test('misiones y compañeros: aceptar, cancelar, entregar (con experiencia y subida de nivel), descanso', () => {
  const s = freshSave('magmolo', { cleared: ['bosque', 'gruta'] }); s.board = E.Jobs.board(s, 77);
  { const early = freshSave('magmolo'); early.board = E.Jobs.board(early, 77); assert.throws(() => op(early, 'acceptJob', { id: early.board[0].id }), /Gruta de Cuarzo/, 'sin Pico Cartero no hay tablón'); }
  const jid = s.board[0].id;
  const a = op(s, 'acceptJob', { id: jid });
  assert.ok(a.save.jobs.some(j => j.id === jid) && !a.save.board.some(j => j.id === jid));
  assert.throws(() => op(s, 'deliverJob', { id: jid }), /lista/);
  const done = structuredClone(a.save); const j = done.jobs.find(x => x.id === jid);
  j.type = 'hunt'; j.target = 'pufon'; j.state = 'done'; j.progress = j.goal = 1; j.reward.exp = 500;
  const d = op(E.Save.sanitize(done).data, 'deliverJob', { id: jid });
  assert.ok(d.save.prog.level > s.prog.level, 'la experiencia de la misión sube de nivel');
  assert.equal(d.save.bank, s.bank + j.reward.gems); assert.ok(d.info.levels.length >= 1);
  assert.throws(() => op(d.save, 'deliverJob', { id: jid }), /lista/, 'no se cobra dos veces');
  const c = op(a.save, 'cancelJob', { id: jid }); assert.ok(c.save.board.some(x => x.id === jid));
  const t = freshSave('aurin'); t.team = [{ uid: 'm1', kind: 'pufon', name: 'Pufi', level: 4, exp: 0, active: false, fainted: true }, { uid: 'm2', kind: 'mordisquin', name: 'Mor', level: 3, exp: 0, active: true }, { uid: 'm3', kind: 'pedrolon', name: 'Pedro', level: 3, exp: 0, active: true }];
  const T = E.Save.sanitize(t).data;
  assert.throws(() => op(T, 'setActive', { uid: 'm1', on: true }), /Solo pueden/);
  assert.equal(op(T, 'rest', {}).info.revived, 1);
  assert.equal(op(T, 'release', { uid: 'm2' }).save.team.length, 2);
});

test('taller y tasación: materiales, monedas y botín aleatorio decididos en el servidor', () => {
  const s = rich();
  const r = op(s, 'appraise', { uid: 'iBox' });
  assert.equal(r.save.bank, s.bank - E.ECONOMY.appraise + r.info.gems); assert.ok(!r.save.inv.some(x => x.uid === 'iBox'));
  assert.throws(() => op(s, 'appraise', { uid: s.inv.find(x => x.id === 'manzana').uid }), /cofre/);
  assert.throws(() => op(freshSave('voltrino', { cleared: ['bosque'] }), 'craft', { i: 0 }), /materiales|monedas/);
});

test('gainExp: mismas subidas de nivel y movimientos que el juego', () => {
  const s = freshSave('voltrino'), before = s.prog.level;
  const r = gainExp(E, s, 2000);
  assert.ok(s.prog.level > before && r.levels.length === s.prog.level - before);
  assert.ok(s.prog.exp < E.expNeed(s.prog.level));
});
