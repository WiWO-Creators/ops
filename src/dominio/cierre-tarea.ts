import { hoyLocal } from '../lib/fechas.ts'

/**
 * Fecha de cierre de una Tarea: del `<input type="date">` al `completed_at` del contrato, y al reves.
 *
 * Existe porque las dos puntas hablan idiomas distintos. El control nativo da y toma `YYYY-MM-DD`
 * sin hora; `PATCH /tasks/{id}` exige un **instante ISO-8601 con zona** y rechaza con
 * `422 ["invalid"]` cualquier ISO sin ella. Traducir entre esas dos formas es la unica logica de la
 * feature que se puede romper en silencio, asi que vive en un `.ts` y tiene prueba.
 *
 * Los imports son relativos y con extension porque `pruebas/cierre-tarea.test.js` corre con el
 * runner de Node, que resuelve rutas de archivo y no el alias `@/` de Next.
 */

const ES_FECHA_SOLA = /^\d{4}-\d{2}-\d{2}$/

/**
 * Convierte la fecha elegida en el control en el instante que espera `completed_at`.
 *
 * El dia elegido no trae hora, y hay que inventarle una. La regla es la mas conservadora posible:
 *
 * - **Hoy** cierra con el instante actual. Es el caso normal —se marca la tarea cuando se termino— y
 *   cualquier otra hora del dia de hoy podria caer adelante del reloj y volver con `422 ["futura"]`.
 * - **Cualquier otro dia** cierra al **mediodia local**. No es el final del dia a proposito: el
 *   backend guarda en UTC con un reloj corrido respecto del navegador —MySQL en UTC, PHP en
 *   Santiago—, y un cierre a las 23:59 vuelve del `GET` ya pasado a la medianoche siguiente, o sea
 *   con la ficha mostrando un dia que nadie eligio. El mediodia aguanta ese corrimiento sin cambiar
 *   de dia, y sigue quedando adelante del `start_date` —que es una fecha sin hora, o sea medianoche—
 *   cuando la tarea empieza y termina el mismo dia.
 *
 * Un dia **futuro** se traduce igual, sin topearlo: la API es la que decide, y su `futura` se lee en
 * pantalla. Recortarlo aca en silencio guardaria una fecha que la persona no eligio.
 *
 * @param fecha Dia elegido en el control, en `YYYY-MM-DD`.
 * @param ahora Instante de referencia; entra por parametro para poder probarlo sin depender del reloj.
 * @returns El instante ISO-8601 con zona (UTC), o `null` si la fecha no tiene la forma esperada.
 */
export function instanteDeCierre (fecha: string, ahora: Date = new Date()): string | null {
  if (!ES_FECHA_SOLA.test(fecha)) return null

  if (fecha === hoyLocal(ahora)) return ahora.toISOString()

  const [anio, mes, dia] = fecha.split('-').map(Number)

  if (anio === undefined || mes === undefined || dia === undefined) return null

  const instante = new Date(anio, mes - 1, dia, 12, 0, 0)

  // `new Date(2026, 1, 31)` no falla: rueda al 3 de marzo. Un 31 de febrero escrito a mano en el
  // control se guardaria como otro dia sin que nadie lo note.
  if (instante.getFullYear() !== anio || instante.getMonth() !== mes - 1 || instante.getDate() !== dia) {
    return null
  }

  return instante.toISOString()
}

/**
 * Convierte el `date_finished` que llego de la API en el dia que entiende el control.
 *
 * @param dateFinished El instante ISO de cierre, o `null` si la tarea no esta cerrada.
 * @returns El dia local en `YYYY-MM-DD`, o cadena vacia si no hay cierre o el valor no es una fecha.
 */
export function fechaDeCierre (dateFinished: string | null | undefined): string {
  if (typeof dateFinished !== 'string' || dateFinished === '') return ''

  if (ES_FECHA_SOLA.test(dateFinished)) return dateFinished

  const instante = new Date(dateFinished)

  return Number.isNaN(instante.getTime()) ? '' : hoyLocal(instante)
}
