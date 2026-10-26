/**
 * Lanzador del juego: hace TODO lo necesario para jugar en este ordenador, con un solo paso.
 * Lo usan Jugar.bat / Instalar.bat (Windows) y jugar.sh / Jugar.command (Linux / macOS).
 *
 *   1. Comprueba la versión de Node.js (y busca actualizaciones).
 *   2. Instala las dependencias (npm install) si faltan o si cambió package.json.
 *   3. Prepara el juego (reglas compartidas desde el prototipo) y lo compila.
 *   4. Arranca UN servidor (puerto 5173) que sirve el juego y es el servidor del cooperativo.
 *   5. Abre el navegador. Solo, en casa o con amigos por Internet, todo desde el mismo juego:
 *      «Cooperativo online» → «Crear enlace para amigos» abre un túnel https (Cloudflare) bajo demanda.
 *   6. Al cerrar la ventana (o Ctrl+C) se para todo.
 *
 * Antes de nada busca una versión nueva (tools/update.mjs, según update.json) y, si la hay, la instala.
 *
 * Opciones: --no-open (no abrir el navegador) · --install-only (solo instalar) · --port N (por defecto 5173)
 *           --no-update  no buscar actualizaciones (también MA_NO_UPDATE=1)
 *           --host  abre ya al arrancar el enlace para amigos (lo mismo que el botón del juego)
 */
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync, mkdirSync, statSync, chmodSync, renameSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { createHash } from 'node:crypto';
import { networkInterfaces } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import net from 'node:net';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2), has = k => args.includes(k), val = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const PORT = +(val('--port', 0) || val('--port-client', 0) || 5173);   // --port-client: nombre antiguo
const WIN = process.platform === 'win32';
const say = (m = '') => console.log(m), title = m => say(`\n== ${m}`);
const fail = (m, hint) => { say(`\n[X] ${m}`); if (hint) say(`    ${hint}`); process.exitCode = 1; return null; };

// --- 1. Node.js
const [maj, min] = process.versions.node.split('.').map(Number);
if (maj < 22 || (maj === 22 && min < 13)) { fail(`Tu Node.js es la versión ${process.versions.node} y el juego necesita la 22.13 o posterior.`, 'Instala la versión LTS desde https://nodejs.org (o vuelve a ejecutar Instalar.bat) y abre de nuevo el juego.'); process.exit(1); }

say('Pokémon Mystery Action · preparando el juego…');

// --- 1b. Actualizaciones (update.json): si hay versión nueva se instala y se relanza con el lanzador nuevo
if (!has('--no-update') && !has('--updated') && !process.env.MA_NO_UPDATE) {
  title('Buscando actualizaciones');
  const { checkAndUpdate } = await import('./update.mjs');
  const u = await checkAndUpdate({ root: ROOT, log: say });
  if (u.status === 'updated') {
    say('\nAbriendo la versión nueva…');
    const r = spawnSync(process.execPath, [...process.execArgv, join(ROOT, 'tools/launch.mjs'), ...args, '--updated'], { cwd: ROOT, stdio: 'inherit' });
    process.exit(r.status ?? 0);
  }
}

// --- 2. Dependencias (solo si hacen falta)
const npm = process.env.MA_NPM || (WIN ? 'npm.cmd' : 'npm');
const stampFile = join(ROOT, 'node_modules', '.mystery-action-install');
const fingerprint = () => createHash('sha256').update(['package.json', 'server/package.json', 'client/package.json', 'shared/package.json', 'package-lock.json'].map(f => existsSync(join(ROOT, f)) ? readFileSync(join(ROOT, f)) : '').join('\n')).digest('hex');
const needInstall = () => !existsSync(join(ROOT, 'node_modules/@colyseus/core')) || !existsSync(join(ROOT, 'node_modules/@colyseus/sdk')) || !existsSync(join(ROOT, 'node_modules/esbuild')) || !existsSync(stampFile) || readFileSync(stampFile, 'utf8') !== fingerprint();
if (needInstall()) {
  title('Instalando lo que necesita el juego (solo la primera vez; puede tardar un par de minutos)');
  const r = spawnSync(npm, ['install', '--no-audit', '--no-fund'], { cwd: ROOT, stdio: 'inherit', shell: WIN });
  if (r.error || r.status !== 0) {
    fail('No se pudieron instalar las dependencias.', r.error && r.error.code === 'ENOENT' ? 'No se encuentra npm: instala Node.js desde https://nodejs.org (incluye npm).' : 'Comprueba tu conexión a internet y vuelve a abrir el juego. Si se repite, copia el mensaje de arriba.');
    process.exit(1);
  }
  mkdirSync(dirname(stampFile), { recursive: true }); writeFileSync(stampFile, fingerprint());
  say('[OK] Dependencias instaladas.');
} else say('[OK] Dependencias ya instaladas.');
if (has('--install-only')) process.exit(0);

// --- 3. Preparar el juego (reglas compartidas generadas desde el prototipo) y compilarlo
const split = spawnSync(process.execPath, [join(ROOT, 'tools/split-prototype.mjs')], { cwd: ROOT, encoding: 'utf8' });
if (split.status !== 0) { fail('No se pudo preparar el juego.', (split.stderr || split.stdout || '').trim()); process.exit(1); }

// --- 4. Un solo servidor: el juego y el cooperativo en http://localhost:PUERTO
const portFree = port => new Promise(r => { const s = net.createServer().once('error', () => r(false)).once('listening', () => s.close(() => r(true))).listen(port, '0.0.0.0'); });
const up = async (url, ms = 30000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { const r = await fetch(url, { signal: AbortSignal.timeout(1500) }); if (r.ok) return true; } catch { /* aún no */ } await new Promise(r => setTimeout(r, 300)); } return false; };
const children = [];
function run(name, file, extra = [], env = {}, scriptArgs = []) {
  const p = spawn(process.execPath, [...process.execArgv, ...extra, file, ...scriptArgs], { cwd: ROOT, env: Object.assign({}, process.env, env), stdio: ['ignore', 'pipe', 'pipe'] });
  const pipe = (stream, out) => { let buf = ''; stream.on('data', d => { buf += d; let i; while ((i = buf.indexOf('\n')) >= 0) { const line = buf.slice(0, i); buf = buf.slice(i + 1); if (line.trim() && !/ExperimentalWarning|trace-warnings/.test(line)) out.write(`[${name}] ${line}\n`); } }); };
  pipe(p.stdout, process.stdout); pipe(p.stderr, process.stderr);
  p.on('exit', code => { if (!stopping) { say(`\n[X] El ${name} se ha detenido (código ${code}). Cierra esta ventana y vuelve a abrir el juego.`); stop(1); } });
  children.push(p); return p;
}
let stopping = false;
function stop(code = 0) {
  if (stopping) return; stopping = true;
  for (const p of children) { try { p.kill(WIN ? undefined : 'SIGTERM'); } catch { /* ya parado */ } }
  setTimeout(() => process.exit(code), 1500).unref();
}
for (const s of ['SIGINT', 'SIGTERM', 'SIGHUP', 'SIGBREAK']) { try { process.on(s, () => { say('\nCerrando el juego…'); stop(0); }); } catch { /* señal no disponible en este sistema */ } }

const local = `http://localhost:${PORT}`;
const openBrowser = url => {
  if (has('--no-open')) return;
  const opener = WIN ? ['cmd', ['/c', 'start', '""', url]] : process.platform === 'darwin' ? ['open', [url]] : ['xdg-open', [url]];
  try { spawn(opener[0], opener[1], { stdio: 'ignore', detached: true, windowsVerbatimArguments: WIN }).on('error', () => say(`Abre ${url} en tu navegador.`)).unref(); } catch { say(`Abre ${url} en tu navegador.`); }
};
const lan = Object.values(networkInterfaces()).flat().filter(i => i && i.family === 'IPv4' && !i.internal).map(i => i.address).filter(a => /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(a));   // solo direcciones de casa (red privada)

title('Arrancando el juego');
if (await up(local + '/api/health', 800)) say(`[OK] El juego ya estaba abierto en ${local}: se usa ese.`);
else {
  if (!await portFree(PORT)) { fail(`El puerto ${PORT} está ocupado por otro programa.`, 'Cierra la otra ventana del juego (o el programa que lo use) y vuelve a abrirlo.'); process.exit(1); }
  const build = spawnSync(process.execPath, [...process.execArgv, join(ROOT, 'tools/build-client.mjs')], { cwd: ROOT, env: Object.assign({}, process.env, { SERVER_URL: '' }), encoding: 'utf8' });
  if (build.status !== 0) { fail('No se pudo preparar el juego.', (build.stderr || build.stdout || '').trim()); process.exit(1); }
  // Servidor en modo producción (todas las protecciones), con el juego servido desde el mismo puerto.
  // Orígenes permitidos: este PC y los de tu red local; el enlace para amigos se añade solo cuando lo abres.
  const origins = [`http://localhost:${PORT}`, `http://127.0.0.1:${PORT}`, ...lan.map(a => `http://${a}:${PORT}`)];
  run('servidor', join(ROOT, 'server/src/index.js'), existsSync(join(ROOT, '.env')) ? [`--env-file=${join(ROOT, '.env')}`] : [], {
    PORT: String(PORT), NODE_ENV: 'production', AUTH_SECRET: hostSecret(), CLIENT_ORIGIN: origins.join(','),
    CLIENT_DIR: join(ROOT, 'client', 'dist'), HOST_TUNNEL: '1', HOST_BIN_DIR: join(ROOT, 'tools', 'bin'),
    TRUST_PROXY: '1', LOG_FORMAT: 'pretty', LOG_LEVEL: process.env.LOG_LEVEL || 'warn',
  });
  if (!await up(local + '/api/health')) { fail('El juego no ha arrancado.', 'Mira los mensajes [servidor] de arriba.'); stop(1); await new Promise(() => {}); }
}

// --- 5. Listo
say(`
==============================================================
  ¡Listo! El juego está en:  ${local}
  · Solo: «Jugar».  · Con amigos: «Cooperativo online».
  · Amigos fuera de casa: en «Cooperativo online» pulsa
    «Crear enlace para amigos» y mándales el enlace https.
${lan.length ? `  · Otro ordenador de TU CASA: ${lan.map(a => `http://${a}:${PORT}`).join('  ')}\n    (si no conecta, permite Node.js en el cortafuegos)\n` : ''}
  Deja esta ventana abierta mientras jugáis. Para salir, ciérrala.
==============================================================`);
if (has('--host')) await hostLink(); else openBrowser(local);
await new Promise(() => {});

/** --host: abre el enlace para amigos al arrancar (lo mismo que el botón del juego) y lo muestra aquí. */
async function hostLink() {
  title('Abriendo el enlace para amigos (túnel de Cloudflare)');
  let st;
  try {
    st = await (await fetch(local + '/api/host/open', { method: 'POST' })).json();
    for (let t0 = Date.now(); ['starting', 'checking'].includes(st.state) && Date.now() - t0 < 240000;) { await new Promise(r => setTimeout(r, 700)); st = await (await fetch(local + '/api/host')).json(); }
  } catch (e) { st = { state: 'error', error: e.message }; }
  if (st.state !== 'on') { fail(st.error || 'No se pudo abrir el enlace para amigos.', 'Puedes seguir jugando en este ordenador y volver a intentarlo desde «Cooperativo online».'); openBrowser(local); return; }
  say(st.reachable ? `[OK] El enlace responde desde Internet: ${st.url}` : `[!] El enlace aún no responde (a veces Cloudflare tarda más). Pruébalo en un minuto: ${st.url}`);
  say(`
==============================================================
  ¡Partida lista! Envía este enlace a tus amigos:

      ${st.url}

  Tú juegas en ${local} (se abre ahora). «Cooperativo online»
  → «Crear partida privada» → «copiar enlace de invitación».
  El enlace cambia cada vez que lo abres. No cierres esta ventana.
==============================================================`);
  openBrowser(local);
}

/** Secreto de las sesiones: el mismo archivo que usa el servidor en desarrollo, para no perder las cuentas. */
function hostSecret() {
  const dir = join(ROOT, 'data'), f = join(dir, '.dev-secret');
  mkdirSync(dir, { recursive: true });
  if (existsSync(f)) { const v = readFileSync(f, 'utf8').trim(); if (v.length >= 32) return v; }
  const v = randomBytes(48).toString('base64url'); writeFileSync(f, v, { mode: 0o600 }); return v;
}
