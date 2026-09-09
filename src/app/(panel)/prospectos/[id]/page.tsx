import Link from 'next/link'
import { Suspense, cache } from 'react'
import { AccionesProspecto } from '@/componentes/prospecto/AccionesProspecto'
import { FichaProspecto } from '@/componentes/prospecto/FichaProspecto'
import {
  ETIQUETA_LICITACIONES,
  PanelContactosProspecto,
  PanelLicitacionesProspecto
} from '@/componentes/prospecto/PanelesProspecto'
import { Insignia } from '@/componentes/presentadores/Insignia'
import { Pestanas, type Panel } from '@/componentes/proyecto/Pestanas'
import type { OpcionCampo } from '@/componentes/proyecto/formulario'
import { Cargando, ErrorEstado, SinPermiso, Vacio } from '@/componentes/estado/Estados'
import { listaDe } from '@/datos/catalogos'
import { ErrorApi } from '@/datos/errores'
import { cargarLookups } from '@/datos/lookups'
import { pedir } from '@/datos/servidor'
import type { EstadoLookup, Lookups, ProspectoDetalle } from '@/datos/recursos'
import type { Yo } from '@/datos/tipos'
import { etiquetaDeEstadoDeProspecto } from '@/definiciones/prospectos'

/**
 * Pide el Prospecto una sola vez por peticion.
 *
 * `generateMetadata` y la pagina corren en la misma peticion y necesitan el mismo recurso; sin
 * `cache` serian dos llamadas a la API por cada visita.
 */
const traerProspecto = cache(async (id: string) => {
  return await pedir<ProspectoDetalle>(`/prospectos/${id}`)
})

/**
 * Titulo de la pestaña del navegador.
 *
 * Un `ErrorApi` no puede tumbar la metadata: la pagina ya muestra el estado que corresponda. Todo lo
 * demas se relanza — `pedir` señaliza la sesion vencida con el `redirect` de Next, que viaja como
 * excepcion y tragarlo dejaria a la persona mirando una pantalla en blanco.
 */
export async function generateMetadata (props: PageProps<'/prospectos/[id]'>) {
  const { id } = await props.params

  try {
    const { data } = await traerProspecto(id)

    return { title: `${data.empresa} · WiWO Ops` }
  } catch (error) {
    if (!(error instanceof ErrorApi)) throw error

    return { title: 'Prospecto · WiWO Ops' }
  }
}

interface Detalle {
  prospecto: ProspectoDetalle
  lookups: Lookups
  yo: Yo
}

/**
 * Carga lo minimo que la pantalla necesita: el prospecto con sus hijos, los catalogos y quien mira.
 *
 * Los contactos y las licitaciones vienen en la misma respuesta —la API los trae en lote— pero las
 * pestañas los vuelven a pedir al montarse: son listas administrables, y la de licitaciones ademas
 * pagina y ordena. Lo que se usa de la respuesta es el resumen de la Ficha.
 *
 * @param id id del prospecto tal como viene de la ruta
 * @returns el detalle, o el `ErrorApi` que impidio cargarlo
 */
async function cargarDetalle (id: string): Promise<Detalle | ErrorApi> {
  try {
    const [prospecto, lookups, yo] = await Promise.all([
      traerProspecto(id),
      cargarLookups(),
      pedir<Yo>('/me')
    ])

    return { prospecto: prospecto.data, lookups, yo: yo.data }
  } catch (error) {
    if (error instanceof ErrorApi) return error

    throw error
  }
}

/** Estado de prospecto inexistente: la API respondio 404 o el id de la URL no es de nadie. */
function NoEncontrado () {
  return (
    <Vacio
      titulo="Ese prospecto no existe"
      descripcion="Puede que lo hayan borrado, o que el enlace esté mal escrito."
      accion={
        <Link href="/prospectos" className="text-acento text-sm font-semibold underline underline-offset-4">
          Volver a Prospectos
        </Link>
      }
    />
  )
}

/**
 * Detalle de un Prospecto: la empresa candidata, sus contactos y sus licitaciones.
 *
 * **No monta `DetalleDeEspacio`**, a diferencia de Licitaciones y Upselling: un prospecto NO es un
 * Espacio —no tiene tareas, ni hitos, ni horas— y darle esas pestañas seria inventar datos. El
 * trabajo vive en cada licitacion suya, a un clic desde la pestaña Licitaciones.
 *
 * El `Suspense` no es decorativo: `Pestanas` usa `useSearchParams`, y sin ese limite el build de la
 * ruta falla.
 */
export default async function ProspectoPage (props: PageProps<'/prospectos/[id]'>) {
  const { id } = await props.params
  const detalle = await cargarDetalle(id)

  if (detalle instanceof ErrorApi) {
    if (detalle.codigo === 'not_found') return <NoEncontrado />
    if (detalle.codigo === 'forbidden') return <SinPermiso />

    return <ErrorEstado detalle={detalle.message} />
  }

  const { prospecto, lookups, yo } = detalle
  const capacidades = yo.permissions.projects
  const paises = listaDe(lookups, 'countries')

  const paneles: Panel[] = [
    { clave: 'ficha', etiqueta: 'Ficha', contenido: <FichaProspecto prospecto={prospecto} paises={paises} /> },
    {
      clave: 'contactos',
      etiqueta: 'Contactos',
      contenido: <PanelContactosProspecto prospectoId={prospecto.id} capacidades={capacidades} />
    },
    {
      clave: 'licitaciones',
      etiqueta: ETIQUETA_LICITACIONES,
      contenido: <PanelLicitacionesProspecto prospectoId={prospecto.id} capacidades={capacidades} />
    }
  ]

  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <header className="flex flex-col gap-3">
          <Link
            href="/prospectos"
            className="text-texto-sutil hover:text-texto w-fit text-xs font-medium transition-colors"
          >
            ← Prospectos
          </Link>

          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-texto text-seccion leading-tight font-semibold">{prospecto.empresa}</h1>
            <Insignia tono={tonoDelEstado(prospecto.estado)}>
              {etiquetaDeEstadoDeProspecto(prospecto.estado)}
            </Insignia>
          </div>
        </header>

        <AccionesProspecto
          prospecto={prospecto}
          paises={comoOpciones(paises)}
          capacidades={capacidades}
        />
      </div>

      <Suspense fallback={<Cargando alto="min-h-36" mensaje="Cargando el detalle…" />}>
        <Pestanas paneles={paneles} etiqueta="Secciones del prospecto" />
      </Suspense>
    </section>
  )
}

/**
 * El tono de la insignia del estado derivado.
 *
 * `sin_licitaciones` va en neutro y no en peligro: todavia no paso nada, y pintar de rojo un
 * prospecto recien cargado diria que algo salio mal.
 */
function tonoDelEstado (estado: ProspectoDetalle['estado']): 'exito' | 'aviso' | 'neutro' {
  if (estado === 'ganado') return 'exito'
  if (estado === 'abierto') return 'aviso'

  return 'neutro'
}

/** Un catalogo de `/lookups` en la forma que espera un campo `seleccion` del formulario. */
function comoOpciones (lista: EstadoLookup[]): OpcionCampo[] {
  return lista.map((item) => ({ valor: String(item.id), etiqueta: item.name }))
}
