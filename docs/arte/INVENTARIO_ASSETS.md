# Inventario de assets

- **Para qué:** la lista de todo lo que habrá que producir con la nueva dirección, contada en el código de `main` 0.46. Servirá para seguir la producción.
- **Estado de todo:** **pendiente**. No se ha producido nada.
- **Columna «Prioridad»:** el bloque de producción propuesto en [PLAN_PRODUCCION_ARTE.md](PLAN_PRODUCCION_ARTE.md), sección 5. P = piloto; 1 a 5 = bloques.
- **Cómo se actualiza:** cuando un recurso cambie de estado (en diseño, en producción, en revisión, aprobado, integrado), se anota aquí con la fecha.

---

## 1. Héroes

Fuente: `HeroSprites` y `docs/SPRITES.md`.

| Clase | Vistas | Animaciones | Prioridad | Estado |
|---|---|---|---|---|
| Guerrero | 5 + reflejo | Reposo (y variante de combate), andar, Espadazo, Golpetazo de escudo, daño, esquiva, caída | **P** | Pendiente |
| Arquero | 5 + reflejo | Reposo, andar, Flecha, Flechazo cargado, carga, daño, esquiva, caída | 1 | Pendiente |
| Mago | 5 + reflejo | Reposo, andar, Orbe arcano, Lluvia de fuego, canalizar, daño, esquiva, caída | 1 | Pendiente |
| Asesino | 5 + reflejo | Reposo, andar, Doble tajo, Tajo en X, daño, esquiva, caída | 1 | Pendiente |

**Habilidades de los niveles 7, 10 y 14 y definitivo** (problema I-1): **pendientes de diseño de juego**. Cada una necesitará su animación por clase y su icono.

---

## 2. Vecinos y personajes de la aldea

Fuentes: `VillagerArt`, `NPC_KINDS` y `docs/ALDEA.md`.

| Personaje | Vistas | Animaciones | Prioridad | Estado |
|---|---|---|---|---|
| Alcalde Bartolo | 5 + reflejo | Reposo, andar, oficio | 2 | Pendiente |
| Maestra Ulula | 5 + reflejo | Reposo, andar, oficio | 2 | Pendiente |
| Pico Cartero | 5 + reflejo | Reposo, andar, oficio | 2 | Pendiente |
| Topo mercader | 5 + reflejo | Reposo, andar, oficio | 2 | Pendiente |
| Doña Musgo | 5 + reflejo | Reposo, andar, oficio | 2 | Pendiente |
| Centinela Roco | 5 + reflejo | Reposo, andar, oficio | 2 | Pendiente |
| Tito Brote | 5 + reflejo | Reposo, andar, oficio | 2 | Pendiente |
| Viajero de las tiendas | 5 + reflejo | Reposo, andar | 2 | Pendiente |
| Nara Vey (P-14) y Gil (P-15) | Según su papel | — | 2 | Pendientes de confirmar en el juego |

---

## 3. Enemigos

Fuentes: `ENEMIES`, `ENEMY_VARIANTS`, `EnemySprites`, `BIOMES` y la auditoría visual.

### 3.1 Familias vectoriales: 3 familias × 5 biomas (15 variantes)

| Familia | Rig | Bosque y Raíces Hondas | Gruta | Cráter | Ciénaga | Mina |
|---|---|---|---|---|---|---|
| Mordisquín (perseguidor) | 1, 3 vistas + reflejo | Mordisquín **(P)** | Cristálido (3) | Ascuín (3) | Lodín (3) | Chispín (3) |
| Pufón (a distancia) | 1, 1 vista | Pufón (1) | Destello (3) | Fumarola (3) | Esporín (3) | Farolillo (3) |
| Pedrolón (tanque) | 1, 3 vistas + reflejo | Pedrolón (1) | Geodón (3) | Basaltón (3) | Musgón (3) | Ferrón (3) |

**Animaciones por familia:** reposo, desplazamiento, preparación, ataque, daño y muerte. Las variantes élite llevan marcas de élite.

### 3.2 Familias de pixel art: 6 familias (32 variantes)

- Familias: rata, lagarto, limo, ave, hongo y planta (`EnemySprites` y `FAMILY_ART`).
- **Primero:** comprobar qué variantes aparecen de verdad en el juego (pisos, mazmorras, invocaciones), para no dibujar las que no se usen.
- Después se aplica la regla de «anatomía común + piezas de bioma».
- **Estado:** pendiente de esa comprobación.

### 3.3 Criaturas especiales

- **Brote de savia** (fase de Robletón), con prioridad 1.
- Las invocaciones que existan en el código se listarán al revisar el punto 3.2.

---

## 4. Jefes

Fuentes: `BOSSES` y `docs/JEFES.md`.

| Jefe | Mazmorra | Vistas | Animaciones mínimas | Prioridad | Estado |
|---|---|---|---|---|---|
| Robletón | Bosque | 3 + reflejo | Entrada, reposo, desplazamiento, zarpazo, raíces en línea, salto, enredado, sin savia, daño, cambio de fase, derrota | 1 | Pendiente |
| Eco de Robletón | Raíces Hondas | Reutiliza el rig de Robletón con otro material | Lo anterior más las raíces que persiguen | 3 | Pendiente |
| Gromgar | Mina | 3 + reflejo | Entrada, reposo, desplazamiento, golpe, lanzar roca, carga, aturdido, derribado, avalancha, daño, cambio de fase, derrota | 3 | Pendiente |
| Reina Geoda | Gruta | Según su anatomía | Según su BossKit | 3 | Pendiente |
| Ciénagón | Ciénaga | — | — | — | **En espera:** puede sustituirse por la Viuda del Estanque |
| Magmatrón | Cráter | — | — | — | **En espera:** puede sustituirse por el Coloso Forjado |
| Picoferro | Mina (antiguo) | — | — | — | **En espera:** comprobar si sigue en uso |

---

## 5. Zonas

En cada zona hay que producir:

- suelo: 3–4 terrenos con variantes y máscaras;
- calcomanías;
- límites;
- atrezo;
- elementos altos;
- y la paleta y la atmósfera, que van por código.

| Zona | Bioma | Elementos propios | Prioridad | Estado |
|---|---|---|---|---|
| Linde de Brumaverde | `forest` | Valla, campamento de Nara Vey, leña de Gil, hierba alta | 1 | Pendiente |
| Bosque de Brumaverde | `forest` | Troncos, matas, raíces enfermas, copas, tocones (también los de Robletón), sendero | **P** (escena) y 1 | Pendiente |
| Aldea Raíz | Aldea | 13 casas con su planta actual, plaza, estanque, puestos, tablón, hoguera, faroles, vagonetas | 2 | Pendiente |
| Gruta de Cuarzo | `cave` | Cristales, estalagmitas, charcas | 3 | Pendiente |
| Mina Olvidada | `mine` | Vigas, raíles, vagonetas, faroles, rocas de Gromgar | 3 | Pendiente |
| Ciénaga Sombría | `marsh` | Pasarelas, pilotes, agua, juncos, árboles muertos | 3 | Pendiente |
| Cráter Ceniciento | `volcano` | Basalto, magma, braseros, grietas | 3 | Pendiente |
| Raíces Hondas | `roots` | Raíz viva, Cámara del latido, ofrendas, sellos | 3 | Pendiente |

### 5.1 Comunes a las mazmorras

Fuentes: `ChestArt`, `MechArt` y `docs/MAZMORRAS.md`.

| Grupo | Elementos |
|---|---|
| Cofres | Normal, plata, raro y de jefe |
| Mecanismos | Placas, palancas, rejas, puentes, raíces rompibles, paredes falsas, altares, estelas |
| Trampas | Pinchos, veneno, somnífera, teletransporte, ráfaga, hambre, explosiva, invocación, agujero, purificadora |
| Lugares | Escalera, hoguera de descanso, tienda del viajero |

---

## 6. Objetos (89 en `ITEMS`)

| Grupo | Cantidad | Objetos |
|---|---|---|
| Consumibles | 24 | Manzana, Manzana grande, Manzana dorada, Poción, Superpoción, Baya, Baya áurea, Tónico de energía, Elixir, Antídoto, Hierba lúcida, Panacea, Tónico de fuerza, Tónico férreo, Cristal de experiencia, 4 semillas (vital, explosiva, somnífera, ojo) y 5 orbes (escape, luminoso, radar, escalera, petrificador) |
| Materiales | 11 | Hoja tenaz, Seta luminosa, Fragmento de cuarzo, Geoda azul, Ceniza densa, Junco seco, Perla de ciénaga, Mena de cobre, Engranaje antiguo, Núcleo de magma, Polvo estelar |
| Especiales | 2 | Llave, Cofre |
| Equipo | 52 | 12 armas (3 por clase), 10 armaduras y cascos, 5 pares de guantes, 4 de botas, escudo, y accesorios (anillos, broches, pañuelos, brazales, talismanes, coronas, insignias) y trofeos de jefe (Corona de Espinas, Colmillo de Gromgar, Corteza del Eco, Corazón de raíz…) |

- **Iconos:** se pintan a 128×128 y se exportan según el nivel. Prioridad 4, con la interfaz.
- **Composición compartida por grupo:** por ejemplo, todos los orbes son una esfera con símbolo.
- **Equipo visible en el personaje:** fuera de alcance salvo decisión aparte ([MUNDO_Y_PERSONAJES.md](MUNDO_Y_PERSONAJES.md), sección 2).

---

## 7. Habilidades (`MOVES`)

| Clase | Movimientos |
|---|---|
| Guerrero | Espadazo, Golpetazo de escudo |
| Arquero | Flecha, Flechazo cargado |
| Mago | Orbe arcano, Lluvia de fuego |
| Asesino | Doble tajo, Tajo en X |

Por cada movimiento hacen falta:

- su icono;
- su efecto visual: proyectil, estela, impacto y zona.

Los efectos se hacen por código, con texturas pintadas si hacen falta. Prioridad 1 (P para los del Guerrero).

---

## 8. Efectos visuales

| Grupo | Elementos | Técnica |
|---|---|---|
| Combate | Estelas, impactos, chispas, números de daño, aturdimiento, curación, subida de nivel | Código, con texturas pintadas pequeñas |
| Proyectiles | Flechas, orbes, esquirlas, esporas, rocas, raíces | Imagen pintada y estela por código |
| Telegrafiados | Arcos, círculos, carriles, sombras de salto | **Siempre código**: colores reservados al juego |
| Atmósfera por bioma | Haces de luz, bruma, polen, polvo, brasas, hojas, burbujas | Código |
| Luz | Faroles, cristales, magma, magia | Código |

---

## 9. Interfaz y menús

Pantallas actuales en el prototipo:

| Pantalla | Id en el prototipo |
|---|---|
| Título | `title` |
| Selección de clase | `select` |
| Base | `base` |
| Pausa | `pause` |
| Mochila | `bagpanel` |
| Diálogo | `dialog` |
| Movimientos | `movespanel` |
| Evolución | `evo` |
| Opciones | `options` |
| Resultado | `result` |
| Derrota | `defeat` |

- **HUD:** retrato, nombre, nivel, barras, grupo, misiones, mejoras, minimapa y avisos.
- **Barra rápida** y **mochila en dos paneles:** están en la rama `tarea/interfaz-mmo`, pendiente de fusión.

**Elementos de interfaz que hay que producir:**

- marcos de panel;
- botones con sus estados;
- pestañas;
- casillas de inventario por rareza;
- barras de vida y energía;
- marco de retrato;
- marco del minimapa;
- cursor y retícula;
- logotipo de Eldoria.

**Prioridad 4**, con el nuevo menú de inicio (etapa 5). El título «Mystery Action» y su texto se sustituyen por la identidad de Eldoria (problema 11 de la auditoría visual).

---

## 10. Resumen de volumen

| Grupo | Unidades | Nota |
|---|---|---|
| Héroes | 4 rigs × 5 vistas | |
| Vecinos | 8–10 rigs × 5 vistas | |
| Familias de enemigos vectoriales | 3 rigs y 15 juegos de piezas | |
| Familias de enemigos de pixel art | Hasta 6 rigs y 32 juegos de piezas | Tras comprobar cuáles se usan |
| Jefes | 4 activos, 3 en espera | |
| Zonas | 8, incluida la aldea, más los elementos comunes de las mazmorras | |
| Iconos | 89 objetos, 8 movimientos y los que se añadan | |
| Interfaz | 11 pantallas más el HUD | |
