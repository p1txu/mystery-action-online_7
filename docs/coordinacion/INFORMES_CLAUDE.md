# Informes de Claude

- **Orden:** el informe más reciente va primero.
- **Cómo se cambia:** solo se añaden entradas. Una corrección es una entrada nueva que cita a la anterior.
- **Respuestas a revisiones:** las respuestas de Claude a las revisiones de ChatGPT van aquí, como `INF-NNN · Respuesta a REV-NNN`.

**Cómo se indica cada prueba**

| Marca | Significado |
|---|---|
| «automatizada» | Se ha ejecutado de verdad (Node, Colyseus real o navegador con Playwright) |
| «manual» | La ha hecho una persona |
| «no realizada» | No se ha podido hacer |

Hasta hoy no se ha hecho ninguna prueba manual: todas las de navegador son automatizadas.

Los informes INF-001 a INF-007 se redactaron el 2026-11-10, al crear esta carpeta, a partir de lo hecho ese día. Cada uno indica sus commits y documentos.

---

## INF-007 · Apuntado del Arquero: corrección y asistencia

- **Fecha:** 2026-11-10.
- **Rama:** `tarea/arquero-apuntado`, commit `94afb02` sobre `main` 0.46. Subida a GitHub y **sin fusionar**.
- **Referencia anterior:** etiqueta local `referencia/antes-arquero-apuntado` (= `5d28bcf`).
- **Encargo:** D-004.
- **Detalle técnico y mediciones:** `docs/ARQUERO_APUNTADO.md`, en la rama.

**Objetivo.** Que un disparo bien apuntado acierte. Asistencia opcional sin convertir al Arquero en disparo automático.

**Cambios**

- **Cursor sobre el dibujo de un enemigo:** el disparo va a sus pies (círculo de impacto). Solo el Arquero.
- **Asistencia** (Opciones, activada por defecto):
  - candidatos: enemigos a ≤ 12° de la línea del ratón con línea de tiro libre;
  - prioridad: el más cercano a la trayectoria;
  - corrección completa hasta 9° y decreciente hasta 0 a los 12°;
  - objetivo estable durante 0,25 s;
  - **sin adelantar** el disparo;
  - indicador discreto a los pies del enemigo.
- **En línea:** el destello de impacto solo aparece con daño confirmado por el servidor.
- **Apuntado sin ratón:** ya no elige enemigos detrás de muros. Afecta a todas las clases, porque la función es compartida.
- **Lo que no cambia:** daño, alcance, velocidad, reglas del servidor y el Mago.

**Archivos**

- **Modificados:**
  - `prototype/mystery-action.html`;
  - los que se generan a partir de él: `client/index.html`, `client/public/game.js` y `shared/engine-core.generated.js`;
  - `tests/colyseus/serve-for-browser.mjs` (controles solo de prueba: `dummies`, `enemyHp`);
  - `tests/run-all.sh`.
- **Nuevos:**
  - `tests/e2e/archer_aim_e2e.py`;
  - `tests/e2e/archer_aim_bench.py`;
  - `tests/colyseus/browser_archer_e2e.py`;
  - `docs/ARQUERO_APUNTADO.md`.

**Pruebas**

- **Automatizadas:**
  - batería completa: 215 unitarias, 29 de Colyseus, 21 de despliegue y todos los recorridos de navegador correctos;
  - nuevas: 12/12 sin conexión y 5/5 en línea con 280 ms de latencia.
- **Mediciones** (antes / ahora sin asistencia / ahora con asistencia):

  | Caso | Antes | Sin asistencia | Con asistencia |
  |---|---|---|---|
  | Mediano quieto, clic en la cabeza | 18/36 | 36/36 | 36/36 |
  | Robletón, clic en la parte alta | 4/12 | 12/12 | 12/12 |
  | Ratón a 6° | 0/12 | 1/12 | 12/12 |
  | Ratón a 16° | 0/12 | 0/12 | 0/12 |
  | Enemigo que cruza de lado | 0/12 | 0/12 | 0/12 |
  | Detrás de un muro | — | — | 0 correcciones |

  En línea, destellos = impactos del servidor en todos los casos medidos.
- **No realizadas:** prueba manual del tacto de la asistencia.

**Pendiente**

- Si la asistencia se aplica al Mago (decisión del director tras ver el Arquero).
- La selección de objetivo, junto a los controles táctiles.
- El retraso de 100 ms con que se dibujan los enemigos en línea no se compensa, porque sería adelantar el disparo.

---

## INF-006 · Diagnóstico del apuntado del Arquero (sin cambios de código)

- **Fecha:** 2026-11-10.
- **Rama:** ninguna; solo análisis.

**Hallazgos**

- **Hitboxes:** el impacto cuenta en el círculo de los pies, mucho más pequeño que el dibujo. Un clic en la parte alta del sprite fallaba en los disparos casi horizontales: un 50 % en enemigos medianos y en jefes.
- **Enemigos laterales:** los que cruzan de lado no se alcanzan sin adelantar el disparo.
- **En línea:**
  - los enemigos se dibujan 100 ms en el pasado;
  - la flecha local mostraba impactos que el servidor no confirmaba.
- **Sin ratón:** el apuntado elegía enemigos tras muros.

**Propuesta.** Tres pasos; el director aprobó los pasos 1 y 2 en D-004.

---

## INF-005 · Auditoría integral de Eldoria (sin cambios de código)

- **Fecha:** 2026-11-10.
- **Auditado:** `tarea/interfaz-mmo` (0.46 más la interfaz).
- **Informe completo:** documento «Auditoría integral de Eldoria». Está guardado en el proyecto de Claude (no en este repositorio); si el director lo autoriza, se puede copiar aquí.

**Resultado.** Ningún problema crítico.

- **Errores confirmados:** E-1 (semillas en línea), E-2 (7 consumibles no funcionan en línea), E-3 y E-4 (bajos).
- **Incompletos:** I-1 (habilidades) e I-2 (controles táctiles).
- **Rendimiento:** con 4 jugadores y 80 enemigos, el servidor usa el 11 % del tiempo de cada paso y no acumula memoria en 10 minutos simulados.

**Pruebas**

- **Automatizadas:**
  - la batería completa;
  - sondas en la simulación del servidor: costes de las 4 clases, 52 piezas de equipo, 24 consumibles, 47 enemigos, 3.000 partidas dañadas, progresión al nivel 50, mensajes falsos al servidor y rendimiento;
  - navegador contra el servidor real para E-1 y E-2.
- **No realizadas:** prueba manual, dispositivos táctiles reales, Internet y PostgreSQL.

**Propuesta de prioridades** (no aprobada): E-1, E-2, I-1, I-2.

---

## INF-004 · Rediseño de la interfaz: consumibles e inventario

- **Fecha:** 2026-11-10.
- **Rama:** `tarea/interfaz-mmo`, commits `a3972ab` y `00d6d8f` sobre `main` 0.46. Subida a GitHub y **sin fusionar**.
- **Referencia anterior:** etiqueta local `referencia/antes-interfaz-mmo` (= `5d28bcf`).
- **Encargo:** D-003.
- **Detalle técnico:** `docs/INTERFAZ_INVENTARIO.md`, en la rama.

**Cambios**

- **Barra de consumibles (X, Z, C):**
  - icono del objeto que se usará, cantidad y estado (vacío, lleno o bloqueado) con su motivo;
  - una pulsación gasta una sola unidad.
- **Inventario en dos paneles**, común a aldea y expedición:
  - cinco pestañas;
  - seis ranuras reales;
  - sprite real de la clase;
  - estadísticas base, de equipo y total;
  - vista previa que no cambia nada.
- **Interacciones:** arrastrar y soltar y doble clic con las acciones reales; confirmación al tirar o vender algo valioso.
- **En línea:**
  - equipo de solo lectura en la expedición;
  - la ventana abierta se actualiza con el perfil del servidor;
  - en la aldea los consumibles no se gastan.
- **Corregido:** el texto «x/3 piezas equipadas» (son 6 ranuras).

**Pruebas**

- **Automatizadas:**
  - batería completa correcta;
  - nuevas: inventario sin conexión 18/18 (incluye emulación táctil) y en línea 8/8.
- **No realizadas:** prueba manual y dispositivos táctiles reales.

**Pendiente**

- Reordenar la mochila arrastrando objetos: el servidor no guarda el orden.
- Asignar atajos a mano (la opción B, no elegida).

---

## INF-003 · Protocolo de colaboración (sin cambios de código)

- **Fecha:** 2026-11-10.
- **Qué se hizo:** se estableció el protocolo (D-001 y D-002) y, después, este sistema de coordinación (D-005).
- **Configuración local:** la copia clonada del repositorio sigue las ramas `tarea/*`.

---

## INF-002 · Auditoría del capítulo 1 y correcciones (0.46)

- **Fecha:** 2026-11-10.
- **Commit:** `5d28bcf`, **en `main`**. Se subió antes del protocolo actual.
- **Informe:** `docs/AUDITORIA_CAPITULO_1.md`.

**Correcciones**

- Seguimiento de la campaña en el HUD.
- Progreso de la campaña en línea durante la expedición (evento `campaign`).
- Aviso al leer un rastro con peligro cerca.
- Orden de las conversaciones con Nara.
- Aviso doble de la aldea.
- Introducción que se repetía.
- Documentación.
- Una prueba inestable de la 0.44.

**Pruebas (automatizadas):** batería completa correcta, con 3.000 partidas al azar de las misiones sin cobros dobles.

---

## INF-001 · Capítulo 1 «Las raíces enfermas» (0.45)

- **Fecha:** 2026-11-10.
- **Commit:** `dbc011f`, **en `main`**. Se subió antes del protocolo actual.
- **Documentación:** `docs/CAPITULO_1.md`.

**Contenido**

- **Personajes y misiones:** introducción de Bartolo, la Maestra Ulula, Nara Vey; misión principal y cuatro secundarias.
- **Zona y mazmorra:** zona Linde de Brumaverde, Estela tibia, refugio de Gil y Robletón como cierre.
- **Mundo:** cambio visible en la aldea; guardado v10.
- **Cambio de nombre:** el Bosque Brumoso pasa a ser el Bosque de Brumaverde, por indicación del director en el encargo.

**Pruebas (automatizadas):** batería completa correcta, con las nuevas pruebas del capítulo (unitarias, Colyseus y navegador).

**Pendiente:** Nara Vey (P-14) y Gil (P-15) siguen siendo propuestas narrativas sin aprobar.
