# Prospectos

> `leads`. Se deja en inglés en la API y en el código; "Prospecto" es solo el nombre visible.

## Qué resuelve

El embudo comercial antes de que exista un cliente. Es el módulo que justifica el grupo Comercial,
porque termina en una acción concreta: **convertir el prospecto en cliente**.

## Pantallas

| Pantalla | Ruta | Qué muestra |
|---|---|---|
| Lista | `/prospectos` | Tabla genérica |
| Embudo | `/prospectos/embudo` | Kanban por etapa, con el motor de Procesos |
| Detalle | `/prospectos/[id]` | Datos, seguimiento, notas, recordatorios, adjuntos, campos personalizados |
| Convertir | superposición | Formulario de conversión a cliente |

## Endpoints que consume

Ninguno todavía. Los que hay que construir:

| Método | Ruta | Devuelve |
|---|---|---|
| `GET` | `/leads` | Colección paginada |
| `GET` | `/leads?vista=embudo` | Columnas por estado, igual que el tablero de Procesos |
| `GET` | `/leads/{id}` | Item |
| `GET` | `/leads/{id}/notas` | Array plano |
| `GET` | `/leads/{id}/actividad` | Array plano |
| `PATCH` | `/leads/{id}` | El prospecto actualizado |
| `POST` | `/leads/{id}/mover` | Cambio de etapa y reorden |
| `POST` | `/leads/{id}/convertir` | El cliente creado |

## Campos

De `tblleads`. Los que la tabla del panel muestra y filtra:

| Campo | Nota |
|---|---|
| `id`, `name`, `title`, `company`, `email`, `phonenumber`, `website` | Identidad |
| `status` → `{id, name, color, order}` | Configurable en Perfex (`tblleads_status`); no es un enum fijo |
| `source` → `{id, name}` | Configurable (`tblleads_sources`) |
| `assigned` → forma reducida de staff | Quién lo atiende |
| `lead_value` | Valor estimado. **Es dinero**: número, no cadena |
| `country`, `city`, `state`, `zip`, `address` | Ubicación |
| `dateadded`, `dateassigned`, `lastcontact`, `last_status_change` | Fechas |
| `is_public`, `lost`, `junk` | Banderas |
| `client_id` | No nulo si ya fue convertido |
| `tags` | |

**`status` y `source` no son enums.** Salen de tablas configurables, así que van en `GET /lookups`
como `lead_statuses` y `lead_sources`, igual que `task_statuses`. Codificarlos en el frontend garantiza
que se rompan cuando alguien agregue una etapa.

## Acciones y escrituras

- Editar campos del prospecto.
- Mover de etapa en el embudo.
- Marcar perdido o basura.
- Registrar contacto (actualiza `lastcontact`).
- **Convertir a cliente**, que es la acción que justifica el módulo.

## Permisos

Feature `leads`, capacidades `view`, `view_own`, `create`, `edit`, `delete`.

La visibilidad de prospectos es más enredada que la de procesos: `is_public` los abre a todo el
equipo, `assigned` los limita a quien los atiende, y `addedfrom` a quien los creó. Esos tres se
combinan en el `WHERE` original — hay que replicarlo, no aproximarlo.

## Reglas del panel que hay que replicar

- **La conversión no es un `INSERT` en `tblclients`.** `Leads_model.php` (38 KB) copia campos, arrastra
  los campos personalizados que tengan equivalencia, crea el contacto primario, marca `client_id` en el
  prospecto y escribe el registro de actividad. Se llama a esa lógica; no se reescribe.
- El cliente resultante debe quedar **idéntico campo a campo** al que produce el panel para el mismo
  prospecto. Ese es el criterio de aceptación, y sin él la conversión no se entrega.
- Cambiar de etapa escribe `last_status_change` y una entrada de actividad.
- Un prospecto `junk` no aparece en el embudo pero sí en la lista con el filtro correspondiente.

Fuente: `application/views/admin/tables/leads.php` (columnas, filtros y permisos),
`application/views/admin/leads/kan-ban.php` y `_kan_ban_card.php` (anatomía de la tarjeta),
`Leads_model.php` (conversión, actividad, asignación).

## Estado de la API

❌ **Hay que construir el recurso.** Patrón, siguiendo `RecursoProcesos`:

1. `modules/api/Recursos/RecursoProspectos.php` — `consulta()` con las whitelists de arriba,
   `listar()`, `ver()`, `columnas()` con `SELECT` explícito (nunca `SELECT *`), `presentarLote()`.
2. `modules/api/Acceso/Visibilidad.php` — el fragmento SQL que combina `is_public`, `assigned` y
   `addedfrom`.
3. `modules/api/controllers/V1.php` — instanciar en el constructor, `case 'leads'` en `despachar()`,
   y un método privado con el sub-switch de rutas.
4. `modules/api/Escritura/ParcheProspecto.php` — whitelist explícita de columnas.
5. Sumar `lead` a `Etiquetas` y `leads` a `CamposPersonalizados::PERMITIDAS`.
6. Extender `lookups` con `lead_statuses` y `lead_sources`.

Lo caro no es el andamiaje: es la visibilidad de tres banderas y la conversión.

## Criterios de aceptación

1. Un prospecto entra, recorre el embudo completo y se convierte en cliente **sin tocar Perfex**.
2. El cliente resultante es idéntico —campo a campo— al que produce el panel viejo para el mismo
   prospecto.
3. Agregar una etapa nueva en Perfex la hace aparecer en el embudo sin tocar código del frontend.
4. La visibilidad coincide con la del panel: verificado con `php index.php api v1 verificacion
   visibilidad` extendido a este recurso.
5. `pnpm lint && pnpm typecheck && pnpm test && pnpm build` en verde.
