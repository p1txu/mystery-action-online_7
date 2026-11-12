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

## INF-010 · GitHub como canal de coordinación y entorno local de IA, fase A (auditoría)

- **Fecha:** 2026-11-12.
- **Ramas:**
  - `coordinacion`: este informe, el README (procedimiento y punto de entrada para ChatGPT), D-029 y D-030;
  - **sin cambios de código** ni ramas de tarea nuevas;
  - `main` sigue en 0.46 (`5d28bcf`).
- **Decisiones:** D-029 y D-030 (aprobadas por el director el 2026-11-12, con cita). A D-022 se le añade una nota; sigue en propuesta.

### 1. Coordinación por GitHub (D-029)

- **Comprobación previa:** `origin` traído; `coordinacion` limpia y en `42dc185`, igual que `origin`. Las demás ramas también coinciden con `origin`. No había trabajo ajeno sin integrar.
- **`README.md`:**
  - sección **«Revisa Eldoria»** con el orden de lectura y direcciones directas (también en texto sin formato);
  - sección **«Al terminar cada tarea»** con los 7 pasos del procedimiento, incluida la privacidad.
- **`ESTADO_PROYECTO.md`:** indica arriba cuál es el último informe.

### 2. Entorno local de IA en el equipo del director: fase A (auditoría, solo lectura)

Resumen técnico seguro (D-029, regla de privacidad): **no se publican datos del equipo más allá de lo técnico necesario.**

**Qué se hizo:** consultar la información del sistema del equipo. **No se instaló, descargó ni modificó nada.**

**Equipo**

| Componente | Dato |
|---|---|
| Sistema | Windows 11 Pro, compilación 26200 |
| Gráfica | AMD Radeon RX 7800 XT (Navi 32, gfx1101), 16 GB de VRAM (especificación de la tarjeta; no confirmada en el Administrador de tareas) |
| Controlador | Rama Adrenalin 26.x, almacén de controladores 32.0.31041.x |
| RAM | 32 GB. Con muchas aplicaciones abiertas, el uso rondaba el 79 % |
| Disco | Espacio suficiente en un SSD NVMe secundario. Se usará una carpeta independiente, fuera del juego y del repositorio |

**Compatibilidad investigada** (fuentes oficiales, noviembre de 2026)

| Herramienta | Situación |
|---|---|
| ComfyUI | v0.43.0. Su documentación incluye la RX 7800 XT (`device-gfx1101`) con ROCm en Windows 11. Paquete portátil oficial para AMD. Soporte oficial de AMD en Windows desde enero de 2026 |
| Matriz oficial de AMD para Windows | ROCm 7.2.1, PyTorch 2.9, Python 3.12. Nombra la RX 7700 (mismo chip gfx1101), **pero no la RX 7800 XT** |
| Krita AI Diffusion | 1.53.0. Admite AMD con ROCm. Conecta con un ComfyUI propio y necesita 4 nodos adicionales (controlnet_aux, IPAdapter_plus, inpaint-nodes, tooling-nodes). Está hecho para **Krita 5** (recomienda 5.3.2.1), no para Krita 6 |

**Modelos candidatos** (fase C; licencia a revisar de nuevo antes de descargar)

| Modelo | Licencia | Estado |
|---|---|---|
| Z-Image Turbo (6B) | Apache 2.0 | Candidato |
| FLUX.2 klein 4B | Apache 2.0; ~13 GB de VRAM | Candidato |
| SDXL base 1.0 | Open RAIL++-M | Candidato |
| FLUX.2 klein 9B, FLUX dev | No comerciales | **Descartados** |

**Riesgos presentados al director**

1. ROCm en Windows es reciente: hay casos de cierres o de lentitud (por ejemplo, con modelos GGUF en la RX 7800 XT).
2. Puede hacer falta actualizar el controlador. Eso lo haría el director.
3. Con muchas aplicaciones abiertas queda poca RAM libre.
4. Krita guarda su configuración y sus plugins en la carpeta de usuario, no en la carpeta del entorno.
5. **Sin terminal en el equipo:** la instalación se hace manejando la pantalla y el director debe aceptar los avisos de Windows. No se desactiva ninguna medida de seguridad.
6. Un arte solo con IA tiene problemas de coherencia y de derechos (D-022 y D-030); el retoque del director los reduce.

**Pruebas:** no aplica (fase de auditoría, sin instalación).

**Errores:**

- En la auditoría, el Administrador de tareas no aceptó clics de control remoto, probablemente porque se ejecuta con permisos elevados. Sin efecto en el resultado: los datos se obtuvieron de la información del sistema.
- El encargo del director llegó cortado en su sección 6 (reglas de seguridad).

**Pendiente del director antes de la fase B**

1. El resto de la sección 6 del encargo.
2. Elegir ComfyUI portátil para AMD (recomendado: todo en la carpeta del entorno) o ComfyUI Desktop.
3. Visto bueno a las descargas: ComfyUI portátil AMD, Krita 5.3.x portátil, Krita AI Diffusion 1.53.x y los 4 nodos, todo de fuentes oficiales.
4. Estar presente para aceptar los avisos de Windows.

---

## INF-009 · Dirección artística «Hybrid 2D Fantasy»: documentación y pruebas aisladas (sin cambios en el juego)

- **Fecha:** 2026-11-11.
- **Rama:** `tarea/direccion-artistica`, commit `05a1d8e` sobre `main` 0.46. Subida a GitHub y **sin fusionar**. Solo los ocho documentos de `docs/arte/`.
- **Decisiones:** D-015 a D-019 (aprobadas por el director el 2026-11-11, con su alcance exacto) y D-020 a D-028 (propuestas).
- **Etiqueta local de referencia:** `referencia/antes-direccion-artistica` (= `main`).

**Objetivo.** Aplicar las decisiones AD-1 a AD-11 del director: dirección, documentación aprobada y análisis, sin modificar el juego.

**Documentos** (`docs/arte/`)

| Documento | Contenido |
|---|---|
| `BIBLIA_ARTISTICA.md` | Estilo, contorno, materiales, paletas, luz, proporciones, escenarios, animación, coherencia, interfaz, lista de aceptación y referencias |
| `MUNDO_Y_PERSONAJES.md` | Fichas de zonas, clases, vecinos, familias de enemigos y jefes; bosque abierto: A, B1 y B2 |
| `PIPELINE_ASSETS.md` | Niveles, vistas, comparativa de animación, formatos, atlas, memoria, organización y diseño de distribución |
| `ARQUITECTURA_ARTE.md` | Separación entre reglas y presentación, transición temporal, pruebas de resolución y comparación Canvas 2D/PixiJS |
| `PROTOTIPO_GUERRERO.md` y `PROTOTIPO_BRUMAVERDE.md` | Especificación de los pilotos |
| `PLAN_PRODUCCION_ARTE.md` | Etapas según AD-11, modelo de producción y derechos, rendimiento, herramientas, esfuerzo, riesgos y decisiones pendientes |
| `INVENTARIO_ASSETS.md` | Lo que hay que producir, contado en el código |

**Pruebas aisladas**

- Hechas fuera del repositorio, sobre una copia del prototipo y una página aparte, en Chromium sin GPU. **Los tiempos son pesimistas; vale la proporción.**
- **Juego real, piso del Bosque con 4 héroes, 16 enemigos y combate:**
  - con el arte actual, pasar a resolución real multiplica el dibujo por **3,7 en 1080p** (de 10 a 37 ms) y por **10 a dpr 2**;
  - el arte actual sigue viéndose pixelado.
- **Escena sintética con figuras de alta resolución:**
  - con el búfer actual, la ilustración queda pixelada (SSIM 0,76) o borrosa con suavizado (0,78);
  - a resolución real se conserva (0,95–0,99).
- **Niveles:** un recurso demasiado grande para la pantalla también empeora en Canvas 2D. De ahí la propuesta Ligero 2, Estándar 3 y Alto 4–5 px/u.
- **Conclusión:** pintar a resolución real es necesario, pero no suficiente por sí solo. No hace falta reescribir el renderizador: `k = 1` ya funciona con el juego actual. Los 60 fps solo se pueden validar en equipos reales.

**Pruebas del repositorio:** `node tools/split-prototype.mjs --check` correcto. No hay cambios de código, así que la batería no aplica.

**Pendiente**

- Revisión del director y de ChatGPT.
- Decisiones D-020 a D-028.
- Medición en los equipos del director con la página de prueba (entregada fuera del repositorio).
- Autorización para descargar PixiJS solo en pruebas (D-025).

---

## INF-008 · Auditoría visual: capturas reales del juego (sin cambios en el juego)

- **Fecha:** 2026-11-10.
- **Rama:** `tarea/auditoria-visual`, commit `3b9885d` sobre `main` 0.46. Subida a GitHub y **sin fusionar**. Solo documentación e imágenes.
- **Informe:** `docs/AUDITORIA_VISUAL_ELDORIA.md` y capturas en `docs/capturas/auditoria-visual/` (en la rama).

**Objetivo.** Que ChatGPT pueda evaluar el aspecto real y actual del juego.

**Qué se hizo**

- **39 capturas** del juego en ejecución, a 1600 × 900, sin retoques:
  - mundo de `main` 0.46;
  - interfaz publicada y la del rediseño de `tarea/interfaz-mmo`;
  - indicador de `tarea/arquero-apuntado`.
- **Ampliaciones por vecino más próximo.**
- **Inventario de recursos gráficos.** No hay imágenes en el repositorio: todo el arte se genera por código en el prototipo.
- **Clasificación:** propio, reutilizado y provisional.
- **11 problemas visuales observados**, entre ellos:
  - mezcla de pixel art y dibujo vectorial (jefes y 15 variantes de enemigos);
  - el Linde no parece exterior;
  - suelos con ruido;
  - mazmorras oscuras;
  - HUD cargado;
  - título «Mystery Action».
- **Limitaciones técnicas:**
  - no hay canal de recursos;
  - la escala de píxel no es entera;
  - conviven dos sistemas de dibujo;
  - las fuentes dependen de Google Fonts.

**Archivos nuevos**

- `docs/AUDITORIA_VISUAL_ELDORIA.md`;
- `docs/capturas/auditoria-visual/*.png` (39, unos 13 MB);
- `docs/capturas/auditoria-visual/capturas.py` (guion para repetir las capturas).

**Archivos modificados:** ninguno. El juego no cambia.

**Pruebas**

- `node tools/split-prototype.mjs --check`: los archivos generados siguen al día.
- No se ejecutó la batería porque no hay cambios de código.

**Cómo se capturó**

- **Navegador:** Chromium sin GPU, controlado con Playwright.
- **Fuentes:** Cinzel y Alegreya Sans, instaladas localmente desde `google/fonts` (OFL), porque Google Fonts no es accesible desde este entorno.

**Pendiente**

- Evaluación independiente de ChatGPT, que se transcribirá como REV.
- **Propuesta:** no fusionar las capturas en `main`. El lanzador descarga el repositorio y cada actualización de los jugadores pesaría unos 13 MB más. Bastaría fusionar solo el informe o mantenerlo en la rama. Lo decide el director.

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
