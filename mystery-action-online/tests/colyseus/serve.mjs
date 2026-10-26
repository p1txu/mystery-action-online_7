// SOLO PRUEBAS: arranca el servidor real en otro proceso (para probar un reinicio de verdad).
import { createGameServer } from '../../server/src/app.js';
const app = await createGameServer({ port: +process.env.PORT, secret: process.env.AUTH_SECRET, store: process.env.PROFILE_STORE || 'sqlite', sqliteFile: process.env.SQLITE_FILE, databaseUrl: process.env.DATABASE_URL, tokenTtlHours: 1, allowProfileImport: false, clientOrigins: [] });
await app.listen();
console.log('ready');
process.on('SIGTERM', async () => { await app.close(); process.exit(0); });
