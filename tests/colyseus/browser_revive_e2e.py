"""Caer y reanimar en cooperativo con dos navegadores contra el servidor real (Colyseus):
 - Beto cae por un golpe enemigo: su partida NO se cierra (sigue en la mazmorra, conectado, sin pantalla
   de derrota ni de resultado), ve el aviso y puede pulsar teclas sin errores; Ana ve que ha caído.
 - Sigue caído varios segundos sin que nada se cierre.
 - Ana se queda a su lado 2,5 s: el servidor lo reanima, Beto vuelve a moverse y a atacar.
 - Solo si caen los dos acaba la expedición, y entonces los dos ven el resultado.
El escenario se prepara con las rutas /__test/ del servidor de pruebas (serve-for-browser.mjs)."""
import asyncio, json, os, sys
from playwright.async_api import async_playwright
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from browser_common import Stack, watch_errors
R = []
def check(n, ok, info=''):
    R.append(bool(ok)); print(('PASS ' if ok else 'FAIL ') + n, json.dumps(info, ensure_ascii=False)[:420] if info != '' else '', flush=True)
VIEW = """(() => { const G = MysteryAction, n = G.net; return { state: G.state, screen: UI.current, active: !!(n && n.active), alive: !!(G.player && G.player.alive),
  floor: G.floorRT ? G.floorRT.label : null, result: !document.getElementById('result').hidden, defeat: !document.getElementById('defeat').hidden,
  remotes: n ? [...n.remotes.values()].map(r => ({ name: r.nameTag, alive: r.alive, revive: r.netRevive })) : [] }; })()"""

async def main():
    shots = os.environ.get('SHOT_DIR', '.')
    st = Stack(2890, 2891, reconnect=60)
    try:
        async with async_playwright() as pw:
            b = await pw.chromium.launch(); errs = {}
            async def open_player(name, species):
                ctx = await b.new_context(viewport={'width': 1100, 'height': 720}); pg = await ctx.new_page(); watch_errors(pg, errs, name)
                await pg.goto(st.url); await pg.wait_for_timeout(300)
                await pg.evaluate("n => MysteryLobby.devGuest(n)", name)
                await pg.wait_for_selector(f'.on-fresh[data-sp="{species}"]', timeout=8000); await pg.click(f'.on-fresh[data-sp="{species}"]')
                await pg.wait_for_selector('#on-profile-card', timeout=5000); return pg
            A, B = await asyncio.gather(open_player('Ana', 'guerrero'), open_player('Beto', 'arquero'))
            pages = [A, B]
            await A.click('#on-create'); await A.wait_for_function("/^[A-Z2-9]{6}$/.test((document.querySelector('#on-code-val')||{}).textContent||'')", timeout=8000)
            code = await A.inner_text('#on-code-val')
            await B.fill('#on-code', code); await B.click('#on-join'); await B.wait_for_selector('#on-ready', timeout=8000); await B.click('#on-ready')
            await A.wait_for_function("!document.querySelector('#on-start').disabled", timeout=6000); await A.click('#on-start')
            await asyncio.gather(*[p.wait_for_function("MysteryAction.net && MysteryAction.net.active && MysteryAction.net.remotes.size === 1", timeout=10000) for p in pages])
            for p in pages: await p.evaluate("UI.hideBoons()")
            st.ctl('calm')
            a = st.ctl('member', name='Ana'); st.ctl('place', name='Beto', x=a['x'], y=a['y'])
            # Beto, lejos de Ana (si no, ella lo reanimaría enseguida): buscamos un sitio libre en el servidor
            far = await B.evaluate("""(() => { const W = MysteryAction.world, p = MysteryAction.player; let best = null;
              for (let ty = 1; ty < W.h - 1; ty++) for (let tx = 1; tx < W.w - 1; tx++) { const x = (tx + .5) * 32, y = (ty + .5) * 32, d = Math.hypot(x - p.x, y - p.y);
                if (d > 220 && d < 420 && !W.isSolid(tx, ty) && !W.isSolid(tx + 1, ty) && !W.isSolid(tx - 1, ty) && !W.isSolid(tx, ty + 1) && !W.isSolid(tx, ty - 1)) { best = { x, y }; break; } if (best) break; } return best; })()""")
            st.ctl('place', name='Beto', x=far['x'], y=far['y']); await B.wait_for_timeout(600)

            # --- Beto cae
            r = st.ctl('down', name='Beto')
            check('el servidor derriba a Beto con un golpe enemigo', not r['alive'], r)
            await B.wait_for_function("MysteryAction.player && !MysteryAction.player.alive", timeout=5000)
            await B.wait_for_timeout(1500)
            vb, va = await asyncio.gather(B.evaluate(VIEW), A.evaluate(VIEW))
            await B.screenshot(path=os.path.join(shots, 'revive_caido.png'))
            check('la partida de Beto NO se cierra: sigue en la mazmorra, conectado, sin pantalla de derrota ni resultado',
                  vb['state'] == 'play' and vb['active'] and vb['floor'] and not vb['result'] and not vb['defeat'] and not vb['alive'], vb)
            check('Ana ve a Beto caído y su partida sigue igual', va['state'] == 'play' and va['active'] and va['alive'] and any(x['name'] == 'Beto' and not x['alive'] for x in va['remotes']), va)
            # Beto pulsa teclas y hace clic estando caído (antes podía romper algo)
            await B.click('#view')
            for k in ['ArrowRight', 'KeyQ', 'Space', 'KeyE']:
                await B.keyboard.down(k); await B.wait_for_timeout(150); await B.keyboard.up(k)
            await B.mouse.click(600, 360); await B.wait_for_timeout(300)
            m0 = st.ctl('member', name='Beto')
            await B.keyboard.down('ArrowLeft'); await B.wait_for_timeout(600); await B.keyboard.up('ArrowLeft')
            m1 = st.ctl('member', name='Beto')
            check('caído no se mueve en el servidor aunque pulse teclas', m1['downed'] and abs(m1['x'] - m0['x']) < 1 and abs(m1['y'] - m0['y']) < 1, [m0, m1])
            await B.wait_for_timeout(6000)
            vb = await B.evaluate(VIEW); srv = st.ctl('state')
            beto = next(p for p in srv['players'] if p['name'] == 'Beto')
            check('8 s después sigue en la partida (conectado en el servidor y en el navegador)', vb['state'] == 'play' and vb['active'] and not vb['result'] and beto.get('connected', True) and srv['clients'] == 2, {'view': vb, 'clients': srv['clients']})

            # --- Ana lo reanima
            bt = st.ctl('member', name='Beto'); st.ctl('place', name='Ana', x=bt['x'] + 20, y=bt['y'])
            await A.wait_for_timeout(1200)
            mid = await A.evaluate(VIEW)
            check('Ana ve la barra de reanimación de Beto llenándose', any(x['name'] == 'Beto' and (x['revive'] or 0) > 0 for x in mid['remotes']), mid['remotes'])
            await A.wait_for_timeout(2200)
            m2 = st.ctl('member', name='Beto')
            check('tras 2,5 s a su lado el servidor reanima a Beto (35 % de PS)', not m2['downed'] and m2['hp'] > 0, m2)
            await B.wait_for_function("MysteryAction.player && MysteryAction.player.alive", timeout=4000)
            await B.screenshot(path=os.path.join(shots, 'revive_reanimado.png'))
            p0 = st.ctl('member', name='Beto')
            await B.click('#view'); await B.keyboard.down('ArrowDown'); await B.wait_for_timeout(700); await B.keyboard.up('ArrowDown'); await B.wait_for_timeout(300)
            p1 = st.ctl('member', name='Beto')
            check('Beto vuelve a moverse', abs(p1['x'] - p0['x']) + abs(p1['y'] - p0['y']) > 8, [p0, p1])
            casts0 = next(p for p in st.ctl('state')['players'] if p['name'] == 'Beto')['casts']
            await B.mouse.click(700, 300); await B.wait_for_timeout(500)
            casts1 = next(p for p in st.ctl('state')['players'] if p['name'] == 'Beto')['casts']
            check('…y a atacar (el servidor acepta su ataque)', casts1 > casts0, [casts0, casts1])

            # --- Caen los dos: ahora sí acaba
            st.ctl('down', name='Ana'); st.ctl('down', name='Beto')
            await asyncio.gather(*[p.wait_for_function("!document.getElementById('result').hidden", timeout=10000) for p in pages])
            titles = await asyncio.gather(*[p.evaluate("document.getElementById('result-h').textContent") for p in pages])
            check('si caen todos, la expedición termina y los dos ven el resultado', all(t for t in titles), titles)
            for n, e in errs.items(): check(f'sin errores de JavaScript ({n})', not e, e[:5])
            await b.close()
    finally:
        st.close()
    print(f'{sum(R)}/{len(R)} correctas', flush=True)
    sys.exit(0 if all(R) else 1)

asyncio.run(main())
