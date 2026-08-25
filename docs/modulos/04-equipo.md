# Equipo

> `staff`. En inglés en la API y en el código, por convención del glosario.

## Qué resuelve

Quién trabaja acá. Alimenta los selectores de asignados y seguidores de todos los demás módulos.

## Pantallas

| Pantalla | Ruta | Qué muestra |
|---|---|---|
| Lista | `/equipo` | Tabla genérica |
| Ficha | `/equipo/[id]` | Datos de la persona y su trabajo abierto |
| Selector | componente | Buscador de personas, usado en Procesos y Espacios |

## Endpoints que consume

| Método | Ruta | Devuelve |
|---|---|---|
| `GET` | `/staff` | Colección paginada. Requiere el permiso `staff.view` |
| `GET` | `/staff/{id}` | Item |
| `GET` | `/staff?asignables=1` | Solo quienes pueden recibir asignaciones |

### Consulta

| Capacidad | Valores admitidos |
|---|---|
| `filter[]` | `active`, `role_id` |
| `sort` | `firstname`, `lastname`, `last_login`. Por defecto `firstname` |
| `q` | Busca en `firstname`, `lastname`, `email` |

## Campos

```jsonc
{
  "id": 7, "email": "…", "firstname": "…", "lastname": "…", "full_name": "…",
  "profile_image_url": null,
  "is_admin": false, "role_id": 3, "active": true,
  "is_not_staff": false,
  "last_login": "2026-08-25T08:12:00Z"
}
```

Hay una **forma reducida** que aparece embebida en `assignees`, `followers` y `members` de otros
recursos: `{id, full_name, profile_image_url}`. El componente Avatar debe funcionar con esa forma
reducida, que es la que más circula.

## Acciones y escrituras

Ninguna. El equipo se administra en el panel de Perfex, y así se queda: crear staff toca roles,
permisos y contraseñas.

## Permisos

`GET /staff` exige `staff.view`. Sin él devuelve `403`, así que la sección de la barra lateral se
oculta cuando `permissions.staff` no incluye `view`.

`is_not_staff` marca cuentas que existen pero no son personal operativo: no deben aparecer en los
selectores de asignación. Para eso está `?asignables=1`, que ya lo filtra en el servidor — el frontend
no debería filtrar por su cuenta.

## Reglas del panel que hay que replicar

- `full_name` es un campo virtual (`firstname` + `lastname`). No concatenar en el frontend: viene
  hecho.
- Una cuenta inactiva sigue apareciendo en trabajo histórico. No se la borra de las listas de
  asignados de procesos viejos.

## Estado de la API

✅ Existe, solo lectura.

## Criterios de aceptación

1. Sin `staff.view`, la sección Equipo no aparece en la barra lateral y `/equipo` no rompe.
2. El selector de asignados usa `?asignables=1` y no muestra cuentas `is_not_staff`.
3. El Avatar funciona con la forma reducida embebida, sin pedir el staff completo.
4. `pnpm lint && pnpm typecheck && pnpm test && pnpm build` en verde.
