# Contrato de la API de Organización (extensión de `/accesos`)

Amplía `contrato-accesos.md` para la pantalla unificada de Organización (`/equipo/jerarquia`), que
reemplaza a `/administracion/accesos`. Todo lo de acá exige **superadministrador**
(`Permisos::exigirSuperadmin()`), igual que el resto de `/accesos`, y responde 403 al resto.
Envoltorio estándar: `{"data": ...}`; colecciones paginadas con `meta.pagination`
(`page`, `per_page`, `total`, `total_pages`).

Todos los cambios a respuestas existentes son **aditivos**: ningún campo se renombra ni se quita.

## 1. Campos nuevos en respuestas existentes

### Persona (`GET /accesos/personas`, `PUT /accesos/personas/{id}`)

Se suman dos banderas del rol de sistema:

```json
{
  "staffid": 21, "nombre": "Ana Pérez", "correo": "ana@wiwo.cl",
  "escalon": "lead", "jefe_staffid": 4, "jefe_nombre": "Luis Soto",
  "area_id": 190, "area_ids": [190], "cargo_id": 1, "activo": true,
  "coordinador_multiarea": false,
  "is_admin": false,
  "is_superadmin": false
}
```

- `is_admin`: `tblstaff.admin = 1` **o** `superadmin = 1` (mismo criterio que `Permisos::esAdmin()`).
- `is_superadmin`: `tblstaff.superadmin = 1`.

El rol de sistema se sigue escribiendo por `PATCH /staff/{id}` con `is_admin` / `is_superadmin`.

### Área del catálogo (`GET /accesos/catalogo` → `areas[]`)

Se suma `en_tareas: bool`, con el mismo cálculo que ya usa `Escritura\Jerarquia::ver()`: si el
nombre del área figura entre las opciones del campo personalizado "Área de la compañía" de los
Procesos (comparación insensible a mayúsculas y espacios de los bordes).

```json
{"id": 190, "nombre": "Analytics", "area_superior_id": null, "jefe_staffid": 21, "personas": 8, "en_tareas": true}
```

## 2. `GET /accesos/personas/{id}/alcance` — "¿Por qué ve esto?"

Explica de dónde sale lo que una persona ve y edita. **El cálculo es de la API**
(`Permisos`, `Jerarquia`); el frontend solo lo pinta.

```json
{
  "staffid": 21,
  "nombre": "Ana Pérez",
  "rol_sistema": "usuario",
  "ve_todo": false,
  "motivo_ve_todo": null,
  "edita_todo": false,
  "jerarquia_activa": true,
  "jefes": [
    {"staffid": 4, "nombre": "Luis Soto", "escalon": "director"}
  ],
  "areas": [{"id": 190, "nombre": "Analytics"}],
  "areas_que_dirige": [
    {"id": 190, "nombre": "Analytics", "subareas": [{"id": 201, "nombre": "BI"}]}
  ],
  "directos": [{"staffid": 30, "nombre": "Pedro Díaz", "escalon": "staff"}],
  "alcanzados": [
    {"staffid": 30, "nombre": "Pedro Díaz", "via": "cadena"},
    {"staffid": 31, "nombre": "Rosa Gil", "via": "area"}
  ],
  "total_alcanzados": 2
}
```

| Campo | Significado |
|---|---|
| `rol_sistema` | `usuario` \| `admin` \| `superadmin` (superadmin gana si tiene las dos banderas) |
| `ve_todo` | `Permisos::veTodo()` |
| `motivo_ve_todo` | `superadmin` \| `admin` \| `coordinador_multiarea` \| `null`. El primero que aplique, en ese orden |
| `edita_todo` | `Permisos::esAdmin()` |
| `jerarquia_activa` | `Jerarquia::activa()` (el interruptor `wiwo_permisos_jerarquia`) |
| `jefes` | `Jerarquia::ancestros()`, ordenados del más cercano al más lejano (por la cadena primero; los que llegan por jefatura de área, después). Vacío si la jerarquía está apagada |
| `areas` | Áreas que lleva puestas (`Jerarquia::areasDe()`) |
| `areas_que_dirige` | Áreas donde figura como `jefe_staffid`, cada una con las áreas de su subárbol (sin incluirse) |
| `directos` | Quienes cuelgan de ella en un salto **por la cadena** (`tblstaff.jefe_staffid`) |
| `alcanzados` | `Jerarquia::descendencia()`, solo personas activas, ordenadas por nombre. `via` = `cadena` si se alcanza siguiendo solo `jefe_staffid`; `area` si solo se alcanza a través de un área que dirige (directa o de un descendiente) |
| `total_alcanzados` | `count(alcanzados)` |

Errores: 404 si la persona no existe; 403 si quien pregunta no es superadmin.

## 3. `GET /accesos/historial` — historial de cambios de la organización

Lista paginada, del más nuevo al más viejo.

Parámetros (todos opcionales):

| Parámetro | Tipo | Filtra |
|---|---|---|
| `persona` | int | Cambios cuya entidad es esa persona (`entidad = persona` y `entidad_id`) |
| `area` | int | Cambios sobre esa área (`entidad = area` y `entidad_id`) |
| `autor` | int | Cambios hechos por ese staff |
| `entidad` | `persona` \| `area` \| `interruptor` | Tipo de entidad |
| `page`, `per_page` | int | Paginación estándar (`per_page` máx. 100) |

Un valor inválido (no entero, entidad desconocida) → 422.

```json
{
  "data": [
    {
      "id": 812,
      "fecha": "2026-09-29 17:40:12",
      "autor": {"staffid": 1, "nombre": "Admin Wiwo"},
      "entidad": "persona",
      "entidad_id": 21,
      "entidad_nombre": "Ana Pérez",
      "campo": "jefe_staffid",
      "antes": "Luis Soto",
      "despues": "Marta Ríos"
    }
  ],
  "meta": {"pagination": {"page": 1, "per_page": 50, "total": 1, "total_pages": 1}}
}
```

- `autor` es `null` si se escribió sin sesión (scripts).
- `antes` / `despues` son **textos legibles resueltos al escribir** (nombre de persona, de área, de
  cargo, etiqueta de escalón, "Sí"/"No"), para que el historial siga leyéndose si el área o la
  persona desaparece. `null` significa "vacío" (sin jefe, sin área…).
- `entidad_nombre` también se guarda al escribir.

### Qué se registra

| Origen | `entidad` | `campo` |
|---|---|---|
| `PUT /accesos/personas/{id}` | `persona` | `escalon`, `jefe_staffid`, `area_id`, `area_ids`, `cargo_id`, `coordinador_multiarea` (una fila por campo que **cambió de verdad**) |
| `PATCH /staff/{id}` con `is_admin` / `is_superadmin` | `persona` | `rol_sistema` (una sola fila con el rol antes y después: Usuario / Administrador / Superadministrador) |
| `POST /accesos/areas` | `area` | `creada` (`antes: null`, `despues`: nombre) |
| `PUT /accesos/areas/{id}` | `area` | `area_superior_id`, `jefe_staffid` (una fila por campo que cambió) |
| `DELETE /accesos/areas/{id}` | `area` | `borrada` (`antes`: nombre, `despues: null`) |
| `PUT /accesos/interruptores` | `interruptor` | la clave de la opción; `antes`/`despues`: "Encendido"/"Apagado" |

La fila se escribe **dentro de la misma transacción** que el cambio: si el cambio se revierte, el
historial también. Un fallo al escribir el historial no debe quedar en silencio (propaga el error).

### Tabla (migración `1130_historial_organizacion.sql`)

```sql
CREATE TABLE tblwiwo_historial_organizacion (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  fecha DATETIME NOT NULL,
  autor_staffid INT NULL,
  autor_nombre VARCHAR(191) NULL,
  entidad VARCHAR(20) NOT NULL,
  entidad_id INT NULL,
  entidad_nombre VARCHAR(191) NULL,
  campo VARCHAR(60) NOT NULL,
  antes VARCHAR(191) NULL,
  despues VARCHAR(191) NULL,
  KEY idx_entidad (entidad, entidad_id, fecha),
  KEY idx_autor (autor_staffid, fecha),
  KEY idx_fecha (fecha)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

Sin la tabla (base sin migrar), las escrituras siguen funcionando y no registran; `GET
/accesos/historial` responde 409 `conflict` con un mensaje que lo explica.
