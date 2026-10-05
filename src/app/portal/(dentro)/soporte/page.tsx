import type { Metadata } from 'next'
import { Suspense } from 'react'
import { ModalTicket } from '@/componentes/tickets/ModalTicket'
import { TICKET_DEL_PORTAL } from '@/dominio/ticket-vista'
import { PORTAL_TICKETS } from '@/definiciones/portal-soporte'
import { listaDe } from '@/datos/catalogos'
import { cargarLookupsDelPortal } from '@/datos/lookups'
import { ErrorApi } from '@/datos/errores'
import { pedirPortal } from '@/datos/servidor'
import type { EspacioPortal } from '@/datos/portal'
import type { Referencia } from '@/datos/recursos'
import type { YoPortal } from '@/datos/tipos'
import { SeccionDePortal } from '../seccion'
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

export default async function SoportePagina (props: PageProps<'/portal/soporte'>) {
  const [lookups, { espacios, fallo: fallaronEspacios }, entradaId] = await Promise.all([
    cargarLookupsDelPortal(),
    espaciosDelContacto(),
    espacioDeEntrada()
  ])

  return (
    <>
      <SeccionDePortal
        seccion="soporte"
        definicion={PORTAL_TICKETS}
        parametrosDeUrl={await props.searchParams}
        acciones={
          <NuevaSolicitud
            prioridades={listaDe(lookups, 'ticket_priorities')}
            espacios={espacios}
            fallaronEspacios={fallaronEspacios}
            entradaId={entradaId}
          />
        }
      />
      {/* El mismo modal que ve el equipo, con la fuente del contacto y sin capacidades: estado y
          prioridad quedan como insignias, y responder lo decide la regla que manda la API. */}
      <Suspense fallback={null}>
        <ModalTicket fuente={TICKET_DEL_PORTAL} capacidades={[]} proyectos={espacios} />
      </Suspense>
    </>
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
async function espaciosDelContacto (): Promise<EspaciosDelContacto> {
  try {
    const { data } = await pedirPortal<EspacioPortal[]>(`/portal/projects?per_page=${TOPE_ESPACIOS}`)

    return { espacios: data.map((espacio) => ({ id: espacio.id, name: espacio.name })), fallo: false }
  } catch (error) {
    if (!(error instanceof ErrorApi)) throw error

    return { espacios: [], fallo: error.estado !== 403 && error.estado !== 404 }
  }
}

/**
 * El {espacio} al que entra este contacto, para que el alta nazca apuntando ahi.
 *
 * Es una preferencia de la pantalla y nada mas: si `/portal/me` falla, el selector arranca sin
 * elegir y la persona elige. Por eso el fallo se traga entero en vez de filtrarse por codigo — no
 * hay ningun estado de error que valga la pena mostrarle al cliente por un valor inicial.
 */
async function espacioDeEntrada (): Promise<number | null> {
  try {
    const { data } = await pedirPortal<YoPortal>('/portal/me')

    return data.proyecto_de_entrada?.id ?? null
  } catch {
    return null
  }
}
