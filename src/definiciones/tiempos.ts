import type { DefinicionRecurso } from './tipos.ts'
import type { RegistroTiempo } from '../datos/recursos.ts'

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
