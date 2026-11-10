# J. Mazmorras y jefes

> Parte de la [Biblia narrativa de Eldoria](../BIBLIA_NARRATIVA_ELDORIA.md). Etiquetas: **[CANON]**, **[PROPUESTA]**, **[PENDIENTE]**.
> En las mazmorras 1 a 5, los datos marcados **[CANON]** salen del juego (versión 0.43: `DUNGEONS`, `BossKit`, `DungeonPlan`, `TRAPS`). Su historia y lo nuevo son **[PROPUESTA]**.
> Las mazmorras 6 a 8 y la de poscampaña son **[PROPUESTA]**. El detalle técnico de los jefes está en `docs/JEFES.md`.

## Reglas de diseño de jefes

- **[CANON]** Los jefes de BossKit avisan cada ataque (mínimo 0,6 s), tienen fases que entran una vez y ventanas de vulnerabilidad con motivo visible.
- **[CANON]** En grupo, los jefes ganan patrones y oportunidades, no solo vida.
- [PROPUESTA] Cada jefe nuevo debe tener:
  - al menos un elemento del escenario que el jugador **usa** contra él;
  - una forma de vencerle «como lo habría querido su fundador», que da su **ofrenda** (tercera vía);
  - una mecánica que pide **posicionarse**;
  - una forma de ganar en solitario sin tareas simultáneas.
- [PROPUESTA] Dificultades Difícil y Pesadilla: ataques nuevos, peligros y tácticas, no más vida (ver [M](12_coherencia_y_cooperativo.md)).

## Ofrendas de los guardianes (tercera vía)

| Guardián | Condición, siempre comprobable por el servidor | Ofrenda |
|---|---|---|
| Robletón | Vencerle después de haberlo **enredado** al menos una vez | Bellota de Mirla |
| Reina Geoda | Vencerla después de **aturdirla** con tres choques | Prisma de Teodric |
| Ciénago | Vencerle con el estanque **purificado** (piedras rúnicas, mecánica prevista) | Perla de Hesse |
| Gromgar | Vencerle después de **derribarlo** (tercer choque) | Clavija de Brann |
| Magmatrón | Vencerle después de **enfriar** sus válvulas (mecánica prevista) | Ascua de Ondra |
| Prior Hueco | **Perdonarle** (MQ-6.4) | Hebilla de Anselmo |
| Reina del Hielo Quieto | Vencerla **sin romper** el bloque de Irene | Copo quieto de Ilse |

- Para la tercera vía hacen falta 5 de 7.
- Las ofrendas son objetos de historia únicos por perfil. Se puede volver a intentar cada guardián cuantas veces haga falta.
- **[CANON]** Los trofeos (Corona de Espinas, Colmillo de Gromgar) son otra cosa y se mantienen.

---

## 1. Bosque de Brumaverde (capítulo 1)

| Campo | Contenido |
|---|---|
| Historia | Bosque plantado por Mirla sobre el sello de la Raíz. Ruinas velidias bajo el musgo |
| Ambientación | **[CANON]** Senderos entre árboles y niebla; hierba, hojarasca y losas con musgo en las ruinas |
| Pisos | **[CANON]** 5. Sin tiendas: Tobías se presenta al final |
| Enemigos | **[CANON]** Rata de raíz, Limo de musgo, Seta brumosa, Zarza mordedora (desde el piso 2) y Cuervo tuerto (desde el piso 3) |
| Trampas | **[CANON]** Baldosa purificadora, pinchos, ráfaga, hambre y somnífera |
| Eventos y puzles | **[CANON]** Raíces con placas de tiempo, palanca y puente, muro agrietado (secreto), raíces rompibles, peso compartido (grupo, o palanca en solitario), raíces punzantes, esporas, estela (historia), altar de savia, emboscada |
| Secretos | **[CANON]** Los 7 textos del Bosque. [PROPUESTA] Página 1 del diario (piso 4) y el túmulo (MQ-S.8) |
| Cofres | **[CANON]** Cofres de plata en nichos de puzle y cofre raro del minijefe |
| Minijefe | **[CANON]** Zarzal Madre (piso 4 de 5) |
| Jefe | **[CANON]** Robletón, el Guardián de Espinas |

**Robletón** **[CANON]**:

| Fase | Mecánica |
|---|---|
| Despertar (100-65 %) | Zarpazo en arco, raíces en línea y salto (sombra). 4-5 tocones con colisión |
| Savia (65-30 %) | Brotes de savia que le curan y protegen. Destruirlos le deja «sin savia» |
| Furia (< 30 %) | Raíces en abanico y avisos más cortos |

- **Clave:** si su salto cae junto a un tocón, se enreda y es vulnerable 6 s.
- **Historia [PROPUESTA]:** es el roble más viejo hecho guardián. Pelea porque el sello se pudre bajo sus raíces.

## 2. Gruta de Cuarzo (capítulo 2)

| Campo | Contenido |
|---|---|
| Historia | Geoda gigante tallada por Teodric. Los mineros abrieron sus galerías altas |
| Ambientación | **[CANON]** Galerías de cristal y los primeros pisos sin luz |
| Pisos | **[CANON]** 6, con punto de control en el 3 |
| Enemigos | **[CANON]** Rata de cristal, Limo cristalino, Lagarto de cuarzo, Hongo luminoso y Vencejo de gruta |
| Trampas | **[CANON]** Purificadora, pinchos, veneno, somnífera, teletransporte, ráfaga y hambre |
| Otros | **[CANON]** Tiendas en mazmorra, escaleras ocultas y pisos oscuros |
| Eventos y puzles [PROPUESTA] | Cristales que transmiten luz para abrir puertas (pendiente en `docs/MAZMORRAS.md`); Archivo de los Fieles (hebilla) |
| Secretos | [PROPUESTA] Mural de los siete, página 2 del diario y la cuerda de cautivo |
| Minijefe | **[CANON]** Geodón Antiguo |
| Jefe | **[CANON]** Reina Geoda |

**Reina Geoda** **[CANON]**:
- al 60 %, furia y Carga;
- al 30 %, caen rocas de 2×2;
- la Carga contra una roca la agrieta, y tres choques la aturden 8 s;
- si sigue viva, salta sobre la sombra de un jugador.

## 3. Ciénaga Sombría (capítulo 3)

| Campo | Contenido |
|---|---|
| Historia | El estanque de Hesse. El agua guarda recuerdos |
| Ambientación | **[CANON]** Charcas, niebla verde, esporas y hierba oscura con barro |
| Pisos | **[CANON]** 7, con punto de control en el 4. Primeros nidos de monstruos |
| Enemigos | **[CANON]** Rata de ciénaga, Lagarto del cieno, Limo de pantano, Seta podrida y Planta carnívora |
| Trampas | **[CANON]** Purificadora, pinchos, veneno, somnífera, teletransporte, ráfaga y hambre |
| Eventos y puzles [PROPUESTA] | Reflejos que muestran el camino real; piedras rúnicas que purifican el agua |
| Secretos | [PROPUESTA] Página 3, nidos de SQ-14 y la Viuda del Estanque (jefa secreta) **[PENDIENTE P-05]** |
| Minijefe | **[CANON]** Musgón Viejo |
| Jefe | **[CANON]** Ciénago |

- **Ciénago** **[CANON]:** golpe, lluvia de esporas, invocación de lagartos y ráfaga radial. Segunda fase por debajo del 50 %.
- [PROPUESTA] Al pasarlo a BossKit:
  - **Fase 1:** tres piedras rúnicas en la guarida. Golpearlas purifica una parte del estanque, y si Ciénago está sobre agua limpia pierde defensa.
  - **Fase 2:** niebla. Solo se ve cerca de las piedras purificadas.
  - **En grupo:** dos piedras a la vez.
- **Viuda del Estanque [PENDIENTE P-05]:** el eco de Hesse. Ilusiones (copias sin daño), veneno y niebla. Se la ve en el reflejo después de vencer a Ciénago con el estanque purificado.

## 4. Mina Olvidada (capítulo 4)

| Campo | Contenido |
|---|---|
| Historia | La mina de la Aldea Raíz y el derrumbe del 681 d. F. Debajo, el sello del Peso |
| Ambientación | **[CANON]** Túneles a oscuras, raíles sobre traviesas, puntales y vetas de oro |
| Pisos | **[CANON]** 8, con punto de control en el 4 |
| Enemigos | **[CANON]** Rata minera, Lagarto de hollín, Limo de óxido, Grajo de hollín y Hongo de la mina («criaturas eléctricas muy rápidas») |
| Trampas | **[CANON]** Todas las anteriores, más explosiva, agujero e invocación |
| Eventos y puzles [PROPUESTA] | Vagonetas sobre raíles, palancas de agujas y puntales que se pueden derribar |
| Secretos | **[CANON]** Engranaje antiguo (material). [PROPUESTA] Placas de los mineros, segunda hebilla, tesoro de Picoferro y página 4 |
| Minijefe | **[CANON]** Ferrón Capataz |
| Jefe | **[CANON]** Gromgar el Quebrantamontañas, que sustituye a Picoferro **[PENDIENTE P-06]** |

**Gromgar** **[CANON]**:
- **Tanteo:** golpe, roca lanzada y carga.
- **Furia:** derrumbe de rocas; la carga contra una roca lo aturde.
- **Final:** avalancha.
- Al tercer choque cae derribado 7 s.
- En grupo, embiste al más lejano.
- Trofeo: Colmillo de Gromgar.

## 5. Cráter Ceniciento (capítulo 5)

| Campo | Contenido |
|---|---|
| Historia | La Forja de los Siete, construida en el calor del Origen |
| Ambientación | **[CANON]** Ruinas sobre ríos de lava, losas de basalto y ceniza |
| Pisos | **[CANON]** 10, con punto de control en el 5. Nidos de monstruos y escaleras secretas |
| Enemigos | **[CANON]** Rata de ceniza, Lagarto de brasa (su mordisco quema), Limo de magma, Ave de ceniza y Cardo ígneo. [PROPUESTA] Hermana Odila (élite) |
| Trampas | **[CANON]** Todas, con más explosivas e invocación |
| Eventos y puzles [PROPUESTA] | Fuelles y compuertas de lava; el molde de la sexta rueda |
| Secretos | [PROPUESTA] Página 5, recuerdo 2 y la puerta de la canción |
| Minijefe | **[CANON]** Basaltón Ígneo |
| Jefe | **[CANON]** Magmatrón. Su relación con el Coloso Forjado está **[PENDIENTE P-05]** |

- **Magmatrón** **[CANON]:** golpe, charcos de lava, carga y ráfaga de brasas que queman.
- [PROPUESTA] Al rehacerlo como **Coloso Forjado**:
  - componentes con vida propia (brazos y caldera);
  - 3 válvulas en la sala que lo enfrían al abrirlas;
  - al enfriarse, el núcleo queda expuesto;
  - Magmatrón es su fase fundida, por debajo del 30 %.

---

## 6. Abadía Hueca (capítulo 6) [PROPUESTA]

| Campo | Contenido |
|---|---|
| Historia | Casa madre de la Orden. Hoy, sede de la Hermandad |
| Ambientación | Claustros, celdas, biblioteca quemada, campanas sin badajo y velas frías |
| Pisos | 8, con punto de control en el 4 |
| Enemigos | Hermanos del Rayo Tachado (ballesteros, porteros con escudo y novicios que curan), Velas vivientes y gárgolas de cuarzo |
| Trampas | Campanas que aturden, suelos de losas sueltas y quemadores de incienso (somnífero) |
| Puzles | Coro de campanas (secuencia), puertas que se abren con juramentos (frases encontradas) y la biblioteca con el acta |
| Secretos | Página 6 (celda de Irene), acta de fundación, juramento original (SQ-11) y el tercer cautivo (SQ-09) |
| Minijefe | El Comprador (SQ-03): un hermano con hacha de leñador |
| Jefe | Prior Hueco |

**Prior Hueco:**

| Fase | Mecánica |
|---|---|
| 1 · Liturgia | Escudos de juramento: 3 campanas en la sala. Hacer sonar una rompe un escudo. Proyectiles de luz en abanico |
| 2 · La segunda traición (50 %) | Escena: intenta beber del Corazón por la grieta del altar y aparece el Custodio. Durante esta fase, el Custodio detiene el tiempo a ratos: las zonas quietas son refugio para el jugador y trampa para el Prior |
| 3 · Hueco (< 25 %) | Su armadura se abre y la luz sale por las grietas en rayos giratorios. Hay que colocarse tras las columnas |

En grupo, cada campana necesita a alguien cerca a la vez. En solitario, las campanas siguen sonando un rato después de tocarlas.

## 7. Cumbres del Hielo Quieto (capítulo 7) [PROPUESTA]

| Campo | Contenido |
|---|---|
| Historia | El observatorio de Ilse, donde el tiempo se detuvo |
| Ambientación | Nieve suspendida en el aire, pájaros inmóviles y un observatorio velidio en ruinas |
| Pisos | 8, con punto de control en el 4 |
| Enemigos | Lobos de escarcha, espectros quietos que solo se mueven cuando no los miras, y hermanos que quedan |
| Trampas | Zonas de tiempo detenido (los proyectiles se quedan quietos y se reanudan al salir) y hielo resbaladizo |
| Puzles | Relojes de sol: girar la sombra para abrir caminos. Proyectiles congelados como puentes o como escudos |
| Secretos | Testamento de Ilse (recuerdo 3), lema verdadero y Odila (SQ-13) |
| Minijefe | El Eco del Astrónomo, un autómata del observatorio |
| Jefe | Reina del Hielo Quieto |

**Reina del Hielo Quieto:**
- **Fase 1:** carámbanos que se detienen en el aire y caen al mismo tiempo cuando ella da una palmada. El aviso es la palmada.
- **Fase 2:** 4 relojes de sol. Activar uno detiene el tiempo en su cuadrante y ella no puede entrar.
- **Fase 3:** se lanza contra el bloque de Irene para romperlo. Hay que interponerse y desviarla con un golpe en la ventana de aviso.
- Si el bloque se rompe, no hay ofrenda, pero Irene sobrevive igualmente.

## 8. Santuario del Origen (capítulo 8) [PROPUESTA]

| Campo | Contenido |
|---|---|
| Historia | La cámara del Corazón |
| Ambientación | Raíces de cuarzo que laten. Cada piso recuerda una región anterior |
| Pisos | 6, con punto de control en el 3 |
| Enemigos | Ecos de las criaturas de cada región y raíces vivas |
| Puzles | Seguir el latido: el suelo pulsa hacia el camino correcto |
| Secretos | Los últimos textos de Aurel y el octavo nicho del túmulo |
| Jefes | Custodio Sin Rostro y Heraldo del Origen |

**Custodio Sin Rostro:**
- **Fase 1:** ecos de 3 guardianes vencidos (ataques de Robletón, Gromgar y la Reina Geoda, más rápidos).
- **Fase 2:** se ancla con raíces a 4 puntos de la sala. Hay que romper las raíces para que no se cure.
- **Fase 3:** detiene el tiempo a todos menos a un jugador y le persigue. En solitario, el jugador se mueve más lento pero sí se mueve.
- **Diálogo:** si se tiene el nombre, «Llamarle Aurel» termina el combate en cualquier fase.

**Heraldo del Origen**, según el final:

| Final | Forma | Mecánica |
|---|---|---|
| A. Restaurar | El Heraldo intenta impedir que se cierre la última rueda | Hay que defender 3 ruedas mientras se juran (en grupo, cada uno una) |
| B. Destruir | Desatado | Fases de cada región. Al final, el suelo de toda la sala es peligroso salvo donde late |
| C. Liberar | Aprende a hablar | No hay que vencerle: hay que sobrevivir y calmarle abriendo los sellos en orden (lemas). Cada sello abierto cambia sus ataques por otros más lentos |

---

## Poscampaña: Raíces Hondas [PROPUESTA]

| Campo | Contenido |
|---|---|
| Historia | Bajo el roble más viejo: las raíces del Corazón al descubierto. Su estado depende del final |
| Requisitos | Campaña completada (cualquier final) |
| Pisos | 6, con un bioma propio de raíz y cuarzo |
| Enemigos | Versiones «despertadas» de la fauna del Bosque |
| Puzles | Raíces que crecen o se retraen según el final |
| Secretos | Una página extra («Epílogo de Irene») y una reliquia del final |
| Jefe opcional | **Eco de Robletón**: los mismos tocones, con ataques nuevos (raíces que persiguen y savia que salta entre brotes) |

## Previstas sin capítulo

- **Profundidades** bajo cada mazmorra (poscampaña).
- **Viuda del Estanque** y **Coloso Forjado**, si no se integran en su capítulo **[PENDIENTE P-05]**.
