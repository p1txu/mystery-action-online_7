# Apuntado del Arquero: corrección y asistencia

- **Rama:** `tarea/arquero-apuntado`.
- **Referencia anterior:** etiqueta `referencia/antes-arquero-apuntado`, es decir, `main` en la 0.46.
- **Sin cambios de juego:** el daño, el alcance, la velocidad de las flechas y las reglas del servidor no cambian. Todo es del cliente: el servidor sigue recibiendo una dirección y simulando la flecha como siempre.

## Paso 1: lo que ves es lo que cuenta

| Cambio | Dónde |
|---|---|
| Si el cursor está sobre el **dibujo** de un enemigo, el disparo del Arquero va a sus **pies**, que es lo que cuenta para el impacto (el círculo del suelo). Antes, un clic en la parte alta del sprite desviaba la trayectoria por encima de los pies en los disparos casi horizontales | `Game.enemyUnder`, `Game.archerAim` |
| **En línea**, el destello de impacto sale cuando el servidor confirma el daño: tras un contacto de la flecha local o de un ataque propio reciente. Antes salía al tocar el dibujo del enemigo aunque el servidor fallara | `NetPlay.localHit` y la sincronización de enemigos |
| El **apuntado sin ratón** (teclado) ya no elige enemigos detrás de un muro (para todas las clases) | `Game.getAim`, `Game.clearShot` |

`clearShot` usa la misma prueba de muros que la flecha (`BLOCKS_SHOT` y bloques).

## Paso 2: asistencia (solo el Arquero)

- **Dónde se configura:** Opciones, «Asistencia de apuntado del Arquero». Activada por defecto y guardada en el dispositivo.
- **Habilidades a las que afecta:** el básico y el Flechazo cargado. No afecta al Mago ni a otras clases.

| Regla | Valor |
|---|---|
| Dirección principal | El ratón |
| Candidatos | Enemigos vivos, en alcance, a ≤ 12° de la línea del ratón, **con línea de tiro libre** |
| Prioridad | La menor distancia **a la trayectoria** (perpendicular), no al jugador |
| Corrección | Completa hasta 9°; de 9° a 12° baja de forma continua hasta 0. Sin saltos en el borde |
| Estabilidad | Un objetivo nuevo se mantiene al menos 0,25 s. Después solo cambia si otro está claramente más cerca de la línea (menos del 70 %) |
| Movimiento del objetivo | **No se adelanta**: se apunta a donde está |
| Indicador | Cuatro trazos dorados finos a los pies del enemigo al que va el disparo. Solo con la asistencia activada y línea libre |

Con la asistencia desactivada, el disparo va exactamente al ratón, salvo la corrección del paso 1 (cursor sobre el dibujo → pies). Con o sin asistencia, se puede apuntar a cualquier enemigo o al vacío.

## Mediciones

### Sin conexión

`tests/e2e/archer_aim_bench.py`: el juego real en el navegador, el ratón del juego y `Player.tryBasic`. Cada celda es «aciertos / disparos».

| Escenario | Antes | Ahora, sin asistencia | Ahora, con asistencia |
|---|---|---|---|
| Quieto pequeño, clic en pies, centro o cabeza | 36/36 | 36/36 | 36/36 |
| Quieto pequeño, clic en el centro con error ±14 px | 62/72 | 64/72 | 72/72 |
| Quieto mediano, clic en la cabeza | **18/36** | **36/36** | 36/36 |
| Quieto mediano, clic en el centro ±14 px | 65/72 | 72/72 | 72/72 |
| Jefe (Robletón), clic en la parte alta | **4/12** | **12/12** | 12/12 |
| Se acerca (110 px/s), ±10 px | 12/12 | 12/12 | 12/12 |
| Cruza de lado (90 px/s), apuntando a donde está | 0/12 | 0/12 | **0/12** (no se adelanta) |
| Tres enemigos juntos, clic en el central | 12/12, ninguno a otro | 12/12 | 12/12, ninguno a otro |
| Ratón a 6° del enemigo | 0/12 | 1/12 | 12/12 |
| Ratón a 11° (borde) | 0/12 | 0/12 | 4/12 (corrección parcial) |
| Ratón a 16° (fuera) | 0/12 | 0/12 | 0/12 |
| Enemigo tapado por un muro, ratón a 5° | 0 | 0 | 0 marcas y 0 correcciones cuando el muro tapa la línea |

### En línea

`tests/colyseus/browser_archer_e2e.py`: dos navegadores, servidor real y **280 ms de ida y vuelta**.

- **Enemigos quietos pequeños y medianos:**
  - con un clic en la cabeza, todos los disparos dañan en el servidor;
  - con error de ±14 px, aciertan 8/8 con asistencia y 5–6/8 sin ella.
- **Destellos:** en todos los casos, **destellos = impactos confirmados por el servidor**. Antes salía uno por cada contacto local, aunque el servidor fallara.
- **Enemigos reales en movimiento:** 16 disparos por modo, sin adelantar. Los aciertos son bajos y variables con o sin asistencia (unos 3–7 de 16), porque los limitan la latencia y el movimiento, no el apuntado. La asistencia no los convierte en aciertos automáticos.

## Pendiente o fuera de alcance

- **Mago:** no tiene la corrección ni la asistencia (decisión del autor).
- **Selección manual de objetivo:** se hará junto a los controles táctiles.
- **Retraso de 100 ms con que se dibujan los enemigos en línea:** no se compensa, porque eso sería apuntar a una posición futura.
- **Sin ratón (teclado):** el Arquero sigue usando el apuntado automático de siempre (cono de 35°), ahora sin enemigos tras muros.
