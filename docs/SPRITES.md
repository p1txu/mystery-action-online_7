# Sprites de los héroes (versión 0.35)

Los cuatro héroes se han rediseñado desde cero en pixel art de RPG de fantasía, con las cuatro imágenes de referencia como guía de estilo: contorno oscuro, paletas limitadas, luces y sombras en metal, tela, cuero y piel. Los diseños son originales.

## 1. Diseños

| Clase | Silueta e identidad | Detalles |
|---|---|---|
| **Guerrero** | Caballero robusto: hombreras grandes, escudo de lágrima a un lado y espada ancha en la otra mano | Yelmo cerrado con rendija en T, nervio y ceja dorados, y respiraderos. Peto con arista central, lamas y ribete dorado. Gola, quijotes de malla, rodilleras con ribete, grebas y escarpes con lamas. Faldar de lamas y cinturón con hebilla. Capa roja con pliegues y bajo dorado que ondea al andar. Escudo azul con borde dorado y de acero, cruz y umbo dorados |
| **Arquero** | Ágil y ligero: capucha puntiaguda, capa corta y el arco siempre a la vista | Capucha verde con ribete lima alrededor de la cara. Esclavina. Jubón de cuero con costura central, botones y correa cruzada. Cinturón con hebilla y bolsas. Brazales con correas. Calzas y botas altas con vuelta. Carcaj a la espalda con flechas de plumas blancas y rojas. Arco con empuñadura de cuero y puntas de latón; cuerda y flecha al tensar |
| **Mago** | Alto y poderoso: gran sombrero de punta caída, túnica hasta los pies y bastón más alto que él | Túnica granate de pliegues hondos con franja central más oscura. Mangas anchas. Esclavina. Cordón de cuero a la cintura con caída y remate. Barba blanca larga que le cubre el pecho, con bigote y cejas. Bastón nudoso de madera que se retuerce en espiral arriba |
| **Asesino** | Delgado y agachado en postura de combate, con una daga en cada mano | Capucha oscura con visera y caída a la espalda. Máscara granate y ojos que brillan. Jubón azul petróleo con correas cruzadas y hebilla. Hombrera de cuero en un lado. Antebrazos vendados con tela clara. Fajín y bufanda granates que ondean. Bolsas y rodilleras. Botas blandas vendadas |

## 2. Cómo están hechos

- **No son imágenes dibujadas aparte:** cada héroe es un maniquí de volúmenes sencillos colocado en cada pose. Los volúmenes son elipsoides, conos, cajas, láminas para las capas y el escudo.
- **Cada fotograma se pinta píxel a píxel** desde la misma cámara del juego (cenital, inclinada 30°). Por eso las 8 direcciones y todas las animaciones son coherentes: no cambian de tamaño, no dan saltos y las armas no desaparecen.
- **Cada píxel recibe uno de los 6 tonos de su material:** contorno, sombra profunda, sombra, medio, luz o brillo. Depende de la luz (arriba a la izquierda) y del tipo de material:
  - el metal tiene reflejos y una banda de horizonte;
  - el cuero tiene un brillo suave;
  - la tela no brilla;
  - la gema y la magia brillan solas.
- **Encima se añaden:**
  - líneas interiores donde una pieza tapa a otra;
  - sombras de contacto bajo las piezas de delante;
  - detalles pintados: remaches, costuras, lamas, malla, pliegues, vendas y bordes;
  - un contorno oscuro alrededor.
- **Sin suavizado:** cada píxel es un color exacto de la paleta. La prueba lo comprueba.
- **Resolución de trabajo:** lienzo de 124×108 píxeles, con los pies en el punto (62, 78). Es la misma densidad de píxel que el resto del mundo (1 píxel de arte = 1 unidad del mundo). Un héroe mide unos 54 píxeles (≈ 1,7 casillas); el mago, con el sombrero, 66.
- **Vistas:**
  - se pintan cinco: frente, ¾ frente, perfil, ¾ espalda y espalda;
  - las tres direcciones de la izquierda son el reflejo de las de la derecha;
  - así el arma queda siempre del lado visible, como antes.
- **La colisión no cambia:** sigue siendo la del juego, independiente del dibujo.

## 3. Animaciones

| Animación | Fotogramas | Qué hace |
|---|---|---|
| Reposo | 6 | Respiración, la capa se mece |
| Andar | 8 | Paso con las piernas y los brazos opuestos, balanceo del cuerpo, la capa y la bufanda ondean. El mago usa el bastón como cayado |
| Ataque básico | 6 | Por clase, abajo |
| Habilidad | 6 | Por clase, abajo |
| Carga (Arquero) | 4 | Tensa el arco cada vez más; la punta de la flecha brilla |
| Canalizar (Mago) | 4 | Bastón en alto con un brillo que late |
| Daño | 2 | Retrocede, con la cabeza y los brazos hacia atrás |
| Esquiva | 4 | Se agacha y se lanza hacia delante |
| Caída | 6 | Le fallan las rodillas, cae y queda tendido en el suelo. Es la misma caída que se ve en la carretilla de la llegada a la aldea |

**Ataques y habilidades por clase:**

| Clase | Ataque básico | Habilidad |
|---|---|---|
| Guerrero | Alza la espada sobre el hombro y lanza un tajo en arco por delante | Golpe de escudo, con el escudo por delante y paso adelante |
| Arquero | Se gira de lado, tensa la cuerda hasta la mejilla y suelta | Disparo rápido |
| Mago | Adelanta el bastón y la otra mano lanza una esfera arcana; brillo en el bastón | Brazos en alto, el bastón brilla y aparecen chispas |
| Asesino | Dos tajos rápidos, primero con una daga y luego con la otra | Tajo en cruz con las dos dagas |

**Rendimiento:**
- cada fotograma se genera una sola vez (unos 4 ms) y queda en caché;
- los de tu clase se preparan en segundo plano, unos 6 ms por fotograma del juego: primero reposo y andar en todas las direcciones, luego el resto;
- girar por primera vez no da tirones;
- con los fotogramas ya preparados, dibujar cuesta lo mismo que un `drawImage`.

## 4. Lo que no cambia

- **La interfaz es la de siempre:** `HeroSprites.frame(clase, vista, animación, fotograma)` y `HeroSprites.pick(clase, estado)`. Por eso funcionan sin tocar nada:
  - el juego, la aldea y las mazmorras;
  - los compañeros de grupo online, que se dibujan con el estado que manda el servidor (dirección, movimiento, ataque, daño, caída);
  - las tarjetas de selección de clase y los retratos;
  - la escena de la carretilla.
- **Tampoco cambian:** estadísticas, movimientos, colisiones, inventario y guardado. Los sprites no guardan nada.
- **El equipo no se ve en el sprite.** Tampoco se veía antes: el inventario cambia estadísticas, no el dibujo. Si se quiere, el maniquí permite cambiar materiales o piezas según el equipo (otra capa, otro yelmo…).

## 5. Archivos

- `prototype/mystery-action.html`, sección «HeroForge»:
  - el pintor 3D → pixel art;
  - `HERO_PAL`: las paletas;
  - `HeroModels`: las poses, la cinemática inversa y las piezas de cada clase;
  - `HeroSprites`: la caché, la elección de fotograma, las 8 direcciones y la preparación en segundo plano.
- Se sustituyeron el dibujo anterior de los héroes (`HERO_MATS` y `HeroSprites.paint`) y la vieja caída, que se cortaba en el borde del lienzo.
- **Prueba:** `tests/e2e/hero_sprites.py`, en `tests/run-all.sh`. Genera los 920 fotogramas (4 clases × 5 vistas × 46) y comprueba:
  - que ninguno está vacío ni cortado por el borde;
  - los pies en el anclaje;
  - la escala coherente entre clases;
  - solo colores de la paleta y sin semitransparencias;
  - las 8 direcciones y el reflejo;
  - la preparación en segundo plano y el coste;
  - sin errores.

## 6. Pendiente o mejorable

- **No hay carrera:** el juego no tiene esa mecánica; la esquiva hace de «sprint».
- **Ataques en vertical:** en vista frontal o de espaldas, un ataque hacia arriba o abajo se ve más acortado que de perfil. Es la perspectiva: la espada va hacia la cámara. Los efectos del juego (arcos de tajo, proyectiles) siguen marcando la dirección.
- **Equipo visible en el personaje:** no existía; se puede añadir sobre este sistema.
- **Enemigos y vecinos:** siguen con su dibujo anterior. Se pueden pasar a este mismo sistema para que todo el juego tenga el mismo acabado.
