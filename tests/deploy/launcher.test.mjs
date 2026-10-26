/**
 * El lanzador (tools/launch.mjs, el que usan Jugar.bat / Instalar.bat / jugar.sh) en una copia
 * limpia del proyecto, como al descomprimir el zip: sin node_modules. npm se sustituye por un
 * guion de prueba (MA_NPM) porque aquí no hay acceso al registro; lo demás es real: comprueba que
 * instala solo la primera vez, arranca UN servidor que sirve el juego y el cooperativo en el mismo
 * puerto, que el botón «Crear enlace para amigos» solo responde a este ordenador, que un segundo
 * arranque no reinstala, que al cerrarlo se para todo y que una instalación fallida lo explica.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { cpSync, mkdtempSync, writeFileSync, chmodSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const LOADER = existsSync(join(ROOT, 'node_modules/@colyseus/core')) ? [] : ['--import', join(ROOT, 'tests/.vendor/loader.mjs')];
const wait = ms => new Promise(r => setTimeout(r, ms));

function copyProject() {
  const dir = mkdtempSync(join(tmpdir(), 'Mystery Action con espacios '));      // ruta con espacios, como en Windows
  cpSync(ROOT, dir, { recursive: true, filter: src => !/node_modules|[\\/]tests[\\/]\.(vendor|tmp)|[\\/]data[\\/]|client[\\/](dist|\.dev)/.test(src.slice(ROOT.length)) });
  return dir;
}
function fakeNpm(dir, ok = true) {
  const f = join(dir, 'fake-npm.sh');
  writeFileSync(f, ok
    ? '#!/bin/sh\necho "fake npm $@" >> npm-calls.log\nmkdir -p node_modules/@colyseus/core node_modules/@colyseus/sdk node_modules/esbuild\nexit 0\n'
    : '#!/bin/sh\necho "npm ERR! sin conexión" 1>&2\nexit 1\n');
  chmodSync(f, 0o755); return f;
}
function launch(dir, npm, ports, extra = []) {
  const env = Object.assign({}, process.env, { MA_NPM: npm, COLYSEUS_SDK_ALIAS: join(ROOT, 'tests/.vendor/sdk.browser.mjs') });
  const p = spawn(process.execPath, [...LOADER, join(dir, 'tools/launch.mjs'), '--no-open', '--no-update', '--port', String(ports[0]), ...extra], { cwd: dir, env, stdio: ['ignore', 'pipe', 'pipe'] });
  p.out = ''; p.stdout.on('data', d => { p.out += d; }); p.stderr.on('data', d => { p.out += d; });
  p.done = new Promise(r => p.on('exit', code => r(code)));
  return p;
}
const until = async (fn, ms, what) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await fn()) return; await wait(100); } throw new Error('Tiempo agotado: ' + (typeof what === 'function' ? what() : what)); };
const alive = url => fetch(url, { signal: AbortSignal.timeout(1000) }).then(r => r.ok, () => false);

test('el lanzador instala, arranca un solo servidor (juego + cooperativo), no reinstala la segunda vez y lo para todo al cerrar', { timeout: 120000 }, async () => {
  const dir = copyProject(), npm = fakeNpm(dir), ports = [4100 + Math.floor(Math.random() * 600)];
  const S = `http://localhost:${ports[0]}`;
  const a = launch(dir, npm, ports);
  await until(() => a.out.includes('¡Listo!'), 60000, () => 'primer arranque:\n' + a.out);
  assert.match(a.out, /Instalando lo que necesita el juego/);
  assert.equal(readFileSync(join(dir, 'npm-calls.log'), 'utf8').trim(), 'fake npm install --no-audit --no-fund', 'npm install, una vez');
  assert.ok(await alive(S + '/api/health'), 'servidor en marcha');
  const html = await fetch(S).then(r => r.text());
  assert.match(html, /<script src="\.\/assets\/game-[0-9a-f]+\.js">/, 'el juego se sirve compilado desde el mismo servidor');
  assert.match(html, /<meta name="ma-server" content="same-origin">/, 'el juego sabe que su servidor es esta misma dirección');
  assert.match(a.out, new RegExp(`El juego está en:  ${S}`));
  assert.match(a.out, /Crear enlace para amigos/);
  // El enlace para amigos: disponible solo para este ordenador
  const host = await fetch(S + '/api/host').then(r => r.json());
  assert.deepEqual([host.available, host.state], [true, 'off']);
  assert.deepEqual(await fetch(S + '/api/host', { headers: { 'x-forwarded-for': '203.0.113.9' } }).then(r => r.json()), { available: false }, 'lo que llega por el túnel no lo ve');
  assert.equal((await fetch(S + '/api/host/open', { method: 'POST', headers: { origin: 'https://otra-web.example' } })).status, 403, 'otra web no puede abrirlo');
  assert.equal((await fetch(S + '/api/host/open', { method: 'POST', headers: { 'cf-connecting-ip': '203.0.113.9' } })).status, 403, 'un amigo por el túnel no puede abrirlo');
  // Cerrar la ventana (señal): se para todo
  a.kill('SIGTERM'); await a.done;
  await until(async () => !(await alive(S + '/api/health')), 8000, 'todo parado');

  // Segundo arranque: no vuelve a instalar
  const b = launch(dir, npm, ports);
  await until(() => b.out.includes('¡Listo!'), 60000, () => 'segundo arranque:\n' + b.out);
  assert.match(b.out, /Dependencias ya instaladas/);
  assert.equal(readFileSync(join(dir, 'npm-calls.log'), 'utf8').trim().split('\n').length, 1, 'sin reinstalar');
  // Un tercer arranque mientras el segundo sigue abierto reutiliza el juego en marcha
  const c = launch(dir, npm, ports, []);
  await until(() => c.out.includes('ya estaba abierto') && c.out.includes('¡Listo!'), 30000, () => 'reutiliza:\n' + c.out);
  c.kill('SIGTERM'); await c.done;
  assert.ok(await alive(S + '/api/health'), 'el servidor del segundo sigue');
  b.kill('SIGTERM'); await b.done;
  await until(async () => !(await alive(S + '/api/health')), 8000, 'parado');

  // Cambia package.json (versión nueva del juego): vuelve a instalar
  const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')); pkg.version = '0.2.0'; writeFileSync(join(dir, 'package.json'), JSON.stringify(pkg, null, 2));
  const d = launch(dir, npm, ports, ['--install-only']);
  assert.equal(await d.done, 0); assert.match(d.out, /Instalando/);
});

test('si la instalación falla, el lanzador lo explica y sale con error', { timeout: 60000 }, async () => {
  const dir = copyProject(), p = launch(dir, fakeNpm(dir, false), [4700 + Math.floor(Math.random() * 100)]);
  assert.equal(await p.done, 1);
  assert.match(p.out, /No se pudieron instalar las dependencias/);
  assert.match(p.out, /conexión a internet/);
});

test('si en el puerto ya hay OTRA versión del juego abierta, no la usa: pide cerrar la otra ventana', { timeout: 60000 }, async () => {
  const { createServer } = await import('node:http');
  const port = 4800 + Math.floor(Math.random() * 100);
  const old = createServer((req, res) => { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify(req.url === '/api/health' ? { ok: true, version: '0.32', build: 32 } : {})); });
  await new Promise(r => old.listen(port, '0.0.0.0', r));
  try {
    const dir = copyProject(), p = launch(dir, fakeNpm(dir), [port]);
    assert.equal(await p.done, 1, p.out);
    assert.match(p.out, /Ya hay otro juego abierto en http:\/\/localhost:\d+ \(versión 0\.32\)/);
    assert.match(p.out, /Cierra la otra ventana/);
    assert.doesNotMatch(p.out, /¡Listo!/);
  } finally { old.close(); }
});
