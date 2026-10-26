#!/usr/bin/env node
/**
 * split-prototype.mjs — separa el prototipo de un solo HTML (Claude Artifact) en:
 *
 *   shared/engine-core.generated.js  Reglas del juego sin dibujo (secciones 1-18 y 21-22 del
 *                                     prototipo) como módulo ESM. Lo usa el servidor para la
 *                                     simulación autoritativa y los tests.
 *   client/public/game.js            El script completo del prototipo (script clásico, sin cambios).
 *   client/index.html                El HTML del prototipo con el script sacado a /game.js y la
 *                                     capa de red (ESM) añadida.
 *
 * El prototipo sigue siendo la fuente de verdad y sigue funcionando solo, sin servidor.
 * Uso:   node tools/split-prototype.mjs          (genera)
 *        node tools/split-prototype.mjs --check  (falla si los generados están desactualizados)
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'prototype', 'mystery-action.html');
const CHECK = process.argv.includes('--check');

/** Tramos del script que forman el núcleo compartido (marcadores de sección del prototipo). */
const CORE_RANGES = [
  ['/* ---------- 1. CONFIG', '/* ---------- 19. FloorRT'],
  ['/* ---------- 21. Compañeros', '/* ---------- 23. Aldea'],
];

/** Nombres que exporta el núcleo. Se comprueba que todos estén declarados en el prototipo. */
const EXPORTS = [
  'CONFIG', 'U', 'T', 'SOLID', 'TILE_NAMES', 'World', 'Particles',
  'CLASSES', 'CLASS_STATS', 'ELITE', 'eliteChance', 'floorEnemies', 'FAMILIES', 'Deco', 'Terrain', 'ALLY_ABILITY', 'canEquip', 'OLD_EQUIP_SLOTS', 'FRACTION_STATS', 'fmtStat', 'DMG', 'classMoves', 'groundTarget',
  'SPECIES', 'EVOLVED', 'FORMS', 'Progress', 'EVOLUTIONS', 'EVO_ITEM_MIN_LEVEL',
  'Combat', 'Effects', 'Projectile', 'Zone', 'BLOCKS_SHOT',
  'TYPES', 'TYPE_CHART', 'typeEff', 'calcStats', 'MAX_LEVEL', 'expNeed', 'expYield', 'MOVES',
  'BOONS', 'Boons', 'BOSS_RAGE', 'GEODA', 'Geoda', 'Boulder', 'Actor', 'Player', 'Enemy', 'STOP', 'ENEMIES', 'ENEMY_VARIANTS', 'makeKind', 'BOSSES', 'makeBossKind',
  'BIOMES', 'RARITIES', 'CATEGORIES', 'EQUIP_SLOTS', 'ITEMS', 'QUICK', 'RARITY_ORDER', 'STAT_NAMES',
  'BASE_SHOP', 'SHOP_TIERS', 'shopStock', 'sellPrice', 'RECIPES', 'newUid',
  'LOOT', 'Loot', 'Inventory', 'finalStats', 'freshEquip', 'equipRegen',
  'TRAPS', 'DUNGEONS', 'dungeonById', 'dungeonOpen', 'COURIER_INTRO', 'enemyLevel', 'RANKS', 'rankOf', 'weighted', 'Jobs', 'ECONOMY',
  'SAVE_VERSION', 'checksum', 'Save', 'FloorGen', 'hashStr',
  'RECRUIT', 'ORDERS', 'gridPath', 'Companion', 'LEGACY_JOBS', 'isLegacyJob', 'Quests',
];

const html = readFileSync(SRC, 'utf8');
const open = html.indexOf('<script>'), close = html.lastIndexOf('</script>');
if (open < 0 || close < open) throw new Error('No se encuentra el <script> del prototipo');
const script = html.slice(open + '<script>'.length, close);

const parts = CORE_RANGES.map(([a, b]) => {
  const i = script.indexOf(a), j = script.indexOf(b);
  if (i < 0 || j < 0 || j <= i) throw new Error(`Marcadores no encontrados o desordenados: «${a}» … «${b}»`);
  return script.slice(i, j);
});
const core = parts.join('\n');
const missing = EXPORTS.filter(n => !new RegExp(`(?:^|\\n)\\s*(?:const|let|var|class|function)\\s+${n}\\b`).test(core));
if (missing.length) throw new Error('El núcleo no declara: ' + missing.join(', '));

const srcHash = createHash('sha256').update(html).digest('hex').slice(0, 16);
const header = `// GENERADO por tools/split-prototype.mjs a partir de prototype/mystery-action.html (sha256 ${srcHash}).
// No lo edites a mano: cambia el prototipo y vuelve a ejecutar «npm run split».`;

const coreModule = `${header}
/* eslint-disable */
/**
 * Crea una instancia aislada de las reglas del juego (sin canvas, sin DOM, sin audio).
 * Cada sala del servidor puede tener la suya, así ningún estado de módulo se comparte.
 * \`host\` permite sustituir las piezas de presentación (por defecto no hacen nada).
 */
export function createEngineCore(host = {}) {
  const noop = () => undefined;
  const inert = () => new Proxy(function () {}, { get: (t, k) => k === Symbol.toPrimitive ? () => '' : inert(), apply: noop });
  const Sfx = host.Sfx || inert(), Light = host.Light || inert(), UI = host.UI || inert();
  const localStorage = host.localStorage;   // sin almacenamiento: Store usa memoria
${core}
  return { ${EXPORTS.join(', ')} };
}
export const SOURCE_HASH = '${srcHash}';
`;

// Cliente: el script completo como script clásico y el HTML que lo carga.
const gameJs = `${header}\n${script}`;
const netTags = `<script src="/game.js"></script>\n<script type="module" src="/src/main.js"></script>`;
// El artefacto es un fragmento (la plataforma añade doctype y charset al publicarlo); aquí se completa.
const page = html.slice(0, open) + netTags + html.slice(close + '</script>'.length);
const clientHtml = /^\s*<!doctype/i.test(page) ? page
  : '<!doctype html>\n<html lang="es">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">\n</head>\n<body>\n' + page + '\n</body>\n</html>\n';

const out = [
  [join(ROOT, 'shared', 'engine-core.generated.js'), coreModule],
  [join(ROOT, 'client', 'public', 'game.js'), gameJs],
  [join(ROOT, 'client', 'index.html'), clientHtml],
];

if (CHECK) {
  const stale = out.filter(([f, txt]) => !existsSync(f) || readFileSync(f, 'utf8') !== txt).map(([f]) => f.slice(ROOT.length + 1));
  if (stale.length) { console.error('Desactualizados (ejecuta npm run split):\n  ' + stale.join('\n  ')); process.exit(1); }
  console.log('Generados al día (' + srcHash + ')');
} else {
  for (const [f, txt] of out) { mkdirSync(dirname(f), { recursive: true }); writeFileSync(f, txt); }
  console.log(`Núcleo: ${core.split('\n').length} líneas, ${EXPORTS.length} exportaciones · cliente: game.js + index.html · fuente ${srcHash}`);
}
