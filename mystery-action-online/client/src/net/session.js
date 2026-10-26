/**
 * Conexión con el servidor de juego (Colyseus 0.18, paquete @colyseus/sdk).
 * Crea o se une a un grupo privado, pasa los mensajes y el estado sincronizado a NetPlay
 * (sección 26 del juego) y expone el estado de la conexión:
 *
 *   idle → connecting → lobby (en el grupo) → playing → ended
 *                 ↘ error (con mensaje comprensible y opción de reintentar)
 *   lobby/playing → reconnecting (el SDK reintenta solo) → lobby/playing  |  lost (reintento manual)
 */
import { Client } from '@colyseus/sdk';
import { C, S, ERR, ROOM_NAME, PROTOCOL_VERSION, errorMessage } from '../../../shared/protocol.js';

const RKEY = 'ma-online-reconnect';
const CONSENTED = 4000, SERVER_SHUTDOWN = 4001, FAILED_TO_RECONNECT = 4003;   // CloseCode de Colyseus

/** Error de Colyseus o de red → texto para el jugador. */
export function describeError(e, server) {
  if (!e) return '';
  if (e.code) return errorMessage(e.code, e.message);
  if (typeof location !== 'undefined' && location.protocol === 'https:' && /^(http|ws):\/\//.test(server)) return `Esta página se abre por HTTPS y el servidor (${server}) no: el navegador bloquea la conexión. Usa la dirección https:// del servidor.`;
  if (/fetch|network|ECONNREFUSED|Failed to|NetworkError|load failed/i.test(String(e.message))) {
    if (/^https?:\/\/(localhost|127\.0\.0\.1|192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/.test(server))
      return `No se puede conectar con el servidor de juego (${server}). Abre el juego con «Jugar.bat» (Windows) o «jugar.sh»: arranca el servidor automáticamente. Si ya lo has hecho, mira que esa ventana siga abierta.`;
    return `No se puede conectar con el servidor (${server}). Comprueba que está en marcha y tu conexión a internet.`;
  }
  return e.message || 'Error de conexión';
}

export class Session {
  constructor({ server, token, game, onChange }) {
    this.server = server; this.token = token; this.game = game; this.onChange = onChange || (() => {});
    this.client = new Client(server);
    // El token viaja SOLO en el cuerpo de la petición HTTPS de entrada (opciones → onAuth). No se usa
    // client.auth.token: el SDK lo pondría también en la URL del WebSocket, que puede quedar en registros.
    this.room = null; this.net = null; this.welcome = null; this.state = null;
    this.status = 'idle'; this.error = ''; this.ended = false;
  }
  set(status, error = '') { this.status = status; this.error = error; this.onChange(this); }
  opts(extra) { return Object.assign({ token: this.token, protocol: PROTOCOL_VERSION }, extra); }

  async create(dungeon, extra = {}) { return this.connect(() => this.client.create(ROOM_NAME, this.opts(Object.assign({ creating: true, dungeon }, extra)))); }
  async join(roomId, code) { return this.connect(() => this.client.joinById(roomId, this.opts({ code }))); }
  /** Reanuda el grupo tras recargar la página o perder la conexión del todo. */
  async resume() {
    const t = sessionStorage.getItem(RKEY); if (!t) return null;
    return this.connect(() => this.client.reconnect(t), true);
  }
  /** Volver al sitio guardado con el token que da el servidor a la cuenta (otro dispositivo). */
  async resumeWith(token) { return this.connect(() => this.client.reconnect(token), true); }
  async connect(fn, resuming = false, quiet = false) {
    this.set(resuming ? 'reconnecting' : 'connecting');
    try { const room = await fn(); this.attach(room); return room; }
    catch (e) {
      if (quiet) { this.set('lost', this.error || describeError(e, this.server)); throw e; }    // reintento automático: se sigue intentando
      if (resuming) sessionStorage.removeItem(RKEY); this.set('error', describeError(e, this.server)); throw e;
    }
  }

  attach(room) {
    this.room = room; this.ended = false;
    sessionStorage.setItem(RKEY, room.reconnectionToken);
    const W = window.MysteryNet, G = this.game;
    const transport = { send: (type, msg) => { try { this.room.send(type, msg); } catch { /* sin conexión: se descarta */ } }, leave: () => this.leave() };

    room.onMessage(S.WELCOME, msg => {
      this.welcome = msg;
      if (!this.net) this.net = new W.NetPlay(G, transport, msg.sessionId, msg.save);   // solo MI partida, la que me envía el servidor
      else this.net.setConnection(true);
      if (msg.input) this.net.resume(msg.input);          // mismo asiento: la numeración de entradas y acciones sigue
      this.set(this.state && this.state.phase === 'playing' ? 'playing' : 'lobby');
    });
    room.onMessage(S.FLOOR, info => {
      if (!this.net) return;
      G.net = this.net;
      this.set('playing');
      try { this.net.loadFloor(info); } catch (e) { this.set('error', e.message); }
    });
    room.onMessage(S.EVENT, ev => {
      if (ev.type === 'host' && this.state && this.state.phase === 'lobby') {   // en la sala de espera se avisa en el menú
        const me = this.welcome && this.welcome.sessionId, who = ev.id === me ? 'Ahora eres el anfitrión' : `${(this.state.players[ev.id] || {}).name || 'Otro jugador'} es ahora el anfitrión`;
        this.notice = who + (ev.reason === 'drop' ? ' (el anterior perdió la conexión)' : ev.reason === 'leave' ? ' (el anterior salió del grupo)' : '');
        this.onChange(this); return;
      }
      if (this.net) this.net.onEvent(ev);
    });
    room.onMessage(S.REJECT, r => { this.notice = r.why || 'Acción rechazada'; this.onChange(this); });
    room.onMessage(S.RESULT, r => { this.ended = true; this.result = r; sessionStorage.removeItem(RKEY); if (this.net) this.net.finish(r); this.set('ended'); });
    room.onMessage(S.PONG, m => { this.rtt = Math.round(performance.now() - m.t); });
    room.onStateChange(state => {
      const st = state.toJSON(); this.state = st;
      if (this.net) this.net.applyState(st);
      if (st.phase === 'lobby') this.onChange(this);
    });
    room.onDrop(() => { if (this.net) this.net.setConnection(false); this.set('reconnecting'); });
    room.onReconnect(() => {
      sessionStorage.setItem(RKEY, this.room.reconnectionToken);
      if (this.net) this.net.setConnection(true);
      this.set(this.state && this.state.phase === 'playing' ? 'playing' : 'lobby');
    });
    room.onLeave(code => {
      clearInterval(this.pingT);
      if (this.ended || code === CONSENTED) { sessionStorage.removeItem(RKEY); this.room = null; if (!this.ended) this.reset(); this.set(this.ended ? 'ended' : 'idle'); return; }
      if (code === SERVER_SHUTDOWN) { sessionStorage.removeItem(RKEY); this.room = null; this.set('lost', 'El servidor se ha reiniciado o está en mantenimiento. Tu progreso se guardó; vuelve a crear o unirte a un grupo en unos minutos.'); return; }
      if (code === ERR.TAKEN) { sessionStorage.removeItem(RKEY); this.room = null; if (this.net) { this.net.active = false; this.game.net = null; } this.reset(); this.set('taken', errorMessage(ERR.TAKEN)); return; }
      // El SDK ya ha agotado sus reintentos automáticos (o la sala se cerró): reintento manual
      this.set('lost', code === FAILED_TO_RECONNECT ? 'Se ha perdido la conexión con el grupo y no se pudo recuperar.' : `La conexión con el grupo se cerró (${code}).`);
      this.autoRetry();
    });
    room.onError((code, message) => this.set(this.status, errorMessage(code, message)));
    clearInterval(this.pingT);
    this.pingT = setInterval(() => { try { room.send(C.PING, { t: performance.now() }); } catch { /* nada */ } }, 3000);
    return room;
  }
  /**
   * Reintento automático tras agotarse los del SDK (p. ej. el móvil estuvo sin red un rato): cuando el
   * navegador vuelve a tener conexión y, mientras dure el sitio guardado, cada 4 s. El botón
   * «Reintentar» sigue disponible.
   */
  autoRetry() {
    if (typeof window === 'undefined' || this.retrying) return;
    const until = Date.now() + ((this.welcome && this.welcome.reconnectSeconds) || 45) * 1000;
    const tick = async () => {
      if (this.status !== 'lost' || Date.now() > until) { this.retrying = false; window.removeEventListener('online', tick); clearInterval(this.retryT); return; }
      if (navigator.onLine === false || this.busyRetry) return;
      this.busyRetry = true;
      try { const t = sessionStorage.getItem(RKEY) || (this.room && this.room.reconnectionToken); if (t) await this.connect(() => this.client.reconnect(t), true, true).catch(() => {}); }
      finally { this.busyRetry = false; }
    };
    this.retrying = true;
    window.addEventListener('online', tick);
    clearInterval(this.retryT); this.retryT = setInterval(tick, 4000);
  }
  /** Botón «Reintentar» tras perder la conexión: usa el token de reconexión guardado. */
  async retry() {
    const t = sessionStorage.getItem(RKEY) || (this.room && this.room.reconnectionToken);
    if (!t) { this.set('error', 'No queda ningún grupo al que volver.'); return null; }
    try { return await this.connect(() => this.client.reconnect(t), true); } catch { return null; }
  }
  reset() { if (this.game.net === this.net) this.game.net = null; this.net = null; this.welcome = null; this.state = null; }

  setReady(ready) { this.room && this.room.send(C.READY, { ready }); }
  chooseDungeon(dungeon) { this.setOptions({ dungeon }); }
  /** Opciones de expedición (solo el anfitrión; el servidor las valida). */
  setOptions(opts) { this.room && this.room.send(C.OPTIONS, opts); }
  /** Ceder el liderazgo a otro integrante conectado. */
  giveHost(to) { this.room && this.room.send(C.HOST, { to }); }
  start(dungeon) { this.notice = ''; this.room && this.room.send(C.START, { dungeon }); }
  /** Abandonar grupo. En plena expedición cuenta como retirada: llega el resultado y se cierra. */
  leave() {
    if (!this.room) { sessionStorage.removeItem(RKEY); this.reset(); this.set('idle'); return; }
    if (this.state && this.state.phase === 'playing' && !this.ended) { this.room.send(C.LEAVE, {}); return; }
    sessionStorage.removeItem(RKEY); clearInterval(this.pingT);
    const r = this.room; this.room = null; this.reset(); this.set('idle');
    r.leave(true).catch(() => {});
  }
  lobbyView() {
    const st = this.state || {}, me = this.welcome && this.welcome.sessionId;
    const players = Object.entries(st.players || {}).map(([id, p]) => ({ id, me: id === me, name: p.name, species: p.species, level: p.level, ready: p.ready, host: p.host, connected: p.connected, joinedAt: p.joinedAt, holdUntil: p.holdUntil || 0 })).sort((a, b) => a.joinedAt - b.joinedAt);
    const others = players.filter(p => !p.host);
    return { code: (this.welcome && this.welcome.code) || st.code, dungeon: st.dungeon, phase: st.phase, max: st.max || 4, players,
      host: !!players.find(p => p.me && p.host), me: players.find(p => p.me) || null,
      canStart: players.every(p => p.connected) && others.every(p => p.ready), reconnectSeconds: st.reconnectSeconds || (this.welcome && this.welcome.reconnectSeconds) || 0,
      reconnectChoices: (this.welcome && this.welcome.reconnectChoices) || [] };
  }
}
