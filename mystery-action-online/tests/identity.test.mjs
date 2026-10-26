import test from 'node:test';
import assert from 'node:assert/strict';
import { issueToken, verifyToken } from '../server/src/identity/tokens.js';
import { IdentityService, cleanName } from '../server/src/identity/IdentityService.js';
import { hashPassword, verifyPassword } from '../server/src/identity/passwords.js';
import { MemoryProfileStore } from '../server/src/persistence/ProfileStore.js';
import { loadConfig } from '../server/src/config.js';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const SECRET = 'x'.repeat(48);
const svc = () => new IdentityService({ secret: SECRET, store: new MemoryProfileStore() });

test('token firmado: válido, manipulado, otra clave y caducado', () => {
  const t = issueToken(SECRET, { sub: 'u_abcdefgh12', kind: 'guest' }, 60);
  assert.equal(verifyToken(SECRET, t).sub, 'u_abcdefgh12');
  const [p, s] = t.split('.');
  const forged = Buffer.from(JSON.stringify({ sub: 'u_otro0000000', kind: 'guest', iat: 0, exp: 9e9 })).toString('base64url') + '.' + s;
  assert.equal(verifyToken(SECRET, forged), null);
  assert.equal(verifyToken('y'.repeat(48), t), null);
  assert.equal(verifyToken(SECRET, t, Date.now() + 61000), null);
  assert.equal(verifyToken(SECRET, 'basura'), null);
  assert.equal(verifyToken(SECRET, p + '.' + s + '.x'), null);
});

test('contraseñas: scrypt con sal, verificación y formato', async () => {
  const h1 = await hashPassword('secreto123'), h2 = await hashPassword('secreto123');
  assert.notEqual(h1, h2); assert.match(h1, /^scrypt\$/); assert.ok(!h1.includes('secreto123'));
  assert.ok(await verifyPassword('secreto123', h1)); assert.ok(!(await verifyPassword('secreto124', h1))); assert.ok(!(await verifyPassword('x', 'roto')));
});

test('cuentas: registro, inicio de sesión desde otro dispositivo, errores claros y límite de intentos', async () => {
  const id = svc();
  await assert.rejects(id.register('a', 'secreto123'), /3 a 20/);
  await assert.rejects(id.register('lucia', 'corta'), /8 caracteres/);
  await assert.rejects(id.register('lucia', 'lucia'), /8 caracteres|usuario/);
  const r = await id.register('Lucia', 'montaña-azul', 'Lucía');
  assert.equal(r.account.kind, 'password'); assert.equal(r.account.username, 'Lucia'); assert.ok(!('passHash' in r.account));
  await assert.rejects(id.register('lucia', 'otra-clave-9'), /en uso/);
  const other = await id.login('LUCIA', 'montaña-azul', '10.0.0.2');        // «otro dispositivo»
  assert.equal(other.account.id, r.account.id); assert.ok(await id.verify(other.token));
  await assert.rejects(id.login('lucia', 'mal'), /incorrectos/);
  await assert.rejects(id.login('nadie', 'mal'), /incorrectos/);
  for (let i = 0; i < 7; i++) await id.login('lucia', 'mal', '10.0.0.3').catch(() => {});
  await assert.rejects(id.login('lucia', 'montaña-azul', '10.0.0.4'), /Demasiados intentos/);
});

test('cuentas: un invitado se convierte en cuenta conservando su id; cerrar sesión invalida todos los tokens', async () => {
  const id = svc();
  const g = await id.createGuest('  <b>Ana</b>  ');
  assert.equal(g.account.name, 'bAna/b'); assert.equal(g.account.kind, 'guest');
  const up = await id.upgrade(g.account.id, 'ana_m', 'una-clave-larga');
  assert.equal(up.account.id, g.account.id); assert.equal(up.account.kind, 'password');
  assert.equal(await id.verify(g.token), null, 'el token de invitado ya no vale');
  assert.equal((await id.login('ana_m', 'una-clave-larga')).account.id, g.account.id);
  await assert.rejects(id.upgrade(g.account.id, 'otro', 'una-clave-larga'), /ya tiene/);
  const t2 = (await id.login('ana_m', 'una-clave-larga')).token;
  assert.ok(await id.verify(up.token) && await id.verify(t2));
  await id.logoutAll(g.account.id);
  assert.equal(await id.verify(up.token), null); assert.equal(await id.verify(t2), null);
  assert.equal(cleanName(''), 'Explorador');
});

test('configuración: secretos, almacén por defecto SQLite e importación de partidas desactivada', () => {
  assert.throws(() => loadConfig({ NODE_ENV: 'production' }), /AUTH_SECRET/);
  assert.throws(() => loadConfig({ AUTH_SECRET: 'corto' }), /32/);
  const dir = mkdtempSync(join(tmpdir(), 'ma-cfg-'));
  const warn = console.warn; console.warn = () => {};
  const a = loadConfig({ DATA_DIR: dir }), b = loadConfig({ DATA_DIR: dir });
  console.warn = warn;
  assert.equal(a.secret, b.secret); assert.ok(a.secret.length >= 32);
  assert.equal(a.store, 'sqlite'); assert.equal(a.allowProfileImport, false);
  assert.equal(loadConfig({ DATA_DIR: dir, ALLOW_PROFILE_IMPORT: 'true', AUTH_SECRET: SECRET }).allowProfileImport, true);
  const P = { NODE_ENV: 'production', AUTH_SECRET: SECRET, CLIENT_ORIGIN: 'https://juego.ejemplo.es' };
  assert.equal(loadConfig(Object.assign({ ALLOW_PROFILE_IMPORT: 'true' }, P)).allowProfileImport, false, 'en producción no se puede activar');
  // Producción: origen del cliente obligatorio y por HTTPS; nada de perfiles en memoria; registros en JSON
  assert.throws(() => loadConfig({ NODE_ENV: 'production', AUTH_SECRET: SECRET }), /CLIENT_ORIGIN/);
  assert.throws(() => loadConfig(Object.assign({}, P, { CLIENT_ORIGIN: 'http://juego.ejemplo.es' })), /HTTPS/);
  assert.throws(() => loadConfig(Object.assign({}, P, { CLIENT_ORIGIN: 'https://juego.ejemplo.es/ruta' })), /no válido/);
  assert.throws(() => loadConfig(Object.assign({}, P, { PROFILE_STORE: 'memory' })), /memoria|memory/);
  const prod = loadConfig(Object.assign({}, P, { TRUST_PROXY: '1', RECONNECT_SECONDS: '120' }));
  assert.deepEqual([prod.clientOrigins, prod.trustProxy, prod.logFormat, prod.reconnectSeconds], [['https://juego.ejemplo.es'], 1, 'json', 120]);
  assert.throws(() => loadConfig({ AUTH_SECRET: SECRET, PROFILE_STORE: 'file' }), /sqlite, postgres o memory/);
});
