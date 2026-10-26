/**
 * Expedición cooperativa autoritativa (estado temporal, solo vive mientras dura la sala).
 *
 * Tres tipos de datos, separados:
 *  1. PERFIL PERSONAL de cada integrante (`m.profile`): copia de SU partida leída del servidor
 *     al empezar. Nadie más la toca; al terminar se guarda solo la suya.
 *  2. EXPEDICIÓN COMPARTIDA (`this.shared()`): mapa (semilla y piso), enemigos, jefe, objetos del
 *     suelo y cofres, y el progreso del grupo por la mazmorra. No se guarda nunca.
 *  3. RECOMPENSAS INDIVIDUALES (`m.rewards`): experiencia por participación, monedas y objetos que
 *     recoge cada uno, misiones que avanza cada uno. Se aplican a su perfil y se guardan aparte.
 *
 * - Genera cada piso con el FloorGen compartido (misma semilla ⇒ mismo piso en el cliente).
 * - Cada jugador es un Player real del motor creado desde SU perfil guardado en el servidor.
 * - Movimiento: el servidor aplica las muestras de eje del cliente a 120 Hz (como mucho una
 *   muestra por paso, cola limitada), con la velocidad y colisiones del propio motor.
 * - Ataques: tryBasic / tryMove / tryDodge del motor (enfriamientos, cargas, energía, alcance).
 * - Enemigos, daño, experiencia, monedas y objetos: solo los decide esta clase.
 * No hace E/S: la sala de Colyseus lee el estado y guarda los perfiles al final.
 */
import { randomUUID } from 'node:crypto';
import { createServerEngine, createHeadlessGame, stepWorld, creditDamage } from './engine.js';
import { gainExp } from '../profile/rules.js';
import { MAX_INPUT_BACKLOG, MAX_PLAYERS, coopScaling, coopSummary } from '../../../shared/protocol.js';

const TS = 32;
const E_RAGE_DMG = x => x.E.BOSS_RAGE.dmg;
/** Participación: quien hace daño a un enemigo recibe toda su experiencia; quien está cerca
 *  y despierto pero no le ha dado, la mitad; quien está lejos, caído o desconectado, nada. */
export const ASSIST_R = 10 * 32, ASSIST_SHARE = .5;
const DROP_LOCK = 2, MAX_FLOOR_ITEMS = 80;   // objetos soltados: quien suelta no lo recoge en 2 s; tope de objetos en el suelo
const DOOR_R = 56, PICK_R = 18, CHEST_R = 24, STAIRS_R = 18, GATHER_R = 56, REVIVE_R = 40, REVIVE_TIME = 2.5, CAMPFIRE_R = 80;

export class Expedition {
  /**
   * @param {object} o
   * @param {string} o.dungeonId
   * @param {number} o.seed
   * @param {{id:string, accountId?:string, name:string, profile:object}[]} o.members   perfil propio de cada uno
   * @param {() => number} [o.random]
   * @param {string} [o.expeditionId]   identificador único (clave de las recompensas en la base de datos)
   */
  constructor({ dungeonId, seed, members, random = Math.random, expeditionId = randomUUID() }) {
    const E = this.E = createServerEngine();
    this.dng = E.dungeonById(dungeonId);
    if (!this.dng) throw new Error('Mazmorra desconocida: ' + dungeonId);
    if (!members.length || members.length > MAX_PLAYERS) throw new Error('Número de jugadores no válido');
    this.seed = seed >>> 0; this.random = random; this.id = expeditionId;
    this.seq = [];
    for (let f = 1; f <= this.dng.floors; f++) { this.seq.push({ kind: 'normal', floorNo: f }); if (f === this.dng.waypoint) this.seq.push({ kind: 'waypoint', floorNo: f }); }
    this.seq.push({ kind: 'boss', floorNo: this.dng.floors + 1 });
    this.members = new Map();
    for (const m of members) this.addMember(m);
    this.events = []; this.ended = null; this.time = 0; this.nextId = 1; this.floorCount = 0; this.atkN = 0;
    // Generador propio para los dones: no altera la secuencia aleatoria del resto de la simulación
    let bs = (this.seed ^ 0xB00B5) >>> 0; this.boonRandom = () => { bs = (bs + 0x6D2B79F5) >>> 0; let t = bs; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    this.setScaling(this.partySize);
    this.loadStep(0);
  }

  addMember({ id, accountId = id, name, profile }) {
    const E = this.E, clean = E.Save.sanitize(structuredClone(profile));     // copia propia: nunca se comparte
    if (!clean.ok) throw new Error('Perfil no válido: ' + clean.fixes[0]);
    const save = clean.data, sp = E.FORMS[save.species];
    const p = new E.Player(sp, 0, 0, save.prog, save.equip);
    p.bag = new E.Inventory(save.inv, () => E.rankOf(save.points).bag);
    p.netId = id;
    const rewards = { gems: 0, exp: 0, loot: [], defeated: 0, assists: 0, damage: 0, floors: 0, maxFloor: 0, quests: [], rooms: new Set() };
    this.members.set(id, { id, accountId, name: String(name || sp.name).slice(0, 20), profile: save, save, player: p, rewards, run: rewards, queue: [], ack: 0, nextSeq: 0, lastAct: -1, stats: { casts: 0, rejected: 0, duplicates: 0 }, connected: true, downed: false, revive: 0, left: false, boonOffers: [] });
  }
  /** Lo compartido por todo el grupo (no pertenece a ningún perfil). */
  shared() {
    return { expeditionId: this.id, dungeon: this.dng.id, seed: this.seed, floor: Object.assign({}, this.floorInfo), floorTime: this.floor.time,
      boss: this.bossView(), doors: this.doors.map(d => ({ key: d.key, open: d.open })),
      enemies: this.g.actors.filter(a => a instanceof this.E.Enemy && a.alive).length, items: this.items.size, chestsOpened: this.objects.filter(o => o.type === 'chest' && o.opened).length };
  }
  /** Avance de una misión del perfil de un jugador (las mismas reglas que Quests.progress). */
  quest(m, kind, info) {
    const done = this.E.Quests.progress({ save: m.save }, kind, Object.assign({ dungeon: this.dng.id }, info));
    for (const j of done) { m.rewards.quests.push(j.id); this.emit('quest', { to: m.id, id: j.id, jobType: j.type, title: this.E.Jobs.title(j) }); }
  }

  get humans() { return [...this.members.values()].filter(m => !m.left).map(m => m.player); }
  /** Jugadores que siguen en la expedición (un desconectado cuenta: puede volver). */
  get partySize() { let n = 0; for (const m of this.members.values()) if (!m.left) n++; return n; }

  /* ---------- Dificultad según el número de jugadores (COOP_SCALING) ---------- */
  setScaling(n) {
    this.coop = coopScaling(n); this.coopN = Math.max(1, Math.min(MAX_PLAYERS, n));
    for (const a of this.g ? this.g.actors : []) if (a.netId && a.alive && a instanceof this.E.Enemy) this.scaleEnemy(a);
  }
  coopInfo() { return { players: this.coopN, hp: this.coop.hp, bossHp: this.coop.bossHp, dmg: this.coop.dmg, count: this.coop.count, text: coopSummary(this.coopN) }; }
  /** PS y daño del enemigo según el grupo. Conserva la proporción de PS que le quedaba. */
  scaleEnemy(e) {
    if (e.netBaseMaxHp == null) { e.netBaseMaxHp = e.maxHp; e.netBaseDmg = e.dmgMul; }
    const c = this.coop, ratio = e.maxHp > 0 ? e.hp / e.maxHp : 1;
    e.maxHp = Math.max(1, Math.round(e.netBaseMaxHp * (e.kind.isBoss ? c.bossHp : c.hp)));
    e.hp = Math.max(1, Math.min(e.maxHp, Math.round(ratio * e.maxHp)));
    e.dmgMul = e.netBaseDmg * c.dmg * (e.enraged ? E_RAGE_DMG(this) : 1);
  }
  /** ¿Sale élite? La probabilidad base del motor más el extra del grupo. */
  rollElite(base) { return !!base || (this.coop.elite > 0 && this.random() < this.coop.elite); }
  emit(type, data) { this.events.push(Object.assign({ type }, data)); }
  drainEvents() { const e = this.events; this.events = []; return e; }

  /* ---------- Pisos ---------- */
  loadStep(i) {
    const E = this.E, st = this.seq[i], kind = st.kind;
    this.stepIdx = i;
    const genNo = st.floorNo + (kind === 'waypoint' ? 200 : 0);
    // El piso crece con el grupo (FloorGen.SIZES): se fija al cargarlo y el cliente lo genera igual con `size`
    const size = this.partySize, gen = E.FloorGen.generate(this.seed, this.dng, genNo, kind, [], size);
    this.gen = gen; this.L = gen.layout; this.world = gen.world;
    this.floor = { kind, floorNo: st.floorNo, genNo, size, windLimit: Math.round(this.dng.wind * E.FloorGen.size(size).wind), time: 0, wind: 0, spawnT: 40, mh: false, warp: null };
    this.g = createHeadlessGame(E, this.world, { onPlayerDown: p => this.onPlayerDown(p), onEnemyDown: e => this.onEnemyDown(e) });
    // Furia del guardián: la simulación se detiene para TODOS mientras se ve la animación
    this.g.onBossRage = (e, stage = 0) => { this.pauseT = E.BOSS_RAGE.pauses[stage] || E.BOSS_RAGE.pause; this.emit('bossRage', { id: e.netId, stage }); };
    // Reina Geoda: choques contra las rocas, aturdimiento, salto y aterrizaje (solo avisos: el estado va en bossView)
    this.g.onBossEvent = (e, what, info) => this.emit('bossEvent', { id: e.netId, what, hits: (info && info.hits) || 0 });
    // Enemigos del piso (como FloorRT.spawnInitial; los forajidos y vecinos de misiones no van online)
    const lvl = E.enemyLevel(this.dng, st.floorNo);
    for (const s of this.L.enemies) {
      if (s.outlaw) continue;
      const kindObj = s.boss ? E.makeBossKind(s.boss) : E.makeKind(s.variant);
      const e = new E.Enemy(kindObj, (s.tx + .5) * TS, (s.ty + .5) * TS, { level: s.boss ? E.enemyLevel(this.dng, this.dng.floors) + 2 : lvl, elite: s.boss ? s.elite : this.rollElite(s.elite), final: s.final });
      this.addEnemy(e, s.boss ? 'b:' + s.boss : 'v:' + s.variant);
      if (s.boss) {
        this.boss = e;
        // En la guarida grande del cooperativo el guardián os ve desde la entrada, como en la normal
        const dist = Math.hypot(s.tx - this.L.spawn.tx, s.ty - this.L.spawn.ty) * TS;
        if (dist + 2 * TS > e.kind.aggro) e.kind = Object.assign({}, e.kind, { aggro: dist + 2 * TS });
      }
    }
    this.extraEnemies(lvl);
    // Objetos del suelo (sin tienda ni objetos de encargo) y objetos del piso
    this.items = new Map();
    for (const m of this.members.values()) { m.rewards.rooms = new Set(); m.rewards.maxFloor = Math.max(m.rewards.maxFloor, st.floorNo); }
    this.L.items.forEach((it, idx) => { if (!it.price && it.id !== 'job') this.items.set('f' + idx, { key: 'f' + idx, id: it.id, amount: it.amount || 1, x: (it.tx + .5) * TS, y: (it.ty + .5) * TS, tx: it.tx, ty: it.ty }); });
    // Puertas de la cámara del tesoro: compartidas; las abre quien llegue con una llave en SU mochila
    const W = this.L.w;
    this.corrTile = gen.biome.corrTile; this.bossPh2 = false;
    this.doors = this.L.doors.map((d, i) => { const cx = d.tiles.reduce((t, k) => t + k % W, 0) / d.tiles.length, cy = d.tiles.reduce((t, k) => t + ((k / W) | 0), 0) / d.tiles.length; return { key: 'door' + i, tiles: d.tiles.slice(), x: (cx + .5) * TS, y: (cy + .5) * TS, open: false }; });
    this.objects = this.L.objects.map((o, idx) => Object.assign({ key: 'o' + idx, opened: false }, o, { x: (o.tx + .5) * TS, y: (o.ty + .5) * TS }));
    // Jugadores en la entrada (en abanico para no solaparse); los caídos vuelven con un cuarto de PS
    const sx = gen.world.spawn.x, sy = gen.world.spawn.y, off = [[0, 0], [-22, 0], [22, 0], [0, 22]];
    let k = 0;
    for (const m of this.members.values()) {
      if (m.left) continue;
      const p = m.player, [ox, oy] = off[k++ % 4];
      p.placeAt(p.free(this.world, sx + ox, sy + oy) ? sx + ox : sx, p.free(this.world, sx + ox, sy + oy) ? sy + oy : sy);
      if (m.downed) { m.downed = false; p.alive = true; p.hp = Math.max(1, Math.round(p.maxHp * .25)); }
      if (kind === 'boss') { p.hp = Math.round(p.hp + (p.maxHp - p.hp) * .5); p.energy = Math.max(p.energy, E.CONFIG.ENERGY_MAX * .5); }
      m.queue.length = 0; m.atStairs = false; m.revive = 0;
      this.g.actors.push(p);
    }
    this.boss = this.boss && this.g.actors.includes(this.boss) ? this.boss : null;
    const label = kind === 'normal' ? `${this.dng.name} · P${st.floorNo}` : kind === 'waypoint' ? `${this.dng.name} · Punto de control` : `${this.dng.name} · Guarida`;
    this.floorInfo = { seed: this.seed, dungeon: this.dng.id, floorNo: st.floorNo, genNo, kind, step: i, total: this.seq.length, label, w: gen.world.w, h: gen.world.h, n: ++this.floorCount, size, coop: this.coopInfo() };
    this.emit('floor', { info: this.floorInfo });
    // Pico Cartero (vecino de las misiones): ruidos extraños en el piso 2 de la Gruta si alguien aún no lo conoce.
    // La escena (y su pausa) es para todo el grupo; el vecino es solo visual en cada cliente.
    const CI = E.COURIER_INTRO;
    if (this.dng.id === CI.dungeon && kind === 'normal' && st.floorNo === CI.floor && [...this.members.values()].some(m => !m.left && !m.save.cleared.includes(CI.dungeon))) { this.pauseT = CI.pause; this.emit('courierNoise', {}); }
    for (const m of this.members.values()) m.player.alientoUsed = false;
    if (kind === 'waypoint' || (kind === 'normal' && st.floorNo > 1)) this.offerBoons();
  }

  /* ---------- Dones de expedición (1 de 3 por piso; cada jugador los suyos) ---------- */
  offerBoons() {
    for (const m of this.members.values()) {
      if (m.left) continue;
      const options = this.E.Boons.offer(this.boonRandom, m.player.boons); if (!options.length) continue;
      m.boonOffers.push(options); if (m.boonOffers.length > 3) m.boonOffers.shift();
      this.emit('boons', { to: m.id, options: m.boonOffers[0], pending: m.boonOffers.length });   // el cliente cierra el panel al cambiar de piso: se reenvía siempre la primera pendiente
    }
  }
  /** El jugador elige un don de SU oferta pendiente; cualquier otro id se rechaza. */
  pickBoon(id, boonId) {
    const m = this.members.get(id); if (!m || m.left || this.ended) return 0;
    const cur = m.boonOffers[0];
    if (!cur || !cur.includes(boonId)) { this.emit('reject', { to: id, what: 'boon', why: 'no ofrecido' }); return 0; }
    m.boonOffers.shift();
    const lv = this.E.Boons.apply(m.player, boonId);
    this.emit('boon', { by: id, id: boonId, lv });
    if (m.boonOffers.length) this.emit('boons', { to: id, options: m.boonOffers[0], pending: m.boonOffers.length });
    return lv;
  }
  addEnemy(e, spec, push = true) { e.netId = 'e' + (this.nextId++); e.netKind = spec; this.scaleEnemy(e); if (push) this.g.actors.push(e); return e; }
  /**
   * Más enemigos con más jugadores: copias de los del piso (misma especie) cerca de su sitio,
   * nunca junto a la entrada. Total ≈ originales × count.
   */
  extraEnemies(lvl) {
    const E = this.E, base = this.L.enemies.filter(s => !s.outlaw && !s.boss);
    const want = Math.round(base.length * (this.coop.count - 1));
    const sx = this.world.spawn.x, sy = this.world.spawn.y;
    let made = 0;
    for (let k = 0; k < want * 12 && made < want; k++) {
      const s = base[made % base.length];
      const x = (s.tx + .5 + (this.random() * 2 - 1) * 3) * TS, y = (s.ty + .5 + (this.random() * 2 - 1) * 3) * TS;
      if (Math.hypot(x - sx, y - sy) < 8 * TS) continue;
      const e = new E.Enemy(E.makeKind(s.variant), x, y, { level: lvl, elite: this.rollElite(false) });
      if (!e.free(this.world, x, y)) continue;
      this.addEnemy(e, 'v:' + s.variant); made++;
    }
    this.floor.extra = made;
  }

  nextStep() {
    for (const m of this.members.values()) if (!m.left) m.rewards.floors++;
    if (this.stepIdx + 1 >= this.seq.length) return this.finish('clear');
    this.loadStep(this.stepIdx + 1);
  }

  /* ---------- Entradas ---------- */
  /** Encola las muestras de un mensaje ya validado por parseInput. Devuelve cuántas se aceptaron. */
  applyInput(id, input) {
    const m = this.members.get(id); if (!m || m.left || !input) return 0;
    // Secuencias continuas: lo repetido se ignora; si se perdió un mensaje, se continúa desde el nuevo
    let first = 0;
    if (input.s < m.nextSeq) first = m.nextSeq - input.s;
    else if (input.s > m.nextSeq) m.nextSeq = input.s;
    let n = 0;
    for (let i = first; i < input.samples.length; i++) {
      if (m.queue.length >= MAX_INPUT_BACKLOG) { m.dropped = (m.dropped || 0) + 1; continue; }   // nadie se adelanta al reloj del servidor
      const seq = input.s + i, acts = input.actions.filter(a => a.at === seq);
      m.queue.push({ seq, ax: input.samples[i][0], ay: input.samples[i][1], acts });
      n++;
    }
    m.nextSeq = Math.max(m.nextSeq, input.s + input.samples.length);
    return n;
  }
  /** Una muestra por paso. Sin muestras el jugador se detiene (no se repite la última). */
  consume(p) {
    const m = this.members.get(p.netId); if (!m || !m.connected) return { x: 0, y: 0 };
    const s = m.queue.shift(); if (!s) return { x: 0, y: 0 };
    m.ack = s.seq + 1;
    for (const a of s.acts) this.act(m, a);
    return { x: s.ax, y: s.ay };
  }
  /**
   * Una acción del cliente. Cada acción lleva un número `n` creciente por jugador: una acción
   * repetida (mensaje duplicado, reenvío tras reconectar) se descarta y nunca se aplica dos veces.
   */
  act(m, a) {
    const p = m.player, g = this.g;
    if (Number.isInteger(a.n)) { if (a.n <= m.lastAct) { m.stats.duplicates++; return; } m.lastAct = a.n; }
    if (!p.alive) return;
    g.aim = { dx: a.dx, dy: a.dy, d: a.d };
    let ok = false;
    if (a.k === 'b') ok = p.tryBasic(g);
    else if (a.k === 'm') ok = p.tryMove(g, a.i);
    else if (a.k === 'd') ok = p.tryDodge(g, { x: a.dx, y: a.dy });
    g.aim = null;
    const aid = m.id + ':' + (Number.isInteger(a.n) ? a.n : 's' + a.at);    // identificador único del ataque
    if (!ok) { m.stats.rejected++; this.emit('reject', { to: m.id, aid, what: a.k === 'm' ? 'move' + a.i : a.k === 'b' ? 'basic' : 'dodge' }); }
    else { m.stats.casts++; this.emit('cast', { aid, by: m.id, k: a.k, i: a.i, move: a.k === 'b' ? p.sp.basic : a.k === 'm' ? p.moveAt(a.i) : 'dodge', dx: a.dx, dy: a.dy, d: a.d, x: Math.round(p.x), y: Math.round(p.y) }); }
  }
  /** Usar un objeto del inventario (curas, comida, energía...). Lo que necesita el piso local no se permite. */
  /** Dejar un objeto en el suelo (1 unidad de la mochila) para que lo coja otro jugador. Quien lo suelta no lo
   *  vuelve a recoger sin querer durante DROP_LOCK s. Límite de objetos en el suelo para que nadie lo llene. */
  drop(id, itemId) {
    const m = this.members.get(id), E = this.E; if (!m || m.left || this.ended) return false;
    const p = m.player;
    if (!p.alive || typeof itemId !== 'string' || !E.ITEMS[itemId] || !p.bag.has(itemId)) return this.emit('reject', { to: id, what: 'drop', why: 'no' }), false;
    if (this.items.size >= MAX_FLOOR_ITEMS) return this.emit('reject', { to: id, what: 'drop', why: 'lleno' }), false;
    p.bag.take(itemId, 1);
    const it = this.scatter(p.x, p.y, itemId, 1);
    it.dropBy = id; it.dropUntil = this.time + DROP_LOCK;
    this.emit('itemDrop', { by: id, id: itemId, key: it.key, x: Math.round(it.x), y: Math.round(it.y) });
    return true;
  }
  use(id, itemId) {
    const m = this.members.get(id), E = this.E; if (!m || m.left || this.ended) return false;
    const p = m.player, it = E.ITEMS[itemId];
    if (!it || typeof it.use !== 'function' || it.cat !== 'consumible' || !p.bag.has(itemId)) return this.emit('reject', { to: id, what: 'use', why: 'no' }), false;
    if (!p.alive && itemId !== 'hierbaLucida') return false;
    const g = this.g, prev = g.player; g.player = p;
    let ok = false;
    try { ok = !!it.use(g, p); } catch (e) { ok = false; }
    g.player = prev;
    if (ok) { p.bag.take(itemId, 1); this.emit('used', { by: id, id: itemId }); }
    else this.emit('reject', { to: id, what: 'use', why: 'sin efecto' });
    return ok;
  }

  /* ---------- Simulación ---------- */
  step(dt) {
    if (this.ended) return;
    if (this.pauseT > 0) { this.pauseT -= dt; for (const m of this.members.values()) m.queue.length = 0; return; }   // escena en pausa
    const E = this.E, g = this.g, f = this.floor;
    this.time += dt; f.time += dt;
    stepWorld(E, g, dt, this.humans, p => this.consume(p));
    if (this.ended) return;
    // Enemigos creados por el propio motor (invocaciones del guardián): se numeran para que
    // se sincronicen con todos y se ajustan al grupo como los demás.
    for (const a of g.actors) if (!a.netId && a.alive && a instanceof E.Enemy) this.addEnemy(a, 'v:' + a.kindId, false);
    this.enemyAttacks();
    const live = [...this.members.values()].filter(m => !m.left);
    for (const m of live) if (!m.player.alive && !m.downed) this.onPlayerDown(m.player);   // cualquier causa de caída
    const awake = live.filter(m => m.connected && m.player.alive);
    // Recogida automática (como en el prototipo), cofres y hoguera: lo decide el servidor
    for (const m of awake) {
      const p = m.player;
      for (const it of this.items.values()) if (Math.hypot(it.x - p.x, it.y - p.y) <= PICK_R && !(it.dropBy === m.id && this.time < it.dropUntil)) this.pickUp(m, it);
      for (const o of this.objects) {
        const d = Math.hypot(o.x - p.x, o.y - p.y);
        if (o.type === 'chest' && !o.opened && d < CHEST_R) this.openChest(m, o);
        if (o.type === 'campfire' && d < CAMPFIRE_R) { p.hp = Math.min(p.maxHp, p.hp + 2.5 * dt); p.energy = Math.min(E.CONFIG.ENERGY_MAX, p.energy + 6 * dt); }
      }
      for (const dr of this.doors) if (!dr.open && Math.hypot(dr.x - p.x, dr.y - p.y) <= DOOR_R) this.tryDoor(m, dr);
      // Salas que explora cada uno (misiones de explorar) y nido de monstruos
      const tx = p.x / TS | 0, ty = p.y / TS | 0, room = this.L.rooms.find(r => tx >= r.x && tx < r.x + r.w && ty >= r.y && ty < r.y + r.h);
      if (room && !m.rewards.rooms.has(room.id)) { m.rewards.rooms.add(room.id); if (f.kind === 'normal') this.quest(m, 'room', {}); }
      if (!f.mh && this.L.mhRoom >= 0 && room && room.id === this.L.mhRoom) this.triggerMonsterHouse(room, p);
    }
    // Reanimar: un compañero junto al caído durante REVIVE_TIME segundos
    for (const m of live) {
      if (!m.downed) continue;
      const helper = awake.find(o => o !== m && Math.hypot(o.player.x - m.player.x, o.player.y - m.player.y) < REVIVE_R);
      m.revive = helper ? m.revive + dt : Math.max(0, m.revive - dt * .5);
      if (m.revive >= REVIVE_TIME) { m.downed = false; m.revive = 0; const p = m.player; p.alive = true; p.hp = Math.max(1, Math.round(p.maxHp * .35)); p.iframes = 1.5; this.emit('revived', { id: m.id, by: helper.id }); }
    }
    // Derrota del grupo: todos los conectados caídos (si no queda nadie conectado, se espera)
    const connected = live.filter(m => m.connected);
    if (connected.length && connected.every(m => m.downed)) return this.finish('faint');
    // Viento y enemigos errantes (solo pisos normales)
    if (f.kind === 'normal') {
      const lim = f.windLimit, steps = [.6, .8, .92];
      while (f.wind < 3 && f.time >= lim * steps[f.wind]) this.emit('wind', { level: ++f.wind });
      if (f.time >= lim) return this.finish('wind');
      if (awake.length) { f.spawnT -= dt; if (f.spawnT <= 0) { f.spawnT = (35 + this.random() * 20) / this.coop.spawn; this.spawnWanderer(awake); } }
    }
    // Escalera, portal y salida: avanza el grupo cuando todos los despiertos están en ella
    if (this.L.stairs && awake.length) {
      const sx = (this.L.stairs.tx + .5) * TS, sy = (this.L.stairs.ty + .5) * TS;
      for (const m of live) m.atStairs = m.connected && m.player.alive && Math.hypot(m.player.x - sx, m.player.y - sy) < (m.atStairs ? GATHER_R : STAIRS_R);
      if (awake.some(m => m.atStairs)) {
        if (awake.every(m => m.atStairs)) return this.nextStep();
        if (!this.waitMsgT || this.time > this.waitMsgT) { this.waitMsgT = this.time + 3; this.emit('waiting', { at: 'stairs', ready: awake.filter(m => m.atStairs).map(m => m.id) }); }
      }
    }
    for (const o of this.objects) {
      if (o.type !== 'warp' && o.type !== 'portal') continue;
      const near = awake.filter(m => Math.hypot(o.x - m.player.x, o.y - m.player.y) < (o.type === 'warp' ? 30 : 26));
      if (near.length && near.length === awake.length) return this.finish(o.type === 'warp' ? 'clear' : 'return');
    }
  }

  /** Puerta cerrada: se abre (para todos) gastando una llave de la mochila de quien llega. */
  tryDoor(m, dr) {
    if (dr.open) return false;
    if (!m.player.bag.take('llave')) {
      if (!m.doorMsg || this.time > m.doorMsg) { m.doorMsg = this.time + 3; this.emit('reject', { to: m.id, what: 'door', why: 'sin llave' }); }
      return false;
    }
    dr.open = true;
    for (const i of dr.tiles) this.world.tiles[i] = this.corrTile;      // el mismo cambio que hace el cliente
    this.emit('door', { key: dr.key, by: m.id, x: Math.round(dr.x), y: Math.round(dr.y) });
    return true;
  }
  /** Ataques de los enemigos que acaban de ejecutarse (fin del aviso) y cambio de fase del jefe. */
  enemyAttacks() {
    for (const e of this.g.actors) {
      if (!e.netId || !(e instanceof this.E.Enemy)) continue;
      const prev = e.netPrev; e.netPrev = e.state;
      if (prev === 'windup' && e.state !== 'windup' && e.alive)
        this.emit('eatk', { aid: 'E' + (++this.atkN), id: e.netId, pattern: e.pattern || '', boss: !!e.kind.isBoss, x: Math.round(e.x), y: Math.round(e.y), ax: e.atk ? Math.round(e.atk.x * 100) / 100 : 0, ay: e.atk ? Math.round(e.atk.y * 100) / 100 : 0 });
    }
    const b = this.boss;
    if (b && b.alive && !this.bossPh2 && b.hp < b.maxHp * .5 && b.kind.script !== 'geoda') { this.bossPh2 = true; this.emit('bossPhase', { id: b.netId, phase: 2 }); }
  }
  /** Estado del guardián (igual para todos): PS, fase y patrón que está preparando. */
  bossView() {
    const b = this.boss; if (!b) return null;
    // rocks: «id:tx:ty:ps:caída» de cada roca de la Reina Geoda (caída > 0 = aún cayendo)
    const rocks = (this.g.boulders || []).map(r => `${r.id}:${r.tx}:${r.ty}:${r.hp}:${Math.max(0, Math.round(r.fall * 10) / 10)}`).join(',');
    return { id: b.netId, alive: b.alive, hp: Math.max(0, Math.ceil(b.hp)), maxHp: b.maxHp, phase: b.hp < b.maxHp * .5 ? 2 : 1, rage: !!b.enraged, state: b.state || '', pattern: b.state === 'windup' || b.state === 'charging' ? (b.pattern || '') : '',
      stage: b.geodaStage || 0, hits: b.rockHits || 0, rocks };
  }
  spawnWanderer(awake) {
    const E = this.E, enemies = this.g.actors.filter(a => a.team === 'enemy' && a.alive).length;
    if (enemies >= this.L.enemies.length + (this.floor.extra || 0) + 3 + this.coop.wander) return;
    const rooms = this.L.rooms.filter(r => r.type === 'normal');
    for (let k = 0; k < 20 && rooms.length; k++) {
      const r = rooms[Math.floor(this.random() * rooms.length)], tx = r.x + 1 + Math.floor(this.random() * (r.w - 2)), ty = r.y + 1 + Math.floor(this.random() * (r.h - 2));
      const x = (tx + .5) * TS, y = (ty + .5) * TS;
      if (awake.some(m => Math.hypot(x - m.player.x, y - m.player.y) < 10 * TS)) continue;
      const v = E.weighted(this.dng.enemies, this.random), e = new E.Enemy(E.makeKind(v), x, y, { level: E.enemyLevel(this.dng, this.floor.floorNo), elite: this.rollElite(false) });
      if (!e.free(this.world, x, y)) continue;
      this.addEnemy(e, 'v:' + v); return e;
    }
  }
  triggerMonsterHouse(r, p) {
    const E = this.E, lvl = E.enemyLevel(this.dng, this.floor.floorNo), n = Math.round((5 + Math.floor(lvl / 4)) * this.coop.count);
    this.floor.mh = true;
    for (let k = 0, made = 0; k < 40 * n && made < n; k++) {
      const tx = r.x + Math.floor(this.random() * r.w), ty = r.y + Math.floor(this.random() * r.h), x = (tx + .5) * TS, y = (ty + .5) * TS;
      if (Math.hypot(x - p.x, y - p.y) < 90) continue;
      const v = E.weighted(this.dng.enemies, this.random), e = new E.Enemy(E.makeKind(v), x, y, { level: lvl, elite: this.random() < .15 + this.coop.elite });
      if (!e.free(this.world, x, y)) continue;
      e.aggro = true; e.tag = 'mh'; this.addEnemy(e, 'v:' + v); made++;
    }
    this.emit('monsterhouse', {});
  }

  /* ---------- Botín y recompensas ---------- */
  pickUp(m, it) {
    const p = m.player;
    if (it.id === 'gems') { this.items.delete(it.key); m.run.gems += it.amount; m.run.loot.push({ id: 'gems', qty: it.amount }); this.emit('pickup', { by: m.id, id: 'gems', n: it.amount, x: it.x, y: it.y }); return; }
    if (!this.E.ITEMS[it.id]) { this.items.delete(it.key); return; }
    const n = p.bag.add(it.id, it.amount);
    if (n <= 0) { if (!m.fullMsg || this.time > m.fullMsg) { m.fullMsg = this.time + 3; this.emit('reject', { to: m.id, what: 'pickup', why: 'lleno' }); } return; }
    it.amount -= n; if (it.amount <= 0) this.items.delete(it.key);
    m.run.loot.push({ id: it.id, qty: n });
    this.quest(m, 'item', { id: it.id, n });
    this.emit('pickup', { by: m.id, id: it.id, n, x: it.x, y: it.y });
  }
  openChest(m, o) {
    if (o.opened) return; o.opened = true;               // marcado antes de tirar el botín: nunca se abre dos veces
    const res = this.E.Loot.roll(o.tier, this.dng, this.random);
    if (res.gems) this.scatter(o.x, o.y, 'gems', res.gems);
    for (const x of res.items) this.scatter(o.x, o.y, x.id, x.qty);
    this.emit('chest', { by: m.id, key: o.key, tier: o.tier });
  }
  scatter(x, y, id, amount) {
    const W = this.L.w, cx = Math.floor(x / TS), cy = Math.floor(y / TS), SOLID = this.E.SOLID, T = this.E.T;
    const busy = (tx, ty) => [...this.items.values()].some(it => it.tx === tx && it.ty === ty) || this.objects.some(o => o.tx === tx && o.ty === ty && o.type !== 'chest');
    let spot = null;
    for (let r = 1; r <= 3 && !spot; r++) for (let dy = -r; dy <= r && !spot; dy++) for (let dx = -r; dx <= r && !spot; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
      const tx = cx + dx, ty = cy + dy, t = this.world.tiles[ty * W + tx];
      if (tx < 1 || ty < 1 || tx >= W - 1 || ty >= this.L.h - 1 || SOLID[t] || t === T.STAIRS || busy(tx, ty)) continue;
      spot = { tx, ty };
    }
    spot = spot || { tx: cx, ty: cy };
    const key = 'd' + (this.nextId++);
    const it = { key, id, amount, x: (spot.tx + .5) * TS, y: (spot.ty + .5) * TS, tx: spot.tx, ty: spot.ty };
    this.items.set(key, it); return it;
  }
  onEnemyDown(e) {
    if (e.netDone) return; e.netDone = true;            // experiencia y botín una sola vez por enemigo
    if (e.netLast) { creditDamage(e, e.netLast.id, e.netLast.before); e.netLast = null; }   // el golpe final
    const E = this.E, dmg = e.netDmg || {};
    for (const m of this.members.values()) {
      if (m.left || !m.connected || m.downed) continue;
      const hit = (dmg[m.id] || 0) > 0, near = m.player.alive && Math.hypot(m.player.x - e.x, m.player.y - e.y) <= ASSIST_R;
      const share = hit ? 1 : near ? ASSIST_SHARE : 0;
      if (!share) continue;
      if (hit) { m.rewards.defeated++; m.rewards.damage += dmg[m.id]; } else m.rewards.assists++;
      this.gainExp(m, Math.max(1, Math.round(E.expYield(e, m.player.level) * share)));
      if (e.team === 'enemy') this.quest(m, 'defeat', { kind: e.kindId, boss: !!e.kind.isBoss });
    }
    this.emit('enemyDown', { id: e.netId, x: e.x, y: e.y, boss: !!e.kind.isBoss });
    if (e.kind.isBoss) {
      this.g.actors.forEach(a => { if (a.summoner === e && a.alive) a.die(this.g); });
      const r = this.L.rooms[0];
      this.objects.push({ key: 'warp', type: 'warp', tx: r.cx, ty: r.cy, x: (r.cx + .5) * TS, y: (r.cy + .5) * TS, opened: false });
      const tx = Math.floor(e.x / TS), ty = Math.floor(e.y / TS), cx = (r.cx === tx && r.cy === ty) ? tx + 2 : tx, free = !E.SOLID[this.world.tiles[ty * this.L.w + cx]];
      const ch = { key: 'bossChest', type: 'chest', tier: 'cofreJefe', tx: free ? cx : r.cx + 2, ty: free ? ty : r.cy, opened: false };
      ch.x = (ch.tx + .5) * TS; ch.y = (ch.ty + .5) * TS; this.objects.push(ch);
    } else if (!e.summoner) {
      const res = E.Loot.roll(e.elite ? 'elite' : 'enemigo', this.dng, this.random);
      if (res.gems) this.scatter(e.x, e.y, 'gems', res.gems);
      for (const x of res.items) this.scatter(e.x, e.y, x.id, x.qty);
    }
  }
  /** Experiencia al perfil de ESE jugador (mismas reglas que en solitario: rules.gainExp). */
  gainExp(m, n) {
    const p = m.player, xp = gainExp(this.E, m.save, n, true);
    if (!xp.gained) return;
    m.rewards.exp += n;
    this.emit('exp', { to: m.id, n });
    if (xp.levels.length) {
      p.level = m.save.prog.level; p.recalc(); p.moves = m.save.prog.equipped.slice(0, 4);
      this.emit('levelup', { to: m.id, level: p.level, learned: xp.learned });
    }
  }
  onPlayerDown(p) {
    const m = p && this.members.get(p.netId); if (!m || m.downed) return;
    m.downed = true; m.revive = 0;
    this.emit('down', { id: m.id });
  }

  /* ---------- Conexión ---------- */
  setConnected(id, on) {
    const m = this.members.get(id); if (!m || m.left) return;
    m.connected = on; m.player.dormant = !on; m.queue.length = 0;
    if (on) { this.emit('boonsSync', { to: id, boons: Object.assign({}, m.player.boons) }); if (m.boonOffers[0]) this.emit('boons', { to: id, options: m.boonOffers[0] }); }
    if (!on) { const p = m.player; p.vx = p.vy = 0; p.dash = null; p.windup = null; }
    this.emit(on ? 'reconnected' : 'dropped', { id });
  }
  /** Desde dónde sigue la entrada de un jugador que vuelve (otro dispositivo o tras recargar). */
  resumeInfo(id) { const m = this.members.get(id); return m ? { seq: m.nextSeq, act: m.lastAct } : null; }
  /** Un jugador se va definitivamente: se le aplica el resultado de retirada y sale del piso. */
  removeMember(id, reason = 'abandon') {
    const m = this.members.get(id); if (!m || m.left) return null;
    const out = this.ended ? null : this.settle(m, reason);
    m.left = true; m.player.alive = false; m.player.dormant = true;
    this.g.actors = this.g.actors.filter(a => a !== m.player);
    this.emit('left', { id });
    if (!this.ended && ![...this.members.values()].some(x => !x.left)) this.ended = { result: 'abandon', results: new Map() };
    else if (!this.ended) { this.setScaling(this.partySize); this.floorInfo.coop = this.coopInfo(); this.emit('coop', { coop: this.coopInfo() }); }
    return out;
  }

  /* ---------- Final ---------- */
  finish(result) {
    if (this.ended) return;
    const results = new Map();
    for (const m of this.members.values()) if (!m.left) results.set(m.id, this.settle(m, result));
    this.ended = { result, results };
    this.emit('end', { result });
  }
  /**
   * Aplica el resultado a la copia del perfil de un jugador. Mismas reglas que Game.endRun:
   * con éxito se cobran las monedas; al caer se pierden las monedas de la expedición y la mitad
   * de las casillas del inventario. Nunca se pierden niveles, experiencia ni movimientos.
   */
  settle(m, result) {
    // 'interrupted': el servidor se reinicia o falla la sala. No es culpa del jugador: conserva lo
    // conseguido (como al volver por el portal) pero no cuenta como misión cumplida.
    const E = this.E, s = m.save, p = m.player, success = ['clear', 'return', 'interrupted'].includes(result), lines = [];
    let lostItems = 0;
    if (success) {
      s.bank += m.run.gems;
      if (result === 'interrupted') lines.push('La expedición se ha interrumpido (reinicio o fallo del servidor): conservas lo conseguido.');
      else this.quest(m, 'expedition', { floor: m.rewards.maxFloor });
      if (result === 'clear') {
        const bonus = 80 + 60 * E.DUNGEONS.indexOf(this.dng); this.gainExp(m, bonus); lines.push(`Recompensa por vencer al guardián: ${bonus} EXP.`);
        if (!s.cleared.includes(this.dng.id)) { s.cleared.push(this.dng.id); s.points += 50; lines.push(`¡Primera vez que completas ${this.dng.name}! +50 puntos de rango.`); }
      }
    } else {
      const n = Math.floor(p.bag.stacks.length / 2);
      for (let i = 0; i < n; i++) { const st = p.bag.stacks[Math.floor(this.random() * p.bag.stacks.length)]; lostItems += st.qty; p.bag.takeUid(st.uid, st.qty); }
      lines.push(`Has perdido ${m.run.gems} monedas y ${lostItems} objeto${lostItems === 1 ? '' : 's'} del inventario.`);
      lines.push(`Conservas tu nivel (${s.prog.level}), la experiencia y los movimientos aprendidos.`);
    }
    p.bag.take('llave', p.bag.count('llave'));
    s.inv = p.bag.stacks.map(x => ({ uid: x.uid, id: x.id, qty: x.qty }));
    s.equip = p.equip; s.runs = (s.runs || 0) + 1; s.activeRun = null;
    s.boardSeed = (s.boardSeed * 31 + s.runs * 7919 + 13) % 1e7; s.board = E.Jobs.board(s, s.boardSeed);   // como Game.endRun
    const clean = E.Save.sanitize(s);
    const r = m.rewards;
    return { id: m.id, accountId: m.accountId, expeditionId: this.id, result, success, lines, profile: clean.ok ? clean.data : null,
      summary: { floors: r.floors, maxFloor: r.maxFloor, defeated: r.defeated, assists: r.assists, damage: Math.round(r.damage), gems: success ? r.gems : 0, gemsLost: success ? 0 : r.gems,
        exp: r.exp, items: r.loot.filter(x => x.id !== 'gems').reduce((t, x) => t + x.qty, 0), itemsLost: lostItems, quests: r.quests.slice(), level: s.prog.level, species: s.species } };
  }

  /* ---------- Vista para la red ---------- */
  /** Estado plano (lo que la sala copia al esquema de Colyseus). */
  view() {
    const r1 = v => Math.round(v * 10) / 10;
    const players = [];
    for (const m of this.members.values()) {
      if (m.left) continue;
      const p = m.player;
      players.push({ id: m.id, name: m.name, species: m.save.species, level: p.level, x: r1(p.x), y: r1(p.y), vx: r1(p.vx), vy: r1(p.vy), fx: r1(p.facing.x), fy: r1(p.facing.y),
        hp: Math.ceil(p.hp), maxHp: p.maxHp, exp: m.save.prog.exp, energy: Math.floor(p.energy), belly: Math.ceil(p.belly), downed: m.downed, revive: r1(m.revive / REVIVE_TIME), connected: m.connected, ack: m.ack,
        cds: p.cds.map(c => r1(c)), basic: p.basicCharges, dodge: p.dodgeCharges, dash: !!p.dash, moves: p.moves.slice(), gems: m.run.gems, iframes: p.iframes > 0 });
    }
    const enemies = [];
    for (const a of this.g.actors) {
      if (!a.netId || !a.alive || !(a instanceof this.E.Enemy)) continue;
      enemies.push({ id: a.netId, kind: a.netKind, x: r1(a.x), y: r1(a.y), fx: r1(a.facing.x), fy: r1(a.facing.y), hp: Math.ceil(a.hp), maxHp: a.maxHp, level: a.level, elite: !!a.elite, state: a.state, timer: r1(a.timer || 0), wind: r1(a.windupTime || 1), aggro: !!a.aggro,
        pattern: a.pattern || '', ax: r1(a.atk ? a.atk.x : 0), ay: r1(a.atk ? a.atk.y : 0), gx: r1(a.target ? a.target.x : 0), gy: r1(a.target ? a.target.y : 0) });
    }
    for (const pr of this.g.projectiles) if (!pr.netId) pr.netId = 's' + (this.nextId++);
    for (const z of this.g.zones) if (!z.netId) z.netId = 'z' + (this.nextId++);
    const shots = this.g.projectiles.map(pr => ({ id: pr.netId, x: r1(pr.x), y: r1(pr.y), vx: r1(pr.vx), vy: r1(pr.vy), r: pr.r, kind: pr.kind, color: pr.color, team: pr.team, owner: pr.src && pr.src.netId || (pr.hit && pr.hit.src && pr.hit.src.netId) || '' }));
    const zones = this.g.zones.map(z => ({ id: z.netId, x: r1(z.x), y: r1(z.y), r: z.r || 0, team: z.team || '', color: z.color || '', life: z.life || 0, t: r1(z.t || 0) }));
    return { floor: this.floorInfo, time: r1(this.floor.time), wind: this.floor.wind, players, enemies, shots, zones,
      items: [...this.items.values()].map(it => ({ key: it.key, id: it.id, amount: it.amount, tx: it.tx, ty: it.ty })),
      objects: this.objects.map(o => ({ key: o.key, type: o.type, tx: o.tx, ty: o.ty, opened: !!o.opened, tier: o.tier || '' })),
      doors: this.doors.map(d => ({ key: d.key, open: d.open })), boss: this.bossView() };
  }
}
