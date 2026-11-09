# Aldea Raíz que evoluciona: reputación, contratos, mejoras y eventos (diseño; versión inicial 0.43)

Todo se construye sobre lo que ya existe y no sustituye nada que funcione:
- la aldea, con sus edificios y casillas (`generateVillage`, `TownScene`);
- los vecinos: el alcalde Bartolo, la maestra Ulula del gremio, el mercader Tobías, el cartero Lino, Doña Musgo, el centinela Roco y Tito Brote;
- el rango del gremio (`points`, `RANKS`), el tablón y las misiones (`Jobs`, `Quests`);
- la tienda (`shopStock`) y el perfil validado (`Save.sanitize`, formato con migraciones).

Leyenda: **[0.43]** implementado y probado · **[diseño]** definido y pendiente.

## 1. Datos (perfil, formato 8)

Todo vive en el perfil de cada jugador. En línea es el perfil del servidor, el único que lo cambia. Lo valida `Save.sanitize` y lo trae la migración 7 → 8, sin perder nada.

| Campo | Contenido | Reglas |
|---|---|---|
| `points` (ya existía) | **Reputación del gremio** | El rango sale de aquí (Normal 0, Bronce 60, Plata 200, Oro 450, Diamante 900). Una penalización nunca te baja de rango |
| `guild.claims` | Recompensas únicas ya cobradas: `boss:<id>`, `event:<id>`, `project:<id>` | Una recompensa con identificador solo se cobra si no está aquí. Tope 300 (se recortan primero los eventos más antiguos) |
| `guild.title` | Título elegido | Solo uno de los desbloqueados; vacío = el del rango |
| `town.upgrades` | Mejoras de la aldea construidas (`forja`, …) | Solo crecen. La aldea se dibuja a partir de ellas |
| `events.active` | Evento regional en curso: `{ id, type, dungeon, floor, variant, startRun, endsRun }` | Uno a la vez. Se valida que la mazmorra exista y esté abierta |
| `events.history` | Últimos 20 eventos: `{ id, type, dungeon, result: 'won' \| 'expired', run }` | |
| `events.nextRun` | Expedición a partir de la cual puede aparecer otro | Tiempo de espera entre eventos |
| `jobs[].project` | Contrato que construye una mejora | Solo ids de `TOWN_UPGRADES` |

**Persistencia:**
- Sin conexión, en `localStorage` con copia de seguridad.
- En línea, en la base de datos. Los cambios llegan solo por las reglas del servidor:
  - al terminar una expedición (`settle`);
  - en las operaciones de la aldea (`deliverJob`, `buy`…), con `opId` y versión.
- **No se mide el tiempo con el reloj:** la duración de un evento se cuenta en expediciones (`runs`), así que cambiar la hora del ordenador no sirve de nada.

## 2. Reputación del gremio

| Fuente | Reputación | Límite |
|---|---|---|
| Contrato o misión entregada | La de la misión (10 + 5 por estrella) | Cada misión se entrega una vez (desaparece al entregarla) |
| Primera vez que superas una mazmorra | +50 (ya existía) | Una vez por mazmorra |
| **Primera victoria contra cada guardián [0.43]** | +40 | Una vez por guardián (`boss:<id>`) |
| **Evento regional resuelto [0.43]** | +30 | Una vez por evento (`event:<id>`) |
| **Evento regional caducado [0.43]** | −10 | Nunca baja de rango |
| Rescate (misión de rescate) | La de la misión | Como las misiones |
| **Ayudar en grupo [0.43]** | +5 a quien ayuda a resolver el evento de otro | Una vez por expedición |

**Desbloqueos por rango:**

| Rango | Contratos | Equipo | NPC y zonas | Títulos |
|---|---|---|---|---|
| Normal | Caza, recolección, exploración, expedición, guardián, **investigación [0.43]**; hasta ★C | Tienda básica | | Explorador novato |
| Bronce | **Caza de élites y cámaras secretas [0.43]**; **proyecto de la forja [0.43]**; hasta ★B | Tienda +1; **forja: Yelmo de Brasa y Botas del Explorador [0.43]** | **Herrera Brasa (tras la forja) [0.43]** | **Explorador de Bronce [0.43]** |
| Plata | Recuperación de reliquias, escolta y defensa de caravanas [diseño]; hasta ★B | Tienda +2; **forja: Guantes de Forja e Insignia del Gremio [0.43]** | Archivo del gremio (zona restringida, puerta tras el gremio) [diseño] | **Explorador de Plata [0.43]** |
| Oro | Limpieza de mazmorras [diseño]; hasta ★A | Tienda +3 | Senda de la Torre: camino cerrado al norte, hacia mazmorras futuras [diseño] | **Explorador de Oro [0.43]** |
| Diamante | Hasta ★S | | | **Explorador de Diamante [0.43]** y estandarte del gremio en la casa del jugador [diseño] |

Las estrellas máximas (`RANK_STARS`) hacen que los contratos difíciles y de rango superior solo aparezcan con el rango que toca. El título se ve en el gremio y en tu ficha.

## 3. Contratos del gremio

Son misiones del tablón (`Jobs`): las mismas reglas para aceptarlas, avanzar y entregarlas, en solitario y en el servidor.

| Tipo | Objetivo | Dónde puede salir | Estado |
|---|---|---|---|
| **Caza de élites** (`elite`) | Vencer 1-3 enemigos élite | Todas las mazmorras (se miden 0,9-7,5 élites por expedición) | **[0.43]** |
| **Investigación** (`lore`) | Leer 2-3 textos del escenario | Solo mazmorras con salas con propósito (hoy, el Bosque: 3,9 por expedición) | **[0.43]** |
| **Cámara secreta** (`secret`) | Encontrar 1 sala secreta | Igual que la investigación (Bosque: 2,6 por expedición) | **[0.43]** |
| Recolección (`collect`) | Encontrar materiales | Ya existía | ✓ |
| **Proyecto** (`collect` + `project`) | Traer 3 fragmentos de cuarzo de la Gruta para la forja | Contrato especial de la herrera, uno solo | **[0.43]** |
| Escolta | Llevar a un vecino a un piso | Ya existe sin conexión; en línea [diseño] | |
| Recuperación de reliquias | Traer un objeto de rareza rara o mejor de una mazmorra | [diseño] | |
| Limpieza de mazmorras | Vencer al guardián tras derrotar al 70 % de los enemigos de cada piso | [diseño] | |
| Defensa de caravanas | Evento con oleadas alrededor de un carro | [diseño] | |

**Sin tareas imposibles ni repetidas:**
- Un contrato solo se ofrece en una mazmorra donde su objetivo puede aparecer (`Jobs.feasible`): los textos y las salas secretas solo existen en los biomas con salas con propósito.
- Las metas están por debajo de lo que sale en una expedición media. Además, el progreso se conserva entre expediciones.
- **Variación:** cada contrato cambia de mazmorra, enemigo objetivo, cantidad, estrellas y objeto de recompensa.
- **Sin repeticiones:** el tablón no repite la combinación (tipo, mazmorra, objetivo) de los contratos aceptados ni de los 6 últimos entregados (`log.jobs`). Lo vuelve a intentar hasta 6 veces.

## 4. Aldea que evoluciona

| Mejora | Condición | Qué cambia | Estado |
|---|---|---|---|
| **Forja de Brasa** | Rango Bronce + Gruta superada → contrato «Mineral para la forja» → entregarlo | La casa en ruinas del sur (4..9 × 20..22) pasa de tablones, agujeros y andamio a forja con fragua encendida, humo, yunque y rótulo. Llega la herrera Brasa con su tienda de equipo especial. Diálogos nuevos del alcalde | **[0.43]** |
| Nuevos diálogos del alcalde | Cada guardián vencido y la forja | Bartolo comenta lo último que has hecho | **[0.43]** (el guardián del Bosque, la Gruta y la forja) |
| Puesto de pescado y cebos | Ciénaga superada + contrato | Puesto junto al estanque | [diseño] |
| Vecinos rescatados | Misiones de rescate entregadas | El vecino rescatado aparece paseando por la aldea | [diseño] |
| Posada | Rango Plata | La taberna abre habitaciones (descanso con bonificación) | [diseño] |
| Región liberada | Guardián vencido por primera vez | La niebla y la hierba seca del borde de la aldea en esa dirección se vuelven verdes (`VILLAGE_PAL`) | [diseño] |

Las mejoras se guardan en `town.upgrades` y la aldea se dibuja según ellas. Cerrar el juego no cambia nada: al volver se ve igual (probado).

## 5. Eventos regionales

**Implementado [0.43]: «Un élite invade»** (`invasor`).

| Aspecto | Regla |
|---|---|
| Aparición | Al volver de una expedición, si: rango Bronce o más, al menos una mazmorra superada, ningún evento en curso y han pasado las 2 expediciones de espera. Probabilidad del 40 %, decidida con la semilla del perfil (repetible, sin `Math.random`). Regiones: las superadas |
| Qué es | Un élite con nombre («Invasor: …», ×2,5 de vida, +2 niveles) en un piso concreto (2 a penúltimo) de esa mazmorra. El gremio y el alcalde lo anuncian |
| Duración | 3 expediciones (de cualquier mazmorra) |
| Resolverlo | Vencerlo: +120 monedas + 40 por mazmorra, +30 de reputación y un elíxir (o su valor si la mochila está llena). Una vez (`event:<id>`) |
| Si caduca | −10 de reputación (sin bajar de rango). «El invasor se ha retirado con su botín» |
| En grupo | Aparece si **algún** integrante lo tiene en curso. Al vencerlo, cada integrante con ese evento lo resuelve (cada uno el suyo). Los que ayudan reciben +5 de reputación, una vez por expedición. Tener el evento no se comparte: cada perfil tiene el suyo |

**[diseño]** Los demás eventos usan la misma estructura (`REGION_EVENTS`: aparición, duración en expediciones, recompensa y consecuencia):

| Evento | Aparece | Duración | Recompensa | Si caduca |
|---|---|---|---|---|
| Caravana desaparecida | Rango Plata, Gruta superada | 3 expediciones | Carro en un piso; escoltarlo hasta las escaleras. Monedas y un precio −10 % en la tienda durante 2 expediciones | Tienda −1 artículo durante 2 expediciones |
| Oleada de monstruos | Cualquier región superada | 2 | Sala de emboscada en un piso; materiales | Más enemigos en esa mazmorra durante 2 expediciones |
| Grieta mágica | Rango Plata | 2 | Mecanismo en un piso (`Mechs`) que hay que cerrar; reliquia | Enemigos élite +5 % en esa región |
| Comerciante atrapado | Tobías ya en la aldea | 3 | Liberarlo: tienda ambulante en la mazmorra con −20 % | Nada (vuelve solo) |
| Expedición rival en apuros | Rango Oro | 2 | Rescatar a un PNJ: título «Salvador» y reputación | −15 de reputación |

## 6. Multijugador

- **Contratos:** cada uno tiene los suyos. Ayudar a un compañero avanza solo tus contratos, si tienes uno del mismo tipo. Las élites cuentan para quien golpea o está cerca (las mismas reglas que la EXP). Los textos y las salas secretas, para quien los lee o entra.
- **Reputación y desbloqueos:** son personales. El acompañante gana reputación con sus propios contratos y eventos, pero sus desbloqueos siguen sus propias reglas (el rango es suyo; la forja la construye cada uno en su aldea).
- **Sin recompensas ilimitadas:**
  - cada evento se resuelve una vez por perfil (`event:<id>` en `guild.claims`), dentro de la expedición;
  - el resultado se guarda una vez por (expedición, cuenta) en `rewards`;
  - reconectarse, cambiar de líder o reanudar tras una caída continúa la misma expedición, con los perfiles de la instantánea, así que los `claims` ya cobrados siguen ahí;
  - el invasor vencido no vuelve: es un enemigo del piso guardado en la instantánea.

## 7. Pruebas de la versión inicial (0.43)

| Prueba | Qué comprueba |
|---|---|
| `tests/town.test.mjs` (9, núcleo y simulación real del servidor) | Reputación: +40 una vez por guardián, la penalización no baja de rango, títulos. Contratos en 300 tablones: rango, viabilidad, estrellas y que salen los tres tipos nuevos; sin repeticiones recientes; la caza de élites, la investigación y la cámara secreta avanzan en el servidor y se entregan con `rules.js`. Forja: proyecto con rango y Gruta, construida una vez, equipo según el rango y compra rechazada sin forja. Evento: determinista, caducidad, invasor en su piso, resuelto una vez en grupo, ayuda +5 una vez, reintentos sin efecto, y al reanudar no vuelve. Formato 8: migración desde el 7 y guardar/cargar |
| `tests/colyseus/town.test.mjs` (2, Colyseus real y SQLite) | Evento en grupo en línea: los dos ven al invasor; Ana lo resuelve (+30, +160) y Beto ayuda (+5); ceder el liderazgo y reconectarse no lo repiten; sigue igual tras reiniciar el servidor. Forja en línea: entrega y compra repetidas con el mismo `opId` no se aplican dos veces; sigue igual tras reiniciar |
| `tests/e2e/town_e2e.py` (navegador, sin conexión) | Ruinas → contrato → forja y Brasa sin salir de la aldea. Brasa vende Bronce y no Plata; el alcalde lo comenta. Invasor vencido una vez. **Se cierra la página y se vuelve a cargar:** forja, Brasa, la compra, el evento resuelto, la reputación, el título y los comentarios del alcalde siguen ahí. Capturas `town_ruinas.png`, `town_forja.png` y `town_forja_recargada.png` |
