import type { DefinicionRecurso } from './tipos.ts'
import type { TareaCalidad } from '../datos/recursos.ts'
import { describirFalta, describirIncoherencias, etiquetaDeTramo } from '../dominio/calidad-tareas.ts'
import { GLOSARIO } from '../dominio/glosario.ts'
import { formatearVencimiento } from '../lib/fechas.ts'
import { SIN_DATO } from '../lib/sla.ts'

/**
 * Definicion del detector de tareas insuficientes (`GET /quality/tasks`).
 *
 * Es la misma tabla de siempre sobre otro recurso: no lista Tareas para trabajarlas sino para
 * encontrar las que estan mal escritas —sin descripcion util, sin responsable o sin fecha— y
 * arreglarlas. Por eso el orden por defecto es `nota` ascendente: **las peores primero**. Una tabla
 * de calidad ordenada por las mejores es una tabla que nadie abre dos veces.
 *
 * Las tres listas de whitelist —`filtros`, `ordenables` e `includes`— son **las del backend** y no
 * una eleccion de diseño: un valor que no este declarado alli devuelve `422` en vez de ignorarse.
 * `includes` esta vacio a proposito: el recurso no tiene relaciones opcionales, asi que cualquier
 * `?include=` falla, que es la regla de todo el contrato.
 *
 * `columnas` no declara `ordenPor` en Tarea, Proyecto, Responsable ni "Qué falta" porque la API solo
 * ordena por `nota`, `due_date` e `id`. Declararlo pintaria una cabecera que al pulsarla responde
 * 422 y deja la tabla en error.
 *
 * Los presentadores devuelven TEXTO y no JSX: alimentan tambien la exportacion a CSV. Las celdas de
 * pantalla —la nota con su tramo, las insignias de lo que falta— viven en
 * `componentes/calidad/celdas-calidad.tsx`, por el mismo motivo que las de Procesos: este archivo es
 * un `.ts` y el runner de Node despoja tipos pero no JSX.
 */
export const CALIDAD_TAREAS: DefinicionRecurso<TareaCalidad> = {
  ruta: 'quality/tasks',
  // El nombre del recurso es el del glosario y no "Calidad de tareas": el motor lo usa para el
  // vacio y el cargando de la tabla, donde corresponde decir "No hay tareas". Como se llama la
  // pestaña lo dice `dominio/vistas-de-auditoria.ts`, que es quien la dibuja.
  titulo: GLOSARIO.proceso,

  columnas: [
    { clave: 'name', encabezado: GLOSARIO.proceso.singular, presentar: (fila) => fila.name },
    // El cliente acompaña al Proyecto en la misma celda: "Casa Matriz" sin saber de quien es no
    // alcanza para decidir a quien reclamarle la descripcion que falta.
    {
      clave: 'project_name',
      encabezado: GLOSARIO.espacio.singular,
      presentar: (fila) => nombreDelEspacio(fila)
    },
    {
      clave: 'assignees',
      encabezado: 'Responsable',
      // Sin asignado va la raya y no una celda vacia: la celda vacia se confunde con un dato que no
      // cargo, y aca la ausencia ES el hallazgo —es uno de los tres ejes que bajan la nota—.
      presentar: (fila) => (
        fila.assignees.length === 0 ? SIN_DATO : fila.assignees.map((persona) => persona.full_name).join(', ')
      )
    },
    {
      clave: 'due_date',
      encabezado: 'Vence',
      ordenPor: 'due_date',
      sinCortar: true,
      // `formatearVencimiento` y no `formatearFecha`: una Tarea puede no tener plazo, y el guion la
      // haria pasar por un dato que falta cuando lo que pasa es que nadie le puso fecha.
      presentar: (fila) => formatearVencimiento(fila.due_date)
    },
    {
      clave: 'nota',
      encabezado: 'Nota',
      ordenPor: 'nota',
      numerica: true,
      // En pantalla la nota va con su tramo en color; este texto es el que baja al CSV, y por eso
      // lleva la palabra: un "55" solo en una planilla no dice de que lado del corte cayo.
      presentar: (fila) => `${fila.nota} · ${etiquetaDeTramo(fila.tramo)}`
    },
    { clave: 'falta', encabezado: 'Qué falta', presentar: (fila) => describirFalta(fila.falta) },
    // Columna aparte de "Qué falta" y no fundida con ella: son dos arreglos distintos. Lo que falta
    // se escribe (una descripción, una fecha); lo que no concuerda se mueve (el estado, la
    // prioridad). Juntarlas daría una sola lista que mezcla dos tandas de trabajo.
    {
      clave: 'incoherencias',
      encabezado: 'No concuerda',
      presentar: (fila) => describirIncoherencias(fila.incoherencias)
    }
  ],

  filtros: [
    // Los dos que contestan "¿que reviso primero?": el tramo agrupa por gravedad y `falta` por el
    // arreglo concreto —una tanda de descripciones se escribe de una sentada, una de fechas no—.
    {
      clave: 'tramo',
      etiqueta: 'Tramo',
      tipo: 'seleccion',
      opciones: [
        { valor: 'insuficiente', etiqueta: etiquetaDeTramo('insuficiente') },
        { valor: 'floja', etiqueta: etiquetaDeTramo('floja') },
        { valor: 'completa', etiqueta: etiquetaDeTramo('completa') }
      ]
    },
    {
      clave: 'falta',
      etiqueta: 'Le falta',
      // `multiple` y no `seleccion`: el backend combina varios valores con OR —"le falta alguna de
      // estas"—, que es la pregunta que se hace de verdad ("mostrame todo lo que esté incompleto").
      // Con AND la respuesta serían solo las Tareas que fallan en los tres ejes a la vez.
      tipo: 'multiple',
      // Los tres valores son los del contrato, sin traducir: lo que viaja es la clave y lo que se
      // lee es la etiqueta.
      // Las etiquetas nombran la AUSENCIA y no el campo: la pastilla del filtro puesto muestra la
      // etiqueta de la opcion, y un chip que dijera "Responsable" se confundiria con el filtro de
      // al lado, que pregunta por una persona concreta.
      opciones: [
        { valor: 'descripcion', etiqueta: 'Sin descripción' },
        { valor: 'asignado', etiqueta: 'Sin responsable' },
        { valor: 'fecha', etiqueta: 'Sin fecha' }
      ]
    },
    {
      clave: 'incoherencia',
      etiqueta: 'No concuerda',
      // `multiple` por el mismo motivo que `falta`: el backend combina los valores con OR.
      tipo: 'multiple',
      opciones: [
        { valor: 'estado', etiqueta: 'Estado' },
        { valor: 'prioridad', etiqueta: 'Prioridad' }
      ]
    },
    // `seleccion` y no `multiple` en los dos: el contrato declara un id, no una lista. Un desplegable
    // de varios mandaria `filter[project_id]=7,9` y el backend lo leeria como un id invalido.
    { clave: 'project_id', etiqueta: GLOSARIO.espacio.singular, tipo: 'seleccion', desdeLookup: 'projects' },
    { clave: 'assignee', etiqueta: 'Responsable', tipo: 'seleccion', desdeLookup: 'staff' },
    // El rango es UN control con DOS parametros, los dos sobre `due_date`. Declararlos sueltos
    // pintaria dos controles de rango y mandaria `filter[date_from]=a,b`, que se lee como `IN`.
    { clave: 'vence', etiqueta: 'Vence entre', tipo: 'rangoFechas', clavesRango: ['date_from', 'date_to'] },
    { clave: 'nota', etiqueta: 'Nota', tipo: 'campo', tipoDato: 'numero' }
  ],

  ordenables: ['nota', 'due_date', 'id'],
  // Ascendente: la nota mas baja arriba. Es la unica pantalla del panel donde el orden por defecto
  // no es el mas reciente, y el motivo es que lo que se busca aca es lo peor, no lo ultimo.
  ordenPorDefecto: 'nota',
  busqueda: true,
  includes: []
}

/**
 * El Proyecto de la Tarea con su cliente entre parentesis, o la raya si no cuelga de ninguno.
 *
 * Una Tarea sin Proyecto es un caso normal —las personales no cuelgan de nada—, no un dato que
 * falta, y por eso no suma a lo que la pantalla marca como problema.
 *
 * @param fila La Tarea del detector.
 * @returns El texto de la celda, listo tambien para el CSV.
 */
function nombreDelEspacio (fila: TareaCalidad): string {
  if (fila.project_name === null || fila.project_name === '') return SIN_DATO
  if (fila.client_name === null || fila.client_name === '') return fila.project_name

  return `${fila.project_name} (${fila.client_name})`
}
