/**
 * Prepara la carpeta que mete el instalador de Windows (installer/MysteryAction.iss):
 *   node tools/stage-windows.mjs --node <carpeta del Node.js portátil para Windows> [--out build/win/app]
 *
 *  - Los archivos del juego (los mismos que una actualización; sin las pruebas).
 *  - node_modules ya instalado (el que haya en esta carpeta: en GitHub Actions, el de `npm ci` en Windows) y la
 *    marca de «dependencias instaladas» del lanzador: la primera vez no hace falta descargar nada.
 *  - runtime/: Node.js portátil (node.exe, npm…). Jugar.bat lo usa si existe: no hay que instalar Node.js.
 *  - .update/installed.json: la lista de archivos del juego, para que las actualizaciones automáticas sepan qué
 *    pueden retirar (nunca tocan data/, runtime/ ni lo que no pusieron ellas).
 * Lo usa .github/workflows/windows-installer.yml. Funciona en cualquier sistema (se prueba en Linux).
 */
import { cpSync, mkdirSync, rmSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, resolve, dirname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gameFiles } from './update.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const a = process.argv.slice(2), arg = (k, d) => { const i = a.indexOf(k); return i >= 0 ? a[i + 1] : d; };
const out = resolve(arg('--out', join(ROOT, 'build', 'win', 'app'))), nodeDir = arg('--node', '');
const fail = m => { console.error('[X] ' + m); process.exit(1); };
if (!nodeDir || !existsSync(join(nodeDir, process.env.STAGE_NODE_EXE || 'node.exe'))) fail('Indica la carpeta del Node.js portátil para Windows con --node (debe contener node.exe).');
if (!existsSync(join(ROOT, 'node_modules', '@colyseus', 'core')) || !existsSync(join(ROOT, 'node_modules', 'esbuild'))) fail('Falta node_modules: ejecuta antes «npm ci» (o npm install) en esta carpeta.');

rmSync(out, { recursive: true, force: true }); mkdirSync(out, { recursive: true });
// 1. Juego (sin pruebas ni lo generado al compilar en este equipo)
const skip = rel => /^(tests|build|release|\.github|installer[\\/]Output)([\\/]|$)/.test(rel);
const files = gameFiles(ROOT).filter(rel => !skip(rel));
for (const rel of files) { const dst = join(out, rel); mkdirSync(dirname(dst), { recursive: true }); cpSync(join(ROOT, rel), dst); }
// 2. Dependencias ya instaladas + la marca que comprueba el lanzador (misma huella que tools/launch.mjs)
cpSync(join(ROOT, 'node_modules'), join(out, 'node_modules'), { recursive: true, dereference: true });
const fingerprint = createHash('sha256').update(['package.json', 'server/package.json', 'client/package.json', 'shared/package.json', 'package-lock.json'].map(f => existsSync(join(ROOT, f)) ? readFileSync(join(ROOT, f)) : '').join('\n')).digest('hex');
writeFileSync(join(out, 'node_modules', '.mystery-action-install'), fingerprint);
// 3. Node.js portátil
cpSync(nodeDir, join(out, 'runtime'), { recursive: true });
// 4. Lista de archivos del juego para el actualizador
mkdirSync(join(out, '.update'), { recursive: true });
writeFileSync(join(out, '.update', 'installed.json'), JSON.stringify(files.filter(r => r !== 'update.json').sort(), null, 1));
const v = JSON.parse(readFileSync(join(ROOT, 'version.json'), 'utf8'));
console.log(`[OK] ${files.length} archivos del juego + node_modules + runtime/ en ${out} (versión ${v.version}, build ${v.build})`);
