/**
 * Forma JSON del estado tal como la recibe el cliente (room.state.toJSON()): mapas por id.
 * La usa la prueba de extremo a extremo sin Colyseus; la sala real llega a la misma forma
 * a través del esquema (ver schema.js y ExpeditionRoom.sync).
 */
export function viewToState(v, { phase = 'playing', code = '', dungeon = '', lobby = {} } = {}) {
  const map = (list, key, pick) => Object.fromEntries(list.map(o => [o[key], pick(o)]));
  const omit = (o, ...ks) => { const r = Object.assign({}, o); for (const k of ks) delete r[k]; return r; };
  return {
    phase, code, dungeon: dungeon || (v.floor && v.floor.dungeon) || '', floorN: v.floor ? v.floor.n : 0, time: v.time, wind: v.wind,
    players: map(v.players, 'id', p => Object.assign(omit(p, 'id'), { host: !!(lobby[p.id] && lobby[p.id].host), ready: !!(lobby[p.id] && lobby[p.id].ready) })),
    enemies: map(v.enemies, 'id', e => omit(e, 'id')),
    items: map(v.items, 'key', i => omit(i, 'key')),
    objects: map(v.objects, 'key', o => omit(o, 'key')),
    shots: map(v.shots, 'id', s => omit(s, 'id')),
    zones: map(v.zones, 'id', z => omit(z, 'id')),
    doors: map(v.doors || [], 'key', d => omit(d, 'key')),
    boss: v.boss || undefined,
    mech: v.mech || '',
  };
}
