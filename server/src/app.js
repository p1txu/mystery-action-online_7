/** Montaje del servidor (separado de index.js para poder arrancarlo en las pruebas). */
import { defineServer, defineRoom, createRouter, createEndpoint, matchMaker } from '@colyseus/core';
import { WebSocketTransport } from '@colyseus/ws-transport';
import { IdentityService } from './identity/IdentityService.js';
import { createProfileStore } from './persistence/index.js';
import { withEncryptedAccounts } from './persistence/EncryptedAccounts.js';
import { ProfileService } from './persistence/ProfileService.js';
import { RoomRegistry } from './rooms/registry.js';
import { ExpeditionRoom } from './rooms/ExpeditionRoom.js';
import { HubRoom } from './rooms/HubRoom.js';
import { SocialService } from './social/SocialService.js';
import { HUB_ROOM } from '../../shared/social.js';
import { createApi, API_ROUTES } from './http/api.js';
import { createLogger, setLogger, log as defaultLog } from './log.js';
import { serveClient } from './http/static.js';
import { HostTunnel } from './host/HostTunnel.js';
import { ROOM_NAME, reconnectWindow, HOST_GRACE_SECONDS } from '../../shared/protocol.js';
import { readFileSync } from 'node:fs';

/** Versión del juego que sirve este servidor (version.json). El cliente y el lanzador la comparan con la suya. */
export const GAME_VERSION = (() => { try { const v = JSON.parse(readFileSync(new URL('../../version.json', import.meta.url), 'utf8')); return { version: String(v.version), build: Number(v.build) }; } catch { return { version: null, build: null }; } })();

/** IP del jugador: la conexión directa no se ve desde el router; tras N proxies de confianza, X-Forwarded-For. */
export function clientIp(headers, trustProxy) {
  if (!trustProxy) return '?';
  const list = String(headers.get('x-forwarded-for') || '').split(',').map(s => s.trim()).filter(Boolean);
  return list.length >= trustProxy ? list[list.length - trustProxy] : (list[0] || '?');
}
/** ¿Puede este origen abrir WebSockets y pedir salas? Sin cabecera Origin (herramientas, pruebas) sí. */
export function originAllowed(origin, config) {
  if (!origin || !config.production) return true;          // en desarrollo vale cualquiera (red local, móvil…)
  return config.clientOrigins.includes(origin.replace(/\/+$/, ''));
}

export async function createGameServer(config, { store: givenStore, logger } = {}) {
  const log = logger || (config.logLevel ? createLogger({ level: config.logLevel, format: config.logFormat }) : defaultLog);
  setLogger(log);
  // Usuario y nombre de cada cuenta, cifrados en la base de datos con claves derivadas del secreto del servidor
  const store = withEncryptedAccounts(givenStore || await createProfileStore(config), config.secret, log);
  await store.migrateAccounts();
  const registry = new RoomRegistry();
  const identity = new IdentityService({ secret: config.secret, store, ttlHours: config.tokenTtlHours });
  const profiles = new ProfileService({ store, registry, allowImport: config.allowProfileImport });
  const social = new SocialService({ store, log });
  HubRoom.services = { identity, profiles, social, registry, matchMaker };
  ExpeditionRoom.services = { identity, profiles, registry, reconnectSeconds: reconnectWindow(config.reconnectSeconds),
    reconnectMaxSeconds: reconnectWindow(config.reconnectMaxSeconds || 300), hostGraceSeconds: config.hostGraceSeconds ?? HOST_GRACE_SECONDS };
  const startedAt = Date.now();
  const status = async deep => {
    let db = null;
    if (deep) { try { await store.getAccount('__ping__'); db = 'ok'; } catch (e) { db = 'error'; log.error('db.ping', e); } }
    const rooms = [...registry.rooms.values()];
    return { ok: db !== 'error', version: GAME_VERSION.version, build: GAME_VERSION.build, uptime: Math.round((Date.now() - startedAt) / 1000), rooms: rooms.length, players: rooms.reduce((t, r) => t + r.clients.length, 0), db };
  };
  // Enlace para amigos (solo en el PC del anfitrión, con el juego servido aquí mismo): su origen se permite mientras esté abierto
  const host = config.hostTunnel && config.clientDir ? new HostTunnel({ port: config.port, binDir: config.hostBinDir, log,
    onUrl: url => { if (!config.clientOrigins.includes(url)) config.clientOrigins.push(url); },
    onClose: url => { const i = config.clientOrigins.indexOf(url); if (i >= 0) config.clientOrigins.splice(i, 1); } }) : null;
  const api = createApi({ identity, profiles, registry, config, status, log, host, social, hub: () => hubRoom });

  // Cada ruta de la API como endpoint del router de Colyseus; el cuerpo lo lee la propia API.
  const routes = createRouter(Object.fromEntries(API_ROUTES.map(([name, method, path]) =>
    [name, createEndpoint(path, { method, disableBody: true, requireRequest: true }, async ctx => api.web(ctx.request, clientIp(ctx.request.headers, config.trustProxy)))])));

  // Peticiones de sala (HTTP /matchmake) y WebSockets: solo desde el origen del cliente (CLIENT_ORIGIN).
  const allowed = config.production && config.clientOrigins && config.clientOrigins.length ? config.clientOrigins : null;
  if (allowed) matchMaker.controller.getCorsHeaders = headers => {
    const o = headers.get('origin');
    return { 'Access-Control-Allow-Origin': o && originAllowed(o, config) ? o : allowed[0], Vary: 'Origin' };
  };
  const transport = new WebSocketTransport({
    pingInterval: 5000, pingMaxRetries: 3,         // un corte sin cierre se detecta en ~15 s
    maxPayload: 4 * 1024,                           // los mensajes del juego ocupan ~120 bytes
    verifyClient: (info, done) => {
      const ok = originAllowed(info.origin, config);
      if (!ok) log.warn('ws.origin_rejected', { origin: info.origin });
      done(ok, 403, 'Origen no permitido');
    },
  });
  const server = defineServer({ rooms: { [ROOM_NAME]: defineRoom(ExpeditionRoom), [HUB_ROOM]: defineRoom(HubRoom) }, transport, routes, greet: false });
  // El hub social es una única sala que existe desde el arranque (los clientes entran con join, nunca la crean)
  let hubRoom = null;
  const startHub = async () => { const listing = await matchMaker.createRoom(HUB_ROOM, {}); hubRoom = matchMaker.getLocalRoomById ? matchMaker.getLocalRoomById(listing.roomId) : null; log.info('hub.ready', { room: listing.roomId }); };

  let storeClosed = false;
  const closeStore = async () => { if (storeClosed) return; storeClosed = true; await store.close(); };
  // Cierre ordenado (SIGTERM al desplegar o reiniciar): Colyseus llama a onBeforeShutdown de cada
  // sala (las expediciones se cierran guardando lo conseguido) y después a esto.
  server.onShutdown(async () => { log.info('server.shutdown', { rooms: registry.rooms.size }); if (host) host.close(); await closeStore(); });
  return {
    server, store, registry, identity, profiles, social, matchMaker, log, status, host, get hub() { return hubRoom; },
    listen: async () => { await server.listen(config.port); await startHub(); if (config.clientDir) serveClient(transport.server, config.clientDir, log); log.info('server.listening', { port: config.port, store: config.store, origins: config.clientOrigins, trustProxy: config.trustProxy || 0, reconnectSeconds: ExpeditionRoom.services.reconnectSeconds }); },
    close: async () => { if (host) host.close(); await server.gracefullyShutdown(false).catch(() => {}); await closeStore(); },
  };
}
