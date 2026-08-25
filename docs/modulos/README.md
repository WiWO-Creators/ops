# Módulos

Una ficha por módulo. Cada ficha es lo único que hace falta leer para armar ese módulo: qué pantallas
tiene, qué endpoints consume, qué campos devuelve la API, qué escribe, qué permisos aplica y qué
reglas del panel viejo hay que replicar.

**El contrato manda.** Estas fichas describen lo que el frontend consume; la forma exacta de cada
respuesta vive en [`../contrato-api.md`](../contrato-api.md). Si una ficha y el contrato se
contradicen, manda el contrato y la ficha está desactualizada.

## Estado

Los módulos del núcleo ya tienen API. El resto necesita que se agregue el recurso en
`wiwo-board/modules/api/` antes de que su pantalla sirva para algo — cada ficha trae la
especificación de ese recurso en su sección *Estado de la API*.

| # | Módulo | Entidad de Perfex | API |
|---|---|---|---|
| [00](00-sesion.md) | Sesión y acceso | `staff` + tokens propios | ✅ |
| [01](01-procesos.md) | Procesos | `tasks` | ✅ |
| [02](02-espacios.md) | Espacios | `projects` | ✅ |
| [03](03-clientes.md) | Clientes | `clients` + `contacts` | ✅ |
| [04](04-equipo.md) | Equipo | `staff` | ✅ |
| [05](05-mi-trabajo.md) | Mi trabajo | vistas sobre `tasks` | ✅ |
| [10](10-prospectos.md) | Prospectos | `leads` | ❌ por construir |
| [11](11-propuestas.md) | Propuestas | `proposals` | ❌ por construir |
| [12](12-contratos.md) | Contratos | `contracts` | ❌ por construir |
| [20](20-facturas.md) | Facturas | `invoices` | ❌ por construir |
| [21](21-cotizaciones.md) | Cotizaciones | `estimates` | ❌ por construir |
| [22](22-pagos.md) | Pagos | `invoicepaymentrecords` | ❌ por construir |
| [23](23-gastos.md) | Gastos | `expenses` | ❌ por construir |
| [30](30-tickets.md) | Tickets | `tickets` | ❌ por construir |

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
