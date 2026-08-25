# Mi trabajo

> No es una entidad de Perfex: son vistas sobre `tasks` centradas en quien mira.

## Qué resuelve

La pantalla de inicio. Qué tengo que hacer hoy, qué está por vencer, qué cronómetro dejé corriendo.

## Pantallas

| Pantalla | Ruta | Qué muestra |
|---|---|---|
| Inicio | `/` | Mis Procesos agrupados por vencimiento |
| Cronómetro activo | barra superior | Presente en todo el panel |

## Endpoints que consume

| Método | Ruta | Para qué |
|---|---|---|
| `GET` | `/me` | Quién soy, mis permisos, mis secciones |
| `GET` | `/tasks?assignee={miId}&filter[status]=1,2,3,4` | Lo asignado y sin terminar |
| `GET` | `/tasks?follower={miId}` | Lo que sigo |
| `GET` | `/lookups` | Estados y prioridades para los agrupadores |
| `DELETE` | `/tasks/{id}/timer` | Detener desde la barra superior |

## Campos

Los mismos de [Procesos](01-procesos.md). Este módulo no agrega campos: agrupa.

Grupos por vencimiento, calculados en el frontend sobre `due_date`:

| Grupo | Regla |
|---|---|
| Vencidos | `due_date` anterior a hoy |
| Hoy | `due_date` es hoy |
| Esta semana | dentro de los próximos 7 días |
| Más adelante | el resto |
| Sin fecha | `due_date` nulo |

`due_date` llega como `"YYYY-MM-DD"` **sin zona horaria, a propósito**. Compararla convirtiéndola a
`Date` en UTC corre el día para quien esté en `America/Santiago`. La comparación se hace por cadena
contra la fecha local de hoy, con el ayudante de `src/lib/fechas.ts`.

## Acciones y escrituras

Las mismas de Procesos, invocadas desde las tarjetas: completar, arrancar y detener cronómetro.

## Permisos

Ninguno propio. Si `permissions.tasks` no incluye `view`, la pantalla queda vacía con un estado vacío
explicativo, no con un error.

## Reglas del panel que hay que replicar

- **El cronómetro activo es global, no por proceso.** Una persona tiene a lo sumo uno abierto en todo
  el sistema. La barra superior lo consulta al montar (`timer_activo` viene en cada proceso, pero el
  cronómetro de la barra sale de `GET /tasks?assignee={miId}` y de la respuesta de arrancar).
- Arrancar un cronómetro desde acá tiene las mismas cascadas que en Procesos: cierra los demás de esa
  persona y puede cambiar el estado del proceso.

## Estado de la API

✅ Existe. Todo sale de recursos ya disponibles.

Nota: `assignee` y `follower` son parámetros sueltos, **fuera de `filter[]`**, y no se validan — un
valor no numérico se ignora en silencio en vez de dar `422`. Al construir la petición hay que
asegurarse de mandar el id como número, o la pantalla muestra los procesos de todo el mundo sin avisar.

## Criterios de aceptación

1. Un proceso que vence hoy aparece en "Hoy" para alguien en `America/Santiago`, no en "Vencidos".
2. Un proceso sin fecha aparece en "Sin fecha" y no se pierde.
3. Detener el cronómetro desde la barra superior lo refleja en la tarjeta del proceso sin recargar.
4. Sin permiso de ver procesos, la pantalla muestra un estado vacío, no un error.
5. `pnpm lint && pnpm typecheck && pnpm test && pnpm build` en verde.
