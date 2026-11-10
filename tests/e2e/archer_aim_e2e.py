"""Apuntado del Arquero (sin conexión, el juego real): criterios que deben cumplirse siempre.
Usa el mismo guion de disparos que tests/e2e/archer_aim_bench.py (ratón real del juego y Player.tryBasic)."""
import asyncio, json, math, os, sys
from playwright.async_api import async_playwright
HERE = os.path.dirname(os.path.abspath(__file__)); SRC = sys.argv[1] if len(sys.argv) > 1 else 'tests/.tmp/prototype.html'
SHOT_DIR = os.environ.get('SHOT_DIR', 'tests/.tmp')
_b = open(os.path.join(HERE, 'archer_aim_bench.py')).read()
SETUP = _b.split('SETUP = r"""')[1].split('"""')[0]; SHOT = _b.split('SHOT = r"""')[1].split('"""')[0]
R = []
def check(n, ok, info=''):
    R.append(bool(ok)); print(('PASS ' if ok else 'FAIL ') + n, json.dumps(info, ensure_ascii=False)[:400] if info != '' else '', flush=True)
ANG = [0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330]
def rot(o, deg):   # el ratón a «deg» grados del enemigo, a la altura de sus pies
    f = o['foes'][0]; a0, a1 = math.radians(f['ang']), math.radians(f['ang'] + deg)
    o['aimOff'] = [math.cos(a1) * f['d'] - math.cos(a0) * f['d'], math.sin(a1) * f['d'] - math.sin(a0) * f['d']]; return o

async def main():
    async with async_playwright() as pw:
        br = await pw.chromium.launch(); pg = await br.new_page(viewport={'width': 1280, 'height': 800}); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.goto('file://' + os.path.abspath(SRC)); await pg.wait_for_timeout(400)
        async def run(assist, shots):
            await pg.evaluate(SETUP, {'assist': assist, 'seed': 11}); await pg.wait_for_timeout(300)
            return [await pg.evaluate(SHOT, o) for o in shots]
        hits = lambda rs, t=0: sum(r['hit'][t] for r in rs)
        # 1. Clic en la cabeza del sprite: mediano y jefe aciertan siempre (antes: 50 % y 33 %), con o sin asistencia
        for assist in (False, True):
            med = await run(assist, [dict(foes=[dict(kind='mordisquin', ang=a, d=d)], at='cabeza') for a in ANG for d in (90, 180, 270)])
            boss = await run(assist, [dict(foes=[dict(boss='robleton', ang=a, d=220)], at='cabeza') for a in ANG])
            check(f"clic en la parte alta del sprite ({'con' if assist else 'sin'} asistencia): mediano 36/36 y Robletón 12/12", hits(med) == 36 and hits(boss) == 12, [hits(med), hits(boss)])
        # 2. La asistencia ayuda al error humano, solo dentro de 12° y sin tocar a otro enemigo
        for assist in (False, True):
            r6 = await run(assist, [rot(dict(foes=[dict(kind='rata', ang=a, d=200)], at='pies'), 6) for a in ANG])
            r16 = await run(assist, [rot(dict(foes=[dict(kind='rata', ang=a, d=200)], at='pies'), 16) for a in ANG])
            if assist: check('con asistencia: ratón a 6° de una rata → 12/12; a 16° (fuera de los 12°) → 0/12, sin corrección', hits(r6) == 12 and hits(r16) == 0 and all(r['hint'] == -1 for r in r16), [hits(r6), hits(r16)])
            else: check('sin asistencia: ratón a 6° → casi nunca acierta (control manual intacto)', hits(r6) <= 2 and all(r['hint'] == -1 for r in r6), hits(r6))
        corr = await run(True, [rot(dict(foes=[dict(kind='rata', ang=a, d=200)], at='pies'), d) for a in ANG for d in (3, 6, 9, 10.5, 11.5)])
        check('la corrección nunca pasa de 12° y decrece hacia el borde (sin saltos)', max(abs(r['off']) for r in corr) <= 12.0 and max(abs(r['off']) for r in corr) > 0, max(abs(r['off']) for r in corr))
        # 3. Varios enemigos juntos: el disparo va al señalado, no a sus vecinos
        cl = await run(True, [dict(foes=[dict(kind='rata', ang=a - 7, d=200), dict(kind='rata', ang=a, d=200), dict(kind='rata', ang=a + 7, d=200)], at='centro', aimAt=1) for a in ANG])
        check('tres ratas juntas, clic en la central (con asistencia): 12/12 a la central y 0 a las otras', hits(cl, 1) == 12 and sum(r['hit'][0] + r['hit'][2] for r in cl) == 0, [hits(cl, 1)])
        # 4. Detrás de un muro: ni corrección ni marca cuando el muro tapa la línea
        wall = await run(True, [rot(dict(foes=[dict(kind='rata', ang=a, d=200)], at='pies', wall=[math.cos(math.radians(a)) * 100, math.sin(math.radians(a)) * 100]), 5) for a in ANG])
        blocked = [r for r in wall if not r['clear']]
        check('enemigo detrás de un muro: si el muro tapa la línea, no hay corrección, ni marca, ni impacto', blocked and all(r['hint'] == -1 and r['mark'] == -1 and not r['hit'][0] for r in blocked), len(blocked))
        # 5. Sin adelantar: un enemigo que cruza de lado sigue sin alcanzarse apuntando a donde está
        lat = await run(True, [dict(foes=[dict(kind='rata', ang=a, d=200, mv=[-90 * math.sin(math.radians(a)), 90 * math.cos(math.radians(a))])], at='centro') for a in ANG])
        check('enemigo cruzando a 90 px/s con asistencia: no se adelanta el disparo (0/12, igual que sin asistencia)', hits(lat) == 0, hits(lat))
        # 6. Apuntado sin ratón (teclado): nunca elige a un enemigo detrás de un muro
        await pg.evaluate(SETUP, {'assist': True, 'seed': 5}); await pg.wait_for_timeout(200)
        kb = await pg.evaluate("""() => { const G = MysteryAction, p = G.player, W = G.world; G.actors = G.actors.filter(a => !(a instanceof Enemy)); p.facing = { x: 1, y: 0 };
          const near = new Enemy(makeKind('rata'), p.x + 170, p.y, { level: 3 }), far = new Enemy(makeKind('rata'), p.x + 220, p.y - 110, { level: 3 }); G.actors.push(near, far);
          const tx = Math.floor((p.x + 110) / 32), ty = Math.floor(p.y / 32); W.tiles[ty * W.w + tx] = T.WALL;
          G.input.mouse.inside = false; const a = G.getAim(300), cn = G.clearShot(p.x, p.y, near.x, near.y), cf = G.clearShot(p.x, p.y, far.x, far.y); W.tiles[ty * W.w + tx] = T.FLOOR;
          const toFar = Math.abs(Math.atan2(a.dy, a.dx) - Math.atan2(far.y - p.y, far.x - p.x)) < .05, toNear = Math.abs(Math.atan2(a.dy, a.dx) - Math.atan2(near.y - p.y, near.x - p.x)) < .05; return { toNear, toFar, cn, cf }; }""")
        check('sin ratón: el apuntado automático salta la rata tapada por un muro y elige la que tiene línea libre', not kb['cn'] and kb['cf'] and kb['toFar'] and not kb['toNear'], kb)
        # 7. Opción en Opciones: activada por defecto y se guarda
        opt = await pg.evaluate("() => { localStorage.clear(); Options.load(); const d = Options.data.aimAssist; Options.set('aimAssist', false); Options.load(); const off = Options.data.aimAssist; Options.set('aimAssist', true); return { d, off, label: !!document.getElementById('opt-aim') }; }")
        check('Opciones: «Asistencia de apuntado del Arquero» activada por defecto, se puede desactivar y se guarda', opt['d'] is True and opt['off'] is False and opt['label'], opt)
        # Captura del indicador
        await pg.evaluate(SETUP, {'assist': True, 'seed': 3}); await pg.wait_for_timeout(200)
        await pg.evaluate("""() => { const G = MysteryAction, p = G.player; G.actors = G.actors.filter(a => !(a instanceof Enemy)); const es = [[150, -20], [170, 30], [-120, 90]].map(([x, y]) => { const e = new Enemy(makeKind('mordisquin'), p.x + x, p.y + y, { level: 3 }); e.kind = Object.assign({}, e.kind, { brain: () => STOP }); G.actors.push(e); return e; });
          G.camera.snap(p.x, p.y, G.world); const cam = G.camera, m = G.input.mouse; m.inside = true; m.lastMove = performance.now(); m.x = (p.x + 160 - cam.left) * cam.zoom; m.y = (p.y + 52 - cam.top) * cam.zoom; G.paused = false; }""")
        await pg.wait_for_timeout(400); mark = await pg.evaluate("() => !!MysteryAction.aimHint")
        await pg.screenshot(path=os.path.join(SHOT_DIR, 'arquero_indicador_prueba.png'), clip={'x': 440, 'y': 250, 'width': 420, 'height': 300})
        check('indicador discreto sobre el enemigo al que se ajusta el disparo', mark)
        check('sin errores de JavaScript', not errs, errs[:3])
        await br.close()
    print(f"{sum(R)}/{len(R)} correctas"); sys.exit(0 if all(R) else 1)

asyncio.run(main())
