import type { DefinicionRecurso } from './tipos.ts'
import type { RegistroTiempo } from '../datos/recursos.ts'
import type { FuenteDeProyecto } from '../dominio/fuente-proyecto.ts'

/**
 * Definicion del recurso Tiempos, para la barra de controles de la pestaña del Proyecto.
 *
 * Solo se usa para los *controles*: filtros, orden, busqueda y paginacion. La tabla que hay debajo
 * es a medida (avatar, etiquetas y botones por fila con los permisos que decide el backend), asi que
 * `columnas` queda vacia y la barra se monta con `sinColumnas`. Declararla igual como
 * `DefinicionRecurso` es lo que permite reusar `ControlesTabla`, `leerConsulta` y `construirConsulta`
 * en vez de escribir otra barra y otro serializador.
 *
 * Cada nombre de aca esta copiado de la whitelist de `RecursoTimesheets::consulta()`: el backend
 * responde `422` ante un filtro o un orden que no conoce, no los ignora.
 */

/**
 * Clave con la que el panel inyecta las personas que registraron tiempo.
 *
 * No es un catalogo de `/lookups`: sale de `GET /projects/{id}/timesheets/staff`, que es el listado
 * de quienes efectivamente cargaron horas en *este* proyecto. Se pasa por `opcionesDeFiltro` con
 * esta clave, que es el mismo mecanismo que usan los filtros con catalogo.
 */
export const LOOKUP_PERSONAS_CON_TIEMPO = 'personas_con_tiempo'

export const TIEMPOS: DefinicionRecurso<RegistroTiempo> = {
  // Ruta neutra: quien la monta pide `projects/{id}/timesheets`. Acotar por ruta y no por filtro
  // evita que el proyecto quede como un parametro visible y editable en la URL.
  ruta: 'timesheets',
  titulo: { singular: 'hora registrada', plural: 'horas' },

  // La tabla de la pestaña no se genera desde aca; ver el docblock de arriba.
  columnas: [],

  filtros: [
    { clave: 'task_id', etiqueta: 'ID de tarea', tipo: 'campo', tipoDato: 'numero' },
    { clave: 'note', etiqueta: 'Nota', tipo: 'campo', tipoDato: 'texto' },
    { clave: 'start_time', etiqueta: 'Inicio', tipo: 'campo', tipoDato: 'fecha' },
    { clave: 'end_time', etiqueta: 'Fin', tipo: 'campo', tipoDato: 'fecha' },
    { clave: 'duration', etiqueta: 'Duración (segundos)', tipo: 'campo', tipoDato: 'numero' },
    // `staff_id` acepta varios ids separados por coma (el backend los traduce a `IN`), asi que el
    // control es de seleccion multiple y no uno solo.
    { clave: 'staff_id', etiqueta: 'Persona', tipo: 'multiple', desdeLookup: LOOKUP_PERSONAS_CON_TIEMPO },
    { clave: 'billable', etiqueta: 'Facturable', tipo: 'booleano' },
    { clave: 'billed', etiqueta: 'Facturada', tipo: 'booleano' },
    // UN control con DOS parametros: `date_from` y `date_to` son dos filtros de la whitelist sobre el
    // mismo `start_time`. Declararlos sueltos pintaria dos rangos y mandaria un `IN` en vez de un rango.
    { clave: 'fecha', etiqueta: 'Fecha', tipo: 'rangoFechas', clavesRango: ['date_from', 'date_to'] }
  ],

  // `task_id` esta en la whitelist pero no se declara: la unica lista de tareas que expone la API
  // (`/timesheets/tasks`) es la del formulario de alta —solo tareas abiertas y sin facturar—, asi que
  // como origen de opciones ofreceria tareas sin ningun registro y esconderia las que si tienen. La
  // busqueda `q` ya cubre encontrar por nombre de tarea.

  ordenables: ['start_time', 'end_time', 'staff', 'duration'],
  // El mismo que aplica el backend cuando no llega `sort`: la vista no cambia de orden al migrar.
  ordenPorDefecto: '-start_time',
  busqueda: true,
  includes: []
}

/**
 * Las columnas de la tabla de horas, en el orden en que se dibujan.
 *
 * La tabla es a medida —avatar, insignias y botones por fila— asi que no sale de `columnas`, pero
 * **cuales existen sigue siendo propiedad del contrato**: sin esta lista, la tabla del cliente
 * dibujaba una columna "Etiquetas" siempre vacia y una "Hora (decimal)" que no llega.
 */
export const COLUMNAS_DE_TIEMPO = [
  'staff', 'task', 'tags', 'start_time', 'end_time', 'note', 'hm', 'decimal', 'acciones'
] as const

export type ColumnaDeTiempo = typeof COLUMNAS_DE_TIEMPO[number]

/** Las columnas que el contrato del contacto **si** emite (ver `TiempoPortal`). */
const COLUMNAS_DE_TIEMPO_DEL_CONTACTO: readonly ColumnaDeTiempo[] = [
  'staff', 'task', 'start_time', 'end_time', 'note', 'hm'
]

/** Que ofrece la pestaña Tiempos segun de que contrato bajen los datos. */
export interface PestaniaDeTiempos {
  definicion: DefinicionRecurso<RegistroTiempo>
  columnas: readonly ColumnaDeTiempo[]
  /**
   * Si el sujeto tiene el listado de quienes cargaron horas (`{tiempos}/staff`).
   *
   * `false` para el contacto: ese subrecurso no existe en su contrato, y el filtro por persona sin
   * opciones es un desplegable vacio.
   */
  conFiltroDePersonas: boolean
}

/**
 * Los registros de horas de un Proyecto para el equipo.
 *
 * @param proyectoId El Proyecto que se esta mirando.
 * @returns La definicion con la ruta ya acotada al Proyecto.
 */
export function tiemposDelEspacio (proyectoId: number): DefinicionRecurso<RegistroTiempo> {
  return { ...TIEMPOS, ruta: `projects/${encodeURIComponent(String(proyectoId))}/timesheets` }
}

/**
 * Los registros de horas de un Proyecto tal como los ve un contacto.
 *
 * Filtros, orden, busqueda y paginacion **si** viajan: `RecursoTimesheets::paraContacto()` usa la
 * misma whitelist que el endpoint del equipo. Se caen tres filtros y por motivos distintos: el de
 * persona porque su catalogo no existe para un contacto, y los de facturable y facturada porque la
 * facturacion del equipo no es asunto del cliente —su contrato ni siquiera publica esas claves—.
 *
 * @param proyectoId El Proyecto que el cliente esta mirando.
 * @returns La definicion lista para la tabla del portal.
 */
export function tiemposDelContacto (proyectoId: number): DefinicionRecurso<RegistroTiempo> {
  const sinFiltro = ['staff_id', 'billable', 'billed']

  return {
    ...TIEMPOS,
    ruta: `portal/projects/${encodeURIComponent(String(proyectoId))}/timesheets`,
    filtros: TIEMPOS.filtros.filter((filtro) => !sinFiltro.includes(filtro.clave))
  }
}

/**
 * Elige la definicion de Tiempos que corresponde al sujeto.
 *
 * **Es la unica lectura de `sujeto`** de esta pestaña, y vive en la capa de definiciones a proposito:
 * que columnas y que filtros existen es propiedad del contrato, no del dibujo.
 *
 * @param fuente De donde bajan los datos del Proyecto.
 * @param proyectoId El Proyecto que se esta mirando.
 * @returns La definicion, las columnas y las lecturas que ese contrato ofrece.
 */
export function definicionDeTiempos (fuente: FuenteDeProyecto, proyectoId: number): PestaniaDeTiempos {
  if (fuente.sujeto === 'portal') {
    return {
      definicion: tiemposDelContacto(proyectoId),
      columnas: COLUMNAS_DE_TIEMPO_DEL_CONTACTO,
      conFiltroDePersonas: false
    }
  }

  return {
    definicion: tiemposDelEspacio(proyectoId),
    columnas: COLUMNAS_DE_TIEMPO,
    conFiltroDePersonas: true
  }
}
