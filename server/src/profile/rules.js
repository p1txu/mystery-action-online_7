/**
 * Cambios del perfil personal que el jugador puede pedir entre expediciones (la aldea).
 * Son las MISMAS reglas que los métodos de Game en el prototipo (comprar, vender, equipar,
 * movimientos, evolución, misiones, compañeros, descanso, taller y tasación), pero ejecutadas
 * en el servidor sobre la copia guardada. El cliente solo pide «qué» quiere hacer; nunca envía
 * niveles, monedas ni inventario. Una prueba compara cada operación con el prototipo.
 *
 * applyOp(E, save, op, args, rnd) → { save, info } o lanza RuleError (mensaje para el jugador).
 */
export class RuleError extends Error { constructor(message) { super(message); this.name = 'RuleError'; } }
const need = (cond, msg) => { if (!cond) throw new RuleError(msg); };
/** La tienda y el taller del mercader Tobías llegan a la aldea al completar el Bosque Brumoso. */
const shopOpen = s => need(Array.isArray(s.cleared) && s.cleared.includes('bosque'), 'El puesto del mercader Tobías aún está vacío: completa el Bosque Brumoso');
const str = (v, max = 64) => typeof v === 'string' && v.length > 0 && v.length <= max;

/** Experiencia con subidas de nivel y movimientos nuevos (como Game.gainExp + levelUp). */
export function gainExp(E, save, n, inDungeon = false) {
  const prog = save.prog, levels = [], learned = [];
  if (!(n > 0) || prog.level >= E.MAX_LEVEL) return { levels, learned, gained: 0 };
  prog.exp += n;
  while (prog.level < E.MAX_LEVEL && prog.exp >= E.expNeed(prog.level)) {
    prog.exp -= E.expNeed(prog.level); prog.level++; levels.push(prog.level);
    learned.push(...E.Progress.learn(prog, E.FORMS[save.species], prog.level));
    if (inDungeon) { const ce = E.Progress.canEvolve(save); if (ce.ok && !prog.evoHint) prog.evoHint = true; }
  }
  if (prog.level >= E.MAX_LEVEL) prog.exp = 0;
  return { levels, learned, gained: n };
}

const bagOf = (E, save) => new E.Inventory(save.inv, () => E.rankOf(save.points).bag);

export const OPS = {
  equip(E, s, { uid }) {
    need(str(uid), 'Objeto no válido');
    const inv = bagOf(E, s), st = inv.find(uid); need(st, 'No llevas ese objeto');
    const it = E.ITEMS[st.id]; need(it.cat === 'equipo', 'Ese objeto no se puede equipar');
    { const ok = E.canEquip(s.species, s.prog.level, it); need(ok.ok, ok.reason); }   // clase compatible y nivel mínimo
    const prev = s.equip[it.slot];
    inv.takeUid(uid); s.equip[it.slot] = { uid: st.uid, id: st.id };
    if (prev) inv.add(prev.id);
    return { slot: it.slot };
  },
  unequip(E, s, { slot }) {
    need(Object.keys(E.EQUIP_SLOTS).includes(slot), 'Hueco de equipo no válido');
    const e = s.equip[slot]; need(e, 'No llevas nada en ese hueco');
    const inv = bagOf(E, s); need(inv.room(e.id) >= 1, 'No hay sitio en el inventario para quitarte esa pieza');
    inv.add(e.id); s.equip[slot] = null;
    return {};
  },
  setMoves(E, s, { equipped }) {
    const slots = E.Progress.slots(s.prog.level);
    need(Array.isArray(equipped) && equipped.length >= 1 && equipped.length <= slots, `Equipa entre 1 y ${slots} movimiento${slots > 1 ? 's' : ''} (huecos según tu nivel)`);
    need(new Set(equipped).size === equipped.length && equipped.every(m => s.prog.known.includes(m)), 'Solo puedes equipar movimientos que ya conoces');
    need(equipped.every(m => !(E.MOVES[m] && E.MOVES[m].ultimate)), 'El movimiento definitivo va en su propio hueco');
    s.prog.equipped = equipped.slice();
    return {};
  },
  buy(E, s, { id }) {
    shopOpen(s);
    const it = E.ITEMS[id], inv = bagOf(E, s);
    need(it && E.shopStock(s).includes(id), 'La tienda no vende eso');
    need(s.bank >= it.price, 'No tienes monedas suficientes');
    need(inv.room(id) >= 1, 'El inventario está lleno');
    s.bank -= it.price; inv.add(id); s.bought = (s.bought || 0) + 1;
    return { id, price: it.price };
  },
  sell(E, s, { uid }) {
    shopOpen(s); need(str(uid), 'Objeto no válido');
    const inv = bagOf(E, s), id = inv.takeUid(uid); need(id, 'No llevas ese objeto');
    const price = E.sellPrice(id); s.bank += price; s.sold = (s.sold || 0) + 1;
    return { id, price };
  },
  discard(E, s, { uid }) {
    const inv = bagOf(E, s), st = str(uid) && inv.find(uid); need(st, 'No llevas ese objeto');
    inv.takeUid(uid, st.qty); return { id: st.id };
  },
  craft(E, s, { i }) {
    shopOpen(s);
    const r = Number.isInteger(i) && E.RECIPES[i]; need(r, 'Receta desconocida');
    const inv = bagOf(E, s);
    need(s.bank >= r.gems, 'No tienes monedas suficientes'); need(inv.room(r.out) >= 1, 'El inventario está lleno');
    need(Object.entries(r.need).every(([id, q]) => inv.count(id) >= q), 'Te faltan materiales');
    Object.entries(r.need).forEach(([id, q]) => inv.take(id, q)); s.bank -= r.gems; inv.add(r.out);
    return { out: r.out };
  },
  appraise(E, s, { uid }, rnd) {
    const inv = bagOf(E, s), st = str(uid) && inv.find(uid);
    need(s.bank >= E.ECONOMY.appraise, 'No tienes monedas suficientes'); need(st && st.id === 'cofre', 'Eso no es un cofre misterioso');
    s.bank -= E.ECONOMY.appraise; inv.takeUid(uid);
    const lvl = E.DUNGEONS.filter(d => E.dungeonOpen(s, d)).reduce((m, d) => Math.max(m, d.level), 1);
    const res = E.Loot.roll('tasacion', { level: lvl, biome: 'any' }, rnd), got = [];
    s.bank += res.gems;
    for (const x of res.items) { if (inv.add(x.id, x.qty)) got.push(x.id); else s.bank += Math.round(E.ITEMS[x.id].price * .4); }
    return { gems: res.gems, items: got };
  },
  evolve(E, s) {
    const ce = E.Progress.canEvolve(s); need(ce.ok, ce.final ? ce.reason : 'Aún no cumples los requisitos para evolucionar');
    const from = s.species;
    s.prog.evolutions.push({ from, to: ce.to.id, level: s.prog.level });
    s.species = ce.to.id; s.prog.evoHint = false;
    if (ce.useItem) new E.Inventory(s.inv, () => 99).take(ce.useItem);
    const learned = E.Progress.learn(s.prog, ce.to, s.prog.level);
    return { from, to: ce.to.id, learned, usedItem: ce.useItem || null };
  },
  /** Ha visto su llegada a la aldea (escena de la carretilla y el alcalde): no se vuelve a mostrar. */
  arrive(E, s) { s.arrived = true; return { arrived: true }; },
  rest(E, s) {
    let revived = 0;
    for (const m of s.team) { if (m.fainted) revived++; m.fainted = false; m.hp = null; }
    s.rests = (s.rests || 0) + 1;
    return { revived };
  },
  setActive(E, s, { uid, on }) {
    const m = str(uid) && s.team.find(x => x.uid === uid); need(m, 'Ese compañero no está en tu equipo');
    if (on) need(s.team.filter(x => x.active).length < E.RECRUIT.partyMax, `Solo pueden acompañarte ${E.RECRUIT.partyMax} compañeros a la vez`);
    m.active = !!on; return {};
  },
  release(E, s, { uid }) {
    const m = str(uid) && s.team.find(x => x.uid === uid); need(m, 'Ese compañero no está en tu equipo');
    s.team = s.team.filter(x => x !== m); return { name: m.name };
  },
  acceptJob(E, s, { id }) {
    need(s.cleared.includes(E.COURIER_INTRO.dungeon), 'El tablón de misiones aún está vacío: completa la Gruta de Cuarzo');
    const j = s.board.find(x => x.id === id); need(j, 'Esa misión ya no está en el tablón');
    need(s.jobs.length < E.rankOf(s.points).jobs, 'No puedes aceptar más misiones con tu rango');
    s.board = s.board.filter(x => x !== j); j.state = 'accepted'; s.jobs.push(j);
    return {};
  },
  cancelJob(E, s, { id }) {
    const j = s.jobs.find(x => x.id === id); need(j, 'No tienes esa misión');
    s.jobs = s.jobs.filter(x => x !== j); j.state = 'board'; s.board.push(j);
    return {};
  },
  deliverJob(E, s, { id }) {
    const j = s.jobs.find(x => x.id === id);
    need(j && !E.isLegacyJob(j) && j.state === 'done', 'Esa misión no está lista para entregar');
    s.jobs = s.jobs.filter(x => x !== j);
    s.bank += j.reward.gems; s.points += j.reward.points; s.delivered = (s.delivered || 0) + 1;
    const got = bagOf(E, s).add(j.reward.item) > 0; if (!got) s.bank += E.sellPrice(j.reward.item);
    const xp = gainExp(E, s, j.reward.exp || 30);
    return { reward: j.reward, itemSold: !got, levels: xp.levels, learned: xp.learned };
  },
};

/** Aplica una operación sobre una copia ya validada; devuelve la partida saneada de nuevo. */
export function applyOp(E, save, op, args = {}, rnd = Math.random) {
  const fn = Object.prototype.hasOwnProperty.call(OPS, op) && OPS[op];
  if (!fn) throw new RuleError('Operación desconocida');
  if (!args || typeof args !== 'object' || Array.isArray(args)) throw new RuleError('Datos no válidos');
  const info = fn(E, save, args, rnd) || {};
  if ((!save.board || !save.board.length) && !save.jobs.length) { save.boardSeed = (save.boardSeed + 7919) % 1e7; save.board = E.Jobs.board(save, save.boardSeed); }   // como Game.goBase
  const clean = E.Save.sanitize(save);
  if (!clean.ok) throw new RuleError('El resultado no es una partida válida');
  return { save: clean.data, info };
}
