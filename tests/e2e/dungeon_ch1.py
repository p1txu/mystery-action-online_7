"""Mazmorra del capítulo 1 (Bosque) en el navegador, con el prototipo real y sus colisiones.

Recorre pisos generados con semilla y, para cada plantilla, JUEGA la solución: el héroe anda casilla a
casilla (moveBy con su velocidad real, sin atravesar nada), golpea con su ataque básico (tryBasic → Combat →
onCombatArea → Mechs) y abre los cofres al llegar:

  * palanca y puente: el cofre no se alcanza antes; tras el golpe a la palanca se cruza el puente y se abre;
  * placas de tiempo: se pisan las dos andando a velocidad real (el Mago, el más lento) y la reja se abre;
  * pared agrietada: dos golpes la abren y el cofre secreto se abre;
  * raíces rompibles y peso compartido (en solitario: romper raíces + palanca);
  * emboscada: al entrar se cierran las salidas, aparece la oleada y, al vencerla, se abren;
  * minijefe: PS ×3, su cofre no aparece ni se abre hasta vencerlo;
  * texto del escenario: se lee al llegar (diálogo con título y texto);
  * altar de savia: −20 % PS, +20 % de daño;
  * dibujo: cada mecanismo se dibuja sin errores (capa de suelo + sprites ordenados); captura de pantalla;
  * mismo piso en el navegador y en Node (el servidor): huella de 120 pisos con mecanismos, repetida tras
    calentar el JIT (un `sort` con azar no era reproducible entre niveles de optimización de V8).

Uso: python3 tests/e2e/dungeon_ch1.py tests/.tmp/prototype.html   (SHOT_DIR para la captura)
"""
import asyncio, json, os, subprocess, sys
from playwright.async_api import async_playwright

SRC = sys.argv[1]
SHOT_DIR = os.environ.get('SHOT_DIR', 'tests/.tmp')

HELPERS = r'''
window.T1 = (() => {
  const G = MysteryAction, TS = 32;
  /** Sin enemigos por el camino (los de la prueba: emboscada y minijefe, sí). */
  const purge = () => { G.actors = G.actors.filter(a => !(a instanceof Enemy) || a.team !== 'enemy' || a.tag === 'ambush' || a.mini); };
  const step = n => { for (let i = 0; i < n; i++) { G.update(1 / 60); purge(); } };
  const load = (seed, floorNo, cls = 'mago') => {
    G.save = Save.fresh(cls); G.save.arrived = true; G.save.cleared = ['bosque']; G.save.board = []; G.save.jobs = [];
    G.startDungeon('bosque', seed);
    const i = G.run.seq.findIndex(s => s.kind === 'normal' && s.floorNo === floorNo); G.loadStep(i);
    document.getElementById('floorcard').hidden = true; G.cine = null; G.courier = null; UI.hideBoons(); G.paused = false; G.state = 'play';
    G.player.invincible = true; G.player.belly = G.player.bellyMax;
    G.actors = G.actors.filter(a => a === G.player || !(a instanceof Enemy) || a.team !== 'enemy');   // sin enemigos (salvo los que cree la prueba)
    G.floorRT.spawnT = 1e9; G.floorRT.time = 0; G.floorRT.mhTriggered = true;
    return G.floorRT;
  };
  /** Camino por casillas (las mismas colisiones que el juego: muros, rejas, raíces y puentes). */
  const path = (tx, ty) => {
    const W = G.world, p = G.player, s = [Math.floor(p.x / TS), Math.floor(p.y / TS)], N = W.w * W.h, prev = new Int32Array(N).fill(-1), q = [s[1] * W.w + s[0]];
    prev[q[0]] = q[0];
    for (let h = 0; h < q.length; h++) { const i = q[h], x = i % W.w, y = (i / W.w) | 0; if (x === tx && y === ty) break;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + dx, ny = y + dy, j = ny * W.w + nx; if (!W.inBounds(nx, ny) || prev[j] >= 0 || W.isSolid(nx, ny)) continue; prev[j] = i; q.push(j); } }
    const goal = ty * W.w + tx; if (prev[goal] < 0) return null;
    const out = []; for (let i = goal; i !== prev[i]; i = prev[i]) out.push(i); return out.reverse();
  };
  /** Anda hasta la casilla con la velocidad real del héroe. Devuelve los segundos o -1 si no se puede. */
  const walk = (tx, ty, maxS = 40, stopOnDialog = false, depth = 0) => {
    const P = path(tx, ty); if (!P) return -1;
    const p = G.player, W = G.world; let t = 0, stuck = 0, lx = p.x, ly = p.y;
    for (const i of P) {
      if (W.isSolid(i % W.w, (i / W.w) | 0)) {   // se ha cerrado algo por el camino (una emboscada): se gana el combate y se sigue
        const am = G.floorRT.mechs && G.floorRT.mechs.list.find(m => m.type === 'ambush' && m.state === 'armed');
        if (!am || depth > 2) return -4;
        for (const e of am.foes) if (e.alive) Combat.hit(G, e, { team: 'player', fixed: 1e7, src: p });
        step(150); const r = walk(tx, ty, maxS, stopOnDialog, depth + 1); return r < 0 ? r : t + r;
      }
      const gx = (i % W.w + .5) * TS, gy = (((i / W.w) | 0) + .5) * TS;
      while (Math.hypot(gx - p.x, gy - p.y) > 3) {
        if (G.paused && !document.getElementById('dialog').hidden && stopOnDialog) return t;
        if (G.paused && !document.getElementById('dialog').hidden) { document.getElementById('dialog-btn-0').click(); T1.read = (T1.read || 0) + 1; }   // un texto del escenario por el camino: se lee y se sigue
        if (t > maxS || G.paused) return -2;
        const d = Math.hypot(gx - p.x, gy - p.y), v = p.moveSpeed() / 60, k = Math.min(1, v / d);
        p.facing = { x: (gx - p.x) / d, y: (gy - p.y) / d };
        p.moveBy(W, (gx - p.x) * k, (gy - p.y) * k); G.update(1 / 60); purge(); t += 1 / 60;
        if (Math.hypot(p.x - lx, p.y - ly) < .05) { stuck += 1 / 60; if (stuck > 1) return -3; } else stuck = 0; lx = p.x; ly = p.y;
      }
    }
    return t;
  };
  /** Casilla libre vecina de (tx, ty) a la que se puede llegar, y golpe básico hacia ella. */
  const nextTo = (tx, ty) => { for (const [dx, dy] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) { const x = tx + dx, y = ty + dy; if (!G.world.isSolid(x, y) && path(x, y)) return [x, y]; } return null; };
  const strike = (tx, ty, times = 1) => {
    const p = G.player;
    for (let k = 0; k < times; k++) {
      const d = Math.hypot((tx + .5) * TS - p.x, (ty + .5) * TS - p.y) || 1; p.facing = { x: ((tx + .5) * TS - p.x) / d, y: ((ty + .5) * TS - p.y) / d };
      let n = 0; while (!p.tryBasic(G) && n++ < 240) step(1);
      step(30);
    }
  };
  const find = (prefab, floors = [1, 2, 3, 4, 5]) => { for (let seed = 1; seed < 300; seed++) for (const f of floors) { const g = FloorGen.generate(seed, dungeonById('bosque'), f, 'normal', [], 1); const r = g.layout.rooms.find(q => q.prefab === prefab); if (r) return { seed, f, room: r.id }; } return null; };
  const mechsIn = room => G.floorRT.mechs.list.filter(m => m.room === room);
  const chestIn = room => G.floorRT.objects.find(o => o.type === 'chest' && o.room === room && (o.alcove || o.secret));
  return { G, step, load, path, walk, nextTo, strike, find, mechsIn, chestIn };
})();
'''

# Huella de pisos del Bosque: casillas + mecanismos + textos. La misma función en el navegador y en Node.
FP = r'''(FG, D) => { let h = 0; const mix = v => { h = (Math.imul(h, 31) + v) | 0; };
  for (let seed = 1; seed <= 12; seed++) for (let f = 1; f <= 5; f++) for (const size of [1, 4]) {
    const g = FG.generate(seed * 7, D, f, 'normal', [], size); for (const t of g.world.tiles) mix(t);
    for (const m of g.layout.mechs) { for (const c of m.id + m.type) mix(c.charCodeAt(0)); for (const i of m.tiles || m.rect || [(m.ty | 0) * 1000 + (m.tx | 0)]) mix(i); }
    for (const l of g.layout.lore) mix(l.ty * 1000 + l.tx); }
  return h; }'''
NODE_FP = "import('./tests/helpers.mjs').then(({E}) => console.log((" + FP + ")(E.FloorGen, E.dungeonById('bosque'))))"

SCENARIOS = r'''() => {
  const { G, step, load, path, walk, nextTo, strike, find, mechsIn, chestIn } = T1, out = {}, TS = 32;
  // 1) palanca y puente
  { const s = find('palanca_puente'); const f = load(s.seed, s.f), lv = mechsIn(s.room).find(m => m.type === 'lever'), br = mechsIn(s.room).find(m => m.type === 'bridge'), ch = chestIn(s.room);
    const before = !!path(ch.tx, ch.ty); const nb = nextTo(lv.tx, lv.ty); const tw = walk(nb[0], nb[1]); strike(lv.tx, lv.ty);
    const t = walk(ch.tx, ch.ty); out.lever = { before, walkToLever: tw, leverOn: lv.on, bridgeOn: br.on, walk: +t.toFixed(2), opened: ch.opened }; }
  // 2) placas de tiempo con el Mago (el más lento)
  { const s = find('raices_tiempo'); const f = load(s.seed, s.f, 'mago'), [a, b] = mechsIn(s.room).filter(m => m.type === 'plate'), gt = mechsIn(s.room).find(m => m.type === 'gate'), ch = chestIn(s.room);
    const before = !!path(ch.tx, ch.ty); walk(a.tx, a.ty); const ta = G.time; walk(b.tx, b.ty); const run = G.time - ta; step(10);
    const t = walk(ch.tx, ch.ty); out.timer = { before, run: +run.toFixed(2), time: a.time, gateOpen: gt.open, opened: ch.opened, walk: +t.toFixed(2) }; }
  // 3) pared agrietada
  { const s = find('muro_agrietado'); const f = load(s.seed, s.f, 'guerrero'), fw = mechsIn(s.room).find(m => m.type === 'falsewall'), ch = chestIn(s.room);
    const W = G.world.w, i = fw.tiles[0], wx = i % W, wy = (i / W) | 0, nb = nextTo(wx, wy); const before = !!path(ch.tx, ch.ty);
    walk(nb[0], nb[1]); strike(wx, wy, 3); const t = walk(ch.tx, ch.ty); out.secret = { before, broken: fw.broken, tile: G.world.tiles[i], walk: +t.toFixed(2), opened: ch.opened }; }
  // 4) raíces rompibles
  { const s = find('raices_rompibles'); const f = load(s.seed, s.f, 'guerrero'), bk = mechsIn(s.room).find(m => m.type === 'breakable'), ch = chestIn(s.room) || f.objects.find(o => o.type === 'chest' && o.alcove && o.room === s.room);
    const W = G.world.w, i = bk.tiles[0], nb = nextTo(i % W, (i / W) | 0); const before = !!path(ch.tx, ch.ty);
    walk(nb[0], nb[1]); strike(i % W, (i / W) | 0, bk.hp0 + 2); const t = walk(ch.tx, ch.ty); out.roots = { before, broken: bk.broken, walk: +t.toFixed(2), opened: ch.opened }; }
  // 5) peso compartido en solitario: romper raíces y usar la palanca
  { const s = find('peso_compartido', [2, 3, 4, 5]); const f = load(s.seed, s.f, 'guerrero'), ms = mechsIn(s.room), bk = ms.find(m => m.type === 'breakable'), lv = ms.find(m => m.type === 'lever'), gt = ms.find(m => m.type === 'gate'), ch = f.objects.find(o => o.type === 'chest' && o.alcove && o.room === s.room);
    const W = G.world.w, i = bk.tiles[0], nb = nextTo(i % W, (i / W) | 0); const before = !!path(ch.tx, ch.ty);
    walk(nb[0], nb[1]); strike(i % W, (i / W) | 0, bk.hp0 + 2); const nl = nextTo(lv.tx, lv.ty); const wl = nl ? walk(nl[0], nl[1]) : -9; strike(lv.tx, lv.ty); const t = walk(ch.tx, ch.ty);
    out.coopSolo = { before, broken: bk.broken, walkToLever: +wl.toFixed(2), leverOn: lv.on, gateOpen: gt.open, walk: +t.toFixed(2), opened: ch.opened }; }
  // 6) emboscada
  { let s = null; for (let seed = 1; seed < 300 && !s; seed++) for (const fl of [2, 3, 4, 5]) { const g = FloorGen.generate(seed, dungeonById('bosque'), fl, 'normal', [], 1); const m = g.layout.mechs.find(q => q.type === 'ambush'); if (m) { s = { seed, f: fl, id: m.id }; break; } }
    const f = load(s.seed, s.f, 'guerrero'), m = f.mechs.byId.get(s.id), [rx, ry, rw, rh] = m.rect, W = G.world.w;
    const t = walk(rx + (rw >> 1), ry + (rh >> 1)); step(30);
    const foes = G.actors.filter(a => a.tag === 'ambush' && a.alive), closed = m.tiles.every(i => G.world.isSolid(i % W, (i / W) | 0));
    for (const e of foes) Combat.hit(G, e, { team: 'player', fixed: 1e6 });
    step(150);
    out.ambush = { walk: +t.toFixed(2), state: m.state, foes: foes.length, wave: m.wave, closedDuring: closed, openAfter: m.tiles.every(i => !G.world.isSolid(i % W, (i / W) | 0)) }; }
  // 7) minijefe (penúltimo piso)
  { let s = null; for (let seed = 1; seed < 300 && !s; seed++) { const g = FloorGen.generate(seed, dungeonById('bosque'), 4, 'normal', [], 1); if (g.layout.enemies.some(e => e.mini)) s = { seed }; }
    G.save = Save.fresh('guerrero'); G.save.arrived = true; G.save.cleared = ['bosque']; G.save.board = []; G.save.jobs = [];
    G.startDungeon('bosque', s.seed); G.loadStep(G.run.seq.findIndex(q => q.kind === 'normal' && q.floorNo === 4)); document.getElementById('floorcard').hidden = true; G.cine = null; UI.hideBoons(); G.paused = false; G.player.invincible = true;
    const f = G.floorRT, mini = G.actors.find(a => a.mini), ref = new Enemy(makeKind('zarza'), 0, 0, { level: mini.level, elite: true, hpMul: G.run.dng.hpMul || 1 });
    G.actors = G.actors.filter(a => a === G.player || a === mini || a.team !== 'enemy'); f.spawnT = 1e9;
    const ch = f.objects.find(o => o.hiddenUntil === 'mini'); const drawn0 = MechArt && !ch.revealed;
    G.player.placeAt(ch.x, ch.y); mini.x = mini.px = ch.x + 300; mini.y = mini.py = ch.y; mini.status.petrify = 999; step(20); const openedEarly = ch.opened;
    Combat.hit(G, mini, { team: 'player', fixed: 1e7, src: G.player }); step(20);
    G.player.placeAt(ch.x + 60, ch.y); step(5); G.player.placeAt(ch.x, ch.y); step(20);
    out.mini = { name: mini.nameTag, hpRatio: +(mini.maxHp / ref.maxHp).toFixed(2), hiddenBefore: drawn0, openedEarly, revealed: !!ch.revealed, opened: ch.opened }; }
  // 8) texto del escenario
  { let s = null; for (let seed = 1; seed < 300 && !s; seed++) { const g = FloorGen.generate(seed, dungeonById('bosque'), 1, 'normal', [], 1); if (g.layout.lore.length) s = { seed }; }
    const f = load(s.seed, 1), l = f.lore[0]; const t = walk(l.tx, l.ty, 40, true); step(2);
    const dlg = document.getElementById('dialog'), txt = document.getElementById('dialog-text').textContent, info = LORE.forest.find(q => q.id === l.id);
    out.lore = { walk: +t.toFixed(2), read: l.read, dialog: !dlg.hidden, paused: G.paused, hasTitle: txt.includes(info.title), hasText: txt.includes(info.text.slice(0, 20)) };
    document.getElementById('dialog-btn-0').click(); out.lore.resumed = !G.paused; }
  // 9) altar
  { const s = find('altar_savia'); const f = load(s.seed, s.f, 'guerrero'), al = mechsIn(s.room).find(m => m.type === 'altar'), p = G.player, nb = nextTo(al.tx, al.ty);
    walk(nb[0], nb[1]); const hp = p.hp, dm = p.dmgMul; p.invincible = false; strike(al.tx, al.ty); p.invincible = true;
    out.altar = { used: al.used.length, hpLoss: +((hp - p.hp) / p.maxHp).toFixed(2), dmg: +(p.dmgMul / dm).toFixed(2) }; }
  return out;
}'''

DRAW = r'''() => {
  const { G, step, load, find } = T1, out = { frames: [], kinds: {} };
  for (const pre of ['palanca_puente', 'raices_tiempo', 'muro_agrietado', 'raices_rompibles', 'peso_compartido', 'raices_punzantes', 'esporas', 'estela', 'altar_savia']) {
    const s = find(pre); if (!s) { out.kinds[pre] = 'sin piso'; continue; }
    const f = load(s.seed, s.f), r = f.L.rooms.find(q => q.id === s.room);
    G.player.placeAt((r.cx + .5) * 32, (r.cy + .5) * 32); G.camera.snap(G.player.x, G.player.y, G.world); step(30);
    const C = G.camera, view = { l: C.left, t: C.top, r: C.x + C.halfW, b: C.y + C.halfH };
    for (let k = 0; k < 8; k++) G.renderer.draw(G, 1);   // primero se pintan los trozos de suelo del piso nuevo (caché)
    const fr = []; for (let k = 0; k < 9; k++) { const t0 = performance.now(); G.renderer.draw(G, 1); fr.push(performance.now() - t0); } fr.sort((a, b) => a - b); const ms = fr[4];
    out.kinds[pre] = { sprites: MechArt.sprites(G, view).length, mechs: f.mechs ? f.mechs.list.filter(m => m.room === s.room).length : 0, lore: f.lore.length, ms: +ms.toFixed(1) };
  }
  return out;
}'''

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(); pg = await b.new_page(viewport={'width': 1280, 'height': 720})
        errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.goto('file://' + os.path.abspath(SRC)); await pg.wait_for_timeout(500)
        await pg.evaluate(HELPERS)
        fp_browser = [await pg.evaluate('() => (' + FP + ")(FloorGen, dungeonById('bosque'))") for _ in range(3)]
        r = await pg.evaluate(SCENARIOS)
        d = await pg.evaluate(DRAW)
        # Captura: sala de la palanca y el puente con el puente bajado
        await pg.evaluate('''() => { const { G, load, find, mechsIn, step } = T1, s = find('raices_punzantes'); const f = load(s.seed, s.f), r = f.L.rooms.find(q => q.id === s.room); G.player.placeAt((r.cx + .5) * 32, (r.cy + .5) * 32); G.camera.snap(G.player.x, G.player.y, G.world); step(90); G.renderer.draw(G, 1); }''')
        os.makedirs(SHOT_DIR, exist_ok=True)
        await pg.screenshot(path=os.path.join(SHOT_DIR, 'dungeon_ch1.png'))
        await b.close()
    fp_node = int(subprocess.run(['node', '--input-type=module', '-e', NODE_FP], capture_output=True, text=True, check=True).stdout.strip())
    print(json.dumps({'play': r, 'draw': d, 'fingerprint': {'browser': fp_browser, 'node': fp_node}}, ensure_ascii=False, indent=1))
    fails = []
    if len(set(fp_browser)) != 1 or fp_browser[0] != fp_node: fails.append(f'pisos distintos en navegador y servidor: {fp_browser} / {fp_node}')
    if errs: fails.append(f'errores de página: {errs[:3]}')
    L = r['lever']
    if L['before'] or not (L['leverOn'] and L['bridgeOn'] and L['walk'] > 0 and L['opened']): fails.append(f'palanca/puente: {L}')
    T = r['timer']
    if T['before'] or not (T['gateOpen'] and T['opened'] and T['run'] < T['time']): fails.append(f'placas de tiempo: {T}')
    S = r['secret']
    if S['before'] or not (S['broken'] and S['opened']): fails.append(f'pared agrietada: {S}')
    R = r['roots']
    if R['before'] or not (R['broken'] and R['opened']): fails.append(f'raíces: {R}')
    C = r['coopSolo']
    if C['before'] or not (C['broken'] and C['leverOn'] and C['gateOpen'] and C['opened']): fails.append(f'peso compartido en solitario: {C}')
    A = r['ambush']
    if not (A['state'] == 'done' and A['foes'] == A['wave'] and A['closedDuring'] and A['openAfter']): fails.append(f'emboscada: {A}')
    M = r['mini']
    if not (M['name'] == 'Zarzal Madre' and abs(M['hpRatio'] - 3) < .05 and M['hiddenBefore'] and not M['openedEarly'] and M['revealed'] and M['opened']): fails.append(f'minijefe: {M}')
    O = r['lore']
    if not (O['read'] and O['dialog'] and O['hasTitle'] and O['hasText'] and O['resumed']): fails.append(f'texto: {O}')
    Q = r['altar']
    if not (Q['used'] == 1 and abs(Q['hpLoss'] - .2) < .02 and abs(Q['dmg'] - 1.2) < .01): fails.append(f'altar: {Q}')
    for k, v in d['kinds'].items():
        if not isinstance(v, dict): fails.append(f'dibujo {k}: {v}'); continue
        if k != 'estela' and v['mechs'] == 0: fails.append(f'dibujo {k}: sin mecanismos')
        if v['sprites'] == 0 and k != 'muro_agrietado': fails.append(f'dibujo {k}: sin sprites')   # la pared falsa es una casilla del mapa (con grietas), no un sprite
        if v['ms'] > 12: fails.append(f'dibujo {k}: {v["ms"]} ms por fotograma')
    if fails:
        print('FALLOS:'); [print(' -', f) for f in fails]; sys.exit(1)
    print('OK: mazmorra del capítulo 1 jugable de principio a fin')

asyncio.run(main())
