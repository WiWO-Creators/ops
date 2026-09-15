# Revisión de nombres y rutas de proyectos

Thinking Orb utiliza «proyecto» y «proyectos» en sus explicaciones, preguntas y propuestas.
La navegación de Ops utiliza `/proyectos`; los enlaces antiguos se redirigen conservando
el identificador, la pantalla secundaria y los filtros.

## Rutas para revisar

- `/proyectos`: listado de proyectos.
- `/proyectos/{id}`: detalle de un proyecto visible para la persona.
- `/proyectos/plantillas`: plantillas de proyecto.
- `/proyectos/plantillas-hito`: plantillas de hitos.
- `/espacios/{id}?tab=actas`: enlace antiguo; debe terminar en `/proyectos/{id}?tab=actas`.

## Comprobación manual

1. Abrir Proyectos desde el menú y desde un enlace de cliente, tarea, equipo o focal. La barra
   de direcciones debe mostrar `/proyectos`, sin pasar por `/espacios`.
2. Abrir un marcador antiguo del listado, un detalle y ambas pantallas de plantillas. Deben
   conservar el destino y los parámetros después de la redirección.
3. Abrir Thinking Orb desde un proyecto y preguntar «¿Cómo va este proyecto?». Debe mantener
   el proyecto actual, respetar los permisos y utilizar «proyecto» al nombrar el recurso.
4. Pedir una propuesta de creación o edición y revisar título, preguntas, detalles y supuestos.
   Deben hablar de proyectos. No confirmar si solo se está comprobando el vocabulario.
5. Si un nombre guardado contiene la palabra «Espacio», comprobar que conserva ese nombre:
   por ejemplo, «el proyecto Espacio de prueba». Los nombres propios no se reescriben.
6. Desde Auditoría, comprobar que la presencia muestra el proyecto y su nombre, tanto para
   una pestaña nueva como para una pestaña que estaba abierta en la ruta antigua.

## Límites y compatibilidad

Los identificadores internos y contratos de la API se conservan, incluidos `espacio_id`,
los nombres de herramientas existentes y `/scores/espacios`. Las conversaciones guardadas
no se reescriben; sus enlaces antiguos continúan funcionando mediante redirección.

Verificación realizada: pruebas automáticas de rutas, presencia y herramientas, compilación
del frontend, y navegación real de listado y detalle con parámetros. Las redirecciones de
plantillas se verificaron por HTTP; el mock local no implementa sus recursos de datos.
