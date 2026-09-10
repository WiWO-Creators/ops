# Revisión de asignación masiva a proyectos

En `/procesos`, selecciona tareas y abre **Acción masiva → Agregar a proyecto**. El buscador filtra los proyectos disponibles por nombre, sin distinguir mayúsculas ni tildes. Permite marcar varios destinos y conserva la selección al cambiar la búsqueda.

La tarea original pasa al primer proyecto seleccionado. Se crea una copia para cada proyecto adicional, con código propio. El resumen identifica el destino de los originales y cuántas copias se crearán. Los tiempos trabajados, el historial y los enlaces externos no se duplican.

## Entorno de revisión

- Frontend: `/home/wiwo/ops.wiwo/ops-v2-wt-proyecto-masivo`, rama `feat/proyecto-masivo`.
- Backend: `/home/wiwo/ops.wiwo/wiwo-board-wt-proyecto-masivo`, rama `feat/proyecto-masivo`.
- Prueba local: `http://localhost:3118/procesos`, con datos simulados; las escrituras de la prueba de navegador se interceptan.

## Pasos

1. Selecciona dos tareas y abre **Agregar a proyecto**. Sin destinos, no debe permitir enviar.
2. Escribe parte del nombre de un proyecto, márcalo y busca otro. Marca también el segundo: ambos deben aparecer en el resumen, aunque cambies la búsqueda.
3. Quita un destino con **Quitar** y vuelve a marcarlo. El orden de selección indica cuál recibe los originales.
4. Con dos tareas y dos proyectos debe anunciar dos traslados y dos copias. Envía y comprueba que el listado se actualiza y limpia la selección.
5. En un entorno con backend real, revisa los dos destinos: cada uno debe tener las dos tareas, con sus propios códigos, asignados, seguidores y checklist. Las copias no deben heredar tiempos trabajados.
6. Repite un traslado al mismo proyecto: debe conservar un código correcto y corregir un código antiguo de otro proyecto.

## Casos límite

- Búsqueda sin resultados: mostrar un mensaje y conservar los destinos seleccionados.
- Catálogo vacío, carga en curso o error: impedir el envío y explicar el estado.
- Fallo del envío: conservar selección y destinos para reintentar.
- Destino inválido o inaccesible: rechazar antes de escribir; un fallo de copia debe revertir el lote.
- Sin permiso de edición: ocultar la opción. Las copias requieren también permiso para crear tareas.
- En móvil: diálogo, buscador, lista y resumen no deben desbordar.

## Contrato

`POST /tasks/bulk` acepta `{"ids":[1,2],"accion":"project","valor":[7,9]}`. El primer destino recibe los originales y el segundo sus copias. Mantiene compatibilidad con `valor:7`. La respuesta informa `aplicados`, `copiados` y los IDs omitidos por las reglas de visibilidad.

## Verificación ejecutable

Frontend: `node --test pruebas/tareas.test.js`, `npm run typecheck`, ESLint y `node pruebas/proyecto-masivo.browser.mjs` con el entorno local iniciado.

Backend: `php modules/api/pruebas/proyecto_masivo.php` y las pruebas existentes del servicio de importación.
