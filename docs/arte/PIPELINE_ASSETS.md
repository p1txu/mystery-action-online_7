# Pipeline de assets

- **Estado:** propuesta. Los criterios de AD-2 y AD-3 (dimensiones según cámara y resolución; tres niveles cuando estén justificados) están **aprobados**. La herramienta de animación (AD-5) y el diseño de distribución (AD-8) están **pendientes de aprobación**.
- **No se produce ningún recurso definitivo** en esta fase.
- Las mediciones citadas están en [ARQUITECTURA_ARTE.md](ARQUITECTURA_ARTE.md), sección 3.

---

## 1. Tamaños: salen de la cámara

### 1.1 Lo que muestra la pantalla

Datos del juego (`CONFIG` y `Renderer.resize`):

- la vista enseña 13 casillas de 32 unidades de alto, es decir, 416 unidades;
- **zoom** = altura CSS de la ventana / 416, limitado entre 1,1 y 3;
- **dpr** (píxeles físicos por píxel CSS) limitado a 2;
- **densidad de pantalla** = zoom × dpr, en píxeles por unidad del mundo (px/u).

| Pantalla típica | Zoom | dpr | Densidad (px/u) | Héroe de 54 u en pantalla |
|---|---|---|---|---|
| 1280×720 | 1,73 | 1 | 1,73 | ~93 px |
| 1600×900 | 2,16 | 1 | 2,16 | ~117 px |
| 1920×1080 | 2,60 | 1 | 2,60 | ~140 px |
| 2560×1440 | 3 (tope) | 1 | 3,0 | ~162 px |
| Portátil retina, o 1920×1080 al 200 % | 2,6 | 2 | 5,2 | ~280 px |

### 1.2 Cada recurso se mide en unidades del mundo

- Un recurso se define por su **tamaño en unidades del mundo** y su **ancla** (el punto que toca el suelo, normalmente los pies).
- Su tamaño en píxeles es **tamaño en unidades × densidad del nivel**.
- Así cada imagen tiene las dimensiones que necesita: un tronco, una seta y un jefe miden distinto, pero comparten densidad y, por tanto, nivel de detalle. No se impone ningún tamaño fijo.

### 1.3 Niveles de calidad: lo que dicen las pruebas

Prueba aislada: figuras de prueba en las cuatro pantallas, comparadas con un dibujo ideal mediante SSIM, donde 1 significa idéntico. Pruebas completas en [ARQUITECTURA_ARTE.md](ARQUITECTURA_ARTE.md).

| Pantalla (densidad) | Recurso a 1 px/u | a 2 | a 3 | a 4 | a 6 |
|---|---|---|---|---|---|
| 1280×720 (1,73) | 0,942 | **0,934** | 0,926 | 0,904 | 0,895 |
| 1920×1080 (2,6) | 0,851 | 0,915 | 0,918 | **0,974** | 0,924 |
| 1920×1080 a dpr 2 (5,19) | 0,855 | 0,943 | 0,960 | **0,976** | **0,976** |

**Conclusiones:**

1. Un recurso **mucho más pequeño** que la pantalla se ve peor: SSIM de unos 0,85.
2. Un recurso **mucho más grande** que la pantalla también empeora en Canvas 2D (0,895 a 720p con recursos de 6 px/u): al reducir más de 1,5–2 veces sin mipmaps aparecen dientes y parpadeo.
3. El nivel alto no necesita 6 px/u: **4 px/u da la misma calidad que 6 en pantallas de doble densidad**, con un 56 % menos de memoria.

Las diferencias pequeñas entre 0,92 y 0,97 dependen de cómo cae el remuestreo y de las figuras de prueba. Hay que confirmarlas con arte real en el piloto.

**Propuesta: tres niveles de ejecución y un original.**

| Nivel | Densidad | Pantallas | Memoria relativa |
|---|---|---|---|
| **Original** (del artista) | 8 px/u o más | Nunca entra en el juego | — |
| **Ligero** | 2 px/u | Densidad hasta ~2,2 (720p, 900p, ventanas pequeñas, equipos modestos) | 1 |
| **Estándar** | 3 px/u | Densidad de ~2,2 a ~3,3 (1080p y 1440p a dpr 1) | 2,25 |
| **Alto** | 4–5 px/u (se fija en el piloto) | Densidad mayor de ~3,3 (retina, 4K al 200 %) | 4–6,25 |

- El juego elige el nivel al arrancar según la densidad de la pantalla y la memoria, y el jugador puede forzarlo en las opciones.
- **Dependencia de AD-7:** con un renderizador WebGL (PixiJS) hay mipmaps y la reducción no estropea la imagen. En ese caso, Ligero podría desaparecer y bastarían dos niveles. Se decide con las pruebas de AD-7.

---

## 2. Vistas necesarias (AD-3)

### 2.1 Cómo se elige hoy la vista (código de `main`)

- **Movimiento:** teclado en 8 direcciones (ejes y diagonales).
- **Apuntado:** ratón en 360° continuos. Durante un ataque, la vista sale del ángulo del golpe (`st.swing.ang`).
- `HeroSprites.pick` redondea el ángulo al **octante** más cercano y usa **5 vistas pintadas**: abajo, ¾ abajo, lado, ¾ arriba y arriba. Las 3 de la izquierda son reflejos.

### 2.2 Alternativas

| Opción | Direcciones | Error máximo entre el dibujo y la dirección real | Problemas | Coste relativo |
|---|---|---|---|---|
| 8 vistas pintadas, sin reflejo | 8 | 22,5° | Ninguno de lectura; escudo y espada siempre en su mano | 1,6 |
| **5 pintadas + 3 reflejadas** (como hoy) | 8 | 22,5° | El reflejo cambia el arma de mano (ya ocurre hoy y se aceptó) | **1** |
| 3 pintadas (frente, lado, espalda) + reflejo | 4 | 45° | Al andar en diagonal, algo muy frecuente con teclado, el héroe se ve de lado o de frente. Un tajo a 45° sale con el cuerpo girado 45° respecto al golpe. Con la asistencia del Arquero (≤ 12°), el arco puede apuntar a 45° de la flecha | 0,6 |
| 2 pintadas (frente y espalda) + reflejo | 4 de mala calidad | 45° y sin perfil | No se leen los ataques laterales | 0,4 |

### 2.3 Recomendación por tipo de actor

| Actor | Vistas | Por qué |
|---|---|---|
| **Héroes** | **5 + reflejo** para todas las animaciones | Son lo que más se ve. Los 8 rumbos del teclado y el apuntado continuo necesitan las diagonales. Con 3 vistas el error de 45° se ve en cada diagonal y en cada golpe en diagonal |
| **Vecinos** | 5 + reflejo para reposo y andar; la animación de oficio, en 1 vista | Andan en 8 direcciones, pero el oficio se hace quieto y de cara |
| **Enemigos cuadrúpedos o con dirección clara** (Mordisquín y similares) | 3 + reflejo | Son pequeños y rápidos: el error en diagonal se nota menos. Se comprueba en el escenario piloto |
| **Enemigos simétricos o fijos** (Pufón, limos, setas) | 1, con la «boca» o el cañón orientados por código | No tienen frente ni espalda claros |
| **Jefes** | 3 + reflejo (frente, lado, espalda), o 1 si su anatomía es simétrica | Son grandes y caros. Sus ataques ya llevan su telegrafiado en el suelo |

Para el Guerrero piloto: **5 vistas**. El detalle está en [PROTOTIPO_GUERRERO.md](PROTOTIPO_GUERRERO.md).

---

## 3. Animación: comparativa (AD-5)

**No se ha comprado nada.** Los precios y condiciones son los publicados por cada fabricante en noviembre de 2026; se revisarán antes de decidir.

### 3.1 Opciones

| Opción | Calidad | Integración con el juego | Licencia y coste | Dificultad de producción |
|---|---|---|---|---|
| **Spine** (Esoteric Software) | Muy alta: huesos, IK, mallas deformables y pieles (Professional) | Runtime oficial para PixiJS v8 (`spine-pixi-v8`, exige PixiJS ≥ 8.16). Con Canvas 2D hay límites: sin tinte negro ni modos de fusión, y la deformación de mallas en Canvas es limitada (a verificar) | Essential 69 USD (sin mallas ni IK); Professional 379 USD. La licencia del editor da derecho a usar los runtimes. Por encima de 500.000 USD anuales de ingresos o financiación, Enterprise | Estándar de la industria: muchos animadores lo conocen |
| **Rive** | Alta, más orientada a interfaz y vector; admite imágenes con deformación | Runtime web (WASM) con Canvas o WebGL y máquinas de estados. Falta comprobar que muchos actores puedan dibujarse ordenados por `y` junto al resto del mundo | Runtimes MIT. Plan gratuito: exporta con pantalla de presentación de Rive. Cadet: 9 USD por puesto al mes, sin ella | Menos animadores de juego la usan para personajes pintados |
| **DragonBones** | Media-alta | Runtimes antiguos; habría que adaptarlos a PixiJS v8 o a Canvas | Gratuito, código abierto. El editor parece sin mantenimiento (a verificar) | Riesgo de herramienta abandonada |
| **Recorte en Blender** (piezas sobre planos con huesos) que se **hornea** a fotogramas | Alta, si el rig es bueno | Muy simple: el juego solo reproduce fotogramas, como hace hoy `HeroSprites` | Gratuito (GPL; lo producido es del autor) | Flujo menos habitual en 2D; el animador debe conocer Blender |
| **Esqueleto propio** (piezas rígidas con rotación, posición y escala, y claves en JSON) | Media: sin mallas | Total control; el juego ya tiene un sistema de articulaciones simple (`Rig`) | Gratuito; hay que programar el formato y, sobre todo, un editor | Sin editor no hay productividad: es el punto débil |
| **Fotogramas pintados a mano** | La más «pintada» | Simple, como los fotogramas horneados | Sin licencias | La más cara: unos 230 dibujos por clase con 5 vistas |
| **Híbrido: esqueleto en el editor y horneado a fotogramas**, con retoque de las poses clave | Alta; el retoque da carácter pintado | Simple | Depende del editor elegido. Horneado, el juego no necesita runtime | Media |

### 3.2 Memoria por clase de héroe

Estimación con 5 vistas, unos 46 fotogramas por vista (230 en total, como hoy) y un recuadro medio recortado de unas 50×63 unidades:

| Método | Ligero (2 px/u) | Estándar (3 px/u) | Alto (4–5 px/u) |
|---|---|---|---|
| Fotogramas (horneados o pintados) | ~12 MB | ~26 MB | ~46–72 MB |
| Esqueleto (atlas de piezas de 5 vistas y datos de animación) | < 1 MB | ~1–2 MB | ~2–5 MB |

- **Con 4 jugadores de clases distintas en Alto**, los fotogramas suman ~180–290 MB **solo en héroes**.
- Con esqueleto en vivo la memoria deja de ser un problema, pero el coste pasa a la CPU (huesos) y al dibujo (más piezas por actor).
- Las cifras son estimaciones de orden de magnitud. Se medirán con el Guerrero piloto.

### 3.3 Recomendación

**Para el Guerrero piloto, producir el rig una vez y evaluar dos formas de llevarlo al juego:**

- **(a) esqueleto en vivo;**
- **(b) horneado a fotogramas.**

Se comparan en calidad, memoria, coste de dibujo e integración.

- **Herramienta para el piloto:** la decide el director (AD-5). Opciones:
  - **sin coste:** Blender con recorte y horneado; Rive gratuito, aceptando la pantalla de presentación solo en las pruebas;
  - **con coste mínimo:** Spine Essential (69 USD) o Rive Cadet (9 USD al mes) durante el piloto.
- **Spine Professional** solo hace falta si el piloto demuestra que las mallas (capa, tabardo, raíces de Robletón) aportan lo bastante.
- Mientras no se compre nada, la evaluación se hace con las opciones gratuitas.

---

## 4. Formatos y compresión

| Uso | Formato en el juego | Notas |
|---|---|---|
| Actores, atrezo, iconos y fotogramas (con transparencia) | **WebP con canal alfa**, con pérdida de alta calidad (q ≈ 85–92) | Lo leen todos los navegadores actuales. Pesa mucho menos que PNG |
| Suelos y fondos opacos | WebP; AVIF solo si la prueba demuestra que su decodificación, más lenta, no frena la carga | AVIF pesa menos pero tarda más en decodificar |
| Datos de animación y atlas | JSON | Generados por herramienta; nunca a mano |
| Originales | PSD, KRA (Krita) o PNG de 16 bits | **Fuera del repositorio del juego** |
| Texturas comprimidas de GPU (KTX2 / Basis) | Solo con un renderizador WebGL | No sirven con Canvas 2D (dependen de AD-7) |

**Importante sobre la memoria:** en memoria, una imagen ocupa **ancho × alto × 4 bytes**, sea cual sea el formato del archivo. WebP y AVIF ahorran descarga y disco, **no memoria**. La memoria se controla con:

- la densidad;
- el recorte de transparencias;
- el atlas;
- la carga por grupos;
- y, solo con WebGL, las texturas comprimidas.

---

## 5. Atlas, carga y memoria

### 5.1 Atlas

- Tamaño máximo de 2048×2048 por hoja. Se podrá subir a 4096 si las pruebas en los equipos de referencia lo permiten.
- Transparencias recortadas y un margen de 2 px para que no se mezclen colores al escalar.
- Una hoja por grupo y nivel: por ejemplo, `bosque.estandar.1.webp`.
- Herramientas posibles: free-tex-packer (gratuita) o TexturePacker (de pago). También un empaquetador propio dentro de la herramienta de exportación (sección 6).

### 5.2 Manifiesto

`arte.json` lo genera la herramienta de exportación. Por recurso guarda:

- id;
- grupo;
- hoja y rectángulo dentro de ella;
- ancla en unidades;
- tamaño en unidades;
- nivel;
- capa de profundidad;
- y, si tiene luz propia, color y radio.

**No guarda** radio de colisión, alcance ni daño: eso es de las reglas.

### 5.3 Carga

**Grupos:**

| Grupo | Cuándo se carga |
|---|---|
| Común (interfaz, iconos, efectos, héroes) | Siempre |
| Aldea | Al entrar en la aldea |
| Bioma | Al entrar en una expedición de ese bioma |
| Jefe | Al llegar al piso del jefe |

**Cómo:**

- Se decodifica fuera del hilo principal con `createImageBitmap`, mientras se genera el piso. Hoy ya hay una pausa natural en ese momento.
- Se libera el bioma anterior al cambiar de zona.
- Si un recurso no está, se dibuja su versión del sistema clásico y se registra en la consola de pruebas. **Nunca falla el juego por falta de un recurso.**

### 5.4 Presupuesto de memoria orientativo

| Concepto | Estándar | Notas |
|---|---|---|
| Lienzos de pantalla y luz | 15–40 MB | Medido a 1080p, de 18 a 38 MB según el modo (ARQUITECTURA_ARTE, sección 3) |
| Héroes (4 clases) | 8 MB con esqueleto, o ~100 MB con fotogramas | |
| Bioma: suelo, atrezo y enemigos | 40–80 MB | |
| Jefe | 10–30 MB | |
| Común: interfaz, iconos y efectos | 20–40 MB | |
| **Total** | **≤ 300 MB de memoria de imagen** | Se valida en la etapa de rendimiento (AD-9) |

---

## 6. Organización de archivos

```
(fuera del repositorio del juego)
arte-originales/
  ORIGENES.csv              ficha de origen de cada recurso (PLAN_PRODUCCION_ARTE.md)
  personajes/guerrero/      conceptos, piezas por vista, rig y exportaciones
  enemigos/<familia>/
  jefes/<jefe>/
  biomas/<bioma>/           suelos, atrezo, calcomanías
  interfaz/
  iconos/

(paquete de arte que se distribuye; sección 7)
arte.json                   manifiesto
<sha256>.webp / .json       archivos con el nombre de su huella

(en el repositorio del juego, cuando se apruebe la implementación)
tools/art-build.mjs         exporta los originales, recorta, empaqueta en atlas, comprime,
                            calcula huellas y genera el manifiesto
```

**Nombres lógicos:** `grupo/tipo/nombre`, en minúsculas y sin acentos. Ejemplos: `bosque/enemigo/mordisquin`, `heroes/guerrero`, `iconos/objeto/pocion`.

---

## 7. Distribución separada (AD-8: principio aprobado, diseño propuesto)

### 7.1 Por qué

- Hoy el lanzador descarga **el repositorio completo** de GitHub `main` en cada actualización y guarda una copia de seguridad de lo que reemplaza (`docs/ACTUALIZAR.md`).
- Con cientos de MB de arte, cada arreglo de código obligaría a bajarlo todo y a duplicarlo en `.update/backup/`.

### 7.2 Diseño

**1. Paquete de arte con versión propia.**

- La versión del arte es independiente de la del juego: por ejemplo, `arte 2027.02.1`.
- Se publica fuera del repositorio del juego: en publicaciones de GitHub (*releases*) o en una web estática con https.

**2. Archivos con nombre de su huella.**

- Cada archivo se guarda como `<sha256>.<ext>`. Así:
  - un archivo que no cambia entre versiones **no se vuelve a descargar**;
  - dos versiones comparten los archivos comunes en la caché;
  - el nombre ya es la suma de comprobación;
  - no hay rutas que puedan escaparse de la carpeta (sin `..` ni rutas absolutas).

**3. Manifiesto `arte.json`.** Ejemplo ilustrativo; no es un archivo real:

```json
{
  "formato": 1,
  "version": "2027.02.1",
  "compat": { "esquema": 1, "juegoMin": 50 },
  "niveles": ["ligero", "estandar", "alto"],
  "grupos": {
    "comun":  { "estandar": [{ "f": "3a7c….webp", "bytes": 812345 }] },
    "bosque": { "estandar": [{ "f": "9b10….webp", "bytes": 1503221 }] }
  },
  "datos": { "f": "c4e2….json", "bytes": 48211 }
}
```

**4. Compatibilidad entre juego y arte.**

- El juego declara qué **esquema de manifiesto** entiende.
- El manifiesto declara su esquema y la **versión mínima del juego** (`juegoMin`).
- El juego usa la versión de arte más reciente que sea compatible.
- Si no hay ninguna compatible:
  - durante la transición, usa el arte clásico;
  - después de la transición, avisa y sigue con la última versión compatible que tenga en caché.
- `version.json` del juego puede indicar la versión de arte recomendada, para que juego y arte se actualicen juntos cuando haga falta.

**5. Caché local.**

- **Lanzador:** carpeta `arte/` dentro de la instalación.
  - Se añade a la lista de lo que el actualizador conserva (`KEEP` en `tools/update.mjs`), así que nunca entra en la copia de seguridad del código.
  - Se conservan la versión activa y la anterior; los archivos que ya no usa ninguna de las dos se borran **después** de cambiar con éxito.
- **Cliente web** (cuando el juego se sirva desde el servidor en línea):
  - las direcciones con huella se sirven con `Cache-Control: public, max-age=31536000, immutable`;
  - la caché del navegador, o una caché propia con Service Worker si hace falta jugar sin conexión, evita volver a descargarlas.

**6. Descarga y reanudación.**

- Los archivos se descargan a `<huella>.part`.
- Si se corta, se reanuda con una petición HTTP `Range: bytes=<ya descargado>-`. Si el servidor no admite rangos, se empieza de nuevo ese archivo.
  - Hay que verificar que las descargas de GitHub y la web elegida admiten rangos.
- De 2 a 4 descargas en paralelo, con tiempo límite por petición y reintentos con espera creciente (por ejemplo 1, 2, 4 y 8 s).
- Solo se descargan los grupos y el **nivel** que necesita el equipo; el resto, bajo demanda.

**7. Comprobación y recuperación de errores.**

- Al terminar cada archivo se calcula su sha256. Si no coincide con su nombre, se borra y se vuelve a pedir, hasta un máximo de reintentos.
- **Cambio atómico de versión:**
  1. se descarga todo lo que falta;
  2. se comprueba;
  3. solo entonces se escribe el puntero `arte/activo.json`, escribiendo primero un temporal y luego renombrándolo, como ya hace `tools/update.mjs` con `.update-part`.
- Si algo falla, la versión anterior sigue activa y el juego arranca con ella.
- Al cargar, un archivo dañado se detecta por su tamaño o su huella, se vuelve a pedir y mientras tanto se usa el recurso de reserva.
- Orden «reparar arte»: comprueba toda la caché y vuelve a descargar lo dañado.

**8. Actualización segura.**

- Solo https, o localhost para las pruebas.
- Se valida el esquema del manifiesto y hay límites de tamaño por archivo y en total.
- Solo se aceptan tipos de imagen y JSON. **Nada del paquete se ejecuta.**
- **Opcional, a decidir:** firmar el manifiesto con una clave Ed25519.
  - El juego llevaría solo la clave pública. La clave privada **nunca** va en el repositorio ni en la documentación.
  - Protege frente a un servidor de descargas comprometido.
  - Requiere decidir quién guarda la clave y cómo se firma.

**9. Licencia del paquete.**

- El repositorio no tiene archivo de licencia: por defecto, todos los derechos reservados.
- El paquete de arte llevará un aviso de derechos y su licencia explícita, que debe decidir el director.

### 7.3 Pruebas que necesitará la implementación (más adelante)

- Descarga cortada y reanudada.
- Huella incorrecta.
- Manifiesto incompatible.
- Disco lleno.
- Cambio atómico con fallo a mitad.
- Caché compartida entre versiones.
- Limpieza de archivos sin uso.
- Ruta maliciosa en el manifiesto.
- Sin conexión, con arte en caché.
- Que no rompan los 21 tests de despliegue actuales.
