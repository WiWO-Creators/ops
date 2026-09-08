/**
 * Reglas del Meeting Paper que no dependen de React.
 *
 * Viven acá y no dentro de los componentes porque son exactamente lo que hay que poder probar sin
 * navegador: qué archivo se acepta, con qué tipo viaja y cómo se llama el acta que salió del
 * modelo. `pruebas/actas.test.js` las recorre bajo el runner de Node.
 */

/**
 * Extensión de audio a su tipo MIME.
 *
 * `mp4 -> audio/aac` **no es un error**: iCloud renombra los `.m4a` a `.mp4` al pasar por Windows, y
 * sin esta línea el archivo que la gente graba con el teléfono se rechaza antes de salir del
 * navegador. Está portado tal cual de MeetingMatico, donde el caso ya se había pagado en soporte.
 *
 * Se decide por extensión y no por `file.type` porque `file.type` llega vacío en varios navegadores
 * y sistemas, y un tipo vacío no se puede validar contra nada.
 */
export const MIME_AUDIO: Record<string, string> = {
  m4a: 'audio/aac',
  aac: 'audio/aac',
  mp4: 'audio/aac',
  mp3: 'audio/mp3',
  mpeg: 'audio/mp3',
  mpga: 'audio/mp3',
  wav: 'audio/wav',
  ogg: 'audio/ogg',
  opus: 'audio/ogg',
  flac: 'audio/flac',
  aiff: 'audio/aiff',
  aif: 'audio/aiff',
  webm: 'audio/webm'
}

/** Extensión de imagen a su tipo MIME. `heic`/`heif` es lo que sale de un iPhone sin convertir. */
export const MIME_IMAGEN: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
  heic: 'image/heic',
  heif: 'image/heif'
}

/**
 * Tope de subida, 25 MB.
 *
 * Es más bajo que el de la API (48 MB) a propósito, y no por prudencia: el BFF hace
 * `await peticion.formData()` y reenvía ese `FormData`, o sea que **el archivo entero pasa por la
 * memoria del proceso de Next**, dos veces contando el reencode. Con varias subidas a la vez, un
 * archivo de 100 MB —el tope que usaba MeetingMatico— tumba el proceso que sirve todo el panel.
 *
 * Con la grabadora a 32 kbps, 25 MB son ~1 hora y 45 minutos de reunión.
 */
export const LIMITE_BYTES = 25 * 1024 * 1024

/** Tope de la grabación en vivo. Más allá, el archivo no entra en `LIMITE_BYTES`. */
export const MAXIMO_GRABACION_MS = 90 * 60 * 1000

/** Los cuatro modos de entrada del asistente. */
export type ModoEntrada = 'texto' | 'grabar' | 'audio' | 'imagen'

/** Extensiones que el selector de archivos ofrece, por modo. */
export const ACEPTA: Record<'audio' | 'imagen', string> = {
  audio: Object.keys(MIME_AUDIO).map((e) => `.${e}`).join(','),
  imagen: Object.keys(MIME_IMAGEN).map((e) => `.${e}`).join(',')
}

/** Extensión en minúsculas, sin punto. Cadena vacía si el nombre no tiene. */
export function extensionDe (nombre: string): string {
  const punto = nombre.lastIndexOf('.')

  return punto === -1 ? '' : nombre.slice(punto + 1).toLowerCase()
}

/**
 * Tipo MIME que le corresponde a un archivo por su extensión, o `null` si no es audio ni imagen.
 *
 * @param nombre nombre del archivo tal como lo dio el navegador
 */
export function inferirMime (nombre: string): string | null {
  const extension = extensionDe(nombre)

  return MIME_AUDIO[extension] ?? MIME_IMAGEN[extension] ?? null
}

/**
 * Comprueba que el archivo se pueda mandar.
 *
 * @param archivo el archivo elegido
 * @returns el mensaje de error para la persona, o `null` si está bien
 */
export function validarArchivo (archivo: { name: string, size: number }): string | null {
  if (archivo.size === 0) return 'El archivo está vacío.'

  if (inferirMime(archivo.name) === null) {
    return 'Solo se aceptan archivos de audio o de imagen.'
  }

  if (archivo.size > LIMITE_BYTES) {
    return `El archivo pesa ${formatoPeso(archivo.size)} y el máximo son ${formatoPeso(LIMITE_BYTES)}.`
  }

  return null
}

/** Peso legible, con un decimal a partir de un mega. */
export function formatoPeso (bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 KB'
  // `Math.max(1, …)` para que 300 bytes no se anuncien como "0 KB", que se lee como "no hay nada".
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`

  return `${(bytes / (1024 * 1024)).toFixed(1).replace('.', ',')} MB`
}

/**
 * Título del acta, sacado del primer `<h1>` que escribió el modelo.
 *
 * El prompt le pide `<h1>Meeting Paper - Kickoff</h1>` y en la lista queremos "Kickoff": el prefijo
 * se repite en todas y no distingue una de otra. Se cae al título de reserva si no hay `<h1>`, que
 * es lo que pasa cuando el modelo devuelve un fragmento en vez del documento.
 *
 * Es la misma regla que aplica el backend al guardar; acá se repite sólo para poder mostrar el
 * título mientras el stream todavía está escribiendo, antes de que exista el acta guardada.
 */
export function tituloDeActa (html: string, reserva = 'Meeting Paper'): string {
  const encontrado = /<h1[^>]*>([\s\S]*?)<\/h1>/i.exec(html)
  if (encontrado?.[1] === undefined) return reserva

  const texto = encontrado[1]
    .replace(/<[^>]*>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&nbsp;/g, ' ')
    .replace(/^Meeting Paper\s*-\s*/i, '')
    .replace(/\s+/g, ' ')
    .trim()

  return texto === '' ? reserva : texto
}

/**
 * Tipo MIME con el que grabar en este navegador.
 *
 * MeetingMatico fija `audio/webm` a mano y por eso no graba en Safari, que no lo soporta. Se prueba
 * en orden y se devuelve `''` para que el navegador elija el suyo, que es lo que hace que iPhone y
 * Mac funcionen sin una rama por sistema.
 *
 * @param soporta normalmente `MediaRecorder.isTypeSupported`; se inyecta para poder probarlo
 */
export function mimeDeGrabacion (soporta?: (tipo: string) => boolean): string {
  const probar = soporta ?? (typeof MediaRecorder === 'undefined'
    ? () => false
    : (tipo: string) => MediaRecorder.isTypeSupported(tipo))

  for (const candidato of ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4']) {
    if (probar(candidato)) return candidato
  }

  return ''
}

/** Nombre del archivo de una grabación, con la extensión que corresponde a su tipo. */
export function nombreDeGrabacion (mime: string): string {
  const extension = mime.startsWith('audio/mp4') ? 'm4a' : 'webm'

  return `reunion-${new Date().toISOString().slice(0, 10)}.${extension}`
}

/** `mm:ss` para el cronómetro de la grabadora. */
export function reloj (ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  const minutos = Math.floor(total / 60)

  return `${String(minutos).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}

/**
 * Mensaje para el fallo de `getUserMedia`.
 *
 * Se distingue por `name` y no por el texto del error: el texto cambia entre navegadores y entre
 * idiomas. Un "no se pudo grabar" genérico deja a la persona sin saber que el permiso está en el
 * candado de la barra de direcciones.
 */
export function mensajeDeMicrofono (nombre: string): string {
  if (nombre === 'NotAllowedError' || nombre === 'SecurityError') {
    return 'No diste permiso para usar el micrófono. Habilítalo desde el candado de la barra de direcciones y vuelve a intentar.'
  }
  if (nombre === 'NotFoundError' || nombre === 'DevicesNotFoundError') {
    return 'No se encontró ningún micrófono conectado.'
  }
  if (nombre === 'NotReadableError') {
    return 'El micrófono está siendo usado por otra aplicación.'
  }

  return 'No se pudo iniciar la grabación en este dispositivo.'
}
