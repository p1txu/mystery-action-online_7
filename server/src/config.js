/**
 * Configuración del servidor desde variables de entorno. No hay credenciales por defecto:
 * en producción AUTH_SECRET es obligatorio. En desarrollo se genera un secreto aleatorio
 * local (data/.dev-secret, fuera del control de versiones) y se avisa por consola.
 */
import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { reconnectWindow } from '../../shared/protocol.js';

export function loadConfig(env = process.env) {
  const production = env.NODE_ENV === 'production';
  // Partida en el PC del anfitrión (lanzador): el juego puede abrir un enlace público (túnel) para los amigos
  const hostTunnel = env.HOST_TUNNEL === '1';
  const dataDir = resolve(env.DATA_DIR || './data');
  let secret = env.AUTH_SECRET || '';
  if (!secret) {
    if (production) throw new Error('Falta AUTH_SECRET (obligatorio con NODE_ENV=production). Genera uno con: node -e "console.log(require(\'crypto\').randomBytes(48).toString(\'base64url\'))"');
    mkdirSync(dataDir, { recursive: true });
    const f = join(dataDir, '.dev-secret');
    if (existsSync(f)) secret = readFileSync(f, 'utf8').trim();
    else { secret = randomBytes(48).toString('base64url'); writeFileSync(f, secret, { mode: 0o600 }); }
    console.warn('[config] AUTH_SECRET no definido: usando un secreto de desarrollo local en ' + f + ' (no lo uses en producción).');
  }
  if (secret.length < 32) throw new Error('AUTH_SECRET debe tener al menos 32 caracteres');
  const store = env.PROFILE_STORE || 'sqlite';
  if (!['sqlite', 'postgres', 'memory'].includes(store)) throw new Error('PROFILE_STORE debe ser sqlite, postgres o memory');
  if (store === 'postgres' && !env.DATABASE_URL) throw new Error('PROFILE_STORE=postgres necesita DATABASE_URL');
  if (production && store === 'memory') throw new Error('PROFILE_STORE=memory pierde los perfiles al reiniciar: no se permite en producción');
  // Desarrollo sin CLIENT_ORIGIN: cualquier origen («*»), para probar desde otro ordenador de la red local
  const clientOrigins = (env.CLIENT_ORIGIN || (production ? '' : '*')).split(',').map(s => s.trim().replace(/\/+$/, '')).filter(Boolean);
  if (production && clientOrigins.includes('*')) throw new Error('CLIENT_ORIGIN=* no se permite en producción: indica la dirección https:// exacta del juego');
  if (production && !clientOrigins.length) throw new Error('Falta CLIENT_ORIGIN (la dirección https:// desde la que se abre el juego, p. ej. https://juego.tudominio.es)');
  for (const o of clientOrigins.filter(x => x !== '*')) {
    if (!/^https?:\/\/[^/\s]+$/.test(o)) throw new Error(`CLIENT_ORIGIN no válido: «${o}» (formato: https://dominio, sin ruta)`);
    // Anfitrión en casa (HOST_TUNNEL=1): también los otros ordenadores de la red local por http://IP-privada
    const lan = hostTunnel && /^http:\/\/(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)[\d.]+(:\d+)?$/.test(o);
    if (production && o.startsWith('http://') && !lan && !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(o)) throw new Error(`En producción el cliente debe servirse por HTTPS: «${o}»`);
  }
  const trustProxy = Math.max(0, Math.min(5, parseInt(env.TRUST_PROXY || '0', 10) || 0));
  return {
    production, dataDir, secret, store,
    port: Number(env.PORT) || 2567,
    databaseUrl: env.DATABASE_URL || '',
    clientOrigins,
    // Número de proxies de confianza delante del servidor (Caddy, Fly, Render…): de ellos se toma la IP real
    // del jugador (X-Forwarded-For) para los límites de intentos. 0 = conexión directa.
    trustProxy,
    logLevel: env.LOG_LEVEL || 'info',
    logFormat: env.LOG_FORMAT || (production ? 'json' : 'pretty'),
    tokenTtlHours: Number(env.TOKEN_TTL_HOURS) || 24 * 30,
    // Subir una partida local NO es seguro (el servidor no puede comprobar cómo se consiguió): desactivado
    // siempre salvo que se active a mano para desarrollo; en producción no se puede activar.
    allowProfileImport: !production && env.ALLOW_PROFILE_IMPORT === 'true',
    sqliteFile: env.SQLITE_FILE || '',
    // Carpeta del cliente compilado que este mismo servidor sirve (modo anfitrión: un solo puerto). Vacío = no sirve el juego.
    clientDir: env.CLIENT_DIR ? resolve(env.CLIENT_DIR) : '',
    // «Invitar amigos» desde el juego: túnel de Cloudflare bajo demanda (solo lo usa el lanzador, nunca en la nube)
    hostTunnel, hostBinDir: resolve(env.HOST_BIN_DIR || './tools/bin'),
    // Segundos que se guarda el sitio de un jugador que pierde la conexión (5-900; por defecto 45)
    reconnectSeconds: reconnectWindow(env.RECONNECT_SECONDS),
    // Máximo que puede elegir el anfitrión para su sala (de RECONNECT_CHOICES); por defecto 300
    reconnectMaxSeconds: reconnectWindow(env.RECONNECT_MAX_SECONDS || 300),
    // Segundos que se espera a un anfitrión desconectado antes de pasar el liderazgo (0-120)
    hostGraceSeconds: Math.max(0, Math.min(120, Number.isFinite(+env.HOST_GRACE_SECONDS) && env.HOST_GRACE_SECONDS !== '' && env.HOST_GRACE_SECONDS != null ? +env.HOST_GRACE_SECONDS : 10)),
  };
}
