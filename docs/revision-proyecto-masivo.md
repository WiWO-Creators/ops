# Revisión de asignación masiva a proyecto

La opción **Agregar a proyecto** aparece al seleccionar tareas y abrir **Acción masiva**. Permite elegir un destino y trasladar todas las tareas seleccionadas en una sola operación. Está disponible en el listado general y en la pestaña de tareas de un proyecto.

## Cambios aislados

- Frontend: `/home/wiwo/ops.wiwo/ops-v2-wt-proyecto-masivo`, rama `feat/proyecto-masivo`.
- Backend: `/home/wiwo/ops.wiwo/wiwo-board-wt-proyecto-masivo`, rama `feat/proyecto-masivo`.
- La vista de prueba del frontend usa `http://localhost:3118/procesos` y una API mock local. La prueba de navegador simula la respuesta de la acción masiva; no escribe datos reales.
- Para validar persistencia con PHP, usa el backend del worktree y configura `API_BASE` del frontend hacia ese servidor aislado. Frontend y backend deben integrarse juntos.

## Pasos

1. Abre `/procesos` con permiso de edición de tareas. Selecciona al menos dos filas, incluyendo una tarea sin proyecto.
2. Abre **Acción masiva → Agregar a proyecto**. El diálogo debe indicar cuántas tareas moverá y ofrecer los proyectos disponibles.
3. Elige **Proyecto destino** y pulsa **Agregar a proyecto**. Al terminar debe refrescar el listado y limpiar la selección.
4. Abre las tareas trasladadas. Deben pertenecer al proyecto elegido y conservar asignados, seguidores y etiquetas. Si venían de otro proyecto, deben quedar sin el hito y tipo anteriores.
5. Selecciona una tarea que ya pertenece al destino y repite la acción. Sus hitos y tipo deben conservarse.
6. Repite desde la pestaña de tareas de un proyecto. Las trasladadas a otro proyecto deben desaparecer del listado de origen al refrescar.

## Casos límite

- Sin destino, cargando o sin proyectos disponibles: el botón de envío debe estar deshabilitado.
- Fallo de carga: mostrar el error e indicar cómo reintentar; cerrar y volver a abrir vuelve a pedir el catálogo.
- Fallo del envío: conservar destino y selección para reintentar. Cancelar antes de enviar no modifica tareas.
- Sin permiso de edición: ocultar la opción; el backend también rechaza la solicitud.
- Destino inexistente, inaccesible o ID inválido: rechazar la operación sin trasladar tareas.
- Tareas no visibles: conservar la regla de omisión de las acciones masivas existentes.
- Proyecto ubicado después de la primera página del catálogo: debe aparecer igualmente.
- En móvil: selector y botones deben quedar dentro del diálogo, sin desbordamiento horizontal.

## Contrato

`POST /tasks/bulk` con `{"ids":[1,2],"accion":"project","valor":7}` traslada las tareas seleccionadas al proyecto 7. La respuesta mantiene el conteo `data.aplicados` y los IDs omitidos de las acciones masivas existentes.

## Verificación ejecutable

Desde el frontend: `node --test pruebas/tareas.test.js`, `npm run typecheck` y ESLint sobre los archivos modificados.

La prueba `pruebas/proyecto-masivo.browser.mjs` utiliza un navegador real contra el entorno local de prueba y verifica el envío, la recarga y los estados de error.
