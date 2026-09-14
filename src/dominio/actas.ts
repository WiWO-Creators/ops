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
 *
 * **Los contenedores de video están a propósito.** Una reunión grabada en Meet, en Zoom o con el
 * teléfono sale como `.mp4`, `.mov` o `.mkv`, y lo único que interesa de ese archivo es la pista de
 * sonido: la imagen no entra en un acta. El servidor la descarta al convertir, así que acá se listan
 * como audio y el MIME declarado dice la intención, no lo que el contenedor es por dentro.
 */
export const MIME_AUDIO: Record<string, string> = {
  m4a: 'audio/aac',
  aac: 'audio/aac',
  mp4: 'audio/aac',
  m4v: 'audio/aac',
  mov: 'audio/aac',
  mkv: 'audio/aac',
  avi: 'audio/aac',
  '3gp': 'audio/aac',
  mp3: 'audio/mp3',
  mpeg: 'audio/mp3',
  mpga: 'audio/mp3',
  wav: 'audio/wav',
  ogg: 'audio/ogg',
  opus: 'audio/ogg',
  flac: 'audio/flac',
  aiff: 'audio/aiff',
  aif: 'audio/aiff',
  wma: 'audio/x-ms-wma',
  amr: 'audio/amr',
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
 * Extensión de documento a su tipo MIME: un Meeting Paper que ya se escribió fuera del sistema.
 *
 * `.doc` **no está a propósito**. El binario de Word 97 no se lee sin una librería, y dejarlo caer
 * en el "solo se aceptan…" genérico deja a la persona mirando lo que para ella es un documento de
 * Word como cualquier otro. `validarArchivo` lo contesta con su propio mensaje, que dice qué hacer.
 */
export const MIME_DOCUMENTO: Record<string, string> = {
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  txt: 'text/plain',
  md: 'text/markdown',
  html: 'text/html',
  htm: 'text/html'
}

/**
 * Tope del documento subido, 20 MB. Es el mismo de la API, no uno más bajo.
 *
 */
export const LIMITE_DOCUMENTO_BYTES = 20 * 1024 * 1024

/**
 * Tope de subida de imágenes, 25 MB.
 */
export const LIMITE_BYTES = 25 * 1024 * 1024

/** Tope de audio, igual a los 100 MB de EntradaDeActa::MAX_AUDIO_BYTES en la API. */
export const LIMITE_AUDIO_BYTES = 100 * 1024 * 1024

/** Tope de duración de la grabación en vivo. */
export const MAXIMO_GRABACION_MS = 90 * 60 * 1000

/**
 * Cuántos archivos se pueden mandar en una generación: 10, el mismo `EntradaDeActa::MAX_ARCHIVOS`
 * de la API.
 */
export const MAXIMO_ARCHIVOS = 10

/**
 * Tope de la SUMA de todos los archivos, 120 MB.
 *
 * No es la suma de los topes por archivo y no tiene que serlo. Lo que manda acá es el
 * `post_max_size` de PHP, que en este repo son 128 MB (`.user.ini` y `docker/Dockerfile`): cuando el
 * multipart se pasa de ese número, PHP **descarta el cuerpo entero** —no hay error por archivo que
 * mirar, sólo `$_FILES` y `$_POST` vacíos— y lo único que queda del otro lado es un 413 deducido del
 * `Content-Length`. Con un archivo eso no pasaba nunca, porque el tope de audio son 100 MB; con diez
 * se alcanza sin esfuerzo.
 *
 * Los 8 MB de diferencia con el 128 no son prudencia: son el sobre del multipart —los `boundary`, las
 * cabeceras de cada parte y los seis campos de texto del formulario— que también cuenta para
 * `post_max_size` y que acá no se puede medir antes de armarlo.
 *
 * Si el `post_max_size` del servidor donde corre la API cambia, este número cambia con él.
 */
export const LIMITE_TOTAL_BYTES = 120 * 1024 * 1024

/** Los cinco modos de entrada del asistente. */
export type ModoEntrada = 'texto' | 'grabar' | 'audio' | 'imagen' | 'documento'

/** Extensiones que el selector de archivos ofrece, por modo. */
export const ACEPTA: Record<'audio' | 'imagen' | 'documento', string> = {
  audio: Object.keys(MIME_AUDIO).map((e) => `.${e}`).join(','),
  imagen: Object.keys(MIME_IMAGEN).map((e) => `.${e}`).join(','),
  documento: Object.keys(MIME_DOCUMENTO).map((e) => `.${e}`).join(',')
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
 * Sin modo se aceptan audio e imagen, con topes de 100 y 25 MB según la extensión.
 * El modo `documento` cambia la lista de extensiones y el tope.
 *
 * Esto no reemplaza la validación del servidor, que es la que manda: acá se evita subir 20 MB para
 * que la API los rechace, nada más.
 *
 * @param archivo el archivo elegido
 * @param modo    de dónde sale el acta; solo `documento` cambia lo que se acepta
 * @returns el mensaje de error para la persona, o `null` si está bien
 */
export function validarArchivo (
  archivo: { name: string, size: number },
  modo?: ModoEntrada
): string | null {
  if (archivo.size === 0) return 'El archivo está vacío.'

  if (modo === 'documento') {
    if (extensionDe(archivo.name) === 'doc') {
      return 'Los archivos .doc no se pueden leer. Guarda el documento como PDF o como .docx y vuelve a subirlo.'
    }

    if (MIME_DOCUMENTO[extensionDe(archivo.name)] === undefined) {
      return 'Solo se aceptan documentos PDF, DOCX, TXT, MD o HTML.'
    }

    if (archivo.size > LIMITE_DOCUMENTO_BYTES) {
      return `El documento pesa ${formatoPeso(archivo.size)} y el máximo son ${formatoPeso(LIMITE_DOCUMENTO_BYTES)}.`
    }

    return null
  }

  if (inferirMime(archivo.name) === null) {
    return 'Solo se aceptan archivos de audio o de imagen.'
  }

  const limite = MIME_AUDIO[extensionDe(archivo.name)] !== undefined ? LIMITE_AUDIO_BYTES : LIMITE_BYTES
  if (archivo.size > limite) {
    return `El archivo pesa ${formatoPeso(archivo.size)} y el máximo son ${formatoPeso(limite)}.`
  }

  return null
}

/**
 * Comprueba que se pueda mandar TODO lo elegido.
 *
 * Se rechaza la selección entera y no el archivo malo: quien eligió cinco fotos de una pizarra
 * espera que se suban las cinco, y subir cuatro en silencio es perder una sin que nadie lo note. El
 * mensaje nombra el archivo, porque "el archivo pesa 32 MB" con cinco elegidos no dice cuál sacar.
 *
 * El tope de la suma es el que importa cuando hay varios: lo fija el `post_max_size` de PHP, no los
 * topes por archivo. Ver `LIMITE_TOTAL_BYTES`.
 *
 * Esto no reemplaza la validación del servidor, que es la que manda.
 *
 * @param archivos los archivos elegidos, en el orden en que se van a mandar
 * @param modo     de dónde sale el acta; sólo `documento` cambia lo que se acepta
 * @returns el mensaje de error para la persona, o `null` si está bien
 */
export function validarArchivos (
  archivos: ReadonlyArray<{ name: string, size: number }>,
  modo?: ModoEntrada
): string | null {
  if (archivos.length === 0) return null

  if (archivos.length > MAXIMO_ARCHIVOS) {
    return `Se pueden subir hasta ${MAXIMO_ARCHIVOS} archivos por Meeting Paper y elegiste ${archivos.length}.`
  }

  for (const archivo of archivos) {
    const problema = validarArchivo(archivo, modo)

    if (problema !== null) {
      return archivos.length === 1 ? problema : `${archivo.name}: ${problema}`
    }
  }

  const total = archivos.reduce((suma, archivo) => suma + archivo.size, 0)

  if (total > LIMITE_TOTAL_BYTES) {
    return `Entre todos suman ${formatoPeso(total)} y el servidor acepta hasta ${formatoPeso(LIMITE_TOTAL_BYTES)} por envío. Saca alguno y vuelve a intentar.`
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
 * Los tipos de imagen que un navegador dibuja.
 *
 * **No es `MIME_IMAGEN`.** `heic` y `heif` se aceptan al subir —es lo que sale de un iPhone sin
 * convertir— pero ningún navegador de escritorio los pinta, así que una miniatura de un `.heic` es
 * un icono roto, que se lee como "el archivo se corrompió". Esos adjuntos se listan igual, con su
 * nombre y su botón de descarga, pero sin previsualización.
 */
const IMAGEN_PINTABLE = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/avif'])

/**
 * Si un adjunto se puede mostrar como miniatura en la ficha del acta.
 *
 * Manda el MIME, que la API guarda del contenido real con `finfo` y no del `Content-Type` que mandó
 * el navegador. La extensión es la reserva para las filas viejas o para cuando `finfo` no estaba
 * disponible en el servidor y la columna quedó vacía.
 *
 * @param mime   `filetype` tal como lo devuelve la API; puede venir vacío o nulo
 * @param nombre nombre del archivo, para la reserva por extensión
 */
export function seVeComoImagen (mime: string | null | undefined, nombre: string): boolean {
  // `split(';')` recorta el `; charset=binary` que algunos `finfo` agregan al tipo.
  const declarado = ((mime ?? '').toLowerCase().split(';')[0] ?? '').trim()

  if (declarado !== '') return IMAGEN_PINTABLE.has(declarado)

  return IMAGEN_PINTABLE.has(MIME_IMAGEN[extensionDe(nombre)] ?? '')
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
 * **El orden es por peso, no por formato de destino.** Whisper lee mp3, wav y flac, así que el
 * servidor convierte con ffmpeg tanto lo que graba Chrome como lo que graba Safari: ninguno de los
 * dos llega listo y elegir uno para "ahorrarse la conversión" no ahorra nada. Lo que sí cambia es
 * cuánto sube la persona: a 32 kbps, opus comprime voz mejor que AAC, así que `audio/webm` va
 * primero y `audio/mp4` queda para Safari, que no graba webm.
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
