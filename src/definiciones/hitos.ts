import type { DefinicionRecurso } from './tipos.ts'
import type { HitoDetallado } from '../datos/recursos.ts'
import { GLOSARIO } from '../dominio/glosario.ts'
import { formatearFecha } from '../lib/fechas.ts'

/**
 * Definicion del recurso Hitos, para la vista de tabla de la pestaña.
 *
 * La `ruta` es la neutra: quien la monta la reemplaza por `projects/{id}/milestones`, igual que hace
 * `PanelTareas` con Procesos. Acotar por ruta y no por filtro evita que el proyecto quede como un
 * parametro visible y borrable en la URL.
 *
 * Las columnas son las literales del panel: Nombre del hito, Fecha de inicio, Fecha de vencimiento y
 * Descripcion. El avance y las acciones los agrega la pestaña, que si puede devolver JSX.
 *
 * Fuente: `CONTRATO-NUEVO.md` seccion 5.
 */
export const HITOS: DefinicionRecurso<HitoDetallado> = {
  ruta: 'milestones',
  titulo: GLOSARIO.hito,

  columnas: [
    { clave: 'name', encabezado: 'Nombre del hito', ordenPor: 'name', presentar: (h) => h.name },
    { clave: 'start_date', encabezado: 'Fecha de inicio', ordenPor: 'start_date', presentar: (h) => formatearFecha(h.start_date) },
    { clave: 'due_date', encabezado: 'Fecha de vencimiento', ordenPor: 'due_date', presentar: (h) => formatearFecha(h.due_date) },
    { clave: 'description', encabezado: 'Descripción', presentar: (h) => h.description ?? '' },
    { clave: 'avance', encabezado: 'Avance', presentar: (h) => `${h.counts.tasks_done}/${h.counts.tasks}` }
  ],

  /**
   * Las tres cosas que el backend acepta filtrar sobre un hito (`RecursoHitos::consulta()`).
   *
   * El rango es UN filtro con dos claves, no dos filtros: `filter[date_from]` y `filter[date_to]`
   * viajan por separado pero caen sobre la misma columna (`due_date`), y declararlos sueltos pinta
   * dos controles de rango y manda `filter[date_from]=a,b`, que el backend lee como `IN`.
   *
   * `hide_from_customer` no es una columna de la tabla, pero es la pregunta que el equipo se hace
   * seguido —"que hitos ve el cliente"— y es una columna real de `tblmilestones`, no un calculo.
   */
  filtros: [
    { clave: 'vence', etiqueta: 'Vence', tipo: 'rangoFechas', clavesRango: ['date_from', 'date_to'] },
    { clave: 'hide_from_customer', etiqueta: 'Oculto al cliente', tipo: 'booleano' }
  ],
  // El avance queda fuera: sale de dos subconsultas de conteo y el backend no lo ordena.
  ordenables: ['name', 'start_date', 'due_date', 'order'],
  ordenPorDefecto: 'order',
  busqueda: true,
  includes: []
}
