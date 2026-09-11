import { Insignia } from './Insignia'
import { BarraProgreso } from '@/componentes/proyecto/CabeceraProyecto'
import { avanceDeHito } from '@/componentes/proyecto/hitos'
import { GLOSARIO } from '@/dominio/glosario'
import { formatearFecha } from '@/lib/fechas'
import type { Referencia } from '@/datos/recursos'
import { SIN_DATO } from '@/lib/sla'

/**
 * El hito al que pertenece una Tarea.
 *
 * Presentador unico, como `Fecha` o `EstadoSla`: la misma celda la pintan la lista global de Tareas y
 * la pestaña Tareas de un Espacio, y dos copias que se separen dejan la misma tarea con dos aspectos
 * segun por donde se la mire.
 *
 * Sin hito va la raya y no una celda vacia: la mayoria de las tareas de la base no cuelgan de ninguno
 * —en `tbltasks` eso se guarda como `milestone = 0`—, y una celda en blanco se lee como un dato que
 * no cargo.
 *
 * El nombre se recorta con `title` completo porque los hitos de esta instalacion son semanas
 * ("SEMANA 1 | 06/08/2026 - 10/08/2026"): sin tope, la columna se lleva el ancho de la tabla.
 */
export function InsigniaHito ({ hito }: { hito: Referencia | null }) {
  if (hito === null) return <span className="text-texto-sutil">{SIN_DATO}</span>

  return (
    <Insignia tono="contorno" tamano="chico" className="max-w-52" title={hito.name}>
      <span className="min-w-0 truncate">{hito.name}</span>
    </Insignia>
  )
}

/**
 * Lo minimo que un hito necesita para mostrar su vencimiento y su avance.
 *
 * Se declara lo que se usa y no `HitoDetallado`: la misma marca la pintan la tabla de Hitos del
 * equipo y la lista del portal, y `HitoPortal` no trae ni la mitad de los campos del panel. Atarla
 * al tipo del panel fue lo que dejo al portal calculando el avance por su cuenta.
 */
export interface HitoParaMostrar {
  due_date: string | null
  vencido: boolean
  counts: { tasks: number, tasks_done: number }
}

/**
 * Fecha de vencimiento con la marca de vencido.
 *
 * @param hito el hito, de cualquiera de los dos contratos
 * @returns la fecha, en rojo y con la etiqueta "Vencido" cuando ya paso
 */
export function VencimientoDeHito ({ hito }: { hito: HitoParaMostrar }) {
  return (
    <span className="flex flex-wrap items-center gap-2">
      <span className={hito.vencido ? 'text-texto-peligro' : undefined}>
        {formatearFecha(hito.due_date)}
      </span>
      {hito.vencido && (
        <span className="bg-relleno-peligro text-relleno-peligro-contenido rounded-control px-2 py-0.5 text-xs font-semibold">
          Vencido
        </span>
      )}
    </span>
  )
}

/**
 * Avance del hito: barra y contador. Sin tareas no hay barra, porque no hay nada que medir.
 *
 * @param hito el hito, de cualquiera de los dos contratos
 * @returns la barra con su contador, o el aviso de que no tiene tareas
 */
export function AvanceDeHito ({ hito }: { hito: HitoParaMostrar }) {
  const avance = avanceDeHito(hito.counts)

  if (avance === null) {
    return <span className="text-texto-sutil text-xs">Sin {GLOSARIO.proceso.plural.toLowerCase()}</span>
  }

  return (
    <span className="flex min-w-24 items-center gap-2">
      <BarraProgreso porcentaje={avance} className="min-w-0 flex-1" />
      <span data-numerico className="text-texto-tenue text-xs">
        {hito.counts.tasks_done}/{hito.counts.tasks}
      </span>
    </span>
  )
}
