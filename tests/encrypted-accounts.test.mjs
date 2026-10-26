/** Cuentas cifradas en la base de datos: usuario y nombre con AES-256-GCM, contraseña solo como huella scrypt. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { SqliteProfileStore } from '../server/src/persistence/SqliteProfileStore.js';
import { MemoryProfileStore } from '../server/src/persistence/ProfileStore.js';
import { withEncryptedAccounts, isEncrypted, usernameIndex, accountKeys } from '../server/src/persistence/EncryptedAccounts.js';
import { IdentityService } from '../server/src/identity/IdentityService.js';
import { SocialService } from '../server/src/social/SocialService.js';

const SECRET = 'k'.repeat(48), OTHER = 'x'.repeat(48);
const stores = [['SQLite', () => { const dir = mkdtempSync(join(tmpdir(), 'ma-enc-')); return { store: new SqliteProfileStore(join(dir, 'db.sqlite')), dir }; }], ['memoria', () => ({ store: new MemoryProfileStore() })]];
if (process.env.TEST_DATABASE_URL) {
  const { PostgresProfileStore } = await import('../server/src/persistence/PostgresProfileStore.js');
  stores.push(['PostgreSQL', async () => ({ store: await PostgresProfileStore.connect(process.env.TEST_DATABASE_URL) })]);
}
const uniq = () => Math.random().toString(36).slice(2, 7);

for (const [label, make] of stores) {
  test(`${label}: usuario y nombre cifrados; se entra igual; nada legible en la base de datos`, async () => {
    const { store: raw, dir } = await make(), store = withEncryptedAccounts(raw, SECRET), id = new IdentityService({ secret: SECRET, store });
    const user = 'Ana_' + uniq(), pass = 'montaña-azul-77';
    const r = await id.register(user, pass, 'Ana López');
    assert.equal(r.account.name, 'Ana López'); assert.equal(r.account.username, user);
    // En la base de datos: nombre cifrado, usuario como huella, contraseña como scrypt
    const row = await raw.getAccount(r.account.id);
    assert.ok(isEncrypted(row.name), 'nombre cifrado'); assert.ok(!row.name.includes('Ana'));
    assert.equal(row.username, usernameIndex(accountKeys(SECRET), user)); assert.ok(!row.username.toLowerCase().includes(user.toLowerCase()));
    assert.match(row.passHash, /^scrypt\$/); assert.ok(!row.passHash.includes(pass));
    // Se entra con el usuario (sin distinguir mayúsculas) y se ve el nombre
    const l = await id.login(user.toUpperCase(), pass);
    assert.equal(l.account.name, 'Ana López'); assert.equal(l.account.username, user);
    assert.equal((await id.verify(l.token)).name, 'Ana López');
    await assert.rejects(id.login(user, 'otra-contraseña'), /incorrectos/);
    await assert.rejects(id.register(user.toLowerCase(), 'otra-clave-123', 'X'), /ya está en uso/, 'el usuario sigue siendo único');
    // Invitado → cuenta, y cambiar el nombre visible
    const g = await id.createGuest('Beto');
    const u2 = 'beto_' + uniq(); await id.upgrade(g.account.id, u2, 'clave-segura-99');
    assert.equal((await id.login(u2, 'clave-segura-99')).account.name, 'Beto');
    await id.rename(g.account.id, 'Beto el Mago');
    assert.equal((await store.getAccount(g.account.id)).name, 'Beto el Mago');
    assert.ok(isEncrypted((await raw.getAccount(g.account.id)).name));
    // Los amigos también ven el nombre (descifrado por el servidor)
    const S = new SocialService({ store });
    await S.request(r.account.id, await S.code(g.account.id));
    assert.deepEqual((await S.view(g.account.id)).incoming.map(x => x.name), ['Ana López']);
    // SQLite: ni el usuario ni el nombre aparecen en ningún archivo de la base de datos (tampoco en el registro WAL)
    if (dir) {
      raw.db.exec('pragma wal_checkpoint(truncate)');
      const bytes = readdirSync(dir).map(f => readFileSync(join(dir, f)).toString('latin1')).join('');
      for (const s of [user, user.toLowerCase(), 'Ana López', u2, 'Beto el Mago', pass]) assert.ok(!bytes.includes(Buffer.from(s, 'utf8').toString('latin1')), `«${s}» no está en claro en la base de datos`);
    }
    await raw.close();
  });
}

test('cuentas antiguas en claro: se cifran al arrancar y se sigue entrando con el mismo usuario', async () => {
  const raw = new SqliteProfileStore(':memory:');
  const plain = new IdentityService({ secret: SECRET, store: raw });        // como antes de esta versión
  const a = await plain.register('vieja.cuenta', 'contraseña-larga', 'Carla');
  assert.equal((await raw.getAccount(a.account.id)).name, 'Carla');
  const store = withEncryptedAccounts(raw, SECRET);
  assert.equal(await store.migrateAccounts(), 1);
  const row = await raw.getAccount(a.account.id);
  assert.ok(isEncrypted(row.name) && row.username.startsWith('uh1:'));
  const id = new IdentityService({ secret: SECRET, store });
  assert.equal((await id.login('Vieja.Cuenta', 'contraseña-larga')).account.name, 'Carla');
  assert.equal((await id.verify(a.token)).name, 'Carla', 'la sesión anterior sigue valiendo');
  assert.equal(await store.migrateAccounts(), 0, 'no se cifra dos veces');
});

test('sin el secreto del servidor no se puede leer; y si alguien manipula el dato, se detecta', async () => {
  const raw = new SqliteProfileStore(':memory:'), mine = new IdentityService({ secret: SECRET, store: withEncryptedAccounts(raw, SECRET) });
  const a = await mine.register('dani_99', 'clave-de-dani', 'Dani');
  const thief = withEncryptedAccounts(raw, OTHER);                           // copia de la base de datos sin el secreto
  const err = console.error; console.error = () => {};
  assert.equal((await thief.getAccount(a.account.id)).name, '¿?');
  assert.equal(await thief.getAccountByUsername('dani_99'), null);
  // Manipulación: un byte cambiado en el cifrado → no se acepta (GCM) en lugar de mostrar basura
  const row = await raw.getAccount(a.account.id), b = row.name.split(':')[1];
  const bad = 'enc1:' + (b[40] === 'A' ? b.slice(0, 40) + 'B' + b.slice(41) : b.slice(0, 40) + 'A' + b.slice(41));
  await raw.updateAccount(a.account.id, { name: bad });
  assert.equal((await withEncryptedAccounts(raw, SECRET).getAccount(a.account.id)).name, '¿?');
  console.error = err;
});
