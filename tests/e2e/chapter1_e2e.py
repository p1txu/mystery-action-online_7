"""Capítulo 1 «Las raíces enfermas» en el navegador, con el prototipo real (sin conexión), de principio a fin:
 - introducción en la aldea: rótulo del capítulo y diálogos del alcalde; llega Nara Vey (vecina nueva);
 - el gremio ofrece la misión principal y la de Irene; se acepta;
 - Nara Vey: conversación y sus misiones;
 - el Linde de Brumaverde desde la puerta: rastros que se leen andando, élite, mecanismo y salida a la aldea;
 - el informe a Nara; la estela tibia y el refugio de Gil en el Bosque; el alcalde y su misión;
 - la guarida: Robletón con sus tocones, vencido; cofre del jefe;
 - entregar la principal: recompensas y la aldea cambia (árboles del camino del oeste); cerrar y volver a cargar.
Uso: python3 tests/e2e/chapter1_e2e.py tests/.tmp/prototype.html   (SHOT_DIR para las capturas)"""
import asyncio, json, os, sys
from playwright.async_api import async_playwright
SRC = sys.argv[1]; SHOT_DIR = os.environ.get('SHOT_DIR', 'tests/.tmp')
R = []
def check(n, ok, info=''):
    R.append(bool(ok)); print(('PASS ' if ok else 'FAIL ') + n, json.dumps(info, ensure_ascii=False)[:420] if info != '' else '', flush=True)

DLG = "() => ({ shown: !document.getElementById('dialog').hidden, text: document.getElementById('dialog-text').textContent, btns: [...document.querySelectorAll('#dialog-btns button')].map(b => b.textContent) })"
GO = r'''([dng, floorNo]) => { const G = MysteryAction; G.startDungeon(dng, 3131); const i = G.run.seq.findIndex(q => floorNo === 'boss' ? q.kind === 'boss' : q.kind === 'normal' && q.floorNo === floorNo);
  G.loadStep(i); document.getElementById('floorcard').hidden = true; G.cine = null; UI.hideBoons && UI.hideBoons(); G.paused = false; return G.floorRT.story.map(s => s.id); }'''
WEST = """() => { const G = MysteryAction; document.querySelectorAll('#hud > *').forEach(e => e.style.visibility = 'hidden'); G.player.placeAt(6 * 32, 17 * 32); for (let k = 0; k < 10; k++) G.update(1/60); G.camera.snap(5 * 32, 17 * 32, G.world); G.renderer.draw(G, 1); }"""
async def click_all(pg, n=8):
    for _ in range(n):
        d = await pg.evaluate(DLG)
        if not d['shown']: return
        await pg.click('#dialog-btns button'); await pg.wait_for_timeout(80)

async def main():
    async with async_playwright() as pw:
        br = await pw.chromium.launch(); ctx = await br.new_context(viewport={'width': 1100, 'height': 700}); pg = await ctx.new_page()
        errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.goto('file://' + os.path.abspath(SRC)); await pg.wait_for_timeout(400)
        await pg.evaluate("() => { localStorage.clear(); const G = MysteryAction; const s = Save.sanitize(Save.fresh('guerrero')).data; s.arrived = true; G.save = s; Save.write(s); G.goBase(); }")
        # --- Introducción del capítulo
        await pg.wait_for_timeout(3600)
        d = await pg.evaluate(DLG); card = await pg.evaluate("() => document.getElementById('floorcard-text').textContent")
        check('introducción: rótulo del capítulo y el alcalde cuenta lo que pasa', 'Las raíces enfermas' in card and 'Nara Vey' in d['text'] and d['shown'], {'card': card, 'd': d['text'][:120]})
        await pg.screenshot(path=os.path.join(SHOT_DIR, 'c1_intro.png'))
        await click_all(pg); await pg.wait_for_timeout(300)
        st = await pg.evaluate("() => ({ flag: MysteryAction.save.story.flags.includes('c1_intro'), nara: !!MysteryAction.village.npcs.nara, stored: JSON.parse(localStorage.getItem(SAVE_KEY)).data.story.flags })")
        check('tras la introducción llega Nara Vey a la aldea y se guarda', st['flag'] and st['nara'] and 'c1_intro' in st['stored'], st)
        await pg.evaluate(WEST); await pg.screenshot(path=os.path.join(SHOT_DIR, 'c1_aldea_antes.png'))
        # --- Gremio: misiones
        await pg.evaluate("() => { MysteryAction.paused = false; MysteryAction.openStation('guild'); }")
        q = await pg.evaluate("() => [...document.querySelectorAll('#guild-quests [data-qaccept]')].map(b => b.dataset.qaccept)")
        check('el gremio ofrece «Las raíces enfermas» y «La marca de Irene»', sorted(q) == ['c1_irene', 'c1_main'], q)
        await pg.click('[data-qaccept="c1_main"]'); await pg.wait_for_timeout(200)
        t = await pg.evaluate("() => ({ out: (document.querySelector('#codex-talks .talk-out, #nara-talks .talk-out') || {}).textContent || '', log: document.getElementById('chapter-box').textContent, st: Campaign.state(MysteryAction.save, 'c1_main') })")
        check('misión aceptada: Ulula explica la investigación y el diario muestra los pasos', t['st'] == 'active' and 'ojos' in t['out'] and 'Nara Vey en su campamento' in t['log'], t['out'][:200])
        await pg.screenshot(path=os.path.join(SHOT_DIR, 'c1_gremio.png'))
        await pg.evaluate("() => MysteryAction.closeStation()")
        # --- Nara Vey
        await pg.evaluate("() => { MysteryAction.paused = false; MysteryAction.openStation('nara'); }")
        await pg.click('[data-talk="nara_c1"]'); await pg.wait_for_timeout(200)
        n = await pg.evaluate("() => ({ out: document.getElementById('nara-talks').textContent, quests: [...document.querySelectorAll('#nara-quests [data-qaccept]')].map(b => b.dataset.qaccept), visible: getComputedStyle(document.getElementById('nara-box')).display })")
        check('Nara Vey habla del bosque y ofrece sus dos misiones', 'Linde' in n['out'] and sorted(n['quests']) == ['c1_elite', 'c1_poda'] and n['visible'] != 'none', n)
        await pg.screenshot(path=os.path.join(SHOT_DIR, 'c1_nara.png'))
        for qid in ['c1_poda', 'c1_elite']: await pg.click(f'[data-qaccept="{qid}"]'); await pg.wait_for_timeout(150)
        await pg.evaluate("() => MysteryAction.closeStation()")
        # --- El Linde
        await pg.evaluate("() => { MysteryAction.paused = false; MysteryAction.openStation('gate'); }")
        gate = await pg.evaluate("() => { const b = document.getElementById('explore-linde'); return { first: document.querySelector('#dng-list .dng b').textContent, btn: b && b.textContent }; }")
        check('la puerta ofrece el Linde de Brumaverde como zona de exploración', 'Linde' in gate['first'] and gate['btn'] == 'Ir', gate)
        await pg.evaluate("() => MysteryAction.closeStation()")
        ids = await pg.evaluate(GO, ['linde', 1])
        z = await pg.evaluate("() => { const f = MysteryAction.floorRT; return { elite: MysteryAction.actors.filter(a => a instanceof Enemy && a.elite).map(a => a.kindId), mech: f.L.rooms.filter(r => r.prefab).map(r => r.prefab), stairs: !!f.L.stairs }; }")
        check('Linde: 4 rastros, la zarza élite y un mecanismo ambiental', sorted(ids) == ['z_campamento', 'z_huellas', 'z_raiz', 'z_savia'] and 'zarza' in z['elite'] and any(p in z['mech'] for p in ['esporas', 'raices_punzantes', 'raices_rompibles']), z)
        # élite: se le vence de verdad (combate del juego) y cuenta para la misión
        await pg.evaluate("() => { const G = MysteryAction, e = G.actors.find(a => a instanceof Enemy && a.elite); G.player.placeAt(e.x + 40, e.y); G.player.invincible = true; Combat.hit(G, e, { team: 'player', fixed: 1e8, src: G.player }); for (let k = 0; k < 20; k++) G.update(1/60); }")
        await pg.evaluate("() => { const G = MysteryAction; G.actors = G.actors.filter(a => !(a instanceof Enemy)); G.floorRT.g.actors = G.actors; }")
        texts = []
        for i in range(4):
            await pg.evaluate(f"() => {{ const G = MysteryAction, st = G.floorRT.story[{i}]; G.player.placeAt(st.x, st.y); }}")
            d = await pg.evaluate("() => { const G = MysteryAction; for (let k = 0; k < 3; k++) G.update(1/60); return document.getElementById('dialog-text').textContent; }")
            texts.append(d[:40]); await click_all(pg, 2)
        await pg.evaluate("() => { const G = MysteryAction, st = G.floorRT.story[0]; G.player.placeAt(st.x + 40, st.y + 40); document.querySelectorAll('#hud > *').forEach(e => e.style.visibility = 'hidden'); G.camera.snap(st.x, st.y, G.world); G.renderer.draw(G, 1); }")
        await pg.screenshot(path=os.path.join(SHOT_DIR, 'c1_linde.png'))
        await pg.evaluate("() => document.querySelectorAll('#hud > *').forEach(e => e.style.visibility = '')")
        c = await pg.evaluate("() => ({ lore: MysteryAction.save.codex.lore, el: MysteryAction.save.story.counters.c1_elites, elite: Campaign.state(MysteryAction.save, 'c1_elite') })")
        check('los rastros se leen andando y quedan en el registro; el élite cuenta («Espinas negras» lista)', all(x in c['lore'] for x in ['z_raiz', 'z_savia', 'z_huellas', 'z_campamento']) and c['el'] == 1 and c['elite'] == 'ready', {'c': c, 't': texts})
        await pg.evaluate("() => { const G = MysteryAction, s = G.floorRT.L.stairs; G.player.placeAt((s.tx + .5) * 32, (s.ty + .5) * 32); for (let k = 0; k < 5; k++) G.update(1/60); }")
        await pg.wait_for_timeout(600)
        res = await pg.evaluate("() => ({ title: (document.querySelector('#result h2') || {}).textContent || '', cleared: MysteryAction.save.cleared, runs: MysteryAction.save.runs })")
        check('el sendero del Linde devuelve a la aldea (no cuenta como mazmorra completada)', 'De vuelta en la aldea' in res['title'] and 'linde' not in res['cleared'] and res['runs'] == 1, res)
        # --- Informe a Nara, Bosque piso 1 (estela y Gil), alcalde
        await pg.evaluate("() => { const G = MysteryAction; G.goBase(); document.getElementById('floorcard').hidden = true; G.paused = false; G.openStation('nara'); }")
        await pg.click('[data-talk="nara_rastros"]'); await pg.wait_for_timeout(150)
        talk = await pg.evaluate("() => document.getElementById('nara-talks').textContent")
        await pg.click('[data-qturn="c1_elite"]'); await pg.wait_for_timeout(150)
        nr = await pg.evaluate("() => ({ done: Campaign.state(MysteryAction.save, 'c1_elite'), paid: MysteryAction.save.guild.claims.filter(c => c === 'quest:c1_elite').length, again: !!document.querySelector('[data-qturn=\"c1_elite\"]') })"); nr['out'] = talk
        check('Nara saca conclusiones de los rastros y paga «Espinas negras» una vez', 'estela' in nr['out'] and nr['done'] == 'done' and nr['paid'] == 1 and not nr['again'], nr)
        await pg.evaluate("() => MysteryAction.closeStation()")
        ids1 = await pg.evaluate(GO, ['bosque', 1])
        await pg.evaluate("() => { const G = MysteryAction; G.actors = G.actors.filter(a => !(a instanceof Enemy)); G.floorRT.g.actors = G.actors; }")
        got = []
        for sid in ['estela_tibia', 'refugio_gil']:
            await pg.evaluate(f"() => {{ const G = MysteryAction, st = G.floorRT.story.find(q => q.id === '{sid}'); G.player.placeAt(st.x, st.y); }}")
            got.append((await pg.evaluate("() => { const G = MysteryAction; for (let k = 0; k < 3; k++) G.update(1/60); return document.getElementById('dialog-text').textContent; }"))[:200]); await click_all(pg, 2)
        check('Bosque, piso 1: la estela tibia y Gil tras la pared hueca', sorted(ids1) == ['estela_tibia', 'refugio_gil'] and 'Estela' in got[0] and 'Gil' in got[1], {'ids': ids1, 'got': got})
        # --- Guarida: Robletón
        await pg.evaluate("() => MysteryAction.endRun('return')"); await pg.wait_for_timeout(500)
        await pg.evaluate(GO, ['bosque', 'boss'])
        b = await pg.evaluate("() => { const G = MysteryAction, b = G.floorRT.boss; for (let k = 0; k < 60; k++) G.update(1/60); return { name: b.kind.name, stumps: (G.boulders || []).filter(r => r.solid).length, phase: BossKit.st(b).phase }; }")
        await pg.evaluate("() => { const G = MysteryAction, b = G.floorRT.boss; document.querySelectorAll('#hud > *').forEach(e => e.style.visibility = 'hidden'); G.camera.snap(b.x, b.y + 60, G.world); G.renderer.draw(G, 1); }")
        await pg.screenshot(path=os.path.join(SHOT_DIR, 'c1_guarida.png'))
        await pg.evaluate("() => document.querySelectorAll('#hud > *').forEach(e => e.style.visibility = '')")
        await pg.evaluate("() => { const G = MysteryAction, b = G.floorRT.boss; G.player.invincible = true; Combat.hit(G, b, { team: 'player', fixed: 1e9, src: G.player }); for (let k = 0; k < 40; k++) G.update(1/60); }")
        await click_all(pg, 3)
        w = await pg.evaluate("() => { const G = MysteryAction, f = G.floorRT; return { warp: f.objects.some(o => o.type === 'warp'), chest: f.objects.some(o => o.tier === 'cofreJefe'), seal: f.objects.some(o => o.type === 'seal') }; }")
        check('guarida: Robletón con sus tocones; al caer, salida, cofre del jefe y rueda', b['name'] == 'Robletón' and b['stumps'] >= 4 and all(w.values()), {'b': b, 'w': w})
        await pg.evaluate("() => { const G = MysteryAction, o = G.floorRT.objects.find(q => q.type === 'warp'); G.player.placeAt(o.x, o.y); for (let k = 0; k < 4; k++) G.update(1/60); }")
        await pg.wait_for_timeout(600)
        cl = await pg.evaluate("() => ({ cleared: MysteryAction.save.cleared, crown: MysteryAction.baseInv().count('coronaEspinas'), st: Campaign.state(MysteryAction.save, 'c1_main') })")
        check('Bosque completado: trofeo y misión principal lista para entregar', 'bosque' in cl['cleared'] and cl['crown'] == 1 and cl['st'] == 'ready', cl)
        # --- Alcalde (Gil) y entrega de la principal
        await pg.evaluate("() => { const G = MysteryAction; G.goBase(); document.getElementById('floorcard').hidden = true; G.paused = false; G.openStation('mayor'); }")
        d = await pg.evaluate(DLG)
        has = [x for x in d['btns'] if 'leñador' in x]
        if has: await pg.click(f'#dialog-btns button:has-text("{has[0]}")'); await pg.wait_for_timeout(150)
        await click_all(pg, 2)
        await pg.evaluate("() => { MysteryAction.paused = false; MysteryAction.openStation('mayor'); }")
        d2 = await pg.evaluate(DLG); ent = [x for x in d2['btns'] if x.startswith('Entregar')]
        if ent: await pg.click(f'#dialog-btns button:has-text("{ent[0]}")'); await pg.wait_for_timeout(150)
        d3 = await pg.evaluate(DLG)
        check('el alcalde da «El leñador desaparecido» y la entrega ya hecha (Gil rescatado antes)', bool(has) and bool(ent) and 'Gil está vivo' in d3['text'], {'btns': d['btns'], 'd3': d3['text'][:80]})
        await click_all(pg, 2)
        before = await pg.evaluate("() => ({ bank: MysteryAction.save.bank, exp: MysteryAction.save.prog.exp, lv: MysteryAction.save.prog.level, pts: MysteryAction.save.points })")
        await pg.evaluate("() => { MysteryAction.paused = false; MysteryAction.openStation('guild'); }")
        await pg.click('[data-qturn="c1_main"]'); await pg.wait_for_timeout(300)
        after = await pg.evaluate("() => ({ bank: MysteryAction.save.bank, lv: MysteryAction.save.prog.level, pts: MysteryAction.save.points, broche: MysteryAction.baseInv().count('brocheRoble'), done: MysteryAction.save.story.flags.includes('c1_done'), btn: !!document.querySelector('[data-qturn=\"c1_main\"]'), out: (document.querySelector('#codex-talks .talk-out') || {}).textContent || '' })")
        check('principal entregada: +260 monedas, +30 de reputación, broche, EXP; sin botón para cobrarla otra vez', after['bank'] == before['bank'] + 260 and after['pts'] == before['pts'] + 30 and after['broche'] == 1 and after['done'] and not after['btn'], {'b': before, 'a': after})
        await pg.evaluate("() => MysteryAction.closeStation()"); await pg.wait_for_timeout(2200)
        sick = await pg.evaluate("() => { const sc = MysteryAction.village.scene || TownScene.build(MysteryAction.world, MysteryAction); return MysteryAction.village.scene === null; }")
        await pg.evaluate(WEST); await pg.screenshot(path=os.path.join(SHOT_DIR, 'c1_aldea_despues.png'))
        news = await pg.evaluate("() => VillageIntro.news(MysteryAction.save)")
        check('la aldea cambia: el alcalde lo comenta y Nara se queda', any('vuelven a echar hojas' in l for l in news) and any('Gil' in l for l in news), news[:3])
        # --- Cerrar y volver a cargar
        await pg.close(); pg = await ctx.new_page(); pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.goto('file://' + os.path.abspath(SRC)); await pg.wait_for_timeout(400)
        e = await pg.evaluate("() => { const G = MysteryAction; G.continueGame(); if (G.mode !== 'village') G.goBase(); const s = G.save; return { q: s.story.quests, flags: s.story.flags, nara: !!G.village.npcs.nara, counters: s.story.counters }; }")
        check('tras cerrar y volver a cargar: misiones, cambio de la aldea y Nara Vey siguen ahí', e['q'].get('c1_main') == 'done' and 'c1_done' in e['flags'] and e['nara'], e)
        await pg.wait_for_timeout(2500)
        d = await pg.evaluate(DLG)
        check('la introducción no se repite al volver', not d['shown'], d['text'][:80])
        check('sin errores de JavaScript', not errs, errs[:3])
        await br.close()
    print(f'{sum(R)}/{len(R)} correctas'); return all(R)
if __name__ == '__main__': sys.exit(0 if asyncio.run(main()) else 1)
