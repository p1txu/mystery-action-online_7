/**
 * Registro en memoria de grupos privados: código de invitación → sala, ocupación y fase,
 * y qué cuenta está en qué sala. Válido para un único proceso; con varios procesos hay que
 * llevarlo a un almacén común (p. ej. Redis mediante el «presence» de Colyseus).
 */
import { randomInt } from 'node:crypto';
import { CODE_ALPHABET, CODE_LENGTH, MAX_PLAYERS } from '../../../shared/protocol.js';

export class RoomRegistry {
  constructor() { this.codes = new Map(); this.busy = new Map(); this.rooms = new Map(); }
  /** Salas vivas de este proceso (para recuperar el sitio de una cuenta desde la API). */
  attach(roomId, room) { this.rooms.set(roomId, room); }
  detach(roomId) { this.rooms.delete(roomId); }
  roomFor(accountId) { const id = this.busy.get(accountId); return id ? this.rooms.get(id) || null : null; }
  /** Código único entre las salas existentes (abiertas o en juego). */
  newCode(roomId) {
    for (let k = 0; k < 100; k++) {
      let c = ''; for (let i = 0; i < CODE_LENGTH; i++) c += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
      if (!this.codes.has(c)) { this.codes.set(c, { roomId, at: Date.now(), phase: 'lobby', players: 0, max: MAX_PLAYERS }); return c; }
    }
    throw new Error('No se pudo generar un código libre');
  }
  /** Información pública de un código: { roomId, phase, players, max } o null si no existe. */
  info(code) { const r = this.codes.get(code); return r ? Object.assign({ code }, r) : null; }
  /** roomId solo si se puede entrar (existe, en sala de espera y con plaza). */
  lookup(code) { const r = this.codes.get(code); return r && r.phase === 'lobby' && r.players < r.max ? r.roomId : null; }
  update(code, patch) { const r = this.codes.get(code); if (r) Object.assign(r, patch); }
  close(code) { this.update(code, { phase: 'playing' }); }   // la expedición empezó: no entra nadie más
  release(code) { this.codes.delete(code); }
  /** Una cuenta solo puede estar en una sala a la vez. */
  claim(accountId, roomId) { const cur = this.busy.get(accountId); if (cur && cur !== roomId) return false; this.busy.set(accountId, roomId); return true; }
  free(accountId, roomId) { if (this.busy.get(accountId) === roomId) this.busy.delete(accountId); }
  roomOf(accountId) { return this.busy.get(accountId) || null; }
}
