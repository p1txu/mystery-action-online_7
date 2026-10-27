#!/usr/bin/env bash
# Ejecuta todas las pruebas.
#   1) unitarias (Node): núcleo, protocolo, cuentas, base de datos, reglas del perfil, API HTTP, simulación
#   2) Colyseus real (Node): grupos de 4 clientes y persistencia individual (SQLite y, si hay, PostgreSQL)
#   3) navegador (Playwright): reglas navegador = servidor, operaciones del perfil = juego local, red del
#      cliente, 4 navegadores en grupo, cuenta en dos dispositivos y combate de 4 navegadores
# Colyseus y pg: si están instalados (npm install) se usan los paquetes; si no (sin acceso a npm), se
# compilan desde su código fuente en GitHub (tests/vendor/build-colyseus.mjs, commits fijados).
# PostgreSQL: si hay un servidor instalado se arranca uno desechable (tests/pg/start-postgres.sh).
set -euo pipefail
cd "$(dirname "$0")/.."
node tools/split-prototype.mjs --check
LOADER=()
if [ ! -d node_modules/@colyseus/core ]; then
  [ -f tests/.vendor/loader.mjs ] || node tests/vendor/build-colyseus.mjs
  LOADER=(--import ./tests/.vendor/loader.mjs)
fi
PGURL=""
if PGURL=$(bash tests/pg/start-postgres.sh 2>/dev/null); then trap 'bash tests/pg/start-postgres.sh stop' EXIT; else PGURL=""; echo "(PostgreSQL no disponible: se prueba solo SQLite)"; fi
TEST_DATABASE_URL="$PGURL" node "${LOADER[@]}" --test "tests/*.test.mjs"
node "${LOADER[@]}" --test "tests/colyseus/*.test.mjs"
PERSIST_DATABASE_URL="$PGURL" node "${LOADER[@]}" --test "tests/deploy/*.test.mjs"     # producción: proceso real, imagen, cierre ordenado
[ -n "$PGURL" ] && PERSIST_DATABASE_URL="$PGURL" node "${LOADER[@]}" --test tests/colyseus/persistence.test.mjs
if command -v python3 >/dev/null && python3 -c "import playwright" 2>/dev/null; then
  mkdir -p tests/.tmp
  { printf '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body>\n'; cat prototype/mystery-action.html; printf '\n</body></html>'; } > tests/.tmp/prototype.html
  python3 tests/e2e/parity.py tests/.tmp/prototype.html
  python3 tests/e2e/rules_parity.py tests/.tmp/prototype.html
  python3 tests/e2e/escorts.py tests/.tmp/prototype.html                              # mercader Tobías escondido junto al jefe, cartero Lino por la ruta y huida lenta, Gruta ×3 PS, velocidades
  python3 tests/e2e/world_art.py tests/.tmp/prototype.html                            # aldea y mazmorras pintadas: colisiones = dibujo, caminos libres, profundidad, biomas, cofres
  python3 tests/e2e/dungeon_ch1.py tests/.tmp/prototype.html                          # mazmorra del capítulo 1 jugada: palancas, puentes, placas de tiempo, paredes falsas, emboscada, minijefe, textos; mismo piso en navegador y Node
  python3 tests/e2e/hero_sprites.py tests/.tmp/prototype.html                          # héroes en pixel art: 920 fotogramas, sin cortes, pies anclados, 8 direcciones, paleta
  SHOT_DIR=tests/.tmp python3 tests/e2e/netplay_e2e.py tests/.tmp/prototype.html
  SHOT_DIR=tests/.tmp python3 tests/colyseus/browser_group_e2e.py
  SHOT_DIR=tests/.tmp python3 tests/colyseus/browser_account_e2e.py
  SHOT_DIR=tests/.tmp python3 tests/colyseus/browser_combat_e2e.py
  SHOT_DIR=tests/.tmp python3 tests/colyseus/browser_drop_e2e.py                     # dejar un objeto en el suelo para un compañero
  SHOT_DIR=tests/.tmp python3 tests/colyseus/browser_geoda_e2e.py                    # Gruta en cooperativo: Pico Cartero y Reina Geoda (rocas, aturdida, salto)
  SHOT_DIR=tests/.tmp python3 tests/colyseus/browser_revive_e2e.py                   # caer y reanimar: la partida del caído no se cierra; Ana lo reanima
  SHOT_DIR=tests/.tmp python3 tests/colyseus/browser_social_e2e.py                   # siempre online: amigos, grupo, aldea compartida, chat y mazmorra en grupo (3 navegadores)
  SHOT_DIR=tests/.tmp python3 tests/colyseus/browser_arrival_e2e.py                  # cuenta nueva + Guerrero: llegada en carretilla; versión visible; pestaña antigua se recarga
  SHOT_DIR=tests/.tmp python3 tests/colyseus/browser_host_e2e.py                     # anfitrión y amigo: invitación, opciones, ceder liderazgo
  python3 tests/deploy/launcher_e2e.py                                                  # Jugar.bat / jugar.sh: lanzador + 2 navegadores
  python3 tests/deploy/host_e2e.py                                                      # enlace para amigos desde el juego: túnel (simulado) bajo demanda + 2 navegadores
  python3 tests/deploy/tls_e2e.py                                                       # HTTPS + wss:// a través de un proxy TLS
else
  echo "(pruebas de navegador omitidas: falta python3 + playwright)"
fi
