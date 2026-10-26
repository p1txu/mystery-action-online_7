-- Mystery Action online: cuentas, perfiles, recompensas y registro de cambios (PostgreSQL 13+).
-- Idempotente: se puede ejecutar varias veces (lo aplica PostgresProfileStore al conectar).
create table if not exists accounts (
  id            text primary key,                 -- 'u_' + 16 bytes aleatorios (base64url)
  name          text not null,                    -- nombre visible
  kind          text not null default 'guest',    -- guest | password (futuro: oauth)
  username      text,                             -- para iniciar sesión desde otros dispositivos
  pass_hash     text,                             -- scrypt$N$r$p$sal$hash
  token_version integer not null default 0,       -- al cerrar sesión en todas partes se incrementa
  created_at    timestamptz not null default now()
);
create unique index if not exists accounts_username on accounts (lower(username));

create table if not exists profiles (
  account_id  text primary key references accounts(id) on delete cascade,
  save        jsonb not null,                     -- perfil personal validado con Save.sanitize
  version     integer not null,                   -- control de concurrencia optimista
  origin      text not null default 'online',     -- new | op | expedition | import
  updated_at  timestamptz not null default now()
);

-- Recompensas individuales: una fila por (expedición, jugador). La clave primaria impide
-- aplicar dos veces la misma recompensa (reconexiones, mensajes repetidos, reintentos).
create table if not exists rewards (
  expedition_id   text not null,
  account_id      text not null references accounts(id) on delete cascade,
  result          text not null,
  summary         jsonb not null,
  profile_version integer not null,
  created_at      timestamptz not null default now(),
  primary key (expedition_id, account_id)
);

create table if not exists profile_events (
  id          bigserial primary key,
  account_id  text not null,
  kind        text not null,
  data        jsonb,
  version     integer,
  created_at  timestamptz not null default now()
);
create index if not exists profile_events_account on profile_events (account_id, id);
