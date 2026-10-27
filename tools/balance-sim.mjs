/**
 * Simulación de balance de las cuatro clases con el MOTOR REAL del servidor (Expedition + núcleo del juego).
 *
 *   node tools/balance-sim.mjs [--seeds 4] [--dungeons bosque,gruta] [--classes guerrero,mago] [--out build/balance.json]
 *
 * Un «bot» juega por cada clase como lo haría un jugador correcto (no perfecto):
 *  - Se mueve por caminos (búsqueda en anchura por casillas) hasta el enemigo más cercano; con el piso limpio, a la escalera.
 *  - Cuerpo a cuerpo (Guerrero, Asesino): se acerca hasta su alcance y golpea. A distancia (Arquero, Mago): mantiene
 *    una distancia segura (se aleja si se le acercan), necesita línea de visión y dispara.
 *  - Usa su habilidad cuando tiene sentido (golpe de escudo cuerpo a cuerpo; flechazo cargado al máximo; lluvia de fuego
 *    sobre el grupo o el jefe; tajo en X), esquiva los ataques que se están preparando cerca, bebe pociones con poca vida
 *    y come con hambre. Elige el primer don ofrecido.
 * Mide por clase y mazmorra: éxito, tiempo total y por piso, enemigos por minuto, daño hecho y recibido, caídas, y el
 * combate contra el guardián (tiempo, daño por segundo, vida perdida). Aparte, un muñeco de prácticas mide el daño
 * puro por segundo contra un objetivo y contra un grupo de 4 (con la misma rotación del bot).
 * Todo con semillas fijas: el mismo comando da el mismo resultado.
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { Expedition } from '../server/src/sim/Expedition.js';
import { createServerEngine, createHeadlessGame, stepWorld } from '../server/src/sim/engine.js';
import { gainExp } from '../server/src/profile/rules.js';

const args = process.argv.slice(2), arg = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const SEEDS = +arg('--seeds', 4), OUT = arg('--out', '');
const CLASSES = arg('--classes', 'guerrero,arquero,mago,asesino').split(',');
const DUNGEONS = arg('--dungeons', 'bosque,gruta,cienaga,mina,crater').split(',');
const LEVEL_OFFSET = +arg('--level-offset', 1);     // nivel del jugador al entrar = nivel de la mazmorra + esto
const STEP = 1 / 120, TS = 32, MAX_RUN = +arg('--max-run', 2400);

/** Perfil de la clase al nivel pedido, con el kit de una expedición normal (3 pociones, 2 manzanas). */
function profileAt(E, cls, level) {
  const s = E.Save.sanitize(E.Save.fresh(cls)).data;
  while (s.prog.level < level) gainExp(E, s, E.expNeed(s.prog.level) - s.prog.exp);
  s.inv = [{ uid: 'p1', id: 'pocion', qty: 3 }, { uid: 'm1', id: 'manzana', qty: 2 }];
  s.cleared = E.DUNGEONS.map(d => d.id); s.arrived = true;
  return s;
}

/* ---------- Caminos: distancias por casillas desde el jugador (8 direcciones, sin cortar esquinas) ---------- */
function bfs(world, E, sx, sy) {
  const W = world.w, H = world.h, dist = new Float32Array(W * H).fill(Infinity), prev = new Int32Array(W * H).fill(-1);
  const s = sy * W + sx; if (sx < 0 || sy < 0 || sx >= W || sy >= H) return { dist, prev, W };
  dist[s] = 0; const q = [s]; let h = 0;
  const solid = (x, y) => x < 0 || y < 0 || x >= W || y >= H || world.isSolid(x, y);     // también las rocas caídas
  while (h < q.length) {
    const c = q[h++], cx = c % W, cy = (c / W) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const nx = cx + dx, ny = cy + dy; if (solid(nx, ny)) continue;
      if (dx && dy && (solid(cx + dx, cy) || solid(cx, cy + dy))) continue;
      const n = ny * W + nx, nd = dist[c] + (dx && dy ? 1.414 : 1); if (nd < dist[n]) { dist[n] = nd; prev[n] = c; q.push(n); }
    }
  }
  return { dist, prev, W };
}
/** Siguiente punto del camino hacia la casilla (tx, ty). */
function nextWaypoint(B, tx, ty, steps = 2) {
  let n = ty * B.W + tx; if (!Number.isFinite(B.dist[n])) return null;
  const path = []; while (n >= 0 && B.dist[n] > 0) { path.push(n); n = B.prev[n]; }
  const k = path[Math.max(0, path.length - steps)] ?? path[0]; if (k == null) return null;
  return { x: (k % B.W + .5) * TS, y: (((k / B.W) | 0) + .5) * TS };
}

/* ---------- El bot ---------- */
const PROFILE = {
  guerrero: { ranged: false, reach: 46 },
  asesino: { ranged: false, reach: 40 },
  arquero: { ranged: true, keep: [150, 250], range: 290 },
  mago: { ranged: true, keep: [160, 270], range: 330 },
};
class Bot {
  constructor(exp, m) { this.exp = exp; this.m = m; this.seq = 0; this.n = 0; this.axis = { x: 0, y: 0 }; this.t = 0; this.B = null; this.Bt = -1; this.cls = m.save.species; this.P = PROFILE[this.cls]; this.chargeT = 0; }
  push(acts = []) { this.m.queue.push({ seq: this.seq++, ax: this.axis.x, ay: this.axis.y, acts }); }
  act(k, extra = {}) { return Object.assign({ k, n: ++this.n, at: this.seq }, extra); }
  aimAt(t) { const p = this.m.player, dx = t.x - p.x, dy = t.y - p.y, d = Math.hypot(dx, dy) || 1; return { dx: dx / d, dy: dy / d, d }; }
  /** Una decisión (20 veces por segundo). */
  think() {
    const ex = this.exp, E = ex.E, p = this.m.player, g = ex.g, W = ex.world, acts = [];
    if (!p.alive) { this.axis = { x: 0, y: 0 }; return acts; }
    if (this.m.boonOffers.length) ex.pickBoon(this.m.id, this.m.boonOffers[0][0]);
    // Objetos: poción con poca vida, manzana con hambre
    if (p.hp < p.maxHp * .35 && p.bag.has('pocion')) ex.use(this.m.id, 'pocion');
    if (p.belly < 20 && p.bag.has('manzana')) ex.use(this.m.id, 'manzana');
    const ptx = Math.floor(p.x / TS), pty = Math.floor(p.y / TS);
    if (!this.B || ex.time - this.Bt > .25 || this.Bfloor !== ex.floorCount) { this.B = bfs(W, E, ptx, pty); this.Bt = ex.time; this.Bfloor = ex.floorCount; }
    const foes = g.actors.filter(a => a.alive && a.team === 'enemy' && a instanceof E.Enemy);
    let tgt = null, best = Infinity;
    for (const e of foes) {
      const d = this.B.dist[Math.floor(e.y / TS) * W.w + Math.floor(e.x / TS)], eu = Math.hypot(e.x - p.x, e.y - p.y);
      const score = Number.isFinite(d) ? d * TS : (this.P.ranged && eu < 260 && W.los(p.x, p.y, e.x, e.y) ? eu : Infinity);   // sin camino: solo el que dispara puede alcanzarlo
      if (score < best) { best = score; tgt = e; }
    }
    const f = ex.floor, hurry = (f.kind === 'normal' && f.time > f.windLimit * .78) || (f.kind === 'boss' && ex.boss && !ex.boss.alive);   // con el viento encima o el jefe vencido: a la salida
    const go = (tx, ty) => {
      const wp = nextWaypoint(this.B, Math.floor(tx / TS), Math.floor(ty / TS));
      const aim = wp && !(Math.hypot(tx - p.x, ty - p.y) < 64 && W.los(p.x, p.y, tx, ty)) ? wp : { x: tx, y: ty };
      if (!wp && !W.los(p.x, p.y, tx, ty)) { this.axis = { x: 0, y: 0 }; return; }
      const dx = aim.x - p.x, dy = aim.y - p.y, d = Math.hypot(dx, dy) || 1; this.axis = { x: dx / d, y: dy / d };
    };
    // Zonas peligrosas de los enemigos (avisos en el suelo, charcos): salir de ellas tiene prioridad
    const zone = g.zones.find(z => z.r > 0 && !(z.layer === 'top' && z.n !== undefined) && Math.hypot(z.x - p.x, z.y - p.y) < z.r + 14);
    if (p.charging) {                                   // tensando el arco: apunta y suelta al máximo
      this.axis = { x: 0, y: 0 }; const mv = E.MOVES[p.charging.id];
      if (p.charging.t >= mv.charge.time || !tgt) acts.push(this.act('r', Object.assign({ i: p.charging.i }, tgt ? this.aimAt(tgt) : { dx: p.facing.x, dy: p.facing.y, d: 200 })));
      return acts;
    }
    if (!tgt || hurry || !Number.isFinite(best)) {
      // Piso limpio (o viento): a la escalera; tras el jefe, al portal
      const exit = ex.L.stairs || ex.objects.find(o => o.type === 'warp');
      if (exit) go(exit.x ?? (exit.tx + .5) * TS, exit.y ?? (exit.ty + .5) * TS); else this.axis = { x: 0, y: 0 };
      if (!tgt) return acts;
    }
    const a = this.aimAt(tgt), d = a.d, los = W.los(p.x, p.y, tgt.x, tgt.y), R = this.P, edge = d - (tgt.radius || 10);
    // Esquivar: un enemigo cercano está a punto de golpear
    const threat = foes.find(e => (e.state === 'windup' || e.state === 'charging') && Math.hypot(e.x - p.x, e.y - p.y) < (e.kind.isBoss ? 120 : 70));
    if (threat && p.dodgeCharges > 0) { const t = this.aimAt(threat); acts.push(this.act('d', { dx: -t.dy * (this.n % 2 ? 1 : -1) - t.dx * .6, dy: t.dx * (this.n % 2 ? 1 : -1) - t.dy * .6, d: 0 })); }
    if (zone && !hurry) { const dx = p.x - zone.x, dy = p.y - zone.y, dd = Math.hypot(dx, dy) || 1; this.axis = { x: dx / dd, y: dy / dd }; }
    else if (!hurry) {
      if (!R.ranged) { if (edge > R.reach || !los) go(tgt.x, tgt.y); else this.axis = { x: 0, y: 0 }; }
      else {
        if (!los || d > R.range * .85) go(tgt.x, tgt.y);
        else if (d < R.keep[0]) {   // demasiado cerca: retrocede (si choca, se desliza de lado)
          let ax = -a.dx, ay = -a.dy; const nx = p.x + ax * 30, ny = p.y + ay * 30;
          if (E.SOLID[W.tileAt(nx, ny)]) { ax = -a.dy; ay = a.dx; if (E.SOLID[W.tileAt(p.x + ax * 30, p.y + ay * 30)]) { ax = a.dy; ay = -a.dx; } }
          this.axis = { x: ax, y: ay };
        } else this.axis = { x: 0, y: 0 };
      }
    }
    // Atacar
    const inRange = R.ranged ? (los && d <= R.range) : (los && edge <= R.reach + 6);
    if (inRange) acts.push(this.act('b', a));
    const mv = p.moves[0] && E.MOVES[p.moves[0]];
    if (mv && p.cds[0] <= 0 && p.energy >= (mv.cost || 0) * 1.3 + 2 && los) {
      const ok = { golpetazo: edge <= 60, tajoX: edge <= 66, flechazo: d <= 500, lluvia: d <= 440 && (tgt.kind.isBoss || foes.filter(e => Math.hypot(e.x - tgt.x, e.y - tgt.y) < 90).length >= 2 || tgt.hp > tgt.maxHp * .6) }[p.moves[0]];
      if (ok) acts.push(this.act('m', Object.assign({ i: 0 }, a)));
    }
    return acts;
  }
  step() { const acts = (this.t++ % 6 === 0) ? this.think() : []; this.push(acts); }
}

/* ---------- Una expedición completa ---------- */
function runDungeon(cls, dungeonId, seed) {
  const E0 = createServerEngine(), dng = E0.dungeonById(dungeonId), level = dng.level + LEVEL_OFFSET;
  const profile = profileAt(E0, cls, level);
  let rs = (seed * 2654435761) >>> 0; const random = () => { rs = (rs + 0x6D2B79F5) >>> 0; let t = rs; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const realRandom = Math.random; Math.random = random;     // el motor usa Math.random para críticos y variaciones: semilla fija
  try {
    const ex = new Expedition({ dungeonId, seed, members: [{ id: 'bot', name: cls, profile }], random });
    const m = ex.members.get('bot'), bot = new Bot(ex, m), p0 = () => m.player;
    // De dónde sale el daño recibido (por enemigo / estado)
    const takenBy = {}, hit0 = ex.E.Combat.hit;
    ex.E.Combat.hit = function (g, t, o) {
      if (t !== m.player) return hit0.call(this, g, t, o);
      const before = t.hp, r = hit0.call(this, g, t, o), lost = before - t.hp;
      if (lost > 0) { const src = o && o.src, k = o && o.dot ? 'estado:' + (o.team || o.kind || 'dot') : src ? (src.kindId || (src.kind && src.kind.name) || 'otro') + (src.kind && src.kind.isBoss ? ' (jefe)' : '') : (o && o.team) || 'otro'; takenBy[k] = (takenBy[k] || 0) + lost; }
      return r;
    };
    const floors = []; let cur = { kind: ex.floor.kind, floorNo: ex.floor.floorNo, t0: 0, dmg0: 0, kills0: 0, taken: 0 }, lastHp = p0().hp, bossT0 = null, boss = null;
    let taken = 0;
    while (!ex.ended && ex.time < MAX_RUN) {
      const before = ex.floorCount;
      bot.step(); ex.step(STEP);
      const p = p0(); if (p.hp < lastHp) { taken += lastHp - p.hp; cur.taken += lastHp - p.hp; } lastHp = p.hp;
      if (ex.boss && ex.boss.alive && bossT0 == null && ex.floor.kind === 'boss' && ex.boss.aggro) { bossT0 = ex.time; boss = { name: ex.boss.kind.name, maxHp: ex.boss.maxHp, hp0: p.hp, hpMax: p.maxHp }; }
      if (boss && !boss.t && ex.boss && !ex.boss.alive) { boss.t = ex.time - bossT0; boss.hpLost = Math.max(0, boss.hp0 - p.hp); boss.dps = boss.maxHp / boss.t; }
      if (ex.floorCount !== before || ex.ended) {
        floors.push({ kind: cur.kind, floorNo: cur.floorNo, time: +(ex.time - cur.t0).toFixed(1), kills: m.rewards.defeated - cur.kills0, damage: Math.round(m.rewards.damage - cur.dmg0), taken: Math.round(cur.taken) });
        cur = { kind: ex.floor.kind, floorNo: ex.floor.floorNo, t0: ex.time, dmg0: m.rewards.damage, kills0: m.rewards.defeated, taken: 0 }; lastHp = p0().hp;
      }
    }
    const result = ex.ended ? ex.ended.result : 'timeout', p = p0();
    return { cls, dungeon: dungeonId, seed, level, endLevel: m.save.prog.level, result, success: result === 'clear', time: +ex.time.toFixed(1), kills: m.rewards.defeated, damage: Math.round(m.rewards.damage), taken: Math.round(taken),
      floors, boss: boss && boss.t ? { name: boss.name, time: +boss.t.toFixed(1), dps: +boss.dps.toFixed(1), hpLostPct: +(100 * boss.hpLost / boss.hpMax).toFixed(0) } : boss ? { name: boss.name, time: null, died: true } : null,
      casts: m.stats.casts, rejected: m.stats.rejected, takenBy: Object.fromEntries(Object.entries(takenBy).map(([k, v]) => [k, Math.round(v)]).sort((a, b) => b[1] - a[1])) };
  } finally { Math.random = realRandom; }
}

/* ---------- Muñeco de prácticas: daño puro por segundo ---------- */
function dummyDps(cls, level, n = 1, secs = 60) {
  const E = createServerEngine(), dng = E.dungeonById('bosque');
  let rs = 12345; const realRandom = Math.random; Math.random = () => { rs = (rs + 0x6D2B79F5) >>> 0; let t = rs; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  try {
    const W = new E.World(40, 30); W.tiles.fill(E.T.FLOOR); for (let y = 0; y < 30; y++) for (let x = 0; x < 40; x++) if (!x || !y || x === 39 || y === 29) W.tiles[y * 40 + x] = E.T.WALL;
    const s = profileAt(E, cls, level), p = new E.Player(E.FORMS[cls], 20 * TS, 15 * TS, s.prog, s.equip);
    p.netId = 'bot'; p.belly = 1e9;
    const g = createHeadlessGame(E, W, { onPlayerDown() {}, onEnemyDown() {} });
    g.actors.push(p);
    const ranged = PROFILE[cls].ranged, dist = ranged ? 200 : 40, dummies = [];
    // Muñecos: un Mordisquín del nivel del jugador que no se mueve ni ataca (defensa típica de un enemigo)
    for (let i = 0; i < n; i++) {
      const k = Object.assign({}, E.makeKind('mordisquin'), { brain: () => E.STOP, speed: 0, aggro: 0 });
      const e = new E.Enemy(k, p.x + dist + (i % 2) * 22, p.y + (i < 2 ? -12 : 12) * (n > 1 ? 1 : 0), { level });
      e.maxHp = e.hp = 1e9; e.fixed = { x: e.x, y: e.y }; dummies.push(e); g.actors.push(e);
    }
    let seq = 0, nAct = 0, total = 0;
    const m = { queue: [] }, aim = () => { const t = dummies[0], dx = t.x - p.x, dy = t.y - p.y, d = Math.hypot(dx, dy); return { dx: dx / d, dy: dy / d, d }; };
    for (let t = 0, k = 0; t < secs; t += STEP, k++) {
      g.player = p;
      const hp0 = dummies.reduce((a, e) => a + e.hp, 0);       // antes de atacar: los golpes cuerpo a cuerpo son instantáneos
      if (k % 6 === 0) {
        g.aim = aim();
        if (p.charging) { const mv = E.MOVES[p.charging.id]; if (p.charging.t >= mv.charge.time) p.releaseCharge(g); }
        else { p.tryBasic(g); const mv = p.moves[0] && E.MOVES[p.moves[0]]; if (mv && p.cds[0] <= 0 && p.energy >= (mv.cost || 0)) p.tryMove(g, 0); }
        g.aim = null;
      }
      stepWorld(E, g, STEP, [p], () => ({ x: 0, y: 0 }));
      for (const e of dummies) { e.x = e.px = e.fixed.x; e.y = e.py = e.fixed.y; e.kbx = e.kby = 0; e.vx = e.vy = 0; }   // el muñeco no se mueve (ni por empujones)
      total += hp0 - dummies.reduce((a, e) => a + e.hp, 0);
    }
    return +(total / secs).toFixed(1);
  } finally { Math.random = realRandom; }
}

/* ---------- Informe ---------- */
const avg = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0;
const t0 = Date.now(), runs = [], dps = {};
for (const cls of CLASSES) {
  dps[cls] = {};
  for (const lv of [5, 10, 15, 20]) dps[cls][lv] = { single: dummyDps(cls, lv, 1), group4: dummyDps(cls, lv, 4) };
  process.stderr.write(`[dps] ${cls} ${JSON.stringify(dps[cls])}\n`);
}
for (const d of DUNGEONS) for (const cls of CLASSES) for (let s = 1; s <= SEEDS; s++) {
  const r = runDungeon(cls, d, 1000 * s + d.length); runs.push(r);
  process.stderr.write(`[run] ${d} ${cls} s${s}: ${r.result} ${r.time}s kills ${r.kills} dmg ${r.damage} taken ${r.taken}${r.boss ? ` boss ${JSON.stringify(r.boss)}` : ''} (${((Date.now() - t0) / 1000).toFixed(0)}s)\n`);
}
const summary = {};
for (const d of DUNGEONS) { summary[d] = {}; for (const cls of CLASSES) {
  const rs = runs.filter(r => r.dungeon === d && r.cls === cls), ok = rs.filter(r => r.success), bosses = rs.map(r => r.boss).filter(b => b && b.time);
  const normal = rs.flatMap(r => r.floors.filter(f => f.kind === 'normal' && f.kills > 0));
  summary[d][cls] = { runs: rs.length, successPct: Math.round(100 * ok.length / rs.length), level: rs[0] && rs[0].level,
    timeAvg: +avg(ok.map(r => r.time)).toFixed(0), floorTimeAvg: +avg(normal.map(f => f.time)).toFixed(1), killsPerMin: +avg(normal.map(f => f.kills / (f.time / 60))).toFixed(1),
    dmgPerSecFloors: +avg(normal.map(f => f.damage / f.time)).toFixed(1), takenPerMin: +avg(normal.map(f => f.taken / (f.time / 60))).toFixed(1),
    bossTime: +avg(bosses.map(b => b.time)).toFixed(1), bossDps: +avg(bosses.map(b => b.dps)).toFixed(1), bossHpLostPct: +avg(bosses.map(b => b.hpLostPct)).toFixed(0),
    deaths: rs.filter(r => r.result === 'faint').length, timeouts: rs.filter(r => r.result === 'wind' || r.result === 'timeout').length };
} }
const out = { generated: new Date().toISOString(), seeds: SEEDS, levelOffset: LEVEL_OFFSET, dps, summary, runs };
if (OUT) { mkdirSync(dirname(OUT), { recursive: true }); writeFileSync(OUT, JSON.stringify(out, null, 1)); }
console.log(JSON.stringify({ dps, summary }, null, 1));
process.stderr.write(`[ok] ${runs.length} expediciones en ${((Date.now() - t0) / 1000).toFixed(0)} s\n`);
