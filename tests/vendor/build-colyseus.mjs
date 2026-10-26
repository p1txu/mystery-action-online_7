#!/usr/bin/env node
/**
 * SOLO PRUEBAS. Compila Colyseus 0.18 (servidor y SDK) y el cliente de PostgreSQL `pg` desde su código fuente en GitHub con
 * esbuild, para poder ejecutar las pruebas multijugador en un entorno sin acceso a npm.
 * No modifica Colyseus: se compila tal cual. Lo único sustituido es `express` (Colyseus lo
 * importa, pero solo lo usa con la opción `express` de defineServer, que este proyecto no usa).
 *
 *   node tests/vendor/build-colyseus.mjs [carpeta-con-los-repos]
 *   → tests/.vendor/{server/*.mjs, sdk.node.mjs, sdk.browser.mjs, loader.mjs}
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const HERE = dirname(fileURLToPath(import.meta.url)), ROOT = resolve(HERE, '../..');
const SRC = resolve(process.argv[2] || join(ROOT, 'tests/.vendor/src')), OUT = join(ROOT, 'tests/.vendor');
const require = createRequire(import.meta.url);
const esbuild = require(process.env.ESBUILD_MODULE || 'esbuild');
const WS = process.env.WS_MODULE || 'ws';
const sources = JSON.parse(readFileSync(join(HERE, 'sources.json'), 'utf8'));

// 1. Código fuente fijado por commit
mkdirSync(SRC, { recursive: true });
for (const [name, s] of Object.entries(sources)) {
  if (name === '_') continue;
  const dir = join(SRC, name);
  if (!existsSync(dir)) execFileSync('git', ['clone', '-q', '--depth', '1', '--branch', s.ref, s.repo, dir], { stdio: 'inherit' });
  const head = execFileSync('git', ['-C', dir, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  if (head !== s.commit) throw new Error(`${name}: commit ${head} distinto del fijado ${s.commit}`);
}
const P = (...p) => join(SRC, ...p);
const C = (...p) => P('colyseus', 'packages', ...p);

// 2. Resolución de paquetes a su código fuente
const alias = {
  '@colyseus/core': C('core/src/index.ts'),
  '@colyseus/ws-transport': C('transport/ws-transport/src/index.ts'),
  '@colyseus/sdk': C('sdk/src/index.ts'),
  '@colyseus/shared-types': C('shared-types/src/index.ts'),
  '@colyseus/greeting-banner': C('greeting-banner/src/index.ts'),
  '@colyseus/better-call': P('better-call/packages/better-call/src/index.ts'),
  '@colyseus/better-call/node': P('better-call/packages/better-call/src/adapters/node/index.ts'),
  '@colyseus/schema': P('schema/src/index.ts'),
  '@colyseus/schema/input': join(OUT, 'schema-input-shim.ts'),   // como el build oficial: primero el índice principal
  '@colyseus/timer': P('timer/src/index.ts'),
  '@colyseus/clock': P('clock/src/index.ts'),
  'msgpackr': P('msgpackr/node-index.js'),
  'nanoid': P('nanoid/index.js'),
  'debug': P('debug/src/index.js'),
  'ms': P('ms/index.js'),
  'rou3': P('rou3/src/index.ts'),
  'set-cookie-parser': P('set-cookie-parser/lib/set-cookie.js'),
  '@better-auth/utils': P('bautils/src/index.ts'),
  '@better-fetch/fetch': P('better-fetch/packages/better-fetch/src/index.ts'),
};
const browserAlias = Object.assign({}, alias, { msgpackr: P('msgpackr/index.js'), debug: P('debug/src/browser.js') });
const resolver = (map, external) => ({
  name: 'vendor-resolve',
  setup(b) {
    b.onResolve({ filter: /.*/ }, args => {
      if (external.includes(args.path)) return { path: args.path, external: true };
      if (args.path === 'express') return { path: 'express', namespace: 'stub' };
      if (args.path === 'ws' && b.initialOptions.platform === 'browser') return { path: 'ws', namespace: 'nows' };   // el navegador usa su WebSocket
      if (map[args.path]) return { path: map[args.path] };
      for (const sub of ['@better-auth/utils/']) if (args.path.startsWith(sub)) return { path: P('bautils/src', args.path.slice(sub.length) + '.ts') };
      return undefined;
    });
    b.onLoad({ filter: /.*/, namespace: 'nows' }, () => ({ contents: 'export default undefined;', loader: 'js' }));
    b.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({ contents: 'export default function express() { throw new Error("express no está disponible en el build de pruebas"); }', loader: 'js' }));
  },
});
const common = { bundle: true, format: 'esm', logLevel: 'error', tsconfigRaw: { compilerOptions: { experimentalDecorators: true, useDefineForClassFields: false } }, define: { 'process.env.NODE_ENV': '"development"' } };

writeFileSync(join(OUT, 'schema-input-shim.ts'), `import '@colyseus/schema';\nexport * from ${JSON.stringify(P('schema/src/input/index.ts'))};\n`);
// Servidor: core + transporte + esquema en UN solo módulo (una sola copia de @colyseus/schema;
// el esquema se evalúa primero, como en el build oficial). Encima, envoltorios por paquete.
writeFileSync(join(OUT, 'entry-server.ts'), `import * as schema from '@colyseus/schema';\nimport * as core from '@colyseus/core';\nimport * as ws from '@colyseus/ws-transport';\nexport { schema, core, ws };\n`);
await esbuild.build(Object.assign({}, common, {
  entryPoints: [join(OUT, 'entry-server.ts')], outfile: join(OUT, 'server/all.mjs'), platform: 'node', target: 'node20',
  plugins: [resolver(alias, ['ws', 'msgpackr-extract', 'uWebSockets.js', '@pm2/io', '@colyseus/auth', 'zod'])],
  banner: { js: `import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);` },
}));
// SDK para Node (clientes de prueba) y para el navegador
await esbuild.build(Object.assign({}, common, { entryPoints: [alias['@colyseus/sdk']], outfile: join(OUT, 'sdk.node.mjs'), platform: 'node', target: 'node20', plugins: [resolver(alias, ['ws'])],
  banner: { js: `import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);` } }));
await esbuild.build(Object.assign({}, common, { entryPoints: [alias['@colyseus/sdk']], outfile: join(OUT, 'sdk.browser.mjs'), platform: 'browser', target: 'es2022', plugins: [resolver(browserAlias, [])] }));

// Cliente de PostgreSQL (node-postgres), para probar PostgresProfileStore contra un PostgreSQL real
const N = (...p) => P('node-postgres', 'packages', ...p);
const pgAlias = { 'pg': N('pg/lib/index.js'), 'pg-pool': N('pg-pool/index.js'), 'pg-protocol': N('pg-protocol/src/index.ts'), 'pg-connection-string': N('pg-connection-string/index.js'),
  'pg-types': P('pg-types/index.js'), 'pg-int8': P('pg-int8/index.js'), 'postgres-array': P('postgres-array/index.js'), 'postgres-bytea': P('postgres-bytea/index.js'),
  'postgres-date': P('postgres-date/index.js'), 'postgres-interval': P('postgres-interval/index.js'), 'pgpass': P('pgpass/lib/index.js'), 'split2': P('split2/index.js'), 'xtend/mutable': P('xtend/mutable.js') };
await esbuild.build(Object.assign({}, common, { entryPoints: [pgAlias.pg], outfile: join(OUT, 'pg.mjs'), platform: 'node', target: 'node20',
  plugins: [resolver(pgAlias, ['pg-native', 'pg-cloudflare'])], banner: { js: `import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);` } }));

// Cargador para que `import 'colyseus'` (y compañía) use estos builds
const map = { 'pg': 'pg.mjs', 'colyseus': 'server/colyseus.mjs', '@colyseus/core': 'server/colyseus.mjs', '@colyseus/ws-transport': 'server/ws-transport.mjs', '@colyseus/schema': 'server/schema.mjs', '@colyseus/sdk': 'sdk.node.mjs' };
const urls = Object.fromEntries(Object.entries(map).map(([k, v]) => [k, pathToFileURL(join(OUT, v)).href]));
let wsUrl; try { wsUrl = pathToFileURL(join(dirname(require.resolve(WS + '/package.json')), 'wrapper.mjs')).href; } catch { wsUrl = null; }   // entrada ESM de ws
writeFileSync(join(OUT, 'hooks.mjs'), `const M = ${JSON.stringify(urls)}; const WS = ${JSON.stringify(wsUrl)};
export async function resolve(spec, ctx, next) { if (M[spec]) return { url: M[spec], shortCircuit: true }; if (spec === 'ws' && WS) return { url: WS, shortCircuit: true }; return next(spec, ctx); }\n`);
writeFileSync(join(OUT, 'loader.mjs'), `import { register } from 'node:module';\nregister(${JSON.stringify(pathToFileURL(join(OUT, 'hooks.mjs')).href)});\n`);
const names = JSON.parse(execFileSync(process.execPath, ['--import', pathToFileURL(join(OUT, 'loader.mjs')).href, '--input-type=module', '-e', `import * as a from ${JSON.stringify(pathToFileURL(join(OUT, 'server/all.mjs')).href)}; console.log(JSON.stringify({ schema: Object.keys(a.schema), core: Object.keys(a.core), ws: Object.keys(a.ws) }))`], { encoding: 'utf8' }));
const wrap = (file, ns) => writeFileSync(join(OUT, 'server', file), `import { ${ns} as m } from './all.mjs';\nexport const { ${names[ns].filter(n => n !== 'default').join(', ')} } = m;\n` + (names[ns].includes('default') ? 'export default m.default;\n' : ''));
wrap('colyseus.mjs', 'core'); wrap('ws-transport.mjs', 'ws'); wrap('schema.mjs', 'schema');
const ver = JSON.parse(readFileSync(C('core/package.json'), 'utf8')).version, sv = JSON.parse(readFileSync(P('schema/package.json'), 'utf8')).version, sdkv = JSON.parse(readFileSync(C('sdk/package.json'), 'utf8')).version;
writeFileSync(join(OUT, 'VERSIONS.json'), JSON.stringify({ '@colyseus/core': ver, '@colyseus/schema': sv, '@colyseus/sdk': sdkv }, null, 2));
console.log(`Colyseus core ${ver}, schema ${sv}, sdk ${sdkv} → ${OUT}`);
