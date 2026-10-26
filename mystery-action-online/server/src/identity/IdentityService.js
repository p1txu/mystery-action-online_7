/**
 * Cuentas de jugador.
 *  - Invitado: sin contraseña; el token solo vive en ese navegador (sirve para probar).
 *  - Cuenta con usuario y contraseña: necesaria para usar el MISMO perfil en otros dispositivos.
 *    Un invitado puede convertirse en cuenta conservando su identificador y su perfil.
 * Tokens firmados (HMAC) con la versión de sesión de la cuenta: «cerrar sesión en todos los
 * dispositivos» la incrementa y anula todos los tokens anteriores.
 */
import { randomBytes } from 'node:crypto';
import { issueToken, verifyToken } from './tokens.js';
import { hashPassword, verifyPassword, passwordProblem, usernameProblem } from './passwords.js';
import { DuplicateUsername } from '../persistence/ProfileStore.js';

export function cleanName(name) {
  const s = typeof name === 'string' ? name.normalize('NFC').replace(/[\u0000-\u001f\u007f<>]/g, '').trim().slice(0, 20) : '';
  return s || 'Explorador';
}
export class AuthError extends Error { constructor(status, message) { super(message); this.status = status; } }
const pub = a => ({ id: a.id, name: a.name, kind: a.kind, username: a.username || null, createdAt: a.createdAt });

export class IdentityService {
  constructor({ secret, store, ttlHours = 720 }) { this.secret = secret; this.store = store; this.ttl = ttlHours * 3600; this.fails = new Map(); }
  token(a) { return issueToken(this.secret, { sub: a.id, kind: a.kind, tv: a.tokenVersion || 0 }, this.ttl); }
  newId() { return 'u_' + randomBytes(12).toString('base64url'); }

  async createGuest(name) {
    const a = await this.store.createAccount({ id: this.newId(), name: cleanName(name), kind: 'guest', tokenVersion: 0, createdAt: new Date().toISOString() });
    return { account: pub(a), token: this.token(a) };
  }
  async register(username, password, name) {
    const bad = usernameProblem(username) || passwordProblem(password, username); if (bad) throw new AuthError(400, bad);
    const passHash = await hashPassword(password);
    try {
      const a = await this.store.createAccount({ id: this.newId(), name: cleanName(name || username), kind: 'password', username, passHash, tokenVersion: 0, createdAt: new Date().toISOString() });
      return { account: pub(a), token: this.token(a) };
    } catch (e) { if (e instanceof DuplicateUsername) throw new AuthError(409, 'Ese nombre de usuario ya está en uso.'); throw e; }
  }
  /** Un invitado pasa a tener usuario y contraseña; conserva su id y su perfil. */
  async upgrade(accountId, username, password) {
    const a = await this.store.getAccount(accountId); if (!a) throw new AuthError(401, 'Sesión no válida');
    if (a.kind !== 'guest') throw new AuthError(409, 'Esta cuenta ya tiene usuario y contraseña.');
    const bad = usernameProblem(username) || passwordProblem(password, username); if (bad) throw new AuthError(400, bad);
    try {
      const u = await this.store.updateAccount(accountId, { kind: 'password', username, passHash: await hashPassword(password), tokenVersion: (a.tokenVersion || 0) + 1 });
      return { account: pub(u), token: this.token(u) };     // el token de invitado anterior deja de valer
    } catch (e) { if (e instanceof DuplicateUsername) throw new AuthError(409, 'Ese nombre de usuario ya está en uso.'); throw e; }
  }
  /** Inicio de sesión con límite de intentos fallidos (por usuario y por dirección). */
  async login(username, password, ip = '?') {
    const keys = ['u:' + String(username).toLowerCase(), 'ip:' + ip], t = Date.now();
    for (const k of keys) { const f = (this.fails.get(k) || []).filter(x => t - x < 15 * 60000); this.fails.set(k, f); if (f.length >= (k.startsWith('u:') ? 8 : 30)) throw new AuthError(429, 'Demasiados intentos fallidos. Espera unos minutos.'); }
    const a = typeof username === 'string' ? await this.store.getAccountByUsername(username) : null;
    const ok = a && a.passHash ? await verifyPassword(String(password ?? ''), a.passHash) : (await hashPassword('x'), false);   // mismo coste si no existe
    if (!ok) { for (const k of keys) this.fails.get(k).push(t); throw new AuthError(401, 'Usuario o contraseña incorrectos.'); }
    this.fails.delete(keys[0]);
    return { account: pub(a), token: this.token(a) };
  }
  /** Cierra la sesión en todos los dispositivos. */
  async logoutAll(accountId) { const a = await this.store.getAccount(accountId); if (a) await this.store.updateAccount(accountId, { tokenVersion: (a.tokenVersion || 0) + 1 }); }
  /** Cuenta del token, o null si el token no es válido, está revocado o la cuenta no existe. */
  async verify(token) {
    const claims = verifyToken(this.secret, token); if (!claims) return null;
    const a = await this.store.getAccount(claims.sub);
    if (!a || (claims.tv || 0) !== (a.tokenVersion || 0)) return null;
    return pub(a);
  }
  async rename(accountId, name) { return pub(await this.store.updateAccount(accountId, { name: cleanName(name) })); }
}
