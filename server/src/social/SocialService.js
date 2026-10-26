/**
 * Amigos y bloqueos (reglas en el servidor; la base de datos solo guarda).
 *  - Cada cuenta tiene un código de amigo de 6 caracteres («Ana#K7P2QX»). Con él se envía la solicitud:
 *    no hace falta conocer el usuario ni el correo de nadie.
 *  - Solicitud → el otro la acepta o la rechaza. Si los dos se la envían, queda aceptada.
 *  - Bloquear a alguien borra la amistad y le impide enviarte solicitudes, invitarte o hablarte.
 *    Quien está bloqueado no lo sabe: recibe el mismo mensaje que si el código no existiera.
 *  - Límites: FRIENDS_MAX amigos, PENDING_MAX solicitudes enviadas sin responder y 20 solicitudes por hora.
 * Cada cambio se avisa con onChange(ids) para que el hub mande la lista nueva a quien esté conectado.
 */
import { randomInt } from 'node:crypto';
import { FRIEND_ALPHABET, FRIEND_CODE_LENGTH, FRIENDS_MAX, PENDING_MAX, normalizeFriendCode, isFriendCode } from '../../../shared/social.js';
import { DuplicateFriendCode } from '../persistence/ProfileStore.js';

export class SocialError extends Error { constructor(status, message) { super(message); this.status = status; } }
const NOT_FOUND = 'No hay nadie con ese código de amigo. Revisa que esté bien escrito (6 caracteres, p. ej. Ana#K7P2QX).';

export class SocialService {
  constructor({ store, log = null }) {
    this.store = store; this.log = log; this.listeners = new Set(); this.hits = new Map();
    this.presence = () => ({ online: false, where: 'menu' });     // lo sustituye el hub
  }
  onChange(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  emit(ids) { for (const fn of this.listeners) try { fn(ids); } catch (e) { (this.log || console).error('social.listener', e); } }

  /** Código de amigo de la cuenta (se crea la primera vez). */
  async code(accountId) {
    const cur = await this.store.getFriendCode(accountId); if (cur) return cur;
    for (let k = 0; k < 50; k++) {
      let c = ''; for (let i = 0; i < FRIEND_CODE_LENGTH; i++) c += FRIEND_ALPHABET[randomInt(FRIEND_ALPHABET.length)];
      try { return await this.store.setFriendCode(accountId, c); } catch (e) { if (!(e instanceof DuplicateFriendCode)) throw e; }
    }
    throw new Error('No se pudo generar un código de amigo libre');
  }
  async who(id) { const a = await this.store.getAccount(id); return a ? { id: a.id, name: a.name } : { id, name: '¿?' }; }

  /** Todo lo que ve la cuenta en su lista: amigos (con su estado), solicitudes recibidas y enviadas, y bloqueados. */
  async view(accountId) {
    const rows = await this.store.listFriendships(accountId), blocked = await this.store.listBlocks(accountId);
    const out = { friends: [], incoming: [], outgoing: [], blocked: [] };
    for (const r of rows) {
      const w = await this.who(r.other);
      if (r.status === 'accepted') {
        const prof = await this.store.getProfile(r.other).catch(() => null), sv = prof && prof.save;
        out.friends.push(Object.assign(w, { code: await this.store.getFriendCode(r.other), species: sv ? sv.species : null, level: sv && sv.prog ? sv.prog.level : null }, this.presence(r.other)));
      }
      else (r.requester === accountId ? out.outgoing : out.incoming).push(w);
    }
    for (const id of blocked) out.blocked.push(await this.who(id));
    const byName = (a, b) => (b.online - a.online) || a.name.localeCompare(b.name, 'es');
    out.friends.sort(byName);
    return out;
  }
  async friendIds(accountId) { return (await this.store.listFriendships(accountId)).filter(r => r.status === 'accepted').map(r => r.other); }
  async areFriends(x, y) { const f = await this.store.getFriendship(x, y); return !!(f && f.status === 'accepted'); }
  async blocked(x, y) { return this.store.isBlocked(x, y); }

  rate(accountId) {
    const t = Date.now(), h = (this.hits.get(accountId) || []).filter(x => t - x < 3600000);
    if (h.length >= 20) throw new SocialError(429, 'Has enviado muchas solicitudes. Espera un rato.');
    h.push(t); this.hits.set(accountId, h);
  }
  /** Enviar solicitud de amistad con un código. Devuelve { status: 'pending'|'accepted', friend }. */
  async request(accountId, rawCode) {
    const code = normalizeFriendCode(rawCode);
    if (!isFriendCode(code)) throw new SocialError(400, NOT_FOUND);
    const target = await this.store.accountByFriendCode(code);
    if (!target) throw new SocialError(404, NOT_FOUND);
    if (target.id === accountId) throw new SocialError(400, 'Ese es tu propio código.');
    if (await this.store.isBlocked(accountId, target.id)) {
      // Si TÚ le bloqueaste, se te dice; si te bloqueó él, el mismo mensaje que un código inexistente
      if ((await this.store.listBlocks(accountId)).includes(target.id)) throw new SocialError(409, `Tienes bloqueado a ${target.name}. Desbloquéalo antes.`);
      throw new SocialError(404, NOT_FOUND);
    }
    const f = await this.store.getFriendship(accountId, target.id), friend = { id: target.id, name: target.name };
    if (f && f.status === 'accepted') throw new SocialError(409, `${target.name} ya es tu amigo.`);
    if (f && f.requester === accountId) return { status: 'pending', friend };        // ya se la habías enviado
    if (f) {                                                                          // él ya te la había enviado: aceptada
      await this.accept(accountId, target.id); return { status: 'accepted', friend };
    }
    this.rate(accountId);
    const mine = await this.store.listFriendships(accountId);
    if (mine.filter(r => r.status === 'accepted').length >= FRIENDS_MAX) throw new SocialError(409, `Ya tienes ${FRIENDS_MAX} amigos (el máximo).`);
    if (mine.filter(r => r.status === 'pending' && r.requester === accountId).length >= PENDING_MAX) throw new SocialError(409, 'Tienes demasiadas solicitudes sin responder. Espera a que te contesten o cancela alguna.');
    if ((await this.store.listFriendships(target.id)).filter(r => r.status === 'accepted').length >= FRIENDS_MAX) throw new SocialError(409, `${target.name} ya tiene el máximo de amigos.`);
    await this.store.putFriendship(accountId, target.id, { requester: accountId, status: 'pending' });
    this.log && this.log.info('social.request', { from: accountId.slice(0, 6), to: target.id.slice(0, 6) });
    this.emit([accountId, target.id]);
    return { status: 'pending', friend };
  }
  /** Aceptar o rechazar una solicitud RECIBIDA. */
  async respond(accountId, otherId, accept) {
    const f = await this.store.getFriendship(accountId, otherId);
    if (!f || f.status !== 'pending' || f.requester === accountId) throw new SocialError(404, 'Esa solicitud ya no existe.');
    if (accept) return this.accept(accountId, otherId);
    await this.store.deleteFriendship(accountId, otherId); this.emit([accountId, otherId]);
    return { status: 'declined' };
  }
  async accept(accountId, otherId) {
    const mine = (await this.store.listFriendships(accountId)).filter(r => r.status === 'accepted').length;
    if (mine >= FRIENDS_MAX) throw new SocialError(409, `Ya tienes ${FRIENDS_MAX} amigos (el máximo).`);
    const f = await this.store.getFriendship(accountId, otherId);
    await this.store.putFriendship(accountId, otherId, { requester: f ? f.requester : otherId, status: 'accepted' });
    this.emit([accountId, otherId]);
    return { status: 'accepted', friend: await this.who(otherId) };
  }
  /** Borrar a un amigo, o cancelar una solicitud (enviada o recibida). */
  async remove(accountId, otherId) {
    const f = await this.store.getFriendship(accountId, otherId);
    if (!f) throw new SocialError(404, 'No es tu amigo.');
    await this.store.deleteFriendship(accountId, otherId); this.emit([accountId, otherId]);
    return { status: 'removed' };
  }
  async block(accountId, otherId) {
    if (otherId === accountId || !(await this.store.getAccount(otherId))) throw new SocialError(400, 'Cuenta no válida.');
    await this.store.addBlock(accountId, otherId);
    if (await this.store.getFriendship(accountId, otherId)) await this.store.deleteFriendship(accountId, otherId);
    this.log && this.log.info('social.block', { by: accountId.slice(0, 6), target: otherId.slice(0, 6) });
    this.emit([accountId, otherId]);
    return { status: 'blocked' };
  }
  async unblock(accountId, otherId) { await this.store.removeBlock(accountId, otherId); this.emit([accountId]); return { status: 'unblocked' }; }
}
