"""Cuenta y perfil personal en el navegador contra el servidor real (Colyseus + SQLite).
Dos «dispositivos» (contextos separados) usan la MISMA cuenta; la partida local del navegador
no se toca; los cambios de la aldea los valida el servidor; una expedición en solitario con la
cuenta guarda el progreso en el servidor; cerrar sesión en todos los dispositivos funciona."""
import asyncio, json, os, sys
from playwright.async_api import async_playwright
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from browser_common import Stack, watch_errors
R = []
def check(n, ok, info=''):
    R.append(bool(ok)); print(('PASS ' if ok else 'FAIL ') + n, json.dumps(info, ensure_ascii=False)[:360] if info != '' else '', flush=True)

PROFILE = "fetch(MysteryLobby.server + '/api/profile', { headers: { authorization: 'Bearer ' + JSON.parse(localStorage.getItem('ma-online-auth')).token } }).then(r => r.json())"

async def main():
    shots = os.environ.get('SHOT_DIR', '.')
    st = Stack(2870, 2871)
    try:
        async with async_playwright() as pw:
            b = await pw.chromium.launch(); errs = {}
            phone = await (await b.new_context(viewport={'width': 1100, 'height': 720})).new_page(); watch_errors(phone, errs, 'dispositivo 1')
            await phone.goto(st.url); await phone.wait_for_timeout(300)
            # Partida local de este navegador (sin conexión): Guerrero nivel 9 con 777 monedas
            await phone.evaluate("(()=>{ const s=Save.fresh('guerrero'); s.prog=Progress.fresh('guerrero',9); s.bank=777; Save.write(s); })()"); await phone.reload(); await phone.wait_for_timeout(300)
            await phone.evaluate("localStorage.setItem('ma-no-intro', '1')")      # la escena de llegada se prueba en browser_social_e2e.py
            await phone.click('#btn-online')
            await phone.click('#on-toreg'); await phone.fill('#on-ruser', 'lucia'); await phone.fill('#on-rpass', 'corta'); await phone.fill('#on-rpass2', 'corta'); await phone.click('#on-register'); await phone.wait_for_timeout(300)
            check('registro con contraseña débil: error comprensible', '8 caracteres' in await phone.inner_text('#online'))
            await phone.fill('#on-rpass', 'montaña-azul'); await phone.fill('#on-rpass2', 'montaña-azul'); await phone.fill('#on-rname', 'Lucía'); await phone.click('#on-register')
            await phone.wait_for_selector('.on-fresh[data-sp="arquero"]', timeout=8000)
            t = await phone.inner_text('#online')
            check('cuenta creada: «disponible en todos tus dispositivos» y se elige clase', 'todos tus dispositivos' in t and 'Elige tu clase' in t)
            await phone.click('.on-fresh[data-sp="arquero"]'); await phone.wait_for_selector('#on-profile-card')
            card = await phone.inner_text('#on-profile-card')
            check('ficha del perfil online: criatura, nivel, monedas, objetos, compañeros, misiones y movimientos', all(x in card for x in ['Arquero', 'Nv 1', 'monedas', 'objetos', 'compañeros', 'misiones', 'Habilidades']), card[:200])
            # Jugar en solitario con la cuenta: aldea con el perfil del servidor
            await phone.click('#on-solo'); await phone.wait_for_function("MysteryAction.account && MysteryAction.mode === 'village' && MysteryAction.state === 'play'", timeout=5000)
            r = await phone.evaluate("({sp: MysteryAction.save.species, lv: MysteryAction.save.prog.level, ro: Save.readOnly, local: JSON.parse(localStorage.getItem('mystery-action-save-v1')).data})")
            check('«Entrar en la aldea» entra en la aldea con el perfil online (no con la partida local)', r['sp'] == 'arquero' and r['lv'] == 1 and r['ro'] is True, {'sp': r['sp'], 'lv': r['lv']})
            # Cambios de la aldea validados por el servidor
            pre = await phone.evaluate(PROFILE)
            await phone.evaluate("MysteryAction.buyItem('pocion')"); await phone.wait_for_timeout(500)
            post = await phone.evaluate(PROFILE)
            check('progresión validada en el servidor: sin el Topo Mercader (Bosque sin completar) no se puede comprar', post['profile']['bank'] == pre['profile']['bank'] and post['version'] == pre['version'], {'antes': pre['profile']['bank'], 'después': post['profile']['bank']})
            # Como si hubiera completado el Bosque (lo siembra la prueba en la base de datos) y el juego recarga su copia
            me = await phone.evaluate("fetch(MysteryLobby.server + '/api/me', { headers: { authorization: 'Bearer ' + JSON.parse(localStorage.getItem('ma-online-auth')).token } }).then(r => r.json())")
            st.db_tool('patch', me['account']['id'], json.dumps({'cleared': ['bosque']}))
            await phone.evaluate(f"{PROFILE}.then(p => MysteryAction.account.adopt(p.profile, p.version))"); await phone.wait_for_timeout(200)
            srv0 = await phone.evaluate(PROFILE)
            await phone.evaluate("MysteryAction.buyItem('pocion')"); await phone.wait_for_timeout(500)
            srv1 = await phone.evaluate(PROFILE)
            pot = lambda p: sum(x['qty'] for x in p['profile']['inv'] if x['id'] == 'pocion')
            check('comprar en la aldea lo aplica el servidor (monedas e inventario en la base de datos)', srv1['profile']['bank'] == srv0['profile']['bank'] - 30 and pot(srv1) == pot(srv0) + 1 and srv1['version'] == srv0['version'] + 1, {'antes': srv0['profile']['bank'], 'después': srv1['profile']['bank']})
            # Manipular el juego desde la consola no cambia el perfil del servidor
            await phone.evaluate("(()=>{ const s=MysteryAction.save; s.bank=99999; s.prog.level=50; s.inv.push({uid:'x', id:'bayaAurea', qty:9}); })()")
            await phone.evaluate("MysteryAction.buyItem('manzana')"); await phone.wait_for_timeout(500)
            srv2 = await phone.evaluate(PROFILE); g2 = await phone.evaluate("({bank: MysteryAction.save.bank, lv: MysteryAction.save.prog.level, baya: MysteryAction.save.inv.some(x => x.id === 'bayaAurea')})")
            check('editar el perfil en el navegador no sirve: el servidor guarda lo correcto y el juego vuelve a su copia', srv2['profile']['bank'] == srv1['profile']['bank'] - 20 and srv2['profile']['prog']['level'] == 1 and not any(x['id'] == 'bayaAurea' for x in srv2['profile']['inv']) and g2['bank'] == srv2['profile']['bank'] and g2['lv'] == 1 and not g2['baya'], {'servidor': srv2['profile']['bank'], 'juego': g2})
            known = await phone.evaluate("MysteryAction.save.prog.known")
            await phone.evaluate(f"MysteryAction.account.op('setMoves', {{ equipped: {json.dumps(known[:2])} }})"); await phone.wait_for_timeout(400)
            check('cambiar los movimientos equipados se guarda en el servidor', (await phone.evaluate(PROFILE))['profile']['prog']['equipped'] == known[:2])
            r = await phone.evaluate("MysteryAction.account.op('buy', { id: 'manzanaDorada' })"); await phone.wait_for_timeout(200)
            check('una compra imposible se rechaza con mensaje y no cambia nada', r is False)
            # Expedición en solitario con la cuenta (sala de una plaza en el servidor) → retirada → guardado
            await phone.evaluate("MysteryAction.startDungeon('bosque')")
            await phone.wait_for_function("MysteryAction.net && MysteryAction.net.active && MysteryAction.mode === 'dungeon'", timeout=10000)
            check('la expedición en solitario con cuenta la simula el servidor (sin otros jugadores)', await phone.evaluate("MysteryAction.net.remotes.size === 0 && MysteryAction.net.enemies.size > 0"))
            await phone.screenshot(path=os.path.join(shots, 'account_solo_run.png'))
            await phone.evaluate("MysteryAction.endRun('faint')")
            await phone.wait_for_function("!document.getElementById('result').hidden", timeout=8000)
            lines = await phone.inner_text('#result')
            await phone.click('#btn-result'); await phone.wait_for_function("MysteryAction.mode === 'village'", timeout=5000)
            srv3 = await phone.evaluate(PROFILE)
            check('al terminar se guarda en la cuenta y se vuelve a la aldea online', srv3['profile']['runs'] == 1 and 'cuenta' in lines and await phone.evaluate("MysteryAction.save.runs === 1 && !!MysteryAction.account"), {'runs': srv3['profile']['runs']})
            local = await phone.evaluate("JSON.parse(localStorage.getItem('mystery-action-save-v1')).data")
            check('la partida local del navegador sigue intacta (Guerrero Nv 9, 777 monedas)', local['species'] == 'guerrero' and local['prog']['level'] == 9 and local['bank'] == 777)
            # Otro dispositivo: misma cuenta, mismo perfil
            pc = await (await b.new_context(viewport={'width': 1100, 'height': 720})).new_page(); watch_errors(pc, errs, 'dispositivo 2')
            await pc.goto(st.url); await pc.wait_for_timeout(300); await pc.click('#btn-online')
            await pc.fill('#on-user', 'LUCIA'); await pc.fill('#on-pass', 'mal'); await pc.click('#on-login'); await pc.wait_for_timeout(400)
            check('contraseña incorrecta: «Usuario o contraseña incorrectos»', 'incorrectos' in await pc.inner_text('#online'))
            await pc.fill('#on-pass', 'montaña-azul'); await pc.click('#on-login'); await pc.wait_for_selector('#on-profile-card', timeout=8000)
            p2 = await pc.evaluate(PROFILE)
            check('desde otro dispositivo se entra con usuario y contraseña y está el mismo perfil', p2['version'] == srv3['version'] and p2['profile']['bank'] == srv3['profile']['bank'] and p2['summary']['creature']['species'] == 'arquero', {'v': p2['version']})
            await pc.screenshot(path=os.path.join(shots, 'account_menu.png'))
            # Partida local desde el menú: vuelve la de este navegador
            await phone.keyboard.press('Escape'); await phone.wait_for_timeout(200)
            await phone.evaluate("MysteryAction.goTitle()"); await phone.wait_for_timeout(200)
            r = await phone.evaluate("({acc: !!MysteryAction.account, ro: Save.readOnly, sp: MysteryAction.save.species, lv: MysteryAction.save.prog.level})")
            check('al salir al título se recupera la partida local (sin conexión) y se puede guardar en ella', not r['acc'] and r['ro'] is False and r['sp'] == 'guerrero' and r['lv'] == 9, r)
            # Cerrar sesión en todos los dispositivos
            await pc.click('#on-logoutall'); await pc.wait_for_timeout(400)
            st1 = await phone.evaluate(f"{PROFILE.replace('.then(r => r.json())', '.then(r => r.status)')}")
            check('«cerrar sesión en todos los dispositivos» invalida la sesión del otro', st1 == 401, st1)
            for n, e in errs.items(): check(f'sin errores de JavaScript ({n})', not e, e[:3])
            await b.close()
    finally:
        st.close()
    print(f'{sum(R)}/{len(R)} correctas'); return all(R)
if __name__ == '__main__': sys.exit(0 if asyncio.run(main()) else 1)
