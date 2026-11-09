# M. Coherencia, cooperativo y estilo

> Parte de la [Biblia narrativa de Eldoria](../BIBLIA_NARRATIVA_ELDORIA.md). Etiquetas: **[CANON]**, **[PROPUESTA]**, **[PENDIENTE]**.
> Las reglas de este archivo son normas de trabajo y se aplican desde ya. Lo que describe sistemas del juego que todavía no existen es **[PROPUESTA]**.

## M.1 Reglas de coherencia

1. **Fuente de verdad:** esta biblia. Ante una duda, manda lo que diga aquí. Si el juego y la biblia no coinciden, se señala antes de tocar nada.
2. **Nada [CANON] se elimina ni se contradice.** Un texto que ya existe en el juego solo se amplía. No se reescribe sin aprobación.
3. **Nombres oficiales:** solo los de la [tabla de nombres](../BIBLIA_NARRATIVA_ELDORIA.md#nombres-oficiales). Si un nombre no está en la tabla, se añade antes de usarlo.
4. **Cronología:** toda fecha nueva se coloca en [K](10_cronologia.md). Nada puede ocurrir antes de su causa.
5. **Revelaciones:** ningún texto, diálogo ni objeto puede revelar un misterio antes del capítulo indicado en [L](11_misterios_y_pistas.md).
6. **Motivaciones:** un personaje solo cambia de postura con una causa que se vea en la partida (una escena, una misión o una decisión).
7. **Consecuencias:** cada decisión guardada en el perfil (`story.choices`) debe notarse después: un diálogo, un vecino o un cambio en la aldea.
8. **La aldea no pierde funciones:** si la historia aparta a un vecino (Doña Musgo en el capítulo 6), otro atiende su puesto mientras tanto.
9. **Secundarias y principales:** una secundaria puede ampliar la historia principal, pero nunca contradecirla ni ser obligatoria para los finales A y B.
10. **Cambios:** cada misión, personaje, mazmorra, jefe o revelación nueva actualiza esta biblia y su [registro de cambios](../BIBLIA_NARRATIVA_ELDORIA.md#registro-de-cambios) en la misma entrega.
11. **Contradicciones:** si una idea nueva contradice el canon, se marca **[PENDIENTE]** con su número P-xx y no se implementa hasta que se apruebe.

## M.2 Cooperativo: la historia en grupo (hasta 4)

Se basa en lo que ya existe: **[CANON]** sala con código, servidor autoritativo, recompensas por perfil e idempotentes, acompañantes y reconexión.

| Necesidad | Regla |
|---|---|
| Todos participan | Los objetivos de historia de una expedición son compartidos: cualquiera puede vencer, abrir o leer. Cuenta para todos los presentes que cumplan los requisitos |
| Sin depender del anfitrión | Ninguna escena, decisión ni objetivo pasa por el anfitrión. El servidor lleva la historia. Si el anfitrión se va, sigue el siguiente sin perder nada |
| Escenas sincronizadas | El servidor manda la escena a todos. Cada uno la ve en su pantalla, el grupo espera a que todos la cierren (como mucho 20 s) y nadie se pierde la escena por llegar tarde: se puede volver a ver en el registro |
| Recompensas individuales | Objetos de historia, páginas y ofrendas: uno por perfil, no se sueltan ni se pasan. Monedas, EXP y reputación: las calcula el servidor (`settle`), una vez por clave misión + cuenta |
| Quien se une tarde | Entra como acompañante si no tiene los requisitos. Si los tiene, recibe los hitos que aún no se hayan cumplido al llegar. Ve un resumen de «lo que ha pasado» antes de empezar |
| Decisiones (Bernardo, Prior, Odila, Custodio) | Se vota y cada perfil guarda **su propio voto**. El grupo sigue el resultado, con desempate a favor de la opción del juramento. Para la tercera vía cuenta el voto de cada jugador, no el resultado del grupo |
| Progresos distintos | Cada perfil avanza solo lo suyo. Un jugador en el capítulo 6 puede acompañar a otro en el capítulo 3: vive la expedición, pero no repite ni salta hitos |
| Finales | Cada perfil tiene su final. En grupo, cada uno elige el suyo en MQ-8.3 si cumple los requisitos. El combate del Heraldo usa el final que tenga la mayoría (empate: el del primero en elegir) |
| Solitario | Todo se puede completar en solitario, también la tercera vía. Las mecánicas de grupo (campanas, placas de peso) tienen alternativa en solitario |

## M.3 Estilo narrativo

- **Tono:** fantasía épica con misterio. El humor está en los vecinos (Bartolo, Tobías, Lino), y la gravedad en los antagonistas y los fundadores.
- **Diálogos:** frases cortas, con voz propia por personaje. Nada de discursos de villano: el Custodio pregunta más de lo que explica.
- **Evitar:**
  - el elegido por profecía;
  - el villano que «quiere destruir el mundo»;
  - el amnésico que resulta ser un rey;
  - el texto de relleno («Has encontrado un pergamino antiguo»).
- **Pistas:** cada texto del escenario debe decir algo concreto: un objeto, un nombre o una hora. Nunca solo atmósfera.
- **Revelaciones:** cada capítulo debe hacer que el jugador piense de otra forma algo que ya vio.
- **Momentos emotivos:** Bernardo y Bartolo (cap. 4), Irene y el héroe (cap. 7), Ilse (cap. 7) y Aurel y las flores (cap. 8).

## M.4 Registro de descubrimientos (sistema que hay que implementar) [PROPUESTA]

Amplía lo que ya existe en el juego: **[CANON]** el registro `Codex` (textos, salas secretas y reliquias) y `Story` (marcas de historia y `endings` reservado). La regla es la que pediste: **no se añade contenido sin definir antes cómo se desbloquea, se guarda y se recompensa.**

| Tipo | Desbloqueo (siempre determinista) | Guardado | Recompensa |
|---|---|---|---|
| Inscripción | Leerla | `codex.lore` | Entrada en el registro y +2 de reputación la primera vez |
| Página de diario | Sala fija que aparece si el paso anterior está hecho | `codex.pages` | Avanza MQ-S y da la pista siguiente |
| Lema de un sello | Tocar la rueda tras el guardián | `codex.lemas` | Entrada en el registro. Necesario para las decisiones finales |
| Recuerdo mágico | Escena con condición | `codex.memories` | Escena que se puede volver a ver y una marca de historia |
| Reliquia | Condición fija | `codex.relics` (ya existe) | Objeto único |
| Sala oculta | Plantilla fija | `codex.secrets` (ya existe) | Cofre |
| Ofrenda | Condición del jefe | `story.offerings` | Objeto de historia único |
| Decisión | Elección o voto | `story.choices` | Consecuencias |
| Final | MQ-8.3 | `story.ending` (ya reservado) | Epílogo, título y cosmético |

- **Guardado:** una migración nueva de la partida añade estos campos sin borrar nada y apunta lo ya descubierto.
- **En línea:** el servidor valida cada descubrimiento (estar cerca, que exista y el paso anterior) y lo guarda en los puntos seguros, sin repetir.
- **Sin azar:** las salas de historia tienen piso fijo. Si la semilla del piso no permite colocarla, el piso se genera con otra semilla derivada, y el resolutor comprueba que se llega en solitario.

## M.5 Dificultad [PROPUESTA]

| Nivel | Qué cambia (nunca solo más vida) |
|---|---|
| Normal | El juego actual |
| Difícil | Cada jefe gana un ataque nuevo. Avisos un 10 % más cortos. Los enemigos flanquean y protegen a los curanderos. Trampas nuevas por región |
| Pesadilla | Otro ataque más por jefe y una fase nueva en los jefes finales. Peligros del escenario que cambian durante el combate. Élites con dos rasgos |

La historia, el registro y la tercera vía son iguales en todos los niveles. Las recompensas mejoran (más objetos raros y cosméticos propios).
