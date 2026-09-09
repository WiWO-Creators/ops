# Prospectos

> **No es [`/leads`](10-prospectos.md).** Aquel es el embudo heredado de Perfex, donde cada fila es
> **una persona** moviéndose por etapas, y no tiene pantalla en este panel. Un Prospecto es **una
> empresa** a la que se le está licitando, con varias personas de contacto y varias
> [Licitaciones](11-licitaciones.md) colgando. Tablas distintas, rutas distintas, ninguna escribe la
> del otro. El porqué completo está en la cabecera de
> `modules/api/migraciones/0320_prospectos.sql`.

## Qué resuelve

El nivel que faltaba entre "empresa candidata" y "propuesta". Hasta la migración `0320`, cada
Licitación cargaba **su propia copia** de la empresa y de su contacto: dos licitaciones a la misma
empresa eran dos empresas escritas dos veces, y ganar las dos creaba **dos clientes con el mismo
nombre**. El Prospecto es donde esa empresa se escribe una sola vez.

El flujo que resuelve, en orden:

```
Prospecto (empresa)  →  Contactos  →  Licitaciones (los "proyectos que se están licitando")
                                         →  Tareas, hitos, tiempos, archivos
                                         →  ganada  → nace el cliente (una sola vez)
                                         →  perdida → el Espacio se archiva
```

## Pantallas

| Pantalla | Ruta | Qué muestra |
|---|---|---|
| Lista | `/prospectos` | Tabla: empresa, estado, licitaciones (total / abiertas / ganadas), cliente |
| Detalle | `/prospectos/[id]` | Cabecera + Ficha, Contactos, Licitaciones |

**No monta `DetalleDeEspacio`**, a diferencia de Licitaciones y Upselling: un Prospecto no es un
Espacio —no tiene tareas, ni hitos, ni horas— y darle esas pestañas sería inventar datos. El trabajo
vive en cada licitación suya, a un clic desde la pestaña Licitaciones.

La pestaña **Licitaciones** es el listado de `/licitaciones` acotado con
`consultaFija: 'filter[prospecto_id]=N'`: hereda gratis la paginación, el orden, la búsqueda y —lo
importante— la visibilidad de Espacio que ya aplica ese endpoint. Va como `consultaFija` y no como
filtro de la vista para que el id **no viaje en la URL**, donde sería editable y bastaría cambiar el
número para ver las licitaciones de otra empresa bajo este nombre.

## Endpoints que consume

| Método | Ruta | Devuelve |
|---|---|---|
| `GET` | `/prospectos` | Colección paginada, con los tres contadores resueltos |
| `GET` | `/prospectos/{id}` | Item + `contactos` + `licitaciones`, los dos en lote |
| `POST` | `/prospectos` | `201` con el item |
| `PATCH` | `/prospectos/{id}` | El item actualizado |
| `DELETE` | `/prospectos/{id}` | `204`, o **`409` si tiene licitaciones** |
| `GET` | `/prospectos/{id}/contactos` | La lista completa, sin paginar |
| `POST` | `/prospectos/{id}/contactos` | `201` con el contacto |
| `PATCH` | `/prospectos/{id}/contactos/{cid}` | El contacto actualizado |
| `DELETE` | `/prospectos/{id}/contactos/{cid}` | `204`, o **`409` si ya existe como contacto real** |
| `GET` | `/licitaciones?filter[prospecto_id]=N` | Las licitaciones del prospecto, con su paginación |

### Consulta

| Capacidad | Valores admitidos |
|---|---|
| `filter[]` | `cliente_id`. **No hay `estado`**: es derivado, no una columna, y el backend devolvería `422` |
| `sort` | `empresa`, `creado_en`. Por defecto `-creado_en` |
| `q` | Busca en `empresa` |
| `include` | **Ninguno.** El listado ya trae los contadores y la ficha ya trae los hijos |

## Campos

```jsonc
{
  "id": 8,
  "empresa": "Minera Flujo SpA",   // copia de cliente.company: por lo que se ordena y se busca
  "estado": "ganado",              // DERIVADO, ver abajo
  "cliente":  { "company": "…", "vat": null, "phonenumber": null, "website": null,
                "address": null, "city": null, "state": null, "zip": null,
                "country_id": null, "default_currency": null, "default_language": null },
  "client_id": 131,                // el Cliente REAL, creado al ganar la primera licitación
  "client": { "id": 131, "company": "…", "image_url": null },
  "convertido_en": "2026-09-09T17:55:46Z",
  "creado_en": "2026-09-09T17:55:15Z",
  "creado_por": 1,
  "licitaciones_total": 3,
  "licitaciones_abiertas": 0,
  "licitaciones_ganadas": 2,
  // solo en GET /prospectos/{id}
  "contactos": [
    { "id": 4, "prospecto_id": 8, "es_principal": true, "contacto_id": 21,
      "contacto": { "firstname": "…", "lastname": "…", "email": "…",
                    "phonenumber": null, "title": null },
      "creado_en": "…" }
  ],
  "licitaciones": [
    { "id": 310, "estado": "ganada", "resultado_en": "…", "creada_en": "…",
      "espacio": { "id": 310, "name": "…", "status": 1,
                   "start_date": "2026-09-10", "deadline": null } }
  ]
}
```

### El estado es DERIVADO, no una columna

`abierto` si tiene alguna licitación abierta; si no, `ganado` si tiene alguna ganada; si no,
`perdido`; `sin_licitaciones` si no tiene ninguna. Lo resuelve un `CASE` en el `SELECT`, sobre un
`LEFT JOIN` al resumen agrupado de `tblapi_licitaciones`.

**Por eso no hay ningún botón de "ganar" ni de "perder" en esta pantalla**, y tampoco endpoints:
ganar y perder son **por licitación** —se pueden ganar 2 de 4—, y cada una ya lo hace de forma
atómica (`WHERE estado = 'abierta'`). Una columna guardada tendría cuatro caminos de escritura que
mantener sincronizados con la tabla hija.

`cliente` viaja **tal cual se guardó**: la API completa con `null` las claves que nadie llenó, pero
la ficha igual comprueba el tipo antes de leer, porque una clave ausente es tan normal como una en
`null`.

## Acciones y escrituras

**`POST /prospectos`** recibe `cliente` (objeto, `company` obligatoria) y `contacto` (objeto
opcional). Un objeto `contacto` con **todos** los campos vacíos es "no hay contacto", no un contacto
a medias: el formulario del alta manda `contacto.firstname: null` cuando nadie escribió nada.

**`PATCH /prospectos/{id}`** acepta solo `cliente`, y lo **reemplaza entero**: es un objeto, y un
merge parcial dejaría mitad de datos viejos sin que nadie lo vea.

**Editar sigue disponible después de convertir, y NO se propaga al cliente real.** Desde que el
cliente existe son dos fichas distintas: la del prospecto es historia, la del cliente se administra
en `/clientes/{id}`. Escribir una desde la otra sería una escritura silenciosa sobre datos que otro
equipo administra. El diálogo de edición lo dice.

**`DELETE /prospectos/{id}` responde `409` si tiene licitaciones.** No es cortesía: la FK de
`tblapi_licitaciones.prospecto_id` es `ON DELETE CASCADE`, y borrarlas dejaría Proyectos huérfanos
que **reaparecerían en el listado normal** —`RecursoEspacios` los esconde justamente mirando esa
tabla—. El diálogo lo anticipa cuando el contador no es cero, y **no se cierra** si la llamada falla.

**Los contactos se dan de alta como contactos reales solos.** Si el prospecto ya ganó una licitación,
`POST /prospectos/{id}/contactos` crea el contacto en el cliente ahí mismo. Si no, queda durmiendo
hasta que se gane la primera: `Prospecto::asegurarCliente()` recorre los que no tienen `contacto_id`
y los crea. Es **el mismo bucle** para los dos casos, no dos ramas que se desincronizan.

**`DELETE /prospectos/{id}/contactos/{cid}` responde `409` si ese contacto ya existe como contacto
real**: borrar la fila de acá no borraría el de `tblcontacts`, y dejaría uno vivo bajo el cliente sin
rastro de dónde salió. La columna **En el cliente** de la tabla es lo que hace previsible ese 409.

## Permisos

**No hay un permiso de Perfex propio**: no es una entidad suya. Se usa `permissions.projects` de
`GET /me` —`create` para el alta, `edit` para editar y administrar contactos, `delete` para borrar—,
que es el mismo permiso que el backend aplica y el mismo que usan las Licitaciones: lo que se
administra es la antesala de un Espacio, y todavía no hay cliente al que aplicarle `customers`.

**El listado no filtra por visibilidad de fila**, a diferencia de `/licitaciones`. Un prospecto no
tiene dueño ni equipo, y el que recién se creó no tiene ninguna licitación de la cual heredar una
guarda: filtrarlo lo escondería de quien acaba de cargarlo. Lo que sí sigue filtrado es lo que
cuelga: sus licitaciones se piden a `/licitaciones`, que aplica `Visibilidad::espacios()`. Es el
mismo criterio que `GET /clients/minimos`: que una empresa exista lo puede ver cualquiera del equipo,
su legajo no.

La sección aparece en la barra lateral cuando `secciones_habilitadas` de `GET /me` incluye
`"prospectos"`. Es la **bandera de instalación**, no un permiso.

Como en todo el panel: ocultar un botón no es seguridad, la API filtra igual.

## Reglas del panel que hay que replicar

Ninguna: el panel clásico no tiene esta entidad. Su embudo de leads es [otra cosa](10-prospectos.md)
y sigue funcionando aparte, sin que ninguna escritura de acá lo toque.

## Criterios de aceptación

1. La lista pagina, ordena por `empresa` y `creado_en`, y busca, sin un `422`.
2. El alta crea la empresa y —si se llenó— su primera persona de contacto, en una sola llamada; con
   el bloque de contacto vacío crea el prospecto igual.
3. La pestaña Contactos agrega, edita y quita personas; la columna **En el cliente** dice cuáles ya
   existen bajo el cliente, y quitar una de ésas muestra el `409`.
4. La pestaña Licitaciones muestra solo las de este prospecto, con su paginación, y el id **no**
   aparece en la URL.
5. Ganar la primera licitación crea **un** cliente con **todas** las personas de contacto; ganar la
   segunda **no** crea un segundo cliente.
6. Un contacto agregado **después** de convertir aparece en el cliente sin ninguna acción extra.
7. `DELETE` de un prospecto con licitaciones muestra el `409` en el diálogo, que **no** se cierra.
8. `pnpm lint && pnpm typecheck && pnpm test && pnpm build` en verde.
