/**
 * Menú cooperativo y cuenta online.
 *  - Cuenta: iniciar sesión / crear cuenta (usuario y contraseña, para usar el mismo perfil en
 *    cualquier dispositivo) o probar como invitado (solo en este navegador; se puede convertir
 *    en cuenta conservando el progreso). Cerrar sesión en todos los dispositivos.
 *  - Perfil personal (ficha) leído del servidor. Si no hay, se elige criatura inicial.
 *  - Jugar en solitario (con la cuenta: aldea y expediciones validadas por el servidor) ·
 *    Crear partida privada · Unirse mediante código · Abandonar grupo · Partida local sin conexión.
 * Todo lo que enseña del grupo viene del estado sincronizado de la sala de Colyseus.
 */
import { Api, loadAuth, saveAuth } from './api.js';
import { Session, describeError } from './session.js';
import { OnlineAccount } from './account.js';
import { normalizeCode, isValidCode, MAX_PLAYERS, ERR, HOST_RULE_TEXT, coopSummary } from '../../../shared/protocol.js';

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const G = () => window.MysteryAction;
/**
 * Dirección del servidor: la que se fijó al compilar (SERVER_URL), o la misma dirección de la página
 * (despliegue con proxy en un único dominio). En desarrollo (puertos 5173/8080) el puerto 2567.
 */
const sameOrigin = () => typeof document !== 'undefined' && !!document.querySelector('meta[name="ma-server"][content="same-origin"]');
const isLocalPage = () => typeof location !== 'undefined' && ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
const defaultServer = () => {
  if (sameOrigin()) return location.origin;                // el juego lo sirve su propio servidor (lanzador: Jugar.bat)
  const fixed = typeof __SERVER_URL__ !== 'undefined' ? __SERVER_URL__ : (import.meta.env && import.meta.env.VITE_SERVER_URL);
  if (fixed) return fixed.replace(/\/+$/, '');
  const devPort = typeof __DEV_SERVER_PORT__ !== 'undefined' ? __DEV_SERVER_PORT__ : 0;   // compilación de desarrollo: el servidor está en este mismo equipo
  if (devPort || ['5173', '8080'].includes(location.port) || location.protocol === 'file:') return `${location.protocol === 'https:' ? 'https' : 'http'}://${location.hostname || 'localhost'}:${devPort || 2567}`;
  return location.origin;
};
/** Enlace de invitación: la dirección del juego con el código (?sala=CODIGO). Si este PC ha abierto el enlace para amigos, ese. */
export const inviteUrl = (code, publicUrl = '') => `${publicUrl ? publicUrl + '/' : location.origin + location.pathname}?sala=${encodeURIComponent(code)}`;
/** Código de invitación de la dirección actual, si se abrió un enlace de invitación. */
export function inviteFromUrl(search = location.search) { const c = normalizeCode(new URLSearchParams(search).get('sala') || ''); return isValidCode(c) ? c : ''; }
const STATUS = {
  offline: ['Sin conexión', 'off'], checking: ['Conectando con el servidor…', 'wait'], online: ['Conectado al servidor', 'ok'],
  idle: ['Conectado al servidor', 'ok'], connecting: ['Entrando en el grupo…', 'wait'], lobby: ['En el grupo', 'ok'], playing: ['En expedición', 'ok'],
  reconnecting: ['Reconectando…', 'wait'], lost: ['Conexión perdida', 'bad'], taken: ['Partida en otro dispositivo', 'off'], error: ['Conectado al servidor', 'ok'], ended: ['Conectado al servidor', 'ok'],
};

export class Lobby {
  constructor() {
    this.el = document.createElement('section');
    this.el.id = 'online'; this.el.className = 'screen veil online'; this.el.hidden = true;
    this.el.setAttribute('aria-labelledby', 'online-h'); this.el.setAttribute('aria-live', 'polite');
    document.body.appendChild(this.el);
    for (const t of ['keydown', 'keyup']) this.el.addEventListener(t, e => {
      if (t === 'keydown' && e.key === 'Enter') { const f = { 'on-code': 'on-join', 'on-pass': 'on-login', 'on-rpass': 'on-register', 'on-upass': 'on-upgrade' }[e.target.id]; if (f) this.el.querySelector('#' + f)?.click(); }
      if (t === 'keydown' && e.key === 'Escape' && !this.inGroup) this.close();
      e.stopPropagation();                                 // las teclas del menú no llegan al juego
    });
    this.auth = loadAuth();
    // Partida guardada con el lanzador antiguo (servidor en otro puerto de este mismo PC): misma base de datos y mismo secreto → se sigue usando la cuenta
    if (this.auth && sameOrigin() && isLocalPage() && this.auth.server !== location.origin && /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(this.auth.server || '')) { this.auth.server = location.origin; saveAuth(this.auth); }
    this.server = (this.auth && this.auth.server) || defaultServer();
    this.host = null; this.hostPoll = null;     // enlace para amigos (solo en el PC del anfitrión)
    this.conn = 'offline'; this.msg = null; this.retryFn = null; this.session = null; this.profile = null; this.account = null; this.policy = {};
    this.authTab = 'login';
    this.invite = inviteFromUrl();          // abierto desde un enlace de invitación (?sala=CODIGO)
  }
  get api() { return new Api(this.server, this.auth && this.auth.token); }
  get inGroup() { return !!(this.session && !this.session.soloDungeon && ['connecting', 'lobby', 'reconnecting', 'lost'].includes(this.session.status)); }
  get status() { return this.session && this.session.status !== 'idle' ? this.session.status : this.conn; }
  open() { this.el.hidden = false; this.refresh(); this.hostRefresh(); }
  close() { if (this.inGroup) return; this.el.hidden = true; }
  /** Mensaje para el jugador; si se pasa `retry`, aparece el botón «Reintentar». */
  say(text, kind = 'bad', retry = null) { this.msg = text ? { text, kind } : null; this.retryFn = retry; this.render(); }

  async refresh() {
    if (!this.auth || this.auth.server !== this.server) { this.conn = 'offline'; this.account = null; return this.render(); }
    this.conn = 'checking'; this.render();
    try {
      const [me, prof] = await Promise.all([this.api.me(), this.api.profile()]);
      this.account = me.account; this.policy = me.policy || {}; this.profile = prof; this.conn = 'online'; this.seat = me.seat || null;
      if (this.msg && this.retryFn === this.refreshRetry) this.say('');
      if (!this.session) {   // ¿había un grupo abierto en esta pestaña? (recarga de la página)
        const s = this.newSession(); if (await s.resume().catch(() => null)) { this.session = s; this.useAccount(); this.seat = null; }
        else if (this.seat && this.seat.held) { this.say(''); await this.resumeGroup(false); }   // sitio guardado sin token en esta pestaña: se recupera con la cuenta
      }
    } catch (e) {
      if (e.status === 401) { this.forget(); return this.say('Tu sesión ha caducado o se cerró en otro dispositivo. Vuelve a iniciar sesión.'); }
      this.conn = 'offline'; this.refreshRetry = () => this.refresh();
      return this.say(e.offline ? describeError({ message: 'fetch failed' }, this.server) : e.message, 'bad', this.refreshRetry);
    }
    this.render();
  }
  newSession() {
    return new Session({ server: this.server, token: this.auth.token, game: G(), onChange: s => this.onSession(s) });
  }
  /** El progreso online es siempre el de la cuenta: se activa antes de jugar en grupo o en solitario. */
  useAccount() {
    const g = G();
    if (!this.onlineAccount) this.onlineAccount = new OnlineAccount({ api: this.api, lobby: this });
    this.onlineAccount.api = this.api;
    if (!g.account) { this.onlineAccount.localSave = g.save; Save.readOnly = true; g.account = this.onlineAccount; if (this.profile) this.onlineAccount.adopt(this.profile.profile, this.profile.version); }
    return this.onlineAccount;
  }
  onSession(s) {
    if (s.soloDungeon) {   // expedición en solitario desde la aldea: la sala de una plaza empieza sola
      if (s.status === 'lobby' && !s.soloStarted) { s.soloStarted = true; s.start(s.soloDungeon); }
      if (s.notice) { UI.toast(s.notice, '#ff9a4a'); s.notice = ''; if (s.status === 'lobby') s.leave(); }
      if (s.status === 'error') { UI.toast(s.error, '#ff9a4a'); this.session = null; }
      if (s.status === 'reconnecting') this.banner(G().net && G().net.active ? 'Conexión perdida · reconectando…' : ''); else if (s.status !== 'lost') this.banner('');
      if (s.status === 'lost') { this.el.hidden = false; this.say(s.error, 'bad', () => s.retry()); }
      if (s.status === 'ended' || s.status === 'idle') { this.session = null; this.banner(''); }
      return;
    }
    if (s.status === 'playing') { this.el.hidden = true; this.banner(''); }
    else if (s.status === 'reconnecting') this.banner(G().net && G().net.active ? 'Conexión perdida · reconectando…' : '');
    else if (s.status === 'lost') { this.banner(''); if (G().net && G().net.active) this.el.hidden = false; this.say(s.error, 'bad', () => s.retry()); }
    else if (s.status === 'error') this.say(s.error, 'bad', this.lastAction);
    else if (s.status === 'taken') { this.banner(''); this.session = null; const g = G(); if (g.state === 'play' || g.state === 'pause') g.goTitle(); this.el.hidden = false; this.say(s.error, 'warn'); return; }
    else if (s.status === 'lobby') { this.banner(''); if (this.msg && this.msg.kind === 'bad') this.say(''); }
    else if (s.status === 'ended' || s.status === 'idle') { this.banner(''); this.session = null; this.refresh(); return; }
    if (s.notice) { const n = s.notice; s.notice = ''; this.say(n, 'warn'); return; }
    this.render();
  }
  banner(text) {
    let b = document.getElementById('net-banner');
    if (!b) { b = document.createElement('div'); b.id = 'net-banner'; b.setAttribute('role', 'status'); document.body.appendChild(b); }
    b.textContent = text; b.hidden = !text;
  }

  /* ---------- Enlace para amigos (solo en el PC del anfitrión, con el lanzador) ---------- */
  get hostApi() { return new Api(location.origin); }
  get hostUrl() { return this.host && this.host.state === 'on' ? this.host.url : ''; }
  async hostRefresh() {
    if (!sameOrigin() || !isLocalPage()) { this.host = null; return; }
    try { const h = await this.hostApi.hostStatus(); this.host = h && h.available ? h : null; } catch { this.host = null; }
    this.hostWatch(); this.render();
  }
  hostWatch() {
    clearTimeout(this.hostPoll);
    if (this.host && ['starting', 'checking'].includes(this.host.state)) this.hostPoll = setTimeout(() => this.hostRefresh(), 1000);
  }
  async hostOpen() {
    try { this.host = await this.hostApi.hostOpen(); } catch (e) { this.say(e.message); }
    this.hostWatch(); this.render();
  }
  async hostClose() { try { this.host = await this.hostApi.hostClose(); } catch (e) { this.say(e.message); } this.hostWatch(); this.render(); }
  /** Abre el enlace si hace falta y espera a que esté listo (para «copiar enlace de invitación»). */
  async hostReady(ms = 180000) {
    if (!this.host) return '';
    if (!['starting', 'checking', 'on'].includes(this.host.state)) await this.hostOpen();
    const t0 = Date.now();
    while (this.host && ['starting', 'checking'].includes(this.host.state) && Date.now() - t0 < ms) await new Promise(r => setTimeout(r, 500));
    return this.hostUrl;
  }
  renderHost() {
    const h = this.host; if (!h) return '';
    const st = h.state, url = esc(h.url || '');
    let inner;
    if (st === 'on') inner = `<p class="on-host-link">Enlace para tus amigos: <b id="on-host-url">${url}</b></p>
        <div class="on-row"><button id="on-host-copy" class="btn-main">Copiar enlace</button><button id="on-host-close" class="btn-link">Cerrar enlace</button></div>
        <p class="hint-line">${esc(h.detail || '')} Tus amigos lo abren en su navegador (sin instalar nada) y entran en «Cooperativo online». Si creas una partida privada, «copiar enlace de invitación» ya usa este enlace. No cierres la ventana del juego mientras jugáis.</p>`;
    else if (st === 'starting' || st === 'checking') inner = `<p class="hint-line" id="on-host-wait"><span class="on-spin" aria-hidden="true"></span> ${esc(h.detail || 'Preparando el enlace…')}</p>`;
    else inner = `${st === 'error' ? `<p class="on-msg bad"><span>${esc(h.error)}</span></p>` : ''}<p class="hint-line">Tu ordenador hace de servidor: se crea un enlace https (túnel gratuito de Cloudflare) para que tus amigos entren desde su casa. Solo mientras el juego esté abierto.</p>
        <button id="on-host-open" class="btn-main">${st === 'error' ? 'Reintentar' : 'Crear enlace para amigos'}</button>`;
    return `<div class="box on-host" id="on-host" data-state="${st}"><h3>Jugar con amigos por Internet</h3>${inner}</div>`;
  }

  /* ---------- Cuenta ---------- */
  async authed(promise, retry) {
    this.conn = 'checking'; this.say('');
    try { const r = await promise; this.auth = { server: this.server, token: r.token, accountId: r.account.id, name: r.account.name, kind: r.account.kind }; saveAuth(this.auth); this.onlineAccount = null; await this.refresh(); return true; }
    catch (e) { this.conn = this.account ? 'online' : 'offline'; this.say(e.offline ? describeError({ message: 'fetch failed' }, this.server) : e.message, 'bad', e.offline ? retry : null); return false; }
  }
  setServer(v) { this.server = (v || '').trim().replace(/\/+$/, '') || defaultServer(); }
  login(u, p) { return this.authed(this.api.login(u, p), () => this.login(u, p)); }
  register(u, p, n) { return this.authed(this.api.register(u, p, n), () => this.register(u, p, n)); }
  guest(n) { return this.authed(this.api.guest(n), () => this.guest(n)); }
  upgrade(u, p) { return this.authed(this.api.upgrade(u, p), () => this.upgrade(u, p)).then(ok => { if (ok) this.say('Listo: ahora puedes entrar con tu usuario desde cualquier dispositivo.', 'good'); }); }
  forget() { saveAuth(null); this.auth = null; this.account = null; this.profile = null; this.conn = 'offline'; if (this.onlineAccount) this.onlineAccount.exit(); this.onlineAccount = null; }
  async logoutAll() { try { await this.api.logout(); } catch { /* ya no valía */ } this.leaveGroup(); this.forget(); this.say('Sesión cerrada en todos los dispositivos.', 'good'); }
  logout() { this.leaveGroup(); this.forget(); this.say(''); }

  /* ---------- Acciones del menú ---------- */
  /** Jugar en solitario: con la cuenta, en la aldea online (progreso guardado en el servidor). */
  async solo() {
    if (!this.profile) return this.say('Primero elige tu criatura para crear tu perfil.', 'warn');
    if (this.inGroup) this.leaveGroup();
    try { const acc = this.useAccount(); this.el.hidden = true; await acc.enter(this.profile); }
    catch (e) { this.el.hidden = false; this.say(e.message); }
  }
  /** Partida local de este navegador, sin servidor (progreso independiente del online). */
  local() {
    if (this.inGroup) this.leaveGroup();
    if (this.onlineAccount) this.onlineAccount.exit();
    this.el.hidden = true; const g = G();
    if (g.save) g.continueGame(); else g.newGame();
  }
  async startSolo(dungeonId) {
    if (this.session) { UI.toast('Termina antes lo que tienes abierto en el grupo', '#ff9a4a'); return false; }
    const s = this.newSession(); s.soloDungeon = dungeonId; this.session = s;
    try { await s.create(dungeonId, { solo: true }); return true; }
    catch { this.session = null; return false; }
  }
  async create(dungeon) {
    if (!this.profile) return this.say('Primero elige tu criatura para crear tu perfil.', 'warn');
    this.lastAction = () => this.create(dungeon); this.say('');
    this.useAccount(); this.session = this.newSession();
    try { await this.session.create(dungeon); } catch { this.session = null; this.render(); }
  }
  async join(raw) {
    const code = normalizeCode(raw);
    if (!isValidCode(code)) return this.say('El código tiene 6 caracteres: letras y números (sin O, 0, I ni 1).', 'warn');
    if (!this.profile) return this.say('Primero elige tu criatura para crear tu perfil.', 'warn');
    this.lastAction = () => this.join(code); this.say('');
    let roomId;
    try { roomId = (await this.api.roomByCode(code)).roomId; }
    catch (e) {
      // Código inexistente: casi siempre es que cada uno está en un servidor distinto (p. ej. el amigo abrió su propio Jugar.bat)
      if (e.code === ERR.NOT_FOUND) return this.say(`${e.message} Estás buscando la sala en ${this.server}: tiene que ser el mismo enlace que usa quien la creó (ábrela con su enlace de invitación).`, 'bad', this.lastAction);
      return this.say(e.offline ? describeError({ message: 'fetch failed' }, this.server) : e.message, 'bad', e.offline || e.status >= 500 ? this.lastAction : null);
    }
    this.useAccount(); this.session = this.newSession();
    try { await this.session.join(roomId, code); this.clearInvite(); } catch (e) { this.session = null; if ([ERR.DUPLICATE, ERR.OTHER_ROOM].includes(e.code)) { const m = this.msg; await this.refresh(); this.msg = m; } this.render(); }
  }
  leaveGroup() { if (this.session) this.session.leave(); }
  /** Abierto con un enlace de invitación: el código queda escrito y se explica qué hacer. */
  showInvite() {
    if (!this.invite) return;
    this.open();
    const steps = !this.account ? 'Entra con tu cuenta (o como invitado), elige tu criatura si es la primera vez y pulsa' : !this.profile ? 'Elige tu criatura y pulsa' : 'Pulsa';
    this.say(`Te han invitado al grupo ${this.invite}. ${steps} «Unirse a partida».`, 'good');
  }
  clearInvite() { if (!this.invite) return; this.invite = ''; try { history.replaceState(null, '', location.pathname); } catch { /* sin historial */ } }
  /**
   * «Volver a mi grupo»: pide al servidor el token del sitio guardado de MI cuenta y entra con él
   * (el mismo asiento y el mismo personaje; nunca un segundo personaje). Con takeover, si la cuenta
   * sigue conectada en otro dispositivo, aquel se desconecta y se sigue jugando aquí.
   */
  async resumeGroup(takeover = false) {
    let r;
    try { r = await this.api.resume(takeover); }
    catch (e) {
      if (e.code === ERR.LIVE_ELSEWHERE) return this.say(e.message, 'warn', () => this.resumeGroup(true));
      this.seat = null; return this.say(e.offline ? describeError({ message: 'fetch failed' }, this.server) : e.message, 'bad');
    }
    this.useAccount(); this.session = this.newSession(); this.seat = null;
    try { await this.session.resumeWith(r.reconnectionToken); } catch { this.session = null; this.render(); }
  }
  async upload() {
    const g = G(), local = g.account ? g.account.localSave : g.save; if (!local) return this.say('No hay partida local en este navegador.');
    try { const r = await this.api.uploadSave(Save.exportText(local), this.profile ? this.profile.version : 0); this.profile = { profile: r.profile, version: r.version }; await this.refresh(); this.say('Partida local subida (modo de desarrollo).', 'good'); }
    catch (e) { this.say(e.message, 'bad'); }
  }
  async fresh(species) { try { const r = await this.api.newProfile(species); this.profile = r; this.say('Perfil creado en el servidor.', 'good'); } catch (e) { this.say(e.message); } }

  /* ---------- Vista ---------- */
  render() {
    const st = this.status, [stText, stKind] = STATUS[st] || STATUS.offline;
    const msg = this.msg ? `<div class="on-msg ${this.msg.kind}" role="alert"><span>${esc(this.msg.text)}</span>${this.retryFn ? '<button id="on-retry" class="btn-ghost">Reintentar</button>' : ''}</div>` : '';
    let body;
    if (!this.auth || !this.account) body = this.renderAuth(st);
    else if (this.session && this.session.room && !this.session.soloDungeon && ['lobby', 'reconnecting', 'lost', 'connecting'].includes(this.session.status)) body = this.renderGroup();
    else body = this.renderMenu(st);
    const keep = {}; this.el.querySelectorAll('input[id], select[id]').forEach(i => { keep[i.id] = i.value; });   // no se pierde lo escrito al refrescar
    const focus = document.activeElement && this.el.contains(document.activeElement) ? document.activeElement.id : null;
    this.el.innerHTML = `<div class="online-card panel"><div class="on-head"><div class="eyebrow">Cooperativo · hasta ${MAX_PLAYERS} jugadores</div><span id="on-status" class="on-status ${stKind}" data-status="${st}">${stText}</span></div><h2 id="online-h">Expedición en grupo</h2>${msg}${body}</div>`;
    for (const [id, v] of Object.entries(keep)) { const i = this.el.querySelector('#' + id); if (i && !i.value && v) i.value = v; }
    if (focus) { const f = this.el.querySelector('#' + focus); if (f) f.focus(); }
    this.bind();
    this.drawPortraits();
  }
  renderAuth(st) {
    const tab = this.authTab, busy = st === 'checking' ? ' disabled' : '';
    const tabs = [['login', 'Iniciar sesión'], ['register', 'Crear cuenta'], ['guest', 'Probar como invitado']].map(([k, t]) => `<button class="on-tab${k === tab ? ' on' : ''}" data-tab="${k}" aria-pressed="${k === tab}">${t}</button>`).join('');
    const form = tab === 'login' ? `<label>Usuario <input id="on-user" autocomplete="username" maxlength="20"></label><label>Contraseña <input id="on-pass" type="password" autocomplete="current-password" maxlength="128"></label><button id="on-login" class="btn-main"${busy}>Entrar</button>`
      : tab === 'register' ? `<label>Usuario (para entrar desde otros dispositivos) <input id="on-ruser" autocomplete="username" maxlength="20" placeholder="3–20: letras, números, . _ -"></label><label>Contraseña <input id="on-rpass" type="password" autocomplete="new-password" maxlength="128" placeholder="mínimo 8 caracteres"></label><label>Nombre visible <input id="on-rname" maxlength="20" placeholder="Explorador"></label><button id="on-register" class="btn-main"${busy}>Crear cuenta</button>`
      : `<p class="hint-line">Sin contraseña. El progreso se guarda en el servidor, pero solo podrás usarlo desde este navegador hasta que le pongas usuario y contraseña.</p><label>Tu nombre <input id="on-name" maxlength="20" placeholder="Explorador"></label><button id="on-guest" class="btn-main"${busy}>Entrar como invitado</button>`;
    return `<p class="lede">Tu perfil online (criatura, nivel, objetos, monedas, compañeros y misiones) se guarda en el servidor y es solo tuyo: el mismo si juegas solo o con tus amigos.</p>
      <label>Servidor <input id="on-server" value="${esc(this.server)}" spellcheck="false" autocomplete="off"></label>
      <div class="on-tabs" role="tablist">${tabs}</div><div class="on-menu">${form}</div>
      <div class="on-row"><button id="on-local" class="btn-ghost">Partida local (sin conexión)</button><button id="on-close" class="btn-ghost">Volver</button></div>`;
  }
  renderMenu(st) {
    const a = this.account, rec = this.profile, busy = st === 'connecting';
    const guest = a.kind === 'guest';
    const who = `<div class="on-who"><span>${guest ? 'Invitado' : 'Cuenta'}: <b>${esc(a.name)}</b>${a.username ? ` <small>(@${esc(a.username)})</small>` : ''}</span>
      <span class="on-badge ${guest ? 'warn' : 'ok'}">${guest ? 'solo este dispositivo' : 'disponible en todos tus dispositivos'}</span>
      <button id="on-logout" class="btn-link">cambiar de cuenta</button>${guest ? '' : '<button id="on-logoutall" class="btn-link">cerrar sesión en todos los dispositivos</button>'}</div>`;
    const upgrade = guest ? `<details class="on-profile"><summary>Guardar mi progreso con usuario y contraseña (para jugar desde otros dispositivos)</summary>
      <div class="on-opt"><label>Usuario <input id="on-uuser" autocomplete="username" maxlength="20"></label><label>Contraseña <input id="on-upass" type="password" autocomplete="new-password" maxlength="128"></label></div><button id="on-upgrade" class="btn-main">Guardar con mi usuario</button></details>` : '';
    let card;
    if (!rec) card = `<div class="box"><h3>Elige tu criatura</h3><p class="hint-line">Aún no tienes perfil online. Empieza con:</p><div class="on-row">${SPECIES.map(s => `<button class="btn-ghost on-fresh" data-sp="${s.id}">${esc(s.name)}</button>`).join('')}</div></div>`;
    else {
      const S = rec.summary || {}, c = S.creature || {};
      const items = (S.inventory || []).reduce((t, x) => t + x.qty, 0), eq = Object.values(S.equipment || {}).filter(Boolean).map(e => ITEMS[e.id] ? ITEMS[e.id].name : e.id);
      card = `<div class="box on-card" id="on-profile-card"><canvas class="on-face" width="44" height="44" data-species="${esc(c.species)}" aria-hidden="true"></canvas>
        <div><h3>${esc(c.name)} · Nv ${S.level} <small>${S.exp}/${S.expToNext} EXP</small></h3>
        <p>${S.coins} monedas · ${items} objetos · ${eq.length ? 'equipo: ' + esc(eq.join(', ')) : 'sin equipo'} · ${(S.companions || []).length} compañeros · ${(S.missions || {}).active ? S.missions.active.length : 0} misiones · rango ${esc((S.progress || {}).rank)} · ${((S.progress || {}).cleared || []).length} mazmorras</p>
        <p class="hint-line">Movimientos: ${(S.moves && S.moves.equipped || []).map(m => MOVES[m] ? MOVES[m].name : m).join(', ')}</p></div></div>`;
    }
    const importBox = this.policy.allowImport ? `<p class="on-msg warn"><span>Modo de desarrollo: este servidor permite subir la partida local (no es seguro).</span><button id="on-upload" class="btn-ghost">Subir partida local</button></p>` : '';
    return `${who}${upgrade}${card}${importBox}${this.renderHost()}
      <div class="on-menu">
        <button id="on-solo" class="btn-main"${rec ? '' : ' disabled'}>Jugar en solitario</button>
        <div class="on-opt"><label>Mazmorra <select id="on-dng">${DUNGEONS.map(d => `<option value="${d.id}">${esc(d.name)}</option>`).join('')}</select></label><button id="on-create" class="btn-main"${rec && !busy ? '' : ' disabled'}>Crear partida privada</button></div>
        <div class="on-opt"><label>Código de invitación <input id="on-code" maxlength="8" autocomplete="off" spellcheck="false" placeholder="ABC234" autocapitalize="characters" value="${esc(this.invite || '')}"></label><button id="on-join" class="btn-main"${rec && !busy ? '' : ' disabled'}>Unirse a partida</button></div>
        ${this.seat ? `<button id="on-resume" class="btn-main">Volver a mi grupo (${esc(this.seat.code)})</button>` : ''}
        <button id="on-leave" class="btn-ghost" disabled title="No estás en ningún grupo">Abandonar grupo</button>
      </div>
      <div class="on-row"><button id="on-local" class="btn-ghost">Partida local (sin conexión)</button><button id="on-close" class="btn-ghost">Volver</button></div>
      <p class="hint-line">La partida local de este navegador es independiente: no se mezcla con tu perfil online.</p>`;
  }
  renderGroup() {
    const L = this.session.lobbyView(), st = this.session.status;
    const slots = L.players.map(p => `<li class="${p.host || p.ready ? 'ok' : ''}${p.connected ? '' : ' off'}" data-player="${esc(p.name)}">
        <canvas class="on-face" width="44" height="44" data-species="${esc(p.species)}" aria-hidden="true"></canvas>
        <div><b>${esc(p.name)}</b>${p.me ? ' <em>(tú)</em>' : ''}<small>${esc((FORMS[p.species] || {}).name || p.species)} · Nv ${p.level}</small></div>
        <span>${p.host ? 'anfitrión' : p.ready ? 'listo' : 'esperando'}${p.connected ? '' : ' · reconectando' + (p.holdUntil ? ` (${Math.max(0, Math.ceil((p.holdUntil - Date.now()) / 1000))} s)` : '')}</span>
        ${L.host && !p.me && p.connected ? `<button class="btn-link on-give" data-give="${esc(p.id)}" title="Pasarle el liderazgo">ceder liderazgo</button>` : ''}</li>`).join('')
      + Array.from({ length: Math.max(0, L.max - L.players.length) }, () => '<li class="free">Plaza libre</li>').join('');
    const dng = dungeonById(L.dungeon) || {};
    const reconnectSel = L.reconnectChoices.length ? `<label>Si alguien pierde la conexión, esperar <select id="on-grec">${L.reconnectChoices.map(v => `<option value="${v}"${v === L.reconnectSeconds ? ' selected' : ''}>${v < 60 ? v + ' s' : v / 60 + ' min'}</option>`).join('')}</select></label>` : '';
    const hostCtl = L.host ? `<label>Mazmorra <select id="on-gdng">${DUNGEONS.map(d => `<option value="${d.id}"${d.id === L.dungeon ? ' selected' : ''}>${esc(d.name)}</option>`).join('')}</select></label>
        ${reconnectSel}
        <button id="on-start" class="btn-main"${L.canStart && st === 'lobby' ? '' : ' disabled'}>Iniciar expedición</button>` : `<button id="on-ready" class="btn-main"${st === 'lobby' ? '' : ' disabled'}>${L.me && L.me.ready ? 'No estoy listo' : 'Estoy listo'}</button>`;
    return `<div class="on-code"><span>Código de invitación</span><b id="on-code-val">${esc(L.code || '······')}</b><button id="on-copy" class="btn-link">copiar</button><button id="on-invite" class="btn-link">copiar enlace de invitación</button></div>
      <p class="hint-line">Compártelo con tus amigos: entran con «Unirse a partida». El anfitrión elige las opciones e inicia; la sala la mantiene el servidor, no tu navegador. ${L.players.length} de ${L.max} · Destino: <b>${esc(dng.name || '')}</b></p>
      ${this.host ? this.renderHost() : /^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(location.hostname) ? '<p class="hint-line" id="on-lanhint">Esta dirección solo funciona en tu casa. Para que entren amigos desde fuera, quien juega en el ordenador que hace de servidor pulsa <b>«Crear enlace para amigos»</b> y comparte el enlace https.</p>' : ''}
      <ul class="on-players">${slots}</ul>
      <div class="on-row">${hostCtl}<button id="on-leave" class="btn-ghost">Abandonar grupo</button></div>
      <p class="hint-line" id="on-coop">Dificultad · ${esc(coopSummary(L.players.length))}. Se ajusta sola si alguien sale del grupo.</p>
      <p class="hint-line" id="on-hostrule">${esc(HOST_RULE_TEXT)} Si alguien pierde la conexión se le guarda el sitio ${L.reconnectSeconds || ''} s.</p>
      ${L.host && !L.canStart ? '<p class="hint-line">Podrás iniciar cuando todos estén listos y conectados.</p>' : ''}${!L.host && L.me && L.me.ready ? '<p class="hint-line">Esperando a que el anfitrión inicie la expedición…</p>' : ''}`;
  }
  bind() {
    const on = (id, fn) => { const b = this.el.querySelector('#' + id); if (b) b.onclick = fn; };
    const val = id => (this.el.querySelector('#' + id) || {}).value;
    const srv = () => this.setServer(val('on-server'));
    on('on-retry', () => { const f = this.retryFn; this.say(''); f && f(); });
    on('on-close', () => this.close());
    this.el.querySelectorAll('.on-tab').forEach(b => b.onclick = () => { srv(); this.authTab = b.dataset.tab; this.say(''); });
    on('on-login', () => { srv(); this.login(val('on-user'), val('on-pass')); });
    on('on-register', () => { srv(); this.register(val('on-ruser'), val('on-rpass'), val('on-rname')); });
    on('on-guest', () => { srv(); this.guest(val('on-name')); });
    on('on-upgrade', () => this.upgrade(val('on-uuser'), val('on-upass')));
    on('on-logout', () => this.logout());
    on('on-logoutall', () => this.logoutAll());
    on('on-solo', () => this.solo());
    on('on-local', () => this.local());
    on('on-upload', () => this.upload());
    this.el.querySelectorAll('.on-fresh').forEach(b => b.onclick = () => this.fresh(b.dataset.sp));
    on('on-create', () => this.create(val('on-dng')));
    on('on-join', () => this.join(val('on-code')));
    on('on-leave', () => this.leaveGroup());
    on('on-resume', () => this.resumeGroup(false));
    on('on-ready', () => { const L = this.session.lobbyView(); this.session.setReady(!(L.me && L.me.ready)); });
    on('on-start', () => this.session.start(val('on-gdng')));
    const sel = this.el.querySelector('#on-gdng'); if (sel) sel.onchange = () => this.session.chooseDungeon(sel.value);
    this.el.querySelectorAll('.on-give').forEach(b => b.onclick = () => this.session.giveHost(b.dataset.give));
    const rec = this.el.querySelector('#on-grec'); if (rec) rec.onchange = () => this.session.setOptions({ reconnect: +rec.value });
    on('on-invite', async () => {
      let pub = this.hostUrl;
      if (this.host && !pub) { this.say('Creando el enlace para amigos… (unos segundos)', 'warn'); pub = await this.hostReady(); if (!pub) return this.say(this.host && this.host.error ? this.host.error : 'No se pudo crear el enlace para amigos.', 'bad'); }
      const url = inviteUrl(this.session.lobbyView().code, pub);
      (navigator.clipboard ? navigator.clipboard.writeText(url) : Promise.reject()).then(() => this.say('Enlace copiado: ' + url, 'good')).catch(() => this.say('Enlace de invitación: ' + url, 'good'));
    });
    on('on-host-open', () => this.hostOpen());
    on('on-host-close', () => this.hostClose());
    on('on-host-copy', () => { const url = this.hostUrl; (navigator.clipboard ? navigator.clipboard.writeText(url) : Promise.reject()).then(() => this.say('Enlace copiado: ' + url, 'good')).catch(() => this.say('Enlace para tus amigos: ' + url, 'good')); });
    on('on-copy', () => navigator.clipboard && navigator.clipboard.writeText(this.session.lobbyView().code).then(() => this.say('Código copiado', 'good')).catch(() => {}));
  }
  drawPortraits() {
    this.el.querySelectorAll('canvas.on-face').forEach((cv, i) => {
      const sp = FORMS[cv.dataset.species]; if (!sp) return;
      cv.id = 'on-face-' + i;
      try { UI.drawPortrait(sp, 0, cv.id, 1.1); } catch { /* solo decorativo */ }
    });
  }
}
