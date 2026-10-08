# Revisión manual — Encargo 2C (salidas, colapsables y tokens)

Rama `feat/pulido-2c` (sobre `feat/pulido-2b`), commit de código `4fe6376`. Hallazgos: P2-16, P2-11,
P2-18, P1-03, P1-29, P3-24, P1-28, P4-16, P1-23, P4-04 y P2-17.

## Qué cambió

Lo flotante que no es de Radix (chat del orbe, ficha flotante de persona) sale animado: el hook
`usePresencia` (`src/lib/`) lo sostiene montado hasta que termina su `animate-salir-*`. Los
acordeones con estado usan el componente nuevo `Plegable` (`componentes/estructura/`), que anima el
alto con `grid-template-rows`; todo `<details>` anima su apertura con una regla global sobre
`::details-content`. Las filas de plantillas y de la lista de control entran, salen y se reordenan
con `<ViewTransition>`. Las tarjetas de acceso y clave entran con `animate-entrar-abajo`, y la ficha
pública de tarea gana `loading.tsx` y la misma transición de página del panel. Hay una regla de
ESLint nueva contra `animate-pulse`/`animate-ping` fuera de `componentes/estado/`.

## Entorno

Mock en el puerto 3421 (`PORT=3421 node mock/servidor.js`) y
`API_BASE=http://localhost:3421/api/v1 PORT=3000 pnpm start` sobre el build de la rama. Usuario
`ana@wiwo.me` / `mock1234`. Si aparece el diálogo «Abre tu jornada», cerrarlo con Escape. Probar
también con «Reducir movimiento» activado en el sistema: todo debe abrir y cerrar al instante, sin
quedar nada colgado.

## Flujos

1. **Chat del orbe** — cualquier pantalla del panel, p. ej. `/tareas`. Abrir con el botón del orbe
   (abajo a la derecha) y cerrar con «Cerrar», con el mismo botón y con Escape.
   - Al cerrar, el panel baja unos píxeles y se funde (~120 ms) en vez de desaparecer de golpe.
   - Cerrar y reabrir enseguida muestra un chat recién cargado (relee el hilo), igual que antes.
2. **Ficha flotante de persona** — `/tareas`, pasar el mouse (o tabular) sobre un avatar de la
   columna «Asignados».
   - La ficha aparece escalando desde su esquina superior izquierda y, al salir, se encoge y se
     funde. Hacer scroll con la ficha abierta la cierra con la misma salida.
3. **Acordeones del acta** — `/proyectos/1?tab=actas&acta=nuevo`, paso «2 Datos del acta».
   - El paso abre y cierra animando el alto; el chevron gira a la vez. Plegado no queda hueco bajo
     el encabezado y el contenido no se alcanza con Tab. Abierto, los anillos de foco de los campos
     no se ven recortados.
   - Con un acta que tenga tareas propuestas: «Tareas propuestas» pliega igual (chevron que gira en
     vez de cambiar de ícono), y el «Ver más» de una descripción larga despliega con transición en
     Chrome/Edge recientes (en navegadores sin `interpolate-size` salta como antes; replegar es
     inmediato). **No verificado en navegador**: el mock no trae un acta con propuestas a mano.
   - Historial de aprobaciones (en una tarea con dos o más rondas): el botón suma un chevron y las
     rondas se despliegan animadas. **No verificado en navegador** por falta de datos en el mock.
4. **`<details>`** — `/administracion/pantallas` («Cómo poner una pantalla»),
   `/administracion/pantallas/anuncios` y el «Detalle técnico» de `/administracion/incidentes/…`.
   - El bloque crece y se repliega con transición en Chrome/Edge 131+; el `›` del incidente gira con
     la misma duración. En Firefox/Safari sin `::details-content` abre de golpe como antes. Revisar
     de pasada otros `<details>` (reporte mensual, tablero del portal, calendario, panel en vivo):
     la regla es global.
5. **Filas que entran, salen y se reordenan** — lista de control en `/tareas?tarea=500`: agregar un
   paso y quitarlo. La fila nueva sube fundiéndose, la quitada se funde y las demás se corren.
   Plantillas en `/proyectos/plantillas` y `/proyectos/plantillas-hito` («Nueva plantilla»,
   «Agregar tarea», «Subir»/«Bajar», quitar): la fila movida viaja a su lugar. **Plantillas no
   verificadas en navegador**: el mock no sirve `/project-templates` (la pantalla muestra
   «Reintentar»); probar contra un backend con plantillas.
6. **Acceso y clave** — sin sesión: `/`, `/colab`, `/clave/<token>`. La tarjeta de vidrio entra
   subiendo 8 px con un fundido. Comprobar en claro/oscuro y en móvil.
7. **Ficha pública de tarea** — `/tarea/<token>`. Mientras carga se ve la ventana con el orbe
   «Cargando la tarea…»; al llegar, el título entra con la animación de las páginas del panel y los
   bloques de primer nivel se asientan. **Con un token válido no verificado**: el mock no sirve
   `/public/tasks`; con uno inventado se comprobó la página de «no encontrada» dentro de la
   transición.
8. **Tokens** — `/sala/<token>`: el cambio libre/ocupado funde en `duration-lenta` (420 ms) en vez
   de 500 ms. El interruptor (`role="switch"`, p. ej. en Configuración) se desliza con la curva del
   sistema.

## Regla de lint

`pnpm lint` falla si aparece `animate-pulse` o `animate-ping` en `src/` fuera de
`src/componentes/estado/`, salvo `CabeceraProyecto.tsx`, `MenuEstadoProyecto.tsx`,
`MiniLlamada.tsx` y `src/app/pantalla/`. Para verlo: agregar la clase a cualquier componente de
`src/componentes/datos/` y correr `pnpm exec eslint <archivo>`.

## Ya comprobado

`pnpm lint`, `typecheck`, `test` (2600) y `build` en verde. Pruebas `acta.browser.mjs` en verde;
`orbe-agente.browser.mjs` falla en la línea 223 (un aviso de error tapa el botón del orbe) igual con
el `OrbeChatIA` de la base, así que es previa. Sonda Playwright: salidas del orbe (claro/escritorio,
oscuro/móvil, movimiento reducido) y de la ficha de persona, `Plegable` abriendo y cerrando con alto
intermedio, `inert` y recorte, `<details>` con alto intermedio, lista de control pasando por View
Transition, tarjetas de acceso con su clase de entrada y ficha pública dentro de la transición.
