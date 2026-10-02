# Revisión manual — Encargo 2B (entrada en listas y fichas)

Rama `feat/pulido-2b` (sobre `feat/pulido-2a`), commit de código `ce52e6d`. Hallazgos: P3-23, P1-27,
P3-21, P3-01 y lo pendiente de P1-26 y P2-02.

## Qué cambió

Las listas, rejillas y tablas hechas a mano entran con `EntradaEscalonada`. `Tabla` (la primitiva
de `datos/Tabla.tsx`) anima ahora sola las filas de su `tbody` al montar, así que toda tabla base
entra igual que `TablaRecurso`; para eso `EntradaEscalonada` acepta `items`, un selector de ítems
alternativo a `data-entrada="item"`. Las fichas de cliente, persona, proyecto y prospecto muestran
el nombre con la tipografía y el degradado de `TituloModulo` y la firma de marca debajo
(`TituloDeFicha` y `FirmaDeMarca`); el incidente gana la firma dentro de su `header`.

## Entorno

Mock en el puerto 3421 (`PORT=3421 ORIGENES=http://localhost:3000 node mock/servidor.js`) y
`API_BASE=http://localhost:3421/api/v1 PORT=3000 pnpm start` sobre el build de la rama. Usuario
`ana@wiwo.me` / `mock1234`. Si aparece el diálogo «Abre tu jornada», cerrarlo con Escape.

## Flujos

1. **Fichas** — `/clientes/1`, `/equipo/1`, `/proyectos/1`, `/prospectos/1`,
   `/administracion/incidentes/a1b2c3d4`.
   - El nombre se ve con el degradado de marca (cliente, persona, proyecto, prospecto) y, debajo,
     la barra de marca corta, que crece de izquierda a derecha al entrar a la página.
   - En el incidente el titular conserva su estilo y gana la barra debajo.
   - En móvil (390 px) insignias y nombre siguen envolviendo sin cortar la barra.
2. **Tablas base** — `/papelera`, `/proyectos/solicitudes`, `/clientes/1?tab=contactos`,
   `/proyectos/1?tab=tiempos`, pestaña «Configuración» del proyecto (tabla de columnas).
   - Las filas del cuerpo entran escalonadas, rápido; la fila de encabezados no se mueve.
   - En móvil las filas-tarjeta entran igual.
3. **Tablas con motor** — `/tareas?per_page=10`: todo sigue como tras el 2A (entra al paginar,
   ordenar y filtrar; no al refrescar). No debe verse una doble entrada.
4. **Listas del proyecto** — `/proyectos/1`:
   - `?tab=discusiones`: las conversaciones entran escalonadas; al buscar o cambiar de página
     vuelven a entrar cuando llega la respuesta, y responder en un hilo no reanima la lista.
   - `?tab=calendario`: en «Mes» entran las entregas de cada día (no las celdas); en «Semana»/«Día»
     las columnas; en «Lista» los días. «Mes anterior/siguiente» y cambiar de vista repiten la
     entrada; «Ocultar entregados» no la repite (mismo período).
   - Abrir una tarea: el bloque de marcajes (cronómetros) y la lista de iteraciones entran
     escalonados. Registrar un marcaje o sumar una iteración no reanima los existentes.
5. **Portadas** — `/inicio` (fijados y recientes), `/teletrabajo` (salas comunes y privadas),
   `/administracion` (tres accesos): las tarjetas entran tras el título, desde los 180 ms.

## Casos límite

- `prefers-reduced-motion: reduce`: nada de lo anterior anima; la barra de marca queda a tamaño final.
- Sin fijados ni recientes en Inicio: se ve la invitación, sin errores.
- Tras cualquier entrada, inspeccionar una fila o tarjeta: no debe quedar `style` con `opacity` o
  `transform`.

## Comprobado

- `pnpm lint && pnpm typecheck && pnpm test && pnpm build` en verde (2600 pruebas).
- Sonda Playwright contra el mock: anima Inicio, Teletrabajo, Administración, Papelera,
  Solicitudes, contactos del cliente, tiempos, discusiones y calendario; la `Tabla` interna de
  `TablaRecurso` no es raíz propia; el calendario reanima al cambiar de mes y de vista; con
  movimiento reducido no anima; no quedan estilos en línea. Las cinco fichas tienen la firma dentro
  de `header`. Capturas en escritorio y móvil (claro).
- `ficha-del-cliente` y `organizacion` (`pruebas/*.browser.mjs`) pasan.

## Pendiente o no verificado

- `pestanas.browser.mjs` falla antes de llegar a lo tocado: no encuentra el enlace `/upsells` de la
  barra lateral (esta rama no toca la navegación).
- No verificado en navegador: `PanelArchivos` (el mock no devuelve archivos: 404 de permisos de
  Drive), marcajes e iteraciones dentro del modal de tarea, la repetición al buscar en discusiones y
  el modo oscuro.
