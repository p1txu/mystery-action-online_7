# Siempre online: amigos, grupo, aldea compartida, chat y cuentas cifradas (versión 0.31)

El juego es **siempre online**: se juega con una cuenta y todo (aldea, expediciones en solitario o en grupo) pasa por el servidor, que lo valida.

## 1. Cómo se juega

1. Pulsa **Jugar** en el título.
   - Con sesión y clase elegida, entras directamente en la aldea.
   - Si no, entra con tu cuenta o créala y elige clase.
2. Pulsa la tecla **O** o el botón **Amigos** (abajo a la izquierda) para abrir el panel social, con tres pestañas.
   - **Amigos:**
     - tu código («Ana#K7P2QX»);
     - añadir con el código de otro;
     - solicitudes recibidas y enviadas;
     - lista con su estado: desconectado, en la aldea o en una mazmorra;
     - borrar, bloquear y desbloquear.
   - **Grupo:**
     - invitaciones;
     - los miembros con su clase, nivel y estado;
     - el líder puede **hacer líder** a otro o **sacar** a alguien;
     - cualquiera puede **silenciar** a otro;
     - **Salir del grupo**;
     - el líder elige mazmorra y pulsa **Ir con el grupo**.
   - **Chat:** el del grupo.
3. Para invitar a alguien al grupo, en **Amigos** pulsa **Invitar al grupo** junto a un amigo conectado. El amigo pulsa **Unirme** en la pestaña Grupo.
4. **En la aldea**, los del grupo os veis moveros. Si alguien escribe, su mensaje sale como bocadillo sobre su cabeza.
5. **Chat rápido:** tecla **T**, escribes, **Intro** para enviar y **Esc** para cerrar. Los últimos mensajes se ven abajo a la izquierda.
6. **Mazmorra en grupo:** el líder elige la mazmorra (en el panel o en la puerta de la mazmorra de la aldea) y entráis todos a la vez en la misma expedición.
   - Quien no es líder no puede entrar solo por la puerta mientras esté en el grupo; para ir solo, primero tiene que salir del grupo.
7. **Al terminar**, volvéis a la aldea y seguís en el mismo grupo.

Las **partidas privadas por código** («Cuenta y partidas privadas» en el título) siguen existiendo para jugar con alguien que no está en tu lista.

## 2. Qué decide el servidor

| Qué | Cómo |
|---|---|
| Amistades | Solo con el código de amigo, que no revela el usuario de nadie. Si los dos se envían solicitud, quedan aceptadas. Límites: 100 amigos, 30 solicitudes sin responder, 20 solicitudes por hora |
| Bloquear | Borra la amistad. La persona bloqueada no puede enviarte solicitudes, invitarte ni hablarte, y recibe el mismo mensaje que si tu código no existiera |
| Invitar | Solo a amigos conectados y no bloqueados, hasta 4 en el grupo. La invitación caduca en 60 s |
| Aldea compartida | Cada jugador envía su posición 10 veces por segundo. El servidor la reenvía solo a los de su grupo que también están en la aldea, y descarta las posiciones fuera de la aldea |
| Chat | Texto libre con filtro (insultos tapados con `*`, también escritos «p.u.t.a» o «m1erda»), 140 caracteres y 5 mensajes cada 10 s. No llega a quien te ha bloqueado ni a quien has bloqueado. «Silenciar» es solo para ti (se guarda en tu navegador) |
| Expedición del grupo | La crea el servidor con una clave de un solo uso: solo entran los del grupo, aunque alguien de fuera tenga el código. Antes comprueba que todos estén conectados, que ninguno esté en otra expedición y que todos tengan desbloqueada esa mazmorra en su perfil. Empieza sola cuando han entrado todos; si alguno no entra en 20 s, empieza con los que estén. El líder del grupo es el anfitrión |
| Líder | Si el líder se desconecta del todo, pasa al siguiente conectado. Si se van todos, el grupo se deshace a los 10 minutos |
| Conexión | Una conexión por cuenta: si entras desde otra pestaña o dispositivo, la anterior se cierra. Si se corta la red, el juego avisa («Sin conexión con el servidor · reconectando…») y reintenta solo |

## 3. Con el servidor en tu PC (por ahora)

- **Mientras tu PC y el juego estén abiertos**, tus amigos pueden entrar con el enlace que crea el botón **«Crear enlace para amigos»** (`docs/ANFITRION.md`). Cuando lo cierras, nadie puede jugar online, tampoco en solitario.
- **Las cuentas, perfiles y amistades se guardan en tu PC** (`data/mystery-action.db`). No se pierden al cerrar el juego.
- **El enlace del túnel gratuito cambia cada vez que lo abres.** Hay que mandarles el enlace nuevo cada vez. Además:
  - el navegador guarda la sesión por dirección, así que tus amigos tendrán que **iniciar sesión** de nuevo con el enlace nuevo;
  - por eso deben usar **«Crear cuenta»** (usuario y contraseña) y no «invitado». El juego se lo recuerda al entrar por un enlace de amigo.
- **Con un VPS más adelante** (`docs/DEPLOY.md`, opción B), la dirección será fija y el servidor estará siempre encendido. No hay que cambiar nada del juego: las amistades y los perfiles se pueden llevar copiando la base de datos.

## 4. Cuentas cifradas (0.31)

| Dato | Cómo se guarda en la base de datos |
|---|---|
| Contraseña | **Nunca se guarda.** Solo su huella scrypt con sal propia: no se puede recuperar, ni siquiera con acceso a la base de datos. Así era ya antes |
| Usuario y nombre visible | **Cifrados con AES-256-GCM.** Cada registro lleva su IV aleatorio y una etiqueta de autenticación: si alguien los cambia en la base de datos, se detecta y no se acepta |
| Búsqueda por usuario (al iniciar sesión) | Huella HMAC-SHA256 del usuario en minúsculas, con otra clave. Sirve para encontrarlo y para que sea único, pero no permite saber cuál es |
| Sesiones | Tokens firmados (HMAC). Ya existían |
| Perfil de juego, amistades, fechas | Sin cifrar. No identifican a nadie: solo relacionan identificadores aleatorios |

- **Claves:** salen del secreto del servidor (`AUTH_SECRET`, o `data/.dev-secret` en tu PC) con HKDF. Una copia de la base de datos **sin el secreto** no revela usuarios ni nombres. Quien lleva el servidor sí puede descifrarlos, porque el servidor los necesita para enseñárselos a tus amigos.
- **Guarda el secreto junto a las copias de seguridad.** Si se pierde, los nombres no se pueden recuperar y todas las sesiones caducan. En tu PC está en `data/.dev-secret`; copia la carpeta `data` entera.
- **Cuentas que ya existían:** se cifran solas al arrancar el servidor (y se sigue entrando con el mismo usuario y contraseña).
- **Al crear una cuenta**, también como invitado o al ponerle usuario, el juego explica todo esto en un recuadro. Además dice si la conexión va cifrada:
  - **HTTPS** (enlace para amigos o servidor en Internet): va cifrada;
  - **tu propio PC**: lo que escribes no sale de él;
  - **red de casa por http**: no va cifrada, y avisa de no usar una contraseña de otros sitios.
- **Pruebas:** `tests/encrypted-accounts.test.mjs`, con SQLite, memoria y PostgreSQL. Comprueban que ni el usuario, ni el nombre, ni la contraseña aparecen en ningún archivo de la base de datos. También que se entra igual, que el usuario sigue siendo único, que las cuentas antiguas se migran, que sin el secreto no se lee nada y que una manipulación se detecta. La prueba de 3 navegadores comprueba el aviso.

## 5. Modo sin conexión (solo pruebas)

- La partida local sin servidor ya no aparece en el juego.
- **Para probar**, se activa con `?local=1` en la dirección o con `localStorage['ma-dev-local'] = '1'`. Entonces vuelven «Continuar», «Nueva partida» y «Partida local (pruebas)».
- El prototipo publicado aparte (un solo archivo HTML) sigue siendo local.
- La partida local **no se puede subir** a la cuenta: el servidor no puede comprobar cómo se consiguió. El progreso online solo se gana jugando online, igual que antes.

## 6. Archivos

- **Compartido:**
  - `shared/social.js`: mensajes del hub, límites, filtro del chat y códigos de amigo.
- **Servidor:**
  - `server/src/social/SocialService.js`: reglas de amistad y bloqueo.
  - `server/src/rooms/HubRoom.js`: presencia, grupo, aldea compartida, chat y «Ir con el grupo».
  - `ExpeditionRoom.js`: modo grupo (solo sus miembros, empieza solo, el líder es el anfitrión).
  - `registry.js`: claves de un solo uso de los grupos.
  - `http/api.js`: `/api/friends…`
  - `app.js`: el hub se crea al arrancar.
- **Base de datos:**
  - tablas `friend_codes`, `friendships` y `blocks` en SQLite y en PostgreSQL (`server/db/migrations/002_social.sql`).
  - Memoria, para pruebas.
- **Cliente:**
  - `client/src/net/hub.js`: conexión social, posición en la aldea y compañeros dibujados.
  - `client/src/net/social.js`: panel con las teclas O y T, y el chat sobre el juego.
  - `lobby.js` y `main.js`: «Jugar» lleva directo a la aldea; la partida local solo en modo de pruebas; la puerta de la mazmorra respeta el grupo.
- **Juego:**
  - bocadillo del chat sobre los personajes (`drawChatBubble`).

## 7. Pruebas

| Prueba | Qué comprueba |
|---|---|
| `tests/social-store.test.mjs` | Amistades, bloqueos y límites en memoria, SQLite y PostgreSQL (cuando hay `TEST_DATABASE_URL`); códigos de amigo; filtro del chat |
| `tests/colyseus/social.test.mjs` | Colyseus y SDK reales: amigos y presencia en vivo; bloqueos; invitar solo a amigos; chat filtrado y limitado; la aldea solo con tu grupo; expedición del grupo (alguien de fuera no entra con el código, empieza sola y el líder es el anfitrión); liderazgo y expulsión; volver al grupo con el historial; una conexión por cuenta; tokens falsos |
| `tests/colyseus/browser_social_e2e.py` | Tres navegadores reales, todo con clics y teclas. Comprueba: «Jugar» sin partida local; amigos por código; grupo; verse moverse en la aldea mientras un tercero no ve nada; chat con T, filtrado y como bocadillo; las teclas del chat no mueven al personaje; bloquear; la puerta de la mazmorra respeta al líder; mazmorra juntos y vuelta juntos |

**Fallo encontrado al probar y corregido.** Al perder la red, el SDK de Colyseus 0.18 cierra sus conexiones recorriendo una lista que modifica a la vez. Con dos conexiones (el hub y la expedición) la segunda quedaba «abierta» sin red y el juego no se enteraba del corte. Lo arregla `client/src/net/offline.js`, y lo comprueba la prueba de 4 navegadores con corte de red (`browser_group_e2e.py`).

**Sin probar:** jugar de verdad desde dos casas a través del túnel. El túnel y el lanzador ya tenían sus pruebas (`tests/deploy/host_e2e.py`, con un túnel simulado), pero las partes nuevas solo se han probado en este equipo.
