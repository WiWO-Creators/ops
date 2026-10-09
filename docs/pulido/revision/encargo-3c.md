# Revisión manual — Encargo 3C (gemelos de proyecto)

Rama `feat/pulido-3c` (código en `750e9f6`), sobre `feat/pulido-3b`. Se unificaron cuatro pares de
componentes que estaban copiados: los interruptores de filtro en la URL (`BotonFiltroEnUrl`, con la
etiqueta «Completadas» en todas las pantallas), el filtro de vencimiento de Mis tareas (ahora usa
`Segmentado`), las pantallas y editores de plantillas de Proyecto y de Hito (`PantallaDePlantillas`,
`ListaEditable`, `ControlesDeOrden`, `useFilasEditables`) y las secciones de solo lectura de la ficha
de Tarea (`ficha-de-lectura.tsx`, compartido por `DetalleTarea` y `/tarea/[token]`).

Hay dos cambios visibles a propósito: la pastilla deslizante del filtro de vencimiento se sustituye
por el estilo de `Segmentado`, y los comentarios de la ficha pública usan `TarjetaDeComentario`
(avatar e insignia «Cliente» en vez de «· Cliente»).

## Requisitos

- Sesión de staff en el panel. Para crear plantillas de Hito hace falta `create_milestones` sobre
  `projects`; para plantillas de Proyecto, `create`.
- Un enlace público de Tarea vigente (se genera desde «Compartir» en la ficha de una Tarea), con las
  secciones de lista de control, archivos y comentarios activadas.

## 1. Mis tareas — `/mis-tareas`

1. Abre la hoja. Arriba de las listas está el grupo «Hoy / Vencidas / Esta semana / Todas», con
   «Todas» marcada.
2. Pulsa «Hoy»: la URL pasa a `?vence=hoy` y la opción queda marcada (fondo elevado, texto fuerte).
3. Con el foco en «Hoy», pulsa la flecha derecha: el foco pasa a «Vencidas» **sin** cambiar el
   filtro. Enter lo elige (`?vence=vencidas`). Inicio y Fin saltan a la primera y la última opción.
4. En el encabezado, pulsa «Completadas» (antes decía «Ver completadas»): se marca y la URL suma
   `completadas=1` sin perder `vence`. «Creadas por mí» hace lo mismo con `creadas=1`.
5. Refresca la página: los tres filtros siguen puestos. «Atrás» del navegador sale de la hoja, no
   deshace filtro por filtro.
6. En móvil (≈390 px), el grupo de vencimiento cabe o se desplaza en horizontal sin romper la fila.

## 2. Tareas — `/tareas` y `/tareas/tablero`, y la pestaña Tareas de un Proyecto

1. El interruptor dice «Completadas» (antes «Completados»).
2. Púlsalo: la URL suma `filter[status]=5`, se ven solo las completadas y el botón queda marcado.
   Pulsarlo de nuevo quita el filtro y conserva los demás.

## 3. Plantillas de Proyecto — `/proyectos/plantillas`

1. La tabla lista las plantillas; las editables muestran lápiz y papelera al final de la fila.
2. «Nueva plantilla» abre el editor. «Agregar hito» y «Agregar tarea» añaden filas con su animación
   de entrada; el contador junto a «Hitos y tareas» se actualiza.
3. En una fila, «Subir»/«Bajar» la mueven con animación; «Subir» está deshabilitado en la primera y
   «Bajar» en la última. La papelera («Quitar ítem») la quita con animación de salida.
4. Sin filas se ve «Todavía no hay nada. Una plantilla sin ítems crea un proyecto vacío.»
5. Guarda una plantilla: el editor se cierra y la tabla se refresca con la plantilla nueva.
6. Papelera de la fila → la confirmación dice «se borra la plantilla y sus ítems. Los proyectos que
   ya se crearon con ella no se tocan.»; al confirmar, aviso ««Nombre» se eliminó.».
7. Con un usuario sin `create` no aparece «Nueva plantilla»; en una plantilla ajena (`can_edit`
   falso) no aparecen lápiz ni papelera.

## 4. Plantillas de Hito — `/proyectos/plantillas-hito`

1. Igual que el punto 3, con estas diferencias: el editor nuevo arranca con una tarea, el botón de
   alta es solo «Agregar tarea», la papelera se llama «Quitar tarea» y al llegar al tope aparece la
   nota «Una plantilla admite hasta N tareas.» con el botón deshabilitado.
2. Sin filas: «Una plantilla sin tareas no se puede guardar: agrega al menos una.»
3. El filtro «Creada por» de la tabla sigue ofreciendo al equipo.
4. Borrar avisa que «Los hitos que ya se crearon con ella no se tocan.»
5. Sin `create_milestones` no aparece «Nueva plantilla».

## 5. Ficha de Tarea — dialogo del panel y `/tarea/<token>`

1. En el panel abre una Tarea con lista de control, adjuntos y comentarios, en modo lectura: «Lista
   de control 1/2» con ✓ y texto tachado en los hechos, «Archivos» con enlaces (o texto si no hay
   URL) y «Comentarios» con avatar. Nada debe verse distinto de antes.
2. Abre el enlace público en una ventana privada: la lista de control va dentro del bloque de avance
   (sin título propio), «Archivos» y «Comentarios» son títulos de nivel 2, los comentarios muestran
   avatar con iniciales y la insignia «Cliente» en los del cliente. Los adjuntos sin URL se ven como
   texto.
3. Secciones activadas pero vacías: «Sin archivos adjuntos.» y «Todavía no hay comentarios.».
   Secciones no activadas: no se dibujan.

## Comprobado

- `pnpm lint && pnpm typecheck && pnpm test && pnpm build` en verde (2604 pruebas).
- `pruebas/filtros.browser.mjs` y `pruebas/avisos-error.browser.mjs` pasan contra el mock (con la
  jornada abierta por API antes).
- Sonda Playwright temporal contra el mock más un stub de `/project-templates`, `/hito-plantillas`,
  `/public/tasks/{token}` y `create_milestones`: pasos 1.1–1.5, 2.1–2.2, 3.2–3.3 y 3.6, 4.1 (sin tope)
  y 4.4, y 5.2 en móvil, sin errores de página. Capturas revisadas de Mis tareas, editor de plantilla
  y ficha pública.

## Sin verificar

- Guardar y borrar de verdad una plantilla (pasos 3.5, 3.6 confirmado, 4.x con guardado): el mock no
  sirve esas rutas.
- El tope de tareas de las plantillas de Hito, los permisos reales (3.7, 4.5) y el punto 5.1 en el
  diálogo del panel con datos reales.
- El punto 1.6 en móvil y el tema oscuro de todas las pantallas.
