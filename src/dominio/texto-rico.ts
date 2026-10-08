/**
 * Texto enriquecido: el HTML que escribe el editor, y como leerlo sin inyectarlo en la pagina.
 *
 * Todo lo de aca es puro —sin DOM, sin React, sin `fetch`—, y por eso corre bajo `node --test`
 * (`pruebas/texto-rico.test.js`). Lo usan el editor (`EditorRico`), el presentador (`Contenido`) y
 * las validaciones de vacio de tickets, tareas y comentarios.
 *
 * === POR QUE HAY UN TOKENIZADOR Y NO `dangerouslySetInnerHTML` ===
 *
 * La interfaz no inyecta HTML nunca. `nodosDeHtml` lee el marcado con una lista blanca de etiquetas y
 * devuelve un arbol de datos; `Contenido` lo convierte en elementos de React, que escapan el texto
 * por construccion. Lo que la lista blanca no conoce se desenvuelve (queda su texto, se pierde la
 * etiqueta) y `<script>`/`<style>` se borran enteros. De los atributos solo sobrevive `href`, y solo
 * con `http`, `https` o `mailto`.
 *
 * Esto es defensa en profundidad: quien sanea de verdad es la API, que tambien limpia las filas viejas.
 */

import { decodificarEntidades } from '../componentes/proyecto/formatos.ts'

/** Las etiquetas que sobreviven. `b` e `i` se normalizan a `strong` y `em`. */
export type EtiquetaRica =
  | 'p' | 'br' | 'h2' | 'h3' | 'ul' | 'ol' | 'li'
  | 'strong' | 'em' | 'u' | 's' | 'a' | 'blockquote'

/** Un fragmento de texto, ya con las entidades resueltas. */
export interface NodoTexto {
  tipo: 'texto'
  texto: string
}

/** Un elemento de la lista blanca. `href` solo existe en `a` y ya paso `hrefSeguro`. */
export interface NodoElemento {
  tipo: 'elemento'
  etiqueta: EtiquetaRica
  href?: string
  hijos: NodoRico[]
}

export type NodoRico = NodoTexto | NodoElemento

/** Protocolos que puede tener un enlace. Los mismos que acepta el editor. */
const PROTOCOLOS_PERMITIDOS = ['http:', 'https:', 'mailto:']

/** Profundidad maxima del arbol: mas alla se desenvuelve, para que un anidado hostil no desborde la pila. */
const PROFUNDIDAD_MAXIMA = 12

/** Etiquetas que se aceptan tal cual, o renombradas. */
const NORMALIZADAS: Readonly<Record<string, EtiquetaRica>> = {
  p: 'p',
  br: 'br',
  h2: 'h2',
  h3: 'h3',
  ul: 'ul',
  ol: 'ol',
  li: 'li',
  strong: 'strong',
  b: 'strong',
  em: 'em',
  i: 'em',
  u: 'u',
  s: 's',
  a: 'a',
  blockquote: 'blockquote'
}

/** Etiquetas cuyo contenido no es texto de nadie: se borran con todo lo que traen adentro. */
const BORRADAS = new Set(['script', 'style'])

/** Bloques de texto: un `p`, un titulo o una cita no pueden estar dentro de otro. */
const BLOQUES_DE_TEXTO = new Set<EtiquetaRica>(['p', 'h2', 'h3'])

/** Etiquetas que se dibujan como bloque: el blanco pegado a ellas no cuenta. */
const BLOQUES = new Set<EtiquetaRica>(['p', 'h2', 'h3', 'ul', 'ol', 'li', 'blockquote'])

const ETIQUETA = /<(\/?)([a-zA-Z][a-zA-Z0-9-]*)((?:"[^"]*"|'[^']*'|[^>"'])*)>/y

const HREF = /(?:^|\s)href\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/i

const SOLO_ESPACIOS = /^[\s​-‍⁠﻿]*$/

const ETIQUETA_PERMITIDA = /<\/?(?:p|br|h2|h3|ul|ol|li|strong|b|em|i|u|s|a|blockquote)\b[^>]*>/i

/**
 * Si el texto no dice nada: vacio o solo espacio en blanco de cualquier clase.
 *
 * Incluye lo que `trim()` ignora: el espacio duro y los caracteres de ancho cero (`U+200B` a
 * `U+200D`, `U+2060`, `U+FEFF`), que se cuelan al pegar desde un correo o un Word.
 *
 * @param texto texto ya sin marcado
 * @returns `true` si no hay nada visible
 */
export function esSoloEspacios (texto: string): boolean {
  return SOLO_ESPACIOS.test(texto)
}

/**
 * Si el valor trae marcado de la lista blanca, o sea si hay que leerlo como HTML y no como texto.
 *
 * Un texto plano con `a < b` no cuenta: hace falta una etiqueta conocida completa.
 *
 * @param valor el valor tal como llego de la API o del formulario
 * @returns `true` cuando contiene al menos una etiqueta de la lista blanca
 */
export function esHtml (valor: string | null | undefined): boolean {
  return typeof valor === 'string' && ETIQUETA_PERMITIDA.test(valor)
}

/**
 * Convierte texto plano en HTML: escapa, un `<p>` por parrafo y un `<br>` por salto simple.
 *
 * Un parrafo es lo que queda entre lineas en blanco. Es la inversa de `textoPlano` para texto que
 * nunca tuvo marcado, y lo que usa el editor para abrir un valor viejo.
 *
 * @param plano texto sin marcado, con o sin saltos de linea
 * @returns el HTML, o cadena vacia si no habia nada
 */
export function textoAHtml (plano: string | null | undefined): string {
  if (typeof plano !== 'string') return ''

  const normal = plano.replace(/\r\n?/g, '\n').trim()
  if (normal === '') return ''

  return normal
    .split(/\n[ \t]*\n+/)
    .map((parrafo) => `<p>${escaparHtml(parrafo).replace(/\n/g, '<br>')}</p>`)
    .join('')
}

/**
 * Escapa los cuatro caracteres que cambian el significado de un texto dentro de HTML.
 *
 * @param texto texto plano
 * @returns el texto con `&`, `<`, `>` y `"` como entidades
 */
function escaparHtml (texto: string): string {
  return texto
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/**
 * Valida el destino de un enlace.
 *
 * Parsea con `URL` y no con una expresion regular: el navegador ignora tabuladores y saltos dentro
 * del esquema (`java\nscript:`), y solo el parser de URL sabe lo mismo que el navegador.
 *
 * @param crudo el valor del atributo, aun con entidades
 * @returns la direccion limpia, o `null` si no es `http`, `https` o `mailto`
 */
export function hrefSeguro (crudo: string): string | null {
  const limpio = decodificarEntidades(crudo).replace(/[\u0000-\u001F\u007F]/g, '').trim()
  if (limpio === '') return null

  try {
    return PROTOCOLOS_PERMITIDOS.includes(new URL(limpio).protocol) ? limpio : null
  } catch {
    return null
  }
}

/**
 * La direccion que escribio la persona en el cuadro de enlace, lista para guardar.
 *
 * Sin esquema se completa: `ana@wiwo.me` es un `mailto:` y todo lo demas es `https://`. El resultado
 * pasa por `hrefSeguro`, asi que `javascript:` y compania vuelven `null` igual que en la lectura.
 *
 * @param escrito lo que hay en el cuadro
 * @returns la direccion segura, o `null` si esta vacia o no es `http`, `https` ni `mailto`
 */
export function direccionDeEnlace (escrito: string): string | null {
  const limpio = escrito.trim()
  if (limpio === '') return null

  if (/^[a-z][a-z0-9+.-]*:/i.test(limpio)) return hrefSeguro(limpio)

  return hrefSeguro(limpio.includes('@') && !limpio.includes('/') ? `mailto:${limpio}` : `https://${limpio}`)
}

/** Un elemento abierto mientras se lee el marcado. */
interface Abierto {
  etiqueta: EtiquetaRica
  nodo: NodoElemento
}

/**
 * Cierra el elemento mas reciente de `nombres`, y todo lo que tenga abierto encima.
 *
 * Se detiene en `li` y `blockquote`: un parrafo de afuera no se cierra porque adentro de una cita
 * empiece otro.
 *
 * @param pila los elementos abiertos, el ultimo es el mas interno
 * @param nombres las etiquetas que hay que cerrar si estan abiertas
 * @param limites etiquetas que cortan la busqueda
 */
function cerrarAbierto (
  pila: Abierto[],
  nombres: ReadonlySet<EtiquetaRica>,
  limites: ReadonlySet<EtiquetaRica>
): void {
  for (let i = pila.length - 1; i >= 0; i--) {
    const etiqueta = pila[i]?.etiqueta
    if (etiqueta === undefined) continue
    if (nombres.has(etiqueta)) {
      pila.length = i
      return
    }
    if (limites.has(etiqueta)) return
  }
}

const LIMITES_DE_BLOQUE = new Set<EtiquetaRica>(['li', 'blockquote'])
const LIMITES_DE_ITEM = new Set<EtiquetaRica>(['ul', 'ol'])

/**
 * Aplica las reglas de anidado de HTML antes de abrir una etiqueta.
 *
 * Replica lo justo de lo que haria un parser de navegador: un bloque no vive dentro de un `p`, un
 * `li` cierra al `li` anterior, un enlace no contiene otro enlace.
 *
 * @param etiqueta la etiqueta que se va a abrir
 * @param pila los elementos abiertos
 * @returns `false` si la etiqueta no puede abrirse y hay que desenvolverla
 */
function prepararApertura (etiqueta: EtiquetaRica, pila: Abierto[]): boolean {
  const tieneLista = pila.some((abierto) => abierto.etiqueta === 'ul' || abierto.etiqueta === 'ol')

  if (etiqueta === 'li' && !tieneLista) return false

  if (BLOQUES_DE_TEXTO.has(etiqueta) || etiqueta === 'ul' || etiqueta === 'ol' || etiqueta === 'blockquote') {
    cerrarAbierto(pila, BLOQUES_DE_TEXTO, LIMITES_DE_BLOQUE)
  }
  if (etiqueta === 'li') cerrarAbierto(pila, new Set<EtiquetaRica>(['li']), LIMITES_DE_ITEM)
  if (etiqueta === 'a') cerrarAbierto(pila, new Set<EtiquetaRica>(['a']), BLOQUES)

  return pila.length < PROFUNDIDAD_MAXIMA
}

/**
 * Agrega texto al contenedor actual, pegandolo al fragmento anterior si lo hay.
 *
 * @param hijos la lista donde va el texto
 * @param texto el fragmento ya decodificado
 */
function agregarTexto (hijos: NodoRico[], texto: string): void {
  if (texto === '') return

  const ultimo = hijos[hijos.length - 1]
  if (ultimo !== undefined && ultimo.tipo === 'texto') {
    ultimo.texto += texto
  } else {
    hijos.push({ tipo: 'texto', texto })
  }
}

/**
 * Quita el blanco que no se ve: el que va solo entre bloques, en los bordes o dentro de una lista.
 *
 * @param hijos la lista a limpiar; se recorre recursivamente
 * @returns la lista sin esos fragmentos
 */
function limpiarBlancos (hijos: NodoRico[]): NodoRico[] {
  const limpios: NodoRico[] = []

  hijos.forEach((nodo, indice) => {
    if (nodo.tipo === 'elemento') {
      nodo.hijos = limpiarBlancos(nodo.hijos)
      limpios.push(nodo)
      return
    }

    const anterior = hijos[indice - 1]
    const siguiente = hijos[indice + 1]
    const junto = (vecino: NodoRico | undefined): boolean =>
      vecino === undefined || (vecino.tipo === 'elemento' && BLOQUES.has(vecino.etiqueta))

    if (/^\s*$/.test(nodo.texto) && (junto(anterior) || junto(siguiente))) return
    limpios.push(nodo)
  })

  return limpios
}

/**
 * Lee el HTML y devuelve solo lo que la lista blanca permite, como un arbol de datos.
 *
 * Nunca lanza: lo que no se entiende se trata como texto. Un `<` suelto es un `<`; una etiqueta sin
 * cerrar se cierra sola al final; un cierre sin apertura se ignora.
 *
 * @param html el marcado crudo, de la API o del editor
 * @returns los nodos de primer nivel; vacio si `html` no es texto
 */
export function nodosDeHtml (html: string | null | undefined): NodoRico[] {
  if (typeof html !== 'string' || html === '') return []

  const raiz: NodoRico[] = []
  const pila: Abierto[] = []
  const contenedor = (): NodoRico[] => (pila[pila.length - 1]?.nodo.hijos ?? raiz)

  let i = 0
  while (i < html.length) {
    const inicio = html.indexOf('<', i)
    if (inicio === -1) {
      agregarTexto(contenedor(), decodificarEntidades(html.slice(i)))
      break
    }
    if (inicio > i) agregarTexto(contenedor(), decodificarEntidades(html.slice(i, inicio)))

    if (html.startsWith('<!--', inicio)) {
      const fin = html.indexOf('-->', inicio + 4)
      i = fin === -1 ? html.length : fin + 3
      continue
    }
    if (html[inicio + 1] === '!' || html[inicio + 1] === '?') {
      const fin = html.indexOf('>', inicio)
      i = fin === -1 ? html.length : fin + 1
      continue
    }

    ETIQUETA.lastIndex = inicio
    const coincidencia = ETIQUETA.exec(html)
    if (coincidencia === null) {
      agregarTexto(contenedor(), '<')
      i = inicio + 1
      continue
    }

    i = inicio + coincidencia[0].length
    const [, cierre, nombreCrudo, atributos] = coincidencia
    const nombre = (nombreCrudo ?? '').toLowerCase()

    if (BORRADAS.has(nombre)) {
      if (cierre === '') {
        const fin = new RegExp(`</${nombre}\\s*>`, 'i').exec(html.slice(i))
        i = fin === null ? html.length : i + fin.index + fin[0].length
      }
      continue
    }

    const etiqueta = NORMALIZADAS[nombre]
    if (etiqueta === undefined) continue

    if (cierre === '/') {
      const posicion = pila.map((abierto) => abierto.etiqueta).lastIndexOf(etiqueta)
      if (posicion !== -1 && etiqueta !== 'br') pila.length = posicion
      continue
    }

    if (etiqueta === 'br') {
      contenedor().push({ tipo: 'elemento', etiqueta: 'br', hijos: [] })
      continue
    }

    if (!prepararApertura(etiqueta, pila)) continue

    const nodo: NodoElemento = { tipo: 'elemento', etiqueta, hijos: [] }
    if (etiqueta === 'a') {
      const href = HREF.exec(atributos ?? '')
      const seguro = href === null ? null : hrefSeguro(href[1] ?? href[2] ?? href[3] ?? '')
      if (seguro === null) continue
      nodo.href = seguro
    }

    contenedor().push(nodo)
    pila.push({ etiqueta, nodo })
  }

  return limpiarBlancos(raiz)
}

/**
 * Pasa los nodos a texto, con una linea en blanco entre bloques y un marcador por cada item.
 *
 * @param nodos los hijos a recorrer
 * @returns el texto, con los bloques delimitados por saltos dobles sin normalizar
 */
function textoDeNodos (nodos: NodoRico[]): string {
  return nodos.map((nodo) => {
    if (nodo.tipo === 'texto') return nodo.texto

    switch (nodo.etiqueta) {
      case 'br':
        return '\n'
      case 'ul':
      case 'ol':
        return `\n\n${itemsDeLista(nodo)}\n\n`
      case 'p':
      case 'h2':
      case 'h3':
      case 'blockquote':
      case 'li':
        return `\n\n${textoDeNodos(nodo.hijos)}\n\n`
      default:
        return textoDeNodos(nodo.hijos)
    }
  }).join('')
}

/**
 * Las lineas de una lista: `• ` en la viñeta, `1.` en la numerada, y sangria en lo anidado.
 *
 * @param lista el nodo `ul` u `ol`
 * @returns un item por linea
 */
function itemsDeLista (lista: NodoElemento): string {
  let numero = 0

  return lista.hijos
    .filter((hijo): hijo is NodoElemento => hijo.tipo === 'elemento' && hijo.etiqueta === 'li')
    .map((item) => {
      numero += 1
      const marcador = lista.etiqueta === 'ol' ? `${numero}. ` : '• '
      const [primera, ...resto] = textoDeNodos(item.hijos).trim().split(/\n+/)

      return [marcador + primera, ...resto.map((linea) => `  ${linea}`)].join('\n')
    })
    .join('\n')
}

/**
 * Texto plano de un HTML, para listas, vistas previas y para medir si hay algo escrito.
 *
 * Extiende `aTextoPlano`: ademas de separar bloques y resolver entidades, pone `• ` o `1.` a los
 * items. Entre dos parrafos deja una linea en blanco y un `<br>` es un salto simple, asi que
 * `textoPlano(textoAHtml(x))` devuelve `x` normalizado.
 *
 * @param html el marcado, o texto plano
 * @returns el texto, sin lineas en blanco de mas y sin espacios en los bordes
 */
export function textoPlano (html: string | null | undefined): string {
  return textoDeNodos(nodosDeHtml(html))
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/**
 * Si el HTML no dice nada: `<p></p>`, `&nbsp;` y los caracteres invisibles cuentan como vacio.
 *
 * @param html el marcado del editor
 * @returns `true` cuando no hay texto visible
 */
export function htmlVacio (html: string | null | undefined): boolean {
  return esSoloEspacios(textoPlano(html))
}
