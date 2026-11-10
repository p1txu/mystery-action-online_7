"""Interfaz de consumibles e inventario EN LÍNEA (navegadores contra el servidor real, Colyseus + SQLite).

- Aldea: el equipo se cambia con arrastrar / doble clic y lo aplica el SERVIDOR (perfil en la base de datos); los
  consumibles no se gastan en la aldea en línea (motivo visible) y no hay diferencias entre cliente y servidor.
- Expedición en grupo: el equipo es de solo lectura (aviso, nada cambia); X gasta exactamente una unidad en el
  servidor; abrir el inventario no detiene el mundo compartido (el reloj del servidor sigue y el compañero se mueve)."""
import asyncio, json, os, sys
from playwright.async_api import async_playwright
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from browser_common import Stack, watch_errors
R = []
def check(n, ok, info=''):
    R.append(bool(ok)); print(('PASS ' if ok else 'FAIL ') + n, json.dumps(info, ensure_ascii=False)[:400] if info != '' else '', flush=True)
PROFILE = "fetch(MysteryLobby.server + '/api/profile', { headers: { authorization: 'Bearer ' + JSON.parse(localStorage.getItem('ma-online-auth')).token } }).then(r => r.json())"
SEED = {'story': {'flags': ['c1_intro']}, 'inv': [{'uid': 't1', 'id': 'espadaHierro', 'qty': 1}, {'uid': 't2', 'id': 'yelmoHierro', 'qty': 1}, {'uid': 't3', 'id': 'pocion', 'qty': 3}, {'uid': 't4', 'id': 'manzana', 'qty': 1}]}

async def main():
    shots = os.environ.get('SHOT_DIR', '.')
    st = Stack(2894, 2895)
    try:
        async with async_playwright() as pw:
            b = await pw.chromium.launch(); errs = {}
            async def open_player(name, species, w=1280, h=900):
                ctx = await b.new_context(viewport={'width': w, 'height': h}); pg = await ctx.new_page(); watch_errors(pg, errs, name)
                await pg.goto(st.url); await pg.wait_for_timeout(300)
                await pg.evaluate("n => MysteryLobby.devGuest(n)", name)
                await pg.wait_for_selector(f'.on-fresh[data-sp="{species}"]', timeout=8000); await pg.click(f'.on-fresh[data-sp="{species}"]')
                await pg.wait_for_selector('#on-profile-card', timeout=5000)
                acc = await pg.evaluate("JSON.parse(localStorage.getItem('ma-online-auth')).accountId")
                st.db_tool('patch', acc, json.dumps(SEED))
                await pg.evaluate("MysteryLobby.refresh()"); await pg.wait_for_timeout(300)
                return pg, acc
            # ---------- Aldea en línea (Carla) ----------
            C, cacc = await open_player('Carla', 'guerrero', 1280, 1500)
            await C.click('#on-solo'); await C.wait_for_function("MysteryAction.account && MysteryAction.mode === 'village' && MysteryAction.state === 'play'", timeout=8000)
            await C.wait_for_timeout(600); await C.click('#view')
            inv0 = (await C.evaluate(PROFILE))['profile']['inv']
            await C.keyboard.press('x'); await C.wait_for_timeout(300)
            qx = await C.evaluate("() => ({ q: MysteryAction.quickStatus('heal'), toast: document.getElementById('toast').innerText, cls: document.querySelector('[data-q=heal]').className })")
            check('aldea en línea: X no gasta nada (los consumibles se usan en las expediciones) y lo explica', qx['q']['state'] == 'blocked' and 'expediciones' in qx['toast'] and (await C.evaluate(PROFILE))['profile']['inv'] == inv0 and qx['q']['count'] == 3, qx)
            await C.keyboard.press('Tab'); await C.wait_for_selector('#bagpanel:not([hidden])')
            await C.locator('#bag-list [data-sel="t1"]').drag_to(C.locator('#bag-list .eslot[data-slot=arma]')); await C.wait_for_timeout(700)
            await C.dblclick('#bag-list [data-sel="t2"]'); await C.wait_for_timeout(700)
            srv = (await C.evaluate(PROFILE))['profile']
            cli = await C.evaluate("() => ({ arma: MysteryAction.save.equip.arma && MysteryAction.save.equip.arma.id, casco: MysteryAction.save.equip.casco && MysteryAction.save.equip.casco.id, ui: [...document.querySelectorAll('#bag-list .eslot.full')].map(b => b.dataset.slot).sort() })")
            check('aldea en línea: arrastrar la espada y doble clic en el yelmo los equipa EN EL SERVIDOR; la ventana coincide', (srv['equip']['arma'] or {}).get('id') == 'espadaHierro' and (srv['equip']['casco'] or {}).get('id') == 'yelmoHierro' and not any(x['id'] in ('espadaHierro', 'yelmoHierro') for x in srv['inv']) and cli['arma'] == 'espadaHierro' and cli['ui'] == ['arma', 'casco'], {'servidor': srv['equip'], 'cliente': cli})
            await C.screenshot(path=os.path.join(shots, 'ui_inventario_online_aldea.png'))
            await C.locator('#bag-list .eslot[data-slot=casco]').drag_to(C.locator('#bag-list .inv-grid')); await C.wait_for_timeout(700)
            srv2 = (await C.evaluate(PROFILE))['profile']
            check('aldea en línea: arrastrar el yelmo a la mochila lo quita en el servidor (una sola copia)', not srv2['equip']['casco'] and sum(1 for x in srv2['inv'] if x['id'] == 'yelmoHierro') == 1, srv2['equip'])
            await C.keyboard.press('Escape')
            # ---------- Expedición en grupo (Ana y Beto) ----------
            (A, aacc), (B, bacc) = await asyncio.gather(open_player('Ana', 'guerrero'), open_player('Beto', 'arquero'))
            await A.click('#on-create'); await A.wait_for_function("/^[A-Z2-9]{6}$/.test((document.querySelector('#on-code-val')||{}).textContent||'')", timeout=8000)
            code = await A.inner_text('#on-code-val')
            await B.fill('#on-code', code); await B.click('#on-join'); await B.wait_for_selector('#on-ready', timeout=8000); await B.click('#on-ready')
            await A.wait_for_function("!document.querySelector('#on-start').disabled", timeout=6000); await A.click('#on-start')
            await asyncio.gather(*[p.wait_for_function("MysteryAction.net && MysteryAction.net.active && MysteryAction.net.remotes.size === 1", timeout=10000) for p in (A, B)])
            st.ctl('arena', enemies=0)
            await asyncio.gather(*[p.wait_for_function("MysteryAction.floorRT && MysteryAction.floorRT.label.includes('P2')", timeout=8000) for p in (A, B)])
            for p in (A, B): await p.evaluate("UI.hideBoons()")
            await A.click('#view')
            # X con PS al máximo: el servidor no gasta nada
            s0 = st.ctl('bag', name='Ana'); hp_full = s0['hp']
            await A.keyboard.press('x'); await A.wait_for_timeout(500)
            s1 = st.ctl('bag', name='Ana')
            check('expedición en línea: X con PS al máximo no gasta nada en el servidor', s1['inv'].get('pocion') == s0['inv'].get('pocion') == 3, [s0['inv'], s1['inv']])
            # X con PS bajos: exactamente una unidad en el servidor, y la casilla del cliente lo refleja
            st.ctl('bag', name='Ana', hp=20); await A.wait_for_timeout(300)
            await A.keyboard.down('x'); await A.wait_for_timeout(500); await A.keyboard.up('x'); await A.wait_for_timeout(700)
            s2 = st.ctl('bag', name='Ana'); qa = await A.evaluate("() => MysteryAction.quickStatus('heal')")
            check('expedición en línea: X mantenida gasta UNA poción en el servidor (+35 PS) y la casilla coincide', s2['inv'].get('pocion') == 2 and s2['hp'] == 55 and qa['count'] == 2, {'servidor': s2['inv'], 'ps': s2['hp'], 'cliente': qa})
            # Abrir el inventario: el mundo sigue (reloj del servidor y compañero que se mueve)
            await A.keyboard.press('Tab'); await A.wait_for_selector('#bagpanel:not([hidden])')
            t0 = st.ctl('bag', name='Ana')['time']; b0 = st.ctl('bag', name='Beto')
            await B.click('#view'); await B.keyboard.down('d'); await B.wait_for_timeout(900); await B.keyboard.up('d'); await B.wait_for_timeout(200)
            t1 = st.ctl('bag', name='Ana')['time']; b1 = st.ctl('bag', name='Beto')
            info = await A.evaluate("() => ({ text: document.getElementById('bag-info').innerText, ro: !!document.querySelector('#bag-list .inv2.ro'), note: (document.querySelector('#bag-list .ro-note') || {}).innerText || '', drag: document.querySelectorAll('#bag-list [draggable=true]').length })")
            check('expedición en línea: con el inventario abierto el mundo sigue (reloj del servidor y Beto se mueve) y se avisa', t1 > t0 + 0.8 and abs(b1['x'] - b0['x']) > 20 and 'sigue en marcha' in info['text'], {'reloj': [t0, t1], 'Beto x': [b0['x'], b1['x']], 'aviso': info['text']})
            await A.screenshot(path=os.path.join(shots, 'ui_inventario_online_expedicion.png'))
            # Equipo de solo lectura: nada se puede arrastrar; el doble clic explica por qué y nada cambia
            e0 = st.ctl('bag', name='Ana')
            await A.dblclick('#bag-list [data-sel="t1"]'); await A.wait_for_timeout(500)
            toast = await A.evaluate("() => document.getElementById('toast').innerText"); e1 = st.ctl('bag', name='Ana')
            check('expedición en línea: equipo de solo lectura (sin arrastrar, aviso al intentarlo, nada cambia en el servidor)', info['ro'] and info['drag'] == 0 and 'aldea' in info['note'] and 'aldea' in toast and e0['equip'] == e1['equip'] and e0['inv'] == e1['inv'], {'aviso': toast, 'nota': info['note']})
            await A.keyboard.press('Escape'); await A.wait_for_timeout(200)
            check('sin errores de JavaScript', not any(errs.values()), errs)
            await b.close()
    finally:
        st.close()
    print(f"{sum(R)}/{len(R)} correctas"); sys.exit(0 if all(R) else 1)

asyncio.run(main())
