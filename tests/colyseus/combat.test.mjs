/**
 * Combate en tiempo real con Colyseus REAL (0.18) y cuatro clientes SDK reales en la misma sala.
 * Los cuatro se mueven y atacan a la vez por el protocolo normal (INPUT a 20 Hz con 6 muestras y
 * acciones numeradas), contra enemigos del servidor, mientras cambian sus conexiones:
 *   - Carla sufre un corte de red y su SDK se reconecta solo;
 *   - Dani pierde la conexión y vuelve desde OTRO dispositivo con su cuenta (mismo asiento);
 *   - Beto recupera la partida en otro dispositivo estando aún conectado (toma del asiento);
 *   - Ana (anfitriona) abandona: el liderazgo pasa según la regla y la expedición sigue;
 *   - a Carla se le acaba el tiempo de reconexión: sale sin reiniciar la mazmorra.
 * Tras cada fase se congela la simulación y se compara el estado que ve cada cliente con el del
 * servidor (posiciones, PS, enemigos, jefe, puertas, objetos) y los resultados del combate (ataques
 * y muertes) que ha recibido cada uno. Ningún jugador lo controla una IA: el test envía sus entradas
 * como lo haría el juego; los enemigos extra y la resistencia de los jugadores son preparación.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { Client } from '@colyseus/sdk';
import { createGameServer } from '../../server/src/app.js';
import { MemoryProfileStore } from '../../server/src/persistence/ProfileStore.js';
import { C, S, ERR, PROTOCOL_VERSION, ROOM_NAME, HOST_RULE } from '../../shared/protocol.js';
import { E, freshSave } from '../helpers.mjs';

const PORT = 2950 + Math.floor(Math.random() * 40), URL0 = `http://127.0.0.1:${PORT}`, HOLD = 6;
const wait = ms => new Promise(r => setTimeout(r, ms));
const until = async (fn, ms = 5000, what = 'condición') => { const t0 = Date.now(); while (Date.now() - t0 < ms) { const v = await fn(); if (v) return v; await wait(20); } throw new Error('Tiempo agotado esperando: ' + what); };
const api = async (method, path, body, token) => {
  const r = await fetch(URL0 + path, { method, headers: Object.assign({ 'content-type': 'application/json' }, token ? { authorization: 'Bearer ' + token } : {}), body: body && JSON.stringify(body) });
  return { status: r.status, body: await r.json().catch(() => null) };
};

let app, restoreInfo = () => {};
test.before(async () => {
  const warn = console.warn, info = console.info; console.warn = () => {}; console.info = () => {};
  app = await createGameServer({ port: PORT, secret: 'c'.repeat(48), store: 'memory', tokenTtlHours: 1, allowProfileImport: false, clientOrigins: [], reconnectSeconds: HOLD }, { store: new MemoryProfileStore() });
  console.warn = warn; restoreInfo = () => { console.info = info; };
  await app.listen();
});
test.after(async () => { await app.close(); restoreInfo(); });

/* ---------- Clientes de prueba ---------- */
async function player(name, species, patch = {}) {
  const g = await api('POST', '/api/auth/guest', { name });
  const save = E.Save.sanitize(Object.assign(freshSave(species), patch)).data;
  await app.store.putProfile(g.body.account.id, save);       // preparación: perfil propio en el servidor
  const p = { name, species, token: g.body.token, account: g.body.account, client: null, room: null, inbox: [], seq: 0, n: 0, sending: false, aids: [], downs: [], joinedAt: 0 };
  p.client = new Client(URL0); p.client.auth.token = p.token;
  return p;
}
function listen(p, room) {
  p.room = room; p.joinedAt = Date.now();
  room.onMessage(S.WELCOME, m => { p.inbox.push([S.WELCOME, m]); if (m.input) { p.seq = Math.max(p.seq, m.input.seq); p.n = Math.max(p.n, m.input.act); } });
  for (const t of [S.FLOOR, S.REJECT, S.RESULT, S.PONG]) room.onMessage(t, m => p.inbox.push([t, m]));
  room.onMessage(S.EVENT, ev => { p.inbox.push([S.EVENT, ev]); if (ev.type === 'cast' || ev.type === 'eatk') p.aids.push(ev.aid); if (ev.type === 'enemyDown') p.downs.push(ev.id); });
  return room;
}
const opts = (p, extra = {}) => Object.assign({ protocol: PROTOCOL_VERSION, token: p.token }, extra);
const st = p => p.room.state.toJSON();
const serverSocket = (room, p) => room.clients.find(c => c.sessionId === p.room.sessionId);

/**
 * Lo que haría el juego: cada 50 ms, 6 muestras de eje (120 Hz) y, a veces, un ataque numerado
 * apuntando al enemigo más cercano que ESTE cliente ve en su estado sincronizado.
 * Cada 7 mensajes reenvía el anterior tal cual (mensaje duplicado por la red).
 */
function drive(p, k) {
  if (!p.room || !p.sending) return;
  const me = st(p).players[p.room.sessionId]; if (!me) return;
  let near = null, best = 1e9;
  for (const e of Object.values(st(p).enemies)) { const d = Math.hypot(e.x - me.x, e.y - me.y); if (d < best) { best = d; near = e; } }
  const t = (Date.now() / 400) + p.phase, ax = near && best > 40 ? (near.x - me.x) / best : Math.cos(t), ay = near && best > 40 ? (near.y - me.y) / best : Math.sin(t);
  const a = [];
  if (near && best < 140 && k % 3 === 0) {
    // Habilidad (Q); si es cargada (Arquero) se suelta en el siguiente turno con «r», como al levantar la tecla
    const kind = p.pendR ? { k: 'r', i: 0 } : k % 9 === 0 ? { k: 'm', i: 0 } : k % 12 === 0 ? { k: 'd' } : { k: 'b' };
    p.pendR = kind.k === 'm' && p.species === 'arquero';
    a.push(Object.assign({ n: ++p.n, at: p.seq + 2, dx: (near.x - me.x) / (best || 1), dy: (near.y - me.y) / (best || 1), d: Math.round(best) }, kind));
    p.lastAct = a[0];
  } else if (p.lastAct && k % 5 === 0) a.push(Object.assign({}, p.lastAct, { at: p.seq + 1 }));   // reenvío de una acción ya enviada (mismo n) en un mensaje nuevo
  const msg = { s: p.seq, m: Array(6).fill([Math.round(ax * 1000) / 1000, Math.round(ay * 1000) / 1000]), a };
  p.seq += 6;
  try { p.room.send(C.INPUT, msg); if (k % 7 === 0) p.room.send(C.INPUT, msg); } catch { /* sin conexión */ }
}
function startDriving(list) {
  let k = 0; list.forEach((p, i) => { p.sending = true; p.phase = i * 1.6; });
  const h = setInterval(() => { k++; for (const p of list) drive(p, k); }, 50); h.unref();
  return () => clearInterval(h);
}

/* ---------- Comparación cliente ↔ servidor ---------- */
const close = (a, b) => Math.abs(a - b) <= 0.06 + Math.abs(b) * 1e-6;     // float32 en la red
function diff(a, b, path = '', out = []) {
  if (typeof b === 'number') { if (typeof a !== 'number' || !close(a, b)) out.push(`${path}: cliente ${a} ≠ servidor ${b}`); return out; }
  if (b === null || typeof b !== 'object') { if (a !== b) out.push(`${path}: cliente ${JSON.stringify(a)} ≠ servidor ${JSON.stringify(b)}`); return out; }
  if (!a || typeof a !== 'object') { out.push(`${path}: falta en el cliente`); return out; }
  for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) { if (!(k in b)) { out.push(`${path}.${k}: sobra en el cliente`); continue; } diff(a[k], b[k], path + '.' + k, out); }
  return out;
}
/** Congela la simulación, envía el estado y espera a que todos los clientes lo tengan. */
async function frozenCompare(room, list, label) {
  room.frozen = true; room.sync();
  const server = JSON.parse(JSON.stringify(room.state.toJSON()));
  await until(() => list.every(p => diff(st(p), server).length === 0), 3000, `${label}: todos los clientes iguales al servidor`).catch(e => {
    for (const p of list) { const d = diff(st(p), server); if (d.length) console.error(label, p.name, d.slice(0, 8)); }
    throw e;
  });
  return server;
}
const unfreeze = room => { room.frozen = false; };

test('4 clientes en una sala: combate simultáneo, cambios de conexión y el mismo mundo para todos', { timeout: 120000 }, async () => {
  const A = await player('Ana', 'guerrero', { bank: 10 }), B = await player('Beto', 'mago', { bank: 20 }), Cc = await player('Carla', 'arquero', { bank: 30 }), D = await player('Dani', 'guerrero', { bank: 40 });
  // --- Grupo y comienzo
  listen(A, await A.client.create(ROOM_NAME, opts(A, { creating: true, dungeon: 'bosque' })));
  const code = (await until(() => A.inbox.find(([t]) => t === S.WELCOME)))[1].code;
  const roomId = (await api('GET', '/api/rooms/' + code)).body.roomId;
  await Promise.all([B, Cc, D].map(async p => listen(p, await p.client.joinById(roomId, opts(p, { code })))));
  const room = app.matchMaker.getLocalRoomById(roomId);
  assert.equal(room.state.reconnectSeconds, HOLD, 'ventana de reconexión configurada en el servidor');
  assert.equal(room.state.hostRule, HOST_RULE);
  for (const p of [B, Cc, D]) p.room.send(C.READY, { ready: true });
  await until(() => Object.values(room.state.toJSON().players).filter(x => x.ready).length === 3, 3000, 'listos');
  A.room.send(C.START, { dungeon: 'bosque' });
  const floors = await Promise.all([A, B, Cc, D].map(p => until(() => p.inbox.find(([t]) => t === S.FLOOR), 4000, 'piso ' + p.name)));
  assert.equal(new Set(floors.map(([, f]) => `${f.seed}/${f.genNo}/${f.w}x${f.h}`)).size, 1, 'misma semilla y mismo piso para los cuatro');
  const info = floors[0][1], gen = E.FloorGen.generate(info.seed, E.dungeonById(info.dungeon), info.genNo, info.kind, [], info.size);
  assert.deepEqual([...gen.world.tiles], [...room.exp.world.tiles], 'la semilla del servidor reproduce exactamente su mazmorra');

  // Registro de lo que emite el servidor (para comparar con lo que recibe cada cliente)
  const X = room.exp, sent = [], drain = X.drainEvents.bind(X);
  X.drainEvents = () => { const e = drain(); sent.push(...e); return e; };
  // Preparación: jugadores resistentes y enemigos alrededor de la entrada (combate garantizado)
  for (const m of X.members.values()) { m.player.maxHp = m.player.hp = 20000; }
  const sx = X.world.spawn.x, sy = X.world.spawn.y, v = Object.keys(X.dng.enemies)[0];
  let made = 0;
  for (let k = 0; k < 40 && made < 7; k++) {
    const a = k / 40 * Math.PI * 2 * 3, r = 60 + (k % 4) * 18, ex = sx + Math.cos(a) * r, ey = sy + Math.sin(a) * r;
    const e = new X.E.Enemy(X.E.makeKind(v), ex, ey, { level: 3 });
    if (!e.free(X.world, ex, ey)) continue;
    e.aggro = true; X.addEnemy(e, 'v:' + v); e.maxHp = e.hp = made < 4 ? 30 : 400; made++;   // PS fijados tras el ajuste del cooperativo (con las clases se empieza en el nivel 1)
  }
  assert.ok(made >= 5, 'enemigos de prueba colocados: ' + made);

  // --- Fase 1: los cuatro luchan a la vez (con mensajes duplicados)
  const traffic = [A, B, Cc, D].map(p => { const w = p.room.connection.transport.ws, t = { rx: 0 }; w.addEventListener('message', e => { t.rx += e.data.byteLength || e.data.length || 0; }); return t; });
  const tx0 = Date.now();
  let stop = startDriving([A, B, Cc, D]);
  await wait(6000);
  stop();
  if (process.env.COMBAT_DEBUG) { const secs = (Date.now() - tx0) / 1000; console.error({ kbPerSecondPerClient: traffic.map(t => Math.round(t.rx / secs / 102.4) / 10) }); }
  await wait(200);
  let snap = await frozenCompare(room, [A, B, Cc, D], 'fase 1');
  const casts = sent.filter(e => e.type === 'cast'), kills = sent.filter(e => e.type === 'enemyDown');
  assert.ok(casts.length >= 8, 'ataques aceptados por el servidor: ' + casts.length);
  assert.ok(new Set(casts.map(c => c.by)).size === 4, 'los cuatro han atacado');
  assert.ok(kills.length >= 1, 'el servidor ha derrotado enemigos: ' + kills.length);
  assert.equal(new Set(casts.map(c => c.aid)).size, casts.length, 'cada ataque tiene un id único');
  const dupDropped = [...X.members.values()].reduce((t, m) => t + m.stats.duplicates, 0);
  assert.ok(dupDropped >= 1, 'el servidor descarta acciones repetidas: ' + dupDropped);
  if (process.env.COMBAT_DEBUG) console.error({ casts: casts.length, kills: kills.length, dupDropped, eatk: sent.filter(e => e.type === 'eatk').length, rejects: sent.filter(e => e.type === 'reject').length });
  const serverAids = sent.filter(e => e.type === 'cast' || e.type === 'eatk').map(e => e.aid);
  for (const p of [A, B, Cc, D]) {
    assert.deepEqual(p.aids, serverAids, `${p.name} recibe exactamente los mismos ataques, en el mismo orden y sin repetir`);
    assert.deepEqual(p.downs, kills.map(k => k.id), `${p.name} ve las mismas muertes`);
  }
  assert.equal(new Set(kills.map(k => k.id)).size, kills.length, 'ningún enemigo muere dos veces');
  // Muertos fuera del estado en todos; experiencia de cada uno igual a la que guarda el servidor
  for (const id of kills.map(k => k.id)) assert.ok(!(id in snap.enemies));
  for (const [sid, m] of X.members) assert.equal(snap.players[sid].exp, m.save.prog.exp);
  const expEvents = sent.filter(e => e.type === 'exp');
  for (const k of kills) assert.ok(expEvents.length > 0 && expEvents.every(e => e.n > 0));
  unfreeze(room);

  // --- Fase 2: corte de red de Carla (reconexión automática del SDK) mientras los demás siguen luchando
  await wait(Math.max(0, 5300 - (Date.now() - Cc.joinedAt)));
  const cBack = new Promise(r => Cc.room.onReconnect(() => r(true)));
  stop = startDriving([A, B, D]);
  serverSocket(room, Cc).ref.terminate();
  await until(() => room.state.players.get(Cc.room.sessionId).connected === false, 3000, 'Carla desconectada');
  assert.ok(X.members.get(Cc.room.sessionId).player.dormant, 'su personaje queda dormido (no recibe daño ni se mueve)');
  assert.ok(room.state.players.get(Cc.room.sessionId).holdUntil > Date.now(), 'todos ven hasta cuándo se le guarda el sitio');
  const floorBefore = room.state.floorN;
  assert.equal(await Promise.race([cBack, wait(9000).then(() => false)]), true, 'el SDK de Carla vuelve solo');
  Cc.sending = true; stop(); stop = startDriving([A, B, Cc, D]);
  await wait(2500); stop(); await wait(200);
  snap = await frozenCompare(room, [A, B, Cc, D], 'fase 2');
  assert.equal(snap.floorN, floorBefore, 'la mazmorra no se reinicia por una desconexión');
  assert.equal(Object.keys(snap.players).length, 4); assert.equal(X.members.size, 4);
  assert.equal(X.g.actors.filter(a => a instanceof X.E.Player).length, 4, 'cuatro personajes en el piso, ninguno duplicado');
  for (const p of [A, B, D]) assert.deepEqual(p.aids, sent.filter(e => e.type === 'cast' || e.type === 'eatk').map(e => e.aid), p.name + ': mismos ataques');
  assert.equal(new Set(Cc.aids).size, Cc.aids.length, 'Carla no recibe ningún ataque dos veces');
  unfreeze(room);

  // --- Fase 3: Dani pierde la conexión y vuelve desde OTRO dispositivo con su cuenta
  const dSid = D.room.sessionId, dOld = D.room;
  dOld.reconnection.maxRetries = 0;                       // el primer dispositivo se queda sin red
  serverSocket(room, D).ref.terminate();
  await until(() => room.state.players.get(dSid).connected === false, 3000, 'Dani desconectado');
  const seat = await api('GET', '/api/me', null, D.token);
  assert.equal(seat.body.seat.held, true); assert.equal(seat.body.seat.code, code);
  const asAna = await api('POST', '/api/rooms/resume', {}, A.token);   // Ana solo puede pedir SU sitio, y está conectada
  assert.equal(asAna.status, 409); assert.equal(asAna.body.reconnectionToken, undefined, 'nadie recibe el token del sitio de otro');
  assert.equal((await api('POST', '/api/rooms/resume', {}, 'falso')).status, 401);
  const res = await api('POST', '/api/rooms/resume', {}, D.token);
  assert.equal(res.status, 200, JSON.stringify(res.body));
  const D2 = Object.assign({}, D, { client: new Client(URL0), inbox: [], aids: [], downs: [], seq: 0, n: 0 });
  D2.client.auth.token = D.token;
  listen(D2, await D2.client.reconnect(res.body.reconnectionToken));
  assert.equal(D2.room.sessionId, dSid, 'MISMO asiento: el mismo sessionId y el mismo personaje');
  const w = await until(() => D2.inbox.find(([t, m]) => t === S.WELCOME && m.reconnected), 3000, 'welcome del nuevo dispositivo');
  assert.equal(w[1].save.species, 'guerrero'); assert.equal(w[1].save.bank, 40, 'su propio perfil, no el de otro');
  assert.ok(w[1].input.seq > 0 && D2.seq === w[1].input.seq, 'sigue la numeración de entradas del servidor');
  await until(() => D2.inbox.find(([t]) => t === S.FLOOR), 3000, 'piso para el nuevo dispositivo');
  assert.equal(room.state.players.size, 4); assert.equal(X.members.size, 4);
  assert.equal(X.g.actors.filter(a => a instanceof X.E.Player).length, 4, 'no se duplica el personaje');
  // El token ya usado no vale para un tercer intento
  const again = new Client(URL0); again.auth.token = D.token;
  assert.ok(await again.reconnect(res.body.reconnectionToken).then(() => false, () => true), 'el sitio no se puede ocupar dos veces');
  // El nuevo dispositivo juega: sus acciones cuentan (numeración continuada)
  const castsBefore = X.members.get(dSid).stats.casts;
  stop = startDriving([A, B, Cc, D2]); await wait(3000); stop(); await wait(200);
  assert.ok(X.members.get(dSid).stats.casts > castsBefore, 'las acciones del nuevo dispositivo se aplican');
  snap = await frozenCompare(room, [A, B, Cc, D2], 'fase 3');
  unfreeze(room);

  // --- Fase 4: Beto recupera la partida en otro dispositivo SIN haberse desconectado (toma del asiento)
  const bSid = B.room.sessionId;
  const live = await api('POST', '/api/rooms/resume', {}, B.token);
  assert.equal(live.status, 409); assert.equal(live.body.errorCode, ERR.LIVE_ELSEWHERE);
  const bLeft = new Promise(r => B.room.onLeave(code => r(code)));
  const take = await api('POST', '/api/rooms/resume', { takeover: true }, B.token);
  assert.equal(take.status, 200, JSON.stringify(take.body));
  assert.equal(await bLeft, ERR.TAKEN, 'el dispositivo anterior se cierra con «recuperada en otro dispositivo» (no reintenta)');
  const B2 = Object.assign({}, B, { client: new Client(URL0), inbox: [], aids: [], downs: [], seq: 0, n: 0 });
  B2.client.auth.token = B.token;
  listen(B2, await B2.client.reconnect(take.body.reconnectionToken));
  assert.equal(B2.room.sessionId, bSid);
  await until(() => B2.inbox.find(([t]) => t === S.FLOOR), 3000, 'piso de Beto en el otro dispositivo');
  await wait(1500);
  assert.equal(room.clients.filter(c => c.sessionId === bSid).length, 1, 'una sola conexión para Beto');
  assert.equal(room.state.players.size, 4);
  snap = await frozenCompare(room, [A, B2, Cc, D2], 'fase 4');
  unfreeze(room);

  // --- Fase 5: la anfitriona abandona. Regla: el liderazgo pasa al conectado más antiguo y se sigue
  const enemiesBefore = Object.keys(room.state.toJSON().enemies).sort();
  room.frozen = true;                                           // para comparar los mismos enemigos
  A.room.send(C.LEAVE, {});
  const resA = await until(() => A.inbox.find(([t]) => t === S.RESULT), 4000, 'resultado de Ana');
  assert.equal(resA[1].result, 'abandon');
  const hostEv = await until(() => B2.inbox.find(([t, m]) => t === S.EVENT && m.type === 'host'), 3000, 'aviso de nuevo anfitrión');
  assert.equal(hostEv[1].id, bSid, 'Beto (el siguiente en llegar al grupo) pasa a ser anfitrión');
  assert.equal(room.state.players.get(bSid).host, true);
  assert.equal(room.state.phase, 'playing', 'la expedición continúa');
  assert.deepEqual(Object.keys(room.state.toJSON().enemies).sort(), enemiesBefore, 'mismos enemigos: no se reinicia');
  snap = await frozenCompare(room, [B2, Cc, D2], 'fase 5');
  assert.equal(Object.keys(snap.players).length, 3);
  unfreeze(room);

  // --- Fase 6: Carla pierde la conexión y no vuelve a tiempo (ventana de HOLD s): sale sin reiniciar nada
  Cc.room.reconnection.maxRetries = 0;
  const floorN = room.state.floorN;
  serverSocket(room, Cc).ref.terminate();
  await until(() => room.state.players.get(Cc.room.sessionId)?.connected === false, 3000, 'Carla fuera de línea');
  await until(() => !room.state.players.has(Cc.room.sessionId), (HOLD + 4) * 1000, 'caduca el sitio de Carla');
  assert.equal(room.state.phase, 'playing'); assert.equal(room.state.floorN, floorN);
  const cRewards = await app.store.listRewards(Cc.account.id);
  assert.equal(cRewards.length, 1); assert.equal(cRewards[0].result, 'abandon', 'su progreso se guarda con la regla de retirada');

  // --- Final: el grupo termina la expedición; recompensas individuales una sola vez
  X.finish('return');
  const results = await Promise.all([B2, D2].map(p => until(() => p.inbox.find(([t]) => t === S.RESULT), 5000, 'resultado ' + p.name)));
  for (const [, r] of results) assert.equal(r.result, 'return');
  X.finish('clear'); await room.end(); await wait(300);                   // finales repetidos: no hacen nada
  for (const p of [A, B, Cc, D]) assert.equal((await app.store.listRewards(p.account.id)).length, 1, p.name + ': una sola recompensa');
  // Cada uno conserva SU partida: monedas iniciales propias
  for (const [p, bank] of [[B, 20], [D, 40]]) assert.ok((await app.store.getProfile(p.account.id)).save.bank >= bank);
  for (const p of [B2, D2]) await p.room.leave().catch(() => {});
});
