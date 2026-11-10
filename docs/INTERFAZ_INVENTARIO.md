# Interfaz: barra de consumibles e inventario en dos paneles

- **Rama:** `tarea/interfaz-mmo`.
- **Versión:** pendiente; se fija al hacer el merge.
- **Principio:** no hay datos nuevos ni reglas nuevas. La interfaz llama a las mismas acciones de siempre:
  - `Game.useStack`, `Game.quickUse`, `Game.equip` y `Game.unequip`;
  - `Game.invAction`;
  - en línea, las operaciones del perfil y los mensajes de la expedición.

## Barra de consumibles (X, Z, C)

| Tecla | Tipo | Objetos, por orden de uso (`QUICK`) |
|---|---|---|
| X | Curación | Poción, Baya curativa, Superpoción, Baya áurea |
| Z | Comida | Manzana, Manzana grande, Manzana dorada |
| C | Energía | Tónico de energía, Elixir |

### Qué muestra cada casilla

- el icono del objeto que se usará: el primero de la lista que lleves, el mismo que antes;
- la tecla y el total de unidades de ese tipo;
- su estado, descrito por `Game.quickStatus`:

| Estado | Cuándo | Casilla | Motivo que se explica |
|---|---|---|---|
| `ok` | Se puede usar | Normal | — |
| `empty` | No llevas ninguno | Apagada, «vacío», cantidad en rojo | «No llevas comida», etc. |
| `useless` | PS o energía al máximo | «lleno» | «Tus PS están al máximo» |
| `blocked` | Fuera de combate, o en la aldea en línea | Apagada | «En línea, los consumibles se usan durante las expediciones» |

### Comportamiento

- **Al pulsar o tocar:** la tecla, el clic o el toque en la casilla hacen lo mismo.
  - Si no se puede, sale el motivo y la casilla tiembla; no se gasta nada.
  - Mantener la tecla pulsada gasta **una** unidad: se ignora la repetición del teclado.
- **Tooltip:** el nombre, el efecto, la cantidad, la tecla y el motivo, si lo hay.
- **Actualización de la casilla:**
  - **sin conexión:** al momento;
  - **en línea:** cuando el servidor confirma el uso (evento `used`). El servidor decide si tiene efecto.
- **Enfriamiento:** los objetos no tienen. No se muestra ningún indicador de enfriamiento.

## Inventario en dos paneles

`UI.renderInventory` es el mismo para:

- la ventana de la expedición (Tab o I);
- la aldea (Tab o I, o el puesto de Mochila y equipo).

Cada contexto mantiene sus reglas.

### Panel izquierdo: mochila

- **Cabecera:** casillas ocupadas y máximas.
- **Pestañas:** las cinco de siempre, con su recuento: Todo, Consumibles, Materiales, Especiales y Equipo.
- **Cuadrícula:**
  - rareza en el borde;
  - cantidad en la esquina;
  - un rombo en las piezas de equipo;
  - apagado lo que tu clase o nivel no puede llevar.
- **Ficha del objeto:** debajo de la cuadrícula, sin comprimirla.

### Panel derecho: equipo

- **Muñeco:** el sprite real de la clase (`drawCreature`) con las **seis** ranuras reales alrededor: casco, armadura, guantes, arma, accesorio y botas.
  - Las ranuras vacías muestran la silueta apagada de una pieza real de ese tipo.
  - El muñeco no cambia con el equipo, porque el juego no tiene capas de equipo.
- **Estadísticas:** las diez del juego (`STAT_NAMES`), en columnas Base, Equipo y Total.
  - La columna Equipo es `finalStats` sin efectos menos `calcStats`.
  - Los efectos temporales aparecen subrayados.
- **Vista previa:** al seleccionar una pieza aparece la columna «Vista previa», calculada con `finalStats` sobre una copia. No cambia nada hasta pulsar Equipar o soltar la pieza.
  - La ranura de destino se marca en dorado, o en rojo si la pieza no es compatible.

### Interacciones

| Acción | Resultado |
|---|---|
| Clic | Seleccionar |
| Doble clic o doble toque en una pieza de la mochila | Equipar |
| Doble clic o doble toque en una ranura | Quitar |
| Doble clic o doble toque en un consumible | Usar (en la expedición) |
| Arrastrar una pieza a su ranura | Equipar |
| Arrastrar una ranura a la mochila | Quitar |
| Soltar algo en una ranura que no le corresponde | No pasa nada y se explica (clase, nivel, ranura equivocada, no es equipo) |
| Mochila llena al quitar | La pieza sigue puesta y se explica |
| Tirar, o vender algo valioso en la aldea | El primer clic pide confirmación |
| Cerrar | Esc, Tab, I, el botón × o «Volver al juego» |

### Reglas que no cambian

- **En una expedición en línea el equipo es de solo lectura:**
  - no se puede arrastrar;
  - hay un aviso en la ventana;
  - el doble clic explica por qué no se puede.
- **En la aldea en línea, equipar y quitar lo hace el servidor** (operaciones `equip` y `unequip`). La ventana abierta se actualiza con el perfil del servidor (`account.adopt`).
- **Pausa:**
  - **sin conexión**, abrir el inventario pausa el juego, como antes;
  - **en línea**, el mundo sigue y la ventana lo dice.
- **Pantallas pequeñas:** con menos de 700 px de ancho disponible, los dos paneles se apilan (consulta de contenedor). En móvil, la barra de consumibles va encima de la de habilidades.
- **Pantallas táctiles:** no hay controles táctiles propios; se usa tocar y el doble toque. Arrastrar y soltar es solo con ratón.

## Pruebas

| Prueba | Qué comprueba |
|---|---|
| `tests/e2e/inventory_ui_e2e.py` | Sin conexión: los casos de aceptación 1 a 10 y 12, mochila llena, confirmación al tirar, aldea, móvil y pantalla táctil (18 comprobaciones) |
| `tests/colyseus/browser_inventory_e2e.py` | En línea, con servidor real: equipo por el servidor en la aldea, consumibles bloqueados en la aldea, X gasta una unidad en el servidor, el mundo sigue con la ventana abierta y el equipo es de solo lectura en la expedición (8 comprobaciones) |

## Pendiente o fuera de alcance

- **Ordenar a mano o intercambiar dos objetos de la mochila arrastrándolos:** el orden de la mochila no se guarda en el servidor (no hay operación). Hacerlo solo en el cliente crearía diferencias con el servidor.
- **Asignar a mano el objeto de cada atajo** (opción B): requiere un campo nuevo en el guardado y en el servidor.
- **Capas de equipo en el sprite:** el juego no las tiene.
