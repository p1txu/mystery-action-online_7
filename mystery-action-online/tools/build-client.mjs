/**
 * Compila el cliente para publicarlo (o para desarrollo con --dev).
 *
 *   SERVER_URL=https://api.tudominio.es node tools/build-client.mjs     → client/dist/
 *   node tools/build-client.mjs                                          → servidor en la misma dirección que la página
 *   node tools/build-client.mjs --out /otra/carpeta                     → compila en otra carpeta
 *   node tools/build-client.mjs --dev [--port 5173]                      → servidor local con recarga, http://localhost:5173
 *
 * Salida (client/dist):
 *   index.html                 sin caché (siempre la última versión)
 *   assets/game-<huella>.js    el juego (script clásico generado desde el prototipo)
 *   assets/main-<huella>.js    capa online + SDK de Colyseus;  assets/main-<huella>.css
 *   _headers                   cabeceras de seguridad y caché (Cloudflare Pages y Netlify las leen)
 * Usa esbuild (dependencia de desarrollo del proyecto). Antes ejecuta `npm run split`.
 */
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2), dev = args.includes('--dev');
const port = +(args[args.indexOf('--port') + 1] || 0) || 5173;
const esbuild = await import('esbuild').catch(() => process.env.ESBUILD_MODULE ? import(process.env.ESBUILD_MODULE + '/lib/main.js') : null).then(m => m && (m.default || m));
if (!esbuild) { console.error('Falta esbuild: ejecuta «npm install» en la raíz del proyecto.'); process.exit(1); }

/** Dirección del servidor fijada al compilar: https://dominio[:puerto], sin ruta. Vacío = misma dirección que la página. */
export function checkServerUrl(v, { allowHttp = false } = {}) {
  const url = String(v || '').trim().replace(/\/+$/, '');
  if (!url) return '';
  if (!/^https?:\/\/[^/\s?#]+$/.test(url)) throw new Error(`SERVER_URL no válido: «${v}». Formato: https://servidor.tudominio.es (sin ruta)`);
  if (url.startsWith('http://') && !allowHttp && !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(url))
    throw new Error(`SERVER_URL usa http:// (${url}). Una página publicada por HTTPS no puede conectar con él: usa https://`);
  return url;
}
const hash = buf => createHash('sha256').update(buf).digest('hex').slice(0, 10);

export async function buildClient({ outdir = join(ROOT, 'client/dist'), serverUrl = '', minify = true, devServerPort = 0 } = {}) {
  const index = join(ROOT, 'client/index.html'), gameJs = join(ROOT, 'client/public/game.js');
  if (!existsSync(index) || !existsSync(gameJs)) throw new Error('Faltan client/index.html o client/public/game.js: ejecuta «npm run split» antes.');
  rmSync(outdir, { recursive: true, force: true }); mkdirSync(join(outdir, 'assets'), { recursive: true });
  const r = await esbuild.build({
    entryPoints: [join(ROOT, 'client/src/main.js')], bundle: true, format: 'esm', target: 'es2022', minify, sourcemap: minify ? false : 'inline',
    outdir: join(outdir, 'assets'), entryNames: '[name]-[hash]', metafile: true, logLevel: 'warning',
    define: { __SERVER_URL__: JSON.stringify(serverUrl), __DEV_SERVER_PORT__: String(devServerPort | 0), 'import.meta.env': '{}' },
    alias: process.env.COLYSEUS_SDK_ALIAS ? { '@colyseus/sdk': process.env.COLYSEUS_SDK_ALIAS } : {},
  });
  const outs = Object.keys(r.metafile.outputs).map(f => f.split('/assets/').pop());
  const mainJs = outs.find(f => f.endsWith('.js')), mainCss = outs.find(f => f.endsWith('.css'));
  const game = readFileSync(gameJs), gameName = `game-${hash(game)}.js`;
  writeFileSync(join(outdir, 'assets', gameName), game);
  let html = readFileSync(index, 'utf8');
  if (!html.includes('<script src="/game.js"></script>') || !html.includes('<script type="module" src="/src/main.js"></script>')) throw new Error('client/index.html no tiene las etiquetas esperadas (¿npm run split?)');
  html = html.replace('<script src="/game.js"></script>', `<script src="./assets/${gameName}"></script>`)
    .replace('<script type="module" src="/src/main.js"></script>', `<script type="module" src="./assets/${mainJs}"></script>`)
    .replace('</head>', (mainCss ? `<link rel="stylesheet" href="./assets/${mainCss}">\n` : '') + '</head>');
  writeFileSync(join(outdir, 'index.html'), html);
  writeFileSync(join(outdir, '_headers'), securityHeaders(serverUrl));
  return { outdir, files: ['index.html', `assets/${gameName}`, `assets/${mainJs}`, mainCss && `assets/${mainCss}`, '_headers'].filter(Boolean), serverUrl };
}

/** Política de seguridad del contenido: el juego solo puede conectar con su servidor. */
export function csp(serverUrl) {
  const conn = ["'self'"];
  if (serverUrl) { conn.push(serverUrl, serverUrl.replace(/^http/, 'ws')); }
  return [`default-src 'self'`, `script-src 'self'`, `style-src 'self' 'unsafe-inline' https://fonts.googleapis.com`, `font-src 'self' https://fonts.gstatic.com`,
    `img-src 'self' data: blob:`, `connect-src ${conn.join(' ')}`, `object-src 'none'`, `base-uri 'self'`, `frame-ancestors 'none'`].join('; ');
}
function securityHeaders(serverUrl) {
  return `/*
  Content-Security-Policy: ${csp(serverUrl)}
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: camera=(), microphone=(), geolocation=()
  Strict-Transport-Security: max-age=31536000
/index.html
  Cache-Control: no-cache
/
  Cache-Control: no-cache
/assets/*
  Cache-Control: public, max-age=31536000, immutable
`;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (dev) {
      // Desarrollo: compila sin minimizar, vuelve a compilar al guardar y sirve en http://localhost:<port>
      const out = join(ROOT, 'client/.dev'), url = checkServerUrl(process.env.SERVER_URL || '', { allowHttp: true });
      let busy = false; const again = async () => { if (busy) return; busy = true; try { await buildClient({ outdir: out, serverUrl: url, minify: false, devServerPort: +(process.env.SERVER_PORT || 2567) }); console.log('[cliente] compilado', new Date().toLocaleTimeString()); } catch (e) { console.error('[cliente]', e.message); } busy = false; };
      await again();
      const { watch } = await import('node:fs');
      for (const d of ['client/src', 'client/public', 'shared']) watch(join(ROOT, d), { recursive: true }, () => setTimeout(again, 100));
      const { createServer } = await import('node:http');
      const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8' };
      createServer((req, res) => {
        const p = new URL(req.url, 'http://x').pathname, f = join(out, p === '/' ? 'index.html' : p.replace(/\.\.+/g, ''));
        try { const body = readFileSync(f); res.writeHead(200, { 'content-type': types[f.slice(f.lastIndexOf('.'))] || 'application/octet-stream', 'cache-control': 'no-store' }); res.end(body); }
        catch { res.writeHead(404); res.end(); }
      }).listen(port, async () => {
        const { networkInterfaces } = await import('node:os');
        const lan = Object.values(networkInterfaces()).flat().filter(i => i && i.family === 'IPv4' && !i.internal).map(i => `http://${i.address}:${port}`);
        console.log(`[cliente] en este ordenador: http://localhost:${port}`);
        if (lan.length) console.log(`[cliente] desde otro ordenador de tu red: ${lan.join('  ·  ')}   (el servidor debe estar en marcha en este equipo, puerto ${process.env.SERVER_PORT || 2567})`);
        if (url) console.log(`[cliente] servidor fijado: ${url}`);
      });
    } else {
      const url = checkServerUrl(process.env.SERVER_URL || process.env.VITE_SERVER_URL || '');
      const o = args.indexOf('--out'), r = await buildClient({ serverUrl: url, ...(o >= 0 ? { outdir: resolve(args[o + 1]) } : {}) });
      console.log(`Cliente compilado en ${r.outdir}\n  servidor: ${url || '(la misma dirección que la página)'}\n  ` + r.files.join('\n  '));
    }
  } catch (e) { console.error(e.message); process.exit(1); }
}
