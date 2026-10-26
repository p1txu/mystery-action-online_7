/**
 * Datos de las cuentas cifrados en la base de datos (cifrado en reposo).
 *
 *  - Contraseña: NUNCA se guarda; solo su huella scrypt con sal propia (identity/passwords.js). No se puede
 *    descifrar ni siquiera con acceso a la base de datos: así ya estaba y así sigue.
 *  - Nombre de usuario y nombre visible: se guardan CIFRADOS con AES-256-GCM (clave de 256 bits, IV aleatorio
 *    por registro y etiqueta de autenticación: si alguien los modifica en la base de datos, se detecta).
 *  - Para poder iniciar sesión por usuario sin descifrar todas las cuentas, la columna `username` guarda una
 *    huella HMAC-SHA256 del usuario en minúsculas (con otra clave): sirve para buscar y para que sea único,
 *    pero no permite recuperar el usuario.
 *  - Las claves salen del secreto del servidor (AUTH_SECRET o data/.dev-secret) con HKDF. Sin ese secreto, una
 *    copia robada de la base de datos no revela usuarios ni nombres. CONSERVA EL SECRETO junto a las copias de
 *    seguridad: si se pierde, los nombres no se pueden recuperar (y las sesiones dejan de valer).
 *
 * Es una capa sobre cualquier almacén (memoria, SQLite, PostgreSQL): no cambia las tablas. Las cuentas antiguas
 * en claro se cifran al arrancar (migrateAccounts) y, por si acaso, también al leerlas.
 * Lo que no se cifra: los perfiles de juego (nivel, objetos…), los identificadores aleatorios, las fechas y las
 * amistades (solo relacionan identificadores).
 */
import { createCipheriv, createDecipheriv, createHmac, hkdfSync, randomBytes } from 'node:crypto';

const PREFIX = 'enc1:', IDX = 'uh1:';
export const isEncrypted = v => typeof v === 'string' && v.startsWith(PREFIX);

export function accountKeys(secret) {
  const k = info => Buffer.from(hkdfSync('sha256', Buffer.from(String(secret)), Buffer.from('mystery-action/accounts'), Buffer.from(info), 32));
  return { enc: k('enc-v1'), idx: k('index-v1') };
}
export function encrypt(keys, text) {
  const iv = randomBytes(12), c = createCipheriv('aes-256-gcm', keys.enc, iv);
  const ct = Buffer.concat([c.update(String(text), 'utf8'), c.final()]);
  return PREFIX + Buffer.concat([iv, c.getAuthTag(), ct]).toString('base64url');
}
export function decrypt(keys, value) {
  const b = Buffer.from(value.slice(PREFIX.length), 'base64url');
  const d = createDecipheriv('aes-256-gcm', keys.enc, b.subarray(0, 12)); d.setAuthTag(b.subarray(12, 28));
  return Buffer.concat([d.update(b.subarray(28)), d.final()]).toString('utf8');
}
/** Huella del nombre de usuario (no distingue mayúsculas): para buscar, no para leer. */
export const usernameIndex = (keys, u) => IDX + createHmac('sha256', keys.idx).update(String(u).toLowerCase()).digest('hex');   // hex: igual en minúsculas (PostgreSQL compara con lower())

/**
 * Envuelve un almacén: cifra { name, username } al escribir y lo descifra al leer. El resto de métodos pasan tal cual.
 * En la base de datos: name = enc1:… (JSON { name, username } cifrado), username = uh1:… (huella) o null.
 */
export function withEncryptedAccounts(store, secret, log = null) {
  if (store.__encrypted) return store;
  const keys = accountKeys(secret);
  const seal = (name, username) => ({ name: encrypt(keys, JSON.stringify({ n: name, u: username || null })), username: username ? usernameIndex(keys, username) : null });
  const open = a => {
    if (!a) return a;
    if (!isEncrypted(a.name)) return a;                                   // cuenta antigua aún sin cifrar
    let v; try { v = JSON.parse(decrypt(keys, a.name)); } catch (e) { (log || console).error('accounts.decrypt_failed', { id: a.id, error: e.message }); v = { n: '¿?', u: null }; }
    return Object.assign({}, a, { name: v.n, username: v.u });
  };
  /** Cuenta en claro (de antes de esta versión): se cifra al momento. */
  const upgrade = async raw => {
    if (!raw || isEncrypted(raw.name)) return raw;
    await store.updateAccount(raw.id, seal(raw.name, raw.username));
    return store.getAccount(raw.id);
  };
  const wrapped = {
    __encrypted: true,
    async createAccount(a) { return open(await store.createAccount(Object.assign({}, a, seal(a.name, a.username)))); },
    async getAccount(id) { return open(await upgrade(await store.getAccount(id))); },
    async getAccountByUsername(u) {
      if (typeof u !== 'string' || !u) return null;
      let raw = await store.getAccountByUsername(usernameIndex(keys, u));
      if (!raw) { raw = await store.getAccountByUsername(u); if (raw && isEncrypted(raw.name)) raw = null; else raw = await upgrade(raw); }   // antigua en claro
      return open(raw);
    },
    async updateAccount(id, patch) {
      if (!('name' in patch) && !('username' in patch)) return open(await store.updateAccount(id, patch));
      const cur = open(await upgrade(await store.getAccount(id))); if (!cur) return null;
      const name = 'name' in patch ? patch.name : cur.name, username = 'username' in patch ? patch.username : cur.username;
      return open(await store.updateAccount(id, Object.assign({}, patch, seal(name, username))));
    },
    async accountByFriendCode(code) { return open(await upgrade(await store.accountByFriendCode(code))); },
    /** Cifra todas las cuentas que sigan en claro (al arrancar el servidor). Devuelve cuántas. */
    async migrateAccounts() {
      if (!store.listAccountIds) return 0;
      let n = 0;
      for (const id of await store.listAccountIds()) { const raw = await store.getAccount(id); if (raw && !isEncrypted(raw.name)) { await upgrade(raw); n++; } }
      if (n && log) log.info('accounts.encrypted', { migrated: n });
      return n;
    },
    raw: store,
  };
  return new Proxy(store, { get: (t, k) => k in wrapped ? wrapped[k] : (typeof t[k] === 'function' ? t[k].bind(t) : t[k]) });
}
