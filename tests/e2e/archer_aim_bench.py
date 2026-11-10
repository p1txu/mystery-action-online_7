"""Medición del apuntado del Arquero en el juego real (navegador, sin conexión): mismo guion sobre cualquier versión.

Uso: python3 tests/e2e/archer_aim_bench.py <prototype.html> [etiqueta]
Imprime una línea JSON por escenario: disparos, impactos y, cuando aplica, a quién se dio.
El ratón se simula con la entrada real del juego (Game.input.mouse) y se dispara con Player.tryBasic, como al hacer clic."""
import asyncio, json, os, sys
from playwright.async_api import async_playwright

SRC, LABEL = sys.argv[1], (sys.argv[2] if len(sys.argv) > 2 else '')
SETUP = r"""(opts) => {
  localStorage.clear(); const G = MysteryAction, s = Save.sanitize(Save.fresh('arquero')).data; s.arrived = true; G.save = s; Save.write(s); G.goBase(); G.startDungeon('bosque', 77);
  if (Options.data) Options.data.aimAssist = opts.assist; UI.hideBoons && UI.hideBoons();
  const W = G.world; for (let ty = 1; ty < W.h - 1; ty++) for (let tx = 1; tx < W.w - 1; tx++) W.tiles[ty * W.w + tx] = T.FLOOR; W.blk = new Uint8Array(W.w * W.h);
  G.actors = G.actors.filter(a => !(a instanceof Enemy)); if (G.floorRT) G.floorRT.g = G; G.items && (G.items.length = 0);
  const p = G.player; p.x = p.px = W.w * 16; p.y = p.py = W.h * 16; p.maxHp = p.hp = 1e6; p.stats.crit = 0;
  window.__rnd = (() => { let q = opts.seed || 7; return () => (q = (q * 16807) % 2147483647) / 2147483647; })();
  return true;
}"""
# Un disparo: coloca enemigos, mueve el ratón al punto (con un error humano aleatorio de ±err px), dispara y simula el vuelo.
SHOT = r"""(o) => {
  const G = MysteryAction, p = G.player, W = G.world, R = window.__rnd;
  G.actors = G.actors.filter(a => !(a instanceof Enemy)); G.projectiles.length = 0; p.basicCd = 0; p.x = p.px = W.w * 16; p.y = p.py = W.h * 16;
  if (o.wall) { const tx = Math.floor((p.x + o.wall[0]) / 32), ty = Math.floor((p.y + o.wall[1]) / 32); for (let k = -1; k <= 1; k++) W.tiles[(ty + k) * W.w + tx] = T.WALL; }
  const foes = o.foes.map(f => { const a = f.ang * Math.PI / 180, e = new Enemy(f.boss ? makeBossKind(f.boss) : makeKind(f.kind), p.x + Math.cos(a) * f.d, p.y + Math.sin(a) * f.d, { level: 3 });
    e.kind = Object.assign({}, e.kind, { brain: () => STOP }); e.maxHp = e.hp = 1e6; e.aggro = false; e.mv = f.mv || null; G.actors.push(e); return e; });
  const tgt = foes[o.aimAt || 0], h = tgt.height || 20, hy = { pies: 0, centro: .45, cabeza: .9 }[o.at] * h;
  const ex = (R() * 2 - 1) * (o.err || 0), ey = (R() * 2 - 1) * (o.err || 0);
  const wx = tgt.x + ex + (o.aimOff ? o.aimOff[0] : 0), wy = tgt.y - hy + ey + (o.aimOff ? o.aimOff[1] : 0);
  G.camera.snap(p.x, p.y, G.world); const cam = G.camera, m = G.input.mouse;
  m.inside = true; m.lastMove = performance.now(); m.x = (wx - cam.left) * cam.zoom; m.y = (wy - cam.top) * cam.zoom;
  const aim = G.getAim(MOVES[p.sp.basic].range), hint = aim.assist && aim.assist.kind === 'assist' ? foes.indexOf(aim.assist.e) : -1, hov = !!(aim.assist && aim.assist.kind === 'sprite');
  const mark = (() => { const h = G.archerHint ? G.archerHint() : null; return h ? foes.indexOf(h) : -1; })(), clear = G.clearShot ? G.clearShot(p.x, p.y, tgt.x, tgt.y) : true;
  const hp0 = foes.map(e => e.hp); p.tryBasic(G);
  for (let i = 0; i < 120; i++) { for (const e of foes) if (e.mv) { e.x += e.mv[0] / 120; e.y += e.mv[1] / 120; } for (const a of G.projectiles) a.update(1 / 120, G); G.projectiles = G.projectiles.filter(a => a.alive); }
  if (o.wall) { const tx = Math.floor((p.x + o.wall[0]) / 32), ty = Math.floor((p.y + o.wall[1]) / 32); for (let k = -1; k <= 1; k++) W.tiles[(ty + k) * W.w + tx] = T.FLOOR; }
  return { hit: foes.map((e, i) => e.hp < hp0[i]), hint, hov, mark, clear, off: aim.assist ? Math.round(aim.assist.off * 180 / Math.PI * 10) / 10 : 0 };
}"""

def scen():
    ang = [0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330]
    out = []
    for kind, label in [('rata', 'pequeño'), ('mordisquin', 'mediano')]:
        for at in ['pies', 'centro', 'cabeza']:
            out.append((f'quieto {label} · clic en {at}', [dict(foes=[dict(kind=kind, ang=a, d=d)], at=at) for a in ang for d in (90, 180, 270)]))
        out.append((f'quieto {label} · clic en el centro con error humano ±14 px', [dict(foes=[dict(kind=kind, ang=a, d=d)], at='centro', err=14) for a in ang for d in (90, 180, 270) for _ in range(2)]))
        out.append((f'se acerca {label} (110 px/s) · error ±10 px', [dict(foes=[dict(kind=kind, ang=a, d=220, mv=[-110 * c, -110 * s])], at='centro', err=10) for a in ang for c, s in [(__import__('math').cos(a * 3.14159 / 180), __import__('math').sin(a * 3.14159 / 180))]]))
        out.append((f'cruza de lado {label} (90 px/s) · sin adelantar', [dict(foes=[dict(kind=kind, ang=a, d=200, mv=[-90 * __import__('math').sin(a * 3.14159 / 180), 90 * __import__('math').cos(a * 3.14159 / 180)])], at='centro') for a in ang]))
    for at in ['centro', 'cabeza']:
        out.append((f'jefe (Robletón) · clic en {at}', [dict(foes=[dict(boss='robleton', ang=a, d=220)], at=at) for a in ang]))
    out.append(('tres enemigos juntos · clic sobre el central', [dict(foes=[dict(kind='rata', ang=a - 7, d=200), dict(kind='rata', ang=a, d=200), dict(kind='rata', ang=a + 7, d=200)], at='centro', aimAt=1) for a in ang]))
    out.append(('enemigo detrás de un muro, ratón a 5° (no debe elegirlo)', [dict(foes=[dict(kind='rata', ang=a, d=200)], at='pies', rot=5, wall=[__import__('math').cos(a * 3.14159 / 180) * 100, __import__('math').sin(a * 3.14159 / 180) * 100]) for a in ang]))
    out.append(('ratón a 6° del enemigo (dentro del cono)', [dict(foes=[dict(kind='rata', ang=a, d=200)], at='pies', rot=6) for a in ang]))
    out.append(('ratón a 11° del enemigo (borde del cono)', [dict(foes=[dict(kind='rata', ang=a, d=200)], at='pies', rot=11) for a in ang]))
    out.append(('ratón a 16° del enemigo (fuera del cono)', [dict(foes=[dict(kind='rata', ang=a, d=200)], at='pies', rot=16) for a in ang]))
    return [x for x in out if x[1]]


async def main():
    async with async_playwright() as pw:
        br = await pw.chromium.launch(); res = {}
        for assist in (True, False):
            pg = await br.new_page(viewport={'width': 1280, 'height': 800}); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
            await pg.goto('file://' + os.path.abspath(SRC)); await pg.wait_for_timeout(400)
            await pg.evaluate(SETUP, {'assist': assist, 'seed': 11}); await pg.wait_for_timeout(500)
            for name, shots in scen():
                hits = 0; target_hits = 0; other = 0; offs = []; hints = 0; marks_wall = 0
                for o in shots:
                    if o.get('rot'):   # el ratón apunta a un punto girado «rot» grados respecto al enemigo (a la altura de sus pies)
                        import math
                        a = math.radians(o['foes'][0]['ang'] + o['rot']); dd = o['foes'][0]['d']
                        o = dict(o); o['aimOff'] = [math.cos(a) * dd - math.cos(math.radians(o['foes'][0]['ang'])) * dd, math.sin(a) * dd - math.sin(math.radians(o['foes'][0]['ang'])) * dd]
                    r = await pg.evaluate(SHOT, o)
                    t = o.get('aimAt', 0); hits += any(r['hit']); target_hits += r['hit'][t]; other += sum(1 for i, h in enumerate(r['hit']) if h and i != t)
                    if r['hint'] >= 0: hints += 1; offs.append(abs(r['off']))
                    if o.get('wall') and r.get('mark', -1) >= 0 and not r.get('clear', True): marks_wall += 1
                    if o.get('wall') and r.get('clear', True): res.setdefault('_libres', []).append((name, o['foes'][0]['ang']))
                res.setdefault(name, {})['con' if assist else 'sin'] = {'disparos': len(shots), 'al_objetivo': target_hits, 'a_otro': other, 'asistidos': hints, 'corrección_máx': max(offs) if offs else 0, 'marca_tras_muro': marks_wall}
            if errs: print('errores', errs[:2])
            await pg.close()
        await br.close()
    print('LIBRES', json.dumps(res.pop('_libres', []), ensure_ascii=False))
    for name, v in res.items(): print(json.dumps({'versión': LABEL, 'escenario': name, **{k: v.get(k) for k in ('con', 'sin')}}, ensure_ascii=False))

asyncio.run(main())
