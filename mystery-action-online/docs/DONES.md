# Dones de expedición

**Cuándo hay oferta:** al llegar a cada piso nuevo (desde el 2) y al punto de control se elige **1 de 3 dones**.
- Se elige con las teclas **1 · 2 · 3** o con clic. El juego no se pausa, porque en cooperativo los demás siguen jugando.
- Mientras la oferta está en pantalla, las teclas 1-3 eligen el don en lugar de dar órdenes a los compañeros.

**Cuánto duran:** los dones solo valen para esa expedición. Al volver a la aldea, por cualquier motivo, se pierden. El nivel, los movimientos y la evolución se conservan como siempre.

**Mejorar un don:** si vuelve a salir uno que ya tienes, elegirlo lo mejora hasta su máximo. Si no eliges, la oferta espera y se acumulan como mucho 3.

| Don | Efecto por nivel | Máx. |
|---|---|---|
| Furia | +15 % de daño | 3 |
| Coraza | +20 % de PS máximos | 3 |
| Celeridad | +10 % de velocidad | 3 |
| Recarga | Movimientos un 15 % más rápidos de recargar | 3 |
| Vigor | +35 % de energía por segundo | 3 |
| Sed | Recuperas el 5 % del daño que haces | 3 |
| Golpe certero | 12 % de crítico (×1,8) | 3 |
| Rebote | El ataque básico salta a 1 enemigo cercano más (40 % del daño) | 3 |
| Onda de esquiva | Al esquivar, onda que empuja y daña | 3 |
| Pies ligeros | +1 carga de esquiva | 2 |
| Segundo aliento | Una vez por piso, bajo el 25 % de PS recuperas el 35 % (nivel 2: 60 %) | 2 |
| Espinas | Quien te golpea cuerpo a cuerpo recibe el 25 % del daño | 3 |
| Estallido | Los enemigos que derrotas explotan | 3 |

## Cómo está hecho

- **Reglas compartidas:** `BOONS` y `Boons` en el prototipo, dentro del núcleo compartido. Son las mismas en solitario y en el servidor.
- **En cooperativo y con cuenta:** el servidor (`Expedition.offerBoons` y `pickBoon`) hace a **cada jugador su propia oferta**. Solo acepta un don de esa oferta y lo aplica a ese jugador.
  - El servidor rechaza un id que no se le ofreció, uno inventado o una segunda elección.
  - Al cambiar de piso o al reconectar, el servidor reenvía la oferta pendiente y los dones ya elegidos.
  - Los dones no se guardan nunca en el perfil.
- **Aleatoriedad propia:** las ofertas usan su propio generador aleatorio, así que no alteran el resto de la simulación.
- **Pruebas:**
  - `tests/boons.test.mjs`: reglas, efectos en combate y validación del servidor.
  - `tests/colyseus/browser_combat_e2e.py`: 4 navegadores, cada uno con su oferta, eligiendo con tecla y con clic.
- **Pendiente de ajustar jugando:** los valores son un primer ajuste.
