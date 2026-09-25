import type {
  AccionMasiva,
  AprobacionProceso,
  BloqueoProceso,
  DefinicionCampoPersonalizado,
  EstadoSla,
  Etiqueta,
  JustificacionDesviacion,
  ProcesoAmpliado,
  Referencia,
  ValorCampoPersonalizado
} from '@/datos/recursos'
import type { Capacidad, StaffReferencia } from '@/datos/tipos'
import type { AsignadoConAutoria } from '@/dominio/autoria-tarea'
import type { ComentarioParaMostrar } from './TarjetaDeComentario.tsx'
import { estadoVencimiento } from '../../lib/fechas.ts'
import { textoDeComentario } from './discusiones.ts'

/**
 * Logica de la pestaña de Tareas que no necesita React.
 *
 * Vive en un `.ts` para poder probarse con el runner de Node, que despoja tipos pero no JSX. Todo lo
 * que decida *que* se muestra —columnas de campos personalizados, filas vencidas, que accion masiva
 * se ofrece— se prueba desde aca.
 */

/** El estado "Completo" de Perfex. Es una constante del codigo del panel, no una fila de tabla. */
export const ESTADO_COMPLETO = 5

/**
 * Alterna completados y elimina condiciones de estado incompatibles.
 * @param params Consulta vigente; no se modifica.
 * @returns Consulta nueva, conservando búsqueda y filtros ajenos al estado, sin paginación.
 */
export function alternarCompletados (params: URLSearchParams): URLSearchParams {
  const activo = params.get('filter[status]') === String(ESTADO_COMPLETO)
  const siguientes = new URLSearchParams(params)
  for (const clave of [...siguientes.keys()]) {
    if (/^filter\[(?:status|completed)(?:__[^\]]+)?\]$/.test(clave)) siguientes.delete(clave)
  }
  if (!activo) siguientes.set('filter[status]', String(ESTADO_COMPLETO))
  siguientes.delete('page')
  return siguientes
}

/**
 * Una tarea vencida que todavia no esta completa.
 *
 * Es lo que el panel viejo pinta con `row-border-danger`. La comparacion por dia calendario ya vive
 * en `estadoVencimiento`: repetirla aca daria dos reglas que se pueden contradecir.
 *
 * @param proceso la tarea
 * @param hoy dia de referencia; entra por parametro para que la regla se pueda probar
 * @returns `true` si hay que marcar la fila
 */
export function estaVencida (proceso: { due_date: string | null, status: number }, hoy: Date = new Date()): boolean {
  if (proceso.status === ESTADO_COMPLETO) return false

  return estadoVencimiento(proceso.due_date, hoy) === 'vencido'
}

/**
 * Los campos personalizados que se convierten en columnas de la tabla.
 *
 * Solo los que tienen `show_on_table`: las tareas tienen mas campos de los que entran en una fila, y
 * es exactamente el criterio del panel viejo. Se ordenan por `order` y, a igualdad, por nombre, para
 * que el orden no dependa de como los devolvio la base.
 *
 * @param definiciones lo que devuelve `GET /custom-fields?para=tasks`
 * @returns las definiciones que son columna, ya ordenadas
 */
export function camposDeTabla (definiciones: DefinicionCampoPersonalizado[]): DefinicionCampoPersonalizado[] {
  return definiciones
    .filter((campo) => campo.show_on_table)
    .sort((a, b) => a.order - b.order || a.name.localeCompare(b.name))
}

/**
 * Texto de un campo personalizado en una fila.
 *
 * Un `multiselect` llega como lista y hay que unirla; un campo sin valor da cadena vacia, que la
 * celda pinta como un guion.
 *
 * @param proceso la fila
 * @param slug el campo buscado
 * @returns el valor listo para mostrar, o cadena vacia si no hay
 */
export function valorDeCampo (proceso: ProcesoAmpliado, slug: string): string {
  const campo: ValorCampoPersonalizado | undefined = proceso.custom_fields?.find((c) => c.slug === slug)

  if (campo === undefined || campo.value === null) return ''

  return Array.isArray(campo.value) ? campo.value.join(', ') : campo.value
}

/** Como se pide el valor de una accion masiva. Decide que control dibuja el dialogo. */
export type ControlAccionMasiva = 'estado' | 'prioridad' | 'personas' | 'proyecto' | 'hito' | 'fecha' | 'booleano' | 'etiquetas' | 'ninguno'

export interface AccionMasivaDescrita {
  clave: AccionMasiva
  etiqueta: string
  control: ControlAccionMasiva
  /** Capacidad del area `tasks` que hace falta. Ocultar no autoriza: el backend vuelve a decidir. */
  requiere: Capacidad
  peligrosa?: boolean
}

/**
 * Las acciones masivas del panel viejo, en su orden.
 *
 * `delete` pide `delete tasks`; el resto pide `edit tasks`. `status` ademas se aplica fila por fila
 * del lado del backend —solo si sos creador, asignado o admin— y las que se saltea vuelven en
 * `meta.omitidos`: por eso el frontend no las filtra de antemano.
 */
export const ACCIONES_MASIVAS: AccionMasivaDescrita[] = [
  { clave: 'status', etiqueta: 'Cambiar estado', control: 'estado', requiere: 'edit' },
  { clave: 'priority', etiqueta: 'Cambiar prioridad', control: 'prioridad', requiere: 'edit' },
  { clave: 'assignees', etiqueta: 'Agregar asignados', control: 'personas', requiere: 'edit' },
  { clave: 'due_date', etiqueta: 'Cambiar fecha de entrega', control: 'fecha', requiere: 'edit' },
  { clave: 'project', etiqueta: 'Agregar a proyecto', control: 'proyecto', requiere: 'edit' },
  { clave: 'milestone', etiqueta: 'Mover a un hito', control: 'hito', requiere: 'edit' },
  { clave: 'billable', etiqueta: 'Marcar facturable', control: 'booleano', requiere: 'edit' },
  { clave: 'tags', etiqueta: 'Agregar etiquetas', control: 'etiquetas', requiere: 'edit' },
  { clave: 'delete', etiqueta: 'Eliminar', control: 'ninguno', requiere: 'delete', peligrosa: true }
]

/**
 * Las acciones masivas que la persona puede ejecutar.
 *
 * @param capacidades `permissions.tasks` de `/me`
 * @returns las acciones visibles, en el orden declarado
 */
export function accionesMasivasPermitidas (capacidades: Capacidad[]): AccionMasivaDescrita[] {
  return ACCIONES_MASIVAS.filter((accion) => capacidades.includes(accion.requiere))
}

/**
 * Lo que el control de fecha guarda para decir "sacale la fecha de entrega".
 *
 * Hace falta un valor propio porque el dialogo tiene TRES estados y no dos: nada elegido todavia
 * (`''`), una fecha, y borrar la que haya. Sin este centinela los dos ultimos se escribirian igual
 * —cadena vacia— y "sacar la fecha" quedaria indistinguible de "no elegi nada", que es justo el
 * caso que el dialogo frena.
 */
export const SIN_FECHA = 'sin-fecha'

/**
 * Convierte lo elegido en el dialogo al `valor` que espera `POST /tasks/bulk`.
 *
 * @param control el tipo de control que se uso
 * @param crudo lo que quedo seleccionado o escrito
 * @returns el valor tipado, o `null` si todavia no hay nada que mandar
 */
export function valorDeAccionMasiva (
  control: ControlAccionMasiva,
  crudo: string
): number | boolean | string | string[] | number[] | null {
  if (control === 'ninguno') return null

  if (control === 'etiquetas') {
    const etiquetas = crudo.split(',').map((t) => t.trim()).filter((t) => t !== '')

    return etiquetas.length > 0 ? etiquetas : null
  }

  if (control === 'personas') {
    const ids = crudo.split(',').map((n) => Number(n.trim())).filter((n) => Number.isInteger(n) && n > 0)

    return ids.length > 0 ? ids : null
  }

  if (control === 'fecha') {
    if (crudo === SIN_FECHA) return SIN_FECHA

    // `YYYY-MM-DD` y nada mas: es lo unico que el backend acepta, y mandarle lo que escriba el
    // navegador con otro locale es como se guardan fechas con el mes y el dia cambiados.
    return /^\d{4}-\d{2}-\d{2}$/.test(crudo) ? crudo : null
  }

  if (control === 'booleano') return crudo === 'si'

  const numero = Number(crudo)

  return Number.isInteger(numero) && numero > 0 ? numero : null
}

/** El cuerpo de `POST /tasks/bulk`. `valor` ausente = la accion no lleva valor (`delete`). */
export interface CuerpoAccionMasiva {
  ids: number[]
  accion: AccionMasiva
  valor?: number | boolean | string | string[] | number[] | null
}

/**
 * El cuerpo de `POST /tasks/bulk`, o `null` si todavia falta elegir el valor.
 *
 * Vive aca y no dentro del dialogo porque es la unica parte de la accion masiva que se puede
 * equivocar en silencio: mandar `{}` donde iba `valor: null` no falla, simplemente no borra la
 * fecha, y eso desde el JSX no se ve.
 *
 * **`valor: null` se manda explicito.** Es la diferencia entre "sacale la fecha" y "no toques la
 * fecha", y la clave omitida dice la segunda.
 *
 * @param accion   la accion elegida en el menu
 * @param valor    lo que quedo en el control, en la cadena que usa el dialogo
 * @param destinos los Espacios elegidos, solo para la accion `project`
 * @param ids      las tareas seleccionadas
 * @returns el cuerpo listo para `JSON.stringify`, o `null` si falta elegir
 */
export function cuerpoDeAccionMasiva (
  accion: AccionMasivaDescrita,
  valor: string,
  destinos: number[],
  ids: number[]
): CuerpoAccionMasiva | null {
  if (accion.control === 'ninguno') return { ids, accion: accion.clave }

  if (accion.control === 'proyecto') {
    return destinos.length === 0 ? null : { ids, accion: accion.clave, valor: destinos }
  }

  const tipado = valorDeAccionMasiva(accion.control, valor)

  if (tipado === null) return null

  return {
    ids,
    accion: accion.clave,
    valor: tipado === SIN_FECHA ? null : tipado
  }
}

/**
 * Un Proceso **como lo dibuja su ficha**, no como lo devuelve un contrato.
 *
 * La ficha de una Tarea es una sola y la abren los dos sujetos: el equipo por `GET /tasks/{id}` y el
 * cliente por `GET /portal/projects/{id}/tasks/{tareaId}`, que manda bastante menos. Si la ficha
 * declarara `Proceso` —el tipo del panel— cada campo que el cliente no recibe seria un `undefined`
 * que el tipo jura que existe, y la unica forma de dibujarla sin romperse volveria a ser una rama
 * por sujeto adentro.
 *
 * Asi que se declara **lo minimo**: requerido lo que los dos contratos mandan siempre, opcional todo
 * lo demas. Y la regla de dibujo es una sola: **la clave ausente no se dibuja**. `undefined` no es
 * "vacio" sino "no corresponde" —el equipo decidio no compartir los comentarios de este proyecto, o
 * el sujeto no tiene asignados—, y una seccion vacia con su titulo diria algo que no es.
 *
 * Los cuatro bloques del final solo llegan en el portal, y cada uno segun su flag por proyecto
 * (`view_task_comments`, `view_task_checklist_items`, `view_task_attachments`,
 * `view_task_total_logged_time`). En el panel esos mismos datos se piden aparte, porque alli se
 * escriben y cada lista se recarga sola.
 */
export interface ProcesoDeFicha {
  id: number
  patente: string | null
  name: string
  status: number
  priority: number
  start_date: string | null
  due_date: string | null
  date_finished: string | null
  /**
   * HTML del editor viejo. Nunca se inyecta: se muestra como texto plano.
   *
   * `null` es una Tarea sin describir, que es distinto de la clave ausente: el contrato del panel la
   * manda solo con `include=description` o en la ficha, y el del portal siempre.
   */
  description?: string | null
  project?: Referencia | null
  milestone?: Referencia | null
  /**
   * El Proyecto del que se importó, como texto guardado al importar: el origen suele borrarse
   * despues, asi que no es un enlace. `null` si no se importó. No llega al portal.
   */
  imported_from?: { project_id: number, project_name: string } | null
  /** Cada asignado trae quién lo asignó. En el portal solo llegan id, nombre y foto. */
  assignees?: AsignadoConAutoria[]
  /** Quién creó la Tarea. No llega al portal. */
  created_by?: StaffReferencia | null
  tags?: Etiqueta[]
  counts?: ProcesoAmpliado['counts']
  custom_fields?: ValorCampoPersonalizado[]
  approval?: AprobacionProceso
  /** Por que no avanza. No llega al portal: el motivo es interno. */
  bloqueo?: BloqueoProceso
  /** Lo que alega el EQUIPO sobre la desviacion. No llega al portal: es registro interno. */
  justificacion?: JustificacionDesviacion
  eta?: string | null
  desviacion_dias?: number | null
  estado_sla?: EstadoSla | null
  /**
   * Dia de la entrega efectiva, contra el que la API mide la desviacion. No llega al portal: es una
   * medicion interna, igual que las tres de arriba.
   */
  entregado_en?: string | null
  /** Solo en el portal, y solo con `view_task_comments`. */
  comments?: ComentarioDeFicha[]
  /** Solo en el portal, y solo con `view_task_checklist_items`. */
  checklist?: Array<{ id: number, description: string, finished: boolean }>
  /** Solo en el portal, y solo con `view_task_attachments`. */
  attachments?: Array<{ id: number, file_name: string, subject?: string | null, url: string | null }>
  /** Solo en el portal, y solo con `view_task_total_logged_time`. Mismas claves que el listado. */
  total_logged_seconds?: number
  duration_hm?: string
}

/**
 * Un comentario de la ficha, **tal como lo emite la API** en los dos contratos.
 *
 * `staff` y `contact` en vez de un unico `author`: asi lo manda `GET /tasks/{id}/comments` desde
 * siempre y asi lo manda tambien la ficha del portal. Es la misma forma para los dos sujetos, que es
 * lo que permite que la ficha sea UN dibujo: inventar un `author` resuelto solo para el cliente
 * seria la rama por sujeto que el modulo evita en todos lados.
 *
 * Quien firma es exactamente uno de los dos, y cual de los dos es el dato: un comentario con
 * `contact` y sin `staff` lo escribio el propio cliente. `DetalleTarea` lo traduce a la forma que
 * pinta `TarjetaDeComentario`, que es donde ese `es_cliente` se vuelve una insignia.
 *
 * El adjunto del comentario no viaja: la API no lo sirve por ninguna ruta todavia.
 */
export interface ComentarioDeFicha {
  id: number
  content: string
  date_added: string | null
  staff: { id: number, full_name: string } | null
  contact: { id: number, full_name: string } | null
}

/**
 * Un comentario de la API, en la forma que pinta `TarjetaDeComentario`.
 *
 * La API firma cada comentario con `staff` **o** con `contact`, nunca con los dos, y cual de los dos
 * viene ES el dato: sin `staff`, lo escribio el propio cliente, y eso es lo que la tarjeta convierte
 * en la insignia "Cliente". Con los dos en `null` el autor se perdio —un colaborador dado de baja,
 * por ejemplo— y la tarjeta ya sabe dibujar eso.
 *
 * La traduccion vive aca y no en la tarjeta para que la tarjeta no dependa de la forma de un
 * contrato en particular. Y no vive en la API porque `staff`/`contact` es la forma que el panel recibe
 * desde siempre: cambiarla solo para el portal seria una segunda forma del mismo comentario, que es
 * el `if (esPortal)` que este modulo evita en todos lados.
 *
 * @param comentario el comentario tal como llega del contrato, en cualquiera de los dos sujetos
 * El contenido sale como texto legible y sin la marca de adjunto de Perfex (`textoDeComentario`).
 *
 * @returns lo que la tarjeta necesita para pintarse
 */
export function comentarioParaMostrar (comentario: ComentarioDeFicha): ComentarioParaMostrar {
  const autor = comentario.staff ?? comentario.contact
  // El `content` es HTML del editor de Perfex: pintado tal cual, la tarjeta mostraba las etiquetas.
  const { texto, conAdjunto } = textoDeComentario(comentario.content)

  return {
    content: texto,
    con_adjunto: conAdjunto,
    created: comentario.date_added,
    author: autor === null
      ? null
      : { full_name: autor.full_name, es_cliente: comentario.staff === null },
    // El adjunto del comentario no viaja en ninguno de los dos contratos: la API no lo sirve por
    // ninguna ruta todavia.
    file: null
  }
}
