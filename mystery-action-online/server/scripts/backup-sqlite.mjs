/**
 * Copia de seguridad en caliente de la base de datos SQLite (sin parar el servidor).
 * Usa «VACUUM INTO», que produce una copia coherente aunque haya escrituras (modo WAL).
 *   node server/scripts/backup-sqlite.mjs [origen.db] [destino.db]
 * Por defecto: $SQLITE_FILE o $DATA_DIR/mystery-action.db → $DATA_DIR/backups/perfiles-<fecha>.db
 * Conserva las 14 copias más recientes de esa carpeta.
 */
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, readdirSync, rmSync, statSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';

const dataDir = resolve(process.env.DATA_DIR || './data');
const src = resolve(process.argv[2] || process.env.SQLITE_FILE || join(dataDir, 'mystery-action.db'));
if (!existsSync(src)) { console.error('No existe la base de datos: ' + src); process.exit(1); }
const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const dst = resolve(process.argv[3] || join(dataDir, 'backups', `perfiles-${stamp}.db`));
mkdirSync(dirname(dst), { recursive: true });
const db = new DatabaseSync(src, { readOnly: true });
db.exec(`VACUUM INTO '${dst.replace(/'/g, "''")}'`);
db.close();
const check = new DatabaseSync(dst, { readOnly: true });
const n = check.prepare('select count(*) as n from accounts').get().n, ok = check.prepare('pragma integrity_check').get();
check.close();
console.log(JSON.stringify({ msg: 'backup.ok', file: dst, bytes: statSync(dst).size, accounts: n, integrity: Object.values(ok)[0] }));
if (!process.argv[3]) {   // rotación: se quedan las 14 últimas
  const dir = dirname(dst), old = readdirSync(dir).filter(f => /^perfiles-.*\.db$/.test(f)).sort().slice(0, -14);
  for (const f of old) rmSync(join(dir, f));
}
