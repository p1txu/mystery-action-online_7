"""Prueba de extremo a extremo de la capa de red del cliente (sección 26) contra la simulación
autoritativa real, con WebSockets reales. El papel de Colyseus lo hace relay-harness.mjs
(solo pruebas). Uso: python3 tests/e2e/netplay_e2e.py <ruta a test.html del prototipo>"""
import asyncio, json, os, subprocess, sys, time
from playwright.async_api import async_playwright
HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.dirname(os.path.dirname(HERE))
R = []
def check(n, ok, info=''):
    R.append((n, bool(ok))); print(('PASS ' if ok else 'FAIL ') + n, json.dumps(info, ensure_ascii=False)[:400] if info != '' else '')

GLUE = '''(() => { const G = MysteryAction; let net = null, ws = null;
  const tx = { send: (t, m) => { if (ws && ws.readyState === 1) ws.send(JSON.stringify([t, m])); }, leave() { ws && ws.close(); } };
  function connect() { ws = new WebSocket('ws://127.0.0.1:PORT');
    ws.onmessage = e => { const [type, msg] = JSON.parse(e.data);
      if (type === 'welcome') { if (!net) net = new MysteryNet.NetPlay(G, tx, msg.sessionId, msg.save); else net.setConnection(true); }
      else if (type === 'floor') { G.net = net; net.loadFloor(msg); }
      else if (type === 'state') net && net.applyState(msg);
      else if (type === 'ev') { net && net.onEvent(msg); (window.__evs = window.__evs || []).push(msg.type); }
      else if (type === 'stats') window.__stats = msg;
      else if (type === 'result') net && net.finish(msg); };
    ws.onclose = () => { net && net.setConnection(false); }; }
  connect();
  window.__e2e = { connect, close: () => ws.close(), ask: () => { window.__stats = null; tx.send('stats', {}); }, cheat: k => tx.send('cheat', { k }), get net() { return net; } };
})()'''

async def main(html):
    port = 2611
    env = dict(os.environ); env.setdefault('WS_MODULE', 'ws')
    srv = subprocess.Popen(['node', os.path.join(HERE, 'relay-harness.mjs'), str(port)], env=env, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
    srv.stdout.readline()
    try:
        async with async_playwright() as p:
            b = await p.chromium.launch(); pg = await (await b.new_context(viewport={'width': 1280, 'height': 760})).new_page()
            errs = []; pg.on('pageerror', lambda e: errs.append(str(e))); pg.on('console', lambda m: m.type == 'error' and 'net::' not in m.text and errs.append(m.text))
            await pg.goto('file://' + os.path.abspath(html)); await pg.wait_for_timeout(400)
            ev = pg.evaluate
            check('sin servidor el juego no tiene red: Game.net es null y la sección de red está cargada', await ev('MysteryAction.net === null && !!window.MysteryNet'))
            await ev(GLUE.replace('PORT', str(port)))
            await pg.wait_for_function('MysteryAction.net && MysteryAction.net.active && MysteryAction.net.lastState', timeout=15000)
            await pg.wait_for_timeout(400)
            async def stats():
                await ev('__e2e.ask()'); await pg.wait_for_function('window.__stats', timeout=3000); return await ev('window.__stats')
            r = await ev('''(()=>{ const G=MysteryAction, f=G.floorRT; return { mode:G.mode, state:G.state, w:G.world.w, h:G.world.h, enemies:[...G.net.enemies.values()].length, remotes:[...G.net.remotes.keys()], items:f.items.length, kind:f.kind } })()''')
            s = await stats()
            check('el cliente genera el mismo piso que el servidor y ve sus enemigos', r['mode'] == 'dungeon' and r['state'] == 'play' and r['enemies'] == s['enemies'] and r['enemies'] > 0, {'cliente': r, 'servidor_enemigos': s['enemies']})
            check('el otro jugador aparece como RemotePlayer', r['remotes'] == ['bot'], r)
            # Movimiento: predicción local + corrección del servidor
            await ev('MysteryAction.actors = MysteryAction.actors; MysteryAction.player.iframes = 9')
            await pg.click('#view'); p0 = await ev('({x:MysteryAction.player.x,y:MysteryAction.player.y})')
            for key in ['ArrowRight', 'ArrowDown', 'ArrowLeft']:
                await pg.keyboard.down(key); await pg.wait_for_timeout(700); await pg.keyboard.up(key)
            await pg.wait_for_timeout(500)
            loc = await ev('({x:MysteryAction.player.x,y:MysteryAction.player.y})'); s = await stats(); srvp = s['server']
            d = ((loc['x'] - srvp['x']) ** 2 + (loc['y'] - srvp['y']) ** 2) ** .5
            moved = ((loc['x'] - p0['x']) ** 2 + (loc['y'] - p0['y']) ** 2) ** .5
            check('al moverse, la posición local y la del servidor coinciden (< 12 px) tras parar', d < 12 and (moved > 20 or s['samples'] > 100), {'local': loc, 'servidor': [srvp['x'], srvp['y']], 'dist': round(d, 2), 'movido': round(moved, 1), 'muestras': s['samples'], 'mensajes': s['inputs']})
            net = await ev('MysteryAction.net.stats')
            check('las entradas se envían en lotes (~20 mensajes por segundo, no uno por paso)', s['inputs'] > 5 and s['samples'] / max(1, s['inputs']) >= 4, {'mensajes': s['inputs'], 'muestras': s['samples'], 'cliente': net})
            # Combate: el daño lo pone el servidor
            await ev('__e2e.cheat("enemyNear")'); await pg.wait_for_timeout(300)
            e0 = await ev('(()=>{ const e=[...MysteryAction.net.enemies.values()].sort((a,b)=>Math.hypot(a.x-MysteryAction.player.x,a.y-MysteryAction.player.y)-Math.hypot(b.x-MysteryAction.player.x,b.y-MysteryAction.player.y))[0]; window.__tgt=e.netId; return {id:e.netId, hp:e.hp, d:Math.hypot(e.x-MysteryAction.player.x,e.y-MysteryAction.player.y)} })()')
            for i in range(6):
                await ev('(()=>{ const G=MysteryAction,p=G.player,e=G.net.enemies.get(window.__tgt); if(!e) return; p.facing={x:Math.sign(e.x-p.x)||1,y:0}; p.basicCd=0; })()')
                await pg.keyboard.press('Space'); await pg.wait_for_timeout(260)
            await pg.wait_for_timeout(500)
            e1 = await ev('(()=>{ const e=MysteryAction.net.enemies.get(window.__tgt); return e?{hp:e.hp}:{gone:true} })()')
            s = await stats()
            check('los ataques locales se envían y el servidor aplica el daño (el cliente solo lo muestra)', s['actions'] >= 1 and (e1.get('gone') or e1['hp'] < e0['hp']), {'antes': e0, 'después': e1, 'acciones': s['actions']})
            # Un golpe local no puede bajar PS por su cuenta
            r = await ev('''(()=>{ const G=MysteryAction, e=[...G.net.enemies.values()][0]; if(!e) return null; const hp=e.hp; Combat.hit(G,e,{team:'player',dmg:9999,src:G.player}); return {antes:hp, despues:e.hp, vivo:e.alive} })()''')
            check('en línea Combat.hit local no quita PS (solo efectos)', r is None or (r['antes'] == r['despues'] and r['vivo']), r)
            # Interpolación del otro jugador
            r = await ev('''(()=>{ const b=MysteryAction.net.remotes.get('bot'); return {x:b.x,y:b.y,buf:b.buf.length} })()''')
            check('el otro jugador se interpola a partir de las instantáneas', r['buf'] >= 5, r)
            # Desconexión y reconexión
            await ev('__e2e.close()'); await pg.wait_for_timeout(600)
            off = await ev('MysteryAction.net.connected')
            await ev('__e2e.connect()'); await pg.wait_for_timeout(900)
            r = await ev('({c:MysteryAction.net.connected, a:MysteryAction.net.active, n:MysteryAction.net.floorN})'); s = await stats()
            check('al perder la conexión se detecta y al reconectar se recupera el piso', off is False and r['c'] and r['a'] and s['connects'] == 2, {'durante': off, 'después': r})
            # Cambio de piso decidido por el servidor
            await ev('__e2e.cheat("stairs")'); await pg.wait_for_function('MysteryAction.net.floorN === 2', timeout=4000)
            r = await ev('({n:MysteryAction.net.floorN, label:MysteryAction.floorRT.label, w:MysteryAction.world.w, info:MysteryAction.net.floorInfo})')
            check('la escalera la resuelve el servidor y el cliente carga el mismo piso nuevo', r['n'] == 2 and r['w'] == r['info']['w'] and 'P2' in r['label'], r)
            await pg.wait_for_timeout(1500)
            await pg.screenshot(path=os.path.join(os.environ.get('SHOT_DIR', '.'), 'e2e_online.png'))
            fps = await ev('(()=>{ const R=MysteryAction.renderer,G=MysteryAction; let t=0; for(let i=0;i<30;i++){ const a=performance.now(); R.draw(G,1); t+=performance.now()-a; } return t/30 })()')
            check('dibujar el piso online con otro jugador cuesta lo mismo que el modo local (< 16 ms)', fps < 16, round(fps, 2))
            # Fin de la expedición: el resultado del servidor pasa a ser la partida local
            await ev('__e2e.cheat("wipe")'); await pg.wait_for_function('!document.getElementById("result").hidden', timeout=5000)
            r = await ev('''(()=>{ const s=Save.load(); return { net: MysteryAction.net, title: document.getElementById('result-h').textContent, species: s && s.species, runs: s && s.runs, lvl: s && s.prog.level } })()''')
            check('derrota del grupo: pantalla de resultado y la partida local se actualiza con la del servidor', r['net'] is None and r['species'] == 'guerrero' and r['runs'] == 1 and r['lvl'] >= 8 and 'caído' in r['title'], r)
            await pg.click('#btn-result'); await pg.wait_for_timeout(500)
            r = await ev('({mode:MysteryAction.mode, state:MysteryAction.state, net:MysteryAction.net, run:MysteryAction.run})')
            check('después se vuelve a la aldea en modo local, sin restos de la red', r['mode'] == 'village' and r['state'] == 'play' and r['net'] is None and r['run'] is None, r)
            check('sin errores de JavaScript en el navegador', not errs, errs[:5])
            await b.close()
    finally:
        srv.terminate()
    print(f"{sum(ok for _, ok in R)}/{len(R)} correctas")
    return all(ok for _, ok in R)

if __name__ == '__main__':
    sys.exit(0 if asyncio.run(main(sys.argv[1])) else 1)
