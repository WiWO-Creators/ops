/**
 * Los idiomas en los que se puede leer y bajar un Meeting Paper.
 *
 * El acta se escribe siempre en español —así lo pide `Prompts::ACTA` del board— y de ahí se traduce
 * a los otros. El equipo trabaja con clientes de tres países y hasta ahora el acta de una reunión
 * con un proveedor de Shenzhen salía en español y alguien la pasaba a mano por un traductor antes de
 * mandarla, que es donde se perdían las cifras.
 *
 * === POR QUE ESTA TABLA Y NO UN `Intl.DisplayNames` ===
 *
 * Porque acá no se guarda solo el nombre del idioma: se guarda todo lo que el documento necesita
 * saber para salir bien en ese idioma —el `locale` con el que se escriben las fechas largas, si la
 * tipografía de marca alcanza o hay que embeber una con glifos chinos, y el `lang` que va en el
 * `<html>` del visor—. `Intl` da el nombre y ninguna de las otras tres.
 *
 * === POR QUE EL ESPAÑOL VIVE ACA SI NO SE TRADUCE ===
 *
 * Porque el selector tiene que poder volver al original, y volver al original es elegir un idioma
 * como cualquier otro desde el lado de quien mira la pantalla. La diferencia —que el español sale de
 * `acta.content` y los otros dos de una llamada a `traducciones/{idioma}`— la resuelve
 * `esOriginal`, y es el único lugar del frontend donde esa asimetría se escribe.
 */

/** Los códigos que maneja la API. Son los de `Escritura\TraduccionDeActa::IDIOMAS` más el original. */
export type CodigoDeIdioma = 'es' | 'en' | 'zh'

export interface IdiomaDelActa {
  codigo: CodigoDeIdioma
  /** Cómo se nombra en el selector, en el idioma de la interfaz. */
  nombre: string
  /** Cómo se nombra a sí mismo. Va junto al anterior: quien busca 中文 no busca "Chino". */
  propio: string
  /** `true` solo para el español: es el acta tal como se escribió, no una traducción guardada. */
  esOriginal: boolean
  /** El `lang` del documento. Lo leen el lector de pantalla y el guionado del navegador. */
  etiquetaHtml: string
  /** Con qué `locale` se escribe una fecha larga dentro del documento. */
  locale: string
  /**
   * Si el documento necesita una tipografía con glifos CJK.
   *
   * Las tres fuentes de marca —Plus Jakarta Sans, DM Sans y Helvetica— son latinas: un PDF en chino
   * hecho con cualquiera de ellas sale con un cuadrito vacío por carácter, y sale así en silencio,
   * sin error, sin advertencia. Quien lo nota es el cliente al abrirlo.
   */
  necesitaCjk: boolean
  /** Sufijo del nombre del archivo que baja, para no pisar el PDF en español de la misma acta. */
  sufijoArchivo: string
}

export const IDIOMAS: Record<CodigoDeIdioma, IdiomaDelActa> = {
  es: {
    codigo: 'es',
    nombre: 'Español',
    propio: 'Español',
    esOriginal: true,
    etiquetaHtml: 'es-CL',
    locale: 'es-CL',
    necesitaCjk: false,
    // Vacío a propósito: el acta en español es el documento, y ponerle "-es" al archivo obligaría a
    // renombrar lo que la gente ya tiene guardado desde antes de que existieran las traducciones.
    sufijoArchivo: ''
  },
  en: {
    codigo: 'en',
    nombre: 'Inglés',
    propio: 'English',
    esOriginal: false,
    etiquetaHtml: 'en',
    // `en-US` y no `en-GB`: los clientes de fuera de la región son estadounidenses, y la diferencia
    // que importa es el orden de la fecha larga, que entre los dos se lee al revés.
    locale: 'en-US',
    necesitaCjk: false,
    sufijoArchivo: '-en'
  },
  zh: {
    codigo: 'zh',
    nombre: 'Chino',
    propio: '简体中文',
    esOriginal: false,
    // `zh-Hans` y no `zh-CN`: lo que se fija es la escritura (simplificada), que es lo que el
    // navegador necesita para elegir la fuente correcta, y no el país.
    etiquetaHtml: 'zh-Hans',
    locale: 'zh-CN',
    necesitaCjk: true,
    sufijoArchivo: '-zh'
  }
}

/** El catálogo como lista, en el orden en que se dibuja el selector: el original primero. */
export const IDIOMAS_EN_ORDEN: IdiomaDelActa[] = [IDIOMAS.es, IDIOMAS.en, IDIOMAS.zh]

/**
 * El idioma de un código, con el español como respuesta a lo que no reconoce.
 *
 * Cae al original y no lanza porque el código puede venir de una URL que alguien editó a mano: ante
 * `?idioma=fr` lo correcto es mostrar el acta, no una pantalla de error.
 */
export function idiomaDelActa (codigo: string | null | undefined): IdiomaDelActa {
  if (codigo === null || codigo === undefined) return IDIOMAS.es

  return IDIOMAS[codigo as CodigoDeIdioma] ?? IDIOMAS.es
}

/** Si un código es uno de los idiomas a los que la API traduce. El español no lo es. */
export function esIdiomaTraducible (codigo: string): boolean {
  return codigo === 'en' || codigo === 'zh'
}
