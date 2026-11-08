"""Gromgar sin red, en el navegador con el prototipo real:
 - furia al 60 %: escena con la explicación y derrumbe (rocas sólidas dibujadas);
 - carga contra una roca → «aturdido» en la barra; tres → «¡DERRIBADO! Defensa −40 %» con el motivo;
 - el telegráfico de cada ataque se dibuja sin errores (golpe, roca, carga, avalancha) y la carga se ve
   como un carril que se fija antes de salir;
 - al morir: nada suyo sigue (piedras avisadas, rocas cayendo) y el trofeo único se da una sola vez;
 - fotograma por debajo de 12 ms con las rocas y los avisos en pantalla.
Uso: python3 tests/e2e/boss_gromgar.py tests/.tmp/prototype.html   (SHOT_DIR para las capturas)"""
import asyncio, json, os, sys
from playwright.async_api import async_playwright
SRC = sys.argv[1]; SHOT_DIR = os.environ.get('SHOT_DIR', 'tests/.tmp')
R = []
def check(n, ok, info=''):
    R.append(bool(ok)); print(('PASS ' if ok else 'FAIL ') + n, json.dumps(info, ensure_ascii=False)[:400] if info != '' else '', flush=True)

SETUP = r'''() => { const G = MysteryAction; G.save = Save.fresh('guerrero'); G.save.arrived = true; G.save.cleared = ['bosque', 'gruta', 'cienaga']; G.save.jobs = [];
  G.startDungeon('mina', 3); G.loadStep(G.run.seq.length - 1); document.getElementById('floorcard').hidden = true; G.cine = null; UI.hideBoons(); G.paused = false;
  window.TB = { G, b: G.floorRT.boss, step: n => { for (let i = 0; i < n; i++) { G.update(1 / 60); if (G.cine) G.cine.t = 1e9; } } };
  G.player.invincible = true; TB.b.aggro = true; TB.step(60); return TB.b.kind.name; }'''
CHARGE = r'''k => { const { G, b } = TB, K = BossKit, D = K.DEFS.gromgar, p = G.player; K.st(b).hits = k; G.actors = G.actors.filter(a => a === b || !(a instanceof Enemy)); G.zones.length = 0;   // nada en medio de la carga   // (choques fortuitos de la espera, fuera)
  for (const rk of G.boulders.filter(o => o.solid)) for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const bx = rk.cx - dx * 120, by = rk.cy - dy * 120, px = rk.cx + dx * 96, py = rk.cy + dy * 96;
    if (b.free(G.world, bx, by) && p.free(G.world, px, py)) { b.x = b.px = bx; b.y = b.py = by; p.placeAt(px, py); K.begin(b, G, D.moves.carga, K.st(b), D, p); return rk.id; } }
  return null; }'''

async def main():
    async with async_playwright() as pw:
        br = await pw.chromium.launch(); pg = await br.new_page(viewport={'width': 1280, 'height': 720})
        errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.goto('file://' + os.path.abspath(SRC)); await pg.wait_for_timeout(500)
        check('la guarida de la Mina Olvidada es la de Gromgar', await pg.evaluate(SETUP) == 'Gromgar')
        # telegráficos de cada ataque (fase 0 y final) dibujados sin errores
        tele = await pg.evaluate(r'''() => { const { G, b } = TB, K = BossKit, D = K.DEFS.gromgar, out = {};
          for (const id of ['golpe', 'roca', 'carga', 'avalancha']) { K.begin(b, G, D.moves[id], K.st(b), D, G.player); TB.step(20); G.camera.snap(b.x, b.y, G.world); G.renderer.draw(G, 1); out[id] = { state: b.state, pattern: b.pattern, tele: b.windupTime }; TB.step(200); }
          return out; }''')
        check('cada ataque avisa (estado «windup», ≥ 0,6 s) y se dibuja', all(v['state'] == 'windup' and v['tele'] >= .6 for v in tele.values()), tele)
        r = await pg.evaluate(r'''() => { const { G, b } = TB; b.hp = Math.floor(b.maxHp * .59); G.update(1 / 60);
          const out = { cine: G.cine && G.cine.kind, card: document.getElementById('floorcard-text').textContent }; G.cine = null; TB.step(330);
          out.rocks = G.boulders.filter(o => o.solid && G.world.isSolid(o.tx, o.ty)).length; UI.updateHud && UI.updateHud(G); return out; }''')
        check('60 %: escena de furia con la explicación y derrumbe de 4 rocas sólidas', r['cine'] == 'rage' and 'roca' in r['card'] and r['rocks'] == 4, r)
        hud = []
        for k in range(3):
            rid = await pg.evaluate(CHARGE, k)
            # paso y lectura de la barra en la misma evaluación (el bucle del juego no avanza entre medias)
            hud.append(await pg.evaluate("(() => { TB.step(110); UI.updateHud(TB.G); const S = BossKit.st(TB.b); return [S.stage, document.getElementById('boss-name').textContent, S.phase, S.hits]; })()"))
            if k == 0:
                await pg.evaluate("(() => { const { G, b } = TB; G.camera.snap(G.player.x, G.player.y, G.world); G.renderer.draw(G, 1); })()")
                await pg.screenshot(path=os.path.join(SHOT_DIR, 'gromgar_aturdido.png'))
            if k < 2: await pg.evaluate("TB.step(200)")
        check('choques 1 y 2: aturdido (en la barra)', all(h[0] == 'stun' and 'aturdido' in h[1] for h in hud[:2]), hud)
        check('choque 3: DERRIBADO, defensa −40 % y el motivo en la barra', hud[2][0] == 'vuln' and 'DERRIBADO' in hud[2][1] and '−40 %' in hud[2][1] and '3 choques' in hud[2][1], hud[2])
        await pg.evaluate("(() => { const { G, b } = TB; G.camera.snap(b.x, b.y, G.world); G.renderer.draw(G, 1); })()")
        await pg.screenshot(path=os.path.join(SHOT_DIR, 'gromgar_derribado.png'))
        ms = await pg.evaluate("(() => { const { G } = TB; for (let i = 0; i < 8; i++) G.renderer.draw(G, 1); const f = []; for (let i = 0; i < 9; i++) { const t0 = performance.now(); G.renderer.draw(G, 1); f.push(performance.now() - t0); } f.sort((a, b) => a - b); return f[4]; })()")
        check('fotograma con rocas y avisos por debajo de 12 ms', ms < 12, round(ms, 2))
        # muerte en mitad de la avalancha
        d = await pg.evaluate(r'''() => { const { G, b } = TB, K = BossKit, D = K.DEFS.gromgar; TB.step(500);
          K.begin(b, G, D.moves.avalancha, K.st(b), D, G.player); TB.step(75); BossArena.dropRocks(b, G, 1, { hp: 3, fall: 2 });
          const before = { zones: G.zones.filter(z => z.owner === b).length, falling: G.boulders.filter(o => o.fall > 0).length };
          G.player.invincible = false; const hp = G.player.hp;
          Combat.hit(G, b, { team: 'player', fixed: 1e8, src: G.player }); TB.step(10); G.player.hp = G.player.maxHp; const hp1 = G.player.hp; TB.step(240);
          return { before, alive: b.alive, zones: G.zones.filter(z => z.owner === b).length, falling: G.boulders.filter(o => o.fall > 0).length, lost: hp1 - G.player.hp }; }''')
        check('muere en mitad de la avalancha: sin piedras ni rocas pendientes y sin daño después', d['before']['zones'] > 0 and d['before']['falling'] > 0 and not d['alive'] and d['zones'] == 0 and d['falling'] == 0 and d['lost'] <= 0, d)
        rw = await pg.evaluate(r'''() => { const { G } = TB, s = G.save, p = G.player;
          const l1 = BossKit.grant(s, 'gromgar', p.bag), n1 = p.bag.count ? p.bag.count('colmilloGromgar') : p.bag.stacks.filter(x => x.id === 'colmilloGromgar').reduce((t, x) => t + x.qty, 0);
          const l2 = BossKit.grant(s, 'gromgar', p.bag), n2 = p.bag.stacks.filter(x => x.id === 'colmilloGromgar').reduce((t, x) => t + x.qty, 0);
          const back = Save.sanitize(JSON.parse(JSON.stringify(s))).data.bosses;
          return { l1, l2, n1, n2, back }; }''')
        check('trofeo único la primera vez, una sola vez; el progreso se guarda', rw['n1'] == 1 and rw['n2'] == 1 and 'Trofeo único' in rw['l1'][0] and 'vencido 2 veces' in rw['l2'][0] and rw['back']['gromgar']['kills'] == 2, rw)
        # --- Robletón, el Guardián de Espinas: el mismo BossKit con otro escenario
        rb = await pg.evaluate(r'''() => { const G = MysteryAction; G.save = Save.fresh('mago'); G.save.arrived = true; G.save.jobs = [];
          G.startDungeon('bosque', 4); G.loadStep(G.run.seq.length - 1); document.getElementById('floorcard').hidden = true; G.cine = null; UI.hideBoons(); G.paused = false;
          const b = G.floorRT.boss, K = BossKit, D = K.DEFS.espinas; window.TB = { G, b, step: n => { for (let i = 0; i < n; i++) { G.update(1 / 60); if (G.cine) G.cine.t = 1e9; } } };
          G.player.invincible = true; b.aggro = true; TB.step(90);
          const out = { name: b.kind.name, title: b.kind.title, stumps: G.boulders.filter(o => o.solid && o.look === 'stump').length, tele: {} };
          for (const id of ['zarpazo', 'raices', 'salto']) { K.begin(b, G, D.moves[id], K.st(b), D, G.player); TB.step(20); G.camera.snap(b.x, b.y, G.world); G.renderer.draw(G, 1); out.tele[id] = b.state; TB.step(200); }
          b.hp = Math.floor(b.maxHp * .64); G.update(1 / 60); out.cine = G.cine && G.cine.kind; out.card = document.getElementById('floorcard-text').textContent; G.cine = null; TB.step(200);
          out.plants = G.actors.filter(a => a.alive && a.kind && a.kind.id === 'broteSavia').length;
          return out; }''')
        await pg.wait_for_function("/protegido por la savia/.test(document.getElementById('boss-name').textContent)", timeout=4000)
        await pg.evaluate("(() => { const { G, b } = TB; G.camera.snap(b.x, b.y, G.world); G.renderer.draw(G, 1); })()")
        await pg.screenshot(path=os.path.join(SHOT_DIR, 'espinas_savia.png'))
        rb['hud'] = await pg.evaluate("document.getElementById('boss-name').textContent")
        check('Robletón, el Guardián de Espinas: tocones, avisos de sus tres ataques, escena de la savia, brotes y barra que explica la protección',
              rb['name'] == 'Robletón' and rb['stumps'] == 4 and all(v == 'windup' for v in rb['tele'].values()) and rb['cine'] == 'rage' and 'brotes de savia' in rb['card'] and rb['plants'] == 2 and 'protegido por la savia (2 brotes)' in rb['hud'], rb)
        check('sin errores de JavaScript', not errs, errs[:3])
        await br.close()
    print(f'{sum(R)}/{len(R)} correctas'); return all(R)
if __name__ == '__main__': sys.exit(0 if asyncio.run(main()) else 1)
