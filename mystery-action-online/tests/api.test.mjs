import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApi } from '../server/src/http/api.js';
import { IdentityService } from '../server/src/identity/IdentityService.js';
import { SqliteProfileStore } from '../server/src/persistence/SqliteProfileStore.js';
import { ProfileService } from '../server/src/persistence/ProfileService.js';
import { RoomRegistry } from '../server/src/rooms/registry.js';
import { E, freshSave } from './helpers.mjs';
import { ERR } from '../shared/protocol.js';

async function boot(over = {}) {
  const store = new SqliteProfileStore(join(mkdtempSync(join(tmpdir(), 'ma-api-')), 'db.sqlite')), registry = new RoomRegistry();
  const identity = new IdentityService({ secret: 's'.repeat(40), store });
  const profiles = new ProfileService({ store, registry, allowImport: over.allowImport ?? false });
  const api = createApi({ identity, profiles, registry, config: { clientOrigins: ['http://localhost:5173'] } });
  const srv = createServer((req, res) => api(req, res).then(h => { if (!h) { res.writeHead(404); res.end(); } }));
  await new Promise(r => srv.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${srv.address().port}`;
  const call = async (method, path, body, token, headers = {}) => {
    const res = await fetch(base + path, { method, headers: Object.assign({ 'content-type': 'application/json' }, token ? { authorization: 'Bearer ' + token } : {}, headers), body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body) });
    return { status: res.status, body: await res.json().catch(() => null), headers: res.headers };
  };
  return { srv, call, registry, store };
}

test('cuentas por HTTP: registro, inicio de sesión en otro «dispositivo» y mismo perfil', async t => {
  const { srv, call } = await boot(); t.after(() => srv.close());
  const reg = await call('POST', '/api/auth/register', { username: 'lucia', password: 'montaña-azul', name: 'Lucía' });
  assert.equal(reg.status, 201);
  assert.equal((await call('POST', '/api/profile/new', { species: 'aurin' }, reg.body.token)).status, 201);
  const other = await call('POST', '/api/auth/login', { username: 'LUCIA', password: 'montaña-azul' });
  assert.equal(other.status, 200);
  const p = await call('GET', '/api/profile', undefined, other.body.token);
  assert.equal(p.body.summary.userId, reg.body.account.id); assert.equal(p.body.summary.creature.species, 'aurin');
  assert.equal((await call('POST', '/api/auth/login', { username: 'lucia', password: 'otra' })).status, 401);
  assert.equal((await call('POST', '/api/auth/register', { username: 'Lucia', password: 'otra-clave-1' })).status, 409);
  const me = await call('GET', '/api/me', undefined, other.body.token);
  assert.equal(me.body.policy.crossDevice, true); assert.equal(me.body.policy.allowImport, false);
  await call('POST', '/api/auth/logout', {}, other.body.token);
  assert.equal((await call('GET', '/api/me', undefined, reg.body.token)).status, 401, 'cerrar sesión cierra todas');
});

test('ficha del perfil personal con todos los datos pedidos', async t => {
  const { srv, call } = await boot(); t.after(() => srv.close());
  const tok = (await call('POST', '/api/auth/guest', { name: 'Ana' })).body.token;
  const r = await call('POST', '/api/profile/new', { species: 'magmolo' }, tok);
  const S = r.body.summary;
  for (const k of ['userId', 'creature', 'level', 'exp', 'stats', 'moves', 'inventory', 'equipment', 'coins', 'companions', 'missions', 'progress']) assert.ok(k in S, k);
  assert.equal(S.creature.species, 'magmolo'); assert.equal(S.creature.line, 'magmolo'); assert.deepEqual(S.creature.evolutions, []);
  assert.ok(S.stats.hp > 0 && S.moves.known.length && S.moves.equipped.length);
  assert.equal(S.coins, freshSave('magmolo').bank);
});

test('el cliente no puede escribir su perfil: solo pedir operaciones que valida el servidor', async t => {
  const { srv, call, registry } = await boot(); t.after(() => srv.close());
  const tok = (await call('POST', '/api/auth/guest', { name: 'Beto' })).body.token;
  const created = await call('POST', '/api/profile/new', { species: 'voltrino' }, tok);
  const v0 = created.body.version, bank0 = created.body.profile.bank;
  // Subir una partida (nivel 50 y 99 999 monedas) está desactivado
  const hacked = freshSave('voltrino', { bank: 99999 }); hacked.prog.level = 50;
  const up = await call('PUT', '/api/profile', { text: E.Save.exportText(hacked) }, tok);
  assert.equal(up.status, 400); assert.match(up.body.error, /no acepta partidas locales/);
  // Progresión validada en el servidor: la tienda no existe hasta completar el Bosque Brumoso
  const early = await call('POST', '/api/profile/op', { op: 'buy', args: { id: 'pocion', price: 0 }, version: v0 }, tok);
  assert.equal(early.status, 400); assert.match(early.body.error, /Bosque Brumoso/); assert.equal(early.body.profile.bank, bank0);
  // Operación válida (los argumentos extra se ignoran): equipar movimientos
  const mv = created.body.profile.prog.known.slice(0, 1);
  const ok = await call('POST', '/api/profile/op', { op: 'setMoves', args: { equipped: mv, level: 50 }, version: v0 }, tok);
  assert.equal(ok.status, 200); assert.deepEqual(ok.body.profile.prog.equipped, mv); assert.equal(ok.body.profile.prog.level, created.body.profile.prog.level); assert.equal(ok.body.version, v0 + 1);
  // Operación imposible o desconocida: 400 con el perfil del servidor para resincronizar
  const bad = await call('POST', '/api/profile/op', { op: 'setMoves', args: { equipped: ['inventado'] }, version: ok.body.version }, tok);
  assert.equal(bad.status, 400); assert.ok(bad.body.profile && bad.body.version === ok.body.version);
  assert.equal((await call('POST', '/api/profile/op', { op: 'addCoins', args: { n: 9999 } }, tok)).status, 400);
  // Versión antigua (otro dispositivo cambió el perfil): 409 con la copia actual
  const stale = await call('POST', '/api/profile/op', { op: 'setMoves', args: { equipped: mv }, version: v0 }, tok);
  assert.equal(stale.status, 409); assert.equal(stale.body.version, ok.body.version);
  // Durante un grupo no se puede tocar el perfil
  registry.claim((await call('GET', '/api/me', undefined, tok)).body.account.id, 'room-x');
  assert.equal((await call('POST', '/api/profile/op', { op: 'setMoves', args: { equipped: mv } }, tok)).status, 400);
});

test('importación de partidas solo si el servidor la activa (desarrollo) y con la suma de comprobación', async t => {
  const { srv, call } = await boot({ allowImport: true }); t.after(() => srv.close());
  const tok = (await call('POST', '/api/auth/guest', { name: 'Dev' })).body.token;
  const text = E.Save.exportText(freshSave('aurin', { bank: 77 }));
  assert.equal((await call('PUT', '/api/profile', { text }, tok)).body.profile.bank, 77);
  const env = JSON.parse(text); env.data.bank = 1e6;
  assert.equal((await call('PUT', '/api/profile', { text: JSON.stringify(env) }, tok)).status, 400);
});

test('salas por código, errores comprensibles, CORS y límites', async t => {
  const { srv, call, registry } = await boot(); t.after(() => srv.close());
  const code = registry.newCode('room-1');
  assert.equal((await call('GET', '/api/rooms/' + code.toLowerCase())).body.roomId, 'room-1');
  registry.update(code, { players: 4 });
  const full = await call('GET', '/api/rooms/' + code);
  assert.equal(full.status, 409); assert.equal(full.body.errorCode, ERR.FULL);
  registry.update(code, { players: 2 }); registry.close(code);
  assert.equal((await call('GET', '/api/rooms/' + code)).body.errorCode, ERR.STARTED);
  assert.equal((await call('GET', '/api/rooms/ZZZZZZ')).body.errorCode, ERR.NOT_FOUND);
  assert.equal((await call('GET', '/api/profile', undefined, 'basura')).body.errorCode, ERR.SESSION);
  assert.equal((await call('OPTIONS', '/api/profile', undefined, null, { origin: 'http://localhost:5173' })).status, 204);
  assert.equal((await call('OPTIONS', '/api/profile', undefined, null, { origin: 'https://evil.example' })).status, 403);
  assert.equal((await call('POST', '/api/auth/guest', '{malo')).status, 400);
  assert.equal((await call('POST', '/api/auth/guest', JSON.stringify({ name: 'x'.repeat(300 * 1024) }))).status, 413);
});
