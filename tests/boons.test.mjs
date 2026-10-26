/**
 * Dones de expedición: 1 de 3 al llegar a cada piso (desde el 2) y al punto de control.
 * Reglas compartidas (motor) + validación en el servidor (cada jugador elige de SU oferta).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { Expedition } from '../server/src/sim/Expedition.js';
import { E, freshSave, seeded, STEP } from './helpers.mjs';

const party = n => ['guerrero', 'mago', 'arquero', 'guerrero'].slice(0, n).map((sp, i) => ({ id: 'p' + i, name: 'J' + i, profile: freshSave(sp) }));
const make = (n = 2, seed = 99) => new Expedition({ dungeonId: 'bosque', seed, members: party(n), random: seeded(3) });
const P = (x, id) => x.members.get(id).player;
const evs = (x, type) => x.drainEvents().filter(e => e.type === type);
const run = (x, s) => { for (let i = 0; i < Math.round(s / STEP); i++) x.step(STEP); };
const clearEnemies = x => { x.g.actors = x.g.actors.filter(a => !(a instanceof x.E.Enemy)); };
function enemyAt(x, dx, dy, hp = 500) {
  const p = P(x, 'p0'), e = new x.E.Enemy(x.E.makeKind('mordisquin'), p.x + dx, p.y + dy, { level: 3 });
  x.addEnemy(e, 'v:mordisquin'); e.maxHp = e.hp = hp; e.think = () => 0; return e;
}

test('oferta: tres dones distintos; nunca uno ya al máximo; con todos al máximo no hay oferta', () => {
  const r = seeded(5);
  for (let k = 0; k < 50; k++) { const o = E.Boons.offer(r, {}); assert.equal(o.length, 3); assert.equal(new Set(o).size, 3); assert.ok(o.every(E.Boons.valid)); }
  const almost = Object.fromEntries(Object.entries(E.BOONS).map(([id, b]) => [id, b.max]));
  delete almost.furia;
  assert.deepEqual(E.Boons.offer(r, almost), ['furia']);
  almost.furia = 3; assert.deepEqual(E.Boons.offer(r, almost), []);
});

test('efectos en estadísticas: daño, PS, velocidad, recarga, energía y cargas de esquiva (y se mejoran al repetir)', () => {
  const p = new E.Player(E.FORMS.guerrero, 0, 0), hp0 = p.maxHp, sp0 = p.moveSpeed();
  assert.equal(E.Boons.apply(p, 'furia'), 1); assert.ok(Math.abs(p.dmgMul - 1.15) < 1e-9);
  assert.equal(E.Boons.apply(p, 'furia'), 2); assert.ok(Math.abs(p.dmgMul - 1.3) < 1e-9);
  E.Boons.apply(p, 'coraza'); assert.equal(p.maxHp, hp0 + Math.round(hp0 * .2)); assert.equal(p.hp, p.maxHp, 'los PS ganados se suman');
  E.Boons.apply(p, 'celeridad'); assert.ok(Math.abs(p.moveSpeed() - sp0 * 1.1) < 1e-6);
  E.Boons.apply(p, 'recarga'); assert.ok(Math.abs(p.mods.cdr - .85) < 1e-9);
  E.Boons.apply(p, 'esquiva'); assert.equal(p.maxDodge, E.CONFIG.DODGE_CHARGES + 1); assert.equal(p.dodgeCharges, p.maxDodge);
  for (let k = 0; k < 5; k++) E.Boons.apply(p, 'esquiva');
  assert.equal(p.boons.esquiva, 2, 'tope por don');
  assert.equal(E.Boons.apply(p, 'inventado'), 0); assert.equal(p.boons.inventado, undefined);
  // Subir de nivel después mantiene los dones
  p.level++; p.recalc(true); assert.ok(Math.abs(p.dmgMul - 1.3) < 1e-9);
});

test('servidor: sin oferta en el piso 1; en el 2 cada jugador recibe la SUYA y solo puede elegir de ella', () => {
  const x = make(2);
  assert.equal(evs(x, 'boons').length, 0, 'piso 1: nada');
  x.nextStep();
  const offers = evs(x, 'boons');
  assert.deepEqual(offers.map(o => o.to).sort(), ['p0', 'p1']);
  const o0 = offers.find(o => o.to === 'p0').options;
  // Un id que no se le ofreció (o inventado) se rechaza y no cambia nada
  const notOffered = Object.keys(E.BOONS).find(id => !o0.includes(id));
  assert.equal(x.pickBoon('p0', notOffered), 0); assert.equal(x.pickBoon('p0', '__proto__'), 0);
  assert.equal(evs(x, 'reject').filter(r => r.what === 'boon').length, 2);
  assert.deepEqual(P(x, 'p0').boons, {});
  // Elegir uno válido: se aplica a ESE jugador, se anuncia a todos y no se puede elegir dos veces
  assert.equal(x.pickBoon('p0', o0[1]), 1);
  assert.deepEqual(P(x, 'p0').boons, { [o0[1]]: 1 }); assert.deepEqual(P(x, 'p1').boons, {}, 'no afecta al compañero');
  const b = evs(x, 'boon'); assert.deepEqual(b.map(e => [e.by, e.id, e.lv]), [['p0', o0[1], 1]]); assert.equal(b[0].to, undefined, 'lo ven todos');
  assert.equal(x.pickBoon('p0', o0[0]), 0, 'ya no tiene oferta pendiente');
});

test('servidor: las ofertas sin elegir se acumulan (máx. 3) y se reenvían al reconectar con los dones ya elegidos', () => {
  const x = make(2); x.nextStep(); x.nextStep(); x.drainEvents();                 // pisos 2 y punto de control/3: dos ofertas
  const m = x.members.get('p1'); assert.equal(m.boonOffers.length, 2);
  const first = m.boonOffers[0];
  x.pickBoon('p1', first[0]);
  const next = evs(x, 'boons'); assert.equal(next.length, 1); assert.deepEqual(next[0].options, m.boonOffers[0], 'tras elegir llega la siguiente');
  x.setConnected('p1', false); x.setConnected('p1', true);
  const ev = x.drainEvents(), sync = ev.find(e => e.type === 'boonsSync' && e.to === 'p1'), again = ev.find(e => e.type === 'boons' && e.to === 'p1');
  assert.deepEqual(sync.boons, { [first[0]]: 1 }); assert.deepEqual(again.options, m.boonOffers[0]);
  for (let k = 0; k < 6; k++) x.offerBoons();
  assert.equal(m.boonOffers.length, 3, 'como mucho 3 pendientes');
});

test('combate: Rebote, Estallido, Espinas, Sed y Segundo aliento funcionan en la simulación del servidor', () => {
  const x = make(1); clearEnemies(x); x.drainEvents();
  const p = P(x, 'p0');
  for (const id of ['cadena', 'estallido', 'espinas', 'vampiro', 'aliento']) E.Boons.apply(p, id);
  p.hp = p.maxHp = 5000;                                  // después de los dones (al elegir uno se recalculan las estadísticas)
  // Rebote: el básico (marcado al lanzarse) salta a un enemigo cercano
  const a = enemyAt(x, 26, 0), b = enemyAt(x, 70, 10), hpB = b.hp;
  x.E.Combat.hit(x.g, a, { team: 'player', dmg: 30, src: p, basic: true, type: 'normal', cat: 'fis' });
  assert.ok(b.hp < hpB, 'el segundo enemigo recibe daño'); const after = b.hp;
  x.E.Combat.hit(x.g, a, { team: 'player', dmg: 30, src: p, type: 'normal', cat: 'fis' });
  assert.equal(b.hp, after, 'un golpe que no es del básico no rebota');
  // Estallido: el derrotado explota y daña a los de alrededor
  const c = enemyAt(x, 0, 60, 1), d = enemyAt(x, 20, 70), hpD = d.hp;
  x.E.Combat.hit(x.g, c, { team: 'player', dmg: 50, src: p, type: 'normal', cat: 'fis' });
  assert.equal(c.alive, false); assert.ok(d.hp < hpD, 'la explosión alcanza al vecino');
  // Espinas: quien golpea cuerpo a cuerpo recibe parte del daño
  const e = enemyAt(x, 20, 0), hpE = e.hp; p.iframes = 0;
  x.E.Combat.hit(x.g, p, { team: 'enemy', dmg: 40, src: e, type: 'normal', cat: 'fis' });
  assert.ok(e.hp < hpE, 'devuelve daño');
  // Sed: cura al golpear
  p.hp = 1000;
  x.E.Combat.hit(x.g, enemyAt(x, -30, 0), { team: 'player', dmg: 40, src: p, type: 'normal', cat: 'fis' });
  assert.ok(p.hp > 1000);
  // Segundo aliento: una sola vez por piso
  p.hp = p.maxHp * .3; p.iframes = 0;
  x.E.Combat.hit(x.g, p, { team: 'enemy', dmg: p.maxHp * .1, src: null, pct: 0 });
  assert.ok(p.hp > p.maxHp * .4, 'recupera'); assert.equal(p.alientoUsed, true);
  const h = p.hp; p.hp = p.maxHp * .3; p.iframes = 0;
  x.E.Combat.hit(x.g, p, { team: 'enemy', dmg: p.maxHp * .1, src: null });
  assert.ok(p.hp < p.maxHp * .25, 'la segunda vez en el mismo piso, no'); void h;
  x.nextStep(); assert.equal(P(x, 'p0').alientoUsed, false, 'piso nuevo: vuelve a estar disponible');
});

test('Onda de esquiva: el servidor la aplica al esquivar; los dones no se guardan en el perfil', () => {
  const x = make(1); clearEnemies(x);
  const p = P(x, 'p0'); E.Boons.apply(p, 'onda');
  const e = enemyAt(x, 30, 0), hp = e.hp;
  p.tryDodge(x.g, { x: -1, y: 0 });
  assert.ok(e.hp < hp, 'la onda daña al enemigo junto al punto de partida');
  run(x, .2);
  x.finish('return');
  const prof = x.ended.results.get('p0').profile;
  assert.ok(prof && !('boons' in prof) && !JSON.stringify(prof).includes('"onda"'), 'nada de dones en la partida guardada');
});

test('al cambiar de piso con una oferta sin elegir, el servidor reenvía la pendiente (el cliente cierra el panel al cambiar de piso)', () => {
  const x = make(1); x.nextStep();
  const first = evs(x, 'boons')[0].options;
  x.nextStep();
  const again = evs(x, 'boons');
  assert.equal(again.length, 1); assert.deepEqual(again[0].options, first, 'se muestra primero la que quedó pendiente'); assert.equal(again[0].pending, 2);
});
