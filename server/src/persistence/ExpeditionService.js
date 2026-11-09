/**
 * Estado de las expediciones en la base de datos (0.42), aparte del perfil de cada jugador.
 *
 *  - En cada PUNTO SEGURO (llegar a un piso, vencer a un jefe o minijefe, cumplir un objetivo, cierre ordenado
 *    del servidor) la sala guarda `Expedition.snapshot()` en la tabla `expeditions`. El piso no se guarda
 *    entero: se regenera con la semilla y se le aplican los cambios (cofres, enemigos vencidos, puertas…).
 *  - Mientras una cuenta tiene una expedición sin resultado guardado («pendiente»), su perfil no admite
 *    cambios de la aldea: lo que lleva encima en esa expedición es una copia que se guardará al cerrarla.
 *  - Una expedición pendiente se puede: continuar (la MISMA: mismo id, así que sus recompensas siguen siendo
 *    únicas), cerrar conservando lo conseguido hasta el último punto seguro, o caducar (TTL, se cierra sola).
 *  - Al terminar, los resultados de todos se escriben primero en la expedición (status «ended») y después
 *    en cada perfil. Si el servidor cae entre medias, al arrancar (o al volver el jugador) se aplican los que
 *    falten. Cada resultado va a `rewards` con la clave (expedición, cuenta): nunca dos veces.
 */
import { log as defaultLog, shortId } from '../log.js';

export const EXPEDITION_TTL_MS = 7 * 864e5;   // una expedición interrumpida se puede continuar durante 7 días

export class ExpeditionService {
  /** isLive(id): ¿la lleva ahora una sala de este proceso? Entonces la cierra la sala (con su resultado real), no esto. */
  constructor({ store, profiles, ttlMs = EXPEDITION_TTL_MS, log = defaultLog, isLive = () => false }) { this.store = store; this.profiles = profiles; this.ttlMs = ttlMs; this.log = log; this.isLive = isLive; }

  /** Guarda una instantánea (o el cierre con los resultados). `seq` creciente por expedición. → { saved } */
  async save({ id, dungeon, status = 'active', seq, members, state }) {
    return this.store.saveExpedition({ id, dungeon, status, seq, members, state });
  }
  async get(id) { return this.store.getExpedition(id); }

  /**
   * Expedición pendiente de la cuenta (la más reciente) o null. Por el camino resuelve lo que ya se puede
   * resolver: resultados finales sin aplicar (servidor caído al guardar) y expediciones caducadas.
   */
  async pendingFor(accountId) {
    for (const e of await this.store.pendingExpeditions(accountId)) {
      if (this.isLive(e.id)) continue;                                   // en curso en una sala de este proceso
      if (e.status === 'ended') { await this.close(accountId, e.id, 'recovered'); continue; }
      if (Date.now() - Date.parse(e.updatedAt) > this.ttlMs) { await this.close(accountId, e.id, 'expired'); continue; }
      const full = await this.store.getExpedition(e.id), st = full && full.state;
      if (!st || !st.members.some(m => m.accountId === accountId && !m.left)) { await this.close(accountId, e.id, 'invalid'); continue; }
      return { id: e.id, dungeon: e.dungeon, status: e.status, label: st.label || '', step: st.step, savedAt: e.updatedAt, reason: st.reason,
        members: st.members.filter(m => !m.left).map(m => ({ accountId: m.accountId, name: m.name })) };
    }
    return null;
  }

  /**
   * Cierra la expedición para ESA cuenta: aplica su resultado (el final si la expedición terminó; si no, el
   * «interrumpida» del último punto seguro). Idempotente: si ya tenía resultado, no hace nada.
   * → { applied, result, version } | null
   */
  async close(accountId, expeditionId, why = 'closed') {
    if (this.isLive(expeditionId)) return { applied: false, live: true };   // la sala en curso guardará el resultado de verdad
    const e = await this.store.getExpedition(expeditionId); if (!e || !e.state) return null;
    const final = e.status === 'ended' && e.state.results ? e.state.results[accountId] : null;
    const sm = e.state.members.find(m => m.accountId === accountId);
    const r = final || (sm && sm.result);
    if (!r || !r.profile) {   // sin nada que guardar (p. ej. ya se había ido): se anota un cierre vacío para que deje de estar pendiente
      const cur = await this.profiles.get(accountId); if (!cur) return null;
      const saved = await this.profiles.applyResult({ expeditionId, accountId, result: 'interrupted', summary: { closed: why }, save: cur.save });
      return { applied: saved.applied, result: 'interrupted', version: saved.version };
    }
    const saved = await this.profiles.applyResult({ expeditionId, accountId, result: r.result, summary: Object.assign({}, r.summary, { closed: why }), save: r.profile });
    this.log.info('expedition.closed', { account: shortId(accountId), expedition: expeditionId, why, result: r.result, applied: saved.applied });
    return { applied: saved.applied, result: r.result, lines: r.lines, version: saved.version };
  }

  /** Al arrancar: aplica los resultados finales que quedaron sin guardar en algún perfil. → n aplicados */
  async recover() {
    let n = 0;
    for (const id of await this.store.unsettledExpeditions('ended')) {
      const e = await this.store.getExpedition(id);
      for (const m of (e && e.state && e.state.members) || []) {
        if (await this.store.getReward(id, m.accountId)) continue;
        try { const r = await this.close(m.accountId, id, 'recovered'); if (r && r.applied) n++; }
        catch (err) { this.log.error('expedition.recover_failed', { expedition: id, error: err.message }); }
      }
    }
    if (n) this.log.info('expedition.recovered', { results: n });
    return n;
  }
}
