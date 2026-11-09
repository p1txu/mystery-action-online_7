"""Aldea que evoluciona, en el navegador con el prototipo real (sin conexión):
 - con rango Bronce y la Gruta superada, el tablón ofrece el contrato de la herrera; la casa del sur está en ruinas;
 - al entregarlo, la casa se convierte en la forja y llega la herrera Brasa (sin salir de la aldea);
 - Brasa vende el equipo especial de Bronce y no el de Plata; el alcalde comenta la forja;
 - evento regional: el invasor está en su piso, se le vence y se cobra una vez;
 - se guarda, se CIERRA la página y se vuelve a cargar: la forja, Brasa, la compra, el evento resuelto,
   la reputación y el título siguen ahí.
Uso: python3 tests/e2e/town_e2e.py tests/.tmp/prototype.html   (SHOT_DIR para las capturas)"""
import asyncio, json, os, sys
from playwright.async_api import async_playwright
SRC = sys.argv[1]; SHOT_DIR = os.environ.get('SHOT_DIR', 'tests/.tmp')
R = []
def check(n, ok, info=''):
    R.append(bool(ok)); print(('PASS ' if ok else 'FAIL ') + n, json.dumps(info, ensure_ascii=False)[:400] if info != '' else '', flush=True)

VIEW = """(TS) => { const G = MysteryAction; G.player.placeAt(13 * 32, 26 * 32); for (let i = 0; i < 20; i++) G.update(1/60);
  document.querySelectorAll('#hud > *').forEach(e => e.style.visibility = 'hidden'); G.camera.snap(7 * 32, 19.5 * 32, G.world); G.renderer.draw(G, 1); }"""

async def main():
    async with async_playwright() as pw:
        br = await pw.chromium.launch(); ctx = await br.new_context(viewport={'width': 1100, 'height': 700}); pg = await ctx.new_page()
        errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.goto('file://' + os.path.abspath(SRC)); await pg.wait_for_timeout(400)
        a = await pg.evaluate(r'''() => { localStorage.clear(); const G = MysteryAction; const s = Save.sanitize(Save.fresh('guerrero')).data;
          s.arrived = true; s.cleared = ['bosque', 'gruta']; s.points = 80; s.bank = 900; s.board = Jobs.board(s, 77); G.save = s; Save.write(s); G.goBase();
          document.getElementById('floorcard').hidden = true;
          return { forgeNpc: !!G.village.npcs.forge, project: (s.board.find(j => j.project) || {}).title || null, pj: s.board.find(j => j.project) && Jobs.title(s.board.find(j => j.project)) }; }''')
        check('casa del sur en ruinas y contrato de la herrera en el tablón', not a['forgeNpc'] and 'Fragmento de cuarzo' in (a['pj'] or ''), a)
        await pg.evaluate(VIEW); await pg.screenshot(path=os.path.join(SHOT_DIR, 'town_ruinas.png'))
        b = await pg.evaluate(r'''() => { const G = MysteryAction, s = G.save, pj = s.board.find(j => j.project);
          G.acceptJob(pj.id); const j = s.jobs.find(q => q.project); j.progress = j.goal; j.state = 'done';   // (preparación: los fragmentos ya traídos)
          G.deliverJob(j.id);
          return { upgrades: s.town.upgrades, forgeNpc: !!G.village.npcs.forge, stock: forgeStock(s), mayor: VillageIntro.news(s)[0] }; }''')
        check('al entregarlo: forja construida y Brasa llega sin salir de la aldea', b['upgrades'] == ['forja'] and b['forgeNpc'], b)
        check('el alcalde comenta la forja', 'Brasa' in b['mayor'], b['mayor'])
        await pg.evaluate("(() => { const G = MysteryAction; G.closeStation && G.station && G.closeStation(); UI.show('play'); G.paused = false; })()")
        await pg.evaluate(VIEW); await pg.screenshot(path=os.path.join(SHOT_DIR, 'town_forja.png'))
        c = await pg.evaluate(r'''() => { const G = MysteryAction, s = G.save; G.paused = false;
          const ok = G.buyItem('yelmoBrasa'), no = G.buyItem('insigniaGremio');
          G.openStation('forge'); const txt = document.getElementById('dialog-btns').textContent; document.getElementById('dialog-btns').lastChild.click();
          return { ok, no, has: G.baseInv().count('yelmoBrasa'), txt }; }''')
        check('Brasa vende el equipo de Bronce y no el de Plata', c['ok'] and not c['no'] and c['has'] == 1 and 'rango Plata' in c['txt'], c)
        # --- Evento regional en el Bosque (piso 2): vencer al invasor
        d = await pg.evaluate(r'''() => { const G = MysteryAction, s = G.save;
          s.events.active = { id: 'inv-e2e', type: 'invasor', dungeon: 'bosque', floor: 2, variant: 'pufon', name: 'Rompecercas', startRun: 0, endsRun: 3 };   // (preparación)
          G.startDungeon('bosque', 11); const i = G.run.seq.findIndex(q => q.kind === 'normal' && q.floorNo === 2); G.loadStep(i);
          document.getElementById('floorcard').hidden = true; G.cine = null; UI.hideBoons && UI.hideBoons(); G.paused = false;
          const inv = G.actors.find(a => a.invader); if (!inv) return { none: true };
          const p0 = s.points, b0 = s.bank; G.player.invincible = true;
          Combat.hit(G, inv, { team: 'player', fixed: 1e8, src: G.player }); for (let k = 0; k < 30; k++) G.update(1 / 60);
          Combat.hit(G, inv, { team: 'player', fixed: 1e8, src: G.player }); for (let k = 0; k < 10; k++) G.update(1 / 60);
          return { name: inv.nameTag, dead: !inv.alive, rep: s.points - p0, gems: s.bank - b0, active: s.events.active, hist: s.events.history.map(h => h.result), elixir: G.player.bag.count('elixir') }; }''')
        check('el invasor está en su piso y vencerlo resuelve el evento una vez (+30, +120 monedas en el Bosque, elíxir)', not d.get('none') and d['name'] == 'Invasor: Rompecercas' and d['dead'] and d['rep'] == 30 and d['gems'] == 120 and d['active'] is None and d['hist'] == ['won'] and d['elixir'] >= 1, d)
        await pg.evaluate("(() => { const G = MysteryAction; G.endRun('return'); })()"); await pg.wait_for_timeout(600)
        # --- Cerrar la página y volver a cargar
        await pg.close(); pg = await ctx.new_page(); pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.goto('file://' + os.path.abspath(SRC)); await pg.wait_for_timeout(400)
        e = await pg.evaluate(r'''() => { const G = MysteryAction; G.continueGame(); const s = G.save; if (G.mode !== 'village') G.goBase();
          document.getElementById('floorcard').hidden = true;
          UI.renderGuild(G); const guild = document.getElementById('guild-info').textContent;
          return { upgrades: s.town.upgrades, forgeNpc: !!G.village.npcs.forge, helm: Inventory.prototype.count.call({ stacks: s.inv }, 'yelmoBrasa'), events: s.events, claims: s.guild.claims, points: s.points, guild, mayor: VillageIntro.news(s) }; }''')
        check('tras cerrar y volver a cargar: forja, Brasa y el yelmo comprado siguen ahí', e['upgrades'] == ['forja'] and e['forgeNpc'] and e['helm'] == 1, e)
        check('tras cerrar y volver a cargar: el evento sigue resuelto (no se puede cobrar otra vez)', e['events']['active'] is None and [h['result'] for h in e['events']['history']] == ['won'] and 'event:inv-e2e' in e['claims'], e['events'])
        check('el gremio muestra el título y la reputación', 'Explorador de Bronce' in e['guild'] and str(e['points']) in e['guild'], e['guild'][:200])
        check('el alcalde recuerda al invasor echado', any('invasor' in l for l in e['mayor']), e['mayor'])
        await pg.evaluate(VIEW); await pg.screenshot(path=os.path.join(SHOT_DIR, 'town_forja_recargada.png'))
        check('sin errores de JavaScript', not errs, errs[:3])
        await br.close()
    print(f'{sum(R)}/{len(R)} correctas'); return all(R)
if __name__ == '__main__': sys.exit(0 if asyncio.run(main()) else 1)
