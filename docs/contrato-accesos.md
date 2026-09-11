# Contrato de la API de Accesos (módulo centralizado de roles, escalones, permisos y áreas)

Todos los endpoints exigen **superadmin** (`Permisos::esSuperadmin()`), devuelven 403 si no.
Prefijo: `/accesos`. Respuestas con el envoltorio estándar del módulo (`Respuesta::datos()`).

## Modelo

Un **escalón** (antes "nivel") es una fila de `tblwiwo_escalones`:

| campo | tipo | significado |
|---|---|---|
| `clave` | string(30), PK | identificador estable, `[a-z_]{2,30}`. No se puede cambiar nunca |
| `nombre` | string(80) | etiqueta visible, editable |
| `orden` | int | posición en la escalera; **el orden ES la herencia del piso** |
| `piso` | JSON `{feature: [capacidades]}` | lo que otorga por sí mismo, sin heredar |
| `alcance` | `propio` \| `area` \| `todo` | cuántas filas ve (ver `Acceso\Alcance`) |
| `jefatura` | bool | si cuenta como jefatura (resúmenes de equipo) |
| `asignable` | bool | si el override por persona lo puede escribir |
| `sistema` | bool | `usuario`, `admin`, `superadmin`: no se borran, no cambian orden/alcance |

Semilla: los 6 escalones actuales con su piso y alcance exactos de `Reglas::PISO` y `Alcance::POR_NIVEL`.

## Endpoints

### `GET /accesos/catalogo`
Todo lo que la pantalla necesita en una sola llamada.

```json
{
  "escalones": [{"clave":"usuario","nombre":"Usuario","orden":1,"piso":{"tasks":["create","edit"]},
                 "alcance":"propio","jefatura":false,"asignable":true,"sistema":true,"personas":120}],
  "roles":     [{"id":3,"nombre":"Director","escalon":"head","personas":17}],
  "areas":     [{"id":190,"nombre":"Analytics","area_superior_id":null,"jefe_staffid":21,"personas":8}],
  "cargos":    [{"id":1,"nombre":"Director","personas":4}],
  "features":  {"tasks":["view","create","edit","delete"],"projects":["..."]},
  "alcances":  ["propio","area","todo"],
  "interruptores": [{"clave":"wiwo_permisos_reglas","valor":"1","tipo":"booleano",
                     "nombre":"Reglas de permiso por escalón",
                     "descripcion":"Apagarlo deja a cada persona solo con sus casillas de Perfex."}]
}
```

`features` sale del catálogo de capacidades de Perfex que ya conoce el módulo; sirve para que la
pantalla ofrezca las casillas del piso sin inventar nombres.

### Escalones
- `POST /accesos/escalones` — `{clave, nombre, orden, piso, alcance, jefatura, asignable}`
- `PUT /accesos/escalones/{clave}` — mismos campos menos `clave`. En los de sistema solo `nombre`.
- `DELETE /accesos/escalones/{clave}` — 409 si `sistema = 1`, o si alguna persona o rol lo usa
  (el cuerpo del error dice cuántas y cuáles roles).

Validaciones: `orden` único; `alcance` dentro de `Alcance::ORDEN`; `piso` solo con features y
capacidades que existan; `clave` única y con el formato de arriba.

### Roles (`tblroles`)
- `POST /accesos/roles` — `{nombre, escalon}`
- `PUT /accesos/roles/{id}` — `{nombre?, escalon?}`; `escalon` escribe el mapa
  `wiwo_permisos_niveles_por_rol`, `nombre` escribe `tblroles.name`.
- `DELETE /accesos/roles/{id}` — 409 si tiene personas.

### Personas (asignación central)
- `PUT /accesos/personas/{staffId}` — `{rol_id?, escalon?, area_id?, cargo_id?}`; cada campo es
  opcional y se escribe solo el que venga. `escalon: null` borra el override y vuelve al rol.
  Reusa `Escritura\NivelPersona` (que ya impide cambiarse a uno mismo y valida asignables).
- `GET /accesos/personas?buscar=&escalon=&rol=&area=&page=&per_page=` — listado paginado con
  `{staffid, nombre, correo, rol_id, escalon_efectivo, escalon_override, area_id, cargo_id, activo}`.
  La colección viaja en `data`; la paginación en `meta.pagination`, con `page`, `per_page`,
  `total` y `total_pages`. La reasignación es atómica: si un campo falla, no se guarda ninguno.
  Solo `escalon: null` elimina el override; vacío, booleanos y arrays se rechazan con 422.

### Áreas (`tblareas`) y cargos (`tblcargos`)
- `POST|PUT|DELETE /accesos/areas[/{id}]` — `{nombre, area_superior_id, jefe_staffid}`.
  Rechaza ciclos en el árbol (ya hay validación en `Escritura\Jerarquia`, reusarla).
  `DELETE` con personas dentro: 409.
- `POST|PUT|DELETE /accesos/cargos[/{id}]` — `{nombre}`. `DELETE` de un cargo por defecto
  (`wiwo_core_director_cargo_id`, `wiwo_core_default_cargo_id`): 409.

### Interruptores
- `PUT /accesos/interruptores` — `{"wiwo_permisos_reglas": "1", "wiwo_permisos_alcance": "0"}`.
  Solo la lista blanca de claves que devuelve el catálogo. Cualquier otra: 422.

Lista blanca: `wiwo_permisos_reglas`, `wiwo_permisos_alcance`, `wiwo_permisos_roles_admin`,
`wiwo_campo_area_id`, `wiwo_permisos_niveles_por_rol` (este último solo por la ruta de roles).

## Errores
Formato de error del módulo: `{"error":{"code":"conflict","message":"…","details":{}}}`.
`message` está en español y `details` es opcional. 409 para los bloqueos por uso,
422 para validación, 403 para quien no es superadmin. Las escrituras de catálogos devuelven
el catálogo completo en `data` (201 al crear, 200 al editar o borrar); la reasignación devuelve
la persona actualizada.
