/**
 * SOLO PRUEBAS: sustituto de `cloudflared` (aquí no se puede descargar ni llegar a Cloudflare).
 * Acepta los mismos argumentos que usa el lanzador (`tunnel --no-autoupdate --url http://localhost:PUERTO`),
 * escucha por HTTPS con un certificado autofirmado, reenvía TODO (páginas, API, /matchmake y WebSockets)
 * al puerto local, añade X-Forwarded-For como hace Cloudflare e imprime la dirección pública dentro de
 * un recuadro, con el mismo formato que cloudflared. `--version` responde como el real.
 * Variables: FAKE_TUNNEL_CERT, FAKE_TUNNEL_KEY (PEM), FAKE_TUNNEL_PORT (0 = libre).
 */
import https from 'node:https';
import http from 'node:http';
import net from 'node:net';
import { readFileSync } from 'node:fs';

const args = process.argv.slice(2);
if (args.includes('--version')) { console.log('cloudflared version 2026.1.0 (prueba)'); process.exit(0); }
const target = new URL(args[args.indexOf('--url') + 1]);
const fwd = req => Object.assign({}, req.headers, { 'x-forwarded-for': '203.0.113.7', 'x-forwarded-proto': 'https', 'cf-connecting-ip': '203.0.113.7' });
const server = https.createServer({ cert: readFileSync(process.env.FAKE_TUNNEL_CERT), key: readFileSync(process.env.FAKE_TUNNEL_KEY) }, (req, res) => {
  const up = http.request({ host: target.hostname === 'localhost' ? '127.0.0.1' : target.hostname, port: target.port, path: req.url, method: req.method, headers: fwd(req) }, r => { res.writeHead(r.statusCode, r.headers); r.pipe(res); });
  up.on('error', () => { res.writeHead(502); res.end('Bad gateway (el servidor local aún no responde)'); });
  req.pipe(up);
});
server.on('upgrade', (req, sock, head) => {
  const up = net.connect(+target.port, '127.0.0.1', () => {
    up.write(`${req.method} ${req.url} HTTP/1.1\r\n` + Object.entries(fwd(req)).map(([k, v]) => `${k}: ${v}`).join('\r\n') + '\r\n\r\n');
    if (head && head.length) up.write(head);
    up.pipe(sock); sock.pipe(up);
  });
  up.on('error', () => sock.destroy()); sock.on('error', () => up.destroy());
});
server.listen(+(process.env.FAKE_TUNNEL_PORT || 0), '127.0.0.1', () => {
  const url = `https://localhost:${server.address().port}`;
  // Mismo aspecto que la salida real de cloudflared (por stderr)
  console.error('2026-01-01T00:00:00Z INF Requesting new quick Tunnel on trycloudflare.com...');
  console.error('2026-01-01T00:00:00Z INF +--------------------------------------------------------------------------------------------+');
  console.error('2026-01-01T00:00:00Z INF |  Your quick Tunnel has been created! Visit it at (it may take some time to be reachable):  |');
  console.error(`2026-01-01T00:00:00Z INF |  ${url}                                                                    |`);
  console.error('2026-01-01T00:00:00Z INF +--------------------------------------------------------------------------------------------+');
});
for (const s of ['SIGINT', 'SIGTERM']) process.on(s, () => process.exit(0));
