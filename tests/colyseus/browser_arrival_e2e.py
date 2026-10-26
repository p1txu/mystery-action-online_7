"""Llegada a la aldea y versión, en un navegador real contra el servidor real (Colyseus + SQLite):
 - «Jugar» → crear cuenta → elegir Guerrero → escena de la carretilla con el alcalde (sin ayudas de prueba).
 - La versión del juego se ve en el título y coincide con la del servidor (/api/health).
 - El alcalde deja volver a verla («¿Cómo llegué aquí?») sin tocar el perfil.
 - Una pestaña antigua (el servidor dice otra versión) se recarga sola una vez y luego avisa."""
import asyncio, json, os, sys, urllib.request
from playwright.async_api import async_playwright
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from browser_common import Stack, watch_errors
R = []
def check(n, ok, info=''):
    R.append(bool(ok)); print(('PASS ' if ok else 'FAIL ') + n, json.dumps(info, ensure_ascii=False)[:420] if info != '' else '', flush=True)
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

async def main():
    shots = os.environ.get('SHOT_DIR', '.')
    ver = json.load(open(os.path.join(ROOT, 'version.json')))
    st = Stack(2894, 2895)
    try:
        async with async_playwright() as pw:
            b = await pw.chromium.launch(); errs = {}
            ctx = await b.new_context(viewport={'width': 1100, 'height': 720}); pg = await ctx.new_page(); watch_errors(pg, errs, 'jugador')
            await pg.goto(st.url); await pg.wait_for_selector('#game-version')
            tag = await pg.inner_text('#game-version')
            with urllib.request.urlopen('http://127.0.0.1:2894/api/health', timeout=5) as r: health = json.loads(r.read())
            check('la versión se ve en el título y es la del servidor', tag == f"Versión {ver['version']} · build {ver['build']}" and health['build'] == ver['build'], [tag, health.get('build')])
            check('sin ayudas de prueba (la escena no está desactivada)', not await pg.evaluate("!!window.MA_NO_INTRO || localStorage.getItem('ma-no-intro') === '1'"))

            await pg.click('#btn-play'); await pg.click('#on-toreg')
            await pg.fill('#on-ruser', 'gerardo_' + str(os.getpid() % 10000)); await pg.fill('#on-rpass', 'clave-larga-1'); await pg.fill('#on-rpass2', 'clave-larga-1'); await pg.fill('#on-rname', 'Gerardo')
            await pg.click('#on-register'); await pg.wait_for_function("MysteryAction.state === 'select'", timeout=8000)
            await pg.click('#card-guerrero')
            await pg.wait_for_function("MysteryAction.cine && MysteryAction.cine.kind === 'arrival'", timeout=8000)
            await pg.wait_for_timeout(3500); await pg.screenshot(path=os.path.join(shots, 'llegada_guerrero.png'))
            check('cuenta nueva + Guerrero: empieza la llegada en carretilla', await pg.evaluate("MysteryAction.save.species === 'guerrero' && MysteryAction.player.cineHidden === true"))
            await pg.wait_for_function("!document.getElementById('dialog').hidden", timeout=15000)
            lines = []
            for k in range(6):
                if await pg.evaluate("!document.getElementById('dialog').hidden"):
                    lines.append(await pg.inner_text('#dialog-text')); await pg.click('#dialog-btn-0'); await pg.wait_for_timeout(250)
            check('el alcalde da la bienvenida', any('el tiempo que necesites' in l for l in lines), lines)
            await pg.wait_for_function("!MysteryAction.cine && MysteryAction.save.arrived === true", timeout=6000)
            v0 = await pg.evaluate("MysteryAction.account.version")

            # Volver a verla desde la casa del alcalde
            await pg.evaluate("MysteryAction.openStation('mayor')")
            await pg.wait_for_selector('#dialog:not([hidden])'); btns = await pg.locator('#dialog-btns button').all_inner_texts()
            check('el alcalde ofrece «¿Cómo llegué aquí?»', '¿Cómo llegué aquí?' in btns, btns)
            await pg.click('#dialog-btn-1')
            await pg.wait_for_function("MysteryAction.cine && MysteryAction.cine.kind === 'arrival'", timeout=4000)
            await pg.wait_for_timeout(800); await pg.keyboard.press('Escape')
            await pg.wait_for_function("!MysteryAction.cine && !MysteryAction.paused", timeout=6000)
            v1 = await pg.evaluate("MysteryAction.account.version")
            check("se repite, se salta con Esc y no cambia el perfil", v0 == v1 and v0 > 0 and await pg.evaluate("MysteryAction.save.arrived === true && MysteryAction.state === 'play'"), [v0, v1])

            # Pestaña antigua: el servidor responde con otra versión → recarga una vez y avisa
            loads = []
            pg.on('load', lambda: loads.append(1))
            await pg.route('**/api/health', lambda route: route.fulfill(status=200, content_type='application/json', body=json.dumps({'ok': True, 'version': '9.9', 'build': 999})))
            await pg.reload(); await pg.wait_for_timeout(2500)
            tag2 = await pg.inner_text('#game-version')
            check('pestaña antigua: se recarga sola una vez y después avisa', len(loads) == 2 and 'recarga la página' in tag2, [len(loads), tag2])
            for n, e in errs.items(): check(f'sin errores de JavaScript ({n})', not e, e[:5])
            await b.close()
    finally:
        st.close()
    print(f'{sum(R)}/{len(R)} correctas', flush=True)
    sys.exit(0 if all(R) else 1)

asyncio.run(main())
