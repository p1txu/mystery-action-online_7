"""Dejar un objeto en el suelo en cooperativo (dos navegadores contra el servidor real): Ana abre la
mochila y pulsa «Dejar en el suelo (para el grupo)»; el servidor lo quita de SU mochila y lo pone a su
lado; los dos lo ven; Ana no lo recoge sin querer; Beto llega y lo coge (pasa a SU mochila)."""
import asyncio, json, os, sys
from playwright.async_api import async_playwright
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from browser_common import Stack, watch_errors
R = []
def check(n, ok, info=''):
    R.append(bool(ok)); print(('PASS ' if ok else 'FAIL ') + n, json.dumps(info, ensure_ascii=False)[:360] if info != '' else '', flush=True)

async def main():
    shots = os.environ.get('SHOT_DIR', '.')
    st = Stack(2884, 2885)
    try:
        async with async_playwright() as pw:
            b = await pw.chromium.launch(); errs = {}
            async def open_player(name, species):
                ctx = await b.new_context(viewport={'width': 1100, 'height': 720}); pg = await ctx.new_page(); watch_errors(pg, errs, name)
                await pg.goto(st.url); await pg.wait_for_timeout(300)
                await pg.click('#btn-online'); await pg.click('.on-tab[data-tab="guest"]'); await pg.fill('#on-name', name); await pg.click('#on-guest')
                await pg.wait_for_selector(f'.on-fresh[data-sp="{species}"]', timeout=8000); await pg.click(f'.on-fresh[data-sp="{species}"]')
                await pg.wait_for_selector('#on-profile-card', timeout=5000); return pg
            A, B = await asyncio.gather(open_player('Ana', 'guerrero'), open_player('Beto', 'arquero'))
            await A.click('#on-create'); await A.wait_for_function("/^[A-Z2-9]{6}$/.test((document.querySelector('#on-code-val')||{}).textContent||'')", timeout=8000)
            code = await A.inner_text('#on-code-val')
            await B.fill('#on-code', code); await B.click('#on-join'); await B.wait_for_selector('#on-ready', timeout=8000); await B.click('#on-ready')
            await A.wait_for_function("!document.querySelector('#on-start').disabled", timeout=6000); await A.click('#on-start')
            await asyncio.gather(*[p.wait_for_function("MysteryAction.net && MysteryAction.net.active && MysteryAction.net.remotes.size === 1", timeout=10000) for p in (A, B)])
            st.ctl('arena', enemies=0)
            await asyncio.gather(*[p.wait_for_function("MysteryAction.floorRT && MysteryAction.floorRT.label.includes('P2')", timeout=8000) for p in (A, B)])
            for p in (A, B): await p.evaluate("UI.hideBoons()")
            stack = await A.evaluate("(() => { const s = MysteryAction.player.bag.stacks.find(s => ITEMS[s.id] && ITEMS[s.id].cat === 'consumible'); return s ? { uid: s.uid, id: s.id } : null })()")
            item = stack['id']
            nA0 = await A.evaluate(f"MysteryAction.player.bag.count('{item}')"); nB0 = await B.evaluate(f"MysteryAction.player.bag.count('{item}')")
            # Ana: mochila → seleccionar el objeto → «Dejar en el suelo (para el grupo)»
            await A.click('#view'); await A.keyboard.press('Tab'); await A.wait_for_timeout(200)
            await A.evaluate(f"(() => {{ UI.invSel = '{stack['uid']}'; UI.renderBag(MysteryAction); }})()")
            btn = A.locator('[data-act="drop"]')
            label = await btn.inner_text()
            await btn.click(); await A.wait_for_timeout(600)
            floor = st.ctl('floorItems'); dropped = [f for f in floor if f['dropBy']]
            nA1 = await A.evaluate(f"MysteryAction.player.bag.count('{item}')")
            check('Ana lo deja desde la mochila: el servidor lo quita de SU mochila y lo pone en el suelo', 'para el grupo' in label and len(dropped) == 1 and dropped[0]['id'] == item and nA1 == nA0 - 1, {'botón': label, 'suelo': dropped, 'antes': nA0, 'después': nA1})
            await A.keyboard.press('Escape'); await A.wait_for_timeout(200)
            d = dropped[0]
            seen = await asyncio.gather(*[p.evaluate(f"MysteryAction.floorRT.items.some(i => i.key === '{d['key']}' && i.id === '{item}')") for p in (A, B)])
            msgB = await B.evaluate("document.getElementById('toast').textContent")
            check('los dos lo ven en el suelo y a Beto se le avisa', all(seen) and 'Ana' in msgB, [seen, msgB])
            await B.screenshot(path=os.path.join(shots, 'drop_online.png'))
            st.ctl('place', name='Ana', x=d['x'], y=d['y']); await A.wait_for_timeout(500)
            check('Ana pasa por encima sin recogerlo (no se lo vuelve a quedar sin querer)', any(f['key'] == d['key'] for f in st.ctl('floorItems')))
            st.ctl('place', name='Ana', x=d['x'] + 200, y=d['y'])
            st.ctl('place', name='Beto', x=d['x'], y=d['y']); await B.wait_for_timeout(800)
            nB1 = await B.evaluate(f"MysteryAction.player.bag.count('{item}')")
            gone = await asyncio.gather(*[p.evaluate(f"!MysteryAction.floorRT.items.some(i => i.key === '{d['key']}')") for p in (A, B)])
            check('Beto llega y lo coge: pasa a SU mochila y desaparece del suelo para los dos', nB1 == nB0 + 1 and all(gone) and not any(f['key'] == d['key'] for f in st.ctl('floorItems')), {'Beto antes': nB0, 'después': nB1, 'desaparece': gone})
            check('sin errores de JavaScript', not any(errs.values()), errs)
            await b.close()
    finally:
        st.close()
    print(f'{sum(R)}/{len(R)} correctas'); return all(R)
if __name__ == '__main__': sys.exit(0 if asyncio.run(main()) else 1)
