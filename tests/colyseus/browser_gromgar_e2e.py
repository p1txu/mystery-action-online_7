"""Gromgar (BossKit) en cooperativo con dos navegadores contra el servidor real (Colyseus) y LATENCIA:
cada cliente recibe el estado y los avisos 140 ms tarde y sus órdenes llegan 140 ms tarde (280 ms ida y vuelta).
 - 60 %: los dos ven la escena de furia con la explicación de las rocas; el servidor pausa para todos.
 - Derrumbe: las mismas rocas (casillas, vida, sólidas) en el servidor y en los dos navegadores.
 - Carga contra una roca: aturdido en todos (barra «aturdido»), roca agrietada igual en todos, y Ana,
   detrás de la roca, no recibe daño. Tres choques: DERRIBADO con la defensa −40 % y el motivo en la barra
   y en el aviso de los dos.
 - Muerte durante la avalancha: sus piedras desaparecen, nadie recibe daño después y nadie ve avisos suyos.
El escenario se prepara con las rutas /__test/ del servidor de pruebas (serve-for-browser.mjs)."""
import asyncio, json, os, sys
from playwright.async_api import async_playwright
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from browser_common import Stack, watch_errors
R = []
def check(n, ok, info=''):
    R.append(bool(ok)); print(('PASS ' if ok else 'FAIL ') + n, json.dumps(info, ensure_ascii=False)[:420] if info != '' else '', flush=True)
ROCKS = """(() => { const G = MysteryAction; return (G.boulders || []).filter(b => b.fall <= 0 && G.world.isSolid(b.tx, b.ty) && G.world.isSolid(b.tx + 1, b.ty + 1)).map(b => ({ id: b.id, tx: b.tx, ty: b.ty, hp: b.hp })).sort((a, b) => a.id - b.id); })()"""
LAG = """(ms => { const N = MysteryAction.net; if (N.lagged) return; N.lagged = ms;
  const as = N.applyState.bind(N), oe = N.onEvent.bind(N), send = N.tx.send;
  N.applyState = st => setTimeout(() => as(st), ms); N.onEvent = ev => setTimeout(() => oe(ev), ms); N.tx.send = (t, m) => setTimeout(() => send(t, m), ms); })"""
HUD = "document.getElementById('boss-name').textContent"

async def main():
    shots = os.environ.get('SHOT_DIR', '.')
    st = Stack(2890, 2891, reconnect=60)
    try:
        async with async_playwright() as pw:
            b = await pw.chromium.launch(); errs = {}; toasts = {'Ana': [], 'Beto': []}
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
            for p in pages:
                await p.evaluate("UI.hideBoons()"); await p.evaluate(LAG + "(140)")
                await p.evaluate("(() => { const t = UI.toast.bind(UI); window.__toasts = []; UI.toast = (m, c) => { window.__toasts.push(m); return t(m, c); }; })()")

            r = st.ctl('dungeon', id='mina', step='boss')
            await asyncio.gather(*[p.wait_for_function(f"MysteryAction.floorRT && MysteryAction.floorRT.boss && MysteryAction.floorRT.boss.netId === {json.dumps(r['id'])}", timeout=12000) for p in pages])
            names = await asyncio.gather(*[p.evaluate("MysteryAction.floorRT.boss.kind.name") for p in pages])
            check('la guarida de la Mina Olvidada es la de Gromgar en los dos', all(n == 'Gromgar' for n in names), names)
            for p in pages: await p.evaluate("UI.hideBoons()")

            st.ctl('bossHurt', frac=.59)
            await asyncio.gather(*[p.wait_for_function("MysteryAction.cine && MysteryAction.cine.kind === 'rage'", timeout=6000) for p in pages])
            cards = await asyncio.gather(*[p.evaluate("document.getElementById('floorcard-text').textContent") for p in pages])
            check('60 %: los dos ven la furia y la explicación (roca, aturdido, defensa −40 %)', all('derrumbe' in c and 'roca' in c and '−40 %' in c for c in cards), cards)
            await A.wait_for_timeout(2400 + 1600 + 2600)
            srv = st.ctl('bk'); mine = await asyncio.gather(*[p.evaluate(ROCKS) for p in pages])
            check('derrumbe: las mismas rocas sólidas en el servidor y en los dos navegadores', len(srv['rocks']) >= 5 and all(m == srv['rocks'] for m in mine), [srv['rocks'], mine])
            await B.screenshot(path=os.path.join(shots, 'gromgar_online_rocas.png'))

            for k in range(1, 4):
                d = st.ctl('bkChargeAtRock', name='Ana')
                check(f'choque {k}: hay una roca con sitio a los dos lados', d['rock'] is not None, d)
                want = 'stun' if k < 3 else 'vuln'
                ok = False
                for _ in range(40):
                    await A.wait_for_timeout(100); s = st.ctl('bk')
                    if s['stage'] == want: ok = True; break
                ana = st.ctl('member', name='Ana')
                check(f'choque {k}: el servidor cuenta {k} y lo deja {"aturdido" if k < 3 else "DERRIBADO"}; Ana, detrás de la roca, sin daño', ok and (s['hits'] == k) and ana['hp'] >= d['hp'], [s['stage'], s['hits'], ana['hp'], d['hp']])
                pat = 'aturdido' if k < 3 else 'DERRIBADO.*Defensa −40 %.*3 choques contra las rocas'
                await asyncio.gather(*[p.wait_for_function(f"new RegExp({json.dumps(pat)}).test({HUD})", timeout=4000) for p in pages])
                mine = await asyncio.gather(*[p.evaluate(ROCKS) for p in pages]); srv = st.ctl('bk')
                check(f'choque {k}: con 280 ms de ida y vuelta los dos ven el estado en la barra y la roca agrietada igual que el servidor', all(m == srv['rocks'] for m in mine), [srv['rocks'], mine])
                if k == 3: await A.screenshot(path=os.path.join(shots, 'gromgar_online_derribado.png'))
                if k < 3: await A.wait_for_timeout(int((1.6 + 1.3) * 1000))
            seen = await asyncio.gather(*[p.evaluate("window.__toasts.join(' | ')") for p in pages])
            check('los dos leen por qué es vulnerable («ha caído al suelo… 3 choques… Defensa −40 %»)', all('ha caído al suelo' in t and '3 choques' in t and 'Defensa −40 %' in t for t in seen), seen)
            s = st.ctl('bk')
            check('derribado: el servidor le aplica la defensa −40 %', abs(s['vuln'] - 1 / .6) < 1e-6, s)

            # --- muerte en mitad de un ataque: nada suyo sigue
            await A.wait_for_timeout(7600)
            st.ctl('bkAvalanche', name='Beto'); await A.wait_for_timeout(1350)   # aviso de 1 s: las piedras ya están en el suelo
            z0 = st.ctl('bk')['zones']
            hp0 = [st.ctl('member', name=n)['hp'] for n in ('Ana', 'Beto')]
            st.ctl('bkKill', name='Ana'); await A.wait_for_timeout(2600)
            s = st.ctl('bk'); hp1 = [st.ctl('member', name=n)['hp'] for n in ('Ana', 'Beto')]
            check('muere en mitad de la avalancha: sus piedras desaparecen y nadie recibe daño después', z0 > 0 and not s['alive'] and s['zones'] == 0 and all(h1 >= h0 for h0, h1 in zip(hp0, hp1)), [z0, s, hp0, hp1])
            dead = await asyncio.gather(*[p.evaluate("(() => { const b = MysteryAction.floorRT.boss; return { alive: b.alive, zones: MysteryAction.zones.filter(z => z.team === 'enemy').length, st: b.state }; })()") for p in pages])
            check('los dos clientes lo ven caído y sin avisos de ataque pendientes', all(not x['alive'] and x['zones'] == 0 for x in dead), dead)
            check('sin errores de JavaScript en los navegadores', not any(errs.values()), errs)
            await b.close()
    finally:
        st.close()
    print(f'{sum(R)}/{len(R)} correctas'); return all(R)
if __name__ == '__main__': sys.exit(0 if asyncio.run(main()) else 1)
