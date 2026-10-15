import { ASISTENTE } from './glosario.ts'

/**
 * La diferencia entre dos versiones de un Meeting Paper y el guion con que se reproduce.
 *
 * Cuando el Thinking Orb termina de editar el acta que alguien tiene abierta, cambiar el visor de
 * golpe esconde lo único que importa: qué tocó. Este módulo sale de las dos versiones del HTML y
 * llega a un guion —qué bloques se borran, cuáles se escriben, qué palabras cambian dentro de uno
 * que se corrige— que la capa de animación recorre como un colaborador de Google Docs.
 *
 * Todo es puro y no toca el DOM, para poder probarse con `node:test`: el HTML se lee con un
 * tokenizador propio que solo entiende las etiquetas de un acta (títulos, párrafos, listas y citas)
 * y trata lo demás como texto. No es un saneador ni pretende serlo: el resultado es texto plano por
 * bloque, y quien lo pinta lo hace con `textContent`, nunca con el HTML.
 *
 * === TRES NIVELES ===
 *
 * 1. {@link bloquesDeActa}: el HTML a bloques de primer nivel (`h1`–`h3`, `p`, `ul`/`ol` con sus `li`,
 *    `blockquote`), cada uno con su texto.
 * 2. {@link diferenciasDeUnidades}: LCS sobre los bloques. Cada `li` cuenta como un bloque propio
 *    (una {@link UnidadActa}): agregar un punto a una lista es escribir ese punto, no reescribir la
 *    lista. Lo que desaparece y lo que aparece entre dos bloques iguales se empareja por similitud
 *    y se vuelve «modificado», con su diff por palabras.
 * 3. {@link armarGuion}: los cambios a pasos ordenados y con tiempo, dentro de una duración acotada.
 */

/**
 * Etiquetas de los bloques de primer nivel de un acta.
 *
 * `hr` no lleva texto: está porque el filete que el modelo escribe tras el encabezado ocupa lugar, y
 * sin él la reproducción dibujaría el documento más corto que el visor.
 */
export type EtiquetaDeBloque = 'h1' | 'h2' | 'h3' | 'p' | 'ul' | 'ol' | 'blockquote' | 'hr'

/** Un bloque de primer nivel con su texto. */
export interface BloqueActa {
  etiqueta: EtiquetaDeBloque
  /** El texto del bloque, con el espacio colapsado. En una lista, los puntos unidos por `\n`. */
  texto: string
  /** Los puntos de una lista, en orden. Vacío en el resto de los bloques. */
  items: string[]
}

/** Etiqueta de una unidad: la de su bloque, o `li` para un punto de lista. */
export type EtiquetaDeUnidad = Exclude<EtiquetaDeBloque, 'ul' | 'ol'> | 'li'

/** La parte mínima que se compara y se anima: un título, un párrafo, una cita o un punto de lista. */
export interface UnidadActa {
  etiqueta: EtiquetaDeUnidad
  /** De qué lista es, si es un `li`. */
  lista: 'ul' | 'ol' | null
  texto: string
  /** Posición del bloque de primer nivel del que sale, para contar secciones. */
  origen: number
}

/** Cómo quedó una unidad al comparar las dos versiones. */
export type TipoDeCambio = 'igual' | 'eliminado' | 'insertado' | 'modificado'

/** Un tramo de un bloque modificado: lo que se conserva, lo que se borra o lo que se escribe. */
export interface SegmentoDePalabras {
  tipo: 'igual' | 'borrado' | 'insertado'
  palabras: string[]
}

/** El resultado de comparar una unidad. */
export interface CambioDeUnidad {
  tipo: TipoDeCambio
  /** La unidad de la versión vieja; `null` si es nueva. */
  anterior: UnidadActa | null
  /** La unidad de la versión nueva; `null` si se eliminó. */
  nuevo: UnidadActa | null
  /** El diff por palabras de un bloque modificado; `null` en el resto. */
  segmentos: SegmentoDePalabras[] | null
}

/** Lo que puede variar en la reproducción. Un solo lugar, para que las pruebas y la UI lo compartan. */
export const LIMITES_REPRODUCCION = {
  /** La reproducción dura al menos esto, aunque el cambio sea de una palabra. */
  duracionMinMs: 2500,
  /** Y como mucho esto, aunque el cambio sea una reescritura. */
  duracionMaxMs: 9000,
  /**
   * Cuánto se le resta al máximo al dimensionar. El navegador cierra la última escena un cuadro o dos
   * después de lo prometido (medido en Chromium: hasta ~300 ms), y la duración real no puede pasarse.
   */
  margenMs: 350,
  /** Cuántos bloques cambiados se animan; el resto aparece con un fundido. */
  maxBloquesAnimados: 10,
  /** Tope de HTML que se lee; lo que sobra se ignora. Una acta real pesa una fracción de esto. */
  maxCaracteresHtml: 400_000,
  /** Tope de celdas de una tabla LCS; pasado esto el tramo se trata como reemplazo completo. */
  maxCeldasLcs: 4_000_000,
  /** Similitud mínima (0 a 1) para tratar un bloque viejo y uno nuevo como el mismo editado. */
  umbralSimilitud: 0.4
} as const

/** Tiempos fijos de cada gesto, en milisegundos. Los que dependen del volumen están en el ritmo. */
export const TIEMPOS_REPRODUCCION = {
  /** Aparece el cursor antes del primer gesto. */
  intro: 500,
  /** El cursor salta de un tramo a otro dentro del mismo bloque. */
  salto: 140,
  /** Lo seleccionado se queda marcado un instante antes de borrarse. */
  pausaDeBorrado: 150,
  /** Pausa tras terminar de escribir un tramo. */
  pausaDeEscritura: 90,
  /** Se abre el hueco de un bloque nuevo. */
  creacionDeBloque: 140,
  /** Se cierra el hueco de un bloque eliminado. */
  colapsoDeBloque: 320,
  /** Entran los bloques que no se animaron. */
  fundido: 520,
  /** El cursor se va y la capa se apaga. */
  salida: 480
} as const

/** El ritmo con que se reproduce, ajustado al volumen del cambio. */
export interface RitmoDeReproduccion {
  /** Lo que tarda en escribirse una palabra. */
  msPorPalabra: number
  /** Lo que tarda en marcarse una palabra al seleccionar. */
  msPorPalabraMarcada: number
  /** Lo que tarda el cursor en llegar a un bloque (desplazamiento incluido). */
  msDeLlegada: number
  /** Espera de relleno al final, para llegar al mínimo de duración en cambios chicos. */
  esperaFinalMs: number
}

/** Una parte de un paso: un tramo que se borra o se escribe. */
export interface ParteDePaso {
  tipo: 'borrado' | 'insertado'
  palabras: number
}

/** Un gesto del guion: llegar a un bloque y borrarlo, escribirlo o corregirlo. */
export interface PasoGuion {
  /** Posición de la entrada en {@link Guion.entradas}. */
  indice: number
  accion: 'eliminar' | 'insertar' | 'editar'
  partes: ParteDePaso[]
  duracionMs: number
}

/** Una unidad del documento de trabajo, en el orden en que queda. */
export interface EntradaDeGuion {
  cambio: CambioDeUnidad
  /** Si se reproduce con cursor. Una entrada cambiada y no animada aparece con el fundido final. */
  animada: boolean
}

/** El guion completo de una reproducción. */
export interface Guion {
  /** El documento de trabajo: parte de la versión vieja y termina en la nueva. */
  entradas: EntradaDeGuion[]
  /** Los gestos, en el orden del documento. */
  pasos: PasoGuion[]
  ritmo: RitmoDeReproduccion
  duracionMs: number
  /** Cuántas secciones (bloques de primer nivel) cambiaron. */
  secciones: number
  /** Cuántas unidades cambiaron. */
  unidadesCambiadas: number
  /** Hay cambios que se muestran con fundido en vez de con cursor. */
  hayFundido: boolean
  /** Las dos versiones difieren en el texto de algún bloque. */
  hayCambios: boolean
}

// ---------------------------------------------------------------------------------------------
// 1. Del HTML a bloques
// ---------------------------------------------------------------------------------------------

const ETIQUETAS_DE_BLOQUE: Readonly<Record<string, EtiquetaDeBloque>> = {
  h1: 'h1', h2: 'h2', h3: 'h3', h4: 'h3', h5: 'h3', h6: 'h3', p: 'p', ul: 'ul', ol: 'ol', blockquote: 'blockquote'
}

/** Etiquetas que no cortan el texto: su contenido sigue siendo parte del bloque que las rodea. */
const ETIQUETAS_EN_LINEA = new Set([
  'a', 'abbr', 'b', 'strong', 'i', 'em', 'u', 's', 'strike', 'del', 'ins', 'mark', 'small', 'sub',
  'sup', 'span', 'code', 'kbd', 'q', 'cite', 'font', 'big', 'label', 'time', 'var'
])

/** Etiquetas cuyo contenido no es texto del documento. */
const ETIQUETAS_A_OMITIR = new Set(['script', 'style', 'template', 'noscript', 'head', 'title'])

const ENTIDADES_NOMBRADAS: Readonly<Record<string, string>> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', iquest: '¿', iexcl: '¡', ntilde: 'ñ',
  Ntilde: 'Ñ', aacute: 'á', eacute: 'é', iacute: 'í', oacute: 'ó', uacute: 'ú', Aacute: 'Á',
  Eacute: 'É', Iacute: 'Í', Oacute: 'Ó', Uacute: 'Ú', uuml: 'ü', Uuml: 'Ü', mdash: '—', ndash: '–',
  hellip: '…', laquo: '«', raquo: '»', ldquo: '“', rdquo: '”', lsquo: '‘', rsquo: '’', bull: '•',
  middot: '·', deg: '°', euro: '€'
}

/** Una etiqueta, un comentario o el texto entre ellos. Las comillas dentro de una etiqueta pueden llevar `>`. */
const PATRON_DE_ETIQUETA = /<!--[\s\S]*?(?:-->|$)|<(\/?)([a-zA-Z][a-zA-Z0-9]*)(?:"[^"]*"|'[^']*'|[^>"'])*>/g

/**
 * Convierte las entidades HTML más comunes en su carácter.
 *
 * Solo las numéricas y las nombradas de la tabla: una entidad desconocida se deja tal cual, que es
 * lo que haría un lector que no la entiende.
 *
 * @param texto texto con entidades
 * @returns el texto con los caracteres
 */
function decodificarEntidades (texto: string): string {
  return texto.replace(/&(#x[0-9a-fA-F]+|#[0-9]+|[a-zA-Z]+);/g, (entera, cuerpo: string) => {
    if (cuerpo.startsWith('#')) {
      const codigo = cuerpo[1] === 'x' || cuerpo[1] === 'X' ? parseInt(cuerpo.slice(2), 16) : parseInt(cuerpo.slice(1), 10)

      return Number.isInteger(codigo) && codigo > 0 && codigo <= 0x10ffff ? String.fromCodePoint(codigo) : entera
    }

    return ENTIDADES_NOMBRADAS[cuerpo] ?? entera
  })
}

/**
 * Colapsa el espacio en blanco: una sola raya entre palabras y nada en los bordes.
 *
 * @param texto texto crudo
 * @returns el texto normalizado
 */
function normalizarEspacio (texto: string): string {
  return texto.replace(/\s+/g, ' ').trim()
}

/** Un bloque mientras se lee. */
interface BloqueEnCurso {
  etiqueta: EtiquetaDeBloque
  /** El nombre tal como venía (`h4` se guarda como `h3`, pero se cierra con `</h4>`). */
  cruda: string
  partes: string[]
  items: string[]
  /** El punto de lista abierto, o `null` si no hay ninguno. */
  item: string[] | null
  /** Cuántos bloques del mismo nombre se abrieron adentro y aún no se cerraron. */
  anidados: number
}

/**
 * Lee un acta y devuelve sus bloques de primer nivel con su texto.
 *
 * Lo que no es de la lista (`div`, tablas, `pre`) no es un bloque: su texto se vuelve un párrafo
 * suelto. Dentro de un bloque todo lo demás es texto: una cita con párrafos adentro es una sola cita,
 * una lista anidada aporta sus puntos a la lista de arriba. Un bloque sin texto no cuenta. HTML
 * vacío, roto o que no sea una cadena da una lista vacía; nunca lanza.
 *
 * @param html el cuerpo del acta
 * @returns los bloques, en orden de documento
 */
export function bloquesDeActa (html: string): BloqueActa[] {
  if (typeof html !== 'string' || html === '') return []

  const fuente = html.length > LIMITES_REPRODUCCION.maxCaracteresHtml
    ? html.slice(0, LIMITES_REPRODUCCION.maxCaracteresHtml)
    : html
  const minusculas = fuente.toLowerCase()
  const bloques: BloqueActa[] = []
  const suelto: string[] = []
  let bloque: BloqueEnCurso | null = null

  /** Cierra el párrafo suelto, si juntó texto. */
  const soltarParrafo = (): void => {
    const texto = normalizarEspacio(suelto.join(''))

    suelto.length = 0
    if (texto !== '') bloques.push({ etiqueta: 'p', texto, items: [] })
  }

  /** Cierra el punto de lista abierto. */
  const cerrarItem = (actual: BloqueEnCurso): void => {
    if (actual.item === null) return

    const texto = normalizarEspacio(actual.item.join(''))

    actual.item = null
    if (texto !== '') actual.items.push(texto)
  }

  /** Cierra el bloque abierto y lo suma si tiene texto. */
  const cerrarBloque = (): void => {
    if (bloque === null) return

    const actual: BloqueEnCurso = bloque

    bloque = null
    if (actual.etiqueta === 'ul' || actual.etiqueta === 'ol') {
      cerrarItem(actual)
      if (actual.items.length > 0) bloques.push({ etiqueta: actual.etiqueta, texto: actual.items.join('\n'), items: actual.items })

      return
    }

    const texto = normalizarEspacio(actual.partes.join(''))

    if (texto !== '') bloques.push({ etiqueta: actual.etiqueta, texto, items: [] })
  }

  /** Suma texto al bloque abierto (o al punto de lista abierto), o al párrafo suelto. */
  const agregar = (texto: string): void => {
    if (bloque === null) {
      suelto.push(texto)

      return
    }
    if (bloque.etiqueta === 'ul' || bloque.etiqueta === 'ol') {
      bloque.item ??= []
      bloque.item.push(texto)

      return
    }
    bloque.partes.push(texto)
  }

  const abrirBloque = (etiqueta: EtiquetaDeBloque, cruda: string): void => {
    bloque = { etiqueta, cruda, partes: [], items: [], item: null, anidados: 0 }
  }

  /** Una etiqueta de apertura. */
  const alAbrir = (nombre: string): void => {
    const etiqueta = ETIQUETAS_DE_BLOQUE[nombre]

    if (nombre === 'br') return agregar(' ')

    if (nombre === 'hr' && bloque === null) {
      soltarParrafo()
      bloques.push({ etiqueta: 'hr', texto: '', items: [] })

      return
    }

    if (etiqueta !== undefined) {
      if (bloque === null) {
        soltarParrafo()
        abrirBloque(etiqueta, nombre)

        return
      }
      const contenedor = bloque.etiqueta === 'blockquote' || bloque.etiqueta === 'ul' || bloque.etiqueta === 'ol'

      if (contenedor) {
        if (bloque.cruda === nombre) bloque.anidados++
        // Un párrafo o una lista dentro de una cita (o un párrafo dentro de un punto) es texto de ella.
        if (nombre !== 'ul' && nombre !== 'ol') return agregar(' ')

        return
      }
      // `<p>a<p>b`: abrir un bloque cierra el que estaba abierto.
      cerrarBloque()
      abrirBloque(etiqueta, nombre)

      return
    }

    if (nombre === 'li') {
      if (bloque === null) abrirBloque('ul', 'ul')
      if (bloque !== null && (bloque.etiqueta === 'ul' || bloque.etiqueta === 'ol')) {
        cerrarItem(bloque)
        bloque.item = []

        return
      }

      return agregar(' ')
    }

    if (ETIQUETAS_EN_LINEA.has(nombre)) return
    if (bloque === null) soltarParrafo()
    else agregar(' ')
  }

  /** Una etiqueta de cierre. */
  const alCerrar = (nombre: string): void => {
    if (bloque !== null && nombre === bloque.cruda) {
      if (bloque.anidados > 0) bloque.anidados--
      else cerrarBloque()

      return
    }
    if (nombre === 'li' && bloque !== null && (bloque.etiqueta === 'ul' || bloque.etiqueta === 'ol')) {
      cerrarItem(bloque)

      return
    }
    if (ETIQUETAS_DE_BLOQUE[nombre] !== undefined || ETIQUETAS_EN_LINEA.has(nombre)) return
    if (bloque === null) soltarParrafo()
    else agregar(' ')
  }

  PATRON_DE_ETIQUETA.lastIndex = 0
  let desde = 0
  let encontrado = PATRON_DE_ETIQUETA.exec(fuente)

  while (encontrado !== null) {
    if (encontrado.index > desde) agregar(decodificarEntidades(fuente.slice(desde, encontrado.index)))
    desde = PATRON_DE_ETIQUETA.lastIndex

    const nombre = encontrado[2]?.toLowerCase()

    if (nombre !== undefined) {
      if (encontrado[1] === '/') {
        alCerrar(nombre)
      } else if (ETIQUETAS_A_OMITIR.has(nombre)) {
        const cierre = minusculas.indexOf(`</${nombre}`, desde)
        const fin = cierre === -1 ? -1 : minusculas.indexOf('>', cierre)

        desde = fin === -1 ? fuente.length : fin + 1
        PATRON_DE_ETIQUETA.lastIndex = desde
      } else {
        alAbrir(nombre)
      }
    }

    encontrado = PATRON_DE_ETIQUETA.exec(fuente)
  }

  if (desde < fuente.length) agregar(decodificarEntidades(fuente.slice(desde)))

  cerrarBloque()
  soltarParrafo()

  return bloques
}

/**
 * Descompone los bloques en unidades: cada punto de una lista es una unidad propia.
 *
 * @param bloques los bloques de primer nivel
 * @returns las unidades, en orden, con la posición del bloque de donde salen
 */
export function unidadesDeBloques (bloques: readonly BloqueActa[]): UnidadActa[] {
  const unidades: UnidadActa[] = []

  bloques.forEach((bloque, origen) => {
    if (bloque.etiqueta === 'ul' || bloque.etiqueta === 'ol') {
      for (const item of bloque.items) unidades.push({ etiqueta: 'li', lista: bloque.etiqueta, texto: item, origen })

      return
    }
    unidades.push({ etiqueta: bloque.etiqueta, lista: null, texto: bloque.texto, origen })
  })

  return unidades
}

// ---------------------------------------------------------------------------------------------
// 2. Diff
// ---------------------------------------------------------------------------------------------

/** Lo que identifica a una unidad: dos con la misma clave son la misma. */
function claveDe (unidad: UnidadActa): string {
  return `${unidad.etiqueta}|${unidad.lista ?? ''}|${unidad.texto}`
}

/**
 * Parte un texto en palabras.
 *
 * @param texto texto normalizado
 * @returns las palabras, sin espacios
 */
export function palabrasDe (texto: string): string[] {
  return texto.split(/\s+/).filter((palabra) => palabra !== '')
}

/**
 * Los pares (posición en `a`, posición en `b`) de una subsecuencia común más larga.
 *
 * Recorta el prefijo y el sufijo comunes antes de armar la tabla. Si la tabla pasa el tope de celdas
 * devuelve solo esos extremos: el tramo del medio queda como reemplazo completo.
 *
 * @param a primera secuencia
 * @param b segunda secuencia
 * @returns los pares emparejados, en orden creciente
 */
function parejasLcs (a: readonly string[], b: readonly string[]): Array<[number, number]> {
  const parejas: Array<[number, number]> = []
  let inicio = 0

  while (inicio < a.length && inicio < b.length && a[inicio] === b[inicio]) {
    parejas.push([inicio, inicio])
    inicio++
  }

  let finA = a.length
  let finB = b.length
  const sufijo: Array<[number, number]> = []

  while (finA > inicio && finB > inicio && a[finA - 1] === b[finB - 1]) {
    finA--
    finB--
    sufijo.push([finA, finB])
  }

  const n = finA - inicio
  const m = finB - inicio

  if (n > 0 && m > 0 && (n + 1) * (m + 1) <= LIMITES_REPRODUCCION.maxCeldasLcs) {
    const ancho = m + 1
    const tabla = new Uint16Array((n + 1) * ancho)

    for (let i = n - 1; i >= 0; i--) {
      for (let j = m - 1; j >= 0; j--) {
        tabla[i * ancho + j] = a[inicio + i] === b[inicio + j]
          ? (tabla[(i + 1) * ancho + j + 1] ?? 0) + 1
          : Math.max(tabla[(i + 1) * ancho + j] ?? 0, tabla[i * ancho + j + 1] ?? 0)
      }
    }

    let i = 0
    let j = 0

    while (i < n && j < m) {
      if (a[inicio + i] === b[inicio + j]) {
        parejas.push([inicio + i, inicio + j])
        i++
        j++
      } else if ((tabla[(i + 1) * ancho + j] ?? 0) >= (tabla[i * ancho + j + 1] ?? 0)) {
        i++
      } else {
        j++
      }
    }
  }

  return parejas.concat(sufijo.reverse())
}

/**
 * El diff por palabras entre dos textos.
 *
 * Los tramos salen en orden de lectura y, entre dos palabras que se conservan, lo borrado va antes
 * que lo escrito: así se lee la edición («esto sale, esto entra»). Tramos contiguos del mismo tipo se
 * unen.
 *
 * @param antes el texto viejo
 * @param despues el texto nuevo
 * @returns los tramos; vacío si los dos textos están vacíos
 */
export function diferenciasDePalabras (antes: string, despues: string): SegmentoDePalabras[] {
  const a = palabrasDe(antes)
  const b = palabrasDe(despues)
  const segmentos: SegmentoDePalabras[] = []

  /** Suma palabras a un tramo, uniéndolo con el anterior si es del mismo tipo. */
  const sumar = (tipo: SegmentoDePalabras['tipo'], palabras: string[]): void => {
    if (palabras.length === 0) return

    const ultimo = segmentos[segmentos.length - 1]

    if (ultimo?.tipo === tipo) ultimo.palabras.push(...palabras)
    else segmentos.push({ tipo, palabras: [...palabras] })
  }

  let i = 0
  let j = 0

  for (const [pa, pb] of parejasLcs(a, b)) {
    sumar('borrado', a.slice(i, pa))
    sumar('insertado', b.slice(j, pb))
    sumar('igual', [a[pa] ?? ''])
    i = pa + 1
    j = pb + 1
  }
  sumar('borrado', a.slice(i))
  sumar('insertado', b.slice(j))

  return segmentos
}

/**
 * Cuánto se parecen dos textos, de 0 a 1: el coeficiente de Dice sobre sus palabras.
 *
 * @param a un texto
 * @param b otro texto
 * @returns 0 si no comparten ninguna palabra, 1 si tienen las mismas
 */
function similitudDe (a: string, b: string): number {
  const palabrasA = palabrasDe(a.toLowerCase())
  const palabrasB = palabrasDe(b.toLowerCase())

  if (palabrasA.length === 0 || palabrasB.length === 0) return 0

  const cuenta = new Map<string, number>()

  for (const palabra of palabrasA) cuenta.set(palabra, (cuenta.get(palabra) ?? 0) + 1)

  let comunes = 0

  for (const palabra of palabrasB) {
    const quedan = cuenta.get(palabra) ?? 0

    if (quedan > 0) {
      comunes++
      cuenta.set(palabra, quedan - 1)
    }
  }

  return (2 * comunes) / (palabrasA.length + palabrasB.length)
}

/** Si una unidad vieja puede ser la misma que una nueva, editada: mismo tipo de bloque y con texto. */
function sonComparables (a: UnidadActa, b: UnidadActa): boolean {
  return a.etiqueta === b.etiqueta && a.lista === b.lista && a.etiqueta !== 'hr'
}

/**
 * Resuelve un tramo entre dos unidades iguales: lo que salió y lo que entró.
 *
 * Empareja por similitud conservando el orden (programación dinámica sobre la similitud total) y
 * exige el mismo tipo de bloque. Un único bloque que sale frente a un único bloque que entra, del
 * mismo tipo, se empareja aunque no se parezcan: es el mismo lugar reescrito, y el cursor no tiene
 * por qué irse a otro. Lo que no se empareja es `eliminado` o `insertado`; lo borrado va antes.
 *
 * @param viejas unidades que estaban y ya no
 * @param nuevas unidades que aparecen
 * @returns los cambios, en el orden del documento
 */
function resolverTramo (viejas: readonly UnidadActa[], nuevas: readonly UnidadActa[]): CambioDeUnidad[] {
  const d = viejas.length
  const n = nuevas.length
  const cambios: CambioDeUnidad[] = []

  const eliminar = (unidad: UnidadActa): void => { cambios.push({ tipo: 'eliminado', anterior: unidad, nuevo: null, segmentos: null }) }
  const insertar = (unidad: UnidadActa): void => { cambios.push({ tipo: 'insertado', anterior: null, nuevo: unidad, segmentos: null }) }
  const modificar = (anterior: UnidadActa, nuevo: UnidadActa): void => {
    cambios.push({ tipo: 'modificado', anterior, nuevo, segmentos: diferenciasDePalabras(anterior.texto, nuevo.texto) })
  }

  const unica = d === 1 && n === 1
  const [soloVieja, soloNueva] = [viejas[0], nuevas[0]]

  if (unica && soloVieja !== undefined && soloNueva !== undefined && sonComparables(soloVieja, soloNueva)) {
    modificar(soloVieja, soloNueva)

    return cambios
  }

  if (d === 0 || n === 0 || d * n > 2500) {
    viejas.forEach(eliminar)
    nuevas.forEach(insertar)

    return cambios
  }

  /** Similitud de cada par permitido; `-1` si no se pueden emparejar. */
  const puntaje = (i: number, j: number): number => {
    const vieja = viejas[i]
    const nueva = nuevas[j]

    if (vieja === undefined || nueva === undefined || !sonComparables(vieja, nueva)) return -1

    const similitud = similitudDe(vieja.texto, nueva.texto)

    return similitud >= LIMITES_REPRODUCCION.umbralSimilitud ? similitud : -1
  }

  const ancho = n + 1
  const mejor = new Float64Array((d + 1) * ancho)

  for (let i = d - 1; i >= 0; i--) {
    for (let j = n - 1; j >= 0; j--) {
      const emparejar = puntaje(i, j)

      mejor[i * ancho + j] = Math.max(
        mejor[(i + 1) * ancho + j] ?? 0,
        mejor[i * ancho + j + 1] ?? 0,
        emparejar >= 0 ? (mejor[(i + 1) * ancho + j + 1] ?? 0) + emparejar : 0
      )
    }
  }

  let i = 0
  let j = 0

  while (i < d || j < n) {
    const vieja = viejas[i]
    const nueva = nuevas[j]
    const emparejar = i < d && j < n ? puntaje(i, j) : -1

    if (vieja !== undefined && nueva !== undefined && emparejar >= 0
      && (mejor[i * ancho + j] ?? 0) === (mejor[(i + 1) * ancho + j + 1] ?? 0) + emparejar) {
      modificar(vieja, nueva)
      i++
      j++
    } else if (vieja !== undefined && (nueva === undefined || (mejor[i * ancho + j] ?? 0) === (mejor[(i + 1) * ancho + j] ?? 0))) {
      eliminar(vieja)
      i++
    } else if (nueva !== undefined) {
      insertar(nueva)
      j++
    }
  }

  return cambios
}

/**
 * Compara dos listas de unidades y dice qué es igual, qué se eliminó, qué se insertó y qué se
 * modificó.
 *
 * Primero un LCS sobre las unidades exactas; lo que queda entre dos unidades iguales se resuelve con
 * {@link resolverTramo}. Con dos listas iguales todo es `igual`; con una vacía, todo es `insertado`
 * o `eliminado`.
 *
 * @param viejas las unidades de la versión anterior
 * @param nuevas las unidades de la versión nueva
 * @returns un cambio por unidad del documento de trabajo, en orden
 */
export function diferenciasDeUnidades (viejas: readonly UnidadActa[], nuevas: readonly UnidadActa[]): CambioDeUnidad[] {
  const cambios: CambioDeUnidad[] = []
  const parejas = parejasLcs(viejas.map(claveDe), nuevas.map(claveDe))
  let i = 0
  let j = 0

  /** Resuelve lo que hay entre la posición actual y el próximo ancla. */
  const tramo = (hastaI: number, hastaJ: number): void => {
    cambios.push(...resolverTramo(viejas.slice(i, hastaI), nuevas.slice(j, hastaJ)))
  }

  for (const [pi, pj] of parejas) {
    tramo(pi, pj)
    cambios.push({ tipo: 'igual', anterior: viejas[pi] ?? null, nuevo: nuevas[pj] ?? null, segmentos: null })
    i = pi + 1
    j = pj + 1
  }
  tramo(viejas.length, nuevas.length)

  return cambios
}

// ---------------------------------------------------------------------------------------------
// 3. Guion y ritmo
// ---------------------------------------------------------------------------------------------

/** Los tiempos base de un gesto, antes de ajustarlos al volumen del cambio. */
const RITMO_BASE = { msPorPalabra: 90, msPorPalabraMarcada: 20, msDeLlegada: 420 } as const

/** Factores con que se acelera el ritmo base hasta que la reproducción cabe en el máximo. */
const FACTORES_DE_VELOCIDAD = [1, 0.92, 0.84, 0.76, 0.68, 0.6, 0.52, 0.45, 0.38, 0.32, 0.28] as const

/** Cuánto se enlentece, como mucho, para que un cambio chico no pase volando. */
const FACTOR_MAXIMO_DE_LENTITUD = 1.5

/** Lo que tarda en marcarse un tramo de `palabras` palabras. */
export function msDeSeleccion (palabras: number, ritmo: RitmoDeReproduccion): number {
  return Math.max(1, palabras) * ritmo.msPorPalabraMarcada
}

/** Lo que tarda en escribirse un tramo de `palabras` palabras. */
export function msDeEscritura (palabras: number, ritmo: RitmoDeReproduccion): number {
  return Math.max(1, palabras) * ritmo.msPorPalabra
}

/**
 * Lo que dura un paso con un ritmo dado.
 *
 * La capa de animación arma su línea de tiempo con estas mismas funciones: si el cálculo viviera
 * en dos lados, la duración que se promete y la que se ve se irían separando.
 *
 * @param paso el paso
 * @param ritmo el ritmo
 * @returns milisegundos
 */
export function duracionDePaso (paso: Pick<PasoGuion, 'accion' | 'partes'>, ritmo: RitmoDeReproduccion): number {
  let total = ritmo.msDeLlegada

  if (paso.accion === 'insertar') total += TIEMPOS_REPRODUCCION.creacionDeBloque

  paso.partes.forEach((parte, posicion) => {
    if (posicion > 0) total += TIEMPOS_REPRODUCCION.salto
    total += parte.tipo === 'borrado'
      ? msDeSeleccion(parte.palabras, ritmo) + TIEMPOS_REPRODUCCION.pausaDeBorrado
      : msDeEscritura(parte.palabras, ritmo) + TIEMPOS_REPRODUCCION.pausaDeEscritura
  })

  if (paso.accion === 'eliminar') total += TIEMPOS_REPRODUCCION.colapsoDeBloque

  return total
}

/**
 * Las partes (tramos que se borran o se escriben) de un cambio.
 *
 * @param cambio el cambio de una unidad
 * @returns las partes en orden de lectura; vacío si no hay nada que reproducir
 */
function partesDe (cambio: CambioDeUnidad): ParteDePaso[] {
  if (cambio.tipo === 'eliminado') return [{ tipo: 'borrado', palabras: palabrasDe(cambio.anterior?.texto ?? '').length }]
  if (cambio.tipo === 'insertado') return [{ tipo: 'insertado', palabras: palabrasDe(cambio.nuevo?.texto ?? '').length }]

  return (cambio.segmentos ?? [])
    .filter((segmento) => segmento.tipo !== 'igual')
    .map((segmento) => ({ tipo: segmento.tipo === 'borrado' ? 'borrado' : 'insertado', palabras: segmento.palabras.length }))
}

/**
 * Arma los pasos para unas posiciones de entradas y les busca un ritmo que quepa en el rango de
 * duración.
 *
 * @param indices posiciones, en el documento de trabajo, de los cambios que se animan
 * @param entradas el documento de trabajo
 * @param hayFundido si quedan cambios que entran con fundido
 * @returns los pasos con su duración, el ritmo y la duración total; `null` si no caben en el máximo
 */
function planificar (
  indices: readonly number[],
  entradas: readonly EntradaDeGuion[],
  hayFundido: boolean
): { pasos: PasoGuion[], ritmo: RitmoDeReproduccion, duracionMs: number } | null {
  const bosquejo = indices.map((indice) => {
    const cambio = entradas[indice]?.cambio

    return {
      indice,
      accion: cambio?.tipo === 'eliminado' ? 'eliminar' : cambio?.tipo === 'insertado' ? 'insertar' : 'editar',
      partes: cambio === undefined ? [] : partesDe(cambio)
    } satisfies Omit<PasoGuion, 'duracionMs'>
  })
  const fijos = TIEMPOS_REPRODUCCION.intro + TIEMPOS_REPRODUCCION.salida + (hayFundido ? TIEMPOS_REPRODUCCION.fundido : 0)
  const techo = LIMITES_REPRODUCCION.duracionMaxMs - LIMITES_REPRODUCCION.margenMs

  /** Duración total con un ritmo y los pasos con su duración. */
  const con = (ritmo: RitmoDeReproduccion): { pasos: PasoGuion[], total: number } => {
    const pasos = bosquejo.map((paso) => ({ ...paso, duracionMs: duracionDePaso(paso, ritmo) }))

    return { pasos, total: fijos + pasos.reduce((suma, paso) => suma + paso.duracionMs, 0) }
  }

  const ritmoDe = (factor: number, esperaFinalMs = 0): RitmoDeReproduccion => ({
    msPorPalabra: Math.round(RITMO_BASE.msPorPalabra * factor),
    msPorPalabraMarcada: Math.max(10, Math.round(RITMO_BASE.msPorPalabraMarcada * factor)),
    msDeLlegada: Math.round(RITMO_BASE.msDeLlegada * Math.max(0.6, Math.min(1, factor))),
    esperaFinalMs
  })

  for (const factor of FACTORES_DE_VELOCIDAD) {
    const ritmo = ritmoDe(factor)
    const { pasos, total } = con(ritmo)

    if (total > techo) continue

    if (total >= LIMITES_REPRODUCCION.duracionMinMs) return { pasos, ritmo, duracionMs: total }

    // Corto: se enlentece lo que el cambio permite y el resto se rellena con espera al final.
    const lento = ritmoDe(FACTOR_MAXIMO_DE_LENTITUD)
    const respuesta = con(lento)
    const elegido = respuesta.total <= techo ?{ ritmo: lento, ...respuesta } : { ritmo, pasos, total }
    const espera = Math.max(0, LIMITES_REPRODUCCION.duracionMinMs - elegido.total)

    return {
      pasos: elegido.pasos,
      ritmo: { ...elegido.ritmo, esperaFinalMs: espera },
      duracionMs: elegido.total + espera
    }
  }

  return null
}

/**
 * Cuenta las secciones (bloques de primer nivel) que tocan los cambios.
 *
 * Un bloque eliminado se cuenta por su posición en la versión vieja; el resto, por la nueva. Una
 * lista con tres puntos cambiados es una sección, no tres.
 *
 * @param cambios los cambios de unidad
 * @returns cuántas secciones distintas cambiaron
 */
function contarSecciones (cambios: readonly CambioDeUnidad[]): number {
  const secciones = new Set<string>()

  for (const cambio of cambios) {
    if (cambio.tipo === 'igual') continue
    if (cambio.nuevo !== null) secciones.add(`n${cambio.nuevo.origen}`)
    else if (cambio.anterior !== null) secciones.add(`a${cambio.anterior.origen}`)
  }

  return secciones.size
}

/**
 * Compara dos versiones del acta y arma el guion de la reproducción.
 *
 * Anima los primeros bloques cambiados, hasta el tope y hasta donde quepa en la duración máxima con
 * el ritmo más rápido; el resto de los cambios aparece con un fundido al final. La velocidad por
 * palabra se ajusta al volumen: un cambio chico se escribe despacio, uno grande, rápido.
 *
 * @param htmlAnterior el cuerpo que se estaba viendo
 * @param htmlNuevo el cuerpo que llegó
 * @returns el guion; con `hayCambios` en `false` si el texto de los bloques es el mismo
 */
export function armarGuion (htmlAnterior: string, htmlNuevo: string): Guion {
  const cambios = diferenciasDeUnidades(
    unidadesDeBloques(bloquesDeActa(htmlAnterior)),
    unidadesDeBloques(bloquesDeActa(htmlNuevo))
  )
  const posiciones = cambios.flatMap((cambio, posicion) => (cambio.tipo === 'igual' ? [] : [posicion]))
  const sinCambios: Guion = {
    entradas: cambios.map((cambio) => ({ cambio, animada: false })),
    pasos: [],
    ritmo: { ...RITMO_BASE, esperaFinalMs: 0 },
    duracionMs: 0,
    secciones: 0,
    unidadesCambiadas: 0,
    hayFundido: false,
    hayCambios: false
  }

  if (posiciones.length === 0) return sinCambios

  const entradas: EntradaDeGuion[] = cambios.map((cambio) => ({ cambio, animada: false }))
  // Un filete que aparece o desaparece no tiene palabras que escribir: entra con el fundido.
  const animables = posiciones.filter((posicion) => {
    const { anterior, nuevo } = cambios[posicion] ?? { anterior: null, nuevo: null }

    return (nuevo ?? anterior)?.etiqueta !== 'hr'
  })

  for (let cuantas = Math.min(animables.length, LIMITES_REPRODUCCION.maxBloquesAnimados); cuantas >= 0; cuantas--) {
    const animadas = animables.slice(0, cuantas)
    const plan = planificar(animadas, entradas, cuantas < posiciones.length)

    if (plan === null && cuantas > 0) continue

    // Con cero bloques animados solo queda el fundido: nada que dimensionar.
    const ritmo = plan?.ritmo ?? { ...RITMO_BASE, esperaFinalMs: 0 }

    animadas.forEach((posicion) => {
      const entrada = entradas[posicion]

      if (entrada !== undefined) entrada.animada = true
    })

    return {
      entradas,
      pasos: plan?.pasos ?? [],
      ritmo,
      duracionMs: plan?.duracionMs ?? LIMITES_REPRODUCCION.duracionMinMs,
      secciones: contarSecciones(cambios),
      unidadesCambiadas: posiciones.length,
      hayFundido: cuantas < posiciones.length,
      hayCambios: true
    }
  }

  return sinCambios
}

/**
 * El resumen que se anuncia a quien usa un lector de pantalla y que se muestra sin animación.
 *
 * @param secciones cuántas secciones cambiaron
 * @param asistente cómo se llama el asistente; por defecto, el de la interfaz
 * @returns por ejemplo «Thinking Orb actualizó 3 secciones»
 */
export function resumenDeCambios (secciones: number, asistente: string = ASISTENTE): string {
  const cuantas = Math.max(1, secciones)

  return `${asistente} actualizó ${cuantas} ${cuantas === 1 ? 'sección' : 'secciones'}`
}
