"""Capturas de la auditoría visual: el juego real (prototipo sin conexión) en Chromium, sin tocar código ni gráficos.
Solo se usan las funciones del propio juego para llegar a cada situación (nueva partida, entrar en una mazmorra,
ir al piso del jefe, abrir el inventario). Las ampliaciones son recortes de la captura escalados por vecino más
próximo (sin suavizado ni filtros)."""
import asyncio, json, os, sys
from playwright.async_api import async_playwright
from PIL import Image

WT = sys.argv[1]; OUT = sys.argv[2]; os.makedirs(OUT, exist_ok=True)
VW, VH = 1600, 900
log = []

def zoom(src, box, k, name):
    im = Image.open(os.path.join(OUT, src)).crop(box)
    im = im.resize((im.width * k, im.height * k), Image.NEAREST); im.save(os.path.join(OUT, name), optimize=True)
    log.append({'archivo': name, 'de': src, 'recorte': box, 'escala': k})

BOOT = """(o) => { localStorage.clear(); const G = MysteryAction, s = Save.sanitize(Save.fresh(o.cls)).data; s.arrived = true;
  StoryChain.talk(s, 'c1_intro'); G.save = s; Save.write(s); G.goBase(); return true; }"""
HIDE = "() => { const f = document.getElementById('floorcard'); if (f) f.hidden = true; MysteryAction.cine = null; UI.hideBoons && UI.hideBoons(); MysteryAction.paused = false; }"
SCREEN = "() => { const G = MysteryAction, p = G.player, c = G.camera || G.cam; return { x: (p.x - c.left) * c.zoom, y: (p.y - c.top) * c.zoom, zoom: c.zoom }; }"

async def shot(pg, name, desc, **kw):
    await pg.screenshot(path=os.path.join(OUT, name), **kw)
    log.append({'archivo': name, 'descripción': desc})

async def page(br, html):
    pg = await br.new_page(viewport={'width': VW, 'height': VH}, device_scale_factor=1)
    errs = []; pg.on('pageerror', lambda e: errs.append(str(e))); pg.errs = errs
    await pg.goto('file://' + os.path.join(WT, html)); await pg.wait_for_timeout(700)
    return pg

async def fight(pg, secs, aim=True):
    """Combate real: el jugador ataca (botón del ratón y habilidad) hacia el enemigo más cercano durante «secs» segundos."""
    for i in range(int(secs * 4)):
        await pg.evaluate("""() => { const G = MysteryAction, p = G.player, foes = G.actors.filter(a => a instanceof Enemy && a.alive);
          if (!foes.length) return; foes.sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y)); const e = foes[0], c = G.camera, m = G.input.mouse;
          m.inside = true; m.lastMove = performance.now(); m.x = (e.x - c.left) * c.zoom; m.y = (e.y - (e.height || 20) * .5 - c.top) * c.zoom; p.hp = Math.max(p.hp, p.maxHp * .6); p.tryBasic(G); }""")
        await pg.wait_for_timeout(250)

async def main():
    async with async_playwright() as pw:
        br = await pw.chromium.launch()
        M = 'main.html'
        # --- 0. Pantallas de título y selección de clase
        pg = await page(br, M)
        await pg.evaluate("() => localStorage.clear()"); await pg.reload(); await pg.wait_for_timeout(900)
        await shot(pg, '00_titulo.png', 'Pantalla de título del prototipo (sin conexión).')
        await pg.click('#btn-start'); await pg.wait_for_timeout(900)
        await shot(pg, '00_seleccion_clase.png', 'Selección de clase: las cuatro clases jugables con su retrato animado.')
        await pg.close()
        # --- 1-3. Aldea y las cuatro clases
        for cls in ['guerrero', 'arquero', 'mago', 'asesino']:
            pg = await page(br, M); await pg.evaluate(BOOT, {'cls': cls}); await pg.wait_for_timeout(2500)
            if cls == 'guerrero':
                await shot(pg, '01_aldea_general.png', 'La aldea al empezar (Guerrero en el punto de llegada), con el HUD de la aldea.')
                # paseo hacia el centro para una segunda vista
                await pg.keyboard.down('d'); await pg.keyboard.down('w'); await pg.wait_for_timeout(1400); await pg.keyboard.up('d'); await pg.keyboard.up('w'); await pg.wait_for_timeout(600)
                await shot(pg, '01_aldea_centro.png', 'Otra zona de la aldea tras caminar unos segundos (Guerrero).')
            sc = await pg.evaluate(SCREEN)
            await shot(pg, f'03_{cls}_aldea.png', f'{cls.capitalize()} en la aldea, vista normal del juego.')
            x, y = int(sc['x']), int(sc['y'])
            zoom(f'03_{cls}_aldea.png', (x - 60, y - 115, x + 60, y + 20), 4, f'03_{cls}_sprite_x4.png')
            if cls == 'guerrero': zoom('03_guerrero_aldea.png', (x - 260, y - 180, x + 260, y + 120), 2, '02_personaje_y_entorno_x2.png')
            if pg.errs: log.append({'errores': pg.errs[:3]})
            await pg.close()
        # --- 4. Exterior: Linde de Brumaverde (zona de exploración) y Bosque, piso 1
        for (dng, seed, name, desc) in [('linde', 21, '04_linde_brumaverde.png', 'Linde de Brumaverde (zona de exploración exterior), al entrar.'), ('bosque', 7, '04_bosque_piso1.png', 'Bosque de Brumaverde, piso 1.')]:
            pg = await page(br, M); await pg.evaluate(BOOT, {'cls': 'arquero'}); await pg.wait_for_timeout(800)
            await pg.evaluate(f"() => MysteryAction.startDungeon('{dng}', {seed})"); await pg.wait_for_timeout(600); await pg.evaluate(HIDE); await pg.wait_for_timeout(1500)
            await shot(pg, name, desc)
            if dng == 'bosque':
                sc = await pg.evaluate(SCREEN); x, y = int(sc['x']), int(sc['y'])
                zoom(name, (x - 200, y - 130, x + 200, y + 130), 3, '04_bosque_tiles_x3.png')
            await pg.close()
        # --- 5. Mazmorras interiores
        for (dng, seed, name, desc) in [('gruta', 5, '05_mazmorra_gruta.png', 'Gruta, piso 1.'), ('mina', 9, '05_mazmorra_mina.png', 'Mina, piso 1.'), ('crater', 3, '05_mazmorra_crater.png', 'Cráter, piso 1.')]:
            pg = await page(br, M); await pg.evaluate(BOOT, {'cls': 'mago'}); await pg.wait_for_timeout(800)
            await pg.evaluate(f"() => {{ const G = MysteryAction; G.save.unlocked = Object.keys(DUNGEONS || {{}}); G.startDungeon('{dng}', {seed}); }}"); await pg.wait_for_timeout(600); await pg.evaluate(HIDE); await pg.wait_for_timeout(1500)
            await shot(pg, name, desc)
            if dng == 'gruta':
                sc = await pg.evaluate(SCREEN); x, y = int(sc['x']), int(sc['y'])
                zoom(name, (x - 200, y - 130, x + 200, y + 130), 3, '05_gruta_tiles_x3.png')
            await pg.close()
        # --- 6. Combate contra enemigos normales (Bosque): se acerca a los enemigos y pelea de verdad
        pg = await page(br, M); await pg.evaluate(BOOT, {'cls': 'guerrero'}); await pg.wait_for_timeout(800)
        await pg.evaluate("() => MysteryAction.startDungeon('bosque', 7)"); await pg.wait_for_timeout(600); await pg.evaluate(HIDE)
        await pg.evaluate("""() => { const G = MysteryAction, p = G.player, foes = G.actors.filter(a => a instanceof Enemy && a.alive && !a.kind.isBoss);
          foes.sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y)); const e = foes[0];
          for (const f of foes.slice(0, 3)) f.aggro = true; p.placeAt ? p.placeAt(e.x - 70, e.y + 10) : (p.x = e.x - 70, p.y = e.y + 10); }""")
        await fight(pg, 1.6)
        await shot(pg, '06_combate_normal.png', 'Combate real en el Bosque, piso 1 (Guerrero contra criaturas del bosque).')
        sc = await pg.evaluate(SCREEN); x, y = int(sc['x']), int(sc['y'])
        zoom('06_combate_normal.png', (x - 220, y - 150, x + 220, y + 110), 3, '06_combate_normal_x3.png')
        await fight(pg, 1.2)
        await shot(pg, '06_combate_normal_b.png', 'El mismo combate un instante después.')
        await pg.close()
        # --- 7. Jefes: Robletón (Bosque) y Gromgar (Mina)
        for (dng, seed, cls, name, desc) in [('bosque', 4, 'arquero', '07_jefe_robleton', 'Robletón, el Guardián de Espinas (Bosque, piso del jefe).'), ('mina', 3, 'guerrero', '07_jefe_gromgar', 'Gromgar (Mina, piso del jefe).')]:
            pg = await page(br, M); await pg.evaluate(BOOT, {'cls': cls}); await pg.wait_for_timeout(800)
            await pg.evaluate(f"() => {{ const G = MysteryAction; G.save.unlocked = Object.keys(DUNGEONS || {{}}); G.startDungeon('{dng}', {seed}); G.loadStep(G.run.seq.length - 1); }}"); await pg.wait_for_timeout(600); await pg.evaluate(HIDE); await pg.wait_for_timeout(1200)
            await shot(pg, name + '_sala.png', desc + ' Llegada a la sala.')
            await pg.evaluate("""() => { const G = MysteryAction, p = G.player, b = G.actors.find(a => a instanceof Enemy && a.kind.isBoss); if (!b) return; b.aggro = true; p.placeAt ? p.placeAt(b.x - 150, b.y + 40) : (p.x = b.x - 150, p.y = b.y + 40); }""")
            await fight(pg, 3.0)
            await pg.evaluate("() => { const G = MysteryAction, p = G.player, b = G.actors.find(a => a instanceof Enemy && a.kind.isBoss); if (!b) return; const ox = p.x, oy = p.y; p.placeAt(b.x - 90, b.y + 70); if (!isFinite(p.x) || !isFinite(p.y) || G.world.isSolid(Math.floor(p.x / 32), Math.floor(p.y / 32))) { p.x = p.px = ox; p.y = p.py = oy; } }"); await pg.wait_for_timeout(450)
            await shot(pg, name + '_combate.png', desc + ' Combate en curso (ataques avisados, barra del jefe).')
            sc = await pg.evaluate("() => { const G = MysteryAction, b = G.actors.find(a => a instanceof Enemy && a.kind.isBoss), c = G.camera; return b ? { x: (b.x - c.left) * c.zoom, y: (b.y - c.top) * c.zoom } : null; }")
            if sc and sc['x'] == sc['x'] and sc['y'] == sc['y']: x, y = int(sc['x']), int(sc['y']); zoom(name + '_combate.png', (max(0, x - 170), max(0, y - 230), min(VW, x + 170), min(VH, y + 50)), 3, name + '_sprite_x3.png')
            if pg.errs: log.append({'errores': pg.errs[:3]})
            await pg.close()
        # --- 8-9. Inventario y HUD: versión publicada (main) y rediseño pendiente de fusión (tarea/interfaz-mmo); indicador del Arquero
        for (html, tag) in [('main.html', 'main'), ('tarea_interfaz-mmo.html', 'interfaz-mmo'), ('tarea_arquero-apuntado.html', 'arquero-apuntado')]:
            pg = await page(br, html); await pg.evaluate(BOOT, {'cls': 'arquero'}); await pg.wait_for_timeout(800)
            await pg.evaluate("() => MysteryAction.startDungeon('bosque', 7)"); await pg.wait_for_timeout(600); await pg.evaluate(HIDE); await pg.wait_for_timeout(800)
            if tag == 'arquero-apuntado':
                await pg.evaluate("""() => { const G = MysteryAction, p = G.player, foes = G.actors.filter(a => a instanceof Enemy && a.alive && !a.kind.isBoss); foes.sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y)); const e = foes[0]; p.placeAt(e.x - 150, e.y + 6); }""")
                await pg.wait_for_timeout(400)
                await pg.evaluate("""() => { const G = MysteryAction, p = G.player, foes = G.actors.filter(a => a instanceof Enemy && a.alive && !a.kind.isBoss); foes.sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y)); const e = foes[0], c = G.camera, m = G.input.mouse; m.inside = true; m.lastMove = performance.now() + 60000; m.x = (e.x + 20 - c.left) * c.zoom; m.y = (e.y + 18 - c.top) * c.zoom; }""")
                await pg.wait_for_timeout(500)
                await shot(pg, '09_arquero_asistencia_tarea-arquero-apuntado.png', 'Rama tarea/arquero-apuntado: indicador de la asistencia de apuntado (marcas doradas a los pies del enemigo).')
                sc = await pg.evaluate(SCREEN); x, y = int(sc['x']), int(sc['y'])
                zoom('09_arquero_asistencia_tarea-arquero-apuntado.png', (x - 60, y - 120, x + 260, y + 80), 3, '09_arquero_asistencia_x3.png')
                await pg.close(); continue
            await pg.evaluate("() => { const p = MysteryAction.player; for (const id of ['espadaHierro', 'yelmoHierro', 'cotaMallas', 'botasCuero', 'arcoTejo', 'capuchaCuero', 'hojaTenaz', 'tonicoEnergia']) p.bag.add(id); p.hp = Math.round(p.maxHp * .7); }")
            await pg.wait_for_timeout(500)
            await shot(pg, f'09_hud_{tag}.png', f'HUD durante la expedición ({tag}): panel del personaje, barra de habilidades' + (', barra de consumibles X/Z/C.' if tag != 'main' else ' y atajos de consumibles en texto.'))
            zoom(f'09_hud_{tag}.png', (0, 0, 520, 240), 2, f'09_hud_panel_{tag}_x2.png')
            zoom(f'09_hud_{tag}.png', (VW // 2 - 330, VH - 190, VW // 2 + 330, VH), 2, f'09_hud_barras_{tag}_x2.png')
            await pg.evaluate("() => MysteryAction.openBag()"); await pg.wait_for_timeout(500)
            if tag != 'main': await pg.evaluate("() => { const st = MysteryAction.player.bag.stacks.find(s => s.id === 'espadaHierro'); UI.invSel = st.uid; UI.renderBag(MysteryAction); }"); await pg.wait_for_timeout(400)
            await shot(pg, f'08_inventario_{tag}.png', f'Inventario y equipo en la expedición ({tag}).')
            if pg.errs: log.append({'errores': pg.errs[:3]})
            await pg.close()
        await br.close()
    json.dump(log, open(os.path.join(OUT, '_capturas.json'), 'w'), ensure_ascii=False, indent=1)
    print(len([l for l in log if 'archivo' in l]), 'imágenes'); print([l for l in log if 'errores' in l])

asyncio.run(main())
