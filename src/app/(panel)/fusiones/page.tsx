import { Suspense } from 'react'
import { TituloModulo } from '@/componentes/estructura/TituloModulo'
import { Cargando, ErrorEstado, SinPermiso } from '@/componentes/estado/Estados'
import { VistaFusiones } from '@/componentes/fusion/VistaFusiones'
import { construirConsulta, leerConsulta, paramsDeUrl } from '@/datos/consulta'
import { ErrorApi } from '@/datos/errores'
import { pedir } from '@/datos/servidor'
import type { Sobre, Yo } from '@/datos/tipos'
import { FUSIONES } from '@/definiciones/fusion'
import { DIAS_PARA_DESHACER, puedeFusionar, type FusionDelHistorial } from '@/dominio/fusion'

export const metadata = { title: 'Fusiones · WiWO Ops' }

/**
 * Trae una pagina del historial, o el error de la API como valor.
 *
 * Separada de la pagina para no construir JSX dentro del `try`: el lint del proyecto rechaza un
 * `catch` que envuelva render.
 */
async function cargar (consulta: string): Promise<Sobre<FusionDelHistorial[]> | ErrorApi> {
  try {
    return await pedir<FusionDelHistorial[]>(`/merges${consulta === '' ? '' : `?${consulta}`}`)
  } catch (error) {
    if (error instanceof ErrorApi) return error

    throw error
  }
}

/**
 * Fusiones: lo que se fusiono, quien lo hizo y, mientras dure el plazo, el boton para deshacerlo.
 *
 * Tiene su propia pantalla y no vive dentro de la Papelera porque la fusion tambien la hace la
 * coordinacion multiarea, que no ve la Papelera. La llave es `puedeFusionar`; la API responde 403 a
 * quien no corresponda y la pantalla lo dice con `SinPermiso`.
 */
export default async function FusionesPage (props: PageProps<'/fusiones'>) {
  const { data: yo } = await pedir<Yo>('/me')

  if (!puedeFusionar(yo)) return <SinPermiso className="mt-10" />

  const params = paramsDeUrl(await props.searchParams)
  const consulta = construirConsulta(leerConsulta(params, FUSIONES), FUSIONES)
  const lista = await cargar(consulta)

  if (lista instanceof ErrorApi) {
    if (lista.codigo === 'forbidden') return <SinPermiso className="mt-10" />

    return <ErrorEstado detalle={lista.message} className="mt-10" />
  }

  return (
    <section className="flex flex-col gap-4">
      <TituloModulo
        titulo={FUSIONES.titulo.plural}
        descripcion={`Lo que se fusionó y quién lo hizo. Cada fusión se puede deshacer durante ${DIAS_PARA_DESHACER} días.`}
      />

      <Suspense fallback={<Cargando alto="min-h-36" mensaje="Cargando las fusiones…" />}>
        <VistaFusiones inicial={{ filas: lista.data, paginacion: lista.meta?.pagination }} />
      </Suspense>
    </section>
  )
}
