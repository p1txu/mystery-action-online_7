/**
 * «Crear enlace para amigos» desde el juego (server/src/host): el servidor abre el túnel bajo demanda,
 * solo si se pide desde este mismo ordenador, añade y retira su origen, y explica los fallos.
 * cloudflared se sustituye por tests/deploy/fake-cloudflared.mjs (proxy HTTPS real con certificado autofirmado).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, chmodSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { isLocalRequest } from '../../server/src/http/api.js';
import { HostTunnel } from '../../server/src/host/HostTunnel.js';
import { loadConfig } from '../../server/src/config.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const req = (url, headers = {}) => new Request(url, { headers });

test('isLocalRequest: solo el navegador de este ordenador (ni el túnel, ni la red de casa, ni otra web)', () => {
  assert.equal(isLocalRequest(req('http://localhost:5173/api/host')), true);
  assert.equal(isLocalRequest(req('http://127.0.0.1:5173/api/host', { origin: 'http://localhost:5173' })), true);
  assert.equal(isLocalRequest(req('http://localhost:5173/api/host', { 'cf-connecting-ip': '203.0.113.7' })), false, 'llega por Cloudflare');
  assert.equal(isLocalRequest(req('http://localhost:5173/api/host', { 'x-forwarded-for': '203.0.113.7' })), false, 'llega por un proxy');
  assert.equal(isLocalRequest(req('https://algo.trycloudflare.com/api/host')), false, 'dirección pública');
  assert.equal(isLocalRequest(req('http://192.168.1.20:5173/api/host')), false, 'otro PC de la casa');
  assert.equal(isLocalRequest(req('http://localhost:5173/api/host', { origin: 'https://otra-web.example' })), false, 'otra web abierta en el navegador');
});

test('configuración: el anfitrión en casa admite la red local por http, pero nada público', () => {
  const base = { NODE_ENV: 'production', AUTH_SECRET: 'x'.repeat(40), HOST_TUNNEL: '1' };
  assert.deepEqual(loadConfig(Object.assign({}, base, { CLIENT_ORIGIN: 'http://localhost:5173,http://192.168.1.20:5173' })).clientOrigins, ['http://localhost:5173', 'http://192.168.1.20:5173']);
  assert.throws(() => loadConfig(Object.assign({}, base, { CLIENT_ORIGIN: 'http://203.0.113.5:5173' })), /HTTPS/);
  assert.throws(() => loadConfig(Object.assign({}, base, { HOST_TUNNEL: '', CLIENT_ORIGIN: 'http://192.168.1.20:5173' })), /HTTPS/, 'sin el modo anfitrión, igual que siempre');
});

test('HostTunnel: abre el túnel, comprueba que responde, permite su origen y al cerrar lo retira; los fallos se explican', { timeout: 60000 }, async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'ma-tunnel-'));
  execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', join(tmp, 'key.pem'), '-out', join(tmp, 'cert.pem'), '-days', '1', '-subj', '/CN=localhost', '-addext', 'subjectAltName=DNS:localhost,IP:127.0.0.1'], { stdio: 'ignore' });
  const cf = join(tmp, 'cf.sh'); writeFileSync(cf, `#!/bin/sh\nexec node "${join(HERE, 'fake-cloudflared.mjs')}" "$@"\n`); chmodSync(cf, 0o755);
  Object.assign(process.env, { MA_CLOUDFLARED: cf, MA_TUNNEL_RE: 'https://localhost:[0-9]+', FAKE_TUNNEL_CERT: join(tmp, 'cert.pem'), FAKE_TUNNEL_KEY: join(tmp, 'key.pem'), NODE_TLS_REJECT_UNAUTHORIZED: '0' });
  // Servidor local mínimo al que reenvía el túnel
  const http = await import('node:http');
  const srv = http.createServer((q, r) => { r.writeHead(200, { 'content-type': 'application/json' }); r.end('{"ok":true}'); });
  await new Promise(r => srv.listen(0, '127.0.0.1', r));
  const origins = [];
  const t = new HostTunnel({ port: srv.address().port, binDir: join(tmp, 'bin'), onUrl: u => origins.push(u), onClose: u => origins.splice(origins.indexOf(u), 1) });
  assert.equal(t.status().state, 'off');
  assert.equal(t.open().state, 'starting');
  assert.equal(t.open().state, 'starting', 'pulsar dos veces no abre dos túneles');
  for (let i = 0; i < 200 && t.state !== 'on' && t.state !== 'error'; i++) await new Promise(r => setTimeout(r, 100));
  const st = t.status();
  assert.equal(st.state, 'on', JSON.stringify(st)); assert.match(st.url, /^https:\/\/localhost:\d+$/); assert.equal(st.reachable, true);
  assert.deepEqual(origins, [st.url], 'su origen se permite mientras está abierto');
  assert.equal((await fetch(st.url + '/x')).status, 200, 'el enlace llega a este servidor');
  t.close();
  assert.deepEqual(origins, [], 'al cerrar se retira'); assert.equal(t.status().state, 'off');
  await new Promise(r => setTimeout(r, 500));
  await assert.rejects(fetch(st.url + '/x', { signal: AbortSignal.timeout(2000) }), 'el túnel está cerrado');
  // Sin cloudflared que funcione: error comprensible y se puede reintentar
  process.env.MA_CLOUDFLARED = join(tmp, 'no-existe');
  const t2 = new HostTunnel({ port: srv.address().port, binDir: join(tmp, 'bin') });
  t2.open(); for (let i = 0; i < 50 && t2.state !== 'error'; i++) await new Promise(r => setTimeout(r, 50));
  assert.equal(t2.state, 'error'); assert.match(t2.error, /MA_CLOUDFLARED no funciona/);
  srv.close();
});
