import type { Columna, DefinicionRecurso } from './tipos.ts'
import type { EspacioPortal, PestaniaPortal, TareaPortal } from '../datos/portal.ts'
import type { Proceso } from '../datos/recursos.ts'
import { procesosDelEspacio } from './procesos.ts'
import { formatearFecha, formatearVencimiento } from '../lib/fechas.ts'
import { SIN_DATO } from '../lib/sla.ts'
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
    { clave: 'patente', encabezado: 'ID', sinCortar: true, presentar: (t) => t.patente ?? SIN_DATO },
    { clave: 'name', encabezado: 'Nombre', ordenPor: 'name', presentar: (t) => t.name },
    { clave: 'status', encabezado: 'Estado', comoInsignia: 'task_statuses', presentar: (t) => t.status },
    // Mismo criterio que la tabla interna: sin plazo se lee "Sin fecha", no el guion de un dato que
    // falta. En pantalla lo pinta el presentador `Fecha`; este texto es el del CSV.
    { clave: 'due_date', encabezado: 'Vence', ordenPor: 'due_date', presentar: (t) => formatearVencimiento(t.due_date) },
    {
      clave: 'start_date',
      encabezado: 'Inicio',
      ocultaPorDefecto: true,
      presentar: (t) => formatearFecha(t.start_date)
    }
  ],

  filtros: [{ clave: 'status', etiqueta: 'Estado', tipo: 'multiple', desdeLookup: 'task_statuses' }],
  ordenables: ['name', 'due_date', 'status', 'completed', 'date_added'],
  ordenPorDefecto: ['completed', '-date_added'],
  busqueda: true,
  includes: []
}

/**
 * Las columnas de Procesos que el contrato del contacto **si** emite.
 *
 * Es la lista corta a proposito, y no la del equipo menos algunas: lo que no esta acá es porque
 * `GET /portal/projects/{id}/tasks` no manda la clave (asignados, tipo, ETA, desviacion, SLA,
 * iteraciones, hito) o porque es vocabulario interno que no se publica (las etiquetas, igual que en
 * `proyectoDelPortal`). Agregar una clave acá sin que la API la emita no deja la celda vacia:
 * rompe la fila, porque la celda rica del panel lee el objeto adentro.
 */
const COLUMNAS_DEL_CONTACTO = ['patente', 'name', 'status', 'priority', 'due_date', 'start_date']

/**
 * La definicion de Procesos de un Proyecto, acotada a lo que ve un contacto.
 *
 * **Se deriva de la del equipo, no se escribe de nuevo.** `procesosDelEspacio` es la unica lista de
 * columnas de Procesos del producto: encabezados, orden y visibilidad por defecto salen de alli, asi
 * que la tabla del cliente y la del equipo se leen igual —misma columna, mismo rotulo, misma
 * posicion— y un renombre futuro llega a las dos. Lo unico propio es **cuanto** se muestra.
 *
 * Las tres listas blancas —filtros, orden y includes— son las del endpoint del portal, que es otro:
 * un filtro que aquel no declara devuelve 422, y `include=custom_fields` no existe para un contacto.
 *
 * El tipo sigue siendo `DefinicionRecurso<Proceso>` porque es el que consumen la tabla, el tablero y
 * el calendario compartidos. Las filas que llegan son `TareaPortal`, un **subconjunto** de `Proceso`:
 * por eso la lista de columnas de arriba es la garantia, y `pruebas/procesos-del-contacto.test.js`
 * pinta cada columna contra una fila del portal para que una columna colada se note ahi y no en
 * pantalla.
 *
 * @param proyectoId El Proyecto que el cliente esta mirando.
 * @returns La definicion lista para la tabla, el tablero y el calendario de Procesos.
 */
export function procesosDelContacto (proyectoId: number): DefinicionRecurso<Proceso> {
  const base = procesosDelEspacio(proyectoId)
  const ordenables = PORTAL_TAREAS.ordenables

  return {
    ...base,
    ruta: `portal/projects/${encodeURIComponent(String(proyectoId))}/tasks`,
    columnas: base.columnas
      .filter((columna) => COLUMNAS_DEL_CONTACTO.includes(columna.clave))
      // Una flecha de orden sobre un campo que el endpoint del portal no ordena se dibujaria, se
      // podria pulsar y no haria nada: `construirConsulta` poda el `sort` contra `ordenables`.
      .map((columna): Columna<Proceso> => (
        columna.ordenPor !== undefined && !ordenables.includes(columna.ordenPor)
          ? { ...columna, ordenPor: undefined }
          : columna
      )),
    filtros: base.filtros.filter((filtro) => PORTAL_TAREAS.filtros.some((suyo) => suyo.clave === filtro.clave)),
    // Ninguna. Dos de las del equipo —arrancar y detener el cronometro— no piden capacidad, asi que
    // con `capacidades={[]}` sobrevivian a la poda por permisos y el cliente veia un menu de acciones
    // por fila que solo podia devolver 404. La accion no existe para este sujeto, no es que no se
    // pueda: declararlo aca es lo que hace desaparecer la columna entera.
    acciones: [],
    ordenables,
    ordenPorDefecto: PORTAL_TAREAS.ordenPorDefecto,
    // El equipo pide siempre `custom_fields` porque son columnas; el contacto no los tiene.
    incluirSiempre: [],
    includes: []
  }
}

/**
 * Rotulo de cada pestaña del proyecto, en el orden en que se muestran.
 *
 * El orden lo fija esta lista y no el arreglo `tabs` que manda la API: el backend enumera lo que se
 * puede ver, el producto decide en que orden se lee.
 */
/**
 * Las pestañas que el portal sabe dibujar, **en el orden y con los rotulos del panel**.
 *
 * Cada clave es la del contrato de la API; el rotulo es el que ve el cliente, y es palabra por
 * palabra el de `(panel)/espacios/[id]`: la misma pestaña no puede llamarse "Horas" para el cliente
 * y "Tiempos" para quien lo atiende, porque despues los dos hablan por telefono. Cuando el panel
 * renombre una, se renombra acá.
 *
 * Tickets es la unica sin equivalente en el panel —soporte no es una pestaña del proyecto ahi— y por
 * eso va al final, antes de Actividad, que en el panel cierra la fila.
 */
export const PESTANIAS_PROYECTO: Array<{ clave: PestaniaPortal, etiqueta: string }> = [
  { clave: 'overview', etiqueta: 'Descripción' },
  { clave: 'tasks', etiqueta: GLOSARIO.proceso.plural },
  { clave: 'timesheets', etiqueta: 'Tiempos' },
  { clave: 'milestones', etiqueta: GLOSARIO.hito.plural },
  { clave: 'files', etiqueta: 'Archivos' },
  { clave: 'discussions', etiqueta: 'Discusiones' },
  { clave: 'gantt', etiqueta: 'Diagrama de Gantt' },
  // Pegada al Gantt y en ese orden porque es el del panel: las dos leen las mismas fechas y
  // contestan preguntas distintas —el Gantt dibuja duraciones, el calendario el dia de entrega—.
  { clave: 'calendar', etiqueta: 'Calendario' },
  // El Meeting Paper puede contener conversacion interna, asi que su flag por proyecto nace en '0' y
  // se enciende a mano: la pestaña existe acá, pero la API no la habilita por defecto en ninguno.
  { clave: 'actas', etiqueta: GLOSARIO.acta.singular },
  { clave: 'tickets', etiqueta: GLOSARIO.ticket.plural },
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
