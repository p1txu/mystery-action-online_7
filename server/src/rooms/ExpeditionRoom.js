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
    const { identity, profiles, registry } = ExpeditionRoom.services;
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
    // --- sin await a partir de aquí ---
    if (this.state.phase !== 'lobby' || this.starting) throw fail(ERR.STARTED);
    if ([...this.claims.values()].includes(account.id)) throw fail(ERR.DUPLICATE);
    if (this.claims.size >= this.state.max) throw fail(ERR.FULL);
    if (!registry.claim(account.id, this.roomId)) throw fail(ERR.OTHER_ROOM);
    if (creator) this.creatorClaimed = true;
    this.claims.set(client.sessionId, account.id);
    this.countPlayers();
    // Lo que se devuelve sale del servidor: cuenta del token y su perfil. Las opciones del cliente no se usan.
    return { account: { id: account.id, name: account.name }, save: prof.save, version: prof.version };
  }

  onJoin(client, options, auth) {
    const { account, save, version } = auth;
    let host = this.members.size === 0;
    if (this.party) {     // el líder del grupo es el anfitrión, entre quien entre primero
      host = account.id === this.party.leader || (this.members.size === 0 && !this.party.accounts.has(this.party.leader));
      if (account.id === this.party.leader) for (const q of this.state.players.values()) q.host = false;
      else if (this.members.size === 0) host = true;
    }
    this.members.set(client.sessionId, { accountId: account.id, name: account.name, save, version });
    this.state.players.set(client.sessionId, new PlayerState({ name: account.name, species: save.species, level: save.prog.level, host, ready: !!this.party, connected: true, hp: 1, maxHp: 1, joinedAt: Date.now() }));
    client.send(S.WELCOME, { sessionId: client.sessionId, code: this.code, host, save, reconnectSeconds: this.reconnectSeconds, reconnectChoices: this.reconnectChoices, hostRule: HOST_RULE });
    this.log.info('room.join', { session: client.sessionId, account: shortId(account.id), host, players: this.members.size });
    if (this.party) this.partyStart(false);
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
      if (d.id !== this.state.dungeon) { this.state.dungeon = d.id; changed = true; }
    }
    if (msg.reconnect !== undefined) {
      if (!this.reconnectChoices.includes(msg.reconnect)) return client.send(S.REJECT, { what: 'options', why: 'Tiempo de reconexión no permitido' });
      if (msg.reconnect !== this.reconnectSeconds) { this.reconnectSeconds = this.state.reconnectSeconds = msg.reconnect; changed = true; }
    }
    if (changed) {
      for (const q of this.state.players.values()) if (!q.host) q.ready = false;
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
    // Cada jugador debe tener desbloqueada la mazmorra en su propio perfil
    const locked = [...this.members.values()].filter(m => !RULES.dungeonOpen(m.save, dng));
    if (locked.length) return client.send(S.REJECT, { what: 'start', why: `${locked.map(m => m.name).join(', ')} aún no ha desbloqueado ${dng.name}` });
    this.state.dungeon = dng.id;
    this.starting = true;
    this.beginExpedition(dng).catch(e => { this.log.error('room.start_failed', e); this.starting = false; client.send(S.REJECT, { what: 'start', why: 'No se pudo cargar algún perfil; inténtalo de nuevo' }); });
  }
  /** Cada integrante entra con SU perfil, leído de nuevo de la base de datos al empezar. */
  async beginExpedition(dng) {
    const { profiles } = ExpeditionRoom.services;
    for (const m of this.members.values()) {
      const rec = await profiles.get(m.accountId);
      if (!rec) throw new Error('Perfil desaparecido: ' + m.accountId);
      m.save = rec.save; m.version = rec.version;
    }
    if (this.state.phase !== 'lobby') return;
    this.exp = new Expedition({ dungeonId: dng.id, seed: (Math.random() * 2 ** 31) >>> 0,
      members: [...this.members.entries()].map(([id, m]) => ({ id, accountId: m.accountId, name: m.name, profile: m.save })) });
    this.state.phase = 'playing'; this.starting = false;
    ExpeditionRoom.services.registry.close(this.code);
    this.lock();
    this.flushEvents(); this.sync();
    this.log.info('room.start', { dungeon: dng.id, players: this.members.size, expedition: this.exp.id });
  }

  tick(deltaMs) {
    if (!this.exp || this.state.phase !== 'playing' || this.frozen) return;   // frozen: solo en pruebas (comparar fotos fijas)
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
      const to = ev.to && this.clients.find(c => c.sessionId === ev.to);
      if (ev.to) { if (to) to.send(S.EVENT, ev); } else this.broadcast(S.EVENT, ev);
    }
  }

  /** Copia la vista plana de la simulación al esquema (solo cambia lo que cambió). */
  sync() {
    const v = this.exp.view(), st = this.state;
    st.floorN = v.floor.n; st.time = v.time; st.wind = v.wind;
    for (const p of v.players) {
      const s = st.players.get(p.id); if (!s) continue;
      for (const k of ['x', 'y', 'vx', 'vy', 'fx', 'fy', 'hp', 'maxHp', 'exp', 'energy', 'belly', 'gems', 'downed', 'revive', 'connected', 'dash', 'iframes', 'ack', 'basic', 'dodge', 'level']) if (s[k] !== p[k]) s[k] = p[k];
      const hold = this.held.get(p.id), until = hold ? hold.until : 0; if (s.holdUntil !== until) s.holdUntil = until;
      p.cds.forEach((c, i) => { if (s.cds[i] !== c) s.cds[i] = c; });
      if (s.moves.join() !== p.moves.join()) { s.moves.clear(); p.moves.forEach(m => s.moves.push(m)); }
    }
    syncMap(st.enemies, v.enemies, e => e.id, EnemyState, ['kind', 'x', 'y', 'fx', 'fy', 'hp', 'maxHp', 'level', 'elite', 'aggro', 'state', 'timer', 'wind', 'pattern', 'ax', 'ay', 'gx', 'gy']);
    syncMap(st.items, v.items, i => i.key, ItemState, ['id', 'amount', 'tx', 'ty']);
    syncMap(st.objects, v.objects, o => o.key, ObjectState, ['type', 'tier', 'tx', 'ty', 'opened']);
    syncMap(st.shots, v.shots, s => s.id, ShotState, ['x', 'y', 'vx', 'vy', 'r', 'kind', 'color', 'team', 'owner']);
    syncMap(st.zones, v.zones, z => z.id, ZoneState, ['x', 'y', 'r', 'team', 'color', 'life', 't']);
    syncMap(st.doors, v.doors, d => d.key, DoorState, ['open']);
    if (v.boss) {
      if (!st.boss || st.boss.id !== v.boss.id) st.boss = new BossState(v.boss);
      else for (const k of ['alive', 'hp', 'maxHp', 'phase', 'state', 'pattern', 'rage', 'stage', 'hits', 'rocks']) if (st.boss[k] !== v.boss[k]) st.boss[k] = v.boss[k];
    } else if (st.boss) st.boss = undefined;
  }

  /** Final de la expedición: una sola vez; quien llame después espera al mismo guardado. */
  end() { if (!this.endP) this.endP = this.settleAll(); return this.endP; }
  async settleAll() {
    this.ending = true;
    this.state.phase = 'ended'; this.sync();
    const { results, result } = this.exp.ended;
    this.log.info('room.end', { result, players: results.size, expedition: this.exp.id });
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
    let saved = null;
    if (r.profile) {
      saved = await profiles.applyResult({ expeditionId: r.expeditionId, accountId: m.accountId, result: r.result, summary: r.summary, save: r.profile, expectedVersion: m.version });
      m.version = saved.version;
    }
    this.log.info('reward.saved', { account: shortId(m.accountId), result: r.result, applied: !!(saved && saved.applied), version: saved && saved.version });
    const msg = { expeditionId: r.expeditionId, result: r.result, success: r.success, lines: r.lines, summary: r.summary,
      envelope: r.profile ? profiles.envelope(r.profile) : null, version: saved && saved.version, duplicate: !!(saved && !saved.applied) };
    this.results.set(m.accountId, msg);
    const c = this.clients.find(x => x.sessionId === id);
    if (c) c.send(S.RESULT, msg);
    registry.free(m.accountId, this.roomId);
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
    if (this.exp && this.state.phase === 'playing' && this.members.has(id)) await this.commit(id, this.exp.removeMember(id, 'abandon'));
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
   * Cierre ordenado del servidor (despliegue o reinicio, SIGTERM): las expediciones en curso
   * terminan como «interrumpidas» y cada jugador conserva lo conseguido (sin las pérdidas de una
   * derrota). Se guarda todo ANTES de desconectar; los clientes reciben su resultado y el aviso.
   */
  async onBeforeShutdown() {
    this.log.info('room.shutdown', { phase: this.state.phase });
    try {
      if (this.exp && this.state.phase === 'playing' && !this.exp.ended) { this.exp.finish('interrupted'); this.flushEvents(); }
      if (this.exp && this.exp.ended) await this.end();
    } catch (e) { this.log.error('room.shutdown_failed', e); }
    this.broadcast(S.EVENT, { type: 'shutdown' });
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
