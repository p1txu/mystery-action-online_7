import { join } from 'node:path';
import { SqliteProfileStore } from './SqliteProfileStore.js';
import { PostgresProfileStore } from './PostgresProfileStore.js';
import { MemoryProfileStore } from './ProfileStore.js';

/** sqlite (por defecto, archivo en DATA_DIR) · postgres (DATABASE_URL) · memory (solo pruebas). */
export async function createProfileStore(config) {
  if (config.store === 'memory') { if (config.production) throw new Error('PROFILE_STORE=memory no guarda nada: no se permite en producción'); return new MemoryProfileStore(); }
  if (config.store === 'postgres') return PostgresProfileStore.connect(config.databaseUrl);
  return new SqliteProfileStore(config.sqliteFile || join(config.dataDir, 'mystery-action.db'));
}
export { VersionConflict, DuplicateUsername, MemoryProfileStore } from './ProfileStore.js';
