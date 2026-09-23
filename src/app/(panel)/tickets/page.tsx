import { Suspense } from 'react'
import { Cargando } from '@/componentes/estado/Estados'
import { TituloModulo } from '@/componentes/estructura/TituloModulo'
import { pedir, pedirOpcional } from '@/datos/servidor'
import type { Espacio } from '@/datos/recursos'
import type { Yo } from '@/datos/tipos'
import { GLOSARIO } from '@/dominio/glosario'
import { BandejaTickets } from './BandejaTickets'

export const metadata = { title: `${GLOSARIO.ticket.plural} · WiWO Ops` }

/**
 * Tope de Proyectos para nombrar la columna y armar el filtro. El mismo que usa Tareas: la instalacion
 * tiene unos 280 y el filtro los necesita todos.
 */
const TOPE_PROYECTOS = 500

/**
 * Bandeja global de tickets del equipo (`GET /tickets`).
 *
 * El servidor resuelve solo lo que decide la forma de la pantalla: si quien mira administra (sin eso
 * los filtros de departamento y asignado son un 422) y los nombres de los Proyectos. La lista se pide
 * desde el navegador, igual que la pestaña Tickets del Proyecto: asi el modal la refresca con los
 * filtros puestos sin depender de un `router.refresh()` que rehaga toda la pagina.
 *
 * Los Proyectos van con `pedirOpcional`: un catalogo que no carga deja la columna con el `#id` y el
 * filtro con solo "Sin Proyecto", pero la bandeja sigue abriendo.
 */
export default async function TicketsPage () {
  const [yo, proyectos] = await Promise.all([
    pedir<Yo>('/me'),
    pedirOpcional<Espacio[]>(`/projects?per_page=${TOPE_PROYECTOS}`)
  ])

  const referencias = (proyectos.datos ?? []).map((p) => ({ id: p.id, name: p.name }))

  return (
    <section className="flex flex-col gap-4">
      <TituloModulo titulo={GLOSARIO.ticket.plural} />

      <Suspense fallback={<Cargando alto="min-h-36" mensaje={`Cargando ${GLOSARIO.ticket.plural.toLowerCase()}…`} />}>
        <BandejaTickets esAdmin={yo.data.is_admin || yo.data.is_superadmin} proyectos={referencias} />
      </Suspense>
    </section>
  )
}
