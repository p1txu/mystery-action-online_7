/**
 * Cuenta online activa (Game.account). Mientras está activa:
 *  - El perfil personal es el del servidor: se juega con él en la aldea y en las expediciones.
 *  - Cada cambio de la aldea (comprar, equipar, misiones…) se PIDE al servidor, que lo valida y
 *    devuelve el perfil resultante; el navegador solo lo muestra. Nada se guarda en localStorage
 *    (Save.readOnly) y la partida local de este navegador queda intacta para jugar sin conexión.
 *  - «Jugar en solitario» con la cuenta = una expedición de una plaza en el servidor: el progreso
 *    en solitario y en grupo es el mismo y nunca se pierde.
 */
export class OnlineAccount {
  constructor({ api, lobby }) { this.api = api; this.lobby = lobby; this.version = 0; this.busy = false; }
  get g() { return window.MysteryAction; }

  /** Entra en la aldea con el perfil del servidor. */
  async enter(rec) {
    const g = this.g;
    rec = rec || await this.api.profile();
    if (!rec) throw new Error('Aún no tienes perfil en el servidor');
    if (!g.account) { this.localSave = g.save; Save.readOnly = true; g.account = this; }
    this.adopt(rec.profile, rec.version);
    g.goBase();
    UI.toast(`Jugando con tu cuenta: ${this.lobby.account ? this.lobby.account.name : ''}. El progreso se guarda en el servidor.`, '#a6e3ff');
  }
  /** Sale del modo cuenta: vuelve la partida local de este navegador. */
  exit() {
    const g = this.g; if (g.account !== this) return;
    g.account = null; Save.readOnly = false;
    g.save = Save.load();
  }
  /** Adopta el perfil que manda el servidor (sustituye por completo a lo que hubiera en pantalla). */
  adopt(profile, version) {
    const g = this.g, clean = Save.sanitize(profile); if (!clean.ok) return;
    const s = clean.data; g.save = s; if (Number.isInteger(version)) this.version = version;
    const p = g.player;
    if (p && g.mode === 'village') {
      p.sp = FORMS[s.species]; p.prog = s.prog; p.level = s.prog.level; p.equip = s.equip;
      p.bag = new Inventory(s.inv, () => g.bagCap()); p.moves = s.prog.equipped.slice(0, 4); p.recalc(false); p.hp = p.maxHp;
    }
    try { if (!UI.screens.base.hidden) UI.renderBase(g); if (g.state === 'play') UI.updateHud(g); } catch { /* pantalla no disponible */ }
  }
  /** Operación de la aldea validada por el servidor. */
  async op(op, args) {
    if (this.busy) return false;
    this.busy = true;
    try {
      const r = await this.api.op(op, args, this.version);
      this.adopt(r.profile, r.version);
      const msg = describe(op, r.info);
      if (msg) UI.toast(msg, '#7dffa0');
      return r.info || true;
    } catch (e) {
      if (e.data && e.data.profile) this.adopt(e.data.profile, e.data.version);   // el servidor manda: se vuelve a su copia
      UI.toast(e.message, '#ff9a4a');
      return false;
    } finally { this.busy = false; }
  }
  /** Evolución: la aplica el servidor y después se muestra la animación con las dos formas. */
  async evolve() {
    const g = this.g, from = FORMS[g.save.species], level = g.save.prog.level;
    const before = calcStats(from.base, level);
    let r;
    try { r = await this.api.op('evolve', {}, this.version); } catch (e) { if (e.data && e.data.profile) this.adopt(e.data.profile, e.data.version); UI.toast(e.message, '#ff9a4a'); return false; }
    g.state = 'evo';
    g.evo = { from, to: FORMS[r.profile.species], useItem: r.info.usedItem, t: 0, done: false, level, before, server: r };
    UI.showEvo(g.evo); Sfx.play('evolve');
    return true;
  }
  /** Expedición en solitario con la cuenta: una sala de una plaza en el servidor. */
  async startSolo(dungeonId) { return this.lobby.startSolo(dungeonId); }
}

function describe(op, info = {}) {
  const I = id => (ITEMS[id] || {}).name || id;
  switch (op) {
    case 'buy': return `Has comprado ${I(info.id)} (${info.price} monedas)`;
    case 'sell': return `Has vendido ${I(info.id)} por ${info.price} monedas`;
    case 'craft': return `Has fabricado: ${I(info.out)}`;
    case 'appraise': return `El cofre contenía ${info.gems} monedas${info.items && info.items.length ? ' y ' + info.items.map(I).join(', ') : ''}`;
    case 'deliverJob': return `¡Misión entregada! +${info.reward.gems} monedas, +${info.reward.exp} EXP${info.levels && info.levels.length ? ` · ¡Nivel ${info.levels.at(-1)}!` : ''}`;
    case 'rest': return info.revived ? `Habéis descansado. ${info.revived} compañero(s) recuperado(s).` : 'Habéis descansado.';
    case 'release': return `${info.name} vuelve a la naturaleza. ¡Hasta pronto!`;
    default: return '';
  }
}
