/**
 * Servicios de persistencia (0.42) con la simulación y la base de datos reales (SQLite en disco y memoria):
 *  - migración del perfil al leerlo en el servidor, con el original archivado en el registro;
 *  - un perfil antiguo (criaturas) que se sustituye queda archivado, no se destruye;
 *  - expedición pendiente: bloquea la aldea (no se puede vender lo que la expedición aún tiene), se cierra
 *    conservando lo conseguido hasta el último punto seguro, una sola vez aunque se pida a la vez;
 *  - caducidad; resultados finales que quedaron sin guardar se aplican al arrancar, una vez;
 *  - intento de duplicar oro: vender lo que lleva encima mientras la expedición está pendiente y continuarla.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SqliteProfileStore } from '../server/src/persistence/SqliteProfileStore.js';
import { MemoryProfileStore } from '../server/src/persistence/ProfileStore.js';
import { ProfileService } from '../server/src/persistence/ProfileService.js';
import { ExpeditionService } from '../server/src/persistence/ExpeditionService.js';
import { Expedition } from '../server/src/sim/Expedition.js';
import { E, freshSave, seeded } from './helpers.mjs';

const quiet = { info() {}, warn() {}, error() {} };
const STORES = [['SQLite', () => new SqliteProfileStore(join(mkdtempSync(join(tmpdir(), 'ma-exp-')), 't.db'))], ['memoria', () => new MemoryProfileStore()]];
const registry = { roomOf: () => null };
async function setup(make, ttlMs) {
  const store = make(), profiles = new ProfileService({ store, registry });
  const expeditions = profiles.expeditions = new ExpeditionService({ store, profiles, ttlMs, log: quiet });
  return { store, profiles, expeditions };
}
const acc = id => ({ id, name: id, kind: 'guest', tokenVersion: 0, createdAt: new Date().toISOString() });
const veteran = sp => freshSave(sp, { cleared: ['bosque', 'gruta'], arrived: true, bank: 100 });
/** Expedición real de dos cuentas guardada como lo hace la sala (instantánea en un punto seguro). */
async function savedExpedition(svc, accounts) {
  const x = new Expedition({ dungeonId: 'gruta', seed: 17, random: seeded(3), members: accounts.map((a, i) => ({ id: 's' + i, accountId: a, name: a, profile: veteran(i ? 'mago' : 'guerrero') })) });
  for (const m of x.members.values()) { m.rewards.gems = 40; m.player.bag.add('lagrimaEstelar', 1); }
  const snap = x.snapshot('floor');
  await svc.expeditions.save({ id: x.id, dungeon: 'gruta', status: 'suspended', seq: 1, members: accounts, state: snap });
  return { x, snap };
}

for (const [name, make] of STORES) {
  test(`${name}: migración al leer — el perfil v6 pasa al formato actual y el original queda archivado; una sola vez`, async () => {
    const { store, profiles } = await setup(make);
    await store.createAccount(acc('u_mig')); const v6 = structuredClone(veteran('guerrero')); v6.v = 6; delete v6.codex; delete v6.log; delete v6.story;
    await store.putProfile('u_mig', v6);
    const r = await profiles.get('u_mig');
    assert.equal(r.save.v, E.SAVE_VERSION); assert.equal(r.version, 2); assert.equal(r.save.bank, 100);
    const raw = await store.getProfile('u_mig'); assert.equal(raw.save.v, E.SAVE_VERSION); assert.equal(raw.origin, 'migration');
    const again = await profiles.get('u_mig'); assert.equal(again.version, 2, 'no se vuelve a migrar');
    if (store instanceof MemoryProfileStore) { const ev = store.events.filter(e => e.kind === 'migration'); assert.equal(ev.length, 1); assert.equal(ev[0].data.original.v, 6); assert.equal(ev[0].data.from, 6); }
    else { const row = store.db.prepare("select data from profile_events where kind = 'migration'").get(); assert.equal(JSON.parse(row.data).original.v, 6); }
    store.close && await store.close();
  });

  test(`${name}: un perfil de la versión con criaturas que se sustituye queda archivado en el registro`, async () => {
    const { store, profiles } = await setup(make);
    await store.createAccount(acc('u_old')); await store.putProfile('u_old', { v: 5, species: 'chispa', prog: { level: 12 }, bank: 900 });
    assert.equal(await profiles.get('u_old'), null, 'no compatible: cuenta como sin perfil');
    const r = await profiles.createFresh('u_old', 'mago'); assert.ok(r.save);
    const ev = store instanceof MemoryProfileStore ? store.events.find(e => e.kind === 'reset-legacy').data : JSON.parse(store.db.prepare("select data from profile_events where kind = 'reset-legacy'").get().data);
    assert.equal(ev.original.bank, 900, 'el original se conserva');
    store.close && await store.close();
  });

  test(`${name}: expedición pendiente — la aldea queda bloqueada; cerrarla guarda lo conseguido una sola vez (también a la vez)`, async () => {
    const svc = await setup(make), { store, profiles, expeditions } = svc;
    for (const a of ['u_p1', 'u_p2']) { await store.createAccount(acc(a)); await store.putProfile(a, veteran('guerrero')); }
    const { x } = await savedExpedition(svc, ['u_p1', 'u_p2']);
    const pend = await expeditions.pendingFor('u_p1');
    assert.equal(pend.id, x.id); assert.equal(pend.dungeon, 'gruta'); assert.equal(pend.members.length, 2);
    // Intento de duplicar: vender algo de la mochila mientras la expedición (que también lo tiene) está pendiente
    const before = await store.getProfile('u_p1');
    const op = await profiles.op('u_p1', 'sell', { uid: before.save.inv[0].uid }, before.version);
    assert.match(op.error, /expedición interrumpida/); assert.ok(op.pending);
    assert.equal((await store.getProfile('u_p1')).version, before.version, 'no se ha tocado el perfil');
    // Cerrar dos veces a la vez: una se aplica
    const [c1, c2] = await Promise.all([expeditions.close('u_p1', x.id, 'player'), expeditions.close('u_p1', x.id, 'player')]);
    assert.equal([c1, c2].filter(c => c.applied).length, 1);
    const after = (await store.getProfile('u_p1')).save;
    assert.equal(after.bank, 100 + 40, 'cobra las monedas de la expedición'); assert.ok(after.inv.some(s => s.id === 'lagrimaEstelar'), 'y lo que llevaba');
    assert.ok(after.codex.relics.includes('lagrimaEstelar'));
    assert.equal(await expeditions.pendingFor('u_p1'), null, 'ya no está pendiente');
    assert.equal((await expeditions.close('u_p1', x.id)).applied, false, 'cerrarla otra vez no da nada');
    assert.equal((await store.getProfile('u_p1')).save.bank, 140);
    assert.ok(!(await profiles.op('u_p1', 'arrive', {})).error, 'la aldea vuelve a funcionar');
    assert.ok(await expeditions.pendingFor('u_p2'), 'para su compañero sigue pendiente');
    store.close && await store.close();
  });

  test(`${name}: una expedición pendiente caduca y se cierra sola conservando lo conseguido`, async () => {
    const svc = await setup(make, 1), { store, expeditions } = svc;
    await store.createAccount(acc('u_ttl')); await store.putProfile('u_ttl', veteran('guerrero'));
    await savedExpedition(svc, ['u_ttl']);
    await new Promise(r => setTimeout(r, 20));
    assert.equal(await expeditions.pendingFor('u_ttl'), null);
    assert.equal((await store.getProfile('u_ttl')).save.bank, 140);
    assert.equal((await store.listRewards('u_ttl')).length, 1);
    store.close && await store.close();
  });

  test(`${name}: el servidor cayó mientras guardaba los resultados finales — al arrancar se aplican los que faltan, una vez`, async () => {
    const svc = await setup(make), { store, expeditions } = svc;
    for (const a of ['u_r1', 'u_r2']) { await store.createAccount(acc(a)); await store.putProfile(a, veteran('guerrero')); }
    const { x } = await savedExpedition(svc, ['u_r1', 'u_r2']);
    x.finish('clear');
    const results = {}; for (const m of x.members.values()) results[m.accountId] = x.ended.results.get(m.id);
    await expeditions.save({ id: x.id, dungeon: 'gruta', status: 'ended', seq: 2, members: ['u_r1', 'u_r2'], state: Object.assign(x.snapshot('end'), { results }) });
    // Solo llegó a guardarse el de u_r1
    await svc.profiles.applyResult({ expeditionId: x.id, accountId: 'u_r1', result: 'clear', summary: results.u_r1.summary, save: results.u_r1.profile });
    assert.equal(await expeditions.recover(), 1, 'se aplica el que faltaba');
    assert.equal(await expeditions.recover(), 0, 'y no se repite');
    for (const a of ['u_r1', 'u_r2']) { assert.equal((await store.listRewards(a)).length, 1); assert.ok((await store.getProfile(a)).save.cleared.includes('gruta')); }
    store.close && await store.close();
  });
}
