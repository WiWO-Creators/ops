# Revisión manual — Encargo 5B (utilidades duplicadas)

Rama `feat/pulido-5b`, código en `6db7735`. Refactor sin cambio visible salvo el antetítulo: los
formatos de duración viven en `src/lib/duraciones.ts`, el guion de "sin dato" en
`src/lib/presentacion.ts`, `fechaDeDia` en `gantt.ts`, los tonos por vencimiento en
`presentadores/tonos-vencimiento.ts`, y los rótulos en versalita usan la utilidad `antetitulo` de
`globals.css`. `FormularioRecurso` y `AccionesFila` son genéricos sobre el registro.

## Entorno

```bash
PORT=3421 node mock/servidor.js &
pnpm build && API_BASE=http://localhost:3421/api/v1 PORT=3000 pnpm start &
```

Entrar como `ana@wiwo.me` / `mock1234`. Si aparece «Abre tu jornada», abrirla antes
(`POST /api/bff/me/jornada` con cuerpo `{}`).

## Qué mirar

1. **Gantt** — `/proyectos/1?tab=gantt`, elegir «Todo el proyecto».
   - La frase de lectura dice «entre 01 ago 2026 y 19 sept 2026, en escala de semana».
   - «Exportar» → «Imagen (PNG)»: el subtítulo del PNG dice el mismo rango
     (`01 ago 2026 → 19 sept 2026`). Ambos salen ahora de `fechaDeDia` de `gantt.ts`.
2. **Tiempos / timesheet** — `/proyectos/1?tab=tiempos`: las duraciones siguen en `HH:MM` sin
   días (p. ej. `14:30`). Un registro corriendo cuenta en vivo con el mismo formato.
   Cronómetros de la barra superior y de Live siguen en `H:MM:SS`.
3. **Resumen de proyecto** — `/proyectos/1`: las tarjetas de métricas (`Metrica`) y la ficha
   lateral muestran los rótulos en versalita, peso 500, espaciado `0.08em`.
4. **Antetítulos en otras pantallas** (cambio visual buscado): donde antes había `font-semibold` o
   `tracking-wide` ahora todos son peso 500 y `0.08em`. Revisar en claro y oscuro:
   - Formularios con secciones (p. ej. «Editar cliente» en `/clientes/1`, menú de acciones).
   - Cabecera de cliente y de persona (`/clientes/1`, ficha de un miembro del equipo): los `dt`
     pasaron de `0.06em` sin peso a `antetitulo`.
   - Focals, Meeting Paper («Transcripciones recientes», «Ya creadas»), organigrama (panel de
     persona), recorrido de novedades («Ops se actualizó»), portal (`/portal/gestion`, ayuda y
     detalle de ticket).
   - Tarjetas densas (`TarjetaCliente`, historial de persona, línea de actividad) conservan
     `text-menor`.
5. **Calendario y entregas** — `/proyectos/1?tab=calendario` y la vista calendario de Tareas: el
   borde izquierdo por vencimiento (rojo vencido, ámbar hoy, acento próximo) no cambia.
6. **Formularios de edición** — Editar un cliente, un prospecto, un hito, una nota y el proyecto
   (menú «Más»): el formulario abre sembrado con los datos actuales y el aviso de éxito nombra lo
   guardado con «». Es el efecto del tipado genérico: no debe haber diferencia visible.
7. **Solicitudes** — `/proyectos/solicitudes`: una solicitud sin resolver muestra `—` en
   «Resuelto por».
8. **Pantalla de área** — `/pantalla/<codigo>`: los contadores de cronómetros siguen en `H:MM:SS`
   y la columna de días de la escena de proyectos cuenta contra el día de la zona del negocio.

## Verificado

- `pnpm lint && pnpm typecheck && pnpm test && pnpm build` en verde (2618 pruebas).
- Pruebas nuevas: `pruebas/duraciones.test.js`, `pruebas/presentacion.test.js`, más casos en
  `gantt-ventana.test.js` (inversa de `fechaDeDia`) y `momento-del-dia.test.js` (`fechaEnLaZona`).
- Navegador: `gestion`, `ficha-del-cliente` y `acta` pasan. Sonda Playwright: Gantt en pantalla y
  PNG exportado con el mismo rango, tiempos en `HH:MM`, resumen con `antetitulo` aplicado
  (500 / `0.88px` a 11 px), calendario y ficha de cliente sin errores de página.

## No verificado

- `pantalla-area.browser.mjs` falla antes de llegar a lo tocado: el render de servidor de
  `/pantalla/AB3K9?solo=procesos` cae en el logo de cliente de `piezas.tsx` (`cliente` llega
  `undefined` desde el mock y el componente solo contempla `null`). Es preexistente y ajeno a este
  encargo; las secciones previas (hidratación y escena «trabajando») sí pasan.
- La escena de proyectos de `/pantalla` con `fechaEnLaZona` no se vio en navegador (cubierta por la
  prueba unitaria).
- `textoPlazo` (ahora con `diasHasta`) solo lo usa el componente `ResumenProyecto`, que hoy no se
  monta en ninguna ruta: el cambio de P1-09 no es observable en navegador. La diferencia con la
  copia vieja es que una fecha que no sea `YYYY-MM-DD` exacto (p. ej. `2026-3-5`) da `—`.
- `borrado-cliente.browser.mjs` no se corrió: pide credenciales de prueba propias.
- Revisión visual en oscuro y móvil de los antetítulos: pendiente para quien revise.
