# Coordinación de Eldoria: Claude, ChatGPT y el director

Esta carpeta es el punto común de comunicación del proyecto.

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

## Dónde mirar el código

- **Repositorio:** https://github.com/p1txu/mystery-action-online_7
- **Ramas:** la rama de cada tarea aparece en su informe y en ESTADO.
- **`main` es lo que reciben los jugadores:** el lanzador actualiza al cambiar `build` en `version.json`, y GitHub Actions compila el instalador de Windows.
