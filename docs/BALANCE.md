# Balance de las clases (versión 0.36)

Simulación hecha con **el motor real del juego**: la misma simulación autoritativa del servidor (`Expedition`) y las mismas reglas que el cliente.

- **Herramienta:** `tools/balance-sim.mjs`.
- **Semillas fijas:** el mismo comando da siempre el mismo resultado.

```
node tools/balance-sim.mjs --seeds 8 --out build/balance.json      # (sin npm: node --import ./tests/.vendor/loader.mjs …)
```

## Cómo se mide

**Muñeco de prácticas:**
- daño por segundo contra un Mordisquín de tu nivel que no se mueve ni ataca, y contra un grupo de 4 juntos;
- en los niveles 5, 10, 15 y 20, con el básico y la habilidad cada vez que están listos.

**Expediciones:** 4 clases × 5 mazmorras × 8 semillas = 160 expediciones, enteras, con un bot por clase.
- **Nivel y equipo de entrada:** el nivel de la mazmorra + 1, 3 pociones y 2 manzanas.
- **Camino:** busca caminos por casillas (también rodea las rocas caídas) hasta el enemigo más cercano. Con el piso limpio, o el viento encima, va a la escalera.
- **Distancia:**
  - el Guerrero y el Asesino se pegan;
  - el Arquero y el Mago se mantienen a 150-270, retroceden si se les acercan y solo disparan con línea de visión.
- **Habilidad, por clase:**
  - golpe de escudo y tajo en X, cuerpo a cuerpo;
  - flechazo cargado, siempre al máximo;
  - lluvia de fuego sobre grupos o el jefe.
- **Defensa:**
  - esquiva los ataques que se preparan cerca;
  - sale de las zonas marcadas en el suelo;
  - bebe una poción por debajo del 35 % de PS y come con hambre;
  - elige el primer don que le ofrecen.

**Qué se mide:**
- éxito, tiempo total y por piso, y bajas por minuto;
- daño hecho y recibido, también por fuente (enemigo, quemadura, hambre);
- caídas;
- el combate contra el jefe: tiempo, daño por segundo y vida perdida.

## Lo que encontró y lo que se cambió

| Hallazgo (antes) | Cambio en la 0.36 |
|---|---|
| **Quemadura y veneno** quitaban el 3 % de la vida máxima cada 0,5 s (6 %/s), sin contar la armadura y sin usar el daño de cada enemigo. Era el 85-90 % del daño que recibían las clases cuerpo a cuerpo en la Ciénaga y el Cráter. El Guerrero, el tanque, caía en 7 de 8 expediciones del Cráter. Una trampa de veneno de 6 s quitaba el 36 % de la vida | 1,2 % por tick (`BURN_PCT`), y la defensa física la reduce como reduce los golpes: × 75 / (75 + Defensa). Ahora el Guerrero completa el Cráter 8 de 8 |
| **Asesino:** a un objetivo hacía más del doble que el Guerrero y un 57 % más que el Arquero (nivel 10). Además limpiaba los pisos un 35 % más rápido | Doble tajo: 60 % → 52 % del Ataque por golpe |
| **Arquero:** la clase de daño que menos hacía, y sin ataque en área | Flecha: 100 % → 115 % |
| **Guerrero:** muy por detrás al subir de nivel; tardaba 2-3 veces más que los demás con los jefes | Espadazo: 125 % → 140 %. Ataque por nivel: 1,2 → 1,4 |
| Velocidad (pedido) | Las clases, un 15 % más lentas; los enemigos y aliados, un 10 % (`CONFIG.ENEMY_SPEED`) |

## Resultado (después)

Daño por segundo contra **un objetivo**:

| Clase | Nv 5 | Nv 10 | Nv 15 | Nv 20 |
|---|---:|---:|---:|---:|
| Guerrero | 18,8 | 25,7 | 30,9 | 37,1 |
| Arquero | 21,3 | 31,9 | 40,1 | 48,8 |
| Mago | 24,0 | 34,5 | 44,2 | 52,8 |
| Asesino | 27,9 | 38,0 | 52,0 | 63,8 |

- A nivel 10, la clase que más daño hace dobla menos a la que menos: de 2,17× a 1,48×.
- El Guerrero es el tanque y sigue el último, pero queda a un 70 % del resto.
- Contra un **grupo de 4**, a nivel 15: Guerrero 127, Asesino 118, Mago 80 y Arquero 41. El Arquero es especialista en un objetivo; su flechazo cargado y su alcance lo compensan contra jefes.

Expediciones completadas: **155 de 160** (antes 141), con 1 caída (antes 18).
- Las que faltan: 4 en la Gruta y 1 caída del Asesino en el Cráter.
- **Las 4 de la Gruta** son un límite del bot. A veces no consigue que la Reina Geoda choque contra las rocas y se queda sin acabarla. No es un problema de la clase.
- **Jefe:** Mago 10-20 s, Arquero 9-18 s, Asesino 10-16 s, Guerrero 14-29 s.
- **Tiempo por piso:** Asesino unos 26-31 s; los demás 31-50 s. El Asesino conserva la ventaja de su velocidad, que es su identidad.

## Informe

- **Panel:** «Balance de clases», con gráficos de antes y después, en los artefactos de Claude.
- **Datos completos:** salen de `tools/balance-sim.mjs`.

## Límites

- **El bot juega bien pero no perfecto:**
  - esquiva peor que una persona;
  - no recoge cofres ni objetos a propósito;
  - no usa semillas ni tónicos.
- **El daño recibido por las clases cuerpo a cuerpo está algo exagerado** frente a un jugador que se mueve más.
- **Cada clase solo tiene su básico y una habilidad,** las que hay ahora en el juego. Cuando lleguen las demás conviene volver a simular.
- **No se simula el cooperativo.** El reparto por número de jugadores (`COOP_SCALING`) no cambia.

## Cambios de la 0.38 (sin volver a simular)

- **Velocidad:**
  - las clases, un 20 % más lentas que en la 0.36 (Guerrero 102, Arquero 118, Mago 99, Asesino 130; tope 138);
  - los enemigos y los aliados, un 8 % más (`CONFIG.ENEMY_SPEED` 0,83);
  - los proyectiles y los ataques enemigos van igual que antes, así que solo andando cuesta más esquivar y la esquiva vuelve a hacer falta.
- **Gruta de Cuarzo:** `hpMul: 3` en `DUNGEONS`. Triplica la vida de sus enemigos, la de los esbirros que invoca el jefe y la de la Reina Geoda. Se aplica igual en el servidor (`Expedition`).
- **Pendiente:** volver a ejecutar `tools/balance-sim.mjs`. Con el triple de vida, la Gruta será bastante más larga, sobre todo la Reina Geoda, que puede necesitar más de una ronda de choques con las rocas.
