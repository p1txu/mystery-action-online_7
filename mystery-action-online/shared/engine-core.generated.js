// GENERADO por tools/split-prototype.mjs a partir de prototype/mystery-action.html (sha256 0b1d9c81790a160e).
// No lo edites a mano: cambia el prototipo y vuelve a ejecutar «npm run split».
/* eslint-disable */
/**
 * Crea una instancia aislada de las reglas del juego (sin canvas, sin DOM, sin audio).
 * Cada sala del servidor puede tener la suya, así ningún estado de módulo se comparte.
 * `host` permite sustituir las piezas de presentación (por defecto no hacen nada).
 */
export function createEngineCore(host = {}) {
  const noop = () => undefined;
  const inert = () => new Proxy(function () {}, { get: (t, k) => k === Symbol.toPrimitive ? () => '' : inert(), apply: noop });
  const Sfx = host.Sfx || inert(), Light = host.Light || inert(), UI = host.UI || inert();
  const localStorage = host.localStorage;   // sin almacenamiento: Store usa memoria
/* ---------- 1. CONFIG ---------- */
const CONFIG = {
  TILE: 32,
  MAP_W: 88, MAP_H: 64,
  CHUNK: 8,
  CHUNK_CACHE: 48,
  SEED: 20261023,
  VIEW_TILES_H: 13,
  MIN_ZOOM: 1.1, MAX_ZOOM: 3,
  CREATURE_SCALE: 1.35,
  ART_PIXEL: 1,             // unidades del mundo por píxel de arte (estética pixel art)     // tamaño visual de las criaturas (la colisión no cambia)
  STEP: 1 / 120,
  ACCEL: 14, FRICTION: 18,
  ENERGY_MAX: 100, ENERGY_REGEN: 3.5,          // energía por segundo (antes 9)
  DODGE_CHARGES: 1, DODGE_RECHARGE: 2.8, DODGE_SPEED: 560, DODGE_TIME: .17, DODGE_IFRAMES: .22,
  BASIC_CHARGES: 4, BASIC_RECHARGE: 1.1,       // el ataque básico gasta cargas que se recuperan de una en una
  MOVE_CD_MUL: 1.5, MOVE_COST_MUL: 1.3,        // enfriamiento y coste de los movimientos especiales
  HP_REGEN_EVERY: 5,                           // 1 PS cada 5 s con la barriga llena (antes 1,5 s)
  HURT_IFRAMES: .55,
};

/* ---------- 2. Util ---------- */
const U = {
  clamp: (v, a, b) => v < a ? a : v > b ? b : v,
  lerp: (a, b, t) => a + (b - a) * t,
  rng(seed) { let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; },
  hash(x, y, s = 0) { let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(s, 982451653)) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; },
  ellipse(c, x, y, rx, ry, fill) { c.beginPath(); c.ellipse(x, y, Math.max(0, rx), Math.max(0, ry), 0, 0, Math.PI * 2); c.fillStyle = fill; c.fill(); },
};

/* ---------- 3. Input ---------- */
const MOVE_KEYS = {
  up: ['KeyW', 'ArrowUp'], down: ['KeyS', 'ArrowDown'],
  left: ['KeyA', 'ArrowLeft'], right: ['KeyD', 'ArrowRight'],
};
class Input {
  constructor(canvas) {
    this.down = new Set();
    this.pressed = new Set();
    this.capture = false; // true durante la partida: Espacio/Tab no actúan sobre la página
    this.mouse = { x: 0, y: 0, inside: false, down: false, lastMove: -1e9 };
    const always = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'F3']);
    const inGame = new Set(['Space', 'Tab', 'KeyQ', 'KeyE', 'KeyR', 'KeyF', 'KeyG']);
    addEventListener('keydown', e => {
      if (always.has(e.code) || (this.capture && inGame.has(e.code) && !e.ctrlKey && !e.metaKey)) e.preventDefault();
      if (!e.repeat) this.pressed.add(e.code);
      this.down.add(e.code);
    });
    addEventListener('keyup', e => this.down.delete(e.code));
    // Evita teclas "pegadas" si se pierde el foco con una tecla pulsada.
    addEventListener('blur', () => this.clear());
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.clear(); });
    // Ratón (solo sobre el lienzo del juego).
    const pos = e => { const r = canvas.getBoundingClientRect(); this.mouse.x = e.clientX - r.left; this.mouse.y = e.clientY - r.top; };
    canvas.addEventListener('pointermove', e => { pos(e); this.mouse.inside = true; this.mouse.lastMove = performance.now(); });
    canvas.addEventListener('pointerleave', () => { this.mouse.inside = false; this.mouse.down = false; });
    canvas.addEventListener('pointerdown', e => {
      if (e.button !== 0) return;
      pos(e); this.mouse.inside = true; this.mouse.lastMove = performance.now();
      this.mouse.down = true; this.pressed.add('Mouse0');
      canvas.focus({ preventScroll: true });
    });
    addEventListener('pointerup', e => { if (e.button === 0) this.mouse.down = false; });
    canvas.addEventListener('contextmenu', e => e.preventDefault());
  }
  clear() { this.down.clear(); this.pressed.clear(); this.mouse.down = false; }
  any(codes) { return codes.some(c => this.down.has(c)); }
  /** Vector de movimiento normalizado; teclas opuestas se anulan. */
  axis() {
    let x = 0, y = 0;
    if (this.any(MOVE_KEYS.left)) x -= 1;
    if (this.any(MOVE_KEYS.right)) x += 1;
    if (this.any(MOVE_KEYS.up)) y -= 1;
    if (this.any(MOVE_KEYS.down)) y += 1;
    const l = Math.hypot(x, y);
    return l > 0 ? { x: x / l, y: y / l } : { x: 0, y: 0 };
  }
  consume(code) { if (this.pressed.has(code)) { this.pressed.delete(code); return true; } return false; }
  endFrame() { this.pressed.clear(); }
}

/* ---------- 4. Tiles / World ---------- */
const T = { GRASS: 0, PATH: 1, WALL: 2, ROCK: 3, TREE: 4, WATER: 5, FLOWERS: 6, TALLGRASS: 7, FLOOR: 8, CRYSTAL: 9, LAVA: 10, DOOR: 11, SECRET: 12, STAIRS: 13, CARPET: 14, BUILD: 15 };
const SOLID = new Uint8Array(16);
[T.WALL, T.ROCK, T.TREE, T.WATER, T.CRYSTAL, T.LAVA, T.DOOR, T.SECRET, T.BUILD].forEach(t => SOLID[t] = 1);
const TILE_NAMES = ['hierba', 'camino', 'muro', 'roca', 'árbol', 'agua', 'flores', 'hierba alta', 'suelo', 'cristal', 'lava', 'puerta cerrada', 'pared agrietada', 'escalera', 'alfombra', 'edificio'];

class World {
  constructor(w, h, seed, generator = null) {
    this.w = w; this.h = h; this.seed = seed;
    this.tiles = new Uint8Array(w * h); this.blk = null;   // blk: bloqueos temporales (rocas caídas) encima de las casillas
    this.pxW = w * CONFIG.TILE; this.pxH = h * CONFIG.TILE;
    this.spawn = generator ? generator(this, U.rng(seed)) : { x: this.pxW / 2, y: this.pxH / 2 };
  }
  inBounds(tx, ty) { return tx >= 0 && ty >= 0 && tx < this.w && ty < this.h; }
  get(tx, ty) { return this.inBounds(tx, ty) ? this.tiles[ty * this.w + tx] : T.WALL; }
  set(tx, ty, t) { if (this.inBounds(tx, ty)) this.tiles[ty * this.w + tx] = t; }
  isSolid(tx, ty) { return SOLID[this.get(tx, ty)] === 1 || (this.blk !== null && this.inBounds(tx, ty) && this.blk[ty * this.w + tx] === 1); }
  /** Bloqueo temporal de una casilla (no cambia el dibujo del suelo). */
  block(tx, ty, on) { if (!this.inBounds(tx, ty)) return; if (!this.blk) this.blk = new Uint8Array(this.w * this.h); this.blk[ty * this.w + tx] = on ? 1 : 0; }
  blockedAt(px, py) { if (!this.blk) return false; const s = CONFIG.TILE, tx = Math.floor(px / s), ty = Math.floor(py / s); return this.inBounds(tx, ty) && this.blk[ty * this.w + tx] === 1; }
  tileAt(px, py) { const s = CONFIG.TILE; return this.get(Math.floor(px / s), Math.floor(py / s)); }
  /** ¿El rectángulo (en píxeles de mundo) toca alguna casilla sólida? */
  /** Línea de visión entre dos puntos del suelo (muros, rocas, árboles, cristales y puertas la bloquean; el agua y la lava no). */
  los(x0, y0, x1, y1) {
    const d = Math.hypot(x1 - x0, y1 - y0), n = Math.ceil(d / 8);
    for (let i = 1; i < n; i++) { const x = x0 + (x1 - x0) * i / n, y = y0 + (y1 - y0) * i / n; if (BLOCKS_SHOT[this.tileAt(x, y)] || this.blockedAt(x, y)) return false; }
    return true;
  }
  rectHitsSolid(x, y, w, h) {
    const s = CONFIG.TILE, e = 1e-4;
    const x0 = Math.floor(x / s), x1 = Math.floor((x + w - e) / s);
    const y0 = Math.floor(y / s), y1 = Math.floor((y + h - e) / s);
    for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) if (this.isSolid(tx, ty)) return true;
    return false;
  }
}

/** Mapa de pruebas: caminos en cruz y en anillo, tres ruinas, estanque, bosquecillos, rocas y decoración. */
function generateTestMap(W, rnd) {
  const { w, h } = W;
  const cx = w >> 1, cy = h >> 1;
  W.tiles.fill(T.GRASS);

  // Ruido de valor suave para repartir bosques y hierba alta de forma orgánica.
  const vnoise = (x, y, cell, salt) => {
    const gx = Math.floor(x / cell), gy = Math.floor(y / cell);
    const fx = x / cell - gx, fy = y / cell - gy;
    const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
    const a = U.hash(gx, gy, salt), b = U.hash(gx + 1, gy, salt), c = U.hash(gx, gy + 1, salt), d = U.hash(gx + 1, gy + 1, salt);
    return U.lerp(U.lerp(a, b, sx), U.lerp(c, d, sx), sy);
  };

  // Caminos: cruz central ondulada y anillo rectangular.
  for (let x = 2; x < w - 2; x++) { const yy = cy + Math.round(Math.sin(x * 0.11) * 2.5); for (let d = -1; d <= 1; d++) W.set(x, yy + d, T.PATH); }
  for (let y = 2; y < h - 2; y++) { const xx = cx + Math.round(Math.cos(y * 0.13) * 2.5); for (let d = -1; d <= 1; d++) W.set(xx + d, y, T.PATH); }
  const ring = { x0: 11, y0: 9, x1: w - 12, y1: h - 10 };
  for (let x = ring.x0; x <= ring.x1; x++) for (let d = 0; d < 2; d++) { W.set(x, ring.y0 + d, T.PATH); W.set(x, ring.y1 - d, T.PATH); }
  for (let y = ring.y0; y <= ring.y1; y++) for (let d = 0; d < 2; d++) { W.set(ring.x0 + d, y, T.PATH); W.set(ring.x1 - d, y, T.PATH); }

  // Ruinas (se colocan al final; aquí solo se reserva su zona).
  const rooms = [
    { x0: 17, y0: 13, x1: 33, y1: 25, doors: ['s', 'e'], pillars: true },
    { x0: 16, y0: 38, x1: 29, y1: 49, doors: ['n', 'e'], pillars: false, inner: 'cross' },
    { x0: 53, y0: 39, x1: 71, y1: 51, doors: ['w', 'n'], pillars: false, inner: 'maze' },
  ];
  const inRoomZone = (x, y, pad) => rooms.some(r => x >= r.x0 - pad && x <= r.x1 + pad && y >= r.y0 - pad && y <= r.y1 + pad);

  // Estanque al noreste (el camino lo cruza como una pasarela).
  const pcx = Math.round(w * 0.72), pcy = Math.round(h * 0.27);
  for (let y = pcy - 8; y <= pcy + 8; y++) for (let x = pcx - 11; x <= pcx + 11; x++) {
    const dx = (x - pcx) / 8.5, dy = (y - pcy) / 5.5;
    const edge = 1 + (vnoise(x, y, 3, 7) - 0.5) * 0.5;
    if (dx * dx + dy * dy < edge && W.get(x, y) === T.GRASS) W.set(x, y, T.WATER);
  }

  const nearPath = (x, y, r) => { for (let j = -r; j <= r; j++) for (let i = -r; i <= r; i++) if (W.get(x + i, y + j) === T.PATH) return true; return false; };
  const nearSpawn = (x, y, r) => Math.abs(x - cx) <= r && Math.abs(y - cy) <= r;

  // Árboles, rocas y decoración sobre la hierba libre.
  for (let y = 2; y < h - 2; y++) for (let x = 2; x < w - 2; x++) {
    if (W.get(x, y) !== T.GRASS || inRoomZone(x, y, 2) || nearSpawn(x, y, 5)) continue;
    const forest = vnoise(x, y, 7, 11);
    const outer = x < ring.x0 - 1 || x > ring.x1 + 1 || y < ring.y0 - 1 || y > ring.y1 + 1;
    const clearOfPath = !nearPath(x, y, 1);
    if (clearOfPath && (forest > (outer ? 0.5 : 0.68)) && rnd() < 0.82) { W.set(x, y, T.TREE); continue; }
    if (clearOfPath && rnd() < 0.022) { W.set(x, y, T.ROCK); continue; }
    if (vnoise(x, y, 5, 23) > 0.66) { W.set(x, y, T.TALLGRASS); continue; }
    if (rnd() < 0.045) W.set(x, y, T.FLOWERS);
  }
  // Pequeños grupos de rocas para practicar colisiones en esquinas.
  for (let k = 0; k < 14; k++) {
    const x = 4 + Math.floor(rnd() * (w - 8)), y = 4 + Math.floor(rnd() * (h - 8));
    if (inRoomZone(x, y, 2) || nearSpawn(x, y, 6)) continue;
    for (let j = 0; j < 3; j++) {
      const rx = x + Math.floor(rnd() * 3) - 1, ry = y + Math.floor(rnd() * 3) - 1;
      const t = W.get(rx, ry);
      if ((t === T.GRASS || t === T.FLOWERS || t === T.TALLGRASS) && !nearPath(rx, ry, 1)) W.set(rx, ry, T.ROCK);
    }
  }

  // Ruinas: muro perimetral, puertas de 2 casillas y estructuras interiores.
  for (const r of rooms) {
    for (let y = r.y0; y <= r.y1; y++) for (let x = r.x0; x <= r.x1; x++) {
      const edge = x === r.x0 || x === r.x1 || y === r.y0 || y === r.y1;
      W.set(x, y, edge ? T.WALL : T.FLOOR);
    }
    const mx = (r.x0 + r.x1) >> 1, my = (r.y0 + r.y1) >> 1;
    for (const d of r.doors) {
      for (let k = 0; k < 2; k++) {
        if (d === 'n') W.set(mx + k, r.y0, T.FLOOR);
        if (d === 's') W.set(mx + k, r.y1, T.FLOOR);
        if (d === 'w') W.set(r.x0, my + k, T.FLOOR);
        if (d === 'e') W.set(r.x1, my + k, T.FLOOR);
      }
    }
    if (r.pillars) for (let y = r.y0 + 3; y < r.y1 - 1; y += 4) for (let x = r.x0 + 3; x < r.x1 - 1; x += 4) W.set(x, y, T.WALL);
    if (r.inner === 'cross') { for (let x = r.x0 + 3; x <= r.x1 - 3; x++) if (Math.abs(x - mx) > 1) W.set(x, my, T.WALL); for (let y = r.y0 + 3; y <= r.y1 - 3; y++) if (Math.abs(y - my) > 1) W.set(mx - 2, y, T.WALL); }
    if (r.inner === 'maze') {
      for (let y = r.y0 + 1; y <= r.y1 - 4; y++) W.set(r.x0 + 5, y, T.WALL);
      for (let y = r.y0 + 4; y <= r.y1 - 1; y++) W.set(r.x0 + 10, y, T.WALL);
      for (let x = r.x0 + 11; x <= r.x1 - 3; x++) W.set(x, r.y0 + 5, T.WALL);
      W.set(r.x1 - 3, r.y1 - 3, T.ROCK); W.set(r.x0 + 2, r.y1 - 2, T.ROCK);
    }
  }

  // Borde exterior infranqueable (doble muro).
  for (let x = 0; x < w; x++) for (let d = 0; d < 2; d++) { W.set(x, d, T.WALL); W.set(x, h - 1 - d, T.WALL); }
  for (let y = 0; y < h; y++) for (let d = 0; d < 2; d++) { W.set(d, y, T.WALL); W.set(w - 1 - d, y, T.WALL); }

  // Despeja la zona de inicio.
  for (let y = cy - 2; y <= cy + 2; y++) for (let x = cx - 2; x <= cx + 2; x++) if (W.get(x, y) !== T.PATH) W.set(x, y, T.GRASS);

  // Cualquier hueco transitable sin acceso desde el inicio se convierte en árbol.
  const seen = new Uint8Array(w * h), stack = [cy * w + cx];
  seen[cy * w + cx] = 1;
  while (stack.length) {
    const i = stack.pop(), x = i % w, y = (i / w) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy, j = ny * w + nx;
      if (W.inBounds(nx, ny) && !seen[j] && !SOLID[W.tiles[j]]) { seen[j] = 1; stack.push(j); }
    }
  }
  for (let i = 0; i < w * h; i++) if (!seen[i] && !SOLID[W.tiles[i]]) W.tiles[i] = T.TREE;
  W.reach = seen;

  return { x: (cx + 0.5) * CONFIG.TILE, y: (cy + 0.5) * CONFIG.TILE };
}

/* ---------- 5. TileArt (pintado + caché por trozos) ----------
   PAL es la paleta activa. Cambia con el bioma mediante applyTheme(). */
const PAL = {};
function applyTheme(theme) { for (const k of Object.keys(PAL)) delete PAL[k]; Object.assign(PAL, theme.pal); }
const OBJ_TILES = new Set([T.ROCK, T.TREE, T.CRYSTAL, T.FLOWERS, T.TALLGRASS, T.DOOR, T.STAIRS]);
const isWallT = t => t === T.WALL || t === T.SECRET;

/** Utilidades de color para sombrear (resultados en caché). */
const SHADE_CACHE = {};
function shade(hex, amt) {
  const key = hex + amt; if (SHADE_CACHE[key]) return SHADE_CACHE[key];
  const [r, g, b] = rgbOf(hex), f = v => Math.max(0, Math.min(255, Math.round(amt > 0 ? v + (255 - v) * amt : v * (1 + amt))));
  return (SHADE_CACHE[key] = `rgb(${f(r)},${f(g)},${f(b)})`);
}
/** Ruido de valor suave (bilinear) para variar el suelo sin cortes en bloque. */
function smoothNoise(tx, ty, cell = 5, salt = 9) {
  const gx = tx / cell, gy = ty / cell, x0 = Math.floor(gx), y0 = Math.floor(gy), fx = gx - x0, fy = gy - y0;
  const sm = t => t * t * (3 - 2 * t), a = U.hash(x0, y0, salt), b = U.hash(x0 + 1, y0, salt), c = U.hash(x0, y0 + 1, salt), d = U.hash(x0 + 1, y0 + 1, salt);
  const u = sm(fx), v = sm(fy); return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
}
function mixColor(a, b, t) {
  const q = Math.round(t * 8) / 8, key = a + b + q; if (SHADE_CACHE[key]) return SHADE_CACHE[key];
  const A = rgbOf(a), B = rgbOf(b); return (SHADE_CACHE[key] = `rgb(${A.map((v, i) => Math.round(v + (B[i] - v) * q)).join(',')})`);
}
const TileArt = {
  /** Motas de textura: n puntos de 1 px con colores de la lista. */
  speck(c, x, y, tx, ty, n, cols, salt = 0, size = 1) {
    for (let k = 0; k < n; k++) { c.fillStyle = cols[k % cols.length]; c.fillRect(x + Math.floor(U.hash(tx, ty, 200 + salt + k) * 31), y + Math.floor(U.hash(tx, ty, 300 + salt + k) * 31), size, size); }
  },
  ground(c, W, tx, ty) {
    const s = CONFIG.TILE, x = tx * s, y = ty * s, v = U.hash(tx, ty, 1);
    let t = W.get(tx, ty);
    if (OBJ_TILES.has(t)) t = PAL.objBase === 'floor' ? T.FLOOR : (t === T.DOOR || t === T.STAIRS ? T.PATH : T.GRASS);
    if (t === T.BUILD) t = T.PATH;   // los edificios de la aldea se dibujan encima
    const region = smoothNoise(tx, ty);                  // variación suave por zonas (cada sala se ve distinta)
    if (t === T.CARPET) {
      c.fillStyle = '#4a1a18'; c.fillRect(x, y, s + 1, s + 1);
      c.fillStyle = '#5e2420'; c.fillRect(x + 2, y + 2, s - 4, s - 4);
      c.strokeStyle = '#8a6a32'; c.lineWidth = 1; c.strokeRect(x + 4.5, y + 4.5, s - 9, s - 9);
      c.fillStyle = '#8a6a32'; c.fillRect(x + 15, y + 9, 2, 14); c.fillRect(x + 9, y + 15, 14, 2);
      return;
    }
    if (t === T.PATH) {
      c.fillStyle = PAL.path; c.fillRect(x, y, s + 1, s + 1);
      if (region > .6) { c.fillStyle = shade(PAL.path, -.12); c.fillRect(x, y + 8 + Math.floor(v * 10), s, 6); }
      this.speck(c, x, y, tx, ty, 10, [shade(PAL.path, .12), shade(PAL.path, -.2), PAL.pebble]);
      c.fillStyle = PAL.pebble; for (let k = 0; k < 2; k++) { const px = U.hash(tx, ty, 10 + k) * 26 + 3, py = U.hash(tx, ty, 20 + k) * 26 + 3; c.fillRect(x + px, y + py, 2, 2); c.fillStyle = shade(PAL.pebble, -.35); c.fillRect(x + px, y + py + 2, 2, 1); c.fillStyle = PAL.pebble; }
      const open = n => n === T.PATH || n === T.FLOOR || n === T.WATER || n === T.STAIRS || n === T.DOOR || n === T.LAVA || n === T.BUILD || n === T.CARPET;
      c.fillStyle = PAL.pathEdge;
      if (!open(W.get(tx, ty - 1))) for (let k = 0; k < s; k += 4) c.fillRect(x + k, y, 4, 1 + Math.floor(U.hash(tx * 8 + k, ty, 3) * 3));
      if (!open(W.get(tx, ty + 1))) for (let k = 0; k < s; k += 4) { const h = 1 + Math.floor(U.hash(tx * 8 + k, ty, 4) * 3); c.fillRect(x + k, y + s - h, 4, h); }
      if (!open(W.get(tx - 1, ty))) for (let k = 0; k < s; k += 4) c.fillRect(x, y + k, 1 + Math.floor(U.hash(tx, ty * 8 + k, 5) * 3), 4);
      if (!open(W.get(tx + 1, ty))) for (let k = 0; k < s; k += 4) { const w = 1 + Math.floor(U.hash(tx, ty * 8 + k, 6) * 3); c.fillRect(x + s - w, y + k, w, 4); }
      return;
    }
    if (t === T.FLOOR && PAL.floorStyle === 'rock') {
      // Suelo de roca natural: manchas irregulares, guijarros y grietas
      const base = mixColor(PAL.floor[0], PAL.floor[2], region);
      c.fillStyle = base; c.fillRect(x, y, s + 1, s + 1);
      for (let k = 0; k < 3; k++) { const bx = x + U.hash(tx, ty, 700 + k) * 26, by = y + U.hash(tx, ty, 710 + k) * 26, r = 4 + U.hash(tx, ty, 720 + k) * 6; c.fillStyle = k % 2 ? shade(base, -.12) : shade(base, .07); c.beginPath(); c.ellipse(bx, by, r, r * .6, 0, 0, Math.PI * 2); c.fill(); }
      this.speck(c, x, y, tx, ty, 9, [shade(base, -.3), shade(base, .2)], 3);
      if (v > .78) { c.fillStyle = shade(base, -.35); c.fillRect(x + 8, y + 20, 4, 2); c.fillStyle = shade(base, .25); c.fillRect(x + 8, y + 19, 3, 1); }
      if (v < .16) { const glow = PAL.glowDecal && U.hash(tx, ty, 77) > .93; c.strokeStyle = glow ? PAL.glowDecal : shade(base, -.4); c.lineWidth = 1; c.beginPath(); c.moveTo(x + 4, y + 9); c.lineTo(x + 12, y + 13); c.lineTo(x + 17, y + 11); c.lineTo(x + 26, y + 16); c.stroke(); }
      if (PAL.glowDecal && U.hash(tx, ty, 77) > .93) { c.fillStyle = PAL.crystalDark; c.fillRect(x + 20, y + 22, 3, 3); c.fillStyle = PAL.glowDecal; c.fillRect(x + 21, y + 21, 1, 3); }
      return;
    }
    if (t === T.FLOOR) {
      // Losas irregulares con juntas, desgaste y, a veces, grietas (con brillo en cuevas y volcán)
      const base = mixColor(PAL.floor[0], PAL.floor[2], region);
      c.fillStyle = PAL.floorLine; c.fillRect(x, y, s + 1, s + 1);
      const split = 12 + Math.floor(U.hash(tx, ty, 7) * 8), off = (ty % 2) * 6;
      const stones = [[0, 0, split, 15], [split + 1, 0, s - split - 1, 15], [0, 16, 9 + off, 16], [10 + off, 16, s - 10 - off, 16]];
      stones.forEach(([sx, sy, w, h], i) => {
        const tone = U.hash(tx * 4 + i, ty, 8);
        c.fillStyle = tone > .66 ? shade(base, .06) : tone < .33 ? shade(base, -.06) : base; c.fillRect(x + sx, y + sy, w, h);
        c.fillStyle = shade(base, .14); c.fillRect(x + sx, y + sy, w, 1);
        c.fillStyle = shade(base, -.22); c.fillRect(x + sx, y + sy + h - 1, w, 1);
      });
      this.speck(c, x, y, tx, ty, 8, [shade(base, -.25), shade(base, .18)], 3);
      if (v > .82) {
        const glow = PAL.glowDecal && U.hash(tx, ty, 77) > .93;
        c.strokeStyle = glow ? PAL.glowDecal : shade(base, -.4); c.lineWidth = 1; c.beginPath();
        c.moveTo(x + 5, y + 18); c.lineTo(x + 11, y + 23); c.lineTo(x + 9, y + 30); c.moveTo(x + 11, y + 23); c.lineTo(x + 19, y + 25); c.stroke();
        if (glow) { c.globalAlpha = .35; c.lineWidth = 3; c.stroke(); c.globalAlpha = 1; }
      }
      if (PAL.rubble && region > .75 && v < .3) { c.fillStyle = shade(base, -.3); c.fillRect(x + 20, y + 6, 3, 2); c.fillRect(x + 24, y + 9, 2, 2); c.fillStyle = shade(base, .2); c.fillRect(x + 20, y + 6, 2, 1); }
      return;
    }
    if (t === T.WATER) {
      c.fillStyle = v > 0.5 ? PAL.water : PAL.waterDeep; c.fillRect(x, y, s + 1, s + 1);
      this.speck(c, x, y, tx, ty, 4, [shade(PAL.water, .12)], 5, 2);
      const bank = PAL.foam;
      if (W.get(tx, ty - 1) !== T.WATER) { c.fillStyle = 'rgba(0,0,0,.35)'; c.fillRect(x, y, s, 5); c.fillStyle = bank; c.globalAlpha = .45; c.fillRect(x, y + 5, s, 1); c.globalAlpha = 1; }
      c.fillStyle = shade(PAL.waterDeep, -.3);
      if (W.get(tx, ty + 1) !== T.WATER) c.fillRect(x, y + s - 2, s, 2);
      if (W.get(tx - 1, ty) !== T.WATER) c.fillRect(x, y, 2, s);
      if (W.get(tx + 1, ty) !== T.WATER) c.fillRect(x + s - 2, y, 2, s);
      return;
    }
    if (t === T.LAVA) {
      c.fillStyle = PAL.lava; c.fillRect(x, y, s + 1, s + 1);
      c.fillStyle = PAL.lavaBright; for (let k = 0; k < 3; k++) c.fillRect(x + 3 + Math.floor(U.hash(tx, ty, 110 + k) * 24), y + 3 + Math.floor(U.hash(tx, ty, 120 + k) * 24), 4 - k, 2);
      // Costra flotante
      c.fillStyle = PAL.lavaCrust;
      for (let k = 0; k < 3; k++) { const px = U.hash(tx, ty, 130 + k) * 22, py = U.hash(tx, ty, 140 + k) * 22; c.fillRect(x + px, y + py, 6 + k * 2, 4 + k); }
      c.fillStyle = PAL.lavaDark;
      if (W.get(tx, ty - 1) !== T.LAVA) c.fillRect(x, y, s, 4);
      if (W.get(tx, ty + 1) !== T.LAVA) c.fillRect(x, y + s - 3, s, 3);
      if (W.get(tx - 1, ty) !== T.LAVA) c.fillRect(x, y, 3, s);
      if (W.get(tx + 1, ty) !== T.LAVA) c.fillRect(x + s - 3, y, 3, s);
      return;
    }
    if (isWallT(t)) { c.fillStyle = PAL.wallDeep; c.fillRect(x, y, s + 1, s + 1); return; }
    // Suelo de hierba / musgo con variación por zonas
    const g0 = mixColor(PAL.grass[0], PAL.grass[2], region), g1 = mixColor(PAL.grass[1], PAL.grass[3], smoothNoise(tx, ty, 3, 21));
    c.fillStyle = g0; c.fillRect(x, y, s + 1, s + 1);
    c.fillStyle = g1; c.globalAlpha = .45;
    for (let k = 0; k < 4; k++) c.fillRect(x + Math.floor(U.hash(tx, ty, 600 + k) * 24), y + Math.floor(U.hash(tx, ty, 610 + k) * 26), 8, 6);
    c.globalAlpha = 1;
    this.speck(c, x, y, tx, ty, 12, [PAL.blade, PAL.bladeDark, shade(g0, -.25)]);
    // briznas cortas
    c.fillStyle = PAL.blade;
    for (let k = 0; k < 5; k++) { const bx = x + 2 + Math.floor(U.hash(tx, ty, 30 + k) * 28), by = y + 4 + Math.floor(U.hash(tx, ty, 40 + k) * 26); c.fillRect(bx, by - 2, 1, 3); c.fillStyle = PAL.bladeDark; c.fillRect(bx + 1, by - 1, 1, 2); c.fillStyle = PAL.blade; }
    // Detalles: hojarasca, piedrecitas y raíces junto a los muros
    if (PAL.litter && v > .84) for (let k = 0; k < 3; k++) { c.fillStyle = PAL.litter[k % PAL.litter.length]; const lx = x + 4 + U.hash(tx, ty, 60 + k) * 22, ly = y + 4 + U.hash(tx, ty, 70 + k) * 22; c.fillRect(lx, ly, 3, 2); c.fillRect(lx + 1, ly + 2, 1, 1); }
    else if (v < .08) { c.fillStyle = PAL.rockDark; c.fillRect(x + 12, y + 20, 5, 3); c.fillStyle = PAL.rock; c.fillRect(x + 12, y + 19, 4, 2); }
    if (PAL.roots && isWallT(W.get(tx, ty - 1)) && v > .45) {
      c.strokeStyle = PAL.roots; c.lineWidth = 2; c.beginPath(); const rx = x + 6 + v * 18;
      c.moveTo(rx, y); c.quadraticCurveTo(rx + 4, y + 6, rx - 2, y + 12 + v * 6); c.moveTo(rx + 1, y + 4); c.lineTo(rx + 8, y + 9); c.stroke();
      c.strokeStyle = shade(PAL.roots, .2); c.lineWidth = 1; c.beginPath(); c.moveTo(rx - 1, y); c.quadraticCurveTo(rx + 3, y + 6, rx - 3, y + 11); c.stroke();
    }
  },
  object(c, W, tx, ty) {
    const s = CONFIG.TILE, x = tx * s, y = ty * s, t = W.get(tx, ty), v = U.hash(tx, ty, 2);
    switch (t) {
      case T.SECRET:
      case T.WALL: {
        const below = isWallT(W.get(tx, ty + 1));
        const deep = below && isWallT(W.get(tx, ty - 1)) && isWallT(W.get(tx - 1, ty)) && isWallT(W.get(tx + 1, ty));
        if (deep && t === T.WALL) { this.wallTop(c, x, y, s, s, tx, ty, true); break; }
        const topH = below ? s : 18;
        this.wallTop(c, x, y, s, topH + (below ? 1 : 0), tx, ty, false);
        if (!below) this.wallFace(c, x, y + 18, s, 14, tx, ty);
        if (t === T.SECRET) { // grietas sutiles: pista de pasaje secreto
          c.strokeStyle = shade(PAL.wallFace, -.45); c.lineWidth = 1; c.beginPath();
          c.moveTo(x + 9, y + 3); c.lineTo(x + 14, y + 11); c.lineTo(x + 11, y + 17); c.moveTo(x + 14, y + 11); c.lineTo(x + 21, y + 14); c.stroke();
          c.fillStyle = 'rgba(255,240,200,.18)'; c.fillRect(x + 13, y + 10, 2, 2);
        }
        break;
      }
      case T.ROCK: {
        // Roca angulosa con caras iluminadas desde arriba a la izquierda
        const ox = x + 16 + Math.round((v - .5) * 4), oy = y + 22, r = 11 + Math.round(v * 3);
        c.fillStyle = 'rgba(0,0,0,.35)'; c.beginPath(); c.ellipse(ox + 2, oy + 6, r + 3, 4, 0, 0, Math.PI * 2); c.fill();
        const pts = [[-r, 2], [-r + 3, -r * .7], [-2, -r], [r * .7, -r * .75], [r, 0], [r * .6, 6], [-r * .5, 7]];
        c.fillStyle = PAL.rockOutline || '#0d0c0b'; c.beginPath(); pts.forEach(([px, py], i) => i ? c.lineTo(ox + px * 1.08, oy + py * 1.08) : c.moveTo(ox + px * 1.08, oy + py * 1.08)); c.closePath(); c.fill();
        c.fillStyle = PAL.rockDark; c.beginPath(); pts.forEach(([px, py], i) => i ? c.lineTo(ox + px, oy + py) : c.moveTo(ox + px, oy + py)); c.closePath(); c.fill();
        c.fillStyle = PAL.rock; c.beginPath(); c.moveTo(ox - r + 3, oy - r * .7); c.lineTo(ox - 2, oy - r); c.lineTo(ox + r * .7, oy - r * .75); c.lineTo(ox + 2, oy - 1); c.lineTo(ox - r + 1, oy); c.closePath(); c.fill();
        c.fillStyle = PAL.rockLight; c.beginPath(); c.moveTo(ox - r + 4, oy - r * .7); c.lineTo(ox - 2, oy - r + 1); c.lineTo(ox - 4, oy - r * .45); c.closePath(); c.fill();
        c.strokeStyle = shade(PAL.rockDark, -.35); c.lineWidth = 1; c.beginPath(); c.moveTo(ox + 2, oy - 1); c.lineTo(ox + 4, oy + 5); c.stroke();
        if (PAL.moss) { c.fillStyle = PAL.moss; c.fillRect(ox - 4, oy - r - 1, 7, 2); c.fillRect(ox - 6, oy - r + 1, 3, 2); c.fillStyle = shade(PAL.moss, .25); c.fillRect(ox - 3, oy - r - 1, 3, 1); }
        if (PAL.rockVein) { c.strokeStyle = PAL.rockVein; c.beginPath(); c.moveTo(ox - 5, oy - 2); c.lineTo(ox + 1, oy - 6); c.lineTo(ox + 6, oy - 4); c.stroke(); }
        break;
      }
      case T.TREE: {
        c.fillStyle = 'rgba(0,0,0,.4)'; c.beginPath(); c.ellipse(x + 17, y + 27, 15, 5, 0, 0, Math.PI * 2); c.fill();
        // raíces
        c.fillStyle = PAL.trunkDark; c.fillRect(x + 8, y + 25, 6, 3); c.fillRect(x + 19, y + 24, 7, 3); c.fillRect(x + 11, y + 26, 11, 3);
        c.fillStyle = '#0c0907'; c.fillRect(x + 11, y + 10, 11, 18);
        c.fillStyle = PAL.trunkDark; c.fillRect(x + 12, y + 10, 9, 17);
        c.fillStyle = PAL.trunk; c.fillRect(x + 12, y + 10, 5, 17);
        c.fillStyle = shade(PAL.trunk, .2); c.fillRect(x + 13, y + 12, 1, 12);
        c.fillStyle = PAL.trunkDark; c.fillRect(x + 15, y + 16, 1, 6);
        if (PAL.moss) { c.fillStyle = PAL.moss; c.fillRect(x + 12, y + 20, 3, 5); }
        break;
      }
      case T.CRYSTAL: {
        c.fillStyle = 'rgba(0,0,0,.4)'; c.beginPath(); c.ellipse(x + 16, y + 27, 13, 4, 0, 0, Math.PI * 2); c.fill();
        const prism = (px, py, w, h, lean) => {
          c.fillStyle = '#05070a'; c.beginPath(); c.moveTo(px - w - 1, py + 1); c.lineTo(px - w * .6 + lean - 1, py - h); c.lineTo(px + lean, py - h - 6); c.lineTo(px + w * .6 + lean + 1, py - h); c.lineTo(px + w + 1, py + 1); c.closePath(); c.fill();
          c.fillStyle = PAL.crystalDark; c.beginPath(); c.moveTo(px - w, py); c.lineTo(px - w * .6 + lean, py - h); c.lineTo(px + lean, py - h - 5); c.lineTo(px + w * .6 + lean, py - h); c.lineTo(px + w, py); c.closePath(); c.fill();
          c.fillStyle = PAL.crystal; c.beginPath(); c.moveTo(px - w * .5, py - 1); c.lineTo(px - w * .35 + lean, py - h); c.lineTo(px + lean, py - h - 4); c.lineTo(px + lean * .5, py - 1); c.closePath(); c.fill();
          c.fillStyle = PAL.crystalLight; c.fillRect(px - w * .25 + lean * .5, py - h * .75, 1, h * .5);
        };
        prism(x + 9 + v * 3, y + 27, 4, 11, -3); prism(x + 23, y + 28, 4, 9, 3); prism(x + 16, y + 29, 6, 18, 0);
        break;
      }
      case T.FLOWERS:
        if (PAL.flowerStyle === 'crystal') {
          for (let k = 0; k < 3; k++) {
            const fx = x + 5 + U.hash(tx, ty, 50 + k) * 22, fy = y + 10 + U.hash(tx, ty, 60 + k) * 16;
            c.fillStyle = '#0a0c12'; c.fillRect(fx - 2, fy + 1, 5, 2);
            c.fillStyle = PAL.crystalDark; c.beginPath(); c.moveTo(fx - 2, fy + 1); c.lineTo(fx, fy - 6); c.lineTo(fx + 2, fy + 1); c.closePath(); c.fill();
            c.fillStyle = PAL.flowers[(U.hash(tx, ty, 70 + k) * PAL.flowers.length) | 0]; c.fillRect(fx, fy - 4, 1, 4);
          }
        } else if (PAL.flowerStyle === 'ember') {
          c.fillStyle = shade(PAL.floor[0], -.3); c.beginPath(); c.ellipse(x + 16, y + 18, 7, 3, 0, 0, Math.PI * 2); c.fill();
          c.fillStyle = PAL.flowers[0]; c.fillRect(x + 13, y + 17, 6, 1); c.fillStyle = PAL.flowers[1]; c.fillRect(x + 15, y + 17, 2, 1);
          c.strokeStyle = PAL.flowers[0]; c.lineWidth = 1; c.globalAlpha = .8; c.beginPath();
          c.moveTo(x + 4, y + 10 + v * 10); c.lineTo(x + 11, y + 15); c.moveTo(x + 21, y + 19); c.lineTo(x + 28, y + 22 + v * 4); c.stroke(); c.globalAlpha = 1;
        } else {
          // Helechos y setas del sotobosque
          for (let k = 0; k < 2; k++) {
            const fx = x + 6 + U.hash(tx, ty, 50 + k) * 20, fy = y + 14 + U.hash(tx, ty, 60 + k) * 12;
            if (U.hash(tx, ty, 70 + k) > .55) {
              c.fillStyle = '#e6d8b8'; c.fillRect(fx, fy - 3, 1, 3);
              c.fillStyle = PAL.mushroom || '#8a3a2a'; c.fillRect(fx - 2, fy - 5, 5, 2); c.fillStyle = shade(PAL.mushroom || '#8a3a2a', .3); c.fillRect(fx - 1, fy - 5, 2, 1);
            } else {
              c.strokeStyle = PAL.fern || '#3d5a2a'; c.lineWidth = 1; c.beginPath();
              for (const d of [-1, 1]) { c.moveTo(fx, fy); c.quadraticCurveTo(fx + d * 4, fy - 6, fx + d * 8, fy - 5); }
              c.moveTo(fx, fy); c.lineTo(fx, fy - 8); c.stroke();
              c.fillStyle = shade(PAL.fern || '#3d5a2a', .2); for (let j = 1; j < 4; j++) { c.fillRect(fx - j * 2, fy - 3 - j, 1, 2); c.fillRect(fx + j * 2, fy - 3 - j, 1, 2); }
            }
          }
        }
        break;
      case T.TALLGRASS: TileArt.tallBlades(c, x, y, s, tx, ty, 1); break;
      case T.DOOR: {
        c.fillStyle = shade(PAL.wallFace, -.3); c.fillRect(x, y, s + 1, s + 1);
        c.fillStyle = '#3a2618'; c.fillRect(x + 2, y + 2, s - 4, s - 3);
        c.fillStyle = '#2a1a10'; for (let k = 0; k < 4; k++) c.fillRect(x + 2 + k * 7, y + 2, 1, s - 3);
        c.fillStyle = '#4a3020'; c.fillRect(x + 3, y + 3, 4, s - 5);
        c.fillStyle = '#2b2e33'; c.fillRect(x + 2, y + 8, s - 4, 3); c.fillRect(x + 2, y + 22, s - 4, 3);
        c.fillStyle = '#4a4e55'; c.fillRect(x + 2, y + 8, s - 4, 1); c.fillRect(x + 2, y + 22, s - 4, 1);
        c.fillStyle = '#9a7a38'; c.fillRect(x + 13, y + 13, 6, 7); c.fillStyle = '#140c04'; c.fillRect(x + 15, y + 15, 2, 3);
        break;
      }
      case T.STAIRS: {
        c.fillStyle = '#020202'; c.fillRect(x + 2, y + 2, s - 4, s - 4);
        for (let k = 0; k < 5; k++) { c.fillStyle = shade(PAL.wallTop, -.15 - k * .15); c.fillRect(x + 3 + k, y + 3 + k * 5, s - 6 - k * 2, 4); c.fillStyle = shade(PAL.wallTop, .05 - k * .12); c.fillRect(x + 3 + k, y + 3 + k * 5, s - 6 - k * 2, 1); }
        c.strokeStyle = shade(PAL.wallFace, -.4); c.lineWidth = 1; c.strokeRect(x + 1.5, y + 1.5, s - 3, s - 3);
        break;
      }
    }
  },
  /** Parte superior de los muros: follaje denso (bosque) o roca viva (cueva, volcán). */
  wallTop(c, x, y, w, h, tx, ty, deep) {
    const v = U.hash(tx, ty, 2);
    c.fillStyle = deep ? PAL.wallDeep : PAL.wallTop; c.fillRect(x, y, w + 1, h);
    if (PAL.wallStyle === 'foliage') {
      const cols = deep ? PAL.foliageDeep : [PAL.wallTopLine, shade(PAL.wallTop, .12), shade(PAL.wallTop, -.25)];
      for (let k = 0; k < (deep ? 3 : 7); k++) {
        const lx = x + Math.floor(U.hash(tx, ty, 400 + k) * (w - 6)), ly = y + Math.floor(U.hash(tx, ty, 410 + k) * Math.max(1, h - 5));
        c.fillStyle = cols[k % cols.length]; c.fillRect(lx, ly, 6, 4); c.fillRect(lx + 1, ly - 1, 4, 6);
      }
      if (!deep) { c.fillStyle = shade(PAL.wallTop, .3); for (let k = 0; k < 3; k++) c.fillRect(x + Math.floor(U.hash(tx, ty, 420 + k) * 28), y + Math.floor(U.hash(tx, ty, 430 + k) * Math.max(1, h - 2)), 2, 1); }
    } else {
      // Roca: bloques redondeados con aristas iluminadas
      const base = deep ? PAL.wallDeep : PAL.wallTop;
      c.save(); c.beginPath(); c.rect(x, y, w + 1, h); c.clip();
      for (let k = 0; k < (deep ? 2 : 4); k++) {
        const bx = x + U.hash(tx, ty, 800 + k) * w, by = y + U.hash(tx, ty, 810 + k) * h, r = 6 + U.hash(tx, ty, 820 + k) * 6;
        c.fillStyle = shade(base, deep ? .05 : -.18); c.beginPath(); c.ellipse(bx, by + 1, r, r * .7, 0, 0, Math.PI * 2); c.fill();
        if (!deep) { c.fillStyle = shade(base, .1); c.beginPath(); c.ellipse(bx - 1, by - 1, r * .8, r * .5, 0, 0, Math.PI * 2); c.fill(); c.fillStyle = PAL.wallTopLine; c.fillRect(bx - r * .5, by - r * .45, r * .6, 1); }
      }
      c.restore();
      if (!deep && PAL.wallVein && v > .6) { c.strokeStyle = PAL.wallVein; c.lineWidth = 1; c.beginPath(); c.moveTo(x + 4, y + h * .3); c.lineTo(x + 14, y + h * .55); c.lineTo(x + 26, y + h * .4); c.stroke(); }
    }
  },
  /** Cara frontal de los muros: mampostería con musgo, cristales o grietas incandescentes. */
  wallFace(c, x, y, w, h, tx, ty) {
    const v = U.hash(tx, ty, 2);
    c.fillStyle = PAL.wallFace; c.fillRect(x, y, w + 1, h);
    c.fillStyle = PAL.wallFaceLine;
    c.fillRect(x, y + 6, w, 1);
    const o = (tx % 2) * 8; for (let k = o; k < w; k += 16) c.fillRect(x + k, y, 1, 6); for (let k = 8 - o; k < w; k += 16) c.fillRect(x + k, y + 7, 1, h - 7);
    c.fillStyle = shade(PAL.wallFace, .14); c.fillRect(x, y, w, 1); c.fillRect(x, y + 7, w, 1);
    c.fillStyle = PAL.wallBase; c.fillRect(x, y + h - 2, w, 2);
    c.fillStyle = 'rgba(0,0,0,.4)'; c.fillRect(x, y + h, w, 5);
    if (PAL.vines && v > .4) {          // enredaderas colgando
      c.fillStyle = PAL.vines; const vx = x + 4 + Math.floor(v * 22);
      c.fillRect(vx, y - 2, 1, 6 + Math.floor(v * 8)); c.fillRect(vx + 3, y - 2, 1, 4); c.fillStyle = shade(PAL.vines, .25); c.fillRect(vx - 1, y + 3, 2, 1); c.fillRect(vx + 1, y + 6, 2, 1);
    }
    if (PAL.moss) { c.fillStyle = PAL.moss; for (let k = 0; k < w; k += 3) if (U.hash(tx * 16 + k, ty, 13) > .45) c.fillRect(x + k, y - 1, 3, 1 + Math.floor(U.hash(tx * 16 + k, ty, 14) * 3)); }
    if (PAL.wallVein && v < .4) { c.strokeStyle = PAL.wallVein; c.lineWidth = 1; c.beginPath(); c.moveTo(x + 6 + v * 10, y + 1); c.lineTo(x + 10 + v * 10, y + 6); c.lineTo(x + 8 + v * 10, y + h - 2); c.stroke(); }
  },
  tallBlades(c, x, y, s, tx, ty, alpha, yFrom = 0) {
    c.globalAlpha = alpha;
    for (let k = 0; k < 9; k++) {
      const bx = x + 2 + (k / 8) * (s - 4) + (U.hash(tx, ty, 80 + k) - .5) * 3;
      const bh = 10 + U.hash(tx, ty, 90 + k) * 9, by = y + s - 2;
      if (by - bh < y + yFrom) continue;
      c.strokeStyle = k % 3 === 0 ? PAL.tallLight : k % 2 ? PAL.tall : shade(PAL.tall, -.25); c.lineWidth = 1.5;
      c.beginPath(); c.moveTo(bx, by); c.quadraticCurveTo(bx + 1, by - bh * .6, bx + (k % 3 - 1) * 3, by - bh); c.stroke();
    }
    c.globalAlpha = 1;
  },
  /** Copas de los árboles en capas, con sombra interior y borde oscuro (se dibujan por encima de las criaturas). */
  canopy(c, tx, ty, alpha, time = 0) {
    const s = CONFIG.TILE, v = U.hash(tx, ty, 4), x = tx * s + 16 + Math.round((v - .5) * 3), y = ty * s + 2, sway = Math.sin(time * .8 + v * 6) * .8;
    c.globalAlpha = alpha;
    const cl = PAL.canopy, blobs = [[0, 4, 19, 15], [-9, 0, 10, 9], [9, -1, 11, 10], [1, -8, 12, 9]];
    c.fillStyle = '#060805'; for (const [bx, by, rx, ry] of blobs) { c.beginPath(); c.ellipse(x + bx + sway, y + by, rx + 1, ry + 1, 0, 0, Math.PI * 2); c.fill(); }
    blobs.forEach(([bx, by, rx, ry], i) => { c.fillStyle = cl[(i + (v * 3 | 0)) % cl.length]; c.beginPath(); c.ellipse(x + bx + sway, y + by, rx, ry, 0, 0, Math.PI * 2); c.fill(); });
    c.fillStyle = PAL.canopyMid; c.beginPath(); c.ellipse(x - 3 + sway, y - 3, 10, 7, 0, 0, Math.PI * 2); c.fill();
    c.fillStyle = PAL.canopyLight; for (let k = 0; k < 6; k++) c.fillRect(Math.round(x - 12 + U.hash(tx, ty, 500 + k) * 16 + sway), Math.round(y - 9 + U.hash(tx, ty, 510 + k) * 9), 2, 1);
    c.fillStyle = 'rgba(0,0,0,.28)'; c.beginPath(); c.ellipse(x + 4 + sway, y + 9, 15, 6, 0, 0, Math.PI * 2); c.fill();
    c.globalAlpha = 1;
  },
};

/** Caché de trozos del suelo pre-pintados a la resolución actual de pantalla. */
class ChunkCache {
  constructor(world) { this.world = world; this.map = new Map(); this.scale = 1; }
  setScale(s) { if (Math.abs(s - this.scale) > 1e-3) { this.scale = s; this.map.clear(); } }
  invalidateAll() { this.map.clear(); }
  /** Repinta solo los trozos afectados por un cambio de casilla (puertas, pasajes secretos). */
  invalidateTile(tx, ty) {
    const N = CONFIG.CHUNK;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) this.map.delete(Math.floor((tx + dx) / N) + ',' + Math.floor((ty + dy) / N));
  }
  get(cx, cy) {
    const key = cx + ',' + cy;
    let cv = this.map.get(key);
    if (cv) { this.map.delete(key); this.map.set(key, cv); return cv; } // LRU
    cv = this.paint(cx, cy);
    this.map.set(key, cv);
    if (this.map.size > CONFIG.CHUNK_CACHE) this.map.delete(this.map.keys().next().value);
    return cv;
  }
  paint(cx, cy) {
    const N = CONFIG.CHUNK, s = CONFIG.TILE, size = N * s, k = this.scale;
    const cv = document.createElement('canvas');
    cv.width = Math.ceil(size * k) + 2; cv.height = Math.ceil(size * k) + 2; // +2: solape para evitar costuras
    const c = cv.getContext('2d');
    c.setTransform(k, 0, 0, k, -cx * size * k, -cy * size * k);
    c.beginPath(); c.rect(cx * size, cy * size, size + 2 / k, size + 2 / k); c.clip();
    const tx0 = cx * N - 1, ty0 = cy * N - 1, tx1 = tx0 + N + 1, ty1 = ty0 + N + 1;
    for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) if (this.world.inBounds(tx, ty)) TileArt.ground(c, this.world, tx, ty);
    for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) if (this.world.inBounds(tx, ty)) TileArt.object(c, this.world, tx, ty);
    return cv;
  }
}

/* ---------- 6. Camera ---------- */
class Camera {
  constructor() { this.x = 0; this.y = 0; this.zoom = 2; this.vw = 800; this.vh = 600; }
  get halfW() { return this.vw / 2 / this.zoom; }
  get halfH() { return this.vh / 2 / this.zoom; }
  get left() { return this.x - this.halfW; }
  get top() { return this.y - this.halfH; }
  clampTo(world) {
    const hw = this.halfW, hh = this.halfH;
    this.x = world.pxW <= hw * 2 ? world.pxW / 2 : U.clamp(this.x, hw, world.pxW - hw);
    this.y = world.pxH <= hh * 2 ? world.pxH / 2 : U.clamp(this.y, hh, world.pxH - hh);
  }
  snap(x, y, world) { this.x = x; this.y = y; this.clampTo(world); }
  follow(tx, ty, dt, world, stiffness = 7) {
    const k = 1 - Math.exp(-dt * stiffness);
    this.x += (tx - this.x) * k; this.y += (ty - this.y) * k;
    this.clampTo(world);
  }
}

/* ---------- 7. Particles ---------- */
class Particles {
  constructor() { this.list = []; }
  add(p) { if (this.list.length < 400) this.list.push(Object.assign({ vx: 0, vy: 0, life: .6, age: 0, size: 2, color: '#fff', grav: 0, glow: false }, p)); }
  update(dt) {
    for (const p of this.list) { p.age += dt; p.vy += p.grav * dt; p.x += p.vx * dt; p.y += p.vy * dt; }
    this.list = this.list.filter(p => p.age < p.life);
  }
  draw(c) {
    for (const pass of [false, true]) {          // primero humo y polvo, después el brillo aditivo
      c.globalCompositeOperation = pass ? 'lighter' : 'source-over';
      for (const p of this.list) {
        if (!!p.glow !== pass) continue;
        const a = 1 - p.age / p.life;
        c.globalAlpha = a * (p.smoke ? .35 : 1); c.fillStyle = p.color;
        if (p.streak) {        // chispa estirada en la dirección del movimiento (estela de impacto)
          const k = p.streak * a; c.strokeStyle = p.color; c.lineWidth = p.size * (.4 + .6 * a); c.lineCap = 'round';
          c.beginPath(); c.moveTo(p.x - p.vx * k, p.y - p.vy * k); c.lineTo(p.x, p.y); c.stroke(); c.lineCap = 'butt';
          continue;
        }
        const sz = Math.max(1, Math.round(p.size * (p.smoke ? 1 + (1 - a) * 2 : p.glow ? (0.5 + a * 0.5) : 1)));
        if (p.glow && sz >= 2) { c.globalAlpha = a * .22; c.fillRect(p.x - sz * 1.5, p.y - sz * 1.5, sz * 3, sz * 3); c.globalAlpha = a; }
        c.fillRect(Math.round(p.x - sz / 2), Math.round(p.y - sz / 2), sz, sz);
      }
    }
    c.globalAlpha = 1; c.globalCompositeOperation = 'source-over';
  }
}

/* ---------- 8. Species ----------
   Criaturas originales provisionales. Para añadir una nueva: un objeto con
   datos, una función draw(c, st) que dibuja con los pies en (0,0) y un emisor
   opcional de partículas. El resto del juego no necesita cambios. */
const SPECIES = [
  {
    id: 'voltrino', name: 'Voltrino', type: 'Eléctrico', color: '#f5cf3a',
    typeId: 'electrico', base: { hp: 35, atk: 45, def: 35, spa: 65, spd: 45, spe: 85 },
    basic: 'chispa', moves: ['saeta', 'embestida', 'campo', 'rayo'],
    learn: [['saeta', 1], ['embestida', 7], ['campo', 10], ['rayo', 14], ['cadena', 17], ['sobrecarga', 20]],
    desc: 'Rápido y frágil. Ataca a distancia y controla zonas con electricidad.',
    draw(c, st) {
      const b = st.bob, back = st.fy < -0.55, ex = st.fx * 3.2, ey = U.clamp(st.fy, -1, 1) * 1.5;
      const step = st.moving ? Math.sin(st.t * 16) * 2.2 : 0;
      U.ellipse(c, -5, -2 - Math.max(0, step), 4, 2.6, '#1d3566');
      U.ellipse(c, 5, -2 - Math.max(0, -step), 4, 2.6, '#1d3566');
      const antenna = () => {
        const ax = st.fx * 2, top = -36 - b;
        c.strokeStyle = '#1d3566'; c.lineWidth = 1.6; c.beginPath(); c.moveTo(0, -23 - b);
        for (let i = 1; i <= 12; i++) { const k = i / 12; c.lineTo(ax * k + Math.sin(k * Math.PI * 4 + st.t * 6) * 2.4, -23 - b + (top + 23 + b) * k); }
        c.stroke();
        const glow = .55 + .45 * Math.sin(st.t * (st.moving ? 14 : 4));
        U.ellipse(c, ax, top, 6 * glow + 2, 6 * glow + 2, 'rgba(255,225,77,.25)');
        U.ellipse(c, ax, top, 3.2, 3.2, '#ffe14d');
        U.ellipse(c, ax - 1, top - 1, 1.1, 1.1, '#fffbe0');
      };
      if (!back) antenna();
      U.ellipse(c, 0, -13 - b, 11.5, 11, '#1d3566');
      U.ellipse(c, 0, -13.6 - b, 11, 10.4, '#3f7fdc');
      U.ellipse(c, -3.5, -18 - b, 4, 2.6, '#6fa3ee');
      if (back) {
        c.fillStyle = '#ffe14d'; c.beginPath(); c.moveTo(-5, -17 - b); c.lineTo(5, -17 - b); c.lineTo(0, -8 - b); c.closePath(); c.fill();
        antenna();
      } else {
        U.ellipse(c, ex * .7, -9 - b, 7, 5.5, '#d4e8ff');
        for (const sx of [-4, 4]) {
          U.ellipse(c, sx + ex, -15 - b + ey, 1.9, 2.7, '#0f1a33');
          U.ellipse(c, sx + ex + .6, -16 - b + ey, .7, .8, '#ffffff');
        }
      }
      U.ellipse(c, -10.5 + (st.moving ? step * .4 : 0), -11 - b, 2.6, 2, '#2c5fb0');
      U.ellipse(c, 10.5 - (st.moving ? step * .4 : 0), -11 - b, 2.6, 2, '#2c5fb0');
    },
    emit(p, fx, dt) {
      if (Math.random() < (p.moving ? 22 : 4) * dt) {
        const K = CONFIG.CREATURE_SCALE;
        fx.add({ x: p.x + (p.facing.x * 2 + (Math.random() - .5) * 6) * K, y: p.y - (36 + p.bob) * K, vx: (Math.random() - .5) * 60, vy: (Math.random() - .7) * 50, life: .25 + Math.random() * .2, size: 2, color: Math.random() < .5 ? '#ffe14d' : '#fffbe0', glow: true });
      }
    },
  },
  {
    id: 'magmolo', name: 'Magmolo', type: 'Fuego', color: '#ff7a2f',
    typeId: 'fuego', base: { hp: 46, atk: 55, def: 55, spa: 60, spd: 45, spe: 45 },
    basic: 'zarpazo', moves: ['brasas', 'magma', 'caparazon', 'erupcion'],
    learn: [['brasas', 1], ['magma', 7], ['caparazon', 10], ['erupcion', 14], ['rodada', 17], ['ceniza', 20]],
    desc: 'Lento y muy resistente. Quema en área y aguanta golpes con su caparazón.',
    draw(c, st) {
      const b = st.bob * .6, back = st.fy < -0.55, ex = st.fx * 3, ey = U.clamp(st.fy, -1, 1) * 1.4;
      const step = st.moving ? Math.sin(st.t * 12) * 1.8 : 0;
      for (const [lx, ph] of [[-9, 1], [-3, -1], [3, 1], [9, -1]]) U.ellipse(c, lx, -2 - Math.max(0, step * ph), 3.4, 2.4, '#2a2120');
      U.ellipse(c, 0, -11 - b, 15, 11, '#2a2120');
      U.ellipse(c, 0, -11.5 - b, 14, 10.2, '#4d3d3a');
      const pulse = .55 + .45 * Math.sin(st.t * 3.5);
      c.strokeStyle = `rgba(255,${110 + pulse * 60 | 0},30,${.55 + pulse * .45})`; c.lineWidth = 1.8;
      for (const k of [.42, .72]) { c.beginPath(); c.ellipse(0, -11.5 - b, 14 * k, 10.2 * k, 0, Math.PI * 1.05, Math.PI * 1.95); c.stroke(); }
      c.beginPath(); c.moveTo(0, -21.5 - b); c.lineTo(0, -15 - b); c.stroke();
      U.ellipse(c, -5, -17 - b, 3.5, 1.8, '#6a5752');
      if (!back) {
        U.ellipse(c, ex * .4, -5.5 - b, 9.5, 4.2, '#dba46a');
        const snx = st.fx * 9, sny = -9 - b + ey * 1.4;
        U.ellipse(c, snx, sny, 5, 3.8, '#5f4c48');
        U.ellipse(c, snx + st.fx * 3, sny - .5, 1.6, 1.2, '#ff8a3d');
        for (const sx of [-4.5, 4.5]) {
          U.ellipse(c, sx + ex, -14 - b + ey, 2, 2, '#1a1110');
          U.ellipse(c, sx + ex, -14 - b + ey, 1.2, 1.2, `rgba(255,${150 + pulse * 70 | 0},40,1)`);
        }
      }
    },
    emit(p, fx, dt) {
      if (Math.random() < 9 * dt) {
        const K = CONFIG.CREATURE_SCALE;
        fx.add({ x: p.x + (Math.random() - .5) * 18 * K, y: p.y - (18 + p.bob) * K, vx: (Math.random() - .5) * 12, vy: -25 - Math.random() * 20, life: .7 + Math.random() * .5, size: 2, color: Math.random() < .6 ? '#ff8a3d' : '#ffd166', glow: true });
      }
    },
  },
  {
    id: 'aurin', name: 'Aurín', type: 'Lucha', color: '#7fe3e8',
    typeId: 'lucha', base: { hp: 42, atk: 70, def: 42, spa: 45, spd: 42, spe: 62 },
    basic: 'punos', moves: ['pasoveloz', 'esfera', 'contragolpe', 'onda'],
    learn: [['pasoveloz', 1], ['esfera', 7], ['contragolpe', 10], ['onda', 14], ['giratoria', 17], ['concentracion', 20]],
    desc: 'Equilibrado. Combos cuerpo a cuerpo, acometidas y aura que no falla.',
    draw(c, st) {
      const b = st.bob, back = st.fy < -0.55, ex = st.fx * 2.6, ey = U.clamp(st.fy, -1, 1) * 1.2;
      const step = st.moving ? Math.sin(st.t * 15) * 2.4 : 0;
      const orbs = [0, 1].map(i => { const a = st.t * 3 + i * Math.PI; return { x: Math.cos(a) * 16, y: -15 - b + Math.sin(a) * 5, front: Math.sin(a) > 0 }; });
      const orb = o => { U.ellipse(c, o.x, o.y, 5, 5, 'rgba(127,227,232,.25)'); U.ellipse(c, o.x, o.y, 2.6, 2.6, '#bff6f8'); };
      // Bufanda: ondea en sentido contrario a la marcha.
      const tdx = st.moving ? -st.vx : 0.45, tdy = st.moving ? -st.vy : 0.25, tl = Math.hypot(tdx, tdy) || 1;
      const dx = tdx / tl, dy = tdy / tl;
      const scarf = () => {
        c.strokeStyle = '#e0473c'; c.lineWidth = 3; c.lineCap = 'round';
        for (const off of [0, 1]) {
          c.beginPath(); c.moveTo(0, -15 - b);
          for (let i = 1; i <= 6; i++) { const k = i / 6, w = Math.sin(st.t * 10 - i + off * 1.7) * 2.2 * k; c.lineTo(dx * 15 * k + -dy * w + off * 2, -15 - b + dy * 10 * k + dx * w + off); }
          c.stroke();
        }
        c.lineCap = 'butt';
      };
      const scarfInFront = dy > 0.35;
      orbs.filter(o => !o.front).forEach(orb);
      if (!scarfInFront) scarf();
      U.ellipse(c, -4, -2 - Math.max(0, step), 3.2, 2.4, '#4a3d78');
      U.ellipse(c, 4, -2 - Math.max(0, -step), 3.2, 2.4, '#4a3d78');
      U.ellipse(c, 0, -9.5 - b, 7.5, 7, '#4a3d78');
      U.ellipse(c, 0, -10 - b, 7, 6.5, '#8b79c9');
      U.ellipse(c, -8 - step * .5, -10 - b, 2.8, 2.8, '#f1ecff');
      U.ellipse(c, 8 + step * .5, -10 - b, 2.8, 2.8, '#f1ecff');
      U.ellipse(c, 0, -21 - b, 9.5, 9, '#4a3d78');
      U.ellipse(c, 0, -21.5 - b, 9, 8.5, '#8b79c9');
      c.strokeStyle = '#3f8f52'; c.lineWidth = 1.6; c.beginPath(); c.moveTo(0, -29 - b); c.quadraticCurveTo(1, -34 - b, 5, -35 - b); c.stroke();
      U.ellipse(c, 5.5, -35.5 - b, 3, 1.7, '#5cbf6c');
      if (!back) {
        U.ellipse(c, ex, -20.5 - b + ey * .6, 6.6, 5.2, '#f1ecff');
        for (const sx of [-2.8, 2.8]) U.ellipse(c, sx + ex, -20.5 - b + ey, 1.3, 2.3, '#211a3d');
        c.strokeStyle = '#211a3d'; c.lineWidth = 1.2; c.beginPath();
        c.moveTo(-4.6 + ex, -24.6 - b + ey); c.lineTo(-1.2 + ex, -23.6 - b + ey); c.moveTo(4.6 + ex, -24.6 - b + ey); c.lineTo(1.2 + ex, -23.6 - b + ey); c.stroke();
      } else {
        U.ellipse(c, 0, -22 - b, 5, 3, '#7564b4');
      }
      if (scarfInFront) scarf();
      orbs.filter(o => o.front).forEach(orb);
    },
    emit(p, fx, dt) {
      if (p.moving && Math.random() < 16 * dt) {
        const a = p.anim * 3 + (Math.random() < .5 ? 0 : Math.PI);
        const K = CONFIG.CREATURE_SCALE;
        fx.add({ x: p.x + Math.cos(a) * 16 * K, y: p.y + (-15 - p.bob + Math.sin(a) * 5) * K, vx: -p.vx * .2, vy: -p.vy * .2 - 10, life: .35, size: 2, color: '#bff6f8', glow: true });
      }
    },
  },
];
const MAX_STATS = { hp: 110, atk: 110, def: 110, spa: 110, spd: 110, spe: 110 };

/** Dibuja una criatura con sombra y anillo indicador. st: {t,moving,fx,fy,vx,vy,bob}. */
/** Pinta una criatura en un lienzo auxiliar y le aplica un tinte sobre la silueta (más barato que ctx.filter). */
const Tint = {
  cv: null, o: null,
  draw(c, x, y, size, alpha, color, fn) {
    const m = c.getTransform(), sc = m.a, px = m.a * x + m.c * y + m.e, py = m.b * x + m.d * y + m.f;
    const W = Math.ceil(size * 2 * Math.abs(sc)) + 4, H = W;
    if (!this.cv) { this.cv = document.createElement('canvas'); this.o = this.cv.getContext('2d'); }
    if (this.cv.width < W || this.cv.height < H) { this.cv.width = Math.max(W, this.cv.width); this.cv.height = Math.max(H, this.cv.height); }
    const o = this.o; o.setTransform(1, 0, 0, 1, 0, 0); o.globalCompositeOperation = 'source-over'; o.globalAlpha = 1; o.clearRect(0, 0, W, H);
    o.setTransform(m.a, m.b, m.c, m.d, W / 2, H * .75); fn(o);
    o.setTransform(1, 0, 0, 1, 0, 0); o.globalCompositeOperation = 'source-atop'; o.globalAlpha = alpha; o.fillStyle = color; o.fillRect(0, 0, W, H);
    o.globalAlpha = 1; o.globalCompositeOperation = 'source-over';
    c.save(); c.setTransform(1, 0, 0, 1, 0, 0); c.drawImage(this.cv, 0, 0, W, H, Math.round(px - W / 2), Math.round(py - H * .75), W, H); c.restore();
  },
};
function drawCreature(c, sp, x, y, st, ring = true, scale = 1) {
  c.save(); c.translate(x, y); c.scale(scale, scale);
  if (!sp.rig) { c.fillStyle = 'rgba(0,0,0,.42)'; c.beginPath(); c.ellipse(1, 0, 14, 4, 0, 0, Math.PI * 2); c.fill(); }   // las del rig proyectan su propia sombra
  if (ring) {
    c.strokeStyle = sp.color; c.globalAlpha = .28 + .08 * Math.sin(st.t * 3); c.lineWidth = 1;
    c.beginPath(); c.ellipse(0, 0, 15, 5.5, 0, 0, Math.PI * 2); c.stroke();
    c.globalAlpha = 1;
  }
  if (!sp.rig) { const flip = st.flip || (st.fx < -.15 ? -1 : 1); c.scale(flip, 1); }   // las del rig giran en 3D
  sp.draw(c, st);
  c.restore();
}


/* --- Formas evolucionadas (originales) --- */
const EVOLVED = [
  {
    id: 'voltaurio', name: 'Voltaurio', type: 'Eléctrico', typeId: 'electrico', color: '#ffd84a', preEvo: 'voltrino',
    base: { hp: 55, atk: 62, def: 50, spa: 95, spd: 65, spe: 105 },
    basic: 'chispa', moves: ['saeta', 'embestida', 'campo', 'rayo'],
    learn: [['saeta', 1], ['embestida', 7], ['campo', 10], ['rayo', 14], ['cadena', 17], ['sobrecarga', 20]], ultimate: 'tormenta',
    desc: 'Dos antenas en espiral y una franja en zigzag que chisporrotea al correr.',
    draw(c, st) {
      const b = st.bob, back = st.fy < -.55, ex = st.fx * 3.6, ey = U.clamp(st.fy, -1, 1) * 1.6, step = st.moving ? Math.sin(st.t * 16) * 2.4 : 0;
      U.ellipse(c, -6, -2 - Math.max(0, step), 4.6, 3, '#142a55'); U.ellipse(c, 6, -2 - Math.max(0, -step), 4.6, 3, '#142a55');
      const antennas = () => {
        for (const side of [-1, 1]) {
          const bx = side * 5, top = -46 - b;
          c.strokeStyle = '#142a55'; c.lineWidth = 1.8; c.beginPath(); c.moveTo(bx, -28 - b);
          for (let i = 1; i <= 10; i++) { const k = i / 10; c.lineTo(bx + side * k * 7 + Math.sin(k * Math.PI * 4 + st.t * 6 + side) * 2.2, -28 - b + (top + 28 + b) * k); }
          c.stroke();
          const glow = .55 + .45 * Math.sin(st.t * (st.moving ? 14 : 4) + side);
          U.ellipse(c, bx + side * 7, top, 6 * glow + 2, 6 * glow + 2, 'rgba(255,225,77,.25)'); U.ellipse(c, bx + side * 7, top, 3.4, 3.4, '#ffe14d');
        }
      };
      if (!back) antennas();
      // cola en forma de rayo, detrás del cuerpo
      c.fillStyle = '#ffe14d'; c.beginPath(); const tx = -st.fx * 14;
      c.moveTo(tx * .4, -12 - b); c.lineTo(tx - 6, -24 - b); c.lineTo(tx + 2, -22 - b); c.lineTo(tx - 4, -34 - b); c.lineTo(tx + 8, -20 - b); c.lineTo(tx, -22 - b); c.lineTo(tx * .4 + 4, -10 - b); c.closePath(); c.fill();
      U.ellipse(c, 0, -16 - b, 14.5, 13.5, '#142a55'); U.ellipse(c, 0, -16.6 - b, 13.8, 12.8, '#3466c9');
      U.ellipse(c, -4, -22 - b, 5, 3, '#6fa3ee');
      c.strokeStyle = '#ffe14d'; c.lineWidth = 2.4; c.beginPath(); c.moveTo(-13, -13 - b); c.lineTo(-7, -9 - b); c.lineTo(-2, -14 - b); c.lineTo(3, -9 - b); c.lineTo(8, -14 - b); c.lineTo(13, -11 - b); c.stroke();
      c.fillStyle = '#ffe14d'; for (const sx of [-5, 0, 5]) { c.beginPath(); c.moveTo(sx - 2.5, -28 - b); c.lineTo(sx, -34 - b - (sx ? 0 : 3)); c.lineTo(sx + 2.5, -28 - b); c.fill(); }
      if (back) antennas();
      else {
        U.ellipse(c, ex * .7, -8 - b, 8, 4.5, '#d4e8ff');
        for (const sx of [-5, 5]) { U.ellipse(c, sx + ex, -19 - b + ey, 2.2, 2.4, '#0f1a33'); U.ellipse(c, sx + ex + .6, -20 - b + ey, .8, .8, '#ffffff'); }
        c.strokeStyle = '#0f1a33'; c.lineWidth = 1.3; c.beginPath(); c.moveTo(-8 + ex, -23.5 - b + ey); c.lineTo(-3 + ex, -22 - b + ey); c.moveTo(8 + ex, -23.5 - b + ey); c.lineTo(3 + ex, -22 - b + ey); c.stroke();
      }
      U.ellipse(c, -14 + (st.moving ? step * .4 : 0), -14 - b, 3.4, 2.6, '#2c5fb0'); U.ellipse(c, 14 - (st.moving ? step * .4 : 0), -14 - b, 3.4, 2.6, '#2c5fb0');
    },
    emit(p, fx, dt) {
      if (Math.random() < (p.moving ? 30 : 6) * dt) { const K = CONFIG.CREATURE_SCALE, s = Math.random() < .5 ? -1 : 1; fx.add({ x: p.x + s * 12 * K, y: p.y - (46 + p.bob) * K, vx: (Math.random() - .5) * 60, vy: (Math.random() - .7) * 50, life: .3, size: 2, color: '#ffe14d', glow: true }); }
    },
  },
  {
    id: 'magmoloso', name: 'Magmoloso', type: 'Fuego', typeId: 'fuego', color: '#ff6a1a', preEvo: 'magmolo',
    base: { hp: 72, atk: 80, def: 85, spa: 82, spd: 62, spe: 55 },
    basic: 'zarpazo', moves: ['brasas', 'magma', 'caparazon', 'erupcion'],
    learn: [['brasas', 1], ['magma', 7], ['caparazon', 10], ['erupcion', 14], ['rodada', 17], ['ceniza', 20]], ultimate: 'columna',
    desc: 'Un caparazón de basalto con dos chimeneas que escupen llamas.',
    draw(c, st) {
      const b = st.bob * .6, back = st.fy < -.55, ex = st.fx * 3.6, ey = U.clamp(st.fy, -1, 1) * 1.5, step = st.moving ? Math.sin(st.t * 12) * 2 : 0;
      for (const [lx, ph] of [[-12, 1], [-4, -1], [4, 1], [12, -1]]) U.ellipse(c, lx, -2 - Math.max(0, step * ph), 4.2, 3, '#1f1716');
      const pulse = .55 + .45 * Math.sin(st.t * 3.5);
      for (const vx of [-8, 8]) { // chimeneas volcánicas
        c.fillStyle = '#2a201e'; c.beginPath(); c.moveTo(vx - 6, -22 - b); c.lineTo(vx - 3, -33 - b); c.lineTo(vx + 3, -33 - b); c.lineTo(vx + 6, -22 - b); c.fill();
        const f = 1 + Math.sin(st.t * 14 + vx) * .2;
        U.ellipse(c, vx, -36 - b, 3.5, 5 * f, '#ff8a3d'); U.ellipse(c, vx, -35 - b, 2, 3 * f, '#ffe08a');
      }
      U.ellipse(c, 0, -14 - b, 19, 13.5, '#1f1716'); U.ellipse(c, 0, -14.6 - b, 18, 12.6, '#433331');
      c.strokeStyle = `rgba(255,${110 + pulse * 60 | 0},30,${.6 + pulse * .4})`; c.lineWidth = 2;
      for (const k of [.38, .62, .85]) { c.beginPath(); c.ellipse(0, -14.6 - b, 18 * k, 12.6 * k, 0, Math.PI * 1.05, Math.PI * 1.95); c.stroke(); }
      if (!back) {
        U.ellipse(c, ex * .4, -6 - b, 12, 5, '#dba46a');
        const snx = st.fx * 12, sny = -11 - b + ey * 1.4;
        U.ellipse(c, snx, sny, 6.5, 4.6, '#54423e');
        c.fillStyle = '#e8d8c0'; c.beginPath(); c.moveTo(snx + st.fx * 4 - 2, sny - 3); c.lineTo(snx + st.fx * 7, sny - 10); c.lineTo(snx + st.fx * 4 + 2, sny - 3); c.fill();
        for (const sx of [-5.5, 5.5]) { U.ellipse(c, sx + ex, -18 - b + ey, 2.3, 2.1, '#1a1110'); U.ellipse(c, sx + ex, -18 - b + ey, 1.4, 1.3, `rgba(255,${150 + pulse * 70 | 0},40,1)`); }
      }
    },
    emit(p, fx, dt) {
      if (Math.random() < 16 * dt) { const K = CONFIG.CREATURE_SCALE, s = Math.random() < .5 ? -8 : 8; fx.add({ x: p.x + s * K, y: p.y - (38 + p.bob) * K, vx: (Math.random() - .5) * 14, vy: -35 - Math.random() * 25, life: .8, size: 2.5, color: Math.random() < .6 ? '#ff8a3d' : '#ffd166', glow: true }); }
    },
  },
  {
    id: 'aurion', name: 'Aurión', type: 'Lucha', typeId: 'lucha', color: '#5fd8e0', preEvo: 'aurin',
    base: { hp: 65, atk: 102, def: 64, spa: 72, spd: 62, spe: 88 },
    basic: 'punos', moves: ['pasoveloz', 'esfera', 'contragolpe', 'onda'],
    learn: [['pasoveloz', 1], ['esfera', 7], ['contragolpe', 10], ['onda', 14], ['giratoria', 17], ['concentracion', 20]], ultimate: 'punoAural',
    desc: 'Una llama de aura corona su cabeza; tres orbes lo protegen.',
    draw(c, st) {
      const b = st.bob, back = st.fy < -.55, ex = st.fx * 2.8, ey = U.clamp(st.fy, -1, 1) * 1.3, step = st.moving ? Math.sin(st.t * 15) * 2.6 : 0;
      const orbs = [0, 1, 2].map(i => { const a = st.t * 2.6 + i * Math.PI * 2 / 3; return { x: Math.cos(a) * 20, y: -18 - b + Math.sin(a) * 6, front: Math.sin(a) > 0 }; });
      const orb = o => { U.ellipse(c, o.x, o.y, 5.5, 5.5, 'rgba(127,227,232,.25)'); U.ellipse(c, o.x, o.y, 2.8, 2.8, '#bff6f8'); };
      const tdx = st.moving ? -st.vx : .45, tdy = st.moving ? -st.vy : .25, tl = Math.hypot(tdx, tdy) || 1, dx = tdx / tl, dy = tdy / tl;
      const scarf = () => { c.strokeStyle = '#d0392f'; c.lineWidth = 3.4; c.lineCap = 'round'; for (const off of [0, 1, 2]) { c.beginPath(); c.moveTo(0, -20 - b); for (let i = 1; i <= 7; i++) { const k = i / 7, w = Math.sin(st.t * 10 - i + off * 1.7) * 2.6 * k; c.lineTo(dx * 21 * k + -dy * w + off * 2, -20 - b + dy * 13 * k + dx * w + off); } c.stroke(); } c.lineCap = 'butt'; };
      const front = dy > .35;
      orbs.filter(o => !o.front).forEach(orb); if (!front) scarf();
      U.ellipse(c, -5, -2 - Math.max(0, step), 3.6, 2.6, '#33285e'); U.ellipse(c, 5, -2 - Math.max(0, -step), 3.6, 2.6, '#33285e');
      c.fillStyle = '#33285e'; c.fillRect(-6, -12 - b, 4, 10); c.fillRect(2, -12 - b, 4, 10);
      U.ellipse(c, 0, -15 - b, 9, 8, '#33285e'); U.ellipse(c, 0, -15.5 - b, 8.4, 7.4, '#6f5cb8');
      U.ellipse(c, -9, -19 - b, 4, 3, '#4a3d78'); U.ellipse(c, 9, -19 - b, 4, 3, '#4a3d78'); // hombreras
      U.ellipse(c, -11 - step * .5, -13 - b, 3.2, 3.2, '#f1ecff'); U.ellipse(c, 11 + step * .5, -13 - b, 3.2, 3.2, '#f1ecff');
      U.ellipse(c, 0, -29 - b, 10.5, 10, '#33285e'); U.ellipse(c, 0, -29.5 - b, 10, 9.4, '#6f5cb8');
      const fl = 1 + Math.sin(st.t * 10) * .12; // llama de aura
      c.fillStyle = 'rgba(127,227,232,.85)'; c.beginPath(); c.moveTo(-5, -37 - b); c.quadraticCurveTo(-2, -50 * fl - b, 3, -55 * fl - b); c.quadraticCurveTo(2, -46 - b, 6, -37 - b); c.closePath(); c.fill();
      if (!back) {
        U.ellipse(c, ex, -28.5 - b + ey * .6, 7.4, 5.8, '#f1ecff');
        for (const sx of [-3.1, 3.1]) U.ellipse(c, sx + ex, -28.5 - b + ey, 1.4, 2.5, '#211a3d');
        c.strokeStyle = '#211a3d'; c.lineWidth = 1.3; c.beginPath(); c.moveTo(-5.4 + ex, -33 - b + ey); c.lineTo(-1.3 + ex, -31.6 - b + ey); c.moveTo(5.4 + ex, -33 - b + ey); c.lineTo(1.3 + ex, -31.6 - b + ey); c.stroke();
      }
      if (front) scarf(); orbs.filter(o => o.front).forEach(orb);
    },
    emit(p, fx, dt) {
      if (Math.random() < (p.moving ? 20 : 6) * dt) { const K = CONFIG.CREATURE_SCALE; fx.add({ x: p.x + (Math.random() - .5) * 10 * K, y: p.y - (52 + p.bob) * K, vx: (Math.random() - .5) * 20, vy: -30, life: .4, size: 2, color: '#bff6f8', glow: true }); }
    },
  },
];
const FORMS = {};
[...SPECIES, ...EVOLVED].forEach(f => FORMS[f.id] = f);

/* --- Progresión: nivel, experiencia, movimientos conocidos y evoluciones --- */
const Progress = {
  /** Huecos de movimiento: 1 al empezar y otro a los niveles 7, 10 y 14. El definitivo (tecla G) llega al evolucionar. */
  SLOT_LEVELS: [1, 7, 10, 14],
  slots(level) { return this.SLOT_LEVELS.filter(l => l <= level).length; },
  nextSlotLevel(level) { return this.SLOT_LEVELS.find(l => l > level) || null; },
  fresh(formId, level = 5) {
    const f = FORMS[formId], known = f.learn.filter(([, l]) => l <= level).map(([m]) => m);
    return { level, exp: 0, known, equipped: known.slice(0, this.slots(level)), evolutions: [] };
  },
  /** Movimientos nuevos al llegar a `level` (o al evolucionar, todos los pendientes hasta ese nivel). */
  learn(prog, form, level) {
    const learned = [];
    for (const [m, l] of form.learn) if (l <= level && !prog.known.includes(m)) { prog.known.push(m); learned.push(m); if (prog.equipped.length < this.slots(level)) prog.equipped.push(m); }
    return learned;
  },
  /** ¿Puede evolucionar? Solo si la forma tiene evolución y se cumplen todos sus requisitos. */
  canEvolve(save) {
    const f = FORMS[save.species], evo = EVOLUTIONS[f.id];
    if (!evo) return { ok: false, final: true, reason: `${f.name} ya está en su forma final.` };
    const lv = save.prog.level >= evo.level, cl = !evo.cleared || save.cleared.length >= evo.cleared;
    // Ruta alternativa: el objeto de evolución de la especie, desde el nivel EVO_ITEM_MIN_LEVEL
    const itemId = Object.keys(ITEMS).find(k => ITEMS[k].evolves === f.id), has = !!itemId && (save.inv || []).some(x => x.id === itemId);
    const byItem = has && save.prog.level >= EVO_ITEM_MIN_LEVEL, normal = lv && cl;
    const reqs = [{ text: `Nivel ${evo.level} (tienes ${save.prog.level})`, ok: lv }].concat(evo.cleared ? [{ text: `Haber completado ${evo.cleared} mazmorra (tienes ${save.cleared.length})`, ok: cl }] : []);
    if (itemId) reqs.push({ text: `O bien: ${ITEMS[itemId].name} (${has ? 'la llevas' : 'no la tienes'}) y nivel ${EVO_ITEM_MIN_LEVEL}`, ok: byItem });
    return { ok: normal || byItem, evo, to: FORMS[evo.to], reqs, useItem: !normal && byItem ? itemId : null };
  },
};
/** Requisitos de evolución distintos por especie. */
const EVOLUTIONS = {
  voltrino: { to: 'voltaurio', level: 12 },
  magmolo: { to: 'magmoloso', level: 14 },
  aurin: { to: 'aurion', level: 13, cleared: 1 },   // necesita además el vínculo de haber completado una mazmorra
};

/* ---------- 9. Combat ----------
   Todas las comprobaciones se hacen en coordenadas de suelo (los pies):
   un objetivo recibe daño solo si su círculo de impacto (radius) toca la
   forma del ataque. La fórmula de daño está en la sección 12 (tipos y estadísticas). */
const Combat = {
  angDiff(a, b) { let d = a - b; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return d; },
  foes(g, team) { return g.actors.filter(a => a.alive && a.team !== team && a.team !== 'neutral'); },
  hit(g, t, o) {
    if (g.net && g.net.active) return g.net.localHit(t, o);   // en línea el daño lo decide el servidor
    if (!t.alive || t.team === o.team || t.invincible) return false;
    if (!o.dot && t.iframes > 0) return false;
    if (!o.dot && t.intercept && t.intercept(g, o)) return false;
    let dmg = 0, eff = 1;
    if (o.dmg > 0) {
      const s = o.src;
      if (o.pct) dmg = t.maxHp * o.pct;                                   // trampas, quemaduras, hambre: % de PS
      else if (s && s.stats && t.stats) {
        const esp = o.cat === 'esp', type = o.type || s.type || 'normal';
        eff = typeEff(type, t.type);
        if (eff < 1 && t.kind && t.kind.isBoss) eff = 1;   // los guardianes no tienen resistencias de tipo (sí debilidades)
        dmg = o.dmg * (s.stats[esp ? 'spa' : 'atk'] / Math.max(1, t.stats[esp ? 'spd' : 'def'])) * (.4 + .04 * s.level)
          * (type === s.type ? 1.25 : 1) * eff * (s.dmgMul || 1) * (o.mul || 1);
      } else dmg = o.dmg * (o.mul || 1);
      dmg = Math.max(1, Math.round(dmg * t.damageTakenMul()));
      // Don Golpe certero
      const crit = !o.dot && s && s.boons && s.boons.critico && Math.random() < .12 * s.boons.critico;
      if (crit) { dmg = Math.round(dmg * 1.8); Effects.floater(g, t.x - 10, t.y - t.height - 14, '¡Crítico!', BOONS.critico.color, 9); }
      t.hp = Math.max(0, t.hp - dmg);
      if (s && s.boons) {
        // Don Sed: cura una parte del daño hecho
        if (s.boons.vampiro && s.alive && !o.thorns) s.hp = Math.min(s.maxHp, s.hp + dmg * .05 * s.boons.vampiro);
        // Don Rebote: el básico salta a enemigos cercanos
        if (s.boons.cadena && o.basic && !o.chained && !o.dot) {
          const near = Combat.foes(g, s.team).filter(e => e !== t && Math.hypot(e.x - t.x, e.y - t.y) < 95).sort((a, b) => Math.hypot(a.x - t.x, a.y - t.y) - Math.hypot(b.x - t.x, b.y - t.y)).slice(0, s.boons.cadena);
          for (const e of near) {
            const x0 = t.x, y0 = t.y - t.height * .45, x1 = e.x, y1 = e.y - e.height * .45;
            Effects.add(g, .14, (c, k) => { c.globalCompositeOperation = 'lighter'; c.globalAlpha = 1 - k; c.strokeStyle = BOONS.cadena.color; c.lineWidth = 2; c.beginPath(); c.moveTo(x0, y0); c.lineTo((x0 + x1) / 2 + 6, (y0 + y1) / 2 - 6); c.lineTo(x1, y1); c.stroke(); c.globalAlpha = 1; c.globalCompositeOperation = 'source-over'; });
            Combat.hit(g, e, Object.assign({}, o, { mul: (o.mul || 1) * .4, chained: true, kb: 0 }));
          }
        }
      }
      // Don Espinas: quien golpea cuerpo a cuerpo recibe parte del daño
      if (t.boons && t.boons.espinas && s && s.alive && s.team !== t.team && !o.thorns && !o.dot && Math.hypot(s.x - t.x, s.y - t.y) < 70)
        Combat.hit(g, s, { team: t.team, dmg: Math.max(1, Math.round(dmg * .25 * t.boons.espinas)), src: null, thorns: true, color: BOONS.espinas.color });
      // Don Segundo aliento (una vez por piso)
      if (t.boons && t.boons.aliento && !t.alientoUsed && t.hp > 0 && t.hp < t.maxHp * .25) {
        t.alientoUsed = true; t.hp = Math.min(t.maxHp, t.hp + t.maxHp * (t.boons.aliento === 1 ? .35 : .6));
        Effects.ring(g, t.x, t.y, 8, 60, BOONS.aliento.color, .5, 5, 'ground'); Effects.floater(g, t.x, t.y - t.height - 12, '¡Segundo aliento!', BOONS.aliento.color, 10);
      }
      g.stats.damageDealt[t.team] = (g.stats.damageDealt[t.team] || 0) + dmg;
      Effects.damage(g, t, dmg, o.dot ? '#ff9a4a' : t === g.player ? '#ff6b5b' : t.ally ? '#ffb3a8' : eff > 1 ? '#ffd166' : '#ffffff', o.dot ? 9 : Math.min(19, 11 + dmg / t.maxHp * 22));
      if (!o.dot) {
        Effects.elemHit(g, t, o.type || (o.src && o.src.type) || 'normal', dmg >= t.maxHp * .2);
        if (dmg >= t.maxHp * .2 && t !== g.player) Light.flash(t.x, t.y - 16, 110, '#fff2d0', .1, .8);   // destello en golpes potentes
        Sfx.play(t === g.player ? 'hurt' : eff > 1 ? 'crit' : 'hit');
        // Pausa de impacto: golpes fuertes, golpes que derriban y daño recibido
        if (t === g.player) g.hitStop = Math.max(g.hitStop || 0, .05);
        else if (o.src === g.player && (t.hp <= 0 || dmg >= t.maxHp * .2)) g.hitStop = Math.max(g.hitStop || 0, t.hp <= 0 ? .07 : .04);
      }
      if (t.status.petrify > 0) t.status.petrify = 0;   // la petrificación se rompe al recibir daño
      if (!o.dot && eff > 1) Effects.floater(g, t.x + 12, t.y - t.height - 10, '¡Eficaz!', '#ffd166', 8);
      if (!o.dot && eff < 1) Effects.floater(g, t.x + 12, t.y - t.height - 10, 'Poco eficaz', '#9fb3a3', 7);
    }
    if (o.sleep && !(t.immuneT > 0)) { t.status.sleep = Math.max(t.status.sleep, o.sleep * t.stunMul); Effects.floater(g, t.x, t.y - t.height - 8, 'Zz', '#c79bff', 10); }
    if (!o.dot && dmg > 0) {
      t.flash = .12;
      const kb = (o.kb || 0) * t.kbMul();
      if (kb > 0) { t.kbx += (o.dirx || 0) * kb; t.kby += (o.diry || 0) * kb; }
      if (t === g.player) { t.iframes = CONFIG.HURT_IFRAMES; g.shake = Math.max(g.shake, 5); }
      else if (t.ally) t.iframes = .3;
      else { t.aggro = true; t.showBar = 3; }
      Effects.impact(g, t.x, t.y - t.height * .45, o.color || '#ffffff');
      if (o.src && o.src.energy !== undefined && o.energyGain) o.src.energy = Math.min(CONFIG.ENERGY_MAX, o.src.energy + o.energyGain);
    }
    if (o.stun && !(t.immuneT > 0)) t.status.stun = Math.max(t.status.stun, o.stun * t.stunMul);
    if (o.slow && !(t.immuneT > 0)) { t.status.slow = Math.max(t.status.slow, o.slow.t); t.status.slowAmt = Math.max(t.status.slowAmt, o.slow.amt); }
    if (o.burn) { t.status.burn = Math.max(t.status.burn, o.burn.t); t.status.burnDmg = o.burn.dmg; if (t.status.burnTick <= 0) t.status.burnTick = .5; }
    if (t.hp <= 0) {
      t.die(g);
      // Don Estallido: el enemigo derrotado explota
      const so = o.src, lv = so && so.boons && so.boons.estallido;
      if (lv && !t.alive && t.team !== so.team && !o.blast) {
        Combat.circle(g, so.team, t.x, t.y, 58, { dmg: 10 * lv, type: so.type, cat: 'esp', src: so, kb: 140, color: BOONS.estallido.color, blast: true });
        Effects.ring(g, t.x, t.y, 6, 62, BOONS.estallido.color, .35, 5, 'ground'); Effects.burst(g, t.x, t.y - 10, BOONS.estallido.color, 16, 180, .4);
      }
    }
    return true;
  },
  /** Círculo centrado en (x,y). hitSet evita golpear dos veces al mismo objetivo con el mismo ataque. */
  circle(g, team, x, y, r, o, hitSet) {
    let n = 0;
    if (g.onCombatArea) g.onCombatArea(team, x, y, r);
    for (const t of this.foes(g, team)) {
      if (hitSet && hitSet.has(t)) continue;
      const dx = t.x - x, dy = t.y - y, d = Math.hypot(dx, dy);
      if (d > r + t.radius) continue;
      hitSet && hitSet.add(t);
      const dirx = d > .01 ? dx / d : 0, diry = d > .01 ? dy / d : 1;
      if (this.hit(g, t, Object.assign({ team, dirx, diry }, o))) n++;
    }
    return n;
  },
  /** Segmento (haz) de ancho w entre dos puntos. */
  line(g, team, x0, y0, x1, y1, w, o, hitSet) {
    let n = 0; const L2 = (x1 - x0) ** 2 + (y1 - y0) ** 2 || 1, l = Math.sqrt(L2);
    for (const t of this.foes(g, team)) {
      if (hitSet && hitSet.has(t)) continue;
      const k = U.clamp(((t.x - x0) * (x1 - x0) + (t.y - y0) * (y1 - y0)) / L2, 0, 1);
      if (Math.hypot(t.x - (x0 + (x1 - x0) * k), t.y - (y0 + (y1 - y0) * k)) > w / 2 + t.radius) continue;
      hitSet && hitSet.add(t);
      if (this.hit(g, t, Object.assign({ team, dirx: (x1 - x0) / l, diry: (y1 - y0) / l }, o))) n++;
    }
    return n;
  },
  /** Sector circular: alcance range, semiángulo half (radianes), orientado según ang. */
  arc(g, team, x, y, ang, range, half, o, hitSet) {
    let n = 0;
    if (g.onCombatArea) g.onCombatArea(team, x + Math.cos(ang) * range * .5, y + Math.sin(ang) * range * .5, range * .6);
    for (const t of this.foes(g, team)) {
      if (hitSet && hitSet.has(t)) continue;
      const dx = t.x - x, dy = t.y - y, d = Math.hypot(dx, dy);
      if (d > range + t.radius) continue;
      const pad = d > t.radius ? Math.asin(Math.min(1, t.radius / d)) : Math.PI;
      if (Math.abs(this.angDiff(Math.atan2(dy, dx), ang)) > half + pad) continue;
      hitSet && hitSet.add(t);
      const dirx = d > .01 ? dx / d : Math.cos(ang), diry = d > .01 ? dy / d : Math.sin(ang);
      if (this.hit(g, t, Object.assign({ team, dirx, diry }, o))) n++;
    }
    return n;
  },
};

/* ---------- 10. Effects ---------- */
const Effects = {
  add(g, life, draw, layer = 'top') { g.effects.push({ t: 0, life, draw, layer }); },
  floater(g, x, y, text, color, size = 12) {
    g.floaters.push({ x: x + (Math.random() - .5) * 8, y, vx: (Math.random() - .5) * 20, text, color, size, t: 0, life: .85 });
  },
  /** Número de daño: salta en arco, crece al aparecer y se apaga (se puede ocultar en Opciones). */
  damage(g, t, dmg, color, size) {
    const side = Math.random() < .5 ? -1 : 1;
    g.floaters.push({ x: t.x + side * (4 + Math.random() * 6), y: t.y - t.height, vx: side * (18 + Math.random() * 22), vy: -78 - Math.random() * 20, grav: 190, text: String(dmg), color, size, t: 0, life: .8, dmg: true });
  },
  /** Impacto según el elemento: chispas eléctricas, brasas y humo, onda de aura, esquirlas o polvo. */
  elemHit(g, t, type, big) {
    const x = t.x, y = t.y - t.height * .45, n = big ? 1.6 : 1;
    if (type === 'electrico') {
      const segs = []; for (let k = 0; k < 3; k++) { const a = Math.random() * Math.PI * 2, pts = [[x, y]]; for (let i = 1; i < 4; i++) pts.push([x + Math.cos(a) * i * 5 + (Math.random() - .5) * 4, y + Math.sin(a) * i * 5 + (Math.random() - .5) * 4]); segs.push(pts); }
      this.add(g, .12, (c, k) => { c.globalAlpha = 1 - k; c.strokeStyle = '#fff2b0'; c.lineWidth = 1; for (const pts of segs) { c.beginPath(); pts.forEach(([px, py], i) => i ? c.lineTo(px, py) : c.moveTo(px, py)); c.stroke(); } c.globalAlpha = 1; });
      Light.flash(x, y, 60 * n, '#ffd75a', .14, .9);
    } else if (type === 'fuego') {
      for (let i = 0; i < 4 * n; i++) g.fx.add({ x: x + (Math.random() - .5) * 10, y, vx: (Math.random() - .5) * 40, vy: -30 - Math.random() * 40, life: .5, size: 1.5, color: Math.random() < .5 ? '#ff7a2f' : '#ffc46a', glow: true, grav: -20 });
      for (let i = 0; i < 2 * n; i++) g.fx.add({ x: x + (Math.random() - .5) * 8, y: y - 4, vx: (Math.random() - .5) * 10, vy: -16, life: .9, size: 3, color: '#3a3430', smoke: true });
      Light.flash(x, y, 64 * n, '#ff7a2f', .2, .9);
    } else if (type === 'lucha') {
      this.ring(g, x, y + 6, 4, 22 * n, 'rgba(190,240,245,.8)', .2, 2);
      Light.flash(x, y, 48 * n, '#9fe8ee', .12, .7);
    } else if (type === 'roca' || type === 'cristal') {
      for (let i = 0; i < 4 * n; i++) g.fx.add({ x, y, vx: (Math.random() - .5) * 120, vy: -40 - Math.random() * 60, life: .4, size: 1.5, color: type === 'cristal' ? '#9fe8f8' : '#8a8478', grav: 260 });
    } else {
      for (let i = 0; i < 3 * n; i++) g.fx.add({ x, y: t.y - 2, vx: (Math.random() - .5) * 50, vy: -10 - Math.random() * 15, life: .5, size: 2, color: '#6a6052', smoke: true });
    }
  },
  impact(g, x, y, color) {
    color = color || '#ffffff';
    Light.flash(x, y, 56, color, .14, .8);
    // Chispas estiradas que salen disparadas (blancas y del color del golpe)
    for (let i = 0; i < 9; i++) {
      const a = Math.random() * Math.PI * 2, s = 140 + Math.random() * 160;
      g.fx.add({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 20, life: .14 + Math.random() * .12, size: 1.6, color: i % 3 ? color : '#ffffff', glow: true, streak: .045, grav: 300 });
    }
    // Destello en estrella de cuatro puntas (aditivo) y anillo de choque fino
    const rot = (Math.random() - .5) * .6;
    this.add(g, .14, (c, k) => { Effects.flare(c, x, y, 26 * (1 - k * .4), rot, color, 1 - k); });
    this.add(g, .2, (c, k) => {
      c.globalCompositeOperation = 'lighter'; c.globalAlpha = (1 - k) * .8; c.strokeStyle = color; c.lineWidth = 2.2 * (1 - k) + .4;
      c.beginPath(); c.ellipse(x, y, 6 + k * 20, (6 + k * 20) * .75, 0, 0, Math.PI * 2); c.stroke();
      c.globalAlpha = 1; c.globalCompositeOperation = 'source-over';
    });
  },
  /** Destello en estrella: núcleo blanco y puntas largas del color del golpe (modo aditivo). */
  flare(c, x, y, r, rot, color, a) {
    c.save(); c.translate(x, y); c.rotate(rot); c.globalCompositeOperation = 'lighter';
    for (const [len, wid, col, al] of [[r, r * .16, color, .85], [r * .62, r * .08, '#ffffff', 1]]) {
      c.globalAlpha = a * al; c.fillStyle = col;
      c.beginPath(); c.moveTo(-len, 0); c.lineTo(0, -wid); c.lineTo(len, 0); c.lineTo(0, wid); c.closePath(); c.fill();
      c.beginPath(); c.moveTo(0, -len * .6); c.lineTo(wid, 0); c.lineTo(0, len * .6); c.lineTo(-wid, 0); c.closePath(); c.fill();
    }
    c.globalAlpha = a; c.fillStyle = '#ffffff'; c.beginPath(); c.arc(0, 0, r * .14, 0, Math.PI * 2); c.fill();
    c.restore(); c.globalAlpha = 1;
  },
  /** Derrota de un enemigo: esquirlas, destello y un alma que sube. */
  defeat(g, e, color = '#ffffff') {
    const x = e.x, y = e.y - (e.height || 20) * .45, big = e.kind && e.kind.isBoss;
    for (let i = 0; i < (big ? 26 : 12); i++) {
      const a = Math.random() * Math.PI * 2, s = 90 + Math.random() * (big ? 260 : 170);
      g.fx.add({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 40, life: .25 + Math.random() * .25, size: 2, color: i % 2 ? color : '#ffffff', glow: true, streak: .05, grav: 380 });
    }
    this.add(g, .22, (c, k) => { Effects.flare(c, x, y, (big ? 70 : 38) * (1 - k * .3), .3, color, 1 - k); });
    this.add(g, .7, (c, k) => {
      c.globalCompositeOperation = 'lighter'; c.globalAlpha = (1 - k) * .55; c.fillStyle = color;
      const yy = y - k * 40; c.beginPath(); c.ellipse(x, yy, 5 * (1 - k * .5), 9 * (1 - k * .3), 0, 0, Math.PI * 2); c.fill();
      c.globalAlpha = 1; c.globalCompositeOperation = 'source-over';
    });
  },
  burst(g, x, y, color, n = 12, speed = 120, life = .4) {
    n = Math.ceil(n * .6);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, s = speed * (.4 + Math.random() * .6);
      g.fx.add({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: life * (.6 + Math.random() * .6), size: 3, color, glow: true });
    }
  },
  /** Tajo: media luna afilada que barre el arco del ataque (estela de arma, modo aditivo). */
  slash(g, x, y, ang, range, half, color) {
    const dir = Math.random() < .5 ? 1 : -1, cy = y - 10;
    const crescent = (c, R, th, a0, a1) => {
      const n = 14; c.beginPath();
      for (let i = 0; i <= n; i++) { const t = i / n, a = a0 + (a1 - a0) * t; c.lineTo(x + Math.cos(a) * R, cy + Math.sin(a) * R * .8); }
      for (let i = n; i >= 0; i--) { const t = i / n, a = a0 + (a1 - a0) * t, w = th * Math.sin(Math.PI * Math.min(1, t * 1.15)) ** .8; c.lineTo(x + Math.cos(a) * (R - w), cy + Math.sin(a) * (R - w) * .8); }
      c.closePath(); c.fill();
    };
    this.add(g, .2, (c, k) => {
      const sweep = Math.min(1, k * 4), a0 = ang - half * dir, a1 = a0 + 2 * half * dir * sweep, R = range * (.8 + .25 * k), th = range * .42 * (1 - k * .6);
      c.globalCompositeOperation = 'lighter';
      c.globalAlpha = (1 - k) * .7; c.fillStyle = color; crescent(c, R, th, a0, a1);
      c.globalAlpha = (1 - k); c.fillStyle = '#ffffff'; crescent(c, R, th * .35, a0 + (a1 - a0) * .15, a1);
      c.globalAlpha = 1; c.globalCompositeOperation = 'source-over';
    });
  },
  ring(g, x, y, r0, r1, color, life = .35, width = 4, layer = 'top') {
    this.add(g, life, (c, k) => {
      c.globalAlpha = 1 - k; c.strokeStyle = color; c.lineWidth = width * (1 - k) + .5;
      c.beginPath(); c.arc(x, y, U.lerp(r0, r1, k), 0, Math.PI * 2); c.stroke(); c.globalAlpha = 1;
    }, layer);
  },
  lightning(g, x, y) {
    const pts = []; for (let i = 0; i <= 9; i++) pts.push([x + (i === 0 || i === 9 ? 0 : (Math.random() - .5) * 22), y - 240 + i * 26]);
    this.add(g, .28, (c, k) => {
      c.globalAlpha = 1 - k;
      for (const [w, col] of [[7, 'rgba(255,225,77,.45)'], [2.5, '#fffbe0']]) {
        c.strokeStyle = col; c.lineWidth = w; c.beginPath(); pts.forEach(([px, py], i) => i ? c.lineTo(px, py) : c.moveTo(px, py)); c.stroke();
      }
      c.globalAlpha = 1;
    });
  },
  ghost(g, sp, x, y, st) {
    this.add(g, .22, (c, k) => { c.save(); c.globalAlpha = .35 * (1 - k); drawCreature(c, sp, x, y, st, false, CONFIG.CREATURE_SCALE); c.restore(); }, 'mid');
  },
};

/* ---------- 11. Projectiles y zonas ---------- */
const BLOCKS_SHOT = new Uint8Array(16);
[T.WALL, T.ROCK, T.TREE, T.CRYSTAL, T.DOOR, T.SECRET, T.BUILD].forEach(t => BLOCKS_SHOT[t] = 1); // el agua y la lava no frenan proyectiles

class Projectile {
  constructor(o) {
    Object.assign(this, { r: 4, life: 1, pierce: 0, kb: 0, homing: 0, kind: 'spark', color: '#fff', h: 12, alive: true, age: 0 }, o);
    this.hitSet = new Set();
    this.speed = Math.hypot(this.vx, this.vy);
  }
  update(dt, g) {
    if (!this.trail) this.trail = [];
    this.trailT = (this.trailT || 0) - dt;
    if (this.trailT <= 0) { this.trailT = .016; this.trail.push(this.x, this.y); if (this.trail.length > 16) this.trail.splice(0, 2); }   // estela (solo se dibuja)
    if (this.net) { this.age += dt; this.x += this.vx * dt; this.y += this.vy * dt; if (this.age >= this.life) this.alive = false; return; }   // disparo enviado por el servidor
    this.age += dt;
    if (this.age >= this.life) { this.alive = false; return; }
    if (Math.random() < 30 * dt) {
      const k = this.kind, y = this.y - (this.h || 10);
      if (k === 'ember') g.fx.add({ x: this.x, y, vx: (Math.random() - .5) * 20, vy: -10, life: .5, size: 2, color: '#3a3430', smoke: true });
      else if (k === 'spark' || k === 'bolt') g.fx.add({ x: this.x + (Math.random() - .5) * 4, y: y + (Math.random() - .5) * 4, vx: 0, vy: 0, life: .15, size: 1, color: '#fff2b0', glow: true });
      else if (k === 'spore') g.fx.add({ x: this.x, y, vx: (Math.random() - .5) * 10, vy: 6, life: .6, size: 1, color: '#b8a0d8', glow: false });
    }
    if (this.homing) {
      let best = null, bd = this.homingRange || 320;
      for (const t of Combat.foes(g, this.team)) { if (this.hitSet.has(t)) continue; const d = Math.hypot(t.x - this.x, t.y - this.y); if (d < bd) { bd = d; best = t; } }
      if (best) {
        const cur = Math.atan2(this.vy, this.vx), want = Math.atan2(best.y - this.y, best.x - this.x);
        const turn = U.clamp(Combat.angDiff(want, cur), -this.homing * dt, this.homing * dt);
        this.vx = Math.cos(cur + turn) * this.speed; this.vy = Math.sin(cur + turn) * this.speed;
      }
    }
    const steps = Math.max(1, Math.ceil(this.speed * dt / 5));
    for (let i = 0; i < steps && this.alive; i++) {
      this.x += this.vx * dt / steps; this.y += this.vy * dt / steps;
      const tt = g.world.tileAt(this.x, this.y);
      if (BLOCKS_SHOT[tt] || g.world.blockedAt(this.x, this.y)) { if (tt === T.SECRET && this.team === 'player' && g.dungeon) g.dungeon.hitArea(this.x, this.y, 6); this.alive = false; Effects.burst(g, this.x, this.y - this.h, this.color, 6, 70, .25); return; }
      for (const t of Combat.foes(g, this.team)) {
        if (this.hitSet.has(t)) continue;
        if (Math.hypot(t.x - this.x, t.y - this.y) > this.r + t.radius) continue;
        this.hitSet.add(t);
        const l = this.speed || 1;
        const base = this.hit || { dmg: this.dmg, stun: this.stun, burn: this.burn, slow: this.slow, src: this.src, energyGain: this.energyGain, cat: this.cat || 'esp' };
        const ok = Combat.hit(g, t, Object.assign({ color: this.color }, base, { team: this.team, kb: this.kb, dirx: this.vx / l, diry: this.vy / l }));
        if (ok && this.onHit) this.onHit(g, t);
        if (this.pierce-- <= 0) { this.alive = false; return; }
      }
    }
  }
  draw(c, time) {
    const x = this.x, y = this.y - this.h, a = Math.atan2(this.vy, this.vx);
    U.ellipse(c, this.x, this.y, this.r * .9, this.r * .4, 'rgba(0,0,0,.2)');
    // Estela luminosa que se afila hacia atrás
    const tr = this.trail, tc = { bolt: '#ffe14d', ember: '#ff7a2f', aura: '#7fe3e8', shard: '#8ff0ff', spore: this.color }[this.kind] || this.color;
    if (tr && tr.length >= 4 && this.kind !== 'wave' && typeof tc === 'string') {
      c.globalCompositeOperation = 'lighter'; c.lineCap = 'round'; c.strokeStyle = tc;
      const n = tr.length / 2;
      for (let i = 1; i < n; i++) { const k = i / n; c.globalAlpha = .45 * k; c.lineWidth = Math.max(.6, this.r * 1.3 * k); c.beginPath(); c.moveTo(tr[i * 2 - 2], tr[i * 2 - 1] - this.h); c.lineTo(i === n - 1 ? this.x : tr[i * 2], (i === n - 1 ? this.y : tr[i * 2 + 1]) - this.h); c.stroke(); }
      c.globalAlpha = 1; c.globalCompositeOperation = 'source-over'; c.lineCap = 'butt';
    }
    switch (this.kind) {
      case 'bolt': {
        c.strokeStyle = 'rgba(255,225,77,.45)'; c.lineWidth = 7; c.beginPath(); c.moveTo(x - Math.cos(a) * 22, y - Math.sin(a) * 22); c.lineTo(x, y); c.stroke();
        c.strokeStyle = '#fffbe0'; c.lineWidth = 2.5; c.beginPath();
        for (let i = 0; i <= 4; i++) { const k = i / 4, j = (i % 2 ? 1 : -1) * 2.5; c.lineTo(x - Math.cos(a) * 22 * k - Math.sin(a) * j, y - Math.sin(a) * 22 * k + Math.cos(a) * j); }
        c.stroke(); break;
      }
      case 'ember':
        U.ellipse(c, x, y, this.r + 3, this.r + 3, 'rgba(255,120,40,.3)');
        U.ellipse(c, x, y, this.r * (.8 + .3 * Math.sin(time * 40 + this.age * 50)), this.r, '#ff8a3d');
        U.ellipse(c, x, y, this.r * .45, this.r * .45, '#ffe08a'); break;
      case 'aura':
        U.ellipse(c, x, y, this.r + 5, this.r + 5, 'rgba(127,227,232,.25)');
        U.ellipse(c, x, y, this.r, this.r, '#bff6f8');
        c.strokeStyle = '#7fe3e8'; c.lineWidth = 1.5; c.beginPath(); c.arc(x, y, this.r + 2 + Math.sin(time * 12) * 1.5, 0, Math.PI * 2); c.stroke(); break;
      case 'wave': {
        const k = 1 - this.age / this.life;
        c.globalAlpha = .4 + .6 * k; c.strokeStyle = '#bff6f8'; c.lineWidth = 6; c.lineCap = 'round';
        c.beginPath(); c.arc(this.x - Math.cos(a) * 18, this.y - 8 - Math.sin(a) * 18, this.r, a - .9, a + .9); c.stroke();
        c.strokeStyle = 'rgba(127,227,232,.5)'; c.lineWidth = 12; c.beginPath(); c.arc(this.x - Math.cos(a) * 24, this.y - 8 - Math.sin(a) * 24, this.r, a - .8, a + .8); c.stroke();
        c.lineCap = 'butt'; c.globalAlpha = 1; break;
      }
      case 'shard':
        c.save(); c.translate(x, y); c.rotate(a);
        c.fillStyle = 'rgba(143,240,255,.3)'; c.fillRect(-9, -4, 14, 8);
        c.fillStyle = this.color; c.beginPath(); c.moveTo(7, 0); c.lineTo(-3, -3.5); c.lineTo(-7, 0); c.lineTo(-3, 3.5); c.closePath(); c.fill();
        c.fillStyle = '#ffffff'; c.fillRect(-2, -1, 5, 1.5); c.restore(); break;
      case 'spore':
        U.ellipse(c, x, y, this.r + 1.5, this.r + 1.5, '#1a1020');
        U.ellipse(c, x, y, this.r, this.r, this.color === '#b46cf0' ? '#9a6ac0' : this.color);
        U.ellipse(c, x - 1, y - 1, this.r * .4, this.r * .4, '#e0d0f0'); break;
      default:
        U.ellipse(c, x, y, this.r + 3, this.r + 3, 'rgba(255,225,77,.3)');
        U.ellipse(c, x, y, this.r, this.r, this.color);
        U.ellipse(c, x, y, this.r * .45, this.r * .45, '#fffbe0');
    }
  }
}

/** Zona con duración: retraso (aviso) → onStart → onTick cada `tick` s durante `life` → onEnd. */
class Zone {
  constructor(o) {
    Object.assign(this, { t: 0, delay: 0, life: 0, tick: .5, tickT: 0, r: 40, alive: true, started: false, follow: null, layer: 'ground' }, o);
  }
  update(dt, g) {
    this.t += dt;
    if (this.follow) { if (!this.follow.alive) { this.alive = false; return; } this.x = this.follow.x; this.y = this.follow.y; }
    if (this.t < this.delay) return;
    if (!this.started) { this.started = true; this.onStart && this.onStart(g, this); }
    if (this.onTick) { this.tickT -= dt; if (this.tickT <= 0) { this.tickT += this.tick; this.onTick(g, this); } }
    if (this.t >= this.delay + this.life) { this.alive = false; this.onEnd && this.onEnd(g, this); }
  }
  draw(c, g) { this.render && this.render(c, this, g); }
}

/* ---------- 12. Tipos, estadísticas y movimientos ----------
   Daño = potencia × (Ataque o At. esp. del atacante / Defensa o Def. esp. del objetivo)
          × (0,4 + 0,04 × nivel) × mismo tipo (×1,25) × eficacia de tipo × modificadores. */
const TYPES = {
  normal: { name: 'Normal', color: '#c9c2b0' }, fuego: { name: 'Fuego', color: '#ff7a2f' },
  electrico: { name: 'Eléctrico', color: '#f5cf3a' }, lucha: { name: 'Lucha', color: '#e0675a' },
  planta: { name: 'Planta', color: '#5fbf5a' }, roca: { name: 'Roca', color: '#b8a07a' }, cristal: { name: 'Cristal', color: '#7fe8ff' },
};
const TYPE_CHART = {
  fuego: { planta: 1.5, cristal: 1.5, roca: .67, fuego: .67 },
  electrico: { cristal: 1.5, planta: .67, roca: .67, electrico: .67 },
  lucha: { normal: 1.5, roca: 1.5, cristal: 1.5 },
  planta: { roca: 1.5, fuego: .67, planta: .67 },
  roca: { fuego: 1.5, cristal: 1.5, lucha: .67 },
  cristal: { planta: 1.5, fuego: .67, lucha: .67, roca: .67 },
  normal: { roca: .67 },
};
const typeEff = (atk, def) => (TYPE_CHART[atk] && TYPE_CHART[atk][def]) || 1;
const STAT_NAMES = { hp: 'PS', atk: 'Ataque', def: 'Defensa', spa: 'At. esp.', spd: 'Def. esp.', spe: 'Velocidad' };
/** Estadísticas a partir de las base y el nivel (misma fórmula para jugador y enemigos). */
function calcStats(b, L) {
  const s = v => Math.round(v * (.5 + L * .03)) + 3;
  return { hp: Math.round(b.hp * (.9 + L * .05)) + 8, atk: s(b.atk), def: s(b.def), spa: s(b.spa), spd: s(b.spd), spe: s(b.spe || 50) };
}
const MAX_LEVEL = 50;
/** Experiencia necesaria para pasar del nivel L al L+1. */
const expNeed = L => Math.round(12 + 1.6 * L * L);
/** Experiencia que da un enemigo: depende de su especie y nivel, y baja si es mucho más débil que tú. */
function expYield(e, playerLevel) {
  const diff = U.clamp(1 + (e.level - playerLevel) * .1, .3, 1.8);
  return Math.max(1, Math.round((e.kind.exp || 20) * e.level * .17 * diff * (e.elite ? 1.8 : 1) * (e.summoner ? .3 : 1)));
}

/** Opciones de impacto de un movimiento: potencia, tipo y categoría vienen de sus datos. */
const H = (m, u, extra = {}) => Object.assign({ dmg: m.power, type: m.type, cat: m.cat, src: u, color: TYPES[m.type].color, basic: !!(u && u.castingBasic) }, extra);
const deg = d => d * Math.PI / 180;
const MOVES = {
  /* ---- Línea eléctrica ---- */
  chispa: {
    name: 'Chispa', role: 'Básico · a distancia', type: 'electrico', cat: 'esp', power: 4, cd: .5, cost: 0, range: 160,
    desc: 'Disparo eléctrico corto y rápido. Recupera energía al acertar.',
    cast(g, u, aim, m) { g.projectiles.push(new Projectile({ x: u.x + aim.dx * 8, y: u.y + aim.dy * 8, vx: aim.dx * 430, vy: aim.dy * 430, r: 4, life: .38, kb: 50, team: u.team, kind: 'spark', color: '#ffe14d', hit: H(m, u, { energyGain: 2 }) })); },
  },
  saeta: {
    name: 'Saeta Voltio', role: 'Proyectil perforante', type: 'electrico', cat: 'esp', power: 11, cd: 1.4, cost: 15, range: 420,
    desc: 'Rayo muy veloz y de largo alcance que atraviesa hasta 3 enemigos en línea.',
    cast(g, u, aim, m) { g.projectiles.push(new Projectile({ x: u.x + aim.dx * 10, y: u.y + aim.dy * 10, vx: aim.dx * 660, vy: aim.dy * 660, r: 5, life: m.range / 660, kb: 90, pierce: 2, team: u.team, kind: 'bolt', color: '#ffe14d', hit: H(m, u) })); },
  },
  embestida: {
    name: 'Embestida Estática', role: 'Desplazamiento ofensivo', type: 'electrico', cat: 'fis', power: 10, cd: 4, cost: 20, range: 140,
    desc: 'Te lanzas unos 140 px cargado de electricidad: eres invulnerable y aturdes a todo lo que atraviesas.',
    cast(g, u, aim, m) { u.startDash(g, aim.dx, aim.dy, 700, m.range / 700, { iframes: true, color: '#ffe14d', hit: H(m, u, { r: 16, kb: 120, stun: .45 }) }); },
  },
  campo: {
    name: 'Campo Estático', role: 'Zona de control', type: 'electrico', cat: 'esp', power: 4, cd: 9, cost: 35, range: 72,
    desc: 'Durante 2,5 s te acompaña un campo de 72 px que daña cada 0,4 s y ralentiza un 50 %.',
    cast(g, u, aim, m) {
      g.zones.push(new Zone({
        follow: u, x: u.x, y: u.y, r: m.range, life: 2.5, tick: .4,
        onTick: (g, z) => Combat.circle(g, u.team, z.x, z.y, z.r, H(m, u, { slow: { t: .6, amt: .5 } })),
        render(c, z, g) {
          const k = 1 - (z.t / z.life);
          c.globalAlpha = .12 + .08 * Math.sin(g.time * 20); c.fillStyle = '#ffe14d'; c.beginPath(); c.arc(z.x, z.y, z.r, 0, Math.PI * 2); c.fill();
          c.globalAlpha = .5 + .5 * k; c.strokeStyle = '#ffe14d'; c.lineWidth = 2; c.setLineDash([6, 6]); c.lineDashOffset = -g.time * 40;
          c.beginPath(); c.arc(z.x, z.y, z.r, 0, Math.PI * 2); c.stroke(); c.setLineDash([]); c.globalAlpha = 1;
        },
      }));
    },
  },
  rayo: {
    name: 'Rayo Celeste', role: 'Golpe en área a distancia', type: 'electrico', cat: 'esp', power: 16, cd: 7, cost: 40, range: 240, targeted: true,
    desc: 'Marca un punto (hasta 240 px). Tras 0,55 s cae un rayo de 48 px de radio que aturde 1 s.',
    cast(g, u, aim, m) {
      g.zones.push(new Zone({
        x: aim.tx, y: aim.ty, r: 48, delay: .55, life: 0,
        onStart: (g, z) => { Combat.circle(g, u.team, z.x, z.y, z.r, H(m, u, { kb: 140, stun: 1 })); Effects.lightning(g, z.x, z.y); Effects.ring(g, z.x, z.y, 8, z.r + 8, '#ffe14d', .4, 5, 'ground'); Effects.burst(g, z.x, z.y - 6, '#ffe14d', 18, 160); g.shake = Math.max(g.shake, 4); },
        render(c, z) { if (z.started) return; const k = z.t / z.delay; c.globalAlpha = .2 + .25 * k; c.fillStyle = '#ffe14d'; c.beginPath(); c.arc(z.x, z.y, z.r * k, 0, Math.PI * 2); c.fill(); c.globalAlpha = .9; c.strokeStyle = '#ffe14d'; c.lineWidth = 2; c.beginPath(); c.arc(z.x, z.y, z.r, 0, Math.PI * 2); c.stroke(); c.globalAlpha = 1; },
      }));
    },
  },
  cadena: {
    name: 'Chispazo en Cadena', role: 'Proyectil que rebota', type: 'electrico', cat: 'esp', power: 9, cd: 3, cost: 18, range: 300,
    desc: 'Una descarga que, al acertar, salta a los 2 enemigos más cercanos (70 % de daño).',
    cast(g, u, aim, m) {
      g.projectiles.push(new Projectile({
        x: u.x + aim.dx * 10, y: u.y + aim.dy * 10, vx: aim.dx * 480, vy: aim.dy * 480, r: 5, life: m.range / 480, kb: 70, team: u.team, kind: 'spark', color: '#fff2a8', hit: H(m, u),
        onHit(g, t) {
          let from = t; const done = new Set([t]);
          for (let j = 0; j < 2; j++) {
            const next = Combat.foes(g, u.team).filter(e => !done.has(e) && Math.hypot(e.x - from.x, e.y - from.y) < 150).sort((a, b) => Math.hypot(a.x - from.x, a.y - from.y) - Math.hypot(b.x - from.x, b.y - from.y))[0];
            if (!next) break;
            const x0 = from.x, y0 = from.y - 14, x1 = next.x, y1 = next.y - 14;
            Effects.add(g, .22, (c, k) => { c.globalAlpha = 1 - k; c.strokeStyle = '#fff2a8'; c.lineWidth = 2; c.beginPath(); c.moveTo(x0, y0); for (let i = 1; i < 6; i++) c.lineTo(U.lerp(x0, x1, i / 6) + (Math.random() - .5) * 10, U.lerp(y0, y1, i / 6) + (Math.random() - .5) * 10); c.lineTo(x1, y1); c.stroke(); c.globalAlpha = 1; });
            Combat.hit(g, next, H(m, u, { team: u.team, mul: .7, dirx: (x1 - x0) / 100, diry: (y1 - y0) / 100, kb: 40 }));
            done.add(next); from = next;
          }
        },
      }));
    },
  },
  sobrecarga: {
    name: 'Sobrecarga', role: 'Potenciador', type: 'electrico', cat: 'estado', power: 0, cd: 14, cost: 25, range: 0,
    desc: 'Durante 5 s: ataque básico el doble de rápido, +20 % de velocidad y +50 % de regeneración de energía.',
    cast(g, u) { u.overchargeT = 5; Effects.ring(g, u.x, u.y, 8, 40, '#ffe14d', .35, 4); Effects.burst(g, u.x, u.y - 16, '#ffe14d', 18, 120); },
  },
  tormenta: {
    name: 'Tormenta Voltaica', role: 'Definitivo · lluvia de rayos', type: 'electrico', cat: 'esp', power: 26, cd: 16, cost: 50, range: 230, ultimate: true,
    desc: 'Seis rayos caen durante 1,8 s sobre los enemigos cercanos (o a tu alrededor). Cada uno aturde un instante.',
    cast(g, u, aim, m) {
      for (let i = 0; i < 6; i++) {
        const foes = Combat.foes(g, u.team).filter(e => Math.hypot(e.x - u.x, e.y - u.y) < m.range);
        const t = foes.length ? foes[i % foes.length] : null, a = Math.random() * Math.PI * 2, rr = 40 + Math.random() * 120;
        const x = t ? t.x + (Math.random() - .5) * 20 : u.x + Math.cos(a) * rr, y = t ? t.y + (Math.random() - .5) * 20 : u.y + Math.sin(a) * rr;
        g.zones.push(new Zone({
          x, y, r: 40, delay: .35 + i * .28, life: 0, follow: null,
          onStart: (g, z) => { Combat.circle(g, u.team, z.x, z.y, z.r, H(m, u, { kb: 90, stun: .3 })); Effects.lightning(g, z.x, z.y); Effects.burst(g, z.x, z.y - 6, '#ffe14d', 10, 120); g.shake = Math.max(g.shake, 2); },
          render(c, z) { if (z.started) return; const k = z.t / z.delay; c.globalAlpha = .15 + .3 * k; c.fillStyle = '#ffe14d'; c.beginPath(); c.arc(z.x, z.y, z.r * k, 0, Math.PI * 2); c.fill(); c.globalAlpha = 1; },
        }));
      }
    },
  },

  /* ---- Línea de fuego ---- */
  zarpazo: {
    name: 'Zarpazo', role: 'Básico · cuerpo a cuerpo', type: 'normal', cat: 'fis', power: 7, cd: .7, cost: 0, range: 46,
    desc: 'Arañazo amplio frente a ti (46 px, 110°) que empuja con fuerza.',
    cast(g, u, aim, m) { const ang = Math.atan2(aim.dy, aim.dx); Combat.arc(g, u.team, u.x, u.y, ang, m.range, deg(55), H(m, u, { kb: 150, energyGain: 3, color: '#ff8a3d' })); Effects.slash(g, u.x, u.y, ang, 34, deg(55), '#ffb36b'); },
  },
  brasas: {
    name: 'Brasas', role: 'Ráfaga en abanico', type: 'fuego', cat: 'esp', power: 4, cd: 1.5, cost: 15, range: 130,
    desc: 'Cinco brasas en abanico de corto alcance. Cada una quema durante 2 s.',
    cast(g, u, aim, m) {
      const base = Math.atan2(aim.dy, aim.dx);
      for (let i = -2; i <= 2; i++) { const a = base + deg(12) * i + (Math.random() - .5) * deg(4), s = 300 + Math.random() * 40; g.projectiles.push(new Projectile({ x: u.x + Math.cos(a) * 8, y: u.y + Math.sin(a) * 8, vx: Math.cos(a) * s, vy: Math.sin(a) * s, r: 4, life: m.range / 310, kb: 40, team: u.team, kind: 'ember', color: '#ff8a3d', hit: H(m, u, { burn: { t: 2 } }) })); }
    },
  },
  magma: {
    name: 'Charco de Magma', role: 'Proyectil en parábola + zona', type: 'fuego', cat: 'esp', power: 8, cd: 6, cost: 25, range: 200, targeted: true,
    desc: 'Lanza un glóbulo por encima de los obstáculos. Al caer deja un charco de lava 3,5 s que quema.',
    cast(g, u, aim, m) {
      const sx = u.x, sy = u.y;
      g.zones.push(new Zone({
        x: aim.tx, y: aim.ty, r: 52, delay: .55, life: 0, layer: 'top',
        onStart: (g, z) => {
          Combat.circle(g, u.team, z.x, z.y, 40, H(m, u, { kb: 90, burn: { t: 2 } })); Effects.burst(g, z.x, z.y - 6, '#ff8a3d', 14, 120);
          g.zones.push(new Zone({ x: z.x, y: z.y, r: 52, life: 3.5, tick: .5, onTick: (g, p) => Combat.circle(g, u.team, p.x, p.y, p.r, H(m, u, { mul: .35, burn: { t: 1.5 } })), render: drawLavaPool }));
        },
        render(c, z) { if (z.started) return; const k = z.t / z.delay, x = U.lerp(sx, z.x, k), y = U.lerp(sy, z.y, k), h = Math.sin(k * Math.PI) * 70 + 10; U.ellipse(c, x, y, 6, 3, 'rgba(0,0,0,.3)'); U.ellipse(c, x, y - h, 5, 5, '#ff7a1a'); },
      }));
    },
  },
  caparazon: {
    name: 'Caparazón Ígneo', role: 'Defensa', type: 'fuego', cat: 'esp', power: 3, cd: 10, cost: 30, range: 40,
    desc: 'Durante 3 s recibes solo el 35 % del daño, no sufres retroceso y quemas a quien se acerque.',
    cast(g, u, aim, m) {
      u.shield = 3;
      g.zones.push(new Zone({ follow: u, x: u.x, y: u.y, r: m.range, life: 3, tick: .5, onTick: (g, z) => Combat.circle(g, u.team, z.x, z.y, z.r, H(m, u, { burn: { t: 1.5 } })), render(c, z, g) { c.globalAlpha = .55 + .2 * Math.sin(g.time * 8); c.strokeStyle = '#ff8a3d'; c.lineWidth = 3; c.beginPath(); c.arc(z.x, z.y, z.r, 0, Math.PI * 2); c.stroke(); c.globalAlpha = 1; } }));
    },
  },
  erupcion: {
    name: 'Erupción', role: 'Explosión cargada', type: 'fuego', cat: 'esp', power: 16, cd: 8, cost: 45, range: 95,
    desc: 'Cargas 0,35 s (te mueves despacio) y estallas: 95 px de radio, mucho daño y gran retroceso.',
    cast(g, u, aim, m) { u.windup = { t: .35, total: .35, moveMul: .3, color: '#ff8a3d', then: (g) => { Combat.circle(g, u.team, u.x, u.y, m.range, H(m, u, { kb: 280 })); Effects.ring(g, u.x, u.y, 10, 100, '#ff8a3d', .45, 8, 'ground'); Effects.burst(g, u.x, u.y - 12, '#ff8a3d', 30, 220, .6); g.shake = Math.max(g.shake, 7); } }; },
  },
  rodada: {
    name: 'Rodada Ígnea', role: 'Embestida con estela', type: 'fuego', cat: 'fis', power: 12, cd: 5, cost: 20, range: 180,
    desc: 'Ruedas envuelto en llamas unos 180 px golpeando todo a tu paso y dejando una estela que quema 2 s.',
    cast(g, u, aim, m) {
      const trail = [];
      u.startDash(g, aim.dx, aim.dy, 520, m.range / 520, { iframes: false, color: '#ff8a3d', hit: H(m, u, { r: 18, kb: 160, burn: { t: 2 } }), onStep: (g, d) => { if (!trail.length || Math.hypot(trail[trail.length - 1][0] - u.x, trail[trail.length - 1][1] - u.y) > 40) { trail.push([u.x, u.y]); g.zones.push(new Zone({ x: u.x, y: u.y, r: 22, life: 2, tick: .5, onTick: (g, z) => Combat.circle(g, u.team, z.x, z.y, z.r, H(m, u, { mul: .2, burn: { t: 1.5 } })), render: drawLavaPool })); } } });
    },
  },
  ceniza: {
    name: 'Lluvia de Ceniza', role: 'Bombardeo en área', type: 'fuego', cat: 'esp', power: 10, cd: 9, cost: 35, range: 220, targeted: true,
    desc: 'Seis brasas gigantes caen al azar en un círculo de 70 px alrededor del punto marcado y queman.',
    cast(g, u, aim, m) {
      for (let i = 0; i < 6; i++) {
        const a = Math.random() * Math.PI * 2, r = Math.random() * 70, x = aim.tx + Math.cos(a) * r, y = aim.ty + Math.sin(a) * r;
        g.zones.push(new Zone({ x, y, r: 30, delay: .4 + i * .14, life: 0, onStart: (g, z) => { Combat.circle(g, u.team, z.x, z.y, z.r, H(m, u, { kb: 80, burn: { t: 2 } })); Effects.burst(g, z.x, z.y - 4, '#ff8a3d', 12, 120); }, render(c, z) { if (z.started) return; const k = z.t / z.delay; U.ellipse(c, z.x, z.y, z.r * k, z.r * k, 'rgba(255,138,61,.25)'); U.ellipse(c, z.x, z.y - (1 - k) * 160, 5, 5, '#ff7a1a'); } }));
      }
    },
  },
  columna: {
    name: 'Columna de Magma', role: 'Definitivo · línea de erupciones', type: 'fuego', cat: 'esp', power: 34, cd: 16, cost: 50, range: 260, ultimate: true,
    desc: 'Cinco columnas de lava brotan una tras otra en línea recta. Lanzan a los enemigos hacia delante.',
    cast(g, u, aim, m) {
      for (let i = 1; i <= 5; i++) {
        const x = u.x + aim.dx * 48 * i, y = u.y + aim.dy * 48 * i;
        if (BLOCKS_SHOT[g.world.tileAt(x, y)]) break;
        g.zones.push(new Zone({ x, y, r: 34, delay: .1 + i * .12, life: 0, onStart: (g, z) => { Combat.circle(g, u.team, z.x, z.y, z.r, H(m, u, { kb: 200, dirx: aim.dx, diry: aim.dy, burn: { t: 2 } })); Effects.burst(g, z.x, z.y - 10, '#ff8a3d', 16, 180, .5); Effects.ring(g, z.x, z.y, 4, 36, '#ffd166', .3, 5, 'ground'); }, render(c, z) { if (z.started) return; U.ellipse(c, z.x, z.y, z.r * (z.t / z.delay), z.r * (z.t / z.delay), 'rgba(255,106,26,.3)'); } }));
      }
      g.shake = Math.max(g.shake, 3);
    },
  },

  /* ---- Línea de lucha y aura ---- */
  punos: {
    name: 'Puño Rápido', role: 'Básico · combo de 3', type: 'lucha', cat: 'fis', power: 4, cd: .38, cost: 0, range: 40,
    desc: 'Combo de tres golpes. El tercero es más fuerte y lanza al enemigo hacia atrás.',
    cast(g, u, aim, m) {
      if (u.comboT <= 0) u.combo = 0;
      u.combo++;
      const third = u.combo >= 3, ang = Math.atan2(aim.dy, aim.dx), range = third ? m.range + 4 : m.range - 4, half = deg(third ? 60 : 45);
      Combat.arc(g, u.team, u.x, u.y, ang, range, half, H(m, u, { mul: third ? 1.7 : 1, kb: third ? 230 : 60, color: '#bff6f8', energyGain: third ? 3 : 1 }));
      Effects.slash(g, u.x + aim.dx * 6, u.y + aim.dy * 6, ang, third ? 30 : 22, half, third ? '#7fe3e8' : '#f1ecff');
      u.vx += aim.dx * (third ? 90 : 40); u.vy += aim.dy * (third ? 90 : 40); u.comboT = .8;
      if (third) { u.combo = 0; u.basicCd = .9; }
    },
  },
  pasoveloz: {
    name: 'Paso Veloz', role: 'Embestida de prioridad', type: 'normal', cat: 'fis', power: 12, cd: 2.2, cost: 10, range: 130,
    desc: 'Acometida casi instantánea (unos 130 px, invulnerable) que se detiene en el primer enemigo y lo golpea.',
    cast(g, u, aim, m) { u.startDash(g, aim.dx, aim.dy, 900, m.range / 900, { iframes: true, stopOnHit: true, color: '#bff6f8', hit: H(m, u, { r: 18, kb: 160, energyGain: 4 }) }); },
  },
  esfera: {
    name: 'Esfera Aura', role: 'Proyectil teledirigido', type: 'lucha', cat: 'esp', power: 14, cd: 3, cost: 20, range: 320,
    desc: 'Orbe lento que gira en busca del enemigo más cercano. Difícil de esquivar.',
    cast(g, u, aim, m) { g.projectiles.push(new Projectile({ x: u.x + aim.dx * 10, y: u.y + aim.dy * 10, vx: aim.dx * 260, vy: aim.dy * 260, r: 6, life: 1.7, kb: 130, homing: 5, homingRange: m.range, team: u.team, kind: 'aura', color: '#7fe3e8', hit: H(m, u) })); },
  },
  contragolpe: {
    name: 'Contragolpe', role: 'Parada y respuesta', type: 'lucha', cat: 'fis', power: 24, cd: 6, cost: 15, range: 70,
    desc: 'Guardia de 0,7 s. Si te golpean, anulas el daño y respondes con un estallido que aturde.',
    cast(g, u) { u.stance = .7; Effects.ring(g, u.x, u.y, 30, 22, '#7fe3e8', .2, 3); },
  },
  onda: {
    name: 'Onda Aura', role: 'Barrido que empuja', type: 'lucha', cat: 'esp', power: 12, cd: 7, cost: 35, range: 220,
    desc: 'Una onda ancha avanza en línea, atraviesa a todos los enemigos y los empuja muy lejos.',
    cast(g, u, aim, m) { g.projectiles.push(new Projectile({ x: u.x + aim.dx * 12, y: u.y + aim.dy * 12, vx: aim.dx * 380, vy: aim.dy * 380, r: 30, life: m.range / 380, kb: 340, pierce: 99, team: u.team, kind: 'wave', color: '#7fe3e8', h: 8, hit: H(m, u) })); g.shake = Math.max(g.shake, 3); },
  },
  giratoria: {
    name: 'Patada Giratoria', role: 'Golpe circular', type: 'lucha', cat: 'fis', power: 11, cd: 4, cost: 15, range: 58,
    desc: 'Giro de 360° que golpea a todo lo que te rodea (58 px) y lo aparta.',
    cast(g, u, aim, m) { Combat.circle(g, u.team, u.x, u.y, m.range, H(m, u, { kb: 230 })); Effects.ring(g, u.x, u.y - 8, 10, m.range, '#bff6f8', .25, 6); u.spinT = .3; },
  },
  concentracion: {
    name: 'Concentración', role: 'Potenciador', type: 'lucha', cat: 'estado', power: 0, cd: 15, cost: 20, range: 0,
    desc: 'Durante 6 s todos tus ataques hacen un 50 % más de daño.',
    cast(g, u) { u.focusT = 6; Effects.ring(g, u.x, u.y, 40, 10, '#7fe3e8', .4, 4); Effects.burst(g, u.x, u.y - 16, '#bff6f8', 16, 100); },
  },
  punoAural: {
    name: 'Puño Aural', role: 'Definitivo · rayo cargado', type: 'lucha', cat: 'esp', power: 52, cd: 16, cost: 50, range: 300, ultimate: true,
    desc: 'Cargas 0,4 s y disparas un haz de aura de 300 px que atraviesa a todos y los lanza lejos.',
    cast(g, u, aim, m) {
      u.windup = { t: .4, total: .4, moveMul: .2, color: '#7fe3e8', then: (g) => {
        const x1 = u.x + aim.dx * m.range, y1 = u.y + aim.dy * m.range;
        Combat.line(g, u.team, u.x, u.y, x1, y1, 30, H(m, u, { kb: 320, dirx: aim.dx, diry: aim.dy }));
        Effects.add(g, .35, (c, k) => { c.globalAlpha = 1 - k; c.strokeStyle = '#7fe3e8'; c.lineCap = 'round'; c.lineWidth = 26 * (1 - k * .6); c.beginPath(); c.moveTo(u.x, u.y - 14); c.lineTo(x1, y1 - 14); c.stroke(); c.strokeStyle = '#ffffff'; c.lineWidth = 8 * (1 - k); c.stroke(); c.lineCap = 'butt'; c.globalAlpha = 1; });
        g.shake = Math.max(g.shake, 6);
      } };
    },
  },
};
/* Ritmo táctico: los movimientos especiales tardan más en recargarse y cuestan más energía. */
for (const m of Object.values(MOVES)) if (m.cost > 0) { m.cd = Math.round(m.cd * CONFIG.MOVE_CD_MUL * 10) / 10; m.cost = Math.round(m.cost * CONFIG.MOVE_COST_MUL); }

function drawLavaPool(c, p, g) {
  const fade = Math.min(1, (p.life - p.t) * 2, p.t * 6);
  c.globalAlpha = .7 * fade;
  U.ellipse(c, p.x, p.y, p.r, p.r, '#7a1f0c'); U.ellipse(c, p.x, p.y, p.r * .82, p.r * .82, '#d9461a');
  U.ellipse(c, p.x + Math.sin(g.time * 2) * p.r * .1, p.y + Math.cos(g.time * 1.7) * p.r * .1, p.r * .45, p.r * .4, '#ff9a3d');
  c.globalAlpha = 1;
}

/* ---------- 13. Actors ---------- */
class Actor {
  constructor(x, y, o) {
    this.x = x; this.y = y; this.px = x; this.py = y;
    this.vx = 0; this.vy = 0; this.kbx = 0; this.kby = 0;
    this.hbW = o.hbW || 18; this.hbH = o.hbH || 12;
    this.radius = o.radius || 12;        // círculo de impacto (en el suelo)
    this.height = o.height || 34;        // altura visual (números de daño, barras)
    this.maxHp = o.hp; this.hp = o.hp; this.def = o.def || 0;
    this.team = o.team; this.kbRes = o.kbRes ?? 1; this.stunMul = o.stunMul ?? 1; this.mass = o.mass || 1;
    this.alive = true; this.iframes = 0; this.flash = 0;
    this.status = { stun: 0, slow: 0, slowAmt: 0, burn: 0, burnTick: 0, burnDmg: 0, sleep: 0, petrify: 0 };
    this.facing = { x: 0, y: 1 }; this.anim = Math.random() * 10; this.bob = 0; this.moving = false;
  }
  damageTakenMul() { return this.vuln || 1; }
  kbMul() { return this.kbRes; }
  free(world, x, y) { return !world.rectHitsSolid(x - this.hbW / 2, y - this.hbH / 2, this.hbW, this.hbH); }
  tickCommon(dt, g) {
    if (this.iframes > 0) this.iframes -= dt;
    if (this.flash > 0) this.flash -= dt;
    const s = this.status;
    if (s.stun > 0) s.stun -= dt;
    if (s.sleep > 0) s.sleep -= dt;
    if (s.slow > 0) { s.slow -= dt; if (s.slow <= 0) s.slowAmt = 0; }
    if (s.burn > 0 && this.alive) {
      s.burn -= dt; s.burnTick -= dt;
      if (s.burnTick <= 0) { s.burnTick = .5; Combat.hit(g, this, { dmg: 1, pct: .03, dot: true, team: 'burn' }); }
      if (Math.random() < 10 * dt) g.fx.add({ x: this.x + (Math.random() - .5) * 14, y: this.y - this.height * .5, vy: -30, life: .4, size: 2, color: '#ff8a3d', glow: true });
    }
    const k = Math.exp(-9 * dt); this.kbx *= k; this.kby *= k;
    if (Math.abs(this.kbx) < 1) this.kbx = 0; if (Math.abs(this.kby) < 1) this.kby = 0;
  }
  moveAxis(world, dx, dy) {
    if (dx === 0 && dy === 0) return true;
    const nx = this.x + dx, ny = this.y + dy;
    if (this.free(world, nx, ny)) { this.x = nx; this.y = ny; return true; }
    const s = CONFIG.TILE, e = 1e-3;
    if (dx > 0) this.x = Math.max(this.x, Math.floor((nx + this.hbW / 2) / s) * s - this.hbW / 2 - e);
    if (dx < 0) this.x = Math.min(this.x, (Math.floor((nx - this.hbW / 2) / s) + 1) * s + this.hbW / 2 + e);
    if (dy > 0) this.y = Math.max(this.y, Math.floor((ny + this.hbH / 2) / s) * s - this.hbH / 2 - e);
    if (dy < 0) this.y = Math.min(this.y, (Math.floor((ny - this.hbH / 2) / s) + 1) * s + this.hbH / 2 + e);
    if (dx) { this.vx *= .5; this.kbx *= .3; } if (dy) { this.vy *= .5; this.kby *= .3; }
    return false;
  }
  cornerSlide(world, d, axis) {
    const amt = Math.abs(d) || .5;
    for (let n = 1; n <= 9; n++) for (const sgn of [-1, 1]) {
      const ox = axis === 'y' ? sgn * n : 0, oy = axis === 'x' ? sgn * n : 0;
      const tx = axis === 'x' ? Math.sign(d) : 0, ty = axis === 'y' ? Math.sign(d) : 0;
      if (this.free(world, this.x + ox, this.y + oy) && this.free(world, this.x + ox + tx, this.y + oy + ty)) {
        const m = Math.min(n, amt); if (axis === 'x') this.y += sgn * m; else this.x += sgn * m; return true;
      }
    }
    return false;
  }
  /** Movimiento con sub-pasos; `want` activa la asistencia en esquinas para movimientos casi rectos. */
  moveBy(world, dx, dy, want = null) {
    const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) / 4));
    let blocked = false;
    for (let i = 0; i < steps; i++) {
      if (!this.moveAxis(world, dx / steps, 0)) { blocked = true; if (want && Math.abs(want.y) < .25) this.cornerSlide(world, dx / steps, 'x'); }
      if (!this.moveAxis(world, 0, dy / steps)) { blocked = true; if (want && Math.abs(want.x) < .25) this.cornerSlide(world, dy / steps, 'y'); }
    }
    return blocked;
  }
  drawStatus(c, g, x, y) {
    const top = y - this.height - 6;
    if (this.status.stun > 0) for (let i = 0; i < 3; i++) {
      const a = g.time * 5 + i * 2.094; U.ellipse(c, x + Math.cos(a) * 9, top + Math.sin(a) * 3, 2, 2, '#ffe14d');
    }
    if (this.status.sleep > 0) { c.font = '700 9px sans-serif'; c.textAlign = 'center'; c.fillStyle = '#c79bff'; c.fillText('z', x + 8 + Math.sin(g.time * 2) * 2, top - 2 - (g.time * 8 % 8)); c.fillText('Z', x + 12, top - 10 - (g.time * 6 % 6)); }
    if (this.status.slow > 0) { c.globalAlpha = .5; c.strokeStyle = '#5cc8ff'; c.lineWidth = 1.5; c.beginPath(); c.arc(x, y, this.radius + 4, 0, Math.PI * 2); c.stroke(); c.globalAlpha = 1; }
  }
}

/* ---------- Dones de expedición ----------
   Al llegar a cada piso nuevo (desde el 2) y al punto de control se elige 1 de 3 dones. Duran solo esa
   expedición: al volver a la aldea se pierden; el nivel, los movimientos y la evolución se conservan.
   Elegir otra vez el mismo don lo mejora (hasta su máximo). Las mismas reglas en solitario y en el servidor. */
const BOONS = {
  furia:     { name: 'Furia', color: '#ef5b4b', max: 3, desc: lv => `+${15 * lv} % de daño` },
  coraza:    { name: 'Coraza', color: '#c9a23a', max: 3, desc: lv => `+${20 * lv} % de PS máximos` },
  celeridad: { name: 'Celeridad', color: '#9fe8f8', max: 3, desc: lv => `+${10 * lv} % de velocidad` },
  recarga:   { name: 'Recarga', color: '#7fb8ff', max: 3, desc: lv => `Los movimientos se recargan un ${15 * lv} % antes` },
  vigor:     { name: 'Vigor', color: '#5fd0ff', max: 3, desc: lv => `+${35 * lv} % de energía por segundo` },
  vampiro:   { name: 'Sed', color: '#d0405a', max: 3, desc: lv => `Recuperas PS: el ${5 * lv} % del daño que haces` },
  critico:   { name: 'Golpe certero', color: '#ffd166', max: 3, desc: lv => `${12 * lv} % de probabilidad de crítico (×1,8)` },
  cadena:    { name: 'Rebote', color: '#ffe14d', max: 3, desc: lv => `El ataque básico salta a ${lv} enemigo${lv > 1 ? 's' : ''} cercano${lv > 1 ? 's' : ''} (40 % del daño)` },
  onda:      { name: 'Onda de esquiva', color: '#bff6f8', max: 3, desc: lv => `Al esquivar sueltas una onda que empuja y daña (potencia ${8 * lv})` },
  esquiva:   { name: 'Pies ligeros', color: '#e8e8e8', max: 2, desc: lv => `+${lv} carga${lv > 1 ? 's' : ''} de esquiva` },
  aliento:   { name: 'Segundo aliento', color: '#7dffa0', max: 2, desc: lv => `Una vez por piso, al bajar del 25 % de PS recuperas el ${lv === 1 ? 35 : 60} %` },
  espinas:   { name: 'Espinas', color: '#d8c8a8', max: 3, desc: lv => `Quien te golpea cuerpo a cuerpo recibe el ${25 * lv} % del daño` },
  estallido: { name: 'Estallido', color: '#ff8a3d', max: 3, desc: lv => `Los enemigos que derrotas explotan (potencia ${10 * lv})` },
};
const Boons = {
  /** Hasta `n` dones distintos que aún se pueden mejorar. `rnd`: generador [0, 1). */
  offer(rnd, owned = {}, n = 3) {
    const pool = Object.keys(BOONS).filter(id => (owned[id] || 0) < BOONS[id].max), out = [];
    while (out.length < n && pool.length) out.push(pool.splice(Math.floor(rnd() * pool.length), 1)[0]);
    return out;
  },
  valid: id => typeof id === 'string' && Object.prototype.hasOwnProperty.call(BOONS, id),
  level: (p, id) => (p && p.boons && p.boons[id]) || 0,
  /** Añade o mejora un don. Devuelve el nivel nuevo (0 si no es válido). */
  apply(p, id) {
    if (!this.valid(id)) return 0;
    p.boons = p.boons || {};
    const lv = Math.min(BOONS[id].max, (p.boons[id] || 0) + 1); p.boons[id] = lv;
    if (id === 'esquiva') p.dodgeCharges = Math.min(p.maxDodge, p.dodgeCharges + 1);
    this.refresh(p); return lv;
  },
  /** Recalcula desde cero lo que los dones cambian en las estadísticas. */
  refresh(p) {
    const b = p.boons || {}, oldMax = p.maxHp;
    p.mods.dmg = 1 + .15 * (b.furia || 0); p.mods.speed = 1 + .1 * (b.celeridad || 0);
    p.mods.cdr = 1 - .15 * (b.recarga || 0); p.mods.regen = 1 + .35 * (b.vigor || 0);
    p.mods.hp = 0; p.recalc(false); p.mods.hp = Math.round(p.stats.hp * .2 * (b.coraza || 0)); p.recalc(false);
    if (p.maxHp > oldMax) p.hp = Math.min(p.maxHp, p.hp + (p.maxHp - oldMax));
  },
  /** Copia los dones de otro (reconexión): sustituye los propios. */
  set(p, boons) { p.boons = {}; for (const [id, lv] of Object.entries(boons || {})) if (this.valid(id)) p.boons[id] = Math.max(1, Math.min(BOONS[id].max, lv | 0)); this.refresh(p); },
  label: (id, lv) => BOONS[id].name + (lv > 1 ? ' ' + ['', 'I', 'II', 'III'][lv] : ''),
  names(p) { return Object.entries((p && p.boons) || {}).map(([id, lv]) => this.label(id, lv)); },
};

class Player extends Actor {
  constructor(species, x, y, prog, equip) {
    prog = prog || Progress.fresh(species.id);
    equip = equip || freshEquip();
    const st = finalStats(species.base, prog.level, equip, null);
    super(x, y, { hbW: 18, hbH: 12, radius: 11, height: 40, hp: st.hp, def: st.def, team: 'player' });
    this.sp = species; this.prog = prog; this.level = prog.level; this.stats = st; this.type = species.typeId;
    this.moves = prog.equipped.slice(0, 4); this.ult = species.ultimate || null;   // hueco 4 = definitivo (tecla G), solo en la forma evolucionada
    this.overchargeT = 0; this.focusT = 0; this.spinT = 0;
    this.energy = CONFIG.ENERGY_MAX;
    this.cds = [0, 0, 0, 0, 0]; this.basicCd = 0;
    this.combo = 0; this.comboT = 0;
    this.dodgeCharges = CONFIG.DODGE_CHARGES; this.dodgeT = 0;
    this.basicCharges = CONFIG.BASIC_CHARGES; this.basicT = 0; this.basicDenyT = 0;
    this.dash = null; this.windup = null; this.shield = 0; this.stance = 0;
    this.look = null; this.lookT = 0; this.castAnim = 0;
    this.stepDust = 0; this.ghostT = 0;
    this.cdTot = [0, 0, 0, 0, 0];
    this.mods = { dmg: 1, def: 0, speed: 1, regen: 1, cdr: 1, hp: 0 };   // dones de la expedición (Boons.refresh)
    this.boons = {}; this.alientoUsed = false;
    this.equip = equip; this.buffs = {}; this.immuneT = 0; this.regenMul = equipRegen(equip);
    this.bag = new Inventory([], () => 12); this.belly = 100; this.bellyMax = 100; this.regenT = 0; this.starveT = 0; this.hungerWarn = 2;
  }
  /** Comer: llena la barriga. Comer con la barriga llena sube su máximo (hasta 200) durante la expedición. */
  eat(n) {
    if (this.belly >= this.bellyMax - .5) this.bellyMax = Math.min(200, this.bellyMax + Math.round(n / 5));
    this.belly = Math.min(this.bellyMax, this.belly + n); this.hungerWarn = this.belly > 20 ? 2 : 1;
    return true;
  }
  heal(n, belly = 0) {
    if (this.hp >= this.maxHp) return false;
    this.hp = Math.min(this.maxHp, this.hp + n); this.belly = Math.min(this.bellyMax, this.belly + belly);
    return true;
  }
  get dmgMul() { return this.mods.dmg * (this.focusT > 0 ? 1.5 : 1); }
  get maxDodge() { return CONFIG.DODGE_CHARGES + ((this.boons && this.boons.esquiva) || 0); }
  /** Recalcula estadísticas tras subir de nivel; los PS ganados se suman a los actuales. */
  /** Estadísticas finales = base + nivel + equipo + efectos temporales, calculadas desde cero.
      `levelUp`: los PS máximos ganados al subir de nivel se suman a los actuales; con el equipo solo se ajusta el tope. */
  recalc(levelUp = true) {
    const old = this.maxHp;
    this.stats = finalStats(this.sp.base, this.level, this.equip, this.buffs); this.maxHp = this.stats.hp + this.mods.hp; this.def = this.stats.def;
    this.regenMul = equipRegen(this.equip);
    this.hp = Math.min(this.maxHp, this.hp + (levelUp ? Math.max(0, this.maxHp - old) : 0));
  }
  restoreEnergy(n) { if (this.energy >= CONFIG.ENERGY_MAX) return false; this.energy = Math.min(CONFIG.ENERGY_MAX, this.energy + n); return true; }
  /** Elimina estados; devuelve si había alguno que curar. */
  cure(list) { let any = false; for (const k of list) if (this.status[k] > 0) { this.status[k] = 0; any = true; } if (list.includes('slow')) this.status.slowAmt = 0; return any; }
  /** Efecto temporal en % (no se acumula consigo mismo: renueva la duración). */
  addBuff(key, pct, t) { this.buffs[key] = { pct, t }; this.recalc(false); return true; }
  /** La velocidad de movimiento sale de la estadística Velocidad. */
  moveSpeed() { return Math.min(185, 80 + this.stats.spe * .85) * this.mods.speed * (this.overchargeT > 0 ? 1.2 : 1); }
  placeAt(x, y) {
    this.x = this.px = x; this.y = this.py = y; this.vx = this.vy = this.kbx = this.kby = 0;
    this.dash = null; this.windup = null; this.stance = 0; this.shield = 0; this.iframes = .5;
    Object.assign(this.status, { stun: 0, slow: 0, slowAmt: 0, burn: 0 });
  }
  damageTakenMul() { return this.shield > 0 ? .35 : 1; }
  kbMul() { return this.shield > 0 ? 0 : this.kbRes; }
  canAct() { return this.alive && this.status.stun <= 0 && this.status.sleep <= 0; }
  /** Contragolpe: si hay guardia, anula el golpe y responde. */
  intercept(g, o) {
    if (this.stance <= 0) return false;
    this.stance = 0; this.iframes = .5;
    Combat.circle(g, this.team, this.x, this.y, 70, { dmg: 24, kb: 240, stun: .6, color: '#7fe3e8', src: this, energyGain: 10 });
    Effects.ring(g, this.x, this.y, 12, 76, '#7fe3e8', .4, 6, 'ground'); Effects.burst(g, this.x, this.y - 16, '#bff6f8', 20, 180);
    Effects.floater(g, this.x, this.y - this.height - 6, '¡Contra!', '#7fe3e8', 11);
    g.shake = Math.max(g.shake, 4); g.stats.counters++;
    return true;
  }
  die(g) { if (g.tryRevive && g.tryRevive(this)) return; this.alive = false; this.hp = 0; this.dash = null; this.windup = null; Effects.burst(g, this.x, this.y - 16, this.sp.color, 24, 140, .7); g.onPlayerDown(); }

  setLook(aim) { this.look = { x: aim.dx, y: aim.dy }; this.lookT = .3; this.castAnim = .14; }
  startDash(g, dx, dy, speed, dur, o = {}) {
    const l = Math.hypot(dx, dy) || 1;
    this.dash = Object.assign({ vx: dx / l * speed, vy: dy / l * speed, t: 0, dur, hitSet: new Set() }, o);
    this.windup = null; this.stance = 0;
    if (o.iframes) this.iframes = Math.max(this.iframes, dur + .06);
  }
  tryBasic(g) {
    if (!this.canAct() || this.basicCd > 0 || this.windup || this.dash) return false;
    if (this.basicCharges < 1) { if (this.basicDenyT <= 0) { this.basicDenyT = .5; UI.deny('basic'); } return false; }
    this.basicCharges--; if (this.basicT <= 0) this.basicT = CONFIG.BASIC_RECHARGE;
    const m = MOVES[this.sp.basic], aim = g.getAim(m.range);
    this.setLook(aim);
    this.basicCd = m.cd * (this.overchargeT > 0 ? .5 : 1);
    this.castingBasic = true; try { m.cast(g, this, aim, m); } finally { this.castingBasic = false; }   // los golpes creados aquí son del básico (don Rebote)
    g.net && g.net.action('b', 0, aim);
    Sfx.play('basic');
    g.onBasicAttack && g.onBasicAttack(aim);
    g.stats.casts[this.sp.basic] = (g.stats.casts[this.sp.basic] || 0) + 1;
    return true;
  }
  moveAt(i) { return i === 4 ? this.ult : this.moves[i]; }
  tryMove(g, i) {
    const id = this.moveAt(i), m = MOVES[id];
    if (!m) return false;
    if (!this.canAct() || this.windup || this.dash) return UI.deny(i), false;
    if (this.cds[i] > 0 || this.energy < m.cost) return UI.deny(i), false;
    const aim = g.getAim(m.range, m.targeted);
    this.setLook(aim);
    this.energy -= m.cost; this.cds[i] = this.cdTot[i] = m.cd * this.mods.cdr;
    m.cast(g, this, aim, m);
    g.net && g.net.action('m', i, aim);
    Sfx.play(['electrico', 'fuego', 'lucha'].includes(m.type) ? m.type : 'move');
    g.stats.casts[id] = (g.stats.casts[id] || 0) + 1;
    return true;
  }
  tryDodge(g, axis) {
    if (!this.alive || this.status.stun > 0 || this.dash) return false;
    if (this.dodgeCharges < 1) return UI.deny('dodge'), false;
    let dx = axis.x, dy = axis.y;
    if (!dx && !dy) { dx = this.facing.x; dy = this.facing.y; }
    this.dodgeCharges--; this.belly = Math.max(0, this.belly - .5);
    if (this.dodgeT <= 0) this.dodgeT = CONFIG.DODGE_RECHARGE;
    const ox = this.x, oy = this.y;
    this.startDash(g, dx, dy, CONFIG.DODGE_SPEED, CONFIG.DODGE_TIME, { iframes: true, color: '#ffffff' });
    const ow = Boons.level(this, 'onda');
    if (ow) {   // don Onda de esquiva: descarga en el punto de partida
      Combat.circle(g, this.team, ox, oy, 46 + 6 * ow, { dmg: 8 * ow, type: this.type, cat: 'esp', src: this, kb: 170, color: BOONS.onda.color });
      Effects.ring(g, ox, oy, 8, 52 + 6 * ow, BOONS.onda.color, .3, 4, 'ground');
    }
    g.net && g.net.action('d', 0, { dx, dy, tx: this.x + dx, ty: this.y + dy });
    Sfx.play('dodge');
    this.iframes = Math.max(this.iframes, CONFIG.DODGE_IFRAMES);
    g.stats.dodges++;
    return true;
  }
  update(dt, axis, g) {
    const world = g.world;
    this.px = this.x; this.py = this.y;
    this.tickCommon(dt, g);
    for (let i = 0; i < 5; i++) if (this.cds[i] > 0) this.cds[i] = Math.max(0, this.cds[i] - dt);
    if (this.basicCd > 0) this.basicCd -= dt;
    if (this.comboT > 0) this.comboT -= dt;
    if (this.lookT > 0) this.lookT -= dt;
    if (this.castAnim > 0) this.castAnim -= dt;
    if (this.shield > 0) this.shield -= dt;
    if (this.stance > 0) this.stance -= dt;
    if (this.overchargeT > 0) this.overchargeT -= dt; if (this.focusT > 0) this.focusT -= dt; if (this.spinT > 0) this.spinT -= dt;
    if (this.immuneT > 0) this.immuneT -= dt;
    { let ch = false; for (const k in this.buffs) { const b = this.buffs[k]; b.t -= dt; if (b.t <= 0) { delete this.buffs[k]; ch = true; } } if (ch) this.recalc(false); }
    if (this.alive) this.energy = Math.min(CONFIG.ENERGY_MAX, this.energy + CONFIG.ENERGY_REGEN * this.mods.regen * this.regenMul * (this.overchargeT > 0 ? 1.5 : 1) * dt);
    if (this.basicDenyT > 0) this.basicDenyT -= dt;
    if (this.basicCharges < CONFIG.BASIC_CHARGES) {
      this.basicT -= dt;
      if (this.basicT <= 0) { this.basicCharges++; this.basicT = this.basicCharges < CONFIG.BASIC_CHARGES ? CONFIG.BASIC_RECHARGE : 0; }
    }
    if (this.dodgeCharges < this.maxDodge) {
      this.dodgeT -= dt;
      if (this.dodgeT <= 0) { this.dodgeCharges++; this.dodgeT = this.dodgeCharges < this.maxDodge ? CONFIG.DODGE_RECHARGE : 0; }
    }
    this.anim += dt;
    if (!this.alive) { this.vx *= .85; this.vy *= .85; this.moving = false; return; }

    const has = (axis.x !== 0 || axis.y !== 0) && this.status.stun <= 0 && this.status.sleep <= 0;
    if (this.dash) {
      const d = this.dash;
      d.t += dt;
      const blocked = this.moveBy(world, d.vx * dt, d.vy * dt, null);
      this.vx = d.vx; this.vy = d.vy;
      if (d.onStep) d.onStep(g, d);
      if (d.hit) {
        const n = Combat.circle(g, this.team, this.x, this.y, d.hit.r, Object.assign({ src: this }, d.hit), d.hitSet);
        if (n > 0 && d.stopOnHit) d.t = d.dur;
      }
      this.ghostT -= dt;
      if (this.ghostT <= 0) { this.ghostT = .035; Effects.ghost(g, this.sp, this.x, this.y, this.drawState()); }
      if (d.t >= d.dur || blocked) { this.dash = null; this.vx *= .3; this.vy *= .3; }
    } else {
      if (has) this.facing = { x: axis.x, y: axis.y };
      const mul = (this.windup ? this.windup.moveMul : 1) * (this.stance > 0 ? .4 : 1) * (1 - this.status.slowAmt) * (this.castAnim > 0 ? .85 : 1);
      const max = this.moveSpeed() * mul, ax = has ? axis.x : 0, ay = has ? axis.y : 0;
      const k = 1 - Math.exp(-(has ? CONFIG.ACCEL : CONFIG.FRICTION) * dt);
      this.vx += (ax * max - this.vx) * k; this.vy += (ay * max - this.vy) * k;
      if (!has && Math.hypot(this.vx, this.vy) < 3) { this.vx = 0; this.vy = 0; }
      this.moveBy(world, (this.vx + this.kbx) * dt, (this.vy + this.kby) * dt, has ? axis : null);
    }
    if (this.windup) {
      this.windup.t -= dt;
      if (Math.random() < 30 * dt) g.fx.add({ x: this.x + (Math.random() - .5) * 30, y: this.y - Math.random() * 20, vy: -40, life: .3, size: 2.5, color: this.windup.color, glow: true });
      if (this.windup.t <= 0) { const w = this.windup; this.windup = null; w.then(g); }
    }
    // Barriga: baja al moverse (0,1 por casilla). Con barriga se regeneran PS; sin ella se pierden.
    if (g.mode === 'dungeon') {
      const moved = Math.hypot(this.x - this.px, this.y - this.py);
      this.belly = Math.max(0, this.belly - moved / CONFIG.TILE * .1 - dt * .02);
      if (this.belly > 0) { this.regenT += dt; if (this.regenT >= CONFIG.HP_REGEN_EVERY) { this.regenT = 0; if (this.hp < this.maxHp) this.hp = Math.min(this.maxHp, this.hp + 1); } }
      else { this.starveT += dt; if (this.starveT >= 1) { this.starveT = 0; Combat.hit(g, this, { dmg: 1, pct: .02, dot: true, team: 'hambre' }); } }
      if (this.hungerWarn === 2 && this.belly <= 20) { this.hungerWarn = 1; UI.toast('Tienes hambre: come algo pronto (Z)', '#f2b84b'); }
      if (this.hungerWarn === 1 && this.belly <= 0) { this.hungerWarn = 0; UI.toast('¡Te mueres de hambre! Pierdes PS hasta que comas', '#ef5b4b'); }
    }
    const actual = Math.hypot(this.x - this.px, this.y - this.py) / dt;
    this.moving = actual > 8;
    this.bob = this.moving ? Math.abs(Math.sin(this.anim * 9)) * 2.6 : Math.sin(this.anim * 2.2) * .7 + .7;
    this.sp.emit && this.sp.emit(this, g.fx, dt);
    if (this.moving && !this.dash) {
      this.stepDust -= dt;
      if (this.stepDust <= 0) {
        this.stepDust = .14;
        const t = world.tileAt(this.x, this.y);
        if (t === T.PATH || t === T.FLOOR) g.fx.add({ x: this.x - this.facing.x * 6, y: this.y, vx: (Math.random() - .5) * 14, vy: -6, life: .35, size: 3, color: 'rgba(230,205,160,.8)' });
      }
    }
  }
  drawState() {
    const f = this.lookT > 0 && this.look ? this.look : this.facing, r = this._rig;
    this.flip = f.x < -.2 ? -1 : f.x > .2 ? 1 : (this.flip || 1);
    return { t: this.anim, moving: this.moving, fx: f.x, fy: f.y, vx: this.vx, vy: this.vy, bob: this.bob, flip: this.flip, isPlayer: true,
      yaw: r ? r.yaw : undefined, walk: r ? r.walk : undefined, gw: r ? r.gw : undefined, turnV: r ? r.turnV : 0, scale: CONFIG.CREATURE_SCALE };
  }
  draw(c, g, alpha) {
    const x = U.lerp(this.px, this.x, alpha), y = U.lerp(this.py, this.y, alpha);
    if (this.stance > 0) {
      c.globalAlpha = .6 + .3 * Math.sin(g.time * 30); c.strokeStyle = '#7fe3e8'; c.lineWidth = 2.5;
      c.beginPath(); for (let i = 0; i <= 6; i++) { const a = i / 6 * Math.PI * 2 + g.time; c.lineTo(x + Math.cos(a) * 26, y - 16 + Math.sin(a) * 26); } c.stroke(); c.globalAlpha = 1;
    }
    if (this.windup) {
      const k = 1 - this.windup.t / this.windup.total;
      c.globalAlpha = .5; c.strokeStyle = this.windup.color; c.lineWidth = 3; c.beginPath(); c.arc(x, y, 95 * (1 - k) + 12, 0, Math.PI * 2); c.stroke(); c.globalAlpha = 1;
    }
    if (this.focusT > 0) { c.globalAlpha = .4 + .2 * Math.sin(g.time * 10); c.strokeStyle = '#7fe3e8'; c.lineWidth = 2; c.beginPath(); c.ellipse(x, y, 20, 8, 0, 0, Math.PI * 2); c.stroke(); c.globalAlpha = 1; }
    if (this.overchargeT > 0 && Math.random() < .5) g.fx.add({ x: x + (Math.random() - .5) * 26, y: y - Math.random() * 40, vx: (Math.random() - .5) * 40, vy: -20, life: .2, size: 2, color: '#ffe14d', glow: true });
    const blink = (this.iframes > 0 && !this.dash && this.alive) ? (Math.floor(g.time * 20) % 2 ? .45 : 1) : 1;
    c.save(); c.globalAlpha = this.alive ? blink : .35;
    {
      const f = this.lookT > 0 && this.look ? this.look : this.facing, lunge = this.castAnim > 0 ? this.castAnim / .14 : 0;
      const lean = this.moving && !this.dash ? U.clamp(this.vx / 1100, -.09, .09) : 0, squash = this.dash ? .1 : 0;
      c.translate(x + f.x * 5 * lunge, y + f.y * 3 * lunge); c.rotate(lean); c.scale(1 + .1 * lunge + squash, 1 - .08 * lunge - squash * .6); c.translate(-x, -y);
    }
    if (this.spinT > 0) { c.translate(x, y - 16); c.scale(Math.cos(this.spinT * 40), 1); c.translate(-x, -(y - 16)); }
    { const f = this.lookT > 0 && this.look ? this.look : this.facing; Rig.track(this, x, y, g.time, f, this.lookT > 0 || this.castAnim > 0); }
    const st = this.drawState();
    if (this.flash > 0) Tint.draw(c, x, y, 70, .7, '#ffffff', o => drawCreature(o, this.sp, 0, 0, st, true, CONFIG.CREATURE_SCALE));
    else drawCreature(c, this.sp, x, y, st, true, CONFIG.CREATURE_SCALE);
    c.restore();
    this.drawStatus(c, g, x, y);
  }
}

/* --- Enemigos: datos, dibujo e IA --- */
function steerTo(e, tx, ty, mul = 1) { const dx = tx - e.x, dy = ty - e.y, d = Math.hypot(dx, dy); return d < 4 ? { x: 0, y: 0, mul: 0 } : { x: dx / d, y: dy / d, mul }; }
function idleBehaviour(e, dt) {
  // Sin objetivo: pasea cerca de su casa y vuelve si se ha alejado.
  if (Math.hypot(e.x - e.home.x, e.y - e.home.y) > 170) return steerTo(e, e.home.x, e.home.y, .6);
  e.wanderT -= dt;
  if (e.wanderT <= 0) {
    e.wanderT = 1.5 + Math.random() * 2.5;
    if (Math.random() < .35) e.wander = null;
    else { const a = Math.random() * Math.PI * 2, r = 20 + Math.random() * 90; e.wander = { x: e.home.x + Math.cos(a) * r, y: e.home.y + Math.sin(a) * r }; }
  }
  if (!e.wander) return { x: 0, y: 0, mul: 0 };
  const s = steerTo(e, e.wander.x, e.wander.y, .4);
  if (!s.mul) e.wander = null;
  return s;
}
const STOP = { x: 0, y: 0, mul: 0 };

/** Charco de lava enemigo (lo usan Basaltón y Magmatrón). */
function addEnemyPool(g, src, x, y, r, life) {
  g.zones.push(new Zone({
    x, y, r, life, tick: .5,
    onTick: (g, p) => Combat.circle(g, src.team || 'enemy', p.x, p.y, p.r, { dmg: 3, burn: { t: 1.5, dmg: 2 }, color: '#ff8a3d', src }),
    render(c, p, g) {
      const fade = Math.min(1, (p.life - p.t) * 2, p.t * 6);
      c.globalAlpha = .7 * fade;
      U.ellipse(c, p.x, p.y, p.r, p.r, '#5a1608'); U.ellipse(c, p.x, p.y, p.r * .8, p.r * .8, '#c43a12');
      U.ellipse(c, p.x + Math.sin(g.time * 2) * 5, p.y + Math.cos(g.time * 1.7) * 4, p.r * .4, p.r * .35, '#ff8a3d');
      c.globalAlpha = 1;
    },
  }));
}

const ENEMIES = {
  mordisquin: {
    name: 'Mordisquín', role: 'Persigue y muerde', type: 'normal', exp: 20, base: { hp: 40, atk: 55, def: 35, spa: 30, spd: 30, spe: 60 }, speed: 112, radius: 12, height: 34, aggro: 230, barW: 26,
    pal: { dark: '#4a1f1c', body: '#c4473d', spike: '#f0d9a8', mouth: '#2a0f0d', eye: '#fff2a8' },
    brain(e, dt, g, d) {
      const P = e.target || g.player;
      if (e.state === 'windup') {
        e.timer -= dt;
        if (e.timer <= 0) {
          const ang = Math.atan2(e.atk.y, e.atk.x);
          Combat.arc(g, e.team, e.x, e.y, ang, 42, deg(65), { dmg: 8, kb: 200, color: '#ff6b5b', src: e, burn: e.kind.biteBurn ? { t: 2, dmg: 2 } : null });
          Effects.slash(g, e.x, e.y, ang, 30, deg(60), e.kind.biteBurn ? '#ffb36b' : '#ff8a7a');
          e.kbx += e.atk.x * 160; e.kby += e.atk.y * 160;
          e.state = 'recover'; e.timer = .45; e.cd = (1 + Math.random() * .3) * (e.cdMul || 1);
        }
        return STOP;
      }
      if (e.state === 'recover') { e.timer -= dt; if (e.timer <= 0) e.state = 'idle'; return STOP; }
      if (e.aggro && P && P.alive) {
        if (d < 46 && e.cd <= 0) { e.state = 'windup'; e.timer = e.windupTime = .38; e.atk = { x: (P.x - e.x) / (d || 1), y: (P.y - e.y) / (d || 1) }; e.facing = e.atk; return STOP; }
        return d < 30 ? STOP : steerTo(e, P.x, P.y, 1);
      }
      return idleBehaviour(e, dt);
    },
    telegraph(c, e, x, y) {
      if (e.state !== 'windup') return;
      const k = 1 - e.timer / e.windupTime, ang = Math.atan2(e.atk.y, e.atk.x);
      c.globalAlpha = .12 + .3 * k; c.fillStyle = '#b8261c';
      c.beginPath(); c.moveTo(x, y); c.arc(x, y, 42, ang - deg(65), ang + deg(65)); c.closePath(); c.fill();
      c.globalAlpha = .5 + .5 * k; c.strokeStyle = '#ff6a4a'; c.lineWidth = 1; c.stroke(); c.globalAlpha = 1;
    },
    draw(c, st) {
      const C = st.pal, b = st.bob, open = st.windup >= 0 ? st.windup : 0, back = st.fy < -.55;
      const step = st.moving ? Math.sin(st.t * 18) * 2 : 0;
      U.ellipse(c, -6, -2 - Math.max(0, step), 3.5, 2.4, C.dark); U.ellipse(c, 6, -2 - Math.max(0, -step), 3.5, 2.4, C.dark);
      U.ellipse(c, 0, -12 - b, 12.5, 10.5, C.dark); U.ellipse(c, 0, -12.6 - b, 11.8, 9.8, C.body);
      c.fillStyle = C.spike;
      for (const sx of [-7, 0, 7]) { c.beginPath(); c.moveTo(sx - 3, -19 - b); c.lineTo(sx, -27 - b + Math.abs(sx) * .4); c.lineTo(sx + 3, -19 - b); c.fill(); }
      if (back) return;
      const ex = st.fx * 3.5, ey = st.fy * 1.5;
      U.ellipse(c, ex, -6 - b + ey + open * 2, 8, 2.5 + open * 4, C.mouth);
      c.fillStyle = '#ffffff';
      for (let i = -2; i <= 2; i++) { const tx = ex + i * 3; c.beginPath(); c.moveTo(tx - 1.2, -8 - b + ey); c.lineTo(tx, -5 - b + ey); c.lineTo(tx + 1.2, -8 - b + ey); c.fill(); }
      for (const sx of [-4.5, 4.5]) { U.ellipse(c, sx + ex, -15 - b + ey, 2.1, 2.1, C.eye); U.ellipse(c, sx + ex + st.fx, -15 - b + ey, 1, 1.2, '#1a0705'); }
      c.strokeStyle = C.mouth; c.lineWidth = 1.4; c.beginPath();
      c.moveTo(-7 + ex, -19 - b + ey); c.lineTo(-2.5 + ex, -17.5 - b + ey); c.moveTo(7 + ex, -19 - b + ey); c.lineTo(2.5 + ex, -17.5 - b + ey); c.stroke();
    },
  },
  pufon: {
    name: 'Pufón', role: 'Dispara esporas a distancia', type: 'planta', exp: 22, base: { hp: 32, atk: 25, def: 28, spa: 55, spd: 40, spe: 45 }, speed: 78, radius: 11, height: 36, aggro: 290, barW: 24,
    pal: { stemDark: '#b8a98a', stem: '#efe3c8', capDark: '#3e2457', cap: '#8b4fc4', spot: '#e6cfff', glow: '214,160,255', eye: '#2a1838' },
    brain(e, dt, g, d) {
      const P = e.target || g.player, K = e.kind;
      if (e.state === 'windup') {
        e.timer -= dt;
        if (e.timer <= 0) {
          const lead = d / 220 * .5, tx = P.x + P.vx * lead, ty = P.y + P.vy * lead;
          const base = Math.atan2(ty - e.y, tx - e.x), n = K.spread || 1;
          for (let i = 0; i < n; i++) {
            const a = base + (i - (n - 1) / 2) * deg(14), dx = Math.cos(a), dy = Math.sin(a);
            g.projectiles.push(new Projectile({ x: e.x + dx * 10, y: e.y + dy * 10, vx: dx * 220, vy: dy * 220, r: n > 1 ? 5 : 6, life: 2, dmg: n > 1 ? 7 : 9, kb: 120, team: e.team, kind: K.projKind || 'spore', color: K.projColor || '#b46cf0', burn: K.projBurn ? { t: 2, dmg: 2 } : null, src: e, h: 16 }));
          }
          Effects.burst(g, e.x, e.y - 22, K.projColor || '#d6a0ff', 6, 60, .3);
          e.state = 'recover'; e.timer = .3; e.cd = 1.7 + Math.random() * .6;
        }
        return STOP;
      }
      if (e.state === 'recover') { e.timer -= dt; if (e.timer <= 0) e.state = 'idle'; return STOP; }
      if (e.aggro && P && P.alive) {
        if (e.cd <= 0 && d < 320 && g.world.los(e.x, e.y, P.x, P.y)) { e.state = 'windup'; e.timer = e.windupTime = .45; e.facing = { x: (P.x - e.x) / (d || 1), y: (P.y - e.y) / (d || 1) }; return STOP; }
        e.strafeT -= dt; if (e.strafeT <= 0 || e.stuck) { e.strafe *= -1; e.strafeT = 1.2 + Math.random(); e.stuck = false; }
        const ux = (P.x - e.x) / (d || 1), uy = (P.y - e.y) / (d || 1);
        if (d < 140) return { x: -ux, y: -uy, mul: 1 };
        if (d > 240) return { x: ux, y: uy, mul: 1 };
        return { x: -uy * e.strafe, y: ux * e.strafe, mul: .6 };
      }
      return idleBehaviour(e, dt);
    },
    telegraph(c, e, x, y) {
      if (e.state !== 'windup') return;
      const k = 1 - e.timer / e.windupTime, n = e.kind.spread || 1, base = Math.atan2(e.facing.y, e.facing.x);
      c.globalAlpha = .25 + .45 * k; c.strokeStyle = e.kind.projColor || '#d6a0ff'; c.lineWidth = 2; c.setLineDash([5, 5]);
      for (let i = 0; i < n; i++) { const a = base + (i - (n - 1) / 2) * deg(14); c.beginPath(); c.moveTo(x, y); c.lineTo(x + Math.cos(a) * 120, y + Math.sin(a) * 120); c.stroke(); }
      c.setLineDash([]); c.globalAlpha = 1;
    },
    draw(c, st) {
      const C = st.pal, b = st.bob * .5, w = st.windup >= 0 ? st.windup : 0, puff = 1 + w * .25, back = st.fy < -.55;
      U.ellipse(c, -4, -1.5, 3, 2, C.stemDark); U.ellipse(c, 4, -1.5, 3, 2, C.stemDark);
      U.ellipse(c, 0, -8 - b, 7.5, 8, C.stemDark); U.ellipse(c, 0, -8.5 - b, 7, 7.5, C.stem);
      if (w > 0) U.ellipse(c, 0, -18 - b, 18 * puff, 11 * puff, `rgba(${C.glow},${.15 + w * .3})`);
      U.ellipse(c, 0, -17 - b, 15 * puff, 9 * puff, C.capDark); U.ellipse(c, 0, -18 - b, 14 * puff, 8 * puff, C.cap);
      for (const [sx, sy, r] of [[-7, -20, 2.2], [3, -22, 1.8], [8, -17, 1.6], [-1, -16, 1.3]]) U.ellipse(c, sx * puff, sy - b, r, r, C.spot);
      if (!back) { const ex = st.fx * 2.5; for (const sx of [-2.6, 2.6]) U.ellipse(c, sx + ex, -8 - b, 1.3, 1.9, C.eye); }
    },
  },
  pedrolon: {
    name: 'Pedrolón', role: 'Lento y muy resistente', type: 'roca', exp: 34, base: { hp: 60, atk: 60, def: 52, spa: 30, spd: 42, spe: 20 }, speed: 40, radius: 18, height: 44, aggro: 210, barW: 38,
    hbW: 26, hbH: 16, kbRes: .2, stunMul: .5, mass: 4,
    pal: { dark: '#3e3a34', body: '#7d756a', light: '#968d80', moss: '#5f8f3e', arm: '#6d665c', eye: '#ffd34d', crack: '#4c473f' },
    brain(e, dt, g, d) {
      const P = e.target || g.player;
      if (e.state === 'windup') {
        e.timer -= dt;
        if (e.timer <= 0) {
          Combat.circle(g, e.team, e.x, e.y, 74, { dmg: 12, kb: 300, color: '#c9b79c', src: e });
          Effects.ring(g, e.x, e.y, 10, 80, e.kind.slamPool ? '#ff8a3d' : '#c9b79c', .45, 7, 'ground'); Effects.burst(g, e.x, e.y - 4, '#a89a84', 22, 160, .5);
          if (e.kind.slamPool) addEnemyPool(g, e, e.x, e.y, 56, 2.5);
          if (P && Math.hypot(P.x - e.x, P.y - e.y) < 260) g.shake = Math.max(g.shake, 5);
          e.state = 'recover'; e.timer = 1; e.cd = 3.2;
        }
        return STOP;
      }
      if (e.state === 'recover') { e.timer -= dt; if (e.timer <= 0) e.state = 'idle'; return STOP; }
      if (e.aggro && P && P.alive) {
        if (d < 64 && e.cd <= 0) { e.state = 'windup'; e.timer = e.windupTime = .9; return STOP; }
        return d < 34 ? STOP : steerTo(e, P.x, P.y, 1);
      }
      return idleBehaviour(e, dt);
    },
    telegraph(c, e, x, y) {
      if (e.state !== 'windup') return;
      const k = 1 - e.timer / e.windupTime;
      c.globalAlpha = .1 + .28 * k; c.fillStyle = '#b8261c'; c.beginPath(); c.arc(x, y, 74 * k, 0, Math.PI * 2); c.fill();
      c.globalAlpha = .55 + .45 * Math.abs(Math.sin(k * 14)); c.strokeStyle = '#ff6a4a'; c.lineWidth = 1.5; c.setLineDash([6, 4]); c.beginPath(); c.arc(x, y, 74, 0, Math.PI * 2); c.stroke(); c.setLineDash([]); c.globalAlpha = 1;
    },
    draw(c, st) {
      const C = st.pal, b = st.bob * .4, w = st.windup >= 0 ? st.windup : 0, back = st.fy < -.55;
      const step = st.moving ? Math.sin(st.t * 6) * 2 : 0;
      U.ellipse(c, -9, -3 - Math.max(0, step), 5.5, 3.4, C.dark); U.ellipse(c, 9, -3 - Math.max(0, -step), 5.5, 3.4, C.dark);
      const ay = -14 - w * 18 - b;
      U.ellipse(c, -20, ay, 6.5, 6.5, C.dark); U.ellipse(c, 20, ay, 6.5, 6.5, C.dark);
      U.ellipse(c, 0, -17 - b, 19, 15, C.dark); U.ellipse(c, 0, -17.6 - b, 18, 14.2, C.body);
      U.ellipse(c, -5, -24 - b, 8, 4, C.light);
      U.ellipse(c, -3, -30 - b, 9, 3.2, C.moss);
      U.ellipse(c, -19.5, ay - .5, 5.5, 5.5, C.arm); U.ellipse(c, 20.5, ay - .5, 5.5, 5.5, C.arm);
      c.strokeStyle = C.crack; c.lineWidth = 1.2; c.beginPath(); c.moveTo(6, -27 - b); c.lineTo(10, -20 - b); c.lineTo(8, -12 - b); c.stroke();
      if (!back) { const ex = st.fx * 4, ey = st.fy * 1.5; for (const sx of [-5.5, 5.5]) U.ellipse(c, sx + ex, -18 - b + ey, 2.6, 1.7, C.eye); }
    },
  },
};

/** Variantes por bioma: mismo comportamiento base con aspecto, estadísticas y matices propios. */
const ENEMY_VARIANTS = {
  mordisquin: { base: 'mordisquin' },
  pufon: { base: 'pufon' },
  pedrolon: { base: 'pedrolon' },
  cristalido: { base: 'mordisquin', name: 'Cristálido', role: 'Persigue muy rápido', type: 'cristal', speed: 130, stats: { hp: 42, atk: 60, def: 38, spa: 30, spd: 38, spe: 75 }, pal: { dark: '#1c2f4a', body: '#4fa3d9', spike: '#c9f3ff', mouth: '#0d1a2a', eye: '#e8fbff' } },
  destello: { base: 'pufon', name: 'Destello', role: 'Dispara tres esquirlas', type: 'cristal', spread: 3, projKind: 'shard', projColor: '#8ff0ff', pal: { stemDark: '#7f8fa3', stem: '#d8e6f5', capDark: '#1d4b5c', cap: '#3fb6c9', spot: '#d9fbff', glow: '143,240,255', eye: '#0d1a2a' } },
  geodon: { base: 'pedrolon', name: 'Geodón', role: 'Coraza de cristal', type: 'roca', stats: { hp: 62, atk: 58, def: 58, spa: 35, spd: 48, spe: 20 }, pal: { dark: '#2c2540', body: '#5d5478', light: '#7a7199', moss: '#c79bff', arm: '#4d4566', eye: '#8ff0ff', crack: '#3a3352' } },
  ascuin: { base: 'mordisquin', name: 'Ascuín', role: 'Su mordisco quema', type: 'fuego', biteBurn: true, stats: { hp: 42, atk: 58, def: 36, spa: 40, spd: 34, spe: 62 }, pal: { dark: '#2a1410', body: '#e0662a', spike: '#ffd166', mouth: '#1a0705', eye: '#fff2a8' } },
  fumarola: { base: 'pufon', name: 'Fumarola', role: 'Escupe brasas que queman', type: 'fuego', projKind: 'ember', projColor: '#ff8a3d', projBurn: true, pal: { stemDark: '#5a4a44', stem: '#9c8a80', capDark: '#2a1a16', cap: '#4d3530', spot: '#ff8a3d', glow: '255,138,61', eye: '#1a0705' } },
  basalton: { base: 'pedrolon', name: 'Basaltón', role: 'Su golpe deja lava', type: 'roca', slamPool: true, pal: { dark: '#1a1414', body: '#3d3333', light: '#524545', moss: '#ff6a1a', arm: '#2e2626', eye: '#ff9a3d', crack: '#ff6a1a' } },
  // Ciénaga Sombría
  lodin: { base: 'mordisquin', name: 'Lodín', role: 'Acecha bajo el barro', type: 'planta', speed: 104, stats: { hp: 48, atk: 58, def: 40, spa: 30, spd: 36, spe: 58 }, pal: { dark: '#1e2a1c', body: '#4e6a3a', spike: '#c8d89a', mouth: '#10180c', eye: '#e8f070' } },
  esporin: { base: 'pufon', name: 'Esporín', role: 'Lanza dos esporas', type: 'planta', spread: 2, projKind: 'spore', projColor: '#a6e06a', pal: { stemDark: '#4a5a40', stem: '#8aa070', capDark: '#1e3a2a', cap: '#3a7a52', spot: '#c8f0a0', glow: '166,224,106', eye: '#0c1a10' } },
  musgon: { base: 'pedrolon', name: 'Musgón', role: 'Coraza de musgo', type: 'planta', stats: { hp: 66, atk: 56, def: 56, spa: 35, spd: 50, spe: 22 }, pal: { dark: '#1c2418', body: '#3e4a34', light: '#56664a', moss: '#5aa64b', arm: '#2e3828', eye: '#d8e070', crack: '#2a3422' } },
  // Mina Olvidada
  chispin: { base: 'mordisquin', name: 'Chispín', role: 'Muy rápido y eléctrico', type: 'electrico', speed: 126, stats: { hp: 44, atk: 62, def: 36, spa: 34, spd: 34, spe: 78 }, pal: { dark: '#2a2410', body: '#b8922c', spike: '#fff0a0', mouth: '#1a1405', eye: '#ffffff' } },
  farolillo: { base: 'pufon', name: 'Farolillo', role: 'Dispara tres chispas', type: 'electrico', spread: 3, projKind: 'shard', projColor: '#ffe066', pal: { stemDark: '#5a4a30', stem: '#a08a60', capDark: '#4a3410', cap: '#c88a2a', spot: '#fff0a0', glow: '255,224,102', eye: '#1a1005' } },
  ferron: { base: 'pedrolon', name: 'Ferrón', role: 'Puños de hierro', type: 'roca', stats: { hp: 70, atk: 64, def: 62, spa: 35, spd: 48, spe: 22 }, pal: { dark: '#1e1c1a', body: '#4a4440', light: '#6a625a', moss: '#c87a3a', arm: '#3a3430', eye: '#ffcc55', crack: '#2a2622' } },
};
function makeKind(id) { const v = ENEMY_VARIANTS[id], b = ENEMIES[v.base]; return Object.assign({}, b, v, { id, base: Object.assign({}, b.base, v.stats || {}), pal: Object.assign({}, b.pal, v.pal || {}) }); }

/* --- Jefes: un patrón de ataques por bioma, con segunda fase por debajo del 50 % --- */
const BOSSES = {
  robleton: { name: 'Robletón', base: 'pedrolon', type: 'planta', exp: 120, stats: { hp: 230, atk: 70, def: 62, spa: 60, spd: 58, spe: 40 }, speed: 46, patterns: ['slam', 'radial', 'summon'], proj: { kind: 'spore', color: '#b46cf0' }, minion: 'mordisquin', pal: { dark: '#25281a', body: '#5f6a45', light: '#7d8a5c', moss: '#3f9a3a', arm: '#4a5236', eye: '#ffe14d', crack: '#3a4128' } },
  reinageoda: { name: 'Reina Geoda', base: 'pufon', type: 'cristal', exp: 120, stats: { hp: 200, atk: 52, def: 50, spa: 74, spd: 66, spe: 60 }, speed: 64, patterns: ['rain', 'radial'], script: 'geoda', proj: { kind: 'shard', color: '#8ff0ff' }, minion: 'cristalido', pal: { stemDark: '#6f7f9a', stem: '#d8e6f5', capDark: '#3a1d5c', cap: '#9a5fe0', spot: '#8ff0ff', glow: '143,240,255', eye: '#1a1030' } },
  cienagon: { name: 'Ciénago', base: 'pedrolon', type: 'planta', exp: 120, stats: { hp: 240, atk: 72, def: 64, spa: 66, spd: 60, spe: 40 }, speed: 48, patterns: ['slam', 'rain', 'summon', 'radial'], proj: { kind: 'spore', color: '#a6e06a' }, minion: 'lodin', pal: { dark: '#16201a', body: '#3a4a3a', light: '#526652', moss: '#7ac45a', arm: '#2a362a', eye: '#e8f070', crack: '#1e2a1e' } },
  picoferro: { name: 'Picoferro', base: 'pedrolon', type: 'roca', exp: 120, stats: { hp: 250, atk: 80, def: 74, spa: 70, spd: 62, spe: 44 }, speed: 50, patterns: ['slam', 'charge', 'radial', 'summon'], proj: { kind: 'shard', color: '#ffe066' }, minion: 'chispin', pal: { dark: '#1a1714', body: '#4a423a', light: '#665c50', moss: '#e0a040', arm: '#36302a', eye: '#ffe066', crack: '#c87a3a' } },
  magmatron: { name: 'Magmatrón', base: 'pedrolon', type: 'fuego', exp: 120, stats: { hp: 250, atk: 82, def: 75, spa: 80, spd: 62, spe: 45 }, speed: 52, patterns: ['slam', 'pools', 'charge', 'radial'], proj: { kind: 'ember', color: '#ff8a3d', burn: true }, minion: 'ascuin', slamPool: true, pal: { dark: '#140c0c', body: '#3a2a2a', light: '#4e3a3a', moss: '#ff6a1a', arm: '#2a1e1e', eye: '#ffd166', crack: '#ff6a1a' } },
};
const BOSS_WIND = { slam: .95, radial: .65, summon: .8, charge: .6, rain: .7, pools: .7, dash: .55 };
function makeBossKind(id) {
  const v = BOSSES[id], b = ENEMIES[v.base];
  return Object.assign({}, b, { radius: 26, height: 74, hbW: 34, hbH: 20, kbRes: .05, stunMul: .15, mass: 12, aggro: 380, barW: 0, drawScale: 2, isBoss: true, brain: bossBrain, telegraph: bossTelegraph }, v, { id, base: Object.assign({}, b.base, v.stats), pal: Object.assign({}, b.pal, v.pal) });
}
/** Furia del guardián al 30 % de PS: +20 % de daño y recargas un 20 % más cortas hasta que muere. */
const BOSS_RAGE = { at: .3, dmg: 1.2, cd: .8, pause: 1.9, pauses: [1.9, 2.6, 3] };   // pauses: por grito (0 furia normal, 1 y 2 Reina Geoda)
/* --- Reina Geoda (guardiana de la Gruta de Cuarzo): combate en tres actos ---------------------------
   · 60 % de PS: grito y furia (+20 % de daño, recargas un 20 % más cortas) y aprende la Carga.
   · 30 % de PS: segundo grito y caen rocas del techo (bloques sólidos de 2×2 casillas).
   · Si su Carga choca contra una roca rebota y la agrieta (cada roca aguanta 2 choques). Al tercer
     choque queda ATURDIDA: no ataca, pierde la furia y recibe más daño (defensa −30 %).
   · Si el aturdimiento se acaba y sigue viva, salta sobre su objetivo y lo derriba de un golpe;
     después vuelve a enfurecerse y, si quedan pocas rocas, caen más. */
const GEODA = { rage1: .6, rage2: .3, rocks: 4, minRocks: 3, rockHp: 2, fall: 1.1, hits: 3, daze: 8, defCut: .3, leap: 1.5, dashSpeed: 620, dashTime: .6, bounce: .45 };
/** Roca caída del techo: ocupa 2×2 casillas (tx, ty = esquina superior izquierda). Sólida al aterrizar. */
class Boulder {
  constructor(id, tx, ty, fall) { this.id = id; this.tx = tx; this.ty = ty; this.hp = GEODA.rockHp; this.fall = fall; this.fallT = fall; const TS = CONFIG.TILE; this.x = (tx + 1) * TS; this.y = (ty + 2) * TS - 4; this.cx = (tx + 1) * TS; this.cy = (ty + 1) * TS; this.crack = 0; }
  get solid() { return this.fall <= 0 && this.hp > 0; }
  setSolid(world, on) { for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) world.block(this.tx + i, this.ty + j, on); }
  /** ¿El punto (px, py) toca la roca (con margen)? */
  touches(px, py, m = 6) { const TS = CONFIG.TILE; return px >= this.tx * TS - m && px <= (this.tx + 2) * TS + m && py >= this.ty * TS - m && py <= (this.ty + 2) * TS + m; }
  draw(c, g) {
    const TS = CONFIG.TILE, cx = this.cx, cy = this.cy + 6;
    if (this.fall > 0) {                                  // sombra que crece y la roca cayendo
      const k = U.clamp(1 - this.fall / (this.fallT || 1), 0, 1);
      c.globalAlpha = .18 + .35 * k; c.fillStyle = '#000'; c.beginPath(); c.ellipse(cx, cy + 10, 30 * (.4 + .6 * k), 12 * (.4 + .6 * k), 0, 0, Math.PI * 2); c.fill();
      c.globalAlpha = .7; c.strokeStyle = '#ef5b4b'; c.lineWidth = 2; c.setLineDash([5, 4]); c.beginPath(); c.ellipse(cx, cy + 10, 34, 14, 0, 0, Math.PI * 2); c.stroke(); c.setLineDash([]); c.globalAlpha = 1;
      this.drawRock(c, cx, cy - (1 - k) * 260, 1);
      return;
    }
    c.fillStyle = 'rgba(0,0,0,.4)'; c.beginPath(); c.ellipse(cx, cy + 12, 38, 13, 0, 0, Math.PI * 2); c.fill();
    c.save(); c.translate(cx, cy); c.scale(1.18, 1.18); this.drawRock(c, 0, 0, this.hp); c.restore();
  }
  drawRock(c, x, y, hp) {
    const P = typeof PAL !== 'undefined' ? PAL : {}, dark = P.rockDark || '#262833', mid = P.rock || '#3d4150', light = P.rockLight || '#5c6274', vein = P.rockVein || '#4fb8d0';
    c.fillStyle = dark; c.beginPath(); c.moveTo(x - 30, y + 10); c.lineTo(x - 33, y - 12); c.lineTo(x - 18, y - 34); c.lineTo(x + 6, y - 40); c.lineTo(x + 28, y - 26); c.lineTo(x + 33, y + 2); c.lineTo(x + 20, y + 14); c.closePath(); c.fill();
    c.fillStyle = mid; c.beginPath(); c.moveTo(x - 27, y + 6); c.lineTo(x - 29, y - 12); c.lineTo(x - 16, y - 31); c.lineTo(x + 5, y - 36); c.lineTo(x + 25, y - 24); c.lineTo(x + 29, y); c.lineTo(x + 18, y + 10); c.closePath(); c.fill();
    c.fillStyle = light; c.beginPath(); c.moveTo(x - 16, y - 30); c.lineTo(x + 5, y - 35); c.lineTo(x + 18, y - 27); c.lineTo(x + 2, y - 22); c.lineTo(x - 12, y - 20); c.closePath(); c.fill();
    c.strokeStyle = vein; c.globalAlpha = .55; c.lineWidth = 1.5; c.beginPath(); c.moveTo(x - 20, y - 4); c.lineTo(x - 8, y - 10); c.lineTo(x + 4, y - 6); c.stroke(); c.globalAlpha = 1;
    if (hp < GEODA.rockHp) {                              // grieta tras el primer choque
      c.strokeStyle = '#0a0a0e'; c.lineWidth = 2; c.beginPath(); c.moveTo(x + 2, y - 36); c.lineTo(x - 4, y - 22); c.lineTo(x + 6, y - 12); c.lineTo(x - 2, y + 2); c.lineTo(x + 4, y + 10); c.stroke();
      c.lineWidth = 1.2; c.beginPath(); c.moveTo(x - 4, y - 22); c.lineTo(x - 16, y - 18); c.moveTo(x + 6, y - 12); c.lineTo(x + 18, y - 8); c.stroke();
    }
  }
}
const Geoda = {
  stage(e) { return e.geodaStage || 0; },
  /** Cada paso del cerebro del guardián: fases, rocas y estados propios. Devuelve un movimiento o null. */
  tick(e, dt, g) {
    const k = e.kind;
    if (!g.boulders) g.boulders = [];
    for (const b of g.boulders) if (b.fall > 0) { b.fall -= dt; if (b.fall <= 0) this.land(e, g, b); }
    if (e.alive && e.hp > 0) {
      if (!e.geodaStage && e.hp < e.maxHp * GEODA.rage1) {
        e.geodaStage = 1; this.enrage(e); e.cd = Math.min(e.cd, .5);
        if (g.onBossRage) g.onBossRage(e, 1);
      } else if (e.geodaStage === 1 && e.hp < e.maxHp * GEODA.rage2) {
        e.geodaStage = 2; e.rockHits = 0; this.dropRocks(e, g, GEODA.rocks);
        if (e.state === 'windup' || e.state === 'dashing') { e.state = 'recover'; e.timer = .3; }
        e.cd = Math.min(e.cd, 1.4);
        if (g.onBossRage) g.onBossRage(e, 2);
      }
    }
    const P = e.target && e.target.alive ? e.target : g.player;
    switch (e.state) {
      case 'dashing': {
        e.timer -= dt;
        Combat.circle(g, 'enemy', e.x, e.y, e.radius + 8, { dmg: 24, kb: 380, dirx: e.atk.x, diry: e.atk.y, src: e, color: k.proj.color }, e.chargeHit);
        if (Math.random() < .7) g.fx.add({ x: e.x + (Math.random() - .5) * 30, y: e.y, vx: -e.atk.x * 60, vy: -14, life: .4, size: 4, color: 'rgba(170,220,255,.7)' });
        if (e.blockedLast) {
          const rock = this.rockAhead(e, g);
          if (rock) this.bounce(e, g, rock);
          else { e.state = 'recover'; e.timer = .7; g.shake = Math.max(g.shake, 4); }
          return STOP;
        }
        if (e.timer <= 0) { e.state = 'recover'; e.timer = .6; return STOP; }
        return { x: e.atk.x, y: e.atk.y, mul: GEODA.dashSpeed / k.speed };
      }
      case 'bounce':
        e.timer -= dt;
        if (e.timer <= 0) {
          if ((e.rockHits || 0) >= GEODA.hits) this.daze(e, g);
          else { e.state = 'recover'; e.timer = .5; }
          return STOP;
        }
        return { x: -e.atk.x, y: -e.atk.y, mul: 240 / k.speed * (e.timer / GEODA.bounce) };
      case 'dazed':
        e.timer -= dt;
        if (e.timer <= 0) this.startLeap(e, g, P);
        return STOP;
      case 'leap': {
        e.timer -= dt; e.iframes = Math.max(e.iframes || 0, .1);
        if (P && P.alive && e.timer > .3) e.target = { x: P.x, y: P.y };     // persigue la sombra hasta el último momento
        if (e.timer <= 0) this.land2(e, g);
        return STOP;
      }
    }
    return null;
  },
  enrage(e) { if (!e.enraged) { e.enraged = true; e.dmgMul *= BOSS_RAGE.dmg; } },
  calm(e) { if (e.enraged) { e.enraged = false; e.dmgMul /= BOSS_RAGE.dmg; } },
  /** Patrones según la fase: la Carga desde el 60 %, y casi siempre la Carga cuando hay rocas. */
  pickPattern(e) {
    const st = this.stage(e), base = e.kind.patterns;
    if (!st) return base.filter(p => p !== e.lastPattern)[(Math.random() * Math.max(1, base.length - 1)) | 0] || base[0];
    if (st >= 2) return e.lastPattern !== 'dash' || Math.random() < .55 ? 'dash' : base[(Math.random() * base.length) | 0];
    const opts = base.concat('dash').filter(p => p !== e.lastPattern);
    return opts[(Math.random() * opts.length) | 0];
  },
  rockAhead(e, g) {
    const r = e.radius + 10, ax = e.atk.x, ay = e.atk.y;
    for (const b of g.boulders || []) {
      if (!b.solid) continue;
      for (const s of [0, -.6, .6]) if (b.touches(e.x + ax * r - ay * s * e.radius, e.y + ay * r + ax * s * e.radius, 8)) return b;
    }
    return null;
  },
  bounce(e, g, rock) {
    e.state = 'bounce'; e.timer = GEODA.bounce; e.rockHits = (e.rockHits || 0) + 1;
    rock.hp--; rock.crack = 1;
    g.shake = Math.max(g.shake, 9);
    Effects.burst(g, rock.cx, rock.cy - 10, '#9aa4b8', 26, 220, .6); Effects.ring(g, e.x + e.atk.x * 30, e.y + e.atk.y * 30, 6, 60, '#c8d4e8', .35, 5, 'ground');
    Effects.floater(g, e.x, e.y - e.height - 30, `¡CRAC! ${Math.min(e.rockHits, GEODA.hits)}/${GEODA.hits}`, '#c8f4ff', 14);
    if (rock.hp <= 0) { rock.setSolid(g.world, false); Effects.burst(g, rock.cx, rock.cy, '#5c6274', 34, 260, .8); g.boulders = g.boulders.filter(b => b !== rock); }
    if (g.onBossEvent) g.onBossEvent(e, 'bounce', { hits: e.rockHits });
  },
  daze(e, g) {
    e.state = 'dazed'; e.timer = e.windupTime = GEODA.daze; e.dazed = true;
    this.calm(e); e.vuln = 1 / (1 - GEODA.defCut);
    Effects.floater(g, e.x, e.y - e.height - 30, '¡Aturdida! Defensa −30 %', '#ffe14d', 13);
    if (g.onBossEvent) g.onBossEvent(e, 'daze', {});
  },
  startLeap(e, g, P) {
    e.dazed = false; e.vuln = 1;
    e.state = 'leap'; e.timer = e.windupTime = GEODA.leap; e.leapFrom = { x: e.x, y: e.y };
    e.target = P ? { x: P.x, y: P.y } : { x: e.x, y: e.y };
    if (g.onBossEvent) g.onBossEvent(e, 'leap', {});
  },
  /** Aterriza sobre su objetivo: derriba de un golpe a quien esté debajo (sin esquiva posible). */
  land2(e, g) {
    const tg = e.target || { x: e.x, y: e.y };
    e.x = e.px = tg.x; e.y = e.py = tg.y; e.iframes = 0;
    // Golpe en el punto de caída (antes de apartarla si ahí no cabe, p. ej. pegado a una roca)
    for (const a of g.actors) if (a.team === 'player' && a.alive && !a.dormant && Math.hypot(a.x - tg.x, a.y - tg.y) < 64)
      Combat.hit(g, a, { team: 'enemy', dmg: 1, pct: 9, dot: true, src: e, color: '#ff3b2f', leap: true });
    this.unstick(e, g);
    g.shake = Math.max(g.shake, 14); Effects.ring(g, e.x, e.y, 10, 130, '#ff3b2f', .5, 9, 'ground'); Effects.burst(g, e.x, e.y, '#a89a84', 40, 260, .7);
    e.state = 'recover'; e.timer = 1.2; e.cd = 1.6; e.rockHits = 0;
    this.enrage(e);
    const solid = (g.boulders || []).filter(b => b.hp > 0).length;
    if (solid < GEODA.minRocks) this.dropRocks(e, g, GEODA.rocks - solid);
    if (g.onBossEvent) g.onBossEvent(e, 'land', {});
  },
  /** Elige sitios libres de 2×2 casillas alrededor del guardián, lejos de los jugadores y entre sí. */
  dropRocks(e, g, n) {
    const TS = CONFIG.TILE, W = g.world, list = g.boulders || (g.boulders = []);
    const players = g.actors.filter(a => a.team === 'player' && a.alive);
    const okTile = (tx, ty) => { const t = W.get(tx, ty); return !W.isSolid(tx, ty) && t !== T.STAIRS && t !== T.WATER && t !== T.LAVA; };
    let made = 0;
    // Tres pasadas cada vez más permisivas (si el guardián está arrinconado, se buscan sitios alrededor de los jugadores)
    const passes = [{ c: e, r0: 110, r1: 260, free: 15, sep: 120 }, { c: players[0] || e, r0: 90, r1: 320, free: 14, sep: 100 }, { c: e, r0: 70, r1: 420, free: 12, sep: 84 }];
    for (let tries = 0; tries < 900 && made < n; tries++) {
      const P = passes[Math.min(2, (tries / 300) | 0)];
      const a = Math.random() * Math.PI * 2, r = P.r0 + Math.random() * (P.r1 - P.r0);
      const cx = P.c.x + Math.cos(a) * r, cy = P.c.y + Math.sin(a) * r, tx = Math.round(cx / TS) - 1, ty = Math.round(cy / TS) - 1;
      if (![0, 1].every(j => [0, 1].every(i => okTile(tx + i, ty + j)))) continue;
      // que no tape pasillos: alrededor (anillo de 4×4) casi todo suelo
      let free = 0; for (let j = -1; j <= 2; j++) for (let i = -1; i <= 2; i++) if (okTile(tx + i, ty + j)) free++;
      if (free < P.free) continue;
      const bx = (tx + 1) * TS, by = (ty + 1) * TS;
      if (players.some(p => Math.hypot(p.x - bx, p.y - by) < 70) || Math.hypot(e.x - bx, e.y - by) < 80) continue;
      if (list.some(b => Math.hypot(b.cx - bx, b.cy - by) < P.sep)) continue;
      g.boulderN = (g.boulderN || 0) + 1;
      list.push(new Boulder(g.boulderN, tx, ty, GEODA.fall + made * .3)); made++;
    }
    return made;
  },
  land(e, g, b) {
    b.fall = 0; b.setSolid(g.world, true);
    Combat.circle(g, 'enemy', b.cx, b.cy, 42, { dmg: 14, kb: 280, src: e, color: '#9aa4b8' });
    for (const a of g.actors) if (a.alive) this.unstick(a, g);
    Effects.burst(g, b.cx, b.cy, '#8a8070', 22, 200, .6); Effects.ring(g, b.cx, b.cy + 8, 8, 56, '#c8c0b0', .35, 5, 'ground');
    g.shake = Math.max(g.shake, 6);
  },
  /** Si una roca ha caído encima de alguien, lo saca al hueco libre más cercano. */
  unstick(a, g) {
    if (!a.free || a.free(g.world, a.x, a.y)) return;
    for (let r = 8; r <= 120; r += 8) for (let k = 0; k < 16; k++) {
      const an = k / 16 * Math.PI * 2, x = a.x + Math.cos(an) * r, y = a.y + Math.sin(an) * r;
      if (a.free(g.world, x, y)) { a.x = a.px = x; a.y = a.py = y; return; }
    }
  },
};
function bossBrain(e, dt, g, d) {
  if (e.kind.script === 'geoda') { const mv = Geoda.tick(e, dt, g); if (mv) return mv; }
  else if (!e.enraged && e.alive && e.hp > 0 && e.hp < e.maxHp * BOSS_RAGE.at) {
    e.enraged = true; e.dmgMul *= BOSS_RAGE.dmg; e.cd = Math.min(e.cd, .4);
    if (g.onBossRage) g.onBossRage(e, 0);           // animación (solitario) o pausa para todos (servidor)
  }
  const P = e.target && e.target.alive ? e.target : g.player, k = e.kind, ph2 = e.hp < e.maxHp * .5;
  if (e.state === 'charging') {
    e.timer -= dt;
    Combat.circle(g, 'enemy', e.x, e.y, e.radius + 8, { dmg: 18, kb: 340, src: e, color: k.proj.color }, e.chargeHit);
    if (Math.random() < .6) g.fx.add({ x: e.x + (Math.random() - .5) * 30, y: e.y, vx: -e.atk.x * 40, vy: -10, life: .4, size: 4, color: 'rgba(200,190,170,.7)' });
    if (e.timer <= 0 || e.blockedLast) { e.state = 'recover'; e.timer = .8; if (e.blockedLast) g.shake = Math.max(g.shake, 4); }
    return { x: e.atk.x, y: e.atk.y, mul: 380 / k.speed };
  }
  if (e.state === 'windup') {
    e.timer -= dt;
    if (P && e.timer > e.windupTime * .4) { const l = Math.hypot(P.x - e.x, P.y - e.y) || 1; e.atk = { x: (P.x - e.x) / l, y: (P.y - e.y) / l }; e.target = { x: P.x, y: P.y }; }
    if (e.timer <= 0) bossExec(e, g, ph2);
    return STOP;
  }
  if (e.state === 'recover') { e.timer -= dt; if (e.timer <= 0) e.state = 'idle'; return STOP; }
  if (!e.aggro || !P || !P.alive) return idleBehaviour(e, dt);
  if (e.cd <= 0) {
    const opts = k.patterns.filter(p => p !== e.lastPattern);
    e.pattern = e.lastPattern = k.script === 'geoda' ? Geoda.pickPattern(e) : opts[(Math.random() * opts.length) | 0];
    e.state = 'windup'; e.timer = e.windupTime = BOSS_WIND[e.pattern] * (ph2 && e.pattern !== 'dash' ? .8 : 1);
    e.atk = { x: (P.x - e.x) / (d || 1), y: (P.y - e.y) / (d || 1) }; e.facing = e.atk; e.target = { x: P.x, y: P.y };
    return STOP;
  }
  return d < 70 ? STOP : steerTo(e, P.x, P.y, 1);
}
function bossExec(e, g, ph2) {
  const k = e.kind, P = e.target && e.target.alive ? e.target : g.player;
  e.cd = ((ph2 ? 1.3 : 2) + Math.random() * .6) * (e.enraged ? BOSS_RAGE.cd : 1); e.state = 'recover'; e.timer = .5;
  switch (e.pattern) {
    case 'slam':
      Combat.circle(g, 'enemy', e.x, e.y, 95, { dmg: 22, kb: 340, src: e, color: '#c9b79c' });
      Effects.ring(g, e.x, e.y, 14, 100, k.slamPool ? '#ff8a3d' : '#c9b79c', .5, 9, 'ground'); Effects.burst(g, e.x, e.y, '#a89a84', 30, 200, .6);
      if (k.slamPool) addEnemyPool(g, e, e.x, e.y, 70, 3);
      g.shake = Math.max(g.shake, 7); break;
    case 'radial': {
      const n = ph2 ? 16 : 11, off = Math.random() * Math.PI * 2;
      for (let i = 0; i < n; i++) {
        const a = off + i / n * Math.PI * 2, dx = Math.cos(a), dy = Math.sin(a);
        g.projectiles.push(new Projectile({ x: e.x + dx * 26, y: e.y + dy * 26, vx: dx * 170, vy: dy * 170, r: 6, life: 2.6, dmg: 9, kb: 120, team: 'enemy', kind: k.proj.kind, color: k.proj.color, burn: k.proj.burn ? { t: 2, dmg: 2 } : null, src: e, h: 26 }));
      }
      break;
    }
    case 'summon': {
      const alive = g.actors.filter(a => a.summoner === e && a.alive).length;
      for (let i = 0; i < Math.min(2, 4 - alive); i++) for (let t = 0; t < 14; t++) {
        const a = Math.random() * Math.PI * 2, x = e.x + Math.cos(a) * 70, y = e.y + Math.sin(a) * 70;
        const m = new Enemy(makeKind(k.minion), x, y, { level: Math.max(1, e.level - 3) });
        if (m.free(g.world, x, y)) { m.summoner = e; m.aggro = true; g.actors.push(m); Effects.burst(g, x, y - 12, '#d6a0ff', 12, 100); break; }
      }
      break;
    }
    case 'charge': e.state = 'charging'; e.timer = .75; e.chargeHit = new Set(); break;
    case 'dash': e.state = 'dashing'; e.timer = GEODA.dashTime; e.chargeHit = new Set(); e.cd = (1.1 + Math.random() * .5) * (e.enraged ? BOSS_RAGE.cd : 1); g.shake = Math.max(g.shake, 3); break;
    case 'rain': case 'pools': {
      const pools = e.pattern === 'pools', n = ph2 ? 5 : 3;
      for (let i = 0; i < n; i++) {
        const tx = (P ? P.x : e.x) + (i ? (Math.random() - .5) * 170 : 0), ty = (P ? P.y : e.y) + (i ? (Math.random() - .5) * 170 : 0);
        g.zones.push(new Zone({
          x: tx, y: ty, r: 44, delay: .9 + i * .12, life: 0,
          onStart: (g, z) => {
            Combat.circle(g, 'enemy', z.x, z.y, z.r, { dmg: 15, kb: 160, cat: 'esp', src: e, color: k.proj.color });
            Effects.burst(g, z.x, z.y - 6, k.proj.color, 14, 140); Effects.ring(g, z.x, z.y, 6, z.r + 6, k.proj.color, .35, 5, 'ground');
            if (pools) addEnemyPool(g, e, z.x, z.y, 46, 2.5);
          },
          render(c, z) {
            if (z.started) return;
            const kk = z.t / z.delay;
            c.globalAlpha = .15 + .3 * kk; c.fillStyle = '#ef5b4b'; c.beginPath(); c.arc(z.x, z.y, z.r * kk, 0, Math.PI * 2); c.fill();
            c.globalAlpha = .85; c.strokeStyle = '#ef5b4b'; c.lineWidth = 2; c.beginPath(); c.arc(z.x, z.y, z.r, 0, Math.PI * 2); c.stroke(); c.globalAlpha = 1;
          },
        }));
      }
      break;
    }
  }
}
function bossTelegraph(c, e, x, y, g) {
  if (e.state === 'leap' && e.target) {                  // sombra del salto sobre el objetivo
    const k = 1 - e.timer / (e.windupTime || 1), tx = e.target.x, ty = e.target.y;
    c.save(); c.globalAlpha = .2 + .45 * k; c.fillStyle = '#1a0606'; c.beginPath(); c.ellipse(tx, ty, 64 * (.5 + .5 * k), 26 * (.5 + .5 * k), 0, 0, Math.PI * 2); c.fill();
    c.globalAlpha = .6 + .4 * Math.sin(g.time * 24); c.strokeStyle = '#ff3b2f'; c.lineWidth = 3; c.beginPath(); c.ellipse(tx, ty, 64, 26, 0, 0, Math.PI * 2); c.stroke(); c.restore();
    return;
  }
  if (e.state === 'charging' || e.state === 'dashing') return;
  if (e.state !== 'windup') return;
  const k = 1 - e.timer / e.windupTime;
  c.save();
  switch (e.pattern) {
    case 'slam':
      c.globalAlpha = .12 + .3 * k; c.fillStyle = '#ef5b4b'; c.beginPath(); c.arc(x, y, 95 * k, 0, Math.PI * 2); c.fill();
      c.globalAlpha = .85; c.strokeStyle = '#ef5b4b'; c.lineWidth = 2.5; c.beginPath(); c.arc(x, y, 95, 0, Math.PI * 2); c.stroke(); break;
    case 'dash': {                                       // carga rápida: franja larga y parpadeo al final
      const a = Math.atan2(e.atk.y, e.atk.x), L = GEODA.dashSpeed * GEODA.dashTime, lock = k > .6;
      c.translate(x, y); c.rotate(a); c.globalAlpha = .18 + .32 * k; c.fillStyle = lock ? '#ff3b2f' : '#ef5b4b'; c.fillRect(0, -e.radius, L * k, e.radius * 2);
      c.globalAlpha = lock ? .6 + .4 * Math.sin(g.time * 40) : .7; c.strokeStyle = lock ? '#ffd0c0' : '#ef5b4b'; c.lineWidth = lock ? 3 : 2; c.strokeRect(0, -e.radius, L, e.radius * 2);
      for (let i = 1; i <= 3; i++) { const ax = L * (i / 4); c.beginPath(); c.moveTo(ax - 10, -10); c.lineTo(ax, 0); c.lineTo(ax - 10, 10); c.stroke(); }
      break;
    }
    case 'charge': {
      const a = Math.atan2(e.atk.y, e.atk.x);
      c.translate(x, y); c.rotate(a); c.globalAlpha = .15 + .3 * k; c.fillStyle = '#ef5b4b'; c.fillRect(0, -e.radius, 285 * k, e.radius * 2);
      c.globalAlpha = .7; c.strokeStyle = '#ef5b4b'; c.lineWidth = 2; c.strokeRect(0, -e.radius, 285, e.radius * 2); break;
    }
    case 'radial':
      c.globalAlpha = .4 + .4 * Math.sin(g.time * 30); c.strokeStyle = e.kind.proj.color; c.lineWidth = 3;
      c.beginPath(); c.arc(x, y - 30, 40 - 14 * k, 0, Math.PI * 2); c.stroke(); break;
    case 'summon':
      c.globalAlpha = .5; c.strokeStyle = '#d6a0ff'; c.lineWidth = 2; c.setLineDash([6, 6]); c.beginPath(); c.arc(x, y, 70, 0, Math.PI * 2); c.stroke(); break;
    default:
      if (e.target) { c.globalAlpha = .6; c.strokeStyle = '#ef5b4b'; c.lineWidth = 2; c.beginPath(); c.arc(e.target.x, e.target.y, 20 + 20 * k, 0, Math.PI * 2); c.stroke(); }
  }
  c.restore();
}
function drawCrown(c, x, y, color = '#f2b84b') {
  c.fillStyle = color; c.beginPath();
  c.moveTo(x - 7, y); c.lineTo(x - 7, y - 6); c.lineTo(x - 3.5, y - 2.5); c.lineTo(x, y - 8); c.lineTo(x + 3.5, y - 2.5); c.lineTo(x + 7, y - 6); c.lineTo(x + 7, y); c.closePath(); c.fill();
  c.strokeStyle = '#5a3a05'; c.lineWidth = 1; c.stroke();
}

class Enemy extends Actor {
  constructor(kind, x, y, o = {}) {
    const elite = !!o.elite, level = o.level || 5, st = calcStats(kind.base, level);
    if (elite) { st.hp = Math.round(st.hp * 1.4); st.def = Math.round(st.def * 1.1); st.spd = Math.round(st.spd * 1.1); }
    super(x, y, { hbW: kind.hbW || 18, hbH: kind.hbH || 12, radius: kind.radius * (elite ? 1.1 : 1), height: kind.height * (elite ? 1.12 : 1), hp: st.hp, def: st.def, team: 'enemy', kbRes: (kind.kbRes ?? 1) * (elite ? .6 : 1), stunMul: (kind.stunMul ?? 1) * (elite ? .7 : 1), mass: kind.mass || 1 });
    this.kindId = kind.id; this.kind = kind; this.elite = elite; this.final = !!o.final; this.tag = o.tag || null;
    this.level = level; this.stats = st; this.type = kind.type || 'normal';
    this.baseDmgMul = o.dmgMul || 1; this.dmgMul = this.baseDmgMul * (elite ? 1.2 : 1);
    this.vscale = (kind.drawScale || 1) * (elite ? 1.15 : 1);
    this.home = { x, y }; this.state = 'idle'; this.timer = 0; this.windupTime = 1;
    this.cd = .5 + Math.random(); this.aggro = false; this.lostT = 0;
    this.wander = null; this.wanderT = Math.random() * 2; this.strafe = Math.random() < .5 ? 1 : -1; this.strafeT = 1;
    this.showBar = 0; this.stuckT = 0; this.stuck = false; this.detour = null; this.blockedLast = false;
  }
  die(g) {
    this.alive = false; this.hp = 0;
    Effects.defeat(g, this, (this.kind.pal && this.kind.pal.eye) || '#ffffff');
    Effects.burst(g, this.x, this.y - this.height * .4, '#ffffff', this.kind.isBoss ? 40 : 16, this.kind.isBoss ? 220 : 150, .5);
    Effects.ring(g, this.x, this.y, 6, this.kind.isBoss ? 90 : 34, '#ffffff', .35, 3, 'ground');
    g.stats.defeated++;
    Sfx.play('enemyDown');
    g.onEnemyDown && g.onEnemyDown(this);
  }
  /** Objetivo: el jugador o el compañero más cercano (los que provocan atraen más). */
  pickTarget(g) {
    const P = g.player;
    if (this.team !== 'enemy' || !g.allies || !g.allies.length) return P;
    const cur = this.target;
    let best = P && P.alive ? P : null, bd = best ? Math.hypot(P.x - this.x, P.y - this.y) * (cur === P ? .8 : 1) : Infinity;
    for (const a of g.allies) {
      if (!a.alive) continue;
      let d = Math.hypot(a.x - this.x, a.y - this.y);
      if (a.taunt && d < 150) d *= .35;
      if (a === cur) d *= .8;              // no cambia de objetivo a cada momento
      if (d < bd) { bd = d; best = a; }
    }
    return best || P;
  }
  /** Percepción: actúa por su cuenta, sin esperar a que el jugador ataque. */
  think(dt, g, d, P, pAlive) {
    if (pAlive && d < this.kind.aggro && g.world.los(this.x, this.y, P.x, P.y)) {
      if (!this.aggro && this.team === 'enemy' && !this.npc && !this.kind.isBoss) Effects.floater(g, this.x, this.y - this.height - 16, '!', '#ffd166', 15);
      this.aggro = true; this.lostT = 0;
    }
    else if (this.aggro) { this.lostT += dt; if (this.lostT > 3 || !pAlive || d > this.kind.aggro * 2.4) this.aggro = false; }
    return this.kind.brain(this, dt, g, d);
  }
  update(dt, g) {
    this.px = this.x; this.py = this.y;
    this.tickCommon(dt, g);
    if (!this.alive) return;
    this.anim += dt; if (this.cd > 0) this.cd -= dt; if (this.showBar > 0) this.showBar -= dt;
    const P = this.target = this.pickTarget(g), pAlive = !!(P && P.alive);
    const d = pAlive ? Math.hypot(P.x - this.x, P.y - this.y) : Infinity;
    let want = STOP;
    if (this.status.stun > 0 || this.status.sleep > 0 || this.status.petrify > 0) {
      if (this.state === 'windup' || this.state === 'charging') { this.state = 'recover'; this.timer = .2; }
    } else {
      want = this.think(dt, g, d, P, pAlive);
      if (want.mul > 0 && this.state === 'idle') this.facing = { x: want.x, y: want.y };
      else if (this.aggro && pAlive && this.state === 'idle') this.facing = { x: (P.x - this.x) / (d || 1), y: (P.y - this.y) / (d || 1) };
      if (this.detour && this.state !== 'charging' && this.state !== 'dashing') { this.detour.t -= dt; if (this.detour.t <= 0) this.detour = null; else if (want.mul > 0) want = { x: this.detour.x, y: this.detour.y, mul: want.mul }; }
    }
    const sp = this.kind.speed * want.mul * (1 - this.status.slowAmt);
    const k = 1 - Math.exp(-10 * dt);
    this.vx += (want.x * sp - this.vx) * k; this.vy += (want.y * sp - this.vy) * k;
    const bx = this.x, by = this.y;
    this.blockedLast = this.moveBy(g.world, (this.vx + this.kbx) * dt, (this.vy + this.kby) * dt, want.mul > 0 ? want : null) && (this.state === 'charging' || this.state === 'dashing');
    const moved = Math.hypot(this.x - bx, this.y - by);
    this.moving = moved / dt > 6;
    if (want.mul > 0 && this.state !== 'charging' && this.state !== 'dashing' && this.state !== 'bounce' && moved < sp * dt * .25) {
      this.stuckT += dt;
      if (this.stuckT > .35) { this.stuckT = 0; this.stuck = true; const s = Math.random() < .5 ? 1 : -1; this.detour = { x: -want.y * s, y: want.x * s, t: .6 }; }
    } else this.stuckT = 0;
    this.bob = this.moving ? Math.abs(Math.sin(this.anim * 9)) * 2 : Math.sin(this.anim * 2) * .6 + .6;
  }
  drawTelegraph(c, g, alpha) { this.kind.telegraph && this.kind.telegraph(c, this, U.lerp(this.px, this.x, alpha), U.lerp(this.py, this.y, alpha), g); }
  draw(c, g, alpha) {
    let x = U.lerp(this.px, this.x, alpha), y = U.lerp(this.py, this.y, alpha);
    const S = CONFIG.CREATURE_SCALE * this.vscale;
    if (this.state === 'leap' && this.target) {        // salto: sube, avanza hacia la sombra y cae
      const k = U.clamp(1 - this.timer / (this.windupTime || 1), 0, 1), from = this.leapFrom || { x, y }, m = U.clamp((k - .2) / .8, 0, 1);
      x = U.lerp(from.x, this.target.x, m); y = U.lerp(from.y, this.target.y, m) - Math.sin(Math.min(1, k / .9) * Math.PI) * 190 - (k < .2 ? -k * 20 : 0);
    }
    if (this.state === 'dazed') {                        // aturdida: se tambalea con estrellas
      const k = g.time * 4; x += Math.sin(k * 1.7) * 3;
      for (let i = 0; i < 5; i++) { const a = g.time * 3 + i * 1.2566; U.ellipse(c, x + Math.cos(a) * 34, y - this.height * S * .55 - 30 + Math.sin(a) * 9, 3.2, 3.2, i % 2 ? '#ffe14d' : '#c8f4ff'); }
    }
    this.flip = this.facing.x < -.2 ? -1 : this.facing.x > .2 ? 1 : (this.flip || 1);
    const rig = this.kind.rig ? Rig.track(this, x, y, g.time, this.facing, this.state === 'windup' || this.state === 'charging') : null;
    if (this.enraged) {   // aura roja permanente del guardián enfurecido
      const pulse = .5 + .5 * Math.sin(g.time * 6), s = (this.kind.drawScale || 1);
      Art.glow(c, x, y - 18 * s, 46 * s, '255,59,47', .22 + .14 * pulse);
      if (Math.random() < .35) g.fx.add({ x: x + (Math.random() - .5) * 40 * s, y: y - Math.random() * 50 * s, vx: 0, vy: -40, life: .5, size: 2, color: '#ff5a3a', glow: true });
    }
    const st = { pal: this.kind.pal, t: this.anim, moving: this.moving, fx: this.facing.x, fy: this.facing.y, bob: this.bob, state: this.state, windup: this.state === 'windup' ? 1 - this.timer / this.windupTime : -1, scale: S };
    if (rig) Object.assign(st, rig);
    const body = o => {
      o.scale(S, S);
      if (!rig) { o.fillStyle = 'rgba(0,0,0,.42)'; o.beginPath(); o.ellipse(1, 0, this.kind.radius * 1.05, this.kind.radius * .36, 0, 0, Math.PI * 2); o.fill(); o.scale(this.flip, 1); }
      if (st.windup >= 0) o.scale(1 + .12 * st.windup, 1 - .1 * st.windup);
      else if (this.state === 'recover' && this.timer > .25) o.scale(.94, 1.08);
      if (this.flash > 0) o.scale(1.1, .9);
      this.kind.draw(o, st);
    };
    // Destellos (golpe recibido, carga del ataque, petrificación) sobre la silueta, sin filtros costosos
    const tint = this.flash > 0 ? ['#ffffff', .75] : this.status.petrify > 0 ? ['#8a8a8a', .7] : this.state === 'windup' && Math.floor(g.time * 16) % 2 ? ['#ffe0c0', .3] : null;
    if (tint) Tint.draw(c, x, y, this.height * S * .9 + 20, tint[1], tint[0], body);
    else { c.save(); c.translate(x, y); body(c); c.restore(); }
    if (this.elite || this.kind.isBoss) drawCrown(c, x, y - this.height - (this.kind.isBoss ? 4 : 2), this.kind.isBoss ? '#ffd166' : '#f2b84b');
    this.drawStatus(c, g, x, y);
    if (this.nameTag) g.renderer.label(this.nameTag, x, y - this.height - (this.team === 'enemy' ? 22 : 12), this.team === 'neutral' ? '#b8d8a0' : '#e0c27a', 8);
    if (this.team === 'enemy' && !this.kind.isBoss && (this.hp < this.maxHp || this.showBar > 0 || this.aggro)) {
      const w = this.kind.barW * (this.elite ? 1.2 : 1), bx = x - w / 2, by = y - this.height - (this.elite ? 16 : 10), r = this.hp / this.maxHp;
      c.fillStyle = 'rgba(10,8,6,.9)'; c.fillRect(bx - 1, by - 1, w + 2, 4);
      c.fillStyle = '#2a1410'; c.fillRect(bx, by, w, 2);
      c.fillStyle = r > .5 ? '#8a3a2a' : r > .2 ? '#a8562a' : '#c8402a'; c.fillRect(bx, by, Math.round(w * r), 2);
      c.fillStyle = 'rgba(255,220,180,.35)'; c.fillRect(bx, by, Math.round(w * r), 1);
      g.renderer.label('Nv' + this.level, bx - 3, by + 1, shade(TYPES[this.type].color, -.1), 6.5, { align: 'right', stroke: 2 });
    }
  }
}

/* ---------- 16. Biomes ---------- */
const BIOMES = {
  forest: {
    id: 'forest', name: 'Bosque misterioso', roomTile: T.GRASS, corrTile: T.PATH,
    obstacles: ['trees', 'trees', 'rocks', 'pond', 'pillar'],
    enemies: { chaser: 'mordisquin', ranged: 'pufon', tank: 'pedrolon' }, boss: 'robleton',
    loot: { berry: 40, crystal: 15, gems: 30, relic: 15 }, dropBerry: .22,
    mm: { floor: '#4a6a3e', corr: '#7a6446' },
    pal: {
      bg: '#050705', vignette: 'rgba(0,0,0,.6)', objBase: 'grass', flowerStyle: 'flowers', wallStyle: 'foliage',
      ambient: [6, 12, 9, .38], rays: .055, atmo: 'leaves', foliageDeep: ['#0f1a0f', '#142214'],
      grass: ['#26371f', '#2a3c22', '#23331d', '#2d4024'], blade: '#3b5530', bladeDark: '#1b2716',
      litter: ['#5a4426', '#4a3a20', '#6a5530'], roots: '#3a2a1a', moss: '#3d5a2c', vines: '#2f4a24', mushroom: '#7a3426', fern: '#3a5428',
      path: '#3d3022', pathEdge: '#241c13', pebble: '#5e5040',
      floor: ['#4a4b42', '#45463e', '#4e4f45'], floorLine: '#25261f', rubble: true,
      wallTop: '#182817', wallTopLine: '#22361f', wallFace: '#4a4d43', wallFaceLine: '#2a2c25', wallBase: '#141611', wallDeep: '#0b120b',
      rock: '#5c5d55', rockLight: '#7e7f74', rockDark: '#3a3b35',
      water: '#1d3436', waterDeep: '#142527', foam: '#5f8a84', ripple: '#7aa29c',
      lava: '#ff6a1a', lavaDark: '#5a1a0a', lavaBright: '#ffd166', lavaCrust: '#2a1410',
      crystal: '#6fd6e8', crystalLight: '#d8fbff', crystalDark: '#2a6a85', crystalGlow: 'rgba(111,214,232,.2)',
      trunk: '#3d2c1d', trunkDark: '#241910',
      canopy: ['#1b301d', '#1f3620', '#182a1a'], canopyMid: '#26422a', canopyLight: '#3f6236',
      flowers: ['#7a3426', '#c9b99a', '#3a5428', '#5a4426'], tall: '#26391f', tallLight: '#44603a',
    },
  },
  cave: {
    id: 'cave', name: 'Cueva cristalina', roomTile: T.FLOOR, corrTile: T.FLOOR,
    obstacles: ['crystals', 'crystals', 'pool', 'rocks', 'pillar'],
    enemies: { chaser: 'cristalido', ranged: 'destello', tank: 'geodon' }, boss: 'reinageoda',
    loot: { berry: 20, crystal: 35, gems: 40, relic: 15 }, dropBerry: .12,
    mm: { floor: '#3e5068', corr: '#2f3c50' },
    pal: {
      bg: '#020304', vignette: 'rgba(0,0,0,.7)', objBase: 'floor', flowerStyle: 'crystal', wallStyle: 'rock',
      ambient: [3, 5, 12, .64], atmo: 'dust', dustColor: '#9fdcff', glowDecal: '#4fb8d0', floorStyle: 'rock',
      grass: ['#22252e', '#22252e', '#22252e', '#22252e'], blade: '#2c303b', bladeDark: '#181a21',
      path: '#262a33', pathEdge: '#15171c', pebble: '#3c414e',
      floor: ['#262932', '#23262e', '#2a2d37'], floorLine: '#121318', rubble: true,
      wallTop: '#2a2c38', wallTopLine: '#3c3f4e', wallFace: '#22242e', wallFaceLine: '#14151b', wallBase: '#0b0c10', wallDeep: '#08090c', wallVein: '#3f9ab3',
      rock: '#3d4150', rockLight: '#5c6274', rockDark: '#262833', rockVein: '#4fb8d0',
      water: '#152a36', waterDeep: '#0f1f29', foam: '#4f8aa0', ripple: '#6fb0c8',
      lava: '#ff6a1a', lavaDark: '#5a1a0a', lavaBright: '#ffd166', lavaCrust: '#2a1410',
      crystal: '#62d2e8', crystalLight: '#e2fcff', crystalDark: '#1f5a75', crystalGlow: 'rgba(98,210,232,.22)',
      trunk: '#2a2c38', trunkDark: '#1a1b23',
      canopy: ['#22252e', '#22252e', '#22252e'], canopyMid: '#2c303b', canopyLight: '#3a3f4c',
      flowers: ['#62d2e8', '#8a7ad8', '#c8f4ff', '#4fb8a8'], tall: '#244a4a', tallLight: '#3f7a74',
    },
  },
  volcano: {
    id: 'volcano', name: 'Ruinas volcánicas', roomTile: T.FLOOR, corrTile: T.PATH,
    obstacles: ['lava', 'lava', 'rocks', 'pillar', 'crystals'],
    enemies: { chaser: 'ascuin', ranged: 'fumarola', tank: 'basalton' }, boss: 'magmatron',
    loot: { berry: 25, crystal: 20, gems: 35, relic: 25 }, dropBerry: .15,
    mm: { floor: '#6a3a2e', corr: '#4a3028' },
    pal: {
      bg: '#050202', vignette: 'rgba(8,0,0,.65)', objBase: 'floor', flowerStyle: 'ember', wallStyle: 'rock',
      ambient: [16, 5, 3, .56], atmo: 'embers', glowDecal: '#ff5a1a',
      grass: ['#241c1a', '#241c1a', '#241c1a', '#241c1a'], blade: '#2e2421', bladeDark: '#161110',
      path: '#2b211e', pathEdge: '#140f0d', pebble: '#433531',
      floor: ['#262020', '#221c1c', '#2b2423'], floorLine: '#171111', rubble: true,
      wallTop: '#2a201e', wallTopLine: '#3d2e2a', wallFace: '#1f1716', wallFaceLine: '#100b0a', wallBase: '#080505', wallDeep: '#070404', wallVein: '#c4461a',
      rock: '#2e2828', rockLight: '#4a4040', rockDark: '#181414', rockVein: '#ff6a1a',
      water: '#1d3436', waterDeep: '#142527', foam: '#5f8a84',
      lava: '#e8551a', lavaDark: '#4a1206', lavaBright: '#ffc46a', lavaCrust: '#1f0d08',
      crystal: '#ff7a3d', crystalLight: '#ffd6a8', crystalDark: '#6a200c', crystalGlow: 'rgba(255,106,26,.22)',
      trunk: '#2a201e', trunkDark: '#1a1412',
      canopy: ['#241c1a', '#241c1a', '#241c1a'], canopyMid: '#2e2421', canopyLight: '#3a2e2a',
      flowers: ['#ff6a1a', '#ffb347'], tall: '#3a2e22', tallLight: '#5a4630',
    },
  },
};

/** Biomas derivados: mismas piezas de escenario que uno existente, con otra paleta, obstáculos y fauna. */
function biomeVariant(from, o) { const b = BIOMES[from]; return Object.assign({}, b, o, { pal: Object.assign({}, b.pal, o.pal || {}) }); }
BIOMES.marsh = biomeVariant('forest', {
  id: 'marsh', name: 'Ciénaga', obstacles: ['pond', 'pond', 'trees', 'rocks', 'pond'],
  enemies: { chaser: 'lodin', ranged: 'esporin', tank: 'musgon' }, boss: 'cienagon',
  loot: { berry: 35, crystal: 15, gems: 32, relic: 18 }, dropBerry: .18,
  mm: { floor: '#3a5a4a', corr: '#5a5040' },
  pal: {
    bg: '#030605', vignette: 'rgba(0,4,2,.66)', ambient: [4, 10, 9, .5], rays: .03, atmo: 'dust', dustColor: '#c8f0a0',
    foliageDeep: ['#0c1612', '#101c16'], grass: ['#1f2e24', '#22332a', '#1c2a21', '#26372b'], blade: '#2f4a3a', bladeDark: '#16231b',
    litter: ['#3a3a26', '#2e3020', '#4a4a30'], moss: '#2f5040', vines: '#24402e', mushroom: '#6a3a7a', fern: '#2e4a36',
    path: '#2e2a20', pathEdge: '#1a170f', pebble: '#4a4636',
    wallTop: '#14211b', wallTopLine: '#1d2e25', wallFace: '#3a4238', wallFaceLine: '#232a22', wallBase: '#0e130f', wallDeep: '#081009',
    water: '#1a2f2a', waterDeep: '#10201c', foam: '#4f7a6a', ripple: '#6f9a88',
    trunk: '#2e2a1d', trunkDark: '#1c1a12', canopy: ['#152420', '#18291f', '#13201b'], canopyMid: '#1f3529', canopyLight: '#35553f',
    flowers: ['#6a7a3a', '#9ab07a', '#3a5a48', '#b46cf0'], tall: '#21362a', tallLight: '#3a5a44',
  },
});
BIOMES.mine = biomeVariant('cave', {
  id: 'mine', name: 'Mina', obstacles: ['crystals', 'rocks', 'rocks', 'pillar', 'pool'],
  enemies: { chaser: 'chispin', ranged: 'farolillo', tank: 'ferron' }, boss: 'picoferro',
  loot: { berry: 20, crystal: 30, gems: 40, relic: 20 }, dropBerry: .12,
  mm: { floor: '#6a5a3e', corr: '#4a3e2e' },
  pal: {
    ambient: [12, 7, 3, .6], dustColor: '#ffd9a0', glowDecal: '#e8a040',
    grass: ['#28221d', '#28221d', '#28221d', '#28221d'], blade: '#342c25', bladeDark: '#1a1612',
    path: '#2e2722', pathEdge: '#17130f', pebble: '#4a4036',
    floor: ['#2c2620', '#29231e', '#302923'], floorLine: '#15110d',
    wallTop: '#2e2620', wallTopLine: '#44382e', wallFace: '#251f1a', wallFaceLine: '#15110e', wallBase: '#0c0a08', wallDeep: '#090706', wallVein: '#c8902a',
    rock: '#443a30', rockLight: '#66584a', rockDark: '#2a231c', rockVein: '#e0a040',
    water: '#1e2a2a', waterDeep: '#141e1e', foam: '#4f7a70', ripple: '#6f9a90',
    crystal: '#e8b04a', crystalLight: '#fff0c0', crystalDark: '#6a4a14', crystalGlow: 'rgba(232,176,74,.2)',
    trunk: '#2e2620', trunkDark: '#1c1814', canopy: ['#28221d', '#28221d', '#28221d'], canopyMid: '#342c25', canopyLight: '#463c32',
    flowers: ['#e8b04a', '#c87a3a', '#fff0c0'], tall: '#4a3a24', tallLight: '#7a6038',
  },
});

/* ---------- 17. Catálogos: objetos, trampas, mazmorras, rangos ----------
   Inspirados en la estructura de la saga Mundo Misterioso, con nombres propios. */
const hashStr = s => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };

const RARITIES = {
  comun: { name: 'Común', color: '#c9c2b0' },
  pococomun: { name: 'Poco común', color: '#5fd16b' },
  rara: { name: 'Rara', color: '#5cc8ff' },
  epica: { name: 'Épica', color: '#c79bff' },
  legendaria: { name: 'Legendaria', color: '#ffb84b' },
};
const CATEGORIES = {
  consumible: { name: 'Consumibles', stack: 10 },
  material: { name: 'Materiales', stack: 20 },
  especial: { name: 'Especiales', stack: 5 },
  equipo: { name: 'Equipo', stack: 1 },
  evolucion: { name: 'Evolución', stack: 5 },
};
const EQUIP_SLOTS = { panuelo: 'Pañuelo', brazalete: 'Brazalete', talisman: 'Talismán' };
const ALL = v => ({ hp: v, atk: v, def: v, spa: v, spd: v, spe: v });

const ITEMS = {
  /* --- Consumibles --- */
  manzana: { name: 'Manzana', cat: 'consumible', rarity: 'comun', icon: 'apple', color: '#e0473c', price: 20, desc: 'Llena 50 de barriga.', use: (g, p) => p.eat(50) },
  manzanaGrande: { name: 'Manzana grande', cat: 'consumible', rarity: 'pococomun', icon: 'apple', color: '#c9302c', price: 55, desc: 'Llena 100 de barriga.', use: (g, p) => p.eat(100) },
  manzanaDorada: { name: 'Manzana dorada', cat: 'consumible', rarity: 'epica', icon: 'apple', color: '#f2b84b', price: 300, desc: 'Llena la barriga y sube su máximo en 50 durante la expedición.', use: (g, p) => { p.bellyMax = Math.min(200, p.bellyMax + 50); p.belly = p.bellyMax; return true; } },
  pocion: { name: 'Poción', cat: 'consumible', rarity: 'comun', icon: 'potion', color: '#ef5b6b', price: 30, desc: 'Recupera 35 PS al instante.', use: (g, p) => p.heal(35) },
  superpocion: { name: 'Superpoción', cat: 'consumible', rarity: 'pococomun', icon: 'potion', color: '#d0397f', price: 75, desc: 'Recupera 90 PS al instante.', use: (g, p) => p.heal(90) },
  baya: { name: 'Baya curativa', cat: 'consumible', rarity: 'comun', icon: 'berry', color: '#5c8cff', price: 25, desc: 'Recupera un 40 % de los PS máximos y algo de barriga.', use: (g, p) => p.heal(Math.round(p.maxHp * .4), 5) },
  bayaAurea: { name: 'Baya áurea', cat: 'consumible', rarity: 'rara', icon: 'berry', color: '#ffd166', price: 90, desc: 'Recupera todos los PS.', use: (g, p) => p.heal(p.maxHp, 5) },
  tonicoEnergia: { name: 'Tónico de energía', cat: 'consumible', rarity: 'comun', icon: 'potion', color: '#5cc8ff', price: 25, desc: 'Recupera 40 de energía.', use: (g, p) => p.restoreEnergy(40) },
  elixir: { name: 'Elixir', cat: 'consumible', rarity: 'pococomun', icon: 'potion', color: '#2f9fe0', price: 45, desc: 'Recupera toda la energía.', use: (g, p) => p.restoreEnergy(CONFIG.ENERGY_MAX) },
  antidoto: { name: 'Antídoto', cat: 'consumible', rarity: 'comun', icon: 'potion', color: '#9be36b', price: 20, desc: 'Elimina las quemaduras y el veneno.', use: (g, p) => p.cure(['burn']) },
  hierbaLucida: { name: 'Hierba lúcida', cat: 'consumible', rarity: 'pococomun', icon: 'herb', color: '#7dffa0', price: 40, desc: 'Elimina sueño, aturdimiento y lentitud, y te protege de ellos durante 15 s. Se puede usar dormido.', use: (g, p) => { p.cure(['sleep', 'stun', 'slow']); p.immuneT = 15; return true; } },
  panacea: { name: 'Panacea', cat: 'consumible', rarity: 'rara', icon: 'herb', color: '#ffd6f0', price: 110, desc: 'Elimina todos los estados alterados y recupera un 25 % de PS.', use: (g, p) => { p.cure(['burn', 'sleep', 'stun', 'slow']); p.hp = Math.min(p.maxHp, p.hp + Math.round(p.maxHp * .25)); return true; } },
  tonicoFuerza: { name: 'Tónico de fuerza', cat: 'consumible', rarity: 'pococomun', icon: 'potion', color: '#ff8a3d', price: 60, desc: 'Durante 30 s: +25 % de Ataque y Ataque especial.', use: (g, p) => p.addBuff('fuerza', { atk: .25, spa: .25 }, 30) },
  tonicoFerreo: { name: 'Tónico férreo', cat: 'consumible', rarity: 'pococomun', icon: 'potion', color: '#9aa0a8', price: 60, desc: 'Durante 30 s: +25 % de Defensa y Defensa especial.', use: (g, p) => p.addBuff('ferreo', { def: .25, spd: .25 }, 30) },
  cristalExp: { name: 'Cristal de experiencia', cat: 'consumible', rarity: 'epica', icon: 'gem', color: '#a6e3ff', price: 400, desc: 'Otorga la experiencia necesaria para subir un nivel.', use: (g, p) => { if (p.level >= MAX_LEVEL) return false; g.gainExp(expNeed(p.level) - p.prog.exp); return true; } },
  semillaVital: { name: 'Semilla vital', cat: 'consumible', rarity: 'rara', icon: 'seed', color: '#7dffa0', price: 150, passive: true, desc: 'Si caes debilitado, te revive con todos los PS. Se usa sola.' },
  semillaExplosiva: { name: 'Semilla explosiva', cat: 'consumible', rarity: 'comun', icon: 'seed', color: '#ff8a3d', price: 40, thrown: true, desc: 'Lánzala: estalla en 60 px y quita un 30 % de los PS de cada enemigo alcanzado.' },
  semillaSomnifera: { name: 'Semilla somnífera', cat: 'consumible', rarity: 'comun', icon: 'seed', color: '#c79bff', price: 35, thrown: true, desc: 'Lánzala: duerme 4 s a los enemigos en 70 px.' },
  semillaOjo: { name: 'Semilla ojo', cat: 'consumible', rarity: 'comun', icon: 'seed', color: '#9be36b', price: 30, desc: 'Revela todas las trampas del piso.', use: (g) => g.floorRT ? g.floorRT.revealTraps() : false },
  orbeEscape: { name: 'Orbe de escape', cat: 'consumible', rarity: 'pococomun', icon: 'orb', color: '#7fe3e8', price: 90, desc: 'Sales de la mazmorra conservando objetos y encargos cumplidos.', use: (g) => g.floorRT ? (g.endRun('escape'), true) : false },
  orbeLuminoso: { name: 'Orbe luminoso', cat: 'consumible', rarity: 'pococomun', icon: 'orb', color: '#fff2a8', price: 60, desc: 'Revela el mapa completo del piso.', use: (g) => g.floorRT ? g.floorRT.revealAll() : false },
  orbeRadar: { name: 'Orbe radar', cat: 'consumible', rarity: 'comun', icon: 'orb', color: '#ef5b4b', price: 50, desc: 'Muestra a todos los enemigos del piso en el minimapa.', use: (g) => g.floorRT ? (g.floorRT.radar = true, g.floorRT.dirty = true, true) : false },
  orbeEscalera: { name: 'Orbe escalera', cat: 'consumible', rarity: 'comun', icon: 'orb', color: '#f2b84b', price: 45, desc: 'Muestra dónde está la escalera.', use: (g) => g.floorRT ? g.floorRT.revealStairs() : false },
  orbePetrificador: { name: 'Orbe petrificador', cat: 'consumible', rarity: 'rara', icon: 'orb', color: '#9aa0a8', price: 70, desc: 'Petrifica a los enemigos cercanos hasta que reciben daño.', use: (g) => g.floorRT ? g.floorRT.petrifyNear() : false },

  /* --- Materiales (se venden o se usan en el taller de la base) --- */
  hojaTenaz: { name: 'Hoja tenaz', cat: 'material', rarity: 'comun', icon: 'leaf', color: '#5fbf5a', price: 12, biomes: ['forest'], desc: 'Hoja flexible del bosque. Material del taller.' },
  setaLuminosa: { name: 'Seta luminosa', cat: 'material', rarity: 'pococomun', icon: 'mushroom', color: '#7dffa0', price: 30, biomes: ['forest'], desc: 'Brilla en la oscuridad. Material del taller.' },
  fragmentoCuarzo: { name: 'Fragmento de cuarzo', cat: 'material', rarity: 'comun', icon: 'shard', color: '#a6e3ff', price: 15, biomes: ['cave'], desc: 'Esquirla de cristal de la gruta. Material del taller.' },
  geodaAzul: { name: 'Geoda azul', cat: 'material', rarity: 'rara', icon: 'gem', color: '#5c8cff', price: 70, biomes: ['cave'], desc: 'Piedra hueca llena de cristales. Material del taller.' },
  cenizaDensa: { name: 'Ceniza densa', cat: 'material', rarity: 'comun', icon: 'dust', color: '#8a7a70', price: 15, biomes: ['volcano'], desc: 'Ceniza volcánica compacta. Material del taller.' },
  juncoSeco: { name: 'Junco seco', cat: 'material', rarity: 'comun', icon: 'leaf', color: '#a8b46a', price: 14, biomes: ['marsh'], desc: 'Fibra resistente de la ciénaga. Material del taller.' },
  perlaCienaga: { name: 'Perla de ciénaga', cat: 'material', rarity: 'rara', icon: 'gem', color: '#9ad8c8', price: 70, biomes: ['marsh'], desc: 'Se forma en el barro durante años. Material del taller.' },
  menaCobre: { name: 'Mena de cobre', cat: 'material', rarity: 'comun', icon: 'shard', color: '#d8904a', price: 15, biomes: ['mine'], desc: 'Mineral de la mina abandonada. Material del taller.' },
  engranajeAntiguo: { name: 'Engranaje antiguo', cat: 'material', rarity: 'pococomun', icon: 'dust', color: '#c8b070', price: 32, biomes: ['mine'], desc: 'Pieza de una máquina olvidada. Material del taller.' },
  nucleoMagma: { name: 'Núcleo de magma', cat: 'material', rarity: 'rara', icon: 'gem', color: '#ff6a1a', price: 70, biomes: ['volcano'], desc: 'Aún está caliente. Material del taller.' },
  polvoEstelar: { name: 'Polvo estelar', cat: 'material', rarity: 'epica', icon: 'dust', color: '#ffd6f0', price: 150, desc: 'Polvo brillante muy escaso. Material del taller.' },

  /* --- Especiales --- */
  llave: { name: 'Llave', cat: 'especial', rarity: 'pococomun', icon: 'key', color: '#f2b84b', price: 0, desc: 'Abre una cámara del tesoro cerrada del mismo piso. Se usa sola al acercarte a la puerta y se pierde al salir.' },
  cofre: { name: 'Cofre misterioso', cat: 'especial', rarity: 'rara', icon: 'chest', color: '#a8761c', price: 0, desc: 'Tásalo en la tienda de la aldea (30 monedas) para descubrir su contenido.' },

  /* --- Equipo (las bonificaciones se suman a las estadísticas de base y nivel) --- */
  panueloRojo: { name: 'Pañuelo rojo', cat: 'equipo', slot: 'panuelo', rarity: 'comun', icon: 'scarf', color: '#e0473c', price: 60, mods: { flat: { atk: 4 } }, desc: 'Un pañuelo sencillo que anima a pelear.' },
  panueloSeda: { name: 'Pañuelo de seda', cat: 'equipo', slot: 'panuelo', rarity: 'pococomun', icon: 'scarf', color: '#7fe3e8', price: 140, mods: { pct: { spe: .08 } }, desc: 'Ligero como el aire.' },
  panueloCarmesi: { name: 'Pañuelo carmesí', cat: 'equipo', slot: 'panuelo', rarity: 'rara', icon: 'scarf', color: '#b8243a', price: 320, mods: { pct: { atk: .1, spa: .1 } }, desc: 'Teñido con pigmento de las ruinas.' },
  panueloTormenta: { name: 'Pañuelo tormenta', cat: 'equipo', slot: 'panuelo', rarity: 'epica', icon: 'scarf', color: '#ffe14d', price: 700, mods: { pct: { spa: .15, spe: .1 } }, desc: 'Chisporrotea con cada movimiento.' },
  brazalPiedra: { name: 'Brazalete de piedra', cat: 'equipo', slot: 'brazalete', rarity: 'comun', icon: 'band', color: '#9aa0a8', price: 60, mods: { flat: { def: 4 } }, desc: 'Pesado pero protector.' },
  brazalHierro: { name: 'Brazalete de hierro', cat: 'equipo', slot: 'brazalete', rarity: 'pococomun', icon: 'band', color: '#c9c2b0', price: 150, mods: { pct: { def: .1, spd: .06 } }, desc: 'Forjado por los topos mercaderes.' },
  brazalObsidiana: { name: 'Brazalete de obsidiana', cat: 'equipo', slot: 'brazalete', rarity: 'rara', icon: 'band', color: '#3a3346', price: 340, mods: { pct: { def: .18, spd: .1, spe: -.06 } }, desc: 'Muy resistente, aunque te frena un poco.' },
  brazalGeoda: { name: 'Brazalete de geoda', cat: 'equipo', slot: 'brazalete', rarity: 'epica', icon: 'band', color: '#5c8cff', price: 720, mods: { flat: { hp: 10 }, pct: { def: .15, spd: .15 } }, desc: 'Cristales que absorben los golpes.' },
  talismanVital: { name: 'Talismán vital', cat: 'equipo', slot: 'talisman', rarity: 'comun', icon: 'talisman', color: '#5fd16b', price: 70, mods: { flat: { hp: 10 } }, desc: 'Late al ritmo de tu corazón.' },
  talismanCuarzo: { name: 'Talismán de cuarzo', cat: 'equipo', slot: 'talisman', rarity: 'pococomun', icon: 'talisman', color: '#a6e3ff', price: 160, mods: { pct: { spa: .1 } }, desc: 'Concentra la energía especial.' },
  talismanBrasa: { name: 'Talismán de brasa', cat: 'equipo', slot: 'talisman', rarity: 'rara', icon: 'talisman', color: '#ff8a3d', price: 330, mods: { flat: { hp: 8 }, pct: { atk: .12 } }, desc: 'Arde sin consumirse.' },
  coronaGuardian: { name: 'Corona del guardián', cat: 'equipo', slot: 'talisman', rarity: 'epica', icon: 'crown', color: '#ffd166', price: 800, mods: { pct: ALL(.08) }, desc: 'La llevaban los guardianes de las mazmorras.' },
  lagrimaEstelar: { name: 'Lágrima estelar', cat: 'equipo', slot: 'talisman', rarity: 'legendaria', icon: 'star', color: '#ffd6f0', price: 2000, mods: { pct: Object.assign(ALL(.12), { hp: .15 }), regen: .3 }, desc: 'Cayó del cielo. Además, +30 % de regeneración de energía.' },

  /* --- Objetos de evolución --- */
  piedraTrueno: { name: 'Piedra trueno', cat: 'evolucion', rarity: 'rara', icon: 'stone', color: '#ffe14d', price: 250, evolves: 'voltrino', desc: 'Permite a Voltrino evolucionar desde el nivel 8 sin esperar al 12. Se consume al evolucionar.' },
  brasaEterna: { name: 'Brasa eterna', cat: 'evolucion', rarity: 'rara', icon: 'stone', color: '#ff6a1a', price: 250, evolves: 'magmolo', desc: 'Permite a Magmolo evolucionar desde el nivel 8 sin esperar al 14. Se consume al evolucionar.' },
  amuletoAural: { name: 'Amuleto aural', cat: 'evolucion', rarity: 'rara', icon: 'stone', color: '#7fe3e8', price: 250, evolves: 'aurin', desc: 'Permite a Aurín evolucionar desde el nivel 8 sin el nivel 13 ni la mazmorra completada. Se consume al evolucionar.' },
};
for (const [id, it] of Object.entries(ITEMS)) it.id = id;
const EVO_ITEM_MIN_LEVEL = 8;
const RARITY_ORDER = ['legendaria', 'epica', 'rara', 'pococomun', 'comun'];
/** Teclas de uso rápido: se usa el primero de la lista que se lleve y tenga efecto. */
const QUICK = { heal: ['pocion', 'baya', 'superpocion', 'bayaAurea'], food: ['manzana', 'manzanaGrande', 'manzanaDorada'], energy: ['tonicoEnergia', 'elixir'] };
const SHOP_POOL = ['manzana', 'manzanaGrande', 'pocion', 'superpocion', 'baya', 'bayaAurea', 'tonicoEnergia', 'elixir', 'antidoto', 'hierbaLucida', 'tonicoFuerza', 'tonicoFerreo', 'semillaVital', 'semillaExplosiva', 'semillaSomnifera', 'orbeEscape', 'orbeLuminoso', 'panueloRojo', 'brazalPiedra', 'talismanVital'];
/** Surtido de la tienda de la aldea: se amplía con el rango del gremio. */
const SHOP_TIERS = [
  { rank: 1, items: ['superpocion', 'elixir', 'tonicoFuerza', 'tonicoFerreo', 'orbeLuminoso', 'panueloSeda', 'brazalHierro', 'talismanCuarzo'] },
  { rank: 2, items: ['bayaAurea', 'panacea', 'orbeRadar', 'panueloCarmesi', 'brazalObsidiana', 'talismanBrasa'] },
  { rank: 3, items: ['manzanaDorada', 'coronaGuardian', 'cristalExp'] },
];
const shopStock = save => { const r = RANKS.indexOf(rankOf(save.points)); return BASE_SHOP.concat(...SHOP_TIERS.filter(t => r >= t.rank).map(t => t.items)); };
const BASE_SHOP = ['manzana', 'pocion', 'baya', 'tonicoEnergia', 'antidoto', 'hierbaLucida', 'semillaVital', 'semillaExplosiva', 'orbeEscape', 'orbeEscalera', 'panueloRojo', 'brazalPiedra', 'talismanVital'];

/** Recetas del taller: materiales + monedas → objeto. */
const RECIPES = [
  { out: 'superpocion', gems: 10, need: { hojaTenaz: 2, setaLuminosa: 1 } },
  { out: 'amuletoAural', gems: 40, need: { hojaTenaz: 3, setaLuminosa: 2 } },
  { out: 'piedraTrueno', gems: 40, need: { fragmentoCuarzo: 3, geodaAzul: 1 } },
  { out: 'brasaEterna', gems: 40, need: { cenizaDensa: 3, nucleoMagma: 1 } },
  { out: 'talismanBrasa', gems: 80, need: { cenizaDensa: 3, nucleoMagma: 2 } },
  { out: 'brazalGeoda', gems: 120, need: { geodaAzul: 2, polvoEstelar: 1 } },
  { out: 'panueloTormenta', gems: 120, need: { polvoEstelar: 1, setaLuminosa: 2, fragmentoCuarzo: 2 } },
  { out: 'amuletoAural', gems: 40, need: { juncoSeco: 3, perlaCienaga: 1 } },          // Ciénaga Sombría
  { out: 'piedraTrueno', gems: 40, need: { menaCobre: 3, engranajeAntiguo: 1 } },       // Mina Olvidada
];

/* --- Botín: TODAS las probabilidades se ajustan aquí --- */
const LOOT = {
  // Pesos de rareza por fuente. `depth` traslada peso de común a rarezas altas según el nivel de la mazmorra.
  sources: {
    enemigo:   { itemChance: .06, gemsChance: .3,  gems: [1, 3],    rolls: [1, 1], cats: ['consumible', 'material'],                                 weights: { comun: 72, pococomun: 24, rara: 3.5, epica: .5, legendaria: 0 } },
    elite:     { itemChance: .35, gemsChance: .85, gems: [4, 9],    rolls: [1, 1], cats: ['consumible', 'material', 'equipo'],                       weights: { comun: 35, pococomun: 45, rara: 16, epica: 4, legendaria: 0 } },
    suelo:     { itemChance: 1,   gemsChance: 0,   gems: [0, 0],    rolls: [1, 1], cats: ['consumible', 'material'],                                 weights: { comun: 70, pococomun: 25, rara: 4.5, epica: .5, legendaria: 0 } },
    cofre:     { itemChance: 1,   gemsChance: .7,  gems: [5, 12],   rolls: [1, 1], cats: ['consumible', 'material', 'equipo', 'evolucion'],         weights: { comun: 55, pococomun: 33, rara: 10, epica: 2,  legendaria: 0 } },
    cofreRaro: { itemChance: 1,   gemsChance: 1,   gems: [12, 25],  rolls: [1, 2], cats: ['consumible', 'material', 'equipo', 'evolucion'],         weights: { comun: 20, pococomun: 42, rara: 30, epica: 7.5, legendaria: .5 } },
    cofreJefe: { itemChance: 1,   gemsChance: 1,   gems: [35, 60],  rolls: [2, 3], cats: ['consumible', 'material', 'equipo', 'evolucion'],         weights: { comun: 0,  pococomun: 35, rara: 45, epica: 18, legendaria: 2 }, guarantee: 'equipo' },
    tasacion:  { itemChance: 1,   gemsChance: 1,   gems: [60, 160], rolls: [1, 2], cats: ['consumible', 'equipo', 'evolucion'],                     weights: { comun: 0,  pococomun: 30, rara: 45, epica: 20, legendaria: 5 } },
  },
  depth: .02,            // por nivel de mazmorra: % del peso común que pasa a rarezas superiores
  floorGemsChance: .45,  // objetos del suelo que son montones de monedas (no ocupan hueco)
  floorGems: [2, 6],
};
const Loot = {
  pick(w, rnd) { const e = Object.entries(w).filter(([, v]) => v > 0), t = e.reduce((s, [, v]) => s + v, 0); let r = rnd() * t; for (const [k, v] of e) if ((r -= v) < 0) return k; return e[e.length - 1][0]; },
  weights(src, level) {
    const w = Object.assign({}, LOOT.sources[src].weights), move = w.comun * Math.min(.6, LOOT.depth * level);
    if (move > 0) { w.comun -= move; w.pococomun += move * .55; w.rara += move * .3; w.epica += move * .12; w.legendaria += move * .03; }
    return w;
  },
  /** Un objeto de la rareza elegida, de las categorías permitidas y del bioma (los materiales son locales). */
  item(src, dng, rnd, cat) {
    const S = LOOT.sources[src], cats = cat ? [cat] : S.cats;
    let rar = this.pick(this.weights(src, dng.level), rnd);
    const order = ['legendaria', 'epica', 'rara', 'pococomun', 'comun'];
    for (let i = order.indexOf(rar); i < order.length; i++) {
      const pool = Object.values(ITEMS).filter(it => it.rarity === order[i] && cats.includes(it.cat) && it.cat !== 'especial' && it.price > 0 && (!it.biomes || it.biomes.includes(dng.biome)));
      if (pool.length) return pool[Math.floor(rnd() * pool.length)].id;
    }
    return 'manzana';
  },
  /** Tirada completa de una fuente: { items: [{id, qty}], gems }. */
  roll(src, dng, rnd = Math.random) {
    const S = LOOT.sources[src], out = { items: [], gems: 0 };
    if (rnd() < S.gemsChance) out.gems = Math.round((S.gems[0] + rnd() * (S.gems[1] - S.gems[0])) * (1 + dng.level * .08));
    if (rnd() < S.itemChance) {
      const n = S.rolls[0] + Math.floor(rnd() * (S.rolls[1] - S.rolls[0] + 1));
      for (let i = 0; i < n; i++) out.items.push({ id: this.item(src, dng, rnd), qty: 1 });
      if (S.guarantee && !out.items.some(x => ITEMS[x.id].cat === S.guarantee)) out.items.push({ id: this.item(src, dng, rnd, S.guarantee), qty: 1 });
    }
    return out;
  },
  /** Objeto suelto de un piso (o un montón de monedas). */
  floorItem(dng, rnd) {
    if (rnd() < LOOT.floorGemsChance) return { id: 'gems', amount: Math.round((LOOT.floorGems[0] + rnd() * (LOOT.floorGems[1] - LOOT.floorGems[0])) * (1 + dng.level * .15)) };
    return { id: this.item('suelo', dng, rnd), amount: 1 };
  },
};

/* --- Inventario: casillas limitadas; los objetos iguales se apilan hasta el máximo de su categoría --- */
let uidSeq = 0;
const newUid = () => 'i' + Date.now().toString(36) + (uidSeq++).toString(36);
class Inventory {
  constructor(stacks, capFn) { this.stacks = stacks; this.capFn = capFn; }
  get cap() { return this.capFn(); }
  get used() { return this.stacks.length; }
  count(id) { return this.stacks.reduce((t, s) => t + (s.id === id ? s.qty : 0), 0); }
  has(id) { return this.count(id) > 0; }
  find(uid) { return this.stacks.find(s => s.uid === uid) || null; }
  /** Cuántas unidades de `id` caben ahora mismo. */
  room(id) { const max = CATEGORIES[ITEMS[id].cat].stack; return this.stacks.reduce((t, s) => t + (s.id === id ? max - s.qty : 0), 0) + Math.max(0, this.cap - this.used) * max; }
  /** Añade hasta `qty` unidades y devuelve cuántas cupieron. */
  add(id, qty = 1) {
    const max = CATEGORIES[ITEMS[id].cat].stack; let left = qty;
    for (const s of this.stacks) if (s.id === id && s.qty < max && left > 0) { const k = Math.min(left, max - s.qty); s.qty += k; left -= k; }
    while (left > 0 && this.stacks.length < this.cap) { const k = Math.min(left, max); this.stacks.push({ uid: newUid(), id, qty: k }); left -= k; }
    return qty - left;
  }
  /** Quita `qty` unidades de `id` (de las pilas más recientes). Falla sin tocar nada si no hay suficientes. */
  take(id, qty = 1) {
    if (this.count(id) < qty) return false;
    for (let i = this.stacks.length - 1; i >= 0 && qty > 0; i--) {
      const s = this.stacks[i]; if (s.id !== id) continue;
      const k = Math.min(qty, s.qty); s.qty -= k; qty -= k; if (!s.qty) this.stacks.splice(i, 1);
    }
    return true;
  }
  takeUid(uid, qty = 1) { const i = this.stacks.findIndex(s => s.uid === uid); if (i < 0) return null; const s = this.stacks[i]; s.qty -= qty; if (s.qty <= 0) this.stacks.splice(i, 1); return s.id; }
  /** Convierte la lista de ids de versiones anteriores en pilas. */
  static fromIds(ids, cap) { const inv = new Inventory([], () => cap); ids.forEach(id => ITEMS[id] && inv.add(id)); return inv.stacks; }
}

/** Estadísticas finales = base + nivel, más el equipo y los efectos temporales.
    Se calculan siempre desde cero, así que una bonificación nunca se aplica dos veces. */
function finalStats(base, level, equip, buffs) {
  const st = calcStats(base, level), flat = {}, pct = {};
  const addMods = m => { for (const [k, v] of Object.entries(m.flat || {})) flat[k] = (flat[k] || 0) + v; for (const [k, v] of Object.entries(m.pct || {})) pct[k] = (pct[k] || 0) + v; };
  for (const slot of Object.keys(EQUIP_SLOTS)) { const e = equip && equip[slot]; if (e && ITEMS[e.id]) addMods(ITEMS[e.id].mods || {}); }
  for (const b of Object.values(buffs || {})) if (b && b.t > 0) addMods({ pct: b.pct });
  const out = {};
  for (const k of Object.keys(st)) out[k] = Math.max(1, Math.round((st[k] + (flat[k] || 0)) * (1 + (pct[k] || 0))));
  return out;
}
const equipRegen = equip => 1 + Object.keys(EQUIP_SLOTS).reduce((t, s) => t + ((equip && equip[s] && ITEMS[equip[s].id].mods.regen) || 0), 0);
const freshEquip = () => ({ panuelo: null, brazalete: null, talisman: null });
const modsText = m => {
  const parts = [];
  for (const [k, v] of Object.entries(m.flat || {})) parts.push(`${v > 0 ? '+' : ''}${v} ${STAT_NAMES[k]}`);
  for (const [k, v] of Object.entries(m.pct || {})) parts.push(`${v > 0 ? '+' : ''}${Math.round(v * 100)} % ${STAT_NAMES[k]}`);
  if (m.regen) parts.push(`+${Math.round(m.regen * 100)} % regeneración de energía`);
  return parts;
};

/** Icono de cada objeto (también se usa en el suelo de las mazmorras). */
/** Icono con contorno oscuro y saturación contenida (coherente con el resto del arte). */
const ITEM_SPRITES = {};
function itemSprite(id) {
  if (ITEM_SPRITES[id]) return ITEM_SPRITES[id];
  const cv = document.createElement('canvas'); cv.width = cv.height = 24; const c = cv.getContext('2d');
  if ('filter' in c) { c.filter = 'brightness(0)'; for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) drawItemIcon(c, id, 12 + dx, 12 + dy, 0); c.filter = 'saturate(.72) brightness(.9)'; }
  drawItemIcon(c, id, 12, 12, 0);
  return (ITEM_SPRITES[id] = cv);
}
function drawItemIconStyled(c, id, x, y, t = 0) { c.drawImage(itemSprite(id), Math.round(x - 12), Math.round(y - 12)); }
function drawItemIcon(c, id, x, y, t = 0) {
  if (id === 'gems') { for (const [ox, oy] of [[-3, 2], [3, 1], [0, -2]]) { U.ellipse(c, x + ox, y + oy + 1, 4.6, 4.6, '#a8761c'); U.ellipse(c, x + ox, y + oy, 4.6, 4.6, '#f2c14e'); U.ellipse(c, x + ox, y + oy, 2.6, 2.6, '#ffd97a'); } return; }
  if (id === 'job') { c.fillStyle = '#7dffa0'; c.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? 3 : 7; c.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r); } c.closePath(); c.fill(); return; }
  const it = ITEMS[id], col = it.color;
  switch (it.icon) {
    case 'apple': U.ellipse(c, x, y, 6, 5.5, col); c.fillStyle = '#5a3a20'; c.fillRect(x - .5, y - 8, 1.5, 3); U.ellipse(c, x + 3, y - 7, 2.5, 1.2, '#5aa64b'); U.ellipse(c, x - 2, y - 2, 1.6, 1.2, 'rgba(255,255,255,.5)'); break;
    case 'berry': U.ellipse(c, x, y, 5, 5, col); U.ellipse(c, x - 1.5, y - 1.5, 1.5, 1.5, 'rgba(255,255,255,.55)'); c.fillStyle = '#3d7330'; c.fillRect(x - 1, y - 8, 2, 3); break;
    case 'potion': c.fillStyle = 'rgba(255,255,255,.35)'; c.fillRect(x - 2, y - 8, 4, 3); U.ellipse(c, x, y + 1, 5.5, 5.5, col); c.fillStyle = col; c.fillRect(x - 2, y - 6, 4, 4); U.ellipse(c, x - 2, y - 1, 1.5, 1.8, 'rgba(255,255,255,.6)'); break;
    case 'herb': c.strokeStyle = '#3d7330'; c.lineWidth = 1.5; c.beginPath(); c.moveTo(x, y + 6); c.lineTo(x, y - 4); c.stroke(); for (const s of [-1, 1]) U.ellipse(c, x + s * 3.5, y - 3 + s, 3.5, 2, col); U.ellipse(c, x, y - 6, 2.5, 3, col); break;
    case 'seed': U.ellipse(c, x, y, 3.8, 5.5, '#6b4a2b'); U.ellipse(c, x, y, 2.4, 4, col); break;
    case 'orb': U.ellipse(c, x, y, 7 + Math.sin(t * 4) * .6, 7, 'rgba(255,255,255,.12)'); U.ellipse(c, x, y, 5.5, 5.5, col); U.ellipse(c, x - 2, y - 2, 1.8, 1.8, 'rgba(255,255,255,.7)'); break;
    case 'gem': c.fillStyle = col; c.beginPath(); c.moveTo(x - 5, y - 2); c.lineTo(x - 2, y - 6); c.lineTo(x + 2, y - 6); c.lineTo(x + 5, y - 2); c.lineTo(x, y + 6); c.closePath(); c.fill(); c.fillStyle = 'rgba(255,255,255,.55)'; c.fillRect(x - 2, y - 5, 2, 3); break;
    case 'shard': c.fillStyle = col; c.beginPath(); c.moveTo(x - 2, y + 6); c.lineTo(x - 4, y - 2); c.lineTo(x, y - 7); c.lineTo(x + 3, y - 1); c.lineTo(x + 2, y + 6); c.closePath(); c.fill(); c.fillStyle = 'rgba(255,255,255,.6)'; c.fillRect(x - 1, y - 4, 1.2, 6); break;
    case 'leaf': c.fillStyle = col; c.beginPath(); c.ellipse(x, y, 3.5, 7, .6, 0, Math.PI * 2); c.fill(); c.strokeStyle = '#2f6b2f'; c.lineWidth = 1; c.beginPath(); c.moveTo(x - 4, y + 5); c.lineTo(x + 4, y - 5); c.stroke(); break;
    case 'mushroom': c.fillStyle = '#efe3c8'; c.fillRect(x - 1.5, y - 1, 3, 6); U.ellipse(c, x, y - 2, 6, 4, col); U.ellipse(c, x - 2, y - 3, 1.2, 1, '#ffffff'); break;
    case 'dust': for (let i = 0; i < 6; i++) U.ellipse(c, x + Math.cos(i * 1.7) * 4, y + Math.sin(i * 2.3) * 3 + 1, 1.8, 1.8, col); U.ellipse(c, x, y + 4, 6, 2, 'rgba(0,0,0,.2)'); break;
    case 'key': c.strokeStyle = col; c.lineWidth = 2; c.beginPath(); c.arc(x - 3, y, 3, 0, Math.PI * 2); c.moveTo(x, y); c.lineTo(x + 7, y); c.lineTo(x + 7, y + 3); c.stroke(); break;
    case 'chest': c.fillStyle = col; c.fillRect(x - 7, y - 5, 14, 10); c.fillStyle = '#ffd166'; c.fillRect(x - 7, y - 5, 14, 2); c.fillRect(x - 1, y - 2, 2, 3); break;
    case 'scarf': c.fillStyle = col; c.beginPath(); c.moveTo(x - 7, y - 4); c.quadraticCurveTo(x, y + 1, x + 7, y - 4); c.lineTo(x + 7, y - 1); c.quadraticCurveTo(x, y + 4, x - 7, y - 1); c.closePath(); c.fill(); c.fillRect(x + 1, y, 3, 7); c.fillRect(x - 3, y, 3, 6); break;
    case 'band': c.strokeStyle = col; c.lineWidth = 3; c.beginPath(); c.ellipse(x, y, 6, 4, 0, 0, Math.PI * 2); c.stroke(); c.fillStyle = '#ffd166'; c.fillRect(x - 1.5, y - 6, 3, 3); break;
    case 'talisman': c.strokeStyle = '#c9a23b'; c.lineWidth = 1; c.beginPath(); c.moveTo(x - 4, y - 8); c.lineTo(x, y - 3); c.lineTo(x + 4, y - 8); c.stroke(); c.fillStyle = col; c.beginPath(); c.moveTo(x, y - 4); c.lineTo(x + 5, y + 1); c.lineTo(x, y + 6); c.lineTo(x - 5, y + 1); c.closePath(); c.fill(); U.ellipse(c, x - 1, y, 1.2, 1.2, '#ffffff'); break;
    case 'crown': drawCrown(c, x, y + 4, col); break;
    case 'star': c.fillStyle = col; c.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? 3 : 7.5; c.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r); } c.closePath(); c.fill(); U.ellipse(c, x, y, 2, 2, '#ffffff'); break;
    case 'stone': U.ellipse(c, x, y, 6.5, 5.5, '#4a4466'); U.ellipse(c, x - .5, y - .5, 5, 4.2, col); c.strokeStyle = 'rgba(255,255,255,.7)'; c.lineWidth = 1; c.beginPath(); c.moveTo(x - 2, y - 2); c.lineTo(x + 1, y); c.lineTo(x - 1, y + 2); c.stroke(); break;
    default: U.ellipse(c, x, y, 5, 5, col);
  }
}


const TRAPS = {
  pinchos: { name: 'Trampa de pinchos', color: '#c9b79c' },
  veneno: { name: 'Trampa venenosa', color: '#9be36b' },
  somnifera: { name: 'Trampa somnífera', color: '#c79bff' },
  teletransporte: { name: 'Trampa de teletransporte', color: '#7fe3e8' },
  rafaga: { name: 'Trampa de ráfaga', color: '#d8e6f5' },
  hambre: { name: 'Trampa de hambre', color: '#ffb36b' },
  explosiva: { name: 'Trampa explosiva', color: '#ff6a1a' },
  invocacion: { name: 'Trampa de invocación', color: '#ef5b4b' },
  agujero: { name: 'Agujero', color: '#2a1c05' },
  purificadora: { name: 'Baldosa purificadora', color: '#5cc8ff', visible: true },
};

/** Curva de dificultad: cada mazmorra es un paso moderado respecto a la anterior (nivel del guardián
 *  ≈ nivel base + mitad de los pisos + 2: 7 · 9 · 13 · 16 · 20). */
const DUNGEONS = [
  {
    id: 'bosque', name: 'Bosque Brumoso', biome: 'forest', floors: 5, waypoint: 0, boss: 'robleton', level: 3, unlock: null, color: '#5aa64b',
    desc: 'Senderos entre árboles y niebla. Ideal para empezar.',
    enemies: { mordisquin: 50, pufon: 32, pedrolon: 18 }, enemyBase: 3,
    traps: [0, 2], trapPool: { purificadora: 4, pinchos: 3, rafaga: 2, hambre: 2, somnifera: 1 },
    monsterHouse: 0, shop: 0, hiddenStairs: 0, dark: 0, treasure: .12, wind: 300,   // sin tiendas: el Topo se presenta al final
  },
  {
    id: 'gruta', name: 'Gruta de Cuarzo', biome: 'cave', floors: 6, waypoint: 3, boss: 'reinageoda', level: 5, unlock: 'bosque', color: '#7fe8ff',
    desc: 'Galerías de cristal y los primeros pisos sin luz. Un paso más que el bosque.',
    enemies: { cristalido: 45, destello: 35, geodon: 20 }, enemyBase: 2, enemyStep: 3,   // pocos enemigos: +1 cada 3 pisos
    traps: [1, 2], trapPool: { purificadora: 3, pinchos: 3, veneno: 2, somnifera: 2, teletransporte: 2, rafaga: 2, hambre: 2 },
    monsterHouse: 0, shop: .08, hiddenStairs: .1, dark: .25, treasure: .15, wind: 300,
  },
  {
    id: 'cienaga', name: 'Ciénaga Sombría', biome: 'marsh', floors: 7, waypoint: 4, boss: 'cienagon', level: 8, unlock: 'gruta', color: '#8ac46a',
    desc: 'Charcas, niebla verde y esporas. Aparecen los primeros nidos de monstruos.',
    enemies: { lodin: 45, esporin: 33, musgon: 22 }, enemyBase: 3, enemyStep: 3,
    traps: [1, 3], trapPool: { purificadora: 2, pinchos: 3, veneno: 4, somnifera: 3, teletransporte: 1, rafaga: 2, hambre: 2 },
    monsterHouse: .05, shop: .1, hiddenStairs: .15, dark: .15, treasure: .15, wind: 300,
  },
  {
    id: 'mina', name: 'Mina Olvidada', biome: 'mine', floors: 8, waypoint: 4, boss: 'picoferro', level: 11, unlock: 'cienaga', color: '#e8b04a',
    desc: 'Túneles a oscuras, trampas por todas partes y criaturas eléctricas muy rápidas.',
    enemies: { chispin: 42, farolillo: 33, ferron: 25 }, enemyBase: 3, enemyStep: 2,
    traps: [2, 4], trapPool: { purificadora: 2, pinchos: 3, veneno: 2, somnifera: 2, teletransporte: 3, rafaga: 2, hambre: 2, explosiva: 2, agujero: 2, invocacion: 1 },
    monsterHouse: .09, shop: .1, hiddenStairs: .2, dark: .35, treasure: .17, wind: 320,
  },
  {
    id: 'crater', name: 'Cráter Ceniciento', biome: 'volcano', floors: 10, waypoint: 5, boss: 'magmatron', level: 14, unlock: 'mina', color: '#ff6a1a',
    desc: 'Ruinas sobre ríos de lava. Nidos de monstruos y escaleras secretas.',
    enemies: { ascuin: 45, fumarola: 33, basalton: 22 }, enemyBase: 5,
    traps: [3, 5], trapPool: { purificadora: 2, pinchos: 3, veneno: 2, somnifera: 2, teletransporte: 2, rafaga: 2, hambre: 2, explosiva: 3, invocacion: 2, agujero: 2 },
    monsterHouse: .14, shop: .10, hiddenStairs: .25, dark: .2, treasure: .18, wind: 330,
  },
];
const dungeonById = id => DUNGEONS.find(d => d.id === id);
/** Presentación del vecino de las misiones (Pico Cartero): mazmorra, piso y pausa de la escena de los ruidos. */
const COURIER_INTRO = { dungeon: 'gruta', floor: 2, pause: 3.4 };
/** ¿Puede entrar? Si ha completado la anterior (o esta misma, para partidas de versiones con otro orden). */
const dungeonOpen = (save, d) => !d.unlock || save.cleared.includes(d.unlock) || save.cleared.includes(d.id);
const RANKS = [
  { name: 'Normal', pts: 0, bag: 12, jobs: 3 },
  { name: 'Bronce', pts: 60, bag: 16, jobs: 4 },
  { name: 'Plata', pts: 200, bag: 20, jobs: 5 },
  { name: 'Oro', pts: 450, bag: 24, jobs: 6 },
  { name: 'Diamante', pts: 900, bag: 32, jobs: 8 },
];
const rankOf = pts => { let r = RANKS[0]; for (const k of RANKS) if (pts >= k.pts) r = k; return r; };
const enemyLevel = (dng, floorNo) => dng.level + Math.floor((floorNo - 1) / 2);

const weighted = (w, rnd) => { const e = Object.entries(w).filter(([, v]) => v > 0), t = e.reduce((s, [, v]) => s + v, 0); let r = rnd() * t; for (const [k, v] of e) if ((r -= v) < 0) return k; return e[0][0]; };

/* --- Encargos del tablón --- */
const CLIENT_NAMES = ['Lumi', 'Tobo', 'Pipa', 'Nara', 'Bruno', 'Ceci', 'Mirlo', 'Olga', 'Rufo', 'Tila'];
const OUTLAW_NAMES = ['Garra Negra', 'Colmillo Gris', 'la Sombra', 'Pico Torcido', 'Zarpa Roja'];
const JOB_ITEMS = ['Collar perdido', 'Piedra lunar', 'Pluma azul', 'Bufanda roja', 'Gema rara'];
const STARS = ['E', 'D', 'C', 'B', 'A', 'S'];
const Jobs = {
  /** Pesos de cada tipo de misión en el tablón. */
  weights: { rescue: 2, find: 2, outlaw: 2, hunt: 3, collect: 2, explore: 2, boss: 1, expedition: 1 },
  board(save, seed) {
    const rnd = U.rng(seed), jobs = [];
    const open = DUNGEONS.filter(d => dungeonOpen(save, d));
    for (let i = 0; i < 6; i++) {
      const d = open[Math.floor(rnd() * open.length)], type = weighted(this.weights, rnd);
      const client = CLIENT_NAMES[Math.floor(rnd() * CLIENT_NAMES.length)];
      const job = { id: (seed % 100000) * 10 + i, type, dungeon: d.id, client, state: 'board', progress: 0, goal: 1 };
      let diff;
      if (isLegacyJob(job)) {
        job.floor = 1 + Math.floor(rnd() * d.floors);
        diff = Math.floor((enemyLevel(d, job.floor) + (type === 'outlaw' ? 3 : 0)) / 3);
        job.target = type === 'outlaw' ? OUTLAW_NAMES[Math.floor(rnd() * OUTLAW_NAMES.length)] : type === 'find' ? JOB_ITEMS[Math.floor(rnd() * JOB_ITEMS.length)] : client;
      } else if (type === 'hunt') {
        job.target = weighted(d.enemies, rnd); job.goal = 3 + Math.floor(rnd() * 4); diff = Math.floor((d.level + job.goal / 2) / 3);
      } else if (type === 'collect') {
        const pool = Object.values(ITEMS).filter(it => it.cat === 'material' && it.biomes && it.biomes.includes(d.biome) && (it.rarity === 'comun' || it.rarity === 'pococomun'));
        const it = pool[Math.floor(rnd() * pool.length)]; job.target = it.id; job.goal = it.rarity === 'comun' ? 2 : 1; diff = Math.floor((d.level + 3) / 3);
      } else if (type === 'explore') {
        job.goal = 8 + Math.floor(rnd() * 8); diff = Math.floor((d.level + job.goal / 4) / 3);
      } else if (type === 'boss') {
        job.target = d.boss; diff = Math.floor((d.level + 8) / 3);
      } else {
        job.reach = Math.max(2, Math.ceil(d.floors * .6)); diff = Math.floor((enemyLevel(d, job.reach) + 2) / 3);
      }
      diff = Math.max(0, Math.min(5, diff));
      job.stars = STARS[diff];
      job.reward = { exp: 25 + diff * 30, gems: ECONOMY.jobBase + diff * ECONOMY.jobPerStar + Math.floor(rnd() * 20), item: ['baya', 'manzanaGrande', 'elixir', 'semillaVital', 'orbeEscape', 'semillaExplosiva'][Math.min(5, Math.floor(rnd() * (2 + diff)))], points: [10, 20, 35, 50, 75, 100][diff] };
      jobs.push(job);
    }
    return jobs;
  },
  title(j) {
    const d = dungeonById(j.dungeon);
    if (j.type === 'rescue') return `Rescatar a ${j.client} · ${d.name} P${j.floor}`;
    if (j.type === 'find') return `Encontrar «${j.target}» · ${d.name} P${j.floor}`;
    if (j.type === 'outlaw') return `Derrotar al forajido ${j.target} · ${d.name} P${j.floor}`;
    if (j.type === 'hunt') return `Derrotar ${j.goal} × ${makeKind(j.target).name} · ${d.name}`;
    if (j.type === 'collect') return `Encontrar ${j.goal} × ${ITEMS[j.target].name} · ${d.name}`;
    if (j.type === 'explore') return `Explorar ${j.goal} salas · ${d.name}`;
    if (j.type === 'boss') return `Vencer a ${makeBossKind(j.target).name}, guardián de ${d.name}`;
    return `Expedición: llegar al piso ${j.reach} de ${d.name} y volver`;
  },
  kindLabel(j) { return { rescue: 'Rescate', find: 'Búsqueda', outlaw: 'Forajido', hunt: 'Caza', collect: 'Recolección', explore: 'Exploración', boss: 'Guardián', expedition: 'Expedición' }[j.type]; },
};

/* --- Economía: todas las cifras de precios y recompensas en un sitio --- */
const ECONOMY = {
  sellRate: .3,        // se vende al 30 % del precio de compra (nunca se gana comprando y vendiendo)
  dungeonMarkup: 1.25, // la tienda de la mazmorra cobra un 25 % más
  appraise: 30,        // tasar un cofre misterioso
  jobBase: 40, jobPerStar: 35,
};
const sellPrice = id => Math.max(1, Math.round(ITEMS[id].price * ECONOMY.sellRate));

/* --- Guardado (solo en este navegador) ---
   Formato: { format, v, savedAt, sum, data }. `data` es una copia saneada con SOLO datos
   reconstruibles (nada de objetos del motor). `sum` detecta guardados dañados.
   Copia de seguridad: al volver a la aldea (punto seguro) se copia el guardado bueno. */
const SAVE_KEY = 'mystery-action-save-v1';
const BACKUP_KEY = 'mystery-action-save-backup';
const OPTIONS_KEY = 'mystery-action-options';
const SAVE_VERSION = 5;
const Store = {
  ok: (() => { try { const k = '__ma_test__'; localStorage.setItem(k, '1'); localStorage.removeItem(k); return true; } catch (e) { return false; } })(),
  mem: {},
  get(k) { try { return this.ok ? localStorage.getItem(k) : (this.mem[k] ?? null); } catch (e) { return this.mem[k] ?? null; } },
  set(k, v) { try { if (this.ok) localStorage.setItem(k, v); else this.mem[k] = v; return true; } catch (e) { this.mem[k] = v; return false; } },
  del(k) { try { if (this.ok) localStorage.removeItem(k); } catch (e) { /* nada */ } delete this.mem[k]; },
};
/** Suma de comprobación FNV-1a (32 bits) del texto guardado. */
const checksum = str => { let h = 0x811c9dc5; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); } return (h >>> 0).toString(36); };
const isInt = (v, min = 0, max = 1e9) => Number.isFinite(v) && v >= min && v <= max;
const toInt = (v, def, min = 0, max = 1e9) => Number.isFinite(+v) ? Math.min(max, Math.max(min, Math.floor(+v))) : def;

const Save = {
  fresh(speciesId) { return { v: SAVE_VERSION, species: speciesId, prog: Progress.fresh(speciesId), bank: 50, inv: Inventory.fromIds(['manzana', 'baya', 'baya', 'pocion', 'tonicoEnergia', 'orbeEscape'], 32), equip: freshEquip(), team: [], points: 0, cleared: [], jobs: [], board: [], boardSeed: 1 + Math.floor(Math.random() * 1e6), runs: 0, delivered: 0, activeRun: null }; },
  /** Con la cuenta online activa (Game.account) el perfil vive en el servidor: no se escribe en este navegador. */
  readOnly: false,
  /** Valida y repara una partida. Devuelve { ok, data, fixes } — `data` es un objeto nuevo y plano. */
  sanitize(raw) {
    const fixes = [], fail = why => ({ ok: false, data: null, fixes: [why] });
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return fail('no es un objeto');
    if (!FORMS[raw.species]) return fail('especie desconocida');
    const out = { v: SAVE_VERSION, species: raw.species };
    // Progreso: nivel, experiencia, movimientos y evoluciones
    const p = raw.prog && typeof raw.prog === 'object' ? raw.prog : null;
    if (!p) fixes.push('progreso ausente: se crea de nuevo');
    const level = toInt(p && p.level, 5, 1, MAX_LEVEL);
    const base = Progress.fresh(raw.species, level);
    let known = Array.isArray(p && p.known) ? [...new Set(p.known.filter(m => MOVES[m]))] : [];
    if (!known.length) { known = base.known; fixes.push('movimientos repuestos'); }
    const ult = FORMS[raw.species] && FORMS[raw.species].ultimate, slots = Progress.slots(level);   // el definitivo va en su propio hueco (G)
    let equipped = Array.isArray(p && p.equipped) ? [...new Set(p.equipped.filter(m => known.includes(m) && m !== ult))].slice(0, slots) : [];
    if (!equipped.length) { equipped = known.filter(m => m !== ult).slice(0, slots); fixes.push('movimientos equipados repuestos'); }
    const evolutions = Array.isArray(p && p.evolutions) ? p.evolutions.filter(e => e && FORMS[e.from] && FORMS[e.to]).map(e => ({ from: e.from, to: e.to, level: toInt(e.level, level, 1, MAX_LEVEL) })) : [];
    const exp = level >= MAX_LEVEL ? 0 : toInt(p && p.exp, 0, 0, expNeed(level) - 1);
    if (p && p.exp !== exp) fixes.push('experiencia corregida');
    out.prog = { level, exp, known, equipped, evolutions, evoHint: !!(p && p.evoHint) };
    // Monedas, rango y registro
    out.bank = toInt(raw.bank, 0); if (raw.bank !== out.bank) fixes.push('monedas corregidas');
    out.points = toInt(raw.points, 0);
    out.cleared = Array.isArray(raw.cleared) ? [...new Set(raw.cleared.filter(id => dungeonById(id)))] : [];
    for (const k of ['runs', 'delivered', 'sold', 'bought', 'rests']) out[k] = toInt(raw[k], 0);
    out.boardSeed = toInt(raw.boardSeed, 1 + Math.floor(Math.random() * 1e6), 1, 1e7);
    // Inventario (pilas válidas, sin uid repetidos, sin pasar del máximo de cada pila)
    let invSrc = Array.isArray(raw.inv) ? raw.inv : Array.isArray(raw.bag) ? Inventory.fromIds(raw.bag, 40) : [];
    const uids = new Set();
    out.inv = [];
    for (const st of invSrc) {
      if (!st || !ITEMS[st.id]) { fixes.push('objeto desconocido eliminado'); continue; }
      const qty = toInt(st.qty, 0, 0, CATEGORIES[ITEMS[st.id].cat].stack); if (!qty) continue;
      let uid = typeof st.uid === 'string' && st.uid.length < 40 ? st.uid : newUid(); if (uids.has(uid)) { uid = newUid(); fixes.push('identificador repetido'); }
      uids.add(uid); out.inv.push({ uid, id: st.id, qty });
      if (out.inv.length >= 40) break;
    }
    out.equip = freshEquip();
    for (const slot of Object.keys(EQUIP_SLOTS)) {
      const e = raw.equip && raw.equip[slot];
      if (e && ITEMS[e.id] && ITEMS[e.id].slot === slot) out.equip[slot] = { uid: typeof e.uid === 'string' ? e.uid : newUid(), id: e.id };
      else if (e) fixes.push('equipo no válido retirado');
    }
    // Compañeros
    const kinds = new Set(); out.team = [];
    for (const m of Array.isArray(raw.team) ? raw.team : []) {
      if (!m || !ENEMY_VARIANTS[m.kind] || kinds.has(m.kind) || out.team.length >= RECRUIT.rosterMax) { fixes.push('compañero no válido'); continue; }
      kinds.add(m.kind);
      const lv = toInt(m.level, 3, 1, MAX_LEVEL);
      out.team.push({ uid: typeof m.uid === 'string' ? m.uid : newUid(), kind: m.kind, name: typeof m.name === 'string' && m.name.trim() ? m.name.slice(0, 24) : makeKind(m.kind).name, level: lv, exp: lv >= MAX_LEVEL ? 0 : toInt(m.exp, 0, 0, expNeed(lv) - 1), active: !!m.active, fainted: !!m.fainted, hp: Number.isFinite(m.hp) && m.hp > 0 ? Math.round(m.hp) : null, from: dungeonById(m.from) ? m.from : null });
    }
    let act = 0; for (const m of out.team) if (m.active && ++act > RECRUIT.partyMax) { m.active = false; fixes.push('demasiados compañeros en el grupo'); }
    // Misiones
    const job = (j, states) => {
      if (!j || !Jobs.weights[j.type] || !dungeonById(j.dungeon) || !j.reward || !ITEMS[j.reward.item]) return null;
      const goal = toInt(j.goal, 1, 1, 99), o = { id: toInt(j.id, 0), type: j.type, dungeon: j.dungeon, client: typeof j.client === 'string' ? j.client.slice(0, 24) : 'Cliente', stars: STARS.includes(j.stars) ? j.stars : 'E',
        target: j.target, goal, progress: toInt(j.progress, 0, 0, goal), state: states.includes(j.state) ? j.state : states[0],
        reward: { exp: toInt(j.reward.exp, 30), gems: toInt(j.reward.gems, 40), item: j.reward.item, points: toInt(j.reward.points, 10) } };
      if (j.floor != null) o.floor = toInt(j.floor, 1, 1, 30);
      if (j.reach != null) o.reach = toInt(j.reach, 1, 1, 30);
      if (o.type === 'hunt' && !ENEMY_VARIANTS[o.target]) return null;
      if (o.type === 'collect' && !ITEMS[o.target]) return null;
      if (o.state === 'done' && o.progress < o.goal) o.state = 'accepted';
      if (o.state === 'accepted' && !isLegacyJob(o) && o.progress >= o.goal) o.state = 'done';
      return o;
    };
    out.jobs = (Array.isArray(raw.jobs) ? raw.jobs : []).map(j => job(j, ['accepted', 'done'])).filter(Boolean);
    out.board = (Array.isArray(raw.board) ? raw.board : []).map(j => job(j, ['board'])).filter(Boolean);
    if ((raw.jobs || []).length !== out.jobs.length) fixes.push('misiones no válidas eliminadas');
    out.activeRun = raw.activeRun && dungeonById(raw.activeRun.dng) ? { dng: raw.activeRun.dng, at: toInt(raw.activeRun.at, 0, 0, 1e15) } : null;
    return { ok: true, data: out, fixes };
  },
  envelope(s) { const clean = this.sanitize(s); if (!clean.ok) return null; const json = JSON.stringify(clean.data); return JSON.stringify({ format: 'mystery-action', v: SAVE_VERSION, savedAt: Date.now(), sum: checksum(json), data: clean.data }); },
  /** Lee y valida una clave. { save, savedAt, error } */
  read(key) {
    const txt = Store.get(key); if (txt == null) return { save: null, error: null };
    let obj; try { obj = JSON.parse(txt); } catch (e) { return { save: null, error: 'el archivo no se puede leer' }; }
    let data = obj, savedAt = null;
    if (obj && obj.format === 'mystery-action') {
      if (!obj.data || checksum(JSON.stringify(obj.data)) !== obj.sum) return { save: null, error: 'la suma de comprobación no coincide' };
      data = obj.data; savedAt = obj.savedAt;
    } else if (!obj || ![1, 2, 3, 4, 5].includes(obj.v)) return { save: null, error: 'formato desconocido' };
    const r = this.sanitize(data);
    return r.ok ? { save: r.data, savedAt, fixes: r.fixes, error: null } : { save: null, error: r.fixes[0] };
  },
  /** Carga el guardado principal; si está dañado, recupera la copia de seguridad. */
  loadDetailed() {
    const main = this.read(SAVE_KEY);
    if (main.save) return { save: main.save, source: 'main', fixes: main.fixes || [] };
    const bak = this.read(BACKUP_KEY);
    if (bak.save) { this.write(bak.save); return { save: bak.save, source: 'backup', error: main.error, savedAt: bak.savedAt, fixes: bak.fixes || [] }; }
    return { save: null, source: null, error: main.error || bak.error };
  },
  load() { return this.loadDetailed().save; },
  write(s) { if (this.readOnly) return true; const env = this.envelope(s); if (!env) return false; this.lastWrite = env; return Store.set(SAVE_KEY, env); },
  /** Punto seguro (al volver a la aldea): la partida actual pasa a ser la copia de seguridad. */
  checkpoint(s) { if (this.readOnly) return true; const env = this.envelope(s); if (!env) return false; Store.set(SAVE_KEY, env); return Store.set(BACKUP_KEY, env); },
  hasBackup() { return !!this.read(BACKUP_KEY).save; },
  restoreBackup() { const b = this.read(BACKUP_KEY); if (!b.save) return null; this.write(b.save); return b.save; },
  clear() { Store.del(SAVE_KEY); Store.del(BACKUP_KEY); },
  /** Exportar / importar como texto (para conservar la partida fuera del navegador). */
  exportText(s) { return this.envelope(s); },
  importText(txt) {
    let obj; try { obj = JSON.parse(String(txt).trim()); } catch (e) { return { save: null, error: 'El texto no es una partida válida.' }; }
    let data = obj;
    if (obj && obj.format === 'mystery-action') { if (checksum(JSON.stringify(obj.data)) !== obj.sum) return { save: null, error: 'La partida está incompleta o modificada (la suma de comprobación no coincide).' }; data = obj.data; }
    const r = this.sanitize(data); return r.ok ? { save: r.data } : { save: null, error: 'La partida no es válida: ' + r.fixes[0] + '.' };
  },
};

/* --- Opciones del juego (independientes de la partida) --- */
const Options = {
  defaults: { mute: false, volume: .6, shake: true, damageNumbers: true, help: true, lowGfx: false },
  data: null,
  load() {
    let o = {}; try { o = JSON.parse(Store.get(OPTIONS_KEY)) || {}; } catch (e) { o = {}; }
    const d = this.defaults;
    this.data = { mute: typeof o.mute === 'boolean' ? o.mute : d.mute, volume: Number.isFinite(o.volume) ? U.clamp(o.volume, 0, 1) : d.volume, shake: typeof o.shake === 'boolean' ? o.shake : d.shake, damageNumbers: typeof o.damageNumbers === 'boolean' ? o.damageNumbers : d.damageNumbers, help: typeof o.help === 'boolean' ? o.help : d.help, lowGfx: typeof o.lowGfx === 'boolean' ? o.lowGfx : d.lowGfx };
    return this.data;
  },
  save() { Store.set(OPTIONS_KEY, JSON.stringify(this.data)); },
  set(k, v) { this.data[k] = v; this.save(); Sfx.apply(); },
};

/* ---------- 18. FloorGen: generador de pisos al estilo de la saga ----------
   Rejilla de celdas: cada celda tiene una sala o un cruce de pasillos. Las celdas
   vecinas se conectan (árbol aleatorio + conexiones extra = rutas alternativas) y
   se eliminan los cruces sin salida.
   layout = { kind, w, h, dark, spawn, stairs, rooms[], cells[], edges[], items[], traps[],
              enemies[], npcs[], objects[], doors[], hiddenStairs, mhRoom, shopRoom } */
const FloorGen = {
  /**
   * Tamaño del piso según los jugadores de la partida. En solitario (1) el piso es el de siempre;
   * en cooperativo crece con el grupo y los pasillos pasan a 3 casillas para poder maniobrar.
   * w/h: base + aleatorio · corr: ancho de pasillo · room: [anchoMín, anchoMáx, margen, altoMín, altoMáx, margen]
   * cell: celda mínima · enemies: [multiplicador, máximo] · boss/waypoint/secret: salas únicas · wind: tiempo del viento (×)
   */
  SIZES: {
    1: { w: [54, 10], h: [36, 6], corr: 2, room: [5, 13, 4, 4, 9, 4], cell: [10, 9], treasure: [5, 6, 4, 5], enemies: [1, 10], boss: [22, 16], waypoint: [14, 10], secret: [13, 9], wind: 1 },
    2: { w: [62, 10], h: [41, 6], corr: 3, room: [6, 15, 5, 5, 10, 5], cell: [11, 10], treasure: [6, 7, 5, 6], enemies: [1, 12], boss: [25, 18], waypoint: [16, 11], secret: [14, 10], wind: 1.12 },
    3: { w: [67, 12], h: [44, 8], corr: 3, room: [7, 16, 5, 6, 11, 5], cell: [12, 11], treasure: [6, 8, 5, 7], enemies: [1, 13], boss: [27, 19], waypoint: [17, 12], secret: [15, 11], wind: 1.22 },
    4: { w: [72, 12], h: [47, 8], corr: 3, room: [7, 17, 5, 6, 12, 5], cell: [12, 11], treasure: [6, 8, 5, 7], enemies: [1, 13], boss: [28, 20], waypoint: [18, 13], secret: [15, 11], wind: 1.3 },
  },
  size(players) { return this.SIZES[Math.max(1, Math.min(4, players | 0))] || this.SIZES[1]; },
  /** `players`: jugadores de la partida (1 = solitario). El cliente recibe ese número del servidor para generar el mismo piso. */
  generate(seed, dng, floorNo, kind, jobs = [], players = 1) {
    let last = null; const Z = this.size(players);
    for (let attempt = 0; attempt < 50; attempt++) {
      const res = kind === 'normal' ? this.buildNormal(seed, dng, floorNo, jobs, attempt, Z) : this.buildSingle(seed, dng, floorNo, kind, attempt, Z);
      if (!res) continue;
      res.players = Math.max(1, Math.min(4, players | 0)); res.layout.corr = Z.corr;
      res.validation = this.validate(res.world, res.layout);
      last = res;
      if (res.validation.ok) { res.attempts = attempt + 1; return res; }
    }
    throw new Error('No se pudo generar un piso válido: ' + JSON.stringify(last && last.validation));
  },
  rng(seed, dng, floorNo, attempt, salt = 0) { return U.rng(((seed >>> 0) ^ Math.imul(floorNo + 7, 0x9E3779B1) ^ hashStr(dng.id) ^ salt) + attempt * 7919); },

  /** Pisos de una sola sala: punto de control, guarida del jefe y sala secreta. */
  buildSingle(seed, dng, floorNo, kind, attempt, Z = this.SIZES[1]) {
    const rnd = this.rng(seed, dng, floorNo, attempt, kind.length * 97), biome = BIOMES[dng.biome];
    const ri = (a, b) => a + Math.floor(rnd() * (b - a + 1));
    const [rw, rh] = kind === 'boss' ? Z.boss : kind === 'waypoint' ? Z.waypoint : Z.secret;
    const W = rw + 16, H = rh + 14, world = new World(W, H, seed + floorNo);
    world.tiles.fill(T.WALL);
    const room = { id: 0, x: 8, y: 7, w: rw, h: rh, cx: 8 + (rw >> 1), cy: 7 + (rh >> 1), type: kind };
    for (let y = room.y; y < room.y + rh; y++) for (let x = room.x; x < room.x + rw; x++) world.tiles[y * W + x] = biome.roomTile;
    const L = { kind, w: W, h: H, dark: false, rooms: [room], cells: [], edges: [], items: [], traps: [], enemies: [], npcs: [], objects: [], doors: [], hiddenStairs: null, mhRoom: -1, shopRoom: -1, stairs: null };
    if (kind === 'boss') {
      for (const [px, py] of [[room.x + 3, room.y + 3], [room.x + rw - 5, room.y + 3], [room.x + 3, room.y + rh - 5], [room.x + rw - 5, room.y + rh - 5]])
        for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) world.tiles[(py + dy) * W + px + dx] = T.WALL;
      L.spawn = { tx: room.cx, ty: room.y + rh - 3 };
      L.enemies.push({ boss: dng.boss, tx: room.cx, ty: room.y + 4, final: true });
    } else if (kind === 'waypoint') {
      L.spawn = { tx: room.cx - 3, ty: room.cy + 2 };
      L.objects.push({ type: 'campfire', tx: room.cx, ty: room.cy });
      L.stairs = { tx: room.x + rw - 3, ty: room.cy };
      L.objects.push({ type: 'portal', tx: room.x + 2, ty: room.cy });
      world.tiles[L.stairs.ty * W + L.stairs.tx] = T.STAIRS;
    } else { // sala secreta: montón de objetos y escalera para seguir
      L.spawn = { tx: room.x + 2, ty: room.cy };
      L.stairs = { tx: room.x + rw - 3, ty: room.cy };
      world.tiles[L.stairs.ty * W + L.stairs.tx] = T.STAIRS;
      const used = new Set([L.spawn.ty * W + L.spawn.tx, L.stairs.ty * W + L.stairs.tx]);
      const n = ri(4, 6);
      for (let i = 0; i < n * 4 && L.items.length < n; i++) {
        const tx = ri(room.x + 1, room.x + rw - 2), ty = ri(room.y + 1, room.y + rh - 2), k = ty * W + tx;
        if (used.has(k)) continue; used.add(k);
        if (!L.objects.some(o => o.type === 'chest')) { L.objects.push({ type: 'chest', tier: 'cofreRaro', tx, ty }); continue; }
        const it = rnd() < .25 ? { id: 'cofre', amount: 1 } : Loot.floorItem(dng, rnd);
        if (it.id === 'gems') it.amount *= 2;
        L.items.push({ id: it.id, tx, ty, amount: it.amount, room: 0 });
      }
    }
    world.spawn = { x: (L.spawn.tx + .5) * CONFIG.TILE, y: (L.spawn.ty + .5) * CONFIG.TILE };
    return { world, layout: L, biome };
  },

  buildNormal(seed, dng, floorNo, jobs, attempt, Z = this.SIZES[1]) {
    const rnd = this.rng(seed, dng, floorNo, attempt), biome = BIOMES[dng.biome];
    const ri = (a, b) => a + Math.floor(rnd() * (b - a + 1));
    const pick = a => a[Math.floor(rnd() * a.length)];
    const W = Z.w[0] + ri(0, Z.w[1]), H = Z.h[0] + ri(0, Z.h[1]), CW = Z.corr, solo = Z === this.SIZES[1];
    const world = new World(W, H, seed + floorNo);
    world.tiles.fill(T.WALL);
    const idx = (x, y) => y * W + x;
    // 1. Rejilla de celdas
    const cols = solo ? ri(3, 5) : ri(3, 4) + (W >= 78 && rnd() < .4 ? 1 : 0);
    const rows = solo ? (H >= 40 ? ri(2, 3) + (rnd() < .3 ? 1 : 0) : ri(2, 3)) : ri(2, 3) + (H >= 50 && rnd() < .3 ? 1 : 0);
    const cw = Math.floor((W - 2) / cols), ch = Math.floor((H - 2) / rows);
    if (cw < Z.cell[0] || ch < Z.cell[1]) return null;
    const cells = [];
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) cells.push({ id: cells.length, c, r, x0: 1 + c * cw, y0: 1 + r * ch, isRoom: rnd() < .7, deg: 0, used: true });
    const minRooms = Math.max(3, Math.ceil(cells.length * .5));
    while (cells.filter(c => c.isRoom).length < minRooms) pick(cells.filter(c => !c.isRoom)).isRoom = true;
    const rooms = [];
    for (const cell of cells) {
      if (cell.isRoom) {
        const [a0, a1, am, b0, b1, bm] = Z.room, rw = ri(a0, Math.min(a1, cw - am)), rh = ri(b0, Math.min(b1, ch - bm));
        const x = cell.x0 + ri(2, cw - rw - 2), y = cell.y0 + ri(2, ch - rh - 2);
        cell.room = { id: rooms.length, cell: cell.id, x, y, w: rw, h: rh, cx: x + (rw >> 1), cy: y + (rh >> 1), type: 'normal' };
        rooms.push(cell.room);
      } else cell.anchor = { x: cell.x0 + ri(3, cw - 2 - CW), y: cell.y0 + ri(3, ch - 2 - CW) };
    }
    // 2. Conexiones entre celdas vecinas: árbol aleatorio + extras
    const at = (c, r) => cells.find(k => k.c === c && k.r === r);
    const links = new Map(), key = (a, b) => a < b ? a + '-' + b : b + '-' + a;
    const seen = new Set([cells[0].id]), stack = [cells[ri(0, cells.length - 1)]]; seen.clear(); seen.add(stack[0].id);
    while (stack.length) {
      const cur = stack[stack.length - 1];
      const nb = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dx, dy]) => at(cur.c + dx, cur.r + dy)).filter(n => n && !seen.has(n.id));
      if (!nb.length) { stack.pop(); continue; }
      const n = pick(nb); links.set(key(cur.id, n.id), [cur, n]); seen.add(n.id); stack.push(n);
    }
    for (const a of cells) for (const [dx, dy] of [[1, 0], [0, 1]]) { const b = at(a.c + dx, a.r + dy); if (b && !links.has(key(a.id, b.id)) && rnd() < .18) links.set(key(a.id, b.id), [a, b]); }
    // 3. Quitar cruces sin salida (los pasillos nunca terminan contra una pared)
    let changed = true;
    while (changed) {
      changed = false;
      cells.forEach(c => c.deg = 0);
      for (const [a, b] of links.values()) { a.deg++; b.deg++; }
      for (const [k, [a, b]] of [...links.entries()]) if ((!a.isRoom && a.deg <= 1) || (!b.isRoom && b.deg <= 1)) { links.delete(k); changed = true; }
    }
    cells.forEach(c => c.deg = 0); for (const [a, b] of links.values()) { a.deg++; b.deg++; }
    cells.forEach(c => { if (!c.isRoom && c.deg === 0) c.used = false; });
    // 4. Excavar salas y pasillos (CW casillas de ancho, en zigzag)
    for (const r of rooms) for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) world.tiles[idx(x, y)] = biome.roomTile;
    const inRoom = (x, y) => rooms.find(r => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h);
    const edges = [];
    const endpoint = (cell, side) => { // side: dirección hacia la otra celda
      if (!cell.isRoom) return [cell.anchor.x, cell.anchor.y];
      const r = cell.room;
      if (side === 'R') return [r.x + r.w, ri(r.y, r.y + r.h - CW)];
      if (side === 'L') return [r.x - CW, ri(r.y, r.y + r.h - CW)];
      if (side === 'D') return [ri(r.x, r.x + r.w - CW), r.y + r.h];
      return [ri(r.x, r.x + r.w - CW), r.y - CW];
    };
    for (const [a0, b0] of links.values()) {
      const horiz = a0.r === b0.r, [a, b] = horiz ? (a0.c < b0.c ? [a0, b0] : [b0, a0]) : (a0.r < b0.r ? [a0, b0] : [b0, a0]);
      const s = endpoint(a, horiz ? 'R' : 'D'), e = endpoint(b, horiz ? 'L' : 'U');
      const pts = [];
      if (horiz) { const mid = ri(Math.min(s[0], e[0]), Math.max(s[0], e[0])); pts.push(s, [mid, s[1]], [mid, e[1]], e); }
      else { const mid = ri(Math.min(s[1], e[1]), Math.max(s[1], e[1])); pts.push(s, [s[0], mid], [e[0], mid], e); }
      const path = [], tiles = new Set();
      for (let i = 0; i < pts.length - 1; i++) {
        const [x0, y0] = pts[i], [x1, y1] = pts[i + 1], n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
        for (let k = 0; k <= n; k++) {
          const x = x0 + Math.sign(x1 - x0) * k, y = y0 + Math.sign(y1 - y0) * k;
          path.push([x, y]);
          for (let dy = 0; dy < CW; dy++) for (let dx = 0; dx < CW; dx++) {
            const tx = x + dx, ty = y + dy;
            if (tx < 1 || ty < 1 || tx >= W - 1 || ty >= H - 1 || inRoom(tx, ty)) continue;
            if (world.tiles[idx(tx, ty)] === T.WALL) world.tiles[idx(tx, ty)] = biome.corrTile;
            tiles.add(idx(tx, ty));
          }
        }
      }
      edges.push({ a: a.id, b: b.id, path, tiles: [...tiles], kind: 'corridor' });
    }
    // 5. Papeles de las salas
    const adjR = new Map(rooms.map(r => [r.id, []]));
    const cellAdj = cells.map(() => []); for (const [a, b] of links.values()) { cellAdj[a.id].push(b.id); cellAdj[b.id].push(a.id); }
    const roomDist = (from) => { const d = cells.map(() => Infinity); d[from.cell] = 0; const q = [from.cell]; while (q.length) { const u = q.shift(); for (const v of cellAdj[u]) if (d[v] === Infinity) { d[v] = d[u] + 1; q.push(v); } } return d; };
    const start = pick(rooms); start.type = 'start';
    const dS = roomDist(start);
    const far = rooms.filter(r => r !== start).sort((p, q) => dS[q.cell] - dS[p.cell]);
    const stairsRoom = pick(far.slice(0, Math.max(1, Math.ceil(far.length / 2))));
    const L = { kind: 'normal', w: W, h: H, dark: rnd() < dng.dark, rooms, cells, edges, items: [], traps: [], enemies: [], npcs: [], objects: [], doors: [], hiddenStairs: null, mhRoom: -1, shopRoom: -1 };
    const others = () => rooms.filter(r => r !== start && r.type === 'normal');
    if (rooms.length >= 4 && rnd() < dng.monsterHouse) { const r = pick(others()); r.type = 'monsterhouse'; L.mhRoom = r.id; }
    else if (rooms.length >= 4 && rnd() < dng.shop) { const c = others().filter(r => r !== stairsRoom && r.w * r.h >= 30); if (c.length) { const r = pick(c); r.type = 'shop'; L.shopRoom = r.id; } }

    // 6. Cámara del tesoro cerrada con llave (sala lateral con una sola entrada)
    let treasure = null;
    if (floorNo >= 2 && rnd() < dng.treasure) {
      for (let k = 0; k < 120 && !treasure; k++) {
        const host = pick(rooms.filter(r => r.type === 'normal' || r.type === 'start'));
        const w = ri(Z.treasure[0], Z.treasure[1]), h = ri(Z.treasure[2], Z.treasure[3]), gap = ri(3, 5), side = ri(0, 3);
        let x, y;
        if (side === 0) { x = host.x + host.w + gap; y = host.y + ri(0, Math.max(0, host.h - h)); }
        else if (side === 1) { x = host.x - gap - w; y = host.y + ri(0, Math.max(0, host.h - h)); }
        else if (side === 2) { y = host.y + host.h + gap; x = host.x + ri(0, Math.max(0, host.w - w)); }
        else { y = host.y - gap - h; x = host.x + ri(0, Math.max(0, host.w - w)); }
        if (x < 2 || y < 2 || x + w > W - 2 || y + h > H - 2) continue;
        let ok = true;
        for (let ty = y - 2; ty <= y + h + 1 && ok; ty++) for (let tx = x - 2; tx <= x + w + 1; tx++) if (world.tiles[idx(tx, ty)] !== T.WALL) { ok = false; break; }
        if (!ok) continue;
        const corr = [], mouth = [], path = [];
        if (side < 2) {
          const lo = Math.max(host.y, y), hi = Math.min(host.y + host.h - CW, y + h - CW); if (hi < lo) continue;
          const cy = ri(lo, hi), x0 = side === 0 ? host.x + host.w : x + w, x1 = side === 0 ? x - 1 : host.x - 1;
          for (let tx = x0; tx <= x1 && ok; tx++) for (let ty = cy - 1; ty <= cy + CW; ty++) if (world.tiles[idx(tx, ty)] !== T.WALL) { ok = false; break; }
          if (!ok) continue;
          for (let tx = x0; tx <= x1; tx++) { path.push([tx, cy]); for (let k = 0; k < CW; k++) corr.push(idx(tx, cy + k)); }
          const mx = side === 0 ? x1 : x0; for (let k = 0; k < CW; k++) mouth.push(idx(mx, cy + k));
        } else {
          const lo = Math.max(host.x, x), hi = Math.min(host.x + host.w - CW, x + w - CW); if (hi < lo) continue;
          const cx = ri(lo, hi), y0 = side === 2 ? host.y + host.h : y + h, y1 = side === 2 ? y - 1 : host.y - 1;
          for (let ty = y0; ty <= y1 && ok; ty++) for (let tx = cx - 1; tx <= cx + CW; tx++) if (world.tiles[idx(tx, ty)] !== T.WALL) { ok = false; break; }
          if (!ok) continue;
          for (let ty = y0; ty <= y1; ty++) { path.push([cx, ty]); for (let k = 0; k < CW; k++) corr.push(idx(cx + k, ty)); }
          const my = side === 2 ? y1 : y0; for (let k = 0; k < CW; k++) mouth.push(idx(cx + k, my));
        }
        const r = { id: rooms.length, x, y, w, h, cx: x + (w >> 1), cy: y + (h >> 1), type: 'treasure', host: host.id };
        rooms.push(r);
        for (let ty = y; ty < y + h; ty++) for (let tx = x; tx < x + w; tx++) world.tiles[idx(tx, ty)] = biome.roomTile;
        corr.forEach(i => world.tiles[i] = biome.corrTile); mouth.forEach(i => world.tiles[i] = T.DOOR);
        edges.push({ a: -1, b: -1, roomA: host.id, roomB: r.id, path, tiles: corr, kind: 'locked' });
        L.doors.push({ tiles: mouth, edge: edges.length - 1 });
        treasure = r;
      }
    }

    // 7. Obstáculos dentro de algunas salas (se deshacen si cortan rutas)
    const reach = (fromIdx, extra) => {
      const s = new Uint8Array(W * H), st = [fromIdx]; s[fromIdx] = 1; let n = 1;
      while (st.length) { const i = st.pop(); for (const j of [i + 1, i - 1, i + W, i - W]) { if (j < 0 || j >= W * H || s[j]) continue; if (Math.abs((j % W) - (i % W)) > 1) continue; const t = world.tiles[j]; if (!SOLID[t] || (extra && extra(t))) { s[j] = 1; n++; st.push(j); } } }
      return { seen: s, n };
    };
    const spawnIdx = idx(start.cx, start.cy);
    let baseN = reach(spawnIdx).n;
    for (const r of rooms) {
      if (r.type !== 'normal' || r.w < 7 || r.h < 6 || rnd() > .4) continue;
      const kind = pick(biome.obstacles), tiles = [], ox = ri(r.x + 2, r.x + r.w - 3), oy = ri(r.y + 2, r.y + r.h - 3);
      const t = kind === 'trees' ? T.TREE : kind === 'rocks' ? T.ROCK : kind === 'crystals' ? T.CRYSTAL : kind === 'pillar' ? T.WALL : kind === 'lava' ? T.LAVA : T.WATER;
      const n = kind === 'pillar' ? 4 : ri(2, 5);
      let x = ox, y = oy;
      for (let i = 0; i < n; i++) {
        if (x >= r.x + 2 && x <= r.x + r.w - 3 && y >= r.y + 2 && y <= r.y + r.h - 3 && !tiles.includes(idx(x, y))) tiles.push(idx(x, y));
        if (kind === 'pillar') { x = ox + (i % 2 ? 0 : 1); y = oy + (i >= 1 ? 1 : 0); }
        else if (rnd() < .5) x += rnd() < .5 ? 1 : -1; else y += rnd() < .5 ? 1 : -1;
      }
      const prev = tiles.map(i => world.tiles[i]); tiles.forEach(i => world.tiles[i] = t);
      const nn = reach(spawnIdx).n;
      if (nn !== baseN - tiles.length) tiles.forEach((i, k) => world.tiles[i] = prev[k]); else baseN = nn;
    }
    // Decoración que no bloquea
    for (const r of rooms) for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) {
      if (world.tiles[idx(x, y)] !== biome.roomTile || r.type === 'shop') continue;
      const h = U.hash(x, y, seed + floorNo * 31);
      if (h < (biome.id === 'forest' ? .05 : .03)) world.tiles[idx(x, y)] = T.FLOWERS;
      else if (h > .975) world.tiles[idx(x, y)] = T.TALLGRASS;
    }
    // Alfombra de la tienda
    if (L.shopRoom >= 0) { const r = rooms[L.shopRoom]; for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) if (!SOLID[world.tiles[idx(x, y)]]) world.tiles[idx(x, y)] = T.CARPET; }

    // 8. Contenido
    const R0 = reach(spawnIdx).seen, R1 = reach(spawnIdx, t => t === T.DOOR).seen;
    const occupied = new Set();
    const roomOk = (r, x, y, seenArr, clear = 0) => {
      if (x < r.x + clear || y < r.y + clear || x >= r.x + r.w - clear || y >= r.y + r.h - clear) return false;
      for (let j = -clear; j <= clear; j++) for (let i = -clear; i <= clear; i++) { const k = idx(x + i, y + j); if (SOLID[world.tiles[k]] || !seenArr[k] || world.tiles[k] === T.STAIRS) return false; }
      return !occupied.has(idx(x, y));
    };
    const spotIn = (r, seenArr = R0, clear = 0, avoidSpawn = 0) => {
      for (let k = 0; k < 80; k++) {
        const x = ri(r.x, r.x + r.w - 1), y = ri(r.y, r.y + r.h - 1);
        if (!roomOk(r, x, y, seenArr, clear)) continue;
        if (avoidSpawn && Math.hypot(x - start.cx, y - start.cy) < avoidSpawn) continue;
        occupied.add(idx(x, y)); return { tx: x, ty: y };
      }
      return null;
    };
    L.spawn = { tx: start.cx, ty: start.cy }; occupied.add(spawnIdx);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) occupied.add(idx(start.cx + dx, start.cy + dy));
    const st = spotIn(stairsRoom, R0, 1); if (!st) return null;
    L.stairs = st; world.tiles[idx(st.tx, st.ty)] = T.STAIRS;
    // Objetos sueltos (nunca en pasillos)
    const itemRooms = rooms.filter(r => r.type !== 'shop' && r.type !== 'treasure');
    const nItems = ri(1, 2) + (rooms.length >= 9 && rnd() < .5 ? 1 : 0);   // pocos objetos sueltos: el inventario no se llena solo
    const floorItem = (r, s, mul = 1) => { const it = Loot.floorItem(dng, rnd); L.items.push({ id: it.id, tx: s.tx, ty: s.ty, amount: it.id === 'gems' ? it.amount * mul : 1, room: r.id }); };
    for (let i = 0; i < nItems; i++) { const r = pick(itemRooms), s = spotIn(r); if (s) floorItem(r, s); }
    // Cofres normales (0-2 por piso), solo en salas normales
    const chestRooms = rooms.filter(r => r.type === 'normal');
    for (let i = 0, n = chestRooms.length ? (rnd() < .7 ? 0 : rnd() < .9 ? 1 : 2) : 0; i < n; i++) { const r = pick(chestRooms), s = spotIn(r, R0, 1); if (s) L.objects.push({ type: 'chest', tier: 'cofre', tx: s.tx, ty: s.ty, room: r.id }); }
    if (L.mhRoom >= 0) {
      const r = rooms[L.mhRoom];
      for (let i = 0, n = ri(2, 3); i < n; i++) { const s = spotIn(r); if (s) floorItem(r, s); }
      for (let i = 0, n = ri(2, 4); i < n; i++) { const s = spotIn(r); if (s) L.traps.push({ type: weighted(Object.assign({}, dng.trapPool, { purificadora: 0 }), rnd), tx: s.tx, ty: s.ty, hidden: true, room: r.id }); }
    }
    if (L.shopRoom >= 0) {
      const r = rooms[L.shopRoom];
      const k = spotIn(r, R0, 1); if (!k) return null;
      L.npcs.push({ kind: 'tendero', tx: k.tx, ty: k.ty, room: r.id });
      for (let i = 0, n = ri(4, 6); i < n; i++) { const s = spotIn(r); if (!s) continue; const id = pick(SHOP_POOL); L.items.push({ id, tx: s.tx, ty: s.ty, amount: 1, price: Math.round(ITEMS[id].price * ECONOMY.dungeonMarkup), room: r.id }); }
    }
    if (treasure) {
      { const s = spotIn(treasure, R1, 1); if (s) L.objects.push({ type: 'chest', tier: 'cofreRaro', tx: s.tx, ty: s.ty, room: treasure.id }); }
      for (let i = 0, n = ri(1, 2); i < n; i++) { const s = spotIn(treasure, R1); if (s) { if (i === 0) L.items.push({ id: 'cofre', tx: s.tx, ty: s.ty, amount: 1, room: treasure.id }); else floorItem(treasure, s, 2); } }
      const keyRooms = rooms.filter(r => (r.type === 'normal' || r.type === 'start') && r.id !== treasure.id);
      let placed = false;
      for (let k = 0; k < 20 && !placed; k++) { const r = pick(keyRooms), s = spotIn(r); if (s) { L.items.push({ id: 'llave', tx: s.tx, ty: s.ty, amount: 1, room: r.id }); placed = true; } }
    }
    // Trampas: solo en salas (ni en la inicial ni en la tienda)
    const trapRooms = rooms.filter(r => r.type === 'normal' || r.type === 'treasure');
    for (let i = 0, n = ri(dng.traps[0], dng.traps[1]); i < n && trapRooms.length; i++) {
      const r = pick(trapRooms), s = spotIn(r, r.type === 'treasure' ? R1 : R0); if (!s) continue;
      let type = weighted(dng.trapPool, rnd);
      if (type === 'agujero' && floorNo >= dng.floors) type = 'pinchos';
      L.traps.push({ type, tx: s.tx, ty: s.ty, hidden: !TRAPS[type].visible, room: r.id });
    }
    // Escalera secreta (lleva a una sala del tesoro)
    if (rnd() < dng.hiddenStairs && floorNo < dng.floors) {
      const c = rooms.filter(r => r.type === 'normal' && r !== stairsRoom);
      if (c.length) { const r = pick(c), s = spotIn(r); if (s) L.hiddenStairs = { tx: s.tx, ty: s.ty, room: r.id }; }
    }
    // Enemigos iniciales (lejos de la entrada)
    const nEn = Math.min(Z.enemies[1], Math.round((dng.enemyBase + Math.floor(floorNo / (dng.enemyStep || 2)) + ri(0, 2)) * Z.enemies[0]));   // (factor 1: el cooperativo no añade enemigos por el tamaño del mapa; ver COOP_SCALING)
    const enemyRooms = rooms.filter(r => r.type === 'normal');
    for (let i = 0; i < nEn * 3 && L.enemies.length < nEn && enemyRooms.length; i++) {
      const r = pick(enemyRooms), s = spotIn(r, R0, 1, 9);
      if (s) L.enemies.push({ variant: weighted(dng.enemies, rnd), tx: s.tx, ty: s.ty, room: r.id, elite: rnd() < .03 * dng.level });
    }
    // Objetivos de los encargos aceptados para este piso
    for (const j of jobs) {
      const c = rooms.filter(r => r.type === 'normal' && r !== start);
      for (let k = 0; k < 20; k++) {
        const r = pick(c.length ? c : rooms.filter(x => x !== start)), s = spotIn(r, R0, 1, 6); if (!s) continue;
        if (j.type === 'rescue') L.npcs.push({ kind: 'cliente', tx: s.tx, ty: s.ty, room: r.id, jobId: j.id, name: j.client });
        else if (j.type === 'find') L.items.push({ id: 'job', tx: s.tx, ty: s.ty, amount: 1, room: r.id, jobId: j.id, name: j.target });
        else L.enemies.push({ variant: Object.keys(dng.enemies)[0], tx: s.tx, ty: s.ty, room: r.id, elite: true, outlaw: j.id, name: j.target });
        break;
      }
    }
    world.reach = R0;
    world.spawn = { x: (L.spawn.tx + .5) * CONFIG.TILE, y: (L.spawn.ty + .5) * CONFIG.TILE };
    return { world, layout: L, biome };
  },

  /** Comprobaciones previas a mostrar un piso. */
  validate(world, L) {
    const W = L.w, H = L.h, idx = (x, y) => y * W + x;
    const reach = (extra) => {
      const s = new Uint8Array(W * H), st = [idx(L.spawn.tx, L.spawn.ty)]; s[st[0]] = 1;
      while (st.length) { const i = st.pop(); for (const j of [i + 1, i - 1, i + W, i - W]) { if (j < 0 || j >= W * H || s[j]) continue; if (Math.abs((j % W) - (i % W)) > 1) continue; const t = world.tiles[j]; if (!SOLID[t] || (extra && extra(t))) { s[j] = 1; st.push(j); } } }
      return s;
    };
    const R0 = reach(null), R1 = reach(t => t === T.DOOR);
    const solid = (x, y) => SOLID[world.tiles[idx(x, y)]];
    const inRect = (r, x, y) => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h;
    const roomOf = (x, y) => L.rooms.find(r => inRect(r, x, y));
    const reachFor = (x, y) => { const r = roomOf(x, y); return r && r.type === 'treasure' ? R1 : R0; };
    const c = {};
    c.spawnClear = [-1, 0, 1].every(j => [-1, 0, 1].every(i => !solid(L.spawn.tx + i, L.spawn.ty + j))) && !!roomOf(L.spawn.tx, L.spawn.ty);
    c.stairsReachable = !L.stairs || !!R0[idx(L.stairs.tx, L.stairs.ty)];
    c.roomsReachable = L.rooms.every(r => { const S = r.type === 'treasure' ? R1 : R0; for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) if (S[idx(x, y)]) return true; return false; });
    c.treasureLocked = L.rooms.filter(r => r.type === 'treasure').every(r => !R0[idx(r.cx, r.cy)]);
    // Sin pasillos sin salida: cada extremo toca una sala o un cruce con 2+ conexiones
    const cellDeg = new Map(); L.edges.forEach(e => { if (e.a >= 0) { cellDeg.set(e.a, (cellDeg.get(e.a) || 0) + 1); cellDeg.set(e.b, (cellDeg.get(e.b) || 0) + 1); } });
    const endOk = (cellId, p) => { const cell = L.cells[cellId]; if (cell.isRoom) { const r = cell.room; return [[0, 0], [1, 0], [0, 1], [1, 1], [-1, 0], [0, -1]].some(([dx, dy]) => { for (let k = 1; k <= (L.corr || 2); k++) if (inRect(r, p[0] + dx * k, p[1] + dy * k)) return true; return false; }); } return (cellDeg.get(cellId) || 0) >= 2; };
    c.noDeadEnds = L.edges.filter(e => e.kind === 'corridor').every(e => endOk(e.a, e.path[0]) && endOk(e.b, e.path[e.path.length - 1]));
    c.corridorsWalkable = L.edges.every(e => e.tiles.every(i => (!SOLID[world.tiles[i]] || world.tiles[i] === T.DOOR) && (R1[i])));
    c.itemsInRooms = L.items.every(it => roomOf(it.tx, it.ty) && !solid(it.tx, it.ty) && reachFor(it.tx, it.ty)[idx(it.tx, it.ty)]);
    const taken = new Set(L.items.map(i => idx(i.tx, i.ty)));
    c.trapsInRooms = L.traps.every(t => roomOf(t.tx, t.ty) && !solid(t.tx, t.ty) && !taken.has(idx(t.tx, t.ty)) && !(t.tx === L.spawn.tx && t.ty === L.spawn.ty) && world.tiles[idx(t.tx, t.ty)] !== T.STAIRS);
    c.enemiesClear = L.enemies.every(e => [-1, 0, 1].every(j => [-1, 0, 1].every(i => !solid(e.tx + i, e.ty + j))) && R0[idx(e.tx, e.ty)]);
    c.enemiesAwayFromSpawn = L.enemies.every(e => L.kind === 'boss' || Math.hypot(e.tx - L.spawn.tx, e.ty - L.spawn.ty) >= 6);
    c.chestsInRooms = L.objects.filter(o => o.type === 'chest').every(o => roomOf(o.tx, o.ty) && !solid(o.tx, o.ty) && reachFor(o.tx, o.ty)[idx(o.tx, o.ty)] && !taken.has(idx(o.tx, o.ty)) && !L.traps.some(t => t.tx === o.tx && t.ty === o.ty));
    c.npcsReachable = L.npcs.every(n => !solid(n.tx, n.ty) && R0[idx(n.tx, n.ty)]);
    c.hiddenStairs = !L.hiddenStairs || (!solid(L.hiddenStairs.tx, L.hiddenStairs.ty) && !!R0[idx(L.hiddenStairs.tx, L.hiddenStairs.ty)]);
    c.keyForDoor = L.doors.length === 0 || L.items.some(i => i.id === 'llave' && R0[idx(i.tx, i.ty)]);
    return { ok: Object.values(c).every(Boolean), checks: c };
  },
};


/* ---------- 21. Compañeros: reclutamiento, IA y órdenes ----------
   Los compañeros reutilizan los ataques de su especie (los «cerebros» de los enemigos
   apuntan a e.target y golpean con e.team). Fuera de combate se mueven con un camino
   por casillas (BFS) para no quedarse atascados, y nunca empujan al protagonista. */
const RECRUIT = {
  chance: .1,          // probabilidad base de que un enemigo derrotado quiera unirse
  eliteMul: .5,        // los enemigos élite se unen con la mitad de probabilidad
  partyMax: 2,         // compañeros que pueden acompañarte en una expedición
  rosterMax: 9,        // uno de cada especie como máximo
};
/** Habilidad propia de cada familia (además de su ataque y sus estadísticas). */
const ALLY_ABILITY = {
  mordisquin: { name: 'Ímpetu', desc: 'Sus mordiscos se recargan un 35 % más rápido.' },
  pufon: { name: 'Esporas curativas', desc: 'Si tus PS bajan del 50 %, te cura un 8 % de los PS (cada 22 s).' },
  pedrolon: { name: 'Provocar', desc: 'Los enemigos cercanos prefieren atacarle a él antes que a ti.' },
};
const ORDERS = { follow: 'Seguir', attack: 'Atacar', hold: 'Mantener posición' };

/** Camino por casillas (8 direcciones sin cortar esquinas). Devuelve centros de casilla o null. */
function gridPath(world, x0, y0, x1, y1, maxNodes = 4000) {
  const TS = CONFIG.TILE, W = world.w, H = world.h;
  const sx = Math.floor(x0 / TS), sy = Math.floor(y0 / TS), ex = Math.floor(x1 / TS), ey = Math.floor(y1 / TS);
  if (!world.inBounds(ex, ey) || world.isSolid(ex, ey)) return null;
  const start = sy * W + sx, goal = ey * W + ex;
  if (start === goal) return [];
  const prev = new Int32Array(W * H).fill(-1); prev[start] = start;
  const q = [start]; let head = 0;
  const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
  while (head < q.length && head < maxNodes) {
    const cur = q[head++]; if (cur === goal) break;
    const cx = cur % W, cy = (cur / W) | 0;
    for (const [dx, dy] of dirs) {
      const nx = cx + dx, ny = cy + dy; if (!world.inBounds(nx, ny)) continue;
      const ni = ny * W + nx; if (prev[ni] >= 0 || world.isSolid(nx, ny)) continue;
      if (dx && dy && (world.isSolid(cx + dx, cy) || world.isSolid(cx, cy + dy))) continue;
      prev[ni] = cur; q.push(ni);
    }
  }
  if (prev[goal] < 0) return null;
  const out = []; for (let i = goal; i !== start; i = prev[i]) out.push({ x: (i % W + .5) * TS, y: (((i / W) | 0) + .5) * TS });
  return out.reverse();
}

class Companion extends Enemy {
  constructor(data, x, y) {
    const k = makeKind(data.kind);
    const kind = Object.assign({}, k, { speed: Math.max(k.speed, 118), aggro: 0 });   // los aliados siguen el ritmo del líder
    super(kind, x, y, { level: data.level });
    this.team = 'player'; this.ally = true; this.data = data; this.nameTag = data.name;
    this.family = ENEMY_VARIANTS[data.kind].base;
    this.taunt = this.family === 'pedrolon'; this.cdMul = this.family === 'mordisquin' ? .65 : 1;
    this.healT = 4; this.path = null; this.pathT = 0; this.farT = 0; this.holdPos = null; this.idleMode = false;
    this.kbRes *= .6; this.mass = Math.min(this.mass, 2);
    if (data.hp != null && data.hp > 0) this.hp = Math.min(this.maxHp, data.hp);
  }
  /** El objetivo depende de la orden activa. */
  pickTarget(g) {
    if (this.state !== 'idle' && this.target && this.target.alive && this.target.team === 'enemy') return this.target;
    const pl = g.player; if (!pl || this.idleMode) return null;
    const order = g.order || 'follow';
    if (order === 'attack' && g.orderTarget && g.orderTarget.alive) return g.orderTarget;
    const ranged = this.family === 'pufon';
    let best = null, bd = Infinity;
    for (const e of g.actors) {
      if (!e.alive || e.team !== 'enemy') continue;
      const dm = Math.hypot(e.x - this.x, e.y - this.y);
      let ok;
      if (order === 'hold') ok = dm < (ranged ? 300 : 96);
      else if (order === 'attack') ok = dm < 420;
      else ok = dm < 360 && Math.hypot(e.x - pl.x, e.y - pl.y) < 250 && (e.aggro || dm < 150);
      if (!ok || dm >= bd || !g.world.los(this.x, this.y, e.x, e.y)) continue;
      bd = dm; best = e;
    }
    if (best && order === 'follow' && Math.hypot(this.x - pl.x, this.y - pl.y) > 400) return null;   // correa: no se aleja demasiado
    return best;
  }
  think(dt, g, d, P) {
    const pl = g.player;
    this.data.hp = this.hp;
    // Habilidad de apoyo
    if (this.healT > 0) this.healT -= dt;
    if (this.family === 'pufon' && !this.idleMode && pl && pl.alive && pl.hp < pl.maxHp * .5 && this.healT <= 0 && Math.hypot(pl.x - this.x, pl.y - this.y) < 260) {
      this.healT = 22; const h = Math.round(pl.maxHp * .08); pl.hp = Math.min(pl.maxHp, pl.hp + h);
      Effects.floater(g, pl.x, pl.y - pl.height - 4, '+' + h, '#7dffa0', 11); Effects.burst(g, pl.x, pl.y - 14, '#c8ffd8', 14, 70);
      g.stats.allyHeals = (g.stats.allyHeals || 0) + 1;
    }
    // Atascado lejos del líder → reaparece a su lado
    if (pl && !this.idleMode && (g.order || 'follow') !== 'hold') {
      const dp = Math.hypot(pl.x - this.x, pl.y - this.y);
      if (dp > 170 && !this.moving) this.farT += dt; else this.farT = Math.max(0, this.farT - dt * 2);
      if (dp > 620 || this.farT > 2) { this.warpNear(g); return STOP; }
    }
    if (this.state !== 'idle' || (P && P.alive && P.team === 'enemy')) { this.aggro = true; return this.kind.brain(this, dt, g, d); }
    this.aggro = false;
    return this.navigate(dt, g);
  }
  clearLine(world, x, y) {
    const d = Math.hypot(x - this.x, y - this.y), n = Math.max(1, Math.ceil(d / 8));
    for (let i = 1; i <= n; i++) { const px = this.x + (x - this.x) * i / n, py = this.y + (y - this.y) * i / n; if (!this.free(world, px, py)) return false; }
    return true;
  }
  /** Sin objetivo: ir a su sitio (detrás del líder o al punto de espera) por un camino de casillas. */
  navigate(dt, g) {
    if (this.idleMode) return idleBehaviour(this, dt);
    const pl = g.player, W = g.world; if (!pl) return STOP;
    let ax, ay;
    if (g.order === 'hold' && this.holdPos) { ax = this.holdPos.x; ay = this.holdPos.y; }
    else {
      const i = Math.max(0, g.allies.indexOf(this)), fx = pl.facing.x, fy = pl.facing.y, back = 36 + i * 24, side = (i % 2 ? -1 : 1) * 16;
      ax = pl.x - fx * back - fy * side; ay = pl.y - fy * back + fx * side;
      if (!this.free(W, ax, ay)) { ax = pl.x; ay = pl.y; }
    }
    const dist = Math.hypot(ax - this.x, ay - this.y);
    if (dist < 14) { this.path = null; return STOP; }
    const mul = dist > 140 ? 1.3 : dist > 50 ? 1 : .55;
    if (dist < 80 && this.clearLine(W, ax, ay)) return steerTo(this, ax, ay, mul);
    this.pathT -= dt;
    if (this.pathT <= 0 || !this.path) { this.path = gridPath(W, this.x, this.y, ax, ay); this.pathT = .4; }
    if (this.path && this.path.length) {
      while (this.path.length > 1 && this.clearLine(W, this.path[1].x, this.path[1].y)) this.path.shift();
      const w = this.path[0];
      if (Math.hypot(w.x - this.x, w.y - this.y) < 8) this.path.shift();
      return steerTo(this, w.x, w.y, mul);
    }
    return steerTo(this, ax, ay, mul);
  }
  /** Coloca al compañero en una casilla libre cerca del líder (detrás si es posible). */
  warpNear(g, slot = 0) {
    const pl = g.player, W = g.world, TS = CONFIG.TILE; if (!pl) return false;
    const px = Math.floor(pl.x / TS), py = Math.floor(pl.y / TS);
    const behind = { x: -Math.sign(Math.round(pl.facing.x)), y: -Math.sign(Math.round(pl.facing.y)) || 1 };
    let best = null, bs = Infinity;
    for (let r = 1; r <= 4 && !best; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
      const x = (px + dx + .5) * TS, y = (py + dy + .5) * TS;
      if (!this.free(W, x, y) || !W.los(pl.x, pl.y, x, y)) continue;
      if (g.allies.some(a => a !== this && a.alive && Math.hypot(a.x - x, a.y - y) < 20)) continue;
      const score = -(dx * behind.x + dy * behind.y) + slot * .1 + Math.random() * .2;
      if (score < bs) { bs = score; best = { x, y }; }
    }
    if (!best) best = { x: pl.x, y: pl.y };
    this.x = this.px = best.x; this.y = this.py = best.y; this.vx = this.vy = this.kbx = this.kby = 0;
    this.path = null; this.farT = 0; this.state = 'idle';
    Effects.burst(g, this.x, this.y - 12, '#bff6f8', 10, 80, .3);
    return true;
  }
  die(g) {
    this.alive = false; this.hp = 0; this.data.hp = 0; this.data.fainted = true;
    Effects.burst(g, this.x, this.y - this.height * .4, '#ffffff', 16, 140, .5);
    UI.toast(`${this.data.name} se ha debilitado. Recupéralo descansando en la aldea.`, '#ff9a4a');
    if (g.save) Save.write(g.save);
  }
  gainExp(g, n) {
    const m = this.data; if (n <= 0 || m.level >= MAX_LEVEL) return;
    m.exp += n;
    while (m.level < MAX_LEVEL && m.exp >= expNeed(m.level)) {
      m.exp -= expNeed(m.level); m.level++;
      const ratio = this.hp / this.maxHp; this.level = m.level; this.stats = calcStats(this.kind.base, m.level);
      this.maxHp = this.stats.hp; this.def = this.stats.def; this.hp = Math.max(1, Math.round(this.maxHp * ratio)); m.hp = this.hp;
      Effects.floater(g, this.x, this.y - this.height - 10, `¡Nv ${m.level}!`, '#ffd166', 11);
      UI.toast(`${m.name} sube al nivel ${m.level}`, '#ffd166');
    }
  }
  draw(c, g, alpha) {
    const x = U.lerp(this.px, this.x, alpha), y = U.lerp(this.py, this.y, alpha);
    if (!this.idleMode) { c.globalAlpha = .55; c.strokeStyle = '#7dffa0'; c.lineWidth = 1.5; c.beginPath(); c.ellipse(x, y, this.radius + 3, (this.radius + 3) * .42, 0, 0, Math.PI * 2); c.stroke(); c.globalAlpha = 1; }
    super.draw(c, g, alpha);
    if (!this.idleMode) {
      const w = 24, bx = x - w / 2, by = y - this.height - 6, r = this.hp / this.maxHp;
      c.fillStyle = 'rgba(8,14,11,.85)'; c.fillRect(bx - 1, by - 1, w + 2, 4); c.fillStyle = r > .5 ? '#7dffa0' : r > .2 ? '#f2c94b' : '#ef5b4b'; c.fillRect(bx, by, w * r, 2);
    }
    if (this.holdPos && g.order === 'hold' && !this.idleMode) { c.globalAlpha = .5; c.strokeStyle = '#5cc8ff'; c.setLineDash([3, 3]); c.beginPath(); c.arc(this.holdPos.x, this.holdPos.y, 10, 0, Math.PI * 2); c.stroke(); c.setLineDash([]); c.globalAlpha = 1; }
  }
}

/* ---------- 22. Misiones del gremio ----------
   Tipos clásicos (en un piso concreto): rescue, find, outlaw — se cobran al volver con éxito.
   Tipos con progreso: hunt (derrotar enemigos), collect (encontrar objetos), explore (salas),
   boss (guardián) y expedition (llegar a un piso y volver) — se entregan en el gremio. */
const LEGACY_JOBS = ['rescue', 'find', 'outlaw'];
const isLegacyJob = j => LEGACY_JOBS.includes(j.type);
const Quests = {
  /** Registra un suceso y avanza las misiones aceptadas que encajan. Devuelve las misiones completadas ahora. */
  progress(g, kind, info) {
    const s = g.save; if (!s || !s.jobs) return [];
    const done = [];
    for (const j of s.jobs) {
      if (isLegacyJob(j) || j.state === 'done') continue;
      if (info.dungeon && j.dungeon !== info.dungeon) continue;
      let n = 0;
      if (kind === 'defeat' && j.type === 'hunt' && info.kind === j.target) n = 1;
      else if (kind === 'defeat' && j.type === 'boss' && info.boss) n = 1;
      else if (kind === 'room' && j.type === 'explore') n = 1;
      else if (kind === 'item' && j.type === 'collect' && info.id === j.target) n = info.n || 1;
      else if (kind === 'expedition' && j.type === 'expedition' && info.floor >= j.reach) n = 1;
      if (!n) continue;
      j.progress = Math.min(j.goal, (j.progress || 0) + n);
      if (j.progress >= j.goal) { j.state = 'done'; done.push(j); UI.toast(`¡Misión completada! ${Jobs.title(j)}. Entrégala en el gremio.`, '#7dffa0'); }
    }
    return done;
  },
  label(j) {
    if (isLegacyJob(j)) return '';
    return j.state === 'done' ? '¡Lista para entregar!' : `${j.progress || 0}/${j.goal}`;
  },
};


  return { CONFIG, U, T, SOLID, TILE_NAMES, World, Particles, SPECIES, EVOLVED, FORMS, Progress, EVOLUTIONS, EVO_ITEM_MIN_LEVEL, Combat, Effects, Projectile, Zone, BLOCKS_SHOT, TYPES, TYPE_CHART, typeEff, calcStats, MAX_LEVEL, expNeed, expYield, MOVES, BOONS, Boons, BOSS_RAGE, GEODA, Geoda, Boulder, Actor, Player, Enemy, STOP, ENEMIES, ENEMY_VARIANTS, makeKind, BOSSES, makeBossKind, BIOMES, RARITIES, CATEGORIES, EQUIP_SLOTS, ITEMS, QUICK, RARITY_ORDER, STAT_NAMES, BASE_SHOP, SHOP_TIERS, shopStock, sellPrice, RECIPES, newUid, LOOT, Loot, Inventory, finalStats, freshEquip, equipRegen, TRAPS, DUNGEONS, dungeonById, dungeonOpen, COURIER_INTRO, enemyLevel, RANKS, rankOf, weighted, Jobs, ECONOMY, SAVE_VERSION, checksum, Save, FloorGen, hashStr, RECRUIT, ORDERS, gridPath, Companion, LEGACY_JOBS, isLegacyJob, Quests };
}
export const SOURCE_HASH = '0b1d9c81790a160e';
