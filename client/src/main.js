/**
 * Punto de entrada de la versión online. El juego es siempre online: «Jugar» lleva a la aldea con tu cuenta
 * (o a iniciar sesión / crear cuenta). La partida local sin servidor solo aparece en modo de pruebas (?local=1).
 */
import { Lobby, devLocal } from './net/lobby.js';
import './net/online.css';
import GAME from '../../version.json';

const lobby = new Lobby();
const row = document.querySelector('#title .btn-row');
if (row) {
  if (!devLocal()) document.body.classList.add('online-only');     // oculta «Continuar» y «Nueva partida» (locales)
  const play = document.createElement('button');
  play.id = 'btn-play'; play.className = 'btn-main'; play.textContent = 'Jugar';
  play.onclick = () => lobby.play();
  row.insertBefore(play, row.firstChild);
  const b = document.createElement('button');
  b.id = 'btn-online'; b.className = 'btn-ghost'; b.textContent = 'Cuenta y partidas privadas';
  b.onclick = () => lobby.open();
  row.insertBefore(b, document.getElementById('btn-options'));
  const hint = document.getElementById('title-hint');
  if (hint && !devLocal()) hint.textContent = 'Tu progreso se guarda en el servidor, con tu cuenta.';
}
// Versión visible en el título (para saber qué juego tienes abierto)
const tag = document.createElement('div');
tag.id = 'game-version'; tag.className = 'hint-line'; tag.textContent = `Versión ${GAME.version} · build ${GAME.build}`;
document.querySelector('#title .title-block')?.appendChild(tag);
// Pestaña antigua: si el servidor ya tiene otra versión (se actualizó con esta pestaña abierta), se recarga una vez
fetch(lobby.server.replace(/\/+$/, '') + '/api/health', { cache: 'no-store' }).then(r => r.json()).then(h => {
  if (!Number.isInteger(h.build) || h.build === GAME.build) return;
  let tried = null; try { tried = sessionStorage.getItem('ma-reload-build'); } catch { /* sin almacenamiento */ }
  if (tried !== String(h.build)) { try { sessionStorage.setItem('ma-reload-build', String(h.build)); } catch { /* idem */ } location.reload(); }
  else tag.textContent += ` · el servidor tiene la ${h.version}: recarga la página (Ctrl+F5)`;
}).catch(() => { /* sin servidor: el lobby ya lo avisa */ });
window.MysteryLobby = lobby;   // depuración y pruebas
if (lobby.auth) lobby.refresh();          // con sesión guardada: se conecta ya (amigos y grupo) aunque siga en el título
if (lobby.invite) lobby.showInvite();   // enlace de invitación: abre el menú con el código ya escrito
