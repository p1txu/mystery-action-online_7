# Campaña cooperativa (hasta 4 jugadores, versión 0.41)

Este documento recoge la revisión del multijugador que ya existía, sus límites y las reglas de la campaña en grupo. También dice qué se ha implementado y comprobado, y qué falta.

## 1. Lo que ya había (revisado, no se ha cambiado de tecnología)

| Pieza | Dónde | Estado |
|---|---|---|
| Servidor de salas | Colyseus 0.18 (`@colyseus/core`, `schema` 5, transporte `ws`) | Se mantiene. No se ha añadido ningún otro marco de red. |
| Sala de expedición | `server/src/rooms/ExpeditionRoom.js` | Sala privada con código, `onAuth` con token y versión del protocolo, una cuenta en una sola sala (registro), sitio guardado al desconectarse (`allowReconnection`), cambio de anfitrión, vuelta desde otro dispositivo. |
| Simulación | `server/src/sim/Expedition.js` y el núcleo compartido (`shared/engine-core.generated.js`, sacado del prototipo) | Autoritativa: el cliente solo manda ejes y acciones numeradas. El servidor valida la posición, los tiempos de recarga, el daño, las interacciones, el botín y las misiones. |
| Grupos persistentes | `server/src/rooms/HubRoom.js` | Grupo en la aldea; el líder elige la mazmorra y la sala se crea con una clave que solo conoce el servidor. |
| Perfiles | `server/src/persistence/*` (SQLite o PostgreSQL) | Cada jugador tiene su perfil. Las recompensas se guardan con la clave única (expedición, cuenta): son idempotentes. |

### Límites encontrados (y qué se ha hecho)

| Límite | Consecuencia | Cambio en 0.41 |
|---|---|---|
| El botín del suelo era compartido: el primero que pasaba se lo llevaba | Peleas por el botín y menos botín por jugador en grupo | **Botín individual** (apartado 4) |
| Quien no tenía la región desbloqueada no podía entrar | Un amigo nuevo no podía acompañar al grupo | **Acompañantes** (apartado 3) |
| Reanimar no tenía límites | Se reanimaba sin coste, sin fin | **Reglas de reanimación** (apartado 6) |
| El grupo se hacía «esponja»: con 4 jugadores, enemigos con casi ×3 de vida | Combates largos sin más interés | **Escalado menos esponja y reparto de objetivos** (apartado 5) |
| Si el servidor caía, la expedición se perdía | Había que repetirla entera | **Punto de control** (apartado 7) |
| Un solo proceso: las salas viven en la memoria del servidor (el ordenador del anfitrión) | Si ese ordenador se apaga, la pelea en curso se pierde; solo queda lo guardado | Se acepta. El punto de control limita la pérdida. Repartir salas entre varios servidores necesitaría Redis (presencia y conductor de Colyseus) y no se ha hecho. |
| Misiones de historia | No existen en el código (solo en la biblia). Las misiones del tablón con escolta, rescate o forajido no están en línea (`jobs = []` en la expedición en línea) | **Sin cambio**. Se documenta abajo cómo encajarán. |

## 2. Salas y expediciones

- **Entrar:** solo con el código de invitación (o el enlace) o desde un grupo persistente. El servidor comprueba el token, el protocolo y el código. Sin código, con un código falso o con el de otra sala, no se entra (probado). Una cuenta no puede estar en dos salas.
- **Salir:**
  - «Abandonar» guarda tu resultado como retirada y te saca. El grupo sigue y la dificultad se reajusta.
  - Si se corta la conexión, se te guarda el sitio el tiempo que elige el anfitrión (30 s a 5 min). Vuelves con tu asiento, aunque sea desde otro dispositivo.
- **Sala de espera:**
  - el anfitrión elige la mazmorra y el tiempo de reconexión;
  - todos ven a los demás con su clase, nivel, si están listos, si están conectados (con la cuenta atrás del sitio guardado) y si van como acompañantes;
  - el anfitrión solo puede empezar cuando todos están listos y conectados.
- **Si el líder se va:**
  - en la sala de espera, el liderazgo pasa a quien lleve más tiempo;
  - jugando, igual, tras 10 s de margen si solo ha perdido la conexión;
  - la expedición nunca se cierra por ello;
  - el líder también puede ceder el liderazgo a mano.

## 3. Objetivos de la sesión y progreso de cada perfil

| Compartido por el grupo (la sesión) | Guardado en cada perfil |
|---|---|
| Piso, enemigos, jefe y su fase, puertas, mecanismos, cofres abiertos | Clase, nivel, EXP, movimientos y equipo |
| Bajar escaleras y salir por el portal: hacen falta **todos los despiertos** | Inventario, monedas y botín recogido |
| El grupo cae si caen **todos los conectados** | Mazmorras superadas, puntos de rango, victorias contra jefes y trofeos |
| | Misiones del tablón: avanzan para cada uno con lo que hace él |
| | Punto de control (apartado 7) |

**Regiones bloqueadas:**
- basta con que el anfitrión tenga la mazmorra desbloqueada;
- quien no la tenga va como **acompañante**:
  - gana EXP, botín, monedas y el trofeo del jefe;
  - la mazmorra **no** cuenta como superada para él ni desbloquea la siguiente. Contará cuando la complete con ella desbloqueada;
- la sala de espera lo muestra con una etiqueta «acompañante» y un aviso al empezar.

## 4. Botín

- **Normal, individual:**
  - cada cofre y cada enemigo vencido hace una tirada **para cada integrante** que siga en la expedición (también un desconectado: puede volver);
  - cada objeto tiene dueño. Solo lo ve y lo recoge su dueño; los demás pasan por encima sin llevárselo;
  - el aviso del cofre llega a cada uno con **su** parte.
- **Si alguien se va,** lo suyo que quede en el suelo pasa a ser de todos.
- **Dar algo a un compañero:** lo que un jugador suelta es de todos, para poder dárselo a otro.
- **Únicos:**
  - los trofeos de jefe (`unique`) se dan una sola vez por jugador y expedición (`BossKit.grant`, con `save.bosses`);
  - nunca salen en cofres y **no se pueden soltar**, así que no se duplican ni se pasan.
  - Los objetos de misión del tablón no están en línea. Cuando lo estén, seguirán la misma regla: uno por jugador, ligado a quien tiene la misión.
- **Recompensas finales:**
  - las calcula el servidor (`settle`) y se guardan con `applyResult`, de forma idempotente (clave expedición + cuenta) y con una segunda barrera en la sala (`committed`);
  - el cliente nunca decide monedas, EXP ni equipo.

## 5. Combate y dificultad

- **Estado autoritativo:** enemigos y jefes viven en el servidor y se envían a todos. El jefe (`boss.bk`) dice a todos la fase, el estado, la vulnerabilidad y el motivo.
- **Escalado con el número de jugadores** (`COOP_SCALING`):

| Jugadores | Vida de los enemigos | Vida del guardián clásico | Daño | Élites |
|---|---|---|---|---|
| 2 | ×1,5 (antes 1,7) | ×1,7 (antes 1,9) | +12 % | +7 % |
| 3 | ×1,95 (antes 2,3) | ×2,4 (antes 2,7) | +20 % | +11 % |
| 4 | ×2,4 (antes 2,9) | ×3 (antes 3,5) | +28 % | +15 % |

  Los jefes de BossKit van aparte: vida ×1,6/2,1/2,6.

- **El grupo tiene más trabajo, no más vida que quitar:**
  - más élites y errantes;
  - **reparto de objetivos:** cada enemigo que ya acosa a un héroe (a menos de 200 px) lo hace un 30 % «más lejano» para los demás enemigos (sin contarse a sí mismo), así que se reparten en vez de amontonarse;
  - jefes con ataques de grupo (Gromgar embiste al más lejano y encadena cargas; Robletón lanza raíces a un segundo jugador) que **no existen en solitario**, donde el jefe sigue siendo vencible (probado con héroes que solo se esconden).

## 6. Reanimar

| Regla | Valor |
|---|---|
| Quién | Un compañero despierto a menos de 40 px del caído |
| Tiempo | 2,5 s la primera vez en el piso; +1,5 s cada vez más (como mucho 7 s) |
| Al volver | 35 % de PS, sin energía, 1,5 s de invulnerabilidad |
| Desangrado | 45 s. Solo corre si nadie le está ayudando y está conectado |
| Si llega a 0 | **Fuera de combate** hasta el piso siguiente: ya no se le puede reanimar, pero el grupo sigue. En el piso siguiente vuelve con el 25 % de PS y los contadores a cero |
| Derrota | Si caen todos los conectados, el grupo cae (como antes) |

El caído ve un aviso con su cuenta atrás. Los demás la ven sobre él.

## 7. Expedición interrumpida: punto de control

- **Al llegar al punto de control** de una mazmorra (Gruta, Ciénaga, Mina, Cráter; el Bosque no tiene):
  - el servidor escribe en el perfil de cada integrante `resume = { dungeon, at }`. Solo eso, sin botín ni EXP;
  - todos reciben el aviso «Punto de control guardado».
- **Si la expedición se interrumpe** (reinicio o caída del servidor):
  - con cierre ordenado: se guarda lo conseguido y se conserva el punto de control;
  - con apagón: no se guarda el resultado, pero el punto de control ya está en la base de datos.
- **Continuar:**
  - si **todos** los de la sala tienen el punto de control de esa mazmorra (vigente 7 días), la sala lo ofrece **activado**;
  - el anfitrión puede desactivarlo, y nadie más puede cambiarlo;
  - si entra alguien sin él, se desactiva solo;
  - al empezar, el grupo aparece en el punto de control.
- **Se gasta** con cualquier otro final de **esa** mazmorra (victoria, vuelta a la aldea, derrota o retirada de ese jugador). El punto de control de otra mazmorra no se toca.
- **Grupos persistentes y solitario:** si todos lo tienen, se continúa automáticamente.

## 8. Misiones de historia (pendiente)

La biblia define misiones principales y secundarias, pero el código aún no las tiene: solo están las misiones del tablón, y las de escolta, rescate y forajido no están en línea. Así encajarán en este sistema:

- **Objetivo de la sesión:** lo que hay que hacer en la mazmorra (un jefe, un rescate) es compartido.
- **Progreso de la historia:** se guarda en cada perfil.
  - Quien ya la tenga superada va como acompañante de esa misión: recompensas normales, sin repetir los hitos.
  - Los objetos de historia serán únicos y por jugador.

## 9. Pruebas (reales, no simuladas)

- `tests/campaign.test.mjs` (11 pruebas, simulación real del servidor):
  - botín individual de cofres y enemigos, y que lo de quien se va pasa a ser de todos;
  - soltar objetos normales sí y trofeos no;
  - acompañante;
  - reanimar con tiempos crecientes, desangrado y fuera de combate, y desconectado sin desangrarse;
  - derrota del grupo y solitario igual que antes;
  - reparto de objetivos y escalado;
  - punto de control (guardar, conservar, gastar, otra mazmorra, mazmorra sin él) y su validación al cargar.
- `tests/colyseus/campaign.test.mjs` (Colyseus real, clientes SDK, SQLite en disco):
  - **Fase 1, dos jugadores y un jefe:**
    - intrusos sin código, con código falso o de otra sala;
    - clases y conexión visibles;
    - acompañante;
    - no empezar sin estar listos;
    - Gromgar dañado con entradas reales y su estado idéntico en el servidor y en los dos clientes;
    - corte de Beto en plena pelea (el jefe sigue) y vuelta desde otro dispositivo al mismo asiento, con el jefe como está;
    - recompensas una vez aunque la sala cierre dos veces y se reintente el guardado;
    - trofeo una vez y acompañante sin saltarse la campaña.
  - **Punto de control:**
    - se escribe al llegar;
    - el servidor se apaga sin guardar ningún resultado y vuelve a arrancar;
    - la sala lo ofrece y el anfitrión lo cambia (el invitado no);
    - el grupo empieza en el punto de control;
    - al volver se gasta.
  - Un tercero sin punto de control lo desactiva.
  - El solitario sigue igual.
- `tests/colyseus/browser_campaign_e2e.py` (dos navegadores):
  - etiqueta de acompañante;
  - casilla «Continuar desde el punto de control» y texto para el invitado;
  - empezar en el punto de control;
  - gastado al volver.
- `tests/colyseus/browser_revive_e2e.py`: ahora comprueba también la cuenta atrás del caído (en su pantalla y sobre él en la de su compañera).
