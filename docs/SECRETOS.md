# Secretos, cadena oculta, finales y poscampaña (versión 0.44)

Este documento es el diseño técnico de cuatro sistemas:

- los secretos narrativos y el **registro de descubrimientos**;
- la cadena oculta que desbloquea el tercer final;
- los finales;
- el contenido posterior a la campaña y la dificultad.

La historia sale de la [biblia narrativa](BIBLIA_NARRATIVA_ELDORIA.md); este documento solo dice **cómo se juega, cómo se guarda y qué da** cada pieza. Nada de lo que aquí aparece cambia diálogos ni misiones que ya existían.

Cada apartado indica su estado:

- **Implementado (0.44):** está en el juego, con pruebas.
- **Diseñado:** definido aquí, pero todavía no está en el juego.

## 1. Principios

1. **Ningún secreto importante depende del azar.** Las piezas de la cadena tienen un sitio fijo (mazmorra y piso) y aparecen en **todas** las expediciones, sea cual sea la semilla. Lo que depende de la partida es **si el jugador puede leerlas**, no si existen.
2. **Antes de añadir una pieza se define:**
   - cómo se desbloquea (condición comprobable);
   - cómo se guarda (campo del perfil);
   - qué da (información, desbloqueo o recompensa).
3. **Cada secreto aporta algo:** información nueva, un desbloqueo o una forma distinta de entender algo ya visto.
4. **Todo se puede hacer en solitario.** En grupo, cada jugador avanza su propia cadena con su perfil, y nadie depende del anfitrión.
5. **El servidor decide** en línea: proximidad, requisitos y recompensas. El cliente solo muestra el texto.
6. **Nada se pierde por un fallo de red:** lo descubierto se guarda con la expedición en los puntos seguros y al terminarla, como el resto del perfil (0.42).

## 2. Registro de descubrimientos (implementado, 0.44)

Amplía el registro del perfil de la 0.42 (`codex` y `story`). La partida pasa al **formato 9**: la migración 8 → 9 añade los campos nuevos sin borrar nada.

| Campo | Qué guarda | Se valida contra |
|---|---|---|
| `codex.lore` | Textos del escenario leídos (ya existía) | `LORE` |
| `codex.secrets` | Salas secretas (ya existía) | Plantillas con papel `secret` |
| `codex.relics` | Reliquias (ya existía) | Objetos épicos, legendarios o únicos |
| `codex.pages` | Páginas del diario de Irene | `STORY_PAGES` |
| `codex.lemas` | Lemas de las ruedas de los sellos | `SEAL_LEMAS` |
| `codex.memories` | Recuerdos mágicos | `STORY_MEMORIES` |
| `codex.talks` | Conversaciones opcionales mantenidas | `STORY_TALKS` |
| `codex.offerings` | Ofrendas de los guardianes | `OFFERINGS` |
| `story.flags` | Hitos y llaves de la historia | `STORY.flags` |
| `story.choices` | Decisiones (`{ bernardo: 'liberar' }`) | `STORY_CHOICES` y sus opciones |
| `story.endings` | Finales vistos (reservado, vacío) | `STORY.endings` |

La migración apunta lo que ya se puede deducir. Por ejemplo, si el jugador ya leyó el nido del Bosque (`f_nido`), recibe la hebilla de Irene.

**En pantalla:** el panel **«Registro de descubrimientos»** del gremio, con estas secciones:

- Diario de Irene: páginas con su texto completo;
- Sellos: lemas;
- Recuerdos;
- Ofrendas;
- Conversaciones;
- Decisiones;
- Textos y salas;
- La tercera vía.

Lo que falta aparece como una pista vaga y nunca dice dónde está.

## 3. Tipos de secreto

| Tipo | Ejemplo | Desbloqueo | Guardado | Recompensa |
|---|---|---|---|---|
| Inscripción | Lema de una rueda | Tocar la rueda tras vencer al guardián | `codex.lemas` | Información y +2 de reputación la primera vez |
| Diario de expedición | Página de Irene | Sitio fijo y paso anterior hecho | `codex.pages` | Avanza la cadena y da la pista de la siguiente |
| Reliquia | Corazón de raíz | Sala oculta fija | `codex.relics` y el objeto | Objeto único (una vez, `relic:<id>`) |
| Habitación oculta | Archivo de los Fieles | Pared falsa fija (se rompe a golpes) | `codex.secrets` | Acceso a lo que guarda |
| Conversación opcional | Ulula y la marca de Irene | Hablar con un vecino teniendo un requisito | `codex.talks` | Información y, a veces, una llave (`codigo_tiza`) |
| Recuerdo mágico | «Ocho sombras» | Rueda de un sello, con requisito | `codex.memories` | Escena que se puede volver a leer |
| Objeto de guardián | Bellota de Mirla | Vencer al guardián de una forma concreta | `codex.offerings` | Ofrenda, necesaria para la tercera vía |
| Decisión | Bernardo | Elegir en la cámara del sello | `story.choices` | Consecuencias en la aldea y en la cadena |

## 4. Sitios fijos (implementado, 0.44)

`STORY_SITES` coloca cada pieza en una mazmorra y un piso concretos.

- `DungeonPlan` la coloca **antes** que las demás salas, con su propio generador aleatorio, así que siempre encuentra hueco.
- **Si hay sitio, en un nicho tras una pared falsa** («Esa pared suena hueca»). Si ningún cuarto lo permite, se pone a la vista en una sala. Nunca falta.
- El resolutor de mecanismos comprueba que se llega en solitario. La prueba recorre 400 semillas por sitio y tamaño de grupo.
- **El piso es idéntico** en el navegador y en el servidor: la colocación no depende de ningún perfil.

| Sitio | Mazmorra · piso | Oculto | Requisito para leerlo | Da |
|---|---|---|---|---|
| `nido_cuervo` Nido del cuervo tuerto | Bosque · 2 | No | — | Hebilla de Irene (`hebilla`) y el texto `f_nido` |
| `marca_irene` Marca del gremio | Bosque · 3 | No | — | El texto `f_explorador` |
| `irene_p1` La marca verdadera | Bosque · 4 | Sí | `codigo_tiza` (conversación con Ulula) | Página 1 |
| `archivo_fieles` Archivo de los Fieles | Gruta · 4 | Sí | Hebilla y página 1 | Página 2 |
| `raiz_corazon` Cámara del latido | Raíces Hondas · 5 | Sí | — | Reliquia «Corazón de raíz» (una vez) |

Si el requisito no se cumple, el sitio enseña un **texto bloqueado** con una pista (por ejemplo, «una muesca de tiza en un código que no entiendes…») y se puede volver más tarde.

Los textos `f_nido` y `f_explorador` siguen saliendo también al azar, como siempre. En los pisos donde hay un sitio fijo con ese mismo texto, no se repiten.

## 5. Ruedas de los sellos (implementado, 0.44)

Al caer el guardián aparecen, junto a la salida, **la rueda de su sello** (objeto `seal`) y el cofre del jefe. Tocarla es opcional: la salida funciona igual.

| Mazmorra | Rueda | Siempre | Con requisito |
|---|---|---|---|
| Bosque | Raíz | Si aún no se conoce el lema de la Luz: «rueda ilegible» (`rueda_raiz`). Si ya se conoce: lema de la Raíz | — |
| Gruta | Luz | Lema de la Luz y texto «Mural de los siete». Si ya se vio la rueda ilegible, también el lema de la Raíz («ahora entiendes la del Bosque») | — |
| Ciénaga | Memoria | Lema de la Memoria y recuerdo 1, «Ocho sombras» | Página 2 → página 3 |
| Mina | Peso | Lema del Peso. Bernardo y la **decisión** | Página 3 → página 4, que da Bernardo |
| Cráter | Fuego | Lema del Fuego y recuerdo 2, «El rayo tachado» | Página 4 → página 5 |
| Raíces Hondas | — | Sin rueda: es un eco | — |

**La decisión de Bernardo** (`story.choices.bernardo`):

- **Opciones:** «Liberarle, si acepta» (`liberar`) o «Dejarle sostener la mina» (`dejar`). Se decide una vez por perfil.
- **En grupo:** cada jugador decide en su pantalla y para su perfil. Es decir, no hay votación (P-13 queda así hasta que llegue una decisión que afecte al grupo).
- **Consecuencias:**
  - Bartolo lo comenta cada vez que se habla con él (frase según la decisión);
  - se abre la conversación «Bartolo y su hermano»;
  - `liberar` es la decisión coherente con el juramento «velar sin atar» y cuenta para la tercera vía.

## 6. Conversaciones opcionales (implementado, 0.44)

Aparecen como un botón más en el puesto del vecino cuando se cumple su requisito.

- **En línea:** es una operación del perfil (`talk`) que el servidor valida.
- **Sin conexión:** la misma función del núcleo.

| Id | Vecino | Requisito | Da |
|---|---|---|---|
| `ulula_irene` | Ulula (gremio) | Haber leído la marca de Irene (`f_explorador`) | `codigo_tiza`: la clave del código de tiza |
| `musgo_fieles` | Doña Musgo (hoguera) | Página 2 | Información: «velar sin atar» (`juramento`) |
| `bartolo_bernardo` | Bartolo (alcalde) | Decisión sobre Bernardo | Información y la reacción de Bartolo |
| `ulula_tercera` | Ulula | Tercera vía descubierta | Información: Ulula cree que eres quien puede abrir esa puerta |

## 7. Ofrendas de los guardianes (implementado en 3 de 7)

La condición se comprueba **en el combate** (servidor o partida local) y se apunta al caer el guardián. La reciben todos los que estén en la expedición. Si no se cumple, se puede repetir la mazmorra.

| Ofrenda | Guardián | Condición | Estado |
|---|---|---|---|
| Bellota de Mirla | Robletón | Enredarlo al menos una vez (salto contra un tocón) | Implementado |
| Prisma de Teodric | Reina Geoda | Aturdirla con tres choques contra las rocas | Implementado |
| Clavija de Brann | Gromgar | Derribarlo (tercer choque) | Implementado |
| Perla de Hesse | Ciénago | Estanque purificado (necesita su versión con BossKit) | Diseñado |
| Ascua de Ondra | Magmatrón | Válvulas enfriadas (necesita su versión con BossKit) | Diseñado |
| Hebilla de Anselmo | Prior Hueco | Perdonarle | Diseñado (capítulo 6) |
| Copo quieto de Ilse | Reina del Hielo Quieto | No romper el bloque de Irene | Diseñado (capítulo 7) |

## 8. La cadena «El diario de Irene» y la tercera vía

| Paso | Qué hacer | Dónde | Estado |
|---|---|---|---|
| 0 | Leer la marca de Irene y la del nido (piso 2 y 3, siempre presentes) | Bosque | Implementado |
| 1 | Preguntar a Ulula por la marca: clave del código | Gremio | Implementado |
| 2 | Romper la pared falsa del piso 4: página 1 | Bosque | Implementado |
| 3 | Atril del Archivo de los Fieles con la hebilla: página 2 | Gruta · 4 | Implementado |
| 4 | Rueda de la Memoria: recuerdo 1 y página 3 | Ciénaga | Implementado |
| 5 | Rueda del Peso y Bernardo: decisión y página 4 | Mina | Implementado |
| 6 | Rueda del Fuego: recuerdo 2 y página 5 | Cráter | Implementado |
| 7 | **Tercera vía descubierta** | Registro | Implementado |
| 8 | Páginas 6 y 7, recuerdo 3, nombre del Custodio y decisiones del Prior y del Custodio | Capítulos 6 a 8 | Diseñado |
| 9 | Final «Liberar el Corazón» | Santuario | Diseñado |

**Tercera vía descubierta** (`story.flags: tercera_via`). Se marca en cuanto se cumple todo lo que existe en esta versión:

- las páginas 1 a 5;
- los recuerdos 1 y 2;
- al menos 3 ofrendas;
- la decisión de **liberar** a Bernardo.

Recompensas:

- el título **«Lector del diario de Irene»**, que se elige en el gremio;
- +30 de reputación, una vez (`story:tercera_via`);
- una conversación nueva con Ulula.

El registro muestra lo que falta, también lo que llegará con los capítulos 6 a 8. Jugar el final necesita esos capítulos, que **aún no existen**; el registro lo dice tal cual.

**Si se deja a Bernardo**, la tercera vía de ese perfil queda cerrada y el registro lo explica. Es una consecuencia buscada: la tercera vía exige ser coherente con «velar sin atar».

## 9. Los tres finales (diseñado)

Cada final cambia el **estado del mundo** (`story.ending` en el perfil). La aldea, los vecinos, las mazmorras y la poscampaña leen ese estado. No es solo una escena distinta.

| | A. Restaurar los sellos | B. Destruir los sellos | C. Liberar el Corazón |
|---|---|---|---|
| Requisitos | Campaña completa; Brasa forja el sexto sello | Campaña completa; vencer al Custodio | Tercera vía completa (apartado 8) |
| Mundo | La tierra sana poco a poco. La magia se apaga despacio: los cofres de cuarzo y las reliquias mágicas son más raros | La magia inunda Eldoria: aparecen «grietas» en las mazmorras (pisos mutados) y criaturas despertadas | La tierra sana y la magia sigue viva. Aparecen manantiales de luz que curan en las mazmorras |
| Regiones | Los guardianes quedan «en calma»: se les puede desafiar como pruebas, sin furia | Las mazmorras mutan: modificadores salvajes fijos por región | Se abre una región nueva: el Origen |
| Vecinos | Ulula refunda la Orden; Irene es su archivera; Brasa guarda la forja; Musgo vuelve a llevar la hebilla | Irene se va a contener las grietas; Ulula endurece el gremio; Bartolo pierde la casa de la mina (temblores) | Irene es la Voz del Origen; Bernardo y Bartolo reabren la mina sin cavar venas; el túmulo tiene ocho piedras con flores |
| La aldea | Estandarte de la Orden en el gremio | Empalizada y vigías; precios más altos | Árbol de cuarzo en la plaza |
| Poscampaña | «La Orden renace»: misiones de juramento, pruebas de los guardianes | «Tierras Desatadas»: cazar al Heraldo y cerrar grietas | «La nueva era»: la Voz pide ayuda en el Origen |

## 10. Contenido posterior a la campaña

| Pieza | Diseño | Estado |
|---|---|---|
| **Mazmorra opcional: Raíces Hondas** | Bajo el roble más viejo. 6 pisos, nivel 17, bioma propio (raíz y cuarzo, pisos oscuros), más élites y punto de control en el 3. Jefe opcional **Eco de Robletón**: tocones y brotes como el original, más **raíces que persiguen**. Cámara del latido (piso 5) con la reliquia **Corazón de raíz**. Trofeo: **Corteza del Eco** | **Implementado.** Se abre al completar el Cráter (hoy, el final de la campaña jugable; cuando exista el capítulo 8, al terminar la campaña) |
| Profundidades | Cada mazmorra completada ofrece «Profundidad +1, +2…»: los mismos pisos, más hondos, con nivel +3 por profundidad y un modificador fijo por nivel de profundidad | Diseñado |
| Contratos de élite | Contratos ★A-S con un modificador elegido (élites con dos rasgos, sin hoguera, tiempo límite) | Diseñado (los contratos de élite de la 0.43 siguen igual) |
| Jefes opcionales | Eco de Robletón (implementado); Viuda del Estanque y Coloso Forjado como ecos de Ciénago y Magmatrón (P-05) | 1 de 3 |
| Reliquias raras | Una por mazmorra de poscampaña, en sala fija. Nunca solo por suerte | 1 (Corazón de raíz) |
| Equipo especializado | Piezas que cambian una mecánica (por ejemplo, «el salto del jefe enreda también en rocas»). Se forjan con trofeos y ofrendas en la forja de Brasa | Diseñado |
| Modificadores de dificultad | Ver el apartado 11 | Diseñado |
| Desafíos temporales | Semanal: una mazmorra con semilla fija y modificador, igual para todos; puntuación por tiempo y daño recibido; recompensa cosmética una vez por semana | Diseñado |
| Más salas secretas | Una sala fija por mazmorra de poscampaña, más salas con la plantilla de pared falsa en los biomas que aún usan el generador antiguo | 1 fija |
| Cosméticos | Títulos (implementado: «Lector del diario de Irene»), capas y estandartes por final y por desafío | Títulos |
| Misiones de consecuencias | Una cadena por final (apartado 9) | Diseñado |

## 11. Dificultad (diseñado)

Se elige al salir de expedición. En grupo la elige el anfitrión, y la sala de espera la muestra a todos.

| Nivel | Enemigos | Jefes | Peligros | Decisiones tácticas | Recompensas |
|---|---|---|---|---|---|
| Normal | Como hoy | Como hoy | Como hoy | — | Como hoy |
| Difícil | Flanquean; los curanderos se esconden detrás de los tanques | Un ataque nuevo por jefe (por ejemplo, Gromgar: segunda carga encadenada también en solitario, con aviso propio). Avisos un 10 % más cortos | Trampas visibles un 30 % menos tiempo. Zonas de veneno que avanzan | **Pacto del piso:** al bajar se puede aceptar un pacto (−1 hoguera, +1 cofre raro) | ×1,25 de monedas. +1 tirada en los cofres de jefe. Cosmético de dificultad. **Nada que no se pueda conseguir también en Normal**, solo más rápido |
| Pesadilla | Élites con dos rasgos. Las oleadas de emboscada traen un élite | Un ataque más y una fase final nueva (por ejemplo, Robletón: los tocones se pudren y hay que elegir cuál salvar) | El suelo cambia durante el combate. Pisos oscuros más frecuentes | **Ruta:** escaleras dobles, una segura y otra con sala de élite y botín | ×1,5 de monedas. Título y capa propios. Las ofrendas y la historia **no** dependen de la dificultad |

**Regla:** la vida de los enemigos nunca sube más del 20 %. La dificultad viene de ataques, peligros y decisiones. El contenido Normal no queda obsoleto: las recompensas extra son monedas, cosméticos y tiradas, nunca equipo exclusivo más fuerte.

## 12. Cooperativo

- **Sitios y ruedas:** cada jugador cerca lo lee con **su** perfil. Uno puede ver la página y otro el texto bloqueado: cada uno avanza lo suyo.
- **Paredes falsas:** cualquiera las rompe y quedan rotas para todos.
- **Ofrendas:** las consigue el grupo y las reciben todos los presentes.
- **Decisiones:** cada uno decide para su perfil.
- **Conversaciones:** en la aldea, cada uno con su perfil.
- **Nada necesita grupo.** Las ofrendas implementadas se consiguen en solitario: Robletón se enreda si esperas junto a un tocón, la Reina Geoda se aturde con la Carga contra las rocas y Gromgar se derriba haciéndole cargar contra rocas.
- **Nadie depende del anfitrión:** el servidor lleva cada perfil por separado. Un cambio de anfitrión o una reconexión no repiten ni pierden nada (el servidor apunta lo leído por jugador y por piso).

## 13. Lo que hay que saber de la 0.44

- **Partidas que ya iban avanzadas:** las ruedas de los sellos aparecen al **volver a vencer** a cada guardián. Lo ya hecho no se pierde, y la migración apunta la hebilla si ya se había leído el nido.
- **Raíces Hondas usa las piezas del Bosque** (suelo, árboles y tocones) con luz y colores más fríos. No tiene un juego de casillas propio.
- **Fallo corregido al probar:** el trofeo de Robletón (la Corona de Espinas) nunca se entregaba.
  - **Causa:** el registro buscaba la definición del jefe por su id (`robleton`), pero se llama `espinas`, así que no la encontraba.
  - **Arreglo:** `BossKit.defOf` resuelve las dos formas.
  - **Partidas existentes:** quien ya le había vencido recibe la corona en su próxima victoria.
- **Guardado:** el gremio guarda ahora también las recompensas únicas de la historia (`story:` y `relic:`) y los títulos de la historia. Antes, la validación los habría borrado al cargar.

## 13. Archivos

| Pieza | Dónde |
|---|---|
| Catálogo y reglas (sitios, ruedas, páginas, lemas, recuerdos, conversaciones, ofrendas, decisiones, tercera vía) | Prototipo, sección «Historia: secretos y registro» (`StoryChain`), dentro del núcleo compartido |
| Colocación fija | `DungeonPlan.apply` → `StoryChain.place` |
| Servidor | `server/src/sim/Expedition.js` (proximidad, ruedas, ofrendas y decisión), `server/src/profile/rules.js` (`talk`, `setTitle`), `shared/protocol.js` (`choose`) |
| Pruebas | `tests/story.test.mjs` (12 pruebas):<br>· sitios en 400 combinaciones por sitio;<br>· reglas y bloqueos;<br>· decisión;<br>· tercera vía;<br>· guardado y migración;<br>· servidor con dos perfiles;<br>· ofrendas del combate real;<br>· Raíces Hondas;<br>· trofeo de Robletón;<br>· `talk` y `setTitle`.<br><br>`tests/colyseus/story.test.mjs` (Colyseus real):<br>· eventos solo para su dueño;<br>· mensaje `choose`;<br>· guardado en el perfil.<br><br>`tests/e2e/story_e2e.py` (navegador):<br>· de la marca de Irene a la tercera vía;<br>· Raíces Hondas;<br>· cerrar y volver a cargar. |
