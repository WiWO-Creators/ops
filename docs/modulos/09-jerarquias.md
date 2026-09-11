# 09 · Jerarquías del equipo

Quién depende de quién. Es el dato que le faltaba al modo En Vivo para que cada líder vea a su gente
(RQ-JOR-14 y RQ-JOR-15).

## El problema que resuelve

El árbol existía y estaba vacío. `tblareas` tiene `area_superior_id` y `jefe_staffid` desde la
migración 137 de `wiwo_core`, y `RecursoJornadas` ya recorta el tablero de En Vivo por ese subárbol.
Pero en la base real, al escribir esto: `tblareas` arrancó en **0 filas** y quedó en **16** —el
catálogo plano de áreas de la compañía, que se sembró en paralelo—, con **0 áreas colgadas de otra, 0
con jefatura y 184 personas con `area_id` en NULL**. El catálogo existe; el árbol y la pertenencia,
no. Nadie dirige nada, así que el recorte no recorta y ningún líder ve a nadie.

Llenarlo era un `UPDATE` a mano o el catálogo del panel viejo de Perfex
(`wiwo_core/controllers/Catalogos.php`), que es **sólo para administradores**. Esta pantalla es lo que
faltaba: que una jefatura acomode su propia rama.

## La jerarquía es por área, no persona a persona

El requerimiento habla de "subordinados directos" de un líder, que suena a una relación
persona → persona. **No hace falta una tabla nueva**: con las tres columnas que ya existen el árbol de
personas se deriva entero.

| Pregunta | Respuesta derivada |
|---|---|
| ¿Quién es el jefe de X? | El `jefe_staffid` del área que X lleva puesta (`tblstaff.area_id`) |
| ¿Quiénes son los subordinados directos de X? | La gente de las áreas que X dirige, sin bajar más |
| ¿Qué ve X en En Vivo? | Esa gente más la de todas las áreas que cuelgan (`Organigrama::areasACargo`) |

Una tabla persona → persona sería una segunda fuente de verdad para el mismo hecho: puede contradecir
al árbol de áreas —¿cuál gana cuando difieren?— y hay que mantenerla a mano para las 184 personas, en
vez de mover un área y que se mueva su gente.

El precio de derivar: dos personas de la misma área tienen el mismo jefe, y no hay cadena de mando
*adentro* de un área. Cuando haga falta, la respuesta sigue siendo un área más —una subárea con su
jefatura—, no una columna nueva en `tblstaff`.

**Nadie es su propio jefe.** Quien dirige un área normalmente también pertenece a ella (así lo asume
"Mi Área"), lo que la pondría entre sus propios subordinados. `subordinadosDirectos()` la saca de su
propia lista; prohibirlo al escribir habría roto la pantalla que ya existe.

## Pantalla

`/equipo/jerarquia`. Se entra desde `/equipo` y desde `/equipo/mi-area`.

> La entrada en la barra lateral falta: agregarla toca `(panel)/layout.tsx`, que es de otro frente.

| Bloque | Qué hace |
|---|---|
| Guía de carga | Qué falta: áreas por crear, áreas sin jefatura, personas sin área. Con el árbol vacío es lo único que se ve, y dice en qué orden hacerlo |
| Árbol | Cada área con su jefatura, su gente y sus áreas hijas. Un desplegable por persona la mueve de área |
| Sin área | La gente activa que no cuelga de nadie. Hoy son las 184 |
| Formulario de área | Nombre, de qué área cuelga y quién la dirige. El selector de superior esconde la propia área y su descendencia |

## Endpoints

| Método | Ruta | Respuesta |
|---|---|---|
| `GET` | `/jerarquia` | `{hay_organigrama, es_admin, areas[], sin_area[], asignables[]}`; **403** si no dirige nada y no administra |
| `POST` | `/jerarquia/areas` | El árbol completo; **403** si no administra |
| `PUT` | `/jerarquia/areas/{id}` | El árbol completo |
| `PUT` | `/jerarquia/personas/{id}` | El árbol completo. Cuerpo: `{area_id}`; `null` la saca de la que tenga |

Cada escritura devuelve el árbol entero y la pantalla reemplaza el que tenía: mover a alguien puede
cambiar quién cuelga de quién y qué se puede editar, y recalcularlo en el navegador sería una segunda
copia de las reglas de la API.

Raíz propia y no `/staff/...` por lo mismo que `/me/mi-area`: `/staff` exige `staff.view` —19 de 184
personas lo tienen— y dirigir un área no otorga capabilities de Perfex. Un jefe sin `staff.view` tiene
que poder ordenar a su gente igual.

## Permisos

No hay permiso nuevo. **El piso por nivel no se toca**: esto agrega una capacidad, no reemplaza ni
recorta ninguna.

| Quién | Qué puede |
|---|---|
| Admin o superadmin | El organigrama entero, y es el único que crea áreas |
| Quien dirige un área | Su rama: esa área, las que cuelgan, y mover gente entre ellas |
| El resto | **403** |

Crear un área queda en administración a propósito: un área nueva nace fuera de la rama de quien la
creó y nadie la vería. Borrarlas sigue en el panel viejo, que ya tiene la guarda de referencias.

## Validaciones

| Regla | Respuesta |
|---|---|
| Un área colgada de sí misma o de su descendencia | **422** |
| Nombre vacío, de más de 191 caracteres o repetido | **422** |
| Área superior o jefatura que no existe, o jefatura inactiva | **422** |
| Tocar un área fuera de la rama propia | **403** |
| La instalación no tiene las columnas del árbol | **409** |

**Lo que no se valida, a propósito**: un área sin jefatura y una persona sin área. Las dos son
estados legítimos —y son *el* estado hoy—, y hay que poder pasar por ellas para armar el árbol. La
pantalla las cuenta y las marca; la API no las prohíbe.

Un ciclo tampoco puede colgar la pantalla: `armarArbol()` corta de su superior toda área que forme
parte de uno y la dibuja como raíz, para que se vea y se pueda arreglar.

## Qué falta, y es carga de datos

Nada de esto se puede hacer desde el código: **alguien tiene que decidir el organigrama**. Las 16
áreas ya están; falta colgarlas unas de otras, ponerle jefatura a cada una y repartir las 184
personas. La pantalla existe justamente para que esa carga no sea un `UPDATE`.

## Código

| Pieza | Dónde |
|---|---|
| Recorrido del árbol (único) | `board: modules/api/Acceso/Organigrama.php` |
| Lectura y escritura | `board: modules/api/Escritura/Jerarquia.php` |
| Recorte de En Vivo | `board: modules/api/Recursos/RecursoJornadas.php::visibilidad()` |
| Tipos y armado del árbol | `src/datos/jerarquia.ts` |
| Pantalla | `src/app/(panel)/equipo/jerarquia/page.tsx`, `src/componentes/equipo/Jerarquia.tsx` |
| Pruebas | `pruebas/jerarquia.test.js`, `board: modules/api/pruebas/jerarquia_equipos.php` y `organigrama_live.php` |
