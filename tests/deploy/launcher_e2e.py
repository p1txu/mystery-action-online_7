"""Lo que verá quien abra Jugar.bat: el lanzador en una copia limpia del proyecto y dos navegadores
que entran por la dirección que muestra, crean cuenta y criatura, crean una partida privada, se unen
con el código y se ven moverse. npm se sustituye por un guion de prueba (sin acceso al registro)."""
import asyncio, json, os, re, shutil, subprocess, sys, tempfile, time, urllib.request
from playwright.async_api import async_playwright
HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.dirname(os.path.dirname(HERE))
REAL = os.path.isdir(os.path.join(ROOT, 'node_modules/@colyseus/core'))
R = []
def check(n, ok, info=''):
    R.append(bool(ok)); print(('PASS ' if ok else 'FAIL ') + n, json.dumps(info, ensure_ascii=False)[:240] if info != '' else '', flush=True)

async def until(pg, expr, timeout=8000):
    for _ in range(int(timeout / 100)):          # la CSP (el servidor sirve el juego) bloquea wait_for_function: se sondea
        if await pg.evaluate(expr): return True
        await pg.wait_for_timeout(100)
    raise TimeoutError('esperando: ' + expr)

async def main():
    tmp = tempfile.mkdtemp(prefix='Mystery Action '); dst = os.path.join(tmp, 'mystery-action-online')
    shutil.copytree(ROOT, dst, ignore=shutil.ignore_patterns('node_modules', '.vendor', '.tmp', 'data', 'dist', '.dev'))
    env = dict(os.environ)
    if not REAL:
        with open(os.path.join(dst, 'fake-npm.sh'), 'w') as f: f.write('#!/bin/sh\nmkdir -p node_modules/@colyseus/core node_modules/@colyseus/sdk node_modules/esbuild\n')
        os.chmod(os.path.join(dst, 'fake-npm.sh'), 0o755)
        env.update({'MA_NPM': os.path.join(dst, 'fake-npm.sh'), 'COLYSEUS_SDK_ALIAS': os.path.join(ROOT, 'tests/.vendor/sdk.browser.mjs')})
    loader = [] if REAL else ['--import', os.path.join(ROOT, 'tests/.vendor/loader.mjs')]
    p = subprocess.Popen(['node', *loader, 'tools/launch.mjs', '--no-open', '--no-update', '--port', '4590'], cwd=dst, env=env, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
    out = ''
    t0 = time.time()
    while '¡Listo!' not in out and time.time() - t0 < 90:
        line = p.stdout.readline()
        if not line: break
        out += line
    m = re.search(r'El juego está en:\s+(http://\S+)', out)
    check('el lanzador deja el juego listo y dice la dirección', bool(m), out[-300:])
    url = m.group(1)
    try:
        async with async_playwright() as pw:
            b = await pw.chromium.launch(); errs = []
            pages = []
            for name, sp in [('Ana', 'guerrero'), ('Beto', 'arquero')]:
                ctx = await b.new_context(viewport={'width': 1100, 'height': 720}); pg = await ctx.new_page()
                pg.on('pageerror', lambda e: errs.append(str(e)))
                await pg.goto(url); await pg.wait_for_timeout(300); await pg.click('#btn-online')
                await pg.click('.on-tab[data-tab="guest"]'); await pg.fill('#on-name', name); await pg.click('#on-guest')
                await pg.wait_for_selector(f'.on-fresh[data-sp="{sp}"]', timeout=8000); await pg.click(f'.on-fresh[data-sp="{sp}"]')
                await pg.wait_for_selector('#on-profile-card', timeout=5000); pages.append(pg)
            A, B = pages
            check('el juego encuentra solo su servidor (la misma dirección: un solo puerto)', (await A.evaluate("MysteryLobby.server")) == url == 'http://localhost:4590', [url, await A.evaluate("MysteryLobby.server")])
            await A.click('#on-create'); await until(A, "/^[A-Z2-9]{6}$/.test((document.querySelector('#on-code-val')||{}).textContent||'')", 8000)
            code = await A.inner_text('#on-code-val')
            await B.fill('#on-code', code); await B.click('#on-join'); await B.wait_for_selector('#on-ready', timeout=8000)
            await B.click('#on-ready'); await until(A, "!document.querySelector('#on-start').disabled", 5000); await A.click('#on-start')
            await asyncio.gather(*[until(x, "MysteryAction.net && MysteryAction.net.active && MysteryAction.net.remotes.size === 1", 10000) for x in pages])
            before = await B.evaluate("[...MysteryAction.net.remotes.values()][0].x")
            await A.click('#view')
            for k in ['ArrowRight', 'ArrowLeft']:
                await A.keyboard.down(k); await A.wait_for_timeout(700); await A.keyboard.up(k); await A.wait_for_timeout(400)
                if abs(await B.evaluate("[...MysteryAction.net.remotes.values()][0].x") - before) > 8: break
            after = await B.evaluate("[...MysteryAction.net.remotes.values()][0].x")
            check('dos jugadores en la misma partida privada, y Beto ve moverse a Ana', abs(after - before) > 8, [before, after])
            # Cuenta guardada con el lanzador antiguo (servidor en :2567 de este PC): se sigue usando, ahora en la misma dirección
            req = urllib.request.Request(url + '/api/auth/guest', data=json.dumps({'name': 'Vieja'}).encode(), headers={'content-type': 'application/json'}, method='POST')
            tok = json.loads(urllib.request.urlopen(req, timeout=5).read())
            ctx = await b.new_context(); await ctx.add_init_script("localStorage.setItem('ma-online-auth', " + json.dumps(json.dumps({'server': 'http://localhost:2567', 'token': tok['token'], 'accountId': tok['account']['id'], 'name': 'Vieja', 'kind': 'guest'})) + ")")
            C = await ctx.new_page(); C.on('pageerror', lambda e: errs.append(str(e)))
            await C.goto(url); await C.wait_for_timeout(300); await C.click('#btn-online'); await C.wait_for_selector('.on-fresh', timeout=8000)
            check('una cuenta del lanzador antiguo (:2567) sigue funcionando: entra sin volver a iniciar sesión', (await C.evaluate("MysteryLobby.server")) == url and 'Vieja' in await C.inner_text('#online'), await C.evaluate("MysteryLobby.server"))
            check('sin errores de JavaScript', not errs, errs[:3])
            await b.close()
    finally:
        p.terminate()
        try: p.wait(timeout=10)
        except Exception: p.kill()
        shutil.rmtree(tmp, ignore_errors=True)
    print(f'{sum(R)}/{len(R)} correctas'); return all(R)
if __name__ == '__main__': sys.exit(0 if asyncio.run(main()) else 1)
