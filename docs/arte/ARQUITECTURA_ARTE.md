# Arquitectura del arte nuevo

- **Estado:** análisis y propuesta. **No se ha cambiado el renderizador ni se ha integrado ningún recurso.**
- **Las pruebas de este documento son aisladas:**
  - se hicieron sobre una **copia** del prototipo y sobre una página de prueba aparte;
  - todo está fuera del repositorio;
  - no han modificado el juego.
- **Principio:** las reglas no saben que existe el arte; el arte solo lee el estado.

---

## 1. Cómo dibuja hoy el juego

`Renderer` (en `prototype/mystery-action.html`):

1. Calcula la densidad de pantalla: `full = zoom × dpr`.
2. Elige un **factor entero** `k = round(full / CONFIG.ART_PIXEL)`, con `ART_PIXEL = 1`.
3. Pinta todo el mundo en un búfer de `pantalla / k` píxeles, a unos `full / k` píxeles por unidad: entre 0,87 y 1,3.
4. Amplía el búfer ×k **sin suavizado**.
5. Pinta encima, a resolución real, los textos (`label`).

**Ejemplo a 1920×1080:** `k = 3` y el mundo se pinta en un búfer de **640×360**.

**Consecuencia:** cualquier imagen, por muy detallada que sea, pierde todo lo que no cabe en esos ~0,87 px por unidad.

**Lo que permite no reescribir el motor:**

- La resolución del búfer ya es un parámetro (`ART_PIXEL`).
- Con `k = 1` el mismo renderizador pinta a resolución real. En las pruebas funcionó con todo el juego actual sin un solo error de ejecución.
- Los textos ya se pintan aparte a resolución real.

---

## 2. Separación entre reglas y presentación

```
reglas (núcleo compartido, servidor)  ──estado──▶  presentación (solo cliente)
posición, radio, estado, tiempos            elige la animación, dibuja, ilumina
```

### 2.1 Integración propuesta (para cuando se autorice)

1. **Módulo solo de cliente `ArtPack`.**
   - Carga el manifiesto y los atlas ([PIPELINE_ASSETS.md](PIPELINE_ASSETS.md)).
   - Da `sprite(id)` y `anim(id, estado, t)`.
   - **No entra en `shared/engine-core.generated.js`**, así que el servidor no cambia.
   - Una prueba automática comprobará que el núcleo generado no lo contiene.
2. **Adaptadores con las interfaces que ya existen.** Si hay arte nuevo para algo, se usa; si no, se dibuja el clásico.

   | Interfaz actual | Qué dibuja |
   |---|---|
   | `HeroSprites.frame(clase, vista, anim, fotograma)` y `HeroSprites.pick(clase, estado)` | Héroes |
   | `kind.draw` | Criaturas y jefes |
   | `ChunkCache.paint` / `chunkCanvas` | Suelos |
   | `Deco`, `DungeonScenery`, `TownArt` | Atrezo |
   | `drawItemIconStyled`, `UI.icon` | Iconos |

3. **Modo de dibujo según el arte.**
   - Arte clásico: `k` entero, como hoy.
   - Arte nuevo: `k = 1`, con las optimizaciones de la sección 3.4.
4. **El estado manda.**
   - La animación se elige con el estado de la entidad, el mismo que ya llega por red.
   - El instante de impacto sale de los tiempos de las reglas.
   - En línea se mantienen la interpolación de 100 ms y la predicción local.
5. **Datos visuales aparte.**
   - Ancla, escala visual, capa y luz propia van en el manifiesto.
   - `radius`, alcances y daños siguen **solo** en las reglas.

### 2.2 Transición temporal (AD-1)

- Habrá una opción de arte «clásico / nuevo» **solo mientras dure la transición**. No es una solución permanente.
- **Regla de bloques completos:** a los jugadores solo se les ofrece el arte nuevo en zonas completas. En una pantalla no se mezclan estilos.
- **Criterio para retirar el modo clásico:**
  - todas las zonas, actores, iconos e interfaz tienen arte nuevo y han pasado la lista de aceptación;
  - las pruebas de rendimiento (AD-9) se cumplen en los equipos de referencia;
  - el director lo aprueba.
- Al retirarlo se elimina el código de dibujo clásico. Esa retirada será una tarea con autorización propia.

### 2.3 Qué se protege y cómo

| Sistema | Riesgo | Protección |
|---|---|---|
| Movimiento y colisiones | Un dibujo que sugiera otra colisión | Regla de huella ±15 % y prueba con la colisión superpuesta (modo de depuración actual) |
| Combate | Impacto visual desincronizado | Pose de impacto atada al tiempo de regla. Siguen las pruebas actuales de golpes en línea y del Arquero |
| Clases y habilidades | Animaciones que pidan cambiar tiempos | Prohibido: el arte se ajusta a `MOVES` |
| Enemigos e IA | Ninguno: la IA no lee el dibujo | La batería actual debe seguir correcta |
| Loot y progresión | Iconos con otro id | Búsqueda por id de objeto. Prueba de que los 89 objetos tienen icono |
| Mazmorras | Que el bosque abierto se cuele como cambio de reglas | Separado como AD-6 ([MUNDO_Y_PERSONAJES.md](MUNDO_Y_PERSONAJES.md), sección 7) |
| Persistencia | Ninguno: el guardado no incluye arte | La opción de arte va en `Options`, no en la partida |
| Servidor autoritativo | Que el servidor cargue imágenes | El módulo de arte vive solo en el cliente; prueba sobre el núcleo generado |
| Cooperativo de 4 | Memoria con 4 clases distintas | Presupuesto de memoria y prueba con 4 clientes reales |
| Modo sin conexión | Que el arte dependa de la red | Caché local del paquete de arte y recurso de reserva ([PIPELINE_ASSETS.md](PIPELINE_ASSETS.md), sección 7) |

---

## 3. Pruebas: ¿hace falta pintar el mundo a resolución real?

### 3.1 Entorno de las pruebas y sus límites

- Chromium 153 sin pantalla (Playwright), en un contenedor en la nube de **2 núcleos** Xeon a 2,1 GHz.
- **Sin tarjeta gráfica:** el navegador informa de SwiftShader, un renderizador por software.
- **Por tanto:**
  - los tiempos absolutos son **pesimistas** y no representan un PC real;
  - lo que vale es la **proporción** entre modos.
- El objetivo de 60 fps se valida en los equipos de referencia ([PLAN_PRODUCCION_ARTE.md](PLAN_PRODUCCION_ARTE.md), sección 4).

### 3.2 Prueba 1: el juego real, con el arte actual, a resolución actual y a resolución real

**Montaje:**

- Copia del prototipo de `main` 0.46.
- Piso 1 del Bosque (semilla 7) y del Cráter (semilla 7).
- 4 héroes (Guerrero, Arquero, Mago y Asesino) y los enemigos del piso más 12 añadidos (16 en pantalla).
- Combate continuo durante 6 s.
- Se compara `k` entero, como hoy, con `k = 1`, cambiando `CONFIG.ART_PIXEL` en la copia.
- Se mide el tiempo de `Renderer.draw` por fotograma.

| Zona | Pantalla | Modo | Dibujo, media (ms) | Dibujo, p95 (ms) | Intervalo entre fotogramas, media (ms) | Lienzos + suelo en caché (MB) |
|---|---|---|---|---|---|---|
| Bosque | 1280×720 | Actual (k=2) | 10,6 | 14,2 | 17,9 | 4,6 + 1,5 |
| Bosque | 1280×720 | Resolución real | 20,8 | 26,2 | 30,8 | 7,9 + 6,1 |
| Bosque | 1920×1080 | Actual (k=3) | 10,0 | 13,5 | 19,1 | 9,0 + 2,3 |
| Bosque | 1920×1080 | Resolución real | 37,4 | 46,0 | 49,1 | 17,8 + 13,6 |
| Bosque | 1920×1080 a dpr 2 | Actual (k=5) | 13,0 | 18,6 | 33,9 | 33,2 + 3,3 |
| Bosque | 1920×1080 a dpr 2 | Resolución real | 132,8 | 154,0 | 155,2 | 71,2 + 81,2 |
| Cráter | 1920×1080 | Actual | 10,2 | 14,2 | 19,8 | 9,0 + 1,5 |
| Cráter | 1920×1080 | Resolución real | 37,7 | 49,6 | 50,5 | 17,8 + 13,6 |

**Resultado visual:** a resolución real **el arte actual sigue siendo pixel art**, con píxeles de tamaño desigual, porque 2,6 no es entero. Subir la resolución sin arte nuevo **no mejora el estilo** y cuesta mucho.

*La lámina «El Guerrero actual en el juego y el mismo arte a resolución real» se entregó al director con este informe. No se ha añadido al repositorio para no meter imágenes en la rama documental.*

**Lectura:**

- Buena parte del arte actual se dibuja con órdenes de Canvas en cada fotograma (rectángulos, trazados, degradados de criaturas, efectos, luces y atmósfera). En un renderizador por software, su coste crece con los píxeles.
- Multiplicar por 9 los píxeles (k=3 → k=1) multiplica el dibujo por **3,7** en 1080p y por **10** a dpr 2.

### 3.3 Prueba 2: escena sintética con imágenes de alta resolución

**Montaje:** página de prueba aislada (`banco-resolucion.html`, entregada al director y fuera del repositorio).

- **Escena:** bosque con 4 héroes de 8 piezas cada uno, para simular el coste de un esqueleto 2D; 24 enemigos de 5 piezas; 150 elementos de atrezo; 400 calcomanías; copas; 80 partículas; 10 luces más una por héroe; viñeta; un telegrafiado y una estela.
- **Imágenes:** **figuras de prueba sintéticas en SVG**, no arte del juego. Se rasterizan a la densidad de cada modo, como si se cargaran de un atlas.
- **Modos:**
  - **Actual:** búfer a ~1 px/u, ampliado sin suavizado, con recursos a 1 px/u. Es lo que pasaría hoy con imágenes nuevas.
  - **Suave:** lo mismo, ampliado con suavizado.
  - **Real:** todo a resolución real, con recursos Estándar (3 px/u) o HD (6 px/u) según la pantalla.
  - **Mixto:** suelo y luz a media resolución con suavizado; actores y atrezo a resolución real.

#### Calidad

SSIM y nitidez relativa frente a un dibujo ideal: las figuras vectoriales pintadas directamente a la densidad exacta de la pantalla. Recorte de 220×220 px alrededor del héroe; 1 significa idéntico.

| Pantalla | Actual | Suave | Real | Mixto |
|---|---|---|---|---|
| 1280×720 | 0,750 (nitidez 0,79) | 0,786 (0,64) | **0,949** (1,12) | 0,915 (1,10) |
| 1920×1080 | 0,758 (0,69) | 0,784 (0,61) | **0,958** (1,04) | 0,934 (1,03) |
| 1920×1080 a dpr 2 | 0,739 (0,59) | 0,757 (0,49) | **0,989** (1,01) | 0,964 (1,00) |

- **Actual:** las ilustraciones salen pixeladas; se pierde el contorno, los ojos y el filo de la espada.
- **Suave:** salen borrosas; la nitidez baja a la mitad.
- **Real y mixto:** conservan el dibujo. En el mixto solo pierde algo el suelo, que la biblia ya quiere suave.

*Láminas comparativas entregadas al director con este informe; no se han añadido al repositorio.*

#### Rendimiento

Tiempo de dibujo de la escena por fotograma, en ms (media / p95), e intervalo medio entre fotogramas.

| Pantalla | Actual | Suave | Real | Mixto |
|---|---|---|---|---|
| 1280×720 | 5,2 / 6,8 (16,7) | 5,9 / 8,0 (16,7) | 15,5 / 20,0 (17,3) | 16,4 / 20,0 (17,8) |
| 1920×1080 | 5,3 / 7,2 (16,7) | 5,4 / 7,3 (16,7) | 28,6 / 35,0 (31,3) | 35,2 / 53,2 (38,2) |
| 2560×1440 | 8,3 / 11,2 (16,7) | 6,7 / 7,7 (18,4) | 51,2 / 63,4 (56,4) | 65,2 / 85,3 (70,9) |
| 1920×1080 a dpr 2 | 6,4 / 9,1 (17,0) | 7,2 / 9,6 (36,6) | 130,8 / 170,1 (141,9) | 135,7 / 151,8 (147,6) |

**Memoria de lienzos + recursos de la escena a 1080p:**

| Modo | Memoria |
|---|---|
| Actual | 11,3 + 0,3 MB |
| Real | 38,2 + 2,4 MB |
| Mixto | 24,9 + 2,4 MB |

A dpr 2, el modo real usa 152 + 9,7 MB.

**Lectura:**

- En este entorno sin GPU, el coste lo marca el número de píxeles que se rellenan: búfer, suelo, capa de luz y composición.
- El modo **mixto no ahorra tiempo aquí**, porque añade una ampliación a pantalla completa que por software es cara. Con GPU, esa ampliación suele ser casi gratis: **hay que medirlo en equipos reales.**
- Lo que sí demuestra la prueba es que **el número de imágenes de la escena no es el problema**: el modo actual, con las mismas 700 imágenes pequeñas, va a 5 ms.

### 3.4 Conclusión

1. **Pintar a resolución real es necesario.**
   - Con el búfer actual, el arte ilustrado queda pixelado (SSIM ~0,75) o borroso (~0,78).
   - A resolución real se conserva (~0,95–0,99).
   - No hay forma de mostrar ilustración nítida a 0,87 píxeles por unidad.
2. **No es suficiente por sí solo:** con el arte actual, subir la resolución no cambia el estilo y cuesta mucho, porque ese arte se dibuja con órdenes de Canvas en cada fotograma.
3. **No hace falta reescribir el renderizador** para el arte nuevo:
   - basta con `k = 1` en el modo de arte nuevo y con los adaptadores;
   - el resto del `Renderer` (orden por `y`, capas, luces, efectos, telegrafiados) se conserva.
4. **Optimizaciones que se medirán en equipos reales**, sin decidir nada todavía:
   - **escala de render:** la capa del mundo a un porcentaje de la resolución, por ejemplo 75 %, con suavizado; es una opción del jugador;
   - **suelo y luz a media resolución**: el modo mixto;
   - **suelo por baldosas en vez de trozos en caché a resolución real**: a dpr 2 los trozos cacheados ocupan 81 MB en el juego real;
   - **luz a un cuarto de resolución.**
5. **El recurso debe tener una densidad cercana a la de la pantalla.** Una prueba complementaria ([PIPELINE_ASSETS.md](PIPELINE_ASSETS.md), sección 1.3) muestra que en Canvas 2D también empeora reducir mucho un recurso grande. De ahí los tres niveles de ejecución: Ligero, Estándar y Alto.
6. **El rendimiento real no se puede afirmar desde aquí.** Este entorno no tiene GPU. La decisión necesita las mediciones de AD-9 en los equipos de referencia, con la misma página de prueba.

---

## 4. Canvas 2D frente a PixiJS (AD-7: comparación, sin elegir)

### 4.1 Comparación

| Criterio | Canvas 2D (actual) | PixiJS v8 (WebGL o WebGPU) |
|---|---|---|
| **Calidad de imagen** | Suavizado bilineal sin mipmaps. Al reducir más de ~1,5–2 veces aparecen dientes (por eso los 3 niveles de [PIPELINE_ASSETS.md](PIPELINE_ASSETS.md)) | Mipmaps y filtros: reduce bien, y bastarían menos niveles. Sombreadores para corrección de color y efectos |
| **Rendimiento** | Cada `drawImage` con transformación tiene coste propio. Bien para cientos de imágenes; con miles depende mucho del navegador y del equipo | Agrupa las imágenes en pocas llamadas a la GPU. Escala a miles de sprites |
| **Memoria** | Ancho × alto × 4 por imagen, sin control fino de la GPU | Igual sin compresión, pero admite **texturas comprimidas** (KTX2/Basis), unas 4–8 veces menos memoria, y control explícito de liberación |
| **Iluminación** | Degradados y modos de mezcla, como hoy | Lo mismo, más texturas de render y sombreadores: luz con mapas de normales, sombras suaves, distorsión de calor en el Cráter |
| **Animación** | Fotogramas: perfecto. Esqueleto: runtimes Canvas limitados (sin modos de fusión ni tinte negro en Spine; mallas limitadas) | Runtime oficial de Spine para PixiJS v8 completo; Rive tiene runtime WebGL |
| **Escalabilidad** | Limitada por el coste por imagen y por el relleno de píxeles | Alta |
| **Dificultad de integración** | Mínima: el `Renderer` actual con `k = 1` y adaptadores | Alta: todo lo que hoy dibuja con `ctx` (efectos, telegrafiados, atrezo de código, luces, atmósfera, minimapa e iconos) hay que portarlo o pintarlo en un lienzo que se sube como textura cada fotograma, que tiene su coste |
| **Riesgo de migración** | Bajo | Alto: dos sistemas de dibujo durante la transición; el orden por `y` mezclando sprites de PixiJS y dibujo de código obliga a portar casi todo a la vez; las pruebas sin pantalla con WebGL van por software |
| **Licencia y dependencia** | Ninguna | MIT; una dependencia externa más que hay que actualizar |
| **Respaldo** | — | Desde la 8.16, renderizador Canvas experimental para equipos sin WebGL |

**Ruta híbrida posible:** PixiJS solo para la capa del mundo (suelo, atrezo, actores y luces) y Canvas 2D para la interfaz y lo que no tenga orden de profundidad. Reduce lo que hay que portar, pero no lo elimina: los efectos que se ordenan junto a los actores tendrían que pasar a PixiJS.

### 4.2 Diseño de la prueba comparativa (pendiente de autorización)

**Objetivo:** medir los dos enfoques en condiciones equivalentes antes de decidir.

**Qué se prueba:**

- La misma página de prueba aislada con **dos motores intercambiables** que comparten escena, recursos, cámara y lógica:
  1. **Canvas 2D**, ya hecho: `banco-resolucion.html`;
  2. **PixiJS v8 con WebGL**;
  3. **PixiJS v8 con WebGPU**, si el navegador lo tiene;
  4. **PixiJS v8 con su respaldo Canvas.**
- Los mismos recursos en los mismos niveles. En PixiJS, además, una pasada con mipmaps y otra con texturas comprimidas, si se aprueba la herramienta para generarlas.
- **Escenas** (las de AD-9, no una escena vacía):
  - aldea con 4 héroes;
  - bosque con 4 héroes, 16 enemigos y combate;
  - jefe con efectos;
  - bioma oscuro con 15 luces;
  - peor caso: 4 héroes, 30 enemigos, 2 jefes, 200 partículas.
- **Pantallas:** 1280×720, 1920×1080, 2560×1440 y 1920×1080 a dpr 2.

**Métricas:** las de AD-9 ([PLAN_PRODUCCION_ARTE.md](PLAN_PRODUCCION_ARTE.md), sección 4):

- tiempos de fotograma (p50, p95, p99);
- fotogramas lentos;
- memoria;
- tiempo de carga;
- calidad (SSIM frente a la referencia y revisión visual).

**Método:**

- 10 s de calentamiento y 60 s de medida.
- 3 repeticiones por combinación.
- Navegador actualizado, sin otras pestañas, con el equipo enchufado.

**Esfuerzo de integración:** se estimará portando a PixiJS **un sistema real del juego**, por ejemplo los telegrafiados de Gromgar, en una copia aislada, para contar lo que cuesta.

**Requisito:**

- descargar PixiJS (MIT) **solo en la carpeta de pruebas**, fuera del juego;
- según las restricciones de esta fase, **necesita autorización** porque supone instalar software.

**Resultado:** un informe con los números de cada equipo de referencia. La elección del renderizador la hace el director después de revisarlo.
