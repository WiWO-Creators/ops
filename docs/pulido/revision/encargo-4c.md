# Revisión manual — Encargo 4C (tokens y escalas)

Rama `feat/pulido-4c` (código en `5438715` y `21ebfd3`), sobre `feat/pulido-4b`.

- **Capas de `z-index` con nombre** en `globals.css`: `z-flotante` (40), `z-superposicion` (50),
  `z-aviso` (55), `z-telon` (60), `z-bienvenida` (70). Mismos valores que antes, así que el orden
  de apilado no cambia. Los apilados locales siguen con `z-1`/`z-10`/`z-20`.
- **Tamaños de texto en la escala**: 11 px → `text-menor`, 13 px → `text-sm`, 16 px → `text-titulo`,
  y tres tokens nuevos sin interlineado propio: `text-micro` (10 px), `text-subtitulo` (20 px),
  `text-cifra` (22 px). Los `vmin` de `/pantalla` y `/sala/[token]` se dejan: escalan con la pantalla
  a propósito. `text-[0.9em]` del código en línea del chat también (es relativo al párrafo).
- **Lint**: `z-[…]` y `text-[Npx|Nrem]` fallan en `pnpm lint`, integrados con la regla de
  `animate-pulse` del 2C.
- **`cn`** conoce la escala propia: antes `tailwind-merge` tomaba `text-menor`/`text-titulo` por un
  color y borraba uno de los dos.
- **`tokens.css`** pierde el espaciado, los tamaños de control, las sombras y los radios que nadie
  leía. Se conserva como capa de marca cruda (P2-08 queda parcial).
- **`/taller`** suma cinco secciones con datos de ejemplo y **`/taller/tareas`** lee
  `TALLER_PROYECTO_ID`.

## Requisitos

- Contra el mock: `PORT=3421 node mock/servidor.js`, `pnpm build && API_BASE=http://localhost:3421/api/v1 PORT=3000 pnpm start`,
  usuario `ana@wiwo.me` / `mock1234`. Si aparece «Abre tu jornada», ábrela antes de seguir.
- `/taller` no pide sesión ni API.

## Qué probar

1. **Nada cambia a la vista (claro y oscuro).** Recorrer `/colab`, `/inicio`, `/tareas`, `/portal`
   (`clienta@acme.com` / `portal1234`), `/organigrama` y `/salas` con el selector de tema. Tienen que
   verse igual que en `feat/pulido-4b`. Mirar en especial los rótulos de 11 px (fechas de
   `/salas`, entregas y actividad del proyecto, tarjetas de cliente) y los títulos de
   `/organigrama` (áreas a 16 px, panel del área a 20 px).
2. **Apilado.** En `/tareas`, abrir un diálogo (p. ej. «Nueva tarea») y disparar un error desde la
   consola: `window.dispatchEvent(new CustomEvent('ops:error', { detail: { mensaje: 'x' } }))`.
   El aviso sale **encima** del diálogo. Tras actualizar con una versión nueva, la bienvenida tapa
   todo.
3. **Barra inferior en móvil** (ancho 390 px, `/inicio`): los rótulos de las pestañas miden 11 px.
   Es el único cambio visible y es intencional: antes `cn` borraba `text-menor` y salían al tamaño
   heredado (14 px).
4. **Lint.** Escribir `className="z-[70]"` o `className="text-[12px]"` en cualquier `.tsx` de `src/`
   y correr `pnpm exec eslint <archivo>`: los dos fallan con el mensaje que apunta a la escala. Lo
   mismo en `src/componentes/estado/` (el bloque del pulso repite la regla).
5. **`/taller`**, en claro y oscuro:
   - «Estados de formulario»: área de texto y selector deshabilitados, entrada y etiquetas con error
     (`aria-invalid`), «Guardar» pasa a «Guardando…» deshabilitado 1,5 s.
   - «Superposiciones con datos»: pasar el mouse sobre «Ana Ríos» abre su ficha (cargo, área, correo,
     teléfono) sin pedir nada a la red; «Borrar para siempre» exige escribir «Acme».
   - «Selectores relacionales»: los seis se abren, filtran y eligen.
   - «Plazos, avance y copiado»: cuatro estados de SLA, tres desviaciones, barras al 0/45/100 %,
     copiar muestra «Copiado».
   - «Piezas del sistema»: «Historial» pliega y despliega; «Repetir» vuelve a escalonar la lista;
     «Completadas» agrega `?taller_filtro=1` a la URL; la matriz carga, cambia y guarda sin red.
   - En la pestaña de red no aparece ninguna petición a `/api/` (el único 404 es
     `/no-existe.png`, la muestra deliberada del avatar con imagen rota).
6. **`/taller/tareas`**: sin `TALLER_PROYECTO_ID` muestra «Falta el proyecto de prueba». Con la
   variable definida antes del build (y sesión abierta), monta Tareas y Registro de horas de ese
   proyecto.

## Comprobado

- `pnpm lint && pnpm typecheck && pnpm test && pnpm build` en verde (2608 pruebas, con la nueva
  `pruebas/clases.test.js`).
- Capturas antes/después de las seis pantallas del punto 1, en claro y oscuro: la única diferencia
  de píxeles es el reloj de la jornada.
- CSS compilado: `text-menor`/`text-micro`/`text-subtitulo`/`text-cifra` solo fijan `font-size`,
  las cinco `--z-index-*` se emiten y `--lk-grid-gap` resuelve a `calc(var(--spacing) * 3)` (0,75 rem).
- Navegador: `avisos-error`, `filtros` y `gestion` pasan; el taller se probó con una sonda (punto 5).

## No verificado

- `jornada.browser.mjs` y `cierre-jornada.browser.mjs` fallan por aserciones desactualizadas y no por
  este encargo: la primera espera que no se pueda abrir la jornada sin Proyecto (hoy se puede) y la
  segunda busca «Tu jornada se cierra sola», pero el aviso dice «¿Estás ahí?» (se ve en pantalla,
  encima del resto, con `z-telon`).
- `/taller/tareas` con un proyecto real (necesita API y sesión).
- Llamada de LiveKit (`--lk-grid-gap`) en una sala real.
