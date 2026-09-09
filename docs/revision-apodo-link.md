# Revisión: apodo del enlace

Los campos de tipo enlace permiten editar la URL y su `apodo_link` mediante «Nombre del enlace». Las tablas y los detalles muestran el apodo como enlace clicable. Los enlaces antiguos conservan su nombre; una URL sin apodo muestra «Abrir enlace».

## Entorno

- Frontend: `/home/wiwo/ops.wiwo/ops-v2-wt-apodo-link`, rama `feat/apodo-link`.
- Backend: `/home/wiwo/ops.wiwo/wiwo-board-wt-apodo-link`, rama `feat/apodo-link`, commit `21f23cd`.
- Vista local con API mock: `http://localhost:3110`. La prueba de navegador intercepta las escrituras; no modifica datos reales.
- Para comprobar persistencia real, conectar este frontend con este backend en un entorno de pruebas. No requiere migración: la API guarda el enlace escapado en el campo personalizado existente.

## Pasos

1. En `/procesos`, abrir una tarea con «Link de Drive» y pulsar «Editar».
2. Escribir una URL HTTPS y «Carpeta del proyecto» en «Nombre del enlace». Guardar y reabrir: ambos valores deben conservarse.
3. Cambiar solo la URL y guardar: el nombre debe mantenerse. Cambiar solo el nombre: la URL debe mantenerse.
4. En `/espacios/1?tab=tareas` (o el proyecto de la tarea), comprobar que la columna muestra el nombre y abre la URL original en otra pestaña. No debe mostrar HTML ni la URL completa.
5. Editar un enlace antiguo guardado como `<a href="…">Carpeta</a>`: deben aparecer URL y nombre por separado, sin perder el nombre al guardar otros campos.
6. Borrar solo el nombre: debe mostrarse «Abrir enlace». Borrar ambos valores: limpia el enlace opcional; un campo obligatorio debe rechazarlo.
7. Escribir un nombre sin URL, una URL inválida o un protocolo `javascript:`: no debe permitir guardar. Los valores antiguos inseguros deben mostrarse como «Enlace no válido», sin enlace ejecutable.
8. A 390 px de ancho, comprobar que URL, nombre y botones quedan accesibles sin desborde horizontal.

## Verificación realizada

- TypeScript y ESLint de los archivos modificados: aprobados.
- `node --test pruebas/campos-personalizados.test.js pruebas/tareas.test.js`: 35 pruebas aprobadas, incluidos vacíos, límites y enlaces inseguros.
- Backend: `php modules/api/pruebas/campo_personalizado_link.php` y sintaxis PHP aprobados.
- `node pruebas/apodo-link.browser.mjs`: aprobado contra Next local y mock, con escrituras interceptadas. Comprueba el envío del objeto URL/apodo, reapertura, enlaces antiguos, tabla y móvil. No sustituye una prueba de persistencia con base de datos.
- Capturas locales: `output/playwright/apodo-link-movil.png` y `output/playwright/apodo-link-tabla.png`.
