# F2 — CRM

Prospectos y Clientes. La primera fase donde `ops-v2` escribe de verdad y de forma amplia.

**A la mitad**: Clientes está construido y escribe; Prospectos no tiene ni una pantalla, aunque su
API está completa y producción tiene 81 filas esperándola.

## Qué se construye

`[x]` construido y en `main`. `[ ]` pendiente.

### Prospectos (leads)

Nada de esto existe en `src/`. No hay ruta `/prospectos`, ni definición, ni tipo.

- `[ ]` Lista con la tabla genérica.
- `[ ]` Tablero por etapa del embudo, con el mismo motor de F1.
- `[ ]` Detalle: datos, actividad, notas, recordatorios, adjuntos, campos personalizados.
- `[ ]` **Conversión a Cliente**. Ojo: `POST /leads/{id}/convertir` **no existe y no se va a
  construir** — decisión del usuario, la conversión sigue haciéndose en el panel. Lo que era "la
  acción que justifica la fase" ya no lo es.

### Clientes

- `[x]` Lista y detalle (`/clientes`, `/clientes/[id]`), en tabla y en tarjetas.
- `[x]` Alta y edición del cliente, contra `POST /clients` y `PATCH /clients/{id}`. El plan y las
  fichas viejas decían que esto se quedaba en el panel: es falso desde
  `VistaClientes.tsx` + `AccionesCliente.tsx`.
- `[x]` Contactos del cliente, con su enlace de acceso al portal.
- `[x]` Sus Espacios y Procesos asociados.
- `[ ]` Grupos de clientes. La API los escribe (`GET|POST /customer-groups`); la pantalla no los
  ofrece.

### API

`[x]` Terminada: escritura de `tasks` y `projects`, los recursos `leads`, `clients`, `contacts`,
`notifications` y `activity`, y la subida de archivos (`POST /tasks/{id}/files`,
`POST /projects/{id}/files`).

## Qué se reusa

| De dónde | Qué |
|---|---|
| `application/views/admin/tables/leads.php` (14 KB) | Columnas, filtros y permisos de la tabla |
| `application/views/admin/leads/kan-ban.php` y `_kan_ban_card.php` | Anatomía de la tarjeta del embudo |
| `Leads_model.php` (38 KB) | Conversión, registro de actividad, asignación |
| `application/helpers/upload_helper.php:186` | `handle_project_file_uploads()`, llamado tal cual |
| El motor de Tabla y Tablero de F1 | Sin cambios: sólo definiciones nuevas |

## Criterios de aceptación

1. ~~Un prospecto entra, recorre el embudo completo y se convierte en cliente sin tocar Perfex.~~
   **Derogado**: la conversión se queda en el panel por decisión del usuario. Lo que sí hay que
   poder hacer es recorrer el embudo.
2. ~~Tras la conversión, el cliente resultante es idéntico al que produce el panel viejo.~~ Cae con
   el anterior.
3. `[ ]` Se sube un adjunto a un Proceso desde `ops-v2` y aparece en el panel viejo, en la misma
   ruta de `uploads/`, con la misma validación de extensión. El endpoint existe; falta la pantalla
   (es el detalle de Proceso de F1).
4. ~~Crear y editar un Proceso dispara las mismas notificaciones que hacerlo desde el panel.~~
   **Derogado**: ninguna escritura de la API emite efectos externos, y eso es deliberado. El
   registro de actividad sí se escribe y sí se coteja.
5. `[x]` Un archivo mayor que `post_max_size` devuelve `413` explícito, no un fallo silencioso.
6. `[x]` `pnpm lint && pnpm typecheck && pnpm test && pnpm build` en verde.
7. `[x]` `modules/api/herramientas/humo.sh` en verde, ampliado con los endpoints de escritura.

**Resumen: lo que falta de F2 es Prospectos entero.** Clientes está cerrado.

## Riesgos

| # | Riesgo | Mitigación |
|---|---|---|
| R1 | La conversión de prospecto es la operación con más efectos secundarios del sistema | No reimplementarla. Llamar al modelo, y verificar con el criterio 2 |
| R2 | Subida de archivos: superficie de seguridad | Reusar `handle_project_file_uploads()` sin tocarla. Ya trae validación de extensión, miniaturas y creación de rutas, y está probada en producción |
| R3 | PHP falla en silencio cuando el archivo supera `post_max_size`: `$_FILES` llega vacío | Detectar `CONTENT_LENGTH` mayor al límite con `$_FILES` vacío, y devolver `413` |
| R4 | La escritura amplía la superficie donde una divergencia rompe el rollback | Ninguna regla de negocio en el frontend. Toda escritura pasa por un modelo de Perfex |

## Deuda consciente

- Formulario de creación de prospectos (`formbuilder.php`, 33 KB): sólo los campos estándar más los
  personalizados. El constructor de formularios web sigue en el panel viejo.
- Importación masiva de prospectos: se queda en Perfex.

## Lo que se aprendió

_(Se completa al cerrar la fase.)_
