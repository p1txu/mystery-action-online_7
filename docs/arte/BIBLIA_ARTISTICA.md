# Biblia artística de Eldoria: «Hybrid 2D Fantasy»

- **Estado:** dirección aprobada por el director el 2026-11-11 (AD-1, registrada como D-015 en la rama `coordinacion`). Esta biblia es la **versión inicial**: la paleta exacta, las fichas finales y los ejemplos visuales se cerrarán con el personaje y el escenario piloto.
- **Qué sustituye:** la parte de «pixel art» de D-003 (identidad visual de la interfaz) y el estilo descrito en `docs/SPRITES.md`, `docs/MUNDO.md` y `docs/ALDEA.md`. Esos documentos **no se borran**: describen el sistema clásico, que sigue en el juego hasta la transición.
- **Alcance de la dirección** (AD-1): personajes, criaturas, jefes, escenarios, vegetación, objetos, iconos, **interfaz y menús**. Nada de Eldoria queda en pixel art cuando termine la transición.
- **Qué no cambia:** la cámara, las mecánicas, la arquitectura y las reglas.

## Documentos de dirección artística

| Documento | Para qué sirve |
|---|---|
| **BIBLIA_ARTISTICA.md** (este) | Cómo debe verse Eldoria y cómo se acepta un recurso |
| [MUNDO_Y_PERSONAJES.md](MUNDO_Y_PERSONAJES.md) | Fichas de zonas, clases, vecinos, familias de enemigos, jefes e iconos; alternativas del bosque abierto |
| [PIPELINE_ASSETS.md](PIPELINE_ASSETS.md) | Cómo se fabrica, exporta, empaqueta, distribuye y carga un recurso |
| [ARQUITECTURA_ARTE.md](ARQUITECTURA_ARTE.md) | Cómo entra el arte nuevo sin tocar las reglas; pruebas de resolución; Canvas 2D frente a PixiJS |
| [PROTOTIPO_GUERRERO.md](PROTOTIPO_GUERRERO.md) | Especificación del personaje piloto |
| [PROTOTIPO_BRUMAVERDE.md](PROTOTIPO_BRUMAVERDE.md) | Especificación del escenario piloto con un enemigo |
| [PLAN_PRODUCCION_ARTE.md](PLAN_PRODUCCION_ARTE.md) | Etapas, decisiones, modelo de producción, rendimiento, esfuerzo y riesgos |
| [INVENTARIO_ASSETS.md](INVENTARIO_ASSETS.md) | Todo lo que hay que producir, contado en el código |

---

## 1. Estilo general

**Ilustración pintada sobre tablero.**

- **Actores** (personajes, criaturas, objetos con los que se interactúa): ilustración con **contorno de color** y volumen pintado.
- **Escenario** (suelo, rocas lejanas, masas de vegetación, arquitectura de fondo): **pintura digital** sin contorno, con pincelada visible y menos contraste y saturación que los actores.
- **Juego** (telegrafiados, proyectiles, zonas de daño, indicadores): formas claras dibujadas por código con colores reservados.
- **Atmósfera** (luz, niebla, partículas, brillos): código, dentro de la paleta del bioma.

La regla que hace natural la mezcla de ilustración y pintura: **fondo suave, actores nítidos, efectos de juego claros**. Un recurso que no encaja en una de esas tres capas está mal planteado.

### Tono

- Fantasía cálida y artesanal: ni infantil ni oscura de forma gratuita.
- Proporciones algo estilizadas para que se lean desde arriba.
- Materiales creíbles y una luz con dirección.
- Progresión visual del mundo, de acuerdo con la biblia narrativa: **de lo vivo a lo enfermo, de lo natural a lo antiguo y sagrado**. La Aldea Raíz y el Linde son cálidos; el interior de Brumaverde se pudre; Raíces Hondas late.

### Cámara

Se mantiene la del juego: cenital inclinada unos 30° (vista ¾). Todo se pinta desde esa vista:

- suelo ligeramente escorzado;
- paredes, troncos y rocas con su cara frontal visible;
- tejados en ¾.

### Lo que no se hace

- Pixel art o píxeles visibles, salvo como recurso deliberado de un efecto.
- Mezclar en una pantalla arte nuevo y arte del sistema clásico (ver la transición en [ARQUITECTURA_ARTE.md](ARQUITECTURA_ARTE.md)).
- Texturas fotográficas o «fotobash» sin repintar.
- Degradados vectoriales planos o brillos de aspecto genérico de móvil.
- Siluetas que solo se distingan por el color.
- Usar, imitar o «inspirarse de cerca» en personajes, criaturas, logotipos o recursos de franquicias (D-007).

---

## 2. Líneas y contornos

| Elemento | Contorno |
|---|---|
| Actores | Contorno exterior del **tono más oscuro de su material**, nunca negro puro. Grosor fijo en pantalla: unos 2–3 px en la calidad Estándar, el mismo para todos los actores. Líneas interiores más finas, solo donde una pieza tapa a otra o para pliegues principales |
| Escenario | Sin contorno. Los bordes se definen por valor, color y luz |
| Atrezo con el que se interactúa (cofres, palancas, plantas recolectables) | Contorno de actor, para que se reconozca como interactivo |
| Elementos de juego | Borde brillante y forma geométrica limpia. Son lo único que puede salirse de la paleta |
| Interfaz | Marcos ilustrados con el mismo contorno de color que los actores (sección 10) |

---

## 3. Texturas y materiales

| Material | Cómo se pinta |
|---|---|
| **Metal** | Reflejo frío de cielo arriba, banda oscura de horizonte, brillo especular pequeño y duro, mellas y desgaste en los bordes |
| **Cuero** | Brillo suave y ancho, costuras visibles, bordes gastados más claros, arrugas en las articulaciones |
| **Tela** | Sin brillo especular. Pliegues en Y y en Z. El peso se nota: lana gruesa que cae recta, lino que se arruga |
| **Madera** | Veta en la dirección de la pieza, nudos, bordes redondeados por el uso |
| **Piedra** | Planos grandes con biselado. Musgo y suciedad en las uniones. Sin ruido fino |
| **Vegetación** | Masas con tres valores (sombra, medio, luz); hojas sueltas solo en el borde de la masa; brillo de borde cuando está a contraluz |
| **Cristal** | Núcleo saturado, bordes claros, refracción sugerida. Luz propia emitida por código |
| **Piel y pelo** | Volúmenes grandes, mechones agrupados, sin pelos sueltos |
| **Carne vegetal enferma** (Brumaverde interior, Raíces Hondas) | Fibras, pústulas ámbar translúcidas, savia brillante |

**Escala del detalle:** ningún detalle importante mide menos de **1 unidad del mundo** (unos 3 px en Estándar). Lo que sea más pequeño se pierde a 720p y no debe llevar información de juego.

---

## 4. Paletas

### 4.1 Reglas globales

- **De 6 a 8 rampas de color compartidas** por todo el juego. Las sombras derivan hacia azul o violeta y las luces hacia amarillo cálido.
- **Cada bioma** toma de 3 a 4 rampas y un acento propio.
- **Colores reservados al juego**, que el escenario no usa a saturación alta:

| Color | Significado |
|---|---|
| Rojo y naranja saturados | Daño, peligro, ataque enemigo |
| Dorado | Valioso: botín, rareza, objetivo |
| Cian | Magia, interacción, aliado |

- Los colores de rareza que ya existen en el juego (común, poco común, raro, épico, legendario) se conservan como colores de juego.

### 4.2 Paleta por zona

Los valores exactos se fijan en el escenario piloto. Aquí se fija la intención:

| Zona | Base | Acento | Atmósfera |
|---|---|---|---|
| **Aldea Raíz** | Ocres, madera miel, pizarra | Farol ámbar | Tarde cálida, humo de chimeneas; ventanas iluminadas al anochecer |
| **Linde de Brumaverde** | Verdes amarillos, tierra parda | Sol entre las hojas | Haces de luz y polen |
| **Brumaverde (interior)** | Verdes oliva, gris violáceo | Pústulas ámbar en las raíces enfermas | Bruma baja, luz filtrada |
| **Gruta de Cuarzo** | Pizarra azul, gris frío | Cristal cian y lila | Brillo propio de los cristales |
| **Ciénaga Sombría** | Verde petróleo, barro | Bioluminiscencia verde y amarilla | Niebla densa, reflejos en el agua |
| **Mina Olvidada** | Marrón óxido, madera vieja | Farol de aceite, chispas | Polvo en suspensión, vigas |
| **Cráter Ceniciento** | Basalto, ceniza | Magma naranja | Calor que distorsiona, brasas |
| **Raíces Hondas** | Madera viva oscura, carmín apagado | Latido rojo del Corazón | Pulso de luz rítmico |

### 4.3 Oscuridad legible

La auditoría encontró mazmorras «muy oscuras» (problema 6). Regla nueva:

- cada bioma tiene un **nivel mínimo de luz ambiente**: el suelo nunca queda por debajo de un valor que se fija en el piloto;
- la oscuridad se expresa con **color y contraste**, no con negro;
- los actores conservan siempre su contorno legible, aunque estén fuera de una luz.

---

## 5. Iluminación y sombras

| Capa | Cómo se hace |
|---|---|
| **Luz principal** | Pintada en los recursos: arriba a la izquierda, la misma que hoy (`docs/SPRITES.md`) |
| **Luces dinámicas** | Código: faroles, magia, cristales, magma, hogueras. Modo aditivo o «screen» sobre la capa de luz que ya existe |
| **Ambiente** | Código: tinte por bioma y nivel mínimo de luz |
| **Sombra de contacto** | Código: elipse blanda bajo cada actor, proporcional a su `radius`, es decir, a su colisión. Ancla al actor al suelo |
| **Sombras proyectadas** del atrezo grande (troncos, casas) | Pintadas en una capa propia del recurso, en la dirección de la luz principal |
| **Oclusión** | Copas, tejados y arcos que tapan a un jugador se vuelven semitransparentes alrededor de él |
| **Atmósfera** | Código: niebla, haces de luz, polvo, polen, brasas, hojas |

---

## 6. Proporciones

| Grupo | Proporción y tamaño |
|---|---|
| **Héroes** | Unas 4 cabezas. **Altura de unos 54 unidades del mundo (≈1,7 casillas), la misma que hoy**, para no cambiar la lectura de alcances |
| **Vecinos** | Entre 3,5 y 4,5 cabezas según edad y oficio. Mismas alturas que hoy |
| **Criaturas pequeñas** | Como mínimo unas 26 unidades de alto (≈0,8 casillas). Corrige el problema 10 de la auditoría |
| **Criaturas medianas** | Entre 40 y 60 unidades |
| **Jefes** | Entre 2,2 y 3,5 veces la altura de un héroe, como hoy |

**Regla de colisión** (protege el combate):

- La huella de los pies o de la base del dibujo debe coincidir con la elipse de colisión (`radius`), con un margen de ±15 %.
- Lo que sobresale (armas, colas, alas, ramas) no puede sugerir un alcance que no existe. El arma en reposo no supera el alcance real del ataque básico.
- El arte nunca define una zona de daño. Las zonas de daño las dibuja el código a partir de las reglas.

---

## 7. Escenarios

### 7.1 Capas de profundidad (de abajo arriba)

1. Suelo pintado: baldosas de terreno que se repiten sin costuras, con transiciones por máscaras.
2. Calcomanías de suelo: charcos, raíces, grietas, hojas, hierba, caminos.
3. Sombras proyectadas del atrezo grande.
4. Atrezo y actores, ordenados por su `y`.
5. Elementos altos: copas, tejados, arcos y vigas, con oclusión.
6. Atmósfera (código).
7. Luz (código).

### 7.2 Reglas de composición

- **Romper la repetición:** ninguna baldosa de suelo debe reconocerse repetida en la pantalla. Se consigue con 3 o más variantes, máscaras y calcomanías.
- **Caminos legibles:** la zona transitable se lee por valor y textura, sin que haga falta el minimapa.
- **Bordes orgánicos:** los límites no transitables se pintan con formas irregulares, pero **nunca invaden más de unas 8 unidades la zona transitable a la altura de los pies**, para no mentir sobre la colisión.
- **Puntos de interés:** cada sala o claro tiene un elemento que se recuerda (un tocón enorme, una estatua, un cristal gigante).
- **Profundidad:** los muros y masas no transitables se pintan como algo que continúa (bosque que sigue, roca que se hunde), no como un bloque plano.

---

## 8. Animación

- **Las reglas mandan:** cada animación de acción se ajusta a los tiempos de las reglas (`MOVES`, `swing`, tiempos de aviso de los enemigos y jefes). **El fotograma o la pose de impacto coincide con el instante en que se aplica el daño.**
- **Estructura:** anticipación, acción y recuperación, con poses clave muy legibles.
- **Ritmo:**
  - animación esquelética: curvas continuas;
  - animación por fotogramas: de 12 a 15 fotogramas por segundo en acciones;
  - movimiento secundario (capas, pelo, hojas, tabardos): siempre continuo.
- **Exageración legible:** el arma traza su arco en el fotograma de impacto y la estela la dibuja el código.
- **Sin patinar:** al andar, el pie apoyado no se desliza; la velocidad de la animación sale de la velocidad real del actor.
- **Telegrafiado:** el cuerpo del enemigo anticipa el ataque con una pose que se mantiene todo el aviso. El código dibuja la zona exacta en el suelo, como hoy.

---

## 9. Coherencia entre biomas

**Se comparte siempre:**

- el grosor del contorno;
- la dirección de la luz principal;
- las rampas de sombra;
- la escala de los personajes;
- el tratamiento de los efectos de juego y de la interfaz.

**Cambia por bioma:** materiales, acento, atmósfera y arquitectura.

**Prueba de identidad:** cada zona debe reconocerse en una miniatura de 200 px **solo por la silueta y el color**.

---

## 10. Interfaz y menús

Por AD-1, la interfaz también abandona la apariencia pixelada.

- **Marcos y paneles:** madera, cuero, pergamino y metal ilustrados, con el contorno de color de los actores. Fondo oscuro cálido para leer bien.
- **Detalles dorados:** se mantienen como color de lo valioso y de los elementos activos.
- **Tipografía:** Cinzel para títulos y Alegreya Sans para textos, como hoy. **Riesgo abierto:** hoy se cargan de Google Fonts; sin conexión caen a fuentes del sistema. Se propone empaquetarlas con el arte; para eso hay que revisar su licencia (SIL Open Font License) y decidirlo.
- **Iconos:** pintados con el mismo contorno y la misma luz que los actores (ver [MUNDO_Y_PERSONAJES.md](MUNDO_Y_PERSONAJES.md)).
- **Legibilidad primero:** los números, las barras y los avisos de combate siguen siendo nítidos y de alto contraste. La decoración nunca tapa información de juego.
- **Alcance de este documento:** solo marca la dirección. El rediseño de cada pantalla se planificará junto con el nuevo menú de inicio (etapa 5 de [PLAN_PRODUCCION_ARTE.md](PLAN_PRODUCCION_ARTE.md)). No se modifica ninguna pantalla en esta fase.

---

## 11. Criterios de calidad y legibilidad (lista de aceptación de cada recurso)

Un recurso entra en el juego solo si cumple todos los puntos y pasa la revisión artística.

1. **Silueta:** rellenado de negro, se reconoce qué es y hacia dónde mira.
2. **Escala de grises:** sin color, el actor se distingue del suelo de su bioma. Diferencia mínima de luminancia entre el actor y el suelo: unos 25 puntos de L\* (sobre 100). El valor se confirmará en el piloto.
3. **Distancia:** a 1280×720 con el zoom mínimo, se reconocen las 4 clases y los 3 papeles de enemigo del bioma.
4. **Combate:** con 4 jugadores, 12 enemigos y efectos, se distingue en todo momento quién telegrafía un ataque.
5. **Variantes:** dos variantes de una familia se distinguen en escala de grises.
6. **Colisión:** la huella cumple la regla de ±15 % (sección 6) en la prueba con la colisión superpuesta.
7. **Densidad:** está exportado a la densidad de su nivel de calidad ([PIPELINE_ASSETS.md](PIPELINE_ASSETS.md)), con el ancla en los pies.
8. **Paleta:** usa las rampas del bioma y no usa colores reservados al juego para decorar.
9. **Origen:** tiene su ficha de origen completa: autor, herramientas, licencia y entradas ([PLAN_PRODUCCION_ARTE.md](PLAN_PRODUCCION_ARTE.md)).
10. **Sin mezcla:** no aparece junto a arte del sistema clásico fuera del modo de prueba.

---

## 12. Referencias y conceptos

### 12.1 Referencias externas (no son recursos del juego)

Sirven solo para estudiar técnicas. **No se copia ni se calca ningún recurso, personaje ni diseño suyo**, y no se usan sus imágenes como entrada de herramientas de IA.

| Referencia | Qué se estudia |
|---|---|
| Hades, Bastion (Supergiant Games) | Ilustración pintada a mano, contorno de color, fondos pintados con actores nítidos |
| Children of Morta (Dead Mage) | Lectura del combate cenital, luz dinámica sobre arte 2D |
| Hyper Light Drifter (Heart Machine) | Legibilidad de telegrafiados y siluetas |
| Tunic (Andrew Shouldice) | Vista ¾, oclusión, luz |
| Ori and the Will of the Wisps (Moon Studios) | Solo tratamiento de luz filtrada y vegetación; es de desplazamiento lateral |

### 12.2 Conceptos originales de Eldoria

- **Todavía no existen.** Se crearán en la etapa del personaje piloto con el modelo de producción que se apruebe (AD-4).
- Cada concepto llevará su ficha de origen y se guardará fuera del repositorio del juego, en los originales del arte ([PIPELINE_ASSETS.md](PIPELINE_ASSETS.md)).
- Las figuras de las pruebas de resolución ([ARQUITECTURA_ARTE.md](ARQUITECTURA_ARTE.md)) son **figuras de prueba sintéticas**, no conceptos ni arte del juego.
