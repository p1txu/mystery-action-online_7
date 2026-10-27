# La aldea y la llegada (versión 0.33)

## Entrar en el juego

- **«Jugar»** abre solo *Iniciar sesión* o *Crear cuenta*. No hay campo de servidor, ni invitado, ni menú cooperativo.
- Al crear la cuenta hay que repetir la contraseña, y el recuadro de privacidad explica qué se cifra.
- **La primera vez** se elige la clase en la pantalla de tarjetas del juego. El servidor crea el perfil y entras directamente en la aldea. Las siguientes veces, «Jugar» lleva directo a la aldea.
- Las partidas privadas por código, el enlace para amigos y la cuenta siguen en **«Cuenta y partidas privadas»**.

## Llegada a la aldea (solo la primera vez)

Escena con el juego detenido, de unos 12 s:

1. Al alba, por el camino del oeste, sale del bosque una **carretilla de madera**: ruedas de radios con llanta de hierro, tablones, paja y una manta raída.
2. **Centinela Roco** tira de las varas y **Tito Brote** empuja por detrás, cada uno con **su propio sprite**. El héroe va tumbado sobre la paja, con su sprite de derrota de la clase elegida.
3. Se paran frente a la casa del alcalde. El héroe se incorpora («…¿dónde estoy?») y el **alcalde Bartolo** le da la bienvenida: le dice que se quede el tiempo que necesite hasta recuperarse.
4. La carretilla se va y empieza el juego.

Detalles:

- **Saltar:** Esc salta la escena.
- **No se repite:** se guarda en el perfil (`arrived`). En línea lo guarda el servidor con la operación `arrive`.
- **Partidas anteriores:** las que ya habían jugado alguna expedición no ven la escena.
- **El alcalde Bartolo** es un tejón anciano con abrigo remendado, la cadena del cargo y un bastón nudoso. Es original y está dibujado con el mismo estilo que los demás vecinos. Vive junto a la plaza: con **E** charla un rato (frases sueltas, sin panel). Desde 0.34 también ofrece **«¿Cómo llegué aquí?»**, que vuelve a poner la escena de la carretilla (se salta con Esc y no cambia el perfil).

## Estilo de la aldea: medieval y pobre

- **Suelo:**
  - **calles y plaza empedradas**, con cantos de tamaño irregular, juntas con musgo y algún hueco de tierra;
  - el resto es **barro y tierra pisada**, con paja suelta y matas de hierba seca;
  - casi sin flores.
- **Casas de piedra:**
  - **mampostería irregular**, con humedad y musgo en la base;
  - **tejados de paja** con remiendos y flecos;
  - **ventanas pequeñas con postigos** y alféizar de piedra, algunas a oscuras porque no hay velas para todos;
  - puertas de tablones combados con dintel de piedra;
  - chimeneas de piedra con humo.
- **Edificios:**
  - el Gremio (con su estandarte gastado);
  - la Tienda (con su toldo remendado);
  - **la casa del alcalde**, nueva;
  - **dos chozas**, nuevas;
  - leña apilada, pacas de heno y barriles.
- **Iluminación pobre:**
  - poca luz ambiente;
  - solo cuatro faroles, más tenues;
  - velas en algunas ventanas;
  - la **hoguera** de la zona de descanso es la luz principal.
- **El mapa cambia poco:**
  - se abre el camino del oeste, hacia el bosque;
  - se añaden la casa del alcalde y las chozas, que son casillas sólidas, así que lo que se ve es lo que choca;
  - las estaciones de siempre siguen en su sitio.

## Pruebas

- **`tests/colyseus/browser_social_e2e.py`** (3 navegadores, 25/25) recorre todo el camino: «Jugar» sin servidor ni invitado, contraseñas que no coinciden, aviso de cifrado, crear cuenta, elegir clase en las tarjetas, escena completa con el diálogo del alcalde (y saltarla con Esc), y que no se repite al volver, porque lo guarda el servidor.
- **`tests/arrival.test.mjs`** comprueba el estado de llegada (`arrived`) en perfiles nuevos y antiguos, y la operación del servidor.
- **La batería sin conexión** comprueba que se llega andando a las 7 estaciones y que el rendimiento sigue por debajo de 16 ms por fotograma.
- **Para pruebas automáticas:** `window.MA_NO_INTRO = true` o `localStorage['ma-no-intro'] = '1'` evitan la escena.

## 0.36: vecinos humanos y aldea con más vida

- **Vecinos:** ahora son personas, dibujadas con el mismo sistema que los héroes (8 direcciones, reposo y andar), cada una vestida según su oficio:
  - **Alcalde Bartolo:** anciano encorvado con abrigo largo de lana y cuello de piel, cadena y medallón del cargo, y bastón.
  - **Maestra Ulula (gremio):** exploradora veterana con gabán de cuero, banda azul con la insignia del gremio, moño cano, monóculo, portamapas y el libro de registro bajo el brazo.
  - **Pico Cartero (tablón):** mensajero pelirrojo con gorra de pluma, cartera de cuero con cartas asomando y un rollo en la mano.
  - **Topo mercader (tienda):** comerciante grueso con sombrero de fieltro, barba, mandil y un fardo enorme con manta, cazo, jarra y farolillo.
  - **Doña Musgo (hoguera):** anciana curandera con pañuelo, chal, falda larga, mandil y un manojo de hierbas.
  - **Centinela Roco (puerta):** guardia con capacete de hierro, gambesón acolchado, esclavina roja, lanza y escudo redondo a la espalda.
  - **Tito Brote (campamento):** mozo con sombrero de paja, zurrón y cayado de pastor.
  - **El cliente de las tiendas de las mazmorras:** un viajero encapuchado con bastón.
- **Tienda:** dos toldos a rayas con sus postes, cuatro estanterías con tarros, sacos y botellas en la fachada, dos mesas de mercado y un cartel con una bolsa de monedas. Las mesas son sólidas (casillas 29-31 y 35-37 de la fila 10).
  - Primera mesa: fruta, pan y queso.
  - Segunda mesa: pociones, telas y una balanza.
- **Gremio:** dos estandartes azules con una rosa de los vientos dorada y un cráneo con cuernos sobre la puerta. También:
  - un tablón de encargos con papeles clavados;
  - una placa con espadas cruzadas;
  - un farol;
  - una veleta;
  - un armero con lanzas y espadas, y un muñeco de paja con diana (sólidos).
- **Hoguera:** ahora está en la plaza, junto a la casa del alcalde (casilla 19,14), con sus bancos y su luz. Doña Musgo está a su lado; la estación «Hoguera de la plaza» hace lo mismo que la antigua zona de descanso. Donde estaba, junto al estanque, hay un pozo de piedra.

## 0.37: reconstrucción visual

La aldea se dibuja ahora con sprites pintados píxel a píxel (casas, objetos y árboles ordenados en profundidad). Las casas nuevas, la terraza de la taberna, los puestos, el carro, el banco, las farolas y las macetas ocupan sus casillas. Detalles en `docs/MUNDO.md`.
