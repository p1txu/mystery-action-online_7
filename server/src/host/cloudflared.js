/**
 * cloudflared (programa oficial y gratuito de Cloudflare para los túneles rápidos «trycloudflare»).
 * Orden de búsqueda: variable MA_CLOUDFLARED, el instalado en el sistema, <binDir>/cloudflared;
 * si no hay ninguno, se descarga de las versiones oficiales de GitHub (solo la primera vez).
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync, renameSync, chmodSync } from 'node:fs';
import { join, dirname } from 'node:path';

const WIN = process.platform === 'win32';
const works = bin => { const r = spawnSync(bin, ['--version'], { encoding: 'utf8', windowsHide: true }); return !r.error && r.status === 0; };
export const MANUAL_URL = 'https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/downloads/';

/** @returns {Promise<string>} ruta del ejecutable (lanza un Error con explicación si no se puede) */
export async function findCloudflared(binDir, onProgress = () => {}) {
  if (process.env.MA_CLOUDFLARED) { if (works(process.env.MA_CLOUDFLARED)) return process.env.MA_CLOUDFLARED; throw new Error(`MA_CLOUDFLARED no funciona: ${process.env.MA_CLOUDFLARED}`); }
  if (works('cloudflared')) return 'cloudflared';
  const local = join(binDir, WIN ? 'cloudflared.exe' : 'cloudflared');
  if (existsSync(local) && works(local)) return local;
  const arch = process.arch === 'arm64' ? 'arm64' : process.arch === 'x64' ? 'amd64' : null;
  const file = !arch ? null : WIN ? `cloudflared-windows-${arch}.exe` : process.platform === 'darwin' ? `cloudflared-darwin-${arch}.tgz` : process.platform === 'linux' ? `cloudflared-linux-${arch}` : null;
  if (!file) throw new Error(`No hay cloudflared para este sistema (${process.platform}/${process.arch}). Instálalo a mano: ${MANUAL_URL}`);
  const src = `https://github.com/cloudflare/cloudflared/releases/latest/download/${file}`;
  onProgress('downloading', src);
  try {
    const r = await fetch(src, { redirect: 'follow', signal: AbortSignal.timeout(180000) });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const buf = Buffer.from(await r.arrayBuffer());
    mkdirSync(dirname(local), { recursive: true });
    if (file.endsWith('.tgz')) {
      const tgz = local + '.tgz'; writeFileSync(tgz, buf);
      const x = spawnSync('tar', ['-xzf', tgz, '-C', dirname(local)], { encoding: 'utf8' });
      if (x.status !== 0) throw new Error('no se pudo descomprimir: ' + (x.stderr || '').trim());
    } else { writeFileSync(local + '.part', buf); renameSync(local + '.part', local); }
    if (!WIN) chmodSync(local, 0o755);
    if (!works(local)) throw new Error('el programa descargado no arranca');
    return local;
  } catch (e) {
    throw new Error(`No se pudo descargar cloudflared (${e.message}). Comprueba tu conexión o instálalo a mano desde ${MANUAL_URL}`);
  }
}
