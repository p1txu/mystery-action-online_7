/**
 * Servidor de juego: Colyseus 0.18 (salas por WebSocket) + API HTTP de identidad y perfiles
 * registrada en el router de Colyseus (mismo puerto).
 *   npm run dev:server                    desarrollo: secreto local y perfiles en ./data (SQLite)
 *   NODE_ENV=production npm start         producción (ver .env.example y docs/DEPLOY.md)
 *
 * Cierre: Colyseus atiende SIGTERM/SIGINT (y errores no capturados): cierra las salas guardando las
 * expediciones en curso (ExpeditionRoom.onBeforeShutdown), cierra la base de datos y sale.
 */
import { createGameServer } from './app.js';
import { loadConfig } from './config.js';
import { log } from './log.js';

let config;
try { config = loadConfig(); }
catch (e) { process.stderr.write(`[config] ${e.message}\n`); process.exit(78); }   // 78 = error de configuración

process.on('unhandledRejection', e => log.error('process.unhandled_rejection', e instanceof Error ? e : { error: String(e) }));
process.on('warning', w => { if (w.name !== 'ExperimentalWarning') log.warn('process.warning', { name: w.name, message: w.message }); });

try {
  const app = await createGameServer(config);
  await app.listen();
  app.log.info('server.ready', { node: process.version, production: config.production, pid: process.pid });
} catch (e) {
  log.error('server.start_failed', e);
  process.exit(1);
}
