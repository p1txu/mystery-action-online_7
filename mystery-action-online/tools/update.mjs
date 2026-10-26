/**
 * Actualizador del juego: descarga la última versión publicada y la instala encima de esta carpeta,
 * conservando lo tuyo (partidas y cuentas del servidor en data/, .env, node_modules, cloudflared).
 *
 * De dónde se actualiza: update.json (en la raíz del juego).
 *   { "source": "github", "repo": "USUARIO/REPOSITORIO", "branch": "main" }
 *       → lee version.json de ese repositorio PÚBLICO y descarga su zip (sin cuentas ni contraseñas).
 *   { "source": "url", "manifest": "https://…/version.json" }
 *       → cualquier web estática: version.json con { build, version, zip, sha256 }.
 *   Si no está configurado, el juego arranca igual (sin buscar actualizaciones).
 *
 * Seguridad: solo https (o localhost para pruebas); comprueba el sha256 si el manifiesto lo trae;
 * rechaza rutas peligrosas del zip («..», absolutas); copia de seguridad de lo que reemplaza y la
 * restaura si algo falla a mitad. Nunca borra data/, .env ni update.json.
 *
 * Uso: node tools/update.mjs [--check] [--yes] [--root DIR]
 *   (el lanzador lo llama solo al abrir el juego; --check solo dice si hay versión nueva)
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync, rmSync, readdirSync, statSync, copyFileSync, renameSync } from 'node:fs';
import { inflateRawSync, deflateRawSync, crc32 } from 'node:zlib';
import { createHash } from 'node:crypto';
import { join, dirname, resolve, relative, sep, normalize, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = resolve(dirname(fileURLToPath(import.meta.url)), '..');
/** Rutas que NUNCA se tocan al actualizar (datos y configuración del jugador). */
export const KEEP = ['data', 'server/data', 'node_modules', '.env', 'deploy/.env', 'update.json', 'tools/bin', 'client/dist', 'client/.dev', 'tests/.vendor', 'tests/.tmp', '.update'];
const kept = rel => { const r = rel.split(sep).join('/'); return KEEP.some(k => r === k || r.startsWith(k + '/')) || /(^|\/)node_modules(\/|$)/.test(r); };

/* ---------- Zip (lectura, sin dependencias) ---------- */
/** Devuelve [{ name, data }] de un zip. Solo «stored» y «deflate» (lo que generan GitHub y las herramientas habituales). */
export function readZip(buf) {
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error('el archivo descargado no es un zip válido');
  const n = buf.readUInt16LE(eocd + 10), cdOff = buf.readUInt32LE(eocd + 16), out = [];
  let p = cdOff;
  for (let k = 0; k < n; k++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error('zip dañado (directorio central)');
    const method = buf.readUInt16LE(p + 10), crc = buf.readUInt32LE(p + 16), csize = buf.readUInt32LE(p + 20), usize = buf.readUInt32LE(p + 24);
    const nlen = buf.readUInt16LE(p + 28), xlen = buf.readUInt16LE(p + 30), clen = buf.readUInt16LE(p + 32), loff = buf.readUInt32LE(p + 42);
    const name = buf.toString('utf8', p + 46, p + 46 + nlen);
    p += 46 + nlen + xlen + clen;
    if (name.endsWith('/')) continue;                                     // carpeta
    if (buf.readUInt32LE(loff) !== 0x04034b50) throw new Error('zip dañado (cabecera local)');
    const start = loff + 30 + buf.readUInt16LE(loff + 26) + buf.readUInt16LE(loff + 28), raw = buf.subarray(start, start + csize);
    const data = method === 0 ? Buffer.from(raw) : method === 8 ? inflateRawSync(raw) : null;
    if (!data) throw new Error(`zip con compresión no admitida (${method}) en ${name}`);
    if (data.length !== usize || crc32(data) !== crc) throw new Error(`zip dañado: ${name} no coincide con su suma de control`);
    out.push({ name, data });
  }
  return out;
}

/** Crea un zip (deflate) con [{ name, data }]: lo usan make-release.mjs y las pruebas. */
export function writeZip(files) {
  const locals = [], centrals = []; let off = 0;
  for (const f of files) {
    const name = Buffer.from(f.name, 'utf8'), data = Buffer.isBuffer(f.data) ? f.data : Buffer.from(f.data), comp = deflateRawSync(data), crc = crc32(data);
    const lh = Buffer.alloc(30); lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(0x0800, 6); lh.writeUInt16LE(8, 8);
    lh.writeUInt32LE(crc, 14); lh.writeUInt32LE(comp.length, 18); lh.writeUInt32LE(data.length, 22); lh.writeUInt16LE(name.length, 26);
    const ch = Buffer.alloc(46); ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt16LE(0x0800, 8); ch.writeUInt16LE(8, 10);
    ch.writeUInt32LE(crc, 16); ch.writeUInt32LE(comp.length, 20); ch.writeUInt32LE(data.length, 24); ch.writeUInt16LE(name.length, 28); ch.writeUInt32LE(off, 42);
    locals.push(lh, name, comp); centrals.push(ch, name); off += 30 + name.length + comp.length;
  }
  const cd = Buffer.concat(centrals), end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10); end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(off, 16);
  return Buffer.concat([...locals, cd, end]);
}
/** Archivos del juego que se publican en una versión (todo menos lo del jugador y lo generado). */
export function gameFiles(root) { return walk(root, root).filter(rel => !/(^|[\\/])(\.git|__pycache__)([\\/]|$)/.test(rel)).concat(existsSync(join(root, 'update.json')) ? ['update.json'] : []); }   // update.json va en el zip, pero al actualizar no se pisa el tuyo

/** Quita la carpeta común (p. ej. «repo-main/») y rechaza rutas que saldrían de la carpeta del juego. */
export function safeEntries(entries) {
  const names = entries.map(e => e.name.replace(/\\/g, '/'));
  const first = names[0] && names[0].split('/')[0];
  const strip = first && names.every(n => n.startsWith(first + '/')) ? first.length + 1 : 0;
  return entries.map((e, i) => {
    const rel = names[i].slice(strip);
    if (!rel || isAbsolute(rel) || /^[a-zA-Z]:/.test(rel) || rel.split('/').some(s => s === '..')) throw new Error(`ruta no permitida en el zip: ${e.name}`);
    return { rel: normalize(rel), data: e.data };
  });
}

/* ---------- Origen de las actualizaciones ---------- */
export function readConfig(root) {
  const f = join(root, 'update.json');
  if (!existsSync(f)) return null;
  let c; try { c = JSON.parse(readFileSync(f, 'utf8')); } catch { throw new Error('update.json no es un JSON válido'); }
  if (c.source === 'github') {
    if (!/^[A-Za-z0-9-]+\/[A-Za-z0-9._-]+$/.test(c.repo || '') || /USUARIO|REPOSITORIO/.test(c.repo)) return null;   // sin configurar
    const branch = /^[A-Za-z0-9._/-]+$/.test(c.branch || '') ? c.branch : 'main';
    const raw = process.env.MA_GITHUB_RAW || 'https://raw.githubusercontent.com', zip = process.env.MA_GITHUB_ZIP || 'https://codeload.github.com';
    return { label: `GitHub ${c.repo} (${branch})`, manifest: `${raw}/${c.repo}/${branch}/version.json`, zip: `${zip}/${c.repo}/zip/refs/heads/${branch}` };
  }
  if (c.source === 'url' && typeof c.manifest === 'string' && c.manifest) return { label: c.manifest, manifest: c.manifest, zip: null };
  return null;
}
const allowed = u => { try { const x = new URL(u); return x.protocol === 'https:' || ((x.hostname === 'localhost' || x.hostname === '127.0.0.1') && x.protocol === 'http:'); } catch { return false; } };
async function get(url, ms) {
  if (!allowed(url)) throw new Error(`dirección no permitida (solo https): ${url}`);
  const r = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(ms), headers: { 'cache-control': 'no-cache' } });
  if (!r.ok) throw new Error(`HTTP ${r.status} en ${url}`);
  return Buffer.from(await r.arrayBuffer());
}
export const localVersion = root => { try { return JSON.parse(readFileSync(join(root, 'version.json'), 'utf8')); } catch { return { build: 0, version: '?' }; } };

/* ---------- Instalar ---------- */
function walk(dir, root, out = []) {
  for (const n of readdirSync(dir)) {
    const f = join(dir, n), rel = relative(root, f);
    if (kept(rel)) continue;
    const st = statSync(f);
    if (st.isDirectory()) walk(f, root, out); else out.push(rel);
  }
  return out;
}
/** Sustituye los archivos del juego por los del zip. Lo que había y ya no viene en la versión nueva se retira
 *  (solo si era parte del juego: lista .update/installed.json). Copia de seguridad en .update/backup. */
export function install(root, entries, log = () => {}) {
  const files = entries.filter(e => !kept(e.rel));
  if (!files.some(e => e.rel === 'version.json') || !files.some(e => e.rel.split(sep).join('/') === 'tools/launch.mjs')) throw new Error('el paquete descargado no parece el juego (falta version.json o tools/launch.mjs)');
  const meta = join(root, '.update'), backup = join(meta, 'backup'), listF = join(meta, 'installed.json');
  rmSync(backup, { recursive: true, force: true }); mkdirSync(backup, { recursive: true });
  // Solo se retiran archivos que sabemos que puso una actualización anterior (nunca los tuyos)
  const before = existsSync(listF) ? JSON.parse(readFileSync(listF, 'utf8')) : [];
  const now = new Set(files.map(e => e.rel)), done = [];
  try {
    for (const e of files) {
      const dst = join(root, e.rel);
      if (!resolve(dst).startsWith(resolve(root) + sep)) throw new Error(`ruta no permitida: ${e.rel}`);
      if (existsSync(dst)) { mkdirSync(dirname(join(backup, e.rel)), { recursive: true }); copyFileSync(dst, join(backup, e.rel)); }
      mkdirSync(dirname(dst), { recursive: true });
      writeFileSync(dst + '.update-part', e.data); renameSync(dst + '.update-part', dst);
      done.push(e.rel);
    }
    let removed = 0;
    for (const rel of before) {
      if (now.has(rel) || kept(rel)) continue;
      const f = join(root, rel); if (!existsSync(f)) continue;
      mkdirSync(dirname(join(backup, rel)), { recursive: true }); renameSync(f, join(backup, rel)); removed++;
    }
    writeFileSync(listF, JSON.stringify([...now].sort(), null, 1));
    return { written: done.length, removed };
  } catch (err) {
    log('[!] Algo ha fallado a mitad: se restaura la versión anterior…');
    for (const rel of done) { const b = join(backup, rel), dst = join(root, rel); if (existsSync(b)) copyFileSync(b, dst); else rmSync(dst, { force: true }); }
    throw err;
  }
}

/**
 * Busca e instala la versión nueva. Nunca impide jugar: ante cualquier problema dice qué pasa y sigue.
 * @returns {Promise<{status: 'off'|'current'|'available'|'updated'|'error', from?, to?, error?}>}
 */
export async function checkAndUpdate({ root = HERE, apply = true, log = console.log, timeout = 8000 } = {}) {
  let cfg;
  try { cfg = readConfig(root); } catch (e) { log(`[!] ${e.message}: no se buscan actualizaciones.`); return { status: 'error', error: e.message }; }
  const cur = localVersion(root);
  if (!cfg) { log(`[i] Versión ${cur.version}. Actualizaciones automáticas sin configurar (mira docs/ACTUALIZAR.md).`); return { status: 'off', from: cur }; }
  try {
    const remote = JSON.parse((await get(cfg.manifest, timeout)).toString('utf8'));
    if (!Number.isInteger(remote.build)) throw new Error('version.json remoto sin número de versión (build)');
    if (remote.build <= (cur.build || 0)) { log(`[OK] Tienes la última versión (${cur.version}).`); return { status: 'current', from: cur, to: remote }; }
    log(`[i] Hay una versión nueva: ${remote.version} (tienes ${cur.version}).`);
    for (const n of (remote.notes || []).slice(0, 8)) log(`    · ${n}`);
    if (!apply) return { status: 'available', from: cur, to: remote };
    const zipUrl = remote.zip ? new URL(remote.zip, cfg.manifest).href : cfg.zip;
    if (!zipUrl) throw new Error('el manifiesto no dice de dónde descargar el zip');
    log(`    Descargando desde ${cfg.label}…`);
    const buf = await get(zipUrl, 120000);
    if (remote.sha256 && createHash('sha256').update(buf).digest('hex') !== String(remote.sha256).toLowerCase()) throw new Error('la descarga no coincide con su huella sha256 (no se instala nada)');
    const entries = safeEntries(readZip(buf));
    const ver = entries.find(e => e.rel === 'version.json');
    if (!ver || JSON.parse(ver.data.toString('utf8')).build !== remote.build) throw new Error('el zip no contiene la versión anunciada');
    const r = install(root, entries, log);
    log(`[OK] Actualizado a la versión ${remote.version} (${r.written} archivos${r.removed ? `, ${r.removed} retirados` : ''}). Tus partidas siguen intactas.`);
    return { status: 'updated', from: cur, to: remote };
  } catch (e) {
    log(`[!] No se pudo actualizar (${e.message}). Se juega con la versión ${cur.version}.`);
    return { status: 'error', from: cur, error: e.message };
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const a = process.argv.slice(2), i = a.indexOf('--root');
  const r = await checkAndUpdate({ root: i >= 0 ? resolve(a[i + 1]) : HERE, apply: !a.includes('--check') });
  process.exitCode = r.status === 'error' ? 1 : 0;
}
