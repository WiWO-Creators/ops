import { Suspense } from 'react'
import { Cargando } from '@/componentes/estado/Estados'
import { TotalDelListado } from '@/componentes/datos/TotalDelListado'
import { VistaUpsells } from '@/componentes/upsell/VistaUpsells'
import { construirConsulta, leerConsulta, paramsDeUrl } from '@/datos/consulta'
import { listaDe } from '@/datos/catalogos'
import { cargarLookups, opcionesDeFiltros } from '@/datos/lookups'
import { pedir } from '@/datos/servidor'
import type { ClienteMinimo, EstadoLookup, Upsell } from '@/datos/recursos'
import type { OpcionCampo } from '@/componentes/proyecto/formulario'
import type { Yo } from '@/datos/tipos'
import { UPSELLS } from '@/definiciones/upsells'

export const metadata = { title: 'Upselling · WiWO Ops' }

/**
 * Lista de oportunidades de Upselling.
 *
 * La primera pagina se resuelve en el servidor para que la lista no parpadee al montar; de ahi en
 * adelante el motor pide al BFF. El `Suspense` no es decorativo: la vista usa `useSearchParams`, y
 * sin el limite el build de esta ruta falla.
 *
 * Sin filtro la API devuelve las tres —abiertas, ganadas y perdidas—: el historico se consulta desde
 * la misma pantalla, y esconderlo por defecto obligaria a saber que existe un filtro.
 */
export default async function UpsellsPage (props: PageProps<'/upsells'>) {
  const params = paramsDeUrl(await props.searchParams)

  const estado = leerConsulta(params, UPSELLS)
  const consulta = construirConsulta(estado, UPSELLS)

  const [lista, lookups, yo, clientes] = await Promise.all([
    pedir<Upsell[]>(`/upsells${consulta === '' ? '' : `?${consulta}`}`),
    cargarLookups(),
    pedir<Yo>('/me'),
    // El selector de clientes del alta. `minimos` es la ruta que existe justamente para esto: no
    // exige `customers view`, devuelve cuatro campos y nada mas. Solo los ACTIVOS: armarle una
    // oportunidad a un cliente dado de baja es un error de tipeo, no un caso de uso.
    pedir<ClienteMinimo[]>('/clients/minimos?filter[active]=1&sort=company&per_page=500')
  ])

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h1 className="text-xl font-semibold text-texto">{UPSELLS.titulo.plural}</h1>
        <TotalDelListado paginacion={lista.meta?.pagination} />
      </div>

      <Suspense fallback={<Cargando alto="min-h-36" mensaje="Cargando oportunidades…" />}>
        <VistaUpsells
          inicial={{ filas: lista.data, paginacion: lista.meta?.pagination }}
          capacidades={yo.data.permissions.projects}
          opcionesDeFiltro={opcionesDeFiltros(UPSELLS, lookups)}
          clientes={clientes.data.map((cliente) => ({ valor: String(cliente.id), etiqueta: cliente.company }))}
          monedas={comoOpciones(listaDe(lookups, 'currencies'))}
        />
      </Suspense>
    </section>
  )
}

/**
 * Un catalogo de `GET /lookups` en la forma que espera un campo `seleccion`.
 *
 * El id viaja como cadena porque un `<select>` no conoce otro tipo; `cuerpoDelFormulario` lo vuelve
 * numero antes de mandarlo.
 */
function comoOpciones (lista: EstadoLookup[]): OpcionCampo[] {
  return lista.map((item) => ({ valor: String(item.id), etiqueta: item.name }))
}
