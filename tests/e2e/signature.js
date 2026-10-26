// Firma de las reglas y de varios pisos. Se evalúa igual en el navegador (prototipo completo)
// y en Node (núcleo generado): si coinciden, cliente y servidor juegan con las mismas reglas.
(E) => {
  const h = s => { let x = 2166136261; for (let i = 0; i < s.length; i++) { x ^= s.charCodeAt(i); x = Math.imul(x, 16777619); } return (x >>> 0).toString(16); };
  const pick = (o, ks) => Object.fromEntries(ks.filter(k => o[k] !== undefined).map(k => [k, o[k]]));
  const rules = {
    config: E.CONFIG,
    moves: Object.fromEntries(Object.entries(E.MOVES).map(([k, m]) => [k, pick(m, ['power', 'cd', 'cost', 'range', 'type', 'cat', 'targeted'])])),
    enemies: Object.fromEntries(Object.entries(E.ENEMIES).map(([k, m]) => [k, pick(m, ['base', 'speed', 'aggro', 'radius', 'height', 'hbW', 'hbH', 'kbRes', 'stunMul', 'mass', 'exp', 'type'])])),
    variants: Object.fromEntries(Object.entries(E.ENEMY_VARIANTS).map(([k, m]) => [k, pick(m, ['base', 'stats', 'speed', 'aggro', 'type', 'exp'])])),
    bosses: Object.fromEntries(Object.entries(E.BOSSES).map(([k, m]) => [k, pick(m, ['base', 'stats', 'speed', 'type', 'exp'])])),
    species: E.SPECIES.concat(E.EVOLVED).map(s => pick(s, ['id', 'base', 'typeId', 'basic', 'learn'])),
    items: Object.fromEntries(Object.entries(E.ITEMS).map(([k, m]) => [k, pick(m, ['cat', 'rarity', 'price', 'slot', 'mods'])])),
    loot: E.LOOT, dungeons: E.DUNGEONS, types: E.TYPE_CHART, solid: Array.from(E.SOLID),
  };
  const floors = [];
  for (const d of E.DUNGEONS) for (const [seed, no, kind] of [[1, 1, 'normal'], [77, 3, 'normal'], [20261023, 2, 'normal'], [5, no0(d), 'waypoint'], [9, d.floors + 1, 'boss']]) {
    const g = E.FloorGen.generate(seed, d, no, kind, []);
    floors.push(h(Array.from(g.world.tiles).join('') + JSON.stringify(g.layout)));
  }
  function no0(d) { return (d.waypoint || 1) + 200; }
  const dmg = (() => { const p = new E.Player(E.FORMS.arquero, 0, 0, E.Progress.fresh('arquero', 14)); const e = new E.Enemy(E.makeKind('geodon'), 0, 0, { level: 9 }); return [p.maxHp, JSON.stringify(p.stats), e.maxHp, JSON.stringify(e.stats), E.expYield(e, 14)]; })();
  return { rules: h(JSON.stringify(rules)), floors, dmg };
}
