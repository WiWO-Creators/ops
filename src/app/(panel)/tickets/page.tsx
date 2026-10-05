import { Suspense } from 'react'
import { Cargando } from '@/componentes/estado/Estados'
import { TituloModulo } from '@/componentes/estructura/TituloModulo'
import { GLOSARIO } from '@/dominio/glosario'
import { BandejaConProyectos } from './BandejaConProyectos'

export const metadata = { title: `${GLOSARIO.ticket.plural} · WiWO Ops` }

/**
 * Bandeja global de tickets del equipo (`GET /tickets`).
 *
 * El titulo se envia sin esperar a la API: lo que decide la forma de la bandeja (quien mira y los
 * Proyectos) se resuelve dentro de `BandejaConProyectos`, tras un limite de `Suspense`. La lista se
 * pide desde el navegador, igual que la pestaña Tickets del Proyecto: asi el modal la refresca con
 * los filtros puestos sin depender de un `router.refresh()` que rehaga toda la pagina.
 */
export default function TicketsPage () {
  return (
    <section className="flex flex-col gap-4">
      <TituloModulo titulo={GLOSARIO.ticket.plural} />

      <Suspense fallback={<Cargando alto="min-h-36" mensaje={`Cargando ${GLOSARIO.ticket.plural.toLowerCase()}…`} />}>
        <BandejaConProyectos />
      </Suspense>
    </section>
  )
}
