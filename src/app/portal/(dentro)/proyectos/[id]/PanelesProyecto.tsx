import Link from 'next/link'
import { Vacio } from '@/componentes/estado/Estados'
import { formatearFecha } from '@/lib/fechas'
import { pedirPortal } from '@/datos/servidor'
import type { ArchivoPortal, TicketPortal } from '@/datos/portal'
import { EstadoDelPortal, NombreDeArchivo } from '../../detalle'

/**
 * Las dos pestañas del proyecto que el portal dibuja por su cuenta.
 *
 * Se piden en el servidor y solo cuando la pestaña esta habilitada: pedirlas todas por si acaso
 * serian dos llamadas a la API para mostrar una.
 */

/*
 * Acá quedan DOS pestañas, y es a proposito: archivos y tickets son lo unico del proyecto donde el
 * contrato del cliente no es una version podada del contrato del equipo, sino otra cosa.
 *
 * Las demas —Descripcion, Tareas, Hitos, Tiempos, Discusiones, Gantt, Calendario y Actividad— las
 * dibuja el MISMO panel que abre un colaborador (`componentes/proyecto/Panel*`), con la fuente del
 * contacto y `capacidades={[]}`. Con eso el cliente gano la tabla completa, el tablero, la ficha de
 * una Tarea, los filtros, el orden y la paginacion que estas copias no tenian, y las dos pantallas
 * dejaron de poder desincronizarse.
 *
 * Se perdio a cambio la primera pagina resuelta en el servidor: los paneles compartidos son de
 * cliente, reciben un id y piden lo suyo al montarse, asi que las tablas del cliente ahora muestran
 * su bloque de carga como las del equipo. Es el precio de tener un solo dibujo, y esta anotado para
 * que no se lea como un descuido.
 */

export async function PanelArchivos ({ proyectoId }: { proyectoId: number }) {
  const { data } = await pedirPortal<ArchivoPortal[]>(`/portal/projects/${proyectoId}/files`)

  if (data.length === 0) {
    return <Vacio titulo="Sin archivos" descripcion="Todavía no compartimos archivos en este proyecto." />
  }

  return (
    <ul className="flex flex-col gap-2">
      {/* El rotulo ya no va aparte: `nombreDeArchivo` devuelve el `subject` cuando lo hay, que es
          lo que la persona escribio. Repetirlo al lado lo mostraba dos veces. */}
      {data.map((archivo) => (
        <li
          key={archivo.id}
          className="rounded-chico border-linea flex flex-wrap items-baseline gap-x-3 gap-y-1 border p-3"
        >
          <NombreDeArchivo archivo={archivo} />
          <span className="text-texto-tenue ml-auto text-xs">{formatearFecha(archivo.date_added)}</span>
        </li>
      ))}
    </ul>
  )
}

/**
 * Tickets de soporte acotados a este proyecto.
 *
 * Se dibuja como lista y no con `TablaRecurso`: es un subconjunto chico dentro de una pestaña, y
 * meter ahi un motor de tabla con su propio estado en la URL chocaria con el `?tab=` del proyecto.
 */
export async function PanelTicketsDelProyecto ({ proyectoId }: { proyectoId: number }) {
  const { data } = await pedirPortal<TicketPortal[]>(`/portal/projects/${proyectoId}/tickets?per_page=100`)

  if (data.length === 0) {
    return <Vacio titulo="Nada por acá" descripcion="Este proyecto todavía no tiene tickets." />
  }

  return (
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
  )
}
