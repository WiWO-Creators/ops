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

  filtros: [],
  ordenables: ['name', 'start_date', 'due_date', 'order'],
  ordenPorDefecto: 'order',
  busqueda: false,
  includes: []
}
