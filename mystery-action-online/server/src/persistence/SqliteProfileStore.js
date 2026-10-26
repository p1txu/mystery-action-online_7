/**
 * Base de datos SQLite en un archivo (módulo `node:sqlite` incluido en Node ≥ 22.13, sin
 * dependencias). Es el almacén por defecto: persistente, con transacciones y claves únicas.
 * Para varios procesos de servidor a la vez, usa PostgresProfileStore.
 */
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { VersionConflict, DuplicateUsername } from './ProfileStore.js';

const SCHEMA = `
create table if not exists accounts (
  id text primary key, name text not null, kind text not null default 'guest',
  username text unique collate nocase, pass_hash text, token_version integer not null default 0, created_at text not null);
create table if not exists profiles (
  account_id text primary key references accounts(id) on delete cascade,
  save text not null, version integer not null, origin text not null, updated_at text not null);
create table if not exists rewards (
  expedition_id text not null, account_id text not null references accounts(id) on delete cascade,
  result text not null, summary text not null, profile_version integer not null, created_at text not null,
  primary key (expedition_id, account_id));
create table if not exists profile_events (
  id integer primary key autoincrement, account_id text not null, kind text not null, data text not null,
  version integer, created_at text not null);
create index if not exists profile_events_account on profile_events(account_id, id);
`;
const now = () => new Date().toISOString();
const rowAccount = r => r ? { id: r.id, name: r.name, kind: r.kind, username: r.username, passHash: r.pass_hash, tokenVersion: r.token_version, createdAt: r.created_at } : null;
const rowReward = r => r ? { expeditionId: r.expedition_id, accountId: r.account_id, result: r.result, summary: JSON.parse(r.summary), profileVersion: r.profile_version, createdAt: r.created_at } : null;

export class SqliteProfileStore {
  constructor(file) {
    if (file !== ':memory:') mkdirSync(dirname(file), { recursive: true });
    this.db = new DatabaseSync(file);
    this.db.exec('pragma journal_mode = wal; pragma foreign_keys = on; pragma busy_timeout = 5000; pragma synchronous = normal;');
    this.db.exec(SCHEMA);
    const q = s => this.db.prepare(s);
    this.q = {
      insAcc: q('insert into accounts (id, name, kind, username, pass_hash, token_version, created_at) values (?, ?, ?, ?, ?, ?, ?)'),
      getAcc: q('select * from accounts where id = ?'),
      getUser: q('select * from accounts where username = ? collate nocase'),
      getProf: q('select * from profiles where account_id = ?'),
      upProf: q(`insert into profiles (account_id, save, version, origin, updated_at) values (?, ?, ?, ?, ?)
                 on conflict(account_id) do update set save = excluded.save, version = excluded.version, origin = excluded.origin, updated_at = excluded.updated_at`),
      getRew: q('select * from rewards where expedition_id = ? and account_id = ?'),
      insRew: q('insert into rewards (expedition_id, account_id, result, summary, profile_version, created_at) values (?, ?, ?, ?, ?, ?)'),
      listRew: q('select * from rewards where account_id = ? order by created_at desc limit ?'),
      insEv: q('insert into profile_events (account_id, kind, data, version, created_at) values (?, ?, ?, ?, ?)'),
    };
  }
  /** Transacción con bloqueo de escritura: nada se intercala entre leer y escribir. */
  tx(fn) {
    this.db.exec('begin immediate');
    try { const r = fn(); this.db.exec('commit'); return r; } catch (e) { this.db.exec('rollback'); throw e; }
  }
  async createAccount(a) {
    try { this.q.insAcc.run(a.id, a.name, a.kind || 'guest', a.username || null, a.passHash || null, a.tokenVersion || 0, a.createdAt || now()); }
    catch (e) { if (/UNIQUE.*username/i.test(e.message)) throw new DuplicateUsername(); throw e; }
    return this.getAccount(a.id);
  }
  async getAccount(id) { return rowAccount(this.q.getAcc.get(id)); }
  async getAccountByUsername(u) { return rowAccount(this.q.getUser.get(String(u || ''))); }
  async updateAccount(id, patch) {
    const map = { name: 'name', kind: 'kind', username: 'username', passHash: 'pass_hash', tokenVersion: 'token_version' };
    const keys = Object.keys(patch).filter(k => map[k]);
    if (keys.length) {
      try { this.db.prepare(`update accounts set ${keys.map(k => map[k] + ' = ?').join(', ')} where id = ?`).run(...keys.map(k => patch[k]), id); }
      catch (e) { if (/UNIQUE.*username/i.test(e.message)) throw new DuplicateUsername(); throw e; }
    }
    return this.getAccount(id);
  }
  readProfile(id) { const r = this.q.getProf.get(id); return r ? { save: JSON.parse(r.save), version: r.version, updatedAt: r.updated_at, origin: r.origin } : null; }
  async getProfile(id) { return this.readProfile(id); }
  async putProfile(id, save, { expectedVersion, origin = 'online' } = {}) {
    return this.tx(() => {
      const cur = this.readProfile(id), v = cur ? cur.version : 0;
      if (expectedVersion != null && expectedVersion !== v) throw new VersionConflict(v);
      this.q.upProf.run(id, JSON.stringify(save), v + 1, origin, now());
      return { version: v + 1 };
    });
  }
  async mutateProfile(id, fn, { origin = 'online', expectedVersion } = {}) {
    return this.tx(() => {
      const cur = this.readProfile(id); if (!cur) throw new Error('Sin perfil');
      if (expectedVersion != null && expectedVersion !== cur.version) throw new VersionConflict(cur.version);
      const out = fn(cur.save), v = cur.version + 1;
      this.q.upProf.run(id, JSON.stringify(out.save), v, origin, now());
      return Object.assign({}, out, { version: v });
    });
  }
  async applyReward({ expeditionId, accountId, result, summary, save, expectedVersion }) {
    return this.tx(() => {
      const prev = rowReward(this.q.getRew.get(expeditionId, accountId));
      if (prev) return { applied: false, version: prev.profileVersion, reward: prev };
      const cur = this.readProfile(accountId), v = cur ? cur.version : 0;
      if (expectedVersion != null && expectedVersion !== v) throw new VersionConflict(v);
      this.q.upProf.run(accountId, JSON.stringify(save), v + 1, 'expedition', now());
      const at = now();
      this.q.insRew.run(expeditionId, accountId, result, JSON.stringify(summary || {}), v + 1, at);
      return { applied: true, version: v + 1, reward: { expeditionId, accountId, result, summary, profileVersion: v + 1, createdAt: at } };
    });
  }
  async getReward(e, a) { return rowReward(this.q.getRew.get(e, a)); }
  async listRewards(a, limit = 20) { return this.q.listRew.all(a, limit).map(rowReward); }
  async logEvent(accountId, kind, data, version = null) { this.q.insEv.run(accountId, kind, JSON.stringify(data ?? null), version, now()); }
  events(accountId) { return this.db.prepare('select kind, data, version from profile_events where account_id = ? order by id').all(accountId).map(r => ({ kind: r.kind, data: JSON.parse(r.data), version: r.version })); }
  async close() { try { this.db.close(); } catch { /* ya cerrada */ } }
}
