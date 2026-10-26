# Progresión, guardianes y el Topo Mercader

## Movimientos por nivel
- Huecos de movimiento: **1** al empezar, **2** al nivel 7, **3** al 10 y **4** al 14 (`Progress.SLOT_LEVELS`).
- Los movimientos se siguen aprendiendo por nivel (tablas `learn` de cada forma); si hay un hueco libre se equipan solos.
- Al **evolucionar** se desbloquea el **movimiento definitivo** de esa forma, en su propio hueco (tecla **G**):
  - Voltaurio: Tormenta Voltaica · Magmoloso: Columna de Magma · Aurión: Puño Aural.
  - Mucho más potentes que el resto, con 16 s de recarga.
- El servidor valida el número de huecos según el nivel y rechaza equipar el definitivo en un hueco normal (`server/src/profile/rules.js`).

## Mazmorras (curva de dificultad)
| Mazmorra | Pisos | Nivel enemigos | Guardián (nivel) | Se abre al completar |
|---|---|---|---|---|
| Bosque Brumoso | 5 | 3–5 | Robletón (7) | — |
| Gruta de Cuarzo | 6 | 5–7 | Reina Geoda (9) | Bosque |
| Ciénaga Sombría (nueva) | 7 | 8–11 | Ciénago (13) | Gruta |
| Mina Olvidada (nueva) | 8 | 11–14 | Picoferro (16) | Ciénaga |
| Cráter Ceniciento | 10 | 14–18 | Magmatrón (20) | Mina |

Las partidas antiguas que ya habían completado una mazmorra la conservan abierta (`dungeonOpen`).

## Guardianes
- Sin desventaja de tipo: un ataque «poco eficaz» contra un guardián hace daño normal (los súper eficaces siguen contando).
- **Enfurecido** al bajar del 30 % de PS (`BOSS_RAGE`): pausa breve con animación y, hasta que muere, +20 % de daño y recupera sus ataques un 20 % antes. (Todos menos la Reina Geoda.)
- En cooperativo, el servidor pausa la simulación durante la animación y avisa a todos (`bossRage`).

### Reina Geoda (`GEODA`, `Geoda` en el motor)
- **60 %**: grito (pausa) y furia: +20 % daño, recargas −20 % y aprende la **Carga** (aviso de 0,55 s; la dirección se fija en el último 40 %: esquívala con la evasión cuando la franja parpadea).
- **30 %**: segundo grito y **caen rocas** del techo (4, de 2×2 casillas, con sombra de aviso; dañan al caer). Bloquean el paso y los disparos.
- Si la Carga choca con una roca, **rebota** y la agrieta (cada roca aguanta 2 choques). Al **3.er choque** queda **aturdida 8 s**: no ataca, pierde la furia y recibe un 43 % más de daño (defensa −30 %).
- Si el aturdimiento termina y sigue viva, **salta** sobre su objetivo y lo derriba de un golpe (aunque esquive). Luego vuelve la furia y caen rocas nuevas si quedan menos de 3.
- En cooperativo todo lo decide el servidor; las rocas se envían en el estado del guardián (`rocks`) y cada cliente bloquea las mismas casillas.

## Dificultad y objetos
- Gruta: nivel base 5, 6 pisos y pocos enemigos por piso (unos 3–5).
- Objetos que ocupan hueco en la mochila: alrededor de un 58 % menos por piso (menos objetos sueltos y menos botín de enemigos).
- El Bosque ya no tiene tienda dentro de la mazmorra.

## Pico Cartero (vecino de las misiones)
- Gruta de Cuarzo, piso 2: al llegar se oyen ruidos extraños (pausa; en cooperativo la pausa la marca el servidor para todos) y una flecha marca la dirección de la sala cercana donde Pico solloza.
- Al acercarte te pide que lo escoltes a la aldea. Te sigue piso a piso, es invencible y huye unas casillas cuando se le acerca un enemigo.
- Al vencer a la Reina Geoda te da las gracias y te ofrece misiones; su **tablón** aparece en la aldea a partir de entonces (antes está vacío). El servidor también exige haber completado la Gruta para aceptar misiones.
- Si la expedición fracasa, Pico vuelve a perderse: la escena se repite la próxima vez.

## El Topo Mercader (presentación de NPC)
- Al derrotar al primer guardián del Bosque por primera vez: un montículo de tierra sale de una esquina, choca con el guardián caído, el Topo rebota y habla.
- Después te sigue como acompañante (no combate ni recibe daño) hasta el teletransporte.
- Hasta entonces, el puesto de la aldea está vacío; al terminar esa expedición se abre la tienda. El servidor también lo exige para comprar, vender y fabricar con cuenta.
- En cooperativo la escena y el acompañante son visuales en cada cliente; no afectan a la simulación del servidor.
- La frase de quedarse parte de los objetos es una broma: no se quita nada.
