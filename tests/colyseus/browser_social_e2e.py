"""Juego siempre online, amigos, grupo persistente, aldea compartida, chat y mazmorra en grupo, con TRES navegadores
contra el servidor real (Colyseus + SQLite). Todo por la interfaz (botones, teclas y formularios):
 - «Jugar» → cuenta → clase → directamente a la aldea; sin botones de partida local (solo con ?local=1).
 - Beto añade a Ana con su código; Ana acepta; ven su estado («En la aldea»).
 - Ana invita a Beto al grupo; Beto acepta. En la aldea se ven moverse; Cris (no es su amigo) no ve a nadie.
 - Chat (tecla T) filtrado: llega a Beto con el insulto tapado y como bocadillo; no a Cris.
 - Beto (no líder) en la puerta de una mazmorra: no puede ir solo. Ana elige la mazmorra → entran los dos
   en la MISMA expedición; al volver, siguen en grupo y se vuelven a ver en la aldea.
 - Bloquear: Ana bloquea a Cris (que le había enviado solicitud) y Cris ya no puede volver a enviarla."""
import asyncio, json, os, sys
from playwright.async_api import async_playwright
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from browser_common import Stack, watch_errors
R = []
def check(n, ok, info=''):
    R.append(bool(ok)); print(('PASS ' if ok else 'FAIL ') + n, json.dumps(info, ensure_ascii=False)[:420] if info != '' else '', flush=True)
WHERE = "(() => { const G = MysteryAction; return { state: G.state, mode: G.mode, net: !!(G.net && G.net.active), floor: G.floorRT ? G.floorRT.label : null, account: !!G.account } })()"
REMOTES = "(() => { const G = MysteryAction; return G.actors.filter(a => a.hubId).map(a => ({ name: a.nameTag, x: Math.round(a.x), y: Math.round(a.y), chat: a.chatText || '' })) })()"

async def main():
    shots = os.environ.get('SHOT_DIR', '.')
    st = Stack(2900, 2901, reconnect=60)
    try:
        async with async_playwright() as pw:
            b = await pw.chromium.launch(); errs = {}
            async def open_player(name, cls):
                ctx = await b.new_context(viewport={'width': 1200, 'height': 760}); pg = await ctx.new_page(); watch_errors(pg, errs, name)
                await pg.goto(st.url); await pg.wait_for_timeout(400)
                return pg
            A, B, C = await asyncio.gather(open_player('Ana', 'guerrero'), open_player('Beto', 'mago'), open_player('Cris', 'arquero'))
            pages = {'Ana': A, 'Beto': B, 'Cris': C}
            vis = await A.evaluate("({ cont: getComputedStyle(document.getElementById('btn-continue')).display, start: getComputedStyle(document.getElementById('btn-start')).display, play: !!document.getElementById('btn-play') })")
            check('siempre online: en el título solo «Jugar» (sin «Continuar» ni «Nueva partida» locales)', vis['cont'] == 'none' and vis['start'] == 'none' and vis['play'], vis)
            # Entrar: Jugar → invitado → clase → aldea
            for (name, cls) in [('Ana', 'guerrero'), ('Beto', 'mago'), ('Cris', 'arquero')]:
                pg = pages[name]
                await pg.click('#btn-play'); await pg.wait_for_selector('#online:not([hidden])')
                local = await pg.evaluate("!!document.getElementById('on-local')")
                await pg.click('.on-tab[data-tab="guest"]')
                if name == 'Ana':
                    note = await pg.inner_text('#on-secure')
                    await pg.click('.on-tab[data-tab="register"]'); note2 = await pg.inner_text('#on-secure')
                    await pg.screenshot(path=os.path.join(shots, 'social_aviso_cifrado.png'))
                    check('al crear cuenta se avisa del cifrado (contraseña irreversible, usuario y nombre cifrados, estado de la conexión)', all(k in note2 for k in ['contraseña nunca se guarda', 'cifrados', 'AES-256', 'tu propio ordenador']) and note == note2, note2)
                    await pg.click('.on-tab[data-tab="guest"]')
                await pg.fill('#on-name', name); await pg.click('#on-guest')
                await pg.wait_for_selector(f'.on-fresh[data-sp="{cls}"]', timeout=8000); await pg.click(f'.on-fresh[data-sp="{cls}"]')
                await pg.wait_for_function("MysteryAction.state === 'play' && MysteryAction.mode === 'village' && !!MysteryAction.account", timeout=8000)
                await pg.wait_for_selector('#social-btn:not([hidden])', timeout=6000)
                if name == 'Ana': check('sin botón de partida local en el menú de cuenta', not local)
            check('los tres entran directamente en la aldea con su cuenta (perfil del servidor)', all([(await pages[n].evaluate(WHERE))['mode'] == 'village' for n in pages]))
            await A.wait_for_function("MysteryLobby.hub && MysteryLobby.hub.status === 'online'", timeout=6000)

            # --- Amigos: Beto añade a Ana con su código
            await A.click('#view'); await A.keyboard.press('o'); await A.wait_for_selector('#social:not([hidden])')
            code = await A.inner_text('#s-mycode')
            check('Ana ve su código de amigo («Ana#XXXXXX»)', code.startswith('Ana#') and len(code) == 10, code)
            await B.click('#view'); await B.keyboard.press('o'); await B.wait_for_selector('#social:not([hidden])')
            await B.fill('#s-addcode', code); await B.click('#s-addbtn')
            await B.wait_for_function("document.querySelector('#social .on-msg.good') && /Solicitud enviada a Ana/.test(document.querySelector('#social .on-msg.good').textContent)", timeout=5000)
            await A.wait_for_selector('li[data-req="Beto"] .s-acc', timeout=5000)
            await A.screenshot(path=os.path.join(shots, 'social_solicitud.png'))
            await A.click('li[data-req="Beto"] .s-acc')
            await A.wait_for_selector('#s-friends li[data-friend="Beto"]', timeout=5000)
            await B.wait_for_selector('#s-friends li[data-friend="Ana"]', timeout=5000)
            stA = await A.inner_text('#s-friends li[data-friend="Beto"]')
            check('amigos al aceptar; Ana ve que Beto está «En la aldea»', 'En la aldea' in stA, stA)
            # Cris también pide amistad a Ana (luego Ana le bloqueará)
            await C.click('#view'); await C.keyboard.press('o'); await C.wait_for_selector('#social:not([hidden])')
            await C.fill('#s-addcode', code); await C.click('#s-addbtn')
            await A.wait_for_selector('li[data-req="Cris"]', timeout=5000)

            # --- Grupo: Ana invita a Beto
            await A.click('#s-friends li[data-friend="Beto"] .s-inv')
            await B.wait_for_function("MysteryLobby.hub.invites.length === 1", timeout=5000)
            await B.click('[data-stab="party"]'); await B.wait_for_selector('.s-invite[data-invite="Ana"] .s-join')
            await B.click('.s-invite[data-invite="Ana"] .s-join')
            await A.wait_for_function("MysteryLobby.hub.party && MysteryLobby.hub.party.members.length === 2", timeout=5000)
            await B.wait_for_selector('#s-party li[data-member="Ana"]', timeout=5000)
            lead = await B.inner_text('#s-party li[data-member="Ana"]')
            check('Beto se une al grupo; Ana es la líder', 'líder' in lead, lead)
            for pg in (A, B, C): await pg.keyboard.press('Escape')
            await A.wait_for_timeout(300)

            # --- Aldea compartida: se ven moverse; Cris no ve a nadie
            await A.wait_for_function("MysteryAction.actors.some(a => a.hubId && a.nameTag === 'Beto')", timeout=5000)
            await B.wait_for_function("MysteryAction.actors.some(a => a.hubId && a.nameTag === 'Ana')", timeout=5000)
            r0 = await B.evaluate(REMOTES)
            await A.click('#view'); await A.keyboard.down('ArrowRight'); await A.wait_for_timeout(900); await A.keyboard.up('ArrowRight'); await A.wait_for_timeout(500)
            r1 = await B.evaluate(REMOTES); me = await A.evaluate("({ x: Math.round(MysteryAction.player.x), y: Math.round(MysteryAction.player.y) })")
            ana0, ana1 = next(x for x in r0 if x['name'] == 'Ana'), next(x for x in r1 if x['name'] == 'Ana')
            check('Beto ve a Ana moverse en su aldea (donde está de verdad)', ana1['x'] - ana0['x'] > 40 and abs(ana1['x'] - me['x']) < 16 and abs(ana1['y'] - me['y']) < 16, [ana0, ana1, me])
            rc = await C.evaluate(REMOTES)
            check('Cris (no está en su grupo) no ve a nadie en su aldea', rc == [], rc)
            srv = st.ctl('hub')
            check('el servidor: un grupo Ana+Beto y los tres conectados «en la aldea»', srv['parties'] == [{'leader': 'Ana', 'members': ['Ana', 'Beto']}] and sorted(o['name'] for o in srv['online'] if o['where'] == 'village') == ['Ana', 'Beto', 'Cris'], srv)
            await B.screenshot(path=os.path.join(shots, 'social_aldea.png'))

            # --- Chat con T: filtrado, en el chat de Beto y como bocadillo sobre Ana; Cris no lo recibe
            await A.click('#view'); await A.keyboard.press('t'); await A.wait_for_selector('#chat-line:not([hidden])')
            await A.keyboard.type('hola beto, no seas idiota')
            typed = await A.input_value('#chat-input')
            check('lo escrito llega entero al cuadro del chat', typed == 'hola beto, no seas idiota', typed)
            await A.keyboard.press('Enter')
            await B.wait_for_function("document.getElementById('chat-feed') && /Ana:/.test(document.getElementById('chat-feed').textContent)", timeout=5000)
            feed = await B.inner_text('#chat-feed'); bub = next(x for x in await B.evaluate(REMOTES) if x['name'] == 'Ana')['chat']
            check('chat del grupo: a Beto le llega con el insulto tapado, también como bocadillo', 'hola beto, no seas ******' in feed and bub == 'hola beto, no seas ******', [feed, bub])
            await B.screenshot(path=os.path.join(shots, 'social_chat.png'))
            cfeed = await C.evaluate("MysteryLobby.hub.chat.length")
            check('Cris no recibe el chat del grupo', cfeed == 0, cfeed)
            # Escribir en el chat no mueve al personaje
            p0 = await A.evaluate("Math.round(MysteryAction.player.x)")
            await A.keyboard.press('t'); await A.keyboard.type('dddddd'); await A.keyboard.press('Escape'); await A.wait_for_timeout(200)
            p1 = await A.evaluate("Math.round(MysteryAction.player.x)")
            check('las teclas escritas en el chat no llegan al juego', p0 == p1, [p0, p1])

            # --- Bloquear: Ana bloquea a Cris; Cris ya no puede volver a pedirle amistad
            await A.keyboard.press('o'); await A.wait_for_selector('#social:not([hidden])', timeout=3000); await A.click('[data-stab="friends"]')
            await A.click('li[data-req="Cris"] .s-block'); await A.click('#s-yes')
            await A.wait_for_function("MysteryLobby.hub.blocked.some(x => x.name === 'Cris')", timeout=5000)
            await C.click('#view'); await C.keyboard.press('o'); await C.wait_for_selector('#social:not([hidden])')
            await C.fill('#s-addcode', code); await C.click('#s-addbtn')
            await C.wait_for_selector('#social .on-msg.bad', timeout=5000)
            msg = await C.inner_text('#social .on-msg.bad')
            check('Cris, bloqueado, recibe el mismo mensaje que con un código inexistente', 'No hay nadie con ese código' in msg, msg)
            await A.keyboard.press('Escape'); await C.keyboard.press('Escape')

            # --- La puerta de la mazmorra: Beto (no líder) no puede ir solo
            await B.evaluate("MysteryAction.startDungeon('bosque')"); await B.wait_for_timeout(400)
            wb = await B.evaluate(WHERE)
            check('en grupo, quien no es líder no entra solo por la puerta (se le explica)', wb['mode'] == 'village' and not wb['net'], wb)
            # --- Ana elige la mazmorra en el panel → entran los dos en la misma expedición
            await A.click('#view'); await A.keyboard.press('o'); await A.click('[data-stab="party"]')
            await A.select_option('#s-dng', 'bosque'); await A.click('#s-gobtn')
            await asyncio.gather(*[p.wait_for_function("MysteryAction.net && MysteryAction.net.active && MysteryAction.floorRT && MysteryAction.net.remotes.size === 1", timeout=12000) for p in (A, B)])
            wa, wb = await A.evaluate(WHERE), await B.evaluate(WHERE)
            state = st.ctl('state')
            check('los dos entran juntos en la MISMA expedición del servidor (Ana es la anfitriona)', wa['floor'] == wb['floor'] and len(state['players']) == 2 and state['state']['phase'] == 'playing', {'a': wa, 'b': wb, 'players': [p['name'] for p in state['players']]})
            await A.screenshot(path=os.path.join(shots, 'social_mazmorra.png'))
            await A.wait_for_timeout(1500)
            hubv = st.ctl('hub')
            check('mientras tanto su estado es «en una mazmorra»', all(o['where'] == 'dungeon' for o in hubv['online'] if o['name'] in ('Ana', 'Beto')), hubv['online'])
            # --- Vuelven: siguen en grupo y se ven otra vez en la aldea
            st.ctl('finish', result='return')
            for p in (A, B):
                await p.wait_for_selector('#btn-result:visible', timeout=10000); await p.wait_for_timeout(300); await p.click('#btn-result')
            await asyncio.gather(*[p.wait_for_function("MysteryAction.mode === 'village' && MysteryAction.state === 'play'", timeout=8000) for p in (A, B)])
            await A.wait_for_function("MysteryAction.actors.some(a => a.hubId && a.nameTag === 'Beto')", timeout=6000)
            party = await B.evaluate("MysteryLobby.hub.party && MysteryLobby.hub.party.members.map(m => m.name).sort()")
            check('al volver siguen en el grupo y se ven en la aldea', party == ['Ana', 'Beto'], party)
            await A.screenshot(path=os.path.join(shots, 'social_vuelta.png'))
            for n, e in errs.items(): check(f'sin errores de JavaScript ({n})', not e, e[:5])
            await b.close()
    finally:
        st.close()
    print(f'{sum(R)}/{len(R)} correctas', flush=True)
    sys.exit(0 if all(R) else 1)

asyncio.run(main())
