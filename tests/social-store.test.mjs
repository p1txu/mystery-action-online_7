/** Amigos y bloqueos en las bases de datos (memoria y SQLite; PostgreSQL si hay TEST_DATABASE_URL) con las reglas de SocialService. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { MemoryProfileStore } from '../server/src/persistence/ProfileStore.js';
import { SqliteProfileStore } from '../server/src/persistence/SqliteProfileStore.js';
import { SocialService } from '../server/src/social/SocialService.js';
import { FRIENDS_MAX, PENDING_MAX, normalizeFriendCode, isFriendCode, cleanChat } from '../shared/social.js';

const stores = [['memoria', () => new MemoryProfileStore()], ['SQLite', () => new SqliteProfileStore(':memory:')]];
if (process.env.TEST_DATABASE_URL) {
  const { PostgresProfileStore } = await import('../server/src/persistence/PostgresProfileStore.js');
  stores.push(['PostgreSQL', () => PostgresProfileStore.connect(process.env.TEST_DATABASE_URL)]);
}
const acc = (store, name) => store.createAccount({ id: 'u_' + name + Math.random().toString(36).slice(2, 8), name, kind: 'guest', tokenVersion: 0, createdAt: new Date().toISOString() });

for (const [label, make] of stores) {
  test(`${label}: códigos únicos, solicitudes, aceptar, rechazar, borrar, bloquear y límites`, async () => {
    const store = await make(), S = new SocialService({ store }), changes = [];
    S.onChange(ids => changes.push(ids));
    const [a, b, c] = [await acc(store, 'Ana'), await acc(store, 'Beto'), await acc(store, 'Cris')];
    const ca = await S.code(a.id), cb = await S.code(b.id), cc = await S.code(c.id);
    assert.ok(isFriendCode(ca) && ca !== cb && cb !== cc); assert.equal(await S.code(a.id), ca, 'estable');
    assert.equal((await store.accountByFriendCode(cb)).id, b.id);
    // Solicitud, ver como entrante/saliente, rechazar
    assert.equal((await S.request(a.id, 'Beto#' + cb)).status, 'pending');
    assert.deepEqual((await S.view(b.id)).incoming.map(x => x.name), ['Ana']);
    assert.deepEqual((await S.view(a.id)).outgoing.map(x => x.name), ['Beto']);
    await assert.rejects(S.respond(a.id, b.id, true), /ya no existe/, 'no puedes aceptar tu propia solicitud');
    await S.respond(b.id, a.id, false);
    assert.equal((await S.view(b.id)).incoming.length, 0);
    // Otra vez y aceptar
    await S.request(a.id, cb); await S.respond(b.id, a.id, true);
    assert.ok(await S.areFriends(a.id, b.id));
    assert.deepEqual((await S.view(a.id)).friends.map(f => [f.name, f.code]), [['Beto', cb]]);
    await assert.rejects(S.request(b.id, ca), /ya es tu amigo/);
    // Cruzadas: si los dos se la envían, aceptada
    await S.request(a.id, cc); assert.equal((await S.request(c.id, ca)).status, 'accepted');
    // Borrar
    await S.remove(a.id, c.id); assert.ok(!(await S.areFriends(a.id, c.id)));
    // Bloquear: borra la amistad; el bloqueado recibe el mismo error que un código inexistente
    await S.block(a.id, b.id);
    assert.ok(!(await S.areFriends(a.id, b.id))); assert.ok(await S.blocked(b.id, a.id));
    const e1 = await S.request(b.id, ca).catch(e => e), e2 = await S.request(b.id, 'ZZZZZZ').catch(e => e);
    assert.equal(e1.status, 404); assert.equal(e1.message, e2.message);
    await assert.rejects(S.request(a.id, cb), /Desbloquéalo/, 'quien bloquea sí lo sabe');
    await S.unblock(a.id, b.id); assert.ok(!(await S.blocked(a.id, b.id)));
    assert.ok(changes.length >= 6, 'cada cambio se avisa');
    // Límite de solicitudes pendientes
    const many = []; for (let i = 0; i < PENDING_MAX + 1; i++) many.push(await acc(store, 'X' + i));
    const s2 = new SocialService({ store }); s2.rate = () => {};
    for (let i = 0; i < PENDING_MAX; i++) await s2.request(c.id, await s2.code(many[i].id));
    await assert.rejects(s2.request(c.id, await s2.code(many[PENDING_MAX].id)), /demasiadas solicitudes/);
    assert.ok(FRIENDS_MAX >= 50);
    await store.close();
  });
}

test('código de amigo: se acepta «Nombre#CÓDIGO», minúsculas y espacios', () => {
  assert.equal(normalizeFriendCode(' ana#k7p2qx '), 'K7P2QX');
  assert.equal(normalizeFriendCode('K7P2QX'), 'K7P2QX');
  assert.ok(!isFriendCode('K7P2Q0'), 'sin 0 ni O');
});

test('filtro del chat: tapa insultos (también disfrazados) sin tocar palabras normales; longitud y caracteres raros', () => {
  const t = s => cleanChat(s).text;
  assert.equal(t('eres un idiota'), 'eres un ******');
  assert.equal(t('p.u.t.a madre'), '******* madre');
  assert.equal(t('m1erda de jefe'), '****** de jefe');
  assert.equal(t('vaya tontería, computadora'), 'vaya tontería, computadora');
  assert.equal(t('eco nocido'), 'eco nocido');
  assert.equal(t('holaaaaaaaaa'), 'holaaa');
  assert.equal(t('a​‮b\u0007c'), 'a b c');
  assert.equal([...t('abcde '.repeat(100))].length, 140);
  assert.equal(cleanChat('   ').ok, false); assert.equal(cleanChat(42).ok, false);
});
