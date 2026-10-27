# Mazmorras con propósito (versión 0.39, etapa 1: Bosque)

El generador `FloorGen` no se ha sustituido. Después de excavar salas y pasillos, `DungeonPlan` da un papel a algunas salas y aplica una plantilla de `Prefabs`. Usa su propia secuencia aleatoria (sal `0xD1C3`), así que los demás biomas generan exactamente los mismos pisos que antes. Todo está en la sección 18b del prototipo, dentro del núcleo compartido con el servidor.

## Piezas

| Pieza | Qué hace |
|---|---|
| `DungeonPlan` | Tabla de papeles por bioma (`ROLES`: piso mínimo, probabilidad, máximo) y minijefes (`MINI`). Etapa 1: solo `forest`. |
| `Prefabs` | Plantillas de sala. Ponen sus premios en **nichos** excavados en la roca junto a la sala, así el camino principal nunca depende de un mecanismo. Si no caben, se deshacen. |
| `LORE` | Textos del escenario por bioma (7 en el Bosque). |
| `MechSolver` | Resolutor: recorre palancas, roturas, placas y rejas fijadas. Comprueba que la escalera se alcanza sin mecanismos, que todo premio se alcanza en solitario y que no hay bloqueos permanentes. |
| `Mechs` | Estado en juego: placas, palancas, rejas, puentes, rompibles, paredes falsas, pinchos, zonas de veneno, emboscadas y altares. Lo usan el navegador sin red y el servidor. `serialize()` / `apply()` para la red. |
| `MechArt` | Solo cliente: dibujo (suelo y sprites ordenados), luces, sonidos y avisos. |

## Colisiones

- Rejas y rompibles: capa `blk` del mundo.
- Puentes: capa nueva `pass`, que deja cruzar el agua.
- Paredes falsas: casillas `T.SECRET` que pasan a suelo al romperse.

El dibujo nunca decide una colisión.

## Plantillas del Bosque

| Plantilla | Papel | Mecanismo | Premio |
|---|---|---|---|
| `raices_tiempo` | Puzle | Dos placas de tiempo (6 s) → raíces que se quedan abiertas | Cofre de plata en un nicho |
| `palanca_puente` | Puzle | Palanca → puente de troncos sobre el agua del nicho | Cofre de plata |
| `muro_agrietado` | Secreto | Pared falsa (2 golpes) | Cofre de plata o raro |
| `raices_rompibles` | Rompible | Raíces con 4 PS | Cofre |
| `peso_compartido` | Grupo | Dos placas de peso a la vez, o (en solitario) raíces de 6 PS + palanca | Cofre de plata |
| `raices_punzantes` | Trampa | Pinchos en dos filas (10 % de PS, también a enemigos); una palanca los para | — |
| `esporas` | Trampa | Zona de veneno; se acaba al romper la seta | Cofre dentro de la nube |
| `estela` | Historia | Texto del escenario | — |
| `altar_savia` | Evento | Una vez por jugador: −20 % de PS, +20 % de daño en el piso | — |

Además hay tres papeles sin plantilla:

- **Emboscada:** las salidas se cierran y aparece una oleada.
- **Élite:** un élite, dos guardias y un cofre de plata.
- **Descanso:** una hoguera.

El minijefe, el Zarzal Madre (×3 PS), está en el piso 4 de 5. Su cofre raro aparece al vencerlo.

## En línea

- El servidor (`Expedition`) crea `Mechs` en cada piso y los golpes llegan por `g.onCombatArea` / `g.onShotMove`.
- El estado viaja en `ExpeditionState.mech`. El cliente lo aplica con `Mechs.apply` y obtiene los mismos bloqueos.
- El cofre del minijefe no aparece en el estado hasta que cae.

## Pruebas

- `tests/dungeon-mechs.test.mjs` (15 pruebas):
  - pisos válidos en 750 combinaciones y deterministas;
  - todas las plantillas y papeles aparecen;
  - el resolutor detecta premios inalcanzables;
  - cada mecanismo en ejecución;
  - la red reproduce los bloqueos;
  - servidor: golpe real, minijefe, altar.
- `tests/e2e/dungeon_ch1.py`: en el navegador, el héroe juega cada plantilla andando con sus colisiones reales y golpeando con su ataque básico. También comprueba que el piso es idéntico en el navegador y en Node (huella de 120 pisos, tras calentar el JIT).

## Fallos encontrados y corregidos al probar

- **Ids repetidos:** el contador de ids de mecanismo vivía en una copia de `ctx`.
- **Resolutor:** confundía dos objetivos con el mismo nombre y aceptaba un cofre encerrado si otro cofre era alcanzable.
- **Cámara del tesoro:** el resolutor no conocía la puerta con llave y rechazaba los pisos que la tenían, así que el Bosque casi nunca tenía cámara del tesoro.
- **Barajado no reproducible:** `[...].sort(() => rnd() - .5)` daba resultados distintos según el nivel de optimización de V8. Ahora es un barajado propio.
- **Pared falsa:** se convertía en la casilla equivocada cuando el suelo del bioma es la casilla 0.

## Pendiente

- Los otros siete biomas: tablas, plantillas y textos.
- Cristales que transmiten energía, plataformas móviles y derrumbes.
- Rejas de hierro en biomas de piedra.
- Secuencias de placas en una plantilla (la lógica `seq` ya está programada).
- Revisar en el balance cuántos cofres de más dan las salas con propósito.
