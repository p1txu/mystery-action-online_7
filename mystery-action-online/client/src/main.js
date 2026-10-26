/** Punto de entrada de la versión online: añade «Cooperativo online» a la pantalla de título. */
import { Lobby } from './net/lobby.js';
import './net/online.css';

const lobby = new Lobby();
const row = document.querySelector('#title .btn-row');
if (row) {
  const b = document.createElement('button');
  b.id = 'btn-online'; b.className = 'btn-ghost'; b.textContent = 'Cooperativo online';
  b.onclick = () => lobby.open();
  row.insertBefore(b, document.getElementById('btn-options'));
}
window.MysteryLobby = lobby;   // depuración
if (lobby.invite) lobby.showInvite();   // enlace de invitación: abre el menú con el código ya escrito
