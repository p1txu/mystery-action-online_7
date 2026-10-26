/**
 * Arreglo para un fallo del SDK de Colyseus (0.18): al perder la red («offline»), recorre su lista de conexiones
 * con forEach mientras cada conexión cerrada se borra de esa misma lista, así que con dos conexiones abiertas
 * (el hub social y la expedición) la segunda se salta y se queda «abierta» sin red: el juego no se enteraba del
 * corte. Aquí, justo después, se cierran con el mismo código (4010, «se puede reintentar») las que sigan abiertas,
 * para que cada una siga su camino normal de reconexión.
 */
const rooms = new Set();
const MAY_TRY_RECONNECT = 4010;
export function watchOffline(room) { if (room) rooms.add(room); return () => rooms.delete(room); }
if (typeof addEventListener === 'function') addEventListener('offline', () => setTimeout(() => {
  for (const r of rooms) {
    const c = r && r.connection;
    try { if (c && c.isOpen) c.close(MAY_TRY_RECONNECT); } catch { /* ya cerrada */ }
  }
}, 0));
