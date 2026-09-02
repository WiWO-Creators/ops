# Clientes

> `clients` (`tblclients`, clave `userid`) más sus `contacts`.

## Qué resuelve

Quién es el cliente, quién lo atiende, cómo contactarlo, y qué hay abierto con él.

## Pantallas

| Pantalla | Ruta | Qué muestra |
|---|---|---|
| Lista | `/clientes` | Tabla genérica |
| Detalle | `/clientes/[id]` | Datos, facturación, etiquetas, campos personalizados |
| Contactos | `/clientes/[id]?tab=contactos` | Alta, edición, baja y borrado de los contactos del cliente |
| Espacios del cliente | `/clientes/[id]/espacios` | La tabla de Espacios con el filtro fijo |

## Endpoints que consume

| Método | Ruta | Devuelve |
|---|---|---|
| `GET` | `/clients` | Colección paginada |
| `GET` | `/clients/{id}` | Item |
| `GET` | `/projects?filter[clientid]={id}` | Sus espacios |

### Consulta

| Capacidad | Valores admitidos |
|---|---|
| `filter[]` | `active`, `country_id` |
| `sort` | `company`, `datecreated`. Por defecto `company` |
| `q` | Busca en `company`, `phonenumber`, `vat` |
| `include` | `custom_fields`, `contacts` |

## Campos

```jsonc
{
  "id": 12,                       // es userid en la base
  "company": "…",                 // con respaldo: contacto primario, o "Cliente #12"
  "vat": "76.123.456-7",          // RUT
  "phonenumber": null, "city": null, "state": null, "zip": null, "address": null,
  "country_id": 44,
  "website": "", "active": true,
  "default_currency": 1, "default_language": "spanish",
  "datecreated": "2026-01-10T09:00:00Z",
  "lead_id": 88,                  // si vino de un prospecto convertido
  "billing": {"street": null, "city": null, "state": null, "zip": null, "country_id": 44},
  "tags": [{"id": 2, "name": "…"}]
}
```

Con `include=contacts`: `id, full_name, email, phonenumber, title, is_primary`.
Con `include=custom_fields`: `id, slug, name, type, value`.

Los campos de texto vacíos llegan como `null`, no como `""`.

## Acciones y escrituras

**Ninguna todavía.** El recurso es de solo lectura en la API v1. Crear y editar clientes se hace en el
panel clásico, o se agrega un `Escritura/ParcheCliente.php` siguiendo el patrón de Procesos.

Cuando se agregue: `tblclients` tiene disparadores de facturación y del portal de clientes, así que la
whitelist debe ser explícita y corta.

## Permisos

Feature `customers`, en `permissions.customers` de `GET /me`.

## Reglas del panel que hay que replicar

- **`company` puede venir vacío en la base.** El panel muestra el nombre del contacto primario, y si
  tampoco hay, `"Cliente #<id>"`. La API ya aplica ese respaldo: el frontend no debe repetirlo ni
  mostrar vacíos.
- `lead_id` no nulo significa que el cliente nació de una conversión de prospecto — enlazar al
  prospecto de origen.

Fuente: `application/views/admin/tables/clients.php` y `Clients_model.php`.

## Estado de la API

✅ Existe, solo lectura.

## Criterios de aceptación

1. Un cliente sin `company` en la base se muestra con el nombre de su contacto primario, nunca vacío.
2. `include=contacts` marca correctamente el contacto primario.
3. Buscar por RUT con `q` encuentra al cliente.
4. `pnpm lint && pnpm typecheck && pnpm test && pnpm build` en verde.

## Contactos

**Es la única parte del módulo que escribe.** El cliente en sí se sigue dando de alta y editando en el
panel clásico —toca impuestos, monedas, grupos y campos que no vale la pena reimplementar—, pero sus
contactos se administran acá.

### Por qué se rehizo

La pestaña era de solo lectura y consumía `include=contacts`, que devuelve **solo los activos**. Un
cliente con contactos dados de baja se veía exactamente igual que uno sin ninguno: "Este cliente no
tiene contactos activos", sin forma de reactivarlos ni de saber que existieron. Y para los 112 de 122
clientes que no tienen ningún contacto, el mensaje mandaba al panel clásico en vez de ofrecer crearlo.

Ahora la pestaña pide `GET /clients/{id}/contacts`, que **devuelve todos**. Los de baja se ven
atenuados y con la insignia *De baja* —el estado va en el texto, no solo en la opacidad—, y se
reactivan con un botón. El número de la pestaña cuenta solo los activos: contarlos a todos prometería
más gente a la que escribirle de la que hay.

### Qué se puede hacer

| Acción | Permiso | Nota |
|---|---|---|
| Ver | `customers.view` | Todos, activos y de baja |
| Crear, editar, dar de baja, reactivar, marcar principal | `customers.edit` | Es el mismo permiso que usa el panel (`Clients.php:660`) |
| Borrar | `customers.delete` | Borrado real, como en el panel |

Dos reglas propias, porque el panel las deja pasar y después rompen:

- **El primer contacto de un cliente es principal** aunque nadie marque la casilla. Sin eso el cliente
  queda sin contacto principal para siempre y el envío de documentos del panel no sabe a quién
  escribirle.
- **No se puede desmarcar ni borrar al principal mientras haya otros.** Elegir el reemplazo no es
  decisión de la API: el `409` dice que primero hay que marcar a otro.

### Dos cosas que la pantalla dice, y por qué

- **Crear un contacto no manda ningún correo.** `Clients_model::add_contact()` termina en
  `send_mail_template()` con la contraseña en claro; la API no envía correo en ninguna escritura.
  La contraseña que se ponga acá hay que entregarla por otro medio. El formulario lo dice, porque si
  no, alguien crea el contacto y se queda esperando que le llegue el aviso.
- **Los avisos por correo los manda el panel**, no esta pantalla. Se editan igual —son la misma fila
  de la base— pero quien los marca tiene que saber quién los dispara, o va a probar desde Ops y
  concluir que la casilla no funciona.
