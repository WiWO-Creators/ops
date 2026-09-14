# Revisión de edición completa de tareas

La edición reúne todos los campos del alta y permite agregar, cambiar o quitar el proyecto. También permite cambiar el estado y corregir la fecha de cierre de una tarea completada. Los identificadores, contadores y datos calculados conservan su gestión automática.

## Entorno aislado

- Frontend: `/home/wiwo/ops.wiwo/ops-v2-wt-edicion-completa`, rama `feat/edicion-completa`.
- Backend: `/home/wiwo/ops.wiwo/wiwo-board-wt-edicion-completa`, rama `feat/edicion-completa`.
- Vista local: `http://localhost:3117/procesos?tarea=1`. Usa la API de prueba en `http://localhost:4017/api/v1`; los datos son ficticios. Inicia sesión con una cuenta del mock.
- La prueba de navegador intercepta las respuestas de tareas para verificar los cuerpos enviados y la reapertura. No equivale a una prueba integrada con PHP y base de datos.
- Para revisar con la API real, sirve el worktree backend y configura `API_BASE` del frontend hacia ese servidor aislado. Ambos cambios deben integrarse juntos: el backend anterior rechaza tarifa y visibilidad al editar.

## Pasos

1. En `/procesos`, abre una tarea sin proyecto y pulsa **Editar**. En **Relacionada con**, elige **Proyecto** y selecciona uno. Guarda y vuelve a editar: debe conservar el proyecto.
2. Selecciona un hito y un tipo del proyecto. Cambia de proyecto: ambos deben quedar vacíos y ofrecer únicamente opciones del nuevo proyecto. Elige nuevas opciones, guarda y vuelve a abrir para comprobarlas.
3. Elige **Sin proyecto** o **Sin relación**, guarda y vuelve a abrir. Proyecto, hito y tipo deben quedar vacíos.
4. Modifica nombre, descripción, prioridad, inicio, entrega, horas estimadas, asignados, seguidores, etiquetas y campos personalizados. Guarda y vuelve a abrir: deben conservar los valores elegidos.
5. Cambia tarifa por hora y las casillas **Facturable**, **Pública para el equipo** y **Visible para el cliente**. Comprueba tanto activarlas como desactivarlas y que una tarifa de cero se conserve.
6. Activa **Recurrente**, configura frecuencia, unidad y ciclos; guarda y vuelve a abrir. Cambia la frecuencia y luego cancela la recurrencia. Si la instalación tiene la recurrencia deshabilitada, debe mostrar el rechazo del servidor y mantener abierto el formulario.
7. Cambia el estado y verifica que se conserve. Completa una tarea con una fecha entre su inicio y hoy. Vacía la fecha de cierre y comprueba que se borre. Reabre y comprueba el nuevo estado y la limpieza de la fecha de cierre.
8. Abre y guarda sin cambios: no debe enviar escrituras. Cancela después de editar: debe descartar lo que no se guardó.

## Casos límite

- Nombre vacío, ID de relación inválido, tarifa negativa, entrega anterior al inicio y frecuencia o ciclos fuera de rango: impedir el guardado y explicar el error.
- Proyecto sin hitos o tipos: mantener disponibles las opciones vacías.
- Fallo de carga de catálogos: informar el fallo sin borrar selecciones existentes.
- Fallo de guardado: mantener abierto el formulario y permitir reintentar. Si una escritura anterior ya se completó, al cerrar se refresca el detalle para mostrarla.
- Pantalla estrecha y teclado: todos los controles y botones deben seguir accesibles, sin desplazamiento horizontal del formulario.

## Comprobaciones ejecutables

Desde el worktree frontend: `node --test pruebas/edicion-tarea.test.js pruebas/cierre-tarea.test.js`, `npm run typecheck` y ESLint sobre los archivos modificados.

Desde el worktree backend: `php modules/api/pruebas/patentes_creacion.php`.

La prueba `pruebas/edicion-tarea.browser.mjs` usa las variables `TAREA_TEST_URL`, `TAREA_TEST_EMAIL`, `TAREA_TEST_PASSWORD` y, opcionalmente, `PLAYWRIGHT_CHROMIUM_EXECUTABLE`.
