import type { Metadata } from 'next'
import { Suspense, cache, type ReactElement } from 'react'
import { ModalTicket } from '@/componentes/tickets/ModalTicket'
import { TICKET_DEL_PORTAL } from '@/dominio/ticket-vista'
import { PORTAL_TICKETS } from '@/definiciones/portal-soporte'
import { listaDe } from '@/datos/catalogos'
import { cargarLookupsDelPortal } from '@/datos/lookups'
import { ErrorApi } from '@/datos/errores'
import { pedirPortal, yoDelPortal } from '@/datos/servidor'
import type { EspacioPortal } from '@/datos/portal'
import type { Referencia } from '@/datos/recursos'
import { SeccionDePortal } from '../seccion'
import { TablaSolicitudes } from '../TablaSolicitudes'
import { NuevaSolicitud } from './NuevaSolicitud'

export const metadata: Metadata = { title: 'Tickets · Portal de clientes' }

/**
 * Cuantos espacios se traen para el selector del alta.
 *
 * `/portal/projects` es una coleccion paginada y el selector los necesita todos: un cliente con mas
 * espacios que esto no podria elegir los ultimos. El tope existe igual para no pedir una lista sin
 * limite, y esta muy por encima de lo que tiene cualquier cliente de produccion.
 */
const TOPE_ESPACIOS = 200

/**
 * Soporte del portal: el listado y, al lado del titulo, el alta de solicitudes.
 *
 * Los {espacios} se piden desde ya, sin esperarlos aca, y el listado, los catalogos y los {espacios}
 * viajan a la vez dentro de `SeccionDePortal`. El alta espera ademas a `/portal/me` (a donde apuntar
 * y de quien es el borrador), asi que va en su propio `Suspense`: el titulo y la tabla no la esperan.
 */
export default async function SoportePagina (props: PageProps<'/portal/soporte'>) {
  const espacios = espaciosDelContacto()

  return (
    <>
      <SeccionDePortal
        definicion={PORTAL_TICKETS}
        parametrosDeUrl={await props.searchParams}
        espacios={espacios.then((resuelto) => resuelto.espacios)}
        tabla={(datos, nombres) => <TablaSolicitudes {...datos} espacios={nombres} />}
        acciones={
          <Suspense fallback={null}>
            <AltaDeSolicitud />
          </Suspense>
        }
      />
      {/* El mismo modal que ve el equipo, con la fuente del contacto y sin capacidades: estado y
          prioridad quedan como insignias, y responder lo decide la regla que manda la API. */}
      <Suspense fallback={null}>
        <ModalDeSolicitud />
      </Suspense>
    </>
  )
}

/** El modal del ticket con los {espacios} que nombran el del ticket y se ofrecen para moverlo. */
async function ModalDeSolicitud (): Promise<ReactElement> {
  const { espacios } = await espaciosDelContacto()

  return <ModalTicket fuente={TICKET_DEL_PORTAL} capacidades={[]} proyectos={espacios} />
}

/**
 * El boton de nueva solicitud con lo que necesita del contacto.
 *
 * Los catalogos y los {espacios} son los mismos que pide el listado (`cache` los comparte en la
 * navegacion): solo `/portal/me` es propio de esta pieza.
 */
async function AltaDeSolicitud (): Promise<ReactElement> {
  const [lookups, { espacios, fallo }, { entradaId, contactoId }] = await Promise.all([
    cargarLookupsDelPortal(),
    espaciosDelContacto(),
    datosDelContacto()
  ])

  return (
    <NuevaSolicitud
      prioridades={listaDe(lookups, 'ticket_priorities')}
      espacios={espacios}
      fallaronEspacios={fallo}
      entradaId={entradaId}
      contactoId={contactoId}
    />
  )
}

/** Los espacios del selector del alta, y si pedirlos fallo (distinto de «no tiene»). */
interface EspaciosDelContacto {
  espacios: Referencia[]
  /** `true` si la API fallo; `false` si respondio, aunque sea con cero espacios. */
  fallo: boolean
}

/**
 * Los espacios del contacto, reducidos a lo que el selector necesita.
 *
 * Un contacto puede tener soporte habilitado y proyectos no, y entonces esta llamada responde 403 o
 * 404: eso es «no tiene espacios», no un fallo. Cualquier otro error de la API tampoco puede tumbar
 * el listado de tickets, que es a lo que la persona vino, pero se devuelve como `fallo` para que el
 * alta explique por que falta el boton y deje reintentar, en vez de desaparecer sin decir nada.
 *
 * Solo se atrapa `ErrorApi`: los redirects de sesion vencida y los errores de programacion siguen
 * su camino.
 */
const espaciosDelContacto = cache(async (): Promise<EspaciosDelContacto> => {
  try {
    const { data } = await pedirPortal<EspacioPortal[]>(`/portal/projects?per_page=${TOPE_ESPACIOS}`)

    return { espacios: data.map((espacio) => ({ id: espacio.id, name: espacio.name })), fallo: false }
  } catch (error) {
    if (!(error instanceof ErrorApi)) throw error

    return { espacios: [], fallo: error.estado !== 403 && error.estado !== 404 }
  }
})

/** Lo que el alta toma de `/portal/me`: a donde apuntar y de quien es el borrador. */
interface DatosDelContacto {
  entradaId: number | null
  contactoId: number | null
}

/**
 * El {espacio} al que entra este contacto y su id, para que el alta nazca apuntando ahi y guarde
 * su borrador bajo su nombre.
 *
 * Es una preferencia de la pantalla y nada mas: si `/portal/me` falla, el selector arranca sin
 * elegir, la persona elige y no hay borrador. Por eso el fallo se traga entero en vez de filtrarse
 * por codigo — no hay ningun estado de error que valga la pena mostrarle al cliente por un valor
 * inicial.
 */
async function datosDelContacto (): Promise<DatosDelContacto> {
  try {
    const { data } = await yoDelPortal()

    return { entradaId: data.proyecto_de_entrada?.id ?? null, contactoId: data.id }
  } catch {
    return { entradaId: null, contactoId: null }
  }
}
