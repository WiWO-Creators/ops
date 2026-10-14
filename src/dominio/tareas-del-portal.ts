import type { AltaDeTareas } from '../datos/portal.ts'
import { aFechaDelContrato } from '../lib/fechas.ts'
import { GLOSARIO } from './glosario.ts'
import { CAMPO_DE_ADJUNTOS_DE_TICKET } from './ticket-adjuntos.ts'
import { htmlVacio, textoPlano } from './texto-rico.ts'

/**
 * Alta de una Tarea desde el portal del cliente.
 *
 * Vive fuera del formulario porque es una decision y no un dibujo: cuando el boton de crear se puede
 * pulsar, que se manda y que se le dice a la persona cuando la API rechaza. La API decide siempre
 * (flag del cliente, pertenencia al equipo, tope por hora); lo de aca es la cortesia de avisar antes
 * del viaje y de traducir el `422` al campo que lo causo, para que el cliente corrija sin releer
 * todo el formulario.
 */

/** Tope de `description` en caracteres visibles (`TareaDelPortal::LARGO_MAXIMO_DESCRIPCION`). */
export const LARGO_DESCRIPCION_TAREA = 20000

/** Tope de `name` en el contrato de la API. Se corta antes para no ganarse un `422` evitable. */
export const LARGO_NOMBRE_TAREA = 191

/**
 * Centinela de «sin prioridad».
 *
 * Radix no admite un `value` vacio en una opcion, asi que «no elegi ninguna» necesita un valor
 * propio. Nunca sale de aca: {@link cuerpoDeTarea} lo traduce a omitir la clave.
 */
export const SIN_PRIORIDAD = 'ninguna'

/** Las cuatro prioridades que acepta `priority`, con el nombre que lee el cliente. */
export const PRIORIDADES_DE_TAREA: ReadonlyArray<{ id: number, etiqueta: string }> = [
  { id: 1, etiqueta: 'Baja' },
  { id: 2, etiqueta: 'Media' },
  { id: 3, etiqueta: 'Alta' },
  { id: 4, etiqueta: 'Urgente' }
]

/** Lo que el formulario tiene en la mano cuando la persona pulsa «Crear». */
export interface BorradorDeTarea {
  nombre: string
  /**
   * HTML del editor de texto enriquecido (con las imagenes propias que subio), o cadena vacia si no
   * hay nada visible. Viaja con `format: "html"`.
   */
  descripcion: string
  /** `YYYY-MM-DD`; a medio escribir contiene el texto crudo, que no pasa el formato. */
  vencimiento: string
  /** El valor del selector de prioridad, o {@link SIN_PRIORIDAD}. */
  prioridad: string
  asignados: number[]
}

/** Cuerpo de `POST /portal/projects/{id}/tasks`, con los nombres del contrato. */
export interface CuerpoDeTarea {
  name: string
  description?: string
  /** `html` cuando `description` viene del editor. Sin descripcion no viaja. */
  format?: 'html'
  due_date?: string
  priority?: number
  assignees?: number[]
}

/** Los campos del formulario que pueden llevar un error al lado. */
export type CampoDeTarea = 'name' | 'description' | 'due_date' | 'priority' | 'assignees'

/** Mensaje por campo, para pintarlo junto al control que lo causo. */
export type ErroresDeTarea = Partial<Record<CampoDeTarea, string>>

/** Un formulario recien abierto. */
export const BORRADOR_VACIO_DE_TAREA: BorradorDeTarea = {
  nombre: '',
  descripcion: '',
  vencimiento: '',
  prioridad: SIN_PRIORIDAD,
  asignados: []
}

const TAREA = GLOSARIO.proceso.singular.toLowerCase()
const PROYECTO = GLOSARIO.espacio.singular.toLowerCase()

/** Frase de cada motivo de `422` que el alta del portal puede devolver. */
const MOTIVOS: Record<string, string> = {
  requerido: 'Este dato es obligatorio.',
  requerido_por_cliente: `Tu empresa exige fecha de vencimiento en cada ${TAREA}.`,
  formato_invalido: 'La fecha no es válida.',
  anterior_al_inicio: 'No puede ser anterior a hoy.',
  no_es_del_equipo: `Solo puedes asignar a quienes integran este ${PROYECTO}.`,
  no_editable: 'Este dato no se puede enviar desde el portal.',
  no_valido: 'El valor no es válido.',
  demasiado_largo: 'Es demasiado largo.',
  length: 'Es demasiado largo.',
  debe_ser_lista: 'El valor no es válido.',
  no_existe: 'El valor no es válido.',
  invalid: 'El valor no es válido o es demasiado largo.',
  too_large: 'Es demasiado grande.',
  max_files: 'Hay demasiados archivos.',
  extension_not_allowed: 'Ese tipo de archivo no está permitido.',
  content_mismatch: 'El contenido del archivo no corresponde a su extensión.',
  empty: 'El archivo está vacío.',
  upload_failed: 'No se pudo subir el archivo.'
}

/** Campos del formulario que entienden el `details` de la API. */
const CAMPOS: ReadonlySet<string> = new Set<CampoDeTarea>(['name', 'description', 'due_date', 'priority', 'assignees'])

/**
 * Si la fecha escrita es una fecha real `YYYY-MM-DD`.
 *
 * @param texto lo que hay en el campo
 * @returns `true` si existe en el calendario
 */
function fechaValida (texto: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(texto) && aFechaDelContrato(
    `${texto.slice(8, 10)}/${texto.slice(5, 7)}/${texto.slice(0, 4)}`
  ) === texto
}

/**
 * Los errores que se pueden detectar sin viajar.
 *
 * Solo lo que el formulario sabe con certeza: nombre vacio o pasado de largo, fecha ausente cuando el
 * Proyecto la exige y fecha que no existe. Lo demas —tope por hora, asignado que dejo de ser del
 * equipo— lo dice la API.
 *
 * @param borrador lo tipeado hasta ahora
 * @param alta la capacidad del Proyecto (`alta_de_tareas`)
 * @returns un mensaje por campo con problema; vacio si se puede enviar
 */
export function erroresDeBorrador (borrador: BorradorDeTarea, alta: AltaDeTareas): ErroresDeTarea {
  const errores: ErroresDeTarea = {}
  const nombre = borrador.nombre.trim()
  const vencimiento = borrador.vencimiento.trim()

  if (textoPlano(borrador.descripcion).length > LARGO_DESCRIPCION_TAREA) {
    errores.description = `La descripción admite hasta ${LARGO_DESCRIPCION_TAREA.toLocaleString('es-CL')} caracteres.`
  }

  if (nombre === '') errores.name = `Escribe un nombre para la ${TAREA}.`
  else if (nombre.length > LARGO_NOMBRE_TAREA) errores.name = `El nombre admite hasta ${LARGO_NOMBRE_TAREA} caracteres.`

  if (vencimiento === '') {
    if (alta.vencimiento_requerido) errores.due_date = MOTIVOS.requerido_por_cliente
  } else if (!fechaValida(vencimiento)) {
    errores.due_date = 'Escribe la fecha como día/mes/año, por ejemplo 31/12/2026.'
  }

  return errores
}

/**
 * Si el borrador alcanza para enviarse.
 *
 * @param borrador lo tipeado hasta ahora
 * @param alta la capacidad del Proyecto
 * @returns `true` si no hay ningun error detectable de antemano
 */
export function tareaCompleta (borrador: BorradorDeTarea, alta: AltaDeTareas): boolean {
  return Object.keys(erroresDeBorrador(borrador, alta)).length === 0
}

/**
 * Traduce el borrador al cuerpo que espera la API.
 *
 * Las claves vacias **no viajan**: la API rechaza lo que no conoce, y un `assignees: []` o un
 * `priority` en cero seria ruido o un `422`. Los asignados se cruzan con la lista que ofrecio el
 * Proyecto, asi un id que dejo de estar disponible mientras el formulario seguia abierto no sale.
 *
 * Solo se llama con un borrador que {@link tareaCompleta} aprobo.
 *
 * @param borrador lo tipeado
 * @param alta la capacidad del Proyecto, que dice a quienes se puede asignar
 * @returns el cuerpo listo para el `POST`
 */
export function cuerpoDeTarea (borrador: BorradorDeTarea, alta: AltaDeTareas): CuerpoDeTarea {
  const cuerpo: CuerpoDeTarea = { name: borrador.nombre.trim() }
  const vencimiento = borrador.vencimiento.trim()
  const disponibles = new Set(alta.asignables.map((persona) => persona.id))
  const asignados = borrador.asignados.filter((id) => disponibles.has(id))

  if (!htmlVacio(borrador.descripcion)) {
    cuerpo.description = borrador.descripcion
    cuerpo.format = 'html'
  }
  if (vencimiento !== '') cuerpo.due_date = vencimiento
  if (borrador.prioridad !== SIN_PRIORIDAD) cuerpo.priority = Number(borrador.prioridad)
  if (asignados.length > 0) cuerpo.assignees = asignados

  return cuerpo
}

/**
 * El cuerpo del alta con sus archivos, si los hay.
 *
 * Sin archivos devuelve el cuerpo tal cual y viaja como JSON. Con archivos arma el
 * `multipart/form-data` que lee la API: el cuerpo ENTERO serializado en el campo `payload` —lleva un
 * arreglo, `assignees`, que un formulario aplanaria a texto— y los archivos en `attachments[]`. El
 * navegador pone el `content-type` con su boundary.
 *
 * @param cuerpo lo que devolvio {@link cuerpoDeTarea}
 * @param archivos lo que se eligio; `[]` para no mandar nada
 * @returns el mismo `cuerpo`, o un `FormData` si hay archivos
 */
export function cuerpoDeTareaConArchivos (cuerpo: CuerpoDeTarea, archivos: readonly File[]): CuerpoDeTarea | FormData {
  if (archivos.length === 0) return cuerpo

  const formulario = new FormData()

  formulario.append('payload', JSON.stringify(cuerpo))

  for (const archivo of archivos) formulario.append(CAMPO_DE_ADJUNTOS_DE_TICKET, archivo, archivo.name)

  return formulario
}

/**
 * Los errores por campo de un `422`, ya en palabras.
 *
 * Acepta el `details` del sobre de error (`{ campo: [motivo] }`) y tambien un `{ errors: {...} }`
 * por si el contrato lo anida. Una clave que el formulario no dibuja se ignora: el mensaje general
 * ya la nombra. Un motivo sin frase propia se dice generico en vez de mostrar el codigo pelado.
 *
 * @param detalles los `details` del error de la API
 * @returns un mensaje por campo del formulario
 */
export function erroresDeLaApi (detalles: Record<string, unknown> | undefined): ErroresDeTarea {
  const origen = detalles?.errors !== null && typeof detalles?.errors === 'object'
    ? detalles.errors as Record<string, unknown>
    : detalles ?? {}
  const errores: ErroresDeTarea = {}

  for (const [campo, motivos] of Object.entries(origen)) {
    if (!CAMPOS.has(campo) || !Array.isArray(motivos)) continue

    const primero = motivos.find((motivo): motivo is string => typeof motivo === 'string')

    if (primero !== undefined) errores[campo as CampoDeTarea] = MOTIVOS[primero] ?? MOTIVOS.no_valido
  }

  return errores
}

/** Un rechazo de la API, con lo que `escribirEnBff` deja ver de el. */
export interface RechazoDeAltaDeTarea {
  mensaje: string
  estado?: number
  detalles?: Record<string, unknown>
  reintentarEnSegundos?: number | null
}

/** El rechazo explicado: un texto general, los campos con error y cuanto esperar si es un tope. */
export interface FalloDeAltaDeTarea {
  /** Va dentro del dialogo; `null` cuando los errores por campo ya lo dicen todo. */
  texto: string | null
  campos: ErroresDeTarea
  /** Segundos hasta poder reintentar, en un `429`. */
  esperarSegundos: number | null
}

/**
 * Explica un rechazo del alta segun su codigo de estado.
 *
 * El `404` no distingue «la funcion se apago» de «el Proyecto ya no es tuyo» —la API no lo confirma—,
 * asi que el texto tampoco: dice que ya no se puede crear alli. El `429` dice cuanto esperar.
 *
 * @param rechazo lo que devolvio `escribirEnBff`
 * @returns el texto, los campos con error y la espera
 */
export function falloDeAltaDeTarea (rechazo: RechazoDeAltaDeTarea): FalloDeAltaDeTarea {
  const sinEspera = (texto: string | null, campos: ErroresDeTarea = {}): FalloDeAltaDeTarea =>
    ({ texto, campos, esperarSegundos: null })

  switch (rechazo.estado) {
    case 404:
      return sinEspera(`Ya no puedes crear ${GLOSARIO.proceso.plural.toLowerCase()} en este ${PROYECTO}. Recarga la página para ver qué cambió.`)
    case 403:
      return sinEspera(`Este ${PROYECTO} no comparte sus ${GLOSARIO.proceso.plural.toLowerCase()} contigo.`)
    case 429: {
      const segundos = rechazo.reintentarEnSegundos ?? null

      return { texto: textoDeTope(segundos), campos: {}, esperarSegundos: segundos }
    }
    case 422: {
      const campos = erroresDeLaApi(rechazo.detalles)

      return sinEspera(Object.keys(campos).length > 0 ? null : rechazo.mensaje, campos)
    }
    default:
      return sinEspera(rechazo.mensaje)
  }
}

/**
 * El aviso de un `429`, con la espera en palabras.
 *
 * @param segundos cuanto falta, si la API lo dijo
 * @returns la frase para la persona
 */
function textoDeTope (segundos: number | null): string {
  const que = `Creaste muchas ${GLOSARIO.proceso.plural.toLowerCase()} seguidas.`

  if (segundos === null || segundos <= 0) return `${que} Espera un rato antes de volver a intentarlo.`

  const minutos = Math.ceil(segundos / 60)

  return `${que} Podrás volver a intentarlo en ${minutos === 1 ? '1 minuto' : `${minutos} minutos`}.`
}
