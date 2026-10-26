// SOLO PRUEBAS: servidor de juego real (Colyseus + SQLite) en un puerto y el cliente estático en otro.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, extname, normalize } from 'node:path';
import { createGameServer } from '../../server/src/app.js';
import { Expedition } from '../../server/src/sim/Expedition.js';
const [gamePort, webPort, dir, dbFile] = [+process.argv[2], +process.argv[3], process.argv[4], process.argv[5]];
const app = await createGameServer({ port: gamePort, secret: 'b'.repeat(48), store: 'sqlite', sqliteFile: dbFile, tokenTtlHours: 1, allowProfileImport: false, clientOrigins: [`http://127.0.0.1:${webPort}`], reconnectSeconds: +process.argv[6] || 45 });
await app.listen();
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8' };
/**
 * SOLO PRUEBAS: control de la expedición para preparar escenarios y leer el estado autoritativo.
 * No forma parte del servidor del juego (no existe en server/); solo lo arranca esta prueba.
 */
const sent = new WeakMap();
const playing = () => [...app.registry.rooms.values()].find(r => r.exp && r.state.phase === 'playing');
/** Registro de todos los eventos que el servidor envía, desde que se crea cada expedición (los primeros
 *  ataques enemigos pueden ocurrir antes de la primera llamada de control). */
const origDrain = Expedition.prototype.drainEvents;
Expedition.prototype.drainEvents = function () { const e = origDrain.call(this); if (!sent.has(this)) sent.set(this, []); sent.get(this).push(...e); return e; };
function tap(room) { if (!sent.has(room.exp)) sent.set(room.exp, []); return sent.get(room.exp); }
/** Jugador muy resistente para las pruebas (también tras subir de nivel: con las clases se empieza en el nivel 1 y se sube enseguida). */
const tough = p => { p.maxHp = p.hp = 20000; if (!p._tough) { p._tough = true; const rc = p.recalc.bind(p); p.recalc = (...a) => { const hp = p.hp, r = rc(...a); p.maxHp = 20000; p.hp = Math.max(hp, 1); return r; }; } };
/** …y también los que entran o reconectan después (se crea su jugador de nuevo a partir del perfil). */
const keepTough = X => { if (X._tw) return; X._tw = true; const st = X.step.bind(X); X.step = dt => { for (const m of X.members.values()) if (m.player && !m.player._tough) tough(m.player); return st(dt); }; };
const control = {
  state() { const r = playing(); if (!r) return { room: null }; const ev = tap(r);
    return { room: r.roomId, frozen: !!r.frozen, state: r.state.toJSON(), aids: ev.filter(e => e.aid && (e.type === 'cast' || e.type === 'eatk')).map(e => e.aid),
      kills: ev.filter(e => e.type === 'enemyDown').map(e => e.id), doorsAt: r.exp.doors.map(d => ({ key: d.key, open: d.open, tiles: d.tiles, tile: r.exp.world.tiles[d.tiles[0]] })),
      players: [...r.exp.members.values()].filter(m => !m.left).map(m => ({ sid: m.id, name: m.name, x: m.player.x, y: m.player.y, keys: m.player.bag.count('llave'), exp: m.save.prog.exp, casts: m.stats.casts, dup: m.stats.duplicates, nextSeq: m.nextSeq, ack: m.ack, queue: m.queue.length, connected: m.connected, dormant: !!m.player.dormant })),
      actorsPlayers: r.exp.g.actors.filter(a => a instanceof r.exp.E.Player).length, clients: r.clients.length }; },
  /** Baja de piso (como si todos llegaran a la escalera): aparece la oferta de dones. */
  nextFloor() { const r = playing(), X = r.exp; tap(r); X.nextStep(); r.flushEvents(); r.sync(); return { floor: X.floorInfo.n }; },
  /** Dones de cada jugador y ofertas pendientes, según el servidor. */
  boons() { const r = playing(); return Object.fromEntries([...r.exp.members.values()].filter(m => !m.left).map(m => [m.id, { boons: Object.assign({}, m.player.boons), pending: m.boonOffers.length, offer: m.boonOffers[0] || null }])); },
  /** Piso con cámara del tesoro (semilla 4, piso 2, con 4 jugadores), jugadores resistentes y enemigos alrededor. */
  arena({ enemies = 6, hp = 60 } = {}) { const r = playing(), X = r.exp; tap(r);
    X.seed = 4; X.loadStep(X.seq.findIndex(s => s.floorNo === 2 && s.kind === 'normal'));
    X.g.actors = X.g.actors.filter(a => !(a instanceof X.E.Enemy));
    keepTough(X); for (const m of X.members.values()) { tough(m.player); m.player.bag.take('llave', m.player.bag.count('llave')); }
    const sx = X.world.spawn.x, sy = X.world.spawn.y, v = Object.keys(X.dng.enemies)[0]; let made = 0;
    for (let k = 0; k < 60 && made < enemies; k++) { const a = k * 2.1, d = 70 + (k % 3) * 20, x = sx + Math.cos(a) * d, y = sy + Math.sin(a) * d, e = new X.E.Enemy(X.E.makeKind(v), x, y, { level: 3 }); if (!e.free(X.world, x, y)) continue; e.aggro = true; X.addEnemy(e, 'v:' + v); e.maxHp = e.hp = made < 3 ? 20 : hp; made++; }   // PS fijados tras el ajuste del cooperativo
    r.flushEvents(); r.sync(); return { made, doors: X.doors.length }; },
  /** El jugador `name` llega a la puerta con una llave en su mochila. */
  door({ name }) { const r = playing(), X = r.exp, m = [...X.members.values()].find(x => x.name === name), dr = X.doors[0];
    m.player.bag.add('llave', 1);
    for (let d = 20; d <= 56; d += 4) for (let a = 0; a < 16; a++) { const x = dr.x + Math.cos(a / 16 * 6.283) * d, y = dr.y + Math.sin(a / 16 * 6.283) * d; if (m.player.free(X.world, x, y)) { m.player.placeAt(x, y); return { ok: true }; } }
    return { ok: false }; },
  boss() { const r = playing(), X = r.exp; X.loadStep(X.seq.length - 1); keepTough(X); for (const m of X.members.values()) tough(m.player); r.flushEvents(); r.sync(); return { id: X.boss.netId }; },
  bossHurt({ frac }) { const r = playing(), b = r.exp.boss; b.hp = Math.floor(b.maxHp * frac); b.aggro = true; return { hp: b.hp }; },
  /** Cambia la expedición a otra mazmorra (como si el grupo hubiera salido hacia ella) y carga el paso indicado. */
  dungeon({ id, step = 'boss' }) { const r = playing(), X = r.exp; tap(r);
    X.dng = X.E.dungeonById(id); X.seq = [];
    for (let f = 1; f <= X.dng.floors; f++) { X.seq.push({ kind: 'normal', floorNo: f }); if (f === X.dng.waypoint) X.seq.push({ kind: 'waypoint', floorNo: f }); }
    X.seq.push({ kind: 'boss', floorNo: X.dng.floors + 1 });
    X.loadStep(step === 'boss' ? X.seq.length - 1 : X.seq.findIndex(s => s.kind === 'normal' && s.floorNo === step));
    keepTough(X); for (const m of X.members.values()) tough(m.player);
    if (X.boss) X.boss.aggro = true;
    r.flushEvents(); r.sync(); return { id: X.boss ? X.boss.netId : null, pause: X.pauseT || 0, floor: X.floorInfo.n }; },
  /** Rocas de la Reina Geoda según el servidor. */
  rocks() { const X = playing().exp; return { rocks: (X.g.boulders || []).map(b => ({ id: b.id, tx: b.tx, ty: b.ty, hp: b.hp, solid: b.solid })), boss: { state: X.boss.state, hits: X.boss.rockHits || 0, stage: X.boss.geodaStage || 0, rage: !!X.boss.enraged } }; },
  /** Pone al guardián delante de una roca y al jugador `name` detrás, y ordena la Carga. */
  dashAtRock({ name }) { const X = playing().exp, b = X.boss, m = [...X.members.values()].find(x => x.name === name);
    X.g.zones.length = 0; X.g.projectiles.length = 0;
    // Una roca con hueco a un lado para el guardián y al otro para el jugador (en alguna de las 4 direcciones)
    let pick = null;
    for (const rk of X.g.boulders.filter(o => o.solid && o.hp === X.E.GEODA.rockHp)) for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const bx = rk.cx - dx * 112, by = rk.cy - dy * 112, px = rk.cx + dx * 92, py = rk.cy + dy * 92;
      if (!pick && b.free(X.world, bx, by) && m.player.free(X.world, px, py)) pick = { rk, dx, dy, bx, by, px, py };
    }
    if (!pick) return { error: 'ninguna roca con sitio a los dos lados' };
    b.x = b.px = pick.bx; b.y = b.py = pick.by; m.player.placeAt(pick.px, pick.py); b.rockHits = 0;   // cuenta desde cero (puede haber chocado ya mientras se esperaba)
    for (const o of X.members.values()) if (o !== m) o.player.placeAt(X.world.spawn.x, X.world.spawn.y);   // los demás, lejos
    b.state = 'windup'; b.pattern = 'dash'; b.timer = .15; b.windupTime = .55; b.atk = { x: pick.dx, y: pick.dy }; b.cd = 9;   // ya apuntada (último 40 % del aviso)
    return { rock: pick.rk.id, hp: m.player.hp }; },
  /** Aturde al guardián (como tras 3 choques) y deja `t` segundos antes del salto, apuntando a `name`. */
  daze({ name, t = 1.5 }) { const X = playing().exp, b = X.boss, m = [...X.members.values()].find(x => x.name === name);
    // Objetivo: el más cercano al guardián (como en el juego). `name` se pone a su lado; los demás, en la entrada.
    for (const o of X.members.values()) o.player.placeAt(X.world.spawn.x, X.world.spawn.y);
    m.player.placeAt(b.x + 70, b.y); X.E.Geoda.unstick(m.player, X.g);
    X.E.Geoda.daze(b, X.g); b.timer = t; return { state: b.state }; },
  /** Lleva al jugador `name` a una posición (como si hubiera andado hasta allí). */
  place({ name, x, y }) { const X = playing().exp, m = [...X.members.values()].find(o => o.name === name); m.player.placeAt(x, y); return { x: m.player.x, y: m.player.y }; },
  /** Objetos del suelo según el servidor. */
  floorItems() { const X = playing().exp; return [...X.items.values()].map(it => ({ key: it.key, id: it.id, amount: it.amount, x: it.x, y: it.y, dropBy: it.dropBy || '' })); },
  member({ name }) { const X = playing().exp, m = [...X.members.values()].find(x => x.name === name); return { downed: m.downed, hp: m.player.hp, x: m.player.x, y: m.player.y }; },
  /** Derriba a un jugador con un golpe enemigo de verdad (Combat.hit), como en una pelea. */
  down({ name }) { const X = playing().exp, m = [...X.members.values()].find(x => x.name === name), p = m.player;
    const src = X.g.actors.find(a => a instanceof X.E.Enemy && a.alive) || { team: 'enemy', x: p.x + 20, y: p.y, alive: true };
    p.iframes = 0; p.status && (p.status.shield = 0); X.E.Combat.hit(X.g, p, { team: 'enemy', dmg: p.hp + p.maxHp * 10, src, type: 'normal' }); return { hp: p.hp, alive: p.alive }; },
  /** Quita los enemigos del piso (para que la prueba de reanimar no dependa de peleas). */
  calm() { const X = playing().exp; for (const a of X.g.actors) if (a instanceof X.E.Enemy) a.alive = false; return { ok: true }; },
  /** Termina la expedición en curso como si el grupo volviera por el portal (resultado «return»). */
  finish({ result = 'return' } = {}) { const X = playing().exp; X.finish(result); return { ok: true }; },
  /** Hub social: grupos y quién ve a quién (lo que decide el servidor). */
  hub() { const H = app.hub; if (!H) return { ready: false }; return { ready: true, online: [...H.conns.values()].filter(c => c.online).map(c => ({ name: c.account.name, where: H.presenceOf(c.account.id).where, pos: c.pos })), parties: [...H.parties.values()].map(p => ({ leader: H.conns.get(p.leader)?.account.name, members: p.members.map(m => H.conns.get(m)?.account.name || m) })) }; },
  freeze({ on }) { const r = playing(); r.frozen = !!on; if (on) r.sync(); return { frozen: r.frozen }; },
};
createServer(async (req, res) => {
  if (req.url.startsWith('/__test/')) {
    const u = new URL(req.url, 'http://x'), op = u.pathname.slice(8), args = JSON.parse(u.searchParams.get('a') || '{}');
    try { const out = control[op](args); res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify(out)); }
    catch (e) { res.writeHead(500, { 'content-type': 'application/json' }); res.end(JSON.stringify({ error: String(e.stack || e) })); }
    return;
  }
  const p = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^(\.\.[/\\])+/, '');
  const f = p === '/' ? 'index.html' : p;
  try { const body = await readFile(join(dir, f)); res.writeHead(200, { 'content-type': types[extname(f)] || 'application/octet-stream' }); res.end(body); }
  catch { res.writeHead(404); res.end(); }
}).listen(webPort, '127.0.0.1', () => console.log('ready'));
