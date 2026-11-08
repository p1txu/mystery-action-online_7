"""Campaña cooperativa en dos navegadores contra el servidor real (Colyseus + SQLite):
 - Ana elige la Gruta de Cuarzo en la sala de espera; Beto no la tiene desbloqueada: los dos ven la etiqueta
   «acompañante» en su fila;
 - los dos tienen el punto de control de la Gruta (una expedición interrumpida): Ana ve «Continuar desde el
   punto de control» activado y Beto lo lee en la sala; si Ana lo desactiva, Beto lee que se empieza de cero;
 - al iniciar, los dos aparecen en el punto de control y ven el aviso;
 - al volver a la aldea, el punto de control queda gastado en la base de datos y hay una sola recompensa.
El perfil se prepara con las rutas /__test/ del servidor de pruebas (serve-for-browser.mjs)."""
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
            st.ctl('seed', name='Ana', cleared=['bosque'], resume='gruta'); st.ctl('seed', name='Beto', resume='gruta')
            await A.click('#on-create'); await A.wait_for_function("/^[A-Z2-9]{6}$/.test((document.querySelector('#on-code-val')||{}).textContent||'')", timeout=8000)
            code = await A.inner_text('#on-code-val')
            await B.fill('#on-code', code); await B.click('#on-join'); await B.wait_for_selector('#on-ready', timeout=8000)
            await A.select_option('#on-gdng', 'gruta')
            await A.wait_for_selector('#on-gres', timeout=5000)
            await B.wait_for_function("/punto de control/.test((document.querySelector('#on-resume-line')||{}).textContent||'')", timeout=5000)
            lob = st.ctl('lobby')
            rowA = await A.inner_text('li[data-player="Beto"]'); rowB = await B.inner_text('li[data-player="Beto"]')
            check('Beto (sin la Gruta) sale como «acompañante» en las dos pantallas', 'acompañante' in rowA and 'acompañante' in rowB and any(p['name'] == 'Beto' and p['companion'] for p in lob['players']), [rowA, rowB, lob])
            check('Ana ve «Continuar desde el punto de control» activado', await A.is_checked('#on-gres') and lob['resume'], lob)
            check('Beto lee en la sala que se continúa desde el punto de control', 'Continuaréis' in await B.inner_text('#on-resume-line'))
            await A.screenshot(path=os.path.join(shots, 'campaign_lobby.png'))
            await A.uncheck('#on-gres')
            await B.wait_for_function("/primer piso/.test((document.querySelector('#on-resume-line')||{}).textContent||'')", timeout=5000)
            check('si Ana lo desactiva, Beto lee que se empieza desde el primer piso (y lo decide el servidor)', st.ctl('lobby')['resume'] is False)
            await A.check('#on-gres'); await B.wait_for_function("/Continuaréis/.test((document.querySelector('#on-resume-line')||{}).textContent||'')", timeout=5000)
            await B.click('#on-ready')
            await A.wait_for_function("!document.querySelector('#on-start').disabled", timeout=6000); await A.click('#on-start')
            await asyncio.gather(*[p.wait_for_function("MysteryAction.net && MysteryAction.net.active && MysteryAction.floorRT && /Punto de control/.test(MysteryAction.floorRT.label)", timeout=12000) for p in pages])
            labels = await asyncio.gather(*[p.evaluate("MysteryAction.floorRT.label") for p in pages])
            check('los dos empiezan en el punto de control de la Gruta', all('Gruta' in l and 'Punto de control' in l for l in labels), labels)
            await B.screenshot(path=os.path.join(shots, 'campaign_resume.png'))
            st.ctl('finish', result='return')
            await asyncio.gather(*[p.wait_for_function("!document.getElementById('result').hidden", timeout=10000) for p in pages])
            await A.wait_for_timeout(500)
            pa, pb = st.ctl('profile', name='Ana'), st.ctl('profile', name='Beto')
            check('al volver, el punto de control queda gastado y hay una sola recompensa para cada uno', pa['resume'] is None and pb['resume'] is None and pa['rewards'] == 1 and pb['rewards'] == 1, [pa, pb])
            check('Beto (acompañante) no se salta la campaña', 'gruta' not in pb['cleared'], pb)
            for n, e in errs.items(): check(f'sin errores de JavaScript ({n})', not e, e[:5])
            await b.close()
    finally:
        st.close()
    print(f'{sum(R)}/{len(R)} correctas', flush=True)
    sys.exit(0 if all(R) else 1)

asyncio.run(main())
