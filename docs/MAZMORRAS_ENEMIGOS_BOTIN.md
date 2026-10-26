# Mazmorras, enemigos y botín (versión 0.29)

Actualización de arte, mazmorras, enemigos y botín. Todo está en `prototype/mystery-action.html` (fuente única). `tools/split-prototype.mjs` genera el núcleo que usa el servidor, así que el navegador y el servidor ejecutan las mismas reglas.

## 1. Sprites de las clases

- **Motor nuevo:** `PixelArt` dibuja figuras con materiales de 5 tonos (contorno, sombra, medio, luz y brillo).
  - Sombrea solo: luz arriba, sombra abajo y a la derecha, sombra bajo las piezas delanteras y brillo arriba a la izquierda.
  - Contorno de color alrededor de la silueta.
- **`HeroSprites`:**
  - Fotogramas de 72×74 en tres vistas: frente, espalda y perfil (la izquierda es el espejo).
  - Animaciones: reposo 4, andar 6, ataque 6, habilidad 6, carga 4, canalizar 4, golpe recibido 2, esquiva 4 y derrota 6.
  - Se generan al primer uso y se guardan en caché.
- **Silueta de cada clase:**
  - Guerrero: yelmo con penacho, escudo y espada.
  - Arquero: capucha y arco.
  - Mago: sombrero, túnica y bastón.
  - Asesino: capucha, bufanda y dagas.
- **Cómo se dibujan:** a 1:1 en el búfer de píxel, sin escalado ni deformación. El destello blanco al recibir un golpe es una silueta.
- **El arquero** se pone de perfil al disparar, salvo cuando apunta casi en vertical.

## 2. Escenario

### Suelos
`Terrain` elige el tipo de suelo de cada casilla con dos ruidos y la semilla del piso:
- Bosque: hierba, musgo, tierra y hojarasca.
- Gruta: roca, grava y charcos con cristales.
- Ciénaga: barro, agua y juncos.
- Mina: tablones, carbón y raíles.
- Cráter: ceniza, basalto y grietas de lava.

Las transiciones entre tipos son irregulares, y hay oclusión ambiental junto a los muros.

### Muros
Hileras de bloques irregulares con:
- borde iluminado;
- lado oscuro;
- piedras salientes;
- esquinas achaflanadas;
- sombra de contacto en el suelo;
- musgo, cristal u hollín según el bioma.

### Decoración (`Deco.build`)
- **Determinista:** misma semilla ⇒ el mismo escenario para todos.
- **Nunca** se coloca en:
  - la entrada (radio 2);
  - la escalera y la escalera secreta;
  - las puertas;
  - los pasillos y su borde;
  - los cofres y objetos;
  - las trampas;
  - los PNJ;
  - los enemigos (guardianes, radio 3).
- **Colocación:**
  - Grupos de 3–5 piezas junto a muros y esquinas.
  - Piezas sueltas a lo largo de los muros.
  - Solo unas pocas en zonas abiertas.
  - Piezas raras: 30 % por sala.
- **Cantidad:** unas 48–57 piezas por piso (medido).
- **No afecta a la colisión.** Las piezas que brillan (setas, cristales, lava) dan luz.

### Obstáculos con colisión
- 0–2 por sala normal, pegados a la pared y lejos de pasillos y de la entrada.
- Tipo según el bioma: roca, cristal o **tronco caído** (`T.LOG`, casilla nueva).
  - El tronco bloquea el paso pero no los disparos.
- Si un obstáculo cambia qué casillas son alcanzables, se deshace.
- Lo que se ve es exactamente lo que choca: son casillas del mapa, no decoración.

### Identidad de cada bioma
- Bosque: verde húmedo y hojas.
- Gruta: cristales cian y polvo.
- Volcán: ceniza, lava y ascuas.
- Ciénaga y Mina mantienen su paleta, con los suelos nuevos.

## 3. Seis familias de enemigos pequeños

Sustituyen a los enemigos anteriores en las cinco mazmorras. Los guardianes no cambian.

| Familia | Comportamiento | Aviso |
|---|---|---|
| Rata | Corre en grupo (2–3), muerde y se aparta | Se agacha (preparación) |
| Lagarto | Se acerca de lado, muerde rápido y se recoloca; algunos envenenan | Arco frontal |
| Limo | Quieto entre saltos; se comprime y salta hacia el objetivo | Círculo en el punto de caída |
| Ave | Vuela en círculos, cae en picado y se retira | Línea del picado |
| Hongo | Lento; guarda distancia y lanza esporas (veneno o lentitud) | Hinchado antes de disparar |
| Planta | Fija; raíces bajo el objetivo y espinas al acercarse | Círculo de raíces |

- **Variantes por bioma:** 25 en total, con paleta y valores propios (p. ej. `rataRaiz`, `limoMagma`, `cardoIgneo`).
  - Algunas solo aparecen a partir de cierto piso (`enemyFloors`).
- **Turnos de ataque (`canStartAttack`):** como mucho 2 enemigos preparan un ataque contra el mismo objetivo, y cada inicio va al menos 0,16 s después del anterior.
- **Número de enemigos:** escala con el piso y con el número de jugadores (escalado cooperativo ya existente).
- **Sprites:** `EnemySprites`, de 40×34. Animaciones de reposo, movimiento, preparación, ataque, golpe y muerte.

## 4. Élites

| Parámetro | Valor |
|---|---|
| Probabilidad base | 5 % |
| Profundidad | +0,15 % por nivel de mazmorra y +0,4 % por piso |
| Multiplicador por bioma | bosque 1 · gruta 1,1 · ciénaga 1,2 · mina 1,3 · cráter 1,4 |
| Tope de probabilidad | 20 % |
| Límite | 1 por sala |
| Sin élites | piso 1 de las mazmorras de nivel ≤ 3 |
| PS | ×2,5 |
| Daño | ×1,5 |
| Experiencia | ×2 |

- **Proporción medida:** 3,8 % (Bosque) a 9,0 % (Cráter) de los enemigos.
- **Aspecto:**
  - paleta más oscura;
  - pinchos, cuernos o corona según la familia;
  - aura;
  - indicador «ÉLITE» al entrar en combate;
  - efecto al aparecer.
- **Botín (fuente `elite`):**
  - siempre 8–16 monedas (escala con el nivel);
  - consumible 70 %;
  - equipo 30 %;
  - material local 45 %.
- **Sin legendarios** antes de la mazmorra de nivel 6. Solo el cofre del guardián y la tasación pueden darlos.
- Lo calcula el servidor una sola vez, al morir el enemigo.

## 5. Botín: menos en el suelo, más en cofres

| Medido en 40 semillas × todos los pisos | 0.28 | 0.29 |
|---|---:|---:|
| Objetos sueltos por piso (salas normales) | 1,40 | 0,38 (−73 %) |
| Objetos por enemigo derrotado | 0,059 | 0,025 (−58 %) |
| Cofres por piso | 0,35 | 1,75 |

- Como mucho un objeto suelto por sala.
- Los enemigos normales casi nunca sueltan objetos: monedas un 22 % de las veces.
- El nido de monstruos deja 0–1 objetos y la sala secreta 2–3.

### Cofres

- **Cantidad y colocación:**
  - 1–2 por piso, más uno extra un 35 % de las veces.
  - En salas secundarias (preferencia por callejones sin salida) y junto a las paredes.
  - Separados al menos 8 casillas; nunca en la sala inicial.
- **Guardados:** un 35 % desde el piso 2, con 1–2 enemigos al lado. Si no hay sitio para los guardias, el cofre queda como normal.

| Cofre | Monedas | Consumibles | Equipo | Material |
|---|---|---|---:|---:|
| Común | 4–9 | 1–2 (pociones, tónicos, bayas) | 18 % | 30 % |
| Plata | 8–16 | 1–2 (superpoción, elixir…) | 42 % | 40 % |
| Raro | 14–28 | 2 | 78 % | 50 % |

- Las monedas escalan con el nivel de la mazmorra.
- **Proporción medida:** común 68 %, plata 21 %, raro 11 %.
- Las monedas de los cofres se recortaron para que la economía del Bosque siga en 80–220 monedas por expedición (medido: ≈206).
- **Al abrirlo:**
  - la tapa se abre (animación);
  - luz del color del cofre;
  - el botín sale al suelo;
  - aviso con lo que había, p. ej. «Cofre de plata: 14 monedas · Manzana grande · Talismán de brasa».
- **En cooperativo:**
  - el servidor tira el botín una sola vez;
  - el evento `chest` lleva lo que había;
  - todos lo ven igual;
  - aunque lleguen dos jugadores a la vez, se abre una sola vez.

## 6. Equipo por clase (seis huecos)

- **Huecos:** arma, armadura, casco, guantes, botas y accesorio.
- **30 piezas nuevas,** cada una con `classes` y `req` (nivel mínimo).
  - Ejemplos: Espada de hierro (Guerrero), Arco corto (Arquero), Bastón de roble (Mago), Dagas gemelas (Asesino), túnicas, capuchas, guantes y botas por clase, Escudo de roble y Anillo de maná.
- **`canEquip(clase, nivel, objeto)`:** lo comprueban el juego y el servidor (operación `equip`).
  - Si no se puede equipar, la ficha del objeto explica por qué («Solo Guerrero», «Requiere nivel 5»).
- **Partidas anteriores:**
  - Los antiguos pañuelos, brazaletes y talismanes pasan a ser accesorios.
  - Al cargar, el primero ocupa el hueco de accesorio y los demás van a la mochila.
  - Un objeto equipado que no es de la clase vuelve a la mochila.
- Las tiendas venden equipo de clase según el progreso.

## 7. Pruebas

- **`tests/dungeon-content.test.mjs`** (12 pruebas):
  - decoración determinista y fuera de las zonas reservadas;
  - obstáculos que no rompen rutas;
  - seis familias y grupos de ratas;
  - comportamiento de cada familia en la simulación del servidor;
  - turnos de ataque;
  - élites (proporción, límite por sala, ×2,5 / ×1,5 / ×2);
  - botín de élites;
  - reducción del botín suelto;
  - cofres (cantidad, separación, rarezas, contenido);
  - el cofre se abre una sola vez con dos jugadores;
  - equipo por clase y conversión de partidas;
  - ningún valor NaN enviado por red.
- **Errores encontrados al probar y corregidos:**
  - Los limos enviaban `NaN` como dirección de ataque. Rompía la comparación cliente = servidor del combate con 4 clientes.
  - `Loot.pick` fallaba si todas las rarezas tenían peso 0. Ahora, en las primeras mazmorras, el peso legendario pasa a épico.
  - Los guardias de la alarma de ladrón usaban «el tercer enemigo de la lista», ahora un hongo pequeño. Ahora usan la familia más dura del piso.
  - Algunos cofres «guardados» no recibían guardias si no había sitio.

## 8. Límites conocidos

- Los sprites son pixel art generado por código (formas, materiales y sombreado automático), no dibujados a mano. Se ven bien a la escala del juego, pero tienen menos detalle que un sprite hecho a mano.
- Los enemigos antiguos siguen definidos en el código (los usan el tendero y algunas pruebas), pero ya no aparecen en las mazmorras.
