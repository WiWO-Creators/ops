# WiBot dentro de un proyecto

La ficha del proyecto recupera la pestaña **WiBot** cuando la IA está habilitada. La conversación solo usa datos del proyecto abierto. Su historial es independiente del chat global y del de otros proyectos. Las acciones se confirman en una ruta del mismo proyecto y el servidor vuelve a validar que sus elementos sigan perteneciendo a él.

## Revisión

Frontend: `/home/wiwo/ops.wiwo/ops-v2-wt-wibot-proyecto`.
Backend: `/home/wiwo/ops.wiwo/wiwo-board-wt-wibot-proyecto`.
Ambos usan la rama `feat/wibot-proyecto`.

La prueba local usa `http://localhost:3122/espacios/1?tab=wibot`, con datos simulados. Las peticiones del chat se interceptan en la prueba de navegador; no llama al proveedor de IA ni modifica proyectos reales.

1. Abre un proyecto y entra en **WiBot**. Debe mostrar el nombre del proyecto y explicar su alcance.
2. Pregunta por sus tareas atrasadas. El envío debe usar `POST /ia/proyectos/{id}/chat`.
3. Abre otro proyecto: no debe aparecer la conversación anterior. Vuelve al primero: debe conservarla.
4. Abre el chat global: su historial sigue separado. Borrar el chat del proyecto no debe borrar el global ni el de otro proyecto.
5. Pide crear o modificar una tarea del proyecto y revisa la propuesta antes de confirmar. La confirmación usa `POST /ia/proyectos/{id}/acciones/{accionId}`.
6. En un entorno con backend real, pide una acción sobre una tarea ajena, aunque tengas acceso a ella. Debe rechazarla. Repite con un hito y una discusión de otro proyecto.
7. Propón editar una tarea local, trasládala a otro proyecto y confirma: debe rechazar el cambio fuera del alcance.
8. Prueba en móvil: conversación, campo y botones deben permanecer accesibles sin desbordamiento.

## Límites comprobables

- Solo se ofrecen herramientas de tareas, hitos, discusiones y checklists del proyecto.
- Las herramientas globales se bloquean también en el servidor, aunque se invoquen directamente.
- El proyecto de la URL prevalece sobre cualquier pantalla o ID sugerido en el mensaje.
- Una propuesta de otro proyecto o del chat global no puede confirmarse desde este hilo.
- Sin acceso al proyecto, el servidor rechaza lectura, conversación y acciones.
- Sin mensajes se muestran sugerencias; los errores de carga y respuesta permiten reintentar.

## Entrega

El backend requiere la migración que agrega `scope_project_id` al historial y a las propuestas. Conserva las conversaciones existentes como globales. Debe desplegarse antes del frontend.
