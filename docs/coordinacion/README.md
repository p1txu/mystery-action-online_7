# Coordinación de Eldoria: Claude, ChatGPT y el director

Esta carpeta es el punto común de comunicación del proyecto. **Desde el 2026-11-12, GitHub es el canal compartido** entre Claude y ChatGPT (D-029): el director ya no copia los informes a mano.

## «Revisa Eldoria»: por dónde empezar (para ChatGPT)

Lee, en este orden, los archivos de la rama `coordinacion`:

1. **[ESTADO_PROYECTO.md](ESTADO_PROYECTO.md):** la foto actual. Arriba indica cuál es el último informe.
2. **[INFORMES_CLAUDE.md](INFORMES_CLAUDE.md):** el informe más reciente es el primero. Cada informe dice qué rama y qué commit revisar.
3. **[DECISIONES_PROYECTO.md](DECISIONES_PROYECTO.md):** qué está aprobado (sección A), qué está propuesto (B) y qué sin decidir (C).
4. **[REVISIONES_CHATGPT.md](REVISIONES_CHATGPT.md):** tus revisiones anteriores.

Direcciones directas:

| Para qué | Dirección |
|---|---|
| Navegar | https://github.com/p1txu/mystery-action-online_7/tree/coordinacion/docs/coordinacion |
| Texto sin formato: estado | https://raw.githubusercontent.com/p1txu/mystery-action-online_7/coordinacion/docs/coordinacion/ESTADO_PROYECTO.md |
| Texto sin formato: informes | https://raw.githubusercontent.com/p1txu/mystery-action-online_7/coordinacion/docs/coordinacion/INFORMES_CLAUDE.md |
| Texto sin formato: decisiones | https://raw.githubusercontent.com/p1txu/mystery-action-online_7/coordinacion/docs/coordinacion/DECISIONES_PROYECTO.md |
| Código de una tarea | `https://github.com/p1txu/mystery-action-online_7/tree/<rama>`, con la rama que indique el informe |

- **Dónde vive:** en la rama fija **`coordinacion`**, que solo contiene documentación de coordinación (nunca código).
- **Fusión con `main`:** solo con autorización expresa del director.

## Papeles

| Quién | Papel | Qué hace |
|---|---|---|
| **El director** (el usuario) | Decide | Tiene la última palabra sobre diseño, funcionalidades, equilibrio y prioridades. Aprueba las decisiones importantes y las fusiones con `main` |
| **Claude** | Programador principal | Analiza el código, implementa, ejecuta las pruebas, documenta y señala riesgos o contradicciones, también en las propuestas de ChatGPT |
| **ChatGPT** | Arquitectura, diseño y revisión | Revisa código, cambios y documentación; propone soluciones; detecta errores, inconsistencias y problemas de equilibrio |

## Archivos y quién escribe en cada uno

Cada archivo tiene un solo autor. Así no hay conflictos.

| Archivo | Autor | Contenido |
|---|---|---|
| [ESTADO_PROYECTO.md](ESTADO_PROYECTO.md) | Claude | Foto actual del proyecto, que se reescribe. Distingue entre implementado y probado, implementado pendiente de pruebas, en desarrollo, y pendiente de revisión o fusión |
| [INFORMES_CLAUDE.md](INFORMES_CLAUDE.md) | Claude | Un informe por tarea (`INF-NNN`), solo se añaden, el más nuevo arriba. También las respuestas de Claude a cada revisión y sus objeciones a las propuestas |
| [REVISIONES_CHATGPT.md](REVISIONES_CHATGPT.md) | ChatGPT, transcrito por Claude | Revisiones (`REV-NNN`) tal como ChatGPT se las entrega al director. Claude las copia **literalmente** y las marca como «transcrita por Claude», sin cambiar su contenido ni atribuirle conclusiones que no haya expresado |
| [DECISIONES_PROYECTO.md](DECISIONES_PROYECTO.md) | Las propuestas las añade cualquiera; **solo el director aprueba** | Registro `D-NNN` con propuesta, alternativas, autor, estado, aprobación expresa y fecha. Una decisión aprobada no se cambia en silencio: un cambio posterior es una entrada nueva que dice a cuál sustituye |

## Reglas

1. **Antes de modificar nada:** revisar la estructura del proyecto y el estado de Git.
2. **Trabajo de implementación:** en ramas `tarea/<nombre>` creadas desde `main`.
   - Claude puede subir esas ramas a GitHub **después** de pasar las pruebas.
   - Nunca sube directamente a `main`, ni fusiona, sin autorización expresa del director.
3. **Código propuesto por ChatGPT:** va como texto en su revisión, o en una rama aparte `revision/<nombre>`. Nunca sobre la rama de tarea de Claude.
4. **Antes de una tarea relacionada:** Claude lee la revisión correspondiente y responde en INFORMES.
   - Si está de acuerdo, explica cómo lo implementaría.
   - Si no lo está, da los motivos y una alternativa.
   - Lo que contradiga una decisión aprobada no se implementa sin una nueva decisión del director.
5. **Honestidad:**
   - no se presenta como implementado lo que es una propuesta;
   - no se da una prueba por superada si no se ha ejecutado;
   - se distingue entre prueba automatizada, prueba manual y lo que no se ha podido probar.
6. **No se borra documentación existente.** La documentación técnica y narrativa sigue en `docs/` y se enlaza desde aquí:
   - `docs/PLAN.md`;
   - la biblia narrativa: `docs/BIBLIA_NARRATIVA_ELDORIA.md` y `docs/lore/`;
   - los informes de cada tarea.
7. **El repositorio es público:** nada de datos personales, contraseñas, claves ni archivos `.env`.

## Flujo de una tarea

1. El director encarga la tarea (propia o propuesta por ChatGPT).
2. Si la propuesta viene de ChatGPT, Claude la analiza. Si ve riesgos o contradicciones, los anota en INFORMES y avisa al director **antes** de cambiar nada.
3. Claude implementa en `tarea/<nombre>`, ejecuta las pruebas y sube la rama.
4. Claude añade el informe (`INF-NNN`) y actualiza ESTADO en la rama `coordinacion`.
5. ChatGPT revisa la rama y el informe y entrega su revisión al director, que se la pasa a Claude para transcribirla (`REV-NNN`).
6. Claude responde a la revisión en INFORMES.
7. El director decide. La decisión se registra (`D-NNN`) y, solo con su permiso, se fusiona en `main`.

## Al terminar cada tarea (procedimiento de Claude, D-029)

1. **Comprobar Git antes de escribir:** traer `origin`; comprobar que `coordinacion` no tiene cambios ajenos sin integrar y que no se va a sobrescribir nada.
2. **Actualizar** `ESTADO_PROYECTO.md` (con el número del último informe arriba) y añadir el informe `INF-NNN` en `INFORMES_CLAUDE.md`, con:
   - resultados reales;
   - pruebas ejecutadas y su resultado;
   - errores encontrados;
   - archivos afectados;
   - decisiones pendientes.
3. **Publicar** la rama `coordinacion` en GitHub (commit y push), para que ChatGPT la lea directamente.
4. **Si hay cambios de código:** van en una rama de tarea separada (`tarea/<nombre>`), y el informe da su nombre y su commit.
5. **Nunca** modificar `main` ni fusionar ramas sin autorización del director.
6. **No atribuir aprobaciones:** en `DECISIONES_PROYECTO.md` solo se marca «aprobada» lo que el director ha aprobado expresamente, con su cita. `REVISIONES_CHATGPT.md` solo recibe transcripciones literales.
7. **Privacidad:** el repositorio es público. No se publican:
   - contraseñas, tokens ni claves;
   - datos personales;
   - rutas privadas sensibles;
   - información confidencial de los ordenadores (nombres de equipo o de usuario, programas instalados, números de serie, registros completos).
   - En tareas sobre el equipo del director, solo un **resumen técnico seguro**: versiones, compatibilidad, pruebas, resultados y problemas.

## Dónde mirar el código

- **Repositorio:** https://github.com/p1txu/mystery-action-online_7
- **Ramas:** la rama de cada tarea aparece en su informe y en ESTADO.
- **`main` es lo que reciben los jugadores:** el lanzador actualiza al cambiar `build` en `version.json`, y GitHub Actions compila el instalador de Windows.
