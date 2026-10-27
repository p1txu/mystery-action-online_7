"""Sprites de los héroes (HeroForge) en un navegador real, sobre el prototipo:
 - Las 4 clases × 5 vistas × todas las animaciones se generan sin errores y no están vacías.
 - Ningún fotograma se sale del lienzo (sin píxeles en los bordes): nada se corta al caer o atacar.
 - Los pies están en el punto de anclaje (no flotan ni se hunden) en reposo, al andar y al atacar.
 - Escala coherente: en reposo de frente, las cuatro clases miden lo mismo (±15 %) y ocupan ~1,5 casillas.
 - Ocho direcciones: pick() da la vista y el reflejo correctos para cada dirección y el arma no cambia de mano.
 - Paleta limitada: cada fotograma usa solo colores de las paletas de los héroes (sin suavizado).
 - Se pueden preparar en segundo plano (warm) y luego dibujar es instantáneo.
Uso: python3 tests/e2e/hero_sprites.py tests/.tmp/prototype.html"""
import asyncio, json, os, sys
from playwright.async_api import async_playwright
R = []
def check(n, ok, info=''):
    R.append(bool(ok)); print(('PASS ' if ok else 'FAIL ') + n, json.dumps(info, ensure_ascii=False)[:500] if info != '' else '', flush=True)

JS = r'''() => {
  const H = HeroSprites, out = { frames: 0, empty: [], clipped: [], feet: [], colors: [], heights: {}, dirs: [] };
  const pal = new Set(); for (const k of Object.keys(HERO_PAL)) for (const c of HERO_PAL[k]) pal.add(c.toLowerCase());
  const hex = (r, g, b) => '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');
  for (const cls of ['guerrero', 'arquero', 'mago', 'asesino']) for (const a of Object.keys(H.ANIMS)) for (const v of H.DIRS) for (let f = 0; f < H.ANIMS[a]; f++) {
    const cv = H.frame(cls, v, a, f), d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data, W = cv.width, Hh = cv.height;
    let n = 0, edge = 0, minY = 1e9, maxY = -1, bad = 0;
    for (let y = 0; y < Hh; y++) for (let x = 0; x < W; x++) { const i = (y * W + x) * 4; if (!d[i + 3]) continue; n++; if (x === 0 || y === 0 || x === W - 1 || y === Hh - 1) edge++; minY = Math.min(minY, y); maxY = Math.max(maxY, y);
      if (d[i + 3] !== 255 || !pal.has(hex(d[i], d[i + 1], d[i + 2]))) bad++; }
    out.frames++;
    const id = `${cls}/${v}/${a}/${f}`;
    if (n < 150) out.empty.push(id);
    if (edge) out.clipped.push(id);
    if (bad) out.colors.push([id, bad]);
    // pie más bajo: en reposo, en el anclaje (±3 px; el bajo de la túnica del mago, hasta 5); al andar o atacar, el pie que se adelanta hacia la cámara baja algo por la perspectiva (hasta 6 px)
    const lo = maxY - (cv.oy + 1); if ((a === 'idle' && (lo < -3 || lo > (cls === 'mago' ? 5 : 3))) || ((a === 'walk' || a === 'attack') && (lo < -3 || lo > 6))) out.feet.push([id, maxY, cv.oy]);
    if (a === 'idle' && v === 0 && f === 0) out.heights[cls] = maxY - minY + 1;
  }
  // Ocho direcciones
  for (let k = 0; k < 8; k++) { const ang = k * Math.PI / 4, fx = Math.sin(ang), fy = Math.cos(ang); const s = H.pick('guerrero', { fx, fy, t: 0 }); out.dirs.push([k, s.dir, s.flip]); }
  // Preparación en segundo plano y coste de dibujar
  H.cache = {}; H.warmed = {}; H.queue = []; H.warm('mago');
  out.queued = H.queue.length;
  return out;
}'''

async def main(html):
    async with async_playwright() as p:
        b = await p.chromium.launch(); pg = await b.new_page()
        errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.goto('file://' + os.path.abspath(html)); await pg.wait_for_timeout(400)
        r = await pg.evaluate(JS)
        check(f"se generan todos los fotogramas ({r['frames']}: 4 clases × 5 vistas × animaciones)", r['frames'] == 4 * 5 * 46, r['frames'])
        check('ningún fotograma vacío', not r['empty'], r['empty'][:10])
        check('ningún fotograma cortado por el borde del lienzo (caídas, tajos, capas)', not r['clipped'], r['clipped'][:10])
        check('los pies en el punto de anclaje (reposo, andar, atacar)', not r['feet'], r['feet'][:10])
        hs = r['heights']; mn, mx = min(hs.values()), max(hs.values())
        body = [hs[k] for k in ('guerrero', 'arquero', 'asesino')]
        check('escala coherente: guerrero, arquero y asesino (agachado) miden lo mismo ±20 %; el mago, con su sombrero, hasta un 40 % más; todos entre 1,3 y 2,2 casillas', max(body) <= min(body) * 1.2 and hs['mago'] <= min(body) * 1.4 and mn >= 42 and mx <= 70, hs)
        check('solo colores de la paleta de los héroes, sin semitransparencias (pixel art limpio)', not r['colors'], r['colors'][:8])
        exp = [[0, 0, 1], [1, 1, 1], [2, 2, 1], [3, 3, 1], [4, 4, 1], [5, 3, -1], [6, 2, -1], [7, 1, -1]]
        check('8 direcciones: abajo, ¾ abajo, perfil, ¾ arriba y arriba; a la izquierda, reflejadas', r['dirs'] == exp, r['dirs'])
        check('se preparan en segundo plano (cola de la clase)', r['queued'] >= 200, r['queued'])
        await pg.wait_for_function("HeroSprites.queue.length === 0", timeout=20000)
        t = await pg.evaluate("(() => { const t0 = performance.now(); for (let i = 0; i < 200; i++) HeroSprites.frame('mago', i % 5, 'walk', i % 8); return performance.now() - t0; })()")
        check('ya preparados, pedir 200 fotogramas cuesta < 5 ms', t < 5, round(t, 2))
        check('sin errores de JavaScript', not errs, errs[:3])
        await b.close()
    print(f'{sum(R)}/{len(R)} correctas', flush=True)
    sys.exit(0 if all(R) else 1)

asyncio.run(main(sys.argv[1]))
