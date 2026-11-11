# Prototipo B: escena de Brumaverde

- **Estado:** especificación. **No se ha producido nada.**
- **Dónde se monta:** en una **página de prueba aislada**, fuera del juego.
- **Qué no cambia:** el generador, los mapas y la IA del juego.
- **Objetivo:** comprobar todo el sistema de capas de la biblia en una escena real:
  - que **se lea como bosque y no como pasillo** (alternativa A de AD-6, solo dibujo);
  - medir rendimiento y memoria en los equipos de referencia.
- **Depende de:** el prototipo A (Guerrero), AD-4, AD-5 y la herramienta de exportación de prueba.

---

## 1. Planta

- Se copia la planta de un **piso real** del Bosque generado por `FloorGen`: casillas, salas y pasillos, guardados como datos de la prueba.
- **No se modifica el generador.** Se elige una semilla con una sala grande, un pasillo y una esquina, para probar los tres casos.
- **Recorte:** 1 sala y 1 tramo de pasillo, unas 26×15 casillas. Más un margen de sotobosque alrededor, para comprobar cómo se ve el bosque «que sigue».
- Las colisiones son las de la planta original, superpuestas en el modo de depuración de la página.

---

## 2. Contenido

### 2.1 Suelo

| Elemento | Cantidad | Tamaño en el mundo | Notas |
|---|---|---|---|
| Baldosas de terreno: tierra, hojarasca, musgo | 3, con 2 variantes cada una | 128×128 u | Se repiten sin costuras; máscaras de mezcla entre terrenos |
| Sendero de tierra en el centro del pasillo | 1 tira que se repite y 2 extremos | 64 u de ancho | Más estrecho que el pasillo, con hierba a los lados |
| Calcomanías: raíces, helechos, hojas, piedras, setas planas, charco | ~20 | De 16 a 96 u | Rompen la repetición |

### 2.2 Límites (los muros de la planta vestidos de bosque)

| Elemento | Cantidad | Notas |
|---|---|---|
| Troncos de alturas distintas | 6–8 | La base no invade más de ~8 u la zona transitable; el resto sube en ¾ |
| Matas y matorral de borde | 4 | Silueta irregular sobre el borde de las casillas sólidas |
| Raíces enfermas con pústulas ámbar | 2 | Anticipan el interior podrido del bosque |
| Fondo de sotobosque | 1 baldosa oscura y troncos lejanos | Lo de dentro de los muros se ve como bosque que continúa, no como bloque |

### 2.3 Capa alta

- Copas de 3 tipos (más o menos 110×80 u).
- Se vuelven semitransparentes en un radio de unas 3 casillas alrededor de cada jugador.

### 2.4 Luz y atmósfera (código)

- Tinte de ambiente verde dorado y **nivel mínimo de luz**.
- 3 haces de luz entre las copas, más intensos en la sala para que se lea como claro.
- Bruma baja que se mueve.
- Polen o luciérnagas.
- Viñeta suave.

### 2.5 Actores

**El Guerrero del prototipo A**, con mando de teclado y ratón: andar, Espadazo, Golpetazo y esquiva.

**Un Mordisquín pintado y animado**, la variante del Bosque. Sus datos actuales, que el diseño respeta:

| Dato | Valor |
|---|---|
| Colisión | Radio 12 |
| Altura visual | 34 |
| Velocidad | 112 |
| Ataque | Muerde a menos de 46 de distancia. **Preparación de 0,38 s** (pose mantenida), embestida corta y recuperación de 0,45 s |
| Vistas | 3 + reflejo ([PIPELINE_ASSETS.md](PIPELINE_ASSETS.md), sección 2) |
| Animaciones | Reposo, andar, preparación, mordisco, daño y muerte |

- En la página de prueba, el Mordisquín se mueve con una **IA de prueba sencilla** que imita la del juego. **No es la IA del juego ni la sustituye.**

### 2.6 Interfaz

Ninguna, para evaluar solo el mundo.

---

## 3. Variantes de la escena para medir

| Variante | Qué tiene |
|---|---|
| 1. Escena base | 1 Guerrero y 1 Mordisquín |
| 2. Cooperativo | 4 Guerreros y 12 Mordisquines, con combate automático y efectos |
| 3. Peor caso | 4 Guerreros, 30 Mordisquines, 200 partículas y 15 luces |
| 4. Comparación | La misma planta con el arte actual del juego, en una captura de referencia |

**Pantallas:** 1280×720, 1920×1080, 2560×1440 y 1920×1080 a dpr 2.

**Modos de dibujo:** resolución real y mixto, con y sin escala de render al 75 % ([ARQUITECTURA_ARTE.md](ARQUITECTURA_ARTE.md), sección 3.4).

Si se aprueba la prueba de AD-7, también **Canvas 2D frente a PixiJS**.

---

## 4. Criterios de aceptación

1. **Se lee como bosque:** el director, y si se quiere otras personas sin contexto, describen la escena como un bosque o un claro, no como un pasillo o una mazmorra.
2. **Colisión honesta:** en 2 minutos de juego no hay ningún sitio donde el dibujo invite a pasar y la colisión lo impida, ni al revés.
3. **Legibilidad:** en la variante cooperativa, el Mordisquín que prepara un mordisco se distingue en todo momento. Se aplica la lista de aceptación de la biblia.
4. **Rendimiento:** los objetivos de AD-9 en los equipos de referencia ([PLAN_PRODUCCION_ARTE.md](PLAN_PRODUCCION_ARTE.md), sección 4).
5. **Memoria:** dentro del presupuesto de [PIPELINE_ASSETS.md](PIPELINE_ASSETS.md), sección 5.4.
6. **Aprobación del director.**

**Si el criterio 1 falla con la alternativa A**, el resultado sirve para decidir si se abre la alternativa B1 (generador de claros y senderos), como tarea de reglas aparte.

---

## 5. Esfuerzo orientativo

| Bloque | Esfuerzo |
|---|---|
| Suelo, sendero y calcomanías | 4–6 días de artista |
| Troncos, matas, raíces, sotobosque y copas | 5–8 días de artista |
| Mordisquín: concepto, piezas en 3 vistas y 6 animaciones | 5–8 días de artista |
| Página de prueba, planta real, IA de prueba, luces y mediciones | 3–5 sesiones mías |
| **Total** | **≈ 14–22 días de artista y 3–5 sesiones mías** |
