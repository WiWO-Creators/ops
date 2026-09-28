import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { SinPermiso, Vacio } from '@/componentes/estado/Estados'
import { SelectorDeMes } from '@/componentes/gestion/SelectorDeMes'
import { ReporteMensual } from '@/componentes/reporte/ReporteMensual'
import { ErrorApi } from '@/datos/errores'
import { cargarDetalle } from '../detalle'
import type { ReporteMensual as Reporte } from '@/datos/portal'
import { mesEnCurso, mesesOfrecidos, resolverMesPedido } from '@/dominio/gestion'

export const metadata: Metadata = { title: 'Reporte mensual · Portal de clientes' }

/**
 * El reporte mensual del cliente: lo entregado, lo completado, reuniones y horas del mes.
 *
 * Server Component puro, igual que el tablero de gestión: el mes y el {espacio} viven en la URL
 * (`?mes=` y `?project_id=`), así que el reporte se comparte por enlace.
 *
 *   - **404** → `notFound()`: el contacto no tiene {espacios} visibles, o pidió uno ajeno.
 *   - **403** → `SinPermiso`: el contacto no tiene el permiso de {espacios}.
 *   - **422** → un mes escrito a mano fuera de rango; se ofrece el selector para volver.
 */
export default async function ReportePagina (props: PageProps<'/portal/reporte'>) {
  const parametros = await props.searchParams
  const actual = mesEnCurso()
  const meses = mesesOfrecidos(actual)

  const pedido = typeof parametros.mes === 'string' ? parametros.mes : null
  // «Todos» en el selector manda `project_id=` vacío: eso es no filtrar, no un id inválido.
  const proyectoId = typeof parametros.project_id === 'string' && parametros.project_id !== ''
    ? parametros.project_id
    : undefined
  const { mes } = resolverMesPedido(pedido, actual)

  const consulta = new URLSearchParams({ mes })
  if (proyectoId !== undefined) consulta.set('project_id', proyectoId)

  const respuesta = await cargarDetalle<Reporte>(`/portal/reporte-mensual?${consulta.toString()}`)

  if (!(respuesta instanceof ErrorApi)) {
    return <ReporteMensual reporte={respuesta.data} meses={meses} proyectoId={proyectoId} />
  }

  if (respuesta.estado === 404) notFound()
  if (respuesta.estado === 403) return <SinPermiso />

  if (respuesta.estado === 422) {
    return (
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-4">
        <Vacio
          titulo="Ese mes no se puede mirar"
          descripcion="El reporte llega hasta 24 meses hacia atrás y no muestra meses que todavía no pasan. Elige uno de la lista."
          accion={<SelectorDeMes mes={actual} meses={meses} />}
        />
      </div>
    )
  }

  throw respuesta
}
