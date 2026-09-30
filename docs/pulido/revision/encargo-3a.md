# Revisión manual — Encargo 3A (asignación y persona)

Rama `feat/pulido-3a`, sobre `feat/pulido-2c`. Commits: `b10ab1c` (P3-06), `1489c4b` (P3-05) y
`e134510` (áreas del cliente solo si llega una lista).

## Qué cambió

- **P3-06**: las cuatro pestañas de asignación N-a-M (Focals y Supervisión del Cliente; Clientes y
  Supervisión de la persona) usan un solo componente, `MatrizAsignacion`
  (`src/componentes/formularios/`). Guardar ya no deja el texto «… actualizados.» bajo el botón:
  confirma con un aviso (toast) que nombra la entidad entre «».
- **P3-05**: queda un solo `PanelDePersona` (`src/componentes/organizacion/`); el del organigrama se
  borró. El mapa, la lista y la pestaña Personas abren la misma ficha. Con los datos de Organización
  (superadmin en `/equipo/jerarquia`) edita todo; con los del organigrama (Mi Área, o Jerarquías sin
  ser superadmin) edita escalón, jefatura y área si quien mira puede, y enlaza a Organización para el
  resto. El selector de jefe pasa a ser el buscable en los dos casos.

## Flujos

Datos: mock (`PORT=3421 pnpm mock`) y `next start` con `API_BASE=http://localhost:3421/api/v1`;
sesión `ana@wiwo.me` / `mock1234` (superadmin).

### 1. Supervisión del Cliente — `/clientes/1?tab=supervision`
1. Quitar a una persona con la «×» de su chip y pulsar «Guardar supervisores».
2. Esperado: aviso «Supervisores de «Acme SRL» actualizados.», el botón vuelve a deshabilitarse.
3. Sin chips: aparece «El cliente quedará sin supervisión diaria.».

### 2. Supervisión de la persona — `/equipo/1?tab=supervision`
1. Quitar un cliente y pulsar «Guardar clientes».
2. Esperado: aviso «Supervisión de «Ana» actualizada.»; con algo asignado, «Ver la hoja de hoy» al
   lado del botón.

### 3. Focals del Cliente — `/clientes/1?tab=focales` y Clientes de la persona — `/equipo/1?tab=clientes`
1. Quitar un chip y guardar.
2. Esperado: aviso «Focals de «Acme SRL» actualizados.» / «Clientes de «Ana» actualizados.». En la
   del cliente, debajo, «Áreas que lo atienden» (carga aparte; si falla, no aparece y la edición sigue).
3. **El mock no implementa** `clients/{id}/focales`, `clients/{id}/areas` ni `staff/{id}/focales`:
   ahí se ve el mensaje de error de carga, como antes. El camino feliz se comprobó interceptando esas
   rutas en Playwright; contra la API real está pendiente.

### 4. Panel de persona en Organización — `/equipo/jerarquia` (superadmin)
1. Pestaña Organigrama → conmutador «Lista» → pulsar una fila. Repetir desde una caja del árbol y
   desde la pestaña Personas.
2. Esperado en los tres: la misma ficha con Puesto (escalón, cargo), Jerarquía («Depende de», «Área
   principal»), Permisos (rol, coordinación), «¿Por qué ve esto?» y «Últimos cambios»; «Ver como»
   salvo en uno mismo.
3. Cambiar el jefe y guardar: aviso «Cambios de «Nombre» guardados.»; el panel sigue abierto y se
   actualizan alcance e historial.
4. Abrir la propia ficha: escalón deshabilitado y rol solo en lectura.

### 5. Panel de persona desde el organigrama — `/equipo/mi-area`
1. Superadmin: «Lista» → pulsar una fila. Esperado: escalón, «Depende de» y «Área principal»
   editables; sin cargo ni permisos; nota con enlace a Organización (`?tab=personas`).
2. Cambiar el jefe y guardar: aviso «Cambios de «Nombre» guardados.», el panel se cierra y la fila
   refleja el nuevo jefe.
3. **No superadmin** (no verificado: el mock no trae un usuario sin 2FA y sin superadmin): mismos
   campos deshabilitados, sin botones Guardar/Cerrar ni la nota.

## Comprobado

- `pnpm lint && pnpm typecheck && pnpm test && pnpm build` en verde.
- `pruebas/organizacion.browser.mjs`: ok.
- Sonda Playwright (no commiteada): flujos 1, 2, 4 (desde la lista) y 5.1–5.2 con PUT 200 y avisos;
  flujo 3 con rutas interceptadas.

## Pendiente o no verificado

- `pruebas/organigrama.browser.mjs` falla en el paso 1, antes de abrir el panel (la tarjeta del mapa
  no dice «Dirige …» en el mock). Se adaptó su selector de jefe al panel único, pero sus pasos 4–5
  quedan sin correr. Además apunta a `/equipo/jerarquia`, donde el panel completo no se cierra al
  guardar: habría que apuntarla a `/equipo/mi-area` o esperar el aviso en vez del cierre.
- Vista de solo lectura para quien no es superadmin (flujo 5.3).
- Focals contra la API real (flujo 3).
