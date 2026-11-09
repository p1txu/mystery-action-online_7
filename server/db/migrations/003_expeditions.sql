-- Mystery Action online (0.42): estado de las expediciones y operaciones idempotentes (PostgreSQL 13+). Idempotente.
-- Una fila por expedición con su última instantánea en un punto seguro (piso, jefe, objetivo, cierre).
-- `seq` crece con cada instantánea: una escritura antigua que llegue tarde no pisa a una nueva.
create table if not exists expeditions (
  id          text primary key,                   -- el mismo id que la clave de `rewards`
  dungeon     text not null,
  status      text not null check (status in ('active', 'suspended', 'ended')),
  seq         integer not null,
  state       jsonb not null,                     -- Expedition.snapshot(): semilla, piso, cofres, jefes, mecanismos, jugadores…
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create table if not exists expedition_members (
  expedition_id text not null references expeditions(id) on delete cascade,
  account_id    text not null references accounts(id) on delete cascade,
  primary key (expedition_id, account_id)
);
create index if not exists expedition_members_account on expedition_members (account_id);
-- Operaciones de la aldea ya aplicadas (opId del cliente): repetir la misma petición devuelve lo mismo sin aplicarla otra vez.
create table if not exists profile_ops (
  account_id  text not null references accounts(id) on delete cascade,
  op_id       text not null,
  version     integer not null,
  info        jsonb,
  created_at  timestamptz not null default now(),
  primary key (account_id, op_id)
);
