/**
 * Lanzador actualizable (tools/update.mjs + tools/launch.mjs).
 * GitHub no es accesible desde aquí: un servidor HTTP local imita raw.githubusercontent.com y
 * codeload.github.com (mismas rutas; MA_GITHUB_RAW / MA_GITHUB_ZIP apuntan a él) y una web estática
 * para el origen «url». Lo que NO se prueba: la descarga real desde GitHub.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync, cpSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { checkAndUpdate, writeZip, readZip, safeEntries, gameFiles } from '../../tools/update.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const put = (root, rel, data) => { mkdirSync(dirname(join(root, rel)), { recursive: true }); writeFileSync(join(root, rel), data); };
const read = (root, rel) => readFileSync(join(root, rel), 'utf8');
const ver = (build) => JSON.stringify({ build, version: '0.' + build, notes: ['Novedad ' + build] });

/** Servidor que imita GitHub (raw + codeload) y una web estática. routes: ruta → Buffer|string */
async function fakeWeb(routes) {
  const srv = http.createServer((req, res) => {
    const body = routes[req.url.split('?')[0]];
    if (body === undefined) { res.writeHead(404); res.end('no'); return; }
    res.writeHead(200); res.end(body);
  });
  await new Promise(r => srv.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${srv.address().port}`;
  return { base, close: () => new Promise(r => srv.close(r)), routes };
}
/** Carpeta de juego instalada (versión 21) con datos del jugador. */
function installed(updateJson) {
  const root = mkdtempSync(join(tmpdir(), 'ma-update-'));
  put(root, 'version.json', ver(21));
  put(root, 'tools/launch.mjs', '// lanzador viejo');
  put(root, 'prototype/mystery-action.html', '<p>v21</p>');
  put(root, 'viejo.js', 'se retira en la 22');
  put(root, '.update/installed.json', JSON.stringify(['prototype/mystery-action.html', 'tools/launch.mjs', 'version.json', 'viejo.js']));
  put(root, 'mis-notas.txt', 'archivo del jugador: no se toca');
  put(root, 'data/game.db', 'CUENTAS Y PERFILES');
  put(root, '.env', 'PORT=2567');
  put(root, 'node_modules/x/index.js', 'dep');
  if (updateJson) put(root, 'update.json', JSON.stringify(updateJson));
  return root;
}
/** Zip «como el de GitHub»: carpeta raíz repo-main/ y la versión 22. */
const release22 = (extra = []) => writeZip([
  { name: 'juego-main/version.json', data: ver(22) },
  { name: 'juego-main/tools/launch.mjs', data: '// lanzador nuevo' },
  { name: 'juego-main/prototype/mystery-action.html', data: '<p>v22</p>' },
  { name: 'juego-main/docs/NUEVO.md', data: 'nuevo' },
  { name: 'juego-main/data/game.db', data: 'ESTO NO DEBE LLEGAR' },
  { name: 'juego-main/update.json', data: '{"source":"github","repo":"otro/repo"}' },
  ...extra,
]);
const quiet = { log: () => {} };

test('zip: lectura propia (deflate), quita la carpeta raíz y rechaza rutas peligrosas', () => {
  const z = release22();
  const e = safeEntries(readZip(z)).map(x => x.rel.replace(/\\/g, '/'));
  assert.ok(e.includes('version.json') && e.includes('tools/launch.mjs'));
  assert.throws(() => safeEntries(readZip(writeZip([{ name: 'a/../../fuera.txt', data: 'x' }]))), /no permitida/);
  assert.throws(() => safeEntries(readZip(writeZip([{ name: '/etc/passwd', data: 'x' }]))), /no permitida/);
  const bad = Buffer.from(z); bad[60] ^= 0xff; assert.throws(() => readZip(bad));
  assert.throws(() => readZip(Buffer.from('no es un zip')), /zip/);
});

test('sin configurar: el juego arranca igual y lo dice', async () => {
  for (const cfg of [null, { source: 'github', repo: 'USUARIO/REPOSITORIO' }]) {
    const root = installed(cfg), lines = [];
    const r = await checkAndUpdate({ root, log: m => lines.push(m) });
    assert.equal(r.status, 'off'); assert.match(lines.join('\n'), /sin configurar/);
    assert.equal(read(root, 'tools/launch.mjs'), '// lanzador viejo');
    rmSync(root, { recursive: true, force: true });
  }
});

test('GitHub: misma versión → nada; versión nueva → la instala y conserva partidas, configuración y archivos propios', async t => {
  const web = await fakeWeb({ '/ana/juego/main/version.json': ver(21) });
  t.after(web.close);
  process.env.MA_GITHUB_RAW = web.base; process.env.MA_GITHUB_ZIP = web.base;
  const root = installed({ source: 'github', repo: 'ana/juego', branch: 'main' });
  assert.equal((await checkAndUpdate({ root, ...quiet })).status, 'current');
  web.routes['/ana/juego/main/version.json'] = ver(22);
  assert.equal((await checkAndUpdate({ root, apply: false, ...quiet })).status, 'available', '--check: solo avisa');
  assert.equal(read(root, 'version.json'), ver(21));
  web.routes['/ana/juego/zip/refs/heads/main'] = release22();
  const lines = [], r = await checkAndUpdate({ root, log: m => lines.push(m) });
  assert.equal(r.status, 'updated', lines.join('\n'));
  assert.equal(JSON.parse(read(root, 'version.json')).build, 22);
  assert.equal(read(root, 'tools/launch.mjs'), '// lanzador nuevo');
  assert.equal(read(root, 'docs/NUEVO.md'), 'nuevo');
  assert.equal(read(root, 'data/game.db'), 'CUENTAS Y PERFILES', 'las cuentas y perfiles no se tocan');
  assert.equal(read(root, '.env'), 'PORT=2567'); assert.ok(existsSync(join(root, 'node_modules/x/index.js')));
  assert.match(read(root, 'update.json'), /ana\/juego/, 'tu update.json se conserva');
  assert.equal(read(root, 'mis-notas.txt'), 'archivo del jugador: no se toca');
  assert.ok(!existsSync(join(root, 'viejo.js')) && existsSync(join(root, '.update/backup/viejo.js')), 'lo que ya no viene se retira (con copia)');
  assert.equal(readFileSync(join(root, '.update/backup/tools/launch.mjs'), 'utf8'), '// lanzador viejo', 'copia de seguridad');
  assert.match(lines.join('\n'), /Novedad 22/);
  assert.equal((await checkAndUpdate({ root, ...quiet })).status, 'current', 'después ya está al día');
  rmSync(root, { recursive: true, force: true });
});

test('web propia (origen url): comprueba la huella sha256; si no coincide, no instala nada', async t => {
  const zip = release22(), sha = createHash('sha256').update(zip).digest('hex');
  const web = await fakeWeb({ '/rel/mystery-action-22.zip': zip, '/rel/version.json': JSON.stringify({ build: 22, version: '0.22', zip: 'mystery-action-22.zip', sha256: '0'.repeat(64) }) });
  t.after(web.close);
  const root = installed({ source: 'url', manifest: web.base + '/rel/version.json' });
  const r1 = await checkAndUpdate({ root, ...quiet });
  assert.equal(r1.status, 'error'); assert.match(r1.error, /sha256/); assert.equal(read(root, 'tools/launch.mjs'), '// lanzador viejo');
  web.routes['/rel/version.json'] = JSON.stringify({ build: 22, version: '0.22', zip: 'mystery-action-22.zip', sha256: sha });
  assert.equal((await checkAndUpdate({ root, ...quiet })).status, 'updated');
  assert.equal(read(root, 'tools/launch.mjs'), '// lanzador nuevo');
  rmSync(root, { recursive: true, force: true });
});

test('fallos: sin conexión, zip con rutas peligrosas o que no es el juego → se juega con la versión actual', async t => {
  const web = await fakeWeb({ '/ana/juego/main/version.json': ver(22) });
  t.after(web.close);
  process.env.MA_GITHUB_RAW = web.base; process.env.MA_GITHUB_ZIP = web.base;
  const root = installed({ source: 'github', repo: 'ana/juego' });
  web.routes['/ana/juego/zip/refs/heads/main'] = release22([{ name: 'juego-main/../../escapa.txt', data: 'x' }]);
  let r = await checkAndUpdate({ root, ...quiet }); assert.equal(r.status, 'error'); assert.match(r.error, /no permitida/);
  web.routes['/ana/juego/zip/refs/heads/main'] = writeZip([{ name: 'x/version.json', data: ver(22) }]);
  r = await checkAndUpdate({ root, ...quiet }); assert.equal(r.status, 'error'); assert.match(r.error, /no parece el juego/);
  web.routes['/ana/juego/zip/refs/heads/main'] = writeZip([{ name: 'x/version.json', data: ver(25) }, { name: 'x/tools/launch.mjs', data: '' }]);
  r = await checkAndUpdate({ root, ...quiet }); assert.match(r.error, /no contiene la versión anunciada/);
  await web.close();
  r = await checkAndUpdate({ root, ...quiet }); assert.equal(r.status, 'error');
  assert.equal(read(root, 'tools/launch.mjs'), '// lanzador viejo'); assert.equal(read(root, 'version.json'), ver(21));
  assert.equal(readFileSync(join(root, 'update.json'), 'utf8').includes('ana/juego'), true);
  // Solo https (o localhost): nunca http a otra máquina
  const root2 = installed({ source: 'url', manifest: 'http://ejemplo.com/version.json' });
  r = await checkAndUpdate({ root: root2, ...quiet }); assert.match(r.error, /solo https/);
  rmSync(root, { recursive: true, force: true }); rmSync(root2, { recursive: true, force: true });
});

test('lanzador real: Jugar → encuentra la versión nueva, la instala y se relanza con el lanzador nuevo', async t => {
  // Copia limpia del juego (versión actual N) que «se publica» como N+1 en el GitHub simulado
  const pub = mkdtempSync(join(tmpdir(), 'ma-pub-'));
  cpSync(ROOT, pub, { recursive: true, filter: s => !/[\\/](node_modules|\.vendor|\.tmp|data|dist|\.dev|bin|\.update|release)([\\/]|$)/.test(s.slice(ROOT.length)) });
  const v = JSON.parse(read(pub, 'version.json')); v.build += 1; v.version = 'nueva-prueba'; v.notes = ['Versión de prueba'];
  put(pub, 'version.json', JSON.stringify(v));
  put(pub, 'tools/launch.mjs', read(pub, 'tools/launch.mjs').replace("say('Pokémon Mystery Action · preparando el juego…');", "say('Pokémon Mystery Action · preparando el juego…'); say('LANZADOR-23');"));
  const zip = writeZip(gameFiles(pub).map(rel => ({ name: 'juego-main/' + rel.replace(/\\/g, '/'), data: readFileSync(join(pub, rel)) })));
  const web = await fakeWeb({ '/ana/juego/main/version.json': JSON.stringify(v), '/ana/juego/zip/refs/heads/main': zip });
  t.after(web.close);
  // Instalación del jugador: el juego actual (22) con update.json configurado y sus datos
  const game = mkdtempSync(join(tmpdir(), 'ma-game-'));
  cpSync(ROOT, game, { recursive: true, filter: s => !/[\\/](node_modules|\.vendor|\.tmp|data|dist|\.dev|bin|\.update|release)([\\/]|$)/.test(s.slice(ROOT.length)) });
  put(game, 'update.json', JSON.stringify({ source: 'github', repo: 'ana/juego', branch: 'main' }));
  put(game, 'data/game.db', 'MIS CUENTAS');
  const npm = join(game, 'fake-npm.sh'); put(game, 'fake-npm.sh', '#!/bin/sh\nmkdir -p node_modules/@colyseus/core node_modules/@colyseus/sdk node_modules/esbuild\n'); chmodSync(npm, 0o755);
  // (asíncrono: el GitHub simulado vive en este mismo proceso)
  const run = () => new Promise(res => {
    const c = spawn(process.execPath, ['tools/launch.mjs', '--install-only'], { cwd: game, env: Object.assign({}, process.env, { MA_GITHUB_RAW: web.base, MA_GITHUB_ZIP: web.base, MA_NPM: npm }) });
    let stdout = '', stderr = ''; c.stdout.on('data', d => stdout += d); c.stderr.on('data', d => stderr += d);
    const t = setTimeout(() => c.kill(), 60000); c.on('exit', status => { clearTimeout(t); res({ status, stdout, stderr }); });
  });
  const r = await run(), out = r.stdout + r.stderr;
  assert.equal(r.status, 0, out);
  assert.match(out, /Hay una versión nueva: nueva-prueba/); assert.match(out, /Actualizado a la versión nueva-prueba/);
  assert.match(out, /LANZADOR-23/, 'se relanza con el lanzador nuevo');
  assert.equal(JSON.parse(read(game, 'version.json')).build, v.build);
  assert.equal(read(game, 'data/game.db'), 'MIS CUENTAS');
  const again = await run(); assert.match(again.stdout, /Tienes la última versión \(nueva-prueba\)/);
  rmSync(pub, { recursive: true, force: true }); rmSync(game, { recursive: true, force: true });
});
