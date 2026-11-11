# Plan de producción del arte

- **Estado:** plan revisado tras las decisiones del director del 2026-11-11.
- **Fuera de esta fase:** no se compra nada, no se contrata nada y no se produce ningún recurso definitivo.

**Estado de las decisiones:**

| Decisión | Estado |
|---|---|
| AD-1 (dirección artística) | Aprobada |
| AD-2 y AD-3 (dimensiones y vistas) | Criterios aprobados |
| AD-8 (distribución separada) | Principio aprobado |
| AD-9 (60 fps) | Objetivo aprobado |
| AD-10 (documentación) | Aprobada |
| AD-4 (producción) | Pendiente |
| AD-5 (animación) | Pendiente |
| AD-6 (bosque abierto) | Pendiente |
| AD-7 (renderizador) | Pendiente |

**AD-11 (orden de trabajo):** lo propuso el director y es el orden que sigue este plan.

---

## 1. Etapas

| Etapa | Contenido | Depende de | Pruebas | Esfuerzo orientativo |
|---|---|---|---|---|
| **1. Dirección artística y documentación** | Los 8 documentos de `docs/arte/` y las pruebas aisladas de resolución | AD-10 | Revisión del director y de ChatGPT | Hecho, a falta de revisión |
| **2. Arquitectura gráfica** | 2.1 Medir la página de prueba en los equipos de referencia. 2.2 Prueba comparativa con PixiJS, si se autoriza descargarlo. 2.3 Decidir el renderizador (AD-7). 2.4 Aprobar el diseño de distribución (AD-8). 2.5 Evaluar herramientas de animación con opciones gratuitas (AD-5) | Equipos de referencia disponibles; autorización para descargar PixiJS a la carpeta de pruebas | Métricas de AD-9 (sección 4) | Unas 3–5 sesiones mías, más el tiempo del director para pasar las pruebas en sus equipos |
| **3. Personaje piloto** | Prototipo A ([PROTOTIPO_GUERRERO.md](PROTOTIPO_GUERRERO.md)) | AD-4 y AD-5 decididas; etapa 2 | Aceptación del prototipo A | 18–29 días de artista y 2–3 sesiones mías |
| **4. Escenario piloto con enemigo** | Prototipo B ([PROTOTIPO_BRUMAVERDE.md](PROTOTIPO_BRUMAVERDE.md)) | Etapa 3 | Aceptación del prototipo B; medición en los equipos de referencia | 14–22 días de artista y 3–5 sesiones mías |
| **5. Menú de inicio y transición a juego 100 % online** | Planificar el nuevo menú de inicio con la nueva identidad y cómo se pasa a un juego solo en línea | Etapas 3 y 4; decisiones de diseño de juego | Plan revisado por el director | 1–2 sesiones de planificación |
| **6. Plan de producción completa** | Orden de bloques, presupuesto y calendario con los datos reales de los pilotos | Etapas 3–5 | — | 1 sesión |
| 7. Producción progresiva | Por bloques completos detrás de la opción de arte temporal (sección 6) | Etapa 6 y autorización de implementación | La batería completa en cada bloque y la lista de aceptación por recurso | Sección 5 |

### 1.1 Conflicto a resolver en la etapa 5

- La etapa 5 habla de una **transición a juego 100 % online**.
- Las restricciones de esta fase dicen **«no eliminar el modo offline»**.
- **No hay contradicción hoy**, porque la etapa 5 solo planifica.
- Antes de implementar habrá que decidir qué pasa con el modo sin conexión:
  - eliminarlo;
  - mantenerlo como partida en solitario;
  - o convertirlo en un servidor local.
- **Esto afecta al arte:** sin modo sin conexión, el paquete de arte puede servirse siempre desde el servidor; con él, hace falta la caché local completa ([PIPELINE_ASSETS.md](PIPELINE_ASSETS.md), sección 7).

### 1.2 Lo que no se ha diseñado todavía

- El rediseño concreto de cada pantalla de la interfaz. Va con la etapa 5.
- Las habilidades nuevas de los niveles 7, 10 y 14 y el definitivo (problema I-1). Su arte depende de su diseño de juego.
- Los jefes cuyo diseño de juego puede cambiar: Ciénagón, Magmatrón y Picoferro ([MUNDO_Y_PERSONAJES.md](MUNDO_Y_PERSONAJES.md), sección 5).

---

## 2. Modelo de producción (AD-4: comparativa para decidir)

### 2.1 Las tres opciones

| | Producción humana | IA asistida (generación con poco retoque) | Producción mixta (la preferencia inicial del director) |
|---|---|---|---|
| **Quién hace qué** | Artista y animador hacen todo | La IA genera los recursos y una persona los selecciona y retoca poco | IA para explorar y hacer variaciones; **artista humano para definir y corregir los diseños finales**; herramientas de animación; revisión antes de integrar |
| **Coste del piloto** (prototipos A y B) | 32–51 días de artista. A las tarifas orientativas de la sección 2.3: unos **7.700–18.400 USD** según región y experiencia | Mucho menor en dinero (suscripciones), pero no resuelve piezas por vista ni animación: hace falta un animador igualmente | Entre 10 % y 25 % menos que la humana, sobre todo en concepto y variaciones. El ahorro real se mide en el piloto |
| **Calidad y coherencia** | La mejor y la más controlable | **Baja para producción.** Es difícil mantener el mismo personaje en 5 vistas y en piezas separadas para un rig; el estilo deriva entre generaciones; aparecen detalles incoherentes (manos, hebillas, simetrías) | Alta, si el artista define el estilo y rehace lo final |
| **Derechos de uso** | Claros, con un contrato de cesión de derechos | **Débiles:** ver la sección 2.2 | Protegible la parte humana; hay que registrar qué parte es de cada origen |
| **Trazabilidad** | Sencilla | Difícil: modelo, versión, condiciones de uso y entradas | Necesaria: ficha de origen por recurso (sección 2.4) |
| **Riesgo de reputación** | Ninguno | Alto: parte del público rechaza el arte generado y algunas tiendas exigen declararlo | Moderado y gestionable, declarando el uso |
| **Dependencia** | De una persona o estudio | De un servicio y de sus condiciones, que cambian | Mixta |

### 2.2 Derechos, licencias y obligaciones (resumen; no es asesoramiento legal)

- **Autoría en España:** la Ley de Propiedad Intelectual considera autor a la persona natural que crea la obra. Un resultado generado sin aportación creativa humana suficiente probablemente **no tiene autor ni protección**. Cualquiera podría reutilizarlo.
- **Estados Unidos:** la Oficina de Derechos de Autor (informe de 2025, parte 2) concluye que:
  - escribir instrucciones (*prompts*) no basta para ser autor;
  - lo generado por completo no es protegible;
  - sí se protege la expresión humana perceptible: lo que una persona dibuja, modifica de forma creativa, selecciona o compone.
- **Condiciones de cada servicio.** Ejemplo, Midjourney:
  - uso comercial solo con plan de pago;
  - plan Pro o Mega si la empresa supera 1 millón de USD de ingresos anuales;
  - las imágenes son públicas en su galería salvo con el «modo sigilo» (solo Pro o Mega);
  - sin garantías de propiedad intelectual.
  - Antes de usar cualquier herramienta hay que leer sus condiciones vigentes.
- **Reglamento europeo de IA, artículo 50:** aplica desde el 2 de agosto de 2026.
  - Obliga a quien publica *deepfakes* a etiquetarlos, con un régimen más ligero para obras artísticas o de ficción.
  - Los proveedores de IA deben marcar sus resultados.
  - Que el arte de un juego de fantasía cuente como *deepfake* es dudoso, pero no está aclarado para videojuegos. Si se usa IA, conviene declararlo en los créditos.
- **Tiendas:** si en el futuro el juego se publica en una tienda como Steam, hay que revisar su política de declaración de contenido generado con IA.
- **Contrato con un artista**, a revisar por un profesional:
  - cesión en exclusiva de los derechos de explotación (reproducción, distribución, comunicación pública y transformación);
  - ámbito mundial y toda la duración legal;
  - uso en el juego, actualizaciones, promoción y obras derivadas;
  - entrega de originales;
  - garantía de originalidad;
  - cláusula sobre si puede o no usar IA y cómo declararla.
  - Los derechos morales, como el reconocimiento de autoría, no se ceden en España: hay que acreditar al artista.
- **Nunca:**
  - nombres de artistas vivos o de franquicias en las instrucciones;
  - imágenes de terceros como entrada;
  - recursos de franquicias (D-007).

### 2.3 Tarifas orientativas

Fuente: guía de precios de 2026 de un estudio de externalización (RocketBrush), con precios actualizados en agosto de 2025. Hay que contrastarlas con presupuestos reales.

| Región | Junior | Media | Sénior |
|---|---|---|---|
| Europa occidental | 25 USD/h | 45 USD/h | 90 USD/h |
| Europa del este | 15 USD/h | 30 USD/h | 60 USD/h |

**Lo que suponen estas tarifas:**

- **Piloto** (A y B: 32–51 días, unas 256–408 horas):
  - unos 7.700–12.200 USD en Europa del este a nivel medio;
  - unos 11.500–18.400 USD en Europa occidental a nivel medio.
- **Producción completa** (65–110 semanas de artista, estimación del primer informe): del orden de **80.000–200.000 USD**. Se recalculará con los datos reales del piloto en la etapa 6.

### 2.4 Trazabilidad: ficha de origen de cada recurso

Se guarda en `arte-originales/ORIGENES.csv`, fuera del repositorio del juego, y se exige en la lista de aceptación de la biblia.

| Campo | Ejemplo |
|---|---|
| id lógico | `heroes/guerrero/vista-frente/escudo` |
| autor o autores | Nombre del artista |
| herramientas | Krita 5.x; Spine 4.2; (si aplica) servicio de IA y versión |
| uso de IA | No / exploración de concepto / base retocada (porcentaje aproximado repintado) |
| entradas | Bocetos propios, referencias internas (nunca imágenes de terceros) |
| licencia o cesión | Contrato o condiciones del servicio y fecha |
| fecha | 2027-01-15 |
| revisión artística | Aprobado por, fecha |

### 2.5 Recomendación

**Producción mixta, como prefiere el director, decidida en dos pasos:**

1. **Solo el piloto:**
   - presupuesto cerrado para los prototipos A y B, con un artista o estudio contratado por hitos;
   - el director hace la exploración con IA, si quiere;
   - el artista hace el diseño final, las piezas y la animación.
2. **Con el piloto validado**, decidir el modelo y el presupuesto de la producción completa con datos reales: horas, ahorro de la IA y calidad.

---

## 3. Herramientas

| Necesidad | Opciones | Coste | Estado |
|---|---|---|---|
| Pintura | Krita (gratis), Clip Studio Paint, Photoshop | Krita, gratis | Decide el artista |
| Animación | Spine (Essential 69 USD; Professional 379 USD), Rive (gratis con pantalla de presentación; Cadet 9 USD al mes), Blender con recorte (gratis), DragonBones (gratis, sin mantenimiento aparente) | Ver [PIPELINE_ASSETS.md](PIPELINE_ASSETS.md), sección 3 | **AD-5: no se compra nada todavía** |
| Atlas | free-tex-packer (gratis), TexturePacker (de pago) o empaquetador propio | Gratis o licencia | Etapa 2 |
| Conversión | `sharp` (Node), `cwebp`, `avifenc` | Gratis | Instalar requiere autorización |
| Renderizador alternativo | PixiJS v8 (MIT) | Gratis | Descargarlo para la prueba requiere autorización |
| Pruebas de rendimiento | Playwright (ya instalado en el entorno de pruebas), la página de prueba y las herramientas del navegador | Gratis | Disponible |

---

## 4. Rendimiento (AD-9: objetivo aprobado, método propuesto)

**Objetivo:** 60 fps estables en condiciones reales.

### 4.1 Equipos de referencia (propuesta)

| Id | Equipo | Pantalla | Navegador |
|---|---|---|---|
| **R0** | El equipo o equipos del director, medidos primero | La suya | El suyo |
| **R1 mínimo** | Portátil de 2019–2021 con gráfica integrada (tipo Intel UHD 620 o Iris Xe, AMD Vega 8), 8 GB de RAM | 1920×1080 al 100 % y 125 % | Chrome o Edge actualizados |
| **R2 recomendado** | Sobremesa con gráfica dedicada de gama media (tipo GTX 1650 o RX 6500 o superior), 16 GB | 1920×1080 y 2560×1440 | Chrome o Edge |
| **R3 alta densidad** | Portátil con pantalla de doble densidad (retina, o 4K al 200 %) | dpr 2 | Chrome y Safari |

**Pendiente del director:** decir qué equipos tiene a mano. Si no hay alguno, se busca un sustituto razonable o se deja como riesgo.

### 4.2 Escenas de prueba

**Nunca solo una escena vacía.**

| Escena | Contenido |
|---|---|
| S1 Aldea | 4 jugadores, vecinos, faroles, atardecer |
| S2 Bosque en combate | 4 jugadores, 16 enemigos, efectos, haces de luz y bruma |
| S3 Jefe | Robletón con sus 3 fases, brotes, raíces, telegrafiados y 4 jugadores |
| S4 Bioma oscuro | Mina o Cráter con 15 luces dinámicas y partículas |
| S5 Peor caso | 4 jugadores, 30 enemigos, 2 jefes, 200 partículas, todas las capas |
| S6 En línea | S2 con 4 clientes reales conectados al servidor local, con 0 ms y 150 ms de latencia |

En cada escena se mide también el **juego actual**, para comparar.

### 4.3 Métricas

| Métrica | Cómo se mide |
|---|---|
| Tiempo de fotograma: p50, p95 y p99 | Intervalo entre fotogramas (`requestAnimationFrame`) y tiempo de dibujo |
| Fotogramas lentos | Porcentaje de fotogramas de más de 16,7 ms y de más de 33,3 ms; «1 % más lento» en fps |
| Tareas largas | `PerformanceObserver` de tareas de más de 50 ms |
| Memoria | Montón de JavaScript; memoria de imagen calculada (suma de ancho × alto × 4); memoria del proceso de la GPU en el administrador de tareas del navegador |
| Carga | Tiempo hasta el primer fotograma del piso, con caché vacía y con caché llena |
| Estabilidad | Sesión de 20 minutos: crecimiento de memoria y deriva del tiempo de fotograma |

**Método:**

- 10 s de calentamiento y 60 s de medida.
- 3 repeticiones.
- Equipo enchufado y sin otras pestañas.

### 4.4 Criterios de aprobado (propuesta; los aprueba el director)

| Equipo | Criterio |
|---|---|
| R1 a 1920×1080, nivel Ligero o Estándar | En S1–S4: p95 del intervalo ≤ 16,7 ms y ≤ 1 % de fotogramas por encima de 33,3 ms. En S5: p95 ≤ 20 ms |
| R2 | Lo mismo a 2560×1440 |
| R3 | Lo mismo a dpr 2 con nivel Alto, o con Estándar y escala de render |
| Todos | Memoria de imagen ≤ 300 MB en S5. Crecimiento ≤ 5 % en 20 minutos. Ninguna tarea larga durante el combate |

### 4.5 Lo que ya se sabe

Pruebas aisladas en un entorno **sin GPU** ([ARQUITECTURA_ARTE.md](ARQUITECTURA_ARTE.md), sección 3):

- Pintar a resolución real es necesario para la calidad.
- Por software cuesta de 3 a 10 veces más que hoy.
- Esos tiempos no representan un PC real. La validación de los 60 fps **solo puede hacerse en R0–R3**.
- La página `banco-resolucion.html` (entregada al director) ya permite medir la parte de Canvas 2D en esos equipos, con un botón.

---

## 5. Producción progresiva (después de los pilotos)

**Orden propuesto por bloques completos:**

1. Brumaverde y el Linde, las 4 clases, la familia Mordisquín, Pufón y Pedrolón del bosque, y Robletón.
2. Aldea Raíz y vecinos.
3. Un bioma por bloque: Gruta, Mina, Ciénaga, Cráter y Raíces Hondas.
4. Iconos e interfaz, en coordinación con el nuevo menú.
5. Retirada del modo clásico (con autorización).

**Estimación** (con un ilustrador-animador con experiencia; se recalcula tras los pilotos):

| Bloque | Semanas de artista |
|---|---|
| 4 clases | 12–20 |
| Vecinos | 6–10 |
| Familias y variantes | 15–25 |
| Jefes | 10–18 |
| Zonas y aldea | 16–28 |
| Iconos | 4–6 |
| Efectos | 2–4 |
| **Total** | **≈ 65–110 semanas de una persona**, o unos 6–10 meses con un equipo de 3 |

**Mi parte:** unas 15–25 sesiones en total, entre:

- herramienta de exportación;
- módulo de carga;
- adaptadores;
- distribución;
- pruebas;
- integración por bloques.

---

## 6. Transición

- La opción «arte clásico / nuevo» es **temporal** (AD-1).
- A los jugadores solo se les ofrece el arte nuevo por bloques completos.
- Criterios para retirarla: [ARQUITECTURA_ARTE.md](ARQUITECTURA_ARTE.md), sección 2.2.

---

## 7. Riesgos

| Riesgo | Impacto | Mitigación |
|---|---|---|
| Canvas 2D no llega a 60 fps a resolución real en R1 | Hay que bajar la calidad o cambiar de renderizador | Etapa 2: medición en equipos reales; escala de render; modo mixto; prueba con PixiJS |
| Memoria con 4 clases en nivel Alto | Cierres del navegador | Esqueleto en vivo o niveles; carga por grupos; presupuesto de 300 MB |
| Coherencia visual con varios autores o con IA | Estilos mezclados | Biblia, revisión de cada recurso, ficha de origen; diseño final humano |
| Derechos débiles del arte generado | Cualquiera podría reutilizarlo; problemas en tiendas | Producción mixta con aportación humana sustancial y registrada; contrato de cesión |
| Peso de las actualizaciones | Lanzador lento | Paquete de arte separado con archivos por huella (AD-8) |
| Mezcla de estilos durante la transición | Aspecto incoherente | Bloques completos detrás de la opción temporal |
| Desincronía entre la animación y las reglas | Golpes que no se ven donde ocurren | Animaciones ajustadas a `MOVES`; pruebas en línea |
| Un arte más grande sugiere otro alcance | Frustración del jugador | Regla de huella ±15 % |
| El bosque sigue pareciendo un pasillo con la alternativa A | La alternativa B1 cambia reglas | Decisión separada tras el piloto (AD-6) |
| Expediciones interrumpidas tras un cambio de generador | Piso distinto al reanudar | Versión de generador guardada con la expedición, si llega B1 |
| La transición a solo en línea cambia la distribución | Rediseño del paquete | Decidir el futuro del modo sin conexión antes de implementar la distribución |
| Fuentes de Google sin conexión | Texto con fuentes del sistema | Empaquetar Cinzel y Alegreya Sans con el arte, tras revisar su licencia |
| Herramienta abandonada (DragonBones) o cambio de condiciones (servicios de IA, Rive, Spine) | Coste o bloqueo | Formatos exportados abiertos (imágenes y JSON); horneado a fotogramas como plan B |

---

## 8. Decisiones pendientes

| Id | Qué hay que decidir | Recomendación |
|---|---|---|
| **AD-4** | Modelo de producción y presupuesto **solo del piloto** | Mixta; contrato por hitos para los prototipos A y B |
| **AD-5** | Herramienta de animación para el piloto, con o sin coste | Evaluar primero con opciones gratuitas (Blender con recorte; Rive gratis en pruebas); probar en el piloto esqueleto en vivo frente a horneado |
| **AD-6** | Alternativa A en el piloto y, si no basta, B1 como tarea de reglas aparte | A ahora; B1 después solo si hace falta |
| **AD-7** | Autorizar la descarga de PixiJS (MIT) solo en la carpeta de pruebas para la comparación | Sí, fuera del juego |
| **AD-8** | Aprobar el diseño de distribución; decidir si se firma el manifiesto y dónde se aloja el arte | Archivos por huella en publicaciones de GitHub o en una web con https; firma opcional |
| **AD-9** | Qué equipos de referencia hay disponibles y los criterios de aprobado de la sección 4.4 | Medir primero en R0 con la página de prueba |
| **Niveles** | Ligero (2), Estándar (3) y Alto (4–5 px/u), en lugar de 6 para el Alto | Sí; el Alto se fija en el piloto |
| **Licencias** | Licencia del arte y del repositorio; empaquetar las fuentes | Decidir antes de publicar arte |
| **Etapa 5** | Qué pasa con el modo sin conexión en la transición a solo en línea | Decidir antes de implementar la distribución |
