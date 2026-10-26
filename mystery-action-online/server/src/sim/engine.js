/**
 * Motor sin cabeza: las reglas reales del prototipo (núcleo generado) más un objeto "g"
 * mínimo que cumple lo que Player, Enemy, Combat, Projectile y Zone esperan del juego.
 * No dibuja nada; los efectos visuales se descartan en cada paso.
 */
import { createEngineCore } from '../../../shared/engine-core.generated.js';

/** Crea un núcleo aislado y lo adapta a varios jugadores humanos. */
export function createServerEngine() {
  const E = createEngineCore();
  // En el prototipo solo `g.player` recibe invulnerabilidad tras un golpe y avisa al caer.
  // En cooperativo cualquier jugador puede ser el objetivo: durante el golpe, `g.player` es él.
  const hit = E.Combat.hit;
  E.Combat.hit = function (g, t, o) {
    if (t.dormant) return false;                       // desconectado: ni recibe daño ni es objetivo
    if (!(t instanceof E.Player)) {
      // Participación: daño que cada jugador hace a cada enemigo (para repartir la experiencia)
      // (si el golpe lo derriba, onEnemyDown se ejecuta dentro de hit: lo apunta allí con netLast)
      const src = o && o.src; t.netLast = src && src.netId ? { id: src.netId, before: t.hp } : null;
      const r = hit.call(this, g, t, o), last = t.netLast; t.netLast = null;
      if (last && t.hp < last.before) creditDamage(t, last.id, last.before - t.hp);
      return r;
    }
    if (g.player === t) return hit.call(this, g, t, o);
    const prev = g.player; g.player = t;
    try { return hit.call(this, g, t, o); } finally { g.player = prev; }
  };
  return E;
}

/** Suma el daño que un jugador ha hecho a un enemigo. */
export function creditDamage(e, id, n) { e.netDmg = e.netDmg || {}; e.netDmg[id] = (e.netDmg[id] || 0) + n; }

/** Objeto de juego mínimo para un piso simulado en el servidor. */
export function createHeadlessGame(E, world, hooks) {
  const g = {
    world, mode: 'dungeon', time: 0, shake: 0, hitStop: 0,
    actors: [], projectiles: [], zones: [], effects: [], floaters: [],
    fx: { list: [], add() {}, update() {}, draw() {} },
    stats: { damageDealt: {}, casts: {}, dodges: 0, counters: 0, defeated: 0, chests: 0 },
    player: null, allies: [],
    renderer: { label() {} },
    aim: null,
    getAim(range = 200) {
      const p = this.player, a = this.aim || { dx: p.facing.x, dy: p.facing.y, d: 0 };
      const dist = Math.min(a.d > 0 ? a.d : range * .6, range);
      return { dx: a.dx, dy: a.dy, tx: p.x + a.dx * dist, ty: p.y + a.dy * dist, mouse: a.d > 0, mx: p.x + a.dx * dist, my: p.y + a.dy * dist };
    },
    onPlayerDown() { hooks.onPlayerDown(this.player); },
    onEnemyDown(e) { hooks.onEnemyDown(e); },
    onBasicAttack() {},
  };
  return g;
}

/** Un paso fijo del mundo, en el mismo orden que Game.update del prototipo. */
export function stepWorld(E, g, dt, humans, inputFor) {
  g.time += dt;
  if (g.shake > 0) g.shake = Math.max(0, g.shake - dt * 25);
  for (const p of humans) {
    g.player = p; g.allies = humans.filter(h => h !== p && h.alive && !h.dormant);
    const axis = p.dormant ? { x: 0, y: 0 } : inputFor(p);
    p.update(dt, axis, g);
  }
  // Los enemigos eligen entre todos los jugadores despiertos (pickTarget usa g.player + g.allies)
  // Si nadie está despierto (todos caídos o desconectados) el resto del piso se congela.
  const awake = humans.filter(h => h.alive && !h.dormant);
  if (awake.length) {
    g.player = awake[0]; g.allies = awake.slice(1);
    for (const a of g.actors) if (!(a instanceof E.Player)) a.update(dt, g);
  }
  separate(g);
  for (const pr of g.projectiles) pr.update(dt, g);
  for (const z of g.zones) z.update(dt, g);
  g.actors = g.actors.filter(a => a.alive || a instanceof E.Player);
  g.projectiles = g.projectiles.filter(x => x.alive);
  g.zones = g.zones.filter(z => z.alive);
  g.effects.length = 0; g.floaters.length = 0;
  g.hitStop = 0;
}

/** Empuje entre criaturas (copia de Game.separateActors; los jugadores no se empujan entre sí). */
function separate(g) {
  const A = g.actors;
  for (let i = 0; i < A.length; i++) for (let j = i + 1; j < A.length; j++) {
    const a = A[i], b = A[j];
    if (!a.alive || !b.alive || a.dormant || b.dormant) continue;
    if ((a.dash && a.dash.iframes) || (b.dash && b.dash.iframes)) continue;
    if (a.team === 'player' && b.team === 'player') continue;
    const dx = b.x - a.x, dy = b.y - a.y, min = (a.radius + b.radius) * .85, d = Math.hypot(dx, dy);
    if (d >= min) continue;
    const nx = d > .01 ? dx / d : 1, ny = d > .01 ? dy / d : 0, push = (min - d) * .5;
    const wa = b.mass / (a.mass + b.mass), wb = a.mass / (a.mass + b.mass);
    a.moveBy(g.world, -nx * push * wa * 2, -ny * push * wa * 2);
    b.moveBy(g.world, nx * push * wb * 2, ny * push * wb * 2);
  }
}
