/**
 * Panel social (tecla O): Amigos · Grupo · Chat. Y el chat rápido del grupo (tecla T) sobre el juego.
 * Todo lo que enseña viene del servidor (hub y API /api/friends); el panel solo pide cosas.
 */
import { presenceText, CHAT_MAX, cleanChat } from '../../../shared/social.js';

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const G = () => window.MysteryAction;
const clsName = id => (typeof FORMS !== 'undefined' && FORMS[id] ? FORMS[id].name : '');
const typing = () => { const a = document.activeElement; return a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA' || a.tagName === 'SELECT' || a.isContentEditable); };

export class SocialPanel {
  constructor(lobby) {
    this.lobby = lobby; this.tab = 'friends'; this.msg = null;
    // Botón fijo con avisos
    this.btn = document.createElement('button');
    this.btn.id = 'social-btn'; this.btn.className = 'social-btn'; this.btn.hidden = true;
    this.btn.title = 'Amigos, grupo y chat (O)';
    this.btn.onclick = () => this.toggle();
    document.body.appendChild(this.btn);
    // Panel
    this.el = document.createElement('section');
    this.el.id = 'social'; this.el.className = 'social panel'; this.el.hidden = true;
    this.el.setAttribute('aria-label', 'Amigos, grupo y chat');
    document.body.appendChild(this.el);
    // Chat sobre el juego (últimos mensajes) + línea para escribir (T)
    this.feed = document.createElement('div');
    this.feed.id = 'chat-feed'; this.feed.className = 'chat-feed'; this.feed.hidden = true; this.feed.setAttribute('aria-live', 'polite');
    document.body.appendChild(this.feed);
    this.line = document.createElement('form');
    this.line.id = 'chat-line'; this.line.className = 'chat-line'; this.line.hidden = true;
    this.line.innerHTML = `<input id="chat-input" maxlength="${CHAT_MAX}" autocomplete="off" placeholder="Mensaje al grupo (Intro para enviar, Esc para cerrar)">`;
    document.body.appendChild(this.line);
    this.line.onsubmit = e => { e.preventDefault(); const i = this.line.querySelector('input'); this.send(i.value); i.value = ''; this.closeLine(); };
    // Las teclas que se escriben en el panel o en el chat no llegan al juego
    for (const el of [this.el, this.line]) for (const t of ['keydown', 'keyup']) el.addEventListener(t, e => {
      if (t === 'keydown' && e.key === 'Escape') { if (el === this.line) this.closeLine(); else this.close(); e.preventDefault(); }
      e.stopPropagation();
    });
    // Con el panel o el chat abiertos, Esc los cierra (y no pausa el juego), esté donde esté el foco
    addEventListener('keydown', e => {
      if (e.key !== 'Escape') return;
      if (!this.line.hidden) { this.closeLine(); e.preventDefault(); e.stopPropagation(); }
      else if (!this.el.hidden) { this.close(); e.preventDefault(); e.stopPropagation(); }
    }, { capture: true });
    addEventListener('keydown', e => {
      if (!this.hub || typing() || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.code === 'KeyO') { e.preventDefault(); this.toggle(); }
      else if (e.code === 'KeyT' && this.hub.inParty && this.inGame()) { e.preventDefault(); this.openLine(); }
    });
    setInterval(() => this.renderFeed(), 500);
  }
  get hub() { return this.lobby.hub; }
  inGame() { const g = G(); return g && (g.state === 'play' || g.state === 'pause'); }

  /* ---------- Abrir y cerrar ---------- */
  toggle() { if (this.el.hidden) this.open(); else this.close(); }
  open(tab) { if (!this.hub) return; if (tab) this.tab = tab; this.el.hidden = false; if (this.tab === 'chat') this.hub.unread = 0; this.render(); this.refreshFriends(); }
  close() { this.el.hidden = true; const v = document.getElementById('view'); if (v && this.inGame()) v.focus({ preventScroll: true }); this.update(); }
  openLine() { this.line.hidden = false; const i = this.line.querySelector('input'); i.focus(); this.hub.unread = 0; this.renderFeed(true); }
  closeLine() { this.line.hidden = true; const v = document.getElementById('view'); if (v) v.focus({ preventScroll: true }); }
  say(text, kind = 'bad') { this.msg = text ? { text, kind } : null; this.render(); }
  /** Confirmación dentro del panel (sin cuadros del navegador, que bloquean el juego). */
  confirm(text, fn) { this.pending = { text, fn }; this.render(); }
  send(text) {
    const r = cleanChat(text); if (!r.ok) return;
    if (!this.hub.inParty) return this.say('El chat es del grupo: invita a un amigo para hablar.', 'warn');
    this.hub.say(text);          // el filtro lo aplica el servidor (aplicarlo dos veces estropearía los asteriscos)
  }

  /** Lo llama el lobby al cambiar algo (hub o sesión). */
  update() {
    const h = this.hub, show = !!(h && this.lobby.account && h.status !== 'idle');
    this.btn.hidden = !show;
    // Siempre online: si se corta la conexión con el servidor en plena partida, se avisa (y se reintenta solo)
    const s = this.lobby.session, expBanner = s && ['reconnecting', 'lost'].includes(s.status);
    if (!expBanner) this.lobby.banner(show && this.inGame() && ['lost', 'reconnecting'].includes(h.status) ? 'Sin conexión con el servidor · reconectando…' : '');
    if (!show) { this.el.hidden = true; this.feed.hidden = true; this.line.hidden = true; return; }
    const alerts = h.incoming.length + h.invites.length, unread = this.el.hidden || this.tab !== 'chat' ? h.unread : 0;
    if (!this.el.hidden && this.tab === 'chat') h.unread = 0;
    const online = h.friends.filter(f => f.online).length, st = h.status;
    this.btn.innerHTML = `<span class="sb-dot ${st === 'online' ? 'ok' : st === 'replaced' || st === 'session' ? 'off' : 'wait'}" aria-hidden="true"></span>Amigos <small>${online}/${h.friends.length}</small>${h.inParty ? ` · Grupo <small>${h.party.members.length}</small>` : ''}${alerts ? `<b class="sb-badge" aria-label="${alerts} avisos">${alerts}</b>` : ''}${unread ? `<b class="sb-badge chat" aria-label="${unread} mensajes sin leer">${unread}</b>` : ''} <span class="kbd">O</span>`;
    // Solo se redibuja si cambia algo de lo que enseña (el hub avisa 10 veces/s en la aldea: redibujar siempre
    // borraría los botones mientras se pulsan y el texto seleccionado)
    const sig = JSON.stringify([h.status, h.me, h.friends, h.incoming, h.outgoing, h.blocked, h.party, h.invites.map(i => i.party), h.chat.length, [...h.muted], this.tab]);
    if (!this.el.hidden && sig !== this.sig) this.render();
    this.renderFeed();
  }

  /* ---------- Amigos (API) ---------- */
  async refreshFriends() { try { const r = await this.lobby.api.friends(); this.hub.lists(r); if (r.code && this.hub.me) this.hub.me.code = r.code; this.render(); } catch { /* el hub ya tiene la lista */ } }
  async act(promise, ok) {
    try { const r = await promise; this.hub.lists(r); this.say(typeof ok === 'function' ? ok(r) : ok, 'good'); return r; }
    catch (e) { this.say(e.message, 'bad'); return null; }
  }

  /* ---------- Vista ---------- */
  render() {
    const h = this.hub; if (!h || this.el.hidden) return;
    this.sig = JSON.stringify([h.status, h.me, h.friends, h.incoming, h.outgoing, h.blocked, h.party, h.invites.map(i => i.party), h.chat.length, [...h.muted], this.tab]);
    const keep = {}; this.el.querySelectorAll('input[id]').forEach(i => { keep[i.id] = i.value; });
    const focus = document.activeElement && this.el.contains(document.activeElement) ? document.activeElement.id : null;
    const tabs = [['friends', `Amigos${h.incoming.length ? ` (${h.incoming.length})` : ''}`], ['party', `Grupo${h.invites.length ? ` (${h.invites.length})` : ''}`], ['chat', 'Chat']]
      .map(([k, t]) => `<button class="on-tab${k === this.tab ? ' on' : ''}" data-stab="${k}" aria-pressed="${k === this.tab}">${t}</button>`).join('');
    const st = h.status === 'online' ? '' : `<p class="on-msg ${h.status === 'replaced' ? 'warn' : 'bad'}"><span>${h.status === 'replaced' ? 'Te has conectado desde otra pestaña o dispositivo: aquí se ha cerrado la parte social. Recarga la página para recuperarla.' : h.status === 'session' ? 'Tu sesión ha caducado: vuelve a entrar.' : 'Sin conexión con el servidor · reconectando…'}</span></p>`;
    const msg = (this.pending ? `<div class="on-msg warn" role="alertdialog"><span>${esc(this.pending.text)}</span><span><button class="btn-main" id="s-yes">Sí</button> <button class="btn-ghost" id="s-no">No</button></span></div>` : '')
      + (this.msg ? `<p class="on-msg ${this.msg.kind}" role="alert"><span>${esc(this.msg.text)}</span></p>` : '');
    const body = this.tab === 'friends' ? this.renderFriends() : this.tab === 'party' ? this.renderParty() : this.renderChat();
    this.el.innerHTML = `<div class="social-head"><h2>Social</h2><button class="btn-link" id="s-close" aria-label="Cerrar">cerrar (Esc)</button></div><div class="on-tabs">${tabs}</div>${st}${msg}<div class="social-body">${body}</div>`;
    for (const [id, v] of Object.entries(keep)) { const i = this.el.querySelector('#' + id); if (i && v) i.value = v; }
    if (focus) { const f = this.el.querySelector('#' + focus); if (f) f.focus(); }
    if (this.tab === 'chat') { const log = this.el.querySelector('.s-log'); if (log) log.scrollTop = log.scrollHeight; }
    this.bind();
  }
  friendRow(f) {
    const h = this.hub, inMine = h.party && h.party.members.some(m => m.id === f.id);
    const canInvite = f.online && !inMine && (!h.party || h.party.members.length < 4);
    return `<li data-friend="${esc(f.name)}" class="${f.online ? 'ok' : 'off'}"><canvas class="on-face" width="44" height="44" data-species="${esc(f.species || '')}" aria-hidden="true"></canvas>
      <div><b>${esc(f.name)}</b><small>${f.species ? esc(clsName(f.species)) + (f.level ? ' · Nv ' + f.level : '') + ' · ' : ''}${esc(presenceText(f))}${inMine ? ' · en tu grupo' : ''}</small></div>
      <span class="s-acts">${canInvite ? `<button class="btn-main s-inv" data-id="${esc(f.id)}">Invitar al grupo</button>` : ''}
      <button class="btn-link s-rm" data-id="${esc(f.id)}" data-name="${esc(f.name)}">borrar</button><button class="btn-link s-block" data-id="${esc(f.id)}" data-name="${esc(f.name)}">bloquear</button></span></li>`;
  }
  renderFriends() {
    const h = this.hub, me = h.me || {};
    const inc = h.incoming.length ? `<div class="box"><h3>Solicitudes recibidas</h3><ul class="on-players">${h.incoming.map(r => `<li data-req="${esc(r.name)}"><div><b>${esc(r.name)}</b><small>quiere ser tu amigo</small></div><span class="s-acts"><button class="btn-main s-acc" data-id="${esc(r.id)}">Aceptar</button><button class="btn-ghost s-dec" data-id="${esc(r.id)}">Rechazar</button><button class="btn-link s-block" data-id="${esc(r.id)}" data-name="${esc(r.name)}">bloquear</button></span></li>`).join('')}</ul></div>` : '';
    const out = h.outgoing.length ? `<details class="on-profile"><summary>Solicitudes enviadas (${h.outgoing.length})</summary><ul class="on-players">${h.outgoing.map(r => `<li><div><b>${esc(r.name)}</b><small>esperando respuesta</small></div><span class="s-acts"><button class="btn-link s-rm" data-id="${esc(r.id)}" data-name="${esc(r.name)}">cancelar</button></span></li>`).join('')}</ul></details>` : '';
    const blk = h.blocked.length ? `<details class="on-profile"><summary>Bloqueados (${h.blocked.length})</summary><ul class="on-players">${h.blocked.map(r => `<li><div><b>${esc(r.name)}</b></div><span class="s-acts"><button class="btn-link s-unblock" data-id="${esc(r.id)}">desbloquear</button></span></li>`).join('')}</ul></details>` : '';
    const list = h.friends.length ? `<ul class="on-players" id="s-friends">${h.friends.map(f => this.friendRow(f)).join('')}</ul>` : '<p class="hint-line">Aún no tienes amigos. Pásales tu código y pídeles el suyo.</p>';
    return `<div class="s-code"><span>Tu código de amigo</span><b id="s-mycode">${esc(me.name || '')}#${esc(me.code || '······')}</b><button class="btn-link" id="s-copy">copiar</button></div>
      <form class="on-opt" id="s-add"><label>Añadir amigo (su código) <input id="s-addcode" maxlength="40" autocomplete="off" spellcheck="false" placeholder="Nombre#K7P2QX"></label><button class="btn-main" id="s-addbtn">Enviar solicitud</button></form>
      ${inc}<h3>Amigos (${h.friends.filter(f => f.online).length} conectados de ${h.friends.length})</h3>${list}${out}${blk}`;
  }
  renderParty() {
    const h = this.hub, p = h.party;
    const inv = h.invites.map(i => `<div class="box s-invite" data-invite="${esc(i.from.name)}"><p><b>${esc(i.from.name)}</b> te invita a su grupo.</p><div class="on-row"><button class="btn-main s-join" data-party="${esc(i.party)}">Unirme</button><button class="btn-ghost s-nojoin" data-party="${esc(i.party)}">Rechazar</button></div></div>`).join('');
    if (!p) return `${inv}<p class="hint-line">No estás en ningún grupo. En la pestaña <b>Amigos</b>, pulsa <b>«Invitar al grupo»</b> junto a un amigo conectado. En grupo os veis en la aldea, habláis por el chat y el líder elige la mazmorra para todos.</p>`;
    const leader = h.isLeader, me = h.me && h.me.id;
    const rows = p.members.map(m => `<li class="${m.online ? 'ok' : 'off'}" data-member="${esc(m.name)}"><canvas class="on-face" width="44" height="44" data-species="${esc(m.species || '')}" aria-hidden="true"></canvas>
      <div><b>${esc(m.name)}</b>${m.id === me ? ' <em>(tú)</em>' : ''}<small>${esc(clsName(m.species))} · Nv ${m.level || 1} · ${esc(presenceText(m))}</small></div>
      <span>${m.id === p.leader ? '<b class="s-lead">líder</b>' : ''}${leader && m.id !== me ? ` <button class="btn-link s-give" data-id="${esc(m.id)}"${m.online ? '' : ' disabled'}>hacer líder</button><button class="btn-link s-kick" data-id="${esc(m.id)}">sacar</button>` : ''}
      ${m.id !== me ? `<button class="btn-link s-mute" data-id="${esc(m.id)}">${h.muted.has(m.id) ? 'quitar silencio' : 'silenciar'}</button>` : ''}</span></li>`).join('');
    const opened = (G() && G().save ? DUNGEONS.filter(d => dungeonOpen(G().save, d)) : DUNGEONS);
    const go = leader ? `<form class="on-opt" id="s-go"><label>Mazmorra para todo el grupo <select id="s-dng">${opened.map(d => `<option value="${d.id}">${esc(d.name)}</option>`).join('')}</select></label><button class="btn-main" id="s-gobtn"${p.members.length > 1 ? '' : ' disabled'}>Ir con el grupo</button></form>
        <p class="hint-line">Entráis todos juntos en la misma expedición (también podéis usar la puerta de la mazmorra en la aldea). Tienen que estar todos conectados y haber desbloqueado esa mazmorra.</p>`
      : `<p class="hint-line">El líder elige la mazmorra; cuando lo haga, entraréis todos juntos.</p>`;
    return `${inv}<h3>Tu grupo (${p.members.length} de 4)</h3><ul class="on-players" id="s-party">${rows}</ul>${go}<div class="on-row"><button class="btn-ghost" id="s-leave">Salir del grupo</button></div>`;
  }
  renderChat() {
    const h = this.hub;
    if (!h.party) return '<p class="hint-line">El chat es del grupo. Cuando estés en uno, aquí verás lo que escribís (y sobre vuestras cabezas en la aldea). Tecla <span class="kbd">T</span> para escribir sin abrir este panel.</p>';
    const log = h.chat.filter(m => !m.from || !h.muted.has(m.from)).map(m => m.sys ? `<p class="s-sys">${esc(m.text)}</p>` : `<p><b>${esc(m.name)}:</b> ${esc(m.text)}</p>`).join('');
    return `<div class="s-log" id="s-log" role="log">${log || '<p class="hint-line">Aún no hay mensajes.</p>'}</div>
      <form class="on-opt" id="s-chat"><label class="sr">Mensaje <input id="s-chatin" maxlength="${CHAT_MAX}" autocomplete="off" placeholder="Escribe al grupo…"></label><button class="btn-main" id="s-send">Enviar</button></form>
      <p class="hint-line">Máximo ${CHAT_MAX} caracteres y 5 mensajes cada 10 s. Los insultos se tapan. Puedes silenciar a alguien en la pestaña Grupo, o bloquearle en Amigos.</p>`;
  }
  bind() {
    const h = this.hub, on = (sel, fn) => this.el.querySelectorAll(sel).forEach(b => { b.onclick = e => { e.preventDefault(); fn(b); }; });
    on('#s-close', () => this.close());
    on('[data-stab]', b => { this.tab = b.dataset.stab; this.msg = null; if (this.tab === 'chat') h.unread = 0; this.render(); this.update(); });
    on('#s-copy', () => { const t = this.el.querySelector('#s-mycode').textContent; (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject()).then(() => this.say('Código copiado: ' + t, 'good')).catch(() => this.say('Tu código: ' + t, 'good')); });
    const add = this.el.querySelector('#s-add');
    if (add) add.onsubmit = e => { e.preventDefault(); const v = this.el.querySelector('#s-addcode').value; this.act(this.lobby.api.friendRequest(v), r => r.status === 'accepted' ? `¡${r.friend.name} y tú ya sois amigos!` : `Solicitud enviada a ${r.friend.name}.`).then(r => { if (r) this.el.querySelector('#s-addcode').value = ''; }); };
    on('.s-acc', b => this.act(this.lobby.api.friendRespond(b.dataset.id, true), r => `¡${r.friend ? r.friend.name : 'Tu amigo'} y tú ya sois amigos!`));
    on('.s-dec', b => this.act(this.lobby.api.friendRespond(b.dataset.id, false), 'Solicitud rechazada.'));
    on('.s-rm', b => this.confirm(`¿Quitar a ${b.dataset.name} de tu lista?`, () => this.act(this.lobby.api.friendRemove(b.dataset.id), `${b.dataset.name} ya no está en tu lista.`)));
    on('.s-block', b => this.confirm(`¿Bloquear a ${b.dataset.name}? Dejaréis de ser amigos y no podrá enviarte solicitudes, invitarte ni hablarte.`, () => this.act(this.lobby.api.friendBlock(b.dataset.id), `Has bloqueado a ${b.dataset.name}.`)));
    on('#s-yes', () => { const f = this.pending && this.pending.fn; this.pending = null; this.render(); if (f) f(); });
    on('#s-no', () => { this.pending = null; this.render(); });
    on('.s-unblock', b => this.act(this.lobby.api.friendUnblock(b.dataset.id), 'Desbloqueado.'));
    on('.s-inv', b => { h.invite(b.dataset.id); });
    on('.s-join', b => h.accept(b.dataset.party));
    on('.s-nojoin', b => h.decline(b.dataset.party));
    on('.s-give', b => h.lead(b.dataset.id));
    on('.s-kick', b => h.kick(b.dataset.id));
    on('.s-mute', b => h.mute(b.dataset.id, !h.muted.has(b.dataset.id)));
    on('#s-leave', () => h.leaveParty());
    const go = this.el.querySelector('#s-go');
    if (go) go.onsubmit = e => { e.preventDefault(); this.lobby.partyGo(this.el.querySelector('#s-dng').value); };
    const chat = this.el.querySelector('#s-chat');
    if (chat) chat.onsubmit = e => { e.preventDefault(); const i = this.el.querySelector('#s-chatin'); this.send(i.value); i.value = ''; i.focus(); };
    this.el.querySelectorAll('canvas.on-face').forEach((cv, i) => { const sp = FORMS[cv.dataset.species]; if (!sp) return; cv.id = 's-face-' + i; try { UI.drawPortrait(sp, 0, cv.id, 1.1); } catch { /* decorativo */ } });
  }
  /** Últimos mensajes del grupo sobre el juego (se desvanecen a los 12 s; con T abierto se ven todos los recientes). */
  renderFeed(force) {
    const h = this.hub;
    if (!h || !h.party || !this.inGame()) { this.feed.hidden = true; return; }
    const now = Date.now(), open = !this.line.hidden || force;
    const recent = h.chat.filter(m => (!m.from || !h.muted.has(m.from)) && (open || now - m.at < 12000)).slice(-(open ? 8 : 4));
    this.feed.hidden = !recent.length;
    const html = recent.map(m => m.sys ? `<p class="s-sys">${esc(m.text)}</p>` : `<p><b>${esc(m.name)}:</b> ${esc(m.text)}</p>`).join('');
    if (this.feed.innerHTML !== html) this.feed.innerHTML = html;
  }
}
