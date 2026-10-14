/**
 * Imagenes incrustadas en el texto enriquecido: las reglas puras (sin DOM, sin `fetch`).
 *
 * El editor sube la imagen a la API (`POST imagenes-texto`) y mete en el texto un `<img>` cuyo `src` es
 * una ruta propia del BFF, `/api/bff/files/texto-rico/{codigo}`. Ese `src` es el contrato con el
 * saneador de la API (`HtmlSeguro::SRC_IMAGEN`): cualquier otra cosa —`data:`, un dominio externo, otra
 * ruta del BFF— se descarta al leer y al guardar. Se verifica bajo `node --test`
 * (`pruebas/imagenes-ricas.test.js`).
 *
 * Los topes de aca son un adelanto, no la validacion: manda la API (`TEXTO_RICO_IMAGEN_MAX_MB`) y
 * rechaza con un `422` que el editor muestra. Se copia el defecto para no dejar subir lo que se sabe
 * que va a rebotar.
 */

/** Prefijo del `src` de una imagen propia. Igual a `ImagenesDeTexto::PREFIJO_SRC` de la API. */
export const PREFIJO_DE_IMAGEN_RICA = '/api/bff/files/texto-rico/'

/** El `src` completo: prefijo y codigo opaco de 32 hex. Igual a `HtmlSeguro::SRC_IMAGEN`. */
const SRC_PROPIO = /^\/api\/bff\/files\/texto-rico\/[0-9a-f]{32}$/

/** Extension => MIME de lo que la API acepta (png, jpg, gif, webp). */
export const TIPOS_DE_IMAGEN_RICA: Readonly<Record<string, string>> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp'
}

/**
 * El valor del atributo `accept` del selector de imagenes.
 *
 * @returns `.png,.jpg,.jpeg,.gif,.webp`
 */
export function atributoAcceptDeImagenes (): string {
  return Object.keys(TIPOS_DE_IMAGEN_RICA).map((extension) => `.${extension}`).join(',')
}

/** Tope por imagen en MB (`TEXTO_RICO_IMAGEN_MAX_MB`, defecto 5). */
export const MAXIMO_MB_DE_IMAGEN_RICA = 5

/** El mismo tope, en bytes. */
export const MAXIMO_BYTES_DE_IMAGEN_RICA = MAXIMO_MB_DE_IMAGEN_RICA * 1024 * 1024

/** Largo maximo del texto alternativo que acepta la API. */
export const MAXIMO_DE_ALT = 200

/** Lo minimo que se lee de un `File`. */
export interface ArchivoDeImagen {
  name: string
  size: number
  type: string
}

/**
 * Si el `src` es el de una imagen propia, tal como lo emite la API.
 *
 * @param src el atributo, tal cual
 * @returns `true` solo si es `/api/bff/files/texto-rico/{32 hex}` exacto
 */
export function esSrcDeImagenRica (src: string | null | undefined): src is string {
  return typeof src === 'string' && SRC_PROPIO.test(src)
}

/**
 * El `src` de una imagen a partir del codigo que devolvio la API.
 *
 * @param codigo los 32 hex
 * @returns la ruta del BFF, o `null` si el codigo no tiene esa forma
 */
export function srcDeImagenRica (codigo: string): string | null {
  const src = `${PREFIJO_DE_IMAGEN_RICA}${codigo}`

  return esSrcDeImagenRica(src) ? src : null
}

/** La extension en minusculas y sin punto, o `''`. */
function extensionDe (nombre: string): string {
  const punto = nombre.lastIndexOf('.')

  return punto <= 0 ? '' : nombre.slice(punto + 1).trim().toLowerCase()
}

/**
 * Si el archivo es una imagen de un tipo que se puede subir.
 *
 * Se mira el `type` que declara el navegador (lo que da el portapapeles) y, si viene vacio, la
 * extension. Es solo para decidir si el editor se hace cargo del archivo: la API vuelve a mirar los bytes.
 *
 * @param archivo el que se pego o arrastro
 * @returns `true` si es png, jpg, gif o webp
 */
export function esImagenSubible (archivo: Pick<ArchivoDeImagen, 'name' | 'type'>): boolean {
  const tipo = archivo.type.trim().toLowerCase()

  if (tipo !== '') return Object.values(TIPOS_DE_IMAGEN_RICA).includes(tipo)

  return extensionDe(archivo.name) in TIPOS_DE_IMAGEN_RICA
}

/**
 * Por que una imagen no se puede subir, o `null` si va.
 *
 * @param archivo el que se eligio
 * @returns el motivo en una frase, con el nombre del archivo
 */
export function motivoParaNoSubirImagen (archivo: ArchivoDeImagen): string | null {
  const nombre = archivo.name.trim() === '' ? 'La imagen' : `«${archivo.name}»`

  if (!esImagenSubible(archivo)) return `${nombre} no es una imagen PNG, JPG, GIF o WebP.`
  if (archivo.size <= 0) return `${nombre} está vacía.`
  if (archivo.size > MAXIMO_BYTES_DE_IMAGEN_RICA) {
    return `${nombre} pesa más de ${MAXIMO_MB_DE_IMAGEN_RICA} MB.`
  }

  return null
}

/**
 * El nombre con que se sube lo que viene del portapapeles.
 *
 * Una captura pegada se llama `image.png` en todos los navegadores: se le da un nombre propio para que
 * quede distinguible en el panel y el texto alternativo diga algo.
 *
 * @param archivo lo pegado
 * @param ahora el momento, inyectable para probar
 * @returns `captura-AAAAMMDD-HHMMSS.ext`, o el nombre original si ya traia uno propio
 */
export function nombreDeCaptura (archivo: Pick<ArchivoDeImagen, 'name' | 'type'>, ahora: Date = new Date()): string {
  const original = archivo.name.trim()

  if (original !== '' && !/^image\.[a-z]+$/i.test(original)) return original

  const extension = Object.entries(TIPOS_DE_IMAGEN_RICA).find(([, mime]) => mime === archivo.type.toLowerCase())?.[0] ?? 'png'
  const dos = (n: number): string => String(n).padStart(2, '0')
  const dia = `${ahora.getFullYear()}${dos(ahora.getMonth() + 1)}${dos(ahora.getDate())}`
  const hora = `${dos(ahora.getHours())}${dos(ahora.getMinutes())}${dos(ahora.getSeconds())}`

  return `captura-${dia}-${hora}.${extension}`
}

/**
 * El texto alternativo de una imagen: el nombre del archivo sin extension, acotado.
 *
 * @param nombre el nombre con que se subio
 * @returns hasta 200 caracteres, sin saltos de linea
 */
export function textoAlternativoDe (nombre: string): string {
  const base = nombre.replace(/\.[a-z0-9]+$/i, '').replace(/[\u0000-\u001F\u007F]/g, ' ').trim()

  return base.slice(0, MAXIMO_DE_ALT)
}

/**
 * Las imagenes de una lista de archivos, y cuantos archivos de otro tipo habia.
 *
 * Sirve para decidir si el editor se hace cargo de un pegado o un arrastre: solo si hay al menos una
 * imagen; lo demas lo deja pasar.
 *
 * @param archivos lo que trae el portapapeles o el arrastre
 * @returns las imagenes subibles y el resto
 */
export function separarImagenes<T extends Pick<ArchivoDeImagen, 'name' | 'type'>> (archivos: readonly T[]): { imagenes: T[], otros: T[] } {
  const imagenes: T[] = []
  const otros: T[] = []

  for (const archivo of archivos) (esImagenSubible(archivo) ? imagenes : otros).push(archivo)

  return { imagenes, otros }
}

/**
 * Los parametros de la subida: la ruta del BFF segun quien sube y el Espacio al que se ata.
 *
 * El equipo sube por `imagenes-texto` (el `project_id` es opcional); el cliente por
 * `portal/imagenes-texto`, donde el Espacio es obligatorio: sin el no hay alcance contra el cual
 * medir la imagen, y la API responde 422.
 *
 * @param portal `true` si quien escribe es un contacto del portal
 * @param proyectoId el Espacio del texto, o `null` si no tiene
 * @returns la ruta y el campo `project_id` (ausente si no hay)
 */
export function destinoDeImagenRica (portal: boolean, proyectoId: number | null): { ruta: string, proyecto: string | null } {
  return {
    ruta: portal ? 'portal/imagenes-texto' : 'imagenes-texto',
    proyecto: proyectoId !== null && Number.isInteger(proyectoId) && proyectoId > 0 ? String(proyectoId) : null
  }
}
