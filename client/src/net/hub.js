/**
 * Conexión social siempre activa (sala «hub» del servidor) mientras hay una cuenta con sesión:
 *  - dice al servidor dónde estás (menú, aldea o mazmorra) y, en la aldea, tu posición (10 veces/s);
 *  - recibe amigos, presencia, invitaciones, el grupo, el chat y a los del grupo que están en la aldea,
 *    y los dibuja en la aldea (RemotePlayer del juego, interpolados);
 *  - «Ir a la mazmorra» del grupo: el servidor manda dónde entrar y el lobby se une a esa expedición.
 * Si se corta, reintenta solo (cada 3 s y al recuperar la red). No guarda nada en el navegador.
 */
import { Client } from '@colyseus/sdk';
import { PROTOCOL_VERSION } from '../../../shared/protocol.js';
import { HUB_ROOM, HC, HS, HUB_ERR, VILLAGE_SEND_MS } from '../../../shared/social.js';
import { watchOffline } from './offline.js';

const G = () => window.MysteryAction;
const MUTE_KEY = 'ma-muted';

export class Hub {
  constructor({ server, token, onChange, onGo }) {
    this.server = server; this.token = token; this.onChange = onChange || (() => {}); this.onGo = onGo || (() => {});
    this.client = new Client(server); this.room = null; this.status = 'idle';
    this.me = null; this.friends = []; this.incoming = []; this.outgoing = []; this.blocked = []; this.party = null;
    this.chat = []; this.invites = []; this.notices = []; this.unread = 0;
    this.remotes = new Map();         // accountId → RemotePlayer en la aldea
    this.where = null; this.lastPos = null; this.posT = 0;
    try { this.muted = new Set(JSON.parse(localStorage.getItem(MUTE_KEY) || '[]')); } catch { this.muted = new Set(); }
    this.loop = setInterval(() => this.tick(), VILLAGE_SEND_MS);
    this.onOnline = () => { if (this.status === 'lost') this.connect(); };
    addEventListener('online', this.onOnline);
  }
  set(status) { this.status = status; this.onChange(this); }
  async connect() {
    if (this.closed || this.busy) return;
    this.busy = true; if (this.status !== 'lost') this.set('connecting');
    try {
      const room = await this.client.join(HUB_ROOM, { token: this.token, protocol: PROTOCOL_VERSION });
      this.attach(room); this.where = null;
    } catch (e) {
      this.error = e && e.message; this.set('lost');
      if (e && e.code === 4401) { this.closed = true; this.set('session'); }      // sesión caducada: el lobby pide entrar otra vez
      else this.retryLater();
    } finally { this.busy = false; }
  }
  retryLater() { clearTimeout(this.retryT); if (!this.closed) this.retryT = setTimeout(() => this.connect(), 3000); }
  attach(room) {
    if (this.unwatch) this.unwatch();
    this.room = room; this.unwatch = watchOffline(room);
    const on = (t, fn) => room.onMessage(t, m => { try { fn(m); } catch (e) { console.error('hub', t, e); } this.onChange(this); });
    on(HS.HELLO, m => { this.me = m.me; this.lists(m); this.party = m.party; this.chat = (m.chat || []).slice(); this.set('online'); });
    on(HS.FRIENDS, m => this.lists(m));
    on(HS.PRESENCE, m => { const f = this.friends.find(x => x.id === m.id); if (f) { f.online = m.online; f.where = m.where; } });
    on(HS.INVITE, m => { this.invites = this.invites.filter(i => i.party !== m.party).concat([Object.assign({ at: Date.now() }, m)]); this.toast(`${m.from.name} te invita a su grupo. Ábrelo con la tecla O.`, '#a6e3ff'); });
    on(HS.PARTY, m => { this.party = m; if (!m) this.clearRemotes(); else this.invites = this.invites.filter(i => i.party !== m.id); });
    on(HS.CHAT, m => this.addChat(m));
    on(HS.VILLAGE, m => this.village(m.list || []));
    on(HS.GO, m => this.onGo(m));
    on(HS.NOTICE, m => { this.notices.push(Object.assign({ at: Date.now() }, m)); this.notices = this.notices.slice(-5); this.toast(m.text, m.kind === 'good' ? '#7dffa0' : m.kind === 'info' ? '#a6e3ff' : '#ff9a4a'); });
    on(HS.PONG, () => {});
    room.onDrop(() => this.set('reconnecting'));
    room.onReconnect(() => { this.where = null; this.set('online'); });
    room.onLeave(code => {
      this.room = null; this.clearRemotes();
      if (this.closed) return this.set('idle');
      if (code === HUB_ERR.REPLACED) { this.closed = true; return this.set('replaced'); }
      this.set('lost'); this.retryLater();
    });
  }
  lists(m) { for (const k of ['friends', 'incoming', 'outgoing', 'blocked']) if (Array.isArray(m[k])) this[k] = m[k]; }
  send(type, msg = {}) { if (this.room) try { this.room.send(type, msg); return true; } catch { /* sin conexión */ } return false; }
  toast(text, color) { try { UI.toast(text, color); } catch { /* sin interfaz */ } }
  close() { this.closed = true; clearInterval(this.loop); clearTimeout(this.retryT); removeEventListener('online', this.onOnline); this.clearRemotes(); if (this.room) this.room.leave(true).catch(() => {}); this.room = null; }

  /* ---------- Chat ---------- */
  addChat(m) {
    if (m.from && this.muted.has(m.from)) return;
    this.chat.push(m); if (this.chat.length > 80) this.chat.shift();
    if (m.from && this.me && m.from !== this.me.id) this.unread++;
    // Bocadillo sobre quien habla (si está en tu aldea, o tú mismo)
    const g = G(), actor = m.from && this.me && m.from === this.me.id ? g && g.player : this.remotes.get(m.from);
    if (actor && !m.sys) { actor.chatText = m.text; actor.chatUntil = Date.now() + 6000; }
  }
  say(text) { return this.send(HC.CHAT, { text }); }
  mute(id, on) { if (on) this.muted.add(id); else this.muted.delete(id); try { localStorage.setItem(MUTE_KEY, JSON.stringify([...this.muted])); } catch { /* sin almacenamiento */ } this.onChange(this); }

  /* ---------- Grupo ---------- */
  invite(id) { this.send(HC.INVITE, { to: id }); }
  accept(party) { this.send(HC.ACCEPT, { party }); this.invites = this.invites.filter(i => i.party !== party); this.onChange(this); }
  decline(party) { this.send(HC.DECLINE, { party }); this.invites = this.invites.filter(i => i.party !== party); this.onChange(this); }
  leaveParty() { this.send(HC.LEAVE); }
  kick(id) { this.send(HC.KICK, { id }); }
  lead(id) { this.send(HC.LEAD, { id }); }
  go(dungeon) { this.send(HC.GO, { dungeon }); }
  get inParty() { return !!(this.party && this.party.members.length > 1); }
  get isLeader() { return !!(this.party && this.me && this.party.leader === this.me.id); }

  /* ---------- Dónde estoy y aldea compartida ---------- */
  currentWhere() {
    const g = G(); if (!g) return 'menu';
    if (g.net && g.net.active) return 'dungeon';
    if (g.state === 'play' || g.state === 'pause') return g.mode === 'village' ? 'village' : g.mode === 'dungeon' ? 'dungeon' : 'menu';
    return 'menu';
  }
  tick() {
    if (!this.room || this.status !== 'online') return;
    const w = this.currentWhere();
    if (w !== this.where) { this.where = w; this.send(HC.WHERE, { where: w }); if (w !== 'village') this.clearRemotes(); this.onChange(this); }
    if (w !== 'village') return;
    const p = G().player; if (!p) return;
    const pos = { x: Math.round(p.x * 10) / 10, y: Math.round(p.y * 10) / 10, fx: Math.round(p.facing.x * 100) / 100, fy: Math.round(p.facing.y * 100) / 100, m: !!p.moving };
    const same = this.lastPos && ['x', 'y', 'fx', 'fy', 'm'].every(k => this.lastPos[k] === pos[k]);
    this.posT += VILLAGE_SEND_MS;
    if (!same || this.posT >= 1000) { this.send(HC.POS, pos); this.lastPos = pos; this.posT = 0; }
  }
  /** Los de tu grupo que están en la aldea: se crean, se mueven (interpolados) y se quitan. */
  village(list) {
    const g = G();
    if (!g || g.mode !== 'village' || (g.state !== 'play' && g.state !== 'pause')) { this.clearRemotes(); return; }
    const seen = new Set();
    for (const s of list) {
      if (!FORMS[s.species]) continue;
      seen.add(s.id);
      let r = this.remotes.get(s.id);
      if (!r || r.sp.id !== s.species) { if (r) this.removeActor(r); r = new RemotePlayer('h:' + s.id, { species: s.species, level: s.level, name: s.name, x: s.x, y: s.y }); r.hubId = s.id; r.netConnected = true; this.remotes.set(s.id, r); }
      if (!g.actors.includes(r)) { r.x = r.px = s.x; r.y = r.py = s.y; r.buf = []; g.actors.push(r); }   // al volver a la aldea se vuelve a añadir
      r.push(s); r.nameTag = s.name; r.level = s.level;
    }
    for (const [id, r] of this.remotes) if (!seen.has(id)) { this.removeActor(r); this.remotes.delete(id); }
  }
  removeActor(r) { const g = G(); if (g && g.actors) g.actors = g.actors.filter(a => a !== r); }
  clearRemotes() { for (const r of this.remotes.values()) this.removeActor(r); this.remotes.clear(); }
}
