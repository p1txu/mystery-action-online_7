/**
 * Hub social (una sola sala para todo el servidor, se crea al arrancar). Cada jugador conectado tiene
 * una conexión aquí mientras juega: en el menú, en la aldea y también durante las expediciones.
 *  - Presencia: quién está conectado y dónde (menú, aldea o mazmorra); se avisa a sus amigos.
 *  - Grupo persistente (hasta PARTY_MAX): invitar a amigos, aceptar, salir, expulsar, ceder el liderazgo
 *    y «Ir a la mazmorra» (el servidor crea UNA expedición para el grupo; solo sus miembros pueden entrar).
 *    El grupo sigue existiendo al acabar la expedición: volvéis juntos a la aldea.
 *  - Aldea compartida: cada uno manda su posición en la aldea y el servidor la reenvía solo a los de su
 *    grupo que también están en la aldea (10 veces por segundo).
 *  - Chat del grupo: texto libre con filtro, 140 caracteres y 5 mensajes cada 10 s; no llega a quien
 *    te ha bloqueado (ni de quien has bloqueado).
 * Nada de lo que manda un cliente cambia su perfil ni el de otro: aquí solo se decide quién ve a quién.
 */
import { Room, ServerError } from '@colyseus/core';
import { randomBytes } from 'node:crypto';
import { HC, HS, HUB_ERR, PARTY_MAX, CHAT_RATE, CHAT_HISTORY, WHERE, cleanChat } from '../../../shared/social.js';
import { ERR, PROTOCOL_VERSION, ROOM_NAME, errorMessage } from '../../../shared/protocol.js';
import { createEngineCore } from '../../../shared/engine-core.generated.js';
import { log as rootLog, shortId } from '../log.js';

const RULES = createEngineCore();
const INVITE_MS = 60000, RECONNECT_S = 30, EMPTY_PARTY_MS = 10 * 60000;
const VILLAGE_W = 44 * 32, VILLAGE_H = 34 * 32;
const num = v => typeof v === 'number' && Number.isFinite(v);

export class HubRoom extends Room {
  /** { identity, profiles, social, registry, matchMaker } (app.js). */
  static services = null;
  maxClients = 2000;
  autoDispose = false;

  onCreate() {
    this.conns = new Map();      // accountId → { client, account, where, pos, chat: [t…], species, level, online }
    this.bySession = new Map();  // sessionId → accountId
    this.parties = new Map();    // partyId → { id, leader, members: [accountId], invites: Map(accountId → expira), chat: [], emptyT }
    this.partyOf = new Map();    // accountId → partyId
    this.log = rootLog.child({ room: 'hub' });
    const { social } = HubRoom.services;
    social.presence = id => this.presenceOf(id);
    this.offSocial = social.onChange(ids => this.friendsChanged(ids));
    const on = (t, fn) => this.onMessage(t, (client, msg) => { const id = this.bySession.get(client.sessionId); if (id) Promise.resolve(fn(id, msg && typeof msg === 'object' ? msg : {}, client)).catch(e => this.log.error('hub.msg', e)); });
    on(HC.WHERE, (id, m) => this.setWhere(id, m.where));
    on(HC.POS, (id, m) => this.setPos(id, m));
    on(HC.CHAT, (id, m) => this.chat(id, m.text));
    on(HC.INVITE, (id, m) => this.invite(id, m.to));
    on(HC.ACCEPT, (id, m) => this.accept(id, m.party));
    on(HC.DECLINE, (id, m) => this.decline(id, m.party));
    on(HC.LEAVE, id => this.leaveParty(id, 'leave'));
    on(HC.KICK, (id, m) => this.kick(id, m.id));
    on(HC.LEAD, (id, m) => this.lead(id, m.id));
    on(HC.GO, (id, m) => this.go(id, m.dungeon));
    this.onMessage(HC.PING, (client, m) => client.send(HS.PONG, { t: m && m.t }));
    this.setSimulationInterval(() => this.villageTick(), 100);
  }

  /* ---------------- Conexión ---------------- */
  async onAuth(client, options) {
    const { identity } = HubRoom.services;
    const token = options && options.token;
    const account = typeof token === 'string' ? await identity.verify(token) : null;
    if (!account) throw new ServerError(ERR.SESSION, errorMessage(ERR.SESSION));
    if (!options || options.protocol !== PROTOCOL_VERSION) throw new ServerError(ERR.VERSION, errorMessage(ERR.VERSION));
    return account;
  }
  async onJoin(client, options, account) {
    const { social } = HubRoom.services;
    const old = this.conns.get(account.id);
    if (old && old.client && old.client.sessionId !== client.sessionId) {          // otra pestaña o dispositivo: se queda el nuevo
      this.bySession.delete(old.client.sessionId);
      try { old.client.send(HS.NOTICE, { text: 'Te has conectado desde otro sitio: aquí se cierra la conexión.', kind: 'warn' }); old.client.leave(HUB_ERR.REPLACED); } catch { /* ya cerrada */ }
    }
    const c = { client, account, where: 'menu', pos: null, chat: [], online: true };
    this.conns.set(account.id, c); this.bySession.set(client.sessionId, account.id);
    await this.loadLook(account.id);
    const code = await social.code(account.id);
    const view = await social.view(account.id);
    const pid = this.partyOf.get(account.id), party = pid && this.parties.get(pid);
    if (party) clearTimeout(party.emptyT);
    client.send(HS.HELLO, Object.assign({ me: { id: account.id, name: account.name, code } }, view, { party: party ? this.partyView(party) : null, chat: party ? party.chat.slice(-CHAT_HISTORY) : [] }));
    for (const [pid2, p] of this.parties) if (p.invites.has(account.id) && p.invites.get(account.id) > Date.now()) client.send(HS.INVITE, { party: pid2, from: await social.who(p.leader) });
    this.log.info('hub.join', { account: shortId(account.id) });
    await this.presenceChanged(account.id);
  }
  async onDrop(client) {
    const id = this.bySession.get(client.sessionId), c = id && this.conns.get(id);
    if (c) { c.online = false; c.pos = null; await this.presenceChanged(id); }
    try { await this.allowReconnection(client, RECONNECT_S); } catch { /* no volvió: onLeave */ }
  }
  async onReconnect(client) {
    const id = this.bySession.get(client.sessionId), c = id && this.conns.get(id);
    if (c) { c.online = true; c.client = client; await this.presenceChanged(id); }
  }
  async onLeave(client) {
    const id = this.bySession.get(client.sessionId); this.bySession.delete(client.sessionId);
    if (!id) return;
    const c = this.conns.get(id);
    if (!c || c.client.sessionId !== client.sessionId) return;      // ya la sustituyó otra conexión de la misma cuenta
    this.conns.delete(id);
    this.log.info('hub.leave', { account: shortId(id) });
    const pid = this.partyOf.get(id), p = pid && this.parties.get(pid);
    if (p) {
      if (p.leader === id) { const next = p.members.find(m => m !== id && this.isOnline(m)); if (next) this.setLeader(p, next, 'drop'); }
      if (!p.members.some(m => this.isOnline(m))) p.emptyT = setTimeout(() => this.disband(p, 'empty'), EMPTY_PARTY_MS);
    }
    await this.presenceChanged(id);
  }
  onDispose() { if (this.offSocial) this.offSocial(); for (const p of this.parties.values()) clearTimeout(p.emptyT); }

  isOnline(id) { const c = this.conns.get(id); return !!(c && c.online); }
  presenceOf(id) {
    const c = this.conns.get(id), { registry } = HubRoom.services;
    if (!c || !c.online) return { online: false, where: 'menu' };
    return { online: true, where: registry.roomOf(id) ? 'dungeon' : c.where };
  }
  send(id, type, msg) { const c = this.conns.get(id); if (c && c.online) try { c.client.send(type, msg); } catch { /* cerrándose */ } }
  notice(id, text, kind = 'warn') { this.send(id, HS.NOTICE, { text, kind }); }
  /** Clase y nivel para que los demás te dibujen (del perfil del servidor). */
  async loadLook(id) {
    const c = this.conns.get(id); if (!c) return;
    const rec = await HubRoom.services.profiles.get(id).catch(() => null);
    c.species = rec && rec.save ? rec.save.species : null; c.level = rec && rec.save ? rec.save.prog.level : 1;
  }

  async presenceChanged(id) {
    const { social } = HubRoom.services, pr = this.presenceOf(id);
    for (const f of await social.friendIds(id)) this.send(f, HS.PRESENCE, Object.assign({ id }, pr));
    const pid = this.partyOf.get(id); if (pid) this.pushParty(this.parties.get(pid));
  }
  async friendsChanged(ids) {
    const { social } = HubRoom.services;
    for (const id of ids) if (this.isOnline(id)) this.send(id, HS.FRIENDS, await social.view(id));
  }
  async setWhere(id, where) {
    const c = this.conns.get(id); if (!c || !WHERE.includes(where) || c.where === where) return;
    c.where = where; if (where !== 'village') c.pos = null;
    if (where === 'village') await this.loadLook(id);       // al volver de una expedición puede haber subido de nivel
    await this.presenceChanged(id);
  }

  /* ---------------- Aldea compartida ---------------- */
  setPos(id, m) {
    const c = this.conns.get(id); if (!c || c.where !== 'village') return;
    if (!num(m.x) || !num(m.y) || m.x < 0 || m.y < 0 || m.x > VILLAGE_W || m.y > VILLAGE_H) return;
    const fx = num(m.fx) ? Math.max(-1, Math.min(1, m.fx)) : 0, fy = num(m.fy) ? Math.max(-1, Math.min(1, m.fy)) : 1;
    c.pos = { x: Math.round(m.x * 10) / 10, y: Math.round(m.y * 10) / 10, fx: Math.round(fx * 100) / 100, fy: Math.round(fy * 100) / 100, m: !!m.m };
  }
  /** Cada 100 ms: a cada uno de la aldea, la posición de los de SU grupo que también están en la aldea. */
  villageTick() {
    for (const p of this.parties.values()) {
      const here = p.members.map(id => this.conns.get(id)).filter(c => c && c.online && c.where === 'village');
      if (!here.length) continue;
      for (const c of here) {
        const list = here.filter(o => o !== c && o.pos).map(o => ({ id: o.account.id, name: o.account.name, species: o.species, level: o.level, x: o.pos.x, y: o.pos.y, fx: o.pos.fx, fy: o.pos.fy, m: o.pos.m }));
        if (list.length || c.sentVillage) this.send(c.account.id, HS.VILLAGE, { list });
        c.sentVillage = list.length > 0;
      }
    }
    for (const c of this.conns.values()) if (c.sentVillage && !this.partyOf.get(c.account.id)) { this.send(c.account.id, HS.VILLAGE, { list: [] }); c.sentVillage = false; }
  }

  /* ---------------- Chat del grupo ---------------- */
  async chat(id, raw) {
    const pid = this.partyOf.get(id), p = pid && this.parties.get(pid), c = this.conns.get(id);
    if (!p || !c) return this.notice(id, 'El chat es del grupo: invita a un amigo para hablar.');
    const t = Date.now(); c.chat = c.chat.filter(x => t - x < CHAT_RATE.ms);
    if (c.chat.length >= CHAT_RATE.n) return this.notice(id, 'Vas muy rápido: espera unos segundos antes de escribir otra vez.');
    const r = cleanChat(raw); if (!r.ok) return;
    c.chat.push(t);
    const msg = { id: randomBytes(6).toString('base64url'), from: id, name: c.account.name, text: r.text, at: t };
    p.chat.push(msg); if (p.chat.length > CHAT_HISTORY) p.chat.splice(0, p.chat.length - CHAT_HISTORY);
    const { social } = HubRoom.services;
    for (const m of p.members) if (m === id || !(await social.blocked(id, m))) this.send(m, HS.CHAT, msg);
  }
  sys(p, text) {
    const msg = { id: randomBytes(6).toString('base64url'), from: null, name: '', text, at: Date.now(), sys: true };
    p.chat.push(msg); if (p.chat.length > CHAT_HISTORY) p.chat.shift();
    for (const m of p.members) this.send(m, HS.CHAT, msg);
  }

  /* ---------------- Grupo ---------------- */
  partyView(p) {
    return { id: p.id, leader: p.leader, members: p.members.map(id => { const c = this.conns.get(id), pr = this.presenceOf(id); return { id, name: c ? c.account.name : (p.names.get(id) || '¿?'), species: c ? c.species : p.looks.get(id)?.species || null, level: c ? c.level : p.looks.get(id)?.level || 1, online: pr.online, where: pr.where }; }) };
  }
  pushParty(p) { if (!p) return; const v = this.partyView(p); for (const m of p.members) { const c = this.conns.get(m); if (c) { p.names.set(m, c.account.name); p.looks.set(m, { species: c.species, level: c.level }); } this.send(m, HS.PARTY, v); } }
  newParty(leader) {
    const p = { id: 'p_' + randomBytes(8).toString('base64url'), leader, members: [leader], invites: new Map(), chat: [], names: new Map(), looks: new Map(), emptyT: null };
    this.parties.set(p.id, p); this.partyOf.set(leader, p.id); return p;
  }
  async invite(id, to) {
    const { social } = HubRoom.services;
    if (typeof to !== 'string' || to === id) return;
    if (!(await social.areFriends(id, to)) || await social.blocked(id, to)) return this.notice(id, 'Solo puedes invitar a tus amigos.');
    if (!this.isOnline(to)) return this.notice(id, 'Tu amigo no está conectado.');
    let p = this.parties.get(this.partyOf.get(id));
    if (p && p.members.includes(to)) return this.notice(id, 'Ya está en tu grupo.', 'info');
    if (p && p.members.length >= PARTY_MAX) return this.notice(id, `El grupo está completo (${PARTY_MAX} de ${PARTY_MAX}).`);
    if (!p) p = this.newParty(id);
    p.invites.set(to, Date.now() + INVITE_MS);
    this.send(to, HS.INVITE, { party: p.id, from: await social.who(id) });
    this.notice(id, `Invitación enviada a ${(await social.who(to)).name}.`, 'good');
    this.pushParty(p);
    this.log.info('party.invite', { party: p.id, from: shortId(id), to: shortId(to) });
  }
  async accept(id, pid) {
    const p = this.parties.get(pid);
    const exp = p && p.invites.get(id);
    if (!p || !exp || exp < Date.now()) { if (p) p.invites.delete(id); return this.notice(id, 'Esa invitación ya no es válida.'); }
    if (HubRoom.services.registry.roomOf(id)) return this.notice(id, 'Termina antes la expedición en la que estás.');
    if (p.members.length >= PARTY_MAX) return this.notice(id, 'Ese grupo ya está completo.');
    if (this.partyOf.get(id) && this.partyOf.get(id) !== pid) this.leaveParty(id, 'leave');
    p.invites.delete(id); clearTimeout(p.emptyT);
    for (const m of p.chat.slice(-CHAT_HISTORY)) this.send(id, HS.CHAT, m);       // lo hablado antes de entrar
    if (!p.members.includes(id)) p.members.push(id);
    this.partyOf.set(id, p.id);
    const c = this.conns.get(id); this.sys(p, `${c ? c.account.name : 'Alguien'} se ha unido al grupo.`);
    this.pushParty(p);
    this.log.info('party.join', { party: p.id, account: shortId(id), size: p.members.length });
  }
  decline(id, pid) { const p = this.parties.get(pid); if (p && p.invites.delete(id)) { const c = this.conns.get(id); this.notice(p.leader, `${c ? c.account.name : 'Tu amigo'} ha rechazado la invitación.`, 'info'); this.disbandIfAlone(p); } }
  leaveParty(id, why) {
    const pid = this.partyOf.get(id), p = pid && this.parties.get(pid); if (!p) return;
    p.members = p.members.filter(m => m !== id); this.partyOf.delete(id);
    const c = this.conns.get(id), name = c ? c.account.name : (p.names.get(id) || 'Alguien');
    this.send(id, HS.PARTY, null); this.send(id, HS.VILLAGE, { list: [] }); if (c) c.sentVillage = false;
    if (why === 'kick') this.notice(id, 'El líder te ha sacado del grupo.', 'warn');
    if (!p.members.length) return this.disband(p, 'empty');
    if (p.leader === id) this.setLeader(p, p.members.find(m => this.isOnline(m)) || p.members[0], why);
    this.sys(p, why === 'kick' ? `${name} ha salido del grupo (expulsado por el líder).` : `${name} ha salido del grupo.`);
    this.pushParty(p); this.disbandIfAlone(p);
  }
  disbandIfAlone(p) { if (p.members.length <= 1 && !p.invites.size) this.disband(p, 'alone'); }
  disband(p, why) {
    if (!this.parties.has(p.id)) return;
    clearTimeout(p.emptyT); this.parties.delete(p.id);
    for (const m of p.members) { this.partyOf.delete(m); this.send(m, HS.PARTY, null); this.send(m, HS.VILLAGE, { list: [] }); }
    this.log.info('party.disband', { party: p.id, why });
  }
  setLeader(p, to, why) { if (!p.members.includes(to)) return; p.leader = to; const c = this.conns.get(to); this.sys(p, `${c ? c.account.name : 'Otro jugador'} es ahora el líder${why === 'drop' ? ' (el anterior se desconectó)' : ''}.`); this.pushParty(p); }
  kick(id, who) { const p = this.parties.get(this.partyOf.get(id)); if (!p || p.leader !== id) return this.notice(id, 'Solo el líder puede sacar a alguien del grupo.'); if (who === id || !p.members.includes(who)) return; this.leaveParty(who, 'kick'); }
  lead(id, who) { const p = this.parties.get(this.partyOf.get(id)); if (!p || p.leader !== id) return this.notice(id, 'Solo el líder puede ceder el liderazgo.'); if (who === id || !p.members.includes(who) || !this.isOnline(who)) return this.notice(id, 'Elige a alguien del grupo que esté conectado.'); this.setLeader(p, who, 'manual'); }

  /**
   * «Ir a la mazmorra» (solo el líder): todos los del grupo conectados y fuera de otra expedición, con la
   * mazmorra desbloqueada en SU perfil. El servidor crea la expedición del grupo (solo pueden entrar
   * ellos) y les manda a cada uno cómo entrar; empieza sola cuando han entrado todos.
   */
  async go(id, dungeon) {
    const { registry, profiles, matchMaker } = HubRoom.services;
    const p = this.parties.get(this.partyOf.get(id));
    if (!p) return this.notice(id, 'No estás en ningún grupo.');
    if (p.leader !== id) return this.notice(id, 'Solo el líder elige la mazmorra del grupo.');
    if (p.going) return;
    const dng = RULES.dungeonById(dungeon); if (!dng) return this.notice(id, 'Mazmorra desconocida.');
    const off = p.members.filter(m => !this.isOnline(m)), busy = p.members.filter(m => registry.roomOf(m));
    const nm = m => (this.conns.get(m) || {}).account?.name || p.names.get(m) || '¿?';
    if (off.length) return this.notice(id, `${off.map(nm).join(', ')} no está conectado. Espera o sácalo del grupo.`);
    if (busy.length) return this.notice(id, `${busy.map(nm).join(', ')} está en otra expedición.`);
    const locked = [];
    for (const m of p.members) { const rec = await profiles.get(m); if (!rec || !RULES.dungeonOpen(rec.save, dng)) locked.push(nm(m)); }
    if (locked.length) return this.notice(id, `${locked.join(', ')} aún no ha desbloqueado ${dng.name}.`);
    p.going = true;
    try {
      const key = randomBytes(12).toString('base64url');
      registry.putParty(key, { party: p.id, leader: p.leader, accounts: [...p.members], dungeon: dng.id });
      const listing = await matchMaker.createRoom(ROOM_NAME, { partyKey: key });
      const room = registry.rooms.get(listing.roomId);
      if (!room) throw new Error('La expedición del grupo no se creó');
      this.sys(p, `${nm(id)} ha elegido ${dng.name}. ¡Vamos!`);
      for (const m of p.members) this.send(m, HS.GO, { roomId: listing.roomId, code: room.code, dungeon: dng.id });
      this.log.info('party.go', { party: p.id, dungeon: dng.id, players: p.members.length, room: listing.roomId });
    } catch (e) { this.log.error('party.go_failed', e); this.notice(id, 'No se pudo crear la expedición del grupo. Inténtalo de nuevo.'); }
    finally { setTimeout(() => { p.going = false; }, 3000); }
  }
}
