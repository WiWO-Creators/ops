# Revisión de la entrada de marca

La página entra con una luz suave, el título se enfoca, la barra se extiende y aparecen hasta tres grupos de contenido. La secuencia termina en 760 ms y respeta movimiento reducido. El constructor conserva su escena, con un martillo que alcanza el bloque, chispas sincronizadas, pies apoyados y un gesto facial.

## Vista local

- Abrir http://localhost:3121/__entrada-preview.html y elegir Inicio, En vivo o Proyectos.
- «Ver con el monito» reproduce la bienvenida de actualización y luego la entrada.
- «Ver solo entrada» abre la página directamente. Volver con Atrás permite repetir.
- Esta vista usa la API mock en el puerto 3122 y datos ficticios. El selector de prueba es un archivo local sin versionar; no se publica con la aplicación.
- Trabajo aislado en `ops-v2-wt-entrada-marca`, rama `feat/entrada-marca`.

## Recorrido

1. Probar ambas variantes. El monito debe golpear el bloque superior sin recortarse y desaparecer antes de la entrada del título.
2. En `/espacios`, pulsar «Refrescar». El título debe conservarse sin repetir la presentación.
3. Navegar entre Inicio, En vivo y Proyectos. El contenido y los botones deben seguir disponibles durante la entrada.
4. Repetir a 390 px de ancho. No debe aparecer desplazamiento horizontal ni cortarse el constructor.
5. Activar «reducir movimiento» en el sistema o navegador. Debe verse el monito quieto, completo, y luego la página sin desplazamientos ni desenfoque.
6. Con filtros sin resultados, la página debe mostrar su estado vacío habitual, sin quedar oculta por la animación.

## Verificación

- Compilación de producción, TypeScript y ESLint aprobados.
- 22 pruebas de marca y versión aprobadas.
- `node pruebas/entrada-marca.browser.mjs`: escritorio, móvil, bienvenida, refresco y movimiento reducido. Requiere Next en el puerto 3121 y la API mock.
- Capturas y vídeos en `output/playwright/entrada-marca/`.
- El mock no implementa los contadores por estado de Proyectos; su aviso de carga es ajeno a esta animación.
- La revisión se ejecuta con `next start`: el modo de desarrollo remonta efectos y puede cancelar los temporizadores de la bienvenida existente.
