/**
 * SOLO PRUEBAS: proxy HTTPS que reproduce deploy/Caddyfile (aquí no se puede descargar Caddy):
 *   - TLS con un certificado dado (autofirmado en la prueba; Let's Encrypt en el despliegue real);
 *   - /api/*, /matchmake/* y los WebSocket (Upgrade) → servidor de juego, con X-Forwarded-For/Proto;
 *   - el resto → archivos de client/dist, con las cabeceras de seguridad de _headers;
 *   - http:// → redirección a https://.
 * Uso: node tls-proxy.mjs <puertoHttps> <puertoHttp> <backendPuerto> <dirCliente> <cert.pem> <key.pem>
 */
import https from 'node:https';
import http from 'node:http';
import net from 'node:net';
import { readFileSync } from 'node:fs';
import { join, extname } from 'node:path';

const [hport, pport, backend, dir, cert, key] = process.argv.slice(2);
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8' };
// Cabeceras de _headers (formato de Cloudflare Pages / Netlify): «/*» para todo
const headers = {};
let scope = null;
for (const line of readFileSync(join(dir, '_headers'), 'utf8').split('\n')) {
  if (!line.trim()) continue;
  if (!line.startsWith(' ')) { scope = line.trim(); headers[scope] = {}; continue; }
  const i = line.indexOf(':'); headers[scope][line.slice(0, i).trim()] = line.slice(i + 1).trim();
}
const headersFor = p => Object.assign({}, headers['/*'], p.startsWith('/assets/') ? headers['/assets/*'] : p === '/' || p === '/index.html' ? headers['/index.html'] : {});
const fwd = req => Object.assign({}, req.headers, { 'x-forwarded-for': req.socket.remoteAddress.replace(/^::ffff:/, ''), 'x-forwarded-proto': 'https', 'x-forwarded-host': req.headers.host });

const server = https.createServer({ cert: readFileSync(cert), key: readFileSync(key) }, (req, res) => {
  const p = new URL(req.url, 'https://x').pathname;
  if (p.startsWith('/api/') || p.startsWith('/matchmake/')) {
    const up = http.request({ host: '127.0.0.1', port: backend, method: req.method, path: req.url, headers: fwd(req) }, r => { res.writeHead(r.statusCode, r.headers); r.pipe(res); });
    up.on('error', () => { res.writeHead(502); res.end('Bad gateway'); });
    req.pipe(up); return;
  }
  const f = p === '/' ? 'index.html' : p.slice(1).replace(/\.\.+/g, '');
  try { const body = readFileSync(join(dir, f)); res.writeHead(200, Object.assign({ 'content-type': types[extname(f)] || 'application/octet-stream' }, headersFor(p))); res.end(body); }
  catch { res.writeHead(404); res.end(); }
});
// WebSocket seguro (wss://): se reenvía la petición de Upgrade tal cual y se unen los dos sockets
server.on('upgrade', (req, socket, head) => {
  const up = net.connect(+backend, '127.0.0.1', () => {
    const h = fwd(req);
    up.write(`${req.method} ${req.url} HTTP/1.1\r\n` + Object.entries(h).map(([k, v]) => `${k}: ${v}`).join('\r\n') + '\r\n\r\n');
    if (head && head.length) up.write(head);
    up.pipe(socket); socket.pipe(up);
  });
  const end = () => { socket.destroy(); up.destroy(); };
  up.on('error', end); socket.on('error', end); up.on('close', end); socket.on('close', end);
});
server.listen(+hport, '127.0.0.1');
http.createServer((req, res) => { res.writeHead(308, { location: `https://localhost:${hport}${req.url}` }); res.end(); }).listen(+pport, '127.0.0.1', () => console.log('ready'));
