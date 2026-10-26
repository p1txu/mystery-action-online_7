"""Combate en tiempo real con cuatro navegadores (cuatro jugadores, cada uno con su cuenta y su
partida) contra el servidor real de Colyseus. Los cuatro juegan con el teclado a la vez (moverse,
ataque básico con Espacio, movimiento con Q) contra enemigos del servidor y se comprueba que todos
ven el mismo mundo: posiciones, PS de los enemigos, muertes, ataques, puerta de la cámara del tesoro
y estado del guardián. También cambios de conexión: corte de red con reconexión automática, vuelta
desde OTRO dispositivo con la misma cuenta (mismo asiento) y salida de la anfitriona.
La preparación del escenario (piso con puerta, enemigos alrededor, jugadores resistentes) usa las
rutas /__test/ del servidor de pruebas (tests/colyseus/serve-for-browser.mjs)."""
import asyncio, json, os, sys, time
from playwright.async_api import async_playwright
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from browser_common import Stack, watch_errors
R = []
def check(n, ok, info=''):
    R.append(bool(ok)); print(('PASS ' if ok else 'FAIL ') + n, json.dumps(info, ensure_ascii=False)[:420] if info != '' else '', flush=True)

SNAP = """(() => { const G = MysteryAction, N = G.net, f = G.floorRT; if (!N || !f) return null;
  return { me: N.me, floorN: N.floorN, last: N.lastState, pos: [G.player.x, G.player.y],
    enemies: Object.fromEntries([...N.enemies].map(([id, e]) => [id, { hp: e.hp, x: e.x, y: e.y }])),
    drawn: G.actors.filter(a => a instanceof MysteryNet.NetEnemy && a.alive).map(a => a.netId).sort(),
    remotes: Object.fromEntries([...N.remotes].map(([id, r]) => [id, { x: r.x, y: r.y, hp: r.hp, alive: r.alive, conn: r.netConnected, hold: r.netHold || 0 }])),
    creatures: G.actors.filter(a => a === G.player || a.netRemote).length,
    aids: [...N.seenAid], dupAid: N.stats.dupAid || 0,
    doors: f.doors.map(d => ({ open: d.open, tile: G.world.tiles[d.tiles[0]] })), keys: G.player.bag.count('llave'),
    boss: f.boss ? { id: f.boss.netId, hp: f.boss.hp, phase: f.boss.netPhase || 1 } : null };
})()"""

def diff(a, b, path='', out=None):
    out = [] if out is None else out
    if isinstance(b, bool) or b is None or isinstance(b, str):
        if a != b: out.append(f'{path}: {a!r} != {b!r}')
    elif isinstance(b, (int, float)):
        if not isinstance(a, (int, float)) or abs(a - b) > 0.06 + abs(b) * 1e-6: out.append(f'{path}: {a!r} != {b!r}')
    elif isinstance(b, dict):
        if not isinstance(a, dict): out.append(f'{path}: falta'); return out
        for k in set(a) | set(b):
            if k not in b: out.append(f'{path}.{k}: sobra')
            elif k not in a: out.append(f'{path}.{k}: falta')
            else: diff(a[k], b[k], f'{path}.{k}', out)
    elif isinstance(b, list):
        if not isinstance(a, list) or len(a) != len(b): out.append(f'{path}: longitud'); return out
        for i, (x, y) in enumerate(zip(a, b)): diff(x, y, f'{path}[{i}]', out)
    return out

async def main():
    shots = os.environ.get('SHOT_DIR', '.')
    st = Stack(2870, 2871, reconnect=60)
    try:
        async with async_playwright() as pw:
            b = await pw.chromium.launch()
            people = [('Ana', 'guerrero'), ('Beto', 'mago'), ('Carla', 'arquero'), ('Dani', 'guerrero')]
            errs = {}
            async def open_player(name, species, auth=None):
                ctx = await b.new_context(viewport={'width': 1100, 'height': 720}); pg = await ctx.new_page(); watch_errors(pg, errs, name + (' (2.º disp.)' if auth else ''))
                if auth: await ctx.add_init_script(f"localStorage.setItem('ma-online-auth', {json.dumps(auth)})")
                await pg.goto(st.url); await pg.wait_for_timeout(300)
                if auth: return ctx, pg
                await pg.evaluate("n => MysteryLobby.devGuest(n)", name)
                await pg.wait_for_selector(f'.on-fresh[data-sp="{species}"]', timeout=8000); await pg.click(f'.on-fresh[data-sp="{species}"]')
                await pg.wait_for_selector('#on-profile-card', timeout=5000)
                return ctx, pg
            made = await asyncio.gather(*[open_player(*p) for p in people])
            ctxs = [m[0] for m in made]; pages = [m[1] for m in made]; A, B, Cc, D = pages
            await A.click('#on-create'); await A.wait_for_function("/^[A-Z2-9]{6}$/.test((document.querySelector('#on-code-val')||{}).textContent||'')", timeout=8000)
            code = await A.inner_text('#on-code-val')
            for p in (B, Cc, D): await p.fill('#on-code', code); await p.click('#on-join'); await p.wait_for_selector('#on-ready', timeout=8000)
            await asyncio.gather(*[p.wait_for_function("document.querySelectorAll('.on-players li[data-player]').length === 4", timeout=10000) for p in pages])
            rule = await B.inner_text('#on-hostrule')
            check('la sala de espera explica la regla de liderazgo y el tiempo que se guarda el sitio', 'abandona' in rule and 'ceder el liderazgo' in rule and '60 s' in rule, rule)
            for p in (B, Cc, D): await p.click('#on-ready')
            await A.wait_for_function("!document.querySelector('#on-start').disabled", timeout=6000); await A.click('#on-start')
            await asyncio.gather(*[p.wait_for_function("MysteryAction.net && MysteryAction.net.active && MysteryAction.net.remotes.size === 3", timeout=10000) for p in pages])

            # --- Escenario: piso con cámara del tesoro y enemigos alrededor de la entrada
            arena = st.ctl('arena', enemies=6, hp=60)
            srv = st.ctl('state')
            await asyncio.gather(*[p.wait_for_function(f"MysteryAction.net && MysteryAction.net.floorN === {srv['state']['floorN']} && MysteryAction.net.enemies.size >= 5", timeout=8000) for p in pages])
            snaps = await asyncio.gather(*[p.evaluate(SNAP) for p in pages])
            check('los cuatro regeneran la misma mazmorra (misma semilla del servidor) con la puerta cerrada', arena['doors'] >= 1 and all(s['doors'] and not s['doors'][0]['open'] for s in snaps), arena)

            # --- Combate simultáneo con el teclado
            for p in pages: await p.click('#view')
            keys = ['ArrowRight', 'ArrowLeft', 'ArrowDown', 'ArrowUp']
            async def fight(p, k):
                await p.keyboard.down('Space')
                for i in range(10):
                    await p.keyboard.down(k); await p.wait_for_timeout(180); await p.keyboard.up(k)
                    if i % 3 == 0: await p.keyboard.press('KeyQ')
                    await p.wait_for_timeout(320)
                await p.keyboard.up('Space')
            await asyncio.gather(*[fight(p, k) for p, k in zip(pages, keys)])
            await A.screenshot(path=os.path.join(shots, 'combat_play.png'))

            async def compare(label, plist):
                st.ctl('freeze', on=True); await plist[0].wait_for_timeout(900)
                srv = st.ctl('state'); snaps = await asyncio.gather(*[p.evaluate(SNAP) for p in plist])
                server_state = srv['state']
                dstate = [diff(s['last'], server_state) for s in snaps]
                check(f'{label}: el estado sincronizado de cada navegador es idéntico al del servidor', all(not d for d in dstate), [d[:4] for d in dstate if d])
                sids = sorted(server_state['enemies'])
                check(f'{label}: todos dibujan exactamente los enemigos vivos del servidor', all(s['drawn'] == sids for s in snaps), {'srv': len(sids), 'cli': [len(s['drawn']) for s in snaps]})
                hp_ok = all(all(abs(s['enemies'][i]['hp'] - server_state['enemies'][i]['hp']) < .5 for i in sids) for s in snaps)
                check(f'{label}: mismas barras de vida de los enemigos en todos', hp_ok)
                pos_ok, worst = True, 0
                for s in snaps:
                    for sid, pl in server_state['players'].items():
                        if sid == s['me']: d = abs(s['pos'][0] - pl['x']) + abs(s['pos'][1] - pl['y']); tol = 4
                        else: r = s['remotes'].get(sid); d = abs(r['x'] - pl['x']) + abs(r['y'] - pl['y']) if r else 999; tol = 1
                        worst = max(worst, d); pos_ok = pos_ok and d <= tol
                        if d > tol: print('  desvío', label, 'yo' if sid == s['me'] else 'otro', round(d, 2), flush=True)
                check(f'{label}: cada uno ve a los demás (interpolados) y a sí mismo (predicción corregida) donde dice el servidor', pos_ok, {'peor': round(worst, 2)})
                if not all(s['creatures'] == len(server_state['players']) for s in snaps): print('  diag', json.dumps({'srv': {k: [v.get('hp'), v.get('downed'), v.get('connected')] for k, v in server_state['players'].items()}, 'cli': [{'me': s['me'], 'rem': {k: [r['hp'], r['alive'], r['conn']] for k, r in s['remotes'].items()}} for s in snaps]})[:1500], flush=True)
                check(f'{label}: cuatro criaturas en pantalla en cada navegador (ninguna duplicada)', all(s['creatures'] == len(server_state['players']) for s in snaps), [s['creatures'] for s in snaps])
                return srv, snaps

            srv, snaps = await compare('combate', pages)
            check('el servidor aceptó ataques de los cuatro jugadores', all(p['casts'] > 0 for p in srv['players']), [(p['name'], p['casts']) for p in srv['players']])
            check('hay enemigos derrotados por el servidor y ninguno muere dos veces', len(srv['kills']) >= 1 and len(set(srv['kills'])) == len(srv['kills']), srv['kills'])
            aset = set(srv['aids'])
            check('los cuatro han recibido exactamente los mismos ataques (jugadores y enemigos) y ninguno dos veces',
                  all(set(s['aids']) == aset and s['dupAid'] == 0 for s in snaps), {'srv': len(aset), 'cli': [len(s['aids']) for s in snaps], 'soloCli': sorted(set().union(*[set(s['aids']) - aset for s in snaps])), 'soloSrv': sorted(set().union(*[aset - set(s['aids']) for s in snaps]))})
            st.ctl('freeze', on=False)

            # --- Puerta con llave: la abre Ana y la ven abierta los cuatro
            st.ctl('door', name='Ana')
            t0 = time.time()
            while not st.ctl('state')['doorsAt'][0]['open'] and time.time() - t0 < 5: await A.wait_for_timeout(100)
            await asyncio.gather(*[p.wait_for_function("MysteryAction.floorRT.doors[0].open", timeout=5000) for p in pages])
            srv = st.ctl('state'); snaps = await asyncio.gather(*[p.evaluate(SNAP) for p in pages])
            tile = srv['doorsAt'][0]['tile']
            check('la puerta se abre en el servidor y en los cuatro navegadores (mismas casillas)', srv['doorsAt'][0]['open'] and all(s['doors'][0]['open'] and s['doors'][0]['tile'] == tile for s in snaps), tile)
            ana = next(p for p in srv['players'] if p['name'] == 'Ana')
            check('se gasta la llave de quien abre (servidor y su pantalla)', ana['keys'] == 0 and snaps[0]['keys'] == 0)

            # --- Corte de red de Carla: los demás la ven sin conexión con la cuenta atrás; su SDK vuelve solo
            await ctxs[2].set_offline(True)
            await A.wait_for_function("[...MysteryAction.net.remotes.values()].some(r => r.nameTag === 'Carla' && !r.netConnected && r.netHold > Date.now())", timeout=30000)
            check('al cortarse la red de Carla, los demás la ven «sin conexión» con el tiempo que se le guarda el sitio', True)
            await ctxs[2].set_offline(False)
            await Cc.wait_for_function("MysteryLobby.session && MysteryLobby.session.status === 'playing' && MysteryAction.net.connected", timeout=45000)
            await A.wait_for_function("[...MysteryAction.net.remotes.values()].some(r => r.nameTag === 'Carla' && r.netConnected)", timeout=8000)
            srv, snaps = await compare('tras reconectar Carla', pages)
            check('la mazmorra no se reinicia por la desconexión', srv['state']['floorN'] == snaps[0]['floorN'] and srv['doorsAt'][0]['open'])
            st.ctl('freeze', on=False)

            # --- Dani pierde la conexión y vuelve desde OTRO dispositivo con su cuenta
            d_auth = await D.evaluate("localStorage.getItem('ma-online-auth')"); d_sid = (await D.evaluate(SNAP))['me']
            await D.evaluate("MysteryLobby.session.room.reconnection.maxRetries = 0")
            await ctxs[3].set_offline(True)
            await A.wait_for_function("[...MysteryAction.net.remotes.values()].some(r => r.nameTag === 'Dani' && !r.netConnected)", timeout=30000)
            ctxD2, D2 = await open_player('Dani', 'guerrero', auth=d_auth)
            # Siempre online: con la sesión guardada el juego se conecta al abrirse y vuelve solo al grupo; si no, desde el menú
            await D2.wait_for_timeout(1500)
            if await D2.is_visible('#btn-online'): await D2.click('#btn-online')
            await D2.wait_for_function("MysteryAction.net && MysteryAction.net.active && MysteryAction.net.remotes.size === 3", timeout=15000)
            s2 = await D2.evaluate(SNAP); srv = st.ctl('state')
            check('Dani vuelve desde otro dispositivo al MISMO asiento (mismo sessionId), sin duplicar su criatura',
                  s2['me'] == d_sid and len(srv['state']['players']) == 4 and srv['actorsPlayers'] == 4 and srv['clients'] == 4, {'me': s2['me'], 'old': d_sid, 'srv': srv['actorsPlayers']})
            await D2.click('#view'); before = next(p for p in st.ctl('state')['players'] if p['sid'] == d_sid); after = before
            for k in ['ArrowLeft', 'ArrowRight', 'ArrowDown', 'ArrowUp']:    # puede estar contra un muro: se prueban varias direcciones
                await D2.keyboard.down(k); await D2.wait_for_timeout(500); await D2.keyboard.up(k); await D2.wait_for_timeout(250)
                after = next(p for p in st.ctl('state')['players'] if p['sid'] == d_sid)
                if abs(after['x'] - before['x']) + abs(after['y'] - before['y']) > 8: break
            dbg = await D2.evaluate("({seq: MysteryAction.net.seq, sent: MysteryAction.net.stats.sent, active: MysteryAction.net.active, conn: MysteryAction.net.connected, state: MysteryAction.state, focus: document.activeElement && document.activeElement.id, online: !document.querySelector('#online').hidden})")
            check('desde el nuevo dispositivo su entrada mueve a su criatura en el servidor', abs(after['x'] - before['x']) + abs(after['y'] - before['y']) > 8, [before, after, dbg])
            live = [A, B, Cc, D2]
            srv, snaps = await compare('con Dani en el otro dispositivo', live)
            st.ctl('freeze', on=False)

            # --- Dones: al bajar, el servidor ofrece 1 de 3 a cada uno; cada uno elige el suyo (tecla o clic)
            st.ctl('nextFloor')
            await asyncio.gather(*[p.wait_for_selector('#boons:not([hidden]) button.boon', timeout=8000) for p in live])
            me = [await p.evaluate('MysteryAction.net.me') for p in live]
            shown = [await p.evaluate("[...document.querySelectorAll('#boons button.boon b')].map(b => b.textContent)") for p in live]
            before = st.ctl('boons')
            names = await live[0].evaluate("Object.fromEntries(Object.entries(BOONS).map(([k, b]) => [k, b.name]))")
            check('dones: cada navegador muestra la oferta pendiente que el servidor le hizo a ESE jugador (también la que quedó sin elegir del piso anterior)',
                  all(before[me[i]]['pending'] >= 1 and shown[i] == [names[k] for k in before[me[i]]['offer']] for i in range(len(live))), [shown, before])
            await live[0].click('#view'); await live[0].keyboard.press('Digit1')
            await live[1].click('#boons button.boon >> nth=2')
            await live[0].wait_for_function("Object.keys(MysteryAction.player.boons).length === 1", timeout=5000)
            await live[1].wait_for_function("Object.keys(MysteryAction.player.boons).length === 1", timeout=5000)
            after = st.ctl('boons')
            want0, want1 = before[me[0]]['offer'][0], before[me[1]]['offer'][2]
            check('dones: el servidor aplica a cada uno solo lo que eligió (1.ª carta con la tecla 1, 3.ª con clic); los demás, nada aún',
                  after[me[0]]['boons'] == {want0: 1} and after[me[1]]['boons'] == {want1: 1} and after[me[0]]['pending'] == before[me[0]]['pending'] - 1
                  and all(after[m]['boons'] == {} and after[m]['pending'] == before[m]['pending'] for m in me[2:]), after)
            await live[0].wait_for_timeout(500)
            local = [await p.evaluate("({b: MysteryAction.player.boons, open: !document.getElementById('boons').hidden, hud: document.getElementById('hud-boons').textContent})") for p in live]
            check('dones: quien elige ve su don en el HUD; su panel solo sigue abierto si le queda otra oferta; los que no han elegido lo siguen viendo',
                  local[0]['b'] == {want0: 1} and local[0]['hud'] and local[0]['open'] == (after[me[0]]['pending'] > 0) and local[1]['b'] == {want1: 1} and all(l['open'] for l in local[2:]), local)
            await live[2].screenshot(path=os.path.join(shots, 'combat_boons.png'))

            # --- Guardián: mismo estado para todos y aviso de fase 2
            boss = st.ctl('boss')
            await asyncio.gather(*[p.wait_for_function(f"MysteryAction.floorRT && MysteryAction.floorRT.boss && MysteryAction.floorRT.boss.netId === {json.dumps(boss['id'])}", timeout=10000) for p in live])
            st.ctl('bossHurt', frac=.45)
            await asyncio.gather(*[p.wait_for_function("MysteryAction.floorRT.boss.netPhase === 2", timeout=6000) for p in live])
            srv, snaps = await compare('guardián', live)
            sb = srv['state']['boss']
            check('los cuatro ven al mismo guardián con los mismos PS y la fase 2', sb['phase'] == 2 and all(s['boss'] and s['boss']['id'] == sb['id'] and abs(s['boss']['hp'] - sb['hp']) < .5 and s['boss']['phase'] == 2 for s in snaps), sb)
            await B.screenshot(path=os.path.join(shots, 'combat_boss.png'))
            st.ctl('freeze', on=False)

            # --- Furia del guardián al 30 %: el servidor la anuncia una vez y los cuatro la ven (y se queda sincronizada)
            st.ctl('bossHurt', frac=.25)
            await asyncio.gather(*[p.wait_for_function("MysteryAction.floorRT.boss && MysteryAction.floorRT.boss.enraged === true", timeout=8000) for p in live])
            seen = [await p.evaluate("({cine: MysteryAction.cine && MysteryAction.cine.kind, card: document.getElementById('floorcard-text').textContent})") for p in live]
            await A.wait_for_timeout(2300)
            srv = st.ctl('state')
            check('furia: los cuatro ven la animación del guardián enfurecido y el estado queda sincronizado', all('enfurece' in s['card'] for s in seen) and srv['state']['boss']['rage'] is True, [seen, srv['state']['boss'].get('rage')])

            # --- La anfitriona abandona: el liderazgo pasa a Beto y la expedición continúa
            await A.keyboard.press('Escape'); await A.wait_for_selector('#btn-giveup:visible', timeout=3000)
            await A.click('#btn-giveup'); await A.click('#dialog button.btn-main')
            await A.wait_for_function("!document.getElementById('result').hidden", timeout=8000)
            await B.wait_for_function("MysteryAction.net.remotes.size === 2", timeout=8000)
            srv = st.ctl('state')
            host = [p['name'] for p in srv['state']['players'].values() if p['host']]
            check('regla de liderazgo: la anfitriona se va y Beto (el más antiguo conectado) pasa a ser anfitrión; la expedición sigue',
                  host == ['Beto'] and srv['room'] and srv['state']['phase'] == 'playing' and srv['state']['boss']['alive'], host)
            srv, snaps = await compare('sin la anfitriona', [B, Cc, D2])
            for n, e in errs.items(): check(f'sin errores de JavaScript ({n})', not e, e[:3])
            await b.close()
    finally:
        st.close()
    print(f'{sum(R)}/{len(R)} correctas'); return all(R)
if __name__ == '__main__': sys.exit(0 if asyncio.run(main()) else 1)
