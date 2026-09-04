# Equipo

> `staff`. En inglés en la API y en el código, por convención del glosario.

## Qué resuelve

Quién trabaja acá. Alimenta los selectores de asignados y seguidores de todos los demás módulos.

## Pantallas

| Pantalla | Ruta | Qué muestra |
|---|---|---|
| Lista | `/equipo` | Tabla genérica, con avatar, rol y el nombre enlazado a la ficha |
| Ficha | `/equipo/[id]` | Quién es, su legajo, sus permisos, su tiempo y su trabajo abierto |
| Permisos | diálogo en la ficha | Matriz de permisos individuales de esa persona, editable |
| Selector | componente | Buscador de personas, usado en Procesos y Espacios |

## Endpoints que consume

| Método | Ruta | Devuelve |
|---|---|---|
| `GET` | `/staff` | Colección paginada. Requiere el permiso `staff.view` |
| `GET` | `/staff/{id}` | La ficha: el item más `role`, `departments`, `permissions`, `tiempo` y `counts` |
| `GET` | `/staff?asignables=1` | Solo quienes pueden recibir asignaciones |
| `GET` | `/roles/catalogo` | Las áreas y capacidades con las que se dibuja la matriz de permisos. Exige `roles.view` |
| `POST` `PATCH` `DELETE` | `/staff`, `/staff/{id}` | Alta, edición, baja y borrado con transferencia |

La ficha pide además, desde el navegador y no en el render inicial:

| Método | Ruta | Para qué |
|---|---|---|
| `GET` | `/tasks?assignee={id}&filter[status]=1,2,3,4` | Sus Tareas abiertas |
| `GET` | `/projects?filter[member]={id}` | Los Proyectos donde participa |

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
  "is_not_staff": false, "phonenumber": null, "hourly_rate": 0,
  "last_login": "2026-08-25T08:12:00Z",
  "date_created": "2025-09-26T22:22:34Z",
  "last_activity": "2026-07-31T17:50:14Z",   // la escribe SOLO el panel viejo
  "two_factor_enabled": false
}
```

La ficha agrega `role`, `departments`, `permissions`, `tiempo` y `counts`. La forma exacta está en
[`../contrato-api.md`](../contrato-api.md); lo que hay que saber acá es por qué no están en el
listado: son cinco consultas por persona, y una tabla de 179 filas las pagaría 179 veces.

Hay una **forma reducida** que aparece embebida en `assignees`, `followers` y `members` de otros
recursos: `{id, full_name, profile_image_url}`. El componente Avatar debe funcionar con esa forma
reducida, que es la que más circula.

## Acciones y escrituras

Alta, edición, baja y borrado, desde el listado y desde la ficha (`componentes/equipo/`). El borrado
son dos pasos: `DELETE` da de baja y se deshace con "Reactivar"; el definitivo exige elegir a quién
pasa el trabajo, porque la API lo rechaza sin `transferir_a`. Desde la ficha, el borrado definitivo
vuelve al listado en vez de dejar abierto el detalle de alguien que ya no existe.

Ninguna escritura manda correo: la contraseña de un alta hay que entregarla por otro medio.

## Permisos

`GET /staff` exige `staff.view`. Sin él devuelve `403`, así que la sección de la barra lateral se
oculta cuando `permissions.staff` no incluye `view`.

### Permisos individuales

El acceso efectivo de cada persona vive **sólo** en `tblstaff_permissions`, fila por fila. El rol es
una plantilla: se copia cuando se lo aplica y después no manda nada. Por eso la ficha puede dar y
quitar permisos de a uno sin tocar el rol de nadie — es el diálogo **Permisos**, que guarda con
`PATCH /staff/{id}`.

Tres reglas del contrato que la pantalla respeta, y que están probadas en
`pruebas/permisos-individuales.test.js`:

- **Sólo se reescribe el área que viene nombrada** en `permissions`. Un área ausente queda intacta;
  un área con `[]` se vacía. Por eso la matriz nombra todas sus áreas y ninguna otra: los módulos del
  panel clásico que la API no declara (`goals`, `reports`, `prchat`, `knowledge_base`) se listan al
  pie del diálogo y no se tocan.
- **Nadie reparte lo que no tiene.** La API responde `escalada` a una capacidad que quien edita no
  posee, así que esas casillas se dibujan deshabilitadas; si la persona ya las tenía, viajan intactas.
- **A un administrador no se le edita nada**: mientras lo sea, la API le vacía la tabla a propósito
  —`is_admin()` contesta que sí a todo— y el diálogo lo dice en vez de ofrecer casillas que no se
  guardan.

`is_not_staff` marca cuentas que existen pero no son personal operativo: no deben aparecer en los
selectores de asignación. Para eso está `?asignables=1`, que ya lo filtra en el servidor — el frontend
no debería filtrar por su cuenta.

## Reglas del panel que hay que replicar

- `full_name` es un campo virtual (`firstname` + `lastname`). No concatenar en el frontend: viene
  hecho.
- Una cuenta inactiva sigue apareciendo en trabajo histórico. No se la borra de las listas de
  asignados de procesos viejos.

## Estado de la API

✅ Existe, con lectura y escritura.

Lo que la base guarda y la API **no** expone, por decisión: `last_ip` (dato de seguridad),
`email_signature`, `default_language`, y las redes de Perfex (`facebook`, `linkedin`, `skype`), que
en producción están vacías. Tampoco hay endpoint de actividad por persona ni de horas fuera de un
Espacio: el tiempo de la ficha son totales, y el detalle sigue viviendo en
`GET /projects/{id}/timesheets`.

**Asistencia, horario y disponibilidad no existen en el backend**: no hay tabla ni módulo. Lo más
cercano es `last_login`, `last_activity` y las reservas de sala.

## Criterios de aceptación

1. Sin `staff.view`, la sección Equipo no aparece en la barra lateral, y ni `/equipo` ni
   `/equipo/[id]` rompen: la ficha muestra "sin permiso", no un error.
2. El selector de asignados usa `?asignables=1` y no muestra cuentas `is_not_staff`.
3. El Avatar funciona con la forma reducida embebida, sin pedir el staff completo.
4. La ficha de alguien sin rol, sin departamentos y sin horas se pinta entera: "Sin rol", la sección
   de departamentos no se dibuja y el tiempo muestra `00:00`.
5. `pnpm lint && pnpm typecheck && pnpm test && pnpm build` en verde.
