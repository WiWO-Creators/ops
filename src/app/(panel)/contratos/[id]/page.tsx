import Link from 'next/link'
import { cache } from 'react'
import { FichaContrato } from '@/componentes/contrato/FichaContrato'
import { ErrorEstado, Vacio } from '@/componentes/estado/Estados'
import type { OpcionCampo } from '@/componentes/proyecto/formulario'
import { ErrorApi } from '@/datos/errores'
import { estadoIa } from '@/datos/ajustes'
import { pedir } from '@/datos/servidor'
import type { EstadoIa } from '@/dominio/ajustes'
import type { ClienteMinimo, Contrato } from '@/datos/recursos'
import { GLOSARIO } from '@/dominio/glosario'

/**
 * Pide el contrato una sola vez por peticion: lo usan la metadata y la pagina.
 */
const traerContrato = cache(async (id: string) => {
  return await pedir<Contrato>(`/contratos/${id}`)
})

/**
 * Titulo de la pestaña. Un `ErrorApi` no tumba la metadata: la pagina ya muestra su estado. Lo demas
 * se relanza, porque `pedir` señaliza la sesion vencida con el `redirect` de Next.
 */
export async function generateMetadata (props: PageProps<'/contratos/[id]'>) {
  const { id } = await props.params

  try {
    const { data } = await traerContrato(id)

    return { title: `${data.subject} · WiWO Ops` }
  } catch (error) {
    if (!(error instanceof ErrorApi)) throw error

    return { title: `${GLOSARIO.contrato.singular} · WiWO Ops` }
  }
}

interface Detalle {
  contrato: Contrato
  tipos: OpcionCampo[]
  clientes: OpcionCampo[]
  ia: EstadoIa
}

/**
 * Carga el contrato y las opciones del formulario de edicion.
 *
 * @param id id del contrato tal como viene de la ruta
 * @returns el detalle, o el `ErrorApi` que impidio cargarlo
 */
async function cargarDetalle (id: string): Promise<Detalle | ErrorApi> {
  try {
    const [contrato, tipos, clientes, ia] = await Promise.all([
      traerContrato(id),
      pedir<Array<{ id: number, name: string }>>('/contratos/tipos'),
      pedir<ClienteMinimo[]>('/clients/minimos?filter[active]=1&sort=company&per_page=500'),
      estadoIa()
    ])

    return {
      contrato: contrato.data,
      tipos: tipos.data.map((tipo) => ({ valor: String(tipo.id), etiqueta: tipo.name })),
      clientes: clientes.data.map((cliente) => ({ valor: String(cliente.id), etiqueta: cliente.company })),
      ia
    }
  } catch (error) {
    if (error instanceof ErrorApi) return error

    throw error
  }
}

/**
 * Ficha de un contrato (WIW-0502).
 *
 * El 404 de la API cubre dos casos que aca no se distinguen a proposito: el contrato no existe, o
 * quien mira no tiene la seccion. Decir cual seria confirmar que el id existe.
 */
export default async function ContratoPage (props: PageProps<'/contratos/[id]'>) {
  const { id } = await props.params
  const detalle = await cargarDetalle(id)

  if (detalle instanceof ErrorApi) {
    if (detalle.codigo === 'not_found') return <NoEncontrado />

    return <ErrorEstado detalle={detalle.message} />
  }

  return <FichaContrato contrato={detalle.contrato} tipos={detalle.tipos} clientes={detalle.clientes} ia={detalle.ia} />
}

/** Contrato inexistente, o una seccion que quien mira no tiene. */
function NoEncontrado () {
  return (
    <Vacio
      titulo="Ese contrato no existe"
      descripcion="Puede que lo hayan borrado, que el enlace esté mal escrito o que no tengas acceso a Contratos."
      accion={
        <Link href="/contratos" className="text-acento text-sm font-semibold underline underline-offset-4">
          Volver a {GLOSARIO.contrato.plural}
        </Link>
      }
    />
  )
}
