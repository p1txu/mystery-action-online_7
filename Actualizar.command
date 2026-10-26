#!/usr/bin/env sh
# Pokémon Mystery Action: descarga e instala la última versión (tus partidas no se tocan).
# No hace falta usarlo: jugar.sh ya busca actualizaciones al abrirse.
cd "$(dirname "$0")" || exit 1
if ! command -v node >/dev/null 2>&1; then
  echo "Falta Node.js 22.13 o posterior: instálalo desde https://nodejs.org y vuelve a abrir este archivo."
  exit 1
fi
exec node tools/update.mjs "$@"
