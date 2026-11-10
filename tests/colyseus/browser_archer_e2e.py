"""Apuntado del Arquero EN LÍNEA (dos navegadores contra el servidor real) con 280 ms de ida y vuelta.

- Los impactos los decide el servidor: el destello de impacto solo aparece cuando el servidor confirma el daño
  (antes salía cuando la flecha local tocaba al enemigo dibujado, aunque el servidor fallara).
- Disparos a enemigos quietos pequeños y grandes, en la cabeza del sprite (corrección sprite → pies) y con error humano
  (asistencia activada y desactivada), contados en el servidor.
- Enemigos reales (con su IA) en movimiento: aciertos con y sin asistencia, y que cada destello coincide con un daño real."""
import asyncio, json, math, os, sys
from playwright.async_api import async_playwright
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from browser_common import Stack, watch_errors
R = []
def check(n, ok, info=''):
    R.append(bool(ok)); print(('PASS ' if ok else 'FAIL ') + n, json.dumps(info, ensure_ascii=False)[:500] if info != '' else '', flush=True)
LAG = """(ms => { const N = MysteryAction.net; if (N.lagged) return; N.lagged = ms;
  const as = N.applyState.bind(N), oe = N.onEvent.bind(N), send = N.tx.send;
  N.applyState = st => setTimeout(() => as(st), ms); N.onEvent = ev => setTimeout(() => oe(ev), ms); N.tx.send = (t, m) => setTimeout(() => send(t, m), ms); })"""
# Contadores en el cliente: contactos de la flecha local, destellos de impacto mostrados (todos, en cualquier sitio)
COUNT = """(() => { const N = MysteryAction.net; if (N.__c) return; N.__c = { contact: 0, flash: 0 };
  const lh = N.localHit.bind(N); N.localHit = (t, o) => { const r = lh(t, o); if (t instanceof NetEnemy && !o.dot) N.__c.contact++; return r; };
  const im = Effects.impact.bind(Effects); Effects.impact = (...a) => { N.__c.flash++; return im(...a); }; })()"""
# Un disparo con el ratón real del juego: punto del mundo (wx, wy) con error ±err; espera a poder disparar
SHOOT = """async (o) => { const G = MysteryAction, p = G.player, cam = G.camera, m = G.input.mouse;
  const e = [...G.net.enemies.values()].find(x => x.netId === o.id); if (!e) return { error: 'sin enemigo' };
  const h = e.height || 20, hy = { pies: 0, centro: .45, cabeza: .9 }[o.at] * h, R = () => Math.random() * 2 - 1;
  const wx = e.x + R() * (o.err || 0), wy = e.y - hy + R() * (o.err || 0);
  m.inside = true; m.lastMove = performance.now(); m.x = (wx - cam.left) * cam.zoom; m.y = (wy - cam.top) * cam.zoom;
  for (let k = 0; k < 60 && p.basicCd > 0; k++) await new Promise(r => setTimeout(r, 25));
  const ok = p.tryBasic(G); return { ok }; }"""

async def main():
    shots = os.environ.get('SHOT_DIR', '.')
    st = Stack(2914, 2915)
    try:
        async with async_playwright() as pw:
            b = await pw.chromium.launch(); errs = {}
            async def open_player(name, species):
                ctx = await b.new_context(viewport={'width': 1280, 'height': 800}); pg = await ctx.new_page(); watch_errors(pg, errs, name)
                await pg.goto(st.url); await pg.wait_for_timeout(300); await pg.evaluate("n => MysteryLobby.devGuest(n)", name)
                await pg.wait_for_selector(f'.on-fresh[data-sp="{species}"]', timeout=8000); await pg.click(f'.on-fresh[data-sp="{species}"]'); await pg.wait_for_selector('#on-profile-card', timeout=5000)
                acc = await pg.evaluate("JSON.parse(localStorage.getItem('ma-online-auth')).accountId")
                st.db_tool('patch', acc, json.dumps({'story': {'flags': ['c1_intro']}})); await pg.evaluate("MysteryLobby.refresh()"); await pg.wait_for_timeout(300)
                return pg
            A, B = await asyncio.gather(open_player('Ana', 'arquero'), open_player('Beto', 'guerrero'))
            await A.click('#on-create'); await A.wait_for_function("/^[A-Z2-9]{6}$/.test((document.querySelector('#on-code-val')||{}).textContent||'')", timeout=8000)
            code = await A.inner_text('#on-code-val'); await B.fill('#on-code', code); await B.click('#on-join'); await B.wait_for_selector('#on-ready', timeout=8000); await B.click('#on-ready')
            await A.wait_for_function("!document.querySelector('#on-start').disabled", timeout=6000); await A.click('#on-start')
            await asyncio.gather(*[p.wait_for_function("MysteryAction.net && MysteryAction.net.active && MysteryAction.net.remotes.size === 1", timeout=10000) for p in (A, B)])
            st.ctl('arena', enemies=0)
            await asyncio.gather(*[p.wait_for_function("MysteryAction.floorRT && MysteryAction.floorRT.label.includes('P2')", timeout=8000) for p in (A, B)])
            for p in (A, B): await p.evaluate("UI.hideBoons && UI.hideBoons()")
            st.ctl('place', name='Beto', x=st.ctl('member', name='Ana')['x'] - 260, y=st.ctl('member', name='Ana')['y'] + 200)
            await A.evaluate(LAG, 140); await A.evaluate(COUNT); await A.click('#view')
            results = {}; per_hit = {}
            for assist in (True, False):
                await A.evaluate(f"Options.data.aimAssist = {'true' if assist else 'false'}")
                # Muñecos quietos: pequeño a la derecha, mediano arriba a la izquierda (dentro del alcance y con línea libre)
                dm = st.ctl('dummies', name='Ana', list=[{'kind': 'rataRaiz', 'dx': 170, 'dy': 0}, {'kind': 'mordisquin', 'dx': -150, 'dy': -110}])
                await A.wait_for_function(f"MysteryAction.net.enemies.has('{dm['ids'][0]}') && MysteryAction.net.enemies.has('{dm['ids'][1]}')", timeout=4000); await A.wait_for_timeout(400)
                for (eid, label) in zip(dm['ids'], ['pequeño', 'mediano']):
                    h0 = st.ctl('enemyHp')[eid]; await A.evaluate(SHOOT, {'id': eid, 'at': 'pies', 'err': 0}); await A.wait_for_timeout(1200); per_hit[eid] = h0 - st.ctl('enemyHp')[eid]   # daño de una flecha a ESTE enemigo
                    for (at, err, n) in [('cabeza', 0, 4), ('centro', 14, 8)]:
                        hp0 = st.ctl('enemyHp').get(eid); c0 = await A.evaluate("({ ...MysteryAction.net.__c })")
                        fired = 0
                        for _ in range(n): r = await A.evaluate(SHOOT, {'id': eid, 'at': at, 'err': err}); fired += bool(r.get('ok'))
                        await A.wait_for_timeout(1200)
                        hp1 = st.ctl('enemyHp').get(eid); c1 = await A.evaluate("({ ...MysteryAction.net.__c })")
                        conf = await A.evaluate(f"(MysteryAction.net.enemies.get('{eid}') || {{}}).confirmedHits || 0")
                        dmg_per = None
                        results[f"{'con' if assist else 'sin'} · {label} · clic en {at}{' ±%d px' % err if err else ''}"] = {'una_flecha': per_hit[eid], 'disparos': fired, 'daño_servidor': hp0 - hp1, 'contactos_locales': c1['contact'] - c0['contact'], 'destellos': c1['flash'] - c0['flash']}
                st.ctl('calm'); await A.wait_for_timeout(500)
            # Daño de una flecha (para convertir daño en número de impactos)
            per = st.ctl('dummies', name='Ana', list=[{'kind': 'rataRaiz', 'dx': 120, 'dy': 0}]); pid = per['ids'][0]
            await A.wait_for_function(f"MysteryAction.net.enemies.has('{pid}')", timeout=4000); await A.wait_for_timeout(300)
            h0 = st.ctl('enemyHp')[pid]; await A.evaluate(SHOOT, {'id': pid, 'at': 'pies', 'err': 0}); await A.wait_for_timeout(1200); one = h0 - st.ctl('enemyHp')[pid]
            st.ctl('calm'); await A.wait_for_timeout(300)
            check('una flecha a un enemigo quieto, a los pies, con 280 ms: el servidor la cuenta', one > 0, one)
            for k, v in results.items(): v['impactos_servidor'] = round(v['daño_servidor'] / v['una_flecha'], 1) if v['una_flecha'] else None
            print(json.dumps(results, ensure_ascii=False, indent=1))
            head = [v for k, v in results.items() if 'cabeza' in k]
            check('clic en la cabeza del sprite (pequeño y mediano) con 280 ms de latencia: todos los disparos dañan en el servidor', all(v['impactos_servidor'] == v['disparos'] for v in head), head)
            check('cada destello corresponde a un impacto del servidor: destellos = impactos confirmados en todos los casos', all(abs(v['destellos'] - v['impactos_servidor']) < .01 for v in results.values()), {k: [v['destellos'], v['impactos_servidor']] for k, v in results.items()})
            # Enemigos reales (IA) que se mueven: 16 disparos con y sin asistencia, apuntando a su centro tal como se ven
            real = {}
            for assist in (True, False):
                await A.evaluate(f"Options.data.aimAssist = {'true' if assist else 'false'}")
                st.ctl('arena', enemies=4); await A.wait_for_timeout(1500)
                ids = list(st.ctl('enemyHp').keys()); hp0 = st.ctl('enemyHp'); c0 = await A.evaluate("({ ...MysteryAction.net.__c })"); fired = 0
                for i in range(16):
                    alive = await A.evaluate("[...MysteryAction.net.enemies.values()].filter(e => e.alive).sort((a, b) => Math.hypot(a.x - MysteryAction.player.x, a.y - MysteryAction.player.y) - Math.hypot(b.x - MysteryAction.player.x, b.y - MysteryAction.player.y)).map(e => e.netId)")
                    if not alive: break
                    r = await A.evaluate(SHOOT, {'id': alive[0], 'at': 'centro', 'err': 8}); fired += bool(r.get('ok'))
                await A.wait_for_timeout(1200)
                hp1 = st.ctl('enemyHp'); c1 = await A.evaluate("({ ...MysteryAction.net.__c })")
                dmg = sum(hp0[k] - hp1.get(k, 0) for k in hp0)
                real['con' if assist else 'sin'] = {'disparos': fired, 'impactos_servidor≈': round(dmg / one, 1) if one else None, 'destellos': c1['flash'] - c0['flash'], 'contactos_locales': c1['contact'] - c0['contact']}
                st.ctl('calm'); await A.wait_for_timeout(600)
            print('enemigos reales en movimiento:', json.dumps(real, ensure_ascii=False))
            check('enemigos reales en movimiento: con y sin asistencia, ningún destello sin daño del servidor', all(v['destellos'] <= v['impactos_servidor≈'] + .5 for v in real.values()), real)
            await A.screenshot(path=os.path.join(shots, 'arquero_online.png'))
            check('sin errores de JavaScript', not any(errs.values()), errs)
            await b.close()
    finally:
        st.close()
    print(f"{sum(R)}/{len(R)} correctas"); sys.exit(0 if all(R) else 1)

asyncio.run(main())
