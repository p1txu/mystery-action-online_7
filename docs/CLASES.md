# Clases y combate (versión 0.29)

Las especies, los tipos elementales y las evoluciones se han sustituido por **cuatro clases de fantasía medieval**.
Se mantienen el movimiento, las colisiones, la cámara, las mazmorras procedurales, el inventario, el guardado,
la progresión y el cooperativo online. Todo lo que afecta al combate lo calcula el **servidor** en cooperativo.

| Clase | Rol | Arma | Recurso | Básico | Habilidad 1 (Q) |
|---|---|---|---|---|---|
| Guerrero | Tanque | Espada y escudo | Energía | Espadazo | Golpetazo de escudo |
| Arquero | DPS a distancia | Arco | Energía | Flecha | Flechazo cargado |
| Mago | Daño mágico explosivo | Bastón | Maná | Orbe arcano | Lluvia de fuego |
| Asesino | DPS rápido · sangrado | Dos dagas | Energía | Doble tajo | Tajo en X |

La clase se elige al empezar una partida y es definitiva. **Las clases no evolucionan.**

## 1. Atributos

Hay un único sistema de atributos para todas las clases (`CLASS_STATS` en la sección 8 del prototipo).
Para no duplicar atributos, se han reutilizado las claves que ya existían y que usan el equipo, las pociones y el servidor:

| Clave interna | Atributo | Antes era | Conversión |
|---|---|---|---|
| `hp` | Vida máxima | PS | igual |
| `mp` | Maná (Mago) o energía (resto) | energía fija de 100 (`CONFIG.ENERGY_MAX`) | ahora sale de la clase y del nivel (`Player.maxEnergy`) |
| `atk` | Ataque físico | Ataque | igual |
| `spa` | Poder mágico | Ataque especial | mismo campo, nuevo nombre |
| `def` | Defensa física | Defensa | igual |
| `spd` | Resistencia mágica | Defensa especial | mismo campo, nuevo nombre |
| `spe` | Velocidad de movimiento (unidades de mundo/s) | índice de velocidad | ahora es directamente la velocidad (`moveSpeed = spe × modificadores`) |
| `aspd` | Velocidad de ataque (ataques básicos por segundo) | — (cargas del básico) | nuevo; el básico ya no gasta cargas: espera `1 / aspd` s |
| `crit` | Probabilidad de crítico (0–1) | — | nuevo |
| `critMul` | Daño crítico (1,5 = 150 %) | — | nuevo |
| `range` | Alcance del ataque básico | — | nuevo (informativo; cada básico usa el suyo) |

### Valores de nivel 1 (los pedidos)

| Atributo | Guerrero | Arquero | Mago | Asesino |
|---|---:|---:|---:|---:|
| Vida máxima | 180 | 105 | 85 | 100 |
| Maná / energía | 60 | 80 | 140 | 70 |
| Ataque físico | 12 | 14 | 5 | 11 |
| Poder mágico | 0 | 0 | 18 | 0 |
| Defensa física | 16 | 6 | 4 | 5 |
| Resistencia mágica | 10 | 5 | 10 | 5 |
| Velocidad de movimiento | 150 | 175 | 145 | 190 |
| Velocidad de ataque | 0,85/s | 1/s | 0,75/s | 1,5/s |
| Probabilidad crítica | 5 % | 10 % | 5 % | 15 % |
| Daño crítico | 150 % | 175 % | 150 % | 175 % |
| Alcance del básico | 52 | 300 | 340 | 46 |
| Regeneración de maná/energía | 3/s | 3,5/s | 5/s | 3,5/s |

### Crecimiento por nivel

`valor(L) = base + crecimiento × (L − 1)`. Velocidad de ataque, crítico y daño crítico no se redondean; el resto sí.

| Por nivel | hp | mp | atk | spa | def | spd | spe | aspd | crit | critMul |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Guerrero | 16 | 2 | 1,2 | 0 | 1,8 | 1,1 | 0 | 0,004 | 0,001 | 0 |
| Arquero | 8 | 3 | 1,7 | 0 | 0,5 | 0,5 | 1 | 0,012 | 0,004 | 0,01 |
| Mago | 6 | 7 | 0,2 | 2,2 | 0,4 | 1 | 0 | 0,006 | 0,001 | 0 |
| Asesino | 9 | 2 | 1,5 | 0 | 0,5 | 0,5 | 1,2 | 0,015 | 0,005 | 0,01 |

**Equipo:** `finalStats` suma el equipo después (plano y porcentaje) sobre una copia. La base de la clase nunca se modifica.

**Huecos de equipo (0.29):** arma, armadura, casco, guantes, botas y accesorio. Cada pieza de clase indica `classes` y `req` (nivel mínimo); `canEquip` lo comprueba en el juego y en el servidor. Los antiguos pañuelos, brazaletes y talismanes son ahora accesorios. Detalles en `docs/MAZMORRAS_ENEMIGOS_BOTIN.md`.

## 2. Fórmulas de daño (`Combat.calc`, sección 9)

```
Héroe → cualquiera:   daño = mult × A / (1 + D / 75) × modificadores
Criatura → héroe:     daño = potencia × A × 0,035 / (1 + D / 36) × modificadores
Criatura → criatura:  daño = potencia × A × 0,035 / (1 + D / 60) × modificadores
```

- `A` es el Ataque físico o el Poder mágico del atacante, según la categoría del golpe (físico o mágico).
- `D` es la Defensa física o la Resistencia mágica del objetivo.
- Las constantes están en `DMG = { HERO_DEF: 75, CREATURE_K: .035, VS_HERO_DEF: 36, VS_CREATURE_DEF: 60 }`.
- Modificadores: dones, escalado cooperativo, furia de los guardianes y `mul` de cada golpe.
- **Crítico:** solo los héroes. La probabilidad es `crit` (+10 % por nivel del don Golpe certero) y el daño se multiplica por `critMul`. El sangrado y los daños por tiempo no son críticos.
- Se redondea al entero más cercano, con un mínimo de 1.
- **Sin tipos:** `typeEff()` siempre devuelve 1. Los tipos de las criaturas solo dan color.
- **Aturdimiento:** cada enemigo tiene su resistencia, que ya existía. Normal ×1, gólems ×0,5, guardianes ×0,15.

### Calibración

Simulación con un héroe de nivel 1 contra enemigos del Bosque de nivel 3 (sin críticos):

| | Golpes para vencer a un Mordisquín (50 PS) | Tiempo | Mordiscos que aguanta |
|---|---:|---:|---:|
| Guerrero | 5 | 4,7 s | 26 |
| Arquero | 5 | 4,0 s | 14 |
| Mago | 4 | 4,0 s | 10 |
| Asesino | 5 dobles tajos | 2,7 s | 12 |

## 3. Ataques y habilidades

Están en la sección 12 bis del prototipo, en `MOVES`, y se definen con datos.
- Cada entrada indica `cls`, `cat` (físico o mágico), `mult`, `cost`, `cd`, `range`, el área (`arc` o `radius`) y sus efectos (`stun`, `slow`, `bleed`, `charge`…).
- Para añadir una habilidad se crea otra entrada y se añade a `learn` de su clase con su nivel.
- La primera habilidad está en el nivel 1. Los huecos de los niveles 7, 10 y 14 y el definitivo del nivel 15 ya existen; sus habilidades llegarán más adelante.

| Movimiento | Datos |
|---|---|
| **Espadazo** (Guerrero, básico) | Arco frontal de 110°, alcance 52. 125 % del Ataque físico (golpe lento: 0,85/s). Empuje pequeño. |
| **Golpetazo de escudo** | Preparación de 0,18 s, golpe y recuperación de 0,25 s; durante ese tiempo se mueve al 35 %. Arco de 120°, alcance 62. 100 % del Ataque físico, **aturde 1 s** e interrumpe ataques. 15 de energía, 6 s de enfriamiento. **No atraviesa muros** (línea de visión). |
| **Flecha** (Arquero, básico) | Proyectil hacia el cursor: velocidad 560, alcance 300. 100 % del Ataque físico. Se puede disparar mientras se camina. |
| **Flechazo cargado** | Mantén Q para tensar: cuesta 15 de energía al empezar y te mueves al 55 %. Al soltar dispara hacia **donde esté el cursor en ese momento**. Potencia = 150 % + 100 % × carga, con carga = min(1, tiempo / 1,5 s). Proyectil de velocidad 760 y alcance 560. El enfriamiento de 5 s empieza al soltar. Si te aturden se pierde la carga. A los 4 s se suelta sola. |
| **Orbe arcano** (Mago, básico) | Proyectil mágico hacia el cursor: velocidad 380, alcance 340. 100 % del Poder mágico contra la Resistencia mágica. |
| **Lluvia de fuego** | Se lanza sobre el **punto del cursor en coordenadas de mundo**, hasta 450 de distancia; si hay un muro, cae en el último suelo libre antes de él. Tras 0,8 s de aviso caen **12 bolas de fuego pequeñas**, una cada 0,15 s, repartidas por un radio de 90. Cada bola explota en 36 de radio y hace 70 % del Poder mágico. **Cada bola es un golpe aparte**, así que el mismo enemigo puede recibir varias: unas 4 en el centro (≈ 290 %) y unas 3 a 60 del centro. 30 de maná, 8 s. Los puntos de caída siguen un patrón fijo (espiral áurea girada según el punto marcado), así que el servidor y todos los clientes los ven iguales. |
| **Doble tajo** (Asesino, básico) | Dos tajos con 0,15 s de separación. Cada uno: arco de 100°, alcance 46, 60 % del Ataque físico. Cada tajo comprueba su impacto por separado: si el enemigo sale del alcance, el segundo falla. Ritmo de 1,5 por segundo; manteniendo el botón se encadenan. |
| **Tajo en X** | Arco de 130°, alcance 72, hacia el cursor; alcanza a todos los del área. 150 % del Ataque físico, ralentiza un 30 % durante 2 s y aplica sangrado. 20 de energía, 7 s. |

### Sangrado (cálculo obligatorio)

1. **Daño básico real:** el daño de los dos tajos del Asesino contra ese objetivo, con sus estadísticas y modificadores, sin críticos. Es `round(calc(tajo)) × 2`.
2. **Tick:** `ceil(daño básico × 0,10)`.
3. **Duración:** 4 ticks, uno por segundo.
   - `Actor.tickCommon` resta el tiempo real y aplica cada tick cuando el contador llega a 0.
   - Aunque haya varios pasos de simulación por segundo, nunca se aplican de más. Probado: exactamente 4 ticks con 1 s de separación.
4. **Reaplicar** mientras sangra **renueva la duración**: vuelve a 4 ticks.
   - El daño por tick no se acumula: se queda el mayor de los dos.
   - Probado: 2 ticks del primero + 4 del segundo = 6 en total, no 8.

## 4. Apuntado

- El cursor se convierte a coordenadas de mundo con la cámara (`Game.getAim`).
- Los ataques de dirección (básicos, Golpetazo, Flechazo, Tajo en X) apuntan hacia el cursor.
- Las habilidades sobre el suelo (`targeted`, como la Lluvia) usan el punto exacto del cursor, limitado por `groundTarget`.
- Sin ratón (teclado o mando), apunta al enemigo más cercano en la dirección en la que mira el personaje.
- En línea se envía la dirección y la distancia; el servidor reconstruye el punto con su propia posición del jugador.

## 5. Validación del servidor y red

Validación:
- **Clase:** `ProfileService.createFresh` solo acepta las cuatro clases. `Save.sanitize` borra las habilidades de otra clase, las básicas y las de un nivel no alcanzado. `Expedition` rechaza perfiles con una clase desconocida.
- **Estadísticas, daño, enfriamientos, costes, estados, muertes y recompensas:** en cooperativo los calcula `server/src/sim/Expedition.js` con el mismo núcleo (`shared/engine-core.generated.js`). El cliente solo reproduce efectos visuales: `NetPlay.localHit` no aplica daño.

Protocolo:
- **Habilidad cargada:** la acción `m` empieza a tensar y la acción `r` suelta. El tiempo de carga lo cuenta el servidor, no el cliente.
- El evento `cast` incluye `move`, la dirección y `c` (la carga del 0 al 1), para que los demás jugadores vean el disparo con su fuerza.
- El estado de cada jugador envía `basic` como el tiempo que falta para el siguiente básico.

## 6. Partidas

- **Partidas locales:** `SAVE_VERSION` es 6. Una partida de la versión con criaturas no se puede convertir: el juego avisa y hay que empezar una nueva.
- **Perfiles online antiguos:** el servidor los trata como «sin perfil». Al elegir clase se sustituyen; queda registrado como `reset-legacy`.

## 7. Archivos modificados

- `prototype/mystery-action.html` (fuente de verdad):
  - sección 8, clases;
  - Combat: `DMG`, `calc`, críticos, sangrado y línea de visión;
  - sección 12: atributos, `fmtStat` y `calcStats`;
  - 12 bis: `MOVES`;
  - `Player`: maná/energía, ritmo del básico, carga y animaciones;
  - proyectiles nuevos e iconos;
  - sprites de los héroes (`drawHero`, `drawChargeUi`);
  - UI: selección, HUD, equipo, habilidades e inventario;
  - guardado v6;
  - se han quitado los objetos y la interfaz de evolución.
- `shared/engine-core.generated.js` y `client/public/game.js`: se generan con `tools/split-prototype.mjs`, que ahora también exporta `CLASSES`, `DMG`, `fmtStat`, `groundTarget`…
- `shared/protocol.js`: acción `r`.
- `server/src/sim/Expedition.js`: acción `r`, evento `cast` con `move` y `c`, energía máxima por clase y `basic` en el estado.
- `server/src/rooms/schema.js`: `basic` pasa a ser un número decimal.
- `server/src/persistence/ProfileService.js`: perfiles antiguos, elección de clase y resumen.
- `client/src/net/lobby.js`: «Elige tu clase».
- `tools/check-server.mjs`: elige una clase al azar.
- Pruebas:
  - `tests/classes.test.mjs` (nueva) y una prueba de navegador con teclado y ratón de verdad.
  - Adaptadas: `rules`, `expedition`, `core`, `boss-rage` y `colyseus/*` (el conductor del combate suelta la carga con `r`).
  - `moves-progress.test.mjs` se ha quitado: probaba las evoluciones.

## 8. Pendiente

- Habilidades de los niveles 7, 10 y 14 y el definitivo del nivel 15. Hoy esos huecos están vacíos.
- Equilibrio:
  - Está calibrado por simulación con el Bosque a niveles 1 y 5.
  - Las mazmorras más avanzadas y los guardianes con las clases no se han jugado a mano.
  - Los compañeros reclutables siguen usando sus ataques de criatura.
- Los objetos que suben «todas las estadísticas» con un valor fijo también suman esa cifra a la velocidad, en unidades por segundo. El efecto es pequeño.
- Los sprites son originales y están dibujados por código. Se pueden mejorar con arte a mano.
