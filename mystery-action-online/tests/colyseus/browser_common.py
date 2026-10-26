"""Arranque común de las pruebas de navegador contra el servidor real (Colyseus + SQLite)."""
import json, os, shutil, subprocess, tempfile
HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.dirname(os.path.dirname(HERE))
VENDOR = os.path.join(ROOT, 'tests/.vendor')
REAL = os.path.isdir(os.path.join(ROOT, 'node_modules/@colyseus/core'))   # instalado con npm: se usan los paquetes
NODE_ARGS = [] if REAL else ['--import', os.path.join(VENDOR, 'loader.mjs')]

class Stack:
    def __init__(self, gport, wport, reconnect=45):
        self.gport, self.wport = gport, wport
        self.out = tempfile.mkdtemp(prefix='ma-web-'); self.db = os.path.join(tempfile.mkdtemp(prefix='ma-db-'), 'mystery-action.db')
        subprocess.run(['node', 'tools/split-prototype.mjs'], cwd=ROOT, check=True, capture_output=True)
        esb = os.environ.get('ESBUILD') or shutil.which('esbuild') or os.path.join(ROOT, 'node_modules/.bin/esbuild')
        alias = [] if REAL else [f'--alias:@colyseus/sdk={VENDOR}/sdk.browser.mjs']
        subprocess.run([esb, 'client/src/main.js', '--bundle', '--format=esm', f'--outdir={self.out}/src', *alias,
                        f'--define:import.meta.env={{"VITE_SERVER_URL":"http://127.0.0.1:{gport}"}}', '--log-level=error'], cwd=ROOT, check=True)
        shutil.copy(os.path.join(ROOT, 'client/public/game.js'), self.out)
        html = open(os.path.join(ROOT, 'client/index.html')).read().replace('<script type="module" src="/src/main.js"></script>', '<link rel="stylesheet" href="/src/main.css"><script type="module" src="/src/main.js"></script>')
        open(os.path.join(self.out, 'index.html'), 'w').write(html)
        self.srv = subprocess.Popen(['node', *NODE_ARGS, os.path.join(HERE, 'serve-for-browser.mjs'), str(gport), str(wport), self.out, self.db, str(reconnect)], cwd=ROOT, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
        line = self.srv.stdout.readline()
        while 'ready' not in line:
            if not line: raise SystemExit('el servidor no arrancó')
            line = self.srv.stdout.readline()
        self.url = f'http://127.0.0.1:{wport}/'
    def db_tool(self, *args):
        r = subprocess.run(['node', os.path.join(HERE, 'db-tool.mjs'), self.db, *args], cwd=ROOT, capture_output=True, text=True, check=True)
        return json.loads([l for l in r.stdout.splitlines() if l.startswith('{') or l.startswith('[')][-1])
    def ctl(self, op, **args):
        import urllib.request, urllib.parse
        q = urllib.parse.quote(json.dumps(args))
        with urllib.request.urlopen(f'{self.url}__test/{op}?a={q}', timeout=10) as r: return json.loads(r.read())
    def close(self):
        self.srv.terminate(); shutil.rmtree(self.out, ignore_errors=True)

def watch_errors(pg, errs, name):
    errs[name] = []
    pg.on('pageerror', lambda e: errs[name].append(str(e)))
    pg.on('console', lambda m: m.type == 'error' and 'net::' not in m.text and 'Failed to load resource' not in m.text and errs[name].append(m.text))
