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

---

## C. Asuntos sin decidir (sin propuesta concreta todavía)

- Si la asistencia de apuntado se aplica al Mago (después de valorar el Arquero; D-004).
- Selección manual de objetivo y controles táctiles: si el móvil es una plataforma objetivo.
- Diseño de las habilidades de los niveles 7, 10 y 14 y de los definitivos de cada clase (I-1). Encaja con ChatGPT como diseñador.
- Qué hacen en grupo los orbes que hoy solo funcionan sin conexión (por ejemplo, si el Orbe de escape saca a todo el grupo).
- Dificultad de Robletón en solitario: necesita pruebas con personas.
- Versión con la que se publicarán los cambios pendientes de fusión.
- Dirección artística: seguir con arte generado por código o pasar a arte dibujado (propio o con licencia compatible). Pendiente de la evaluación visual de ChatGPT (INF-008).
