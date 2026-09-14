# Exportar las tareas de una persona a Google Sheets

Desde Equipo, la ficha de una persona ofrece «Exportar tareas a Sheets» a los administradores. Crea una hoja nueva automáticamente en una carpeta `EXPORT_(nombre)` dentro del Drive compartido que ya usa la aplicación, con todas las tareas asignadas que el administrador puede consultar, incluidas las completadas. No reutiliza el límite de 50 filas de la ficha.

La hoja contiene ID, proyecto, tarea, estado, inicio, vencimiento y enlace a Ops. No agrega columnas de seguimiento predefinidas: cada persona puede añadir libremente columnas y notas. Los cambios en Google Sheets no se sincronizan hacia Ops.

## Entorno de revisión

- Frontend: `ops-v2-wt-exportar-tareas-sheets`, rama `feat/exportar-tareas-sheets`.
- Backend: `wiwo-board-wt-exportar-tareas-sheets`, misma rama.
- Formulario local: http://localhost:3131/equipo/1, API mock en 3132. Acceso ficticio: `ana@wiwo.me`, contraseña `mock1234`.
- La vista local permite revisar el formulario. La creación en Google se intercepta solamente en la prueba de navegador; el mock no crea hojas.
- Para una prueba real, conectar ambas ramas; se reutiliza el Drive compartido ya configurado. El origen del frontend debe figurar en `APP_API_ALLOWED_ORIGINS`, la lista que ya usa la API.

## Recorrido

1. Entrar como administrador a Equipo y abrir una ficha. Pulsar «Exportar tareas a Sheets».
2. Comprobar que se indica la carpeta automática, por ejemplo `EXPORT_Ana Ríos`, dentro del Drive compartido de WiWO. No debe solicitar un enlace ni un ID de carpeta.
3. Marcar «Dar acceso de edición» si la persona debe poder completar la hoja. No se envía correo de notificación. La hoja siempre hereda los permisos del Drive compartido.
4. Pulsar «Crear Google Sheets». Debe mostrar la cantidad exportada y «Abrir Google Sheets».
5. Abrir la hoja y comprobar tareas de todas las páginas, estados legibles, enlaces a Ops y libertad para añadir sus propias columnas.
6. Crear otra exportación. Debe generar otra hoja dentro de la misma carpeta sin alterar las notas de la anterior. La carpeta se vincula al identificador de la persona, para no mezclar homónimos.
7. Si falla compartir, debe conservarse el enlace de la hoja creada y mostrarse el aviso; no repetir la creación para resolver el permiso.

## Casos y verificación

- 501 tareas, completadas, sin proyecto y ninguna tarea: prueba PHP con servicios simulados. Una persona sin tareas produce una hoja con encabezados y cero filas.
- Se rechazan no administradores, persona inexistente, correo inválido cuando se comparte, destino enviado por el cliente, Drive sin escritura y origen no autorizado.
- Los textos que empiezan como fórmulas se neutralizan al escribir CSV.
- Fallo de creación ambiguo: revisar el Drive compartido antes de reintentar. Fallo al compartir: resultado parcial con enlace.
- Frontend: compilación de producción, TypeScript, ESLint, `node pruebas/exportar-tareas-sheets.browser.mjs` aprobados.
- Backend: `php modules/api/pruebas/exportar_tareas_sheets.php` y lint aprobados.
- Capturas: `output/playwright/sheets/`. Las pruebas no realizan llamadas de escritura reales a Google.

## Referencia de la integración

Se reutiliza el cliente de Drive de la aplicación. La [importación de CSV a una hoja nativa](https://developers.google.com/workspace/drive/api/guides/manage-uploads#import_to_google_docs_types) permite crear Google Sheets sin incorporar otra dependencia ni una segunda conexión con Google.
