# Revisión: Prospectos, Licitaciones y Upselling

Worktree: `/home/wiwo/ops.wiwo/ops-v2-wt-navegacion-comercial`, rama `feat/navegacion-comercial`.

## Cambios

- Las pestañas actualizan la selección y la URL sin volver a pedir al servidor la ficha ya cargada. Se reprodujo el bloqueo anterior retrasando la navegación del servidor: el clic dejaba Licitaciones sin seleccionar.
- El menú muestra Prospectos como acceso al flujo comercial; Licitaciones se abre dentro de cada prospecto.
- La pestaña incluye «Nueva licitación», con el prospecto actual preseleccionado. Reutiliza el formulario y el endpoint existentes, y respeta el permiso de creación.
- El detalle de una licitación vuelve a la pestaña Licitaciones de su prospecto. Prospectos permanece marcado en el menú durante ese recorrido.
- Upselling tiene un icono de flecha ascendente (`TrendingUp`).

## Pasos para probar

1. Abrir un prospecto y alternar Ficha, Contactos y Licitaciones. La pestaña seleccionada y el contenido deben cambiar incluso con respuestas lentas del servidor.
2. Abrir directamente `/prospectos/1?tab=licitaciones` (sustituir el ID por uno existente). Deben aparecer únicamente las licitaciones del prospecto; una lista vacía debe mostrar su estado vacío.
3. Pulsar «Nueva licitación». Comprobar la empresa preseleccionada, completar nombre y fecha de inicio y guardar. La nueva licitación debe aparecer en ese prospecto. Sin permiso `create`, no debe aparecer el botón.
4. Abrir una licitación y usar el enlace de regreso: debe volver al prospecto con Licitaciones seleccionada.
5. Comprobar el menú de escritorio y móvil: sin entrada independiente de Licitaciones y con flecha ascendente para Upselling.
6. Comprobar una URL con `tab` desconocida: debe abrir Ficha. Los otros parámetros de la URL deben conservarse al cambiar de pestaña.

Las pruebas de navegador usan datos locales y escrituras interceptadas; no modifican registros reales.

## Verificación realizada

- TypeScript, ESLint y detector visual: aprobados.
- `node --test pruebas/definiciones.test.js pruebas/formulario.test.js`: 84 pruebas aprobadas.
- `node pruebas/pestanas.browser.mjs`: clic sin petición de navegación al servidor, parámetros, historial, pestaña inválida, enlace directo, menú, icono y alta con `prospecto_id` correcto aprobados.
- El navegador se probó contra Next local y una API de prueba con un prospecto y las secciones comerciales habilitadas. El mock básico no incluye esas rutas; para repetirlo hace falta un prospecto disponible en la API local de pruebas.
- Capturas de escritorio y móvil inspeccionadas: `output/pestanas/escritorio.png` y `output/pestanas/movil.png`, sin desbordes.
