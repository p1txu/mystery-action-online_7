# Jefes con mecánicas propias (BossKit, versión 0.40)

Todos los jefes nuevos comparten una base: `BossKit`, en la sección 13 del prototipo, dentro del núcleo compartido con el servidor. Cada jefe es una **definición** con sus datos, ataques y pequeños ganchos. No es un script aparte: la máquina de estados, las fases, los avisos, la vulnerabilidad, el escalado, la red y las recompensas son comunes.

## Máquina de estados

```
idle ──(elige ataque)──▶ aviso (windup) ──▶ acción ──▶ recuperación ──▶ idle
  ▲                                     │
  │                         choque / mecanismo
  │                                     ▼
  └──────────── aturdido (stun) · derribado (vuln) · transición de fase (rugido)
```

| Pieza común | Qué hace |
|---|---|
| Fases | Por umbral de vida (en orden) o por evento (`BossKit.event`). Cada una entra **una sola vez**, interrumpe el ataque en curso y puede tener escena y pausa para todos. Nunca entra durante una ventana de vulnerabilidad: espera a que termine. |
| Avisos | Todo ataque avisa al menos `BOSS_MIN_TELE` = 0,6 s y dibuja su telegráfico (círculo, carril, zona). La dirección se fija en el último tramo del aviso (la carga de Gromgar, con ≥ 0,29 s de margen). |
| Recuperación | Tras cada ataque el jefe se queda quieto un momento: hay hueco para golpear. |
| Aturdido / derribado | `BossKit.stun` y `BossKit.vulnerable(t, motivo, −defensa)`. La barra del jefe y un aviso dicen **por qué** («3 choques contra las rocas»). |
| Resistencias | `kind.resist = { fis, mag }`, aplicadas en `Combat.hit` junto con la vulnerabilidad. |
| Escalado | Vida ×1 / 1,6 / 2,1 / 2,6 y daño ×1 / 1,05 / 1,1 / 1,15 para 1-4 jugadores. Los demás guardianes llegan a ×3,5 de vida. El grupo recibe patrones y oportunidades nuevas en lugar de más vida. |
| Sin atascos | Vigilancia: si quiere moverse y no avanza, se aparta hacia el centro de su sala. Tras un choque siempre se separa del obstáculo. |
| Muerte | `BossKit.onDeath` cancela sus zonas pendientes, sus disparos, las rocas que caen y las cadenas de ataques. |
| Red | El servidor manda `boss.bk` («fase\|estado\|vulnerable\|choques\|necesarios\|motivo») y las rocas. El cliente pinta lo mismo. |
| Recompensas | `BossKit.grant`: la primera victoria da el trofeo único (`unique`, nunca sale en cofres). Las victorias se guardan en `save.bosses`, que se valida al cargar. Se da una vez por jugador y expedición. |
| Escenario | `BossArena`: rocas de 2×2 con colisión real (`Boulder`, también las de la Reina Geoda), caídas, roturas y desatascos. |

## Gromgar, el Quebrantamontañas (Mina Olvidada) — jefe de referencia

| Fase | Vida | Ataques | Escenario |
|---|---|---|---|
| Tanteo | 100-60 % | Golpe (círculo de 96 px, 0,95 s de aviso); roca lanzada (círculo en el suelo, 0,9 s + 0,75 s); carga (carril, 1 s) | La carga contra la pared solo lo detiene |
| Furia | 60-25 % | Lo mismo, más rápido (+15 % de daño). Embiste casi siempre a quien esté a más de 150 px | Derrumbe: 4/5/5/6 rocas (1-4 jugadores), 3 golpes de vida cada una |
| Final | < 25 % | Golpe, carga y avalancha (una piedra avisada por jugador, más dos al azar) | Rompe la mitad de las rocas (las más cercanas a él) |

- **Aturdirlo:** si la carga choca contra una roca en furia, queda aturdido 1,6 s y la roca se agrieta.
- **Derribarlo:** al 3.er choque (al 2.º en la fase final) cae al suelo 7 s con la defensa −40 %.
- **Rocas garantizadas:** si quedan pocas rocas, se desprende el techo, así que nunca se queda sin forma de derribarlo.
- **Choques de la carga:** se detectan también cuando roza y resbala, no solo cuando se bloquea del todo.
- **Pared:** la primera vez que choca contra una pared, un aviso explica que tiene que ser una roca.
- **En solitario:** basta con alejarse detrás de una roca. El jefe provoca la carga hacia ti y no hay tareas simultáneas: nunca encadena cargas.
- **En grupo:**
  - embiste al que esté más lejos, así que uno provoca y los demás golpean;
  - tras chocar contra una pared, a veces (45 %) encadena una segunda carga contra otro jugador, con 0,8 s de aviso.
- **Resistencias:** −15 % de daño físico, +15 % de daño mágico.
- **Trofeo:** Colmillo de Gromgar (accesorio épico: +6 de defensa, +3 de ataque, +5 % de defensa).

Sustituye a Picoferro como guardián de la Mina Olvidada.

## Robletón, el Guardián de Espinas (Bosque Brumoso)

Es el mismo BossKit con otro escenario. El nombre de la biblia se mantiene y «Guardián de Espinas» pasa a ser su título.

| Fase | Vida | Ataques | Escenario |
|---|---|---|---|
| Despertar | 100-65 % | Zarpazo (arco, 0,85 s); raíces en línea (6 púas avisadas, 0,9 s + escalonadas); salto (sombra en el suelo, 1,15 s) | 4/4/5/5 tocones con colisión real desde el principio |
| Savia | 65-30 % | Lo mismo. En grupo, una segunda línea de raíces hacia otro jugador | Brotan 2/2/3/3 brotes de savia: le curan (1,2 % de vida por segundo cada uno) y le protegen (−40 % de daño) mientras vivan |
| Furia | < 30 % | Raíces en abanico (3 líneas), avisos −8 %, +12 % de daño | Vuelven a brotar; si quedan menos de 2 tocones, brotan otros |

- **Enredarlo:** si su salto cae junto a un tocón, lo astilla y se le enredan las raíces: vulnerable 6 s con la defensa −35 %.
- **Cebo fiable:** si su objetivo está junto a un tocón, salta casi siempre, también de cerca. Basta con esperar al lado del tocón y apartarse cuando se fija la sombra.
- **Sin brotes:** al destruir el último brote se queda «sin savia», aturdido 2,2 s. La barra dice cuántos brotes le protegen.
- **Al morir:** los brotes mueren con él.
- **Resistencias:** −10 % de daño físico, +20 % de daño mágico (la madera arde).
- **Trofeo:** Corona de Espinas.

## Pruebas

- `tests/bosses.test.mjs` (19 pruebas, simulación real del servidor). Gromgar:
  - resistencias;
  - avisos mínimos;
  - fases una vez y en orden, aunque un golpe salte dos umbrales;
  - eventos;
  - derrumbe con colisión;
  - choques, aturdido y derribado con su motivo;
  - pared que no cuenta y sin quedarse pegado;
  - fase final;
  - muerte en mitad de un ataque;
  - trofeo una vez (y que no sale en cofres);
  - 3 minutos sin quedarse bloqueado (1 y 3 jugadores);
  - derribo en solitario con un héroe que solo se esconde (3 semillas);
  - cargas en grupo;
  - escalado;
  - estado para la red.

  Para todos los jefes: avisos y fases en orden, y trofeo único.

  Robletón:
  - tocones;
  - enredado sí o no según dónde cae;
  - brotes que curan y protegen, aturdido sin savia, brotes que mueren con él y viajan a los clientes;
  - enredado en solitario con un héroe que solo espera junto a un tocón (2 semillas), sin bloquearse.
- `tests/e2e/boss_gromgar.py`: sin red, en el navegador, Gromgar (dibujo de cada aviso, barra, escena, fotograma de 2,7 ms, muerte limpia, trofeo) y Robletón (tocones, avisos, escena de la savia, brotes, barra).
- `tests/colyseus/browser_gromgar_e2e.py`: dos navegadores contra el servidor real con 280 ms de ida y vuelta (rocas idénticas, aturdido y derribado en los dos, motivo leído por los dos, muerte en mitad de la avalancha).

## Siguientes jefes sobre la misma base

| Jefe | Mazmorra | Lo que añade a la base |
|---|---|---|
| Viuda del Estanque | Ciénaga (hoy, Ciénago) | Ilusiones (copias sin daño), zonas de veneno, niebla; piedras rúnicas (`Mechs`) que quitan su defensa |
| Coloso Forjado | Cráter (hoy, Magmatrón) | Componentes con vida propia, válvulas (`Mechs`) que enfrían, núcleo vulnerable |
| Prior Hueco, Reina del Hielo Quieto, Custodio Sin Rostro, Heraldo del Origen | Mazmorras que aún no existen | Necesitan antes su mazmorra |

## Eco de Robletón (Raíces Hondas, poscampaña, 0.44)

Es el mismo combate de Robletón (`BossKit.DEFS.ecoEspinas` copia a `espinas`) con un ataque nuevo.

- **Raíces que persiguen** (`persecucion`):
  - aviso de 0,8 s en carril;
  - después, 6 raíces seguidas, cada una avisada 0,5 s en el suelo y nacida 40 px más cerca de donde está **ahora** su objetivo (unos 80 px/s, más lento que cualquier clase);
  - en la furia sale más a menudo.
- **Igual que el original:** se le enreda contra un tocón y se le debilita rompiendo los brotes.
- **Trofeo:** Corteza del Eco (único).
- **Nivel:** 17, como la mazmorra.

**Corrección:** `BossKit.grant` y `BossKit.sanitize` buscan la definición con `BossKit.defOf(id)` (`robleton` → `espinas`). Antes, la Corona de Espinas no se entregaba nunca.
