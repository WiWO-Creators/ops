# Pulido de Ops — índice y plan

Auditoría del 29-09-2026 sobre `ops-v2` (`main` en f2b96cf). Objetivo: que el sistema se sienta
terminado, completo y pulido, con la entrada animada nueva (`entrada-pagina.css`,
`EntradaEscalonada`, coreografías de bienvenida) como vara de movimiento.

Ningún documento de esta carpeta cambió código. Cada hallazgo trae dónde, qué pasa, propuesta,
prioridad y esfuerzo.

| Documento | Alcance | Alta | Media | Baja |
|---|---|---|---|---|
| [01-proyecto-y-tareas.md](01-proyecto-y-tareas.md) | Proyecto, tareas, recurrencia, mis tareas, ficha pública de tarea | 3 | 15 | 14 |
| [02-componentes-base-y-transversal.md](02-componentes-base-y-transversal.md) | Primitivos, estilos, `lib`, taller, adopción transversal | 5 | 9 | 6 |
| [03-modulos-del-panel.md](03-modulos-del-panel.md) | Clientes, prospectos, licitaciones, equipo, organización, administración… | 7 | 12 | 7 |
| [04-portal-y-superficies-externas.md](04-portal-y-superficies-externas.md) | Portal del cliente, acceso, salas, pantallas, live, IA, archivos | 4 | 8 | 9 |

## Verificación

Los hallazgos de prioridad alta y los más llamativos se contrastaron contra el código. Se
descartaron o corrigieron:

- **P3-09/P3-10** (descartados): que `/prospectos` se titule «Licitaciones» es deliberado
  (`REVISION-nombre-licitaciones.md`).
- **P2-06 y P4-06** (bajados a Baja): `thinking-orb.css` no tiene código muerto verificable; es
  generado y conserva la cascada v1→v6 a propósito.
- **P3-20** (reencuadrado): el problema de Novedades no es la falta de entrada, sino dos
  coreografías superpuestas en la misma cabecera.
- **P3-21** (precisado): las fichas sí animan `h1` y grupos; solo les falta la firma de marca.
- **P1-01** (anotado): el pulso infinito de la píldora de estado es intencional; choca con el
  guardrail y requiere decisión de producto.

Lo no contrastado uno por uno queda como «verificado por el auditor»: conviene revisar cada
hallazgo al tomarlo.

## Decisiones tomadas (30-09-2026)

Mandan sobre la propuesta que traiga cada hallazgo.

| Tema | Decisión | Afecta |
|---|---|---|
| Pulso infinito de la píldora de estado del Proyecto | **Se mantiene.** Documentarlo como excepción explícita en `docs/sistema-de-diseno.md` § Guardrails (junto a la de `.lienzo-vivo`), con su motivo. No quitarlo. Sí corregir `MiniLlamada.tsx:92`, que pulsa sin `motion-safe:`. | P1-01, P2-05 |
| Primitivos del inventario que no existen (`Tooltip`, `Casilla`, `AreaTexto`, `Progreso`, `Dinero`, `PanelDetalle`, `Emergente`, `Migas`, `Paginacion`) | **Corregir el inventario** de `sistema-de-diseno.md` para que refleje lo que existe. Crear un primitivo solo si hay 3 o más usos reales hechos a mano que lo justifiquen, y dejarlo anotado. | P2-10 |
| Sistema de entrada escalonada | **`EntradaEscalonada`** (anime.js) es el único. Migrar `retrasoDeAparicion` (tablas, `TarjetasProyectos`, `VistaClientes`) y `.rec-escalonada` (recurrencia) a él, y borrar los otros dos. | P1-26, P2-02, P3-23, P1-27, P3-20 |

## Temas que atraviesan los cuatro documentos

Varios hallazgos son el mismo problema visto desde áreas distintas. Conviene resolverlos una vez.

| Tema | Hallazgos | Qué hacer |
|---|---|---|
| Confirmaciones con `confirm()` nativo | P1-02, P2-01, P3-12, P4-11 | Pasar los 5 usos a `ConfirmarBorrado`/`ConfirmacionEnLinea`/`Dialogo` |
| Estados de carga ausentes o heredados | P1-19, P3-26, P4-08, P1-23 | `loading.tsx` en mis tareas, fichas `[id]` y secciones del portal |
| Cabeceras sin firma de marca | P3-01, P3-21, P4-01 | Fichas y portal con `TituloModulo` o una cabecera de ficha que incluya la firma |
| Tres sistemas de escalonado | P1-26, P2-02, P3-23, P1-27, P3-20 | Unificar en `EntradaEscalonada` (o en `retrasoDeAparicion`) y extenderlo a listas y tarjetas |
| Aparecer y desaparecer de golpe | P2-11, P2-16, P2-18, P1-03, P1-29, P3-24, P4-17, P4-18 | Tokens `animate-*` de entrada y salida en superposiciones propias, acordeones y paneles |
| Aviso tras guardar | P1-05, P3-18, P4-03 | Regla: toda mutación exitosa llama `useAviso().exito()` |
| Utilidades duplicadas | P1-08…P1-11, P2-09, P4-05, P4-07 | Consolidar en `src/lib` (fechas, duraciones, iniciales, `SIN_DATO`) |
| Textos | P3-15, P3-16, P3-17, P1-04, P1-06, P1-07, P3-11 | Tuteo único, «Eliminar» único, verbos de confirmación y `GLOSARIO` |
| Movimiento fuera de tokens | P4-04, P2-17, 88 `duration-N` literales | Pasar a `--wiwo-motion-*` y agregar lint para `animate-pulse`/`ping` fuera de `estado/` |

## Plan por encargos

Cada encargo cabe en una conversación sin compactar (objetivo: contexto máximo < 150k tokens).
Se toman **en orden**: 2A antes que 2B porque 2B reutiliza la `EntradaEscalonada` extendida.
Los números de la columna «Tokens» son el total procesado estimado si se siguen las reglas de
ahorro de más abajo.

| Encargo | Contenido | Archivos aprox. | Tokens |
|---|---|---|---|
| **1** | Confirmaciones, `loading`/`error`, cabeceras del portal, `aria-label`, tuteo, Novedades, pulso | 20–25 | 2–4 M |
| **2A** | Escalonado único: extender `EntradaEscalonada`, migrar `retrasoDeAparicion` y `.rec-escalonada` | 8–12 | 2–4 M |
| **2B** | Aplicar la entrada a listas y tarjetas; firma de marca en fichas | 12–18 | 2–4 M |
| **2C** | Salidas animadas, acordeones y paneles, entrada en acceso/clave/ficha pública, duraciones a tokens, lint | 15–25 | 3–5 M |
| **3A** | Matriz de asignación N-a-M única y un solo `PanelDePersona` | 6–10 | 3–5 M |
| **3B** | Selectores unificados, inventario del sistema de diseño, aviso tras guardar | 15–30 | 3–5 M |
| **3C** | Gemelos de proyecto (P1-12…P1-15) | 8–12 | 2–4 M |
| **4A** | Partir `AltaRapidaProceso` | 1 → 5–8 | 3–5 M |
| **4B** | Partir `DetalleActa` y `TareasPropuestas` | 2 → 8–12 | 3–5 M |
| **4C** | Tokens CSS, `z-index`, `text-[px]`, taller, comentario del taller (P2-08, P2-19, P2-20, P1-24, P2-12, P1-32) | 10–20 | 2–4 M |

### Encargo 1 — Rápidas y visibles (esfuerzo S)

1. Reemplazar los 5 `confirm()` nativos: `DetalleActa.tsx:520`, `acta/TareasPropuestas.tsx:410`,
   `FlujoLicitacion.tsx:127` y `:355`, `app/s/[clave]/Tablero.tsx:109`.
2. Portal: `h1` planos por `TituloModulo` (P4-01).
3. `loading.tsx` faltantes: `mis-tareas` (P1-19) y fichas `[id]` que hoy muestran el esqueleto
   del listado (P3-26).
4. `error.tsx` propio para `/sala/[token]` y `/s/[clave]` (P4-09).
5. `aria-label` obligatorio en el tipo de `Boton` cuando `soloIcono` (P2-13).
6. Voseo a tuteo en los 9 archivos con textos visibles (P3-15).
7. Una sola coreografía en la cabecera de Novedades e Inicio (P3-20).
8. Documentar la excepción del pulso de la píldora de estado (P1-01) y agregar `motion-safe:` en
   `MiniLlamada.tsx:92`.

### Encargo 2A — Escalonado único (M)

1. Extender `EntradaEscalonada` para que pueda repetir la entrada cuando cambia una clave (página,
   filtro, orden) sin reanimar en cada refresco de datos.
2. Migrar a él `retrasoDeAparicion` (`TablaRecurso`, `TarjetasProyectos`, `VistaClientes`) y
   `.rec-escalonada` (recurrencia); borrar ambos (P1-26, P2-02).

### Encargo 2B — Entrada en listas y fichas (M)

1. Aplicar `EntradaEscalonada` a listas y tarjetas hechas a mano (P3-23, P1-27).
2. Firma de marca en cabeceras de ficha (P3-21, P3-01).

### Encargo 2C — Salidas, colapsables y tokens (M)

1. Salidas animadas en `OrbeChatIA` y `TarjetaFlotantePersona` (P2-16, P2-11).
2. Acordeones y paneles colapsables con transición común (P2-18, P1-03, P1-29, P3-24, P1-28).
3. Entrada en acceso, clave y ficha pública (P4-16, P1-23).
4. Duraciones literales a tokens (P4-04, P2-17) y regla de lint para `animate-pulse`/`animate-ping`
   fuera de `componentes/estado/`, con la excepción documentada de la píldora de estado.

### Encargo 3A — Asignación y persona (L)

1. Matriz de asignación N-a-M única para focals y supervisión (P3-06).
2. Un solo `PanelDePersona` en Organización (P3-05).

### Encargo 3B — Selectores, inventario y avisos (M)

1. Selectores de persona y relación unificados (P2-07, P3-07).
2. Corregir el inventario de `sistema-de-diseno.md` a lo que existe (P2-10); crear primitivos solo
   donde haya 3 o más usos reales hechos a mano.
3. Aviso tras guardar en todas las mutaciones (P3-18, P1-05, P4-03).

### Encargo 3C — Gemelos de proyecto (M)

Filtros en URL, `FiltrosDeVencimiento`, plantillas de Proyecto y de Hito, ficha pública frente a
`DetalleTarea` (P1-12…P1-15).

### Encargo 4A — Partir `AltaRapidaProceso` (L)

~1.200 líneas y 55 `useState` (P1-30). Sin cambio de comportamiento.

### Encargo 4B — Partir `DetalleActa` y `TareasPropuestas` (M)

Más de 1.000 líneas cada uno (P1-31). Sin cambio de comportamiento.

### Encargo 4C — Tokens y escalas (M)

Tokens duplicados (P2-08), escala de `z-index` (P2-19), tamaños de texto arbitrarios (P2-20,
P1-24), taller (P2-12) y comentario desactualizado (P1-32).

### Encargos de remanentes (5A–5E)

Añadidos el 30-09-2026 tras cerrar 1…4C, para cubrir los hallazgos que el plan no asignaba. Mismas
reglas; se encadenan sobre `feat/pulido-4c` en este orden.

| Encargo | Contenido | Hallazgos |
|---|---|---|
| **5A** | Textos y avisos | P1-05 (resto: acta y propuestas), P1-06, P1-07, P1-25, P3-11, P3-13, P3-14, P3-16, P3-17, P3-19, P4-02 |
| **5B** | Utilidades duplicadas | P1-08, P1-09, P1-10, P1-11, P1-18, P2-09, P3-28, P4-05, P4-07 |
| **5C** | Carga, error y vacío | P4-08, P1-16, P1-17, P1-20, P1-21, P1-22, P2-05, P2-06, P2-15, P4-06, P4-10, P4-15 |
| **5D** | Cabeceras y controles de ficha | P3-02, P3-03, P3-04, P3-08, P3-22, P2-03, P2-04, P2-14 |
| **5E** | Portal, móvil y movimiento | P4-19, P4-12, P4-13, P4-14, P4-17, P4-18, P4-20, P4-21, P3-25, y las `duration-N` literales restantes (tema «Movimiento fuera de tokens») |

## Cómo trabajar esto

Reglas para el agente que tome un encargo:

1. **Un encargo por conversación**, en worktree y rama propios (`feature-aislada`), p. ej.
   `ops-v2-wt-pulido-2a` / `feat/pulido-2a`. No mezclar encargos.
2. **Verificar antes de arreglar.** Los hallazgos los escribió un modelo rápido y 5 de 15
   revisados estaban mal. Abrir el código de cada uno; si no se sostiene o ya está resuelto,
   marcarlo en su documento como `(descartado)` o `(ya resuelto)` con el motivo, y seguir.
3. **Respetar lo deliberado.** No tocar: el nombre «Licitaciones» de `/prospectos`, la cascada de
   `thinking-orb.css` (es generado), el pulso de la píldora de estado, el movimiento de
   `.lienzo-vivo` del Inicio, las animaciones `infinite` de `/pantalla` (es cartelería).
4. **Next.js 16 no es el que conoces**: antes de tocar `loading.tsx`, `error.tsx`, `template.tsx`
   o `ViewTransition`, leer la guía en `node_modules/next/dist/docs/` (ver `AGENTS.md`).
5. **Solo front.** Ningún encargo requiere cambios en `wiwo-board`; si alguno pareciera
   necesitarlo, anotarlo y no hacerlo.
6. **Guardrails** de `docs/sistema-de-diseno.md`: sin `backdrop-filter: blur` en superficies siempre
   visibles, sin `infinite` en lo siempre visible, todo con `prefers-reduced-motion`, movimiento
   con los tokens `--wiwo-motion-*` y `animate-*` de `globals.css`.
7. **Verificación**: ver «Verificación barata» abajo. Antes de dar el encargo por terminado:
   `pnpm lint && pnpm typecheck && pnpm test && pnpm build` en verde **una vez**, más las pruebas
   `pruebas/*.browser.mjs` de las pantallas tocadas y una pasada visual de lo animado.
8. **Cierre**: marcar cada hallazgo resuelto en su documento con `(resuelto en <hash>)`, dejar una
   guía de revisión manual (`explicacion-review`) y no mergear a `main` sin aprobación.

## Reglas de ahorro de tokens

Obligatorias. El gasto de estos encargos está en leer de más y en repetir verificaciones.

### Lectura

1. **Del índice, solo lo necesario**: «Decisiones tomadas», el encargo propio y estas reglas. No leer
   los otros encargos.
2. **De los documentos de detalle, solo los hallazgos del encargo**: localizarlos con
   `rg -n '^### P1-26' -A8 docs/pulido/01-proyecto-y-tareas.md` en vez de abrir el documento entero.
3. **Código por rangos**: `rg -n` para ubicar y `Read` con `offset`/`limit` (±40 líneas). No abrir
   enteros los archivos de más de 400 líneas (`AltaRapidaProceso`, `DetalleActa`, `TareasPropuestas`,
   `BarraLateral`, `TablaRecurso`, `globals.css`, `thinking-orb.css`).
4. **No releer** un archivo recién editado para confirmar la edición.
5. **No leer** `docs/contrato-api.md` (374 KB), lockfiles, `graphify-out/`, `node_modules/` salvo la
   guía puntual de Next (`rg -l` en `node_modules/next/dist/docs/` y abrir solo la página del
   tema), ni `.sql`/`.gz` de la raíz.
6. **No leer** `docs/sistema-de-diseno.md` completo: solo la sección que toca el encargo (Movimiento,
   Guardrails o Inventario) con `rg -n '^## ' ` para ubicarla.

### Verificación barata

1. **Mientras se trabaja**, solo sobre lo tocado:
   `pnpm exec eslint <archivos tocados>` y `pnpm exec tsc --noEmit 2>&1 | head -40` (tras un
   `pnpm typecheck` inicial, que genera los tipos de rutas de Next).
2. **Pruebas unitarias puntuales**: `node --test pruebas/<nombre>.test.js` de lo relacionado, no la
   batería entera en cada cambio.
3. **Batería completa una sola vez**, al final: `pnpm lint && pnpm typecheck && pnpm test && pnpm build`.
   Si falla, arreglar y repetir **solo el paso que falló**, y la batería completa otra vez al final.
4. **Salidas acotadas**: usar `rtk` cuando aplique; de `pnpm build` y `pnpm test` mirar el resumen
   y los errores (`2>&1 | tail -60`), no la salida entera. Nunca ocultar el código de salida.
5. **Navegador**: solo las pruebas `pruebas/*.browser.mjs` de las pantallas tocadas y capturas de
   las superficies animadas (claro/oscuro, escritorio/móvil). Sin snapshots de accesibilidad de
   páginas enteras si basta una captura.

### Delegación

1. **Verificar los hallazgos con un subagente rápido** (`explore`, modelo `flash`) antes de
   implementar: le pasas la lista de IDs y devuelve, por cada uno, «vigente / descartado / ya
   resuelto» con `ruta:línea`, en menos de 30 líneas. El agente principal no relee lo ya confirmado.
   Si el proveedor del modelo rápido falla, reintentar una vez y después usar el modelo por defecto.
2. **Sin subagentes para implementar** en encargos de menos de 15 archivos: coordinar cuesta más
   que hacerlo.
3. **Si el contexto supera ~150k**, cerrar el encargo en un punto estable (commit en la rama),
   dejar anotado en el índice qué hallazgos quedan, y seguir en una conversación nueva.

### Salida

1. Sin narración de herramientas ni resúmenes intermedios largos; al final, un punto por hallazgo:
   resuelto, descartado o pendiente.
2. Las ediciones a los documentos de `docs/pulido/` son solo la marca del hallazgo y su hash, no
   reescrituras.

## Prompt para encargar

Cambiar el código de encargo (`1`, `2A`, `2B`…):

> Resuelve el **encargo 1** de `ops-v2/docs/pulido/00-indice.md`. Lee de ese índice solo
> «Decisiones tomadas», la sección del encargo, «Cómo trabajar esto» y «Reglas de ahorro de
> tokens», y cúmplelas. Verifica los hallazgos con un subagente rápido antes de implementar.
> Trabaja en worktree propio, deja los hallazgos marcados con su hash y una guía de revisión
> manual; no mergees a `main`.
