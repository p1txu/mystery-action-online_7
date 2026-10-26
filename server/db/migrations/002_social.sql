-- Mystery Action online: amigos y bloqueos (PostgreSQL 13+). Idempotente.
-- Código de amigo: 6 caracteres únicos por cuenta («Ana#K7P2QX»); no revela el usuario ni el correo.
create table if not exists friend_codes (
  account_id text primary key references accounts(id) on delete cascade,
  code       text not null unique
);
-- Una fila por pareja (a < b): pendiente (requester la pidió) o aceptada.
create table if not exists friendships (
  a          text not null references accounts(id) on delete cascade,
  b          text not null references accounts(id) on delete cascade,
  requester  text not null,
  status     text not null check (status in ('pending', 'accepted')),
  created_at timestamptz not null default now(),
  primary key (a, b),
  check (a < b)
);
create index if not exists friendships_b on friendships (b);
-- Bloqueos: owner no recibe nada de target (solicitudes, invitaciones ni chat).
create table if not exists blocks (
  owner      text not null references accounts(id) on delete cascade,
  target     text not null references accounts(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (owner, target)
);
create index if not exists blocks_target on blocks (target);
