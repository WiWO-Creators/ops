import type { Metadata } from 'next'
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

export const metadata: Metadata = { title: 'Soporte · Portal de clientes' }

/**
 * Cuantos espacios se traen para el selector del alta.
 *
 * `/portal/projects` es una coleccion paginada y el selector los necesita todos: un cliente con mas
 * espacios que esto no podria elegir los ultimos. El tope existe igual para no pedir una lista sin
 * limite, y esta muy por encima de lo que tiene cualquier cliente de produccion.
 */
const TOPE_ESPACIOS = 200

export default async function SoportePagina (props: PageProps<'/portal/soporte'>) {
  const [lookups, espacios, entradaId] = await Promise.all([
    cargarLookupsDelPortal(),
    espaciosDelContacto(),
    espacioDeEntrada()
  ])

  return (
    <SeccionDePortal
      seccion="soporte"
      definicion={PORTAL_TICKETS}
      parametrosDeUrl={await props.searchParams}
      acciones={
        <NuevaSolicitud
          prioridades={listaDe(lookups, 'ticket_priorities')}
          espacios={espacios}
          entradaId={entradaId}
        />
      }
    />
  )
}

/**
 * Los espacios del contacto, reducidos a lo que el selector necesita.
 *
 * Un contacto puede tener soporte habilitado y proyectos no, y entonces esta llamada responde 403 o
 * 404. Eso no puede tumbar el listado de tickets, que es a lo que la persona vino: sin espacios el
 * boton de alta no se dibuja y la lectura sigue funcionando igual que antes.
 */
async function espaciosDelContacto (): Promise<Referencia[]> {
  try {
    const { data } = await pedirPortal<EspacioPortal[]>(`/portal/projects?per_page=${TOPE_ESPACIOS}`)

    return data.map((espacio) => ({ id: espacio.id, name: espacio.name }))
  } catch (error) {
    if (error instanceof ErrorApi && (error.estado === 403 || error.estado === 404)) return []

    throw error
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
