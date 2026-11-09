import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SqliteProfileStore } from '../server/src/persistence/SqliteProfileStore.js';
import { PostgresProfileStore } from '../server/src/persistence/PostgresProfileStore.js';
import { MemoryProfileStore, VersionConflict, DuplicateUsername } from '../server/src/persistence/ProfileStore.js';
import { freshSave } from './helpers.mjs';

const tmpDb = () => join(mkdtempSync(join(tmpdir(), 'ma-db-')), 'test.db');
const acc = (id, extra = {}) => Object.assign({ id, name: 'N', kind: 'guest', tokenVersion: 0, createdAt: new Date().toISOString() }, extra);

// PostgreSQL real si se indica TEST_DATABASE_URL (tests/run-all.sh arranca uno local y desechable)
const PG = process.env.TEST_DATABASE_URL;
const freshPg = async () => { const s = await PostgresProfileStore.connect(PG); await s.pool.query('drop table if exists profile_ops, expedition_members, expeditions, rewards, profiles, profile_events, accounts cascade'); await s.close(); return PostgresProfileStore.connect(PG); };
const STORES = [['SQLite', () => new SqliteProfileStore(tmpDb())], ['memoria', () => new MemoryProfileStore()]].concat(PG ? [['PostgreSQL', freshPg]] : []);
for (const [name, make] of STORES) {
  test(`${name}: cuentas, usuarios únicos sin distinguir mayúsculas y versiones del perfil`, async () => {
    const s = await make();
    await s.createAccount(acc('u_aaaaaaaa01', { kind: 'password', username: 'Ana_1', passHash: 'h' }));
    await assert.rejects(s.createAccount(acc('u_aaaaaaaa02', { username: 'ana_1' })), DuplicateUsername);
    assert.equal((await s.getAccountByUsername('ANA_1')).id, 'u_aaaaaaaa01');
    await s.createAccount(acc('u_aaaaaaaa03'));
    await assert.rejects(s.updateAccount('u_aaaaaaaa03', { username: 'ana_1' }), DuplicateUsername);
    assert.equal((await s.updateAccount('u_aaaaaaaa03', { tokenVersion: 4, name: 'Bea' })).tokenVersion, 4);
    assert.equal((await s.putProfile('u_aaaaaaaa01', freshSave(), { expectedVersion: 0 })).version, 1);
    await assert.rejects(s.putProfile('u_aaaaaaaa01', freshSave(), { expectedVersion: 0 }), VersionConflict);
    const m = await s.mutateProfile('u_aaaaaaaa01', save => { save.bank += 5; return { save, info: 'x' }; });
    assert.equal(m.version, 2); assert.equal((await s.getProfile('u_aaaaaaaa01')).save.bank, freshSave().bank + 5);
    await assert.rejects(s.mutateProfile('u_aaaaaaaa01', save => ({ save }), { expectedVersion: 1 }), VersionConflict);
    await assert.rejects(s.mutateProfile('u_aaaaaaaa01', () => { throw new Error('regla'); }), /regla/);
    assert.equal((await s.getProfile('u_aaaaaaaa01')).version, 2, 'si la regla falla no se escribe nada');
    await s.close();
  });

  test(`${name}: operación con opId: repetirla (también a la vez) no la aplica dos veces`, async () => {
    const s = await make(); await s.createAccount(acc('u_opopopop01')); await s.putProfile('u_opopopop01', freshSave());
    const sell = save => { save.bank += 100; return { save, info: { price: 100 } }; };
    const r1 = await s.mutateProfile('u_opopopop01', sell, { opId: 'op-0000000001', expectedVersion: 1 });
    const r2 = await s.mutateProfile('u_opopopop01', sell, { opId: 'op-0000000001', expectedVersion: 1 });   // reintento tras un corte
    assert.equal(r1.version, 2); assert.equal(r2.duplicate, true); assert.equal(r2.version, 2); assert.deepEqual(r2.info, { price: 100 });
    const both = await Promise.allSettled([s.mutateProfile('u_opopopop01', sell, { opId: 'op-0000000002' }), s.mutateProfile('u_opopopop01', sell, { opId: 'op-0000000002' })]);
    assert.equal(both.filter(x => x.status === 'fulfilled' && !x.value.duplicate).length, 1, 'a la vez: una sola se aplica');
    assert.equal((await s.getProfile('u_opopopop01')).save.bank, freshSave().bank + 200);
    await s.close();
  });

  test(`${name}: expediciones: instantáneas en orden (una antigua no pisa a una nueva), pendientes y sin resultado`, async () => {
    const s = await make(); for (const a of ['u_exexexex01', 'u_exexexex02']) { await s.createAccount(acc(a)); await s.putProfile(a, freshSave()); }
    const M = ['u_exexexex01', 'u_exexexex02'];
    assert.deepEqual(await s.saveExpedition({ id: 'exp-1', dungeon: 'gruta', status: 'active', seq: 1, members: M, state: { step: 0 } }), { saved: true });
    assert.deepEqual(await s.saveExpedition({ id: 'exp-1', dungeon: 'gruta', status: 'active', seq: 3, members: M, state: { step: 2 } }), { saved: true });
    assert.deepEqual(await s.saveExpedition({ id: 'exp-1', dungeon: 'gruta', status: 'active', seq: 2, members: M, state: { step: 1 } }), { saved: false }, 'llega tarde: no se aplica');
    const e = await s.getExpedition('exp-1'); assert.equal(e.seq, 3); assert.deepEqual(e.state, { step: 2 }); assert.equal(e.status, 'active');
    assert.deepEqual((await s.pendingExpeditions('u_exexexex01')).map(x => x.id), ['exp-1']);
    await s.applyReward({ expeditionId: 'exp-1', accountId: 'u_exexexex01', result: 'interrupted', summary: {}, save: freshSave() });
    assert.deepEqual(await s.pendingExpeditions('u_exexexex01'), [], 'con resultado guardado deja de estar pendiente');
    assert.equal((await s.pendingExpeditions('u_exexexex02')).length, 1, 'para el otro sigue pendiente');
    await s.saveExpedition({ id: 'exp-1', dungeon: 'gruta', status: 'ended', seq: 4, members: M, state: { results: {} } });
    assert.deepEqual(await s.unsettledExpeditions('ended'), ['exp-1']);
    await s.applyReward({ expeditionId: 'exp-1', accountId: 'u_exexexex02', result: 'clear', summary: {}, save: freshSave() });
    assert.deepEqual(await s.unsettledExpeditions('ended'), []);
    await s.close();
  });

  test(`${name}: la recompensa de una expedición se aplica UNA sola vez por jugador`, async () => {
    const s = await make();
    await s.createAccount(acc('u_bbbbbbbb01')); await s.createAccount(acc('u_bbbbbbbb02'));
    await s.putProfile('u_bbbbbbbb01', freshSave('guerrero')); await s.putProfile('u_bbbbbbbb02', freshSave('mago'));
    const after = freshSave('guerrero', { bank: 999 });
    const r1 = await s.applyReward({ expeditionId: 'exp-1', accountId: 'u_bbbbbbbb01', result: 'clear', summary: { gems: 949 }, save: after, expectedVersion: 1 });
    const r2 = await s.applyReward({ expeditionId: 'exp-1', accountId: 'u_bbbbbbbb01', result: 'clear', summary: { gems: 949 }, save: freshSave('guerrero', { bank: 5000 }) });
    assert.equal(r1.applied, true); assert.equal(r2.applied, false); assert.equal(r2.version, r1.version);
    assert.equal((await s.getProfile('u_bbbbbbbb01')).save.bank, 999, 'el reintento no cambia nada');
    const other = await s.applyReward({ expeditionId: 'exp-1', accountId: 'u_bbbbbbbb02', result: 'clear', summary: {}, save: freshSave('mago', { bank: 7 }) });
    assert.equal(other.applied, true, 'otro jugador de la misma expedición tiene su propia recompensa');
    assert.equal((await s.getProfile('u_bbbbbbbb02')).save.species, 'mago');
    assert.equal((await s.getReward('exp-1', 'u_bbbbbbbb01')).summary.gems, 949);
    assert.equal((await s.listRewards('u_bbbbbbbb01')).length, 1);
    // A la vez: dos intentos simultáneos de la misma recompensa → solo uno se aplica
    const both = await Promise.all([1, 2].map(() => s.applyReward({ expeditionId: 'exp-2', accountId: 'u_bbbbbbbb02', result: 'return', summary: {}, save: freshSave('mago', { bank: 8 }) })));
    assert.equal(both.filter(x => x.applied).length, 1);
    await s.close();
  });
}

test('SQLite: los datos siguen ahí al cerrar y volver a abrir la base de datos (reinicio del servidor)', async () => {
  const f = tmpDb();
  let s = new SqliteProfileStore(f);
  await s.createAccount(acc('u_cccccccc01', { kind: 'password', username: 'cira', passHash: 'h' }));
  await s.putProfile('u_cccccccc01', freshSave('arquero', { bank: 321 }));
  await s.applyReward({ expeditionId: 'e9', accountId: 'u_cccccccc01', result: 'clear', summary: { exp: 10 }, save: freshSave('arquero', { bank: 400 }) });
  await s.logEvent('u_cccccccc01', 'op:buy', { id: 'pocion' }, 2);
  await s.close();
  s = new SqliteProfileStore(f);
  assert.equal((await s.getAccountByUsername('CIRA')).id, 'u_cccccccc01');
  const p = await s.getProfile('u_cccccccc01');
  assert.equal(p.save.bank, 400); assert.equal(p.version, 2); assert.equal(p.origin, 'expedition');
  assert.equal((await s.applyReward({ expeditionId: 'e9', accountId: 'u_cccccccc01', result: 'clear', summary: {}, save: freshSave('arquero', { bank: 1 }) })).applied, false);
  assert.deepEqual(s.events('u_cccccccc01').map(e => e.kind), ['op:buy']);
  await s.close();
});
