# Revisión manual de Thinking Orb

Thinking Orb conserva el avance de cada pedido y prepara un plan antes de cambiar datos. Una
confirmación autoriza todos sus pasos. El chat global y los chats de proyecto mantienen ámbitos
separados y muestran qué quedó completado cuando ocurre un error.

## Rutas

- `/inicio`: abrir Thinking Orb para consultas de todo Ops según permisos.
- `/espacios/{id}`: abrir Thinking Orb del proyecto; debe indicar su nombre y limitarse a él.
- `/procesos`: comprobar las tareas creadas, responsables, estado y checklist después de confirmar.
- `/api/bff/ia/capacidades` (`GET`): consultar disponibilidad y límite de longitud del pedido.

## Flujo principal

1. Desde `/inicio`, abrir el chat y escribir: «Busca la tarea Crear propuesta CRM de Trailer
   Logistics. Muéstrame las coincidencias antes de cambiarla».
2. Comprobar que utiliza nombres y proyectos de los datos disponibles. Si hay varias tareas
   parecidas, debe solicitar una elección; un error técnico no debe presentarse como falta de acceso.
3. Pedir: «Crea Agregar bidireccionalidad Zoho - Wiwo Talk en MG Motors y asigna a Andrés Morales
   y Javier Auspunt». Utilizar estos nombres solo si existen en el entorno de revisión; en caso
   contrario, usar un proyecto y dos personas de prueba.
4. Responder los campos obligatorios que solicite, como área o visibilidad. Debe conservar el
   proyecto, el título y los responsables ya indicados.
5. Revisar todos los detalles y supuestos del plan. Antes de confirmar, comprobar en `/procesos`
   que la tarea todavía no existe.
6. Confirmar una sola vez. Comprobar que aparece una tarea, con ambos responsables y los campos
   aprobados. Hacer doble clic o recargar no debe crear otra copia.

## Secuencia con dependencias

1. Pedir una tarea nueva con dos elementos de checklist y un comentario. Indicar proyecto,
   responsables y demás datos necesarios.
2. Revisar el plan completo y confirmar una vez.
3. Comprobar que el checklist y el comentario pertenecen a la tarea recién creada.
4. Cerrar Thinking Orb mientras trabaja y volver a abrirlo. Debe recuperar el avance.
5. Abrir otra pestaña y recargar. Deben verse los mismos resultados, sin nuevas escrituras.

## Errores, permisos y límites

- Probar con una persona que pueda asignar tareas pero no ver el directorio completo: debe
  encontrar personas asignables sin mostrar datos privados de personal.
- Consultar un proyecto no visible: no debe exponer información ni permitir una propuesta.
- Buscar un nombre con más de 25 coincidencias: debe reconocer que existen más páginas.
- Pedir una tarea inexistente o usar un nombre ambiguo: debe distinguir ambos casos.
- Enviar solo espacios o superar el límite del campo: no debe crear una ejecución inválida.
- Interrumpir la conexión después de confirmar: recuperar debe mostrar el resultado guardado.
- Interrumpir durante la preparación: continuar debe reemplazar propuestas anteriores, sin
  agregar una segunda copia de la misma operación al plan.
- Modificar una tarea desde otra pestaña después de preparar su edición: si cambió una condición
  relevante, debe detener el plan y pedir reconstrucción con datos actuales.
- Cancelar durante la preparación: un progreso tardío no debe reactivar el pedido.
- Probar un error permanente: debe conservar resultados previos y permitir cancelar lo pendiente;
  no debe ofrecer un reintento que repetirá el mismo conflicto.
- Intentar borrar o cambiar accesos: esas operaciones no deben estar disponibles.
- Abrir «Conversación anterior»: el historial previo debe seguir legible, sin botones para
  confirmar individualmente propuestas pertenecientes al agente nuevo.

## Presentación y alcance

- En móvil, verificar que mensajes, listas y botones no generan desplazamiento horizontal.
- Una propuesta debe seguir visible aunque no se haya podido redactar una respuesta final.
- Probar el mismo pedido desde dos proyectos: no deben mezclarse conversaciones ni confirmaciones.
- Consultar actas, avisos, pendientes, soporte, facturas y archivos según los permisos de prueba.
- Drive permite consultar carpetas vinculadas; este cambio no incorpora subida de archivos desde
  el chat. Las dependencias con IDs nuevos están habilitadas para tareas; factura y pago se
  preparan por separado.
