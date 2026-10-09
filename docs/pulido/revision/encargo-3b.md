# Revisión manual — Encargo 3B (selectores, inventario y avisos)

Rama `feat/pulido-3b`, código en `47e25a9`. Los selectores múltiples (personas, clientes, espacios)
comparten una base, `SelectorBuscableMultiple`; `SelectorDePersona` pasa a `formularios/`; toda la
búsqueda de selectores usa `dominio/busqueda.ts` (sin acentos, por palabras en cualquier orden); el
inventario de `docs/sistema-de-diseno.md` refleja lo que existe; y las mutaciones que cerraban un
diálogo en silencio ahora confirman con un aviso que nombra la entidad con «».

## Entorno

```bash
PORT=3421 node mock/servidor.js &
pnpm build && API_BASE=http://localhost:3421/api/v1 PORT=3000 pnpm start &
```

Credenciales del mock: equipo `ana@wiwo.me` / `mock1234`; portal `clienta@acme.com` / `portal1234`.
En el mock aparece el diálogo «Abre tu jornada» en todas las pantallas del panel: ábrela en blanco
para seguir (no es parte de este encargo).

## Flujos

### 1. Selectores múltiples (P2-07)

- **Reserva de sala** (`/salas`): clic en una franja libre → «Quiénes van». Esperado: el buscador
  recibe el foco al abrir; escribir `rios ana` o `nunez` encuentra sin tildes y en cualquier orden;
  al marcar aparece un chip con avatar debajo, en el orden en que se eligieron; el disparador dice
  «1 persona». Sin coincidencias: «Nadie con ese nombre.».
- **Clientes de un focal** (ficha de una persona en `/equipo/[id]`, bloque de clientes como focal o supervisión): mismo control con icono
  de edificio, «Buscar un cliente…» y «Ninguno con ese nombre.».
- **Alta de tarea en varios espacios** (un Proyecto → «Nueva tarea» → campo «Proyectos»): con un
  elegido el disparador muestra su nombre; con más de 8 chips aparece «y N más»; tras un alta a
  medias los espacios que fallaron quedan en rojo.
- Cambio visible menor: los chips de personas y clientes ahora siguen el orden de elección (antes el
  del catálogo), igual que los de espacios.

### 2. Selector de una persona (P3-07, P3-27)

- `/equipo/jerarquia`: abrir una persona → jefe; y la barra de lote al marcar varias. Esperado:
  igual que antes, pero la búsqueda también encuentra por el detalle (cargo/área) y por palabras
  sueltas (`ana diseno`).
- Detalle de un ticket → menú del asignado. Esperado: busca sin tildes como antes (ya no depende del
  dominio de salas).

### 3. Avisos de éxito (P3-18, P1-05, P4-03)

Cada acción debe mostrar un aviso verde abajo que nombra la entidad con «»:

| Dónde | Acción | Aviso esperado |
|---|---|---|
| Un Proyecto → Notas / Hitos | crear, editar o eliminar desde la fila | «X» se creó. / Cambios de «X» guardados. / «X» se eliminó. |
| Cualquier `FormularioRecurso` (clientes, prospectos, licitaciones, upsells, equipo, motivos de iteración) | guardar | igual al anterior; contratos conservan «Contrato creado.» / «Contrato actualizado.» / «Acceso actualizado.» |
| `/salas` | reservar o editar | «X» quedó reservada. / Reserva «X» actualizada. |
| Ficha de persona → «Rol de sistema» | guardar | Rol de «X» actualizado. |
| Ficha de licitación → enlace de presentación | guardar | Enlace de la presentación guardado. |
| Portal → un Proyecto → Aprobaciones | aprobar / pedir cambios | Visto bueno registrado para «X». / Observación sobre «X» enviada al equipo. |
| Detalle de tarea | editar, completar, eliminar | Cambios de «X» guardados. / «X» quedó completada. / «X» se envió a la papelera. |
| Alta de tarea | crear en uno o varios espacios | «X» se creó. / «X» se creó en N proyectos. (un alta a medias no avisa: el parte queda a la vista) |
| `/tareas/recurrentes` | pausar, dejar de repetir, reanudar; editar la regla | «X» quedó en pausa. / «X» dejó de repetirse. / «X» se reanudó. / Recurrencia de «X» guardada. |
| Menú del Proyecto | archivar, desarchivar, visibilidad, salir, copiar, desde plantilla | «X» quedó archivado. / En «X» ahora se ven todas… / Saliste del equipo de «X». / «X» se creó como copia de «Y». |
| Solicitudes de eliminación | pedir, retirar, aprobar, rechazar | Se pidió eliminar «X». / Solicitud sobre «X» aprobada. |
| Otros | contacto de cliente, cola de correo al cliente, preset de filtros, interruptores de accesos, SLA (pedir aprobación, corregir cierre), sumar tarea a un hito, tarea privada, ganar/perder oportunidad | aviso con el nombre correspondiente |

Casos límite: si la API falla, no hay aviso de éxito y el error sigue dentro del diálogo. Una
edición de `FormularioRecurso` sin campo de nombre dice «Cambios guardados.».

### 4. Inventario (P2-10)

`docs/sistema-de-diseno.md` § Inventario de componentes: comprobar que cada nombre existe en
`src/componentes/` y que la lista «Lo que no es un primitivo» explica los ausentes. `BarraProgreso`
vive ahora en `presentadores/` (misma barra en Proyecto, Hito, portal, gestión y reporte).

## Comprobado

- `pnpm lint && pnpm typecheck && pnpm test && pnpm build` en verde (2604 pruebas).
- Navegador: `organizacion`, `exportar-tareas-sheets`, `kanban-del-contacto` y `ficha-del-cliente`
  pasan. Sonda: alta de nota muestra «Nota sonda 3B» se creó.; la reserva busca, marca con chip y
  avatar, y avisa «Sonda 3B» quedó reservada.
- Fallan por causas previas y ajenas: `creacion-tarea` (espera la etiqueta «Proyecto» y el campo dice
  «Proyectos»; los dos altas previas pasan y cierran), `edicion-tarea` (busca «Recurrente» en la
  edición, ya no está ahí), `flujo-licitacion` (no encuentra «Nuevo prospecto»), `importar-tareas`
  (el proyecto destino por defecto no existe en el mock).

## Sin verificar

- Avisos del portal, recurrentes, menú del Proyecto, solicitudes de eliminación, cola de correo y
  contratos: solo revisados en código.
- Pendiente de P1-05: `DetalleActa` y `TareasPropuestas` (se parten en el encargo 4B).
