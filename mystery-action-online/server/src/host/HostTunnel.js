/**
 * «Jugar con amigos» desde el propio juego: el ordenador del anfitrión abre (y cierra) un túnel rápido
 * de Cloudflare hacia ESTE servidor cuando se pide desde el juego (solo desde este mismo ordenador).
 *
 * Estados: off → starting (buscando o descargando cloudflared, abriendo el túnel) → checking (comprobando
 * que el enlace responde desde Internet) → on. Si algo falla: error (con explicación). Al cerrar: off.
 * Mientras está abierto, la dirección pública se añade a los orígenes permitidos del servidor (onUrl / onClose).
 * No es P2P: el túnel solo reenvía a este servidor, que sigue validándolo todo.
 */
import { spawn } from 'node:child_process';
import { findCloudflared } from './cloudflared.js';

export class HostTunnel {
  /**
   * @param {object} o
   * @param {number} o.port     puerto local del servidor (que también sirve el juego)
   * @param {string} o.binDir   dónde guardar cloudflared si hay que descargarlo
   * @param {(url:string)=>void} o.onUrl    enlace público listo (se permite su origen)
   * @param {(url:string)=>void} o.onClose  enlace cerrado (se retira su origen)
   */
  constructor({ port, binDir, log, onUrl = () => {}, onClose = () => {}, checkTimeout = 90000 }) {
    Object.assign(this, { port, binDir, log, onUrl, onClose, checkTimeout });
    this.state = 'off'; this.url = ''; this.error = ''; this.detail = ''; this.reachable = null; this.proc = null; this.gen = 0;
    const kill = () => { try { this.proc && this.proc.kill(); } catch { /* ya cerrado */ } };
    process.once('exit', kill);
  }
  status() { return { state: this.state, url: this.url, error: this.error, detail: this.detail, reachable: this.reachable }; }
  /** Abre el túnel (si ya está abierto o abriéndose, no hace nada). Devuelve el estado sin esperar. */
  open() {
    if (['starting', 'checking', 'on'].includes(this.state)) return this.status();
    const gen = ++this.gen;
    this.state = 'starting'; this.error = ''; this.url = ''; this.reachable = null; this.detail = 'Preparando el enlace…';
    this.run(gen).catch(e => { if (gen === this.gen) this.fail(e.message); });
    return this.status();
  }
  async run(gen) {
    const bin = await findCloudflared(this.binDir, what => { if (gen === this.gen && what === 'downloading') this.detail = 'Descargando cloudflared (solo la primera vez)…'; });
    if (gen !== this.gen) return;
    this.detail = 'Abriendo el túnel de Cloudflare…';
    const re = new RegExp(process.env.MA_TUNNEL_RE || 'https://[a-z0-9-]+\\.trycloudflare\\.com');
    const p = this.proc = spawn(bin, ['tunnel', '--no-autoupdate', '--url', `http://localhost:${this.port}`], { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    const url = await new Promise(res => {
      let buf = '', done = false; const fin = v => { if (!done) { done = true; clearTimeout(t); res(v); } };
      const t = setTimeout(() => fin(null), 60000);
      const on = d => { buf += d; const m = buf.match(re); if (m) fin(m[0].replace(/\/+$/, '')); if (buf.length > 1e5) buf = buf.slice(-5e4); };
      p.stdout.on('data', on); p.stderr.on('data', on);
      p.on('error', e => { this.detail = e.message; fin(null); });
      p.on('exit', () => fin(null));
    });
    if (gen !== this.gen) return;
    if (!url) { this.stopProc(); throw new Error('No se pudo abrir el túnel de Cloudflare. Comprueba tu conexión a Internet (y que ningún antivirus bloquee «cloudflared»).'); }
    p.on('exit', code => { if (gen === this.gen && this.state !== 'off') { this.onClose(this.url); this.fail(`El túnel se ha cerrado (código ${code}). Vuelve a crear el enlace.`); } });
    this.url = url; this.onUrl(url);
    this.state = 'checking'; this.detail = 'Comprobando que el enlace responde desde Internet…';
    this.log && this.log.info('host.tunnel_url', { url });
    const t0 = Date.now();
    while (Date.now() - t0 < this.checkTimeout && gen === this.gen) {
      try { const r = await fetch(url + '/api/health', { signal: AbortSignal.timeout(4000) }); if (r.ok) { this.reachable = true; break; } } catch { /* aún no */ }
      await new Promise(r => setTimeout(r, 1000));
    }
    if (gen !== this.gen) return;
    if (!this.reachable) this.reachable = false;
    this.state = 'on'; this.detail = this.reachable ? 'El enlace responde desde Internet.' : 'Cloudflare aún no responde; a veces tarda un poco más. Pruébalo en un minuto.';
  }
  fail(msg) { this.state = 'error'; this.error = msg; this.detail = ''; this.log && this.log.warn('host.tunnel_error', { error: msg }); }
  stopProc() { const p = this.proc; this.proc = null; if (p) { try { p.kill(); } catch { /* ya cerrado */ } } }
  close() {
    this.gen++;
    const url = this.url; this.stopProc();
    if (url) this.onClose(url);
    this.state = 'off'; this.url = ''; this.error = ''; this.detail = ''; this.reachable = null;
    return this.status();
  }
}
