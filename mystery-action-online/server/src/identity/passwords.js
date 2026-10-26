/** Contraseñas con scrypt (node:crypto): sal aleatoria por cuenta y comparación en tiempo constante. */
import { randomBytes, scrypt as _scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
const scrypt = promisify(_scrypt);
const N = 16384, R = 8, P = 1, KEYLEN = 64;

export async function hashPassword(password) {
  const salt = randomBytes(16);
  const key = await scrypt(String(password).normalize('NFKC'), salt, KEYLEN, { N, r: R, p: P, maxmem: 64 * 1024 * 1024 });
  return `scrypt$${N}$${R}$${P}$${salt.toString('base64url')}$${key.toString('base64url')}`;
}
export async function verifyPassword(password, stored) {
  const parts = typeof stored === 'string' ? stored.split('$') : [];
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
  const [, n, r, p, salt, hash] = parts, want = Buffer.from(hash, 'base64url');
  const got = await scrypt(String(password).normalize('NFKC'), Buffer.from(salt, 'base64url'), want.length, { N: +n, r: +r, p: +p, maxmem: 64 * 1024 * 1024 });
  return got.length === want.length && timingSafeEqual(got, want);
}
/** Reglas: 8–128 caracteres; no puede ser igual al nombre de usuario. */
export function passwordProblem(password, username = '') {
  if (typeof password !== 'string' || password.length < 8) return 'La contraseña debe tener al menos 8 caracteres.';
  if (password.length > 128) return 'La contraseña es demasiado larga.';
  if (username && password.toLowerCase() === String(username).toLowerCase()) return 'La contraseña no puede ser tu nombre de usuario.';
  return null;
}
export function usernameProblem(u) {
  if (typeof u !== 'string' || !/^[a-zA-Z0-9_.-]{3,20}$/.test(u)) return 'El usuario debe tener de 3 a 20 caracteres: letras, números, punto, guion o guion bajo.';
  return null;
}
