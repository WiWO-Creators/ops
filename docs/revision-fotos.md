# Revisión de fotos: clientes, proyectos y perfil

## Corrección comprobada

El helper compartido de subida trataba una respuesta HTTP 200 vacía, HTML o sin `data` como éxito. En clientes y proyectos refrescaba la pantalla sin avisar; en el perfil podía intentar acceder a `profile_image_url` sobre un valor ausente. Ahora muestra que el servidor no confirmó el guardado y conserva el flujo de error.

Este cambio corrige el falso éxito; no demuestra la causa de la pérdida reportada en producción.

## Verificaciones

- `node --test pruebas/subida-archivo.test.js`: envío del archivo, respuesta válida, HTML, vacío, JSON inválido para el contrato, error de API y pérdida de conexión.
- `node pruebas/fotos-transporte.browser.mjs`: arranca Next y un servidor HTTP local aislado; comprueba multipart y bytes completos en clientes, proyectos y perfil. No necesita credenciales ni modifica datos reales. El puerto de Next se configura con `FOTOS_TEST_PORT` (3112 por defecto).
- TypeScript y ESLint de los cambios: aprobados.
- API PHP local real: registros temporales propios, subida y lectura posterior de cliente, proyecto y usuario aprobadas. Imágenes recuperadas por HTTP 200; cliente/proyecto conservan los bytes originales y perfil genera una miniatura válida. Se eliminaron los registros, tokens y archivos de prueba.
- Servidor público: peticiones sin sesión de 1 KB y 1,2 MB devuelven 401 JSON. No se reprodujo un rechazo por tamaño a ese nivel. Esto no comprueba una subida autenticada ni descarta límites diferentes en PHP.
- Sin acceso SSH al servidor público. Falta obtener el error o la respuesta de una subida que falle allí para confirmar su causa.

## Revisión manual

Worktree: `/home/wiwo/ops.wiwo/ops-v2-wt-fotos`, rama `feat/fotos`. No está integrado en `main`.

1. En un entorno de pruebas, abrir un cliente y subir una imagen JPG o PNG desde su ficha. Recargar y comprobar que permanece.
2. Repetir en un proyecto y comprobar que la imagen propia reemplaza la heredada del cliente.
3. En `/perfil`, elegir una foto y pulsar el botón para subirla. Recargar y verificar foto y avatar.
4. Simular una respuesta 200 HTML o vacía en la subida: debe aparecer «El servidor no confirmó que el archivo se haya guardado». No debe marcarse como guardada ni producir una excepción.
5. Probar una imagen mayor de 5 MB y un formato no admitido: deben mostrarse las validaciones existentes.
6. Para investigar producción, registrar qué entidad falla, tamaño y formato del archivo y mensaje visible. La respuesta de la petición de subida permite distinguir rechazo, falso éxito y URL de imagen inaccesible; no compartir cookies ni tokens.
