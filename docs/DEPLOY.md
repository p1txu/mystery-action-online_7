# Jugar por Internet: despliegue y mantenimiento

> **Estado:** el proyecto está **preparado** para desplegarse y se ha probado en local en las condiciones de producción descritas en el apartado 13. **Aún no está desplegado en ningún servidor** y no se ha comprobado ninguna conexión desde fuera. El juego estará online cuando completes uno de los despliegues y la lista del apartado 11 desde dos redes distintas.

## Índice

1. Cómo funciona por Internet
2. Qué opción elegir y qué cuesta
3. Preparación en tu equipo
4. Desarrollo
5. Opción A: gratis para probar (Cloudflare Pages + Render + Neon)
6. Opción B: VPS propio, siempre encendido (Docker + Caddy + PostgreSQL)
7. Opción C: gestionada de pago (Fly.io + Cloudflare Pages)
8. HTTPS y WebSockets seguros
9. Errores, desconexiones, registros y copias de seguridad
10. Publicar una versión nueva
11. Lista de comprobación desde dos redes distintas
12. Crear una sala privada y que tus amigos se unan
13. Qué se ha probado y qué no
14. Fuentes

---

## 1. Cómo funciona por Internet

```
 Navegador (cliente)                          Servidor de juego (1 proceso Node.js)
 HTML + game.js + capa online   ── HTTPS ──▶  /api/*        cuentas, perfiles, código de sala
                                ── HTTPS ──▶  /matchmake/*  reservar plaza en una sala (Colyseus)
                                ── WSS   ──▶  WebSocket     la partida en tiempo real (20 Hz)
                                                    │
                                                    ▼
                                              Base de datos (perfiles, recompensas)
                                              PostgreSQL, o SQLite en un disco persistente
```

- **El cliente** son archivos estáticos (`client/dist`). Se pueden servir desde cualquier alojamiento estático o desde el mismo proxy que el servidor.
- **El servidor** guarda las salas **en su memoria**. Por eso:
  - tiene que ser **un único proceso**, sin réplicas ni balanceo entre varias máquinas;
  - tiene que estar **encendido mientras se juega**;
  - al reiniciarse, las expediciones en curso terminan como «interrumpidas» y se guarda lo conseguido.
- **La base de datos** guarda los perfiles y las recompensas: es lo único que debe sobrevivir a los reinicios.
- **El cifrado** (HTTPS/WSS) lo pone un proxy delante del servidor: Caddy en el VPS, o la propia plataforma en Render y Fly.io. El servidor Node escucha en HTTP dentro de una red privada y nunca se expone directamente.

## 2. Qué opción elegir y qué cuesta

Precios y límites consultados el **23 de octubre de 2026** en las páginas oficiales (apartado 14). Pueden cambiar: revísalos al contratar.

| | A. Gratis para probar | B. VPS propio (recomendada para mantenerlo) | C. Gestionada de pago |
|---|---|---|---|
| Cliente | Cloudflare Pages | El mismo VPS (Caddy) | Cloudflare Pages |
| Servidor | Render (plan gratuito) | Hetzner Cloud CX23 + Docker | Fly.io |
| Base de datos | Neon (plan gratuito) | PostgreSQL en el VPS | SQLite en un volumen de Fly |
| HTTPS | Incluido | Caddy + Let's Encrypt (gratis), **necesita un dominio** | Incluido |
| Coste mensual aproximado | 0 € | ~6 € + IVA (+ dominio, opcional) | ~4–5 US$ |
| Siempre encendido | **No**: se duerme sin tráfico | Sí | Sí |
| Mantenimiento | Mínimo | Actualizar el sistema y Docker tú | Mínimo |

### Servicios, costes y límites

| Servicio | Para qué | Gratis | Límites y costes que importan aquí |
|---|---|---|---|
| **GitHub** | Guardar el código; Render y Cloudflare despliegan desde él | Sí, repositorio privado | — |
| **Cloudflare Pages** | Publicar el cliente | Sí | 500 compilaciones al mes, 20 000 archivos por sitio y 25 MiB por archivo (el cliente son unos 6 archivos y ~0,8 MB). Respeta el archivo `_headers` con las cabeceras de seguridad |
| **Render, plan gratuito** | Servidor de juego | Sí | 0,1 CPU y 512 MB (la simulación medida usa ~15 ms de CPU por segundo con 4 jugadores en combate: suficiente para un grupo, no para muchos a la vez). Se **duerme tras 15 min sin tráfico** (los mensajes de WebSocket cuentan como tráfico) y tarda **~1 min** en despertar. 750 horas gratuitas al mes por espacio de trabajo. **Sin disco persistente**: los archivos locales se pierden, así que la base de datos tiene que ser externa. Su PostgreSQL gratuito **caduca a los 30 días**: no lo uses para los perfiles |
| **Neon, plan gratuito** | PostgreSQL con los perfiles | Sí | 1 GB de almacenamiento por proyecto, 100 horas de cómputo (CU-h) al mes por proyecto y 5 GB de tráfico. Se suspende tras 5 min sin consultas y despierta con la siguiente. De pago: Launch, sin mínimo mensual, por uso (0,106 US$/CU-h, 0,35 US$/GB-mes) |
| **Hetzner Cloud CX23** | VPS de la opción B | No | 5,49 €/mes desde el 15-06-2026 (Alemania y Finlandia, sin IPv4 ni IVA) + **IPv4: 0,50 €/mes** (sin IVA). Comprueba el tráfico incluido al contratar (el juego usa muy poco, ver abajo) |
| **Dominio** | HTTPS en la opción B (Let's Encrypt pide un nombre de dominio) | Opcional | Un dominio propio cuesta unos pocos euros al año según la extensión. Alternativa gratuita: un subdominio de un servicio de DNS dinámico, como DuckDNS |
| **Fly.io** | Servidor de la opción C | **No** (prueba: 2 h de máquina o 7 días) | shared-cpu-1x 512 MB: 3,69 US$/mes. Volumen: 0,15 US$/GB-mes. Tráfico saliente en Europa: 0,02 US$/GB. Una IPv4 dedicada cuesta 2 US$/mes; para HTTPS/WebSocket normalmente basta la compartida que asigna Fly. Regiones europeas activas: ams, cdg, fra, lhr, arn (Madrid se retiró) |
| Railway (alternativa) | Servidor | 1 US$ de crédito al mes | Hobby: 5 US$/mes con 5 US$ de uso incluido |

**Tráfico de una partida (medido).** Con 4 jugadores en combate, cada jugador recibe unos **6,6 KB/s** y envía unos **2,3 KB/s**: unos 95 MB por hora para el grupo entero. Diez horas de juego al mes suponen ~1 GB, unos 0,02 US$ en Fly.io.

**Qué opción elegir:**
- **A** si solo queréis probar alguna tarde. Si nadie ha jugado en 15 minutos, el primero tarda ~1 min en entrar.
- **B** si queréis que funcione siempre, por ~6 €/mes y algo de administración.
- **C** si preferís no administrar un servidor y no os importa pagar unos dólares al mes.

## 3. Preparación en tu equipo

1. Instala **Node.js 22.13 o posterior** (incluye npm). **Git** solo hace falta para subir el código a GitHub (paso 3): `npm install` no lo necesita.
2. Instala las dependencias y ejecuta las pruebas con los paquetes publicados:
   ```bash
   cd mystery-action-online
   npm install          # crea package-lock.json: súbelo al repositorio (versiones exactas en el despliegue)
   npm run check        # las reglas generadas corresponden al prototipo
   npm test             # unitarias
   npm run test:colyseus
   npm run test:deploy  # el servidor en modo producción, la imagen y el cierre ordenado
   ```
   `npm install` no se ha podido ejecutar en el entorno donde se preparó el proyecto (apartado 13). Si alguna prueba falla con los paquetes publicados, arréglalo antes de desplegar.
3. Crea un repositorio **privado** en GitHub y sube el proyecto:
   ```bash
   git init && git add . && git commit -m "Mystery Action online"
   git remote add origin git@github.com:TU_USUARIO/mystery-action-online.git
   git push -u origin main
   ```
   `.gitignore` deja fuera `.env`, `deploy/.env`, `data/`, `node_modules/` y `client/dist/`.
4. Genera **tus** secretos en tu equipo cuando los necesites. No los escribas en ningún archivo del repositorio:
   ```bash
   openssl rand -base64 48     # AUTH_SECRET (firma de sesiones)
   openssl rand -hex 24        # contraseña de PostgreSQL (opción B)
   ```

## 4. Desarrollo

```bash
cp .env.example .env          # opcional: npm run dev:server lo lee si existe
npm run dev:server            # servidor en http://localhost:2567 (SQLite en ./data, secreto de desarrollo local)
npm run dev:client            # cliente en http://localhost:5173 (se recompila al guardar)
```

- Abre `http://localhost:5173` → «Cooperativo online».
- Para jugar desde **otro ordenador de tu red local**, abre la dirección que imprime `dev:client` («desde otro ordenador de tu red: http://192.168.…:5173»). En desarrollo, sin `CLIENT_ORIGIN`, el servidor acepta cualquier origen. Si no conecta, abre el puerto 2567 en el cortafuegos del equipo que hace de servidor. Paso a paso en `docs/MULTIJUGADOR.md`.
- `npm run check:server -- http://IP:2567` comprueba la conexión desde cada ordenador.
- El juego se edita solo en `prototype/mystery-action.html`. Después ejecuta `npm run split` (`dev:client` ya lo hace al arrancar).
- `npm run build:client` compila la versión de publicación en `client/dist`. Con `SERVER_URL=https://…` fija la dirección del servidor.

## 5. Opción A: gratis para probar (Cloudflare Pages + Render + Neon)

Orden: base de datos → servidor → cliente → volver al servidor para indicarle la dirección del cliente.

**1. Neon (base de datos)**
1. Crea una cuenta y un proyecto (región en Europa, p. ej. Frankfurt).
2. En «Connection details», copia la cadena de conexión **directa** (sin `-pooler`). Tiene la forma `postgres://USUARIO:CONTRASEÑA@HOST/BASE?sslmode=require`.
3. Esa cadena es un secreto: solo va en el panel de Render.
4. Las tablas las crea el servidor al conectar (`server/db/migrations/001_init.sql`).

**2. Render (servidor)**
1. Crea una cuenta y conecta tu GitHub.
2. Elige «New → Blueprint» y selecciona el repositorio. Render lee `render.yaml`: servicio web Docker, plan gratuito, comprobación de salud en `/api/health`, y `AUTH_SECRET` generado por Render.
3. En el panel, rellena:
   - `DATABASE_URL`: la cadena de Neon.
   - `CLIENT_ORIGIN`: de momento `https://ejemplo.invalid`; lo cambiarás en el paso 4.
4. Al terminar, el servidor queda en `https://mystery-action-server-XXXX.onrender.com`. Comprueba:
   - `https://…onrender.com/api/health` → `{"ok":true,…}`
   - `https://…onrender.com/api/ready` → `"db":"ok"`

**3. Cloudflare Pages (cliente)**
1. Crea una cuenta. Ve a «Workers & Pages → Create → Pages → Connect to Git» y elige el repositorio.
2. Configura la compilación:
   - Build command: `npm ci && npm run build:client`
   - Build output directory: `client/dist`
   - Variables de entorno:
     - `NODE_VERSION` = `22`
     - `SERVER_URL` = `https://…onrender.com` (la dirección del paso 2, sin barra final)
3. Al publicar tendrás `https://TU-PROYECTO.pages.dev`.

**4. Cerrar el círculo**
1. En Render, cambia `CLIENT_ORIGIN` a `https://TU-PROYECTO.pages.dev`, exactamente esa dirección y sin barra final. Render reinicia el servicio.
2. Abre `https://TU-PROYECTO.pages.dev` y sigue el apartado 11.

**Avisos de esta opción**
- Si nadie juega en 15 minutos, el servidor se duerme. El primero en entrar espera ~1 minuto: si sale «No se puede conectar», espera y pulsa «Reintentar».
- Un servidor dormido o reiniciado no conserva las salas, pero los perfiles están en Neon y no se pierden.

## 6. Opción B: VPS propio, siempre encendido (Docker + Caddy + PostgreSQL)

Todo en una máquina y en un único dominio: `https://juego.tudominio.es` sirve el juego, la API y los WebSocket. Así no hay CORS entre dominios y hay un solo certificado.

**1. Servidor y dominio**
1. Crea un servidor en Hetzner Cloud: CX23, Ubuntu 24.04, con tu clave SSH y una IPv4.
2. En tu proveedor de dominio, crea un registro **A** `juego.tudominio.es` → IP del servidor. Comprueba que resuelve con `dig +short juego.tudominio.es`.

**2. Preparar la máquina** (por SSH)
```bash
sudo apt update && sudo apt -y upgrade
sudo apt -y install docker.io docker-compose-v2 ufw unattended-upgrades
sudo ufw allow OpenSSH && sudo ufw allow 80/tcp && sudo ufw allow 443/tcp && sudo ufw allow 443/udp && sudo ufw enable
sudo usermod -aG docker $USER && newgrp docker
git clone git@github.com:TU_USUARIO/mystery-action-online.git && cd mystery-action-online/deploy
cp .env.example .env && chmod 600 .env && nano .env
```
Rellena `DOMAIN`, `ACME_EMAIL`, `AUTH_SECRET` (`openssl rand -base64 48`) y `POSTGRES_PASSWORD` (`openssl rand -hex 24`). Si el repositorio es privado, añade antes una clave de despliegue de GitHub a la máquina.

**3. Arrancar**
```bash
docker compose up -d --build        # construye el servidor y la imagen web (Caddy + cliente) y arranca todo
docker compose ps                   # web, server y db en «running (healthy)»
docker compose logs -f server       # registros JSON del servidor
curl -s https://juego.tudominio.es/api/ready
```
- Caddy obtiene el certificado de Let's Encrypt la primera vez. Para eso los puertos 80 y 443 tienen que estar abiertos y el DNS tiene que apuntar ya a la máquina.
- El puerto 2567 **no** se publica: solo Caddy habla con el servidor. PostgreSQL tampoco se expone.

**4. Mantenimiento**
- Copias de la base de datos: apartado 9.
- `unattended-upgrades` instala solo las actualizaciones de seguridad del sistema.
- Las imágenes de Docker se renuevan con `docker compose pull && docker compose up -d --build`.

## 7. Opción C: gestionada de pago (Fly.io + Cloudflare Pages)

1. Instala `flyctl`, crea la cuenta (pide tarjeta tras la prueba) y entra con `fly auth login`.
2. Desde la raíz del proyecto:
   ```bash
   fly launch --no-deploy --copy-config        # usa fly.toml; elige un nombre de app libre
   fly volumes create mystery_data --size 1 --region cdg   # París; Fly.io retiró la región de Madrid
   fly secrets set AUTH_SECRET="$(openssl rand -base64 48)" CLIENT_ORIGIN="https://TU-PROYECTO.pages.dev"
   fly deploy
   curl -s https://TU-APP.fly.dev/api/ready
   ```
   La región es París (`cdg`): Fly.io retiró Madrid. `fly.toml` mantiene **una máquina siempre encendida** (`auto_stop_machines = "off"`, `min_machines_running = 1`), con SQLite en el volumen `/data` y 30 s para cerrar ordenadamente al desplegar.
3. No escales a más de una máquina: las salas están en la memoria de cada proceso.
4. Publica el cliente como en la opción A, paso 3, con `SERVER_URL=https://TU-APP.fly.dev`.

## 8. HTTPS y WebSockets seguros

| Medida | Dónde |
|---|---|
| TLS en el proxy (Caddy con Let's Encrypt, o Render/Fly/Cloudflare). `http://` redirige a `https://` | `deploy/Caddyfile`, `force_https` en `fly.toml`, plataformas |
| El SDK usa `wss://` automáticamente si la dirección del servidor es `https://` | Cliente |
| La compilación rechaza un `SERVER_URL` con `http://` (salvo `localhost`) | `tools/build-client.mjs` |
| Si una página `https://` intenta usar un servidor `http://`, el jugador ve un aviso que lo explica | `session.js` |
| En producción el servidor exige `CLIENT_ORIGIN` con `https://` y no arranca sin `AUTH_SECRET` (≥ 32 caracteres) ni con perfiles en memoria | `server/src/config.js` |
| **WebSocket solo desde el origen del juego:** el handshake de otra página se rechaza con 403 y queda registrado | `verifyClient` en `server/src/app.js` |
| **CORS solo para `CLIENT_ORIGIN`**, tanto en la API como en `/matchmake` (Colyseus permite cualquier origen por defecto) | `server/src/app.js`, `http/api.js` |
| El token de sesión viaja en la cabecera `Authorization` o en el cuerpo de la petición HTTPS, **nunca en la URL del WebSocket** | `session.js` |
| Mensajes de WebSocket limitados a 4 KB (los del juego ocupan ~120 bytes); entradas validadas y con cola limitada | `app.js`, `protocol.js` |
| La IP real del jugador se toma de `X-Forwarded-For` solo con `TRUST_PROXY=1` (detrás de un proxy), para los límites de intentos | `clientIp` en `app.js` |
| Cabeceras: CSP (el juego solo puede conectar con su servidor), HSTS, `nosniff`, sin marcos ajenos, sin cámara ni micrófono | `_headers` (Pages), `Caddyfile` |
| El servidor corre sin privilegios (`USER node`) y la imagen no lleva `.env`, datos ni pruebas | `Dockerfile`, `.dockerignore` |
| Secretos solo en variables de entorno o en el gestor de la plataforma, nunca en el repositorio | `.env.example`, `render.yaml`, `fly secrets` |

**Comprobación de la IP real.** Tras desplegar, mira en los registros la línea `http` de un inicio de sesión fallido: el campo `ip` debe ser la IP pública de tu conexión. Si todas las peticiones muestran la misma IP interna, tu plataforma tiene dos saltos de proxy: pon `TRUST_PROXY=2`.

## 9. Errores, desconexiones, registros y copias de seguridad

**Lo que ve el jugador**

| Situación | Qué ocurre |
|---|---|
| Servidor dormido o caído | «No se puede conectar con el servidor (…)» con botón «Reintentar» |
| Corte de red breve | El personaje queda dormido (quieto e invulnerable) `RECONNECT_SECONDS` segundos. Los demás ven la cuenta atrás. El SDK reconecta solo |
| Corte largo (el SDK se rinde) | «Conexión perdida». En cuanto vuelve la red se reintenta solo (y cada 4 s mientras dure el sitio guardado); también con «Reintentar» |
| Cambio de dispositivo o recarga sin token | «Volver a mi grupo» recupera el mismo asiento |
| Reinicio del servidor (despliegue) | Expedición «interrumpida»: cada uno conserva lo conseguido, sin pérdidas. Aviso «El servidor se está reiniciando» |
| Fallo en la simulación de una sala | Solo esa sala termina («interrumpida», con lo conseguido guardado). El resto de grupos sigue |
| El anfitrión cede el liderazgo | «ceder liderazgo» junto al nombre de otro integrante conectado |
| El anfitrión pierde la conexión | Tras `HOST_GRACE_SECONDS` (10 s) el liderazgo pasa al conectado más antiguo; si vuelve antes, lo conserva. La sala y la expedición siguen en el servidor |
| La anfitriona abandona | El liderazgo pasa al conectado más antiguo al momento y la expedición sigue |

**Registros.** Una línea JSON por suceso en la salida estándar. No se escriben tokens, contraseñas ni secretos: esas claves se ocultan siempre.

```
{"t":"…","level":"info","msg":"room.start","room":"Hx…","code":"K7P2QZ","dungeon":"bosque","players":4,"expedition":"…"}
```

| Mensaje | Significado |
|---|---|
| `server.listening` / `server.ready` / `server.shutdown` | Arranque (puerto, orígenes, proxy, ventana de reconexión) y cierre |
| `room.create` · `room.join` · `room.join_rejected` (con el código de error) · `room.start` · `room.end` · `room.dispose` | Vida de una sala |
| `room.drop` · `room.reconnect` · `room.takeover` · `room.leave` · `room.host_transfer` (`reason`: manual, drop, leave) · `room.options` | Conexiones, liderazgo y opciones de expedición |
| `reward.saved` | Recompensa guardada (`applied:false` = repetida y descartada) |
| `http` | Peticiones con error (4xx/5xx): método, ruta, estado, duración e IP |
| `ws.origin_rejected` | WebSocket desde otra página |
| `room.sim_error` · `room.commit_failed` · `http.error` · `db.ping` · `process.unhandled_rejection` | Errores que revisar |

Cómo verlos en cada plataforma:
- **VPS:** `docker compose logs -f server`. Docker rota los registros a 5 × 10 MB. Para filtrar: `docker compose logs server | grep '"level":"error"'`.
- **Fly:** `fly logs`.
- **Render:** pestaña «Logs».

Con `LOG_LEVEL=debug` también se registran las peticiones correctas.

**Salud y reinicios**
- `GET /api/health` (vida del proceso) lo usan Docker, Render y Fly para reiniciar el servidor si deja de responder.
- `GET /api/ready` comprueba además la base de datos: úsalo para alertas externas, como un servicio gratuito de monitorización que llame cada 5 min.
- Si la configuración es errónea, el servidor sale con el código 78 y un mensaje claro, sin bucles de arranque silenciosos.
- `SIGTERM` (despliegue o reinicio) cierra las salas guardando todo y sale con 0.

**Copias de seguridad**
- **PostgreSQL en el VPS.** Copia diaria con `cron` del usuario y conserva las de los últimos 14 días:
  ```bash
  mkdir -p ~/backups
  crontab -e     # y añade la línea siguiente:
  15 4 * * * cd ~/mystery-action-online/deploy && docker compose exec -T db pg_dump -U mystery mystery | gzip > ~/backups/perfiles-$(date +\%F).sql.gz && find ~/backups -name 'perfiles-*.sql.gz' -mtime +14 -delete
  ```
  Restaurar: `gunzip -c ~/backups/perfiles-FECHA.sql.gz | docker compose exec -T db psql -U mystery mystery`. Guarda también alguna copia fuera de la máquina.
- **SQLite (Fly).** `fly ssh console -C "node server/scripts/backup-sqlite.mjs"` hace una copia coherente en caliente en `/data/backups` (conserva 14). Fly también hace instantáneas automáticas del volumen: comprueba su retención en tu panel.
- **Neon.** Tiene historial propio según el plan; exporta con `pg_dump "$DATABASE_URL"` desde tu equipo cuando quieras.

## 10. Publicar una versión nueva

1. En tu equipo: edita el prototipo, ejecuta `npm run split`, luego `npm test && npm run test:colyseus && npm run test:deploy`, y haz commit y push.
2. Despliega:
   - **Opción A:** Render y Cloudflare Pages despliegan solos al hacer push.
   - **Opción B:** `git pull && docker compose up -d --build`.
   - **Opción C:** `fly deploy` y push para el cliente.
3. Al reiniciar el servidor, las expediciones en curso terminan como «interrumpidas» con todo guardado. Despliega cuando nadie esté jugando, o avisa antes.
4. Las tablas solo crecen con migraciones nuevas en `server/db/migrations` (se aplican al conectar). Nunca borres columnas que use una versión anterior mientras convivan.

## 11. Lista de comprobación desde dos redes distintas

Necesitas dos personas o dos dispositivos **en redes diferentes**. Por ejemplo: tu ordenador con la wifi de casa y un móvil **con los datos móviles** (wifi apagada), o un amigo en su casa. El mismo wifi no sirve: no demuestra que funcione por Internet.

**Antes de empezar**
- [ ] En **cada** ordenador: `npm run check:server -- https://TU-SERVIDOR` termina con «✔ Todo correcto desde este ordenador»: HTTPS, salud, base de datos, WebSocket seguro y latencia. Si algo falla, el mensaje dice por qué.
- [ ] `https://TU-SERVIDOR/api/ready` responde `{"ok":true,…,"db":"ok"}` desde el móvil con datos móviles.
- [ ] La página del juego abre con el candado (HTTPS), sin avisos de certificado.
- [ ] `http://…` (sin la s) redirige a `https://…`.

**Cuentas y sala**
- [ ] En los dos dispositivos: «Cooperativo online» → crear cuenta (o invitado) → elegir criatura distinta en cada uno.
- [ ] Dispositivo 1: «Crear partida privada» → aparece un código de 6 caracteres.
- [ ] Dispositivo 1: «copiar enlace de invitación» y enviarlo. En el dispositivo 2 (otra red), al abrir el enlace aparece el menú con el código ya escrito.
- [ ] Dispositivo 2: «Unirse a partida» → los dos ven a los dos integrantes con su nombre y su criatura.
- [ ] El anfitrión cambia la mazmorra o «Si alguien pierde la conexión, esperar»: el otro lo ve y tiene que volver a marcar «Estoy listo».
- [ ] «ceder liderazgo» y devolverlo: el botón «Iniciar expedición» cambia de pantalla.
- [ ] Un código inventado da «No hay ninguna sala abierta con ese código».
- [ ] El dispositivo 2 marca «Estoy listo» y el 1 pulsa «Iniciar expedición».

**Partida**
- [ ] Los dos ven la misma mazmorra y se ven moverse con fluidez.
- [ ] Atacad al mismo enemigo: los dos ven bajar su barra de vida y desaparece a la vez en ambos.
- [ ] Cada uno recoge objetos y monedas: solo los recibe quien los coge.
- [ ] Los dos tenéis que llegar a la escalera para bajar de piso.

**Desconexiones**
- [ ] En el móvil, activa el modo avión 10 s y desactívalo. El otro ve «sin conexión (… s)» y después el móvil vuelve solo a la partida.
- [ ] Recarga la página en el dispositivo 2 en plena expedición: vuelve al mismo personaje («Volver a mi grupo» si hiciera falta).
- [ ] Opcional: abre la misma cuenta en un tercer dispositivo y pulsa «Volver a mi grupo» → «Recuperar aquí». El anterior muestra «Has recuperado esta partida en otro dispositivo».
- [ ] El anfitrión cierra el navegador en plena expedición: a los 10 s el otro pasa a ser el anfitrión y sigue jugando en la misma mazmorra.
- [ ] «Abandonar grupo» en uno: el otro sigue jugando y pasa a ser el anfitrión.
- [ ] Prueba sin segunda persona: en el otro ordenador, `npm run check:server -- https://TU-SERVIDOR --join CÓDIGO` entra como jugador de prueba y marca «Estoy listo». Inicia la expedición y muévete: el comprobador dice si te ve moverte.

**Después**
- [ ] Terminad o abandonad la expedición: cada uno ve su resultado. Al volver a entrar, el nivel, las monedas y los objetos de cada uno son los suyos.
- [ ] En los registros del servidor aparecen `room.join` ×2, `room.start`, `reward.saved` ×2 y ningún `"level":"error"`. El campo `ip` de las líneas `http` muestra IP públicas distintas para cada red.
- [ ] Rendimiento con datos móviles: si notas tirones, anota el valor de `MysteryLobby.session.rtt`, en milisegundos, desde la consola del navegador.

Cuando todo esto funcione desde las dos redes, el juego está online de verdad.

## 12. Crear una sala privada y que tus amigos se unan

**Quien crea la sala (anfitrión)**
1. Abre la dirección del juego (p. ej. `https://TU-PROYECTO.pages.dev` o `https://juego.tudominio.es`).
2. Pulsa **«Cooperativo online»**.
3. Pulsa **«Crear cuenta»** con usuario y contraseña, para usarla desde cualquier dispositivo, o **«Probar como invitado»**, que solo sirve en este navegador.
4. La primera vez, elige tu clase: Guerrero, Arquero, Mago o Asesino.
5. Elige la mazmorra y pulsa **«Crear partida privada»**. El servidor crea la sala; tu navegador solo la controla.
6. Aparece el **código de invitación**, 6 letras y números (p. ej. `K7P2QZ`). Pulsa **«copiar enlace de invitación»** y envíaselo a tus amigos: al abrirlo, el código ya aparece escrito. También puedes enviar solo el código y la dirección del juego.
7. Como anfitrión eliges las **opciones de expedición**: la mazmorra y cuánto tiempo se guarda el sitio a quien pierda la conexión (de 30 s a 5 min, según lo que permita el servidor). Si quieres que lleve el grupo otra persona, pulsa **«ceder liderazgo»** junto a su nombre.

**Cada amigo (hasta 3)**
1. Abre la misma dirección, pulsa «Cooperativo online», entra con su cuenta y elige su criatura.
2. Si abrió el enlace, el código ya está escrito; si no, lo escribe (da igual en mayúsculas o minúsculas). Pulsa **«Unirse a partida»**.
3. Pulsa **«Estoy listo»**.

**Empezar**
- El anfitrión ve la lista con los nombres y las criaturas. Cuando todos están listos y conectados, pulsa **«Iniciar expedición»**.
- A partir de ahí la sala se cierra a gente nueva. Quien pierda la conexión puede volver a su sitio durante el tiempo elegido por el anfitrión. Si el anfitrión se desconecta, a los 10 s otro jugador pasa a ser el anfitrión y la partida sigue.

**Si algo falla**

| Mensaje | Qué hacer |
|---|---|
| «La sala está llena» | Ya hay 4 personas |
| «Ese grupo ya ha empezado la expedición» | Esperad a la siguiente |
| «No se puede conectar con el servidor» | Si usáis la opción A y nadie había jugado, espera un minuto (el servidor se está despertando) y pulsa «Reintentar» |
| «Ya estás en otro grupo» | Esa cuenta tiene un grupo abierto: usa «Volver a mi grupo» o «Abandonar grupo» |

## 13. Qué se ha probado y qué no

**Probado en el entorno de preparación, con Colyseus 0.18 compilado desde su código fuente oficial (npm estaba bloqueado):**

| Prueba | Qué comprueba | Resultado |
|---|---|---|
| `tests/deploy/prod-smoke.test.mjs` | El proceso real `node server/src/index.js` con `NODE_ENV=production`, en SQLite y en PostgreSQL 16: rechaza configuraciones inseguras (código 78); `/api/health` y `/api/ready`; CORS y WebSocket rechazan otros orígenes (403); IP real tras el proxy en los límites de intentos; registros JSON sin tokens ni secretos; `SIGTERM` en plena expedición (cada jugador recibe «interrumpida», todo guardado, salida 0) y progreso intacto al volver a arrancar | Pasa |
| `tests/deploy/image-layout.test.mjs` | Solo lo que copia el `Dockerfile`: comprobación de reglas, arranque en producción, la orden del `HEALTHCHECK` y la copia en caliente de SQLite | Pasa |
| `tests/deploy/tls_e2e.py` | Dos navegadores por **HTTPS y wss://** a través de un proxy TLS (certificado autofirmado) que reproduce el `Caddyfile`, con el cliente compilado para producción: redirección a HTTPS; CSP, HSTS y demás cabeceras **activas y sin errores**; todo el juego por `wss://` sin el token en la URL; sala por código; juego simultáneo; reconexión tras un corte de red; aviso de configuración `http://` | 12/12 |
| `tests/colyseus/host.test.mjs` | Opciones de expedición validadas (solo el anfitrión); cesión del liderazgo; traspaso cuando el anfitrión se desconecta (en la sala de espera y jugando) y conservación si vuelve a tiempo; `check:server` ejecutado como un segundo ordenador (entra, se prepara y ve moverse a la anfitriona) | 4/4 |
| `tests/colyseus/browser_host_e2e.py` | Dos navegadores: enlace de invitación, «Unirse a partida» con el código escrito, opciones, ceder liderazgo, cada uno con su Pokémon, y cada uno ve moverse al otro | 13/13 |
| Suites anteriores | Grupos, combate con 4 clientes y 4 navegadores, persistencia, cuentas | Todas pasan |

**Sin probar aquí:**
- `npm install` con los paquetes publicados.
- La construcción de las imágenes Docker (el registro de Docker estaba bloqueado).
- Caddy real con Let's Encrypt.
- Render, Fly.io, Neon y Cloudflare Pages.
- Conexiones desde redes reales distintas.

Todo eso lo cubren los apartados 3 y 11.

## 14. Fuentes

Consultadas el 23 de octubre de 2026.

- Render, plan gratuito: <https://render.com/docs/free> · WebSockets mantienen activo el servicio gratuito: <https://render.com/changelog/free-web-services-now-remain-active-while-receiving-websocket-messages>
- Fly.io, precios: <https://docs.fly.io/about/pricing> · consolidación de regiones (Madrid retirada): <https://fly.io/blog/the-region-consolidation-project/>
- Render, especificación de Blueprint (`runtime: docker`, `plan: free` 0,1 CPU/512 MB, `generateValue`, `sync: false`): <https://render.com/docs/blueprint-spec>
- Neon, precios: <https://neon.com/pricing>
- Cloudflare Pages, límites: <https://developers.cloudflare.com/pages/platform/limits>
- Railway, planes: <https://docs.railway.com/pricing/plans>
- Hetzner, subida de precios de junio de 2026: <https://privatedevops.com/news/hetzner-june-2026-cloud-price-increase-what-to-do> · IPv4: <https://docs.hetzner.com/general/infrastructure-and-availability/ipv4-pricing>
- Colyseus, despliegue (proxy, WebSocket, `fork` y no `cluster`, cierre ordenado): <https://docs.colyseus.io/deployment/>
