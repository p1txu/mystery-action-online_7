// SOLO PRUEBAS: lee o siembra perfiles directamente en la base de datos SQLite (como haría un administrador).
//   node db-tool.mjs <db> get <accountId>          → JSON del perfil
//   node db-tool.mjs <db> patch <accountId> <json> → mezcla campos en la partida guardada
import { SqliteProfileStore } from '../../server/src/persistence/SqliteProfileStore.js';
import { createEngineCore } from '../../shared/engine-core.generated.js';
const [db, cmd, id, json] = process.argv.slice(2), s = new SqliteProfileStore(db), E = createEngineCore();
if (cmd === 'get') console.log(JSON.stringify(await s.getProfile(id)));
if (cmd === 'patch') { const r = await s.mutateProfile(id, save => { const p = JSON.parse(json); if (p.level) { save.prog = E.Progress.fresh(save.species, p.level); delete p.level; } Object.assign(save, p); return { save: E.Save.sanitize(save).data }; }, { origin: 'seed' }); console.log(JSON.stringify({ version: r.version })); }
if (cmd === 'rewards') console.log(JSON.stringify(await s.listRewards(id)));
await s.close();
