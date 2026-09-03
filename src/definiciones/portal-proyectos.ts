import type { DefinicionRecurso } from './tipos.ts'
import type { EspacioPortal, PestaniaPortal, TareaPortal } from '../datos/portal.ts'
import { formatearFecha } from '../lib/fechas.ts'
import { GLOSARIO } from '../dominio/glosario.ts'

/**
 * Proyectos del portal y las tareas de un proyecto.
 *
 * El vocabulario visible sale del glosario: la API los llama `projects` y `tasks`, el cliente los ve
 * como Proyectos y Tareas. La clave nombra el recurso, el valor nombra lo que se lee.
 */

/** Listado de proyectos del cliente. */
export const PORTAL_PROYECTOS: DefinicionRecurso<EspacioPortal> = {
  ruta: 'portal/projects',
  titulo: GLOSARIO.espacio,

  columnas: [
    { clave: 'name', encabezado: 'Nombre', ordenPor: 'name', presentar: (p) => p.name },
    { clave: 'status', encabezado: 'Estado', comoInsignia: 'project_statuses', presentar: (p) => p.status },
    {
      clave: 'progress',
      encabezado: 'Avance',
      numerica: true,
      presentar: (p) => `${p.progress}%`
    },
    {
      clave: 'tasks_open',
      encabezado: `${GLOSARIO.proceso.plural} abiertas`,
      numerica: true,
      presentar: (p) => String(p.counts.tasks_open)
    },
    {
      clave: 'start_date',
      encabezado: 'Inicio',
      ordenPor: 'start_date',
      ocultaPorDefecto: true,
      presentar: (p) => formatearFecha(p.start_date)
    },
    { clave: 'deadline', encabezado: 'Entrega', ordenPor: 'deadline', presentar: (p) => formatearFecha(p.deadline) }
  ],

  filtros: [{ clave: 'status', etiqueta: 'Estado', tipo: 'multiple', desdeLookup: 'project_statuses' }],
  ordenables: ['name', 'start_date', 'deadline'],
  ordenPorDefecto: 'name',
  busqueda: true,
  includes: []
}

/**
 * Tareas de un proyecto.
 *
 * `ruta` queda vacia a proposito: esta definicion nunca se pide sola, siempre cuelga de un proyecto
 * (`portal/projects/{id}/tasks`) y la pagina arma la ruta con el id. Declararla con un valor fijo
 * seria mentir sobre a donde apunta.
 */
export const PORTAL_TAREAS: DefinicionRecurso<TareaPortal> = {
  ruta: '',
  titulo: GLOSARIO.proceso,

  columnas: [
    { clave: 'name', encabezado: 'Nombre', ordenPor: 'name', presentar: (t) => t.name },
    { clave: 'status', encabezado: 'Estado', comoInsignia: 'task_statuses', presentar: (t) => t.status },
    { clave: 'due_date', encabezado: 'Vence', ordenPor: 'due_date', presentar: (t) => formatearFecha(t.due_date) },
    {
      clave: 'start_date',
      encabezado: 'Inicio',
      ocultaPorDefecto: true,
      presentar: (t) => formatearFecha(t.start_date)
    }
  ],

  filtros: [],
  ordenables: ['name', 'due_date', 'status', 'completed', 'date_added'],
  ordenPorDefecto: ['completed', '-date_added'],
  busqueda: true,
  includes: []
}

/**
 * Rotulo de cada pestaña del proyecto, en el orden en que se muestran.
 *
 * El orden lo fija esta lista y no el arreglo `tabs` que manda la API: el backend enumera lo que se
 * puede ver, el producto decide en que orden se lee.
 */
export const PESTANIAS_PROYECTO: Array<{ clave: PestaniaPortal, etiqueta: string }> = [
  { clave: 'overview', etiqueta: 'Resumen' },
  { clave: 'tasks', etiqueta: GLOSARIO.proceso.plural },
  { clave: 'milestones', etiqueta: GLOSARIO.hito.plural },
  { clave: 'files', etiqueta: 'Archivos' },
  { clave: 'tickets', etiqueta: GLOSARIO.ticket.plural },
  { clave: 'discussions', etiqueta: 'Conversaciones' },
  { clave: 'timesheets', etiqueta: 'Horas' },
  { clave: 'gantt', etiqueta: 'Planificación' },
  { clave: 'activity', etiqueta: 'Actividad' }
]

/**
 * Filtra y ordena las pestañas que el cliente puede abrir en un proyecto.
 *
 * Las que la API habilita pero el portal no construyo —facturas, presupuestos, contratos y
 * propuestas dentro de un proyecto— se ignoran en silencio: mostrar una pestaña que no lleva a
 * ningun lado es peor que no mostrarla.
 */
export function pestaniasDelProyecto (habilitadas: readonly string[]): Array<{ clave: PestaniaPortal, etiqueta: string }> {
  return PESTANIAS_PROYECTO.filter((p) => habilitadas.includes(p.clave))
}
