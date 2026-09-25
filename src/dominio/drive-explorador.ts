/**
 * Reglas puras del explorador de Drive: qué ícono lleva cada archivo, cómo se ordena y filtra una
 * carpeta, cómo se lee un tamaño, qué destinos admite un arrastre, cómo crece una selección con
 * Shift y cómo se cuenta el resultado de un traslado en lote.
 *
 * Viven aparte del componente para probarlas sin navegador. El arrastre, en particular, no se puede
 * simular con fidelidad en una prueba de navegador: lo que se protege acá es la decisión —dónde se
 * puede soltar y qué pasa con lo que falló—, que es donde un error mueve archivos a donde no debía.
 */

import { formatearFecha, formatearRelativo } from '../lib/fechas.ts'
import { normalizar } from './salas.ts'
import type { MigaDrive, NodoDrive, ResultadoTrasladoDrive } from '@/datos/recursos'

/** Tope de ids de un traslado en lote. Es el mismo que valida la API. */
export const TOPE_LOTE_TRASLADO = 50

/** Tope de una subida: 25 MB, igual que la API. */
export const TOPE_SUBIDA_BYTES = 25 * 1024 * 1024

/** Subidas en paralelo. Más satura la conexión de quien sube sin terminar antes. */
export const SUBIDAS_EN_PARALELO = 3

/** Tipos de archivo que la pantalla distingue con ícono y color propios. */
export type TipoArchivoDrive =
  | 'carpeta' | 'carpeta-tarea' | 'pdf' | 'imagen' | 'hoja' | 'documento' | 'presentacion'
  | 'video' | 'audio' | 'comprimido' | 'texto' | 'otro'

/** Nombre visible de cada tipo: va en la columna Tipo y en el nombre accesible del ícono. */
export const ETIQUETA_TIPO: Record<TipoArchivoDrive, string> = {
  carpeta: 'Carpeta',
  'carpeta-tarea': 'Carpeta de Tarea',
  pdf: 'PDF',
  imagen: 'Imagen',
  hoja: 'Hoja de cálculo',
  documento: 'Documento',
  presentacion: 'Presentación',
  video: 'Video',
  audio: 'Audio',
  comprimido: 'Comprimido',
  texto: 'Texto',
  otro: 'Archivo'
}

/** Extensiones de respaldo, para cuando el mime viene nulo o genérico. */
const POR_EXTENSION: Record<string, TipoArchivoDrive> = {
  pdf: 'pdf',
  png: 'imagen', jpg: 'imagen', jpeg: 'imagen', gif: 'imagen', webp: 'imagen', svg: 'imagen', heic: 'imagen',
  xls: 'hoja', xlsx: 'hoja', csv: 'hoja', ods: 'hoja',
  doc: 'documento', docx: 'documento', odt: 'documento', rtf: 'documento',
  ppt: 'presentacion', pptx: 'presentacion', odp: 'presentacion', key: 'presentacion',
  mp4: 'video', mov: 'video', webm: 'video', avi: 'video', mkv: 'video',
  mp3: 'audio', m4a: 'audio', wav: 'audio', ogg: 'audio', aac: 'audio', flac: 'audio',
  zip: 'comprimido', rar: 'comprimido', '7z': 'comprimido', gz: 'comprimido', tar: 'comprimido',
  txt: 'texto', md: 'texto', json: 'texto'
}

/** Pistas dentro del mime, en orden: la primera que aparece decide. */
const POR_MIME: Array<[RegExp, TipoArchivoDrive]> = [
  [/pdf/, 'pdf'],
  [/^image\//, 'imagen'],
  [/spreadsheet|excel|csv|google-apps\.sheet/, 'hoja'],
  [/presentation|powerpoint|google-apps\.slides/, 'presentacion'],
  [/wordprocessing|msword|opendocument\.text|google-apps\.document|rtf/, 'documento'],
  [/^video\//, 'video'],
  [/^audio\//, 'audio'],
  [/zip|compressed|x-tar|x-7z|x-rar|gzip/, 'comprimido'],
  [/^text\//, 'texto']
]

/**
 * El tipo de un nodo, para su ícono y su color.
 *
 * Manda el mime, que es lo que Drive sabe; la extensión cubre los archivos subidos directo en Drive
 * que el backend todavía no describe (`mime_type` nulo) o que vienen como `application/octet-stream`.
 *
 * @param nodo el hijo tal como lo devolvió la API
 * @returns el tipo; `otro` si nada lo identifica
 */
export function tipoDeNodo (nodo: Pick<NodoDrive, 'is_folder' | 'locked' | 'mime_type' | 'name'>): TipoArchivoDrive {
  if (nodo.is_folder) return nodo.locked === true ? 'carpeta-tarea' : 'carpeta'

  const mime = (nodo.mime_type ?? '').toLowerCase()
  const porMime = POR_MIME.find(([patron]) => patron.test(mime))
  if (porMime !== undefined) return porMime[1]

  const punto = nodo.name.lastIndexOf('.')
  const extension = punto > 0 ? nodo.name.slice(punto + 1).toLowerCase() : ''

  return POR_EXTENSION[extension] ?? 'otro'
}

/** Por qué se puede ordenar una carpeta. */
export type CriterioOrden = 'nombre' | 'fecha' | 'tamano'

export interface OrdenDrive {
  criterio: CriterioOrden
  ascendente: boolean
}

/** El orden con que se abre una carpeta: por nombre, como la lista Drive. */
export const ORDEN_INICIAL: OrdenDrive = { criterio: 'nombre', ascendente: true }

const COMPARADOR_NOMBRES = new Intl.Collator('es', { numeric: true, sensitivity: 'base' })

/** Compara dos valores que pueden faltar: lo que falta va siempre al final, en los dos sentidos. */
function compararConAusentes (a: number | null, b: number | null, ascendente: boolean): number {
  if (a === null && b === null) return 0
  if (a === null) return 1
  if (b === null) return -1
  return ascendente ? a - b : b - a
}

/** El instante de modificación en milisegundos, o `null` si falta o no se entiende. */
function instanteDe (nodo: NodoDrive): number | null {
  if (nodo.modified_time === undefined || nodo.modified_time === null) return null
  const ms = Date.parse(nodo.modified_time)
  return Number.isNaN(ms) ? null : ms
}

/**
 * Ordena los hijos de una carpeta, con las carpetas siempre arriba.
 *
 * Las carpetas van primero en cualquier criterio porque es lo que hace todo explorador y porque son
 * los destinos de un arrastre: tenerlas juntas y a la vista es lo que permite soltar sin buscar.
 * Nombre usa orden natural (`Fase 2` antes que `Fase 10`) y sin distinguir tildes ni mayúsculas. Lo
 * que no tiene fecha o tamaño va al final en los dos sentidos; el empate se resuelve por nombre.
 *
 * @param nodos los hijos, en cualquier orden
 * @param orden criterio y sentido
 * @returns una lista nueva, ordenada
 */
export function ordenarNodos (nodos: readonly NodoDrive[], orden: OrdenDrive): NodoDrive[] {
  const porNombre = (a: NodoDrive, b: NodoDrive): number => COMPARADOR_NOMBRES.compare(a.name, b.name)

  return [...nodos].sort((a, b) => {
    if (a.is_folder !== b.is_folder) return a.is_folder ? -1 : 1

    let resultado = 0
    if (orden.criterio === 'nombre') resultado = orden.ascendente ? porNombre(a, b) : porNombre(b, a)
    if (orden.criterio === 'fecha') resultado = compararConAusentes(instanteDe(a), instanteDe(b), orden.ascendente)
    if (orden.criterio === 'tamano') resultado = compararConAusentes(a.size_bytes ?? null, b.size_bytes ?? null, orden.ascendente)

    return resultado !== 0 ? resultado : porNombre(a, b)
  })
}

/**
 * Filtra los hijos por nombre, sin distinguir tildes ni mayúsculas.
 *
 * @param nodos los hijos de la carpeta actual
 * @param texto lo escrito en el buscador; vacío devuelve todo
 * @returns los que contienen el texto
 */
export function filtrarPorNombre (nodos: readonly NodoDrive[], texto: string): NodoDrive[] {
  const buscado = normalizar(texto)
  if (buscado === '') return [...nodos]
  return nodos.filter((nodo) => normalizar(nodo.name).includes(buscado))
}

const UNIDADES = ['B', 'KB', 'MB', 'GB', 'TB']

/**
 * Un tamaño en bytes, legible: `1,2 MB`, `48 KB`, `820 B`.
 *
 * Un decimal por debajo de 10 y ninguno por encima: `9,5 MB` dice algo, `95,3 MB` es ruido.
 *
 * @param bytes el tamaño, o `null`/ausente si Drive no lo informa (documentos nativos, carpetas)
 * @returns el texto, o el guion largo si no hay dato
 */
export function formatearTamano (bytes: number | null | undefined): string {
  if (bytes === null || bytes === undefined || !Number.isFinite(bytes) || bytes < 0) return '—'

  let valor = bytes
  let unidad = 0
  while (valor >= 1024 && unidad < UNIDADES.length - 1) {
    valor /= 1024
    unidad += 1
  }

  const decimales = unidad === 0 || valor >= 10 ? 0 : 1
  const texto = new Intl.NumberFormat('es-AR', { maximumFractionDigits: decimales }).format(valor)

  return `${texto} ${UNIDADES[unidad]}`
}

/**
 * La fecha de modificación como se muestra en la fila: relativa, y la absoluta para el `title`.
 *
 * Acá manda la relativa, al revés que en una tabla de plazos: en un explorador la pregunta es "qué
 * se tocó hace poco", no comparar días exactos entre filas.
 *
 * @param iso el `modified_time` del nodo
 * @param ahora referencia inyectable para probar sin depender del reloj
 * @returns `{ relativa, absoluta }`; las dos son el guion largo si no hay fecha
 */
export function fechaDeModificacion (iso: string | null | undefined, ahora: Date = new Date()): { relativa: string, absoluta: string } {
  if (iso === null || iso === undefined || Number.isNaN(Date.parse(iso))) return { relativa: '—', absoluta: '—' }
  // Un archivo recién subido puede venir unos segundos "en el futuro" si el reloj del servidor va
  // adelantado: "dentro de 2 segundos" no tiene sentido para algo que ya pasó, así que se topa en ahora.
  const instante = new Date(Math.min(Date.parse(iso), ahora.getTime())).toISOString()
  return { relativa: formatearRelativo(instante, ahora), absoluta: formatearFecha(iso, true) }
}

/** La selección de la carpeta actual y el punto desde donde crece un rango con Shift. */
export interface SeleccionDrive {
  ids: string[]
  ancla: string | null
}

export const SELECCION_VACIA: SeleccionDrive = { ids: [], ancla: null }

/** Cómo se eligió: clic simple, Ctrl/Cmd (o la casilla), o Shift. */
export type ModoSeleccion = 'unico' | 'alternar' | 'rango'

/**
 * Aplica un clic a la selección, como en cualquier explorador de archivos.
 *
 * `unico` deja solo ese item; `alternar` lo suma o lo saca sin tocar el resto; `rango` elige todo lo
 * que hay entre el ancla y el item, en el orden en que se ven. El ancla se mueve con `unico` y
 * `alternar`, y se queda quieta con `rango`: así dos Shift+clic seguidos corrigen el mismo rango en
 * vez de encadenar uno nuevo. Un ancla que ya no está visible (se filtró) cuenta como ausente.
 *
 * @param visibles ids en el orden en que se muestran
 * @param actual la selección de antes
 * @param id el item sobre el que se actuó
 * @param modo cómo se actuó
 * @returns la selección nueva
 */
export function seleccionar (visibles: readonly string[], actual: SeleccionDrive, id: string, modo: ModoSeleccion): SeleccionDrive {
  if (modo === 'unico') return { ids: [id], ancla: id }

  if (modo === 'alternar') {
    const ids = actual.ids.includes(id) ? actual.ids.filter((otro) => otro !== id) : [...actual.ids, id]
    return { ids, ancla: id }
  }

  const desde = actual.ancla === null ? -1 : visibles.indexOf(actual.ancla)
  const hasta = visibles.indexOf(id)
  if (hasta < 0) return actual
  if (desde < 0) return { ids: [id], ancla: id }

  const [inicio, fin] = desde <= hasta ? [desde, hasta] : [hasta, desde]
  return { ids: visibles.slice(inicio, fin + 1), ancla: actual.ancla }
}

/** Lo que se está arrastrando desde la vista: qué items y de qué carpeta salen. */
export interface ArrastreDrive {
  ids: readonly string[]
  padreId: string
}

/** Una carpeta candidata a recibir lo que se suelta. */
export interface DestinoDrive {
  id: string
  /** Ids desde la carpeta de la entidad hasta esta, ambas incluidas. */
  ruta: readonly string[]
  /** `false` si se sabe que no deja escribir; ausente si todavía no se sabe (el backend decide). */
  canWrite?: boolean
}

/**
 * Por qué no se puede soltar un arrastre de items sobre una carpeta, o `null` si se puede.
 *
 * Son los mismos rechazos de la API, avisados antes: la carpeta es uno de los items, cuelga de uno
 * de ellos, es donde ya están, o se sabe que no deja escribir. Una carpeta de Tarea (`locked`) sí es
 * destino válido —el backend decide si quien arrastra puede escribir ahí— y un `403` se muestra en
 * el resultado del traslado.
 *
 * @param destino la carpeta bajo el puntero
 * @param arrastre lo que se arrastra
 * @returns el motivo, o `null` si el destino sirve
 */
export function motivoParaNoSoltar (destino: DestinoDrive, arrastre: ArrastreDrive): string | null {
  if (arrastre.ids.length === 0) return 'No hay nada que mover'
  if (arrastre.ids.includes(destino.id)) return 'Es uno de los elementos que mueves'
  if (destino.ruta.some((id) => arrastre.ids.includes(id))) return 'Está dentro de lo que mueves'
  if (destino.id === arrastre.padreId) return 'Ya están en esta carpeta'
  if (destino.canWrite === false) return 'No tienes permiso para escribir aquí'
  return null
}

/**
 * Por qué no se puede subir un archivo, o `null` si puede intentarse.
 *
 * Solo se adelanta lo que el navegador sabe con certeza: el tamaño y el nombre vacío. La extensión
 * la decide el backend con su propia lista, y su `422` se muestra junto al archivo.
 *
 * @param archivo el nombre y el tamaño del `File`
 * @returns el motivo, o `null`
 */
export function motivoParaNoSubir (archivo: { name: string, size: number }): string | null {
  if (archivo.name.trim() === '') return 'El archivo no tiene nombre.'
  if (archivo.size > TOPE_SUBIDA_BYTES) return `Pesa ${formatearTamano(archivo.size)}: el máximo es ${formatearTamano(TOPE_SUBIDA_BYTES)}.`
  return null
}

/**
 * Si ya hay otro elemento con ese nombre en la carpeta, sin distinguir mayúsculas ni tildes.
 *
 * Drive acepta nombres repetidos, pero dos "Bases" en la misma carpeta son una trampa para quien
 * busca después: la pantalla lo impide al crear y al renombrar.
 *
 * @param nombre el nombre propuesto
 * @param hermanos los hijos de la carpeta
 * @param exceptoId el propio item, cuando se renombra
 */
export function nombreRepetido (nombre: string, hermanos: readonly NodoDrive[], exceptoId?: string): boolean {
  const buscado = normalizar(nombre)
  return hermanos.some((hermano) => hermano.id !== exceptoId && normalizar(hermano.name) === buscado)
}

/**
 * Parte una lista en lotes del tope que admite la API.
 *
 * @param lista los ids a mandar
 * @param tamano el tope por lote
 */
export function partirEnLotes<T> (lista: readonly T[], tamano: number = TOPE_LOTE_TRASLADO): T[][] {
  if (tamano < 1) throw new RangeError('El tamaño de lote tiene que ser al menos 1.')
  const lotes: T[][] = []
  for (let i = 0; i < lista.length; i += tamano) lotes.push(lista.slice(i, i + tamano))
  return lotes
}

/**
 * Cuenta el resultado de un traslado en una frase: "3 movidos a «Bases», 1 falló: «Acta.pdf»: …".
 *
 * Nombra cada fallo con su motivo porque "1 falló" sin decir cuál obliga a buscar el archivo que no
 * se movió comparando dos carpetas a ojo.
 *
 * @param resultado lo que devolvió la API (o la suma de varios lotes)
 * @param nombreDe nombre visible de cada id
 * @param destino nombre de la carpeta de destino
 */
export function resumenDeTraslado (
  resultado: ResultadoTrasladoDrive,
  nombreDe: (id: string) => string,
  destino: string
): string {
  const movidos = resultado.moved.length
  const partes: string[] = []

  if (movidos > 0) partes.push(`${movidos === 1 ? '1 movido' : `${movidos} movidos`} a «${destino}»`)

  if (resultado.failed.length > 0) {
    const detalle = resultado.failed.map((fallo) => `«${nombreDe(fallo.id)}»: ${fallo.error.replace(/[.\s]+$/, '')}`).join('; ')
    const cuenta = resultado.failed.length === 1 ? '1 falló' : `${resultado.failed.length} fallaron`
    partes.push(`${cuenta}: ${detalle}`)
  }

  return partes.length === 0 ? 'No se movió nada.' : `${partes.join(', ')}.`
}

/** Estado de una subida en la bandeja. */
export type EstadoSubida = 'pendiente' | 'subiendo' | 'lista' | 'error' | 'cancelada'

/**
 * Qué subidas pendientes arrancan ahora, sin pasar del tope en paralelo.
 *
 * @param cola las subidas en el orden en que se pidieron
 * @param limite cuántas pueden correr a la vez
 * @returns los ids que hay que arrancar
 */
export function subidasParaArrancar (cola: ReadonlyArray<{ id: string, estado: EstadoSubida }>, limite: number = SUBIDAS_EN_PARALELO): string[] {
  const enCurso = cola.filter((subida) => subida.estado === 'subiendo').length
  const libres = Math.max(0, limite - enCurso)
  return cola.filter((subida) => subida.estado === 'pendiente').slice(0, libres).map((subida) => subida.id)
}

/** Un paso de las migas ya decidido: una carpeta, o el hueco que junta las del medio. */
export type PasoMigas =
  | { tipo: 'miga', miga: MigaDrive }
  | { tipo: 'elipsis', ocultas: MigaDrive[] }

/**
 * Recorta migas largas dejando la raíz y las últimas, con un hueco en el medio.
 *
 * La raíz se queda porque es la vuelta a casa; las últimas porque son el contexto inmediato. Lo del
 * medio va al hueco, que abre un menú con esas carpetas: siguen siendo destinos de un clic.
 *
 * @param migas la ruta completa, raíz primero
 * @param maximo cuántos pasos entran como mucho, hueco incluido
 */
export function recortarMigas (migas: readonly MigaDrive[], maximo: number): PasoMigas[] {
  const todas: PasoMigas[] = migas.map((miga) => ({ tipo: 'miga', miga }))
  if (migas.length <= maximo || maximo < 3) return todas

  const finales = maximo - 2
  const primera = migas[0]
  if (primera === undefined) return todas

  return [
    { tipo: 'miga', miga: primera },
    { tipo: 'elipsis', ocultas: migas.slice(1, migas.length - finales) },
    ...migas.slice(migas.length - finales).map((miga): PasoMigas => ({ tipo: 'miga', miga }))
  ]
}

/** Teclas que mueven el foco entre los items de la vista. */
export type TeclaNavegacion = 'ArrowUp' | 'ArrowDown' | 'ArrowLeft' | 'ArrowRight' | 'Home' | 'End' | 'PageUp' | 'PageDown'

/**
 * El índice al que va el foco tras una tecla de navegación.
 *
 * En la lista, izquierda y derecha no hacen nada (son de las celdas); en la cuadrícula mueven de a
 * uno y arriba y abajo saltan una fila entera, que son `columnas` items.
 *
 * @param actual índice con foco; `-1` si ninguno
 * @param total cantidad de items visibles
 * @param tecla la tecla pulsada
 * @param columnas items por fila: `1` en la lista
 * @returns el índice nuevo, dentro de `[0, total - 1]`, o `-1` si no hay items
 */
export function indiceTrasTecla (actual: number, total: number, tecla: TeclaNavegacion, columnas: number): number {
  if (total === 0) return -1
  const salto = Math.max(1, columnas)
  const base = actual < 0 ? -1 : actual
  const pagina = salto * 10

  const destinos: Record<TeclaNavegacion, number> = {
    ArrowDown: base < 0 ? 0 : base + salto,
    ArrowUp: base < 0 ? 0 : base - salto,
    ArrowRight: salto === 1 ? base : base + 1,
    ArrowLeft: salto === 1 ? base : base - 1,
    Home: 0,
    End: total - 1,
    PageDown: base + pagina,
    PageUp: base - pagina
  }

  return Math.min(total - 1, Math.max(0, destinos[tecla]))
}

/**
 * Saca de una lista los nodos con esos ids y los devuelve aparte, conservando el orden.
 *
 * Es la pieza del traslado optimista: lo que sale de la carpeta de origen se guarda tal cual para
 * devolverlo si la API dice que no.
 *
 * @param lista los hijos de la carpeta
 * @param ids los que se van
 */
export function separarNodos (lista: readonly NodoDrive[], ids: readonly string[]): { quedan: NodoDrive[], salen: NodoDrive[] } {
  const quedan: NodoDrive[] = []
  const salen: NodoDrive[] = []
  for (const nodo of lista) (ids.includes(nodo.id) ? salen : quedan).push(nodo)
  return { quedan, salen }
}

/**
 * Suma nodos a una lista sin repetir ids: si ya estaba, gana la versión nueva.
 *
 * @param lista los hijos actuales
 * @param nuevos los que llegan
 */
export function sumarNodos (lista: readonly NodoDrive[], nuevos: readonly NodoDrive[]): NodoDrive[] {
  const ids = new Set(nuevos.map((nodo) => nodo.id))
  return [...lista.filter((nodo) => !ids.has(nodo.id)), ...nuevos]
}

/**
 * Corrige las rutas conocidas cuando una carpeta cambia de lugar: ella y todo lo que cuelga de ella
 * pasan a colgar de su ruta nueva.
 *
 * Sin esto, las migas de una subcarpeta ya visitada seguirían mostrando el camino viejo, y el
 * arrastre validaría destinos contra una ruta que ya no existe.
 *
 * @param rutas ruta conocida de cada carpeta, raíz primero y ella incluida
 * @param movidoId la carpeta que cambió de lugar
 * @param nuevaRuta su ruta nueva, ella incluida
 * @returns un mapa nuevo con las rutas corregidas
 */
export function reubicarRutas (
  rutas: Readonly<Record<string, readonly MigaDrive[]>>,
  movidoId: string,
  nuevaRuta: readonly MigaDrive[]
): Record<string, MigaDrive[]> {
  const corregidas: Record<string, MigaDrive[]> = {}

  for (const [id, ruta] of Object.entries(rutas)) {
    const desde = ruta.findIndex((miga) => miga.id === movidoId)
    corregidas[id] = desde < 0 ? [...ruta] : [...nuevaRuta, ...ruta.slice(desde + 1)]
  }

  return corregidas
}

/**
 * Cuenta el resultado de un borrado en una frase, con el mismo criterio que el traslado: cada fallo
 * con su nombre y su motivo.
 *
 * @param enviados ids que llegaron a la papelera
 * @param fallos los que no, con su motivo
 * @param nombreDe nombre visible de cada id
 */
export function resumenDeBorrado (
  enviados: readonly string[],
  fallos: ReadonlyArray<{ id: string, error: string }>,
  nombreDe: (id: string) => string
): string {
  const partes: string[] = []
  if (enviados.length > 0) partes.push(`${enviados.length === 1 ? '1 enviado' : `${enviados.length} enviados`} a la papelera`)
  if (fallos.length > 0) {
    const detalle = fallos.map((fallo) => `«${nombreDe(fallo.id)}»: ${fallo.error.replace(/[.\s]+$/, '')}`).join('; ')
    partes.push(`${fallos.length === 1 ? '1 falló' : `${fallos.length} fallaron`}: ${detalle}`)
  }
  return partes.length === 0 ? 'No se borró nada.' : `${partes.join(', ')}.`
}
