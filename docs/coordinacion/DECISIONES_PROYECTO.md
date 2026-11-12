# Decisiones del proyecto

- **Quién aprueba:** solo el director. Claude y ChatGPT pueden **proponer**: se añade una entrada en estado «propuesta».
- **Cómo cambia un estado:** el estado pasa a «aprobada» o «rechazada» solo cuando el director lo dice expresamente. La entrada recoge la fecha y una cita breve de su aprobación.
- **Sin cambios silenciosos:** una decisión aprobada no se modifica. Si cambia, se añade una entrada nueva con «Sustituye a D-NNN» y en la antigua se anota «Sustituida por D-NNN».
- **Decisiones narrativas:** están en la biblia (`docs/BIBLIA_NARRATIVA_ELDORIA.md`, sección de decisiones abiertas P-01 a P-15). Aquí solo se enlazan.

## Campos de cada entrada

| Campo | Contenido |
|---|---|
| **Id** | `D-NNN` |
| **Estado** | aprobada / propuesta / rechazada / sustituida |
| **Propuesta** | Qué se decide |
| **Alternativas** | Qué otras opciones se valoraron |
| **Autor de la propuesta** | Quién la planteó |
| **Aprobación** | Quién la aprobó, cuándo y con qué palabras |

---

## A. Decisiones aprobadas

### D-001 · Protocolo de colaboración

- **Estado:** aprobada.
- **Autor:** el director.
- **Aprobación:** el director, 2026-11-10 («Quiero establecer un protocolo permanente de colaboración…»).
- **Alternativas:** no se plantearon.

**Propuesta**

- Claude es el programador principal y ChatGPT, arquitecto, diseñador y revisor.
- Antes de modificar nada, Claude revisa la estructura y el estado de Git.
- No se sobrescribe ni elimina trabajo sin autorización.
- Solo se implementan las tareas pedidas.
- Se mantiene la compatibilidad con la arquitectura.
- Se pasan las pruebas después de cada cambio.
- No hay push, merges ni cambios en ramas principales sin autorización.
- No se publican secretos ni archivos `.env`.
- Hay un informe de cierre por tarea.
- Las propuestas de ChatGPT se analizan antes de implementarlas.

### D-002 · Ramas de trabajo y autorización de subida

- **Estado:** aprobada.
- **Autor:** Claude (propuesta de flujo) y el director (condiciones).
- **Aprobación:** el director, 2026-11-10 («Te autorizo a crear y subir ramas de trabajo para revisión… pero únicamente después de ejecutar las pruebas…»).
- **Alternativas:** pedir permiso para cada subida.

**Propuesta**

- Claude trabaja sobre la copia clonada del repositorio, en ramas `tarea/<nombre>` creadas desde `main`.
- Puede subir esas ramas a GitHub **después** de ejecutar las pruebas y comprobar que el trabajo está listo.
- Nunca sube directamente a `main`, no fusiona y no toca la rama principal sin autorización expresa.
- Antes de cada tarea se guarda el estado como referencia (etiqueta local).
- Se trabaja por fases, reutilizando los sistemas que ya funcionan.

### D-003 · Interfaz: barra de consumibles e inventario

- **Estado:** aprobada.
- **Autor:** ChatGPT (propuesta de rediseño, entregada por el director), analizada y ajustada por Claude.
- **Aprobación:** el director, 2026-11-10 («Te doy el visto bueno para comenzar con el rediseño, siguiendo estas decisiones…»).
- **Implementación:** INF-004, rama `tarea/interfaz-mmo`, pendiente de fusión.
- **Modificada en parte por D-015** (2026-11-11): el punto «Estilo» pasa a la dirección ilustrada «Hybrid 2D Fantasy». Lo demás de D-003 sigue vigente. El texto original se conserva abajo sin cambios.

**Propuesta**

- **Atajos: opción A.** Cada atajo muestra automáticamente el mejor objeto disponible de su tipo.
- **Teclas:** X (curación), Z (comida) y C (energía); Q ya es una habilidad.
- **Sin enfriamientos** artificiales en los objetos.
- **Motivo visible** cuando un atajo no se puede usar.
- **Ventana de inventario común** a aldea y expedición, sin mezclar sus datos ni sus reglas:
  - las cinco pestañas existentes;
  - las seis ranuras reales;
  - sin inventar ranuras, objetos ni estadísticas.
- **En una expedición en línea**, el equipo se puede consultar pero no cambiar.
- **Sprite real de cada clase**, sin simular capas de equipo.
- **Arrastrar y soltar y doble clic** con las acciones reales. Si no vale, nada se mueve.
- Se conservan los controles táctiles actuales.
- **Estilo:** el visual de Eldoria, sin emojis ni iconos genéricos.

**Alternativas**

- Atajos asignables a mano (opción B): necesitan cambios en el guardado y en el servidor.
- Usar la tecla Q (ocupada).
- Permitir equipar en línea durante la expedición.

### D-004 · Apuntado del Arquero: corrección y asistencia

- **Estado:** aprobada.
- **Autor:** Claude (diagnóstico INF-006 y propuesta); el director fijó los parámetros.
- **Aprobación:** el director, 2026-11-10 («AUTORIZO EL PASO 1 Y LA IMPLEMENTACIÓN POSTERIOR DE LA ASISTENCIA, CON ESTAS CONDICIONES…»).
- **Implementación:** INF-007, rama `tarea/arquero-apuntado`, pendiente de fusión.

**Propuesta**

- **Paso 1:**
  - disparo a los pies del enemigo señalado;
  - en línea, destello solo con impacto confirmado por el servidor;
  - el apuntado sin ratón respeta los muros.
- **Paso 2, asistencia:**
  - **12°** como máximo;
  - **activada por defecto** y desactivable en Opciones;
  - el ratón manda;
  - prioridad al enemigo más cercano a la trayectoria;
  - nunca detrás de obstáculos;
  - corrección gradual;
  - estabilidad de unos 0,25 s;
  - indicador discreto;
  - **sin adelantar** el disparo.
- **Límites:**
  - no se cambia el daño, el alcance, la velocidad ni el equilibrio;
  - **el Mago todavía no**;
  - **la selección manual de objetivo, más adelante**, con los controles táctiles.

**Alternativas**

- Asistencia de 10° o 15°.
- Adelantar el disparo.
- Asistencia también para el Mago.
- Las tres configuraciones a la vez.

### D-005 · Sistema de coordinación

- **Estado:** aprobada.
- **Autor:** el director (idea); Claude (organización concreta).
- **Aprobación:** el director, 2026-11-10 («Apruebo tu propuesta de organización con las siguientes decisiones…»).

**Propuesta**

- **Rama `coordinacion`:** fija y solo de documentación; no se fusiona con `main` sin autorización.
- **Archivos:** cinco en `docs/coordinacion/`, cada uno con un único autor.
- **Revisiones de ChatGPT:** las entrega el director y Claude las transcribe literalmente.
- **Estado del proyecto por categorías:** implementado y probado / pendiente de pruebas / en desarrollo / pendiente de revisión o fusión.
- **Decisiones con trazabilidad.**
- **Documentación existente:** no se borra ni se sustituye; se enlaza.

**Alternativas**

- Los archivos en cada rama de trabajo (divergen y chocan al fusionar).
- Directamente en `main` (necesita autorización cada vez).

### D-006 · Capítulo 1 «Las raíces enfermas» y nombre del bosque

- **Estado:** aprobada.
- **Autor:** el director.
- **Aprobación:** el director, en el encargo del capítulo 1 («Las raíces enfermas, en el Bosque de Brumaverde»), publicado en 0.45 el 2026-11-10.
- **Detalle:** `docs/CAPITULO_1.md`; registro en la biblia.

**Propuesta**

- El primer capítulo jugable se llama «Las raíces enfermas».
- El bosque pasa a llamarse **Bosque de Brumaverde** (antes, «Bosque Brumoso»).

**Lo que no se aprobó.** Los personajes nuevos Nara Vey y Gil **no** quedaron aprobados: son las decisiones narrativas abiertas P-14 y P-15 (ver D-009).

### D-007 · Restricciones permanentes del proyecto

- **Estado:** aprobada.
- **Autor:** el director.
- **Aprobación:** el director, en encargos anteriores al 2026-11-10, recogidos del historial del proyecto.

**Propuesta**

- No afirmar que una función funciona si no está implementada y probada.
- No eliminar mecánicas existentes.
- No simular conexiones con otros jugadores.
- **El servidor valida todo.**
- No usar credenciales falsas ni suponer servidores desplegados.
- No afirmar que el juego está en línea sin una conexión real comprobada desde fuera.
- El alojamiento P2P desde el navegador no es un requisito.
- No subir `data/`, secretos, `.env` ni `node_modules`.
- No copiar recursos protegidos de franquicias.
- Mantener la coherencia del canon; si algo lo contradice, se señala antes de implementarlo.


### D-015 · Dirección artística «Hybrid 2D Fantasy» (AD-1)

- **Estado:** aprobada.
- **Autor:** el director (encargo «ELDORIA — HYBRID 2D FANTASY ART»), con la propuesta de dirección de Claude (`claude/direccion-artistica-hibrida.md` en el proyecto).
- **Aprobación:** el director, 2026-11-11 («Apruebo abandonar el pixel art como estilo principal y adoptar Hybrid 2D Fantasy»).
- **Modifica a D-003** en su punto «Estilo»:
  - el aprobado decía «el visual de Eldoria, sin emojis ni iconos genéricos»;
  - el encargo que dio lugar a D-003 describía esa identidad con pixel art;
  - desde D-015, la interfaz también es ilustrada.
- **Documentación:** `docs/arte/BIBLIA_ARTISTICA.md` (rama `tarea/direccion-artistica`, INF-009).

**Propuesta**

- Abandonar el pixel art como estilo principal: ilustración digital detallada y pintura digital, con recursos propios de alta resolución.
- **Alcance:** personajes, criaturas, jefes, escenarios, vegetación, objetos, iconos, **interfaz y menús**.
- Se conservan la cámara cenital, las mecánicas, la arquitectura y las reglas.
- La opción de mantener arte clásico durante la transición es **temporal** y no debe convertirse en solución permanente.

**Alternativas**

- Seguir con arte generado por código en pixel art.
- Mejorar el pixel art actual.

### D-016 · Dimensiones según la cámara y vistas justificadas: criterios (AD-2 y AD-3)

- **Estado:** aprobada (criterios). **Los valores concretos están en D-021, en propuesta.**
- **Autor:** Claude.
- **Aprobación:** el director, 2026-11-11 («Acepto que las dimensiones dependan de la cámara y de la resolución de destino. Quiero tres niveles de calidad o resolución cuando estén técnicamente justificados»).

**Propuesta**

- El tamaño de cada recurso sale de su tamaño en el mundo y de la densidad de pantalla: zoom × dpr. No hay tamaños fijos arbitrarios.
- Tres niveles de calidad cuando estén técnicamente justificados.
- Las vistas de cada personaje se justifican con las animaciones y movimientos del juego; las 5 del Guerrero eran una propuesta inicial.
- No se producen recursos definitivos todavía.

### D-017 · Distribución del arte separada del repositorio: principio (AD-8)

- **Estado:** aprobada (principio). **El diseño está en D-026, en propuesta.**
- **Autor:** Claude.
- **Aprobación:** el director, 2026-11-11 («Acepto estudiar la distribución de los assets en un paquete separado del repositorio principal»).
- **Propuesta:** estudiar un paquete de arte separado del repositorio, con versión propia, sumas de comprobación, compatibilidad con la versión del juego, caché local, descarga reanudable, recuperación de errores y actualización segura.
- **Alternativas:** arte dentro del repositorio; repositorio aparte solo de arte.

### D-018 · Objetivo de rendimiento: 60 fps estables (AD-9)

- **Estado:** aprobada (objetivo). **Los equipos de referencia y los criterios están en D-027, en propuesta.**
- **Autor:** el director.
- **Aprobación:** el director, 2026-11-11 («Objetivo de 60 FPS estables en condiciones reales»).
- **Propuesta:**
  - Las pruebas incluyen 4 jugadores, varios enemigos, combate y efectos, iluminación, escenarios completos y resoluciones habituales.
  - **No basta con una escena vacía.**

### D-019 · Documentación de la dirección artística (AD-10)

- **Estado:** aprobada y hecha (INF-009).
- **Autor:** Claude.
- **Aprobación:** el director, 2026-11-11 («Autorizo crear los ocho documentos de `docs/arte/` que propusiste, en una rama exclusivamente documental»).
- **Propuesta:**
  - Ocho documentos en `docs/arte/`, en la rama `tarea/direccion-artistica`, sin fusionar con `main`.
  - Se conservan los documentos existentes.
  - Sin cambios de código ni de recursos.


### D-029 · GitHub como canal compartido de coordinación

- **Estado:** aprobada.
- **Autor:** el director.
- **Aprobación:** el director, 2026-11-12:
  - «A partir de ahora, GitHub será el canal compartido de coordinación entre Claude y ChatGPT para Eldoria.»
  - «El objetivo es que yo solo tenga que pedir a ChatGPT “Revisa Eldoria” para que pueda leer tu último informe y continuar desde ahí.»
- **Complementa a D-005** (sistema de coordinación). D-005 sigue vigente; cambia cómo llegan los informes de Claude a ChatGPT: los lee directamente en GitHub en vez de recibirlos copiados por el director.

**Propuesta**

- Repositorio `p1txu/mystery-action-online_7`, rama `coordinacion`.
- Al terminar cada tarea, Claude:
  - actualiza `ESTADO_PROYECTO.md` e `INFORMES_CLAUDE.md` con resultados reales, pruebas, errores, archivos afectados y decisiones pendientes;
  - y los publica en GitHub.
- Los cambios de código van en una rama de tarea separada, con su nombre y commit en el informe.
- No se modifica `main` ni se fusionan ramas sin autorización.
- No se alteran `REVISIONES_CHATGPT.md` ni `DECISIONES_PROYECTO.md` para atribuir aprobaciones no dadas.
- No se publican contraseñas, tokens, datos personales, rutas privadas sensibles ni información confidencial del ordenador.
- Para la instalación de ComfyUI y Krita, solo un resumen técnico seguro, sin registros con información privada.
- Procedimiento detallado: `README.md`, sección «Al terminar cada tarea».


### D-030 · Entorno local y gratuito de creación de arte con IA

- **Estado:** aprobada (encargo del director). **La instalación está en curso: fase A hecha; las fases B a E esperan su visto bueno** (INF-010).
- **Autor:** el director.
- **Aprobación:** el director, 2026-11-12:
  - «Quiero que prepares en mi ordenador un entorno gratuito y local de creación de arte mediante IA para el desarrollo de Eldoria.»
  - Y la lista de gastos que excluye: «No quiero gastar absolutamente nada en: Suscripciones. Créditos de generación. Licencias comerciales de software. Contratación de artistas. Servicios externos de generación de imágenes. Herramientas de animación de pago.»

**Propuesta**

- Herramientas: ComfyUI con soporte para AMD; Krita; Krita AI Diffusion conectado al ComfyUI local; modelos con licencia que permita uso comercial.
- Todo en una carpeta independiente del juego y del repositorio.
- Trabajo por fases (auditoría, instalación, modelos, pruebas, documentación), presentando los riesgos antes de instalar.

**Efecto sobre otras decisiones**

- **D-022 (modelo de producción del piloto)** sigue en propuesta, pero la parte de «artista humano contratado» queda fuera por esta indicación.
- La nueva versión de D-022 (producción con IA local y retoque del director) la registrará Claude como propuesta cuando el director la confirme.
- **D-023 (animación):** queda limitada a herramientas gratuitas (Blender y alternativas de código abierto).

---

## B. Propuestas pendientes (sin aprobar)

### D-008 · Orden de corrección de los problemas de la auditoría integral

- **Estado:** propuesta.
- **Autor:** Claude (INF-005).

**Propuesta**

1. **E-1:** en línea, desactivar «Lanzar» con una explicación. Lanzar validado por el servidor quedaría para más adelante.
2. **E-2:** decidir objeto por objeto. Mientras tanto, marcar «solo sin conexión» y no venderlos en línea.
3. **I-1:** diseñar habilidades para los niveles 7, 10 y 14 y un definitivo, o dejar de abrir huecos vacíos.
4. **I-2:** controles táctiles, si el móvil es objetivo.

**Alternativas:** otro orden, o resolver E-1 y E-2 en el servidor desde el principio.

### D-009 · Personajes del capítulo 1: Nara Vey (P-14) y Gil (P-15)

- **Estado:** propuesta.
- **Autor:** Claude, en el capítulo 1.
- **Referencia:** la biblia, decisiones abiertas P-14 y P-15.

**Propuesta**

- **Nara Vey:** guardabosques de Brumaverde.
- **Gil:** leñador desaparecido, autor del «Diario de un leñador» (texto canon).

**Alternativas.** Las de la biblia (que el papel de Nara lo cumpla un vecino existente; capítulo sin leñador).

### D-010 · Contadores del capítulo por capítulo

- **Estado:** propuesta.
- **Autor:** Claude (INF-002 e INF-005).
- **Propuesta:** antes de empezar el capítulo 2, asociar cada contador (`c1_kills`, `c1_elites`) a las regiones de su capítulo.
- **Alternativa:** prefijar las regiones a mano en cada misión.

### D-011 · Fusión de las ramas `tarea/interfaz-mmo` y `tarea/arquero-apuntado`

- **Estado:** propuesta.
- **Autor:** Claude.

**Propuesta**

- **Antes de fusionar:** revisión de ChatGPT de cada rama.
- **Al fusionar:**
  1. una rama primero y después la otra;
  2. regenerar los archivos generados;
  3. ejecutar toda la batería;
  4. subir la versión (0.47) y escribir sus notas.

**Alternativas:** fusionar solo una; una versión por rama.

### D-012 · Mantenimiento técnico menor

- **Estado:** propuesta.
- **Autor:** Claude (INF-005).

**Propuesta**

- **`tests/run-all.sh`:** que siga tras un fallo y dé un resumen.
- **E-3:** migraciones robustas ante partidas dañadas.
- **E-4:** quitar el `.pyc` del repositorio y añadirlo a `.gitignore`. Borrarlo requiere autorización.
- **Copiar aquí** el informe completo de la auditoría integral.

**Alternativa:** dejarlo para más adelante.

### D-013 · Repetición del Linde de Brumaverde

- **Estado:** propuesta.
- **Autor:** Claude (INF-002).
- **Propuesta:** limitar la recompensa repetida de la zona; por ejemplo, el élite fijo da botín una vez al día.
- **Alternativa:** dejarlo como está.

### D-014 · Capturas de la auditoría visual fuera de `main`

- **Estado:** propuesta.
- **Autor:** Claude (INF-008).
- **Propuesta:** no fusionar en `main` las 39 capturas (unos 13 MB) de `tarea/auditoria-visual`, porque el lanzador descarga el repositorio en cada actualización. Fusionar solo el informe, o dejarlo todo en su rama.
- **Alternativas:**
  - fusionarlo todo;
  - mover las imágenes a un almacenamiento aparte (por ejemplo, adjuntas a una Release de GitHub).


### D-020 · Orden de trabajo de la dirección artística (AD-11)

- **Estado:** propuesta **del director**. El plan revisado la sigue. Falta confirmar si se da por aprobada.
- **Autor:** el director (2026-11-11, «Propongo este orden»).
- **Propuesta:**
  1. completar la dirección artística y la documentación;
  2. resolver las decisiones de arquitectura gráfica;
  3. validar el personaje piloto;
  4. validar el escenario piloto;
  5. integrar en la planificación el nuevo menú de inicio y la transición a juego 100 % online;
  6. preparar el plan de producción completa.
- **Nota de Claude:** el punto 5 choca, a futuro, con «no eliminar el modo offline», que es una restricción de esta fase. Hay que decidir qué pasa con el modo sin conexión antes de implementar (sección C).

### D-021 · Niveles de calidad y vistas por tipo de actor

- **Estado:** propuesta.
- **Autor:** Claude (INF-009, `docs/arte/PIPELINE_ASSETS.md`).
- **Propuesta:**
  - **Niveles de ejecución:** Ligero (2 px/u), Estándar (3 px/u) y Alto (4–5 px/u; no 6, porque las pruebas dan la misma calidad con un 56 % menos de memoria), más el original del artista a 8 px/u o más.
  - **Vistas:**
    - héroes, 5 + reflejo;
    - vecinos, 5 + reflejo para andar;
    - enemigos con dirección, 3 + reflejo;
    - enemigos simétricos, 1;
    - jefes, 3 + reflejo o 1.
- **Alternativas:**
  - dos niveles (posibles con WebGL y mipmaps, D-025);
  - Alto a 6 px/u;
  - 3 vistas para los héroes;
  - 8 vistas pintadas.

### D-022 · Modelo de producción del piloto (AD-4)

- **Estado:** propuesta. El director prefiere un proceso mixto; la decisión final está pendiente.
- **Nota (2026-11-12):** según D-030, el director no quiere gastar en contratar artistas. Esta propuesta debe rehacerse para una producción con IA local y retoque humano del director. Pendiente de su confirmación.
- **Autor:** Claude, sobre la preferencia del director.
- **Propuesta:**
  - producción mixta solo para el piloto (prototipos A y B): IA para explorar y hacer variaciones, artista humano para el diseño final, las piezas y la animación, y revisión antes de integrar;
  - contrato por hitos y ficha de origen por recurso;
  - el modelo de la producción completa se decide con los datos del piloto.
- **Alternativas:** producción humana completa; IA con poco retoque (desaconsejada: coherencia y derechos débiles).
- **Detalle:** `docs/arte/PLAN_PRODUCCION_ARTE.md`, sección 2.

### D-023 · Herramienta de animación (AD-5)

- **Estado:** propuesta. **No se ha comprado nada.**
- **Autor:** Claude.
- **Propuesta:**
  - evaluar primero con opciones gratuitas (Blender con recorte y horneado; Rive gratis solo para pruebas);
  - en el Guerrero piloto, comparar esqueleto en vivo frente a horneado a fotogramas;
  - Spine Essential o Professional solo si el piloto lo justifica.
- **Alternativas:** Spine; Rive Cadet; DragonBones; esqueleto propio; fotogramas pintados.

### D-024 · Bosque abierto (AD-6)

- **Estado:** propuesta. **El generador no se ha tocado.**
- **Autor:** Claude.
- **Propuesta:**
  - alternativa A (vestir el generador actual, solo dibujo) en el escenario piloto;
  - si no basta, B1 (generador de claros y senderos con el mismo contrato de datos y versión de generador) como tarea de reglas aparte.
- **Alternativas:** B2, exterior libre con búsqueda de caminos para la IA.
- **Detalle:** `docs/arte/MUNDO_Y_PERSONAJES.md`, sección 7.

### D-025 · Renderizador: prueba comparativa Canvas 2D frente a PixiJS (AD-7)

- **Estado:** propuesta. **No se elige ni se migra.**
- **Autor:** Claude.
- **Propuesta:**
  - autorizar la descarga de PixiJS v8 (MIT) **solo en la carpeta de pruebas**, fuera del juego, para medir los dos motores con la misma escena, los mismos recursos y las mismas métricas;
  - la elección se hace después de revisar los números de los equipos de referencia.
- **Detalle:** `docs/arte/ARQUITECTURA_ARTE.md`, sección 4.

### D-026 · Diseño de la distribución del arte (AD-8)

- **Estado:** propuesta.
- **Autor:** Claude.
- **Propuesta:**
  - archivos con nombre de su huella sha256;
  - manifiesto con versión, esquema y versión mínima del juego;
  - caché local fuera de la copia de seguridad del actualizador;
  - descarga reanudable por rangos;
  - cambio atómico de versión;
  - reparación;
  - solo https;
  - firma del manifiesto opcional.
- **Detalle:** `docs/arte/PIPELINE_ASSETS.md`, sección 7.

### D-027 · Equipos de referencia y criterios de rendimiento (AD-9)

- **Estado:** propuesta.
- **Autor:** Claude.
- **Propuesta:**
  - equipos R0 (los del director) y R1 a R3;
  - escenas S1 a S6, incluida una en línea con 4 clientes;
  - métricas de tiempo de fotograma, memoria, carga y estabilidad;
  - criterios de aprobado de `docs/arte/PLAN_PRODUCCION_ARTE.md`, sección 4.
- **Pendiente del director:** decir qué equipos tiene disponibles.

### D-028 · Licencias del arte, del repositorio y de las fuentes

- **Estado:** propuesta.
- **Autor:** Claude.
- **Propuesta:**
  - decidir la licencia del paquete de arte y del repositorio (hoy no tiene archivo de licencia);
  - empaquetar Cinzel y Alegreya Sans con el arte, tras revisar su licencia, para no depender de Google Fonts.

---

## C. Asuntos sin decidir (sin propuesta concreta todavía)

- Si la asistencia de apuntado se aplica al Mago (después de valorar el Arquero; D-004).
- Selección manual de objetivo y controles táctiles: si el móvil es una plataforma objetivo.
- Diseño de las habilidades de los niveles 7, 10 y 14 y de los definitivos de cada clase (I-1). Encaja con ChatGPT como diseñador.
- Qué hacen en grupo los orbes que hoy solo funcionan sin conexión (por ejemplo, si el Orbe de escape saca a todo el grupo).
- Dificultad de Robletón en solitario: necesita pruebas con personas.
- Versión con la que se publicarán los cambios pendientes de fusión.
- ~~Dirección artística: seguir con arte generado por código o pasar a arte dibujado (propio o con licencia compatible).~~ Resuelto por D-015 (2026-11-11).
- Futuro del modo sin conexión en la transición a juego 100 % online (D-020, punto 5): eliminarlo, mantenerlo como partida en solitario o convertirlo en servidor local. Afecta a la distribución del arte (D-026).
