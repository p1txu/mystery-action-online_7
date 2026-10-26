/**
 * Punto de entrada de la versión online. El juego es siempre online: «Jugar» lleva a la aldea con tu cuenta
 * (o a iniciar sesión / crear cuenta). La partida local sin servidor solo aparece en modo de pruebas (?local=1).
 */
import { Lobby, devLocal } from './net/lobby.js';
import './net/online.css';

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
window.MysteryLobby = lobby;   // depuración y pruebas
if (lobby.auth) lobby.refresh();          // con sesión guardada: se conecta ya (amigos y grupo) aunque siga en el título
if (lobby.invite) lobby.showInvite();   // enlace de invitación: abre el menú con el código ya escrito
