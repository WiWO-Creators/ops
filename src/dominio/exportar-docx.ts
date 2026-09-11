/**
 * El Meeting Paper como archivo .docx, con la cara de la marca que lo firma.
 *
 * === POR QUE UN DOCX DE VERDAD Y NO UN HTML RENOMBRADO ===
 *
 * Un `.doc` que por dentro es HTML lo abre Word, sí, pero al primer "guardar como" el cliente pierde
 * el formato entero, y ni la vista de esquema ni el panel de navegación reconocen los títulos. Acá
 * el documento se arma párrafo a párrafo con OOXML real (`docx`), así que los títulos son títulos,
 * las listas son listas y el acta se puede seguir editando en Word sin que se deshaga.
 *
 * === COMO SE REPARTE EL TRABAJO ===
 *
 * `parrafosDeBloques()` es una función pura: recibe los bloques (`acta-bloques.ts`) y el tema
 * (`marcas-acta.ts`) y devuelve párrafos. Ahí está toda la traducción de un formato al otro, y por
 * eso es lo que se prueba en Node (`pruebas/exportar-docx.test.js`). `descargarDocx()` es la capa de
 * navegador: descarga el logotipo con `fetch`, monta el documento y lo entrega. Eso no se prueba
 * porque no hay nada que probar: son cuatro llamadas seguidas.
 *
 * === LA TIPOGRAFIA NO VIAJA ===
 *
 * Word no empaqueta las fuentes dentro del archivo, así que la familia solo se puede pedir por
 * nombre: 'Plus Jakarta Sans' para WiWO, 'DM Sans' para MGC y 'Helvetica Neue' para Palta. Si quien
 * abre el acta no las tiene instaladas, Word cae a la suya y el documento se lee igual, con otra
 * letra. Es el mismo trato que hace el visor cuando la `@font-face` no llega, y no hay forma de
 * evitarlo sin incrustar un binario de fuente en cada acta.
 */

import {
  AlignmentType,
  BorderStyle,
  Document,
  HeadingLevel,
  ImageRun,
  LevelFormat,
  Packer,
  Paragraph,
  ShadingType,
  TextRun,
  UnderlineType,
  type INumberingOptions
} from 'docx'
import type { Bloque, Fragmento } from './acta-bloques.ts'
import { descargar, fechaLarga, nombreDeArchivo, type MetaDelActa } from './exportar-acta.ts'
import type { CodigoDeMarca, TemaDeMarca } from './marcas-acta.ts'

/** Cómo se pinta una marca dentro de Word. Los colores van en hexadecimal sin `#`, que es lo que pide OOXML. */
interface EstiloDeMarca {
  /** Títulos y énfasis: el color con el que la marca escribe lo importante. */
  tinta: string
  /** El cuerpo del texto. */
  texto: string
  /** El color con el que la marca se señala a sí misma: viñetas y borde de la cita. */
  acento: string
  /** El color de los filetes: bajo los títulos de sección, en el separador y en el pie. */
  filete: string
  /** Fondo suave de las citas. */
  citaFondo: string
  /** La familia tipográfica, pedida por nombre (ver la cabecera del archivo). */
  fuente: string
}

/**
 * Los colores de cada marca, copiados de `cssDeMarcas()` en `marcas-acta.ts`.
 *
 * Es la misma tabla que ya existe como variables CSS, traducida al formato que pide OOXML —sin `#`—
 * porque el visor y el Word tienen que salir del mismo lugar: si mañana cambia el rojo de MGC, se
 * cambia en los dos y no en cinco. Lo que no se copió es la banda oscura de la cabecera
 * (`--marca-banda`): el Word se imprime sobre papel blanco y una banda a sangre no es lo que Word
 * hace bien; de ahí que MGC firme con su logotipo negro.
 *
 * Por marca, el origen de cada valor:
 *
 * - **WiWO**: `--marca-tinta` #161715, `--marca-texto` #3B3C38, `--marca-acento` y `--marca-filete`
 *   #3BFF00 (el `--wiwo-green` del sistema Neo), `--marca-cita-fondo` #F4F7F2. El verde neón nunca
 *   es texto —sobre blanco da 1.3:1— y acá tampoco: solo filetes, viñetas y bordes.
 * - **Palta**: `--marca-tinta` #141414, `--marca-texto` #2B2B2B, `--marca-acento` #20BB4E,
 *   `--marca-filete` #64F545, `--marca-cita-fondo` #F3F7F3.
 * - **MGC**: `--marca-tinta` #12121A, `--marca-texto` #4A4A5A, `--marca-acento` y `--marca-filete`
 *   #F9063B, `--marca-cita-fondo` #F5F5F5.
 */
export const ESTILO_DOCX: Record<CodigoDeMarca, EstiloDeMarca> = {
  wiwo: {
    tinta: '161715',
    texto: '3B3C38',
    acento: '3BFF00',
    filete: '3BFF00',
    citaFondo: 'F4F7F2',
    fuente: 'Plus Jakarta Sans'
  },
  palta: {
    tinta: '141414',
    texto: '2B2B2B',
    acento: '20BB4E',
    filete: '64F545',
    citaFondo: 'F3F7F3',
    fuente: 'Helvetica Neue'
  },
  mgc: {
    tinta: '12121A',
    texto: '4A4A5A',
    acento: 'F9063B',
    filete: 'F9063B',
    citaFondo: 'F5F5F5',
    fuente: 'DM Sans'
  }
}

/** Nombre de la numeración con viñeta que declara el documento. */
export const REFERENCIA_VINETA = 'acta-vineta'

/** Nombre de la numeración correlativa que declara el documento. */
export const REFERENCIA_ORDENADA = 'acta-ordenada'

/** Tamaños en medios puntos, que es como OOXML mide la letra: 22 son 11 pt. */
const TAMANO_CUERPO = 22
const TAMANO_META = 20
const TAMANO_PIE = 18
const TAMANO_TITULAR = 48
const TAMANO_TITULO: Record<1 | 2 | 3 | 4, number> = { 1: 34, 2: 28, 3: 24, 4: 22 }

/** El estilo de Word que corresponde a cada nivel, para que el panel de navegación vea la estructura. */
const NIVEL_DE_TITULO: Record<1 | 2 | 3 | 4, (typeof HeadingLevel)[keyof typeof HeadingLevel]> = {
  1: HeadingLevel.HEADING_1,
  2: HeadingLevel.HEADING_2,
  3: HeadingLevel.HEADING_3,
  4: HeadingLevel.HEADING_4
}

/** Grosores de filete en octavos de punto: 12 son el 1.5 pt del filete bajo los títulos de sección. */
const FILETE_TITULO = 12
const FILETE_CITA = 18
const FILETE_LINEA = 8

/** Sangría de las listas, en twips (1/1440 de pulgada): el texto entra y el número cuelga afuera. */
const SANGRIA_LISTA = { left: 480, hanging: 240 }

/** Píxeles por `rem`, para leer el `altoLogo` del tema —que viene en `rem`— como tamaño de imagen. */
const PX_POR_REM = 16

/** El logotipo listo para incrustar: los bytes del PNG y el tamaño con el que se dibuja. */
interface LogoDeMarca {
  datos: ArrayBuffer
  ancho: number
  alto: number
}

/**
 * Los párrafos del cuerpo del acta, en el orden en que se leen.
 *
 * Función pura y exportada a propósito: es donde vive la traducción de bloque a párrafo, y así se
 * prueba en Node sin navegador, sin `fetch` y sin descargar nada.
 *
 * Las listas ordenadas van con una instancia distinta cada una para que la segunda lista del acta
 * empiece de nuevo en 1: compartiendo instancia, Word continúa la cuenta de la anterior y los
 * acuerdos de la última sección aparecen numerados del 7 al 9.
 *
 * @param bloques el acta ya convertida por `acta-bloques.ts`
 * @param tema la marca que firma el documento
 */
export function parrafosDeBloques (bloques: Bloque[], tema: TemaDeMarca): Paragraph[] {
  const estilo = ESTILO_DOCX[tema.codigo]
  const parrafos: Paragraph[] = []
  let instanciaOrdenada = 0

  for (const bloque of bloques) {
    if (bloque.tipo === 'titulo') {
      parrafos.push(parrafoDeTitulo(bloque.nivel, bloque.texto, estilo))
      continue
    }

    if (bloque.tipo === 'lista') {
      if (bloque.ordenada) instanciaOrdenada += 1

      for (const item of bloque.items) {
        parrafos.push(parrafoDeItem(item, bloque.ordenada, instanciaOrdenada, estilo))
      }

      continue
    }

    if (bloque.tipo === 'cita') {
      parrafos.push(parrafoDeCita(bloque.texto, estilo))
      continue
    }

    if (bloque.tipo === 'separador') {
      parrafos.push(parrafoDeSeparador(estilo))
      continue
    }

    parrafos.push(new Paragraph({
      spacing: { after: 140, line: 276 },
      children: runsDe(bloque.texto, estilo, estilo.texto, TAMANO_CUERPO)
    }))
  }

  return parrafos
}

/**
 * El título de una sección, con el filete de marca bajo los de nivel 2.
 *
 * El filete solo va en el nivel 2 porque es así en el visor: es el único lugar donde el color de
 * marca recorre el documento entero, y ponerlo en todos los niveles lo convertiría en ruido.
 * `keepNext` evita el caso feo de un título al final de la página y su párrafo en la siguiente.
 */
function parrafoDeTitulo (nivel: 1 | 2 | 3 | 4, texto: Fragmento[], estilo: EstiloDeMarca): Paragraph {
  return new Paragraph({
    heading: NIVEL_DE_TITULO[nivel],
    keepNext: true,
    spacing: { before: nivel === 1 ? 240 : 320, after: 140 },
    border: nivel === 2
      ? { bottom: { style: BorderStyle.SINGLE, color: estilo.filete, size: FILETE_TITULO, space: 4 } }
      : undefined,
    children: runsDe(texto, estilo, estilo.tinta, TAMANO_TITULO[nivel])
  })
}

/** Un item de lista: numerado correlativo o con viñeta, según el bloque del que viene. */
function parrafoDeItem (
  item: Fragmento[],
  ordenada: boolean,
  instancia: number,
  estilo: EstiloDeMarca
): Paragraph {
  return new Paragraph({
    numbering: ordenada
      ? { reference: REFERENCIA_ORDENADA, level: 0, instance: instancia }
      : { reference: REFERENCIA_VINETA, level: 0 },
    spacing: { after: 60, line: 276 },
    children: runsDe(item, estilo, estilo.texto, TAMANO_CUERPO)
  })
}

/** La cita: borde izquierdo del color de la marca y fondo suave, como el `blockquote` del visor. */
function parrafoDeCita (texto: Fragmento[], estilo: EstiloDeMarca): Paragraph {
  return new Paragraph({
    border: { left: { style: BorderStyle.SINGLE, color: estilo.acento, size: FILETE_CITA, space: 12 } },
    shading: { type: ShadingType.CLEAR, fill: estilo.citaFondo },
    indent: { left: 360, right: 360 },
    spacing: { before: 160, after: 160, line: 276 },
    children: runsDe(texto, estilo, estilo.texto, TAMANO_CUERPO)
  })
}

/**
 * El separador: un párrafo vacío cuyo borde inferior es la línea.
 *
 * Word no tiene un `<hr>`; lo que se ve como línea horizontal siempre es el borde de un párrafo, y
 * `includeIfEmpty` es lo que hace que ese párrafo sin texto conserve sus propiedades al escribirse.
 */
function parrafoDeSeparador (estilo: EstiloDeMarca): Paragraph {
  return new Paragraph({
    border: { bottom: { style: BorderStyle.SINGLE, color: estilo.filete, size: FILETE_LINEA, space: 1 } },
    includeIfEmpty: true,
    spacing: { before: 200, after: 200 },
    children: []
  })
}

/**
 * Los fragmentos de un bloque como runs de Word, cada uno con sus marcas.
 *
 * Un run por fragmento y no uno por párrafo: es justo lo que permite que la mitad de una frase vaya
 * en negrita. La negrita además sube al color de tinta, igual que en el visor (`.acta-marca strong`),
 * para que el énfasis se lea igual en los dos formatos.
 */
function runsDe (
  fragmentos: Fragmento[],
  estilo: EstiloDeMarca,
  color: string,
  tamano: number
): TextRun[] {
  // Las marcas que no están se omiten en vez de mandarse en `false`: un `<w:b w:val="false"/>` en
  // cada run apaga la negrita que el estilo del párrafo ya trae, y los títulos saldrían delgados.
  return fragmentos.map((fragmento) => new TextRun({
    text: fragmento.texto,
    bold: fragmento.negrita === true ? true : undefined,
    italics: fragmento.cursiva === true ? true : undefined,
    underline: fragmento.subrayado === true ? { type: UnderlineType.SINGLE } : undefined,
    color: fragmento.negrita === true ? estilo.tinta : color,
    font: estilo.fuente,
    size: tamano
  }))
}

/**
 * Las dos numeraciones que declara el documento, teñidas con el color de la marca.
 *
 * Va aparte de los párrafos porque OOXML lo pide así: el párrafo solo apunta a una numeración por
 * su nombre y la definición vive una vez en el documento. Quien construya un documento con
 * `parrafosDeBloques()` tiene que declarar también esto, o Word mostrará las listas sin marcador.
 */
export function numeracionDeMarca (tema: TemaDeMarca): INumberingOptions {
  const estilo = ESTILO_DOCX[tema.codigo]

  return {
    config: [
      {
        reference: REFERENCIA_VINETA,
        levels: [{
          level: 0,
          format: LevelFormat.BULLET,
          text: '•',
          alignment: AlignmentType.LEFT,
          style: {
            run: { color: estilo.acento, font: estilo.fuente },
            paragraph: { indent: SANGRIA_LISTA }
          }
        }]
      },
      {
        reference: REFERENCIA_ORDENADA,
        levels: [{
          level: 0,
          format: LevelFormat.DECIMAL,
          text: '%1.',
          alignment: AlignmentType.LEFT,
          style: {
            run: { color: estilo.tinta, font: estilo.fuente },
            paragraph: { indent: SANGRIA_LISTA }
          }
        }]
      }
    ]
  }
}

/**
 * La cabecera: el logotipo, el título del acta y la línea de quién, cuándo y dónde.
 *
 * Va en el cuerpo y no en el encabezado de página de Word a propósito: el encabezado se repite en
 * todas las hojas, y un acta de seis páginas con el logo y la fecha seis veces se lee como un
 * formulario. Acá la marca se presenta una vez, como en el visor.
 *
 * @param logo el logotipo ya descargado, o `null` si no se pudo traer
 */
function cabeceraDelActa (tema: TemaDeMarca, meta: MetaDelActa, logo: LogoDeMarca | null): Paragraph[] {
  const estilo = ESTILO_DOCX[tema.codigo]
  const parrafos: Paragraph[] = []

  if (logo !== null) {
    parrafos.push(new Paragraph({
      spacing: { after: 220 },
      children: [new ImageRun({
        type: 'png',
        data: logo.datos,
        transformation: { width: logo.ancho, height: logo.alto },
        altText: { name: tema.nombre, title: tema.nombre, description: `Logotipo de ${tema.nombre}` }
      })]
    }))
  }

  parrafos.push(new Paragraph({
    spacing: { after: 60 },
    children: [new TextRun({
      text: meta.titulo,
      bold: true,
      color: estilo.tinta,
      font: estilo.fuente,
      size: TAMANO_TITULAR
    })]
  }))

  // Los datos que falten no dejan separadores huérfanos: un acta sin lugar no debe decir "· ·".
  const datos = [meta.cliente, fechaLarga(meta.fecha), meta.lugar].filter((dato) => dato !== '')

  parrafos.push(new Paragraph({
    border: { bottom: { style: BorderStyle.SINGLE, color: estilo.filete, size: FILETE_LINEA, space: 8 } },
    spacing: { after: 360 },
    children: [new TextRun({
      text: datos.join('  ·  '),
      color: estilo.texto,
      font: estilo.fuente,
      size: TAMANO_META
    })]
  }))

  return parrafos
}

/** El pie firmado: quién levantó el acta y quién la escribió. */
function pieDelActa (tema: TemaDeMarca, meta: MetaDelActa): Paragraph[] {
  const estilo = ESTILO_DOCX[tema.codigo]
  const firma = meta.autor === '' ? tema.pie : `${tema.pie}  ·  ${meta.autor}`

  return [new Paragraph({
    border: { top: { style: BorderStyle.SINGLE, color: estilo.filete, size: FILETE_LINEA, space: 10 } },
    spacing: { before: 480 },
    children: [new TextRun({
      text: firma,
      bold: true,
      color: estilo.tinta,
      font: estilo.fuente,
      size: TAMANO_PIE
    })]
  })]
}

/**
 * El logotipo de la marca, descargado del propio dominio y medido.
 *
 * MGC se firma acá con su logotipo negro y no con el blanco que usa la pantalla: en el visor el logo
 * va sobre una banda casi negra, pero el Word sale sobre papel blanco y blanco sobre blanco no se ve.
 *
 * Devuelve `null` si la imagen no llega. Un acta sin logotipo no es lo ideal, pero un botón de
 * exportar que no entrega nada porque falló un PNG es bastante peor: el texto es lo que el cliente
 * necesita. El tamaño sale del alto del tema —que viene en `rem`— y de las dimensiones nativas del
 * PNG, para no deformar ningún logotipo ni tener que anotar a mano la proporción de cada uno.
 */
async function logoDeMarca (tema: TemaDeMarca): Promise<LogoDeMarca | null> {
  const ruta = tema.codigo === 'mgc' ? '/marca/actas/mgc.png' : tema.logo

  try {
    const respuesta = await fetch(ruta)

    if (!respuesta.ok) return null

    const datos = await respuesta.arrayBuffer()

    // El bloque IHDR de un PNG siempre ocupa los bytes 16 a 24: ancho y alto, cuatro bytes cada uno.
    if (datos.byteLength < 24) return null

    const cabecera = new DataView(datos)
    const anchoNativo = cabecera.getUint32(16)
    const altoNativo = cabecera.getUint32(20)

    if (anchoNativo === 0 || altoNativo === 0) return null

    const alto = Math.round(parseFloat(tema.altoLogo) * PX_POR_REM)

    return { datos, ancho: Math.round(alto * anchoNativo / altoNativo), alto }
  } catch {
    return null
  }
}

/**
 * Arma el .docx del acta y lo entrega al navegador.
 *
 * @param bloques el acta convertida por `acta-bloques.ts`
 * @param tema la marca que firma
 * @param meta la cabecera del acta, la misma que se ve en pantalla
 */
export async function descargarDocx (
  bloques: Bloque[],
  tema: TemaDeMarca,
  meta: MetaDelActa
): Promise<void> {
  const logo = await logoDeMarca(tema)

  const documento = new Document({
    title: meta.titulo,
    creator: meta.autor,
    description: `Meeting Paper de ${meta.cliente}`,
    numbering: numeracionDeMarca(tema),
    sections: [{
      children: [
        ...cabeceraDelActa(tema, meta, logo),
        ...parrafosDeBloques(bloques, tema),
        ...pieDelActa(tema, meta)
      ]
    }]
  })

  descargar(await Packer.toBlob(documento), nombreDeArchivo(meta, 'docx'))
}
