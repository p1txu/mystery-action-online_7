/**
 * Parte social siempre online con Colyseus REAL y el SDK REAL: amigos por código, bloqueos, presencia,
 * grupo persistente, chat con filtro y límites, aldea compartida (solo tu grupo) y expedición del
 * grupo creada por el servidor (solo sus miembros pueden entrar).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { Client } from '@colyseus/sdk';
import { createGameServer } from '../../server/src/app.js';
import { MemoryProfileStore } from '../../server/src/persistence/ProfileStore.js';
import { S, ERR, PROTOCOL_VERSION } from '../../shared/protocol.js';
import { HUB_ROOM, HC, HS, HUB_ERR, CHAT_RATE } from '../../shared/social.js';
import { E, freshSave } from '../helpers.mjs';

const PORT = 3000 + Math.floor(Math.random() * 300), URL0 = `http://127.0.0.1:${PORT}`;
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

/** Jugador: cuenta + perfil + conexión al hub (con todo lo que recibe). */
async function player(name, species = 'guerrero', patch = {}) {
  const g = await api('POST', '/api/auth/guest', { name });
  const save = E.Save.sanitize(Object.assign(freshSave(species), patch)).data;
  await app.store.putProfile(g.body.account.id, save);
  const p = { name, token: g.body.token, id: g.body.account.id, client: new Client(URL0), inbox: [], hub: null };
  return p;
}
async function connect(p) {
  p.hub = await p.client.join(HUB_ROOM, { token: p.token, protocol: PROTOCOL_VERSION });
  for (const t of Object.values(HS)) p.hub.onMessage(t, m => p.inbox.push([t, m]));
  await until(() => p.inbox.find(([t]) => t === HS.HELLO), 4000, p.name + ' HELLO');
  return p;
}
const last = (p, type) => { for (let i = p.inbox.length - 1; i >= 0; i--) if (p.inbox[i][0] === type) return p.inbox[i][1]; return undefined; };
const all = (p, type) => p.inbox.filter(([t]) => t === type).map(([, m]) => m);
const hello = p => last(p, HS.HELLO);
const friendsOf = p => last(p, HS.FRIENDS) || hello(p);
const clear = (...ps) => ps.forEach(p => { p.inbox.length = 0; });

test('amigos por código: solicitud, aceptar, presencia en vivo, borrar y bloquear (y el bloqueado no lo sabe)', { timeout: 30000 }, async () => {
  const [A, B, C] = await Promise.all([player('Ana'), player('Beto'), player('Cris')]);
  await Promise.all([connect(A), connect(B), connect(C)]);
  const codeA = hello(A).me.code, codeB = hello(B).me.code;
  assert.match(codeA, /^[A-HJ-NP-Z2-9]{6}$/);
  // Mismo código siempre para la misma cuenta
  assert.equal((await api('GET', '/api/friends', null, A.token)).body.code, codeA);
  // B pide amistad a A con «Ana#CODIGO»
  const r = await api('POST', '/api/friends/request', { code: 'Ana#' + codeA.toLowerCase() }, B.token);
  assert.equal(r.status, 200); assert.equal(r.body.status, 'pending');
  await until(() => friendsOf(A).incoming.some(x => x.id === B.id), 3000, 'A ve la solicitud al momento');
  assert.ok(friendsOf(B).outgoing.some(x => x.id === A.id));
  // Errores claros
  assert.equal((await api('POST', '/api/friends/request', { code: codeA }, A.token)).status, 400, 'tu propio código');
  assert.equal((await api('POST', '/api/friends/request', { code: 'ZZZZZZ' }, A.token)).status, 404, 'código inexistente');
  // A acepta → amigos, y cada uno ve al otro conectado
  assert.equal((await api('POST', '/api/friends/respond', { id: B.id, accept: true }, A.token)).body.status, 'accepted');
  await until(() => friendsOf(B).friends.some(f => f.id === A.id && f.online), 3000, 'B ve a A conectado');
  // Presencia: B entra en la aldea → A lo ve
  B.hub.send(HC.WHERE, { where: 'village' });
  await until(() => all(A, HS.PRESENCE).some(m => m.id === B.id && m.where === 'village'), 3000, 'presencia «en la aldea»');
  // Si los dos se envían solicitud, queda aceptada
  await api('POST', '/api/friends/request', { code: hello(C).me.code }, A.token);
  const both = await api('POST', '/api/friends/request', { code: codeA }, C.token);
  assert.equal(both.body.status, 'accepted');
  // Borrar amigo
  await api('POST', '/api/friends/remove', { id: C.id }, A.token);
  assert.ok(!(await api('GET', '/api/friends', null, A.token)).body.friends.some(f => f.id === C.id));
  // Bloquear: C ya no puede enviarle solicitudes y recibe el mismo mensaje que con un código inexistente
  await api('POST', '/api/friends/block', { id: C.id }, A.token);
  const blocked = await api('POST', '/api/friends/request', { code: codeA }, C.token);
  const none = await api('POST', '/api/friends/request', { code: 'ZZZZZZ' }, C.token);
  assert.equal(blocked.status, 404); assert.equal(blocked.body.error, none.body.error);
  assert.ok((await api('GET', '/api/friends', null, A.token)).body.blocked.some(x => x.id === C.id));
  // Desconexión → B ve a A desconectado (tras el margen de reconexión del hub, al cerrar del todo)
  await A.hub.leave(true);
  await until(() => all(B, HS.PRESENCE).some(m => m.id === A.id && !m.online), 4000, 'A desconectado');
  await Promise.all([B.hub.leave(true), C.hub.leave(true)]);
});

test('grupo persistente: invitar solo a amigos, chat filtrado y limitado, aldea compartida solo con tu grupo, expedición del grupo', { timeout: 60000 }, async () => {
  const [A, B, C, D] = await Promise.all([player('Ana', 'guerrero'), player('Beto', 'mago'), player('Cris', 'arquero'), player('Dani', 'asesino')]);
  await Promise.all([connect(A), connect(B), connect(C), connect(D)]);
  const code = p => hello(p).me.code;
  for (const p of [B, C]) { await api('POST', '/api/friends/request', { code: code(A) }, p.token); await api('POST', '/api/friends/respond', { id: p.id, accept: true }, A.token); }
  // D no es amigo: no se le puede invitar
  A.hub.send(HC.INVITE, { to: D.id });
  await until(() => all(A, HS.NOTICE).some(n => /amigos/.test(n.text)), 3000, 'aviso: solo amigos');
  assert.ok(!all(D, HS.INVITE).length);
  // Invitar a B → B acepta
  A.hub.send(HC.INVITE, { to: B.id });
  const inv = await until(() => last(B, HS.INVITE), 3000, 'B recibe la invitación');
  assert.equal(inv.from.name, 'Ana');
  B.hub.send(HC.ACCEPT, { party: inv.party });
  await until(() => { const p = last(A, HS.PARTY); return p && p.members.length === 2 && p.leader === A.id; }, 3000, 'grupo de 2 con Ana de líder');
  assert.deepEqual(last(B, HS.PARTY).members.map(m => m.name).sort(), ['Ana', 'Beto']);
  assert.ok(last(B, HS.PARTY).members.find(m => m.id === B.id).species === 'mago', 'la clase de cada uno, del perfil del servidor');
  // Una invitación ajena no sirve (D intenta aceptar sin invitación)
  D.hub.send(HC.ACCEPT, { party: inv.party });
  await until(() => all(D, HS.NOTICE).some(n => /no es válida/.test(n.text)), 3000, 'D no puede colarse');
  // Chat: llega filtrado a los del grupo y a nadie más
  clear(A, B, C, D);
  A.hub.send(HC.CHAT, { text: 'hola equipo, eres un idiota jaja' });
  const got = await until(() => last(B, HS.CHAT), 3000, 'B recibe el chat');
  assert.equal(got.text, 'hola equipo, eres un ****** jaja'); assert.equal(got.name, 'Ana');
  await wait(200); assert.ok(!all(C, HS.CHAT).length && !all(D, HS.CHAT).length, 'fuera del grupo no llega');
  // Límite de frecuencia
  for (let i = 0; i < CHAT_RATE.n + 2; i++) A.hub.send(HC.CHAT, { text: 'mensaje ' + i });
  await until(() => all(A, HS.NOTICE).some(n => /rápido/.test(n.text)), 3000, 'aviso de frecuencia');
  await wait(200);
  assert.ok(all(B, HS.CHAT).length <= CHAT_RATE.n, `como mucho ${CHAT_RATE.n} en 10 s (${all(B, HS.CHAT).length})`);
  // Mensajes que no son texto o vacíos: se ignoran
  A.hub.send(HC.CHAT, { text: { x: 1 } }); A.hub.send(HC.CHAT, { text: '   ' });
  // Aldea: A y B en la aldea se ven; C (en la aldea pero fuera del grupo) no ve a nadie ni nadie le ve
  for (const p of [A, B, C]) p.hub.send(HC.WHERE, { where: 'village' });
  await wait(150);
  A.hub.send(HC.POS, { x: 500, y: 400, fx: 1, fy: 0, m: true });
  B.hub.send(HC.POS, { x: 520, y: 410, fx: 0, fy: 1, m: false });
  C.hub.send(HC.POS, { x: 530, y: 420, fx: 0, fy: 1, m: false });
  const va = await until(() => { const v = last(A, HS.VILLAGE); return v && v.list.length ? v : null; }, 3000, 'A ve a B en la aldea');
  assert.deepEqual(va.list.map(x => [x.name, x.x, x.y, x.species]), [['Beto', 520, 410, 'mago']]);
  const vb = await until(() => { const v = last(B, HS.VILLAGE); return v && v.list.length ? v : null; }, 3000, 'B ve a A');
  assert.equal(vb.list[0].name, 'Ana'); assert.equal(vb.list[0].m, true);
  assert.ok(!all(C, HS.VILLAGE).some(v => v.list.length), 'C no ve a nadie');
  // Posiciones imposibles: se ignoran
  A.hub.send(HC.POS, { x: 1e9, y: -5 }); await wait(250);
  assert.equal(last(B, HS.VILLAGE).list[0].x, 500);
  // Al salir de la aldea, los demás dejan de verle
  B.hub.send(HC.WHERE, { where: 'menu' });
  await until(() => { const v = last(A, HS.VILLAGE); return v && v.list.length === 0; }, 3000, 'B ya no está en la aldea de A');
  B.hub.send(HC.WHERE, { where: 'village' });

  // --- Expedición del grupo: solo el líder la elige; el servidor la crea y empieza sola con los dos dentro
  clear(A, B, C, D);
  B.hub.send(HC.GO, { dungeon: 'bosque' });
  await until(() => all(B, HS.NOTICE).some(n => /líder/.test(n.text)), 3000, 'solo el líder');
  A.hub.send(HC.GO, { dungeon: 'gruta' });
  await until(() => all(A, HS.NOTICE).some(n => /desbloqueado/.test(n.text)), 3000, 'mazmorra no desbloqueada');
  A.hub.send(HC.GO, { dungeon: 'bosque' });
  const goA = await until(() => last(A, HS.GO), 4000, 'A recibe GO'), goB = await until(() => last(B, HS.GO), 4000, 'B recibe GO');
  assert.equal(goA.roomId, goB.roomId); assert.equal(goA.dungeon, 'bosque');
  // Alguien de fuera con el código no puede entrar
  const opts = (p, x = {}) => Object.assign({ token: p.token, protocol: PROTOCOL_VERSION }, x);
  let err = null; try { await D.client.joinById(goA.roomId, opts(D, { code: goA.code })); } catch (e) { err = e.code; }
  assert.equal(err, ERR.NOT_FOUND, 'expedición de otro grupo');
  // Entran los dos (B primero): empieza sola y Ana es la anfitriona
  const rB = await B.client.joinById(goA.roomId, opts(B, { code: goA.code })), fB = [];
  rB.onMessage(S.FLOOR, m => fB.push(m)); rB.onMessage('*', () => {});
  await wait(200);
  assert.equal(rB.state.toJSON().phase, 'lobby', 'espera a todo el grupo');
  const rA = await A.client.joinById(goA.roomId, opts(A, { code: goA.code })), fA = [];
  rA.onMessage(S.FLOOR, m => fA.push(m)); rA.onMessage('*', () => {});
  await until(() => fA.length && fB.length, 5000, 'empieza la expedición para los dos');
  const st = rA.state.toJSON(), host = Object.values(st.players).find(p => p.host);
  assert.equal(st.phase, 'playing'); assert.equal(host.name, 'Ana'); assert.equal(Object.keys(st.players).length, 2);
  // Presencia: «en una mazmorra» para sus amigos
  await until(() => { const p = last(C, HS.FRIENDS); return true; }, 10);
  const view = (await api('GET', '/api/friends', null, C.token)).body.friends.find(f => f.id === A.id);
  assert.equal(view.where, 'dungeon');
  // El grupo sigue existiendo durante y después de la expedición
  assert.equal(last(A, HS.PARTY) ? last(A, HS.PARTY).members.length : 2, 2);
  await rA.leave(true); await rB.leave(true);

  // --- Liderazgo: ceder, expulsar, y si el líder se desconecta pasa a otro
  A.hub.send(HC.INVITE, { to: C.id });
  const inv2 = await until(() => last(C, HS.INVITE), 3000, 'C invitado');
  C.hub.send(HC.ACCEPT, { party: inv2.party });
  await until(() => { const p = last(A, HS.PARTY); return p && p.members.length === 3; }, 3000, 'grupo de 3');
  A.hub.send(HC.KICK, { id: C.id });
  await until(() => last(C, HS.PARTY) === null && all(C, HS.NOTICE).some(n => /sacado/.test(n.text)), 3000, 'C expulsado');
  A.hub.send(HC.LEAD, { id: B.id });
  await until(() => { const p = last(A, HS.PARTY); return p && p.leader === B.id; }, 3000, 'B es líder');
  B.hub.send(HC.LEAD, { id: A.id });
  await until(() => { const p = last(B, HS.PARTY); return p && p.leader === A.id; }, 3000, 'A vuelve a ser líder');
  await A.hub.leave(true);
  await until(() => { const p = last(B, HS.PARTY); return p && p.leader === B.id; }, 4000, 'el liderazgo pasa a quien sigue conectado');
  // A vuelve: sigue en el grupo y recibe el historial del chat
  A.inbox.length = 0; await connect(A);
  assert.ok(hello(A).party && hello(A).party.members.some(m => m.id === A.id), 'A sigue en el grupo al volver');
  assert.ok(hello(A).chat.some(m => m.text.startsWith('hola equipo')), 'historial del chat');
  // Salir del grupo: con uno solo, el grupo se deshace
  B.hub.send(HC.LEAVE, {});
  await until(() => last(A, HS.PARTY) === null, 3000, 'grupo deshecho');
  for (const p of [A, B, C, D]) await p.hub.leave(true).catch(() => {});
});

test('una cuenta, una conexión: al entrar desde otra pestaña se cierra la anterior', { timeout: 15000 }, async () => {
  const A = await player('Ana');
  await connect(A);
  const first = A.hub; let code = null; first.onLeave(c => { code = c; });
  const other = { ...A, client: new Client(URL0), inbox: [] };
  await connect(other);
  await until(() => code !== null, 3000, 'la primera conexión se cierra');
  assert.equal(code, HUB_ERR.REPLACED);
  await other.hub.leave(true);
});

test('el hub rechaza tokens falsos', async () => {
  const c = new Client(URL0);
  let err = null; try { await c.join(HUB_ROOM, { token: 'x.y', protocol: PROTOCOL_VERSION }); } catch (e) { err = e.code; }
  assert.equal(err, ERR.SESSION);
});
