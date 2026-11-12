# Estado del proyecto

- **Actualizado:** 2026-11-12, por Claude.
- **Último informe:** [INF-010](INFORMES_CLAUDE.md) (GitHub como canal de coordinación y entorno local de IA, fase A).
- **Canal:** este archivo se publica en la rama `coordinacion` de GitHub al terminar cada tarea (D-029). Por dónde empezar: [README.md](README.md), sección «Revisa Eldoria».
- **Cómo se mantiene:** este documento se reescribe en cada actualización; el historial está en Git y en [INFORMES_CLAUDE.md](INFORMES_CLAUDE.md).
- **Estado anterior de referencia:** la sección 17 de `docs/PLAN.md` («Estado de cada parte») sigue en su sitio como histórico del plan del cooperativo. El estado vigente es este documento.

## Versión publicada

| | |
|---|---|
| `main` | **0.46** (build 46), commit `5d28bcf`, etiqueta `v0.46` |
| Instalador de Windows | Compilado por GitHub Actions para 0.44, 0.45 y 0.46 (resultado «success» comprobado en la API de GitHub) |
| Publicado en `main` el 2026-11-10 | 0.44 (secretos, cadena oculta de Irene, finales), 0.45 (capítulo 1 «Las raíces enfermas») y 0.46 (auditoría del capítulo 1 y correcciones) |

Las versiones 0.45 y 0.46 se subieron directamente a `main`, **antes** de que existiera el protocolo actual (D-001).

## 1. Implementado y probado (en `main`)

Probado con la batería automatizada (`tests/run-all.sh`) en la 0.46: 215 pruebas unitarias, 29 multijugador con Colyseus real, 21 de despliegue y 25 recorridos de navegador. Todas correctas.

- **Combate y clases:** cuatro clases (Guerrero, Arquero, Mago, Asesino), cada una con su ataque básico y **una** habilidad.
- **Enemigos y jefes:** 47 variantes de enemigos y jefes con mecánicas propias (BossKit).
- **Mazmorras:** generación procedural con validación de rutas.
- **Aldea:** reputación, contratos, forja, eventos y tienda.
- **Guardado:**
  - sin conexión: versión 10 con migraciones y copia de seguridad;
  - en línea: perfiles en el servidor.
- **Cooperativo de hasta 4:** servidor con autoridad (Colyseus); reconexión, expediciones interrumpidas, cambio de anfitrión y recompensas sin duplicar.
- **Campaña y capítulo 1:** cadenas secretas, finales, Raíces Hondas y el capítulo 1 completo (`docs/CAPITULO_1.md`).

**Lo que no se ha probado:** partidas jugadas a mano por una persona, el servidor desplegado en Internet, PostgreSQL y dispositivos táctiles reales.

## 2. Implementado pendiente de pruebas

Nada. Lo implementado en `main` y en las ramas abiertas tiene sus pruebas automatizadas ejecutadas y correctas.

Queda pendiente la **prueba manual por una persona** de:

- el rediseño de la interfaz;
- la asistencia del Arquero;
- la dificultad de Robletón en solitario.

## 3. En desarrollo

**Dirección artística «Hybrid 2D Fantasy»** (D-015, aprobada el 2026-11-11):

- **Etapa 1 hecha:** documentación y pruebas aisladas, a falta de revisión (INF-009).
- **Ningún cambio en el juego:** el arte, el renderizador, los mapas y la interfaz siguen como en `main` 0.46.
- **Siguiente, la etapa 2 (arquitectura gráfica)**, que espera:
  - la medición en los equipos del director;
  - la autorización para comparar con PixiJS en pruebas (D-025).

**Entorno local de creación de arte con IA** (D-030, encargo del director del 2026-11-12):

- **Fase A (auditoría) hecha** (INF-010): equipo con RX 7800 XT de 16 GB, compatible con ComfyUI y ROCm en Windows según la documentación de ComfyUI.
- **Nada instalado todavía.**
- **Fases B a E** (instalación, modelos, pruebas y manual): esperan el resto del encargo y el visto bueno del director a las descargas.

## 4. Pendiente de revisión o fusión

| Rama | Commits sobre `main` | Contenido | Pruebas | Estado |
|---|---|---|---|---|
| `tarea/interfaz-mmo` | `a3972ab`, `00d6d8f` | Barra de consumibles (X, Z, C) e inventario en dos paneles, común a aldea y expedición (INF-004, `docs/INTERFAZ_INVENTARIO.md` en la rama) | Batería completa correcta. Nuevas: inventario sin conexión 18/18 y en línea 8/8 | **Pendiente de revisión y de autorización de fusión** |
| `tarea/arquero-apuntado` | `94afb02` | Apuntado del Arquero: al sprite (pies), asistencia de 12° opcional, destellos confirmados por el servidor (INF-007, `docs/ARQUERO_APUNTADO.md` en la rama) | Batería completa correcta. Nuevas: 12/12 sin conexión y 5/5 en línea con 280 ms | **Pendiente de revisión y de autorización de fusión** |
| `tarea/auditoria-visual` | `3b9885d` | Auditoría visual: 39 capturas reales e informe `docs/AUDITORIA_VISUAL_ELDORIA.md` (INF-008). Solo documentación | No aplica (sin cambios de código); `split-prototype --check` correcto | **Pendiente de la evaluación de ChatGPT**. Propuesta: no fusionar las imágenes en `main` (peso de las actualizaciones) |
| `tarea/direccion-artistica` | `05a1d8e` | Dirección artística: ocho documentos en `docs/arte/` (INF-009). Solo documentación | No aplica (sin cambios de código); `split-prototype --check` correcto | **Pendiente de revisión.** No se fusiona sin autorización |

**Aviso de fusión:** las dos ramas parten de `0.46` y modifican `prototype/mystery-action.html` (en zonas distintas) y los archivos que se generan a partir de él:

- `client/public/game.js`;
- `client/index.html`;
- `shared/engine-core.generated.js`.

Al fusionar la segunda habrá conflictos en los generados. Se resuelven regenerándolos (`node tools/split-prototype.mjs`) y volviendo a ejecutar toda la batería. Ninguna de las dos ramas cambia `version.json`: la versión se decidirá al fusionar.

## 5. Problemas abiertos

Vienen de la auditoría integral (INF-005) y de la del capítulo 1 (INF-002). **Ninguno está corregido todavía** y el director no ha decidido aún el orden.

| Id | Problema | Gravedad |
|---|---|---|
| E-1 | En línea, «Lanzar» semillas solo ocurre en el cliente: la mochila del cliente y la del servidor dejan de coincidir y el efecto no es real | ALTO |
| E-2 | En expediciones en línea no funcionan 7 consumibles: Cristal de experiencia, Semilla ojo y 5 orbes. Se venden y salen en el botín | ALTO |
| I-1 | Progresión de habilidades incompleta: una habilidad por clase; los huecos de los niveles 7, 10 y 14 se abren vacíos y no hay definitivo | ALTO |
| I-2 | No hay controles táctiles para moverse ni combatir | ALTO si el móvil es objetivo |
| — | Los contadores del capítulo no van por capítulo: hay que corregirlo antes del capítulo 2 | MEDIO |
| — | El Linde se puede repetir sin coste (botín y tablón) | MEDIO |
| — | `run-all.sh` se detiene en el primer fallo y oculta el resto | MEDIO |
| — | SQLite de Node es experimental (almacén por defecto) y PostgreSQL no se ha probado en este entorno | MEDIO |
| E-3 | Partidas antiguas dañadas pueden provocar una excepción en las migraciones | BAJO |
| E-4 | Hay un `.pyc` de caché de Python en el repositorio | BAJO (borrarlo requiere autorización) |

## 5 bis. Decisiones de dirección artística pendientes

D-020 a D-028 en `DECISIONES_PROYECTO.md`. D-022 debe rehacerse sin contratación de artistas (D-030):

- D-020: orden de trabajo;
- D-021: niveles y vistas;
- D-022: producción del piloto;
- D-023: animación;
- D-024: bosque abierto;
- D-025: prueba con PixiJS;
- D-026: distribución;
- D-027: equipos de referencia;
- D-028: licencias.

## 6. Prioridades vigentes

**Sin decidir.** Pendiente de que el director elija el orden de corrección de los problemas abiertos y de la revisión de las dos ramas.

Propuesta de Claude, no aprobada (D-008, INF-005):

1. E-1;
2. E-2;
3. I-1;
4. I-2.
