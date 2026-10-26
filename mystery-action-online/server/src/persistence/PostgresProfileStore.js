/**
 * Perfiles en PostgreSQL (varios procesos de servidor, copias de seguridad, producción).
 * Requiere el paquete `pg` y las tablas de db/migrations/001_init.sql (se aplican al conectar).
 * Mismo contrato que SqliteProfileStore; cada escritura va en una transacción con
 * `select … for update`, y las recompensas usan la clave primaria (expedición, cuenta).
 */
import { readFileSync } from 'node:fs';
import { VersionConflict, DuplicateUsername } from './ProfileStore.js';

const MIGRATION = new URL('../../db/migrations/001_init.sql', import.meta.url);
const acc = r => r ? { id: r.id, name: r.name, kind: r.kind, username: r.username, passHash: r.pass_hash, tokenVersion: r.token_version, createdAt: new Date(r.created_at).toISOString() } : null;
const rew = r => r ? { expeditionId: r.expedition_id, accountId: r.account_id, result: r.result, summary: r.summary, profileVersion: r.profile_version, createdAt: new Date(r.created_at).toISOString() } : null;
const dup = e => { if (e && e.code === '23505' && /username/.test(e.constraint || e.detail || '')) throw new DuplicateUsername(); throw e; };

export class PostgresProfileStore {
  static async connect(url, pgModule) {
    let pg = pgModule;
    if (!pg) { try { pg = (await import('pg')).default; } catch { throw new Error('PROFILE_STORE=postgres necesita el paquete «pg»: npm install pg --workspace server'); } }
    const s = new PostgresProfileStore(); s.pool = new (pg.Pool || pg.default.Pool)({ connectionString: url, max: 10 });
    await s.pool.query(readFileSync(MIGRATION, 'utf8'));
    return s;
  }
  async tx(fn) {
    const c = await this.pool.connect();
    try { await c.query('begin'); const r = await fn(c); await c.query('commit'); return r; }
    catch (e) { await c.query('rollback').catch(() => {}); throw e; } finally { c.release(); }
  }
  async createAccount(a) {
    await this.pool.query('insert into accounts (id, name, kind, username, pass_hash, token_version, created_at) values ($1, $2, $3, $4, $5, $6, $7)',
      [a.id, a.name, a.kind || 'guest', a.username || null, a.passHash || null, a.tokenVersion || 0, a.createdAt || new Date().toISOString()]).catch(dup);
    return this.getAccount(a.id);
  }
  async getAccount(id) { return acc((await this.pool.query('select * from accounts where id = $1', [id])).rows[0]); }
  async getAccountByUsername(u) { return acc((await this.pool.query('select * from accounts where lower(username) = lower($1)', [String(u || '')])).rows[0]); }
  async updateAccount(id, patch) {
    const map = { name: 'name', kind: 'kind', username: 'username', passHash: 'pass_hash', tokenVersion: 'token_version' };
    const keys = Object.keys(patch).filter(k => map[k]);
    if (keys.length) await this.pool.query(`update accounts set ${keys.map((k, i) => `${map[k]} = $${i + 2}`).join(', ')} where id = $1`, [id, ...keys.map(k => patch[k])]).catch(dup);
    return this.getAccount(id);
  }
  async readProfile(c, id, lock = false) {
    const r = (await c.query(`select save, version, updated_at, origin from profiles where account_id = $1${lock ? ' for update' : ''}`, [id])).rows[0];
    return r ? { save: r.save, version: r.version, updatedAt: new Date(r.updated_at).toISOString(), origin: r.origin } : null;
  }
  async write(c, id, save, v, origin) {
    await c.query(`insert into profiles (account_id, save, version, origin, updated_at) values ($1, $2, $3, $4, now())
      on conflict (account_id) do update set save = excluded.save, version = excluded.version, origin = excluded.origin, updated_at = now()`, [id, JSON.stringify(save), v, origin]);
  }
  async getProfile(id) { return this.readProfile(this.pool, id); }
  async putProfile(id, save, { expectedVersion, origin = 'online' } = {}) {
    return this.tx(async c => {
      const cur = await this.readProfile(c, id, true), v = cur ? cur.version : 0;
      if (expectedVersion != null && expectedVersion !== v) throw new VersionConflict(v);
      await this.write(c, id, save, v + 1, origin); return { version: v + 1 };
    });
  }
  async mutateProfile(id, fn, { origin = 'online', expectedVersion } = {}) {
    return this.tx(async c => {
      const cur = await this.readProfile(c, id, true); if (!cur) throw new Error('Sin perfil');
      if (expectedVersion != null && expectedVersion !== cur.version) throw new VersionConflict(cur.version);
      const out = fn(cur.save), v = cur.version + 1;
      await this.write(c, id, out.save, v, origin); return Object.assign({}, out, { version: v });
    });
  }
  async applyReward({ expeditionId, accountId, result, summary, save, expectedVersion }) {
    return this.tx(async c => {
      const cur = await this.readProfile(c, accountId, true);          // bloquea la fila del perfil: serializa a la vez el libro
      const prev = rew((await c.query('select * from rewards where expedition_id = $1 and account_id = $2', [expeditionId, accountId])).rows[0]);
      if (prev) return { applied: false, version: prev.profileVersion, reward: prev };
      const v = cur ? cur.version : 0;
      if (expectedVersion != null && expectedVersion !== v) throw new VersionConflict(v);
      await this.write(c, accountId, save, v + 1, 'expedition');
      const r = (await c.query('insert into rewards (expedition_id, account_id, result, summary, profile_version) values ($1, $2, $3, $4, $5) returning *', [expeditionId, accountId, result, JSON.stringify(summary || {}), v + 1])).rows[0];
      return { applied: true, version: v + 1, reward: rew(r) };
    });
  }
  async getReward(e, a) { return rew((await this.pool.query('select * from rewards where expedition_id = $1 and account_id = $2', [e, a])).rows[0]); }
  async listRewards(a, limit = 20) { return (await this.pool.query('select * from rewards where account_id = $1 order by created_at desc limit $2', [a, limit])).rows.map(rew); }
  async logEvent(accountId, kind, data, version = null) { await this.pool.query('insert into profile_events (account_id, kind, data, version) values ($1, $2, $3, $4)', [accountId, kind, JSON.stringify(data ?? null), version]); }
  async close() { if (this.closed) return; this.closed = true; await this.pool.end(); }
}
