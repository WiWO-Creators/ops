# Vista opcional de mapa en Auditoría

En `/auditoria`, el selector «Árbol / Mapa» conserva el árbol inicial y permite mostrar las mismas personas en tarjetas conectadas: cliente → proyecto → tarea. Las ramas del mapa se pueden plegar; el lienzo permite desplazamiento horizontal y vertical. Se reutilizan los estilos y las filas de personas de Ops.

Para revisar: abrir Auditoría con una cuenta superadmin, cambiar a Mapa, plegar un cliente y volver a Árbol. Comprobar que las personas coincidan. En móvil, desplazar el mapa lateralmente. Sin personas activas se conserva el estado vacío.

Validación automatizada: 25 pruebas de presencia/auditoría, ESLint, build de producción y `pruebas/mapa-presencia.browser.mjs` contra datos locales de demostración. El script comprueba selector, personas, ramas, estado vacío, móvil y errores React.

Capturas locales: `output/playwright/mapa-desktop.png`, `mapa-mobile.png` y `mapa-dark.png`. No representan actividad real de producción. Rama: `feat/mapa-auditoria`.
