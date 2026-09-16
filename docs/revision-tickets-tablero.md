# Revisión de WIW-0362, WIW-0366 y WIW-0367

## Cambios

- **WIW-0362:** Completados muestra la columna correspondiente directamente. El botón elimina filtros de estado contradictorios y conserva búsqueda y otros filtros.
- **WIW-0366:** cada hito muestra pendientes primero y completadas al final, incluso entre páginas. Dentro de cada grupo se conserva el orden manual. Completar o reabrir una tarea actualiza su posición.
- **WIW-0367:** el tablero se desplaza al arrastrar cerca de sus bordes. Incluye botones de navegación, flechas de teclado y la alternativa «Mover a…» para todos los destinos, también en móvil.

## Entorno de revisión

- Frontend: `/home/wiwo/ops.wiwo/ops-v2-wt-tickets-tablero`.
- Backend: `/home/wiwo/ops.wiwo/wiwo-board-wt-tickets-tablero`.
- Rama en ambos repositorios: `feat/tickets-tablero`.

## Pruebas manuales

1. Abrir `/procesos/tablero`. Pulsar **Completados**: debe verse la columna de completadas, sin tener que desplazarse detrás de columnas vacías. Volver a pendientes y comprobar los filtros conservados.
2. Repetir con búsqueda sin resultados: se muestra la columna vacía, sin error. Probar también el tablero de tareas de un proyecto y el portal con permisos limitados.
3. Abrir `/proyectos/{id}` y el tablero de hitos. Mostrar completadas y comprobar que las pendientes preceden a las completadas en cada hito. Con más de una página, cargar más: ninguna completada debe anteceder a una pendiente de la página siguiente.
4. Completar una tarea pendiente y reabrir una completada: tras guardar deben pasar al grupo correspondiente. El orden manual dentro de cada grupo se mantiene.
5. En un tablero más ancho que la pantalla, arrastrar una tarjeta hacia el borde derecho y mantener el puntero allí. Deben aparecer las columnas siguientes. Soltar sobre una de ellas y comprobar el nuevo estado tras recargar. Repetir hacia la izquierda.
6. Probar los botones de navegación. Enfocar «Columnas del tablero» y usar las flechas izquierda/derecha. Las flechas no deben interferir con otros controles enfocados.
7. En móvil, abrir **Mover a…** y elegir un destino fuera de pantalla. Debe guardar el movimiento. Las columnas deben caber en el ancho disponible sin ensanchar toda la página.
8. Cancelar un arrastre o sacar el puntero del tablero: el desplazamiento debe detenerse. Simular un error de guardado: debe mostrarse el error y conservarse el estado previo.

## Alcance

Se mantienen permisos, filtros y paginación. No se cambian estados de tareas existentes por desplegar esta corrección. Las pruebas locales usan datos simulados; no modifican tareas reales.

## Verificaciones realizadas

- Suite frontend: 1558 pruebas aprobadas, más seis pruebas HTTP nuevas de completados e hitos.
- Backend: regresiones de columnas filtradas, hitos paginados, filtros, tareas sin proyecto y 80 comprobaciones del portal aprobadas.
- TypeScript, ESLint y detector de interfaz sin errores.
- Build de producción aprobado con `next build --webpack`. Turbopack tuvo errores de resolución de dependencias en este worktree; no se cambió la configuración del proyecto.
- Chromium, escritorio de 1280 px y móvil de 390 px: completados directamente visible, navegación por botones/teclado, autodesplazamiento durante arrastre y guardado en otra columna, menú móvil y ausencia de desbordamiento horizontal de la página.
- El mock no implementa presencia ni presets; sus respuestas 404 no corresponden a los flujos corregidos.
