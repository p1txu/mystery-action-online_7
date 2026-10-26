"""Las operaciones de la aldea que valida el servidor (server/src/profile/rules.js) dan EXACTAMENTE
el mismo perfil que los métodos del juego local (prototipo en el navegador) partiendo de la misma
partida. Los identificadores internos de las pilas (uid) se normalizan porque son aleatorios."""
import asyncio, json, os, subprocess, sys
from playwright.async_api import async_playwright
HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.dirname(os.path.dirname(HERE))

SETUP = r"""(E) => {
  const s = E.Save.fresh('voltrino'); s.prog = E.Progress.fresh('voltrino', 12); s.bank = 5000; s.cleared = ['bosque', 'gruta'];   // tienda (Topo) y tablón (Pico) ya presentes
  s.inv = [{ uid: 'a1', id: 'hojaTenaz', qty: 4 }, { uid: 'a2', id: 'setaLuminosa', qty: 2 }, { uid: 'a3', id: 'panueloRojo', qty: 1 }, { uid: 'a4', id: 'manzana', qty: 2 }];
  s.equip.brazalete = { uid: 'e1', id: 'brazalPiedra' };
  s.team = [{ uid: 't1', kind: 'pufon', name: 'Pufi', level: 4, exp: 0, active: true, fainted: false }, { uid: 't2', kind: 'mordisquin', name: 'Mor', level: 3, exp: 0, active: false, fainted: true }];
  s.board = E.Jobs.board(s, 4242);
  s.jobs = [{ id: 901, type: 'hunt', dungeon: 'bosque', client: 'Lumi', stars: 'E', target: 'pufon', goal: 1, progress: 1, state: 'done', reward: { exp: 400, gems: 40, item: 'pocion', points: 10 } }];
  return E.Save.sanitize(s).data;
}"""
STEPS = [['buy', {'id': 'pocion'}], ['sell', {'uid': 'a4'}], ['equip', {'uid': 'a3'}], ['unequip', {'slot': 'brazalete'}], ['craft', {'i': 0}],
         ['acceptJob', {'id': 'BOARD0'}], ['deliverJob', {'id': 901}], ['rest', {}], ['setActive', {'uid': 't1', 'on': False}], ['release', {'uid': 't2'}],
         ['evolve', {}], ['setMoves', {'equipped': 'FIRST2'}]]
NORM = r"""(s) => { const inv = {}; for (const x of s.inv) inv[x.id] = (inv[x.id] || 0) + x.qty;
  const equip = Object.fromEntries(Object.entries(s.equip).map(([k, v]) => [k, v && v.id]));
  return JSON.stringify(Object.assign({}, s, { inv: Object.entries(inv).sort(), equip, team: s.team.map(m => Object.assign({}, m, { uid: m.uid })) })); }"""

def resolve(step, s0):
    op, args = step; args = dict(args)
    if args.get('id') == 'BOARD0': args['id'] = s0['board'][0]['id']
    if args.get('equipped') == 'FIRST2': args['equipped'] = s0['prog']['known'][:2]
    return op, args

async def main(html):
    node = subprocess.run(['node', '--input-type=module', '-e', f'''
import {{ createEngineCore }} from "{ROOT}/shared/engine-core.generated.js";
import {{ applyOp }} from "{ROOT}/server/src/profile/rules.js";
const E = createEngineCore(), s0 = ({SETUP})(E), steps = JSON.parse(process.argv[1]);
const fix = (s, [op, a]) => {{ a = Object.assign({{}}, a); if (a.id === 'BOARD0') a.id = s.board[0].id; if (a.equipped === 'FIRST2') a.equipped = s.prog.known.slice(0, 2); return [op, a]; }};
const out = steps.map(st => {{ const [op, a] = fix(s0, st); try {{ return ({NORM})(applyOp(E, structuredClone(s0), op, a).save); }} catch (e) {{ return 'ERROR ' + e.message; }} }});
console.log(JSON.stringify({{ s0, out, base: ({NORM})(s0) }}));''', json.dumps(STEPS)], capture_output=True, text=True, check=True)
    srv = json.loads(node.stdout)
    async with async_playwright() as p:
        b = await p.chromium.launch(); pg = await b.new_page(); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.goto('file://' + os.path.abspath(html)); await pg.wait_for_timeout(300)
        web = await pg.evaluate(f'''(([s0, steps]) => {{ const G = MysteryAction; Save.readOnly = true;
          const call = (op, a) => {{ switch (op) {{
            case 'buy': return G.buyItem(a.id); case 'sell': return G.invAction('sell', a.uid, 'base'); case 'equip': return G.equip(a.uid); case 'unequip': return G.unequip(a.slot);
            case 'craft': return G.craft(a.i); case 'acceptJob': return G.acceptJob(a.id); case 'deliverJob': return G.deliverJob(a.id); case 'rest': return G.rest();
            case 'setActive': return G.setActive(a.uid, a.on); case 'release': return G.releaseAlly(a.uid);
            case 'evolve': G.evolve(); return G.finishEvolution(); case 'setMoves': G.save.prog.equipped = a.equipped.slice(); return; }} }};
          return steps.map(([op, a]) => {{ G.save = Save.sanitize(structuredClone(s0)).data; G.goBase(); call(op, a); return ({NORM})(Save.sanitize(G.save).data); }});
        }})''', [srv['s0'], [list(resolve(st, srv['s0'])) for st in STEPS]])
        await b.close()
    ok = True
    for st, a, w in zip(STEPS, srv['out'], web):
        same = a == w and a != srv['base'] and not a.startswith('ERROR'); ok &= same   # iguales y con efecto real
        print(('PASS ' if same else 'FAIL ') + f"servidor = juego local: {st[0]}", '' if same else json.dumps({'servidor': a[:300], 'local': w[:300]}, ensure_ascii=False))
    print('PASS sin errores de JavaScript' if not errs else 'FAIL errores: ' + str(errs[:3])); ok &= not errs
    return ok
if __name__ == '__main__': sys.exit(0 if asyncio.run(main(sys.argv[1])) else 1)
