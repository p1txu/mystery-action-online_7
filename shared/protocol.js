/**
 * Protocolo cliente ↔ servidor de Mystery Action (cooperativo online).
 * Lo importan el servidor (validación) y el cliente (envío). Sin dependencias.
 *
 * Reglas de autoridad:
 *  - El cliente solo envía INTENCIONES: ejes de movimiento muestreados a 120 Hz, acciones
 *    (básico, movimiento 0-3, esquiva) con su dirección, uso de objetos y "estoy listo".
 *  - El servidor simula con el mismo motor y decide posición, daño, enemigos y botín.
 *  - Nada que llegue del cliente cambia PS, monedas, experiencia ni inventario directamente.
 */
export const PROTOCOL_VERSION = 1;
export const ROOM_NAME = 'expedition';
export const MAX_PLAYERS = 4;
export const SIM_STEP = 1 / 120;            // igual que CONFIG.STEP del prototipo
export const INPUT_SEND_MS = 50;            // el cliente agrupa muestras y envía 20 veces por segundo
export const MAX_INPUT_BACKLOG = 30;        // muestras pendientes como máximo (250 ms): lo demás se descarta
export const MAX_SAMPLES_PER_MSG = 16;
/** Segundos que se guarda el sitio de quien pierde la conexión (por defecto; el servidor lo
 *  configura con RECONNECT_SECONDS y lo comunica en WELCOME). */
export const RECONNECT_SECONDS = 45;
export const RECONNECT_MIN = 5, RECONNECT_MAX = 900;
/** Tiempos de reconexión entre los que puede elegir el anfitrión (el servidor quita los que superan su máximo). */
export const RECONNECT_CHOICES = [30, 45, 60, 120, 300];
/** Segundos que se espera a un anfitrión desconectado antes de pasar el liderazgo (HOST_GRACE_SECONDS). */
export const HOST_GRACE_SECONDS = 10;
/**
 * Anfitrión LÓGICO (un jugador) ≠ servidor TÉCNICO (el proceso Colyseus que aloja la sala).
 * El anfitrión es quien crea la sala: invita (código o enlace), elige las opciones de expedición
 * (mazmorra y tiempo de reconexión) e inicia la partida. La sala, la simulación, los enemigos y el
 * guardado viven en el servidor: no dependen del navegador del anfitrión.
 *
 * Regla de liderazgo (explícita):
 *  - el anfitrión puede CEDER el liderazgo a otro integrante conectado («Ceder liderazgo»);
 *  - si el anfitrión pierde la conexión, tras HOST_GRACE_SECONDS el liderazgo pasa al integrante
 *    conectado que lleva más tiempo en el grupo (si vuelve, sigue jugando como uno más);
 *  - si abandona, igual, al momento.
 * La expedición continúa siempre: nunca se reinicia ni se cierra por la salida de una persona.
 */
/**
 * Dificultad del cooperativo según los jugadores que siguen en la expedición (los que salen del
 * grupo dejan de contar; un desconectado sigue contando porque puede volver).
 *  hp      PS de cada enemigo normal          bossHp  PS del guardián (un solo objetivo para todos)
 *  dmg     daño de los enemigos               count   enemigos de cada piso (y del nido de monstruos)
 *  elite   probabilidad extra de élite        wander  errantes extra permitidos a la vez
 *  spawn   frecuencia de errantes (×)
 * Con 1 jugador todo vale 1: la expedición es idéntica a la de antes.
 * El tamaño del mapa según el grupo está en FloorGen.SIZES (prototipo), porque lo usa el generador.
 */
export const COOP_SCALING = Object.freeze({
  // Casi los mismos enemigos que en solitario (como mucho +20 % con 4) pero bastante más duros: más PS y más daño.
  1: Object.freeze({ hp: 1, bossHp: 1, dmg: 1, count: 1, elite: 0, wander: 0, spawn: 1 }),
  2: Object.freeze({ hp: 1.7, bossHp: 1.9, dmg: 1.15, count: 1.1, elite: .05, wander: 1, spawn: 1.05 }),
  3: Object.freeze({ hp: 2.3, bossHp: 2.7, dmg: 1.25, count: 1.15, elite: .08, wander: 2, spawn: 1.1 }),
  4: Object.freeze({ hp: 2.9, bossHp: 3.5, dmg: 1.35, count: 1.2, elite: .12, wander: 3, spawn: 1.15 }),
});
export function coopScaling(n) { return COOP_SCALING[Math.max(1, Math.min(MAX_PLAYERS, n | 0))]; }
/** Texto corto para el jugador: «2 jugadores: enemigos +35 %, PS ×1,45, daño +6 %». */
export function coopSummary(n) {
  const c = coopScaling(n), pc = v => Math.round((v - 1) * 100), x = v => String(v).replace('.', ',');
  if ((n | 0) <= 1) return '1 jugador: dificultad normal';
  return `${n} jugadores: enemigos +${pc(c.count)} %, PS ×${x(c.hp)} (guardián ×${x(c.bossHp)}), daño +${pc(c.dmg)} %, mapa más grande y pasillos anchos`;
}

export const HOST_RULE = 'transfer-oldest';
export const HOST_RULE_TEXT = 'El anfitrión puede ceder el liderazgo. Si se desconecta o abandona, pasa a quien lleve más tiempo en el grupo y la expedición continúa.';
export const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';   // sin 0/O ni 1/I
export const CODE_LENGTH = 6;

/** Mensajes del cliente al servidor. */
export const C = {
  INPUT: 'in',          // { s: primera secuencia, m: [[ax, ay], ...], a: [{ n, at, k, i?, dx, dy, d }] }  (n: nº de acción, creciente)
  READY: 'ready',       // { ready: bool }   (sala de espera)
  DUNGEON: 'dungeon',   // { dungeon }       (solo el anfitrión; equivale a OPTIONS { dungeon })
  OPTIONS: 'options',   // { dungeon?, reconnect? }  (solo el anfitrión, en la sala de espera; los demás vuelven a «no listo»)
  HOST: 'host',         // { to }            (solo el anfitrión: ceder el liderazgo a otro integrante conectado)
  START: 'start',       // { dungeon }       (solo el anfitrión)
  USE: 'use',           // { id }            (objeto del inventario)
  DROP: 'drop',         // { id }            (dejar 1 unidad en el suelo para que la coja cualquiera)
  BOON: 'boon',         // { id }            (don elegido de la oferta que el servidor le hizo a ESE jugador)
  LEAVE: 'leave',       // {}                (retirarse: cuenta como caer, se guarda y se recibe el resultado)
  PING: 'ping',         // { t }
};
/** Mensajes del servidor al cliente (además del estado sincronizado). */
export const S = {
  WELCOME: 'welcome',   // { sessionId, code, host, save }  (save = SOLO la partida de quien lo recibe)
  FLOOR: 'floor',       // { seed, dungeon, floorNo, genNo, kind, step, total, label }
  EVENT: 'ev',          // eventos visuales: daño, derribo, botín, subida de nivel...
  RESULT: 'result',     // { result, success, lines, summary, profile }
  REJECT: 'reject',     // { what, why }  (acción rechazada: solo informativo)
  PONG: 'pong',
};

/**
 * Errores al unirse o crear una sala (ServerError del servidor / respuesta de la API).
 * Fuera de los rangos reservados por Colyseus (4000-4003, 4010 y 520-526).
 */
export const ERR = {
  SESSION: 4401,        // token ausente, manipulado o caducado
  NOT_FOUND: 4404,      // el código no corresponde a ninguna sala abierta
  FULL: 4409,           // 4 de 4
  STARTED: 4423,        // la expedición ya empezó: no se admite gente nueva
  DUPLICATE: 4410,      // esta cuenta ya está en esta sala (otra pestaña o dispositivo)
  OTHER_ROOM: 4411,     // esta cuenta está en otra sala
  NO_PROFILE: 4412,     // sin partida en el servidor
  LIVE_ELSEWHERE: 4413, // esa cuenta sigue conectada al grupo desde otro sitio
  NO_SEAT: 4414,        // no hay ningún sitio guardado para esta cuenta
  TAKEN: 4415,          // cierre: la partida se ha recuperado en otro dispositivo (no se reintenta)
  VERSION: 4426,        // cliente de otra versión del protocolo
};
const MESSAGES = {
  [ERR.SESSION]: 'Tu sesión no es válida o ha caducado. Vuelve a entrar como invitado.',
  [ERR.NOT_FOUND]: 'No hay ninguna sala abierta con ese código. Revisa que esté bien escrito.',
  [ERR.FULL]: `La sala está llena (${MAX_PLAYERS} de ${MAX_PLAYERS}).`,
  [ERR.STARTED]: 'Ese grupo ya ha empezado la expedición; ya no se puede entrar.',
  [ERR.DUPLICATE]: 'Ya estás dentro de esta sala (quizá en otra pestaña o dispositivo). Usa «Volver a mi grupo».',
  [ERR.OTHER_ROOM]: 'Ya estás en otro grupo. Abandónalo antes de unirte a este.',
  [ERR.NO_PROFILE]: 'Necesitas una partida en el servidor: súbela o crea un perfil nuevo.',
  [ERR.LIVE_ELSEWHERE]: 'Sigues conectado a ese grupo desde otra pestaña o dispositivo. Ciérralo o usa «Recuperar aquí».',
  [ERR.TAKEN]: 'Has recuperado esta partida en otro dispositivo; aquí se ha cerrado.',
  [ERR.NO_SEAT]: 'No tienes ningún grupo al que volver (quizá ya caducó tu sitio).',
  [ERR.VERSION]: 'Tu versión del juego no coincide con la del servidor. Recarga la página.',
  522: 'Esa sala ya no existe o está llena.',            // Colyseus: MATCHMAKE_INVALID_ROOM_ID
  524: 'La reserva de plaza ha caducado. Vuelve a intentarlo.',   // Colyseus: MATCHMAKE_EXPIRED
};
/** Ventana de reconexión válida (segundos) a partir de un valor de configuración. */
export function reconnectWindow(v) {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.round(clampN(n, RECONNECT_MIN, RECONNECT_MAX)) : RECONNECT_SECONDS;
}
const clampN = (v, a, b) => v < a ? a : v > b ? b : v;
/** Mensaje comprensible para un código de error (de la sala, la API o la red). */
export function errorMessage(code, fallback) {
  return MESSAGES[code] || fallback || 'Error inesperado del servidor.';
}

const num = v => typeof v === 'number' && Number.isFinite(v);
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;

export function isValidCode(code) {
  return typeof code === 'string' && code.length === CODE_LENGTH && [...code].every(ch => CODE_ALPHABET.includes(ch));
}
export function normalizeCode(code) { return typeof code === 'string' ? code.trim().toUpperCase().replace(/[^A-Z0-9]/g, '') : ''; }

/** Normaliza un eje: componentes finitas y longitud ≤ 1 (un cliente no puede pedir más velocidad). */
export function cleanAxis(ax, ay) {
  if (!num(ax) || !num(ay)) return [0, 0];
  const l = Math.hypot(ax, ay);
  if (l > 1) return [ax / l, ay / l];
  return [Math.round(ax * 1000) / 1000, Math.round(ay * 1000) / 1000];
}

/**
 * Valida un mensaje INPUT. Devuelve { s, samples, actions } o null si no tiene forma válida.
 * No decide si la acción es posible (enfriamiento, energía...): eso lo hace la simulación.
 */
export function parseInput(msg) {
  if (!msg || typeof msg !== 'object' || !Number.isInteger(msg.s) || msg.s < 0) return null;
  if (!Array.isArray(msg.m) || msg.m.length > MAX_SAMPLES_PER_MSG) return null;
  const samples = msg.m.map(p => Array.isArray(p) ? cleanAxis(p[0], p[1]) : [0, 0]);
  const actions = [];
  for (const a of Array.isArray(msg.a) ? msg.a.slice(0, 8) : []) {
    if (!a || !Number.isInteger(a.at) || a.at < msg.s || a.at >= msg.s + samples.length) continue;
    if (!['b', 'm', 'd', 'r'].includes(a.k)) continue;                                // r: soltar una habilidad cargada
    if ((a.k === 'm' || a.k === 'r') && !(Number.isInteger(a.i) && a.i >= 0 && a.i < 5)) continue;   // 0-3: Q E R F · 4: definitivo (G)
    let dx = num(a.dx) ? a.dx : 0, dy = num(a.dy) ? a.dy : 0; const l = Math.hypot(dx, dy);
    if (l < 1e-3) { dx = 0; dy = 1; } else { dx /= l; dy /= l; }
    actions.push({ n: Number.isInteger(a.n) && a.n >= 0 ? a.n : undefined, at: a.at, k: a.k, i: a.k === 'm' || a.k === 'r' ? a.i : 0, dx, dy, d: num(a.d) ? clamp(a.d, 0, 600) : 0 });
  }
  return { s: msg.s, samples, actions };
}
