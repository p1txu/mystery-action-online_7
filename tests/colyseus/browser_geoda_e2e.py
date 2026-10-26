"""Gruta de Cuarzo en cooperativo con dos navegadores contra el servidor real (Colyseus):
 - Pico Cartero: al llegar al piso 2 el SERVIDOR detiene la simulación para todos y los dos ven la
   escena de los ruidos y a Pico escondido (el vecino es visual en cada cliente).
 - Reina Geoda: gritos al 60 % y al 30 % (pausa para todos), rocas caídas iguales en los dos clientes
   (mismas casillas bloqueadas), choque de la Carga contra una roca (se agrieta en ambos), aturdida
   (barra «ATURDIDA») y salto que derriba al objetivo.
El escenario se prepara con las rutas /__test/ del servidor de pruebas (serve-for-browser.mjs)."""
import asyncio, json, os, sys
from playwright.async_api import async_playwright
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from browser_common import Stack, watch_errors
R = []
def check(n, ok, info=''):
    R.append(bool(ok)); print(('PASS ' if ok else 'FAIL ') + n, json.dumps(info, ensure_ascii=False)[:420] if info != '' else '', flush=True)
ROCKS = """(() => { const G = MysteryAction; return (G.boulders || []).map(b => ({ id: b.id, tx: b.tx, ty: b.ty, hp: b.hp, solid: b.fall <= 0 && G.world.isSolid(b.tx, b.ty) && G.world.isSolid(b.tx + 1, b.ty + 1) })).sort((a, b) => a.id - b.id); })()"""

async def main():
    shots = os.environ.get('SHOT_DIR', '.')
    st = Stack(2880, 2881, reconnect=60)
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

            # --- Pico Cartero: Gruta P2
            r = st.ctl('dungeon', id='gruta', step=2)
            check('el servidor detiene la simulación al llegar al piso 2 de la Gruta (alguien aún no conoce a Pico)', r['pause'] > 3, r)
            await asyncio.gather(*[p.wait_for_function("MysteryAction.floorRT && /Gruta de Cuarzo · P2/.test(MysteryAction.floorRT.label) && MysteryAction.cine && MysteryAction.cine.kind === 'courier'", timeout=8000) for p in pages])
            await B.wait_for_timeout(900)
            seen = await asyncio.gather(*[p.evaluate("({ courier: !!MysteryAction.courier && MysteryAction.courier.scared, card: document.getElementById('floorcard-text').textContent })") for p in pages])
            await B.screenshot(path=os.path.join(shots, 'geoda_online_pico.png'))
            check('los dos ven la escena de los ruidos extraños y a Pico escondido', all(s['courier'] and 'ruidos' in s['card'] for s in seen), seen)
            pos0 = st.ctl('member', name='Ana')
            await A.click('#view'); await A.keyboard.down('ArrowRight'); await A.wait_for_timeout(900); await A.keyboard.up('ArrowRight')
            pos1 = st.ctl('member', name='Ana')
            check('durante la pausa nadie se mueve en el servidor', abs(pos1['x'] - pos0['x']) < 1, [pos0, pos1])
            await A.wait_for_timeout(2400)
            await A.keyboard.down('ArrowRight'); await A.wait_for_timeout(700); await A.keyboard.up('ArrowRight'); await A.wait_for_timeout(300)
            pos2 = st.ctl('member', name='Ana')
            check('después la partida sigue', abs(pos2['x'] - pos1['x']) > 8 or abs(pos2['y'] - pos1['y']) > 8, [pos1, pos2])

            # --- Reina Geoda
            r = st.ctl('dungeon', id='gruta', step='boss')
            await asyncio.gather(*[p.wait_for_function(f"MysteryAction.floorRT && MysteryAction.floorRT.boss && MysteryAction.floorRT.boss.netId === {json.dumps(r['id'])}", timeout=10000) for p in pages])
            for p in pages: await p.evaluate("UI.hideBoons()")
            st.ctl('bossHurt', frac=.59)
            await asyncio.gather(*[p.wait_for_function("MysteryAction.cine && MysteryAction.cine.kind === 'rage'", timeout=6000) for p in pages])
            cards = await asyncio.gather(*[p.evaluate("document.getElementById('floorcard-text').textContent") for p in pages])
            check('60 %: los dos ven el grito y el aviso de la carga', all('grito' in c and 'CARGA' in c for c in cards), cards)
            await A.wait_for_timeout(3000)
            st.ctl('bossHurt', frac=.29)
            await asyncio.gather(*[p.wait_for_function("MysteryAction.floorRT.boss.geodaStage === 2 && (MysteryAction.boulders || []).length >= 3", timeout=8000) for p in pages])
            cards = await asyncio.gather(*[p.evaluate("document.getElementById('floorcard-text').textContent") for p in pages])
            check('30 %: segundo grito y derrumbe en los dos', all('derrumba' in c for c in cards), cards)
            await A.wait_for_timeout(3000 + 2600)
            srv = st.ctl('rocks')
            mine = await asyncio.gather(*[p.evaluate(ROCKS) for p in pages])
            want = sorted([{ 'id': x['id'], 'tx': x['tx'], 'ty': x['ty'], 'hp': x['hp'], 'solid': x['solid'] } for x in srv['rocks']], key=lambda x: x['id'])
            check('las rocas caídas son las mismas (y sólidas) en el servidor y en los dos navegadores', len(want) >= 3 and all(m == want for m in mine) and all(x['solid'] for x in want), [want, mine])
            await B.screenshot(path=os.path.join(shots, 'geoda_online_rocas.png'))
            d = st.ctl('dashAtRock', name='Ana')
            await A.wait_for_timeout(1200)
            srv = st.ctl('rocks'); after = st.ctl('member', name='Ana')
            hit = next(x for x in srv['rocks'] if x['id'] == d['rock']) if any(x['id'] == d['rock'] for x in srv['rocks']) else None
            mine = await asyncio.gather(*[p.evaluate(ROCKS) for p in pages])
            check('la Carga choca con la roca: rebota, se agrieta (igual en todos) y Ana, detrás, no recibe daño', srv['boss']['hits'] == 1 and hit and hit['hp'] == 1 and all(any(x['id'] == d['rock'] and x['hp'] == 1 for x in m) for m in mine) and after['hp'] == d['hp'], [srv, after, d])
            st.ctl('daze', name='Beto', t=2.5)
            await asyncio.gather(*[p.wait_for_function("MysteryAction.floorRT.boss.state === 'dazed' && /ATURDIDA/.test(document.getElementById('boss-name').textContent)", timeout=5000) for p in pages])
            await A.screenshot(path=os.path.join(shots, 'geoda_online_aturdida.png'))
            check('aturdida: los dos lo ven en la barra del guardián', True)
            await asyncio.gather(*[p.wait_for_function("MysteryAction.floorRT.boss.state === 'leap'", timeout=6000) for p in pages])
            await A.wait_for_timeout(2200)
            beto, ana = st.ctl('member', name='Beto'), st.ctl('member', name='Ana')
            check('el salto derriba a su objetivo (Beto) de un golpe; Ana, lejos, sigue en pie', beto['downed'] and not ana['downed'], [beto, ana])
            check('sin errores de JavaScript en los navegadores', not any(errs.values()), errs)
            await b.close()
    finally:
        st.close()
    print(f'{sum(R)}/{len(R)} correctas'); return all(R)
if __name__ == '__main__': sys.exit(0 if asyncio.run(main()) else 1)
