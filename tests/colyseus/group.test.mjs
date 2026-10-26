/**
 * Grupos privados con Colyseus REAL (0.18) y el SDK REAL, con cuatro clientes de prueba
 * conectados a la vez. Cada cliente es una conexión independiente, con su propia cuenta y
 * su propia partida; ninguno lo controla una IA: el test envía sus acciones.
 * Ejecutar con el cargador que resuelve los paquetes de Colyseus (ver tests/run-all.sh).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { Client } from '@colyseus/sdk';
import { createGameServer } from '../../server/src/app.js';
import { MemoryProfileStore } from '../../server/src/persistence/ProfileStore.js';
import { C, S, ERR, PROTOCOL_VERSION, ROOM_NAME, MAX_PLAYERS } from '../../shared/protocol.js';
import { E, freshSave } from '../helpers.mjs';

const PORT = 2700 + Math.floor(Math.random() * 200), URL0 = `http://127.0.0.1:${PORT}`;
const wait = ms => new Promise(r => setTimeout(r, ms));
const until = async (fn, ms = 4000, what = 'condición') => { const t0 = Date.now(); while (Date.now() - t0 < ms) { const v = fn(); if (v) return v; await wait(20); } throw new Error('Tiempo agotado esperando: ' + what); };
const api = async (method, path, body, token) => {
  const r = await fetch(URL0 + path, { method, headers: Object.assign({ 'content-type': 'application/json' }, token ? { authorization: 'Bearer ' + token } : {}), body: body && JSON.stringify(body) });
  return { status: r.status, body: await r.json().catch(() => null) };
};

let app;
test.before(async () => {
  const warn = console.warn; console.warn = () => {};
  app = await createGameServer({ port: PORT, secret: 's'.repeat(48), store: 'memory', tokenTtlHours: 1, allowProfileImport: false, clientOrigins: [] }, { store: new MemoryProfileStore() });
  console.warn = warn;
  await app.listen();
});
test.after(async () => { await app.close(); });

/** Un jugador de prueba: cuenta de invitado + partida propia subida al servidor + cliente SDK. */
async function player(name, species, patch = {}) {
  const g = await api('POST', '/api/auth/guest', { name });
  assert.equal(g.status, 201, 'invitado ' + name);
  // Perfil sembrado en el servidor (preparación de la prueba: el cliente no puede subir partidas)
  const save = E.Save.sanitize(Object.assign(freshSave(species), patch)).data;
  await app.store.putProfile(g.body.account.id, save);
  const client = new Client(URL0); client.auth.token = g.body.token;
  const p = { name, species, token: g.body.token, account: g.body.account, save, client, room: null, inbox: [], joinedAt: 0 };
  return p;
}
function listen(p, room) {
  p.room = room; p.joinedAt = Date.now();
  for (const t of [S.WELCOME, S.FLOOR, S.EVENT, S.REJECT, S.RESULT, S.PONG]) room.onMessage(t, m => p.inbox.push([t, m]));
  return room;
}
const opts = (p, extra = {}) => Object.assign({ protocol: PROTOCOL_VERSION, token: p.token }, extra);
const create = p => p.client.create(ROOM_NAME, opts(p, { creating: true, dungeon: 'bosque' })).then(r => listen(p, r));
const join = async (p, code, extra) => { const { body } = await api('GET', '/api/rooms/' + code); if (!body.roomId) throw Object.assign(new Error(body.error), { code: body.errorCode }); return listen(p, await p.client.joinById(body.roomId, opts(p, Object.assign({ code }, extra)))); };
const errCode = async promise => { try { await promise; return 'sin error'; } catch (e) { return e.code; } };
const players = room => Object.values((room.state && room.state.toJSON && room.state.toJSON().players) || {});

test('grupo privado de 4 con Colyseus real: crear, unirse, validaciones, preparación, inicio, reconexión y salida', async () => {
  const [A, B, Cc, D, X] = await Promise.all([
    player('Ana', 'guerrero', { bank: 111 }), player('Beto', 'mago', { bank: 222 }),
    player('Carla', 'arquero', { bank: 333 }), player('Dani', 'guerrero', { bank: 444 }), player('Xavi', 'mago'),
  ]);
  // --- Crear: el creador es anfitrión y el servidor genera el código
  await create(A);
  const welcomeA = await until(() => A.inbox.find(([t]) => t === S.WELCOME), 3000, 'welcome A');
  const code = welcomeA[1].code;
  assert.match(code, /^[A-HJ-NP-Z2-9]{6}$/); assert.equal(welcomeA[1].host, true);
  assert.equal((await api('GET', '/api/rooms/' + code)).body.players, 1);
  const room = app.matchMaker.getLocalRoomById(A.room.roomId);
  assert.ok(room, 'la sala existe en el servidor'); assert.equal(room.code, code);

  // --- Unirse: tres amigos a la vez con el código
  await Promise.all([join(B, code), join(Cc, code), join(D, code, { name: 'Hacker', species: 'arquero', save: freshSave('arquero', { bank: 99999 }), sessionId: A.room.sessionId })]);
  for (const p of [A, B, Cc, D]) await until(() => players(p.room).length === 4, 3000, '4 jugadores en ' + p.name);
  // Todos ven nombre y criatura de cada integrante; solo hay un anfitrión
  for (const p of [A, B, Cc, D]) {
    const list = players(p.room);
    assert.deepEqual(list.map(x => x.name).sort(), ['Ana', 'Beto', 'Carla', 'Dani']);
    assert.deepEqual(Object.fromEntries(list.map(x => [x.name, x.species])), { Ana: 'guerrero', Beto: 'mago', Carla: 'arquero', Dani: 'guerrero' });
    assert.equal(list.filter(x => x.host).length, 1); assert.equal(list.find(x => x.host).name, 'Ana');
    assert.equal(p.room.state.max, MAX_PLAYERS);
  }
  // Cada uno recibe SOLO su partida (no la del anfitrión), aunque Dani intentó colar datos ajenos
  for (const p of [B, Cc, D]) {
    const w = await until(() => p.inbox.find(([t]) => t === S.WELCOME), 3000, 'welcome ' + p.name);
    assert.equal(w[1].host, false); assert.equal(w[1].save.species, p.species); assert.equal(w[1].save.bank, p.save.bank);
    assert.notEqual(w[1].sessionId, A.room.sessionId);
  }
  assert.equal(room.members.get(D.room.sessionId).name, 'Dani'); assert.equal(room.members.get(D.room.sessionId).save.bank, 444);

  // --- Validaciones al entrar
  const full = await api('GET', '/api/rooms/' + code);
  assert.equal(full.status, 409); assert.equal(full.body.errorCode, ERR.FULL);
  assert.ok([ERR.FULL, 522].includes(await errCode(X.client.joinById(A.room.roomId, opts(X, { code })))), 'quinto jugador rechazado');
  // Con una plaza libre: código incorrecto, sesión no válida, versión distinta y cuenta duplicada
  await D.room.leave(); D.room = null;
  await until(() => players(A.room).length === 3, 3000, 'Dani sale');
  assert.equal((await api('GET', '/api/rooms/' + code)).body.players, 3);
  assert.equal(await errCode(X.client.joinById(A.room.roomId, opts(X, { code: 'ZZZZZZ' }))), ERR.NOT_FOUND);
  const bad = new Client(URL0); bad.auth.token = 'no-vale';
  assert.equal(await errCode(bad.joinById(A.room.roomId, { protocol: PROTOCOL_VERSION, token: 'no-vale', code })), ERR.SESSION);
  assert.equal(await errCode(X.client.joinById(A.room.roomId, opts(X, { code, protocol: 0 }))), ERR.VERSION);
  const twin = new Client(URL0); twin.auth.token = B.token;
  assert.equal(await errCode(twin.joinById(A.room.roomId, { protocol: PROTOCOL_VERSION, token: B.token, code })), ERR.DUPLICATE);
  assert.equal(await errCode(join({ client: X.client, token: X.token, inbox: [] }, 'ZZZZZZ')), ERR.NOT_FOUND);
  assert.equal(players(A.room).length, 3, 'los rechazados no ocupan plaza');
  // Dani vuelve (sale y entra con el código)
  D.inbox = []; await join(D, code);
  await until(() => players(A.room).length === 4, 3000, 'Dani vuelve');

  // --- Sala de espera: solo el anfitrión elige mazmorra y empieza; cada uno solo cambia lo suyo
  B.room.send(C.START, { dungeon: 'bosque' }); B.room.send(C.DUNGEON, { dungeon: 'gruta' });
  await until(() => B.inbox.filter(([t]) => t === S.REJECT).length >= 2, 3000, 'rechazos a Beto');
  A.room.send(C.READY, { ready: true, sessionId: B.room.sessionId });          // el anfitrión no puede marcar a otro
  A.room.send(C.START, { dungeon: 'bosque' });
  const rej = await until(() => A.inbox.find(([t, m]) => t === S.REJECT && m.what === 'start'), 3000, 'no están listos');
  assert.match(rej[1].why, /Beto|Carla|Dani/);
  assert.equal(players(A.room).find(x => x.name === 'Beto').ready, false);
  for (const p of [B, Cc, D]) p.room.send(C.READY, { ready: true });
  await until(() => players(A.room).filter(x => x.ready).length === 3, 3000, 'tres listos');
  A.room.send(C.DUNGEON, { dungeon: 'bosque' });                                // misma: no cambia nada
  await wait(150);
  assert.equal(players(A.room).filter(x => x.ready).length, 3);

  // --- Inicio: todos reciben el mismo piso; la sala se cierra a nuevas entradas
  A.room.send(C.START, { dungeon: 'bosque' });
  const floors = await Promise.all([A, B, Cc, D].map(p => until(() => p.inbox.find(([t]) => t === S.FLOOR), 4000, 'piso ' + p.name)));
  assert.equal(new Set(floors.map(([, f]) => f.seed)).size, 1);
  await until(() => A.room.state.phase === 'playing', 3000, 'fase playing sincronizada');
  assert.equal((await api('GET', '/api/rooms/' + code)).body.errorCode, ERR.STARTED);
  // En la expedición cada jugador lleva SU criatura y SU partida
  for (const p of [A, B, Cc, D]) {
    const m = room.exp.members.get(p.room.sessionId);
    assert.equal(m.save.species, p.species); assert.equal(m.save.bank, p.save.bank); assert.equal(m.name, p.name);
  }
  // Los cuatro se mueven a la vez y cada cliente ve moverse a los demás (sincronización del estado)
  const start = Object.fromEntries(players(A.room).map(x => [x.name, [x.x, x.y]]));
  for (let k = 0; k < 10; k++) { for (const [i, p] of [A, B, Cc, D].entries()) p.room.send(C.INPUT, { s: k * 6, m: Array(6).fill([[1, 0], [-1, 0], [0, 1], [0, -1]][i]) }); await wait(50); }
  await wait(300);
  for (const viewer of [A, B, Cc, D]) {
    const now = Object.fromEntries(players(viewer.room).map(x => [x.name, [x.x, x.y]]));
    const moved = Object.keys(now).filter(n => Math.hypot(now[n][0] - start[n][0], now[n][1] - start[n][1]) > 5);
    assert.ok(moved.length >= 3, `${viewer.name} ve moverse a ${moved.join(', ')}`);
  }
  assert.ok(Object.keys(A.room.state.toJSON().enemies).length > 0, 'enemigos del servidor sincronizados');

  // --- Caída de la conexión de Carla: los demás la ven desconectada; el SDK reconecta solo
  await wait(Math.max(0, 5200 - (Date.now() - Cc.joinedAt || 0)));          // el SDK solo reintenta tras 5 s conectado
  const reconnected = new Promise(r => Cc.room.onReconnect(() => r(true)));
  room.clients.find(c => c.sessionId === Cc.room.sessionId).ref.terminate();   // corte brusco de la red (sin cierre)
  await until(() => players(A.room).find(x => x.name === 'Carla').connected === false, 4000, 'Carla desconectada');
  assert.ok(room.exp.members.get(Cc.room.sessionId).player.dormant);
  assert.equal(await Promise.race([reconnected, wait(8000).then(() => false)]), true, 'reconexión automática');
  await until(() => players(A.room).find(x => x.name === 'Carla').connected === true, 4000, 'Carla vuelve');
  await until(() => Cc.inbox.filter(([t, m]) => t === S.WELCOME && m.reconnected).length, 3000, 'welcome de reconexión');

  // --- Abandonar grupo durante la expedición: resultado de retirada guardado una vez
  const v0 = (await app.store.getProfile(D.account.id)).version;
  D.room.send(C.LEAVE, {});
  const res = await until(() => D.inbox.find(([t]) => t === S.RESULT), 4000, 'resultado de Dani');
  assert.equal(res[1].result, 'abandon'); assert.ok(res[1].envelope);
  await until(() => players(A.room).length === 3, 4000, 'Dani fuera');
  assert.equal((await app.store.getProfile(D.account.id)).version, v0 + 1);
  assert.equal(app.registry.roomOf(D.account.id), null);
  for (const p of [A, B, Cc]) await p.room.leave();
  await wait(300);
  for (const p of [A, B, Cc]) assert.equal(app.registry.roomOf(p.account.id), null);
});

test('salir del grupo en la sala de espera: el anfitrión pasa al siguiente y una cuenta no entra en dos grupos', async () => {
  const [A, B, Cc] = await Promise.all([player('Host', 'arquero'), player('Bea', 'guerrero'), player('Ciro', 'mago')]);
  await create(A); const code = (await until(() => A.inbox.find(([t]) => t === S.WELCOME)))[1].code;
  await join(B, code); await wait(30); await join(Cc, code);
  await until(() => players(Cc.room).length === 3, 3000, 'tres');
  // B no puede crear ni entrar en otro grupo mientras está en este
  const other = new Client(URL0); other.auth.token = B.token;
  assert.equal(await errCode(other.create(ROOM_NAME, { protocol: PROTOCOL_VERSION, token: B.token, creating: true })), ERR.OTHER_ROOM);
  await A.room.leave();
  await until(() => players(Cc.room).length === 2, 3000, 'sale el anfitrión');
  const list = players(Cc.room);
  assert.equal(list.find(x => x.host).name, 'Bea', 'el anfitrión pasa a quien llevaba más tiempo');
  await B.room.leave(); await Cc.room.leave();
  await wait(200);
  assert.equal((await api('GET', '/api/rooms/' + code)).body.errorCode, ERR.NOT_FOUND, 'sala vacía: el código deja de existir');
});

test('jugador sin perfil en el servidor: error comprensible', async () => {
  const g = await api('POST', '/api/auth/guest', { name: 'Sinperfil' });
  const c = new Client(URL0); c.auth.token = g.body.token;
  const e = await c.create(ROOM_NAME, { protocol: PROTOCOL_VERSION, token: g.body.token, creating: true }).then(() => null, e => e);
  assert.equal(e.code, ERR.NO_PROFILE); assert.match(e.message, /perfil/);
});
