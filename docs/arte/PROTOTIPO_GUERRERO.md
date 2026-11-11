# Prototipo A: el Guerrero

- **Estado:** especificación. **No se ha producido nada y no se integra en el juego.**
- **Objetivo:** comprobar que un héroe ilustrado se lee igual o mejor que el actual, en todas sus vistas y animaciones, con la memoria y el coste de dibujo que se puedan permitir 4 jugadores.
- **Depende de:**
  - AD-4: quién produce el arte;
  - AD-5: herramienta de animación;
  - [BIBLIA_ARTISTICA.md](BIBLIA_ARTISTICA.md) y [PIPELINE_ASSETS.md](PIPELINE_ASSETS.md).

---

## 1. Datos del juego que el diseño debe respetar

Los datos salen de `main` 0.46. **El diseño no cambia ninguno.**

| Dato | Valor | Dónde |
|---|---|---|
| Altura visual | ~54 unidades (≈1,7 casillas) | `docs/SPRITES.md` |
| Colisión | Círculo de radio 11 (`radius`); caja de golpe 18×12 | `Player` |
| Ataque básico (Espadazo) | Alcance 52, arco de 110°. **El daño se aplica en el mismo instante en que se pulsa**; el gesto (`swing`) dura 0,32 s | `MOVES.espadazo` |
| Habilidad (Golpetazo de escudo) | Preparación 0,18 s, luego golpe en arco de 62 y 120° con aturdimiento de 1 s; recuperación 0,25 s; el héroe va más lento mientras tanto | `MOVES.golpetazo` |
| Esquiva | 0,17 s de desplazamiento; invulnerable 0,22 s | `CONFIG.DODGE_TIME`, `DODGE_IFRAMES` |
| Caída | 6 fotogramas de 0,11 s; termina tendido. También se usa en la llegada en carretilla | `HeroSprites.pick` |
| Elección de vista | Octante del movimiento o del ángulo del golpe | `HeroSprites.pick` |

**Consecuencia para el Espadazo:**

- Como el daño es inmediato, **no puede haber anticipación antes del golpe**. Si el tajo se viera a los 0,15 s, el jugador vería al enemigo recibir daño antes del gesto.
- **Diseño:**
  - el reposo de combate ya lleva la espada algo alzada;
  - los primeros ~0,08 s de la animación son ya el tajo;
  - el resto, hasta 0,32 s, es seguimiento y recuperación.
- El código dibuja la estela en el mismo instante del daño, como hoy.

---

## 2. Entregables

### 2.1 Hoja de concepto

- 3 propuestas de silueta (rellenas de negro).
- La elegida, con:
  - paleta de materiales: acero, cuero, tabardo de lana, dorado;
  - detalle de yelmo, hombreras, escudo de lágrima y espada;
  - relación de tamaño con la colisión: la elipse de radio 11 dibujada a sus pies.

### 2.2 Hoja de modelo en 5 vistas

- Frente, ¾ frente, perfil, ¾ espalda y espalda, a escala de mundo, sobre una cuadrícula de casillas de 32.
- La justificación de las 5 vistas está en [PIPELINE_ASSETS.md](PIPELINE_ASSETS.md), sección 2.

### 2.3 Piezas separadas para el rig, por vista

| Grupo | Piezas |
|---|---|
| Cuerpo | Cabeza con yelmo; torso; pelvis |
| Brazos | Brazos, antebrazos y manos (izquierda y derecha) |
| Piernas | Muslos, piernas y pies |
| Equipo | Escudo (frente y canto); espada; tabardo delantero y trasero; capa corta, si se añade |

- Pintadas a **8 px/u** como mínimo, con solape en las articulaciones y su ficha de origen ([PLAN_PRODUCCION_ARTE.md](PLAN_PRODUCCION_ARTE.md)).

### 2.4 Rig y animaciones

Los mismos estados que hoy, para que la interfaz `HeroSprites.pick` no cambie:

| Animación | Duración | Claves |
|---|---|---|
| Reposo | Bucle de 1,2–1,6 s | Respiración y tabardo con movimiento secundario. Variante de combate con la espada alzada |
| Andar | Bucle ajustado a la velocidad real del héroe | Sin patinar; brazos y piernas opuestos; escudo con peso |
| Espadazo | 0,32 s: tajo inmediato, seguimiento y recuperación | Arco de la espada sobre el abanico de 110°; la punta no supera el alcance de 52 |
| Golpetazo de escudo | 0,18 s de preparación, golpe, 0,25 s de recuperación | Escudo atrás y luego adelante con paso. La pose de preparación se mantiene los 0,18 s |
| Daño | ~0,2 s | Retroceso; el destello lo pone el código |
| Esquiva | 0,17 s | Agachado y lanzado en la dirección del movimiento |
| Caída | ~0,66 s, terminando tendido | Rodillas, caída y quieto en el suelo |

### 2.5 Dos formas de llevarlo al juego (AD-5)

1. **Esqueleto en vivo:** atlas de piezas y datos de animación.
2. **Horneado a fotogramas:** a 12–15 fotogramas por segundo, con retoque a mano de las poses clave (impacto del tajo, golpe de escudo y caída).

### 2.6 Exportes

- Niveles Ligero, Estándar y Alto ([PIPELINE_ASSETS.md](PIPELINE_ASSETS.md)).
- Atlas y manifiesto de prueba.

### 2.7 Página de evaluación aislada

**Fuera del juego.** Muestra:

- el Guerrero nuevo junto al actual sobre el suelo de la aldea y el de Brumaverde, en 1280×720, 1920×1080 y a dpr 2;
- las 8 direcciones y todas las animaciones, con mando de teclado;
- la colisión superpuesta;
- las pruebas de silueta y de escala de grises;
- 4 Guerreros a la vez, para medir memoria y tiempo de dibujo en los equipos de referencia.

---

## 3. Criterios de aceptación

1. Cumple la lista de aceptación de la biblia (sección 11).
2. **Lectura de dirección:** en las 8 direcciones se distingue hacia dónde mira y hacia dónde golpea, también en diagonal.
3. **Sincronía:** el tajo se ve en el mismo fotograma en que aparece la estela del código, y el escudo golpea al terminar los 0,18 s.
4. **Huella:** dentro de ±15 % de la colisión en todas las vistas.
5. **Memoria y tiempo**, con 4 instancias, dentro de lo que fije AD-9 en el equipo mínimo de referencia.
6. **Comparativa (a) frente a (b)** documentada: calidad, memoria, tiempo de dibujo y facilidad de integración.
7. **Aprobación del director.**

---

## 4. Esfuerzo orientativo

| Bloque | Días de artista |
|---|---|
| Concepto (3 siluetas y elegida) | 2–4. Con exploración asistida por IA (AD-4) puede bajar a 1–2, pero la versión final es humana |
| Hoja de modelo y piezas en 5 vistas | 6–10 |
| Rig y 7 animaciones (más la variante de reposo) | 8–12 |
| Horneado y retoque de poses clave | 2–3 |
| **Total** | **≈ 18–29 días de artista** |

**Mi parte:** la página de evaluación, la exportación de prueba y las mediciones: unas 2–3 sesiones.

Las cifras se revisarán con quien produzca el arte.
