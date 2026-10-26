# Actualizaciones automáticas (lanzador)

`Jugar.bat` / `jugar.sh` / `Jugar.command` buscan una versión nueva **cada vez que se abren**.
Si la hay, la descargan, la instalan y arrancan ya con la versión nueva. No hace falta volver a descargar el zip.

- Se conserva siempre lo tuyo: `data/` (cuentas y perfiles del servidor), `.env`, `update.json`, `node_modules/`, `tools/bin/` y cualquier archivo que hayas añadido tú. Las partidas en solitario viven en el navegador y tampoco se tocan.
- Si no hay internet o algo falla, lo dice y **se juega con la versión que tienes**.
- Lo que reemplaza queda en `.update/backup/` (copia de la versión anterior).
- `Actualizar.bat` / `actualizar.sh` solo actualizan (sin abrir el juego). `node tools/update.mjs --check` solo dice si hay versión nueva.
- Para no buscar actualizaciones: `Jugar.bat --no-update` (o la variable `MA_NO_UPDATE=1`).

## De dónde se actualiza: `update.json`

### Opción A — repositorio de GitHub (recomendada)

1. Crea un repositorio **público** en GitHub (por ejemplo `ana/mystery-action`).
2. Sube el contenido de esta carpeta (el `.gitignore` ya excluye datos y dependencias).
3. En `update.json` pon:
   ```json
   { "source": "github", "repo": "ana/mystery-action", "branch": "main" }
   ```
4. Cada vez que se suba un cambio con un número `build` mayor en `version.json`, todos los lanzadores lo instalan al abrirse.

No hace falta ninguna clave: un repositorio público se descarga sin cuenta. (Con un repositorio privado no funcionaría: haría falta un token, y el lanzador no guarda credenciales.)

Si conectas GitHub en los ajustes de claude.ai y me dices el nombre del repositorio, puedo subir yo cada cambio y no tendrás que descargar nada.

### Opción B — cualquier web estática

```
node tools/make-release.mjs --out release
```
Crea `release/mystery-action-<build>.zip` y `release/version.json` (con la huella sha256 del zip). Sube los dos a la misma carpeta de una web (solo https) y en `update.json`:
```json
{ "source": "url", "manifest": "https://tu-web.example/juego/version.json" }
```

## `version.json`

```json
{ "build": 22, "version": "0.22", "date": "2026-10-26", "notes": ["Novedades…"] }
```
El lanzador compara `build`: solo instala si el publicado es mayor que el tuyo.

## Seguridad

Solo descarga por https. Comprueba la suma de control de cada archivo del zip y la huella sha256 si el manifiesto la trae. Rechaza rutas peligrosas (`..`, absolutas) y comprueba que el zip es el juego y que trae la versión anunciada. Si algo falla mientras instala, restaura la versión anterior.

## Pruebas

`tests/deploy/update.test.mjs` (6 pruebas): un servidor local imita las direcciones de GitHub (`raw.githubusercontent.com` y `codeload.github.com`) y una web propia. Incluye el lanzador real que se actualiza y se relanza. **No se ha probado contra GitHub de verdad**: desde el entorno de desarrollo no hay acceso a GitHub.
