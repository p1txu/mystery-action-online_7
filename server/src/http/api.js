/**
 * API HTTP de identidad, perfiles y búsqueda de grupos. El núcleo trabaja con Request/Response
 * estándar (los que usa el router de Colyseus 0.18); `createApi` devuelve además un adaptador
 * para node:http (pruebas y uso independiente).
 *
 *   POST /api/auth/guest      { name }                         → { token, account }   (solo este dispositivo)
 *   POST /api/auth/register   { username, password, name }     → { token, account }   (cuenta entre dispositivos)
 *   POST /api/auth/login      { username, password }           → { token, account }
 *   POST /api/auth/upgrade    { username, password }  (invitado) → { token, account }  (conserva id y perfil)
 *   POST /api/auth/logout                                      → { ok }   (cierra la sesión en todos los dispositivos)
 *   GET  /api/me                                               → { account, room, policy }
 *   GET  /api/profile                                          → { profile, version, envelope, summary } | { profile: null } (sin perfil aún)
 *   POST /api/profile/new     { species }                      → { profile, version, summary }
 *   POST /api/profile/op      { op, args, version }            → { profile, version, info, summary } | 400/409 { error, profile, version }
 *   GET  /api/profile/rewards                                  → { rewards }   (recompensas de expediciones guardadas)
 *   PUT  /api/profile         { text, version }   SOLO si ALLOW_PROFILE_IMPORT (desarrollo; no es seguro)
 *   POST /api/rooms/resume    { takeover? }                → { reconnectionToken, roomId, code, phase }  (volver a MI sitio guardado)
 *   GET  /api/rooms/:code                              → { roomId, code, players, max } | 404 / 409
 *   GET  /api/host                                     → { available, state, url, … }   (enlace para amigos; solo en el PC del anfitrión)
 *   POST /api/host/open | /api/host/close              → abre / cierra el túnel (SOLO desde este mismo ordenador)
 *   GET  /api/friends                                  → { code, friends, incoming, outgoing, blocked }
 *   POST /api/friends/request  { code }                → { status: pending|accepted, friend }   (código de amigo «Ana#K7P2QX»)
 *   POST /api/friends/respond  { id, accept }          → aceptar o rechazar una solicitud recibida
 *   POST /api/friends/remove   { id }                  → borrar a un amigo o cancelar una solicitud
 *   POST /api/friends/block | /api/friends/unblock  { id }
 *   GET  /api/health                                   → { ok, uptime, rooms, players }   (vida del proceso)
 *   GET  /api/ready                                    → 200 { ok, db: 'ok' } | 503       (proceso + base de datos)
 * Los errores llevan { error: texto comprensible, errorCode: ERR.* cuando aplica }.
 */
import { isValidCode, normalizeCode, ERR, errorMessage } from '../../../shared/protocol.js';

const MAX_BODY = 256 * 1024;

/** Rutas para registrarlas en el router de Colyseus: [nombre, método, ruta]. */
export const API_ROUTES = [
  ['health', 'GET', '/api/health'],
  ['ready', 'GET', '/api/ready'],
  ['authGuest', 'POST', '/api/auth/guest'],
  ['authRegister', 'POST', '/api/auth/register'],
  ['authLogin', 'POST', '/api/auth/login'],
  ['authUpgrade', 'POST', '/api/auth/upgrade'],
  ['authLogout', 'POST', '/api/auth/logout'],
  ['profileOp', 'POST', '/api/profile/op'],
  ['profileRewards', 'GET', '/api/profile/rewards'],
  ['me', 'GET', '/api/me'],
  ['profileGet', 'GET', '/api/profile'],
  ['profilePut', 'PUT', '/api/profile'],
  ['profileNew', 'POST', '/api/profile/new'],
  ['roomResume', 'POST', '/api/rooms/resume'],
  ['roomByCode', 'GET', '/api/rooms/:code'],
  ['friends', 'GET', '/api/friends'],
  ['friendRequest', 'POST', '/api/friends/request'],
  ['friendRespond', 'POST', '/api/friends/respond'],
  ['friendRemove', 'POST', '/api/friends/remove'],
  ['friendBlock', 'POST', '/api/friends/block'],
  ['friendUnblock', 'POST', '/api/friends/unblock'],
  ['hostStatus', 'GET', '/api/host'],
  ['hostOpen', 'POST', '/api/host/open'],
  ['hostClose', 'POST', '/api/host/close'],
];

const LOOPBACK = ['localhost', '127.0.0.1', '::1', '[::1]'];
/**
 * ¿La petición viene de un navegador de ESTE ordenador? Lo que llega por el túnel de Cloudflare trae
 * cabeceras de reenvío (cf-connecting-ip, x-forwarded-for) y el dominio público; lo de otro PC de la casa,
 * su IP en la dirección. Además, si hay Origin (navegador), tiene que ser también local: así otra web
 * abierta en el navegador del anfitrión no puede abrir el túnel.
 */
export function isLocalRequest(request) {
  const h = request.headers;
  for (const k of ['cf-connecting-ip', 'cf-ray', 'x-forwarded-for', 'x-forwarded-host', 'forwarded', 'x-real-ip']) if (h.get(k)) return false;
  let host; try { host = new URL(request.url).hostname; } catch { return false; }
  const hh = (h.get('host') || '').replace(/:\d+$/, '');
  if (!LOOPBACK.includes(host) || (hh && !LOOPBACK.includes(hh))) return false;
  const o = h.get('origin');
  if (o) { try { if (!LOOPBACK.includes(new URL(o).hostname)) return false; } catch { return false; } }
  return true;
}

const httpError = (status, message) => Object.assign(new Error(message), { status });

export function createApi({ identity, profiles, registry, config, status = async () => ({ ok: true }), log = null, host = null, social = null }) {
  const hits = new Map();   // límite de creación de invitados por IP (ventana de 10 min)
  const limited = ip => { const now = Date.now(), h = (hits.get(ip) || []).filter(t => now - t < 600000); h.push(now); hits.set(ip, h); return h.length > 20; };

  const json = (status, body, origin) => {
    const headers = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' };
    if (origin) Object.assign(headers, { 'access-control-allow-origin': origin, vary: 'Origin' });
    return new Response(JSON.stringify(body), { status, headers });
  };
  const readJson = async request => {
    if (+request.headers.get('content-length') > MAX_BODY) throw httpError(413, 'La petición es demasiado grande');
    const buf = await request.arrayBuffer();
    if (buf.byteLength > MAX_BODY) throw httpError(413, 'La petición es demasiado grande');
    if (!buf.byteLength) return {};
    try { return JSON.parse(new TextDecoder().decode(buf)); } catch { throw httpError(400, 'JSON no válido'); }
  };
  const auth = async request => { const h = request.headers.get('authorization') || ''; return h.startsWith('Bearer ') ? identity.verify(h.slice(7)) : null; };

  /** Núcleo estándar: Request → Response (o null si la ruta no es de la API). */
  /** Cada petición queda registrada: método, ruta (sin parámetros), estado y duración. Nunca el cuerpo. */
  async function web(request, ip = '?') {
    const t0 = performance.now(), res = await handle(request, ip);
    if (res && log) {
      const path = new URL(request.url).pathname.replace(/^\/api\/rooms\/(?!resume)[^/]+$/, '/api/rooms/:code');
      const quiet = path === '/api/health' || path === '/api/ready' || request.method === 'OPTIONS';
      log[res.status >= 500 ? 'error' : quiet ? 'debug' : res.status >= 400 ? 'info' : 'debug']('http', { method: request.method, path, status: res.status, ms: Math.round(performance.now() - t0), ip });
    }
    return res;
  }
  async function handle(request, ip) {
    const url = new URL(request.url), path = url.pathname, method = request.method;
    if (!path.startsWith('/api/')) return null;
    const reqOrigin = request.headers.get('origin'), origin = reqOrigin && (config.clientOrigins.includes(reqOrigin) || (!config.production && config.clientOrigins.includes('*'))) ? reqOrigin : null;
    if (method === 'OPTIONS') return new Response(null, { status: origin ? 204 : 403, headers: origin ? { 'access-control-allow-origin': origin, 'access-control-allow-methods': 'GET,POST,PUT', 'access-control-allow-headers': 'authorization,content-type', 'access-control-max-age': '600', vary: 'Origin' } : {} });
    try {
      if (path === '/api/health' && method === 'GET') return json(200, await status(false), origin);
      if (path === '/api/ready' && method === 'GET') { const st = await status(true); return json(st.ok ? 200 : 503, st, origin); }
      if (path === '/api/auth/guest' && method === 'POST') {
        if (limited(ip)) return json(429, { error: 'Demasiadas cuentas nuevas desde esta conexión. Espera unos minutos.' }, origin);
        const body = await readJson(request);
        return json(201, await identity.createGuest(body.name), origin);
      }
      if (path === '/api/auth/register' && method === 'POST') {
        if (limited(ip)) return json(429, { error: 'Demasiadas cuentas nuevas desde esta conexión. Espera unos minutos.' }, origin);
        const b = await readJson(request);
        return json(201, await identity.register(b.username, b.password, b.name), origin);
      }
      if (path === '/api/auth/login' && method === 'POST') {
        const b = await readJson(request);
        return json(200, await identity.login(b.username, b.password, ip), origin);
      }
      const m = path.match(/^\/api\/rooms\/([A-Za-z0-9-]{1,12})$/);
      if (m && method === 'GET') {
        const code = normalizeCode(m[1]), info = isValidCode(code) ? registry.info(code) : null;
        if (!info) return json(404, { error: errorMessage(ERR.NOT_FOUND), errorCode: ERR.NOT_FOUND }, origin);
        if (info.phase !== 'lobby') return json(409, { error: errorMessage(ERR.STARTED), errorCode: ERR.STARTED }, origin);
        if (info.players >= info.max) return json(409, { error: errorMessage(ERR.FULL), errorCode: ERR.FULL, players: info.players, max: info.max }, origin);
        return json(200, { roomId: info.roomId, code, players: info.players, max: info.max }, origin);
      }
      if (path === '/api/host' && method === 'GET') return json(200, host && isLocalRequest(request) ? Object.assign({ available: true }, host.status()) : { available: false }, origin);
      if ((path === '/api/host/open' || path === '/api/host/close') && method === 'POST') {
        if (!host || !isLocalRequest(request)) return json(403, { error: 'El enlace para amigos solo se abre desde el ordenador del anfitrión.' }, origin);
        return json(200, Object.assign({ available: true }, path.endsWith('open') ? host.open() : host.close()), origin);
      }
      const account = await auth(request);
      if (!account) return json(401, { error: errorMessage(ERR.SESSION), errorCode: ERR.SESSION }, origin);
      if (path === '/api/me' && method === 'GET') return json(200, { account, room: registry.roomOf(account.id), seat: registry.roomFor(account.id)?.seatInfo(account.id) || null, policy: { allowImport: profiles.allowImport, crossDevice: account.kind !== 'guest' } }, origin);
      if (path === '/api/auth/upgrade' && method === 'POST') { const b = await readJson(request); return json(200, await identity.upgrade(account.id, b.username, b.password), origin); }
      if (path === '/api/rooms/resume' && method === 'POST') {
        // Solo la cuenta dueña del sitio recibe su token de reconexión: vuelve al MISMO asiento
        const b = await readJson(request), room = registry.roomFor(account.id);
        const r = room ? await room.resumeSeat(account.id, { takeover: b.takeover === true }) : { error: ERR.NO_SEAT };
        return r.error ? json(r.error === ERR.LIVE_ELSEWHERE ? 409 : 404, { error: errorMessage(r.error), errorCode: r.error }, origin) : json(200, r, origin);
      }
      if (social && path === '/api/friends' && method === 'GET') return json(200, Object.assign({ code: await social.code(account.id) }, await social.view(account.id)), origin);
      if (social && path.startsWith('/api/friends/') && method === 'POST') {
        const b = await readJson(request), id = typeof b.id === 'string' ? b.id.slice(0, 64) : '';
        const act = path.slice('/api/friends/'.length);
        let r;
        if (act === 'request') r = await social.request(account.id, b.code);
        else if (act === 'respond') r = await social.respond(account.id, id, b.accept === true);
        else if (act === 'remove') r = await social.remove(account.id, id);
        else if (act === 'block') r = await social.block(account.id, id);
        else if (act === 'unblock') r = await social.unblock(account.id, id);
        else return json(404, { error: 'Ruta desconocida' }, origin);
        return json(200, Object.assign(r, await social.view(account.id)), origin);
      }
      if (path === '/api/auth/logout' && method === 'POST') { await identity.logoutAll(account.id); return json(200, { ok: true }, origin); }
      const withSummary = (status, rec, extra = {}) => json(status, Object.assign({ profile: rec.save, version: rec.version, summary: profiles.summary(account.id, rec) }, extra), origin);
      if (path === '/api/profile' && method === 'GET') {
        const p = await profiles.get(account.id);
        return p ? withSummary(200, p, { envelope: profiles.envelope(p.save), updatedAt: p.updatedAt })
          : json(200, { profile: null, errorCode: ERR.NO_PROFILE }, origin);     // cuenta nueva: aún sin perfil (no es un error)
      }
      if (path === '/api/profile/new' && method === 'POST') {
        const r = await profiles.createFresh(account.id, (await readJson(request)).species);
        return r.error ? json(409, { error: r.error }, origin) : withSummary(201, { save: r.save, version: r.version });
      }
      if (path === '/api/profile/op' && method === 'POST') {
        const b = await readJson(request);
        if (typeof b.op !== 'string') return json(400, { error: 'Falta la operación' }, origin);
        const r = await profiles.op(account.id, b.op, b.args || {}, Number.isInteger(b.version) ? b.version : undefined);
        if (r.error && !r.save) return json(404, { error: r.error, errorCode: ERR.NO_PROFILE }, origin);
        return r.error ? withSummary(r.conflict ? 409 : 400, r, { error: r.error }) : withSummary(200, r, { info: r.info });
      }
      if (path === '/api/profile/rewards' && method === 'GET') return json(200, { rewards: await profiles.store.listRewards(account.id, 20) }, origin);
      if (path === '/api/profile' && method === 'PUT') {
        const body = await readJson(request);
        const r = await profiles.importSave(account.id, typeof body.text === 'string' ? body.text : body.save, Number.isInteger(body.version) ? body.version : undefined);
        return r.error ? json(r.conflict != null ? 409 : 400, { error: r.error, version: r.conflict }, origin) : json(200, { profile: r.save, version: r.version }, origin);
      }
      return json(404, { error: 'Ruta desconocida' }, origin);
    } catch (e) {
      if (e.status) return json(e.status, { error: e.message }, origin);   // errores de validación / AuthError
      (log || console).error('http.error', e); return json(500, { error: 'Error interno' }, origin);
    }
  }

  /** Adaptador node:http → devuelve true si atendió la petición. */
  async function node(req, res) {
    if (!(req.url || '').startsWith('/api/')) return false;
    const chunks = []; let size = 0;
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
      await new Promise((ok, fail) => { req.on('data', c => { size += c.length; if (size <= MAX_BODY + 1) chunks.push(c); }); req.on('end', ok); req.on('error', fail); });
    }
    if (size > MAX_BODY) { res.writeHead(413, { 'content-type': 'application/json; charset=utf-8' }); res.end(JSON.stringify({ error: 'La petición es demasiado grande' })); return true; }
    const headers = new Headers(); for (const [k, v] of Object.entries(req.headers)) if (v != null) headers.set(k, Array.isArray(v) ? v.join(', ') : v);
    headers.delete('content-length');
    const request = new Request(`http://${req.headers.host || 'localhost'}${req.url}`, { method: req.method, headers, body: chunks.length ? Buffer.concat(chunks) : undefined });
    const response = await web(request, req.socket.remoteAddress || '?');
    res.writeHead(response.status, Object.fromEntries(response.headers));
    res.end(Buffer.from(await response.arrayBuffer()));
    return true;
  }
  node.web = web;
  return node;
}
