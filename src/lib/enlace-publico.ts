/**
 * Logica pura del enlace publico de una Tarea.
 *
 * Vive en `.ts` y no en el componente porque es lo unico de esta feature que se puede equivocar en
 * silencio: una URL mal armada se copia, se manda por chat y recien falla del otro lado, y un avance
 * inventado convierte "no hay lista de control" en "no se hizo nada".
 */

import type { SeccionEnlacePublico } from '@/datos/recursos'

/** Prefijo de la ruta publica. Un solo lugar que lo sepa: la pagina y el dialogo leen de aca. */
const PREFIJO = '/tarea/'

/** Prefijo de la pantalla de area, por el mismo motivo. */
const PREFIJO_PANTALLA = '/pantalla/'

/** El avance de la ficha publica, ya resuelto para pintar. */
export interface AvancePublico {
  /** 0-100, o `null` cuando no hay nada que medir. `null` no se dibuja como barra en cero. */
  porcentaje: number | null
  /** Linea de apoyo: cuantos items de la lista de control, o por que no hay porcentaje. */
  detalle: string
}

/** La forma del bloque `progress` que devuelve `GET /public/tasks/{token}`. */
interface ProgresoDeApi {
  checklist_total: number
  checklist_done: number
  percent: number | null
}

/**
 * Arma la URL absoluta que el equipo copia y manda.
 *
 * El token se codifica aunque la API lo emita en hexadecimal: el dia que cambie el alfabeto, el
 * enlace no tiene que romperse en silencio. La barra final del origen se recorta para no emitir
 * `https://ops.wiwo.me//tarea/…`, que algunos servidores normalizan y otros responden 404.
 *
 * @param origen origen del sitio (`window.location.origin`), con o sin barra final
 * @param token el token en claro, tal como lo devolvio el `POST`
 * @returns la URL absoluta, o `null` si falta el origen o el token
 */
export function urlDeEnlacePublico (origen: string, token: string): string | null {
  const base = origen.trim().replace(/\/+$/, '')

  if (base === '' || token.trim() === '') return null

  return `${base}${PREFIJO}${encodeURIComponent(token.trim())}`
}

/**
 * Traduce el bloque `progress` de la API a lo que se muestra.
 *
 * `percent` en `null` es informacion, no un cero: significa que la Tarea no tiene lista de control y
 * todavia no esta cerrada, asi que no hay avance medible. Pintar una barra vacia ahi le diria a quien
 * abre el enlace que el trabajo no arranco.
 *
 * @param progreso el bloque `progress` de `GET /public/tasks/{token}`
 * @returns el porcentaje a dibujar (o `null`) y la linea de apoyo
 */
export function avancePublico (progreso: ProgresoDeApi): AvancePublico {
  const { checklist_total: total, checklist_done: hechos, percent } = progreso

  if (total > 0) {
    return {
      porcentaje: percent,
      detalle: `${hechos} de ${total} ${total === 1 ? 'ítem' : 'ítems'} de la lista de control`
    }
  }

  return {
    porcentaje: percent,
    detalle: percent === null ? 'Sin lista de control' : 'Sin lista de control · marcada como terminada'
  }
}

/**
 * Arma la URL de la pantalla de un area, la que se pega en el televisor.
 *
 * Misma logica que `urlDeEnlacePublico()` y otro prefijo. Esta se escribe a mano mas a menudo de lo
 * que se copia: quien la pone esta parado frente a un televisor con un control remoto, asi que la
 * pantalla que la genera tiene que mostrarla entera y legible, no solo ofrecer un boton de copiar.
 *
 * @param origen origen del sitio (`window.location.origin`), con o sin barra final
 * @param token el token en claro, tal como lo devolvio el `POST`
 * @returns la URL absoluta, o `null` si falta el origen o el token
 */
export function urlDePantallaDeArea (origen: string, token: string): string | null {
  const base = origen.trim().replace(/\/+$/, '')

  if (base === '' || token.trim() === '') return null

  return `${base}${PREFIJO_PANTALLA}${encodeURIComponent(token.trim())}`
}

/** Una seccion opcional de la ficha publica, tal como se ofrece en el dialogo de compartir. */
export interface OpcionDeSeccion {
  clave: SeccionEnlacePublico
  etiqueta: string
  /** Que ve quien recibe el enlace si se marca. */
  ayuda: string
  /**
   * `true` cuando la seccion suele llevar texto interno del equipo. No se bloquea: se advierte al
   * marcarla, y nace desmarcada.
   */
  delicada: boolean
}

/**
 * Catalogo de secciones opcionales, en el orden en que las pinta la ficha publica.
 *
 * Tiene que coincidir con `SeccionesEnlacePublico::OPCIONALES` de la API: una clave que no este alla
 * es un 422 al generar el enlace, y la prueba de este archivo lo deja clavado.
 */
export const SECCIONES_ENLACE: readonly OpcionDeSeccion[] = [
  { clave: 'description', etiqueta: 'Descripción', ayuda: 'El texto de la tarea, sin formato.', delicada: false },
  { clave: 'project', etiqueta: 'Proyecto y cliente', ayuda: 'Nombre del Proyecto, del cliente y el hito.', delicada: true },
  { clave: 'assignees', etiqueta: 'Asignados', ayuda: 'Nombre completo de quienes la tienen asignada.', delicada: true },
  { clave: 'tags', etiqueta: 'Etiquetas', ayuda: 'Las etiquetas de la tarea.', delicada: false },
  { clave: 'custom_fields', etiqueta: 'Campos personalizados', ayuda: 'Los que tienen valor, salvo los de uso interno.', delicada: false },
  { clave: 'logged_time', etiqueta: 'Tiempo registrado', ayuda: 'El total de horas, sin el detalle por persona.', delicada: true },
  { clave: 'checklist', etiqueta: 'Lista de control', ayuda: 'Cada ítem con su texto y si está hecho.', delicada: false },
  { clave: 'attachments', etiqueta: 'Archivos', ayuda: 'El nombre de cada adjunto. Sólo los de Drive o Dropbox se pueden abrir.', delicada: false },
  { clave: 'comments', etiqueta: 'Comentarios', ayuda: 'Todos, también los internos del equipo: no hay forma de elegir cuáles.', delicada: true }
]

/** Lo que se ofrece marcado al generar un enlace nuevo: lo util y sin texto interno del equipo. */
export const SECCIONES_POR_DEFECTO: readonly SeccionEnlacePublico[] = ['description', 'checklist']

/**
 * Marca o desmarca una seccion, dejando la lista en el orden del catalogo.
 *
 * El orden importa para comparar: `['comments', 'description']` y `['description', 'comments']` son
 * la misma eleccion, y el boton de "Guardar cambios" no deberia prenderse por un orden distinto.
 *
 * @param actuales la eleccion de hoy
 * @param clave la seccion que se toca
 * @param marcada el estado nuevo de esa seccion
 * @returns la eleccion nueva, sin repetidos y en el orden del catalogo
 */
export function alternarSeccion (
  actuales: readonly SeccionEnlacePublico[],
  clave: SeccionEnlacePublico,
  marcada: boolean
): SeccionEnlacePublico[] {
  const elegidas = new Set(actuales)

  if (marcada) elegidas.add(clave)
  else elegidas.delete(clave)

  return SECCIONES_ENLACE.map((opcion) => opcion.clave).filter((c) => elegidas.has(c))
}

/**
 * Si dos elecciones publican lo mismo, sin importar el orden.
 *
 * @returns `true` si tienen exactamente las mismas secciones
 */
export function mismasSecciones (a: readonly SeccionEnlacePublico[], b: readonly SeccionEnlacePublico[]): boolean {
  const unicasA = new Set(a)
  const unicasB = new Set(b)

  return unicasA.size === unicasB.size && [...unicasA].every((clave) => unicasB.has(clave))
}

/**
 * El total registrado como "3 h 25 min", para la ficha publica.
 *
 * @param segundos el total que manda la API; negativo o no finito se trata como cero
 * @returns el texto a mostrar
 */
export function tiempoLegible (segundos: number): string {
  const total = Number.isFinite(segundos) && segundos > 0 ? Math.floor(segundos / 60) : 0
  const horas = Math.floor(total / 60)
  const minutos = total % 60

  if (horas === 0) return `${minutos} min`

  return minutos === 0 ? `${horas} h` : `${horas} h ${minutos} min`
}
