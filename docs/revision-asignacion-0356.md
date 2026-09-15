# Revisión de asignación de tareas — WIW-0356

## Qué cambia

Las asignaciones nuevas generan el aviso de tarea asignada mediante las preferencias existentes. Se cubren creación, edición y asignación masiva. Reenviar la misma asignación no debe duplicar avisos; asignarse a uno mismo no genera un aviso propio.

Las listas de tareas y proyectos personales se actualizan cuando la ventana vuelve a estar visible, recupera el foco o recibe una escritura local de tareas. Mientras estén visibles, consultan cada 30 segundos y conservan la página seleccionada y los datos durante el refresco.

## Entorno de revisión

- Frontend: `/home/wiwo/ops.wiwo/ops-v2-wt-asignacion-0356`.
- Backend: `/home/wiwo/ops.wiwo/wiwo-board-wt-asignacion-0356`.
- Rama en ambos repositorios: `feat/asignacion-0356`.
- Usar dos cuentas de prueba distintas y correo de pruebas. La configuración productiva de correo permanece en modo real.

## Rutas y pasos

1. Con la cuenta destinataria, abrir `/mis-tareas` y mantener la pestaña visible. Con la cuenta autora, crear una tarea pendiente y asignarla a la destinataria.
2. Confirmar que aparece en la campana y, como máximo tras el siguiente refresco de 30 segundos, en Mis Tareas. El enlace del aviso debe abrir esa tarea.
3. Abrir `/equipo/{id}` para la persona destinataria y comprobar la pestaña de trabajo. Reasignarle otra tarea desde la cuenta autora: debe aparecer sin recargar toda la página.
4. Cambiar de pestaña, asignar una tercera tarea y regresar. La consulta debe actualizarse al volver.
5. Editar una tarea desde el propio listado y guardar los responsables. Debe actualizarse la lista detrás del detalle sin cerrar y volver a abrir la pantalla.
6. Asignar mediante la acción masiva. Cada tarea debe generar un solo aviso por persona recién agregada.
7. Repetir el mismo guardado y la misma asignación masiva. No deben aparecer avisos adicionales.

## Casos límite

- Autoasignación: tarea visible en Mis Tareas, sin aviso propio.
- Lista de responsables vacía: sin aviso de asignación.
- Datos inválidos o escritura revertida: sin asignación, campana ni correo asociados al intento.
- Preferencias del destinatario: respetar por separado los canales silenciados.
- Pestaña oculta: no consultar periódicamente hasta volver a ella.
- Error de red tras una carga correcta: conservar el listado y recuperarse en la siguiente consulta.
- Cambiar de página durante una consulta: una respuesta anterior no debe reemplazar la página actual.
- Tareas completadas y papelera conservan los filtros existentes.

## Diagnóstico verificado en producción

La migración de permisos `0540` está aplicada y `wiwo_permisos_jerarquia=1`. El interruptor de correo está en `real`. El evento `proceso_asignado` estaba declarado, pero los caminos de escritura de la API no lo emitían.

Sigue pendiente identificar la tarea y el destinatario concretos del reporte para comprobar cualquier ausencia que persista tras recargar. El código del reporte no basta para identificar esa tarea.

## Verificación automatizada

- Frontend: 1456 pruebas aprobadas, TypeScript y ESLint sin errores.
- Backend: regresión de asignaciones y suites relacionadas aprobadas; sintaxis PHP y revisión de espacios correctas.
- La integración de agente durable con MySQL no se ejecutó: este entorno no tiene `ORB_TEST_DSN`. Las pruebas de avisos usan dobles de base y correo, sin entregas reales.
