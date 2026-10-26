/**
 * Prepara una versión para publicarla en cualquier web estática (origen «url» de update.json):
 *   node tools/make-release.mjs --out carpeta
 * Crea carpeta/mystery-action-<build>.zip y carpeta/version.json (manifiesto con la huella sha256).
 * Sube los dos archivos a la misma dirección y pon esa dirección de version.json en update.json.
 * (Con el origen «github» no hace falta: basta con subir los cambios al repositorio.)
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, resolve, dirname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeZip, gameFiles, localVersion } from './update.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const a = process.argv.slice(2), i = a.indexOf('--out'), out = resolve(i >= 0 ? a[i + 1] : join(ROOT, 'release'));
const v = localVersion(ROOT);
if (!Number.isInteger(v.build)) { console.error('version.json necesita un número «build» entero'); process.exit(1); }
const files = gameFiles(ROOT).filter(rel => !rel.startsWith('release' + sep) && !resolve(ROOT, rel).startsWith(out + sep));
const zip = writeZip(files.map(rel => ({ name: 'mystery-action-online/' + rel.split(sep).join('/'), data: readFileSync(join(ROOT, rel)) })));
mkdirSync(out, { recursive: true });
const name = `mystery-action-${v.build}.zip`;
writeFileSync(join(out, name), zip);
const manifest = Object.assign({}, v, { zip: name, sha256: createHash('sha256').update(zip).digest('hex'), files: files.length });
writeFileSync(join(out, 'version.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(`[OK] ${name} (${(zip.length / 1024).toFixed(0)} KB, ${files.length} archivos) y version.json en ${out}`);
