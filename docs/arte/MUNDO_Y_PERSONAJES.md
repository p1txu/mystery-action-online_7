# Mundo y personajes: fichas de dirección artística

- **Estado:** propuesta inicial. Las fichas fijan identidad, silueta, materiales y animaciones. **No son diseños finales**: los diseños salen de los pilotos y del modelo de producción que se apruebe (AD-4).
- **Base:** [BIBLIA_ARTISTICA.md](BIBLIA_ARTISTICA.md), `docs/BIBLIA_NARRATIVA_ELDORIA.md` (canon de lugares y personajes), `docs/JEFES.md`, `docs/ALDEA.md`, `docs/SPRITES.md` y el código de `main` 0.46.
- **Canon:** los nombres y lugares siguen la biblia narrativa. Lo que aquí se describe es aspecto, no historia nueva. Cualquier detalle visual que implique historia (por ejemplo, qué representa una talla) se marcará como propuesta y se validará con la biblia narrativa.

---

## 1. Zonas

### 1.1 Aldea Raíz

- **Identidad:** antiguo pueblo minero que vive de sus exploradores, con raíces enormes que asoman entre las casas.
- **Arquitectura:** casas de madera y pizarra con zócalo de piedra, vigas a la vista y chimeneas. Las 13 casas actuales conservan su planta y su colisión.
- **Suelo:** adoquín gastado en la plaza, tierra batida en las calles, hierba en los bordes y el estanque.
- **Decoración:** vagonetas, carretillas, tendederos, faroles de mina, el tablón, la hoguera de Doña Musgo, los puestos de Topo.
- **Luz:** tarde ámbar; ventanas iluminadas y faroles al anochecer.

### 1.2 Linde de Brumaverde

- **Identidad:** transición entre la aldea y el bosque; lo más luminoso de Brumaverde.
- **Elementos:** valla rota, campamento de Nara Vey, leña de Gil, señales de guardabosques.
- **Suelo:** hierba alta, claros y senderos de tierra.

### 1.3 Bosque de Brumaverde

- **Identidad:** un bosque que «se pudre por dentro». Cuanto más hondo, más enfermo.
- **Límites:** troncos enormes y raíces, no muros.
- **Suelo:** hojarasca, musgo, helechos, setas y caminos de tierra.
- **Decoración:** tocones, troncos caídos, piedras con musgo; en el interior, raíces enfermas con pústulas ámbar.
- **Luz:** haces de luz entre las copas y bruma baja.
- **Bosque abierto:** ver la sección 7.

### 1.4 Gruta de Cuarzo

- **Arquitectura:** cuevas naturales con salas abovedadas.
- **Suelo:** roca azulada, arena fina, charcas.
- **Decoración:** racimos de cristal de varios tamaños y estalagmitas.
- **Luz:** la de los cristales y sus reflejos fríos.

### 1.5 Ciénaga Sombría

- **Arquitectura:** pasarelas de tablones, pilotes, ruinas hundidas.
- **Suelo:** barro, agua quieta, juncos, nenúfares.
- **Decoración:** árboles muertos, redes, linternas de pantano.
- **Luz:** niebla densa, bioluminiscencia, reflejos en el agua.

### 1.6 Mina Olvidada

- **Arquitectura:** galerías apuntaladas, raíles, plataformas de madera.
- **Suelo:** tierra, grava, maderas podridas.
- **Decoración:** vagonetas volcadas, picos, engranajes antiguos.
- **Luz:** faroles de aceite que parpadean y polvo en suspensión.

### 1.7 Cráter Ceniciento

- **Arquitectura:** coladas de basalto, grietas, restos de una forja antigua.
- **Suelo:** ceniza y roca fundida ya fría.
- **Decoración:** columnas basálticas y braseros.
- **Luz:** el magma como luz principal; calor que distorsiona y brasas.

### 1.8 Raíces Hondas

- **Arquitectura:** cámaras orgánicas de raíz viva, con la Cámara del latido.
- **Suelo:** madera viva y savia.
- **Decoración:** restos de ofrendas y sellos tallados. **Propuesta, a validar con la biblia narrativa:** qué representa cada talla.
- **Luz:** pulso rojo sincronizado con el latido.

### 1.9 Zonas que aún no existen

La Abadía Hueca, las Cumbres del Hielo Quieto y el Santuario del Origen están en la biblia narrativa, pero no en el juego. Se diseñarán cuando exista su mazmorra.

---

## 2. Clases

Las cuatro clases conservan la identidad de `docs/SPRITES.md`, ahora ilustrada. **La altura en el mundo no cambia (unas 54 unidades) y la colisión tampoco.**

| Clase | Silueta | Materiales clave | Rasgo legible desde arriba | Paleta orientativa |
|---|---|---|---|---|
| **Guerrero** | Ancho, con hombreras grandes y escudo de lágrima | Acero gastado, cuero, tabardo de lana | Escudo y yelmo con ceja dorada | Acero frío, azul del escudo, dorado |
| **Arquero** | Esbelto, con capucha puntiaguda y capa corta | Cuero teñido, lino verde, madera de tejo | Arco siempre visible y carcaj | Verdes, cuero cálido |
| **Mago** | Alto, con sombrero de ala caída y túnica hasta los pies | Lana granate, latón, cuarzo en el bastón | Bastón más alto que él, con luz propia | Granate, latón, cian del cuarzo |
| **Asesino** | Bajo y agachado, con dos dagas | Cuero oscuro, tela petróleo, máscara granate | Ojos brillantes y dagas con brillo frío | Petróleo, granate, acero |

**Animaciones** (las mismas que hoy; los tiempos salen de las reglas):

| Animación | Todas | Arquero | Mago |
|---|---|---|---|
| Reposo, andar, ataque básico, habilidad, daño, esquiva, caída | Sí | Sí | Sí |
| Carga | — | Sí | — |
| Canalizar | — | — | Sí |

**Habilidades nuevas.** Los huecos de los niveles 7, 10 y 14 y el definitivo están vacíos (problema I-1). Cuando se diseñen, cada habilidad nueva necesitará su animación y su icono. Se apuntan en el [INVENTARIO_ASSETS.md](INVENTARIO_ASSETS.md) como «pendientes de diseño de juego».

**Equipo visible.** Hoy el equipo no cambia el aspecto del héroe. Que lo cambie (armas o armaduras visibles) **multiplicaría el trabajo de arte**. Queda fuera de esta propuesta; si se quiere, es una decisión aparte.

---

## 3. Vecinos

| Vecino | Silueta y oficio | Animación de oficio propuesta |
|---|---|---|
| Alcalde Bartolo | Anciano encorvado, abrigo de lana con cuello de piel, cadena del cargo, bastón nudoso | Se apoya en el bastón y señala la plaza |
| Maestra Ulula (gremio) | Exploradora veterana: gabán de cuero, banda azul del gremio, moño cano, monóculo, libro de registro | Anota en el libro |
| Pico Cartero (tablón) | Mensajero pelirrojo, gorra de pluma, cartera de cuero con cartas | Clava un papel en el tablón |
| Topo mercader (tienda) | Comerciante grueso, sombrero de fieltro, barba, mandil, fardo enorme | Reordena el fardo |
| Doña Musgo (hoguera) | Curandera anciana, pañuelo, chal, falda larga, manojo de hierbas | Remueve el caldero o la hoguera |
| Centinela Roco (puerta) | Guardia con capacete, gambesón, esclavina roja, lanza y escudo redondo | Cambia la lanza de mano |
| Tito Brote (campamento) | Mozo con sombrero de paja, zurrón y cayado | Se rasca la cabeza o bosteza |
| Viajero (tiendas de las mazmorras) | Encapuchado con bastón | Ninguna |
| Nara Vey, Gil (biblia narrativa, P-14 y P-15) | Guardabosques; leñador | A diseñar con su papel |

- **Paleta:** más cálida y desaturada que la de los héroes, para que los héroes destaquen en la aldea.
- **Animaciones:** reposo, andar y, opcionalmente, una de oficio. **La animación de oficio es nueva, solo visual, y no cambia ninguna regla.**

---

## 4. Familias de enemigos

### 4.1 Situación actual

Hay dos sistemas de dibujo:

- **Familias vectoriales** (Mordisquín, Pufón, Pedrolón): 15 variantes en `ENEMY_VARIANTS`, que son las mismas 3 formas con otra paleta en cada bioma.
- **Familias de pixel art** (rata, lagarto, limo, ave, hongo, planta): 32 variantes en `EnemySprites`, también con otra paleta (auditoría visual).

Cada bioma tiene 3 papeles de juego (`BIOMES[...].enemies`): **perseguidor**, **a distancia** y **tanque**.

| Bioma | Perseguidor | A distancia | Tanque | Jefe |
|---|---|---|---|---|
| Bosque (`forest`) | Mordisquín | Pufón | Pedrolón | Robletón |
| Gruta (`cave`) | Cristálido | Destello | Geodón | Reina Geoda |
| Cráter (`volcano`) | Ascuín | Fumarola | Basaltón | Magmatrón |
| Ciénaga (`marsh`) | Lodín | Esporín | Musgón | Ciénagón |
| Mina (`mine`) | Chispín | Farolillo | Ferrón | Gromgar |
| Raíces Hondas (`roots`) | Mordisquín | Pufón | Pedrolón | Eco de Robletón |

### 4.2 Regla nueva: «familia = anatomía común + piezas de bioma»

Cada variante comparte con su familia el **esqueleto, las proporciones y las animaciones**, pero cambia **al menos dos** de estas piezas:

- cabeza;
- dorso o caparazón;
- extremidades;
- apéndices (cola, cuernos, antenas, tallos);
- material.

Esto se comprueba con la prueba de variantes de la biblia: en escala de grises deben distinguirse.

**Ventajas para la producción:**

- un rig y un juego de animaciones por familia;
- las piezas de bioma se pintan como «trajes»;
- el papel de juego se lee igual en todos los biomas, porque la anatomía es la misma.

### 4.3 Propuesta de diseño por familia

| Familia (papel) | Anatomía común | Bosque | Gruta | Cráter | Ciénaga | Mina |
|---|---|---|---|---|---|---|
| **Mordisquín** (perseguidor) | Cuadrúpedo bajo y rápido, mandíbula grande | Lomo de hojas y raíces | Cristálido: placas de cuarzo, patas finas | Ascuín: lomo de brasa, cola de ceniza | Lodín: cuerpo de barro que gotea, ojos saltones | Chispín: placas de mena con chispas |
| **Pufón** (a distancia) | Bulbo fijo o lento que dispara | Bulbo de esporas | Destello: flor de cristal | Fumarola: chimenea viva | Esporín: seta de pantano luminosa | Farolillo: farol vivo |
| **Pedrolón** (tanque) | Masa pesada con brazos cortos | Roca con musgo | Geodón: geoda abierta | Basaltón: columnas basálticas | Musgón: tocón empapado de musgo | Ferrón: vagoneta o armazón de hierro |

**Pendiente:** la ficha de las 6 familias de pixel art (rata, lagarto, limo, ave, hongo, planta) con el mismo criterio. Antes hay que comprobar en qué pisos y mazmorras aparece cada una de sus 32 variantes, para no dibujar variantes que el juego no usa.

### 4.4 Animaciones de enemigo

Hoy el sistema de pixel art usa reposo 2, mover 4, preparar 2, atacar 2, daño 1 y muerte 4 fotogramas (`ENEMY_ANIMS`). Con el arte nuevo:

- reposo;
- desplazamiento;
- **preparación**: la pose se mantiene durante todo el aviso de la regla;
- ataque;
- daño;
- muerte.

Variantes élite: el mismo dibujo con marcas de élite (corona, cicatrices, brillo) y no solo un tinte rojo.

---

## 5. Jefes

**Principio:** el aspecto de cada jefe se diseña **a partir de sus ataques**. Cada ataque necesita:

- una pose de preparación que se lea durante todo el aviso;
- un golpe;
- una recuperación.

Además, todos los jefes necesitan entrada, reposo, desplazamiento, daño, cambio de fase y derrota.

| Jefe | Mazmorra | Diseño propuesto | Ataques que hay que poder leer (`docs/JEFES.md`) |
|---|---|---|---|
| **Robletón, el Guardián de Espinas** | Bosque de Brumaverde | Árbol guardián enfermo; raíces que hacen de brazos; corazón ámbar visible en el tronco | Zarpazo en arco; raíces en línea; salto con sombra en el suelo; enredado contra un tocón; aturdido «sin savia» |
| **Eco de Robletón** | Raíces Hondas | El mismo árbol, translúcido y rojo, con raíces vivas | Lo mismo que Robletón, más las raíces que persiguen |
| **Gromgar, el Quebrantamontañas** | Mina Olvidada | Coloso de roca y mena, con la cabeza baja para embestir | Golpe en círculo; roca lanzada; carga en carril; aturdido contra una roca; derribado en el suelo |
| **Reina Geoda** | Gruta de Cuarzo | Criatura de cristal con corona de geodas | Según su BossKit |
| **Ciénagón** | Ciénaga Sombría | `docs/JEFES.md` prevé sustituirlo por la Viuda del Estanque (ilusiones, veneno, niebla) | Pendiente de su diseño de juego |
| **Magmatrón** | Cráter Ceniciento | `docs/JEFES.md` prevé sustituirlo por el Coloso Forjado (componentes, válvulas, núcleo) | Pendiente de su diseño de juego |
| **Picoferro** | Mina Olvidada (antiguo) | Sustituido por Gromgar | Comprobar si sigue en uso antes de dibujarlo |

**Recomendación:** no dibujar Ciénagón, Magmatrón ni Picoferro hasta decidir si se sustituyen. Así no se pinta dos veces.

---

## 6. Objetos e iconos

- **Iconos de objetos** (89 entradas en `ITEMS`) e **iconos de habilidades** (8 movimientos en `MOVES`, más las habilidades que se diseñen).
- **Estilo:** el mismo contorno de color y la misma luz que los actores. Fondo transparente; el marco por rareza lo dibuja la interfaz con los colores de rareza actuales.
- **Agrupación para producir:** consumibles, semillas, orbes, materiales, llaves y cofres, armas por clase, armaduras y accesorios, trofeos. Cada grupo comparte la composición: por ejemplo, todos los orbes son una esfera con un símbolo distinto.
- **Tamaño de pintura y de exportación:** en [PIPELINE_ASSETS.md](PIPELINE_ASSETS.md).

---

## 7. Bosque abierto: alternativas A y B (AD-6)

Ninguna se ha implementado; **el generador no se toca en esta fase**.

### 7.1 Por qué el bosque parece un pasillo

- El Bosque y el Linde usan el mismo `FloorGen` que las cuevas: **salas rectangulares unidas por pasillos** de 2 casillas (3 en cooperativo), todo rodeado de casillas sólidas.
- La sensación de pasillo sale **de la forma del mapa**, no solo del dibujo.

**Cómo funciona hoy, y por qué importa:**

| Sistema | Cómo funciona hoy | Por qué importa |
|---|---|---|
| Generación | Determinista a partir de la semilla. **El cliente y el servidor generan el mismo piso** (`server/src/sim/Expedition.js` llama a `FloorGen.generate`) | Cualquier cambio en el generador cambia los pisos en los dos lados a la vez |
| Tamaño | Crece con el grupo (`FloorGen.SIZES` de 1 a 4 jugadores; pasillos de 3 casillas en grupo) | El bosque abierto debe seguir dejando maniobrar a 4 jugadores |
| Validación | `FloorGen.validate`: salida despejada, escalera alcanzable, salas alcanzables, sin pasillos sin salida | La validación asume salas, pasillos y aristas |
| Salas con propósito | `DungeonPlan` y `Prefabs` asignan papeles a salas y excavan nichos en la roca (`docs/MAZMORRAS.md`) | Necesitan salas con bordes de roca alrededor |
| Mecanismos | `Mechs` (placas, palancas, rejas, puentes, paredes falsas) y su resolutor | Dependen de las plantillas y de los nichos |
| IA enemiga | Se dirige **en línea recta** al jugador (`steerTo`), con visión directa para los de distancia. **No hay búsqueda de caminos** para enemigos; solo el escolta usa un recorrido en anchura corto (`Escort.bfs`) | En un bosque con obstáculos sueltos, los perseguidores se atascarían detrás de los troncos |
| Emboscadas | Cierran las salidas de una sala | Necesitan salas con salidas definidas |
| Minimapa | Colorea salas y pasillos | Necesita saber qué es sala y qué es pasillo |
| Expediciones interrumpidas | Se reanudan con la misma semilla | Si el generador cambia entre versiones, la misma semilla da otro piso |

### 7.2 Alternativa A: vestir el generador actual (solo dibujo)

**Qué se hace** (todo en la capa de presentación):

- **Muros como bosque:**
  - el borde de cada masa no transitable se pinta con troncos de alturas distintas, matorral y raíces, con siluetas irregulares;
  - lo de dentro se pinta como **suelo de bosque más oscuro con troncos lejanos**, para que el bosque «siga» más allá aunque no se pueda pisar.
- **Salas como claros:** luz más alta, haces de luz y suelo más cálido.
- **Pasillos como senderos:** un camino de tierra pintado por el centro, más estrecho que el pasillo, con hierba en los lados.
- **Copas en una capa alta** que se vuelve transparente alrededor de cada jugador.
- **Esquinas suavizadas** con calcomanías y sombras, para disimular los rectángulos.

**Qué implica:**

| Aspecto | Efecto |
|---|---|
| Navegación | Ninguno: las mismas casillas transitables |
| Generación | Ninguno. Las mismas semillas dan los mismos pisos |
| Enemigos | Ninguno |
| Colisiones | Ninguno, siempre que se respete la regla de bordes de la biblia (no invadir más de unas 8 unidades a la altura de los pies) |
| Cooperativo | Ninguno. El servidor no cambia |
| Pruebas | Las de dibujo y legibilidad; la batería actual debe seguir correcta |

- **Límite:** la planta sigue siendo de salas y pasillos. Mejora mucho la sensación de exterior, pero un jugador atento seguirá notando el patrón.
- **Coste:** solo arte y presentación. Es lo que se prueba en el escenario piloto.

### 7.3 Alternativa B: generador específico de exteriores abiertos

Propongo dividirla en dos variantes, porque el riesgo es muy distinto.

#### B1. «Claros y senderos» con el contrato actual

Un generador nuevo solo para el bioma `forest` que **entrega los mismos datos que `FloorGen`**: salas, aristas, celdas, punto de salida y escalera. Así lo demás sigue funcionando.

- **Claros:** salas con el rectángulo como límite, pero con interior irregular: bordes mordidos y islotes de árboles dentro.
- **Senderos:** pasillos más anchos (3–4 casillas), con curvas y **más bucles**: varias conexiones por claro, no un árbol.
- **Obstáculos sueltos dentro de los claros:** troncos de 1 casilla y grupos de como mucho 2×2, separados al menos 2 casillas, para que la IA en línea recta no se atasque.
- **Sotobosque:** una franja exterior de casillas no transitables, como hoy.

**Qué implica:**

| Aspecto | Efecto |
|---|---|
| Navegación | Más caminos y espacios abiertos; los grupos de obstáculos limitados mantienen la IA actual |
| Generación | Código nuevo en el núcleo compartido: cliente y servidor a la vez. Validación ampliada: obstáculos, anchura mínima y bucles |
| Enemigos | Sin cambios en la IA si se respetan los límites de obstáculos. Hay que medir los atascos con pruebas automáticas (enemigos que no alcanzan al jugador en X segundos) |
| Colisiones | Nuevas casillas sólidas dentro de los claros; afectan a proyectiles y a la visión directa de los enemigos a distancia |
| Salas con propósito | Hay que comprobar cada plantilla de `Prefabs` en claros irregulares |
| Cooperativo | Sigue funcionando por semilla. **Hace falta una versión del generador** guardada con la expedición, para que una expedición interrumpida se reanude con el mismo generador con que empezó |
| Pruebas | Las 15 de `tests/dungeon-mechs.test.mjs` más pruebas nuevas de validez (miles de semillas), de atascos de la IA y de cooperativo |

#### B2. Exterior libre

Terreno por ruido o por distribución de árboles, sin salas ni pasillos.

- **Es el aspecto más natural**, pero obliga a rehacer o adaptar:
  - `DungeonPlan` y `Prefabs` (no hay salas);
  - la validación;
  - la colocación de enemigos;
  - las emboscadas;
  - el minimapa;
  - y, casi seguro, añadir **búsqueda de caminos para los enemigos** en el servidor.
- Es el cambio más grande de reglas de esta lista.

### 7.4 Recomendación

1. **A** en el escenario piloto: es solo dibujo y responde rápido a si «parece un bosque».
2. Si tras el piloto sigue pareciendo un pasillo, **B1** como tarea de reglas aparte, con su propio diseño, sus pruebas y la versión del generador.
3. **B2** solo si se quiere un mundo exterior grande; sería un proyecto propio.
