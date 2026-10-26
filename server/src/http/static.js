/**
 * El servidor de juego también sirve el cliente compilado (client/dist) desde el MISMO puerto.
 * Lo usa el modo anfitrión (tools/launch.mjs --host): un solo puerto que publicar por el túnel,
 * y el juego habla con su servidor en la misma dirección (sin CORS ni puertos aparte).
 *
 * Solo se atienden GET/HEAD de «/», «/index.html» y «/assets/…»; todo lo demás (API, /matchmake,
 * WebSockets) sigue intacto hacia Colyseus. Nada fuera de la carpeta del cliente es accesible.
 */
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, normalize, resolve, sep, extname } from 'node:path';

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.json': 'application/json' };

/** Política de seguridad: el juego solo puede conectar con este mismo servidor (http/ws o https/wss). */
export function clientCsp(host) {
  const h = String(host || '').replace(/[^a-zA-Z0-9.:[\]-]/g, '');
  const conn = ["'self'"]; if (h) conn.push(`ws://${h}`, `wss://${h}`);
  return [`default-src 'self'`, `script-src 'self'`, `style-src 'self' 'unsafe-inline' https://fonts.googleapis.com`, `font-src 'self' https://fonts.gstatic.com`,
    `img-src 'self' data: blob:`, `connect-src ${conn.join(' ')}`, `object-src 'none'`, `base-uri 'self'`, `frame-ancestors 'none'`].join('; ');
}

/** Ruta del archivo a servir, o null si la petición no es del cliente (o intenta salir de la carpeta). */
export function staticPath(dir, url) {
  let p;
  try { p = decodeURIComponent(new URL(url || '/', 'http://x').pathname); } catch { return null; }
  if (p === '/' || p === '/index.html') return join(dir, 'index.html');
  if (!p.startsWith('/assets/') || p.includes('\0')) return null;
  const f = normalize(join(dir, p));
  return f.startsWith(resolve(dir) + sep) ? f : null;
}

/** Envuelve los manejadores HTTP de Colyseus: primero el cliente estático, si no, lo de siempre. */
export function serveClient(httpServer, dir, log) {
  dir = resolve(dir);
  if (!existsSync(join(dir, 'index.html'))) throw new Error(`No está el juego compilado en ${dir} (falta index.html)`);
  const listeners = httpServer.listeners('request');
  httpServer.removeAllListeners('request');
  httpServer.on('request', (req, res) => {
    const file = (req.method === 'GET' || req.method === 'HEAD') ? staticPath(dir, req.url) : null;
    if (!file) { for (const l of listeners) l.call(httpServer, req, res); return; }
    readFile(file).then(body => {
      const index = file.endsWith('index.html');
      // Marca para el juego: lo sirve su propio servidor, así que habla con esta misma dirección (sea localhost, la IP de casa o el enlace del túnel)
      if (index) body = Buffer.from(String(body).replace('</head>', '<meta name="ma-server" content="same-origin">\n</head>'));
      res.writeHead(200, {
        'content-type': TYPES[extname(file)] || 'application/octet-stream',
        'cache-control': index ? 'no-cache' : 'public, max-age=31536000, immutable',
        'content-security-policy': clientCsp(req.headers.host),
        'x-content-type-options': 'nosniff', 'referrer-policy': 'strict-origin-when-cross-origin',
        'permissions-policy': 'camera=(), microphone=(), geolocation=()',
      });
      res.end(req.method === 'HEAD' ? undefined : body);
    }, () => { res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }); res.end('No encontrado'); });
  });
  log && log.info('client.served', { dir });
}
