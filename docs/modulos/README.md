# Módulos

Una ficha por módulo. Cada ficha es lo único que hace falta leer para armar ese módulo: qué pantallas
tiene, qué endpoints consume, qué campos devuelve la API, qué escribe, qué permisos aplica y qué
reglas del panel viejo hay que replicar.

**El contrato manda.** Estas fichas describen lo que el frontend consume; la forma exacta de cada
respuesta vive en [`../contrato-api.md`](../contrato-api.md). Si una ficha y el contrato se
contradicen, manda el contrato y la ficha está desactualizada.

## Estado

**Los módulos de la tabla tienen API**, verificada contra el código real del panel con
`modules/api/herramientas/humo.sh` y los comparadores por línea de comandos. La columna *Falta* no es
una lista de bugs: es lo que **no se construyó a propósito**, y cada ficha lo detalla en su sección
*Estado de la API*.

> **Propuestas, Contratos y Cotizaciones ya no existen.** Sus recursos se borraron del backend en el
> commit `b854567` y sus fichas se borraron con ellos; hoy `GET /proposals`, `/contracts` y
> `/estimates` responden `404`. El porqué y qué habría que rehacer están en
> [`../fases/F3-ventas-CANCELADA.md`](../fases/F3-ventas-CANCELADA.md).

> **Los módulos de venta que quedan están OCULTOS en la interfaz.** `secciones_habilitadas` de
> `GET /me` es la lista fija `["procesos","espacios","salas"]`
> (`modules/api/controllers/V1.php:2245`), por decisión del usuario. **La API responde, `ops-v2` no
> ofrece la sección.** Habilitar una es editar esa lista, no desplegar código nuevo. Sin esta
> aclaración, el ✅ de la tabla se lee como "está en la pantalla", y no lo está.

| # | Módulo | Entidad de Perfex | API | Visible en `ops-v2` | Falta |
|---|---|---|---|---|---|
| [00](00-sesion.md) | Sesión y acceso | `staff` + tokens propios | ✅ | sí | — |
| [01](01-procesos.md) | Procesos | `tasks` | ✅ | sí | `POST /files/{id}/link` |
| [02](02-espacios.md) | Espacios | `projects` | ✅ | sí | — |
| [03](03-clientes.md) | Clientes | `clients` + `contacts` | ✅ | sí | Grupos de clientes: la API los escribe, la pantalla no los ofrece. Alta, edición y contactos **ya están** en Ops |
| [04](04-equipo.md) | Equipo | `staff` | ✅ | sí | — |
| [05](05-mi-trabajo.md) | Mi trabajo | vistas sobre `tasks` | ✅ | sí | — |
| [06](06-salas.md) | Salas de reunión | **ninguna**: tablas propias del módulo `api` | ✅ | sí | Sin Google Calendar, por decisión del usuario |
| [07](07-teletrabajo.md) | Teletrabajo | **ninguna**: LiveKit propio, sin tabla | — | sí | Sin endpoint de tokens, por decisión de diseño |
| [10](10-prospectos.md) | Prospectos | `leads` | ✅ | **no** | `POST /leads/{id}/convertir` |
| [20](20-facturas.md) | Facturas | `invoices` | ✅ | **no** | PDF, envío, recurrentes, notas de crédito, `tags`, `custom_fields` |
| [22](22-pagos.md) | Pagos | `invoicepaymentrecords` | ✅ | **no** | `PATCH /payments/{id}`, deliberado |
| [23](23-gastos.md) | Gastos | `expenses` | ✅ | **no** | Subida del comprobante, borrado, `tags`, `custom_fields` |
| [30](30-tickets.md) | Tickets | `tickets` | ✅ | sólo en el portal | El **panel** no los ofrece: el soporte del equipo vive en [wiwo.center](https://wiwo.center). El **portal del cliente** sí los muestra, en lectura (`/portal/soporte`) |
| [40](40-portal-cliente.md) | Portal del cliente | `contacts` | ✅ | sí, desplegado | — |

Dos cosas que la tabla no puede decir en una celda:

- **Ninguna escritura de la API avisa a nadie.** Ni correo, ni campana, ni Pusher. La
  infraestructura existe —`Escritura/Aviso.php` y todo `/notifications`—, pero las escrituras no la
  llaman y el front no tiene campana. La interfaz no puede decir "enviado".
- **`?include=` desconocido es `422` en todos lados.** La grieta que este documento describía —seis
  de los ocho ignorando el `include` en silencio— está cerrada, y con ella la de las fichas, la de los
  subrecursos de Espacio y Proceso y la de todo `/portal/*`. Donde no hay relaciones opcionales la
  whitelist está vacía a propósito y cualquier `include` falla: ver "Dónde vale `?include=`" en
  [contrato-api.md](../contrato-api.md). `?fields=` funciona en los catorce.

## Construidos sin ficha

Estos módulos están en `main`, la gente los usa, y **ninguno tiene ficha acá**. El hueco queda
anotado a propósito: escribir nueve fichas de algo que ya funciona es documentación arqueológica, y
lo que se necesita se lee del código.

| Módulo | Dónde está |
|---|---|
| Administración: acceso con Google y correo | `src/app/(panel)/administracion/`, `src/componentes/administracion/` |
| Drive / Archivos | `src/componentes/archivos/ArbolDrive.tsx`, `Recursos/RecursoDrive.php` |
| Gantt | `src/componentes/proyecto/PanelGantt.tsx`, `Recursos/RecursoGantt.php` |
| Discusiones | `src/componentes/proyecto/PanelDiscusiones.tsx`, `Recursos/RecursoDiscusiones.php` |
| Notas ("Meeting Paper") | `src/componentes/proyecto/PanelNotas.tsx`, `Recursos/RecursoNotas.php` |
| Presets de filtro | `src/componentes/datos/PresetsFiltro.tsx`, `Recursos/RecursoPresetsFiltro.php` |
| Timesheets | `src/componentes/proyecto/PanelTiempos.tsx`, `Recursos/RecursoTimesheets.php` |
| Permisos individuales | `src/componentes/equipo/DialogoPermisos.tsx`, `pruebas/permisos-individuales.test.js` |

## Cómo se arma un módulo

Ningún módulo se escribe como pantallas a mano. Se escribe como **una definición declarativa** que
consumen los dos motores compartidos, Tabla y Tablero:

```ts
// src/definiciones/<modulo>.ts
export const procesos: DefinicionRecurso<Proceso> = {
  ruta: 'tasks',
  titulo: glosario.proceso,
  columnas: [...],
  filtros: [...],       // deben coincidir con la whitelist filter[] del backend
  orden: [...],         // deben coincidir con la whitelist sort del backend
  busqueda: true,       // parámetro q
  include: [...],
  tablero: {...},
  acciones: [...],
}
```

Los pasos, siempre los mismos:

1. Leer la ficha del módulo y `../contrato-api.md`.
2. Si la API no tiene el recurso, agregarlo primero en `modules/api/` (ver *Estado de la API* en la
   ficha).
3. Escribir el tipo en `src/datos/tipos/<modulo>.ts` copiando los nombres de campo del contrato — sin
   traducir.
4. Escribir la definición en `src/definiciones/<modulo>.ts`.
5. Las pantallas: la lista y el tablero salen de la definición; solo el **detalle** se escribe a mano.
6. Los nombres visibles salen de `src/dominio/glosario.ts`. Ningún componente escribe "Proceso" a
   mano.

## Reglas que valen para todos los módulos

- **Envelope siempre.** `{data, meta}`. Listado: `data` array + `meta.pagination`. Item: `data`
  objeto. Los subrecursos (`comments`, `checklist`, `timers`, `files`, `milestones`, `members`)
  devuelven array plano **sin paginación**.
- **`per_page` tope 100**, y el backend lo recorta en silencio. La UI no ofrece más.
- **Un filtro, orden o include no declarado devuelve `422`, no se ignora.** La definición del frontend
  tiene que reflejar la whitelist del backend o el usuario ve errores.
- **Los tres `401` se distinguen por `code`:** `unauthenticated` y `token_revoked` mandan a entrar,
  `token_expired` dispara el refresco.
- **Fechas:** `date` llega como `"YYYY-MM-DD"` crudo sin zona horaria; `datetime` llega ISO-8601 UTC.
  Vacíos y `0000-00-00` llegan como `null`. Formatear es cosa del frontend.
- **Ninguna escritura notifica**: ni campana, ni correo, ni Pusher. La interfaz no debe decirle al
  usuario que se avisó a alguien.
- **Permisos:** el backend ya filtra por visibilidad; el frontend usa `permissions` de `GET /me` solo
  para **ocultar controles**, nunca como control de acceso. Un botón oculto no es seguridad.
- **Cada pantalla lleva "Abrir en el panel clásico"** apuntando a la misma entidad en
  `board.wiwo.me`. Es la red de seguridad mientras el módulo no esté completo.

## Plantilla de una ficha

```
# <Módulo>
## Qué resuelve
## Pantallas
## Endpoints que consume
## Campos
## Acciones y escrituras
## Permisos
## Reglas del panel que hay que replicar
## Estado de la API
## Criterios de aceptación
```
