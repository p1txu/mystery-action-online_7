# Persistencia del progreso (versión 0.42)

Este documento explica qué se guarda, dónde, cuándo y cómo se evita que una recompensa se dé dos veces, en solitario y en cooperativo en línea. También recoge las migraciones del formato de datos.

## 1. Lo que había y se conserva

- **El mismo formato de perfil en todas partes.** Lo validan y reparan `Save.sanitize` en el navegador y en el servidor. Nada llega del cliente sin pasar por él.
- **En línea:**
  - un perfil por cuenta en la base de datos (SQLite por defecto; PostgreSQL para varios procesos), con número de versión y escrituras en transacción;
  - las operaciones de la aldea son reglas del servidor (`rules.js`);
  - las recompensas de expedición se guardan en la tabla `rewards` con la clave única (expedición, cuenta).
- **Sin conexión:**
  - `localStorage` con suma de comprobación (detecta daños, no trampas) y copia de seguridad en cada vuelta a la aldea;
  - exportar e importar como texto.

No se ha añadido ningún sistema de almacenamiento nuevo: son tablas nuevas en la misma base de datos y campos nuevos en el mismo perfil.

## 2. Perfil individual (formato 7)

| Qué | Campo | Notas |
|---|---|---|
| Clase | `species` | Las estadísticas se calculan siempre a partir de clase, nivel y equipo (`finalStats`): no se guardan, así que no se pueden falsear |
| Nivel y experiencia | `prog.level`, `prog.exp` | La experiencia se limita a la que cabe en el nivel |
| Habilidades | `prog.known`, `prog.equipped` | Solo las de su clase y su nivel |
| Inventario, oro y equipo | `inv` (con `uid` únicos), `bank`, `equip` | Pilas con su tope, equipo compatible con la clase |
| Misiones en curso | `jobs` (aceptadas y cumplidas), `board` | |
| Misiones completadas | **`log.jobs`** (nuevo) y `delivered` | Las últimas 100 entregadas: id, tipo, mazmorra, estrellas y fecha |
| Reputación | `points` → rango | La reputación del gremio es el rango. La ficha del servidor la muestra como `reputation` |
| Reliquias | **`codex.relics`** (nuevo) | Objetos épicos, legendarios o únicos que ha tenido alguna vez. El registro solo crece |
| Secretos descubiertos | **`codex.lore`**, **`codex.secrets`** (nuevos) | Textos del escenario leídos y salas secretas encontradas («mazmorra:plantilla») |
| Desbloqueos narrativos y finales | **`story.flags`**, **`story.endings`** (nuevos) | Llegada, mercader y tablón. Los finales aún no existen en el juego: el campo se guarda y se valida desde ya |
| Campaña | `cleared`, `bosses` (victorias y trofeos), `arrived` | La ficha muestra también la siguiente mazmorra |

Todo id desconocido se descarta al validar, y las listas tienen tope.

## 3. Migraciones del formato

`SAVE_MIGRATIONS[n]` convierte una partida de la versión n en la n+1. `Save.migrate` las aplica en orden y `Save.sanitize` las usa siempre, así que da igual por dónde llegue la partida.

| Versión | Cambio | Cómo se migra |
|---|---|---|
| 1-5 | Criaturas | **No compatibles** con las clases. No se migran ni se borran: en el servidor, si el jugador elige clase, el perfil antiguo se guarda entero en el registro (`profile_events`, tipo `reset-legacy`) |
| 6 | Clases | — |
| **7 (0.42)** | Registro: códice, misiones completadas e historia | Se añaden `codex`, `log` y `story`. Las reliquias que ya lleva y las banderas que ya ha vivido se apuntan. No se quita nada |
| **8 (0.43)** | Gremio, aldea y eventos regionales ([CIUDAD.md](CIUDAD.md)) | Se añaden `guild` (recompensas únicas cobradas y título), `town` (mejoras) y `events`. La reputación sigue siendo `points`. Los guardianes ya vencidos se apuntan como cobrados, así que no dan reputación otra vez |

**Sin destruir nada:**
- **En el servidor:** al leer un perfil antiguo se migra y se escribe con versión nueva (origen `migration`). El original queda entero en `profile_events` (tipo `migration`, con `from`, `to` y `original`). Si dos procesos lo migran a la vez, gana el primero y el otro lee el resultado.
- **Sin conexión:** antes de sobrescribir, el guardado original se copia una vez en `mystery-action-save-v1-v6`. El juego avisa: «Partida actualizada al formato nuevo (versión 6 → 7)».
- **Partida de una versión más nueva:** un juego antiguo no la carga, así que no la puede estropear.
- **Base de datos:** las tablas nuevas se crean solas al arrancar (SQLite) o con `db/migrations/003_expeditions.sql` (PostgreSQL). Son idempotentes.
- **Punto de control de la 0.41 (`resume`):** se conserva en el perfil, pero ya no se usa. Lo sustituye el estado de expedición.

## 4. Estado de expedición (aparte del perfil)

**Tabla `expeditions`.** Hay una fila por expedición:
- `id`: el mismo que la clave de `rewards`;
- `dungeon`;
- `status`: `active`, `suspended` o `ended`;
- `seq`: crece con cada guardado; una escritura antigua que llegue tarde no pisa a una nueva;
- `state`: la instantánea, en JSON.

La tabla `expedition_members` dice quién estaba.

**Instantánea (`Expedition.snapshot`).**
- Guarda solo lo que no se regenera con la semilla:

| Parte | Contenido |
|---|---|
| Expedición | id, semilla, paso (piso) y tamaño del piso |
| Habitaciones | salas exploradas por cada uno |
| Enemigos | vencidos (índice de aparición; los extra del cooperativo también) |
| Jefes | jefe y minijefe derrotados |
| Mecanismos | `Mechs.serialize` |
| Cofres y suelo | cofres abiertos, objetos del suelo con su dueño, puertas abiertas, portal y cofre del jefe |
| Objetivos | progreso de las misiones (va en la copia del perfil de cada uno) |

- **Por jugador:**
  - copia del perfil con lo ganado hasta ahí, mochila y equipo;
  - monedas de la expedición, dones, PS y energía;
  - el resultado que se le guardaría si la expedición se cerrara en ese momento.
- El piso se regenera idéntico (probado: mismas casillas), así que la decoración no se guarda.

**Momento seguro para reanudar.**
- **Cuándo se guarda:** al llegar a cada piso (también al punto de control), al vencer al jefe o al minijefe, al cumplir un objetivo de misión y en el cierre ordenado del servidor.
- **Al reanudar:**
  - se vuelve al principio de ese piso, con su estado;
  - lo que pasó después del último punto seguro (enemigos, cofres, botín) se deshace a la vez para todos y en el perfil, así que no hay duplicados.
- **Confirmación:** el aviso «Progreso guardado» solo sale cuando la base de datos lo confirma. Si falla tras tres reintentos (0,3, 1 y 3 s), sale el aviso «No se ha podido guardar el progreso ahora; se volverá a intentar en el siguiente punto seguro».

**Expedición pendiente.** Una cuenta tiene una expedición pendiente si está en `expeditions` y aún no tiene fila en `rewards`.
- **Aldea bloqueada:** las operaciones de la aldea devuelven 423 `PENDING_EXPEDITION`, porque vender lo que la expedición aún lleva duplicaría oro u objetos. El menú en línea lo explica.
- **Continuar:**
  - si todos los de la sala tienen pendiente la misma expedición de la mazmorra elegida, la sala ofrece «Continuar la expedición interrumpida», ya activado;
  - el anfitrión puede desactivarlo; si entra alguien que no estaba, se desactiva solo;
  - en solitario y en grupos persistentes se continúa automáticamente;
  - es la **misma** expedición (mismo id), así que la clave de recompensas sigue siendo única;
  - quien estaba y no ha venido: se le cierra conservando lo conseguido.
- **Cerrarla** desde el menú en línea (`POST /api/expedition/close`): se guarda el resultado «interrumpida» del último punto seguro, con las monedas cobradas y sin pérdidas.
- **Empezar otra expedición:** la pendiente se cierra antes, igual que al cerrarla a mano, y se avisa.
- **Caducidad:** a los 7 días se cierra sola de la misma forma.

## 5. Recompensas seguras

| Riesgo | Protección |
|---|---|
| Volver a entrar en una habitación | Las salas exploradas, los cofres abiertos y los enemigos vencidos se guardan en la instantánea, así que tampoco vuelven al reanudar. Las misiones de exploración no cuentan dos veces |
| Reconectarse durante la entrega | La sala guarda el resultado (`results`) y lo reenvía igual al volver (mismo `expeditionId`). El cliente no lo muestra dos veces |
| Repetir una petición | Resultados: clave (expedición, cuenta) en `rewards`. Operaciones de la aldea: `opId` único por petición (tabla `profile_ops`), y repetirla devuelve lo mismo con `duplicate: true`. Además, la versión esperada del perfil: una petición con versión antigua da 409 |
| Matar varias veces al mismo jefe en una transición | `netDone` en el enemigo: la experiencia, el botín, el portal y la victoria se dan una vez. El trofeo, una vez por jugador y expedición. Probado con golpes mortales de dos jugadores durante el rugido de fase |
| Completar una misión a la vez que otros | Las misiones son de cada perfil: cada uno avanza la suya con lo que hace él. Se entregan en la aldea con regla del servidor, `opId` y versión |
| Entrega simultánea | Transacción con bloqueo de la fila del perfil y comprobación de `rewards` dentro. Cerrar desde fuera una expedición que lleva una sala viva no hace nada: la cierra la sala con su resultado real |
| Caída del servidor durante la entrega | Primero se escriben los resultados de todos en la expedición (`ended`) y después cada perfil. Al arrancar, o cuando el jugador vuelve, se aplican los que falten, una vez |
| El cliente decide el oro, la EXP o el equipo | No hay ninguna ruta para eso. Todo lo calcula el servidor |

## 6. Guardado y recuperación en el cliente

- **Resultado de la expedición:**
  - con guardado confirmado: «El servidor ha guardado vuestras recompensas»;
  - si la base de datos falla: «Aún no se ha podido guardar el resultado», y no se adopta el perfil nuevo;
  - la sala lo reintenta cada 10 s; cuando lo consigue, el juego avisa con «Resultado guardado en tu cuenta»;
  - si la sala se cierra antes, lo aplica el servidor al arrancar o cuando el jugador vuelve.
- **Operaciones de la aldea:**
  - el perfil solo cambia en pantalla con la respuesta del servidor;
  - si la red falla, se reintenta 3 veces con el **mismo** `opId`, así que es seguro;
  - si aun así no se puede, se muestra el error y no se da nada por hecho.
- **Sin conexión:**
  - `localStorage` con suma de comprobación y copia de seguridad, más exportar e importar;
  - si cierras a mitad de expedición, cuenta como retirada al volver (como antes);
  - **no hay protección contra quien edite su propio navegador:** la suma de comprobación solo detecta daños. El progreso en línea no se puede subir desde una partida local.

## 7. Pruebas

| Prueba | Qué comprueba |
|---|---|
| `tests/expedition-state.test.mjs` (11) | Formato 7 y migración 6 → 7 (idempotente; versión más nueva y criaturas rechazadas); validación del registro; misión entregada al registro una vez; códice en el servidor (texto, sala secreta, reliquia); instantánea y reanudación (mismo id, semilla y casillas; enemigos, cofres, objetos, monedas, mochila y dones); salas exploradas; jefe derrotado al reanudar; **jefe muerto varias veces durante el rugido de fase**; resultado precalculado que no toca la expedición; reanudar con menos jugadores |
| `tests/expedition-service.test.mjs` (10, en SQLite y en memoria) | Migración al leer con el original archivado; perfil de criaturas archivado; aldea bloqueada con expedición pendiente (**intento de vender lo que la expedición lleva**); cierre una vez aunque se pida a la vez; caducidad; **resultados que quedaron sin guardar aplicados al arrancar, una vez** |
| `tests/store.test.mjs` | En SQLite, memoria y PostgreSQL: `opId` repetido y a la vez; instantáneas en orden; pendientes |
| `tests/colyseus/recovery.test.mjs` (6, Colyseus real y SQLite) | **Caída de golpe** y continuación (misma expedición, sin los vencidos, cobro una vez); **cierre ordenado** (cerrar por la API y continuar en solitario); empezar otra con una pendiente; **reconexión durante la entrega** y entregas simultáneas o repetidas; **la base de datos falla al guardar** (el cliente no lo da por guardado; se aplica al reiniciar, una vez); **intentos de duplicar oro** con la API |
| `tests/colyseus/browser_campaign_e2e.py` (dos navegadores) | Aviso de expedición interrumpida; «Continuar» en la sala; misma expedición en el piso 2; resultado no confirmado mientras falla la base de datos y confirmación cuando vuelve |
| `tests/e2e/save_offline.py` (navegador, sin conexión) | Migración 6 → 7 con copia del original; copia de seguridad; registro local |
