"""Jugar con amigos DESDE EL MISMO JUEGO: el lanzador (Jugar.bat) en una copia limpia del proyecto.
`cloudflared` se sustituye por tests/deploy/fake-cloudflared.mjs (mismos argumentos, misma salida y un
proxy HTTPS de verdad con certificado autofirmado), porque desde aquí no se puede llegar a Cloudflare.

Comprueba: un solo lanzador y un solo servidor; la anfitriona juega en http://localhost y, desde
«Cooperativo online», pulsa «Crear enlace para amigos» (el servidor abre el túnel bajo demanda);
el enlace de invitación usa la dirección pública; su amigo entra SOLO por ese enlace https, se unen,
se ven moverse; el amigo no ve ni puede usar el botón del túnel; otra web no puede abrir WebSockets;
«Cerrar enlace» lo cierra. Y `--host` (abrir el enlace al arrancar) lo anuncia en la ventana.
Lo que NO comprueba (no se puede desde aquí): el túnel real de Cloudflare ni una red externa."""
import asyncio, json, os, re, shutil, subprocess, sys, tempfile, time, urllib.request
from playwright.async_api import async_playwright
HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.dirname(os.path.dirname(HERE))
REAL = os.path.isdir(os.path.join(ROOT, 'node_modules/@colyseus/core'))
R = []
def check(n, ok, info=''):
    R.append(bool(ok)); print(('PASS ' if ok else 'FAIL ') + n, json.dumps(info, ensure_ascii=False)[:260] if info != '' else '', flush=True)

async def until(pg, expr, timeout=8000):
    for _ in range(int(timeout / 100)):          # la CSP bloquea wait_for_function: se sondea con evaluate
        if await pg.evaluate(expr): return True
        await pg.wait_for_timeout(100)
    raise TimeoutError('esperando: ' + expr)

def launcher(dst, env, port, extra=()):
    loader = [] if REAL else ['--import', os.path.join(ROOT, 'tests/.vendor/loader.mjs')]
    return subprocess.Popen(['node', *loader, 'tools/launch.mjs', '--no-open', '--no-update', '--port', str(port), *extra], cwd=dst, env=env, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
def read_until(p, marker, secs):
    out, t0 = '', time.time()
    while marker not in out and time.time() - t0 < secs:
        line = p.stdout.readline()
        if not line: break
        out += line
    return out
def stop(p):
    p.terminate()
    try: p.wait(timeout=10)
    except Exception: p.kill()

async def main():
    tmp = tempfile.mkdtemp(prefix='Mystery Action anfitrion '); dst = os.path.join(tmp, 'mystery-action-online')
    shutil.copytree(ROOT, dst, ignore=shutil.ignore_patterns('node_modules', '.vendor', '.tmp', 'data', 'dist', '.dev', 'bin', '.update'))
    subprocess.run(['openssl', 'req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', f'{tmp}/key.pem', '-out', f'{tmp}/cert.pem', '-days', '1',
                    '-subj', '/CN=localhost', '-addext', 'subjectAltName=DNS:localhost,IP:127.0.0.1'], check=True, capture_output=True)
    cf = os.path.join(tmp, 'cloudflared-falso.sh')
    with open(cf, 'w') as f: f.write(f'#!/bin/sh\nexec node "{os.path.join(HERE, "fake-cloudflared.mjs")}" "$@"\n')
    os.chmod(cf, 0o755)
    env = dict(os.environ, MA_CLOUDFLARED=cf, MA_TUNNEL_RE=r'https://localhost:[0-9]+', FAKE_TUNNEL_CERT=f'{tmp}/cert.pem', FAKE_TUNNEL_KEY=f'{tmp}/key.pem',
               NODE_TLS_REJECT_UNAUTHORIZED='0')   # solo para que el servidor acepte el certificado autofirmado del túnel falso
    if not REAL:
        with open(os.path.join(dst, 'fake-npm.sh'), 'w') as f: f.write('#!/bin/sh\nmkdir -p node_modules/@colyseus/core node_modules/@colyseus/sdk node_modules/esbuild\n')
        os.chmod(os.path.join(dst, 'fake-npm.sh'), 0o755)
        env.update({'MA_NPM': os.path.join(dst, 'fake-npm.sh'), 'COLYSEUS_SDK_ALIAS': os.path.join(ROOT, 'tests/.vendor/sdk.browser.mjs')})
    port = 4690; local = f'http://localhost:{port}'
    p = launcher(dst, env, port)
    out = read_until(p, '==============================================================\n', 120); out += read_until(p, '==============================================================', 10)
    check('un solo lanzador: el juego en localhost y el aviso del botón para amigos', f'El juego está en:  {local}' in out and 'Crear enlace para amigos' in out, out[-400:])
    try:
        async with async_playwright() as pw:
            b = await pw.chromium.launch(); errs = []
            async def player(url, name, sp):
                c = await b.new_context(ignore_https_errors=True, viewport={'width': 1100, 'height': 760}); pg = await c.new_page()
                pg.on('pageerror', lambda e: errs.append(str(e))); pg.on('console', lambda m: m.type == 'error' and 'net::' not in m.text and 'Failed to load resource' not in m.text and errs.append(m.text))
                resp = await pg.goto(url); await pg.wait_for_timeout(300)
                await pg.evaluate("n => MysteryLobby.devGuest(n)", name)
                await pg.wait_for_selector(f'.on-fresh[data-sp="{sp}"]', timeout=8000); await pg.click(f'.on-fresh[data-sp="{sp}"]')
                await pg.wait_for_selector('#on-profile-card', timeout=5000); return pg, resp
            A, _ = await player(local, 'Ana', 'guerrero')
            check('la anfitriona juega en su PC y su juego habla con el servidor de esa misma dirección', (await A.evaluate("MysteryLobby.server")) == local, await A.evaluate("MysteryLobby.server"))
            await until(A, "!!document.querySelector('#on-host-open')")
            check('en «Cooperativo online» aparece «Jugar con amigos por Internet» con su botón', 'Crear enlace para amigos' in await A.inner_text('#on-host'))
            await A.click('#on-host-open')
            await until(A, "!!document.querySelector('#on-host-url')", 60000)
            url = (await A.inner_text('#on-host-url')).strip()
            await A.evaluate("document.getElementById('on-host').scrollIntoView({block:'center'})"); await A.screenshot(path=os.path.join(os.environ.get('SHOT_DIR', tempfile.gettempdir()), 'enlace_amigos.png'))
            check('al pulsarlo, el servidor abre el túnel y el juego muestra el enlace https', re.match(r'^https://localhost:\d+$', url) is not None and 'responde desde Internet' in await A.inner_text('#on-host'), url)
            await A.click('#on-create'); await until(A, "/^[A-Z2-9]{6}$/.test((document.querySelector('#on-code-val')||{}).textContent||'')")
            code = await A.inner_text('#on-code-val')
            await A.click('#on-invite'); await A.wait_for_timeout(300)
            msg = await A.inner_text('.on-msg')
            invite = f'{url}/?sala={code}'
            check('«copiar enlace de invitación» da la dirección pública (no localhost)', invite in msg, msg)
            B, resp = await player(invite, 'Beto', 'arquero')
            check('el amigo entra solo con ese enlace (la página la sirve el servidor de la anfitriona, con CSP)', resp.ok and 'content-security-policy' in resp.headers and (await B.evaluate("MysteryLobby.server")) == url, await B.evaluate("MysteryLobby.server"))
            check('el amigo no ve el botón del túnel ni puede usarlo', not await B.evaluate("!!document.querySelector('#on-host')") and (await B.evaluate(f"fetch('{url}/api/host/open', {{ method: 'POST' }}).then(r => r.status)")) == 403)
            if not await B.input_value('#on-code'): await B.fill('#on-code', code)
            await B.click('#on-join'); await B.wait_for_selector('#on-ready', timeout=8000)
            await B.click('#on-ready'); await until(A, "!document.querySelector('#on-start').disabled", 6000); await A.click('#on-start')
            await asyncio.gather(*[until(x, "MysteryAction.net && MysteryAction.net.active && MysteryAction.net.remotes.size === 1", 12000) for x in (A, B)])
            before = await B.evaluate("[...MysteryAction.net.remotes.values()][0].x")
            await A.click('#view')
            for k in ['ArrowRight', 'ArrowLeft']:
                await A.keyboard.down(k); await A.wait_for_timeout(700); await A.keyboard.up(k); await A.wait_for_timeout(400)
                if abs(await B.evaluate("[...MysteryAction.net.remotes.values()][0].x") - before) > 8: break
            after = await B.evaluate("[...MysteryAction.net.remotes.values()][0].x")
            check('juegan juntos: la anfitriona desde localhost y su amigo por el enlace; él la ve moverse', abs(after - before) > 8, [before, after])
            host = url.split('//')[1]
            def ws_from(origin, base):
                js = "const W=require(process.env.WS_MODULE||'ws');const w=new W(process.argv[1],{origin:process.argv[2],rejectUnauthorized:false});w.on('unexpected-response',(q,r)=>{console.log(r.statusCode);process.exit(0)});w.on('open',()=>{console.log('open');process.exit(0)});w.on('error',e=>{console.log('error '+e.message);process.exit(0)})"
                r = subprocess.run(['node', '-e', js, base.replace('http', 'ws') + '/sin-sala', origin], capture_output=True, text=True, timeout=15, env=dict(os.environ, NODE_TLS_REJECT_UNAUTHORIZED='0'))
                return (r.stdout or r.stderr).strip()
            other, same = ws_from('https://otro-sitio.example', url), ws_from(url, url)
            check('modo producción: WebSockets desde otra web, rechazados (403); desde el enlace, aceptados', other == '403' and same != '403', {'otra web': other, 'el enlace': same})
            # Cerrar el enlace desde el juego (la anfitriona vuelve al menú al acabar; aquí se usa la API local como el botón)
            st = json.loads(urllib.request.urlopen(urllib.request.Request(local + '/api/host/close', method='POST', data=b'{}'), timeout=5).read())
            time.sleep(1)
            try: urllib.request.urlopen(url + '/api/health', timeout=3, context=__import__('ssl')._create_unverified_context()); gone = False
            except Exception: gone = True
            check('«Cerrar enlace» cierra el túnel: el enlace deja de funcionar', st['state'] == 'off' and gone, st)
            check('sin errores de JavaScript ni de CSP', not errs, errs[:3])
            await b.close()
    finally:
        stop(p)
    # --host: abre el enlace al arrancar y lo anuncia en la ventana
    p2 = launcher(dst, env, 4692, ['--host'])
    out = read_until(p2, '¡Partida lista!', 120); out += read_until(p2, '==============================================================', 10)
    m = re.search(r'Envía este enlace a tus amigos:\s+(https://\S+)', out)
    check('--host (antiguo «Jugar con amigos»): abre el enlace al arrancar, comprueba que responde y lo anuncia', bool(m) and '[OK] El enlace responde desde Internet' in out, out[-400:])
    stop(p2); time.sleep(1)
    alive = []
    for port_ in (4690, 4692):
        try: urllib.request.urlopen(f'http://localhost:{port_}/api/health', timeout=1); alive.append(port_)
        except Exception: pass
    check('al cerrar la ventana se paran el servidor y el túnel', not alive, alive)
    shutil.rmtree(tmp, ignore_errors=True)
    print(f'{sum(R)}/{len(R)} correctas'); return all(R)
if __name__ == '__main__': sys.exit(0 if asyncio.run(main()) else 1)
