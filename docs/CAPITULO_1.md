# Capítulo 1 · Las raíces enfermas (0.45)

Este es el primer capítulo jugable de la campaña de Eldoria, y sirve de modelo para los siguientes. Usa los sistemas que ya existen:

- misiones del gremio y de los vecinos;
- combate y BossKit;
- generación procedural con sitios fijos;
- guardado (formato v10) y operaciones del perfil validadas por el servidor.

## Recorrido

1. **Introducción.**
   - Al llegar a la aldea, el Alcalde Bartolo presenta el problema y envía al jugador al gremio.
   - Se ve una vez por perfil y activa la marca `c1_intro`.
   - Con ella aparece el campamento de **Nara Vey** en el camino del oeste.
2. **Gremio.** La Maestra Ulula ofrece la misión principal, «Las raíces enfermas».
3. **Nara Vey.** Explica qué ha visto y envía al jugador al Linde.
4. **Linde de Brumaverde.** Es una zona de exploración de un solo piso, sin guardián: se sale por el sendero y se vuelve a la aldea.
   - Contiene los rastros de la podredumbre: raíz podrida, savia negra y huellas cuesta arriba.
   - También contiene el campamento de Gil.
   - Tiene un mecanismo ambiental garantizado (esporas, raíces punzantes o raíces rompibles) y un élite fijo, la Zarza negra.
5. **Vuelta a Nara.** El jugador le cuenta lo que ha visto.
6. **Bosque de Brumaverde.** Son 5 pisos de salas conectadas, con los mecanismos del capítulo 1:
   - palancas y puentes;
   - placas de tiempo;
   - paredes falsas;
   - emboscada y minijefe.

   En el piso 1 está la **Estela tibia**, que es una pista obligatoria, y el **Refugio de Gil**, una cámara escondida.
7. **Robletón, el Guardián de Espinas.** Es el jefe del Bosque:
   - tres fases avisadas;
   - brotes de savia que lo curan y lo protegen;
   - tocones que, si se le hace saltar sobre ellos, lo enredan y lo dejan vulnerable 6 s.

   Detalles en [JEFES.md](JEFES.md).
8. **Entrega a Ulula.**
   - Recompensa: 320 EXP, 260 monedas, el Broche de roble y +30 de reputación.
   - Activa la marca `c1_done`.
   - Cambio visible en la aldea: los árboles enfermos del oeste sanan. Persiste al recargar y en el servidor.

## Misiones

| Id | Quién | Qué pide | Recompensa |
|---|---|---|---|
| `c1_main` | Ulula | Hablar con Nara, leer 3 rastros, volver a Nara, leer la Estela tibia y vencer a Robletón | 320 EXP, 260 monedas, Broche de roble, +30 rep. |
| `c1_poda` «Poda de urgencia» | Nara | 12 criaturas en Brumaverde (Linde o Bosque) | 120 EXP, 90 monedas, 2 pociones, +10 rep. |
| `c1_elite` «Espinas negras» | Nara | 1 élite en Brumaverde (la Zarza negra del Linde) | 150 EXP, 120 monedas, tónico de energía, +10 rep. |
| `c1_lenador` «El leñador desaparecido» | Bartolo | Encontrar el campamento de Gil (Linde) y su refugio (Bosque, piso 1, escondido) | 140 EXP, 110 monedas, 2 manzanas, poción, +10 rep. |
| `c1_irene` «La marca de Irene» (SQ-01) | Ulula | La marca de Irene, la conversación con Ulula y la página 1 | 110 EXP, 80 monedas, tónico de energía, +10 rep. |

### Reglas de las misiones

- **Predicados sobre el guardado:** una misión es un predicado sobre hechos ya guardados (lore, conversaciones, marcas y contadores). Lo hecho antes de aceptarla cuenta.
- **No bloquean:** ninguna misión secundaria bloquea la principal, y se pueden hacer antes, durante o después.
- **Estados:** bloqueada → disponible → activa → lista → entregada.
- **Recompensa una vez:** el gremio la reclama como `quest:<id>`. Si la bolsa está llena, el objeto se vende al precio de venta.
- **Contadores:** `c1_kills` y `c1_elites` cuentan siempre en las regiones del capítulo (`bosque` y `linde`), sin conexión y en el servidor. Cada jugador del grupo suma en su propio perfil.

### Seguimiento (0.46)

- **En pantalla:** durante la exploración, el panel muestra el siguiente paso de la principal y, después, las misiones listas para entregar (como máximo dos líneas), encima de los contratos del tablón.
- **En línea:** el servidor manda a cada jugador su progreso durante la expedición (evento `campaign`: contadores, textos, páginas y marcas). El perfil se sigue guardando en el servidor al terminar.
- **Rastros con peligro cerca:** no se leen mientras haya un enemigo en alerta a menos de 320 px. Se avisa una vez: «Aquí hay algo… cuando no haya peligro».

## En grupo (1 a 4 jugadores)

- **Rastros y estelas:** cada jugador los lee para su perfil.
- **Escalado del jefe:** se usa el de BossKit (más vida con moderación, más brotes y segunda línea de raíces), no solo más vida.
- **Puzzles:** todos se resuelven en solitario.
- **Misiones:** cada perfil acepta y entrega las suyas por `POST /api/profile/op` (`questAccept`, `questTurnIn`). El servidor valida todo.

## Pruebas

| Prueba | Qué comprueba |
|---|---|
| `tests/chapter1.test.mjs` | Generación del Linde y del Bosque, piso 1 (150 semillas × 4 tamaños de grupo): sitios, élite, mecanismo y ruta válida. Linde en el servidor con 2 jugadores. Flujo de las operaciones. Secundarias que no bloquean y bolsa llena. Robletón con 3 jugadores: trofeo y recompensa una vez |
| `tests/colyseus/chapter1.test.mjs` | Colyseus real, dos clientes SDK en el Linde: contadores y rastros por perfil, salida a la aldea y entregas por HTTP una sola vez |
| `tests/e2e/chapter1_e2e.py` | Navegador sin conexión: introducción, diálogos de Ulula, Bartolo y Nara, misiones, Linde, rastros, Robletón, cambio en la aldea y recarga (19 comprobaciones) |

## Plantilla para los capítulos siguientes

1. Añade una entrada en `CHAPTERS` con su región, su zona, su introducción y sus marcas de inicio y fin.
2. Añade los sitios fijos en `STORY_SITES`, con sus textos en `LORE`. Usa `hidden: true` para las cámaras secretas.
3. Añade la zona en `DUNGEONS` con `zone: true`, `fixedElite` y `force`.
4. Añade las misiones en `CQUESTS`: predicados sobre el guardado, recompensa y `giver`.
5. Si hacen falta contadores, añádelos a `STORY_COUNTERS` y suma en `Campaign.event`.
6. Si se cambia la aldea, comprueba la marca de fin en `TownScene` o con `STATIONS.requires`.
