# Auditoría del capítulo 1 · «Las raíces enfermas» (0.45 → 0.46)

- **Fecha:** 2026-11-10.
- **Alcance:** la primera versión jugable de la campaña (0.45). No se ha añadido contenido; solo correcciones de claridad y estabilidad.
- **Conclusión:** no hay problemas críticos ni altos. El capítulo se puede completar en solitario y en grupo:
  - las recompensas se cobran una sola vez;
  - no hay bloqueos;
  - el progreso no se pierde.

  Se corrigieron dos problemas de prioridad media y siete de prioridad baja (cinco en el juego, uno de documentación y una prueba inestable).

## 1-3. Problemas, gravedad y cambios

| # | Área | Problema | Gravedad | Prioridad | Estado (0.46) |
|---|---|---|---|---|---|
| 1 | Experiencia | El panel de la expedición solo mostraba los contratos del tablón. Durante la exploración, el jugador no veía qué le faltaba de la campaña sin volver al gremio | Media | Alta | **Corregido:** el panel muestra el siguiente paso de la principal y las misiones listas para entregar, con su progreso (`Campaign.tracker`) |
| 2 | En línea | El aviso «Misión lista para entregar» no llegaba nunca en línea: en el servidor la interfaz es inerte. Además, el progreso del capítulo (criaturas, rastros) no se veía hasta volver a la aldea | Media | Alta | **Corregido:** el servidor manda a cada jugador su progreso (evento `campaign`, solo a ese jugador) y el cliente lo refleja |
| 3 | Experiencia, en línea | Con un enemigo en alerta cerca, un rastro no se lee y en línea no se avisaba de nada (sin conexión sí) | Baja | Media | **Corregido:** un aviso por rastro y piso, «Aquí hay algo… cuando no haya peligro» |
| 4 | Diálogos | Se podía «contar a Nara lo que has visto» antes de que se presentara (`nara_rastros` sin `nara_c1`) | Baja | Media | **Corregido** |
| 5 | En línea | Al entregar la principal, el aviso de la aldea cambiada salía dos veces y la aldea se redibujaba dos veces | Baja | Baja | **Corregido** |
| 6 | Robustez | Si el servidor no podía apuntar la introducción (por ejemplo, con una expedición interrumpida pendiente), se repetía en cada vuelta a la aldea | Baja | Baja | **Corregido:** no se repite en esa sesión y se apunta la siguiente vez |
| 7 | Narrativa, documentación | Títulos de misiones distintos entre el juego y `docs/CAPITULO_1.md` y las notas de la 0.45 («El leñador perdido» / «desaparecido», «La exploradora del gremio» / «La marca de Irene»). `docs/lore/` seguía con «Bosque Brumoso» y con el capítulo «El linde del bosque». Monedas llamadas «gemas» en la documentación | Baja | Media | **Corregido** en la documentación. El juego no cambia |
| 8 | Narrativa | Bartolo menciona el diario de Gil. No es una pista suelta: enlaza con el texto canon «Diario de un leñador» (`f_lenador`). Faltaba anotarlo | Informativa | — | Anotado en la biblia (P-15) |
| 9 | Economía | El Linde se puede repetir sin coste: una zona corta con élite fijo, un 20 % de cofres y sin penalización. Al volver se renueva el tablón | Baja | Baja | **Pendiente** (decisión de diseño) |
| 10 | Dificultad | En solitario, Robletón con 2-3 brotes vivos se cura más deprisa de lo que pega un jugador de nivel 5-7. Es lo previsto (hay que cortar los brotes), pero es el punto más exigente del capítulo | Informativa | — | **Pendiente:** confirmar jugando |
| 11 | Pruebas | Prueba inestable de la 0.44 («Raíces Hondas… la siguiente raíz sale tras la anterior», alrededor de 1 de cada 10 ejecuciones también en la 0.45). Con la misma semilla el jefe no siempre está en el mismo sitio, porque el combate usa azar, y a veces la cadena de raíces chocaba con un muro | Baja | Media | **Corregido en la prueba:** se elige una dirección sin muros. No ha fallado en 37 ejecuciones |

## 4. Pruebas ejecutadas y resultados

| Prueba | Qué comprueba | Resultado |
|---|---|---|
| Fuzz de misiones (3000 partidas × 60 acciones al azar, `tests/.tmp/audit_fuzz.mjs`) | Aceptar, entregar, guardar y cargar, rastros, conversaciones, marcas y criaturas en cualquier orden, sin conexión y con las reglas del servidor. Invariantes: nunca dos cobros, ningún estado imposible («hecha» sin cobro, «lista» sin aceptar), cobros sin duplicar, `c1_done` al entregar la principal, sin excepciones | Sin fallos. Encontró el problema 4 |
| Principal sin secundarias | Se puede completar sin aceptar ninguna secundaria | Correcto |
| Reanudación del Linde (instantánea → expedición nueva, `audit_resume.mjs`) | Contadores, rastros y élite muerto se conservan. Releer no duplica. Expedición interrumpida o caída conserva rastros y contadores, y el Linde no cuenta como mazmorra | Correcto |
| Robletón con un bot (`audit_boss.mjs`, 3 semillas; nivel 5 y 7; 1, 2 y 4 jugadores; sin pociones, sin reanimar y sin usar los tocones) | Dificultad orientativa | 1 jugador: gana 1 de 3 (60-80 s). 2 jugadores: gana 3 de 3 (9-37 s). 4 jugadores: gana 3 de 3 a nivel 7 y 1 de 3 a nivel 5. Vida del jefe 296 / 474 / 770 (×1 / ×1,6 / ×2,6): no es una esponja de daño |
| `tests/chapter1.test.mjs` (6 pruebas, una nueva) | Generación (150 semillas × 4 tamaños de grupo), misiones, secundarias que no bloquean, bolsa llena, jefe con 3 jugadores, y lo nuevo: seguimiento, orden con Nara, evento `campaign` por jugador y aviso de peligro | 6/6 |
| `tests/colyseus/chapter1.test.mjs` (Colyseus real, 2 clientes) | Lo anterior y, ahora, que cada cliente reciba su progreso durante la expedición y no el del compañero | 1/1 |
| `tests/e2e/chapter1_e2e.py` (navegador sin conexión) | Recorrido completo y el panel de seguimiento durante la exploración | 20/20 |
| Suite completa (`tests/run-all.sh`): unitarias, Colyseus, despliegue y 25 recorridos de navegador | Que no se rompa nada | **Todo correcto:** 215 unitarias, 29 de Colyseus, 17 + 4 de despliegue y 338 comprobaciones en navegador, sin fallos |

## 5. Pruebas que no se pudieron realizar

- **En Internet:** no hay ninguna prueba con el servidor desplegado y jugadores de verdad conectándose desde fuera. Todo lo «en línea» se ha probado con el servidor real en esta máquina.
- **Dificultad con personas:** solo hay un bot sencillo. No esquiva como una persona, no usa objetos y no hace saltar al jefe sobre los tocones.
- **Reconexión a mitad de combate con Robletón y 4 navegadores reales:** la hay con Gromgar (0.43). Con Robletón solo con la simulación del servidor.
- **PostgreSQL:** no hay servidor disponible aquí. Se ha probado con SQLite.
- **Pantallas pequeñas:** no se ha revisado el panel de seguimiento en un móvil real. Con textos largos ocupa dos líneas.

## 6. Riesgos pendientes

- **Granjeo del Linde y renovación del tablón** (problema 9).
- **Pico de dificultad en solitario** contra Robletón a nivel bajo (problema 10).
- **Cuentas con una expedición interrumpida:** no pueden aceptar ni entregar misiones hasta cerrarla. Es lo correcto para no duplicar objetos, pero el jugador solo ve el mensaje del servidor.
- **Créditos de muerte en grupo:** una criatura cuenta para quien la golpea o está cerca (radio de ayuda). Si un jugador se aleja, la zarza élite puede no contarle; tendría que volver al Linde.
- **Nara Vey, Gil y el Linde siguen siendo propuestas** (P-14, P-15): si se rechazan, cambian los textos, no el guardado.

## 7. Recomendaciones para el capítulo 2

1. **Usar la plantilla del capítulo 1** (`docs/CAPITULO_1.md`): una entrada en `CHAPTERS`, sitios fijos en `STORY_SITES`, una zona con `zone: true`, `fixedElite` y `force`, misiones en `CQUESTS` y contadores en `STORY_COUNTERS`. El seguimiento, el evento `campaign` y las operaciones del servidor funcionan sin tocar nada más.
2. **Contadores por capítulo:** hoy `Campaign.event` suma `c1_kills` y `c1_elites` en cualquier región de un capítulo. Para el capítulo 2 hay que asociar cada contador a sus regiones, para que las criaturas de la Gruta no cuenten para el capítulo 1 y al revés. Es el cambio técnico obligatorio antes de empezar.
3. **Encadenar capítulos:** `offer` del capítulo 2 debería exigir `c1_done`. La introducción (`ChapterIntro`) debe saber qué capítulo toca.
4. **Ampliar el fuzz y las pruebas:** añadir las misiones nuevas a `audit_fuzz.mjs` (o llevarlo a `tests/`) y repetir las tres pruebas del capítulo: unitaria, Colyseus y navegador.
5. **Decidir antes de escribir:** P-14 y P-15, el granjeo de zonas (por ejemplo, el élite fijo solo da recompensa una vez al día) y si la Gruta tendrá zona de exploración.
6. **Probar con personas** el combate de Robletón en solitario y en grupo antes de calibrar el guardián del capítulo 2.
