/**
 * El Meeting Paper como PDF, con la cara de la marca que lo firma.
 *
 * === POR QUE PDFMAKE Y NO EL DIALOGO DE IMPRESION ===
 *
 * `window.print()` sobre el visor habría sido menos código, pero el archivo lo arma el navegador:
 * cada uno pone su encabezado, sus márgenes y su numeración, Chromium no imprime fondos salvo que
 * el usuario marque una casilla —y ahí la banda de la marca desaparece— y el resultado es un
 * diálogo, no una descarga. Con pdfmake el documento se escribe acá: el mismo PDF para todos, y
 * baja solo.
 *
 * === POR QUE EL TEXTO ES TEXTO ===
 *
 * Nada de rasterizar la pantalla. Un acta es un documento que se busca, se cita y se copia: se
 * construye párrafo a párrafo desde los bloques (`acta-bloques.ts`), los mismos que alimentan el
 * DOCX, para que los dos formatos digan exactamente lo mismo.
 *
 * === QUE SE CARGA Y CUANDO ===
 *
 * pdfmake pesa más de 2 MB y las tipografías de marca otro tanto. Todo eso entra por `import()`
 * dentro de `descargarPdf`, así que la pantalla del acta no arrastra ni un byte hasta que alguien
 * pide la descarga.
 */

import type {
  Column,
  Content,
  ContentImage,
  ContentText,
  CustomTableLayout,
  Margins,
  TDocumentDefinitions
} from 'pdfmake/interfaces'
import type { Bloque, Fragmento } from './acta-bloques.ts'
import type { CodigoDeMarca, TemaDeMarca } from './marcas-acta.ts'
import { descargar, fechaLarga, nombreDeArchivo, type MetaDelActa } from './exportar-acta.ts'

/** La paleta de una marca, ya en el formato que entiende pdfmake: hexadecimales sueltos. */
export interface ColoresDeMarca {
  /** Títulos y texto destacado. */
  tinta: string
  /** El cuerpo del documento. */
  texto: string
  /** Viñetas y barra de las citas. */
  acento: string
  /** Filetes: el de la cabecera, el del título de sección y el separador. */
  filete: string
  /** Fondo de la banda de cabecera. */
  banda: string
  /** Lo que se escribe encima de la banda. */
  bandaTinta: string
  /** El rótulo «Meeting Paper» de la cabecera. */
  rotulo: string
  /** Fondo suave de las citas. */
  citaFondo: string
}

/**
 * Los colores de cada marca.
 *
 * No se eligieron acá: son los mismos valores que `cssDeMarcas()` declara como variables CSS para
 * el visor y el editor (`marcas-acta.ts`), copiados uno a uno —`--marca-tinta`, `--marca-texto`,
 * `--marca-acento`, `--marca-filete`, `--marca-banda`, `--marca-banda-tinta`, `--marca-rotulo` y
 * `--marca-cita-fondo`—. Están duplicados porque un PDF no lee CSS, y si algún día cambia un color
 * hay que cambiarlo en los dos lados: el visor y el PDF tienen que verse iguales.
 *
 * Palta no define `--marca-rotulo` y su CSS cae a `--marca-banda-tinta`; acá esa caída está escrita
 * a mano, que es lo mismo que hace el `var(--marca-rotulo, var(--marca-banda-tinta))` de la hoja.
 */
export const COLORES: Record<CodigoDeMarca, ColoresDeMarca> = {
  wiwo: {
    tinta: '#161715',
    texto: '#3B3C38',
    acento: '#3BFF00',
    filete: '#3BFF00',
    banda: '#161715',
    bandaTinta: '#F4F5F2',
    rotulo: '#3BFF00',
    citaFondo: '#F4F7F2'
  },
  palta: {
    tinta: '#141414',
    texto: '#2B2B2B',
    acento: '#20BB4E',
    filete: '#64F545',
    banda: '#EFEFEF',
    bandaTinta: '#141414',
    rotulo: '#141414',
    citaFondo: '#F3F7F3'
  },
  mgc: {
    tinta: '#12121A',
    texto: '#4A4A5A',
    acento: '#F9063B',
    filete: '#F9063B',
    banda: '#0D0D12',
    bandaTinta: '#FAFAFA',
    rotulo: '#F9063B',
    citaFondo: '#F5F5F5'
  }
}

/** Los cuatro archivos de una familia, con los nombres que pdfmake usa como claves de su vfs. */
interface ArchivosDeFuente {
  normal: string
  bold: string
  italics: string
  bolditalics: string
}

/** La tipografía de una marca: o cuatro archivos que se suben al vfs, o una fuente base del PDF. */
interface FuenteDeMarca {
  familia: string
  /** `null` cuando la familia ya viene con el formato PDF y no hay nada que embeber. */
  archivos: ArchivosDeFuente | null
}

/**
 * La tipografía de cada marca.
 *
 * Palta usa Helvetica, una de las catorce familias que todo lector de PDF trae puesta: no se
 * embebe nada y el archivo pesa lo mismo. WiWO y MGC usan las suyas —Plus Jakarta Sans y DM Sans,
 * las mismas que declara `cssDeMarcas()`— y esas sí viajan dentro del documento, porque un PDF que
 * depende de la fuente instalada en el computador del cliente no es el documento que se firmó.
 *
 * Los TTF estáticos se sirven desde este mismo dominio (`public/fonts/marca/`) y se descargan solo
 * al exportar: son cerca de 400 KB por marca y no tienen por qué estar en el paquete de la página.
 */
const FUENTES: Record<CodigoDeMarca, FuenteDeMarca> = {
  wiwo: {
    familia: 'PlusJakartaSans',
    archivos: {
      normal: 'PlusJakartaSans-Regular.ttf',
      bold: 'PlusJakartaSans-Bold.ttf',
      italics: 'PlusJakartaSans-Italic.ttf',
      bolditalics: 'PlusJakartaSans-BoldItalic.ttf'
    }
  },
  mgc: {
    familia: 'DMSans',
    archivos: {
      normal: 'DMSans-Regular.ttf',
      bold: 'DMSans-Bold.ttf',
      italics: 'DMSans-Italic.ttf',
      bolditalics: 'DMSans-BoldItalic.ttf'
    }
  },
  palta: { familia: 'Helvetica', archivos: null }
}

/** Carpeta pública de la que salen los TTF de marca. */
const CARPETA_FUENTES = '/fonts/marca/'

/** La familia que pdfmake trae de fábrica, y el plan B si la de la marca no llega. */
const FUENTE_DE_RESERVA = 'Roboto'

/** Ancho de la hoja A4 en puntos, que es la unidad en la que se mide todo el documento. */
const ANCHO_A4 = 595.28

/** Margen izquierdo y derecho. */
const MARGEN_LATERAL = 44

/** Ancho útil entre márgenes: lo que miden los filetes y el separador. */
const ANCHO_UTIL = ANCHO_A4 - MARGEN_LATERAL * 2

/** Puntos por `rem`. El tema da el alto del logo en `rem` (1rem = 16px) y el PDF mide en puntos. */
const PUNTOS_POR_REM = 12

/**
 * Descarga el acta como PDF.
 *
 * Baja sola, sin diálogo de impresión: se arma el documento, se pide el blob y se entrega con el
 * mismo `descargar()` que usa el DOCX, para que las dos exportaciones se comporten igual.
 *
 * @param bloques el acta ya convertida (`acta-bloques.ts`)
 * @param tema la marca que firma el documento
 * @param meta la cabecera: título, cliente, fecha, lugar y autor
 * @throws Error si pdfmake no logra construir el documento
 */
export async function descargarPdf (bloques: Bloque[], tema: TemaDeMarca, meta: MetaDelActa): Promise<void> {
  const pdfMake = await pdfmakeDelNavegador()
  const fuente = await registrarFuente(pdfMake, tema)
  const definicion = await documentoDelActa(bloques, tema, meta, fuente)
  const blob = await pdfMake.createPdf(definicion).getBlob()

  descargar(blob, nombreDeArchivo(meta, 'pdf'))
}

/** La API de pdfmake tal como la declara `@types/pdfmake`. */
type ApiPdfmake = typeof import('pdfmake/build/pdfmake')

/**
 * pdfmake, cargado recién cuando hace falta.
 *
 * Se pide el bundle de navegador (`build/pdfmake`) y no el paquete raíz, que apunta a la versión de
 * Node: esa lee fuentes del disco y en el navegador ni siquiera arranca.
 */
async function pdfmakeDelNavegador (): Promise<ApiPdfmake> {
  const modulo = await import('pdfmake/build/pdfmake')

  // El bundle es UMD y su `module.exports` ya es la instancia, pero un empaquetador que lo trate
  // como CommonJS la deja colgando de `default`. Se aceptan las dos formas antes que apostar.
  const envuelto = modulo as unknown as { default?: ApiPdfmake }

  return envuelto.default ?? modulo
}

/** Familias ya cargadas en esta pestaña: registrarlas de nuevo sería volver a bajar los TTF. */
const familiasRegistradas = new Set<string>()

/**
 * Deja lista la tipografía de la marca y devuelve el nombre con el que se la nombra en el documento.
 *
 * Si algo falla —un TTF que no está, una red caída— el acta igual se exporta con Roboto: un PDF con
 * otra tipografía sirve; un botón que no hace nada, no.
 */
async function registrarFuente (pdfMake: ApiPdfmake, tema: TemaDeMarca): Promise<string> {
  const fuente = FUENTES[tema.codigo]

  if (familiasRegistradas.has(fuente.familia)) return fuente.familia

  try {
    if (fuente.archivos === null) {
      await registrarHelvetica(pdfMake)
    } else {
      await registrarFamiliaPropia(pdfMake, fuente.familia, fuente.archivos)
    }

    familiasRegistradas.add(fuente.familia)

    return fuente.familia
  } catch {
    await registrarRoboto(pdfMake)

    return FUENTE_DE_RESERVA
  }
}

/**
 * Sube al vfs de pdfmake las métricas de Helvetica.
 *
 * La fuente no se embebe —el lector de PDF ya la tiene—, pero pdfmake necesita sus tablas de anchos
 * para saber dónde cortar cada línea, y el bundle de navegador no las trae adentro: viven en un
 * archivo aparte que se pide solo cuando el acta es de Palta.
 */
async function registrarHelvetica (pdfMake: ApiPdfmake): Promise<void> {
  // @ts-expect-error El contenedor de fuentes estándar de pdfmake no tiene tipos publicados; su
  // forma es la que documenta `addFontContainer`: `{ vfs, fonts }`.
  const modulo = await import('pdfmake/build/standard-fonts/Helvetica.js')
  const contenedor = modulo as unknown as { default?: Parameters<ApiPdfmake['addFontContainer']>[0] }

  if (contenedor.default === undefined) throw new Error('El contenedor de Helvetica llegó vacío.')

  pdfMake.addFontContainer(contenedor.default)
}

/** Baja los cuatro TTF de la marca y los registra como una familia más. */
async function registrarFamiliaPropia (
  pdfMake: ApiPdfmake,
  familia: string,
  archivos: ArchivosDeFuente
): Promise<void> {
  const nombres = [archivos.normal, archivos.bold, archivos.italics, archivos.bolditalics]
  const cargados = await Promise.all(nombres.map(async (nombre) => {
    return [nombre, await base64DeUrl(`${CARPETA_FUENTES}${nombre}`)] as const
  }))
  const vfs: Record<string, string> = {}

  for (const [nombre, contenido] of cargados) vfs[nombre] = contenido

  pdfMake.addVirtualFileSystem(vfs)
  pdfMake.addFonts({ [familia]: archivos })
}

/** Sube Roboto al vfs. Solo se pide si la tipografía de la marca no llegó. */
async function registrarRoboto (pdfMake: ApiPdfmake): Promise<void> {
  if (familiasRegistradas.has(FUENTE_DE_RESERVA)) return

  const vfs = await import('pdfmake/build/vfs_fonts')

  pdfMake.addVirtualFileSystem(vfs.default)
  familiasRegistradas.add(FUENTE_DE_RESERVA)
}

/**
 * El contenido de un archivo público en base64, que es como pdfmake recibe todo lo binario.
 *
 * @throws Error si el archivo no está: quien llama decide si eso hunde la exportación o no
 */
async function base64DeUrl (url: string): Promise<string> {
  const respuesta = await fetch(url)

  if (!respuesta.ok) throw new Error(`No se pudo leer ${url}: ${respuesta.status}.`)

  const bytes = new Uint8Array(await respuesta.arrayBuffer())
  const trozo = 8192
  let binario = ''

  // De a trozos y no de una: `String.fromCharCode(...bytes)` con un TTF de 120 KB revienta la pila
  // de argumentos del motor.
  for (let inicio = 0; inicio < bytes.length; inicio += trozo) {
    binario += String.fromCharCode(...bytes.subarray(inicio, inicio + trozo))
  }

  return btoa(binario)
}

/**
 * La definición completa del documento.
 *
 * Es lo único asíncrono del armado: el logotipo se trae por red y viaja como data URL, porque una
 * imagen remota dentro de un PDF sale como un hueco y nadie se entera hasta abrirlo.
 */
async function documentoDelActa (
  bloques: Bloque[],
  tema: TemaDeMarca,
  meta: MetaDelActa,
  fuente: string
): Promise<TDocumentDefinitions> {
  const colores = COLORES[tema.codigo]

  return {
    pageSize: 'A4',
    pageMargins: [MARGEN_LATERAL, 44, MARGEN_LATERAL, 58],
    info: {
      title: meta.titulo,
      author: meta.autor,
      subject: `Meeting Paper · ${meta.cliente}`,
      creator: tema.nombre
    },
    defaultStyle: { font: fuente, fontSize: 10.5, lineHeight: 1.35, color: colores.texto },
    content: [
      await cabeceraDeMarca(tema, colores),
      { text: meta.titulo, fontSize: 21, bold: true, color: colores.tinta, margin: [0, 16, 0, 4] },
      { text: fichaDelActa(meta), fontSize: 9.5, color: colores.texto, margin: [0, 0, 0, 16] },
      ...contenidoDeBloques(bloques, tema)
    ],
    footer: (pagina: number, total: number) => pieDelActa(tema, colores, pagina, total)
  }
}

/** La línea bajo el título: cliente, fecha y lugar, saltándose lo que el acta no registró. */
function fichaDelActa (meta: MetaDelActa): string {
  return [meta.cliente, fechaLarga(meta.fecha), meta.lugar]
    .map((dato) => dato.trim())
    .filter((dato) => dato !== '')
    .join('  ·  ')
}

/**
 * La banda de cabecera: fondo de la marca, su logotipo y el rótulo del documento.
 *
 * Va como tabla de una celda y no como rectángulo dibujado porque el alto tiene que salir del
 * contenido: un `canvas` obliga a fijarlo a mano y cada logotipo tiene su propia proporción.
 *
 * Si el logotipo no se puede traer, la banda sale igual con el nombre de la marca escrito: un acta
 * sin firma se nota, pero es mejor que una exportación caída.
 */
async function cabeceraDeMarca (tema: TemaDeMarca, colores: ColoresDeMarca): Promise<Content> {
  const alto = Number.parseFloat(tema.altoLogo) * PUNTOS_POR_REM
  const marca = await logotipoDeMarca(tema, colores, alto)

  return {
    table: {
      widths: ['*'],
      body: [[{
        columns: [
          marca,
          {
            text: 'MEETING PAPER',
            width: 'auto',
            alignment: 'right',
            color: colores.rotulo,
            fontSize: 8,
            bold: true,
            characterSpacing: 1.4,
            margin: [0, alto - 9, 0, 0]
          }
        ],
        columnGap: 16
      }]]
    },
    layout: bandaDeCabecera(colores),
    margin: [0, 0, 0, 4]
  }
}

/** El logotipo como imagen, o el nombre de la marca si la imagen no llegó. */
async function logotipoDeMarca (tema: TemaDeMarca, colores: ColoresDeMarca, alto: number): Promise<Column> {
  try {
    const base64 = await base64DeUrl(tema.logo)
    // Sin `width`: la columna se queda con el espacio libre y `fit` mantiene la proporción del
    // logotipo dentro de esa caja. Un ancho fijo estiraría a unas marcas y achicaría a otras.
    const imagen: ContentImage = { image: `data:image/png;base64,${base64}`, fit: [190, alto] }

    return imagen
  } catch {
    const nombre: ContentText = { text: tema.nombre, color: colores.bandaTinta, fontSize: 15, bold: true }

    return nombre
  }
}

/** Banda llena del color de la marca y cerrada abajo por su filete. */
function bandaDeCabecera (colores: ColoresDeMarca): CustomTableLayout {
  return {
    hLineWidth: (indice, nodo) => indice === nodo.table.body.length ? 3 : 0,
    vLineWidth: () => 0,
    hLineColor: () => colores.filete,
    fillColor: () => colores.banda,
    paddingLeft: () => 16,
    paddingRight: () => 16,
    paddingTop: () => 14,
    paddingBottom: () => 14
  }
}

/** El pie firmado, repetido en cada página y con la numeración a la derecha. */
function pieDelActa (tema: TemaDeMarca, colores: ColoresDeMarca, pagina: number, total: number): Content {
  return {
    margin: [MARGEN_LATERAL, 12, MARGEN_LATERAL, 0],
    stack: [
      filete(colores.filete, 1, [0, 0, 0, 0]),
      {
        columns: [
          { text: tema.pie, color: colores.tinta, fontSize: 8.5, bold: true },
          { text: `${pagina} / ${total}`, color: colores.texto, fontSize: 8.5, alignment: 'right' }
        ],
        margin: [0, 6, 0, 0]
      }
    ]
  }
}

/**
 * El cuerpo del acta, bloque por bloque, con los colores de la marca.
 *
 * Función pura y exportada a propósito: es todo lo que se puede probar sin navegador, porque el
 * resto del módulo vive de `fetch` y de la descarga (`pruebas/exportar-pdf.test.js`).
 *
 * Un título de nivel 2 devuelve dos elementos —el texto y su filete— y por eso la lista es plana:
 * envolverlos en un `stack` los pegaría a la página como un bloque indivisible.
 */
export function contenidoDeBloques (bloques: Bloque[], tema: TemaDeMarca): Content[] {
  const colores = COLORES[tema.codigo]
  const contenido: Content[] = []

  for (const bloque of bloques) {
    contenido.push(...elementosDelBloque(bloque, colores))
  }

  return contenido
}

/** Lo que un bloque aporta al documento: casi siempre un elemento, dos si el título lleva filete. */
function elementosDelBloque (bloque: Bloque, colores: ColoresDeMarca): Content[] {
  if (bloque.tipo === 'titulo') return elementosDelTitulo(bloque.nivel, bloque.texto, colores)

  if (bloque.tipo === 'parrafo') {
    return [{ text: fragmentos(bloque.texto, colores), margin: [0, 0, 0, 7] }]
  }

  if (bloque.tipo === 'lista') {
    const items = bloque.items.map((item) => ({ text: fragmentos(item, colores) }))

    // El color del marcador sale de la hoja del visor: viñeta en el acento de la marca, numeración
    // en su tinta.
    return bloque.ordenada
      ? [{ ol: items, markerColor: colores.tinta, margin: [0, 0, 0, 8] }]
      : [{ ul: items, markerColor: colores.acento, margin: [0, 0, 0, 8] }]
  }

  if (bloque.tipo === 'cita') {
    return [{
      table: { widths: ['*'], body: [[{ text: fragmentos(bloque.texto, colores) }]] },
      layout: marcoDeCita(colores),
      margin: [0, 2, 0, 10]
    }]
  }

  return [filete(colores.filete, 1, [0, 6, 0, 12])]
}

/** Tamaños y espacios de cada nivel de título, en puntos. */
const TITULOS: Record<1 | 2 | 3 | 4, { tamano: number, arriba: number, abajo: number }> = {
  1: { tamano: 17, arriba: 14, abajo: 7 },
  2: { tamano: 13.5, arriba: 15, abajo: 3 },
  3: { tamano: 11.5, arriba: 11, abajo: 3 },
  4: { tamano: 10.5, arriba: 9, abajo: 2 }
}

/**
 * El título y, si es de nivel 2, el filete de la marca que va debajo.
 *
 * Ese filete es lo único que pinta el color de marca a lo largo de todo el documento —así está
 * escrito en `cssDeMarcas()`— y es lo que hace reconocible al acta de un vistazo.
 */
function elementosDelTitulo (nivel: 1 | 2 | 3 | 4, texto: Fragmento[], colores: ColoresDeMarca): Content[] {
  const medidas = TITULOS[nivel]
  const titulo: Content = {
    text: fragmentos(texto, colores),
    fontSize: medidas.tamano,
    bold: true,
    color: colores.tinta,
    margin: [0, medidas.arriba, 0, medidas.abajo]
  }

  if (nivel !== 2) return [titulo]

  return [titulo, filete(colores.filete, 2, [0, 0, 0, 9])]
}

/** Barra de color a la izquierda y fondo suave: la cita, igual que en el visor. */
function marcoDeCita (colores: ColoresDeMarca): CustomTableLayout {
  return {
    hLineWidth: () => 0,
    vLineWidth: (indice) => indice === 0 ? 3 : 0,
    vLineColor: () => colores.acento,
    fillColor: () => colores.citaFondo,
    paddingLeft: () => 12,
    paddingRight: () => 12,
    paddingTop: () => 9,
    paddingBottom: () => 9
  }
}

/** Una línea horizontal del ancho útil de la página. */
function filete (color: string, grosor: number, margen: Margins): Content {
  return {
    canvas: [{ type: 'line', x1: 0, y1: 0, x2: ANCHO_UTIL, y2: 0, lineWidth: grosor, lineColor: color }],
    margin: margen
  }
}

/** Los fragmentos de un bloque como texto en línea, con sus marcas puestas. */
function fragmentos (texto: Fragmento[], colores: ColoresDeMarca): ContentText[] {
  return texto.map((fragmento) => unFragmento(fragmento, colores))
}

/**
 * Un fragmento con sus marcas.
 *
 * La negrita además tiñe: el visor pinta `strong` con la tinta de la marca, y un PDF donde lo
 * destacado es del mismo gris que el resto destaca bastante menos.
 */
function unFragmento (fragmento: Fragmento, colores: ColoresDeMarca): ContentText {
  const enLinea: ContentText = {
    text: fragmento.texto,
    bold: fragmento.negrita === true,
    italics: fragmento.cursiva === true
  }

  if (fragmento.subrayado === true) enLinea.decoration = 'underline'
  if (fragmento.negrita === true) enLinea.color = colores.tinta

  return enLinea
}
