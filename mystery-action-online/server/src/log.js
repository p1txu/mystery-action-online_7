/**
 * Registros del servidor: una línea por suceso en la salida estándar (los recoge Docker, Fly,
 * systemd…). En producción, JSON (LOG_FORMAT=json) para poder filtrar; en desarrollo, legible.
 * Nunca se escriben tokens, contraseñas ni secretos: las claves con esos nombres se ocultan.
 *
 *   log.info('room.start', { room, dungeon, players })
 *   → {"t":"2026-10-23T20:00:00.000Z","level":"info","msg":"room.start","room":"abc","dungeon":"bosque","players":4}
 */
const LEVELS = { debug: 10, info: 20, warn: 30, error: 40, silent: 99 };
const SECRET = /token|password|passw|secret|authorization|cookie|hash/i;

function clean(v, depth = 0) {
  if (v instanceof Error) return { error: v.message, code: v.code, stack: v.stack && v.stack.split('\n').slice(0, 6).join(' | ') };
  if (!v || typeof v !== 'object' || depth > 3) return v;
  if (Array.isArray(v)) return v.slice(0, 20).map(x => clean(x, depth + 1));
  const out = {};
  for (const [k, x] of Object.entries(v)) out[k] = SECRET.test(k) ? '[oculto]' : clean(x, depth + 1);
  return out;
}

export function createLogger({ level = 'info', format = 'pretty', out = process.stdout, err = process.stderr, base = {} } = {}) {
  const min = LEVELS[level] ?? LEVELS.info;
  function write(lvl, msg, data) {
    if (LEVELS[lvl] < min) return;
    const rec = Object.assign({ t: new Date().toISOString(), level: lvl, msg }, base, data instanceof Error ? clean(data) : clean(data || {}));
    let line;
    if (format === 'json') line = JSON.stringify(rec);
    else {
      const extra = Object.entries(rec).filter(([k]) => !['t', 'level', 'msg'].includes(k)).map(([k, x]) => `${k}=${typeof x === 'object' ? JSON.stringify(x) : x}`).join(' ');
      line = `${rec.t.slice(11, 23)} ${lvl.toUpperCase().padEnd(5)} ${msg}${extra ? ' · ' + extra : ''}`;
    }
    (LEVELS[lvl] >= LEVELS.warn ? err : out).write(line + '\n');
  }
  return {
    level, format,
    debug: (m, d) => write('debug', m, d), info: (m, d) => write('info', m, d),
    warn: (m, d) => write('warn', m, d), error: (m, d) => write('error', m, d),
    child: extra => createLogger({ level, format, out, err, base: Object.assign({}, base, extra) }),
  };
}

/** Registro global del proceso (lo configura createGameServer). */
export let log = createLogger({ level: process.env.LOG_LEVEL || 'info', format: process.env.LOG_FORMAT || (process.env.NODE_ENV === 'production' ? 'json' : 'pretty') });
export function setLogger(l) { log = l; }
/** Identificador corto de cuenta para los registros (no hace falta el completo). */
export const shortId = id => typeof id === 'string' ? id.slice(0, 8) : id;
