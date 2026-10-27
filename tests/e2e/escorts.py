"""Vecinos que se escoltan (0.38) y Gruta más dura. En el navegador, con el prototipo real:

  * Mercader Tobías: en la guarida del Bosque (primera vez) está escondido en un rincón, temblando, sin
    recibir daño; al derrotar al guardián se levanta, se acerca, habla (texto de humano, sin «topo») y te
    sigue. Si el Bosque ya se completó, no aparece.
  * Cartero Lino: te sigue por la ruta de casillas (rodea esquinas y columnas sin atascarse) y, cuando se
    le acerca un enemigo, se aparta despacio (≤ 60 px/s) sin alejarse.
  * Gruta de Cuarzo: enemigos y Reina Geoda con el triple de PS que el mismo enemigo al mismo nivel sin el
    multiplicador.
  * Velocidades: clases un 20 % más lentas que en la 0.37.

Uso: python3 tests/e2e/escorts.py tests/.tmp/prototype.html
"""
import asyncio, json, os, sys
from playwright.async_api import async_playwright

SRC = sys.argv[1]
fails = []
def check(name, ok, info=None):
    print(('PASS ' if ok else 'FAIL ') + name + ('' if ok else f'  {info}'))
    if not ok: fails.append(name)

STEP = '''(n) => { const G = MysteryAction; for (let i = 0; i < n; i++) { if (G.cine) G.stepCine(1 / 60); else G.update(1 / 60); } }'''

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(); pg = await b.new_page(viewport={'width': 1280, 'height': 720})
        errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.goto('file://' + os.path.abspath(SRC)); await pg.wait_for_timeout(500)
        has_update = await pg.evaluate('typeof MysteryAction.update === "function"')
        if not has_update: check('MysteryAction.update existe (para avanzar el juego en la prueba)', False); sys.exit(1)

        # ---------- Mercader Tobías ----------
        r = await pg.evaluate('''() => { const G = MysteryAction; G.save = Save.fresh('guerrero'); G.save.board = Jobs.board(G.save, 3);
          G.startDungeon('bosque', 11); G.loadStep(G.run.seq.length - 1); document.getElementById('floorcard').hidden = true; G.cine = null;
          const n = G.merchant, room = G.floorRT.L.rooms[0], TS = 32;
          const inCorner = n && [[room.x + 1, room.y + 1], [room.x + room.w - 2, room.y + 1], [room.x + 1, room.y + room.h - 2], [room.x + room.w - 2, room.y + room.h - 2]].some(([x, y]) => Math.floor(n.x / TS) === x && Math.floor(n.y / TS) === y);
          return { has: !!n, scared: n && n.scared, inCorner, team: n && n.team, inv: n && n.invincible, name: NPC_KINDS.tendero.name }; }''')
        check('guarida del Bosque (primera vez): el mercader está escondido en un rincón, temblando', r['has'] and r['scared'] and r['inCorner'] and r['team'] == 'neutral' and r['inv'], r)
        check('el mercader ya no es un topo: «Mercader Tobías»', r['name'] == 'Mercader Tobías', r)
        await pg.evaluate(STEP.replace('(n)', '()').replace('n; i++', '240; i++'))
        r = await pg.evaluate('''() => { const G = MysteryAction, n = G.merchant, P = G.player; let hit = false; try { hit = Combat.hit(G, n, { dmg: 999, team: 'enemy' }); } catch (e) {} return { alive: n.alive, hp: n.hp, scared: n.scared, hit }; }''')
        check('durante el combate sigue escondido y no recibe daño', r['alive'] and r['scared'] and not r['hit'], r)
        # derrotar al guardián
        await pg.evaluate('''() => { const G = MysteryAction, b = G.floorRT.boss; b.hp = 1; Combat.hit(G, b, { dmg: 99999, team: 'player', src: G.player }); if (b.alive) b.die(G); }''')
        await pg.evaluate(STEP.replace('(n)', '()').replace('n; i++', '540; i++'))
        await pg.wait_for_timeout(200)
        r = await pg.evaluate('''() => { const G = MysteryAction, n = G.merchant, P = G.player, q = document.getElementById('dialog-text'); const txt = q ? q.textContent : '';
          return { scared: n.scared, dist: Math.round(Math.hypot(n.x - P.x, n.y - P.y)), txt, cine: G.cine && G.cine.kind }; }''')
        check('al caer el guardián se levanta, se acerca y habla', not r['scared'] and r['dist'] < 90 and 'Tobías' in r['txt'] and 'opo' not in r['txt'], r)
        # pasar el diálogo
        for _ in range(6):
            btn = await pg.query_selector('#dialog:not([hidden]) button.btn-main, #dialog:not([hidden]) button')
            if not btn: break
            await btn.click(); await pg.wait_for_timeout(120)
        await pg.evaluate(STEP.replace('(n)', '()').replace('n; i++', '30; i++'))
        r = await pg.evaluate('''() => { const G = MysteryAction, n = G.merchant, P = G.player; const x0 = n.x, y0 = n.y; P.placeAt(P.x + 160, P.y); for (let i = 0; i < 180; i++) { if (G.cine) G.stepCine(1 / 60); else G.update(1 / 60); }
          return { following: n.following, cine: !!G.cine, moved: Math.round(Math.hypot(n.x - x0, n.y - y0)), dist: Math.round(Math.hypot(n.x - P.x, n.y - P.y)) }; }''')
        check('tras el diálogo te sigue', r['following'] and not r['cine'] and r['moved'] > 40 and r['dist'] < 120, r)
        r = await pg.evaluate('''() => { const G = MysteryAction; G.save.cleared = ['bosque']; G.startDungeon('bosque', 12); G.loadStep(G.run.seq.length - 1); return !!G.merchant; }''')
        check('con el Bosque ya completado no vuelve a aparecer', r is False, r)

        # ---------- Cartero Lino: ruta y huida lenta ----------
        r = await pg.evaluate('''() => { const G = MysteryAction; G.save = Save.fresh('guerrero'); G.save.board = Jobs.board(G.save, 3); G.save.cleared = ['bosque'];
          G.startDungeon('gruta', 21); const i = G.run.seq.findIndex(s => s.kind === 'normal' && s.floorNo === 3); G.loadStep(i); G.cine = null; document.getElementById('floorcard').hidden = true;
          G.actors = G.actors.filter(a => !(a instanceof Enemy && a.team === 'enemy'));
          G.run.courier = 'escort'; const n = CourierIntro.spawnFollower(G, G.player.x, G.player.y + 6), W = G.world, TS = 32, L = G.floorRT.L;
          // ruta larga: de una sala a otra lejana (pasillos con esquinas)
          const rooms = L.rooms.slice().sort((a, b) => Math.hypot(b.cx - L.rooms[0].cx, b.cy - L.rooms[0].cy) - Math.hypot(a.cx - L.rooms[0].cx, a.cy - L.rooms[0].cy));
          const A = L.rooms[0], B = rooms[0]; G.player.placeAt((A.cx + .5) * TS, (A.cy + .5) * TS); n.x = n.px = (A.cx + .5) * TS; n.y = n.py = (A.cy + 1.4) * TS;   // si cae en una columna, el propio cartero sale (se comprueba también eso)
          // el jugador «camina» por la ruta de casillas hasta B a la velocidad de su clase
          const path = Escort.bfs(W, A.cx, A.cy, B.cx, B.cy), sp = G.player.moveSpeed(); let maxGap = 0, stuck = 0, last = { x: n.x, y: n.y }, t = 0;
          for (const [tx, ty] of path) { const gx = (tx + .5) * TS, gy = (ty + .5) * TS; while (Math.hypot(gx - G.player.x, gy - G.player.y) > 2) { const P = G.player, dx = gx - P.x, dy = gy - P.y, d = Math.hypot(dx, dy), st = Math.min(d, sp / 60); P.x += dx / d * st; P.y += dy / d * st; P.px = P.x; P.py = P.y; P.facing = { x: dx / d, y: dy / d };
              G.update(1 / 60); t += 1 / 60; maxGap = Math.max(maxGap, Math.hypot(n.x - P.x, n.y - P.y)); if (Math.hypot(n.x - last.x, n.y - last.y) < .2 && Math.hypot(n.x - P.x, n.y - P.y) > 60) stuck += 1 / 60; last = { x: n.x, y: n.y }; } }
          for (let i = 0; i < 120; i++) G.update(1 / 60);
          return { tiles: path.length, seconds: +t.toFixed(1), maxGap: Math.round(maxGap), stuck: +stuck.toFixed(2), endGap: Math.round(Math.hypot(n.x - G.player.x, n.y - G.player.y)) }; }''')
        check('el cartero sigue la ruta por pasillos y esquinas sin atascarse', r['tiles'] > 15 and r['stuck'] < .8 and r['endGap'] < 90 and r['maxGap'] < 400, r)
        r = await pg.evaluate('''() => { const G = MysteryAction, n = G.courier, P = G.player, TS = 32;
          for (let i = 0; i < 60; i++) G.update(1 / 60);
          const e = new Enemy(makeKind(Object.keys(dungeonById('gruta').enemies)[0]), n.x + 60, n.y, { level: 3 }); e.aggro = false; e.update = function () { this.px = this.x; this.py = this.y; }; G.actors.push(e);
          const x0 = n.x, y0 = n.y; let maxStep = 0, lx = n.x, ly = n.y;
          for (let i = 0; i < 60; i++) { G.update(1 / 60); maxStep = Math.max(maxStep, Math.hypot(n.x - lx, n.y - ly) * 60); lx = n.x; ly = n.y; }
          return { moved: Math.round(Math.hypot(n.x - x0, n.y - y0)), maxSpeed: Math.round(maxStep), distP: Math.round(Math.hypot(n.x - P.x, n.y - P.y)), fleeing: !!(n.flee) }; }''')
        check('con un enemigo cerca se aparta despacio (≤ 60 px/s) y sin irse lejos', r['fleeing'] and r['moved'] > 8 and r['maxSpeed'] <= 60 and r['distP'] < 160, r)

        # ---------- Gruta: PS ×3 ----------
        r = await pg.evaluate('''() => { const G = MysteryAction, D = dungeonById('gruta'), id = Object.keys(D.enemies)[0];
          const plain = new Enemy(makeKind(id), 0, 0, { level: 6 }).maxHp, enemies = G.actors.filter(a => a instanceof Enemy && a.team === 'enemy');
          G.startDungeon('gruta', 33); G.loadStep(G.run.seq.length - 1); const boss = G.floorRT.boss, bossPlain = new Enemy(boss.kind, 0, 0, { level: boss.level }).maxHp;
          G.startDungeon('gruta', 34); G.loadStep(0); const e0 = G.actors.find(a => a instanceof Enemy && a.team === 'enemy' && !a.kind.isBoss); const e0plain = e0 ? new Enemy(e0.kind, 0, 0, { level: e0.level, elite: e0.elite }).maxHp : 0;
          G.startDungeon('bosque', 35); G.loadStep(0); const f0 = G.actors.find(a => a instanceof Enemy && a.team === 'enemy'); const f0plain = f0 ? new Enemy(f0.kind, 0, 0, { level: f0.level, elite: f0.elite }).maxHp : 0;
          return { hpMul: D.hpMul, boss: boss.maxHp, bossPlain, e0: e0 && e0.maxHp, e0plain, f0: f0 && f0.maxHp, f0plain }; }''')
        check('Gruta: Reina Geoda con el triple de PS', r['hpMul'] == 3 and abs(r['boss'] - 3 * r['bossPlain']) <= 1, r)
        check('Gruta: enemigos del piso con el triple de PS', r['e0'] and abs(r['e0'] - 3 * r['e0plain']) <= 1, r)
        check('Bosque: sin cambios', r['f0'] == r['f0plain'], r)

        r = await pg.evaluate('''() => ['guerrero', 'arquero', 'mago', 'asesino'].map(c => CLASSES.find(k => k.id === c).base.spe)''')
        check('clases un 20 % más lentas (102 / 118 / 99 / 130)', r == [102, 118, 99, 130], r)
        check('sin errores de JavaScript', not errs, errs[:3])
        await b.close()
    print(f'{sum(1 for _ in [])}' if False else ('OK' if not fails else 'FALLO: ' + ', '.join(fails)))
    sys.exit(1 if fails else 0)

asyncio.run(main())
