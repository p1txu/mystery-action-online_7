# Mystery Action: plan de integración del cooperativo online (hasta 4 jugadores)

Este documento explica qué hay que cambiar en el motor, cómo se reparte el proyecto, qué se instala y en qué estado está cada parte.

Los personajes y los nombres del juego son originales: cuatro clases de fantasía medieval (Guerrero, Arquero, Mago, Asesino) con sprites propios; los enemigos son criaturas originales. Ver `docs/CLASES.md`.

## 1. Punto de partida

- **El juego es un único HTML.** `prototype/mystery-action.html` es el artefacto de Claude, con unas 6 800 líneas (HTML, CSS y JavaScript clásico).
- **Todo corre en el navegador.** El juego usa Canvas 2D, un paso fijo de 120 Hz y guarda la partida en `localStorage`.
- **La partida guardada** lleva un sobre con suma de comprobación y una copia de seguridad.
- **El código está numerado por secciones.** Las secciones 1 a 18 contienen las reglas: configuración, mundo, especies, combate, movimientos, actores, enemigos, catálogos, guardado y generador de pisos. Las secciones 19 a 25 se ocupan del piso en juego, la aldea, el sonido, el dibujo, la interfaz y el bucle principal.

**Hallazgo clave.** Las reglas no tocan el DOM ni el canvas al cargarse.

- El tramo de reglas (secciones 1 a 18, más la 21 y la 22) se ejecuta en Node tal cual, en modo estricto. No hay que reescribirlo.
- `FloorGen.generate(semilla, mazmorra, piso, tipo)` es determinista. El servidor solo envía la semilla y cada cliente genera el mismo piso.
- Una prueba compara el navegador con Node y obtiene la misma firma de reglas y los mismos 15 pisos.

## 2. Restricción de este entorno y cómo se probó Colyseus

En la sesión de trabajo, el registro de npm está bloqueado por política de red (error 403 al conectar con `registry.npmjs.org`). GitHub sí es accesible. Por eso:

- **Colyseus se compila desde su código fuente oficial** en GitHub, fijado por commit: core 0.18.8, schema 5.0.42 y SDK 0.18.2, más sus dependencias de ejecución (`tests/vendor/sources.json`).
- `tests/vendor/build-colyseus.mjs` lo compila tal cual con esbuild. Solo se sustituye `express`, que Colyseus importa pero solo usa con la opción `express` de `defineServer`, y este proyecto no la usa. Un cargador de Node hace que `import 'colyseus'` apunte a ese build.
- **Las pruebas multijugador usan ese Colyseus real**: el servidor de verdad (`server/src/app.js`), salas, sincronización de estado, emparejamiento por HTTP y reconexión. Los clientes son el SDK real, en Node y en navegadores.
- Con `npm install` en un entorno normal se usan los paquetes publicados y ese build no hace falta (`tests/run-all.sh` lo detecta).
- El cliente de PostgreSQL (`pg`) se compila igual desde GitHub y se prueba contra un PostgreSQL 16 local y desechable (`tests/pg/start-postgres.sh`).
- El cliente se compila con esbuild (`tools/build-client.mjs`), la misma ruta que usan las pruebas. Ya no se usa Vite.

No se ha supuesto ningún servidor desplegado ni se incluyen credenciales.

## 3. Partes del motor que se adaptan

Todos los cambios del prototipo son enganches de una línea. Están protegidos por `g.net`, que vale `null` en el juego local, así que en local no cambia nada: las 236 pruebas anteriores del juego siguen pasando.

| Dónde (prototipo) | Cambio | Por qué |
|---|---|---|
| `Combat.hit` | En línea devuelve `net.localHit()`: solo hace efectos y no resta PS | El daño lo calcula el servidor |
| `Projectile.update` | Los disparos con `net` solo avanzan | Son disparos de enemigos enviados por el servidor; no colisionan en el cliente |
| `Player.tryBasic / tryMove / tryDodge` | Si la acción sale bien, se llama a `net.action(tipo, i, apuntado)` | El servidor la repite con sus propias reglas de enfriamiento, cargas y energía |
| `FloorRT.spawnInitial` | No crea enemigos en línea | Los enemigos son del servidor |
| `FloorRT.update` | En línea solo hace exploración (revelar salas) | Botín, cofres, escalera, viento y hoguera los decide el servidor |
| `Game.update` | Antes de mover al jugador, `net.sample(eje)`; después, `net.afterPlayer()` | Se muestrea la entrada en el mismo paso que el servidor y se guarda el historial para corregir la predicción |
| `Game.separateActors` | Los jugadores remotos no se empujan | El servidor tampoco empuja a unos jugadores contra otros |
| `useStack`, `endRun`, `onPlayerDown` | En línea: usar un objeto lo valida el servidor; «Abandonar grupo» (el antiguo «Rendirse») envía `leave`; la caída la decide el servidor | Autoridad del servidor |
| `equip / unequip / dropItem / openMoves` | Bloqueados en línea, con un aviso | El servidor no los simula aún (fase 1) |
| `Game.net` | Propiedad nueva (`null`) | Interruptor del modo online |
| **Sección 26 nueva** | `NetPlay`, `RemotePlayer`, `NetEnemy`, `NetZone` | Predicción, corrección, interpolación, botín y objetos del piso según el estado recibido |

**Cambios en el servidor (sin tocar el prototipo).**

- **`engine.js`** envuelve `Combat.hit` para que, durante un golpe, `g.player` sea el jugador golpeado. Así cada uno recibe su invulnerabilidad y su caída se registra.
- **El objeto `g` mínimo** del servidor tiene listas, `getAim` por acción y ganchos `onEnemyDown` y `onPlayerDown`.
- **`stepWorld`** reproduce el orden de `Game.update`.

**Lo que no cambia.** Siguen igual `FloorGen`, `MOVES`, `ENEMIES`, la IA de enemigos y jefes, `Loot`, `Inventory`, `Save.sanitize`, las estadísticas, la experiencia y la evolución. Se usan las mismas funciones en cliente y servidor.

## 4. Arquitectura: cinco partes separadas

```
 NAVEGADOR (client/)                                  SERVIDOR (server/)
┌──────────────────────────────┐   WebSocket   ┌──────────────────────────────────────────────┐
│ 1. CLIENTE DE JUEGO          │◀────────────▶│ 2. SERVIDOR MULTIJUGADOR (Colyseus 0.18)       │
│  public/game.js = prototipo  │  entradas →  │  rooms/ExpeditionRoom.js  sala privada, 4 máx. │
│  sección 26 NetPlay          │  ← estado    │  rooms/schema.js          estado sincronizado  │
│  src/net/session.js (SDK)    │  ← eventos   │        │                                       │
│  src/net/lobby.js (menú)     │              │        ▼                                       │
└───────────┬──────────────────┘              │ 5. ESTADO TEMPORAL DE EXPEDICIÓN               │
            │ HTTPS (JSON)                    │  sim/Expedition.js  simulación autoritativa    │
            ▼                                 │  sim/engine.js      reglas del prototipo       │
┌──────────────────────────────┐              │  (solo vive en memoria mientras dura la sala)  │
│ 3. IDENTIDAD Y PERFILES      │              └───────────────┬────────────────────────────────┘
│  http/api.js   /api/...      │                              │ al terminar: resultados
│  identity/     tokens HMAC   │◀─────────────────────────────┘
└───────────┬──────────────────┘
            ▼
┌──────────────────────────────┐
│ 4. PERSISTENCIA              │  base de datos: SqliteProfileStore (por defecto, archivo)
│  persistence/  profile/      │                 PostgresProfileStore (varios procesos)
└──────────────────────────────┘
       shared/ : engine-core.generated.js (reglas) + protocol.js (mensajes y validación)
```

1. **Cliente de juego.** Es el prototipo sin cambios de comportamiento, más la capa de red. Dibuja, predice el movimiento propio e interpola el del resto. No decide nada.
2. **Servidor multijugador.** Gestiona las salas privadas con código, la sala de espera, la entrada en la sala, las desconexiones y el envío del estado.
3. **Identidad.** Cuentas con usuario y contraseña (para jugar desde cualquier dispositivo) e invitados (solo en ese navegador, convertibles en cuenta). Tokens firmados HMAC-SHA256 con versión de sesión. La sala solo usa `identity.verify(token)`.
4. **Persistencia.** Base de datos con cuentas, perfiles personales versionados, el libro de recompensas (una por expedición y jugador) y un registro de cambios. Ver el apartado 6.
5. **Estado temporal de la expedición.** Incluye pisos, enemigos, botín del suelo, monedas e inventario de la expedición. No se guarda nunca. Solo el **resultado** se escribe en el perfil, una vez por jugador.

## 5. Grupos privados

**Menú cooperativo** (título → «Cooperativo online»). Primero se entra como invitado y se elige qué partida se usa online. Después aparecen:

- **Jugar en solitario.** El juego local de siempre, sin servidor. Si estabas en un grupo, sales de él.
- **Crear partida privada.** Se elige la mazmorra y se crea la sala en el servidor. El creador es el **anfitrión**.
- **Unirse mediante código.** Se escriben los 6 caracteres que pasa el anfitrión.
- **Abandonar grupo.** Disponible dentro del grupo. En plena expedición también está en la pausa (sustituye a «Rendirse»): cuenta como retirada y el resto sigue jugando.

**La sala existe en el servidor** (`ExpeditionRoom`, sala de Colyseus). Lo que ven los jugadores es el estado sincronizado por Colyseus:

- **Datos por jugador:** nombre, criatura, nivel, anfitrión, listo, conectado y orden de llegada.
- **Datos del grupo:** código, máximo de plazas, mazmorra y fase.

**Crear.**

- El servidor genera un código único entre las salas existentes (sin 0/O ni 1/I).
- La sala es privada (`setPrivate`): no sale en ningún listado.
- Admite un máximo de 4 plazas.

**Sala de espera.**

- El anfitrión elige la mazmorra. Si la cambia, los demás vuelven a «no listo».
- El botón «Iniciar expedición» solo se activa cuando todos los demás están listos y conectados.
- Si el anfitrión se va, el papel pasa a quien lleva más tiempo en el grupo.
- Si el grupo se vacía, el código deja de existir.

**Validaciones al unirse.** La API (`GET /api/rooms/:código`) y la sala (`onAuth`) responden con un código `ERR.*` y un mensaje comprensible (`shared/protocol.js`):

| Comprobación | Código | Mensaje |
|---|---|---|
| Sesión válida (token firmado y cuenta existente) | 4401 | «Tu sesión no es válida o ha caducado…» |
| El código existe | 4404 | «No hay ninguna sala abierta con ese código…» |
| La sala no está llena | 4409 | «La sala está llena (4 de 4).» |
| La expedición no ha empezado | 4423 | «Ese grupo ya ha empezado la expedición…» |
| La misma cuenta no está ya en la sala | 4410 | «Ya estás dentro de esta sala…» |
| La cuenta no está en otro grupo | 4411 | «Ya estás en otro grupo…» |
| Tiene partida en el servidor | 4412 | «Necesitas una partida en el servidor…» |
| Misma versión del protocolo | 4426 | «Tu versión del juego no coincide…» |

- **Entradas simultáneas.** La comprobación de plaza y de duplicados y la reserva se hacen juntas, sin esperas entre medias. Así, dos entradas a la vez no pueden colarse.
- **Entradas a medias.** Una entrada que falla después de `onAuth` libera su reserva en `onLeave`.

**Los datos personales no se pueden sustituir.**

- El nombre sale de la cuenta del token. La criatura y la partida salen del perfil del servidor de esa misma cuenta.
- Las opciones que manda el cliente al entrar no se usan para nada de eso. La prueba intenta colar otro nombre, otra criatura, otra partida y el `sessionId` del anfitrión, y no cambia nada.
- Cada mensaje solo afecta a quien lo envía.
- El anfitrión solo puede elegir la mazmorra y empezar; no puede marcar a otros como listos.
- Cada jugador recibe en `welcome` **solo su** partida. El estado común no lleva partidas, solo nombre, criatura y nivel.

**Estados de la conexión en el cliente** (`client/src/net/session.js`):

- **Flujo normal:** sin conexión → conectando con el servidor → conectado → entrando en el grupo → en el grupo → en expedición.
- **Si se corta la red:** pasa a «reconectando». El SDK reintenta solo hasta 15 veces y el servidor guarda el sitio 45 s.
- **Si se agotan los reintentos:** «conexión perdida», con el botón **Reintentar** (usa el token de reconexión).
- **Cualquier otro fallo** (servidor caído, código, sala llena…) muestra su mensaje y «Reintentar» cuando tiene sentido repetir.
- **Recarga de la página:** si se recarga en mitad de un grupo, se vuelve a él con el token guardado en `sessionStorage`.

## 6. Persistencia individual

Cada persona tiene **un** perfil personal en el servidor. Juega con él en solitario y en grupo, desde cualquier dispositivo, y no lo pierde ni lo comparte.

### Tres tipos de datos

| Tipo | Dónde vive | Qué contiene | Quién lo cambia |
|---|---|---|---|
| **1. Perfil personal** | Base de datos, tabla `profiles` (una fila por cuenta, con versión) | Identificador de usuario; criatura (especie actual, línea y evoluciones); nivel y experiencia; estadísticas (se calculan a partir de nivel y equipo); movimientos aprendidos y equipados; inventario y equipo; monedas; compañeros; misiones (aceptadas, tablón y entregadas); rango, mazmorras completadas y expediciones | Solo el servidor, con las reglas del juego |
| **2. Expedición compartida** | Memoria de la sala (`Expedition.shared()`); nunca se guarda | Semilla y piso, enemigos, estado del jefe, objetos del suelo, cofres y avance del grupo por la mazmorra | La simulación del servidor |
| **3. Recompensas individuales** | `m.rewards` durante la expedición; al terminar, en la tabla `rewards` y en el perfil de **cada** jugador | Experiencia por participación, monedas y objetos que recogió cada uno, misiones que avanzó, enemigos derrotados y daño hecho | El servidor, una sola vez por (expedición, jugador) |

`GET /api/profile` devuelve la partida y su **ficha** (`summary`) con todos esos campos.

### Al unirse a una sala

- Cada jugador entra con **su** perfil, leído de la base de datos con **su** token.
- Al empezar la expedición se vuelve a leer de la base de datos y cada integrante recibe una **copia propia**: nada se comparte por referencia.
- El anfitrión solo aporta la sala. Su criatura, nivel, inventario y estadísticas no se copian a nadie.
- Una prueba comprueba que la copia de cada uno es un objeto distinto, que el estado compartido no contiene datos de ningún perfil y que el objeto recibido no se modifica.

### Guardado seguro

- **El cliente no puede escribir su perfil.**
  - No hay ninguna ruta para enviar nivel, monedas o inventario.
  - Subir una partida local está **desactivado**. Solo se puede activar en desarrollo con `ALLOW_PROFILE_IMPORT=true`, y en producción no se puede.
- **Los cambios de la aldea se piden** con `POST /api/profile/op { op, args, version }`. Son: `buy`, `sell`, `discard`, `equip`, `unequip`, `setMoves`, `craft`, `appraise`, `evolve`, `rest`, `setActive`, `release`, `acceptJob`, `cancelJob` y `deliverJob`.
  - El servidor los aplica en una transacción con `server/src/profile/rules.js`. Son las mismas reglas que el juego local; `tests/e2e/rules_parity.py` compara las 12 operaciones deterministas con el prototipo y salen idénticas.
  - Los argumentos extra se ignoran (por ejemplo, un `price: 0`). Las operaciones desconocidas se rechazan.
  - Si la versión que envía el cliente no es la actual, responde 409 con la copia buena para resincronizar.
- **En el navegador, con la cuenta activa** (`Game.account`):
  - El perfil es el del servidor y nada se guarda en `localStorage` (`Save.readOnly`).
  - Cada acción de la aldea se envía al servidor y se adopta lo que devuelve.
  - Si se edita la partida desde la consola, el siguiente cambio la sustituye por la copia del servidor.
- **La partida local** del navegador queda intacta para jugar sin conexión. Es independiente del perfil online.
- **Mientras se está en un grupo**, el perfil no se puede tocar. En la sala, un tipo de mensaje que el servidor no conoce hace que Colyseus cierre esa conexión.
- **Registro de cambios.** Cada cambio queda apuntado en `profile_events`.

### Cuentas

- **Usuario y contraseña** (`/api/auth/register`, `/api/auth/login`).
  - Contraseñas con scrypt y sal propia.
  - Límite de intentos fallidos por usuario y por dirección.
  - Errores comprensibles.
- **Invitado.** El token solo vive en ese navegador, pero el progreso está en el servidor. «Guardar mi progreso con usuario y contraseña» (`/api/auth/upgrade`) lo convierte en cuenta sin perder nada.
- **Cerrar sesión en todos los dispositivos** (`/api/auth/logout`) sube la versión de sesión y anula todos los tokens.

### Recompensas y duplicados

- **Experiencia por participación.**
  - Quien hace daño a un enemigo (incluido el golpe final) recibe toda su experiencia, calculada con `expYield` según **su** nivel.
  - Quien está a menos de 10 casillas, despierto y sin golpear, la mitad.
  - Quien está lejos, caído o desconectado, nada.
- **Recompensas individuales.** Monedas y objetos son de quien los recoge. Las misiones avanzan en el perfil de quien caza, recoge, explora o termina. El tablón se renueva como en `Game.endRun`.
- **Sin duplicados, con tres protecciones:**
  - la sala apunta qué cuentas ya cobraron;
  - un segundo final no hace nada;
  - en la base de datos, la clave primaria `(expedition_id, account_id)` de `rewards` hace que un reintento devuelva la recompensa ya guardada sin volver a aplicarla.
- **Si alguien se reconecta** después del final, recibe el **mismo** resultado (`duplicate`) y el cliente no lo muestra dos veces.
- **Abandono.**
  - Quien abandona conserva su nivel, su experiencia y sus movimientos.
  - Pierde, según las reglas de retirada, las monedas de esa expedición y la mitad de las casillas del inventario.
  - Su resultado se guarda en ese momento y los demás siguen.

### Base de datos

- **`SqliteProfileStore` (por defecto).**
  - Archivo `DATA_DIR/mystery-action.db`, con el módulo `node:sqlite` incluido en Node 22.13 o posterior; no necesita dependencias.
  - Modo WAL y transacciones `begin immediate`.
  - Los perfiles sobreviven a reinicios: una prueba apaga el servidor y arranca otro proceso con el mismo archivo.
- **`PostgresProfileStore`.** Para varios procesos o copias de seguridad gestionadas (`PROFILE_STORE=postgres`, `DATABASE_URL`).
  - Aplica `db/migrations/001_init.sql` al conectar.
  - Bloquea la fila con `select … for update`.
  - **Probado contra PostgreSQL 16 real**, con el mismo contrato (incluida la idempotencia con recompensas simultáneas) y la batería de persistencia de Colyseus.
- **`MemoryProfileStore`.** Solo para pruebas; no se permite en producción.

## 7. Combate en tiempo real (mundo compartido)

Hay una única versión autoritativa del mundo: la `Expedition` de la sala. Los clientes solo envían intenciones y dibujan lo que dice el servidor.

### Qué ven todos los integrantes

| Elemento | Cómo llega | Dónde |
|---|---|---|
| Distribución de la mazmorra | El servidor genera la semilla y envía `floor`. Cada cliente regenera el piso con `FloorGen` (mismas casillas que el servidor; se comprueba en las pruebas) | `Expedition.loadStep` |
| Posiciones y orientación de los demás | Estado (20 Hz), interpolado con 100 ms de retraso | `PlayerState`, `RemotePlayer` |
| Movimientos y animaciones de los demás | Evento `cast` con id único; el cliente repite la animación del ataque (solo visual) | `Expedition.act`, `NetPlay.onEvent` |
| Enemigos compartidos y sus barras de vida | Estado: PS, nivel, élite, posición, estado de la IA | `EnemyState`, `NetEnemy` |
| Avisos de ataque de los enemigos | Estado: patrón, dirección (`ax`,`ay`) y punto objetivo (`gx`,`gy`), con lo que se dibuja el mismo aviso que en solitario. Al ejecutarse el ataque llega el evento `eatk` con id único | `Expedition.enemyAttacks` |
| Proyectiles y zonas de enemigos | Estado (`shots`, `zones`) | `ShotState`, `ZoneState` |
| Cofres | Estado (`opened`) y evento `chest` | `ObjectState` |
| Puertas de la cámara del tesoro | Estado (`doors`) y evento `door`. La abre el servidor cuando llega un jugador con una llave en **su** mochila; se gasta esa llave y las casillas pasan a pasillo para todos (también para los enemigos y los disparos) | `Expedition.tryDoor`, `NetPlay.openDoor` |
| Guardián | Estado propio `boss`: id, PS, fase 1/2, estado y patrón. Evento `bossPhase` una sola vez al bajar de la mitad | `BossState`, `Expedition.bossView` |

### Qué valida el servidor

- **Daño**: solo `Combat.hit` en el servidor. En línea, el `Combat.hit` del cliente no quita PS, solo dibuja el impacto.
- **Enfriamientos, cargas y energía**: los de `tryBasic`, `tryMove` y `tryDodge` del motor, ejecutados en el servidor.
- **Muertes y recompensas**: `onEnemyDown` está protegido con `netDone`. Un enemigo muere una vez y su experiencia y su botín se reparten una vez, aunque dos jugadores le den en el mismo paso. Los clientes nunca matan enemigos: un enemigo desaparece cuando deja de estar en el estado.
- **Ningún ataque se aplica dos veces**:
  1. Las muestras de entrada llevan número de secuencia. Un mensaje repetido se descarta.
  2. Cada acción lleva su propio número `n`, creciente por jugador (`a: [{ n, at, k, ... }]`). Una acción con un `n` ya visto se descarta (`stats.duplicates`), aunque llegue en un mensaje nuevo.
  3. Cada ataque aceptado genera un `aid` único (`sesión:n`). Los ataques de enemigos llevan `E<n>`. El cliente ignora un `aid` ya visto (`NetPlay.once`).
  4. Dentro de un ataque, el motor usa su propio conjunto de golpeados: cada objetivo recibe el golpe una vez.

### Predicción y corrección

- El jugador propio se mueve al instante con el mismo código del motor.
- El servidor devuelve `ack`. El cliente compara su posición en esa muestra con la del servidor:
  - por encima de 80 px, salta a la posición del servidor;
  - por encima de 24 px, corrige de golpe;
  - por debajo de 24 px, la diferencia se reparte en los fotogramas siguientes (constante de 0,12 s), aunque no lleguen parches nuevos.

  En las pruebas con cuatro navegadores la diferencia final fue de menos de **0,7 px**.

### Caídas, reconexión y liderazgo

- **Ventana configurable.** `RECONNECT_SECONDS` admite de 5 a 900 s; por defecto, 45. Se comunica en `welcome` y en el estado (`reconnectSeconds`). Todos ven `holdUntil` de quien se ha caído, con una cuenta atrás junto a su nombre.
- **Se conserva el grupo.** El personaje queda dormido: quieto, invulnerable y fuera de los objetivos de los enemigos. El resto sigue jugando y la mazmorra no se reinicia.
- **Sin duplicar al personaje.** Se vuelve siempre al **mismo asiento** con el token de reconexión de Colyseus:
  - Mismo navegador: el SDK reconecta solo, o «Reintentar» usa el token guardado en `sessionStorage`.
  - Otro dispositivo o pestaña: «Volver a mi grupo» llama a `POST /api/rooms/resume`. El servidor entrega el token del sitio guardado **solo a la cuenta dueña** del sitio. El nuevo dispositivo entra con el mismo `sessionId`, el mismo personaje y su numeración de entradas y acciones (`welcome.input`).
  - Ese token ya no vale para un segundo intento.
  - Si la cuenta sigue conectada en otro sitio, la respuesta es 409 (`LIVE_ELSEWHERE`), con la opción «Recuperar aquí» (`takeover`). El dispositivo anterior se cierra con el código propio `4415`, que el SDK no reintenta, así que no puede quitarle el sitio al nuevo.
- **Si no vuelve a tiempo**, cuenta como retirada: conserva su nivel y su experiencia y se aplican las reglas de abandono. El resto del grupo sigue.
- **Regla de liderazgo (`HOST_RULE = transfer-oldest`).** El anfitrión lógico no es el servidor (`docs/MULTIJUGADOR.md`).
  - El anfitrión puede **ceder** el liderazgo a otro integrante conectado (`C.HOST`).
  - Si se **desconecta**, tras `HOST_GRACE_SECONDS` (10 s) el liderazgo pasa al integrante conectado más antiguo; si vuelve antes, lo conserva.
  - Si **abandona**, pasa al momento.
  - La expedición continúa siempre. Se avisa a todos con el evento `host` (`reason`: manual, drop o leave), y la regla se explica en la sala de espera.
  - **Opciones de expedición** (`C.OPTIONS`, solo el anfitrión y en la sala de espera): mazmorra y tiempo de reconexión de la sala (`RECONNECT_CHOICES`, hasta `RECONNECT_MAX_SECONDS`). Las valida el servidor.

### Pruebas de esta parte

- **`tests/expedition.test.mjs`**: puertas y llaves; acciones repetidas que no se aplican dos veces; dos jugadores que matan a la vez al mismo enemigo; avisos y eventos de ataque enemigo; estado y fase del guardián.
- **`tests/colyseus/combat.test.mjs`**: Colyseus real y 4 clientes SDK. Se mueven y atacan a la vez a 20 Hz, con mensajes y acciones duplicados. Pasan por:
  1. un corte de red con reconexión automática;
  2. una vuelta desde otro dispositivo;
  3. la toma del asiento con la cuenta aún conectada;
  4. la salida de la anfitriona;
  5. la caducidad de un sitio.

  Tras cada fase se congela la simulación y se comprueba que el estado de **cada** cliente es idéntico al del servidor. También se comprueba que todos recibieron los mismos ataques y muertes, en el mismo orden y sin repetir, y que hay una sola recompensa por cuenta. En una ejecución típica: unos 50 ataques, 4 muertes, 64 acciones repetidas descartadas y una docena de ataques enemigos.
- **`tests/colyseus/browser_combat_e2e.py`**: 4 navegadores jugando con el teclado; 43/43. Comprueba en cada navegador:
  - mismo estado que el servidor;
  - mismos enemigos dibujados y mismas barras de vida;
  - posiciones de los demás y propia (predicción corregida);
  - mismos ataques sin repetir;
  - puerta abierta en los cuatro con la llave de quien abre;
  - corte de red con cuenta atrás;
  - vuelta desde otro dispositivo al mismo asiento;
  - guardián en fase 2 en todos;
  - traspaso del liderazgo cuando sale la anfitriona.

## 8. Flujo de una expedición

1. **Entrar.** El jugador elige «Cooperativo online» e inicia sesión, crea una cuenta o prueba como invitado. Recibe un token.
2. **Perfil.** Si aún no tiene perfil online, elige su criatura inicial. Ve su ficha: criatura, nivel, monedas, objetos, equipo, compañeros, misiones y movimientos.
3. **Crear el grupo.** El anfitrión pulsa «Crear partida privada» y recibe el código (apartado 5).
4. **Unirse.** Los demás escriben el código. `GET /api/rooms/:código` devuelve el id de la sala, y `joinById` envía el token y el código. `onAuth` hace las comprobaciones del apartado 5.
5. **Sala de espera.** Cada jugador marca «Estoy listo». La mazmorra debe estar desbloqueada en **todos** los perfiles. El anfitrión inicia la expedición y la sala se cierra a nuevas entradas (`lock`).
6. **Cada piso.** El servidor envía `floor` con la semilla y el cliente genera el mismo piso. Después llega el estado 20 veces por segundo y los eventos (botín, subidas de nivel, caídas…).
7. **Final.** El final puede ser una victoria (guardián derrotado y todos en la salida), un regreso (portal del punto de control, con todos), una derrota (todos caídos), el viento o una retirada. El servidor aplica las reglas de `Game.endRun` a cada perfil y lo guarda. Después envía `result` con la partida actualizada, que pasa a ser la del navegador.

## 9. Qué valida el servidor

- **Movimiento.**
  - El cliente envía muestras de eje a 120 Hz, agrupadas en mensajes cada 50 ms.
  - El servidor aplica **como mucho una muestra por paso**, con la cola limitada a 30 muestras.
  - El eje se normaliza a longitud ≤ 1 y la velocidad sale de `Player.moveSpeed()`.
  - Las colisiones salen de `World`.
  - Sin muestras, el jugador se para.
- **Ataques.** Se ejecutan `tryBasic`, `tryMove` y `tryDodge` del motor en el servidor, con cargas, enfriamientos, energía, alcance y estados como el aturdimiento. Las acciones que no se pueden hacer se rechazan y se notifican.
- **Daño.** Solo `Combat.hit` en el servidor, con la fórmula del juego. Ningún mensaje del cliente lleva daño, PS, monedas ni experiencia.
- **Enemigos.** La IA real (`Enemy.update`, jefes e invocaciones) corre en el servidor. Eligen objetivo entre todos los jugadores despiertos.
- **Recompensas.**
  - La experiencia se da una vez por enemigo y por jugador, según el nivel de cada uno.
  - El botín se recoge por proximidad en el servidor: las monedas son de quien las coge.
  - Los cofres se marcan como abiertos antes de tirar el botín.
  - Al final se aplican las mismas reglas de pérdidas que en local.
- **Objetos.** El servidor comprueba que el jugador lleve el objeto y que tenga efecto. Los que dependen del piso local (orbes) no se permiten online.

## 10. Red

| | Frecuencia | Tamaño medido |
|---|---|---|
| Simulación del servidor | 120 pasos/s (2 por cada tic de 60 Hz) | 15 ms de CPU por segundo de juego con 4 jugadores en combate |
| Entradas cliente → servidor | 20 mensajes/s (6 muestras cada uno) | ~113 bytes/mensaje |
| Estado servidor → cliente | 20 parches/s | Estado completo en JSON: ~2,8 KB. Colyseus envía solo los cambios, en binario |

- **Predicción.** El jugador propio se mueve al instante con el mismo código.
- **Corrección.** El servidor devuelve `ack`, la última muestra aplicada. El cliente compara su posición en esa muestra con la del servidor y corrige la diferencia: repartida en varios fotogramas por debajo de 24 px, de golpe por encima y con salto por encima de 80 px (apartado 7). Diferencia final medida: **0,05 px** con un jugador y menos de **0,7 px** con cuatro navegadores en combate.
- **Interpolación.** Los demás jugadores y los enemigos se dibujan con 100 ms de retraso entre dos instantáneas.
- **Ataques de otros jugadores.** Se repiten en local, solo como efecto visual, con el mismo `MOVES[..].cast` (evento `cast` con id único). Los disparos y zonas de **enemigos** llegan en el estado; sus ataques, como evento `eatk`.

## 11. Desconexión y reconexión

- **Servidor.**
  - `onDrop` reserva el sitio `RECONNECT_SECONDS` segundos (`allowReconnection`; 45 por defecto, configurable).
  - El jugador queda **dormido**: no se mueve, no recibe daño y los enemigos no lo eligen como objetivo.
  - Si no queda nadie despierto, el piso se congela.
  - Si el jugador no vuelve a tiempo, `onLeave` le aplica el resultado de «retirada» y guarda su perfil.
- **Cliente.**
  - El SDK reintenta solo (hasta 15 veces, con espera creciente) y avisa con `onDrop` / `onReconnect`.
  - Si se agotan los reintentos, el menú muestra «Conexión perdida» y **Reintentar**, que usa el `reconnectionToken` guardado en `sessionStorage`. Esto también sirve si se recarga la página.
  - Un corte de red sin cierre lo detecta el servidor por el latido del transporte (ping cada 5 s, 3 fallos).
  - Al volver, el servidor reenvía `welcome` y `floor`, y el cliente se resincroniza.
- **Anfitrión.** Se aplica la regla `HOST_RULE` (apartado 7): pasa al conectado más antiguo y la expedición continúa.
- **Otro dispositivo.** «Volver a mi grupo» (`POST /api/rooms/resume`) recupera el mismo asiento (apartado 7).
- **Salida voluntaria.** «Abandonar grupo» cierra con el código `CONSENTED` de Colyseus, así que no se guarda el sitio.

## 12. Perfiles y base de datos

Está resumido en el apartado 6.

**Contrato `ProfileStore`** (`server/src/persistence/ProfileStore.js`):

| Grupo | Métodos |
|---|---|
| Cuentas | `createAccount`, `getAccount`, `getAccountByUsername`, `updateAccount` |
| Perfil | `getProfile`, `putProfile` (versión esperada), `mutateProfile` (leer, aplicar la regla y escribir de forma atómica) |
| Recompensas | `applyReward` (idempotente), `getReward`, `listRewards` |
| Auditoría | `logEvent` |

Hay tres implementaciones: SQLite, PostgreSQL y memoria (solo pruebas).

## 13. Estructura de carpetas

```
mystery-action-online/
├── prototype/mystery-action.html   ← FUENTE DE VERDAD (el artefacto; sigue funcionando solo)
├── tools/split-prototype.mjs       genera shared/engine-core.generated.js, client/public/game.js y client/index.html
├── shared/
│   ├── engine-core.generated.js    reglas del juego como módulo ESM (generado, no se edita)
│   └── protocol.js                 mensajes, límites y validación de entradas
├── server/
│   ├── src/index.js                arranque (lee la configuración y escucha)
│   ├── src/app.js                  montaje: Colyseus + API registrada en su router (mismo puerto)
│   ├── src/config.js               variables de entorno (sin secretos por defecto)
│   ├── src/identity/               cuentas (usuario y contraseña, invitado), scrypt y tokens HMAC
│   ├── src/http/api.js             /api/auth, /api/me, /api/profile, /api/rooms/:código
│   ├── src/persistence/            base de datos (SQLite, PostgreSQL, memoria) y ProfileService
│   ├── src/profile/rules.js        cambios del perfil validados en el servidor (mismas reglas que la aldea)
│   ├── src/rooms/                  ExpeditionRoom, schema, registro de códigos, forma JSON del estado
│   ├── src/sim/                    engine.js (motor sin dibujo) y Expedition.js (autoridad)
│   └── db/migrations/001_init.sql
├── client/
│   ├── index.html, public/game.js  generados desde el prototipo
│   ├── src/main.js                 añade «Cooperativo online» al título
│   └── src/net/                    api.js, session.js (Colyseus), lobby.js, online.css
├── tests/                          unitarias · colyseus/ (servidor real, 4 clientes) · e2e/ (navegador)
│   └── vendor/                     solo pruebas: compila Colyseus desde GitHub si no hay npm
└── docs/PLAN.md
```

## 14. Dependencias e instalación

Hace falta Node.js 22.13 o posterior, por `node:sqlite` (aquí se probó con la 22.22). Node avisa de que `node:sqlite` es experimental.

```bash
cd mystery-action-online
npm install            # instala los workspaces: @colyseus/core, @colyseus/schema, @colyseus/ws-transport, @colyseus/sdk, esbuild (sin Git)
# Base de datos (opcional):  npm install pg --workspace server
npm run split          # regenera los archivos generados desde el prototipo
npm test               # pruebas unitarias
npm run dev:server     # servidor en http://localhost:2567 (base de datos en server/data/mystery-action.db)
npm run dev:client     # cliente en http://localhost:5173
```

| Paquete | Versión | Dónde |
|---|---|---|
| `@colyseus/core`, `@colyseus/ws-transport` | ^0.18.1 | server. Se usa el núcleo y no el paquete paraguas `colyseus`: ese obliga a instalar `@colyseus/uwebsockets-transport`, que descarga `uWebSockets.js` desde GitHub y necesita Git |
| `@colyseus/schema` | ^5.0.8 | server |
| `@colyseus/sdk` | ^0.18.1 | client |
| `pg` | ^8 | server (opcional, solo con PROFILE_STORE=postgres) |
| `node:sqlite` | incluido en Node | server (base de datos por defecto) |
| `esbuild` | ^0.25 | raíz: compilación del cliente (`npm run build:client`, `dev:client`) |
| `ws` | ^8 | raíz (solo pruebas) |

La API HTTP ya no necesita Express: se registra en el router propio de Colyseus 0.18 (`routes: createRouter(...)` con `createEndpoint`). Colyseus añade sus cabeceras CORS a todas las respuestas; la protección real es el token en la cabecera `Authorization`, no las cookies.

## 15. Servicios externos

**En desarrollo no hace falta ninguno.** Basta con el servidor y el cliente en local, con la base de datos SQLite en un archivo.

La guía paso a paso, con servicios concretos, costes y límites, está en **`docs/DEPLOY.md`**. Resumen de lo que hace falta para jugar por internet:

- **Un host Node con WebSocket** de larga duración: un VPS, Fly.io, Render, Railway o similar. Los entornos sin servidor (*serverless*) no sirven.
- **TLS (`wss://`)**, normalmente con un proxy inverso como Caddy o Nginx, o el del proveedor.
- **Un alojamiento estático** para `client/dist`, o el mismo servidor.
- **Copias de seguridad de la base de datos.** Con SQLite, copia el archivo `.db` (o usa `VACUUM INTO`) con el servidor parado o en modo WAL. Con PostgreSQL, las del proveedor.
- **PostgreSQL**: necesario si hay más de un proceso de servidor.
- **Redis**: solo si se escala a varios procesos de Colyseus. En ese caso, el registro de códigos (`rooms/registry.js`) debe pasar a ese almacén común.
- **Variables obligatorias en producción**: `AUTH_SECRET` (al menos 32 caracteres, generado por ti) y `CLIENT_ORIGIN`. Tienes la plantilla en `.env.example`, sin valores.

## 16. Cómo se separa el artefacto sin perder el prototipo

- El artefacto sigue siendo **el único sitio donde se edita el juego**. Se publica como siempre y funciona sin servidor: `Game.net` es `null`.
- `npm run split` corta el script por sus marcadores de sección:
  - **Reglas** (1 a 18, 21 y 22) → `shared/engine-core.generated.js`. Es una función `createEngineCore()` que crea una copia aislada por sala, sin DOM y con sonido, luces e interfaz que no hacen nada.
  - **Script completo** → `client/public/game.js`.
  - **HTML** → `client/index.html`, con doctype, charset y la capa online añadida.
- `npm run check` (y una prueba) falla si los archivos generados no corresponden al prototipo.

## 17. Estado de cada parte

| Parte | Estado | Cómo se comprobó |
|---|---|---|
| Juego local (todas las fases anteriores) | ✅ intacto | 236/236 pruebas anteriores del prototipo |
| Extracción de reglas y determinismo | ✅ probado | Node estricto; navegador = servidor (reglas, 15 pisos, estadísticas) |
| Protocolo y validación de entradas | ✅ probado | Unitarias |
| Cuentas (registro, inicio de sesión, invitado → cuenta, cerrar sesión en todos, límite de intentos, scrypt) | ✅ probado | Unitarias y en el navegador |
| Base de datos: SQLite y PostgreSQL 16 real | ✅ probado | Mismo contrato: versiones, usuarios únicos, operaciones atómicas, recompensas idempotentes (también simultáneas) y persistencia al reabrir |
| Reglas del perfil en el servidor | ✅ probado | Unitarias y 12 operaciones idénticas al prototipo (`rules_parity.py`) |
| API HTTP real | ✅ probado | Cuentas, ficha, operaciones validadas, versión antigua → 409, importación desactivada, códigos de sala, CORS y límites |
| Persistencia individual con Colyseus real | ✅ probado | `tests/colyseus/persistence.test.mjs`, en SQLite y en PostgreSQL. Dos jugadores con criaturas, niveles, inventarios y compañeros distintos sin pisarse; experiencia por participación; misiones de cada uno; final repetido, confirmación repetida y reconexión sin duplicar; abandono que conserva el progreso; mensajes inventados; reinicio real del servidor (otro proceso) |
| Cuenta en dos dispositivos (navegador) | ✅ probado | `browser_account_e2e.py`, 17/17. Registro, ficha, aldea online, compras validadas, manipulación desde la consola sin efecto, expedición en solitario guardada en la cuenta, partida local intacta, mismo perfil al entrar desde otro dispositivo y cierre de sesión en todos |
| Simulación autoritativa | ✅ probado | 25 pruebas: 4 jugadores, velocidad, muros, cola, cargas, enfriamientos, energía, fórmula de daño, experiencia única, IA contra varios jugadores, botín, cofres, objetos, escalera, reanimar, derrota, victoria, desconexión, abandono, tamaño, rendimiento |
| Capa de red del cliente (sección 26) | ✅ probado de extremo a extremo | Navegador real + WebSocket real + simulación real (relé de pruebas en lugar de Colyseus): 14/14 |
| Grupos privados con Colyseus real | ✅ probado | `tests/colyseus/group.test.mjs`, 4 clientes SDK a la vez. Cubre: crear, código, unirse simultáneo, nombres y criaturas sincronizados, un solo anfitrión, sala llena, código erróneo, sesión no válida, versión, cuenta duplicada, otra sala, sin perfil, suplantación ignorada, solo el anfitrión empieza o elige destino, inicio con el mismo piso para todos, cierre a nuevas entradas, movimiento simultáneo, corte de red con reconexión automática del SDK, abandono con resultado guardado una vez, traspaso de anfitrión y código liberado |
| Menú cooperativo en 4 navegadores | ✅ probado | `tests/colyseus/browser_group_e2e.py`, 24/24. Cuatro navegadores con perfiles distintos (criatura, nivel y monedas) y un quinto rechazado por sala llena. Comprueba las cuatro opciones del menú, el estado de conexión, el corte de red con «Conexión perdida» → «Reintentar», «Abandonar grupo» y que cada uno juega con su propia criatura |
| Combate en tiempo real y mundo compartido | ✅ probado | `combat.test.mjs`: 4 clientes SDK con combate simultáneo y 5 cambios de conexión; estado idéntico al servidor en cada fase. `browser_combat_e2e.py`: 43/43 con 4 navegadores. Unitarias de puertas, duplicados, muerte simultánea, ataques enemigos y guardián |
| `server/src/app.js`, `ExpeditionRoom`, `schema.js`, `session.js` | ✅ ejecutados con Colyseus 0.18 real | Compilado desde su código fuente oficial en GitHub; con `npm install` se usan los paquetes publicados |
| Despliegue (producción) | ✅ preparado y probado en local · ❌ sin desplegar | `docs/DEPLOY.md`. Proceso real en producción (SQLite y PostgreSQL), imagen, cierre ordenado y HTTPS/WSS con 2 navegadores a través de un proxy TLS. Sin ejecutar: `npm install` publicado, `docker build`, Caddy real y plataformas |

**Primer paso al instalar**

1. Ejecuta `npm install`, luego `npm run dev:server` y `npm run dev:client`.
2. Abre dos navegadores: uno crea la sala y el otro se une con el código.
3. `npm run test:all` ejecuta todo con los paquetes instalados.

## 18. Limitaciones de esta primera fase online y siguientes pasos

**Aún no hay en línea:**

- Trampas, escaleras ocultas y salas secretas.
- Tienda del topo y forajidos o vecinos de las misiones del tablón (las puertas con llave ya funcionan en línea).
- Llevar compañeros a la expedición y reclutar en ella (los compañeros sí son parte del perfil y se gestionan en la aldea online).
- Evolución, cambio de equipo o de movimientos durante la expedición.
- Orbes.

Todo esto sigue funcionando igual en el juego local.

**Siguientes pasos:**

1. Desplegar siguiendo `docs/DEPLOY.md` y pasar su lista de comprobación desde dos redes.
2. Llevar las trampas y las escaleras ocultas al servidor (los avisos y golpes de los enemigos ya llegan como estado y eventos).
3. Permitir compañeros con un máximo por grupo.
4. Pasar las misiones de tipo cazar, recoger y explorar al resultado de cada jugador.
5. Pasar a PostgreSQL y añadir un historial de resultados.
6. Añadir cuentas con correo u OAuth.
7. Usar Redis si hacen falta varios procesos (el registro de salas y «Volver a mi grupo» son de un solo proceso).
