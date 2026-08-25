# Clientes

> `clients` (`tblclients`, clave `userid`) más sus `contacts`.

## Qué resuelve

Quién es el cliente, quién lo atiende, cómo contactarlo, y qué hay abierto con él.

## Pantallas

| Pantalla | Ruta | Qué muestra |
|---|---|---|
| Lista | `/clientes` | Tabla genérica |
| Detalle | `/clientes/[id]` | Datos, facturación, etiquetas, campos personalizados |
| Contactos | `/clientes/[id]/contactos` | Contactos del cliente, con el primario marcado |
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
