import type { DefinicionRecurso } from './tipos.ts'
import type { HitoDetallado } from '../datos/recursos.ts'
import { GLOSARIO } from '../dominio/glosario.ts'
import { formatearFecha } from '../lib/fechas.ts'
import type { FuenteDeProyecto } from '../dominio/fuente-proyecto.ts'

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
    { clave: 'name', etiqueta: 'Nombre', tipo: 'campo', tipoDato: 'texto' },
    { clave: 'start_date', etiqueta: 'Inicio', tipo: 'campo', tipoDato: 'fecha' },
    { clave: 'due_date', etiqueta: 'Vencimiento', tipo: 'campo', tipoDato: 'fecha' },
    { clave: 'description', etiqueta: 'Descripción', tipo: 'campo', tipoDato: 'texto' },
    { clave: 'avance', etiqueta: 'Avance (%)', tipo: 'campo', tipoDato: 'numero' },
    { clave: 'vence', etiqueta: 'Vence', tipo: 'rangoFechas', clavesRango: ['date_from', 'date_to'] },
    { clave: 'hide_from_customer', etiqueta: 'Oculto al cliente', tipo: 'booleano' }
  ],
  // El avance queda fuera: sale de dos subconsultas de conteo y el backend no lo ordena.
  ordenables: ['name', 'start_date', 'due_date', 'order'],
  ordenPorDefecto: 'order',
  busqueda: true,
  includes: []
}

/**
 * Las columnas de Hitos que el contrato del contacto **si** emite.
 *
 * Son las mismas cinco del equipo: `GET /portal/projects/{id}/milestones` publica nombre, fechas,
 * descripcion —solo si el equipo la marco compartible— y los contadores del avance. Se declara la
 * lista igual, y no un `...HITOS.columnas` a secas, para que el dia que el equipo sume una columna
 * que la API del contacto no manda, la del cliente no se rompa sola: agregar una clave sin que el
 * contrato la emita no deja la celda vacia, rompe la fila.
 */
const COLUMNAS_DEL_CONTACTO = ['name', 'start_date', 'due_date', 'description', 'avance']

/**
 * Los Hitos de un Proyecto para el equipo.
 *
 * @param proyectoId El Proyecto que se esta mirando.
 * @returns La definicion con la ruta ya acotada al Proyecto.
 */
export function hitosDelEspacio (proyectoId: number): DefinicionRecurso<HitoDetallado> {
  return { ...HITOS, ruta: `projects/${encodeURIComponent(String(proyectoId))}/milestones` }
}

/**
 * Los Hitos de un Proyecto tal como los ve un contacto.
 *
 * **Se deriva de la del equipo**: encabezados, orden de columnas y rotulos salen de un solo lugar,
 * asi que la lista del cliente y la del equipo se leen igual y un renombre futuro llega a las dos.
 *
 * Sin filtros, sin orden, sin busqueda y sin paginacion: `RecursoHitos::paraContacto()` no recibe
 * los parametros de la consulta —devuelve la coleccion entera del Proyecto—, asi que cualquier
 * control que se ofreciera se podria pulsar y no cambiaria nada.
 *
 * @param proyectoId El Proyecto que el cliente esta mirando.
 * @returns La definicion lista para la tabla del portal.
 */
export function hitosDelContacto (proyectoId: number): DefinicionRecurso<HitoDetallado> {
  return {
    ...HITOS,
    ruta: `portal/projects/${encodeURIComponent(String(proyectoId))}/milestones`,
    columnas: HITOS.columnas
      .filter((columna) => COLUMNAS_DEL_CONTACTO.includes(columna.clave))
      // Una flecha de orden que el endpoint no atiende se dibujaria, se podria pulsar y no haria
      // nada: la lista del contacto llega ya ordenada por el backend.
      .map((columna) => ({ ...columna, ordenPor: undefined })),
    filtros: [],
    ordenables: [],
    busqueda: false
  }
}

/** Que ofrece la pestaña Hitos segun de que contrato bajen los datos. */
export interface PestaniaDeHitos {
  definicion: DefinicionRecurso<HitoDetallado>
  /**
   * Si el sujeto tiene el kanban de Hitos.
   *
   * `false` para el contacto: `GET /portal/projects/{id}/milestones` no atiende `?vista=tablero`,
   * asi que ofrecer el alternador seria mandar al cliente a un error. La tabla la tiene igual.
   */
  conTablero: boolean
}

/**
 * Elige la definicion de Hitos que corresponde al sujeto.
 *
 * **Es la unica lectura de `sujeto`** de esta pestaña, y vive en la capa de definiciones a proposito:
 * que columnas, que filtros y que lecturas existen es propiedad del contrato, no del dibujo. El panel
 * no pregunta de que sujeto es; recibe esto y pinta.
 *
 * @param fuente De donde bajan los datos del Proyecto.
 * @param proyectoId El Proyecto que se esta mirando.
 * @returns La definicion y las lecturas que ese contrato ofrece.
 */
export function definicionDeHitos (fuente: FuenteDeProyecto, proyectoId: number): PestaniaDeHitos {
  return fuente.sujeto === 'portal'
    ? { definicion: hitosDelContacto(proyectoId), conTablero: false }
    : { definicion: hitosDelEspacio(proyectoId), conTablero: true }
}
