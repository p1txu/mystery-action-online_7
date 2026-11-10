/**
 * Grupo privado y expedición cooperativa (sala de Colyseus 0.18).
 *  - Quien crea la sala es el anfitrión; el servidor genera un código único (registry).
 *  - Hasta MAX_PLAYERS jugadores. Para entrar: sesión válida, código correcto, plaza libre,
 *    perfil en el servidor y que la cuenta no esté ya en esta ni en otra sala.
 *  - Cada jugador entra con SU perfil, leído del servidor con SU token. Nada de lo que envía
 *    un cliente (opciones de entrada o mensajes) cambia el nombre, la criatura o la partida
 *    de nadie; el anfitrión solo puede elegir la mazmorra y empezar.
 *  - La lógica de juego está en ../sim/Expedition.js; aquí solo se adapta a Colyseus.
 */
import { Room, ServerError, CloseCode } from '@colyseus/core';
import { ExpeditionState, PlayerState, EnemyState, ItemState, ObjectState, ShotState, ZoneState, DoorState, BossState } from './schema.js';
import { Expedition } from '../sim/Expedition.js';
import { C, S, ERR, MAX_PLAYERS, SIM_STEP, HOST_RULE, PROTOCOL_VERSION, RECONNECT_CHOICES, parseInput, normalizeCode, errorMessage, reconnectWindow } from '../../../shared/protocol.js';
import { PARTY_GO_WAIT_MS } from '../../../shared/social.js';

const fail = code => new ServerError(code, errorMessage(code));
import { createEngineCore } from '../../../shared/engine-core.generated.js';
import { log, shortId } from '../log.js';

const RULES = createEngineCore();

/** Mazmorra del punto de control vigente de un perfil ('' si no tiene o ha caducado). */
/** Repite una escritura en la base de datos si falla (fallos pasajeros): 3 reintentos con espera creciente. */
export const RETRY_WAITS_MS = [300, 1000, 3000];
async function retry(fn, waits = RETRY_WAITS_MS) {
  for (let i = 0; ; i++) { try { return await fn(); } catch (e) { if (i >= waits.length) throw e; await new Promise(r => setTimeout(r, waits[i])); } }
}

export class ExpeditionRoom extends Room {
  /** Servicios inyectados desde app.js: { identity, profiles, registry, reconnectSeconds }. */
  static services = null;
  maxClients = MAX_PLAYERS;
  state = new ExpeditionState();

  onCreate(options) {
    const { registry } = ExpeditionRoom.services;
    this.members = new Map();       // sessionId → { accountId, name, save, version }
    this.claims = new Map();        // sessionId → accountId (desde onAuth, también entradas a medias)
    this.exp = null; this.acc = 0; this.syncT = 0;
    this.committed = new Set();     // cuentas cuya recompensa ya se guardó (además del libro de la base de datos)
    this.results = new Map();       // accountId → mensaje RESULT (se reenvía si se reconecta)
    this.held = new Map();          // sessionId → { token, until } de quien perdió la conexión (sitio guardado)
    this.code = registry.newCode(this.roomId);
    registry.attach(this.roomId, this);
    this.state.code = this.code;
    // Ventana de reconexión: configuración del servidor (variable RECONNECT_SECONDS, 5-900 s)
    this.reconnectSeconds = reconnectWindow(ExpeditionRoom.services.reconnectSeconds);
    // Opciones que puede elegir el anfitrión: tiempos de reconexión hasta el máximo del servidor
    const max = ExpeditionRoom.services.reconnectMaxSeconds || 300;
    this.reconnectChoices = [...new Set([...RECONNECT_CHOICES.filter(v => v <= max), this.reconnectSeconds])].sort((a, b) => a - b);
    this.hostTimer = null;
    this.state.reconnectSeconds = this.reconnectSeconds; this.state.hostRule = HOST_RULE;
    this.solo = !!(options && options.solo === true);          // expedición en solitario con la cuenta: una plaza
    this.state.max = this.solo ? 1 : MAX_PLAYERS; this.maxClients = this.state.max;
    if (options && RULES.dungeonById(options.dungeon)) this.state.dungeon = options.dungeon;
    // Expedición de un grupo persistente (la crea el hub): solo entran sus miembros y empieza sola al estar todos.
    // La clave la deja el servidor en el registro; un cliente no puede inventarse un grupo.
    const party = options && options.partyKey ? registry.takeParty(options.partyKey) : null;
    if (party) {
      this.party = { id: party.party, leader: party.leader, accounts: new Set(party.accounts) };
      this.state.dungeon = party.dungeon; this.state.max = this.maxClients = party.accounts.length;
      this.partyTimer = this.clock.setTimeout(() => this.partyStart(true), PARTY_GO_WAIT_MS);
      this.autoDispose = false;       // nace vacía: no se cierra mientras llegan los del grupo (ni si alguien de fuera es rechazado)
    }
    this.setPrivate(true);          // no aparece en listados públicos: solo se entra con el código
    this.log = log.child({ room: this.roomId, code: this.code });
    this.log.info('room.create', { solo: this.solo, dungeon: this.state.dungeon });
    this.setMetadata({ code: this.code });

    // Cada mensaje solo afecta a quien lo envía (client.sessionId); no se acepta un id ajeno
    this.onMessage(C.READY, (client, msg) => { const p = this.state.players.get(client.sessionId); if (p && !p.host && this.state.phase === 'lobby') p.ready = !!(msg && msg.ready === true); });   // el anfitrión no marca: empieza él
    this.onMessage(C.DUNGEON, (client, msg) => this.setOptions(client, { dungeon: msg && msg.dungeon }));
    this.onMessage(C.OPTIONS, (client, msg) => this.setOptions(client, msg || {}));
    this.onMessage(C.HOST, (client, msg) => this.giveHost(client, msg || {}));
    this.onMessage(C.START, (client, msg) => this.start(client, msg || {}));
    this.onMessage(C.INPUT, (client, msg) => { if (this.exp) { const inp = parseInput(msg); if (inp) this.exp.applyInput(client.sessionId, inp); } });
    this.onMessage(C.USE, (client, msg) => { if (this.exp && msg && typeof msg.id === 'string') this.exp.use(client.sessionId, msg.id); });
    this.onMessage(C.DROP, (client, msg) => { if (this.exp && msg && typeof msg.id === 'string') this.exp.drop(client.sessionId, msg.id); });
    this.onMessage(C.BOON, (client, msg) => { if (this.exp && msg && typeof msg.id === 'string') this.exp.pickBoon(client.sessionId, msg.id); });
    this.onMessage(C.CHOOSE, (client, msg) => { if (this.exp && msg && typeof msg.topic === 'string' && typeof msg.option === 'string' && msg.topic.length < 40 && msg.option.length < 40) this.exp.choose(client.sessionId, msg.topic, msg.option); });
    this.onMessage(C.LEAVE, async client => { if (this.exp && this.state.phase === 'playing') { await this.commit(client.sessionId, this.exp.removeMember(client.sessionId, 'abandon')); } client.leave(CloseCode.CONSENTED); });   // salida voluntaria: no se guarda el sitio
    this.onMessage(C.PING, (client, msg) => client.send(S.PONG, { t: msg && msg.t, now: Date.now() }));

    const tick = dt => this.tick(dt);
    this.setTimestep(tick, 1000 / 60);
    this.patchRate = 50;            // 20 parches por segundo
  }

  /**
   * Antes de entrar. Errores con código ERR.* y mensaje comprensible (protocol.js).
   * El orden importa: lo asíncrono primero; la comprobación de plaza y duplicados y la reserva
   * van juntas al final, sin esperas entre medias, para que dos entradas simultáneas no pasen.
   */
  async onAuth(client, options, context) {
    try { return await this.authorize(client, options, context); }
    catch (e) { this.log.info('room.join_rejected', { code: e.code, reason: e.message }); throw e; }
  }
  async authorize(client, options, context) {
    const { identity, profiles, registry, expeditions } = ExpeditionRoom.services;
    options = options || {};
    const token = (context && context.token) || options.token;
    const account = typeof token === 'string' ? await identity.verify(token) : null;
    if (!account) throw fail(ERR.SESSION);
    if (options.protocol !== PROTOCOL_VERSION) throw fail(ERR.VERSION);
    if (this.party && !this.party.accounts.has(account.id)) throw fail(ERR.NOT_FOUND);   // expedición de otro grupo
    const creator = !this.party && options.creating === true && !this.creatorClaimed;      // quien crea la sala aún no conoce el código
    if (!creator && normalizeCode(options.code) !== this.code) throw fail(ERR.NOT_FOUND);
    if (this.state.phase !== 'lobby') throw fail(ERR.STARTED);
    const prof = await profiles.get(account.id);
    if (!prof) throw fail(ERR.NO_PROFILE);
    const pending = expeditions ? await expeditions.pendingFor(account.id) : null;   // expedición interrumpida que podría continuar
    // --- sin await a partir de aquí ---
    if (this.state.phase !== 'lobby' || this.starting) throw fail(ERR.STARTED);
    if ([...this.claims.values()].includes(account.id)) throw fail(ERR.DUPLICATE);
    if (this.claims.size >= this.state.max) throw fail(ERR.FULL);
    if (!registry.claim(account.id, this.roomId)) throw fail(ERR.OTHER_ROOM);
    if (creator) this.creatorClaimed = true;
    this.claims.set(client.sessionId, account.id);
    this.countPlayers();
    // Lo que se devuelve sale del servidor: cuenta del token y su perfil. Las opciones del cliente no se usan.
    return { account: { id: account.id, name: account.name }, save: prof.save, version: prof.version, pending };
  }

  onJoin(client, options, auth) {
    const { account, save, version, pending } = auth;
    let host = this.members.size === 0;
    if (this.party) {     // el líder del grupo es el anfitrión, entre quien entre primero
      host = account.id === this.party.leader || (this.members.size === 0 && !this.party.accounts.has(this.party.leader));
      if (account.id === this.party.leader) for (const q of this.state.players.values()) q.host = false;
      else if (this.members.size === 0) host = true;
    }
    this.members.set(client.sessionId, { accountId: account.id, name: account.name, save, version, pending: pending || null });
    this.state.players.set(client.sessionId, new PlayerState({ name: account.name, species: save.species, level: save.prog.level, host, ready: !!this.party, connected: true, hp: 1, maxHp: 1, joinedAt: Date.now() }));
    client.send(S.WELCOME, { sessionId: client.sessionId, code: this.code, host, save, reconnectSeconds: this.reconnectSeconds, reconnectChoices: this.reconnectChoices, hostRule: HOST_RULE });
    this.log.info('room.join', { session: client.sessionId, account: shortId(account.id), host, players: this.members.size });
    this.markCompanions();
    if (this.party) this.partyStart(false);
  }
  /** Quién iría como acompañante a la mazmorra elegida (no la tiene desbloqueada): se ve en la sala de espera. */
  markCompanions() {
    const dng = RULES.dungeonById(this.state.dungeon);
    for (const [id, m] of this.members) {
      const p = this.state.players.get(id); if (!p) continue;
      p.companion = !!dng && !RULES.dungeonOpen(m.save, dng);
      p.checkpoint = m.pending ? m.pending.dungeon : ''; p.pending = m.pending ? m.pending.id : ''; p.pendingLabel = m.pending ? m.pending.label : '';
    }
    // Continuar la expedición interrumpida: activado por defecto cuando TODOS están en la misma (el anfitrión puede
    // desactivarlo); si entra alguien que no estaba en ella, se empieza una nueva.
    this.state.resume = this.canResume() && !this.resumeOff;
  }
  /** ¿Pueden continuar? Solo si TODOS tienen pendiente la MISMA expedición, de la mazmorra elegida. */
  canResume(dungeon = this.state.dungeon) {
    const ms = [...this.members.values()], id = ms[0] && ms[0].pending && ms[0].pending.id;
    return !!id && ms.every(m => m.pending && m.pending.id === id && m.pending.dungeon === dungeon);
  }
  /** Grupo persistente: empieza cuando han entrado todos (o, al agotarse la espera, con los que hayan entrado). */
  partyStart(timeout) {
    if (!this.party || this.starting || this.state.phase !== 'lobby') return;
    const inside = new Set([...this.members.values()].map(m => m.accountId));
    if (!timeout && [...this.party.accounts].some(a => !inside.has(a))) return;
    if (!this.members.size) { this.log.info('room.party_empty'); this.disconnect().catch(() => {}); return; }
    if (this.partyTimer) { this.partyTimer.clear(); this.partyTimer = null; }
    this.autoDispose = true;
    const dng = RULES.dungeonById(this.state.dungeon);
    this.starting = true;
    this.beginExpedition(dng).catch(e => { this.log.error('room.start_failed', e); this.starting = false; });
  }

  /**
   * Opciones de expedición (solo el anfitrión LÓGICO y solo en la sala de espera). El servidor
   * valida cada valor: mazmorra existente y tiempo de reconexión de la lista permitida. Si algo
   * cambia, los demás vuelven a «no listo» para confirmar con las opciones nuevas.
   */
  setOptions(client, msg) {
    const p = this.state.players.get(client.sessionId);
    if (!p || !p.host || this.state.phase !== 'lobby' || this.starting) return client.send(S.REJECT, { what: 'options', why: 'Solo el anfitrión cambia las opciones, antes de empezar' });
    let changed = false;
    if (msg.dungeon !== undefined) {
      const d = RULES.dungeonById(msg.dungeon);
      if (!d) return client.send(S.REJECT, { what: 'options', why: 'Mazmorra desconocida' });
      if (d.id !== this.state.dungeon) { this.state.dungeon = d.id; this.resumeOff = false; changed = true; }
    }
    if (msg.resume !== undefined) {
      const want = msg.resume === true;
      if (want && !this.canResume(this.state.dungeon)) return client.send(S.REJECT, { what: 'options', why: 'Para continuar, todos tenéis que ser de la misma expedición interrumpida (y de esta mazmorra)' });
      this.resumeOff = !want;
      if (want !== this.state.resume) { this.state.resume = want; changed = true; }
    }
    if (msg.reconnect !== undefined) {
      if (!this.reconnectChoices.includes(msg.reconnect)) return client.send(S.REJECT, { what: 'options', why: 'Tiempo de reconexión no permitido' });
      if (msg.reconnect !== this.reconnectSeconds) { this.reconnectSeconds = this.state.reconnectSeconds = msg.reconnect; changed = true; }
    }
    if (changed) {
      for (const q of this.state.players.values()) if (!q.host) q.ready = false;
      this.markCompanions();
      this.log.info('room.options', { dungeon: this.state.dungeon, reconnect: this.reconnectSeconds });
    }
  }
  /** «Ceder liderazgo»: el anfitrión elige a otro integrante conectado (en la sala de espera o jugando). */
  giveHost(client, msg) {
    const me = this.state.players.get(client.sessionId), to = this.state.players.get(msg.to);
    if (!me || !me.host) return client.send(S.REJECT, { what: 'host', why: 'Solo el anfitrión puede ceder el liderazgo' });
    if (!to || msg.to === client.sessionId || !to.connected) return client.send(S.REJECT, { what: 'host', why: 'Elige a un integrante conectado' });
    this.transferHost(client.sessionId, 'manual', msg.to);
  }
  start(client, msg) {
    const me = this.state.players.get(client.sessionId);
    if (this.starting) return;
    if (!me || !me.host || this.state.phase !== 'lobby') return client.send(S.REJECT, { what: 'start', why: 'Solo el anfitrión puede empezar' });
    const dng = RULES.dungeonById(msg.dungeon || this.state.dungeon);
    if (!dng) return client.send(S.REJECT, { what: 'start', why: 'Mazmorra desconocida' });
    const notReady = [...this.state.players.entries()].filter(([id, p]) => id !== client.sessionId && !p.ready);
    if (notReady.length) return client.send(S.REJECT, { what: 'start', why: `Falta que ${notReady.map(([, p]) => p.name).join(', ')} marque «Estoy listo»` });
    const offline = [...this.state.players.values()].filter(p => !p.connected);
    if (offline.length) return client.send(S.REJECT, { what: 'start', why: `${offline.map(p => p.name).join(', ')} está reconectando; espera un momento` });
    // Regiones: el anfitrión debe tenerla desbloqueada; quien no la tenga va como ACOMPAÑANTE
    // (EXP, botín y trofeo sí; la mazmorra no cuenta como superada ni desbloquea la siguiente).
    const hostM = this.members.get(client.sessionId);
    if (!hostM || !RULES.dungeonOpen(hostM.save, dng)) return client.send(S.REJECT, { what: 'start', why: `Tú aún no has desbloqueado ${dng.name}` });
    if (this.state.dungeon !== dng.id) { this.state.dungeon = dng.id; this.resumeOff = false; this.markCompanions(); }
    this.starting = true;
    this.beginExpedition(dng).catch(e => { this.log.error('room.start_failed', e); this.starting = false; client.send(S.REJECT, { what: 'start', why: 'No se pudo cargar algún perfil; inténtalo de nuevo' }); });
  }
  /** Cada integrante entra con SU perfil, leído de nuevo de la base de datos al empezar. */
  async beginExpedition(dng) {
    const { profiles, expeditions } = ExpeditionRoom.services;
    const reload = async () => { for (const m of this.members.values()) {
      const rec = await profiles.get(m.accountId);
      if (!rec) throw new Error('Perfil desaparecido: ' + m.accountId);
      m.save = rec.save; m.version = rec.version;
      m.pending = expeditions ? await expeditions.pendingFor(m.accountId) : null;
    } };
    await reload();
    if (this.state.phase !== 'lobby') return;
    // ¿Continuar la expedición interrumpida? Se vuelve a comprobar con lo recién leído de la base de datos
    let snap = null;
    if (this.state.resume && this.canResume(dng.id)) {
      const e = await expeditions.get([...this.members.values()][0].pending.id);
      if (e && e.state && e.status !== 'ended') snap = e;
    }
    if (snap) {
      // Quien estaba en ella y no ha venido: se le cierra conservando lo conseguido (deja de estar pendiente)
      const here = new Set([...this.members.values()].map(m => m.accountId));
      for (const sm of snap.state.members) if (!sm.left && !here.has(sm.accountId)) await expeditions.close(sm.accountId, snap.id, 'absent');
    } else {
      // Expedición nueva: las interrumpidas de cada uno se cierran antes (conservando lo conseguido hasta su último punto seguro)
      const closed = [];
      for (const m of this.members.values()) if (m.pending) { await expeditions.close(m.accountId, m.pending.id, 'new-expedition'); closed.push({ name: m.name, label: m.pending.label }); }
      if (closed.length) { await reload(); this.broadcast(S.EVENT, { type: 'pendingClosed', list: closed }); }
    }
    if (this.state.phase !== 'lobby') return;
    const companions = [...this.members.values()].filter(m => !RULES.dungeonOpen(m.save, dng)).map(m => m.name);
    const list = [...this.members.entries()].map(([id, m]) => ({ id, accountId: m.accountId, name: m.name, profile: m.save, companion: !RULES.dungeonOpen(m.save, dng) }));
    this.exp = snap ? new Expedition({ restore: snap.state, members: list }) : new Expedition({ dungeonId: dng.id, seed: (Math.random() * 2 ** 31) >>> 0, members: list });
    this.snapSeq = snap ? snap.seq : 0;                 // las instantáneas siguen numerándose donde se quedaron
    if (companions.length) this.broadcast(S.EVENT, { type: 'companions', names: companions, dungeon: dng.name });
    if (snap) this.broadcast(S.EVENT, { type: 'resumed', dungeon: dng.name, label: snap.state.label || '' });
    this.state.phase = 'playing'; this.starting = false;
    ExpeditionRoom.services.registry.close(this.code);
    this.lock();
    this.flushEvents(); this.sync();
    this.log.info('room.start', { dungeon: dng.id, players: this.members.size, expedition: this.exp.id });
  }

  tick(deltaMs) {
    if (!this.exp || this.state.phase !== 'playing' || this.frozen || this.shuttingDown) return;   // frozen: solo en pruebas (comparar fotos fijas)
    this.acc = Math.min(this.acc + deltaMs / 1000, .25);       // tras un parón no se recupera más de 250 ms
    try {
      while (this.acc >= SIM_STEP) { this.exp.step(SIM_STEP); this.acc -= SIM_STEP; if (this.exp.ended) break; }
    } catch (e) {
      // Un fallo en la simulación de ESTA sala no tumba el servidor ni a los demás grupos:
      // se cierra la expedición guardando lo conseguido (como un reinicio) y se registra.
      this.log.error('room.sim_error', e);
      this.acc = 0;
      if (!this.exp.ended) this.exp.finish('interrupted');
    }
    this.flushEvents();
    this.syncT += deltaMs; if (this.syncT >= 50) { this.syncT = 0; this.sync(); }
    if (this.exp.ended) this.end();
  }

  flushEvents() {
    for (const ev of this.exp.drainEvents()) {
      if (ev.type === 'floor') { this.broadcast(S.FLOOR, ev.info); continue; }
      if (ev.type === 'safepoint') { this.persist(ev.reason).catch(() => {}); continue; }
      const to = ev.to && this.clients.find(c => c.sessionId === ev.to);
      if (ev.to) { if (to) to.send(S.EVENT, ev); } else this.broadcast(S.EVENT, ev);
    }
  }

  /** Copia la vista plana de la simulación al esquema (solo cambia lo que cambió). */
  sync() {
    const v = this.exp.view(), st = this.state;
    st.floorN = v.floor.n; st.time = v.time; st.wind = v.wind; if (st.mech !== v.mech) st.mech = v.mech || '';
    for (const p of v.players) {
      const s = st.players.get(p.id); if (!s) continue;
      for (const k of ['x', 'y', 'vx', 'vy', 'fx', 'fy', 'hp', 'maxHp', 'exp', 'energy', 'belly', 'gems', 'downed', 'revive', 'connected', 'dash', 'iframes', 'ack', 'basic', 'dodge', 'level', 'bleed', 'revives']) if (s[k] !== p[k]) s[k] = p[k];
      const hold = this.held.get(p.id), until = hold ? hold.until : 0; if (s.holdUntil !== until) s.holdUntil = until;
      p.cds.forEach((c, i) => { if (s.cds[i] !== c) s.cds[i] = c; });
      if (s.moves.join() !== p.moves.join()) { s.moves.clear(); p.moves.forEach(m => s.moves.push(m)); }
    }
    syncMap(st.enemies, v.enemies, e => e.id, EnemyState, ['kind', 'x', 'y', 'fx', 'fy', 'hp', 'maxHp', 'level', 'elite', 'aggro', 'state', 'timer', 'wind', 'pattern', 'ax', 'ay', 'gx', 'gy']);
    syncMap(st.items, v.items, i => i.key, ItemState, ['id', 'amount', 'tx', 'ty', 'owner']);
    syncMap(st.objects, v.objects, o => o.key, ObjectState, ['type', 'tier', 'tx', 'ty', 'opened']);
    syncMap(st.shots, v.shots, s => s.id, ShotState, ['x', 'y', 'vx', 'vy', 'r', 'kind', 'color', 'team', 'owner']);
    syncMap(st.zones, v.zones, z => z.id, ZoneState, ['x', 'y', 'r', 'team', 'color', 'life', 't']);
    syncMap(st.doors, v.doors, d => d.key, DoorState, ['open']);
    if (v.boss) {
      if (!st.boss || st.boss.id !== v.boss.id) st.boss = new BossState(v.boss);
      else for (const k of ['alive', 'hp', 'maxHp', 'phase', 'state', 'pattern', 'rage', 'stage', 'hits', 'rocks', 'bk']) if (st.boss[k] !== v.boss[k]) st.boss[k] = v.boss[k];
    } else if (st.boss) st.boss = undefined;
  }

  /**
   * Punto seguro: guarda la instantánea de la expedición (en orden; cada una con `seq` mayor). Solo cuando la
   * base de datos lo confirma se avisa a los jugadores («saved»); si falla tras los reintentos, «saveFailed»
   * (se volverá a intentar en el siguiente punto seguro, que guarda el estado completo).
   */
  persist(reason, status = 'active', extra = null) {
    const { expeditions } = ExpeditionRoom.services;
    if (!this.exp || !expeditions) return Promise.resolve();
    let state;
    try { state = Object.assign(this.exp.snapshot(reason), extra || {}); } catch (e) { this.log.error('room.snapshot_failed', e); return Promise.resolve(); }
    const seq = ++this.snapSeq, members = state.members.map(m => m.accountId);
    const job = () => retry(() => expeditions.save({ id: state.id, dungeon: state.dungeon, status, seq, members, state }));
    this.saveP = (this.saveP || Promise.resolve()).then(job).then(r => {
      this.saved = { seq, reason, status, at: Date.now() };
      this.log.info('expedition.saved', { expedition: state.id, reason, status, seq, applied: r.saved });
      if (status !== 'ended') this.broadcast(S.EVENT, { type: 'saved', reason, seq });
    }, e => {
      this.log.error('expedition.save_failed', { expedition: state.id, reason, error: e.message });
      if (status !== 'ended') this.broadcast(S.EVENT, { type: 'saveFailed', reason });
      throw e;
    });
    const p = this.saveP; this.saveP = p.catch(() => {});   // la cadena sigue aunque una falle
    return p;
  }
  /** Final de la expedición: una sola vez; quien llame después espera al mismo guardado. */
  end() { if (!this.endP) this.endP = this.settleAll(); return this.endP; }
  async settleAll() {
    this.ending = true;
    this.state.phase = 'ended'; this.sync();
    const { results, result } = this.exp.ended;
    this.log.info('room.end', { result, players: results.size, expedition: this.exp.id });
    // Primero los resultados de todos en la expedición (status «ended»): si el servidor cae mientras se
    // guardan los perfiles, al volver a arrancar se aplican los que falten (ExpeditionService.recover).
    const out = {}; for (const [id, r] of results) { const m = this.members.get(id); if (m && r) out[m.accountId] = r; }
    await this.persist('end', 'ended', { results: out }).catch(() => {});
    for (const [id, r] of results) {
      try { await this.commit(id, r); }
      catch (e) { this.log.error('room.commit_failed', Object.assign({ session: id }, { error: e.message, stack: e.stack })); }
    }
    this.clock.setTimeout(() => this.disconnect(), 60000);   // da tiempo a leer el resultado
  }

  /**
   * Recompensa individual: se guarda en SU perfil una sola vez. Doble protección contra duplicados:
   * en la sala (committed) y en la base de datos (clave única expedición + cuenta).
   */
  async commit(id, r) {
    const m = this.members.get(id), { profiles, registry } = ExpeditionRoom.services;
    if (!r || !m || this.committed.has(m.accountId)) return;
    this.committed.add(m.accountId);
    if (this.saveP) await this.saveP;   // la última instantánea (si la hay) se escribe antes que el resultado
    let saved = null, error = null;
    if (r.profile) {
      try { saved = await retry(() => profiles.applyResult({ expeditionId: r.expeditionId, accountId: m.accountId, result: r.result, summary: r.summary, save: r.profile, expectedVersion: m.version })); m.version = saved.version; }
      catch (e) { error = e; this.log.error('room.commit_failed', { account: shortId(m.accountId), error: e.message }); }
    }
    if (!error) this.log.info('reward.saved', { account: shortId(m.accountId), result: r.result, applied: !!(saved && saved.applied), version: saved && saved.version });
    // `saved`: el cliente solo dice «guardado» cuando la base de datos lo ha confirmado
    const msg = { expeditionId: r.expeditionId, result: r.result, success: r.success, lines: r.lines, summary: r.summary,
      envelope: r.profile ? profiles.envelope(r.profile) : null, version: saved && saved.version, duplicate: !!(saved && !saved.applied),
      saved: !error, error: error ? 'No se ha podido guardar el resultado todavía. Se sigue intentando: no cierres el juego si puedes; si no, se guardará solo en cuanto el servidor pueda.' : undefined };
    this.results.set(m.accountId, msg);
    const c = this.clients.find(x => x.sessionId === id);
    if (c) c.send(S.RESULT, msg);
    if (error) { this.retryCommit(id, m, r, msg); return; }
    registry.free(m.accountId, this.roomId);
  }
  /** El guardado del resultado falló: se reintenta cada 10 s mientras la sala exista (luego lo hace ExpeditionService). */
  retryCommit(id, m, r, msg) {
    const { profiles, registry } = ExpeditionRoom.services;
    const t = this.clock.setInterval(async () => {
      try {
        const saved = await profiles.applyResult({ expeditionId: r.expeditionId, accountId: m.accountId, result: r.result, summary: r.summary, save: r.profile });
        t.clear(); m.version = saved.version;
        Object.assign(msg, { saved: true, error: undefined, version: saved.version, duplicate: !saved.applied, late: true });
        const c = this.clients.find(x => x.sessionId === id); if (c) c.send(S.RESULT, msg);
        registry.free(m.accountId, this.roomId);
        this.log.info('reward.saved', { account: shortId(m.accountId), result: r.result, applied: saved.applied, late: true });
      } catch (e) { this.log.warn('room.commit_retry_failed', { account: shortId(m.accountId), error: e.message }); }
    }, 10000);
  }

  /**
   * Desconexión inesperada: se guarda el sitio `reconnectSeconds` segundos (configurable). El
   * personaje se queda quieto e invulnerable en el piso (dormido), el grupo sigue jugando y la
   * mazmorra NO se reinicia. Se vuelve con el token de reconexión de Colyseus (mismo sessionId,
   * mismo personaje): desde el mismo navegador lo hace el SDK solo; desde otro, con la cuenta
   * (POST /api/rooms/resume → resumeSeat). Si no vuelve a tiempo, cuenta como abandono (onLeave).
   */
  async onDrop(client) {
    const p = this.state.players.get(client.sessionId); if (p) p.connected = false;
    if (this.exp) this.exp.setConnected(client.sessionId, false);
    this.held.set(client.sessionId, { token: client.reconnectionToken, until: Date.now() + this.reconnectSeconds * 1000 });
    if (p) p.holdUntil = this.held.get(client.sessionId).until;      // todos lo ven a la vez que la desconexión
    if (this.state.phase === 'playing') this.broadcast(S.EVENT, { type: 'held', id: client.sessionId, seconds: this.reconnectSeconds });
    this.log.info('room.drop', { session: client.sessionId, hold: this.reconnectSeconds });
    // El anfitrión se ha caído: si no vuelve en hostGraceSeconds, el liderazgo pasa a otro (el grupo no se queda bloqueado)
    if (p && p.host && !this.solo && this.state.phase !== 'ended') {
      const sid = client.sessionId, grace = ExpeditionRoom.services.hostGraceSeconds ?? 10;
      this.hostTimer && this.hostTimer.clear();
      this.hostTimer = this.clock.setTimeout(() => {
        this.hostTimer = null;
        const cur = this.state.players.get(sid);
        if (cur && cur.host && !cur.connected && [...this.state.players.entries()].some(([id, q]) => id !== sid && q.connected)) this.transferHost(sid, 'drop');
      }, grace * 1000);
    }
    try { await this.allowReconnection(client, this.reconnectSeconds); }
    catch { /* caducó: Colyseus llama a onLeave */ }
    finally { this.held.delete(client.sessionId); }
  }
  /**
   * Recuperar el sitio guardado de una cuenta (otro dispositivo, otra pestaña o tras recargar sin
   * token). Devuelve el token de reconexión del sitio: el cliente entra con client.reconnect(token)
   * y ocupa EL MISMO asiento (no se crea otro personaje). Solo para la cuenta dueña del sitio.
   * Con takeover, si la cuenta sigue conectada desde otro sitio, se corta esa conexión primero.
   */
  async resumeSeat(accountId, { takeover = false } = {}) {
    const sid = [...this.claims.entries()].find(([, a]) => a === accountId)?.[0];
    if (!sid || (this.state.phase === 'ended' && !this.results.has(accountId))) return { error: ERR.NO_SEAT };
    if (!this.held.has(sid)) {
      const live = this.clients.find(c => c.sessionId === sid);
      if (live && !takeover) return { error: ERR.LIVE_ELSEWHERE };
      if (live) {
        this.log.info('room.takeover', { session: sid, account: shortId(accountId) });
        // Cierre con un código propio: el SDK del dispositivo anterior NO intenta reconectarse
        // (solo lo hace con cortes de red), así que no puede quitarle el sitio al nuevo.
        live.send(S.EVENT, { type: 'taken' });
        try { live.ref.close(ERR.TAKEN, 'taken'); } catch { /* ya cerrada */ }
        for (let i = 0; i < 100 && !this.held.has(sid); i++) { if (i === 40) try { live.ref.terminate && live.ref.terminate(); } catch { /* nada */ } await new Promise(r => setTimeout(r, 30)); }
      }
      if (!this.held.has(sid)) return { error: ERR.NO_SEAT };
    }
    return { reconnectionToken: `${this.roomId}:${this.held.get(sid).token}`, roomId: this.roomId, code: this.code, phase: this.state.phase };
  }
  /** Sitio de una cuenta en esta sala (para el botón «Volver a mi grupo»). */
  seatInfo(accountId) {
    const sid = [...this.claims.entries()].find(([, a]) => a === accountId)?.[0];
    if (!sid || this.state.phase === 'ended') return null;
    return { roomId: this.roomId, code: this.code, phase: this.state.phase, held: this.held.has(sid), until: this.held.get(sid)?.until || 0, live: !!this.clients.find(c => c.sessionId === sid) };
  }
  onReconnect(client) {
    this.held.delete(client.sessionId);
    if (this.hostTimer && this.state.players.get(client.sessionId)?.host) { this.hostTimer.clear(); this.hostTimer = null; }   // volvió a tiempo: sigue siendo anfitrión
    this.log.info('room.reconnect', { session: client.sessionId });
    const p = this.state.players.get(client.sessionId); if (p) { p.connected = true; p.holdUntil = 0; }
    const m = this.members.get(client.sessionId);
    client.send(S.WELCOME, { sessionId: client.sessionId, code: this.code, host: !!(p && p.host), reconnected: true, save: m && m.save, phase: this.state.phase, reconnectSeconds: this.reconnectSeconds, reconnectChoices: this.reconnectChoices, hostRule: HOST_RULE, input: this.exp ? this.exp.resumeInfo(client.sessionId) : null });
    if (m && this.results.has(m.accountId)) { client.send(S.RESULT, this.results.get(m.accountId)); return; }   // ya terminó: mismo resultado, sin volver a aplicarlo
    if (this.exp && this.state.phase === 'playing') { this.exp.setConnected(client.sessionId, true); client.send(S.FLOOR, this.exp.floorInfo); }
  }
  /** Salida definitiva (voluntaria, sin volver a tiempo o entrada fallida tras onAuth). */
  async onLeave(client) {
    const id = client.sessionId, { registry } = ExpeditionRoom.services;
    const accountId = this.claims.get(id) || (this.members.get(id) || {}).accountId;
    if (this.exp && this.state.phase === 'playing' && this.members.has(id) && !this.shuttingDown) await this.commit(id, this.exp.removeMember(id, 'abandon'));   // al apagar el servidor no: la expedición queda suspendida
    if (accountId) registry.free(accountId, this.roomId);
    const wasHost = this.state.players.get(id)?.host;
    if (accountId) this.log.info('room.leave', { session: id, account: shortId(accountId), phase: this.state.phase });
    this.state.players.delete(id); this.members.delete(id); this.claims.delete(id); this.held.delete(id);
    if (wasHost) this.transferHost(id, 'leave');
    this.countPlayers();
  }
  /**
   * Regla de liderazgo HOST_RULE (protocol.js). `to`: el elegido por el anfitrión (cesión); si no,
   * el integrante conectado más antiguo (si no hay ninguno conectado, el más antiguo).
   */
  transferHost(from, reason = 'leave', to = null) {
    const list = [...this.state.players.entries()].filter(([id]) => id !== from).sort(([, a], [, b]) => a.joinedAt - b.joinedAt);
    const next = to ? list.find(([id]) => id === to) : (list.find(([, p]) => p.connected) || list[0]);
    if (!next) return null;
    const old = this.state.players.get(from); if (old) old.host = false;
    const [id, p] = next; p.host = true; p.ready = false;
    if (old && this.state.phase === 'lobby') old.ready = false;
    this.log.info('room.host_transfer', { from, to: id, reason });
    this.broadcast(S.EVENT, { type: 'host', id, from, reason, rule: HOST_RULE });
    return id;
  }
  countPlayers() { ExpeditionRoom.services.registry.update(this.code, { players: this.claims.size, max: this.state.max }); }
  /**
   * Cierre ordenado del servidor (despliegue o reinicio, SIGTERM): las expediciones en curso se guardan
   * como «suspendidas» (instantánea completa) ANTES de desconectar; el grupo puede continuarlas después.
   * Las que ya habían terminado guardan sus resultados.
   */
  async onBeforeShutdown() {
    this.log.info('room.shutdown', { phase: this.state.phase });
    this.shuttingDown = true;                                  // ya no se simula ni se cobra la retirada de quien se desconecta
    try {
      // Expedición en curso: se guarda como «suspendida» en el punto en que está; se podrá continuar (misma expedición)
      if (this.exp && this.state.phase === 'playing' && !this.exp.ended) { this.flushEvents(); await this.persist('shutdown', 'suspended'); this.suspended = true; }
      if (this.exp && this.exp.ended) await this.end();
    } catch (e) { this.log.error('room.shutdown_failed', e); }
    this.broadcast(S.EVENT, { type: 'shutdown', resumable: !!this.suspended });
    this.disconnect(CloseCode.SERVER_SHUTDOWN).catch(() => {});
  }
  onDispose() {
    this.log.info('room.dispose');
    const { registry } = ExpeditionRoom.services;
    registry.release(this.code); registry.detach(this.roomId);
    for (const m of this.members.values()) registry.free(m.accountId, this.roomId);
  }
}

function syncMap(map, list, keyOf, Type, fields) {
  const seen = new Set();
  for (const o of list) {
    const k = keyOf(o); seen.add(k);
    let s = map.get(k);
    if (!s) { const init = {}; for (const f of fields) init[f] = o[f]; map.set(k, new Type(init)); continue; }
    for (const f of fields) if (s[f] !== o[f]) s[f] = o[f];
  }
  for (const k of [...map.keys()]) if (!seen.has(k)) map.delete(k);
}
