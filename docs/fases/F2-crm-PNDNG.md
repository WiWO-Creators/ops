# F2 — CRM

Prospectos y Clientes. La primera fase donde `ops-v2` escribe de verdad y de forma amplia.

## Qué se construye

### Prospectos (leads)

- Lista con la tabla genérica.
- Tablero por etapa del embudo, con el mismo motor de F1.
- Detalle: datos, actividad, notas, recordatorios, adjuntos, campos personalizados.
- **Conversión a Cliente**, que es la acción que justifica la fase.

### Clientes

- Lista y detalle.
- Contactos del cliente.
- Sus Espacios y Procesos asociados.

### API

Escritura completa de `tasks` y `projects`, más los recursos `leads`, `clients`, `contacts`,
`notifications` y `activity`. Subida de archivos.

## Qué se reusa

| De dónde | Qué |
|---|---|
| `application/views/admin/tables/leads.php` (14 KB) | Columnas, filtros y permisos de la tabla |
| `application/views/admin/leads/kan-ban.php` y `_kan_ban_card.php` | Anatomía de la tarjeta del embudo |
| `Leads_model.php` (38 KB) | Conversión, registro de actividad, asignación |
| `application/helpers/upload_helper.php:186` | `handle_project_file_uploads()`, llamado tal cual |
| El motor de Tabla y Tablero de F1 | Sin cambios: sólo definiciones nuevas |

## Criterios de aceptación

1. Un prospecto entra, recorre el embudo completo y se convierte en cliente **sin tocar Perfex**.
2. Tras la conversión, el cliente resultante es idéntico —campo a campo— al que produce el panel viejo
   para el mismo prospecto.
3. Se sube un adjunto desde `ops-v2` y aparece en el panel viejo, en la misma ruta de `uploads/`, con
   la misma validación de extensión.
4. Crear y editar un Proceso desde `ops-v2` dispara las mismas notificaciones y el mismo registro de
   actividad que hacerlo desde el panel. Verificado en `tblactivity_log` y en la campana del panel.
5. Un archivo mayor que `post_max_size` devuelve `413` explícito, no un fallo silencioso.
6. `pnpm lint && pnpm typecheck && pnpm test && pnpm build` en verde.
7. `tools/smoke.sh` sigue en verde, ampliado con los endpoints de escritura.

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
