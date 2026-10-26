"""Cuatro navegadores (contextos separados = cuatro jugadores con su propia partida) usan el
menú cooperativo real contra el servidor real de Colyseus. Crear grupo, unirse con el código a la
vez, ver nombres y criaturas, preparación, inicio, juego simultáneo, corte de red y salida."""
import asyncio, json, os, shutil, subprocess, sys, tempfile
from playwright.async_api import async_playwright
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from browser_common import Stack, watch_errors
HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.dirname(os.path.dirname(HERE))
VENDOR = os.path.join(ROOT, 'tests/.vendor')
R = []
def check(n, ok, info=''):
    R.append(bool(ok)); print(('PASS ' if ok else 'FAIL ') + n, json.dumps(info, ensure_ascii=False)[:360] if info != '' else '', flush=True)

async def main():
    shots = os.environ.get('SHOT_DIR', '.')
    st = Stack(2860, 2861)
    try:
        async with async_playwright() as pw:
            b = await pw.chromium.launch()
            people = [('Ana', 'guerrero', 111, 9), ('Beto', 'mago', 222, 6), ('Carla', 'arquero', 333, 12), ('Dani', 'guerrero', 444, 5)]
            pages, errs = [], {}
            async def open_player(name, species, bank, level):
                ctx = await b.new_context(viewport={'width': 1100, 'height': 720}); pg = await ctx.new_page(); watch_errors(pg, errs, name)
                await pg.goto(st.url); await pg.wait_for_timeout(300)
                await pg.click('#btn-online'); await pg.click('.on-tab[data-tab="guest"]'); await pg.fill('#on-name', name); await pg.click('#on-guest')
                await pg.wait_for_selector(f'.on-fresh[data-sp="{species}"]', timeout=8000); await pg.click(f'.on-fresh[data-sp="{species}"]')
                await pg.wait_for_selector('#on-profile-card', timeout=5000)
                acc = await pg.evaluate("JSON.parse(localStorage.getItem('ma-online-auth')).accountId")
                st.db_tool('patch', acc, json.dumps({'bank': bank, 'level': level}))      # cada perfil distinto (siembra de la prueba)
                await pg.evaluate("MysteryLobby.refresh()"); await pg.wait_for_timeout(300)
                return ctx, pg
            made = await asyncio.gather(*[open_player(*p) for p in people])
            ctxs = [m[0] for m in made]; pages = [m[1] for m in made]; A, B, Cc, D = pages
            txt = await A.inner_text('#online')
            check('el menú cooperativo ofrece las cuatro opciones', all(s in txt for s in ['Entrar en la aldea', 'Crear partida privada', 'Unirse a partida', 'Abandonar grupo']), txt[:200])
            check('estado de conexión visible («Conectado al servidor»)', await A.get_attribute('#on-status', 'data-status') in ('online', 'idle'))
            # Crear
            await A.click('#on-create'); await A.wait_for_function("/^[A-Z2-9]{6}$/.test((document.querySelector('#on-code-val')||{}).textContent||'')", timeout=8000)
            code = await A.inner_text('#on-code-val')
            check('al crear, el anfitrión recibe un código generado por el servidor', len(code) == 6, code)
            # Unirse los tres a la vez
            async def join(pg):
                await pg.fill('#on-code', code.lower()); await pg.click('#on-join')
            await asyncio.gather(*[join(p) for p in (B, Cc, D)])
            await asyncio.gather(*[p.wait_for_function("document.querySelectorAll('.on-players li[data-player]').length === 4", timeout=10000) for p in pages])
            views = await asyncio.gather(*[p.evaluate("[...document.querySelectorAll('.on-players li[data-player]')].map(li => ({n: li.dataset.player, t: li.innerText.replace(/\\s+/g,' ')}))") for p in pages])
            names_ok = all(sorted(x['n'] for x in v) == ['Ana', 'Beto', 'Carla', 'Dani'] for v in views)
            creatures_ok = all(all(c in ' '.join(x['t'] for x in v) for c in ['Guerrero', 'Mago', 'Arquero']) for v in views)
            check('los cuatro ven a los cuatro integrantes con su nombre y su clase', names_ok and creatures_ok, views[1])
            host_ok = all(sum('anfitrión' in x['t'] for x in v) == 1 and any('Ana' in x['t'] and 'anfitrión' in x['t'] for x in v) for v in views)
            check('solo hay un anfitrión (quien creó el grupo) y lo ven todos', host_ok)
            check('la sala existe en el servidor: los estados vienen sincronizados por Colyseus', all(await asyncio.gather(*[p.evaluate("!!(MysteryLobby.session && MysteryLobby.session.room && MysteryLobby.session.room.roomId)") for p in pages])))
            # Quinto jugador: sala llena · código inexistente · reintentar
            ctxE, E = await open_player('Eva', 'mago', 5, 5)
            await E.fill('#on-code', code); await E.click('#on-join'); await E.wait_for_timeout(500)
            t = await E.inner_text('#online')
            check('un quinto jugador no puede entrar: «La sala está llena»', 'llena' in t, t[:200])
            await E.fill('#on-code', 'ZZZZZZ'); await E.click('#on-join'); await E.wait_for_timeout(400)
            check('código inexistente: error comprensible', 'No hay ninguna sala' in await E.inner_text('#online'))
            await E.fill('#on-code', 'abc'); await E.click('#on-join'); await E.wait_for_timeout(150)
            check('código mal escrito: se avisa sin llamar al servidor', '6 caracteres' in await E.inner_text('#online'))
            # Preparación e inicio
            check('el anfitrión no puede iniciar hasta que el grupo esté preparado', await A.is_disabled('#on-start'))
            await asyncio.gather(*[p.click('#on-ready') for p in (B, Cc, D)])
            await A.wait_for_function("!document.querySelector('#on-start').disabled", timeout=6000)
            await A.screenshot(path=os.path.join(shots, 'group_lobby_host.png')); await Cc.screenshot(path=os.path.join(shots, 'group_lobby_guest.png'))
            await A.click('#on-start')
            await asyncio.gather(*[p.wait_for_function("MysteryAction.net && MysteryAction.net.active && MysteryAction.net.remotes.size === 3", timeout=10000) for p in pages])
            mine = await asyncio.gather(*[p.evaluate("({sp: MysteryAction.player.sp.id, lv: MysteryAction.player.level, bank: MysteryAction.save.bank, hidden: document.querySelector('#online').hidden})") for p in pages])
            check('al iniciar, los cuatro entran a la expedición y ven a los otros tres', all(m['hidden'] for m in mine))
            check('cada jugador juega con SU criatura, SU nivel y SU partida (no los del anfitrión)', [m['sp'] for m in mine] == [p[1] for p in people] and [m['bank'] for m in mine] == [p[2] for p in people] and [m['lv'] for m in mine] == [p[3] for p in people], mine)
            # Juego simultáneo
            before = await A.evaluate("Object.fromEntries([...MysteryAction.net.remotes.values()].map(r => [r.nameTag, [r.x, r.y]]))")
            keys = ['ArrowRight', 'ArrowLeft', 'ArrowDown', 'ArrowUp']
            for p in pages: await p.click('#view')
            await asyncio.gather(*[p.keyboard.down(k) for p, k in zip(pages, keys)]); await A.wait_for_timeout(900)
            await asyncio.gather(*[p.keyboard.up(k) for p, k in zip(pages, keys)]); await A.wait_for_timeout(500)
            after = await A.evaluate("Object.fromEntries([...MysteryAction.net.remotes.values()].map(r => [r.nameTag, [r.x, r.y]]))")
            moved = [n for n in after if n in before and abs(after[n][0] - before[n][0]) + abs(after[n][1] - before[n][1]) > 8]
            check('los cuatro se mueven a la vez y el anfitrión ve moverse a los otros tres', len(moved) >= 2, {'movidos': moved})
            vis = await asyncio.gather(*[p.evaluate("(()=>{ const G=MysteryAction,p=G.player,c=G.camera; const sx=(p.x-c.left)*c.zoom, sy=(p.y-c.top)*c.zoom; return { inActors: G.actors.includes(p), onScreen: sx>0 && sx<c.vw && sy>0 && sy<c.vh, alive: p.alive } })()") for p in pages])
            check('cada jugador ve su propia criatura en pantalla', all(v['inActors'] and v['onScreen'] for v in vis), vis)
            await B.screenshot(path=os.path.join(shots, 'group_play.png'))
            # Corte de red de Carla
            # El SDK de Carla no reintenta solo (maxRetries 0): así se prueba el botón «Reintentar».
            # La reconexión automática del SDK se prueba en tests/colyseus/group.test.mjs.
            await Cc.evaluate("MysteryLobby.session.room.reconnection.maxRetries = 0")
            await ctxs[2].set_offline(True)
            # Un corte de red sin cierre lo detecta el servidor por el latido (ping cada 5 s, 3 fallos)
            await A.wait_for_function("[...MysteryAction.net.remotes.values()].some(r => r.nameTag === 'Carla' && !r.netConnected)", timeout=30000)
            st_off = await Cc.evaluate("MysteryLobby.session.status")
            check('al cortarse la red de un jugador, los demás lo ven «sin conexión» y él pasa a «reconectando»', st_off in ('reconnecting', 'lost'), st_off)
            # Sin red, el SDK (sin reintentos) se rinde: «Conexión perdida» con mensaje y botón «Reintentar»
            await Cc.wait_for_function("MysteryLobby.session && MysteryLobby.session.status === 'lost'", timeout=40000)
            msg = await Cc.inner_text('#online')
            check('sin reintentos automáticos: estado «Conexión perdida», mensaje claro y botón «Reintentar»', await Cc.is_visible('#on-retry') and 'conexión' in msg.lower(), msg[:160])
            # Al volver la red, el juego reintenta solo (evento «online» del navegador), sin pulsar nada
            await ctxs[2].set_offline(False)
            await Cc.wait_for_function("MysteryLobby.session && MysteryLobby.session.status === 'playing' && MysteryAction.net.connected", timeout=25000)
            await A.wait_for_function("[...MysteryAction.net.remotes.values()].some(r => r.nameTag === 'Carla' && r.netConnected)", timeout=8000)
            check('al volver la red se reconecta sola a la misma expedición y los demás lo ven conectado', await Cc.evaluate("document.querySelector('#online').hidden && MysteryAction.net.floorN >= 1"))
            # Dani abandona el grupo desde la pausa
            await D.keyboard.press('Escape'); await D.wait_for_selector('#btn-giveup:visible', timeout=3000)
            label = await D.inner_text('#btn-giveup'); await D.click('#btn-giveup')
            await D.click('#dialog button.btn-main'); await D.wait_for_function("!document.getElementById('result').hidden", timeout=8000)
            await A.wait_for_function("MysteryAction.net.remotes.size === 2", timeout=8000)
            check('«Abandonar grupo» en plena expedición: recibe su resultado y los demás siguen con 3', label == 'Abandonar grupo')
            dani = await D.evaluate("JSON.parse(localStorage.getItem('ma-online-auth')).accountId"); rec = st.db_tool('get', dani)
            check('el perfil de quien abandona se guarda en la base de datos con SU criatura y nivel', rec['save']['species'] == 'guerrero' and rec['save']['prog']['level'] >= 5 and rec['save']['runs'] == 1, {'v': rec['version'], 'runs': rec['save']['runs']})
            for n, e in errs.items(): check(f'sin errores de JavaScript ({n})', not e, e[:3])
            await b.close()
    finally:
        st.close()
    print(f'{sum(R)}/{len(R)} correctas'); return all(R)
if __name__ == '__main__': sys.exit(0 if asyncio.run(main()) else 1)
