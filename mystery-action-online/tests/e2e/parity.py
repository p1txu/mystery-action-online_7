"""El navegador (prototipo completo, con dibujo y arte) y Node (núcleo generado del servidor)
dan la misma firma de reglas, los mismos pisos y las mismas estadísticas."""
import asyncio, json, os, subprocess, sys
from playwright.async_api import async_playwright
HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.dirname(os.path.dirname(HERE))
SIG = open(os.path.join(HERE, 'signature.js')).read().split('\n', 2)[2]
async def main(html):
    node = subprocess.run(['node', '--input-type=module', '-e', f'''import {{ createEngineCore }} from "{ROOT}/shared/engine-core.generated.js"; const E = createEngineCore(); console.log(JSON.stringify(({SIG})(E)))'''], capture_output=True, text=True, check=True)
    n = json.loads(node.stdout)
    async with async_playwright() as p:
        b = await p.chromium.launch(); pg = await b.new_page(); await pg.goto('file://' + os.path.abspath(html)); await pg.wait_for_timeout(300)
        w = await pg.evaluate(f'''(() => {{ const E = {{ CONFIG, MOVES, ENEMIES, ENEMY_VARIANTS, BOSSES, SPECIES, EVOLVED, FORMS, ITEMS, LOOT, DUNGEONS, TYPE_CHART, SOLID, FloorGen, Player, Enemy, Progress, makeKind, expYield }}; return ({SIG})(E) }})()''')
        await b.close()
    ok = [('reglas (movimientos, enemigos, objetos, botín, mazmorras, configuración)', n['rules'] == w['rules']), (f'{len(n["floors"])} pisos de las 3 mazmorras', n['floors'] == w['floors']), ('estadísticas y experiencia de ejemplo', n['dmg'] == w['dmg'])]
    for name, good in ok: print(('PASS ' if good else 'FAIL ') + 'navegador = servidor: ' + name)
    if not all(g for _, g in ok): print(json.dumps({'node': n, 'web': w})[:1500])
    return all(g for _, g in ok)
if __name__ == '__main__': sys.exit(0 if asyncio.run(main(sys.argv[1])) else 1)
