/** Llamadas HTTP a la API de cuentas y perfiles del servidor (ver server/src/http/api.js). */
const KEY = 'ma-online-auth';

export function loadAuth() { try { return JSON.parse(localStorage.getItem(KEY)) || null; } catch { return null; } }
export function saveAuth(a) { try { a ? localStorage.setItem(KEY, JSON.stringify(a)) : localStorage.removeItem(KEY); } catch { /* sin almacenamiento */ } }

export class Api {
  constructor(base, token = null) { this.base = base.replace(/\/+$/, ''); this.token = token; }
  async req(method, path, body) {
    let res;
    try {
      res = await fetch(this.base + path, { method, headers: Object.assign({ 'content-type': 'application/json' }, this.token ? { authorization: 'Bearer ' + this.token } : {}), body: body === undefined ? undefined : JSON.stringify(body) });
    } catch (e) { throw Object.assign(new Error('No se puede conectar con el servidor ' + this.base), { offline: true }); }
    let data = null; try { data = await res.json(); } catch { data = null; }
    if (!res.ok) throw Object.assign(new Error((data && data.error) || `Error ${res.status}`), { status: res.status, data, code: data && data.errorCode });
    return data;
  }
  health() { return this.req('GET', '/api/health'); }
  guest(name) { return this.req('POST', '/api/auth/guest', { name }); }
  register(username, password, name) { return this.req('POST', '/api/auth/register', { username, password, name }); }
  login(username, password) { return this.req('POST', '/api/auth/login', { username, password }); }
  upgrade(username, password) { return this.req('POST', '/api/auth/upgrade', { username, password }); }
  logout() { return this.req('POST', '/api/auth/logout', {}); }
  me() { return this.req('GET', '/api/me'); }
  async profile() { const r = await this.req('GET', '/api/profile'); return r && r.profile ? r : null; }   // null: cuenta sin perfil todavía
  newProfile(species) { return this.req('POST', '/api/profile/new', { species }); }
  op(op, args, version) { return this.req('POST', '/api/profile/op', { op, args, version }); }
  rewards() { return this.req('GET', '/api/profile/rewards'); }
  uploadSave(text, version) { return this.req('PUT', '/api/profile', { text, version }); }
  resume(takeover = false) { return this.req('POST', '/api/rooms/resume', { takeover }); }
  roomByCode(code) { return this.req('GET', '/api/rooms/' + encodeURIComponent(code)); }
  friends() { return this.req('GET', '/api/friends'); }
  friendRequest(code) { return this.req('POST', '/api/friends/request', { code }); }
  friendRespond(id, accept) { return this.req('POST', '/api/friends/respond', { id, accept }); }
  friendRemove(id) { return this.req('POST', '/api/friends/remove', { id }); }
  friendBlock(id) { return this.req('POST', '/api/friends/block', { id }); }
  friendUnblock(id) { return this.req('POST', '/api/friends/unblock', { id }); }
  hostStatus() { return this.req('GET', '/api/host'); }
  hostOpen() { return this.req('POST', '/api/host/open', {}); }
  hostClose() { return this.req('POST', '/api/host/close', {}); }
}
