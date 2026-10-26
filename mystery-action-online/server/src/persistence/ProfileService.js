/**
 * Perfil personal de cada jugador: lectura, ficha, creación, cambios validados (rules.js)
 * y aplicación idempotente de las recompensas de una expedición.
 * Ningún dato del perfil llega «tal cual» del cliente (salvo la importación de desarrollo,
 * desactivada por defecto y prohibida en producción).
 */
import { createEngineCore } from '../../../shared/engine-core.generated.js';
import { VersionConflict } from './ProfileStore.js';
import { log, shortId } from '../log.js';
import { applyOp, RuleError } from '../profile/rules.js';

export class ProfileService {
  constructor({ store, registry, allowImport = false, random = Math.random }) { this.store = store; this.registry = registry; this.allowImport = allowImport; this.random = random; this.E = createEngineCore(); }
  async get(accountId) { return this.store.getProfile(accountId); }
  envelope(save) { return this.E.Save.envelope(save); }

  /** Ficha del perfil: lo que pertenece a ese jugador y a nadie más. */
  summary(accountId, rec) {
    const E = this.E, s = rec.save, f = E.FORMS[s.species], pr = s.prog, rank = E.rankOf(s.points);
    const line = (s.prog.evolutions[0] && s.prog.evolutions[0].from) || s.species;
    return {
      userId: accountId, version: rec.version, updatedAt: rec.updatedAt,
      creature: { species: s.species, name: f.name, type: f.typeId, line, lineName: E.FORMS[line].name, evolutions: pr.evolutions },
      level: pr.level, exp: pr.exp, expToNext: pr.level >= E.MAX_LEVEL ? 0 : E.expNeed(pr.level),
      stats: E.finalStats(f.base, pr.level, s.equip, null),
      moves: { known: pr.known, equipped: pr.equipped },
      inventory: s.inv, equipment: s.equip, coins: s.bank,
      companions: s.team.map(m => ({ uid: m.uid, kind: m.kind, name: m.name, level: m.level, exp: m.exp, active: m.active, fainted: m.fainted })),
      missions: { active: s.jobs, board: s.board.length, delivered: s.delivered || 0 },
      progress: { points: s.points, rank: rank.name, cleared: s.cleared, runs: s.runs || 0, bagSlots: rank.bag },
    };
  }
  /** Perfil nuevo con una de las especies iniciales (solo si aún no tiene). */
  async createFresh(accountId, speciesId) {
    if (!this.E.SPECIES.some(s => s.id === speciesId)) return { error: 'Especie inicial no válida' };
    if (await this.store.getProfile(accountId)) return { error: 'Ya tienes un perfil' };
    const save = this.E.Save.sanitize(this.E.Save.fresh(speciesId)).data;
    save.board = this.E.Jobs.board(save, save.boardSeed);
    try { const { version } = await this.store.putProfile(accountId, save, { expectedVersion: 0, origin: 'new' }); await this.store.logEvent(accountId, 'new', { species: speciesId }, version); return { save, version }; }
    catch (e) { if (e instanceof VersionConflict) return { error: 'Ya tienes un perfil' }; throw e; }
  }
  /** SOLO desarrollo (ALLOW_PROFILE_IMPORT=true): sube una partida local. No es seguro. */
  async importSave(accountId, input, expectedVersion) {
    if (!this.allowImport) return { error: 'Este servidor no acepta partidas locales: el progreso online solo se gana jugando online.' };
    if (this.registry.roomOf(accountId)) return { error: 'No puedes cambiar tu perfil mientras estás en un grupo' };
    const res = typeof input === 'string' ? this.E.Save.importText(input) : (r => r.ok ? { save: r.data } : { error: 'La partida no es válida: ' + r.fixes[0] })(this.E.Save.sanitize(input));
    if (!res.save) return { error: res.error };
    try { const { version } = await this.store.putProfile(accountId, res.save, { expectedVersion, origin: 'import' }); await this.store.logEvent(accountId, 'import', {}, version); return { save: res.save, version }; }
    catch (e) { if (e instanceof VersionConflict) return { error: 'El perfil cambió mientras tanto; recárgalo', conflict: e.current }; throw e; }
  }
  /**
   * Operación de la aldea pedida por el jugador (comprar, equipar…). La valida y aplica el servidor
   * en una transacción. Devuelve { save, version, info } o { error, save, version } con el perfil actual.
   */
  async op(accountId, op, args, expectedVersion) {
    if (this.registry.roomOf(accountId)) return this.fail(accountId, 'No puedes cambiar tu perfil mientras estás en un grupo');
    try {
      const r = await this.store.mutateProfile(accountId, save => applyOp(this.E, save, op, args, this.random), { origin: 'op', expectedVersion });
      await this.store.logEvent(accountId, 'op:' + op, { args, info: r.info }, r.version);
      return { save: r.save, version: r.version, info: r.info };
    } catch (e) {
      if (e instanceof RuleError) return this.fail(accountId, e.message);
      if (e instanceof VersionConflict) return this.fail(accountId, 'Tu perfil ha cambiado en otro dispositivo; se ha actualizado.', true);
      if (e.message === 'Sin perfil') return { error: 'Aún no tienes perfil en el servidor' };
      throw e;
    }
  }
  async fail(accountId, error, conflict = false) { const p = await this.store.getProfile(accountId); return { error, conflict, save: p && p.save, version: p && p.version }; }
  /**
   * Recompensa individual de una expedición. Idempotente: (expeditionId, cuenta) solo se aplica una vez.
   * La cuenta está bloqueada mientras está en el grupo, así que el perfil no cambia entre medias;
   * si aun así cambiara, gana el resultado de la expedición y queda registrado.
   */
  async applyResult({ expeditionId, accountId, result, summary, save, expectedVersion }) {
    const clean = this.E.Save.sanitize(save); if (!clean.ok) throw new Error('Resultado de expedición no válido: ' + clean.fixes[0]);
    let r;
    try { r = await this.store.applyReward({ expeditionId, accountId, result, summary, save: clean.data, expectedVersion }); }
    catch (e) {
      if (!(e instanceof VersionConflict)) throw e;
      log.warn('profile.changed_during_expedition', { account: shortId(accountId), expedition: expeditionId, version: e.current });
      r = await this.store.applyReward({ expeditionId, accountId, result, summary, save: clean.data });
    }
    if (r.applied) await this.store.logEvent(accountId, 'expedition:' + result, { expeditionId, summary }, r.version);
    return r;
  }
}
