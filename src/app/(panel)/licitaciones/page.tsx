import { Suspense } from 'react'
import { Cargando } from '@/componentes/estado/Estados'
import { TotalDelListado } from '@/componentes/datos/TotalDelListado'
import { AlertasLicitaciones } from '@/componentes/licitacion/AlertasLicitaciones'
import { VistaLicitaciones } from '@/componentes/licitacion/VistaLicitaciones'
import { TituloModulo } from '@/componentes/estructura/TituloModulo'
import { construirConsulta, leerConsulta, paramsDeUrl } from '@/datos/consulta'
import { cargarLookups, opcionesDeFiltros } from '@/datos/lookups'
import { pedir, pedirOpcional } from '@/datos/servidor'
import type { Licitacion, ProcesoConAviso } from '@/datos/recursos'
import type { Yo } from '@/datos/tipos'
import { TOPE_DE_LICITACIONES_EN_ALERTA } from '@/dominio/alertas-licitacion'
import { LICITACIONES } from '@/definiciones/licitaciones'

export const metadata = { title: 'Licitaciones · WiWO Ops' }

/**
 * Lista de Licitaciones, con la banda de alertas de plazo arriba.
 *
 * La primera pagina se resuelve en el servidor para que la lista no parpadee al montar; de ahi en
 * adelante el motor pide al BFF. El `Suspense` no es decorativo: la vista usa `useSearchParams`, y sin
 * el limite el build de esta ruta falla.
 *
 * Sin filtro la API devuelve las tres —abiertas, ganadas y perdidas—: el historico se consulta desde
 * la misma pantalla, y esconderlo por defecto obligaria a saber que existe un filtro para encontrarlo.
 *
 * === POR QUE LA BANDA PIDE SUS PROPIOS DATOS ===
 *
 * Porque el listado esta paginado y filtrado por quien mira: armar las alertas con `lista.data`
 * haria que filtrar por "perdidas" apagara las alertas de las abiertas, que es exactamente al reves
 * de lo que una alerta tiene que hacer. La banda pide **todas** las abiertas, una sola vez, y no le
 * importa como este mirando la tabla.
 *
 * Las dos lecturas de la banda van con `pedirOpcional`: `GET /me/vencimientos` responde `503` en una
 * instalacion sin `wiwo_core`, y eso no puede dejar la pantalla de Licitaciones sin listado.
 */
export default async function LicitacionesPage (props: PageProps<'/licitaciones'>) {
  const params = paramsDeUrl(await props.searchParams)

  const estado = leerConsulta(params, LICITACIONES)
  const consulta = construirConsulta(estado, LICITACIONES)

  const [lista, lookups, yo, abiertas, vencimientos] = await Promise.all([
    pedir<Licitacion[]>(`/licitaciones${consulta === '' ? '' : `?${consulta}`}`),
    cargarLookups(),
    pedir<Yo>('/me'),
    pedirOpcional<Licitacion[]>(
      `/licitaciones?filter[estado]=abierta&per_page=${TOPE_DE_LICITACIONES_EN_ALERTA}`
    ),
    pedirOpcional<ProcesoConAviso[]>('/me/vencimientos')
  ])

  return (
    <section className="flex flex-col gap-4">
      <TituloModulo
        titulo={LICITACIONES.titulo.plural}
        acciones={<TotalDelListado paginacion={lista.meta?.pagination} />}
      />

      <AlertasLicitaciones
        licitaciones={abiertas.datos ?? []}
        vencimientos={vencimientos.datos ?? []}
        error={abiertas.error ?? vencimientos.error}
      />

      <Suspense fallback={<Cargando alto="min-h-36" mensaje={`Cargando ${LICITACIONES.titulo.plural.toLowerCase()}…`} />}>
        <VistaLicitaciones
          inicial={{ filas: lista.data, paginacion: lista.meta?.pagination }}
          capacidades={yo.data.permissions.projects}
          opcionesDeFiltro={opcionesDeFiltros(LICITACIONES, lookups)}
        />
      </Suspense>
    </section>
  )
}
