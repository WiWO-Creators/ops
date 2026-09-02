# Módulos

Una ficha por módulo. Cada ficha es lo único que hace falta leer para armar ese módulo: qué pantallas
tiene, qué endpoints consume, qué campos devuelve la API, qué escribe, qué permisos aplica y qué
reglas del panel viejo hay que replicar.

**El contrato manda.** Estas fichas describen lo que el frontend consume; la forma exacta de cada
respuesta vive en [`../contrato-api.md`](../contrato-api.md). Si una ficha y el contrato se
contradicen, manda el contrato y la ficha está desactualizada.

## Estado

**Los catorce módulos tienen API.** Los ocho que faltaban se construyeron y se verificaron contra el
código real del panel: 249 comprobaciones verdes en `modules/api/herramientas/humo.sh` y doce
comparadores por línea de comandos en cero diferencias. La columna *Falta* de abajo no es una lista de
bugs: es lo que **no se construyó a propósito**, y cada ficha lo detalla en su sección *Estado de la
API*.

> **Los ocho módulos nuevos están OCULTOS en la interfaz.** `secciones_habilitadas` de `GET /me` es la
> lista fija `["procesos","espacios","salas"]` (`modules/api/controllers/V1.php`), por decisión del
> usuario. **La API responde, `ops-v2` no ofrece la sección.** Habilitar una es editar esa lista,
> no desplegar código nuevo. Sin esta aclaración, el ✅ de la tabla se lee como "está en la pantalla",
> y no lo está.

| # | Módulo | Entidad de Perfex | API | Visible en `ops-v2` | Falta |
|---|---|---|---|---|---|
| [00](00-sesion.md) | Sesión y acceso | `staff` + tokens propios | ✅ | sí | — |
| [01](01-procesos.md) | Procesos | `tasks` | ✅ | sí | `POST /files/{id}/link` |
| [02](02-espacios.md) | Espacios | `projects` | ✅ | sí | — |
| [03](03-clientes.md) | Clientes | `clients` + `contacts` | ✅ | sí | Alta y edición: siguen en el panel, por diseño |
| [04](04-equipo.md) | Equipo | `staff` | ✅ | sí | — |
| [05](05-mi-trabajo.md) | Mi trabajo | vistas sobre `tasks` | ✅ | sí | — |
| [06](06-salas.md) | Salas de reunión | **ninguna**: tablas propias del módulo `api` | ✅ | sí | Sin Google Calendar, por decisión del usuario |
| [10](10-prospectos.md) | Prospectos | `leads` | ✅ | **no** | `POST /leads/{id}/convertir` |
| [11](11-propuestas.md) | Propuestas | `proposals` | ✅ | **no** | PDF, envío, embudo y `mover` |
| [12](12-contratos.md) | Contratos | `contracts` | ✅ | **no** | Alta, borrado y subida de adjuntos |
| [20](20-facturas.md) | Facturas | `invoices` | ✅ | **no** | PDF, envío, recurrentes, notas de crédito, `tags`, `custom_fields` |
| [21](21-cotizaciones.md) | Cotizaciones | `estimates` | ✅ | **no** | PDF, envío, embudo y `mover`, `custom_fields` |
| [22](22-pagos.md) | Pagos | `invoicepaymentrecords` | ✅ | **no** | `PATCH /payments/{id}`, deliberado |
| [23](23-gastos.md) | Gastos | `expenses` | ✅ | **no** | Subida del comprobante, borrado, `tags`, `custom_fields` |
| [30](30-tickets.md) | Tickets | `tickets` | ✅ | ⛔ fuera de alcance | El soporte vive en [wiwo.center](https://wiwo.center): el panel no ofrece la seccion y el prefijo salio del BFF |
| [40](40-portal-cliente.md) | Portal del cliente | `contacts` | ✅ | construido, sin desplegar | — |

Dos cosas que valen para los ocho nuevos y que la tabla no puede decir en una celda:

- **La API no le avisa a nadie de nada.** Ni correo, ni campana, ni Pusher, en ninguna escritura. El
  caso más ruidoso es Tickets: **el cliente no se entera de que le respondieron**. La interfaz no
  puede decir "enviado".
- **`?include=` desconocido es `422` en todos lados.** La grieta que este documento describía —seis
  de los ocho ignorando el `include` en silencio— está cerrada, y con ella la de las fichas, la de los
  subrecursos de Espacio y Proceso y la de todo `/portal/*`. Donde no hay relaciones opcionales la
  whitelist está vacía a propósito y cualquier `include` falla: ver "Dónde vale `?include=`" en
  [contrato-api.md](../contrato-api.md). `?fields=` funciona en los catorce.

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
- **La API no notifica a nadie** en ninguna escritura: ni campana, ni correo, ni Pusher. La interfaz
  no debe decirle al usuario que se avisó a alguien.
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
