/**
 * Tokens firmados con HMAC-SHA256 (formato compacto «carga.firma», base64url).
 * Sin dependencias. La carga mínima es { sub, kind, iat, exp }.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';

const b64 = buf => Buffer.from(buf).toString('base64url');
const sign = (secret, data) => createHmac('sha256', secret).update(data).digest('base64url');

export function issueToken(secret, claims, ttlSeconds, now = Date.now()) {
  const iat = Math.floor(now / 1000);
  const payload = b64(JSON.stringify(Object.assign({}, claims, { iat, exp: iat + Math.floor(ttlSeconds) })));
  return payload + '.' + sign(secret, payload);
}

/** Devuelve la carga si la firma y la caducidad son válidas; si no, null. */
export function verifyToken(secret, token, now = Date.now()) {
  if (typeof token !== 'string' || token.length > 2048) return null;
  const dot = token.indexOf('.'); if (dot <= 0 || dot !== token.lastIndexOf('.')) return null;
  const payload = token.slice(0, dot), sig = token.slice(dot + 1);
  const want = Buffer.from(sign(secret, payload)), got = Buffer.from(sig);
  if (want.length !== got.length || !timingSafeEqual(want, got)) return null;
  let claims; try { claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')); } catch { return null; }
  if (!claims || typeof claims.sub !== 'string' || !Number.isFinite(claims.exp)) return null;
  if (claims.exp * 1000 <= now) return null;
  return claims;
}
