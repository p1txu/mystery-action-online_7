# Jugar con amigos desde tu PC (modo anfitrión)

Quien crea la partida hace de **servidor en su propio ordenador**. Sus amigos solo abren un enlace en el navegador: no instalan nada, no crean cuentas de nada y no pagan nada.

> **Estado:** está implementado y probado con un túnel simulado (HTTPS de verdad, dos navegadores, sala, invitación y movimiento sincronizado). **El túnel real de Cloudflare no se ha podido probar desde el entorno de desarrollo.** Hasta que lo pruebes con alguien que esté en otra red, no se puede dar por comprobado que funciona por Internet.

## Cómo se usa (todo desde el mismo juego)

1. **Anfitrión.** Instala el juego una vez con `Instalar.bat` (Windows) y ábrelo con **`Jugar.bat`** (o el acceso directo). En macOS, `Jugar.command`; en Linux, `./jugar.sh`. Es el mismo juego para jugar solo o con amigos.
2. En el juego: **«Cooperativo online»** → crea tu cuenta (o entra) → en el recuadro **«Jugar con amigos por Internet»** pulsa **«Crear enlace para amigos»**.
   - La primera vez descarga `cloudflared`, el programa oficial y gratuito de Cloudflare (se guarda en `tools/bin/`).
   - Abre un **enlace público https** (`https://palabras-al-azar.trycloudflare.com`), comprueba que responde desde Internet y te lo muestra con «Copiar enlace».
3. **«Crear partida privada»** → **«copiar enlace de invitación»** (ya usa el enlace público; si no lo habías creado, lo crea en ese momento). Mándalo por WhatsApp, Discord o donde quieras.
4. Tus amigos **solo abren ese enlace** en su navegador: no instalan nada. Entran directos a tu sala con el código ya escrito.
5. **No cierres la ventana del juego** mientras jugáis. «Cerrar enlace» lo corta cuando quieras; al cerrar la ventana se cierra solo.

Tú sigues jugando en `http://localhost:5173` (tus partidas y tu cuenta de siempre); tus amigos, por el enlace. Es el mismo servidor, así que el código de la sala vale para todos.

`Jugar.bat --host` hace lo mismo pero abre el enlace nada más arrancar y lo muestra en la ventana (lo que antes hacía «Jugar con amigos.bat», que ya no hace falta).

## Lo que hay que saber

- **El enlace cambia cada vez** que lo creas. Es así por diseño de los túneles rápidos de Cloudflare.
- **Las cuentas y criaturas de tus amigos se guardan en tu ordenador** (`data/`). Si vuelven otro día a través de tu nuevo enlace, entran con su cuenta (usuario y contraseña).
- **Tu conexión a Internet importa:** todos los jugadores pasan por ella. Cada jugador en combate usa unos 7 KB/s, medido en local; para 4 jugadores basta cualquier fibra o ADSL decente.
- **Límites del túnel gratuito**, según la [documentación de Cloudflare](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/do-more-with-tunnels/trycloudflare/):
  - Es «para pruebas y desarrollo».
  - No tiene garantía de disponibilidad.
  - Admite como mucho 200 peticiones simultáneas, de sobra para 4 jugadores.
  - Esa página no menciona los WebSockets, que es lo que usa el juego. Una guía independiente indica que funcionan ([flaviocopes.com](https://flaviocopes.com/cloudflare-quick-tunnels/)).
- **Alternativa permanente:** si queréis un servidor siempre encendido que no dependa de tu PC, el despliegue en Internet está en `docs/DEPLOY.md`.

## Qué hace por dentro (y por qué es seguro)

- **Un solo puerto.** El propio servidor de juego sirve también la página (`CLIENT_DIR`). El túnel publica solo ese puerto y el juego habla con su servidor en la misma dirección (`wss://`).
- **El túnel lo abre el servidor solo si se pide desde tu propio ordenador** (`HOST_TUNNEL=1`, lo activa el lanzador; en un despliegue en la nube no existe). Lo que llega por el túnel (cabeceras de Cloudflare), desde otro PC de casa o desde otra web abierta en tu navegador recibe un 403. Mientras el enlace está abierto su dirección se añade a los orígenes permitidos y al cerrarlo se retira.
- **Modo producción.** El servidor arranca con todas sus protecciones:
  - Solo acepta WebSockets y peticiones de sala desde el enlace del túnel y desde `localhost`.
  - La seguridad de la página (CSP) solo permite conectar con ese mismo sitio.
  - Las sesiones se firman con un secreto que se genera en tu PC (`data/.dev-secret`).
  - Se toma la IP real del jugador detrás del túnel para limitar los intentos de acceso.
- **El servidor sigue mandando en todo:** valida cada entrada y simula la partida. Los navegadores de tus amigos solo hablan con tu servidor, nunca entre ellos (no es P2P).
- **Tu ordenador no queda abierto a Internet.** `cloudflared` solo hace conexiones de salida hacia Cloudflare: no hay que abrir puertos en el router. Lo único publicado es el juego, y solo mientras el enlace está abierto.

## Si algo falla

| Mensaje | Qué hacer |
|---|---|
| «No se pudo descargar cloudflared» | Comprueba la conexión, o instálalo a mano desde la [página de descargas de Cloudflare](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/downloads/). Si está en el PATH o en `tools/bin/`, se usa ese |
| «No se pudo abrir el túnel de Cloudflare» | Conexión o antivirus bloqueando `cloudflared`. Si tienes `config.yaml` en la carpeta `.cloudflared` de tu usuario, Cloudflare no permite túneles rápidos: renómbralo |
| «El enlace aún no responde» | Cloudflare a veces tarda; prueba el enlace al cabo de un minuto |
| «El puerto 5173 está ocupado» | Ya hay otra ventana del juego abierta (o otro programa usa ese puerto): ciérrala |
| A tu amigo le dice «No hay ninguna sala abierta con ese código» | Está en otro servidor: tiene que abrir TU enlace https (el de invitación), no su propio juego |

## Pruebas

`tests/deploy/host_e2e.py` usa el lanzador real (`Jugar.bat`) sobre una copia limpia del proyecto. En lugar de `cloudflared` usa un sustituto (`tests/deploy/fake-cloudflared.mjs`), que acepta los mismos argumentos, imprime la misma salida y hace de proxy HTTPS de verdad. Comprueba:
- Un solo lanzador y un solo servidor: la anfitriona juega en `http://localhost`.
- «Crear enlace para amigos» abre el túnel desde el juego y lo muestra cuando responde.
- «copiar enlace de invitación» usa la dirección pública; el amigo entra solo con ese enlace, se unen y se ven moverse.
- El amigo no ve el botón ni puede abrir el túnel (403); WebSockets desde otra web, 403.
- «Cerrar enlace» corta el túnel; `--host` lo abre al arrancar; al cerrar se para todo.

`tests/deploy/host-tunnel.test.mjs` prueba aparte quién puede abrir el túnel, la configuración de la red local y los fallos.
