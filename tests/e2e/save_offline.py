"""Guardado sin conexión (navegador, prototipo real, localStorage):
 - una partida guardada con el formato 6 se carga, se actualiza al 7 sin perder nada, se avisa y el
   original queda intacto en una copia aparte (`mystery-action-save-v1-v6`);
 - el guardado principal dañado se recupera de la copia de seguridad;
 - leer un texto del escenario y entrar en una sala secreta quedan en el registro de la partida local;
 - entregar una misión la apunta en el registro de misiones cumplidas.
No hay protección contra quien edite su propio navegador: la suma de comprobación solo detecta daños.
Uso: python3 tests/e2e/save_offline.py tests/.tmp/prototype.html"""
import asyncio, json, os, sys
from playwright.async_api import async_playwright
SRC = sys.argv[1]
R = []
def check(n, ok, info=''):
    R.append(bool(ok)); print(('PASS ' if ok else 'FAIL ') + n, json.dumps(info, ensure_ascii=False)[:400] if info != '' else '', flush=True)

async def main():
    async with async_playwright() as pw:
        br = await pw.chromium.launch(); pg = await br.new_page(viewport={'width': 1100, 'height': 700})
        errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.goto('file://' + os.path.abspath(SRC)); await pg.wait_for_timeout(400)
        # --- Partida del formato 6 (como la guardaba la 0.41)
        r = await pg.evaluate(r'''() => {
          const s = Save.sanitize(Save.fresh('guerrero')).data; s.v = 6; delete s.codex; delete s.log; delete s.story;
          s.bank = 4321; s.cleared = ['bosque', 'gruta']; s.arrived = true; s.inv.push({ uid: 'z1', id: 'lagrimaEstelar', qty: 1 });
          const env = JSON.stringify({ format: 'mystery-action', v: 6, savedAt: 1, sum: checksum(JSON.stringify(s)), data: s });
          localStorage.setItem(SAVE_KEY, env); localStorage.removeItem(SAVE_KEY + '-v6');
          const G = MysteryAction; G.continueGame();
          const s2 = G.save; Save.write(s2);
          return { v: s2.v, bank: s2.bank, cleared: s2.cleared, relics: s2.codex.relics, flags: s2.story.flags, note: G.loadNote, copy: JSON.parse(localStorage.getItem(SAVE_KEY + '-v6') || 'null'),
            stored: JSON.parse(localStorage.getItem(SAVE_KEY)).v }; }''')
        check('formato 6 → actual al cargar, sin perder monedas ni progreso', r['v'] >= 7 and r['bank'] == 4321 and r['cleared'] == ['bosque', 'gruta'] and r['stored'] == r['v'], r)
        check('reliquias e historia ya vividas se apuntan', 'lagrimaEstelar' in r['relics'] and set(r['flags']) == {'llegada', 'mercader', 'tablon'}, r)
        check('se avisa de la actualización y el original queda intacto en una copia', 'versión 6' in (r['note'] or '') and r['copy'] and r['copy']['v'] == 6 and r['copy']['data']['bank'] == 4321, {'note': r['note']})
        # --- Guardado principal dañado: copia de seguridad
        b = await pg.evaluate(r'''() => { const G = MysteryAction; G.save.bank = 999; Save.checkpoint(G.save); localStorage.setItem(SAVE_KEY, '{"format":"mystery-action","v":7,"sum":"x","data":{"bank":1}}');
          const d = Save.loadDetailed(); return { source: d.source, bank: d.save && d.save.bank, error: d.error }; }''')
        check('guardado dañado: se recupera la copia de seguridad', b['source'] == 'backup' and b['bank'] == 999, b)
        # --- Registro: texto leído, sala secreta y misión entregada (partida local)
        c = await pg.evaluate(r'''() => { const G = MysteryAction; G.save = Save.sanitize(Save.fresh('mago')).data; G.save.arrived = true; G.save.cleared = ['bosque', 'gruta'];
          let found = null;
          for (let seed = 1; seed < 300 && !found; seed++) { G.startDungeon('bosque', seed); for (let i = 0; i < G.run.seq.length - 1; i++) { G.loadStep(i); const f = G.floorRT; if (f.lore.length && f.L.rooms.some(r => r.role === 'secret')) { found = f; break; } } }
          if (!found) return { none: true };
          const f = found, l = f.lore[0], sec = f.L.rooms.find(r => r.role === 'secret');
          G.actors = G.actors.filter(a => !(a instanceof Enemy)); f.g.actors = G.actors;
          f.explore(sec, G.player, false); l.read = false; G.player.placeAt(l.x, l.y + 2); f.explore(null, G.player, false); UI.hideAsk && UI.hideAsk();
          const s = G.save; G.mode = 'village';
          const j = Jobs.board(s, s.boardSeed).find(q => !isLegacyJob(q)); j.state = 'done'; j.progress = j.goal; s.jobs = [j];
          G.deliverJob(j.id);
          return { lore: s.codex.lore, secrets: s.codex.secrets, log: s.log.jobs.map(x => x.id), job: j.id, l: l.id, sec: 'bosque:' + sec.prefab }; }''')
        check('texto leído, sala secreta y misión entregada quedan en el registro local', not c.get('none') and c['l'] in c['lore'] and c['sec'] in c['secrets'] and c['log'] == [c['job']], c)
        check('sin errores de JavaScript', not errs, errs[:3])
        await br.close()
    print(f'{sum(R)}/{len(R)} correctas'); return all(R)
if __name__ == '__main__': sys.exit(0 if asyncio.run(main()) else 1)
