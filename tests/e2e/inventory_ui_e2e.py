"""Interfaz de consumibles e inventario (sin conexión, el juego real en el navegador).

Comprueba los criterios de aceptación de la barra de consumibles (X, Z, C) y del inventario en dos paneles:
atajos, estados vacío y lleno, recogida, apertura y cierre con teclado y ratón, equipar arrastrando y con doble
clic, objetos incompatibles, quitar piezas, estadísticas reales con vista previa que no cambia nada, confirmación
al tirar, guardado y recarga, aldea y pantalla pequeña. Sin duplicar objetos ni consumir de más."""
import asyncio, json, os, sys
from playwright.async_api import async_playwright

SRC = sys.argv[1] if len(sys.argv) > 1 else 'tests/.tmp/prototype.html'
SHOT_DIR = os.environ.get('SHOT_DIR', 'tests/.tmp')
R = []
def check(n, ok, info=''):
    R.append(bool(ok)); print(('PASS ' if ok else 'FAIL ') + n, json.dumps(info, ensure_ascii=False)[:400] if info != '' else '', flush=True)

BAG = "() => MysteryAction.player.bag.stacks.map(s => s.id + ':' + s.qty).sort()"
EQ = "() => Object.fromEntries(Object.entries(MysteryAction.player.equip).map(([k, v]) => [k, v && v.id]))"
TOTAL = "() => MysteryAction.player.bag.stacks.reduce((t, s) => t + s.qty, 0) + Object.values(MysteryAction.player.equip).filter(Boolean).length"
UID = "id => MysteryAction.player.bag.stacks.find(s => s.id === id).uid"

async def main():
    async with async_playwright() as pw:
        br = await pw.chromium.launch(); ctx = await br.new_context(viewport={'width': 1280, 'height': 800}); pg = await ctx.new_page()
        errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.goto('file://' + os.path.abspath(SRC)); await pg.wait_for_timeout(400)
        await pg.evaluate("""() => { localStorage.clear(); const G = MysteryAction, s = Save.sanitize(Save.fresh('guerrero')).data; s.arrived = true; G.save = s; Save.write(s); G.goBase(); G.startDungeon('bosque', 77);
          G.actors = G.actors.filter(a => !(a instanceof Enemy)); G.floorRT.g.actors = G.actors;
          for (const id of ['espadaHierro', 'yelmoHierro', 'cotaMallas', 'botasCuero', 'arcoTejo']) G.player.bag.add(id); }""")
        await pg.wait_for_timeout(1200); await pg.click('#view')
        q = lambda k: pg.evaluate(f"() => {{ const s = MysteryAction.quickStatus('{k}'), b = document.querySelector('[data-q={k}]'); return {{ state: s.state, id: s.id, count: s.count, reason: s.reason, cls: b.className, text: b.innerText.replace(/\\s+/g, ' '), img: b.querySelector('img').getAttribute('src') === UI.icon(s.id || QUICK['{k}'][0]) }}; }}")
        # 1. Barra de consumibles: icono del objeto que se usará, tecla y cantidad; PS al máximo → no consume y lo dice
        h0 = await q('heal'); total0 = await pg.evaluate(TOTAL)
        await pg.keyboard.press('x'); await pg.wait_for_timeout(150)
        h1 = await q('heal'); toast = await pg.evaluate("() => document.getElementById('toast').innerText")
        check('1a. curación con PS al máximo: no gasta nada y explica por qué', h0['state'] == 'useless' and h1['count'] == h0['count'] and 'máximo' in toast and h0['img'] and 'X' in h0['text'], {'antes': h0, 'aviso': toast})
        await pg.evaluate("() => { MysteryAction.player.hp = 20; }")
        await pg.keyboard.down('x'); await pg.wait_for_timeout(500); await pg.keyboard.up('x'); await pg.wait_for_timeout(150)
        h2 = await q('heal'); hp = await pg.evaluate("() => MysteryAction.player.hp")
        check('1b. X mantenida: una sola unidad (Poción, +35 PS) y la casilla se actualiza al momento', h2['count'] == h0['count'] - 1 and hp == 55 and str(h2['count']) in h2['text'], {'después': h2, 'ps': hp})
        # 2. Agotar la comida: la casilla queda vacía y no hace nada falso
        f0 = await q('food'); await pg.click('[data-q=food]'); await pg.wait_for_timeout(150)
        b1 = await pg.evaluate(BAG); await pg.click('[data-q=food]'); await pg.wait_for_timeout(150)
        f2 = await q('food'); b2 = await pg.evaluate(BAG); toast = await pg.evaluate("() => document.getElementById('toast').innerText")
        check('2. agotar un consumible (clic en la casilla): estado vacío, el siguiente clic no gasta nada y explica por qué', f0['count'] == 1 and f2['state'] == 'empty' and 'q-empty' in f2['cls'] and b1 == b2 and 'comida' in toast and 'vacío' in f2['text'].lower(), {'antes': f0, 'después': f2, 'aviso': toast})
        # 3. Recoger más: la cantidad se actualiza
        await pg.evaluate("""() => { const G = MysteryAction, f = G.floorRT, p = G.player; for (const id of ['manzana', 'manzana']) f.items.push({ id, amount: 1, x: p.x + 70, y: p.y, tx: Math.floor((p.x + 70) / 32), ty: Math.floor(p.y / 32), taken: false }); p.placeAt(p.x + 70, p.y); for (let k = 0; k < 20; k++) G.update(1 / 60); }""")
        await pg.wait_for_timeout(200); f3 = await q('food')
        check('3. recoger dos manzanas del suelo: la casilla vuelve a estar disponible con 2', f3['state'] == 'ok' and f3['count'] == 2 and f3['id'] == 'manzana' and '2' in f3['text'], f3)
        await pg.screenshot(path=os.path.join(SHOT_DIR, 'ui_hud_consumibles.png'))
        # 4. Abrir y cerrar: teclado (Tab, Esc) y ratón (botón ×)
        await pg.keyboard.press('Tab'); await pg.wait_for_timeout(200); o1 = await pg.evaluate("() => !UI.screens.bagpanel.hidden && MysteryAction.paused")
        await pg.keyboard.press('Escape'); await pg.wait_for_timeout(200); c1 = await pg.evaluate("() => UI.screens.bagpanel.hidden && !MysteryAction.paused")
        await pg.keyboard.press('i'); await pg.wait_for_timeout(200); o2 = await pg.evaluate("() => !UI.screens.bagpanel.hidden")
        await pg.click('#btn-bag-x'); await pg.wait_for_timeout(200); c2 = await pg.evaluate("() => UI.screens.bagpanel.hidden")
        check('4. abrir y cerrar con Tab/Esc, con I y con el botón ×; sin conexión pausa el juego', o1 and c1 and o2 and c2, [o1, c1, o2, c2])
        await pg.keyboard.press('Tab'); await pg.wait_for_timeout(200)
        has = await pg.evaluate("() => ({ two: !!document.querySelector('#bag-list .inv-bag') && !!document.querySelector('#bag-list .inv-char'), tabs: [...document.querySelectorAll('#bag-list [data-tab]')].map(b => b.dataset.tab), slots: [...document.querySelectorAll('#bag-list .eslot')].map(b => b.dataset.slot).sort(), hero: !!document.querySelector('#bag-list canvas.inv-hero'), rows: document.querySelectorAll('#bag-list .inv-stats tbody tr').length })")
        check('ventana en dos paneles: 5 pestañas, las 6 ranuras reales, el sprite de la clase y 10 estadísticas', has['two'] and has['tabs'] == ['todo', 'consumible', 'material', 'especial', 'equipo'] and has['slots'] == sorted(['arma', 'armadura', 'casco', 'guantes', 'botas', 'accesorio']) and has['hero'] and has['rows'] == 10, has)
        await pg.wait_for_timeout(300); await pg.screenshot(path=os.path.join(SHOT_DIR, 'ui_inventario.png'))
        # 8 (vista previa). Seleccionar una pieza: la columna de vista previa muestra el cambio, pero nada cambia hasta confirmar
        atk0 = await pg.evaluate("() => MysteryAction.player.stats.atk"); eq0 = await pg.evaluate(EQ)
        await pg.click(f"#bag-list [data-sel=\"{await pg.evaluate(UID, 'espadaHierro')}\"]"); await pg.wait_for_timeout(150)
        pv = await pg.evaluate("() => ({ col: !!document.querySelector('#bag-list th.pv'), atk: [...document.querySelectorAll('#bag-list .inv-stats tbody tr')].find(r => r.querySelector('th').textContent === 'Ataque físico').querySelector('td.pv').innerText, target: !!document.querySelector('#bag-list .eslot.target[data-slot=arma]') })")
        check('vista previa: Ataque físico ▲ 15 y la ranura del arma marcada, sin cambiar el equipo ni las estadísticas', pv['col'] and '15' in pv['atk'] and pv['target'] and await pg.evaluate(EQ) == eq0 and await pg.evaluate("() => MysteryAction.player.stats.atk") == atk0, pv)
        # 5. Equipar: arrastrando (espada, yelmo) y con doble clic (cota, botas)
        await pg.locator(f"#bag-list [data-sel=\"{await pg.evaluate(UID, 'espadaHierro')}\"]").drag_to(pg.locator('#bag-list .eslot[data-slot=arma]')); await pg.wait_for_timeout(200)
        await pg.locator(f"#bag-list [data-sel=\"{await pg.evaluate(UID, 'yelmoHierro')}\"]").drag_to(pg.locator('#bag-list .eslot[data-slot=casco]')); await pg.wait_for_timeout(200)
        await pg.dblclick(f"#bag-list [data-sel=\"{await pg.evaluate(UID, 'cotaMallas')}\"]"); await pg.wait_for_timeout(200)
        await pg.dblclick(f"#bag-list [data-sel=\"{await pg.evaluate(UID, 'botasCuero')}\"]"); await pg.wait_for_timeout(200)
        eq1 = await pg.evaluate(EQ)
        check('5. equipar arma y casco arrastrando, armadura y botas con doble clic', eq1['arma'] == 'espadaHierro' and eq1['casco'] == 'yelmoHierro' and eq1['armadura'] == 'cotaMallas' and eq1['botas'] == 'botasCuero', eq1)
        # 8. Estadísticas reales (las del juego) y su desglose en pantalla
        st = await pg.evaluate("""() => { const p = MysteryAction.player, f = finalStats(p.sp.base, p.level, p.equip, p.buffs), row = n => [...document.querySelectorAll('#bag-list .inv-stats tbody tr')].find(r => r.querySelector('th').textContent === n).innerText.replace(/\\s+/g, ' ');
          return { atk: p.stats.atk, def: p.stats.def, fAtk: f.atk, fDef: f.def, rowAtk: row('Ataque físico'), rowDef: row('Defensa física') }; }""")
        check('8. estadísticas recalculadas con el sistema del juego (Ataque 12 → 15) y desglose base + equipo = total', st['atk'] == st['fAtk'] == 15 and st['def'] == st['fDef'] and st['def'] > 16 and '12 +3 15' in st['rowAtk'], st)
        # 6. Incompatible: arco (solo arqueros) en el arma, y la espada… ya equipada; un consumible en una ranura
        bag6 = await pg.evaluate(BAG); eq6 = await pg.evaluate(EQ)
        await pg.locator(f"#bag-list [data-sel=\"{await pg.evaluate(UID, 'arcoTejo')}\"]").drag_to(pg.locator('#bag-list .eslot[data-slot=arma]')); await pg.wait_for_timeout(200)
        t1 = await pg.evaluate("() => document.getElementById('toast').innerText")
        await pg.dblclick(f"#bag-list [data-sel=\"{await pg.evaluate(UID, 'arcoTejo')}\"]"); await pg.wait_for_timeout(200)
        t2 = await pg.evaluate("() => document.getElementById('toast').innerText")
        await pg.evaluate("() => { UI.invTab = 'todo'; UI.renderBag(MysteryAction); }")
        drag_src = await pg.evaluate("() => MysteryAction.player.bag.stacks.find(s => ITEMS[s.id].cat === 'consumible').uid")
        await pg.evaluate("k => { UI.drag = k; }", drag_src)   # (los consumibles no se pueden arrastrar: se comprueba la regla al soltar)
        await pg.evaluate("() => UI.invDrop(MysteryAction, UI.drag, 'casco', 'run')"); t3 = await pg.evaluate("() => document.getElementById('toast').innerText")
        check('6. incompatibles: el arco (solo arqueros) no entra, ni un consumible en el casco; nada se mueve y se explica', await pg.evaluate(BAG) == bag6 and await pg.evaluate(EQ) == eq6 and 'Arquero' in t1 and 'Arquero' in t2 and 'no es una pieza' in t3, [t1, t2, t3])
        # 7. Quitar una pieza: arrastrar el casco a la mochila, y doble clic en las botas
        await pg.locator('#bag-list .eslot[data-slot=casco]').drag_to(pg.locator('#bag-list .inv-grid')); await pg.wait_for_timeout(200)
        await pg.dblclick('#bag-list .eslot[data-slot=botas]'); await pg.wait_for_timeout(200)
        eq7 = await pg.evaluate(EQ); bag7 = await pg.evaluate(BAG)
        check('7. quitar piezas (arrastrar a la mochila y doble clic): vuelven a la mochila', not eq7['casco'] and not eq7['botas'] and 'yelmoHierro:1' in bag7 and 'botasCuero:1' in bag7, {'equipo': eq7, 'mochila': bag7})
        # Mochila llena: quitar una pieza no la pierde (se queda puesta y se explica)
        await pg.evaluate("() => { const p = MysteryAction.player; while (p.bag.used < p.bag.cap) p.bag.add('hojaTenaz'), p.bag.add('setaLuminosa'), p.bag.add('fragmentoCuarzo'); UI.renderBag(MysteryAction); }")
        totalF = await pg.evaluate(TOTAL)
        await pg.locator('#bag-list .eslot[data-slot=arma]').drag_to(pg.locator('#bag-list .inv-grid')); await pg.wait_for_timeout(200)
        tf = await pg.evaluate("() => document.getElementById('toast').innerText")
        check('mochila llena: la pieza no se pierde ni se duplica (sigue puesta) y se explica', (await pg.evaluate(EQ))['arma'] == 'espadaHierro' and await pg.evaluate(TOTAL) == totalF and 'sitio' in tf, tf)
        # Tirar pide confirmación
        await pg.evaluate("() => { for (const id of ['hojaTenaz', 'setaLuminosa', 'fragmentoCuarzo']) while (MysteryAction.player.bag.count(id)) MysteryAction.player.bag.take(id, 1); UI.renderBag(MysteryAction); }")
        await pg.keyboard.press('Escape'); await pg.wait_for_timeout(150)
        check('12. sin duplicados: objetos totales (mochila + equipo) = los de antes − 2 consumidos + 2 recogidos', await pg.evaluate(TOTAL) == total0 - 2 + 2, {'antes': total0, 'ahora': await pg.evaluate(TOTAL)})
        # 9. Guardar y recargar (aldea): el equipo se conserva
        await pg.evaluate("""() => { const G = MysteryAction; G.save.inv = []; G.save.equip = freshEquip(); G.save.inv.push({ uid: 'k1', id: 'espadaHierro', qty: 1 }, { uid: 'k2', id: 'yelmoHierro', qty: 1 }, { uid: 'k3', id: 'piedraAfilar' in ITEMS ? 'piedraAfilar' : 'hojaTenaz', qty: 3 }); Save.write(G.save); G.goBase(); }""")
        await pg.set_viewport_size({'width': 1280, 'height': 1500})   # en la aldea la mochila y el equipo van uno encima del otro: los dos a la vista para arrastrar
        await pg.wait_for_timeout(1200); await pg.evaluate("() => MysteryAction.openStation('rest')"); await pg.wait_for_timeout(400)
        await pg.locator('#base-inv [data-sel="k1"]').drag_to(pg.locator('#base-inv .eslot[data-slot=arma]')); await pg.wait_for_timeout(200)
        await pg.dblclick('#base-inv [data-sel="k2"]'); await pg.wait_for_timeout(200)
        await pg.locator('#base-inv [data-sel="k3"]').click(); await pg.wait_for_timeout(100)
        await pg.click('#base-inv [data-act=discard]'); await pg.wait_for_timeout(100)
        armed = await pg.evaluate("() => ({ still: MysteryAction.save.inv.some(s => s.uid === 'k3'), btn: (document.querySelector('#base-inv [data-act=discard]') || {}).innerText })")
        await pg.click('#base-inv [data-act=discard]'); await pg.wait_for_timeout(100)
        gone = await pg.evaluate("() => !MysteryAction.save.inv.some(s => s.uid === 'k3')")
        check('tirar pide confirmación (el primer clic no tira nada) y el segundo lo tira', armed['still'] and 'Confirmar' in (armed['btn'] or '') and gone, armed)
        await pg.screenshot(path=os.path.join(SHOT_DIR, 'ui_inventario_aldea.png'))
        await pg.reload(); await pg.wait_for_timeout(600)
        saved = await pg.evaluate("() => { const s = Save.load(); return { arma: s.equip.arma && s.equip.arma.id, casco: s.equip.casco && s.equip.casco.id, inv: s.inv.map(x => x.id) }; }")
        check('9. tras recargar, el equipo puesto en la aldea sigue puesto y no hay copias en la mochila', saved['arma'] == 'espadaHierro' and saved['casco'] == 'yelmoHierro' and 'espadaHierro' not in saved['inv'] and 'yelmoHierro' not in saved['inv'], saved)
        # 10. Pantalla pequeña: sin desbordar, ventana en una columna y la barra de consumibles sin tapar las habilidades
        mctx = await br.new_context(viewport={'width': 390, 'height': 844}, has_touch=True, is_mobile=True); m = await mctx.new_page(); m.on('pageerror', lambda e: errs.append(str(e)))
        await m.goto('file://' + os.path.abspath(SRC)); await m.wait_for_timeout(400)
        await m.evaluate("""() => { localStorage.clear(); const G = MysteryAction, s = Save.sanitize(Save.fresh('arquero')).data; s.arrived = true; G.save = s; Save.write(s); G.goBase(); G.startDungeon('bosque', 5); }""")
        await m.wait_for_timeout(1500)
        lay = await m.evaluate("() => { const q = document.getElementById('qbar').getBoundingClientRect(), a = document.getElementById('actionbar').getBoundingClientRect(); return { qb: q.bottom, at: a.top, fits: q.left >= 0 && q.right <= innerWidth }; }")
        await m.evaluate("() => MysteryAction.openBag()"); await m.wait_for_timeout(300)
        lay2 = await m.evaluate("() => ({ over: document.documentElement.scrollWidth > innerWidth, cols: getComputedStyle(document.querySelector('#bag-list .inv2')).gridTemplateColumns.split(' ').length })")
        await m.screenshot(path=os.path.join(SHOT_DIR, 'ui_inventario_movil.png'))
        check('10. móvil (390 px): consumibles encima de las habilidades, inventario en una columna y sin desbordar', lay['qb'] <= lay['at'] + 1 and lay['fits'] and not lay2['over'] and lay2['cols'] == 1, [lay, lay2])
        # Pantalla táctil: tocar una casilla de consumible = la tecla; doble toque en una pieza = equiparla
        await m.evaluate("() => { MysteryAction.closeBag(); MysteryAction.player.hp = 10; MysteryAction.player.bag.add('capuchaCuero'); }"); await m.wait_for_timeout(200)
        n0 = await m.evaluate("() => MysteryAction.quickStatus('heal').count")
        await m.tap('[data-q=heal]'); await m.wait_for_timeout(250)
        n1 = await m.evaluate("() => MysteryAction.quickStatus('heal').count")
        await m.evaluate("() => MysteryAction.openBag()"); await m.wait_for_timeout(250)
        cap = await m.evaluate("() => MysteryAction.player.bag.stacks.find(s => s.id === 'capuchaCuero').uid")
        await m.tap(f'#bag-list [data-sel="{cap}"]'); await m.wait_for_timeout(120); await m.tap(f'#bag-list [data-sel="{cap}"]'); await m.wait_for_timeout(250)
        eqm = await m.evaluate("() => MysteryAction.player.equip.casco && MysteryAction.player.equip.casco.id")
        check('pantalla táctil: tocar «X» gasta una unidad y el doble toque equipa la capucha', n1 == n0 - 1 and eqm == 'capuchaCuero', {'curación': [n0, n1], 'casco': eqm})
        check('sin errores de JavaScript', not errs, errs[:3])
        await br.close()
    print(f"{sum(R)}/{len(R)} correctas"); sys.exit(0 if all(R) else 1)

asyncio.run(main())
