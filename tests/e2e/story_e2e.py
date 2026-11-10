"""Secretos y cadena de Irene en el navegador con el prototipo real (sin conexión):
 - la marca de Irene (Bosque, piso 3) se lee en el escenario; en el gremio aparece la conversación con Ulula;
 - el piso 4 tiene la pared hueca; sin la clave el texto está bloqueado y con ella se lee la página 1;
 - el panel del registro enseña la página, la pista de la siguiente y la tercera vía;
 - la rueda del sello aparece al caer Gromgar; Bernardo y su decisión con botones; el alcalde lo comenta;
 - con la cadena completa se elige el título «Lector del diario de Irene»;
 - Raíces Hondas aparece en la puerta tras el Cráter y su guarida se dibuja (Eco de Robletón);
 - se cierra la página y se vuelve a cargar: todo sigue en el registro.
Uso: python3 tests/e2e/story_e2e.py tests/.tmp/prototype.html   (SHOT_DIR para las capturas)"""
import asyncio, json, os, sys
from playwright.async_api import async_playwright
SRC = sys.argv[1]; SHOT_DIR = os.environ.get('SHOT_DIR', 'tests/.tmp')
R = []
def check(n, ok, info=''):
    R.append(bool(ok)); print(('PASS ' if ok else 'FAIL ') + n, json.dumps(info, ensure_ascii=False)[:400] if info != '' else '', flush=True)

FLOOR = r'''([dng, floorNo]) => { const G = MysteryAction; G.startDungeon(dng, 4242); const i = G.run.seq.findIndex(q => q.floorNo === floorNo && q.kind === (floorNo === 'boss' ? 'boss' : 'normal'));
  G.loadStep(i >= 0 ? i : G.run.seq.length - 1); document.getElementById('floorcard').hidden = true; G.cine = null; UI.hideBoons && UI.hideBoons(); G.paused = false;
  G.actors = G.actors.filter(a => !(a instanceof Enemy)); G.floorRT.g.actors = G.actors; return G.floorRT.story.map(s => s.id); }'''
STEP = "(n) => { const G = MysteryAction; for (let k = 0; k < n; k++) G.update(1 / 60); return { dialog: !document.getElementById('dialog').hidden, text: document.getElementById('dialog-text').textContent, btns: [...document.querySelectorAll('#dialog-btns button')].map(b => b.textContent) }; }"

async def main():
    async with async_playwright() as pw:
        br = await pw.chromium.launch(); ctx = await br.new_context(viewport={'width': 1100, 'height': 700}); pg = await ctx.new_page()
        errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.goto('file://' + os.path.abspath(SRC)); await pg.wait_for_timeout(400)
        await pg.evaluate("() => { localStorage.clear(); const G = MysteryAction; const s = Save.sanitize(Save.fresh('mago')).data; s.arrived = true; s.cleared = ['bosque', 'gruta']; G.save = s; Save.write(s); }")
        # --- Piso 3 del Bosque: la marca de Irene, siempre en su sitio
        ids = await pg.evaluate(FLOOR, ['bosque', 3])
        await pg.evaluate("() => { const G = MysteryAction, st = G.floorRT.story[0]; G.player.placeAt(st.x, st.y); }")
        d = await pg.evaluate(STEP, 3)
        check('piso 3 del Bosque: la marca de Irene está y se lee en el escenario', ids == ['marca_irene'] and d['dialog'] and 'Explorador Irene' in d['text'], {'ids': ids, 'd': d})
        await pg.click('#dialog-btns button')
        # --- Piso 4 sin la clave: texto bloqueado
        ids4 = await pg.evaluate(FLOOR, ['bosque', 4])
        w = await pg.evaluate("() => { const f = MysteryAction.floorRT, fw = f.mechs.list.find(m => m.type === 'falsewall' && m.room === f.story[0].room); return { fw: !!fw, secret: fw && fw.tiles.every(i => f.world.tiles[i] === T.SECRET), hint: fw && fw.hint }; }")
        await pg.evaluate("() => { const G = MysteryAction, st = G.floorRT.story[0]; G.player.placeAt(st.x, st.y); }")
        d = await pg.evaluate(STEP, 3)
        check('piso 4: la pared hueca esconde el sitio; sin la clave de Ulula, el texto está bloqueado', ids4 == ['irene_p1'] and w['fw'] and w['secret'] and 'código' in d['text'], {'w': w, 'd': d['text'][:160]})
        await pg.click('#dialog-btns button')
        await pg.evaluate("() => MysteryAction.endRun('return')"); await pg.wait_for_timeout(500)
        # --- Gremio: conversación con Ulula
        await pg.evaluate("() => { const G = MysteryAction; document.getElementById('result') && (document.getElementById('result').hidden = true); G.goBase(); document.getElementById('floorcard').hidden = true; G.paused = false; G.openStation('guild'); }")
        btn = await pg.query_selector('[data-talk="ulula_irene"]')
        check('en el gremio aparece «Preguntar por la marca de Irene»', btn is not None)
        if btn: await btn.click(); await pg.wait_for_timeout(200)
        t = await pg.evaluate("() => ({ out: (document.querySelector('#codex-talks .talk-out') || {}).textContent || '', flag: MysteryAction.save.story.flags.includes('codigo_tiza'), stored: JSON.parse(localStorage.getItem(SAVE_KEY)).data.story.flags })")
        check('Ulula enseña el código de tiza: queda en el registro y en el guardado', 'raya larga' in t['out'] and t['flag'] and 'codigo_tiza' in t['stored'], t)
        await pg.evaluate("() => MysteryAction.closeStation()")
        # --- Piso 4 con la clave: página 1
        await pg.evaluate(FLOOR, ['bosque', 4])
        await pg.evaluate("() => { const G = MysteryAction, st = G.floorRT.story[0]; G.player.placeAt(st.x, st.y); }")
        d = await pg.evaluate(STEP, 3)
        check('con la clave, la página 1 del diario de Irene', 'Ulula te ha enseñado mis rayas' in d['text'] and 'Anotado en tu registro' in d['text'], d['text'][-160:])
        await pg.screenshot(path=os.path.join(SHOT_DIR, 'story_pagina1.png'))
        await pg.click('#dialog-btns button')
        await pg.evaluate("() => MysteryAction.endRun('return')"); await pg.wait_for_timeout(500)
        await pg.evaluate("() => { const G = MysteryAction; G.goBase(); document.getElementById('floorcard').hidden = true; G.paused = false; G.openStation('guild'); }")
        reg = await pg.evaluate("() => document.getElementById('codex-info').textContent")
        check('registro: la página 1 con su texto, la pista de la 2 y la tercera vía', 'La marca verdadera' in reg and 'hebilla' in reg and 'La tercera vía' in reg, reg[:300])
        await pg.screenshot(path=os.path.join(SHOT_DIR, 'story_registro.png'))
        await pg.evaluate("() => MysteryAction.closeStation()")
        # --- Mina: rueda del sello y Bernardo (con la página 3 ya conseguida)
        await pg.evaluate("() => { const s = MysteryAction.save; StoryChain.visit(s, 'nido_cuervo'); StoryChain.visit(s, 'archivo_fieles'); StoryChain.visit(s, 'sello_memoria'); s.cleared = ['bosque', 'gruta', 'cienaga']; }")   # (preparación: Gruta y Ciénaga ya hechas)
        await pg.evaluate(FLOOR, ['mina', 'boss'])
        await pg.evaluate("() => { const G = MysteryAction; const b = G.floorRT.boss; G.actors.push(b); G.player.invincible = true; Combat.hit(G, b, { team: 'player', fixed: 1e9, src: G.player }); for (let k = 0; k < 30; k++) G.update(1 / 60); }")
        sl = await pg.evaluate("() => { const o = MysteryAction.floorRT.objects.find(q => q.type === 'seal'); return o ? { site: o.site, tx: o.tx, ty: o.ty } : null; }")
        check('al caer Gromgar aparece la rueda del sello del Peso junto a la salida', sl and sl['site'] == 'sello_peso', sl)
        await pg.evaluate("() => { const G = MysteryAction, o = G.floorRT.objects.find(q => q.type === 'seal'); G.player.placeAt(o.x + 40, o.y + 30); G.camera.snap(o.x, o.y, G.world); G.renderer.draw(G, 1); }")
        await pg.screenshot(path=os.path.join(SHOT_DIR, 'story_rueda.png'))
        await pg.evaluate("() => { const G = MysteryAction, o = G.floorRT.objects.find(q => q.type === 'seal'); G.player.placeAt(o.x, o.y); }")
        d = await pg.evaluate(STEP, 3)
        check('Bernardo junto a la rueda, la página 4 y los botones de la decisión', 'Bernardo' in d['text'] and 'veinte años' in d['text'] and 'Liberarle (si él acepta)' in d['btns'], d['btns'])
        await pg.click('#dialog-btns button:has-text("Liberarle")'); await pg.wait_for_timeout(150)
        d2 = await pg.evaluate(STEP, 1)
        ch = await pg.evaluate("() => ({ c: MysteryAction.save.story.choices, news: VillageIntro.news(MysteryAction.save) })")
        check('decisión tomada: el texto de la consecuencia y el alcalde lo comenta', 'quiero ver a mi hermano' in d2['text'] and ch['c'] == {'bernardo': 'liberar'} and any('Bernardo ha vuelto' in l for l in ch['news']), ch)
        await pg.click('#dialog-btns button')
        await pg.evaluate("() => MysteryAction.endRun('return')"); await pg.wait_for_timeout(500)
        # --- Cadena completa: título nuevo
        await pg.evaluate("() => { const s = MysteryAction.save; StoryChain.visit(s, 'sello_fuego'); StoryChain.offering(s, 'robleton', { tangle: true }); StoryChain.offering(s, 'reinageoda', { daze: true }); StoryChain.offering(s, 'gromgar', { down: true }); s.cleared = ['bosque', 'gruta', 'cienaga', 'mina', 'crater']; Save.write(s); }")
        await pg.evaluate("() => { const G = MysteryAction; G.goBase(); document.getElementById('floorcard').hidden = true; G.paused = false; G.openStation('guild'); }")
        opts = await pg.evaluate("() => [...document.querySelectorAll('#title-sel option')].map(o => o.value)")
        await pg.select_option('#title-sel', 'Lector del diario de Irene'); await pg.wait_for_timeout(100)
        gt = await pg.evaluate("() => ({ t: Guild.title(MysteryAction.save), reg: document.getElementById('codex-info').textContent })")
        check('tercera vía descubierta: título elegible y el registro dice lo que falta (capítulos 6 a 8)', 'Lector del diario de Irene' in opts and gt['t'] == 'Lector del diario de Irene' and 'Descubierta' in gt['reg'] and 'capítulos 6 a 8' in gt['reg'], gt['t'])
        await pg.evaluate("() => MysteryAction.closeStation()")
        # --- Raíces Hondas
        await pg.evaluate("() => { MysteryAction.openStation('gate'); }")
        gate = await pg.evaluate("() => document.getElementById('dng-list').textContent")
        check('Raíces Hondas aparece en la puerta tras completar el Cráter', 'Raíces Hondas' in gate, gate[-200:])
        await pg.evaluate("() => MysteryAction.closeStation()")
        await pg.evaluate(FLOOR, ['raices', 'boss'])
        await pg.evaluate("() => { const G = MysteryAction, b = G.floorRT.boss; G.actors.push(b); for (let k = 0; k < 20; k++) G.update(1 / 60); document.querySelectorAll('#hud > *').forEach(e => e.style.visibility = 'hidden'); G.camera.snap(b.x, b.y + 60, G.world); G.renderer.draw(G, 1); }")
        boss = await pg.evaluate("() => MysteryAction.floorRT.boss.kind.name")
        await pg.screenshot(path=os.path.join(SHOT_DIR, 'story_raices.png'))
        check('guarida de Raíces Hondas con el Eco de Robletón', boss == 'Eco de Robletón', boss)
        await pg.evaluate("() => MysteryAction.endRun('return')"); await pg.wait_for_timeout(500)
        # --- Cerrar y volver a cargar
        await pg.close(); pg = await ctx.new_page(); pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.goto('file://' + os.path.abspath(SRC)); await pg.wait_for_timeout(400)
        e = await pg.evaluate("() => { const G = MysteryAction; G.continueGame(); const s = G.save; return { pages: s.codex.pages, ch: s.story.choices, title: Guild.title(s), tw: s.story.flags.includes('tercera_via'), off: s.codex.offerings.length }; }")
        check('tras cerrar y volver a cargar: páginas, decisión, ofrendas, tercera vía y título siguen ahí', e['pages'] == ['p1', 'p2', 'p3', 'p4', 'p5'] and e['ch'] == {'bernardo': 'liberar'} and e['tw'] and e['off'] == 3 and e['title'] == 'Lector del diario de Irene', e)
        check('sin errores de JavaScript', not errs, errs[:3])
        await br.close()
    print(f'{sum(R)}/{len(R)} correctas'); return all(R)
if __name__ == '__main__': sys.exit(0 if asyncio.run(main()) else 1)
