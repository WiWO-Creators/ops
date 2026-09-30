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

## Plan sugerido por tandas

### Tanda 1 — Rápidas y visibles (esfuerzo S)

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

### Tanda 2 — Movimiento unificado (M)

1. `EntradaEscalonada` como único sistema de escalonado; migrar los otros dos y aplicarlo a listas
   y tarjetas (P1-26, P3-23, P1-27).
2. Firma de marca en cabeceras de ficha (P3-21, P3-01).
3. Salidas animadas en `OrbeChatIA` y `TarjetaFlotantePersona` (P2-16, P2-11).
4. Acordeones y paneles colapsables con transición común (P2-18, P1-03, P1-29, P3-24).
5. Entrada en acceso, clave y ficha pública (P4-16, P1-23).
6. Duraciones literales a tokens y lint del guardrail de `infinite` para clases de Tailwind.

### Tanda 3 — Componentes compartidos (M–L)

1. Matriz de asignación N-a-M única para focals y supervisión (P3-06).
2. Un solo `PanelDePersona` en Organización (P3-05).
3. Selectores de persona y relación unificados (P2-07, P3-07).
4. Corregir el inventario de `sistema-de-diseno.md` a lo que existe (P2-10); crear primitivos solo
   donde haya 3 o más usos reales hechos a mano.
5. Aviso tras guardar en todas las mutaciones (P3-18, P1-05, P4-03).
6. Gemelos de proyecto: filtros en URL, `FiltrosDeVencimiento`, plantillas de Proyecto y de Hito,
   ficha pública frente a `DetalleTarea` (P1-12…P1-15).

### Tanda 4 — Deuda técnica (L)

- Partir `AltaRapidaProceso` (~1.200 líneas, 55 `useState`), `DetalleActa` y `TareasPropuestas`
  (P1-30 y siguientes).
- Tokens duplicados entre `tokens.css`, `neo-tokens.css` y `globals.css` (P2-08).
- Escala de `z-index` (P2-19) y tamaños de texto arbitrarios (P2-20, P1-24).
- Completar el taller con los estados que promete el sistema de diseño (P2-12).

## Cómo trabajar esto

Reglas para el agente que tome una tanda:

1. **Una tanda por encargo**, en worktree y rama propios (`feature-aislada`), p. ej.
   `ops-v2-wt-pulido-tanda1` / `feat/pulido-tanda1`. No mezclar tandas.
2. **Verificar antes de arreglar.** Los hallazgos los escribió un modelo rápido y 5 de 15
   revisados estaban mal. Abrir el código de cada uno; si no se sostiene o ya está resuelto,
   marcarlo en su documento como `(descartado)` o `(ya resuelto)` con el motivo, y seguir.
3. **Respetar lo deliberado.** No tocar: el nombre «Licitaciones» de `/prospectos`, la cascada de
   `thinking-orb.css` (es generado), el pulso de la píldora de estado, el movimiento de
   `.lienzo-vivo` del Inicio, las animaciones `infinite` de `/pantalla` (es cartelería).
4. **Next.js 16 no es el que conoces**: antes de tocar `loading.tsx`, `error.tsx`, `template.tsx`
   o `ViewTransition`, leer la guía en `node_modules/next/dist/docs/` (ver `AGENTS.md`).
5. **Solo front.** Ninguna tanda requiere cambios en `wiwo-board`; si alguno pareciera
   necesitarlo, anotarlo y no hacerlo.
6. **Guardrails** de `docs/sistema-de-diseno.md`: sin `backdrop-filter: blur` en superficies siempre
   visibles, sin `infinite` en lo siempre visible, todo con `prefers-reduced-motion`, movimiento
   con los tokens `--wiwo-motion-*` y `animate-*` de `globals.css`.
7. **Verificación** antes de dar la tanda por terminada: `pnpm lint && pnpm typecheck && pnpm test
   && pnpm build` en verde, más las pruebas `pruebas/*.browser.mjs` de las pantallas tocadas y una
   pasada visual en navegador (claro y oscuro, escritorio y móvil) de lo animado.
8. **Cierre**: marcar cada hallazgo resuelto en su documento con `(resuelto en <hash>)`, dejar una
   guía de revisión manual (`explicacion-review`) y no mergear a `main` sin aprobación.

Prompt sugerido (cambiar el número de tanda):

> Resuelve la **Tanda 1** de `ops-v2/docs/pulido/00-indice.md`. Lee primero ese índice completo
> (decisiones y reglas incluidas) y los documentos de los hallazgos que cubre la tanda. Trabaja en
> worktree propio, verifica cada hallazgo en el código antes de cambiarlo y sigue las reglas de
> «Cómo trabajar esto». Al terminar, deja los hallazgos marcados y una guía de revisión manual;
> no mergees a `main`.
