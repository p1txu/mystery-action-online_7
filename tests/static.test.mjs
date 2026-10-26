/** El servidor sirve el cliente compilado (modo anfitrión): solo «/», index.html y /assets/, nunca fuera de la carpeta. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { join, resolve } from 'node:path';
import { staticPath, clientCsp } from '../server/src/http/static.js';
import { loadConfig } from '../server/src/config.js';

test('rutas que sirve y rutas que deja pasar a Colyseus (API, matchmake) o rechaza', () => {
  const d = resolve('/srv/juego');
  assert.equal(staticPath(d, '/'), join(d, 'index.html'));
  assert.equal(staticPath(d, '/index.html?sala=K7P2QZ'), join(d, 'index.html'));
  assert.equal(staticPath(d, '/assets/game-abc.js'), join(d, 'assets/game-abc.js'));
  for (const u of ['/api/health', '/matchmake/create/expedition', '/package.json', '/data/perfiles.db', '/.dev-secret'])
    assert.equal(staticPath(d, u), null, u);
  for (const u of ['/assets/../../etc/passwd', '/assets/%2e%2e/%2e%2e/data/.dev-secret', '/assets/..%2f..%2fserver/src/config.js', '/assets/a%00.js'])
    assert.equal(staticPath(d, u), null, u);
});

test('CSP: el juego solo conecta con su mismo sitio (también por WebSocket)', () => {
  const c = clientCsp('palabras-al-azar.trycloudflare.com');
  assert.match(c, /connect-src 'self' ws:\/\/palabras-al-azar\.trycloudflare\.com wss:\/\/palabras-al-azar\.trycloudflare\.com;/);
  assert.match(c, /frame-ancestors 'none'/);
  assert.doesNotMatch(clientCsp('evil.com; script-src *'), /script-src \*/, 'una cabecera Host maliciosa no inyecta directivas');
});

test('modo anfitrión: producción con el enlace del túnel y localhost; CLIENT_DIR configurable', () => {
  const c = loadConfig({ NODE_ENV: 'production', AUTH_SECRET: 'x'.repeat(48), CLIENT_ORIGIN: 'https://a-b-c-d.trycloudflare.com,http://localhost:2567', CLIENT_DIR: './client/dist', TRUST_PROXY: '1', DATA_DIR: '/tmp/ma-cfg-test' });
  assert.deepEqual(c.clientOrigins, ['https://a-b-c-d.trycloudflare.com', 'http://localhost:2567']);
  assert.equal(c.clientDir, resolve('./client/dist')); assert.equal(c.trustProxy, 1);
  assert.equal(loadConfig({ DATA_DIR: '/tmp/ma-cfg-test' }).clientDir, '', 'por defecto no sirve el juego');
});
