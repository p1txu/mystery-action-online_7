/**
 * Base de datos SQLite en un archivo (módulo `node:sqlite` incluido en Node ≥ 22.13, sin
 * dependencias). Es el almacén por defecto: persistente, con transacciones y claves únicas.
 * Para varios procesos de servidor a la vez, usa PostgresProfileStore.
 */
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { VersionConflict, DuplicateUsername, DuplicateFriendCode, pairKey } from './ProfileStore.js';

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
create table if not exists friend_codes (account_id text primary key references accounts(id) on delete cascade, code text not null unique);
create table if not exists friendships (
  a text not null references accounts(id) on delete cascade, b text not null references accounts(id) on delete cascade,
  requester text not null, status text not null check (status in ('pending', 'accepted')), created_at text not null,
  primary key (a, b), check (a < b));
create index if not exists friendships_b on friendships(b);
create table if not exists blocks (owner text not null references accounts(id) on delete cascade, target text not null references accounts(id) on delete cascade, created_at text not null, primary key (owner, target));
create index if not exists blocks_target on blocks(target);
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
  async listAccountIds() { return this.db.prepare('select id from accounts').all().map(r => r.id); }
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
  async hasEvent(accountId, kind) { return !!this.db.prepare('select 1 from profile_events where account_id = ? and kind = ? limit 1').get(accountId, kind); }
  async getFriendCode(id) { const r = this.db.prepare('select code from friend_codes where account_id = ?').get(id); return r ? r.code : null; }
  async setFriendCode(id, code) {
    try { this.db.prepare('insert into friend_codes (account_id, code) values (?, ?) on conflict(account_id) do update set code = excluded.code').run(id, code); }
    catch (e) { if (/UNIQUE/i.test(e.message)) throw new DuplicateFriendCode(); throw e; }
    return code;
  }
  async accountByFriendCode(code) { const r = this.db.prepare('select account_id from friend_codes where code = ?').get(code); return r ? this.getAccount(r.account_id) : null; }
  async getFriendship(x, y) { const [a, b] = pairKey(x, y), r = this.db.prepare('select * from friendships where a = ? and b = ?').get(a, b); return r ? { a: r.a, b: r.b, requester: r.requester, status: r.status, createdAt: r.created_at } : null; }
  async listFriendships(id) { return this.db.prepare('select * from friendships where a = ? or b = ?').all(id, id).map(r => ({ other: r.a === id ? r.b : r.a, requester: r.requester, status: r.status, createdAt: r.created_at })); }
  async putFriendship(x, y, { requester, status }) {
    const [a, b] = pairKey(x, y);
    this.db.prepare('insert into friendships (a, b, requester, status, created_at) values (?, ?, ?, ?, ?) on conflict(a, b) do update set requester = excluded.requester, status = excluded.status').run(a, b, requester, status, now());
  }
  async deleteFriendship(x, y) { const [a, b] = pairKey(x, y); this.db.prepare('delete from friendships where a = ? and b = ?').run(a, b); }
  async listBlocks(id) { return this.db.prepare('select target from blocks where owner = ?').all(id).map(r => r.target); }
  async addBlock(owner, target) { this.db.prepare('insert into blocks (owner, target, created_at) values (?, ?, ?) on conflict do nothing').run(owner, target, now()); }
  async removeBlock(owner, target) { this.db.prepare('delete from blocks where owner = ? and target = ?').run(owner, target); }
  async isBlocked(x, y) { return !!this.db.prepare('select 1 from blocks where (owner = ? and target = ?) or (owner = ? and target = ?) limit 1').get(x, y, y, x); }
  events(accountId) { return this.db.prepare('select kind, data, version from profile_events where account_id = ? order by id').all(accountId).map(r => ({ kind: r.kind, data: JSON.parse(r.data), version: r.version })); }
  async close() { try { this.db.close(); } catch { /* ya cerrada */ } }
}
