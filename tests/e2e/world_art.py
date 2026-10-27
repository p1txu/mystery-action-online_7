"""Arte del mundo (0.37): aldea con edificios y objetos en sprites ordenados, suelo pintado píxel a píxel
y mazmorras por bioma. Comprueba en el navegador, con el prototipo real:

  * la aldea construye su escena (edificios, objetos y árboles) sin errores;
  * cada objeto que se dibuja en el suelo de la aldea está sobre una casilla que no se puede atravesar
    (lo que se ve como sólido es sólido) y ningún objeto tapa un camino;
  * desde la llegada se puede ir andando a todas las estaciones (las casas nuevas no cierran el paso);
  * los sprites se ordenan en profundidad con el jugador (delante / detrás) y se aclaran al taparlo;
  * el suelo de la aldea y de los 5 biomas de mazmorra se pinta sin errores y sin píxeles vacíos;
  * los cofres tienen 4 fases de apertura para cada tipo;
  * tiempos: escena, trozo de suelo y fotograma.

Uso: python3 tests/e2e/world_art.py tests/.tmp/prototype.html
"""
import asyncio, json, sys
from playwright.async_api import async_playwright

SRC = sys.argv[1]

JS = r'''() => {
  const G = MysteryAction, out = { errors: [] };
  G.save = Save.fresh('guerrero'); G.save.arrived = true; G.save.cleared = ['bosque', 'gruta']; G.save.board = Jobs.board(G.save, 3);
  G.goBase(); document.getElementById('floorcard').hidden = true; G.renderer.resize();
  const W = G.world, TS = 32;
  let t0 = performance.now(); const scene = TownScene.build(W, G); out.sceneMs = Math.round(performance.now() - t0);
  G.village.scene = scene;
  out.sprites = scene.sprites.length; out.lights = scene.lights.length;
  out.houses = scene.sprites.filter(s => s.fade && s.w > 100).length;
  // 1) lo que se ve sólido es sólido: el pie de cada objeto (no árboles del borde) cae en casilla sólida
  const bad = [];
  for (const s of scene.sprites) {
    if (s.overhead) continue;   // el arco de la puerta: se pasa por debajo
    const fx = Math.floor((s.x + s.w / 2) / TS), fy = Math.floor((s.y - 2) / TS);
    if (!SOLID[W.get(fx, fy)]) bad.push([fx, fy, s.w, s.h]);
  }
  out.walkableUnderSprite = bad;
  // 2) todas las estaciones alcanzables desde la llegada (BFS por casillas)
  const start = [Math.floor(W.spawn.x / TS), Math.floor(W.spawn.y / TS)], seen = new Uint8Array(W.w * W.h), q = [start]; seen[start[1] * W.w + start[0]] = 1;
  while (q.length) { const [x, y] = q.shift(); for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + dx, ny = y + dy; if (!W.inBounds(nx, ny) || seen[ny * W.w + nx] || SOLID[W.get(nx, ny)]) continue; seen[ny * W.w + nx] = 1; q.push([nx, ny]); } }
  const reach = id => { const [sx, sy] = STATIONS[id].at; for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) { const x = sx + dx, y = sy + dy; if (W.inBounds(x, y) && seen[y * W.w + x] && Math.hypot((x + .5 - sx - .5) * TS, (y + .5 - sy - .5) * TS) < 56) return true; } return false; };
  out.unreachable = Object.keys(STATIONS).filter(id => !reach(id));
  out.cartEnd = !!seen[16 * W.w + 13];   // fin del camino de la carretilla de llegada
  // 3) orden en profundidad y transparencia con el gremio (planta 6..14 × 5..9)
  const guild = scene.sprites.find(s => s.y === 10 * TS && s.x < 6 * TS && s.w > 250);
  out.guildFound = !!guild;
  if (guild) {
    const P = G.player; P.placeAt(10.5 * TS, 11.4 * TS); out.frontSortsAfter = P.y > guild.y; out.frontHidden = guild.hides(P);
    P.placeAt(10.5 * TS, 4.6 * TS); out.behindSortsBefore = P.y < guild.y; out.behindHidden = guild.hides(P);
  }
  // 4) suelo de la aldea: sin píxeles vacíos
  const emptyPx = cv => { const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data; let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i] === 0) n++; return n; };
  t0 = performance.now(); const vc = TownGround.paintChunk(W, 2, 2).canvas(); out.villageChunkMs = Math.round(performance.now() - t0); out.villageEmpty = emptyPx(vc);
  // 5) fotogramas en la aldea
  const fr = []; for (const [x, y] of [[21.5, 16], [10.5, 11.5], [33, 12], [22, 5]]) { G.player.placeAt(x * TS, y * TS); G.camera.snap(x * TS, y * TS, W); for (let i = 0; i < 12; i++) { const t = performance.now(); G.renderer.draw(G, 1); fr.push(performance.now() - t); } }
  fr.sort((a, b) => a - b); out.villageFrameMedianMs = +fr[fr.length >> 1].toFixed(1);
  // 6) mazmorras: un trozo de cada bioma
  out.biomes = {};
  for (const d of ['bosque', 'gruta', 'cienaga', 'mina', 'crater']) {
    G.startDungeon(d, 1); const f = G.floorRT, Wd = G.world;
    const r = f.L.rooms[0], cx = Math.floor(r.cx / CONFIG.CHUNK), cy = Math.floor(r.cy / CONFIG.CHUNK);
    t0 = performance.now(); const cv = DungeonGround.paintChunk(Wd, cx, cy, PAL.terrain).canvas(); const ms = performance.now() - t0;
    const fr2 = []; G.player.placeAt(r.cx * TS, (r.cy + .5) * TS); G.camera.snap(r.cx * TS, r.cy * TS, Wd); for (let i = 0; i < 10; i++) { const t = performance.now(); G.renderer.draw(G, 1); fr2.push(performance.now() - t); }
    fr2.sort((a, b) => a - b);
    out.biomes[d] = { terrain: PAL.terrain, painter: !!DungeonGround.SET[PAL.terrain], chunkMs: Math.round(ms), empty: emptyPx(cv), frameMs: +fr2[5].toFixed(1) };
  }
  // 7) cofres
  out.chests = ['cofre', 'cofrePlata', 'cofreRaro', 'cofreJefe'].map(t => [0, 1, 2, 3].map(s => { const cv = ChestArt.sprite(t, s); return cv.width * cv.height - emptyPx(cv); }));
  return out;
}'''

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(); pg = await b.new_page(viewport={'width': 1280, 'height': 720})
        errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.goto('file://' + __import__('os').path.abspath(SRC)); await pg.wait_for_timeout(500)
        r = await pg.evaluate(JS)
        await b.close()
    print(json.dumps(r, ensure_ascii=False))
    fails = []
    if errs: fails.append(f'errores de página: {errs[:3]}')
    if r['sprites'] < 150: fails.append(f"pocos sprites en la aldea: {r['sprites']}")
    if r['houses'] < 12: fails.append(f"faltan casas: {r['houses']}")
    if r['walkableUnderSprite']: fails.append(f"objetos dibujados sobre casillas transitables: {r['walkableUnderSprite'][:6]}")
    if r['unreachable']: fails.append(f"estaciones inalcanzables: {r['unreachable']}")
    if not r['cartEnd']: fails.append('el final del camino de la carretilla está bloqueado')
    if not (r.get('guildFound') and r['frontSortsAfter'] and not r['frontHidden'] and r['behindSortsBefore'] and r['behindHidden']): fails.append('orden en profundidad / transparencia del gremio incorrectos')
    if r['villageEmpty']: fails.append(f"suelo de la aldea con {r['villageEmpty']} píxeles vacíos")
    for d, v in r['biomes'].items():
        if not v['painter']: fails.append(f'{d}: sin pintor de suelo ({v["terrain"]})')
        if v['empty']: fails.append(f'{d}: {v["empty"]} píxeles vacíos')
        if v['chunkMs'] > 400: fails.append(f'{d}: trozo de suelo lento ({v["chunkMs"]} ms)')
    if any(n < 300 for row in r['chests'] for n in row): fails.append(f"cofre vacío: {r['chests']}")
    if r['sceneMs'] > 1500: fails.append(f"escena de la aldea lenta: {r['sceneMs']} ms")
    if fails:
        print('FALLO:\n  ' + '\n  '.join(fails)); sys.exit(1)
    print(f"OK · aldea: {r['sprites']} sprites ({r['houses']} casas), {r['lights']} luces, escena {r['sceneMs']} ms, fotograma {r['villageFrameMedianMs']} ms · biomas: " + ', '.join(f"{d} {v['chunkMs']} ms" for d, v in r['biomes'].items()))

asyncio.run(main())
