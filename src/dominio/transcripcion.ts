/**
 * "Solo transcribir": la mitad del Meeting Paper que no escribe un acta.
 *
 * Es el mismo material de entrada que `AsistenteDeActa` —un audio, grabado o subido— pero el destino
 * es otro: acá el modelo solo transcribe, sin redactar nada, y el resultado se guarda 24 horas y se
 * borra solo. De ahí sale el "Crear Meeting Paper con esto", que reusa el flujo de generación de acta
 * pasándole `transcripcion_id` en vez de un archivo nuevo.
 *
 * Sin React ni `fetch`: son funciones puras y el parseo de un frame SSE, para que
 * `pruebas/transcripcion.test.js` las recorra sin navegador. El parser de frames se repite en
 * miniatura respecto de `dominio/ia.ts` — event:/data: — porque ese archivo no lo exporta y el
 * contrato de este endpoint (`transcripcion` dentro de `fin`, sin `citas` ni `propuesta`) es distinto
 * al del resto de la capa de IA.
 */

import { MIME_AUDIO, LIMITE_AUDIO_BYTES, extensionDe, formatoPeso, reloj } from './actas.ts'
import { leerPaso, esObjeto, type PasoIA } from './ia.ts'

/** Los cuatro idiomas que acepta el endpoint. `auto` deja que el modelo lo detecte. */
export type IdiomaTranscripcion = 'es' | 'en' | 'pt' | 'auto'

/** Las opciones del selector, en el orden en que se muestran. */
export const IDIOMAS_TRANSCRIPCION: ReadonlyArray<{ valor: IdiomaTranscripcion, etiqueta: string }> = [
  { valor: 'es', etiqueta: 'Español' },
  { valor: 'en', etiqueta: 'Inglés' },
  { valor: 'pt', etiqueta: 'Portugués' },
  { valor: 'auto', etiqueta: 'Detectar automáticamente' }
]

/** Con qué arranca el selector: la mayoría de las reuniones de este equipo son en español. */
export const IDIOMA_POR_DEFECTO: IdiomaTranscripcion = 'es'

/** Un tramo de la transcripción, en segundos desde el inicio del audio. */
export interface SegmentoTranscripcion {
  inicio: number
  fin: number
  texto: string
}

/** Una transcripción guardada, tal como la devuelve la API. */
export interface Transcripcion {
  id: number
  project_id: number
  idioma: string
  texto: string
  /** Puede venir vacío: ahí solo se puede mostrar el texto corrido. */
  segmentos: SegmentoTranscripcion[]
  duracion_segundos: number | null
  creado_en: string
  /** ISO-8601. Pasado ese instante, la fila ya no existe del lado del servidor. */
  expira_en: string
}

/**
 * La forma resumida de una transcripción, la que devuelve `GET /projects/{id}/transcripciones`
 * (la lista). Nunca trae el texto completo ni los segmentos -el backend los deja fuera a propósito
 * para no mandar el contenido de todas las transcripciones vigentes de una vez-, solo un extracto y
 * su largo. El detalle completo (`Transcripcion`, con `texto` y `segmentos`) sale de
 * `GET /projects/{id}/transcripciones/{tid}`.
 */
export interface ResumenTranscripcion {
  id: number
  project_id: number
  idioma: string
  /** Los primeros ~200 caracteres del texto, para mostrar en la lista. */
  extracto: string
  /** Largo total del texto completo, no del extracto. */
  caracteres: number
  duracion_segundos: number | null
  creado_en: string
  /** ISO-8601. Pasado ese instante, la fila ya no existe del lado del servidor. */
  expira_en: string
}

/** Un frame del stream de transcripción, ya interpretado. */
export type EventoTranscripcion =
  | { tipo: 'paso', paso: PasoIA }
  | { tipo: 'error', codigo: string, mensaje: string }
  | { tipo: 'fin', transcripcion: Transcripcion }

/**
 * Separa un frame SSE en su nombre de evento y su `data` ya parseado.
 *
 * Réplica en miniatura de la de `dominio/ia.ts`, que no la exporta. Las líneas `:` son comentarios
 * del protocolo (el `: ping`) y se ignoran.
 *
 * @param crudo el frame completo, sin la línea en blanco final
 * @returns el nombre del evento y su payload, o `null` si falta el evento o el JSON no es un objeto
 */
function leerFrame (crudo: string): { nombre: string, datos: Record<string, unknown> } | null {
  let nombre = ''
  const partesDatos: string[] = []

  for (const linea of crudo.split(/\r\n|\r|\n/)) {
    if (linea.startsWith('event:')) nombre = linea.slice('event:'.length).trim()
    else if (linea.startsWith('data:')) partesDatos.push(linea.slice('data:'.length).trim())
  }

  if (nombre === '' || partesDatos.length === 0) return null

  try {
    const datos: unknown = JSON.parse(partesDatos.join('\n'))

    return esObjeto(datos) ? { nombre, datos } : null
  } catch {
    return null
  }
}

/**
 * Valida un segmento suelto del array `segmentos`.
 *
 * @param valor una entrada del array
 * @returns el segmento, o `null` si le falta algo o los tiempos no son números finitos
 */
export function leerSegmento (valor: unknown): SegmentoTranscripcion | null {
  if (!esObjeto(valor)) return null

  const { inicio, fin, texto } = valor

  if (typeof inicio !== 'number' || !Number.isFinite(inicio) || inicio < 0) return null
  if (typeof fin !== 'number' || !Number.isFinite(fin) || fin < 0) return null
  if (typeof texto !== 'string') return null

  return { inicio, fin, texto }
}

/**
 * Valida el array `segmentos`. Un elemento inválido se descarta y los demás sobreviven, igual que
 * las citas de `dominio/ia.ts`.
 *
 * @param valor el campo `segmentos` del payload
 * @returns los segmentos válidos, o `[]` si el campo no es un array o vino vacío
 */
export function leerSegmentos (valor: unknown): SegmentoTranscripcion[] {
  if (!Array.isArray(valor)) return []

  return valor.map(leerSegmento).filter((segmento): segmento is SegmentoTranscripcion => segmento !== null)
}

/**
 * Valida una transcripción completa, venga del evento `fin` o de un `GET` de la lista o el detalle.
 *
 * @param valor el payload a validar
 * @returns la transcripción, o `null` si le falta algo de lo que este panel necesita para mostrarla
 */
export function leerTranscripcion (valor: unknown): Transcripcion | null {
  if (!esObjeto(valor)) return null

  const {
    id, project_id: proyectoId, idioma, texto, segmentos, duracion_segundos: duracion,
    creado_en: creada, expira_en: expira
  } = valor

  if (typeof id !== 'number' || !Number.isFinite(id)) return null
  if (typeof proyectoId !== 'number' || !Number.isFinite(proyectoId)) return null
  if (typeof idioma !== 'string') return null
  if (typeof texto !== 'string') return null
  if (typeof creada !== 'string') return null
  if (typeof expira !== 'string') return null
  if (duracion !== null && typeof duracion !== 'number') return null

  return {
    id,
    project_id: proyectoId,
    idioma,
    texto,
    segmentos: leerSegmentos(segmentos),
    duracion_segundos: duracion ?? null,
    creado_en: creada,
    expira_en: expira
  }
}

/**
 * Interpreta un frame SSE de `POST /ia/proyectos/{id}/transcripcion`.
 *
 * Como el resto de la capa de IA, es un trust boundary: lo que no encaje en una de las tres formas
 * del contrato se descarta en vez de lanzar.
 *
 * @param crudo un frame como lo entrega `datos/sse.ts`
 * @returns el evento tipado, o `null` si el frame es desconocido o está malformado
 */
export function leerEventoTranscripcion (crudo: string): EventoTranscripcion | null {
  const frame = leerFrame(crudo)
  if (frame === null) return null

  const { nombre, datos } = frame

  if (nombre === 'paso') {
    const paso = leerPaso(datos)

    return paso === null ? null : { tipo: 'paso', paso }
  }

  if (nombre === 'error') {
    return typeof datos.code === 'string' && typeof datos.message === 'string'
      ? { tipo: 'error', codigo: datos.code, mensaje: datos.message }
      : null
  }

  if (nombre === 'fin') {
    const transcripcion = leerTranscripcion(datos.transcripcion)

    return transcripcion === null ? null : { tipo: 'fin', transcripcion }
  }

  return null
}

/**
 * Comprueba que el archivo elegido se pueda mandar a transcribir.
 *
 * Solo audio: a diferencia del acta, acá no tiene sentido subir una foto o un documento. Mismo tope
 * que el audio del acta (`LIMITE_AUDIO_BYTES`) porque el backend lo valida igual.
 *
 * @param archivo el archivo elegido
 * @returns el mensaje de error para la persona, o `null` si está bien
 */
export function validarAudioDeTranscripcion (archivo: { name: string, size: number }): string | null {
  if (archivo.size === 0) return 'El archivo está vacío.'
  if (MIME_AUDIO[extensionDe(archivo.name)] === undefined) return 'Solo se aceptan archivos de audio.'

  if (archivo.size > LIMITE_AUDIO_BYTES) {
    return `El archivo pesa ${formatoPeso(archivo.size)} y el máximo son ${formatoPeso(LIMITE_AUDIO_BYTES)}.`
  }

  return null
}

/**
 * El texto de la transcripción, con o sin marca de tiempo por segmento.
 *
 * Sin `segmentos` —el backend puede no traerlos— la única salida posible es el texto corrido, así se
 * pida `conMarcas`: no hay tiempos con los que armar la marca.
 *
 * @param transcripcion la transcripción a mostrar
 * @param conMarcas si se pide una línea por segmento con su tiempo, o el texto corrido
 * @returns el texto listo para mostrar, copiar o descargar
 */
export function textoDeTranscripcion (transcripcion: Transcripcion, conMarcas: boolean): string {
  if (!conMarcas || transcripcion.segmentos.length === 0) return transcripcion.texto

  return transcripcion.segmentos
    .map((segmento) => `[${reloj(segmento.inicio * 1000)}] ${segmento.texto}`)
    .join('\n')
}

/**
 * `true` si la transcripción ya venció, según su propio `expira_en`.
 *
 * @param expiraEn el campo `expira_en` de la transcripción
 * @param ahora el instante contra el que comparar; por defecto el momento real
 */
export function transcripcionVencida (expiraEn: string, ahora: Date = new Date()): boolean {
  const limite = new Date(expiraEn)

  return !Number.isNaN(limite.getTime()) && limite.getTime() <= ahora.getTime()
}

/**
 * `expira_en` en una fecha y hora legibles, para el aviso de privacidad.
 *
 * @param expiraEn el campo `expira_en` de la transcripción; una fecha inválida cae al texto genérico
 * @returns algo como "28/09/2026 15:30", o el aviso genérico si la fecha no se pudo leer
 */
export function formatoDeVencimiento (expiraEn: string): string {
  const fecha = new Date(expiraEn)
  if (Number.isNaN(fecha.getTime())) return 'en 24 horas'

  return fecha.toLocaleString('es-CL', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}

/**
 * Nombre del archivo `.txt` que se descarga.
 *
 * Lleva la fecha delante para que varias descargas de la misma persona se ordenen solas en su carpeta
 * de descargas.
 *
 * @param transcripcion la transcripción a nombrar
 */
export function nombreDeArchivoTranscripcion (transcripcion: Transcripcion): string {
  const fecha = transcripcion.creado_en.slice(0, 10)

  return `transcripcion-${fecha}-${transcripcion.id}.txt`
}

/**
 * El aviso de privacidad, igual antes de grabar/subir y en la pantalla de resultado.
 *
 * Una sola constante y no un texto repetido en dos componentes: si la política de retención cambia,
 * cambia en un solo lugar.
 */
export const AVISO_PRIVACIDAD_TRANSCRIPCION =
  'Por privacidad, esta transcripción se guarda solo 24 horas y luego se borra. Si no la copias o la descargas, su pérdida es tu responsabilidad.'
