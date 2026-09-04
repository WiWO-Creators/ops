import type { DefinicionRecurso } from './tipos.ts'
import type { RegistroTiempo } from '../datos/recursos.ts'
import { GLOSARIO } from '../dominio/glosario.ts'
import { formatearFecha } from '../lib/fechas.ts'

/**
 * Definicion del recurso Horas de una persona (`GET /staff/{id}/timesheets`).
 *
 * Es la misma tabla que la pestaña Tiempos de un Proyecto vista desde el otro eje: alli las filas son
 * de un Proyecto y varias personas, y aca de una persona y varios Proyectos. Por eso tiene columna de
 * Proyecto y no de persona, y por eso no reusa `TIEMPOS`: esa definicion existe solo para los
 * controles de una tabla a medida —con avatar, etiquetas y botones por fila— que aca sobra, porque
 * una ficha de equipo se lee, no se edita. Registrar y corregir horas sigue estando en el Proyecto,
 * que es donde el backend decide los permisos fila por fila.
 *
 * Cada nombre de filtro y de orden esta copiado de la whitelist de `RecursoTimesheets::consulta()`:
 * el backend responde `422` ante uno que no conoce, no lo ignora.
 *
 * Sin filtros de facturacion (`billable`, `billed`) aunque la whitelist los acepte: el modulo de
 * ventas no se usa, y un filtro que nunca separa nada es un control que solo estorba.
 */
export const HORAS_PERSONA: DefinicionRecurso<RegistroTiempo> = {
  // Ruta neutra: quien la monta pide `staff/{id}/timesheets`. Acotar por ruta y no por filtro deja a
  // la persona fuera de la URL, donde seria editable y mostraria horas ajenas bajo su nombre.
  ruta: 'timesheets',
  titulo: { singular: 'hora registrada', plural: 'horas' },

  columnas: [
    {
      clave: 'start_time',
      encabezado: 'Inicio',
      ordenPor: 'start_time',
      presentar: (registro) => formatearFecha(registro.start_time, true)
    },
    { clave: 'task', encabezado: GLOSARIO.proceso.singular, presentar: (registro) => registro.task.name },
    {
      clave: 'project',
      encabezado: GLOSARIO.espacio.singular,
      // Una Tarea puede no colgar de ningun Proyecto: el backend manda `null` y no se inventa uno.
      presentar: (registro) => registro.project?.name ?? '—'
    },
    {
      clave: 'duration_hm',
      encabezado: 'Duración',
      ordenPor: 'duration',
      numerica: true,
      // `duration_hm` llega hecho del backend. Recalcularlo aca es como los dos numeros discrepan en
      // el ultimo minuto; lo unico que envejece en pantalla es un registro corriendo, y esos se
      // miran en el Proyecto, donde hay cronometro.
      presentar: (registro) => registro.duration_hm
    },
    { clave: 'note', encabezado: 'Nota', presentar: (registro) => registro.note ?? '' }
  ],

  filtros: [
    // UN control con DOS parametros: `date_from` y `date_to` son dos filtros de la whitelist sobre el
    // mismo `start_time`. Declararlos sueltos pintaria dos rangos y mandaria un `IN` en vez de un rango.
    { clave: 'fecha', etiqueta: 'Fecha', tipo: 'rangoFechas', clavesRango: ['date_from', 'date_to'] }
  ],

  ordenables: ['start_time', 'duration'],
  // El mismo que aplica el backend cuando no llega `sort`: lo ultimo que hizo, primero.
  ordenPorDefecto: '-start_time',
  busqueda: true,
  includes: []
}
