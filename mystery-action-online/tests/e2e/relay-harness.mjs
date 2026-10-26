/**
 * SOLO PARA PRUEBAS. Sustituye a la sala de Colyseus en la prueba de extremo a extremo porque
 * en el entorno de desarrollo no se pudo instalar Colyseus (npm bloqueado). Usa WebSockets
 * reales (paquete `ws`) y la simulación autoritativa real (Expedition), con el mismo flujo de
 * mensajes que ExpeditionRoom: welcome → floor → estado cada 50 ms + eventos.
 * Además del navegador hay un segundo jugador de prueba («bot») con entradas guionizadas.
 * No forma parte del producto ni se despliega.
 */
import { createRequire } from 'node:module';
import { Expedition } from '../../server/src/sim/Expedition.js';
import { viewToState } from '../../server/src/rooms/plainState.js';
import { parseInput, SIM_STEP } from '../../shared/protocol.js';
import { createEngineCore } from '../../shared/engine-core.generated.js';

const require = createRequire(import.meta.url);
const { WebSocketServer } = require(process.env.WS_MODULE || 'ws');
const E = createEngineCore();
const port = +process.argv[2] || 2600;
const save = id => { const s = E.Save.sanitize(E.Save.fresh(id)).data; s.prog.level = 8; return E.Save.sanitize(s).data; };
const saves = { me: save('voltrino'), bot: save('magmolo') };
const exp = new Expedition({ dungeonId: 'bosque', seed: 4242, members: [{ id: 'me', name: 'Navegador', profile: saves.me }, { id: 'bot', name: 'Bot de prueba', profile: saves.bot }] });
// El bot se queda junto a la entrada y ataca de vez en cuando
let botSeq = 0, t = 0, sock = null;
const stats = { inputs: 0, samples: 0, actions: 0, connects: 0 };
const send = (type, msg) => { if (sock && sock.readyState === 1) sock.send(JSON.stringify([type, msg])); };

const wss = new WebSocketServer({ port });
wss.on('connection', ws => {
  sock = ws; stats.connects++;
  exp.setConnected('me', true);
  send('welcome', { sessionId: 'me', code: 'TEST42', host: true, save: saves.me });
  send('floor', exp.floorInfo);
  ws.on('message', raw => {
    let m; try { m = JSON.parse(raw); } catch { return; }
    const [type, msg] = m;
    if (type === 'in') { const p = parseInput(msg); if (p) { stats.inputs++; stats.samples += p.samples.length; stats.actions += p.actions.length; exp.applyInput('me', p); } }
    else if (type === 'use') exp.use('me', msg.id);
    else if (type === 'stats') send('stats', Object.assign({ server: exp.view().players.find(p => p.id === 'me'), enemies: exp.view().enemies.length, floor: exp.floorInfo.n }, stats));
    else if (type === 'cheat') { if (msg.k === 'stairs') { const s = exp.L.stairs; for (const id of ['me', 'bot']) exp.members.get(id).player.placeAt((s.tx + .5) * 32, (s.ty + .5) * 32); } if (msg.k === 'wipe') { for (const id of ['me', 'bot']) { const pl = exp.members.get(id).player; exp.E.Combat.hit(exp.g, pl, { team: 'enemy', dmg: 1, pct: 5, dot: true }); } } if (msg.k === 'enemyNear') { const p = exp.members.get('me').player; const e = exp.addEnemy(new exp.E.Enemy(exp.E.makeKind('mordisquin'), p.x + 90, p.y, { level: 3 }), 'v:mordisquin'); e.aggro = true; } }
  });
  ws.on('close', () => { if (sock === ws) sock = null; exp.setConnected('me', false); });
});

let acc = 0, last = performance.now(), syncT = 0;
setInterval(() => {
  const now = performance.now(); acc = Math.min(acc + (now - last) / 1000, .25); last = now;
  while (acc >= SIM_STEP) {
    if (t++ % 6 === 0) { const a = t % 240 < 6 ? [{ at: botSeq, k: 'b', dx: 1, dy: 0 }] : []; exp.applyInput('bot', parseInput({ s: botSeq, m: Array(6).fill([Math.sin(t / 200) * .4, 0]), a })); botSeq += 6; }
    exp.step(SIM_STEP); acc -= SIM_STEP;
  }
  if (exp.ended && !exp.sentResult) {   // como ExpeditionRoom.commit: resultado + partida actualizada
    exp.sentResult = true; const r = exp.ended.results.get('me');
    if (r) send('result', { result: r.result, success: r.success, lines: r.lines, summary: r.summary, envelope: r.profile ? E.Save.envelope(r.profile) : null, version: 2 });
  }
  for (const ev of exp.drainEvents()) { if (ev.type === 'floor') send('floor', ev.info); else if (!ev.to || ev.to === 'me') send('ev', ev); }
  syncT += 1000 / 60; if (syncT >= 50) { syncT = 0; send('state', viewToState(exp.view())); }
}, 1000 / 60);
console.log('harness listening ' + port);
