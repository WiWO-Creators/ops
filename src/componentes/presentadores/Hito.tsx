import { Insignia } from './Insignia'
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
