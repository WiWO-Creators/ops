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

`/equipo/jerarquia`. Se entra desde la barra lateral —para quien administra o dirige un área,
`dirige_areas`—, desde `/equipo` y desde `/equipo/mi-area`.

| Bloque | Qué hace |
|---|---|
| Qué falta | Los dos huecos silenciosos, con su consecuencia: personas sin área (no aparecen en el tablero de ninguna jefatura) y áreas sin jefatura (su gente no reporta a nadie). Desaparece cuando no falta nada |
| Árbol | Una lista indentada por `aria-level`: cada área con su jefatura, su gente, su alcance y las insignias de "Sin jefatura" y "No coincide con ninguna área de los Procesos" |
| Sin área | La gente activa que no cuelga de nadie, con buscador. Hoy son las 184, y vaciar esta lista es el trabajo entero |
| Panel del área elegida | Quién está dentro, con las bajas marcadas, y el buscador para traer a alguien de otra área |
| Formulario de área | Al crear, nombre libre; al editar, el nombre es de solo lectura. De qué área cuelga y quién la dirige. El selector de superior esconde la propia área y su descendencia |
| Borrado | Anticipa lo que la pantalla ya sabe que retiene al área y advierte de los Procesos, que no se ven desde acá |

**El árbol es una lista plana indentada y no un `role="tree"`.** Ese rol es un widget compuesto:
promete foco itinerante y navegación con flechas, y un `treeitem` no admite botones adentro. Cada
fila tiene tres. `aria-level` sobre un `listitem` dice la profundidad sin prometer un teclado que la
pantalla no implementa.

## Endpoints

| Método | Ruta | Respuesta |
|---|---|---|
| `GET` | `/jerarquia` | `{hay_organigrama, es_admin, areas[], sin_area[], asignables[]}`; **403** si no dirige nada y no administra |
| `POST` | `/jerarquia/areas` | El árbol completo; **403** si no administra |
| `PUT` | `/jerarquia/areas/{id}` | El árbol completo. Exige las **tres** claves presentes (`name`, `area_superior_id`, `jefe_staffid`), aunque dos vengan en `null`: un cuerpo parcial desenganchaba el área del árbol en silencio |
| `DELETE` | `/jerarquia/areas/{id}` | El árbol completo; **403** si no administra, **409** si el área está en uso |
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
| Admin o superadmin | El organigrama entero, y es el único que crea y borra áreas |
| Quien dirige un área | Su rama: esa área, las que cuelgan, y mover gente entre ellas |
| El resto | **403** |

Crear un área queda en administración a propósito: un área nueva nace fuera de la rama de quien la
creó y nadie la vería. Borrarlas también, y por lo mismo: la guarda que impide dejar gente colgando
de la nada es de toda la instalación, no de una rama.

## Validaciones

| Regla | Respuesta |
|---|---|
| Un área colgada de sí misma o de su descendencia | **422** |
| Nombre vacío, de más de 191 caracteres o repetido | **422** |
| Área superior o jefatura que no existe, o jefatura inactiva | **422** |
| Tocar un área fuera de la rama propia | **403** |
| La instalación no tiene las columnas del árbol | **409** |
| Renombrar un área (mandar un `name` distinto del que tiene) | **409** |
| Borrar un área con gente, con áreas debajo o usada por Procesos | **409** |

**Renombrar está bloqueado**, y no es una limitación temporal: los Procesos guardan el **nombre** del
área y no su id —el cruce entre los dos lados es por texto—, así que cambiarlo dejaría huérfanos a
los ~2.900 que lo tienen escrito. La pantalla no ofrece el campo y explica por qué. Reenviar el
nombre actual no cuenta como renombre: la comparación ignora mayúsculas y espacios de los bordes.

**El 409 al borrar trae las tres cuentas ya redactadas** y se muestra tal cual:

> El área "Analytics" está en uso: 0 persona(s) asignada(s), 0 área(s) que dependen de ella y 24
> Proceso(s) marcado(s) con ese nombre. Movelos antes de borrarla.

La tercera es la que sorprende: un área puede verse **vacía en la pantalla** —sin gente y sin hijas—
y aun así no poder borrarse. Por eso el diálogo de confirmación anticipa las dos cuentas que la
pantalla conoce y advierte de la tercera, en vez de dejar que el error llegue de golpe.

## Las áreas del equipo son las de la compañía

Son la misma lista: la migración siembra `tblareas` con los 16 nombres del campo "Área de la
compañía" de los Procesos. Por eso cada área trae **`en_tareas`**, que dice si su nombre todavía
figura entre esas opciones.

Cuando llega en `false`, esa área no cruza con ningún Proceso y **nadie se entera**: no hay error,
simplemente no trae nada donde se filtre por área. La pantalla lo marca con una insignia que dice la
consecuencia y no el estado. Un área recién creada nace en `true`, porque el alta sincroniza el
nombre sola.

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
| Tipos | `src/datos/jerarquia.ts` |
| Armado del árbol, alcance y descendencia | `src/dominio/jerarquia.ts` |
| Pantalla | `src/app/(panel)/equipo/jerarquia/page.tsx`, `src/componentes/equipo/Jerarquia.tsx` |
| Pruebas | `pruebas/jerarquia.test.js` (el árbol), `mock/jerarquia.test.js` (el contrato), `pruebas/jerarquia.browser.mjs` (el recorrido), `board: modules/api/pruebas/jerarquia_equipos.php` y `organigrama_live.php` |

## Dos trampas que ya se pisaron

**`dirige_areas` no es `is_director`.** El segundo es el **cargo** "Director" de `tblcargos` —la
regla vieja— y hoy las 184 cuentas de producción llevan cargo "Staff", así que **no lo tiene nadie**.
Todo lo que dependa del organigrama —la entrada de la barra lateral, entre otras cosas— se decide con
`dirige_areas`, que sale del `jefe_staffid` real del árbol. Las dos conviven a propósito.

**Una jefatura recibe sólo su rama, y la raíz de esa rama cuelga de un área que no le llegó.** Al
armar el árbol hay que cortar únicamente ese eslabón: si se sube la cadena entera buscando una raíz y
se promueve a raíz todo lo que no la encuentra, la rama se aplana y la jefatura ve su organigrama sin
niveles, sin sangría y sin el "ve a N con lo que cuelga" — que es justamente para lo que entró. Lo
mismo con un ciclo: se corta a las áreas que forman parte de él, no a las que cuelgan por debajo.
