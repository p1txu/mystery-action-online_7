# Arte del mundo (versión 0.37)

Reconstrucción visual de la aldea y de las mazmorras al estilo de la referencia: pixel art medieval cálido, adoquines individuales, casas de entramado, tejados de colores, estandartes, faroles y luz de atardecer. Todo es original y está pintado por código. No hay imágenes externas.

## Separación entre dibujo y reglas

- **Las colisiones siguen siendo las casillas del mundo:**
  - en la aldea, `generateVillage`;
  - en las mazmorras, `FloorGen`, con las mismas semillas.
- **El dibujo solo lee el mapa**:
  - `TownGround`, `TownArt`, `TownScene` en la aldea;
  - `DungeonGround`, `DungeonScenery` en las mazmorras;
  - `ChestArt` para los cofres.
- **El servidor no cambia.** La aldea es solo del cliente, y las mazmorras usan exactamente la misma rejilla.
- **Lo que se ve sólido es sólido.** Cada objeto de la aldea está sobre una casilla que no se puede atravesar. El arco de la puerta es la excepción: es un paso por debajo. Lo comprueba `tests/e2e/world_art.py`.

## Aldea

**Suelo** (`TownGround`), pintado píxel a píxel por trozos de 8×8 casillas:
- **Calles:** adoquines con un diagrama de Voronoi. Cada piedra tiene su tono, canto iluminado arriba a la izquierda, sombra, grietas y poros. En las juntas hay musgo, tierra o mortero.
- **Plaza:** anillos concéntricos de losas, con una rosa de los vientos de latón en el centro.
- **Hierba:** dos verdes en zonas grandes, matas de briznas, alguna flor y calvas de tierra con guijarros.
- **Estanque:** forma redondeada, orilla de piedras y destellos animados.
- **Bordes entre materiales:** irregulares, deformados con ruido.

**Edificios** (`TownArt.house`): 13 casas, cada una con su planta en casillas:
- **Plantas:**
  - planta baja de sillería, con hiladas desplazadas, esquinas de piedra grande, zócalo y alguna grieta;
  - planta alta de entramado: revoco con manchas, vigas con veta, jabalcones en aspa y en diagonal, y voladizo con ménsulas.
- **Tejados:**
  - teja curva verde o roja, pizarra azul o paja;
  - con cumbrera, alero con tabla, musgo y tejas rotas;
  - hastial con frontón de entramado y tablas de alero talladas.
- **Fachada:** ventanas con parteluz y reflejo, algunas encendidas con velas; postigos, jardineras con flores, arcos de dovelas, puertas de tablones con herrajes o abiertas, chimeneas, hiedra, rótulos colgantes con icono, estandartes y antorchas de pared.

| Edificio | Planta | Aspecto |
|---|---|---|
| Gremio de exploradores | 6..14 × 5..9 | teja verde con musgo, hastial con el emblema de la espada, estandartes verdes, dos antorchas, rótulo de brújula |
| Tienda y taller | 29..37 × 5..9 | pizarra azul, emblema de poción, estanterías con mercancía, rótulo de moneda, dos puestos con toldo |
| Casa del alcalde | 14..18 × 10..13 | teja roja, flores, faroles junto a la puerta, hiedra |
| Chozas | 3..6 × 11..13 y 37..40 × 11..13 | paja, una planta |
| Taberna (nueva) | 26..31 × 2..3 | teja verde, antorchas, rótulo de jarra, terraza con mesas, sillas y barriles |
| Casas nuevas | 10..15 × 2..3, 16..18 × 6..8, 24..27 × 6..8, 4..9 × 20..22, 17..22 × 25..27, 36..40 × 19..20 | cada una con su tejado, ventanas, postigos y chimenea |

**Objetos** (`TownProps` y `TownArt`):
- **Del gremio:** armero, muñeco de prácticas, barriles y cajas.
- **De mercado:** puestos con toldo y fruta, pan, pociones, libros y velas.
- **Plaza y campamento:** tablón de misiones con tejadillo (las misiones se pintan según las que haya), hoguera con troncos, pozo con tejadillo, carro, heno, banco y tiendas de campaña.
- **Calle y jardín:** farolas de hierro forjado, macetas.
- **Naturaleza:** árboles con copa en racimos y sombra, rocas con musgo y juncos.
- **Puerta de las mazmorras:** dos torres de sillería con almenas, brasero y runas, y un arco de dovelas con el cristal del portal.

**Profundidad:**
- Edificios, objetos y árboles son sprites que se ordenan con los personajes por la línea del suelo. Puedes pasar por delante de ellos y por detrás.
- Si quedas tapado detrás de una casa, un árbol o una torre, se vuelve semitransparente.

**Luz:**
- Atardecer cálido y suave: el ambiente pasa de 0,46 a 0,20 de opacidad y la viñeta es ligera.
- 37 luces: ventanas encendidas, antorchas y braseros con llama de píxeles animada, farolas, la hoguera y el portal.

## Mazmorras

`DungeonGround` pinta píxel a píxel cada bioma:

| Bioma | Suelo | Muros (parte de arriba / cara) |
|---|---|---|
| Bosque | hierba con matas y hojarasca, senderos de tierra con guijarros, losas con musgo en las ruinas | follaje en racimos con bayas / tierra con raíces y musgo colgando |
| Ciénaga | hierba oscura, charcos de barro | follaje oscuro con setas / tierra y raíces |
| Cueva | roca en losas irregulares con destellos de cristal | roca rugosa con grietas y vetas de cristal / estratos con vetas |
| Mina | tierra apisonada con grava; raíles sobre traviesas en los pasillos | roca con vetas de oro / estratos con puntales de madera |
| Cráter | losas de basalto, alguna junta con brasas (la lava se ve distinta); ceniza en los pasillos | basalto / estratos con vetas de lava |

En todos los biomas:
- **Contorno y canto:** cada muro tiene labio iluminado y contorno oscuro.
- **Sombra:** hay sombra de contacto en el suelo, junto a los muros y bajo ellos.
- **Pasajes secretos:** conservan su pista, unas grietas sutiles.
- **Árboles (bosque y ciénaga):** son sprites ordenados en profundidad, como en la aldea. La espesura cerrada se pinta como copas.
- **Luz:** el ambiente es entre un 30 y un 35 % menos oscuro, y la viñeta más suave. Los pisos «sin luz» siguen funcionando igual.
- **Rendimiento:** los trozos pintados se guardan en caché y solo se repintan los afectados cuando cambia una casilla (puertas y pasajes).

## Cofres e interfaz

- **Cofres** (`ChestArt`): común, plata, raro y del guardián.
  - Vista 3/4 con tablones, refuerzos, remaches, cerradura y tapa abovedada.
  - 4 fases de apertura, con el botín brillando dentro.
- **Interfaz:** paneles de madera con veta, filo de latón y remaches, y barras con marco.

## Rendimiento medido (Chromium sin GPU, 1280×720)

- Escena de la aldea: unos 200 ms, una vez al entrar.
- Trozo de suelo: unos 30-45 ms. Los que no se ven se pintan en segundo plano.
- Fotograma: unos 4 ms en la aldea y 2,5-3 ms en las mazmorras.

## Pendiente

- **Enemigos, jefes y efectos de combate:** conservan su dibujo anterior, el de `Rig` y las criaturas de la sección 25. Hay que rehacerlos a este nivel de detalle.
- **Rocas, cristales, escaleras, puertas y trampas de las mazmorras:** siguen con el dibujo anterior, encima del suelo nuevo.
- **Objetos del suelo y del inventario:** mantienen sus iconos.
