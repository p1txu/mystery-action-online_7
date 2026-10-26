# Cooperativo: anfitrión, amigos y servidor

> **Estado:** todo lo descrito aquí está implementado y probado en local con Colyseus real, clientes reales y navegadores reales. **Aún no hay ningún servidor desplegado en Internet.** Para jugar con amigos fuera de tu casa hay que desplegarlo (`docs/DEPLOY.md`) y pasar la lista de comprobación desde dos redes.

## 1. Anfitrión lógico ≠ servidor técnico

| | Anfitrión **lógico** (un jugador) | Servidor **técnico** (Colyseus + Node.js) |
|---|---|---|
| Qué es | Quien crea la sala, o a quien se le cede | Un proceso independiente (`server/`), en tu equipo para desarrollar o desplegado en Internet |
| Qué hace | Invita (código o enlace), elige las opciones de expedición (mazmorra y tiempo de reconexión), inicia la partida y puede ceder el liderazgo | Crea la sala y su código, valida cada entrada, simula la mazmorra a 120 Hz (movimiento, combate, enemigos, jefe, botín), sincroniza a todos a 20 Hz y guarda los perfiles y las recompensas en la base de datos |
| Si desaparece | El liderazgo pasa a otro jugador y la partida sigue | Las expediciones en curso terminan como «interrumpidas» guardando lo conseguido |

- **El navegador del anfitrión no aloja nada.** No hay conexión entre navegadores (P2P) ni ninguna parte del juego que dependa de él.
- Todos los navegadores, el del anfitrión incluido, son clientes iguales: envían intenciones (ejes de movimiento y acciones) y dibujan lo que dice el servidor.
- Lo único que el servidor permite al anfitrión es elegir las opciones, iniciar y ceder el liderazgo. Todo lo demás lo decide el servidor.

## 2. El flujo, paso a paso

| Paso | Qué ve el jugador | Qué ocurre por debajo |
|---|---|---|
| 1. Abrir el juego y elegir clase | «Cooperativo online» → cuenta o invitado → la primera vez, «Elige tu clase» (Guerrero, Arquero, Mago o Asesino). Después, su ficha | `POST /api/auth/*` y `POST /api/profile/new`: el perfil se crea **en el servidor** (base de datos) |
| 2. «Crear partida privada» | Botón del menú | El SDK de Colyseus pide al servidor una sala nueva (`create`) |
| 3. El servidor crea la sala con un código | Aparece el código de 6 caracteres | `ExpeditionRoom.onCreate`: código único (`registry.js`), sala privada y no listada |
| 4. Compartir el código | «copiar» o **«copiar enlace de invitación»** (`…/?sala=K7P2QZ`) | Al abrir el enlace, el menú aparece con el código escrito |
| 5. «Unirse a partida» | Lista con los integrantes, su criatura y quién es el anfitrión | `onAuth` comprueba la sesión, el código, la plaza (máx. 4), que la cuenta no esté repetida ni en otra sala y que tenga perfil |
| 6. Cada uno carga SU perfil | Cada uno ve su propia ficha y juega con su criatura, nivel, movimientos, equipo e inventario | El servidor lee el perfil de cada cuenta de la base de datos. Nada se copia del anfitrión |
| 7. El anfitrión inicia | Elige mazmorra y tiempo de reconexión; los demás marcan «Estoy listo»; «Iniciar expedición» | Solo el anfitrión, con todos listos y conectados y la mazmorra desbloqueada en **cada** perfil. La sala se cierra a nuevas entradas |
| 8. Explorar y combatir juntos | La misma mazmorra; los demás se mueven con fluidez; enemigos y guardián compartidos | Semilla del servidor → mismo piso en cada cliente. Simulación autoritativa. Predicción local corregida e interpolación de los demás |
| 9. Recompensas individuales | Cada uno ve su resultado | Experiencia por participación, botín de quien lo coge, recompensas guardadas **una vez** por cuenta y expedición (libro con clave única) |

## 3. Reglas y dónde se cumplen

| Regla | Implementación | Prueba |
|---|---|---|
| Máximo 4 jugadores humanos | `MAX_PLAYERS = 4`, comprobado en `onAuth`. Ningún jugador lo controla una IA | `group.test.mjs`, `browser_group_e2e.py` (el quinto, rechazado) |
| Movimiento libre y combate en tiempo real | Entradas a 120 Hz en lotes de 50 ms, `tryBasic`/`tryMove`/`tryDodge` del motor en el servidor | `combat.test.mjs`, `browser_combat_e2e.py` |
| Estado compartido en el servidor | `Expedition` (simulación) y `schema.js` (sincronización) | Estado de cada cliente idéntico al del servidor |
| Cada uno conserva su Pokémon, nivel, movimientos, equipo e inventario | Perfil propio desde la base de datos; el cliente no puede enviar ni nivel ni inventario | `persistence.test.mjs`, `browser_host_e2e.py` |
| Enemigos y jefes compartidos | Una sola IA en el servidor; el jefe tiene estado propio (`boss`) | `combat.test.mjs` |
| Recompensas individuales, sin duplicar | `netDone` por enemigo, ataques con identificador único, libro de recompensas por (expedición, cuenta) | `combat.test.mjs`, `persistence.test.mjs` |
| El liderazgo se puede ceder; pasa a otro si el anfitrión se desconecta | «ceder liderazgo» (`C.HOST`). Si se desconecta: traspaso tras `HOST_GRACE_SECONDS` (10 s). Si abandona: al momento | `host.test.mjs`, `browser_host_e2e.py` |
| Reconexión durante un periodo configurable | Servidor: `RECONNECT_SECONDS` (por defecto) y `RECONNECT_MAX_SECONDS` (máximo). Anfitrión: elige para su sala entre 30 s y 5 min. Mismo asiento, sin duplicar personaje | `host.test.mjs`, `combat.test.mjs` |
| Validación de acciones | `parseInput` (forma), simulación (enfriamientos, energía, alcance), opciones y liderazgo solo para el anfitrión, mensajes desconocidos → expulsión | `expedition.test.mjs`, `persistence.test.mjs` |
| Guardado persistente | SQLite o PostgreSQL; `applyReward` idempotente | `store.test.mjs`, `prod-smoke.test.mjs` (también con PostgreSQL) |
| Cliente separable del servidor | El cliente son archivos estáticos (`npm run build:client`, `SERVER_URL`) | `tls_e2e.py` |
| Mecánicas existentes intactas | La versión local y sin conexión no cambia | 236 pruebas del prototipo |

## 3 ter. Pasarse objetos: dejarlos en el suelo

En la expedición, abre la mochila (Tab), elige un objeto y pulsa **«Dejar en el suelo (para el grupo)»**. Se deja 1 unidad junto a ti y todos la ven; cualquier compañero que pase por encima la recoge y va a SU mochila (y a su perfil al terminar).
- Lo valida el servidor (`Expedition.drop`, mensaje `drop`): solo puedes soltar lo que llevas; si no, se rechaza.
- Quien lo suelta no lo recoge sin querer durante 2 s aunque pase por encima. Después puede recuperarlo.
- Como mucho 80 objetos en el suelo por piso. Lo que quede en el suelo al cambiar de piso se pierde.
- Pruebas: `tests/drop.test.mjs` y `tests/colyseus/browser_drop_e2e.py` (dos navegadores).

## 3 bis. Dificultad según el número de jugadores

La decide el servidor al cargar cada piso (`COOP_SCALING` en `shared/protocol.js`, aplicada en `server/src/sim/Expedition.js`). Con 1 jugador todo vale 1: el juego es idéntico al de antes.

| Jugadores | Enemigos por piso | PS de cada enemigo | PS del guardián | Daño enemigo | Élite extra | Errantes extra a la vez | Errantes más frecuentes |
|---|---|---|---|---|---|---|---|
| 1 | ×1 | ×1 | ×1 | ×1 | +0 % | 0 | ×1 |
| 2 | ×1,1 | ×1,7 | ×1,9 | +15 % | +5 % | 1 | ×1,05 |
| 3 | ×1,15 | ×2,3 | ×2,7 | +25 % | +8 % | 2 | ×1,1 |
| 4 | ×1,2 | ×2,9 | ×3,5 | +35 % | +12 % | 3 | ×1,15 |

Criterio (desde la versión 0.25): **casi los mismos enemigos que en solitario, pero más duros**. El mapa más grande del cooperativo ya no añade enemigos por sí mismo. Medido en 40 pisos por mazmorra con 4 jugadores: unos 5 enemigos por piso en el Bosque (4,3 en solitario), con unos 160 PS de media (55 en solitario).

- **Enemigos extra:** copias de los del piso (misma especie) cerca de su sitio y nunca a menos de 8 casillas de la entrada. El nido de monstruos también suelta más.
- **El mapa también crece** con el grupo (apartado siguiente), pero sin más enemigos por ello. El cliente lo genera igual con la semilla y el número de jugadores que le envía el servidor.
- **Si alguien abandona el grupo**, todo se reajusta al momento (los enemigos vivos conservan la proporción de PS que les quedaba) y sale el aviso «Dificultad ajustada». **Una desconexión no lo baja**, porque el jugador puede volver.
- **Las invocaciones del guardián** ahora se sincronizan por red y escalan igual. Antes no tenían identificador y no se veían en los clientes.
- Se ve en la sala de espera («Dificultad · 3 jugadores: …») y al entrar en cada piso.
- Prueba: `tests/coop-scaling.test.mjs`.
- Los valores son un primer ajuste y no se han probado con jugadores reales. Se cambian en esa tabla, sin tocar nada más.

## 3 ter. Mapa según el número de jugadores

**En solitario, y en la partida local, el mapa es el de siempre**: comprobado con 584 pisos, idénticos casilla a casilla a los de la versión anterior. Solo en cooperativo crece con el grupo (`FloorGen.SIZES` en el prototipo):

| Jugadores | Tamaño medio del piso | Pasillos | Guarida del guardián | Enemigos iniciales | Tiempo hasta el viento |
|---|---|---|---|---|---|
| 1 | ~2.300 casillas (59×39) | 2 casillas | 22×16 | ×1 | ×1 |
| 2 | ~2.950 (+28 %) | **3 casillas** | 25×18 | ×1,15 | ×1,12 |
| 3 | ~3.500 (+52 %) | **3 casillas** | 27×19 | ×1,25 | ×1,22 |
| 4 | ~3.980 (+73 %) | **3 casillas** | 28×20 | ×1,3 | ×1,3 |

- **Cuándo se decide el tamaño:** el servidor lo fija al cargar cada piso con los jugadores que siguen en el grupo y lo envía (`size`) para que cada cliente genere el mismo mapa. Si alguien sale, el piso actual no cambia; el siguiente ya se genera con los que quedan.
- **Guardián:** en las guaridas grandes ve a los jugadores desde la entrada, igual que en la normal. En solitario su rango no cambia.
- **Pasillos:** comprobado con 11.040 pisos (2.760 por cada número de jugadores). Todos son válidos y ninguna casilla de pasillo es más estrecha de lo que toca.
- **Enemigos:** el número de enemigos del cooperativo (apartado anterior) se aplica además de este.

## 4. Cómo se ha ido añadiendo (de menos a más)

Cada hito quedó probado antes de pasar al siguiente. Las pruebas siguen en el proyecto y se ejecutan con `npm run test:all`.

1. **Dos clientes reales se ven moverse en la misma sala.**
   - `browser_host_e2e.py`: Ana con Aurín y Beto con Magmolo en dos navegadores; cada uno ve moverse al otro.
   - `tls_e2e.py`: lo mismo por HTTPS y `wss://`.
2. **Salas privadas de hasta 4** con código, preparación e inicio (`group.test.mjs`, `browser_group_e2e.py`).
3. **Perfiles propios** y guardado en base de datos (`persistence.test.mjs`, `browser_account_e2e.py`).
4. **Combate compartido** con 4 jugadores, sin muertes ni recompensas duplicadas (`combat.test.mjs`, `browser_combat_e2e.py`).
5. **Reconexión, liderazgo y opciones del anfitrión** (`host.test.mjs`).
6. **Modo producción**: HTTPS/WSS, registros y cierre ordenado (`tests/deploy/`).

## 5. Probar en un solo ordenador

**Windows:** doble clic en `Instalar.bat` (la primera vez) o en `Jugar.bat`. **macOS / Linux:** `Jugar.command` o `./jugar.sh`. El lanzador instala lo que falta, arranca el servidor Colyseus (`http://localhost:2567`) y el cliente (`http://localhost:5173`) y abre el navegador. Es lo mismo que:

```bash
npm install
npm run dev:server        # servidor Colyseus: http://localhost:2567
npm run dev:client        # cliente: http://localhost:5173
```

- Abre `http://localhost:5173` en **dos navegadores distintos**, o en uno normal y otro en ventana privada. Dos pestañas del mismo navegador comparten la sesión: serían la misma cuenta y el servidor no deja entrar dos veces.
- En uno: «Cooperativo online» → invitado → criatura → «Crear partida privada».
- En el otro: invitado → otra criatura → escribe el código → «Unirse a partida» → «Estoy listo».
- El anfitrión pulsa «Iniciar expedición». Moveos los dos con las flechas o WASD.

## 6. Probar con dos ordenadores de la misma red (wifi de casa)

1. **Ordenador A** (hace de servidor y juega): abre `Jugar.bat`, o ejecuta `npm run dev:server` y `npm run dev:client`. La ventana muestra «Otro ordenador de TU CASA puede unirse abriendo: http://192.168.1.23:5173».
2. Si A tiene cortafuegos, permite las conexiones entrantes a los puertos **5173** (cliente) y **2567** (servidor) en redes privadas. En Windows, acepta el aviso del cortafuegos para Node.js.
3. **Ordenador B:**
   - Comprueba primero la conexión: con el proyecto descargado, `npm run check:server -- http://192.168.1.23:2567`. Sin el proyecto, abre `http://192.168.1.23:2567/api/health` en el navegador.
   - Después abre `http://192.168.1.23:5173` en el navegador.
4. Sigue los pasos del apartado 5, un jugador en cada ordenador.

Esto demuestra que dos ordenadores juegan en la misma sala del servidor, pero no que funcione por Internet. Para eso, el apartado 7.

## 6 bis. Jugar con amigos de fuera de casa desde tu PC (lo más sencillo)

El anfitrión abre el juego con **`Jugar.bat`** y, en «Cooperativo online», pulsa **«Crear enlace para amigos»**: su ordenador hace de servidor y aparece un enlace `https://….trycloudflare.com` para mandar a los amigos, que solo necesitan el navegador. Guía completa, límites y seguridad en `docs/ANFITRION.md`. (Probado con un túnel simulado; el túnel real de Cloudflare queda por probar desde dos redes.)

## 7. Probar con dos ordenadores en redes distintas (Internet)

1. Despliega el servidor y publica el cliente siguiendo `docs/DEPLOY.md`. Allí están los **servicios que hay que crear, sus costes y los límites de la opción gratuita**.
2. En **cada** ordenador, por ejemplo uno con la wifi de casa y otro con los datos del móvil:
   ```bash
   npm run check:server -- https://TU-SERVIDOR
   ```
   Comprueba HTTPS, salud, base de datos, WebSocket seguro y latencia. Si falla, dice por qué: DNS, certificado, cortafuegos, servidor dormido…
3. **Prueba de la sala entera** sin una segunda persona:
   - Crea una sala en el navegador del ordenador A.
   - En el ordenador B ejecuta `npm run check:server -- https://TU-SERVIDOR --join CÓDIGO`. Entra como jugador de prueba (una cuenta de invitado nueva, con su propia criatura) y marca «Estoy listo».
   - Inicia la expedición en A y muévete: el comprobador dice «Ves moverse en tiempo real a: …».
4. Recorre la lista del apartado 11 de `docs/DEPLOY.md` con una persona en cada red. Cuando la pase entera, el juego funciona por Internet.

## 8. Variables que controlan el cooperativo

| Variable | Por defecto | Para qué |
|---|---|---|
| `RECONNECT_SECONDS` | 45 | Tiempo que se guarda el sitio si el anfitrión no elige otro |
| `RECONNECT_MAX_SECONDS` | 300 | Máximo que puede elegir el anfitrión (opciones de 30 s, 45 s, 1, 2 y 5 min) |
| `HOST_GRACE_SECONDS` | 10 | Espera antes de pasar el liderazgo si el anfitrión se desconecta (0 = al momento) |
| `CLIENT_ORIGIN` | (desarrollo: cualquiera) | Dirección https:// del juego; obligatoria en producción |

Todas están en `.env.example`, sin ningún secreto.
