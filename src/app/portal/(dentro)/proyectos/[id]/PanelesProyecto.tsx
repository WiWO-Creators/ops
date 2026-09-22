import Link from 'next/link'
import { formatearFecha } from '@/lib/fechas'
import type { TicketPortal } from '@/datos/portal'
import { Vacio } from '@/componentes/estado/Estados'
import { cargarLookupsDelPortal, listaDe } from '@/datos/lookups'
import { pedirPortal } from '@/datos/servidor'
import { GLOSARIO } from '@/dominio/glosario'
import { EstadoDelPortal } from '../../detalle'
import { NuevaSolicitud } from './NuevaSolicitud'

/**
 * Las dos pestañas del proyecto que el portal dibuja por su cuenta.
 *
 * Se piden en el servidor y solo cuando la pestaña esta habilitada: pedirlas todas por si acaso
 * serian dos llamadas a la API para mostrar una.
 */

/*
 * Acá queda UNA sola pestaña, y es a proposito: los tickets son lo unico del proyecto donde el
 * contrato del cliente no es una version podada del contrato del equipo, sino otra cosa —el equipo
 * no tiene una pestaña de soporte dentro del Proyecto—.
 *
 * Las demas —Descripcion, Tareas, Hitos, Tiempos, Discusiones, Gantt, Calendario, Actividad y ahora
 * tambien Archivos— las dibuja el MISMO panel que abre un colaborador
 * (`componentes/proyecto/Panel*`), con la fuente del contacto y `capacidades={[]}`. Con eso el
 * cliente gano la tabla completa, el tablero, la ficha de una Tarea, los filtros, el orden y la
 * paginacion que estas copias no tenian, y las dos pantallas dejaron de poder desincronizarse.
 *
 * Archivos fue la ultima en mudarse. Su copia local era una lista `<ul>` sin filtros, sin orden y
 * sin paginacion, que pedia `/portal/projects/{id}/files` en el servidor. La reemplaza
 * `componentes/proyecto/PanelArchivos` con `fuente`, que del lado del contacto monta solo los
 * adjuntos —el arbol de Drive NO: Drive no tiene `visible_to_customer` por archivo ni ruta de
 * portal, asi que montarlo abriria la carpeta entera del Espacio con lo que nadie decidio
 * compartirle adentro—.
 *
 * Se perdio a cambio la primera pagina resuelta en el servidor: los paneles compartidos son de
 * cliente, reciben un id y piden lo suyo al montarse, asi que las tablas del cliente ahora muestran
 * su bloque de carga como las del equipo. Es el precio de tener un solo dibujo, y esta anotado para
 * que no se lea como un descuido.
 */

/**
 * Tickets de soporte acotados a este proyecto, y el alta de uno nuevo.
 *
 * Se dibuja como lista y no con `TablaRecurso`: es un subconjunto chico dentro de una pestaña, y
 * meter ahi un motor de tabla con su propio estado en la URL chocaria con el `?tab=` del proyecto.
 *
 * Esta pestaña es **el unico lugar** desde donde el cliente pide algo: el soporte ya no es una
 * seccion del portal. Por eso el alta va acá y no en un menu global, y por eso el estado vacio
 * invita en vez de despedir —antes decia «todavía no tiene tickets» y no ofrecia salida—.
 *
 * Queda atada al interruptor `tickets` del proyecto, y eso es lo correcto: un {espacio} que no
 * comparte esta pestaña no la dibuja, y ahi no hay nada que pedir. No existe atajo que se lo
 * saltee.
 */
export async function PanelTicketsDelProyecto ({ proyectoId }: { proyectoId: number }) {
  // En paralelo: el catalogo de prioridades lo necesita el alta, y `cargarLookupsDelPortal` esta
  // cacheado por peticion, asi que no cuesta una llamada extra si otra pestaña ya lo pidio.
  const [{ data }, lookups] = await Promise.all([
    pedirPortal<TicketPortal[]>(`/portal/projects/${proyectoId}/tickets?per_page=100`),
    cargarLookupsDelPortal()
  ])
  const alta = <NuevaSolicitud proyectoId={proyectoId} prioridades={listaDe(lookups, 'ticket_priorities')} />

  if (data.length === 0) {
    return (
      <Vacio
        titulo="Todavía no pediste nada acá"
        descripcion={`Si necesitas algo de este ${GLOSARIO.espacio.singular.toLowerCase()}, cuéntanos y el equipo lo recibe.`}
        accion={alta}
      />
    )
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Arriba y alineado a la derecha, como el alta de cualquier listado del panel: la lista es
          lo que la persona vino a leer y el boton no le disputa el primer renglon. */}
      <div className="flex justify-end">{alta}</div>

      <ul className="flex flex-col gap-2">
        {data.map((ticket) => (
          <li key={ticket.id} className="rounded-chico border-linea flex flex-wrap items-center gap-3 border p-3">
            <Link
              href={`/portal/soporte/${ticket.id}`}
              className="text-texto hover:text-acento text-sm font-medium underline-offset-4 hover:underline"
            >
              {ticket.subject}
            </Link>
            <EstadoDelPortal catalogo="ticket_statuses" valor={ticket.status} />
            <span className="text-texto-tenue ml-auto text-sm">{formatearFecha(ticket.date)}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
