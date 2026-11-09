"""Campaña y guardado (0.42) en dos navegadores contra el servidor real (Colyseus + SQLite):
 - Ana elige la Gruta de Cuarzo; Beto no la tiene desbloqueada: los dos ven «acompañante» en su fila;
 - en el piso 2 el servidor se reinicia para su sala: la expedición queda guardada («suspendida»);
 - al volver, los dos ven el aviso de expedición interrumpida (la aldea bloqueada hasta continuarla o cerrarla);
 - en la sala, «Continuar la expedición interrumpida» viene activado; Beto lo lee; al desactivarlo lee que se
   empezará otra; al iniciar, los dos aparecen en el piso 2 de la MISMA expedición;
 - al terminar, la base de datos falla: la pantalla de resultado NO dice que se haya guardado; cuando vuelve,
   el servidor lo guarda solo y el juego lo confirma; una sola recompensa para cada uno.
El escenario se prepara con las rutas /__test/ del servidor de pruebas (serve-for-browser.mjs)."""
import asyncio, json, os, sys
from playwright.async_api import async_playwright
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from browser_common import Stack, watch_errors
R = []
def check(n, ok, info=''):
    R.append(bool(ok)); print(('PASS ' if ok else 'FAIL ') + n, json.dumps(info, ensure_ascii=False)[:420] if info != '' else '', flush=True)

async def main():
    shots = os.environ.get('SHOT_DIR', '.')
    st = Stack(2896, 2897)
    try:
        async with async_playwright() as pw:
            b = await pw.chromium.launch(); errs = {}
            async def open_player(name, species):
                ctx = await b.new_context(viewport={'width': 1100, 'height': 760}); pg = await ctx.new_page(); watch_errors(pg, errs, name)
                await pg.goto(st.url); await pg.wait_for_timeout(300)
                await pg.evaluate("n => MysteryLobby.devGuest(n)", name)
                await pg.wait_for_selector(f'.on-fresh[data-sp="{species}"]', timeout=8000); await pg.click(f'.on-fresh[data-sp="{species}"]')
                await pg.wait_for_selector('#on-profile-card', timeout=5000); return pg
            A, B = await asyncio.gather(open_player('Ana', 'guerrero'), open_player('Beto', 'mago'))
            pages = [A, B]
            for _ in range(50):
                if st.ctl('hub').get('ready') and len(st.ctl('hub')['online']) >= 2: break
                await A.wait_for_timeout(100)
            st.ctl('seed', name='Ana', cleared=['bosque'])
            async def group(resume):
                await A.click('#on-create'); await A.wait_for_function("/^[A-Z2-9]{6}$/.test((document.querySelector('#on-code-val')||{}).textContent||'')", timeout=8000)
                code = await A.inner_text('#on-code-val')
                await B.fill('#on-code', code); await B.click('#on-join'); await B.wait_for_selector('#on-ready', timeout=8000)
                await A.select_option('#on-gdng', 'gruta'); await A.wait_for_timeout(400)
                if resume: await A.wait_for_selector('#on-gres', timeout=5000)
            await group(False)
            rowA = await A.inner_text('li[data-player="Beto"]'); rowB = await B.inner_text('li[data-player="Beto"]')
            check('Beto (sin la Gruta) sale como «acompañante» en las dos pantallas', 'acompañante' in rowA and 'acompañante' in rowB, [rowA, rowB])
            await B.click('#on-ready'); await A.wait_for_function("!document.querySelector('#on-start').disabled", timeout=6000); await A.click('#on-start')
            await asyncio.gather(*[p.wait_for_function("MysteryAction.net && MysteryAction.net.active && MysteryAction.floorRT", timeout=12000) for p in pages])
            st.ctl('nextFloor'); await A.wait_for_timeout(800)
            exp1 = st.ctl('expedition')
            # --- Reinicio del servidor para esta sala: la expedición queda guardada
            susp = st.ctl('suspend')
            check('la sala guarda la expedición como suspendida (piso 2)', susp['id'] == exp1['id'] and exp1['step'] == 1, [susp, exp1])
            await A.wait_for_timeout(1200)
            for p in pages:
                await p.reload(); await p.wait_for_timeout(500)
                if await p.is_visible('#btn-online'): await p.click('#btn-online')
            await asyncio.gather(*[p.wait_for_selector('#on-pending', timeout=8000) for p in pages])
            notes = await asyncio.gather(*[p.inner_text('#on-pending') for p in pages])
            check('al volver, los dos ven la expedición interrumpida (con dónde se quedó) y la opción de cerrarla', all('Gruta' in t and 'interrumpida' in t and 'Cerrar' in t for t in notes), notes)
            await A.screenshot(path=os.path.join(shots, 'campaign_pending.png'))
            # --- Continuar
            await group(True)
            await B.wait_for_function("/Continuaréis/.test((document.querySelector('#on-resume-line')||{}).textContent||'')", timeout=5000)
            check('Ana ve «Continuar la expedición interrumpida» activado', await A.is_checked('#on-gres') and st.ctl('lobby')['resume'])
            check('Beto lee que se continúa donde se guardó', 'Gruta' in await B.inner_text('#on-resume-line'), await B.inner_text('#on-resume-line'))
            await A.screenshot(path=os.path.join(shots, 'campaign_lobby.png'))
            await A.uncheck('#on-gres')
            await B.wait_for_function("/primer piso/.test((document.querySelector('#on-resume-line')||{}).textContent||'')", timeout=5000)
            check('si Ana lo desactiva, Beto lee que se empezará otra (lo decide el servidor)', st.ctl('lobby')['resume'] is False)
            await A.check('#on-gres'); await B.wait_for_function("/Continuaréis/.test((document.querySelector('#on-resume-line')||{}).textContent||'')", timeout=5000)
            await B.click('#on-ready'); await A.wait_for_function("!document.querySelector('#on-start').disabled", timeout=6000); await A.click('#on-start')
            await asyncio.gather(*[p.wait_for_function("MysteryAction.net && MysteryAction.net.active && MysteryAction.floorRT && /P2/.test(MysteryAction.floorRT.label)", timeout=12000) for p in pages])
            exp2 = st.ctl('expedition')
            labels = await asyncio.gather(*[p.evaluate("MysteryAction.floorRT.label") for p in pages])
            check('los dos continúan en el piso 2 de la MISMA expedición', exp2['id'] == exp1['id'] and exp2['resumed'] and all('P2' in l for l in labels), [exp2, labels])
            # --- Al terminar falla la base de datos: no se da por guardado hasta que lo esté
            st.ctl('failCommits', on=True); st.ctl('finish', result='return')
            await asyncio.gather(*[p.wait_for_function("!document.getElementById('result').hidden", timeout=15000) for p in pages])
            txt = await A.inner_text('#result')
            check('con la base de datos caída, el resultado NO dice que se haya guardado', 'Aún no se ha podido guardar' in txt and 'ha guardado' not in txt.replace('No se ha podido guardar', ''), txt[:300])
            await A.screenshot(path=os.path.join(shots, 'campaign_unsaved.png'))
            st.ctl('failCommits', on=False)
            await asyncio.gather(*[p.wait_for_function("[...document.querySelectorAll('#toast')].some(e => /Resultado guardado/.test(e.textContent))", timeout=30000) for p in pages])
            check('cuando vuelve la base de datos, el servidor lo guarda solo y el juego lo confirma', True)
            await A.wait_for_timeout(500)
            pa, pb = st.ctl('profile', name='Ana'), st.ctl('profile', name='Beto')
            check('una sola recompensa para cada uno; Beto (acompañante) no se salta la campaña', pa['rewards'] == 1 and pb['rewards'] == 1 and 'gruta' not in pb['cleared'], [pa, pb])
            for n, e in errs.items(): check(f'sin errores de JavaScript ({n})', not e, e[:5])
            await b.close()
    finally:
        st.close()
    print(f'{sum(R)}/{len(R)} correctas', flush=True)
    sys.exit(0 if all(R) else 1)

asyncio.run(main())
