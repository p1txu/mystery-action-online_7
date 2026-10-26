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
