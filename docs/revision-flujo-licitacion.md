# Revisión del flujo de licitación

El alta se divide en Prospecto → Contacto → Licitación. Cada formulario conserva sus campos y el paso alcanzado; «Guardar y salir» permite retomarlo al abrir nuevamente el asistente.

Rama: `feat/flujo-licitacion`. Worktree: `/home/wiwo/ops.wiwo/ops-v2-wt-flujo-licitacion`. El cambio todavía no está publicado.

## Rutas y prueba manual

1. En `/prospectos`, pulsa «Nuevo prospecto». Deben aparecer tres pasos y solo el nombre de empresa como dato principal; los datos adicionales quedan plegados.
2. Intenta continuar sin nombre: debe pedirlo. Escribe una empresa de prueba y pulsa «Guardar y continuar»: debe pasar a Contacto.
3. Completa nombre, apellido y correo. Un correo inválido debe impedir avanzar. Guarda un contacto válido y comprueba que aparece Licitación.
4. Escribe el nombre de la licitación y su fecha de inicio. Pulsa «Guardar y salir», recarga y vuelve a abrir «Nuevo prospecto»: debe recuperar este paso y sus valores.
5. Pulsa «Atrás», cambia el contacto y continúa. Debe actualizar el mismo contacto, sin crear otro prospecto ni otro contacto.
6. Pulsa «Crear licitación». Debe abrir `/licitaciones/{id}` y eliminar el borrador terminado. Abrir nuevamente «Nuevo prospecto» debe mostrar un formulario nuevo.
7. En `/prospectos/{id}?tab=licitaciones`, pulsa «Nueva licitación». Debe comenzar en Contacto, con el prospecto actual. Selecciona un contacto existente o crea uno; al terminar, la licitación debe pertenecer a ese prospecto.
8. En `/licitaciones`, el acceso de creación debe llevar a Prospectos, sin ofrecer el formulario anterior.

## Borradores y límites

- El borrador se guarda en este navegador, separado por usuario y por prospecto. No se sincroniza entre equipos.
- Los prospectos y contactos de pasos completados ya quedan guardados en la aplicación. «Descartar borrador» elimina el avance local, no esos registros.
- Si el navegador impide guardar, debe mostrarse un error y no enviarse una nueva creación. «Cerrar sin guardar» requiere confirmación.
- Si se pierde la respuesta de una creación, el asistente conserva el borrador y bloquea otro intento. Revisa primero los registros mediante el enlace ofrecido; habilita el reintento únicamente tras comprobar el resultado.
- Crear contactos requiere permiso de edición de proyectos, además del permiso de creación para prospectos y licitaciones. Sin edición puede elegirse un contacto existente, pero no añadir uno nuevo.
- En móvil, los campos y las acciones deben permanecer dentro del ancho de pantalla.

## Verificación realizada

- TypeScript y ESLint: sin errores en los archivos revisados.
- Pruebas de borradores: cinco casos aprobados, incluidos datos corruptos, aislamiento por cuenta y errores de almacenamiento.
- Navegador con API simulada: flujo completo, validación, recarga, actualización sin duplicados, contacto existente, pantalla móvil y respuesta 503.
- Detector visual y `git diff --check`: sin hallazgos.

Las pruebas automatizadas no escriben datos reales. La integración con la API del entorno se comprueba mediante los pasos manuales anteriores.
