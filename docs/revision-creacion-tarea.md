# Revisión: creación completa de tareas

Los accesos de tareas, proyectos e hitos comparten el mismo formulario. Permite preparar nombre, relación, estado, prioridad, fechas, hito, tipo, asignados, seguidores, etiquetas, descripción, horas estimadas, tarifa, facturación, visibilidad, recurrencia y campos personalizados antes de crear. El ID, la patente, el autor y los contadores los calcula el sistema.

## Entorno de revisión

- Frontend: `/home/wiwo/ops.wiwo/ops-v2-wt-crear-tarea-completa`, rama `feat/crear-tarea-completa`.
- Backend: `/home/wiwo/ops.wiwo/wiwo-board-wt-crear-tarea-completa`, misma rama en su repositorio.
- Vista local con datos simulados: `http://localhost:3106/procesos`. Acceso de prueba: `ana@wiwo.me` / `mock1234`.
- Para comprobar persistencia contra la API real, usar conjuntamente los dos worktrees. El frontend necesita el contrato ampliado del backend.

## Rutas y pasos

1. En `/procesos`, pulsar **Nueva tarea**. Debe abrir por campos, con **Más detalles** desplegado. Completar nombre, proyecto, prioridad, estado, asignados, seguidores, fechas, hito, tipo, descripción, etiquetas, estimación, tarifa y personalizados. Crear y abrir la tarea: cada valor debe coincidir con lo indicado.
2. Repetir desde `/procesos/tablero`: deben aparecer los mismos campos. La tarjeta debe nacer en el estado elegido.
3. En `/espacios/{id}?tab=tareas`, abrir **Nueva tarea**. El proyecto debe estar preseleccionado y todos los campos disponibles. Cambiar de proyecto: hito y tipo anteriores deben quitarse y las opciones deben corresponder al nuevo proyecto.
4. Desde la cabecera del proyecto, usar **Nueva tarea**; cerrar y volver a abrir con el mismo botón. Ambas aperturas deben funcionar.
5. En el tablero de hitos del proyecto, pulsar **+** en un hito. **Crear nueva** debe mostrar el formulario completo con proyecto e hito preseleccionados. **Sumar existente** debe conservar su comportamiento. Durante el guardado, no debe permitir cerrar el diálogo ni cambiar de camino.
6. Probar **En una línea** con un nombre, `@persona`, `#proyecto` y `!prioridad`. Pulsar **Completar campos desde la línea**, revisar y corregir los campos. La interpretación no debe crear la tarea ni borrar un hito si el proyecto no cambió.
7. Si la IA está habilitada, usar **Completar campos** y **Deshacer**. Debe restaurar también hito y tipo, sin crear ninguna tarea.
8. Seleccionar estado **Completado**, fecha de inicio anterior y fecha real de cierre válida. Al crear, debe conservar el cierre elegido; sin fecha explícita debe usar el instante de creación.
9. Activar **Recurrente** y configurar frecuencia, unidad y ciclos. Con la recurrencia habilitada en el servicio, debe guardar esa programación. Si está deshabilitada, el servicio debe rechazarla con un error y no crear la tarea.
10. Cambiar **Relacionada con** a otra entidad y completar su ID. El servicio debe validar que ese registro existe; un ID inexistente debe fallar sin crear la tarea.

## Casos límite

- Nombre vacío, vencimiento anterior al inicio, tarifa negativa, frecuencia fraccionaria, ID de relación inválido o personalizado obligatorio vacío: no debe crear.
- Sin proyecto: hito y tipo deben quedar deshabilitados; se puede crear una tarea suelta.
- Sin asignados, sin seguidores, sin etiquetas y sin estimación: debe crear; una estimación explícita de cero debe conservarse.
- Si falla la carga de campos, **Crear** queda deshabilitado y **Reintentar carga** permite recuperarse.
- Si falla únicamente `PATCH /custom-fields/values`, el mensaje debe indicar el ID de la tarea ya creada. **Reintentar campos personalizados** debe enviar otro PATCH sobre ese ID, sin repetir `POST /tasks` ni borrar lo escrito.
- Pantalla móvil: controles legibles, sin desplazamiento horizontal y botones de cierre/guardado alcanzables mediante el desplazamiento del diálogo.
- Persona sin permiso de creación: los accesos deben permanecer ocultos y la API debe rechazar un alta directa.

## Comprobaciones ejecutables

Frontend: `npm test`, `npm run typecheck` y ESLint de los archivos modificados. Prueba de navegador: `TAREA_TEST_EMAIL=ana@wiwo.me TAREA_TEST_PASSWORD=mock1234 PLAYWRIGHT_CHROMIUM_EXECUTABLE=/ruta/a/chrome node pruebas/creacion-tarea.browser.mjs`, con los servidores locales activos. Esa prueba intercepta las escrituras para comprobar el formulario sin modificar registros reales; las pruebas del mock y de PHP comprueban el contrato por separado.

Backend: `php modules/api/pruebas/patentes_creacion.php` y `php -l` de los dos archivos PHP modificados. No se ha desplegado ni integrado en main.
