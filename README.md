# Mystery Action · versión online (cooperativo hasta 4 jugadores)

Juego de acción y mazmorras de fantasía medieval con cuatro clases: **Guerrero, Arquero, Mago y Asesino** (ver [`docs/CLASES.md`](docs/CLASES.md)). El prototipo de un solo HTML sigue funcionando por sí mismo. Esta carpeta lo separa en un **cliente**, un **servidor multijugador (Colyseus)**, un **sistema de identidad y perfiles**, una **capa de persistencia** y el **estado temporal de cada expedición**.

El plan completo, con la arquitectura, la validación, la red, las dependencias, los servicios y el estado de cada parte, está en [`docs/PLAN.md`](docs/PLAN.md).

> **Cómo se ha probado:** en el entorno de desarrollo npm estaba bloqueado, así que Colyseus 0.18 se compiló desde su código fuente oficial en GitHub (`tests/vendor/`). Las pruebas multijugador usan ese Colyseus real con cuatro clientes a la vez, en Node y en cuatro navegadores. Con `npm install` se usan los paquetes publicados. PostgreSQL se probó con un servidor 16 local. El modo producción se probó con el proceso real, por HTTPS/WSS a través de un proxy TLS. Sin ejecutar aquí: `npm install` con los paquetes publicados, la construcción de las imágenes Docker y un despliegue real.

## Empezar a jugar (sin terminal)

**Windows, lo más fácil:** descarga el instalador **MysteryAction-Setup.exe** de la página *Releases* del repositorio, ábrelo y pulsa «Instalar». Trae todo lo necesario y se actualiza solo (ver [`docs/INSTALADOR.md`](docs/INSTALADOR.md)).

Sin instalador:

**Windows:** doble clic en **`Instalar.bat`** (solo la primera vez). Hace lo siguiente:
1. Instala Node.js si falta (con `winget`; si no está disponible, abre la página de descarga).
2. Descarga lo que necesita el juego.
3. Crea en el escritorio el acceso directo **«Pokemon Mystery Action»**.
4. Abre el juego en el navegador.

Las siguientes veces usa ese acceso directo o **`Jugar.bat`**: busca actualizaciones, arranca el juego (un solo servidor que sirve el juego y el cooperativo) y abre `http://localhost:5173`. **Todo se hace desde el mismo juego:**
- Solo: «Jugar».
- **Jugar**: entras con tu cuenta y vas directo a la aldea. El juego es siempre online (ver [`docs/SOCIAL.md`](docs/SOCIAL.md)).
- **Amigos y grupo** (tecla **O**): añade amigos con su código, invítalos a tu grupo, os veis en la aldea, habláis por el chat (tecla **T**) y el líder os lleva a todos a la mazmorra.
- Con alguien de tu casa: abren la dirección de tu red local que muestra la ventana.
- Con amigos de fuera: «Cuenta y partidas privadas» → **«Crear enlace para amigos»** (enlace https; ver `docs/ANFITRION.md`). Que creen una cuenta con usuario y contraseña: el enlace cambia cada vez que lo abres.

Deja abierta su ventana mientras jugáis; ciérrala para salir.

**macOS:** doble clic en **`Jugar.command`**. **Linux:** `./jugar.sh`. Necesitan Node.js 22.13 o posterior (https://nodejs.org).

No hace falta Git. Todo lo hace `tools/launch.mjs` (también con `npm run jugar`).

## Puesta en marcha (desarrollo)

Requiere Node.js 22.13 o posterior (la base de datos por defecto es SQLite con `node:sqlite`).

```bash
npm install
npm run split          # genera shared/ y client/ desde prototype/mystery-action.html
npm run dev:server     # http://localhost:2567  (base de datos ./server/data/mystery-action.db, secreto de desarrollo local)
npm run dev:client     # http://localhost:5173  → «Cooperativo online» (esbuild, recompila al guardar)
npm run build:client   # versión de publicación en client/dist (SERVER_URL=https://… si el servidor está en otro dominio)
```

**Para jugar en grupo (hasta 4):**

1. Cada jugador abre «Cooperativo online», crea una cuenta (o inicia sesión, o prueba como invitado) y, la primera vez, elige su criatura.
2. Uno pulsa «Crear partida privada» y comparte el código de 6 caracteres.
3. Los demás lo escriben en «Unirse a partida», o abren el enlace de invitación, que ya lleva el código.
4. El anfitrión elige la mazmorra y el tiempo de reconexión. Los invitados marcan «Estoy listo» y el anfitrión pulsa «Iniciar expedición». Puede «ceder liderazgo» a otro.
5. Si alguien pierde la conexión, se le guarda el sitio `RECONNECT_SECONDS` segundos (45 por defecto) y el grupo sigue jugando. Puede volver solo, con «Reintentar» o, desde otro dispositivo, con «Volver a mi grupo» (el mismo personaje, nunca uno duplicado). Si el anfitrión se desconecta (10 s) o abandona, el liderazgo pasa a quien lleve más tiempo en el grupo.
6. «Abandonar grupo» sale del grupo en cualquier momento. «Entrar en la aldea» entra en la aldea online con el mismo perfil (el progreso en solitario y en grupo es el mismo). La partida local sin servidor solo aparece en modo de pruebas (`?local=1`).

El combate es autoritativo: el servidor genera la mazmorra, decide el daño, las muertes y las recompensas, y todos ven el mismo mundo (enemigos, ataques, puertas, guardián). Más detalle en `docs/PLAN.md`, apartado 7.

Cada perfil es personal y vive en la base de datos del servidor. El cliente solo pide acciones (comprar, equipar, entregar misiones…); el servidor las valida con las reglas del juego. Las recompensas de cada expedición se guardan una sola vez por jugador. Más detalle en `docs/PLAN.md`, apartado 6.

**Producción.** Hay que definir `AUTH_SECRET` (nunca se incluye uno) y `CLIENT_ORIGIN`. Con varios procesos, usa PostgreSQL: `PROFILE_STORE=postgres` y `DATABASE_URL`; las tablas se crean al conectar. La plantilla está en `.env.example`.

## Anfitrión y amigos

El jugador que crea la sala es el **anfitrión lógico**: invita con un código o un enlace, elige las opciones de expedición, inicia y puede ceder el liderazgo. La sala y la partida viven en el **servidor técnico** (Colyseus), nunca en su navegador. El flujo completo, las reglas y cómo probar con dos ordenadores están en [`docs/MULTIJUGADOR.md`](docs/MULTIJUGADOR.md).

## Jugar por Internet

La guía completa está en [`docs/DEPLOY.md`](docs/DEPLOY.md): tres opciones (gratis para probar, VPS propio, gestionada), costes y límites, HTTPS/WSS, registros, copias de seguridad, lista de comprobación desde dos redes y cómo crear una sala privada. Archivos de despliegue: `Dockerfile`, `deploy/` (Caddy + PostgreSQL con Docker Compose), `fly.toml`, `render.yaml` y `.env.example` (sin secretos).

**Aún no está desplegado en ningún servidor.**

## Flujo de trabajo

1. El juego se edita **solo** en `prototype/mystery-action.html`, que es el artefacto. Se puede seguir publicando tal cual.
2. Después se ejecuta `npm run split`.
3. `npm run check` falla si los archivos generados no corresponden al prototipo.

## Pruebas

```bash
npm test               # unitarias: núcleo, protocolo, identidad, perfiles, API HTTP real, simulación
npm run test:colyseus  # grupos, combate en tiempo real con 4 clientes y persistencia individual, con Colyseus real
npm run test:deploy    # el servidor en modo producción (proceso real), la imagen y el cierre ordenado
npm run test:all       # todo, incluidos los navegadores y HTTPS/WSS (requiere python3 + playwright)
```

- **Mazmorras, movimientos por nivel, guardianes (Reina Geoda), Topo Mercader y Pico Cartero**: `docs/PROGRESION.md`.
- **Instalador de Windows** (`MysteryAction-Setup.exe`, lo construye GitHub): `docs/INSTALADOR.md`.
- **Actualizaciones automáticas del lanzador** (`update.json`, `Actualizar.bat`): `docs/ACTUALIZAR.md`.
- **Dones de expedición** (1 de 3 por piso, solo duran esa expedición): `docs/DONES.md`.
- **Siempre online: amigos, grupo persistente, aldea compartida y chat**: `docs/SOCIAL.md`.
- **Jugar con amigos por Internet desde tu PC** (botón «Crear enlace para amigos» dentro del juego: tu ordenador hace de servidor y comparte un enlace https): `docs/ANFITRION.md`.
