/**
 * Comprueba desde ESTE ordenador la conexión con un servidor de juego (local o desplegado).
 * Ejecútalo en cada ordenador que vaya a jugar (p. ej. uno en casa y otro con datos móviles).
 *
 *   node tools/check-server.mjs https://tu-servidor            → HTTPS, salud, base de datos, WebSocket y latencia
 *   node tools/check-server.mjs https://tu-servidor --join K7P2QZ [--name Pruebas]
 *        → además entra en esa sala privada como un jugador invitado de prueba (cuenta nueva con su
 *          propia criatura) mientras está en espera, marca «Estoy listo», espera a que el anfitrión
 *          inicie (--wait segundos, 120 por defecto) y comprueba que ve moverse a los demás. Sale solo.
 *   npm run check:server -- https://tu-servidor
 *
 * No necesita ni guarda contraseñas. Con --join crea una cuenta de invitado en ese servidor.
 */
const args = process.argv.slice(2);
const base = (args.find(a => /^https?:\/\//.test(a)) || 'http://localhost:2567').replace(/\/+$/, '');
const opt = k => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
const joinCode = (opt('--join') || '').toUpperCase(), name = opt('--name') || 'Prueba';
let failed = 0;
const ok = (m, extra = '') => console.log(`  ✔ ${m}${extra ? '  ' + extra : ''}`);
const bad = (m, hint = '') => { failed++; console.log(`  ✘ ${m}${hint ? '\n      → ' + hint : ''}`); };
const ms = t0 => `${Math.round(performance.now() - t0)} ms`;

async function get(path) {
  const t0 = performance.now(), r = await fetch(base + path, { signal: AbortSignal.timeout(15000) });
  return { status: r.status, body: await r.json().catch(() => null), time: ms(t0) };
}
function explain(e) {
  const c = (e && (e.cause && (e.cause.code || e.cause.message))) || (e && e.message) || String(e);
  if (/ENOTFOUND|EAI_AGAIN/.test(c)) return 'El nombre no resuelve: revisa el DNS (registro A) o la dirección.';
  if (/ECONNREFUSED/.test(c)) return 'Nadie escucha en esa dirección y puerto: ¿está el servidor en marcha? ¿cortafuegos?';
  if (/CERT|SSL|TLS|self.signed|UNABLE_TO_VERIFY/i.test(c)) return 'Certificado HTTPS no válido: espera a que Caddy/la plataforma lo obtenga o revisa el dominio.';
  if (/Timeout|aborted|ETIMEDOUT/i.test(c)) return 'Sin respuesta: el servidor puede estar despertando (Render gratis tarda ~1 min) o hay un cortafuegos.';
  return c;
}

console.log(`\nComprobando ${base} desde este ordenador…\n`);
const local = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(base), lan = /^http:\/\/(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(base);
if (base.startsWith('https://')) ok('Dirección segura (https:// → el juego usará wss://)');
else if (local || lan) ok('Dirección de desarrollo (http:// en ' + (local ? 'este equipo' : 'la red local') + ')');
else bad('La dirección usa http:// en Internet', 'Usa la dirección https:// del servidor desplegado: una página https no puede conectar con http.');

// 1) Salud y base de datos
try {
  const h = await get('/api/health');
  if (h.status === 200 && h.body && h.body.ok) ok('El servidor responde', `${h.time} · ${h.body.rooms} sala(s), ${h.body.players} jugador(es), en marcha desde hace ${h.body.uptime} s`);
  else bad(`/api/health respondió ${h.status}`, '¿Es la dirección del servidor de juego (no la del cliente)?');
  const r = await get('/api/ready');
  if (r.status === 200 && r.body && r.body.db === 'ok') ok('Base de datos conectada', r.time);
  else bad(`/api/ready respondió ${r.status}`, 'El servidor no llega a su base de datos: revisa DATABASE_URL o el volumen de datos y sus registros.');
} catch (e) { bad('No se puede contactar con el servidor', explain(e)); }

// 2) WebSocket (lo que usa la partida): debe abrirse a través de todos los proxies
await new Promise(done => {
  if (typeof WebSocket === 'undefined') { bad('Este Node no tiene WebSocket', 'Usa Node.js 22 o posterior.'); return done(); }
  const url = base.replace(/^http/, 'ws') + '/comprobacion/conexion?sessionId=prueba';
  const t0 = performance.now(); let opened = false;
  const ws = new WebSocket(url);
  const timer = setTimeout(() => { if (!opened) { bad('El WebSocket no se abre (15 s)', 'El proxy o la plataforma no deja pasar WebSocket: revisa la configuración (Upgrade/Connection).'); try { ws.close(); } catch { /* nada */ } done(); } }, 15000);
  ws.onopen = () => { opened = true; ok(base.startsWith('https') ? 'WebSocket seguro (wss://) abierto' : 'WebSocket abierto', ms(t0)); };
  ws.onclose = () => { clearTimeout(timer); if (!opened) bad('El WebSocket se cerró sin abrirse', 'Mira los registros del servidor (ws.origin_rejected) y la configuración del proxy.'); done(); };
  ws.onerror = () => {};
});

// 3) Latencia (5 peticiones)
try {
  const times = [];
  for (let i = 0; i < 5; i++) { const t0 = performance.now(); await fetch(base + '/api/health', { signal: AbortSignal.timeout(8000) }); times.push(performance.now() - t0); }
  times.sort((a, b) => a - b);
  const med = Math.round(times[2]);
  (med < 150 ? ok : med < 300 ? ok : bad)(`Latencia mediana ${med} ms`, med < 150 ? '(buena para jugar)' : med < 300 ? '(jugable)' : 'Alta: elige una región del servidor más cercana a los jugadores.');
} catch (e) { bad('No se pudo medir la latencia', explain(e)); }

// 4) Opcional: entrar en una sala real como jugador de prueba
if (joinCode && !failed) {
  try {
    const sdk = await import('@colyseus/sdk').catch(() => null);
    if (!sdk) throw new Error('Falta el paquete @colyseus/sdk: ejecuta npm install en la raíz del proyecto');
    const post = (p, body, token) => fetch(base + p, { method: 'POST', headers: Object.assign({ 'content-type': 'application/json' }, token ? { authorization: 'Bearer ' + token } : {}), body: JSON.stringify(body) }).then(async r => ({ status: r.status, body: await r.json().catch(() => ({})) }));
    const g = await post('/api/auth/guest', { name });
    if (g.status !== 201) throw new Error('No se pudo crear la cuenta de prueba: ' + (g.body.error || g.status));
    await post('/api/profile/new', { species: ['guerrero', 'arquero', 'mago', 'asesino'][Math.floor(Math.random() * 4)] }, g.body.token);
    const info = await fetch(base + '/api/rooms/' + joinCode).then(r => r.json());
    if (!info.roomId) throw new Error(info.error || 'Código no válido');
    const { PROTOCOL_VERSION, C, S } = await import('../shared/protocol.js');
    const client = new sdk.Client(base);
    const room = await client.joinById(info.roomId, { protocol: PROTOCOL_VERSION, token: g.body.token, code: joinCode });
    for (const t of Object.values(S)) room.onMessage(t, () => {});      // mensajes del juego: aquí no se dibujan
    const left = new Promise(r => room.onLeave(r));
    ok(`Has entrado en la sala ${joinCode} como «${name}»`);
    await new Promise(r => setTimeout(r, 800));
    const st = room.state.toJSON(), others = Object.entries(st.players).filter(([id]) => id !== room.sessionId);
    ok(`En la sala: ${Object.values(st.players).map(p => `${p.name} (${p.species}${p.host ? ', anfitrión' : ''})`).join(', ')}`);
    // Como un jugador más: «Estoy listo» y a esperar a que el anfitrión inicie la expedición
    room.send(C.READY, { ready: true });
    const waitS = +(opt('--wait') || 120);
    console.log(`    Marcado «Estoy listo». Esperando a que el anfitrión pulse «Iniciar expedición» (hasta ${waitS} s)…`);
    for (let i = 0; i < waitS * 10 && room.state.phase !== 'playing'; i++) await new Promise(r => setTimeout(r, 100));
    if (room.state.phase === 'playing') {
      await new Promise(r => setTimeout(r, 1000));
      const snap = () => Object.fromEntries(Object.entries(room.state.toJSON().players).filter(([id]) => id !== room.sessionId).map(([id, p]) => [id, p]));
      const before = snap(), me0 = room.state.toJSON().players[room.sessionId];
      console.log('    Expedición iniciada. Moveos con vuestras criaturas durante 6 s…');
      let q = 0; const t = setInterval(() => { room.send(C.INPUT, { s: q, m: Array(6).fill([Math.cos(q / 90), Math.sin(q / 90)]) }); q += 6; }, 50);
      await new Promise(r => setTimeout(r, 6000)); clearInterval(t);
      const now = snap(), me1 = room.state.toJSON().players[room.sessionId];
      const moved = Object.keys(before).filter(id => now[id] && Math.hypot(now[id].x - before[id].x, now[id].y - before[id].y) > 5).map(id => now[id].name);
      if (Math.hypot(me1.x - me0.x, me1.y - me0.y) > 5) ok('El servidor mueve a tu criatura de prueba (los demás la ven en su pantalla)');
      else bad('Tu criatura de prueba no se movió', 'Las entradas no llegan al servidor.');
      if (moved.length) ok(`Ves moverse en tiempo real a: ${moved.join(', ')}`); else bad('No has visto moverse a nadie', 'Pide a los demás que se muevan mientras dura la prueba.');
      room.send(C.LEAVE, {});                                          // retirada: el servidor cierra la conexión
      await Promise.race([left, new Promise(r => setTimeout(r, 3000))]);
    } else bad('El anfitrión no inició la expedición a tiempo', 'Vuelve a ejecutar la prueba y pulsa «Iniciar expedición» en el otro ordenador.');
    if (room.connection.isOpen) await Promise.race([room.leave(true), new Promise(r => setTimeout(r, 3000))]);
    ok('Has salido de la sala (la cuenta de prueba no tiene progreso)');
  } catch (e) { bad('No se pudo entrar en la sala', explain(e)); }
}

console.log(failed ? `\n✘ ${failed} comprobación(es) fallida(s).\n` : '\n✔ Todo correcto desde este ordenador.\n');
process.exit(failed ? 1 : 0);
