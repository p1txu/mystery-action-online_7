/**
 * Contrato de persistencia (cuentas, perfiles, recompensas y registro de cambios).
 *
 *   createAccount(account)                      account = { id, name, kind, username?, passHash?, tokenVersion, createdAt }
 *   getAccount(id) · getAccountByUsername(u)    → account | null   (el nombre de usuario no distingue mayúsculas)
 *   updateAccount(id, patch)                    → account | null
 *   listAccountIds()                            → [id]   (para cifrar las cuentas antiguas al arrancar)
 *   getProfile(accountId)                       → { save, version, updatedAt, origin } | null
 *   putProfile(accountId, save, { expectedVersion, origin })   → { version } · VersionConflict
 *   mutateProfile(accountId, fn, { origin, expectedVersion })  fn(copiaDeLaPartida) → { save, ...info } (o lanza);
 *                                               se aplica de forma atómica sobre la versión leída → { version, ...info }
 *   applyReward({ expeditionId, accountId, result, summary, save, expectedVersion })
 *                                               → { applied, version, reward }  · IDEMPOTENTE: la misma pareja
 *                                               (expedición, cuenta) solo se aplica una vez; repetir devuelve la guardada
 *   getReward(expeditionId, accountId) · listRewards(accountId, limit)
 *   logEvent(accountId, kind, data, version)    registro de auditoría de cambios del perfil
 *   hasEvent(accountId, kind)                   → bool   (p. ej. si ya importó su partida local)
 *   Amigos (ver server/src/social/SocialService.js):
 *   getFriendCode(id) · setFriendCode(id, code) (DuplicateFriendCode) · accountByFriendCode(code)
 *   getFriendship(x, y) → { a, b, requester, status, createdAt } | null   (el orden de x, y da igual)
 *   listFriendships(id) → [{ other, requester, status, createdAt }]
 *   putFriendship(x, y, { requester, status }) · deleteFriendship(x, y)
 *   listBlocks(id) → [targetId] · addBlock(owner, target) · removeBlock(owner, target)
 *   isBlocked(x, y) → bool   (en cualquiera de los dos sentidos)
 *   close()
 *
 * `save` es siempre una partida validada con Save.sanitize (formato del prototipo, SAVE_VERSION).
 */
export class VersionConflict extends Error {
  constructor(current) { super('El perfil ha cambiado (versión ' + current + ')'); this.name = 'VersionConflict'; this.current = current; }
}
export class DuplicateUsername extends Error { constructor() { super('Ese nombre de usuario ya existe'); this.name = 'DuplicateUsername'; } }
export class DuplicateFriendCode extends Error { constructor() { super('Código de amigo repetido'); this.name = 'DuplicateFriendCode'; } }
/** Clave de una pareja de cuentas sin orden. */
export const pairKey = (x, y) => x < y ? [x, y] : [y, x];

const clone = v => v == null ? v : structuredClone(v);
const now = () => new Date().toISOString();

/** Implementación en memoria: SOLO para pruebas (no persiste nada). */
export class MemoryProfileStore {
  constructor() { this.accounts = new Map(); this.profiles = new Map(); this.rewards = new Map(); this.events = []; this.codes = new Map(); this.friends = new Map(); this.blocks = new Set(); }
  async createAccount(a) {
    if (this.accounts.has(a.id)) throw new Error('La cuenta ya existe');
    if (a.username && await this.getAccountByUsername(a.username)) throw new DuplicateUsername();
    this.accounts.set(a.id, Object.assign({ tokenVersion: 0, username: null, passHash: null }, clone(a))); return clone(this.accounts.get(a.id));
  }
  async getAccount(id) { return clone(this.accounts.get(id) || null); }
  async listAccountIds() { return [...this.accounts.keys()]; }
  async getAccountByUsername(u) { const l = String(u || '').toLowerCase(); for (const a of this.accounts.values()) if (a.username && a.username.toLowerCase() === l) return clone(a); return null; }
  async updateAccount(id, patch) {
    const a = this.accounts.get(id); if (!a) return null;
    if (patch.username) { const o = await this.getAccountByUsername(patch.username); if (o && o.id !== id) throw new DuplicateUsername(); }
    Object.assign(a, clone(patch)); return clone(a);
  }
  async getProfile(id) { return clone(this.profiles.get(id) || null); }
  async putProfile(id, save, { expectedVersion, origin = 'online' } = {}) {
    const cur = this.profiles.get(id), v = cur ? cur.version : 0;
    if (expectedVersion != null && expectedVersion !== v) throw new VersionConflict(v);
    this.profiles.set(id, { save: clone(save), version: v + 1, updatedAt: now(), origin }); return { version: v + 1 };
  }
  async mutateProfile(id, fn, { origin = 'online', expectedVersion } = {}) {
    const cur = this.profiles.get(id); if (!cur) throw new Error('Sin perfil');
    if (expectedVersion != null && expectedVersion !== cur.version) throw new VersionConflict(cur.version);
    const out = fn(clone(cur.save));               // síncrono: nadie más escribe entre medias
    const v = cur.version + 1;
    this.profiles.set(id, { save: clone(out.save), version: v, updatedAt: now(), origin });
    return Object.assign({}, out, { version: v });
  }
  async applyReward({ expeditionId, accountId, result, summary, save, expectedVersion }) {
    const key = expeditionId + '|' + accountId, prev = this.rewards.get(key);
    if (prev) return { applied: false, version: prev.profileVersion, reward: clone(prev) };
    const cur = this.profiles.get(accountId), v = cur ? cur.version : 0;
    if (expectedVersion != null && expectedVersion !== v) throw new VersionConflict(v);
    this.profiles.set(accountId, { save: clone(save), version: v + 1, updatedAt: now(), origin: 'expedition' });
    const reward = { expeditionId, accountId, result, summary: clone(summary), profileVersion: v + 1, createdAt: now() };
    this.rewards.set(key, reward);
    return { applied: true, version: v + 1, reward: clone(reward) };
  }
  async getReward(e, a) { return clone(this.rewards.get(e + '|' + a) || null); }
  async listRewards(a, limit = 20) { return [...this.rewards.values()].filter(r => r.accountId === a).slice(-limit).reverse().map(clone); }
  async logEvent(accountId, kind, data, version = null) { this.events.push({ accountId, kind, data: clone(data), version, createdAt: now() }); }
  async hasEvent(accountId, kind) { return this.events.some(e => e.accountId === accountId && e.kind === kind); }
  async getFriendCode(id) { return this.codes.get(id) || null; }
  async setFriendCode(id, code) { for (const [k, v] of this.codes) if (v === code && k !== id) throw new DuplicateFriendCode(); this.codes.set(id, code); return code; }
  async accountByFriendCode(code) { for (const [k, v] of this.codes) if (v === code) return this.getAccount(k); return null; }
  async getFriendship(x, y) { const [a, b] = pairKey(x, y), f = this.friends.get(a + '|' + b); return f ? clone(f) : null; }
  async listFriendships(id) { return [...this.friends.values()].filter(f => f.a === id || f.b === id).map(f => ({ other: f.a === id ? f.b : f.a, requester: f.requester, status: f.status, createdAt: f.createdAt })); }
  async putFriendship(x, y, { requester, status }) { const [a, b] = pairKey(x, y), k = a + '|' + b, cur = this.friends.get(k); this.friends.set(k, { a, b, requester, status, createdAt: cur ? cur.createdAt : now() }); }
  async deleteFriendship(x, y) { const [a, b] = pairKey(x, y); this.friends.delete(a + '|' + b); }
  async listBlocks(id) { return [...this.blocks].filter(k => k.startsWith(id + '|')).map(k => k.slice(id.length + 1)); }
  async addBlock(owner, target) { this.blocks.add(owner + '|' + target); }
  async removeBlock(owner, target) { this.blocks.delete(owner + '|' + target); }
  async isBlocked(x, y) { return this.blocks.has(x + '|' + y) || this.blocks.has(y + '|' + x); }
  async close() {}
}
