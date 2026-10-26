/**
 * Parte social del juego online (siempre conectado): amigos, presencia, grupo persistente, aldea
 * compartida y chat. Lo importan el servidor (validación) y el cliente. Sin dependencias.
 *
 * Una conexión «hub» por cuenta mientras se juega (sala de Colyseus HUB_ROOM, única en el servidor):
 *  - el servidor sabe quién está conectado y dónde (menú, aldea o mazmorra) y se lo cuenta a sus amigos;
 *  - las solicitudes de amistad e invitaciones llegan al momento;
 *  - el grupo (líder + hasta 3 más) vive en el servidor y no se deshace al acabar una mazmorra;
 *  - en la aldea, cada uno envía su posición y el servidor la reenvía SOLO a los de su grupo
 *    que también estén en la aldea (cada grupo ve su propia aldea);
 *  - chat del grupo: texto libre con filtro, longitud y frecuencia limitadas; silenciar y bloquear.
 * Las amistades se gestionan por la API HTTP (/api/friends…); el hub solo avisa de los cambios.
 */
export const HUB_ROOM = 'hub';
export const PARTY_MAX = 4;
export const FRIENDS_MAX = 100;
export const PENDING_MAX = 30;                 // solicitudes enviadas sin responder
export const FRIEND_CODE_LENGTH = 6;
export const CHAT_MAX = 140;                   // caracteres por mensaje
export const CHAT_RATE = { n: 5, ms: 10000 };  // como mucho 5 mensajes cada 10 s
export const CHAT_HISTORY = 40;                // mensajes que guarda el servidor por grupo (al entrar se envían)
export const VILLAGE_SEND_MS = 100;            // el cliente envía su posición 10 veces por segundo
export const PARTY_GO_WAIT_MS = 20000;         // tiempo para que entren todos en la expedición del grupo
export const WHERE = ['menu', 'village', 'dungeon'];

/** Mensajes del cliente al hub. */
export const HC = {
  WHERE: 'where',       // { where: 'menu'|'village'|'dungeon' }
  POS: 'pos',           // { x, y, fx, fy, m }   (solo en la aldea)
  CHAT: 'chat',         // { text }
  INVITE: 'pinvite',    // { to: accountId }   invitar a un amigo al grupo
  ACCEPT: 'paccept',    // { party }           aceptar una invitación
  DECLINE: 'pdecline',  // { party }
  LEAVE: 'pleave',      // {}
  KICK: 'pkick',        // { id }               (solo el líder)
  LEAD: 'plead',        // { id }               (solo el líder: ceder el liderazgo)
  GO: 'pgo',            // { dungeon }          (solo el líder: expedición de todo el grupo)
  PING: 'ping',
};
/** Mensajes del hub al cliente. */
export const HS = {
  HELLO: 'hello',       // { me: { id, name, code }, friends, incoming, outgoing, blocked, party, chat }
  FRIENDS: 'friends',   // { friends, incoming, outgoing, blocked }   (lista completa, tras cualquier cambio)
  PRESENCE: 'presence', // { id, online, where }
  INVITE: 'invite',     // { party, from: { id, name } }
  PARTY: 'party',       // { id, leader, members: [{ id, name, species, level, online, where }] } | null
  CHAT: 'chat',         // { id, from, name, text, at, sys? }
  VILLAGE: 'village',   // { list: [{ id, name, species, level, x, y, fx, fy, m }] }  (los de tu grupo en la aldea)
  GO: 'go',             // { roomId, code, dungeon }   entra en la expedición del grupo
  NOTICE: 'notice',     // { text, kind }
  PONG: 'pong',
};
export const HUB_ERR = { REPLACED: 4416 };   // cierre: la cuenta se ha conectado desde otra pestaña o dispositivo

/** Código de amigo: 6 caracteres sin letras confusas. Se muestra como «Nombre#CÓDIGO». */
export const FRIEND_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export function normalizeFriendCode(v) {
  const s = typeof v === 'string' ? v.trim().toUpperCase() : '';
  const tail = s.includes('#') ? s.slice(s.lastIndexOf('#') + 1) : s;     // admite «Ana#K7P2QX» o solo «K7P2QX»
  return tail.replace(/[^A-Z0-9]/g, '');
}
export const isFriendCode = c => typeof c === 'string' && c.length === FRIEND_CODE_LENGTH && [...c].every(ch => FRIEND_ALPHABET.includes(ch));

/*
 * Filtro del chat. Se aplica en el servidor (lo que llega a los demás) y el cliente solo lo usa
 * para avisar antes de enviar. Quita caracteres de control y de formato invisibles, limita la
 * longitud, colapsa repeticiones («holaaaaaa» → «holaaa») y tapa insultos comunes con asteriscos,
 * también escritos con números o separados por signos («p.u.t.a», «m1erda»).
 */
const BAD = [
  'puta', 'puto', 'putas', 'putos', 'mierda', 'gilipollas', 'cabron', 'cabrona', 'cabrones', 'imbecil', 'idiota', 'subnormal',
  'maricon', 'marica', 'zorra', 'polla', 'coño', 'cono', 'joder', 'hostia', 'capullo', 'pendejo', 'pendeja', 'mamon', 'retrasado',
  'follar', 'verga', 'chinga', 'chingada', 'culero', 'malparido', 'hijueputa', 'hdp', 'ctm', 'mongolo', 'tonto', 'estupido',
  'fuck', 'fucking', 'shit', 'bitch', 'cunt', 'dick', 'asshole', 'bastard', 'nigger', 'nigga', 'faggot', 'retard', 'whore', 'slut',
];
const LEET = { '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '@': 'a', '$': 's', 'á': 'a', 'é': 'e', 'í': 'i', 'ó': 'o', 'ú': 'u', 'ü': 'u' };
const fold = ch => LEET[ch] || ch;
/**
 * Limpia un mensaje del chat. Devuelve { ok, text, masked } — ok=false si queda vacío.
 * El texto devuelto es el que verán los demás (los insultos, con asteriscos).
 */
export function cleanChat(raw) {
  if (typeof raw !== 'string') return { ok: false, text: '', masked: false };
  let s = raw.normalize('NFC').replace(/[\u0000-\u001f\u007f-\u009f​-‏‪-‮⁠-⁯﻿]/g, ' ')
    .replace(/\s+/g, ' ').trim();
  s = s.replace(/(.)\1{3,}/gu, '$1$1$1');          // «aaaaaa» → «aaa»
  s = [...s].slice(0, CHAT_MAX).join('');
  if (!s) return { ok: false, text: '', masked: false };
  // Busca cada palabra prohibida en una versión «plegada» (minúsculas, sin acentos, números como letras y
  // sin separadores) y tapa los caracteres originales que la forman.
  const chars = [...s], plain = [], map = [];
  chars.forEach((ch, i) => { const f = fold(ch.toLowerCase()); if (/[a-zñ]/.test(f)) { plain.push(f); map.push(i); } });
  const P = plain.join(''), hide = new Uint8Array(chars.length);
  let masked = false;
  for (const w of BAD) {
    let from = 0, k;
    while ((k = P.indexOf(w, from)) >= 0) {
      // Solo palabras enteras: lo de antes y lo de después del original no pueden ser letras (evita «computadora» o «tontería»)
      const a = map[k], b = map[k + w.length - 1];
      const before = a > 0 ? chars[a - 1] : ' ', after = b < chars.length - 1 ? chars[b + 1] : ' ';
      const isL = ch => /[\p{L}]/u.test(ch) && !/[0-9@$]/.test(ch);
      // Si entre las letras hay separadores (p.u.t.a) se tapa siempre; si es una palabra normal, solo entera
      let spaced = true; for (let j = k; j < k + w.length - 1; j++) if (map[j + 1] === map[j] + 1) { spaced = false; break; }   // todas las letras separadas: «p.u.t.a»
      if (spaced || (!isL(before) && !isL(after))) { for (let i = a; i <= b; i++) if (/\S/.test(chars[i])) hide[i] = 1; masked = true; }
      from = k + 1;
    }
  }
  const text = chars.map((ch, i) => hide[i] ? '*' : ch).join('');
  return { ok: true, text, masked };
}

/** Texto del estado de un amigo para la interfaz. */
export function presenceText(p) {
  if (!p || !p.online) return 'Desconectado';
  return p.where === 'dungeon' ? 'En una mazmorra' : p.where === 'village' ? 'En la aldea' : 'Conectado';
}
