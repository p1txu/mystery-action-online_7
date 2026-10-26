/**
 * Estado sincronizado (Colyseus @colyseus/schema 5, API `schema()` + `t`).
 * Solo lleva lo que el cliente necesita para dibujar; el piso se regenera en el cliente
 * con la misma semilla (mensaje «floor»), así no se envían las casillas.
 */
import { schema, t } from '@colyseus/schema';

export const PlayerState = schema({
  name: t.string(), species: t.string(), level: t.uint8(), host: t.boolean(), ready: t.boolean(), joinedAt: t.float64(),
  x: t.float32(), y: t.float32(), vx: t.float32(), vy: t.float32(), fx: t.float32(), fy: t.float32(),
  hp: t.uint16(), maxHp: t.uint16(), exp: t.uint32(), energy: t.uint8(), belly: t.uint8(), gems: t.uint32(),
  downed: t.boolean(), revive: t.float32(), connected: t.boolean(), dash: t.boolean(), iframes: t.boolean(),
  ack: t.uint32(), basic: t.float32(), dodge: t.uint8(), holdUntil: t.float64(),   // holdUntil: hasta cuándo se le guarda el sitio (ms, 0 = conectado)
  cds: t.array('number'), moves: t.array('string'),
}, 'PlayerState');

export const EnemyState = schema({
  kind: t.string(), x: t.float32(), y: t.float32(), fx: t.float32(), fy: t.float32(),
  hp: t.uint16(), maxHp: t.uint16(), level: t.uint8(), elite: t.boolean(), aggro: t.boolean(),
  state: t.string(), timer: t.float32(), wind: t.float32(),
  pattern: t.string(), ax: t.float32(), ay: t.float32(), gx: t.float32(), gy: t.float32(),   // aviso de ataque: patrón, dirección y punto objetivo
}, 'EnemyState');

export const ItemState = schema({ id: t.string(), amount: t.uint16(), tx: t.uint16(), ty: t.uint16() }, 'ItemState');
export const ObjectState = schema({ type: t.string(), tier: t.string(), tx: t.uint16(), ty: t.uint16(), opened: t.boolean() }, 'ObjectState');
export const ShotState = schema({ x: t.float32(), y: t.float32(), vx: t.float32(), vy: t.float32(), r: t.float32(), kind: t.string(), color: t.string(), team: t.string(), owner: t.string() }, 'ShotState');
export const ZoneState = schema({ x: t.float32(), y: t.float32(), r: t.float32(), team: t.string(), color: t.string(), life: t.float32(), t: t.float32() }, 'ZoneState');

export const DoorState = schema({ open: t.boolean() }, 'DoorState');
/** Guardián del piso: lo mismo para todos (PS, fase 1/2 y el patrón que está preparando). */
export const BossState = schema({ id: t.string(), alive: t.boolean(), hp: t.uint16(), maxHp: t.uint16(), phase: t.uint8(), state: t.string(), pattern: t.string(), rage: t.boolean(),
  stage: t.uint8(), hits: t.uint8(), rocks: t.string() }, 'BossState');   // stage/hits/rocks: combate de la Reina Geoda

export const ExpeditionState = schema({
  phase: t.string().default('lobby'),       // lobby | playing | ended
  code: t.string(), max: t.uint8(), dungeon: t.string().default('bosque'), floorN: t.uint16(), time: t.float32(), wind: t.uint8(),
  players: t.map(PlayerState), enemies: t.map(EnemyState), items: t.map(ItemState), objects: t.map(ObjectState),
  shots: t.map(ShotState), zones: t.map(ZoneState), doors: t.map(DoorState), boss: BossState,
  hostRule: t.string(), reconnectSeconds: t.uint16(),
}, 'ExpeditionState');
