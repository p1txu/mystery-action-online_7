"""Dos jugadores entran por HTTPS y juegan por WebSocket seguro (wss://), como en el despliegue:
cliente compilado para producción (tools/build-client.mjs) + servidor con NODE_ENV=production +
proxy TLS que reproduce deploy/Caddyfile (tests/deploy/tls-proxy.mjs, certificado autofirmado).
Comprueba la redirección a HTTPS, las cabeceras de seguridad (CSP incluida, sin errores), que todo
el tráfico de juego va por wss://, crear sala y unirse con el código, jugar a la vez, una reconexión
tras un corte de red y el aviso si alguien configura un servidor http:// desde una página https://."""
import asyncio, json, os, secrets, shutil, subprocess, sys, tempfile
from playwright.async_api import async_playwright
HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.dirname(os.path.dirname(HERE))
REAL = os.path.isdir(os.path.join(ROOT, 'node_modules/@colyseus/core'))
LOADER = [] if REAL else ['--import', os.path.join(ROOT, 'tests/.vendor/loader.mjs')]
R = []
def check(n, ok, info=''):
    R.append(bool(ok)); print(('PASS ' if ok else 'FAIL ') + n, json.dumps(info, ensure_ascii=False)[:300] if info != '' else '', flush=True)

async def until(pg, expr, timeout=8000):
    # Sondeo con evaluate (CDP): wait_for_function usa eval dentro de la página y la CSP lo bloquea
    for _ in range(int(timeout / 100)):
        if await pg.evaluate(expr): return True
        await pg.wait_for_timeout(100)
    st = await pg.evaluate("({s: MysteryLobby.session && MysteryLobby.session.status, e: MysteryLobby.session && MysteryLobby.session.error, m: document.querySelector('#online').innerText.slice(0, 200)})")
    raise TimeoutError('esperando: ' + expr + ' · ' + json.dumps(st, ensure_ascii=False))

def wait_ready(p, word):
    line = p.stdout.readline()
    while word not in line:
        if not line: raise SystemExit('no arrancó: ' + p.args[-1])
        line = p.stdout.readline()

async def main():
    tmp = tempfile.mkdtemp(prefix='ma-tls-'); H, P, G = 8443, 8480, 2590
    subprocess.run(['openssl', 'req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', f'{tmp}/key.pem', '-out', f'{tmp}/cert.pem', '-days', '1',
                    '-subj', '/CN=localhost', '-addext', 'subjectAltName=DNS:localhost,IP:127.0.0.1'], check=True, capture_output=True)
    env = dict(os.environ)
    if not REAL: env['COLYSEUS_SDK_ALIAS'] = os.path.join(ROOT, 'tests/.vendor/sdk.browser.mjs')
    subprocess.run(['node', 'tools/split-prototype.mjs'], cwd=ROOT, check=True, capture_output=True)
    env.pop('SERVER_URL', None)
    subprocess.run(['node', 'tools/build-client.mjs', '--out', f'{tmp}/dist'], cwd=ROOT, check=True, env=env, capture_output=True)   # misma dirección que la página
    senv = {'PATH': os.environ['PATH'], 'NODE_ENV': 'production', 'PORT': str(G), 'AUTH_SECRET': secrets.token_urlsafe(48), 'CLIENT_ORIGIN': f'https://localhost:{H}',
            'TRUST_PROXY': '1', 'PROFILE_STORE': 'sqlite', 'SQLITE_FILE': f'{tmp}/perfiles.db', 'DATA_DIR': tmp, 'RECONNECT_SECONDS': '60'}
    srv = subprocess.Popen(['node', *LOADER, 'server/src/index.js'], cwd=ROOT, env=senv, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
    wait_ready(srv, 'server.ready')
    proxy = subprocess.Popen(['node', os.path.join(HERE, 'tls-proxy.mjs'), str(H), str(P), str(G), f'{tmp}/dist', f'{tmp}/cert.pem', f'{tmp}/key.pem'], cwd=ROOT, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
    wait_ready(proxy, 'ready')
    try:
        async with async_playwright() as pw:
            b = await pw.chromium.launch()
            errs, sockets, missing = {}, {}, []
            async def player(name, species):
                ctx = await b.new_context(ignore_https_errors=True, viewport={'width': 1100, 'height': 720}); pg = await ctx.new_page()
                errs[name] = []; sockets[name] = []
                pg.on('pageerror', lambda e: errs[name].append(str(e)))
                pg.on('console', lambda m: m.type == 'error' and 'net::' not in m.text and errs[name].append(m.text))
                pg.on('websocket', lambda ws: sockets[name].append(ws.url))
                pg.on('response', lambda r: r.status >= 400 and missing.append((r.status, r.url.split('?')[0])))
                resp = await pg.goto(f'http://localhost:{P}/')            # el enlace sin https también funciona: redirige
                await pg.wait_for_timeout(300)
                await pg.click('#btn-online'); await pg.click('.on-tab[data-tab="guest"]'); await pg.fill('#on-name', name); await pg.click('#on-guest')
                await pg.wait_for_selector(f'.on-fresh[data-sp="{species}"]', timeout=8000); await pg.click(f'.on-fresh[data-sp="{species}"]')
                await pg.wait_for_selector('#on-profile-card', timeout=5000)
                return ctx, pg, resp
            (ca, A, ra), (cb, B, rb) = await asyncio.gather(player('Ana', 'voltrino'), player('Beto', 'magmolo'))
            check('http:// redirige a https:// y el juego se carga por HTTPS', A.url.startswith(f'https://localhost:{H}/') and ra.ok, A.url)
            hd = ra.headers
            check('cabeceras de seguridad: CSP, HSTS, nosniff, sin marcos', all(k in hd for k in ['content-security-policy', 'strict-transport-security', 'x-content-type-options']) and "frame-ancestors 'none'" in hd['content-security-policy'], hd.get('content-security-policy', '')[:120])
            srv_url = await A.evaluate("MysteryLobby.server")
            check('el cliente usa por defecto la misma dirección https:// que la página', srv_url == f'https://localhost:{H}', srv_url)
            await A.click('#on-create'); await until(A, "/^[A-Z2-9]{6}$/.test((document.querySelector('#on-code-val')||{}).textContent||'')", 8000)
            code = await A.inner_text('#on-code-val')
            await B.fill('#on-code', code); await B.click('#on-join'); await B.wait_for_selector('#on-ready', timeout=8000)
            await B.click('#on-ready'); await until(A, "!document.querySelector('#on-start').disabled", 6000); await A.click('#on-start')
            await asyncio.gather(*[until(p, "MysteryAction.net && MysteryAction.net.active && MysteryAction.net.remotes.size === 1", 10000) for p in (A, B)])
            check('sala privada creada y unida con el código a través de HTTPS', True, code)
            ws_ok = all(sockets[n] and all(u.startswith(f'wss://localhost:{H}/') for u in sockets[n]) for n in sockets)
            check('todo el tráfico de juego va por WebSocket seguro (wss://)', ws_ok, {n: [u.split('?')[0] for u in v] for n, v in sockets.items()})
            tokens = [await p.evaluate("JSON.parse(localStorage.getItem('ma-online-auth')).token") for p in (A, B)]
            check('el token de sesión no aparece en ninguna URL de WebSocket', not any(t in u or '_authToken' in u for t in tokens for n in sockets for u in sockets[n]))
            before = await B.evaluate("[...MysteryAction.net.remotes.values()][0].x")
            await A.click('#view'); await A.keyboard.down('ArrowRight'); await A.wait_for_timeout(700); await A.keyboard.up('ArrowRight'); await A.wait_for_timeout(400)
            if abs(await B.evaluate("[...MysteryAction.net.remotes.values()][0].x") - before) < 8:
                await A.keyboard.down('ArrowLeft'); await A.wait_for_timeout(700); await A.keyboard.up('ArrowLeft'); await A.wait_for_timeout(400)
            after = await B.evaluate("[...MysteryAction.net.remotes.values()][0].x")
            check('Beto ve moverse a Ana en tiempo real por wss://', abs(after - before) > 8, [before, after])
            # Corte de red de Beto y reconexión automática a través del proxy TLS
            await cb.set_offline(True)
            await until(A, "[...MysteryAction.net.remotes.values()].some(r => !r.netConnected)", 30000)
            await cb.set_offline(False)
            await until(B, "MysteryLobby.session && MysteryLobby.session.status === 'playing' && MysteryAction.net.connected", 45000)
            await until(A, "[...MysteryAction.net.remotes.values()].every(r => r.netConnected)", 8000)
            check('tras un corte de red, Beto vuelve solo a la partida por wss:// (mismo asiento)', all(u.startswith('wss://') for u in sockets['Beto']) and len(sockets['Beto']) >= 2, len(sockets['Beto']))
            # Configuración errónea: servidor http:// desde una página https:// → mensaje claro
            cc = await b.new_context(ignore_https_errors=True); X = await cc.new_page(); await X.goto(f'https://localhost:{H}/'); await X.wait_for_timeout(300)
            await X.click('#btn-online'); await X.fill('#on-server', f'http://127.0.0.1:{G}'); await X.click('.on-tab[data-tab="guest"]'); await X.fill('#on-name', 'Xavi'); await X.click('#on-guest')
            await X.wait_for_timeout(1200); t = await X.inner_text('#online')
            check('si alguien pone un servidor http:// en una página https://, el aviso lo explica', 'HTTPS' in t and 'https://' in t, t[:200])
            logs = [json.loads(l) for l in open(f'{tmp}/srv.log').read().splitlines()] if os.path.exists(f'{tmp}/srv.log') else []
            print('respuestas de error:', sorted(set(missing)))
            for n, e in errs.items(): check(f'sin errores en la consola, CSP incluida ({n})', not e, e[:3])
            await b.close()
    finally:
        srv.terminate(); proxy.terminate()
        try: out = srv.communicate(timeout=10)[0]
        except Exception: out = ''
        joins = [l for l in out.splitlines() if '"room.join"' in l]
        check('el servidor registra las entradas (JSON) y sale limpio al terminar', len(joins) >= 2 and srv.returncode == 0, {'joins': len(joins), 'exit': srv.returncode})
        shutil.rmtree(tmp, ignore_errors=True)
    print(f'{sum(R)}/{len(R)} correctas'); return all(R)
if __name__ == '__main__': sys.exit(0 if asyncio.run(main()) else 1)
