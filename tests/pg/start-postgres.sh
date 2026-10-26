#!/usr/bin/env bash
# SOLO PRUEBAS: arranca un PostgreSQL local y desechable y escribe su URL en stdout.
# Uso: URL=$(bash tests/pg/start-postgres.sh)   ·   parar: bash tests/pg/start-postgres.sh stop
set -euo pipefail
BIN=$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)
[ -n "$BIN" ] || { echo "no hay PostgreSQL instalado" >&2; exit 1; }
DIR=${PG_TEST_DIR:-/tmp/ma-pg-test}; PORT=${PG_TEST_PORT:-5544}
RUN=(); if [ "$(id -u)" = 0 ]; then id pgtest >/dev/null 2>&1 || useradd -M -s /bin/false pgtest; RUN=(runuser -u pgtest --); fi
if [ "${1:-}" = stop ]; then "${RUN[@]}" "$BIN/pg_ctl" -D "$DIR/data" stop -m fast >/dev/null 2>&1 || true; rm -rf "$DIR"; exit 0; fi
rm -rf "$DIR"; mkdir -p "$DIR"; [ "$(id -u)" = 0 ] && chown pgtest "$DIR"
"${RUN[@]}" "$BIN/initdb" -D "$DIR/data" -U postgres --auth=trust >/dev/null
"${RUN[@]}" "$BIN/pg_ctl" -D "$DIR/data" -o "-p $PORT -k $DIR -c listen_addresses=127.0.0.1" -l "$DIR/log" -w start >/dev/null
echo "postgres://postgres@127.0.0.1:$PORT/postgres"
