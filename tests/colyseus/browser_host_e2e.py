"""Flujo de anfitrión y amigos en dos navegadores reales contra el servidor Colyseus independiente:
el anfitrión elige su criatura, crea la partida privada y comparte el ENLACE de invitación; el amigo
lo abre, entra con SU criatura y pulsa «Unirse a partida»; el anfitrión cambia las opciones de
expedición y CEDE el liderazgo; el nuevo anfitrión inicia; los dos ven moverse al otro en la misma
sala. El navegador del anfitrión no aloja nada: la sala vive en el servidor."""
import asyncio, json, os, re, sys
from playwright.async_api import async_playwright
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from browser_common import Stack, watch_errors
R = []
def check(n, ok, info=''):
    R.append(bool(ok)); print(('PASS ' if ok else 'FAIL ') + n, json.dumps(info, ensure_ascii=False)[:300] if info != '' else '', flush=True)

async def main():
    shots = os.environ.get('SHOT_DIR', '.')
    st = Stack(2880, 2881)
    try:
        async with async_playwright() as pw:
            b = await pw.chromium.launch()
            errs = {}
            async def login(pg, name, species):
                await pg.click('.on-tab[data-tab="guest"]'); await pg.fill('#on-name', name); await pg.click('#on-guest')
                await pg.wait_for_selector(f'.on-fresh[data-sp="{species}"]', timeout=8000); await pg.click(f'.on-fresh[data-sp="{species}"]')
                await pg.wait_for_selector('#on-profile-card', timeout=5000)
            # --- Anfitriona: abre el juego, elige su criatura y crea la partida privada
            ca = await b.new_context(viewport={'width': 1100, 'height': 720}); await ca.grant_permissions(['clipboard-read', 'clipboard-write'], origin=st.url.rstrip('/'))
            A = await ca.new_page(); watch_errors(A, errs, 'Ana')
            await A.goto(st.url); await A.wait_for_timeout(300); await A.click('#btn-online'); await login(A, 'Ana', 'arquero')
            await A.click('#on-create'); await A.wait_for_function("/^[A-Z2-9]{6}$/.test((document.querySelector('#on-code-val')||{}).textContent||'')", timeout=8000)
            code = await A.inner_text('#on-code-val')
            room_srv = await A.evaluate("MysteryLobby.session.room.roomId")
            check('la sala la crea el servidor (Colyseus) con un código de invitación', bool(re.fullmatch(r'[A-Z2-9]{6}', code)) and bool(room_srv), {'code': code})
            await A.click('#on-invite'); await A.wait_for_timeout(300)
            link = await A.evaluate("navigator.clipboard.readText()")
            check('«copiar enlace de invitación» da la dirección del juego con el código', link.endswith(f'?sala={code}'), link)
            # --- Amigo: abre el enlace, entra con su criatura y se une
            cb = await b.new_context(viewport={'width': 1100, 'height': 720}); B = await cb.new_page(); watch_errors(B, errs, 'Beto')
            await B.goto(link); await B.wait_for_timeout(800)
            t = await B.inner_text('#online')
            check('el enlace abre el menú cooperativo y explica la invitación', not await B.evaluate("document.querySelector('#online').hidden") and code in t and 'Unirse a partida' in t, t[:160])
            await login(B, 'Beto', 'mago')
            prefilled = await B.input_value('#on-code')
            check('el código ya está escrito en «Unirse a partida»', prefilled == code, prefilled)
            await B.click('#on-join')
            await asyncio.gather(*[p.wait_for_function("document.querySelectorAll('.on-players li[data-player]').length === 2", timeout=8000) for p in (A, B)])
            check('tras unirse, el enlace de invitación desaparece de la barra de direcciones', '?sala=' not in B.url, B.url)
            views = await asyncio.gather(*[p.evaluate("[...document.querySelectorAll('.on-players li[data-player]')].map(li => li.innerText.replace(/\\s+/g, ' '))") for p in (A, B)])
            check('los dos ven a los dos con su nombre, su clase y quién es el anfitrión', all(any('Ana' in x and 'Arquero' in x and 'anfitrión' in x for x in v) and any('Beto' in x and 'Mago' in x for x in v) for v in views), views[1])
            # --- Opciones de expedición: solo el anfitrión
            check('solo el anfitrión ve las opciones de expedición', await A.is_visible('#on-gdng') and await A.is_visible('#on-grec') and not await B.is_visible('#on-gdng') and not await B.is_visible('#on-grec'))
            await B.click('#on-ready'); await A.wait_for_function("!document.querySelector('#on-start').disabled", timeout=5000)
            await A.select_option('#on-grec', '120')
            await B.wait_for_function("document.querySelector('#on-hostrule') && document.querySelector('#on-hostrule').innerText.includes('120 s')", timeout=5000)
            ready_after = await B.inner_text('#on-ready')
            check('el anfitrión cambia el tiempo de reconexión: el amigo lo ve y debe confirmar de nuevo', ready_after == 'Estoy listo', ready_after)
            # --- Ceder el liderazgo
            await A.click('.on-give'); await B.wait_for_selector('#on-start', timeout=5000); await A.wait_for_selector('#on-ready', timeout=5000)
            msgB = await B.inner_text('#online')
            check('el anfitrión cede el liderazgo: el amigo pasa a anfitrión (y lo ve en el menú)', 'Ahora eres el anfitrión' in msgB and await B.is_visible('#on-gdng'), msgB[:200])
            await A.click('#on-ready'); await B.wait_for_function("!document.querySelector('#on-start').disabled", timeout=5000)
            await B.screenshot(path=os.path.join(shots, 'host_lobby.png'))
            await B.click('#on-start')
            await asyncio.gather(*[p.wait_for_function("MysteryAction.net && MysteryAction.net.active && MysteryAction.net.remotes.size === 1", timeout=10000) for p in (A, B)])
            mine = await asyncio.gather(*[p.evaluate("MysteryAction.player.sp.id") for p in (A, B)])
            check('cada uno juega con su propio Pokémon (no el del anfitrión)', mine == ['arquero', 'mago'], mine)
            # --- Los dos se mueven a la vez y cada uno ve moverse al otro
            async def remote(p): return await p.evaluate("(() => { const r = [...MysteryAction.net.remotes.values()][0]; return [r.x, r.y, r.sp.id]; })()")
            before = await asyncio.gather(remote(A), remote(B))
            for p in (A, B): await p.click('#view')
            moved = [False, False]
            for keys in [('ArrowRight', 'ArrowLeft'), ('ArrowDown', 'ArrowUp'), ('ArrowLeft', 'ArrowRight')]:
                await asyncio.gather(A.keyboard.down(keys[0]), B.keyboard.down(keys[1])); await A.wait_for_timeout(600)
                await asyncio.gather(A.keyboard.up(keys[0]), B.keyboard.up(keys[1])); await A.wait_for_timeout(400)
                after = await asyncio.gather(remote(A), remote(B))
                moved = [abs(after[i][0] - before[i][0]) + abs(after[i][1] - before[i][1]) > 8 for i in range(2)]
                if all(moved): break
            check('Ana ve moverse al Mago de Beto y Beto ve moverse al Arquero de Ana, en la misma sala', all(moved) and before[0][2] == 'mago' and before[1][2] == 'arquero', {'movido': moved})
            await A.screenshot(path=os.path.join(shots, 'host_play_ana.png')); await B.screenshot(path=os.path.join(shots, 'host_play_beto.png'))
            for n, e in errs.items(): check(f'sin errores de JavaScript ({n})', not e, e[:3])
            await b.close()
    finally:
        st.close()
    print(f'{sum(R)}/{len(R)} correctas'); return all(R)
if __name__ == '__main__': sys.exit(0 if asyncio.run(main()) else 1)
