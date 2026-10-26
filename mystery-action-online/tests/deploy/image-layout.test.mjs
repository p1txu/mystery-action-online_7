/**
 * Sin Docker aquí, se comprueba lo que hará el Dockerfile: se copian SOLO los archivos de sus
 * instrucciones COPY a una carpeta vacía (como la imagen), se pasa su comprobación y se arranca el
 * servidor desde allí con la configuración de producción. Si falta un archivo, el arranque falla.
 * También prueba la copia de seguridad en caliente de SQLite.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, existsSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const LOADER = existsSync(join(ROOT, 'node_modules/@colyseus/core')) ? [] : ['--import', join(ROOT, 'tests/.vendor/loader.mjs')];
const wait = ms => new Promise(r => setTimeout(r, ms));

test('la imagen del servidor contiene todo lo necesario y arranca en producción', { timeout: 60000 }, async () => {
  const app = mkdtempSync(join(tmpdir(), 'ma-image-')), data = mkdtempSync(join(tmpdir(), 'ma-image-data-'));
  const copies = readFileSync(join(ROOT, 'Dockerfile'), 'utf8').split('\n').filter(l => /^COPY /.test(l)).map(l => l.slice(5).trim().split(/\s+/));
  assert.ok(copies.length >= 8);
  for (const parts of copies) {
    const dst = parts.pop();
    for (const src of parts) {
      if (src.endsWith('*')) continue;                                   // package-lock.json* (opcional)
      const from = join(ROOT, src), to = join(app, dst.endsWith('/') ? (src.endsWith('/') ? dst : join(dst, src.split('/').pop())) : dst);
      assert.ok(existsSync(from), 'el Dockerfile copia ' + src);
      if (src.endsWith('/')) cpSync(from, join(app, dst), { recursive: true }); else { mkdirSync(dirname(to), { recursive: true }); cpSync(from, to); }
    }
  }
  // Exclusiones del .dockerignore: nada de secretos ni datos en la imagen
  for (const f of ['.env', 'data', 'tests', 'node_modules']) assert.ok(!existsSync(join(app, f)), f + ' no está en la imagen');
  execFileSync(process.execPath, ['tools/split-prototype.mjs', '--check'], { cwd: app });   // RUN … --check
  const port = 3500 + Math.floor(Math.random() * 300);
  const p = spawn(process.execPath, [...LOADER, 'server/src/index.js'], { cwd: app, env: { PATH: process.env.PATH, NODE_ENV: 'production', PORT: String(port), DATA_DIR: data, AUTH_SECRET: randomBytes(48).toString('base64url'), CLIENT_ORIGIN: 'https://juego.ejemplo.test', TRUST_PROXY: '1' }, stdio: ['ignore', 'pipe', 'pipe'] });
  let out = ''; p.stdout.on('data', d => { out += d; }); p.stderr.on('data', d => { out += d; });
  try {
    for (let i = 0; i < 150 && !out.includes('server.ready'); i++) await wait(100);
    assert.ok(out.includes('server.ready'), out.slice(-500));
    // La orden del HEALTHCHECK del Dockerfile
    const hc = readFileSync(join(ROOT, 'Dockerfile'), 'utf8').match(/CMD node -e "(.+)"/)[1];
    execFileSync(process.execPath, ['-e', hc], { env: { PORT: String(port) } });
    const r = await fetch(`http://127.0.0.1:${port}/api/ready`).then(x => x.json());
    assert.equal(r.db, 'ok');
    await fetch(`http://127.0.0.1:${port}/api/auth/guest`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-for': '192.0.2.1' }, body: '{"name":"Copia"}' });
    // Copia de seguridad en caliente, con el servidor funcionando
    const b = JSON.parse(execFileSync(process.execPath, [join(app, 'server/scripts/backup-sqlite.mjs')], { env: { PATH: process.env.PATH, DATA_DIR: data } }).toString().trim().split('\n').pop());
    assert.equal(b.integrity, 'ok'); assert.equal(b.accounts, 1); assert.ok(b.file.startsWith(join(data, 'backups')));
  } finally { p.kill('SIGTERM'); await new Promise(r => p.on('exit', r)); }
});
