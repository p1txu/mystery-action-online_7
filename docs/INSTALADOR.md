# Instalador de Windows (MysteryAction-Setup.exe)

Un instalador normal de Windows: lo descargas, lo abres, «Siguiente → Instalar», y tienes **Pokémon Mystery Action** en el menú Inicio (y en el escritorio si quieres) con su icono. No hace falta instalar Node.js ni ejecutar `Instalar.bat`: el instalador trae todo lo que el juego necesita.

## Qué hace

- **Dónde se instala:** en tu carpeta de usuario (`%LOCALAPPDATA%\Programs\Pokemon Mystery Action`). No pide permisos de administrador y las actualizaciones automáticas pueden escribir ahí sin preguntar.
- **Qué incluye:**
  - el juego;
  - sus dependencias ya instaladas;
  - su propio Node.js (`runtime\`, la misma versión con la que se ha comprobado).
- **Abrir:** el acceso directo abre `Jugar.bat`, que busca actualizaciones, arranca el servidor y abre el navegador como siempre. **Deja abierta esa ventana mientras juegas.**
- **Actualizaciones:** automáticas, igual que antes (`docs/ACTUALIZAR.md`). No hace falta volver a descargar el instalador. Nunca tocan `data\` ni `runtime\`.
- **Desinstalar:** «Configuración → Aplicaciones → Pokémon Mystery Action → Desinstalar». Pregunta si borrar también **`data\`**, que contiene:
  - tus cuentas, perfiles y amistades;
  - el secreto que cifra los nombres.

  Por defecto **no** la borra.
- **Aviso de Windows la primera vez:** el `.exe` no va firmado, así que Windows puede decir «Windows protegió su PC». Pulsa **Más información → Ejecutar de todas formas**. Quitar ese aviso requiere un certificado de firma de código, que es de pago.

## Cómo se fabrica (lo hace GitHub)

El archivo `.github/workflows/windows-installer.yml` hace que **GitHub lo construya solo** en un Windows suyo (gratis en repositorios públicos) **cada vez que se sube un `version.json` nuevo** a `main`. También se puede lanzar a mano: pestaña **Actions → «Instalador de Windows» → Run workflow**.

Pasos del flujo:

1. Instala las dependencias para Windows.
2. Comprueba las reglas generadas y que el servidor arranca.
3. Descarga el Node.js portátil oficial de la misma versión.
4. Prepara la carpeta con `tools/stage-windows.mjs`.
5. Compila con **Inno Setup** (`installer/MysteryAction.iss`).
6. Publica el `.exe` en **Releases** con las novedades de `version.json`.

**Enlace fijo de descarga** (sirve para siempre; apunta a la última versión):
`https://github.com/USUARIO/REPOSITORIO/releases/latest/download/MysteryAction-Setup.exe`

### A mano, en un PC con Windows (opcional)
1. `npm install`
2. Descarga el zip de Node.js 22 para Windows x64 de nodejs.org y descomprímelo.
3. `node tools\stage-windows.mjs --node C:\ruta\node-v22.x.x-win-x64`
4. Instala Inno Setup 6 y ejecuta: `"C:\Program Files (x86)\Inno Setup 6\ISCC.exe" /DAppVersion=0.32 installer\MysteryAction.iss`
5. El instalador queda en `installer\Output\MysteryAction-Setup.exe`.

## Archivos

| Archivo | Para qué |
|---|---|
| `installer/MysteryAction.iss` | Script de Inno Setup: instalación sin administrador, accesos directos, desinstalación que pregunta por `data\` |
| `installer/icon.ico` · `icon.png` | Icono, hecho con el sprite del Guerrero del propio juego |
| `tools/stage-windows.mjs` | Prepara la carpeta: juego sin las pruebas, `node_modules` con la marca de «ya instalado», `runtime\` y la lista de archivos para el actualizador |
| `tools/release-notes.mjs` | Notas de la versión para Releases |
| `.github/workflows/windows-installer.yml` | Lo construye y lo publica en GitHub |
| `Jugar.bat`, `Actualizar.bat` | Usan `runtime\node.exe` si existe; si no, el Node.js del sistema (como antes) |

## Qué está probado y qué no

- **Probado aquí, en Linux** (`tests/deploy/stage-windows.test.mjs`):
  - la carpeta del instalador tiene lo necesario y no lleva las pruebas;
  - el lanzador la ve ya instalada, sin descargar nada;
  - una actualización automática no toca `runtime\` ni `data\`;
  - el script de Inno Setup y el flujo apuntan a archivos que existen.
- **Sin probar:**
  - la compilación del `.exe` con Inno Setup y la instalación en Windows de verdad (aquí no hay Windows ni Inno Setup);
  - el flujo de GitHub Actions.

  Todo eso se hace la primera vez que GitHub lo ejecute en el repositorio. Si falla, el registro de la pestaña Actions dice en qué paso.
