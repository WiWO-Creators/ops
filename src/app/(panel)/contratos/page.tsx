import { Suspense } from 'react'
import { Cargando, Vacio } from '@/componentes/estado/Estados'
import { TotalDelListado } from '@/componentes/datos/TotalDelListado'
import { VistaContratos } from '@/componentes/contrato/VistaContratos'
import type { OpcionCampo } from '@/componentes/proyecto/formulario'
import { TituloModulo } from '@/componentes/estructura/TituloModulo'
import { construirConsulta, leerConsulta, paramsDeUrl } from '@/datos/consulta'
import { listaDe } from '@/datos/catalogos'
import { cargarLookups } from '@/datos/lookups'
import { cargarYo, pedir } from '@/datos/servidor'
import type { AccesoContratos, ClienteMinimo, Contrato } from '@/datos/recursos'
import { CONTRATOS } from '@/definiciones/contratos'

export const metadata = { title: 'Contratos · WiWO Ops' }

/**
 * Contratos de Perfex para Finanzas y Comercial (WIW-0502).
 *
 * La API decide quien entra (`Acceso\AccesoContratos`) y responde 404 a quien no: esta pagina no
 * repite la regla, solo muestra el vacio. La primera pagina se resuelve en el servidor para que la
 * lista no parpadee; el `Suspense` lo exige `useSearchParams` dentro de la vista.
 */
export default async function ContratosPage (props: PageProps<'/contratos'>) {
  const params = paramsDeUrl(await props.searchParams)
  const consulta = construirConsulta(leerConsulta(params, CONTRATOS), CONTRATOS)

  const yo = await cargarYo()
  if (yo.data.ve_contratos !== true) return <SinSeccion />

  const [lista, tipos, clientes, lookups, acceso] = await Promise.all([
    pedir<Contrato[]>(`/contratos${consulta === '' ? '' : `?${consulta}`}`),
    pedir<Array<{ id: number, name: string }>>('/contratos/tipos'),
    pedir<ClienteMinimo[]>('/clients/minimos?filter[active]=1&sort=company&per_page=500'),
    cargarLookups(),
    yo.data.is_superadmin ? pedir<AccesoContratos>('/contratos/acceso') : Promise.resolve(null)
  ])

  const opcionesDeTipo = tipos.data.map((tipo) => ({ valor: String(tipo.id), etiqueta: tipo.name }))
  const opcionesDeCliente = clientes.data.map((cliente) => ({ valor: String(cliente.id), etiqueta: cliente.company }))
  const areas: OpcionCampo[] = listaDe(lookups, 'areas').map((area) => ({ valor: String(area.id), etiqueta: area.name }))

  return (
    <section className="flex flex-col gap-4">
      <TituloModulo
        titulo={CONTRATOS.titulo.plural}
        acciones={<TotalDelListado paginacion={lista.meta?.pagination} />}
      />

      <Suspense fallback={<Cargando alto="min-h-36" mensaje="Cargando contratos…" />}>
        <VistaContratos
          inicial={{ filas: lista.data, paginacion: lista.meta?.pagination }}
          opcionesDeFiltro={{ contratos_clientes: opcionesDeCliente, contratos_tipos: opcionesDeTipo }}
          clientes={opcionesDeCliente}
          tipos={opcionesDeTipo}
          {...(acceso === null ? {} : { acceso: acceso.data })}
          areas={areas}
        />
      </Suspense>
    </section>
  )
}

/** Quien no tiene la seccion llega aca solo por un enlace: no se le confirma nada mas. */
function SinSeccion () {
  return (
    <Vacio
      titulo="No tienes acceso a Contratos"
      descripcion="Los ven las áreas que define la administración. Si lo necesitas, pídelo a un superadmin."
    />
  )
}

