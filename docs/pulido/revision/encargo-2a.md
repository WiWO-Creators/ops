# Revisión manual — Encargo 2A (escalonado único)

Rama `feat/pulido-2a`, commits `fe61c2c` y `5b37b27`. Hallazgos: P1-26 y P2-02 (ambos parciales:
lo que falta es del encargo 2B).

## Qué cambió

`EntradaEscalonada` es ahora el único mecanismo de entrada escalonada. Se le añadió `clave` (repite
la entrada al cambiar página, filtro, orden o presentación, sin reanimar en un refresco de los mismos
datos), `densa` (paso de 20 ms para filas y tarjetas), `className` y un tope de 12 pasos. Al terminar
limpia el `opacity`/`transform` que deja en línea. Se migraron `TablaRecurso` (filas y tarjetas),
`TarjetasProyectos`, `VistaClientes` y la lista y el esqueleto de Tareas recurrentes, y se borraron
`retrasoDeAparicion` y `.rec-escalonada` (se conserva `@keyframes rec-entrar`, que usa la View
Transition del cambio de panel).

## Entorno

Mock en el puerto 3421 (`PORT=3421 node mock/servidor.js`) y `next start -p 3000` sobre el build de la
rama con `API_BASE=http://localhost:3421/api/v1`. Usuario `ana@wiwo.me` / `mock1234`. Si aparece el
diálogo «Abre tu jornada», cerrarlo con Escape.

## Flujos

1. **Tabla que pagina** — `/tareas?per_page=10`.
   - Al cargar, las filas entran escalonadas de arriba hacia abajo (rápido; pasada la fila 12 entran
     juntas).
   - «Siguiente»: las filas de la página 2 entran escalonadas cuando llegan, no antes (no deben
     parpadear las de la página 1).
   - Clic en un encabezado ordenable: las filas vuelven a entrar.
   - Marcar y desmarcar la casilla de una fila: nada se reanima.
   - Alternar «Tabla / Tarjetas» (si la pantalla lo ofrece): la nueva presentación entra escalonada.
2. **Grillas de tarjetas resueltas en el servidor** — `/proyectos?vista=tarjetas&per_page=5` y
   `/clientes?vista=tarjetas&per_page=5`.
   - «Siguiente» o buscar: las tarjetas nuevas entran escalonadas al aparecer; mientras el chip
     «Actualizando…» está visible, las viejas solo se atenúan.
3. **Tareas recurrentes** — `/tareas/recurrentes`.
   - Al cargar, las reglas entran escalonadas (paso más amplio que en tablas).
   - Cambiar la vista («Activas», «Pausadas»…): la lista filtrada vuelve a entrar.
   - Recargar con la red lenta (DevTools): el esqueleto también entra escalonado.
   - Cambiar a «Importar planilla» y volver: el relevo de panel sigue animado por la View Transition.
4. **Novedades e Inicio** — `/novedades`, `/inicio`: la entrada sigue igual que tras el encargo 1
   (ítems desde los 180 ms); en listas largas, pasado el ítem 12, los demás entran juntos.

## Casos límite

- `prefers-reduced-motion: reduce` (DevTools › Rendering): nada se anima en ninguno de los flujos; el
  contenido aparece completo.
- Lista vacía (buscar algo inexistente): se ve el vacío, sin errores en consola.
- Tras cualquier entrada, inspeccionar una fila: no debe quedar `style="opacity…; transform…"`.

## Comprobado

- `pnpm lint && pnpm typecheck && pnpm test && pnpm build` en verde (2600 pruebas).
- Con una sonda de Playwright contra el mock: la entrada se repite al paginar, al ordenar y al cambiar
  la vista de recurrentes; no se repite al re-renderizar sin cambiar la clave; con movimiento reducido
  no anima; en las grillas de tarjetas anima sobre las tarjetas de la página nueva; no quedan estilos
  en línea al terminar. Capturas en claro y oscuro, escritorio y móvil.

## Pendiente o no verificado

- `proyecto-masivo`, `entrada-marca` y `orbe-proyecto` (`pruebas/*.browser.mjs`) fallan igual en el
  build base de `feat/pulido-1`: el diálogo «Abre tu jornada» tapa la pantalla con los datos del mock.
  `borrado-cliente` y `ficha-del-cliente` necesitan credenciales o puertos propios y no se corrieron.
- No verificado: refresco tras un alta (`router.refresh()`) sin reanimar, el alternador
  Tabla/Tarjetas dentro de `TablaRecurso` y la entrada de Novedades e Inicio en navegador.
