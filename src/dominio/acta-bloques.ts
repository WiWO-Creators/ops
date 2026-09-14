/**
 * El acta, convertida a bloques: el paso intermedio entre el HTML y los archivos que se exportan.
 *
 * === POR QUE EXISTE ===
 *
 * Un Meeting Paper se guarda como HTML porque así lo escribe el modelo y así lo corrige el editor.
 * Pero ni Word ni un PDF entienden HTML: los dos se construyen párrafo a párrafo, con estilos
 * propios. Sin un paso intermedio habría dos lectores del mismo HTML —uno para DOCX y otro para
 * PDF— y cada arreglo habría que hacerlo dos veces, con la garantía de que en algún momento un
 * formato mostraría algo que el otro no.
 *
 * === POR QUE EL ARBOL SE COPIA A `NodoSimple` ===
 *
 * El HTML se lee con `DOMParser`, que solo existe en el navegador. Copiar lo poco que hace falta a
 * una estructura propia deja la conversión a bloques —donde está toda la lógica— como una función
 * pura, que se prueba en Node sin montar un DOM (`pruebas/acta-bloques.test.js`).
 *
 * El HTML que llega es acotado a propósito: lo produce el prompt del acta y lo vuelve a producir
 * TipTap al corregirla, que monta el StarterKit sin extensión de tablas. Lo que no esté acá —una
 * tabla pegada desde fuera, una imagen— se exporta como su texto, nunca se pierde en silencio.
 */

/** Un trozo de texto con las marcas que lo acompañan. */
export interface Fragmento {
  texto: string
  negrita?: boolean
  cursiva?: boolean
  subrayado?: boolean
}

/** Un bloque del documento, en el orden en que se lee. */
export type Bloque =
  | { tipo: 'titulo', nivel: 1 | 2 | 3 | 4, texto: Fragmento[] }
  | { tipo: 'parrafo', texto: Fragmento[] }
  | { tipo: 'lista', ordenada: boolean, items: Fragmento[][] }
  | { tipo: 'cita', texto: Fragmento[] }
  | { tipo: 'separador' }

/**
 * Un nodo del HTML con lo justo para convertirlo: la etiqueta, el texto y los hijos.
 *
 * `marcas` viaja ya resuelta desde el padre: un `<strong>` con un `<em>` adentro deja el texto en
 * negrita y cursiva a la vez, y arrastrar eso en la conversión sería repetir en dos formatos lo
 * que el DOM ya sabe.
 */
export interface NodoSimple {
  etiqueta: string
  texto: string
  hijos: NodoSimple[]
}

/** Etiquetas que marcan el texto que contienen, con la marca que aplican. */
const MARCAS: Record<string, keyof Omit<Fragmento, 'texto'>> = {
  strong: 'negrita',
  b: 'negrita',
  em: 'cursiva',
  i: 'cursiva',
  u: 'subrayado'
}

/**
 * Copia el HTML a `NodoSimple`. Solo acá se toca el DOM.
 *
 * @param html cuerpo del acta tal como lo guarda la API
 * @throws Error si se llama fuera del navegador, donde no hay `DOMParser`
 */
export function nodosDeHtml (html: string): NodoSimple[] {
  if (typeof DOMParser === 'undefined') {
    throw new Error('nodosDeHtml solo corre en el navegador: no hay DOMParser.')
  }

  const documento = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html')

  return [...documento.body.childNodes].map(copiar)
}

/** Un nodo del DOM y su descendencia, con los nombres de etiqueta ya en minúscula. */
function copiar (nodo: ChildNode): NodoSimple {
  if (nodo.nodeType === 3) {
    return { etiqueta: '#texto', texto: nodo.textContent ?? '', hijos: [] }
  }

  const elemento = nodo as Element

  return {
    etiqueta: elemento.tagName.toLowerCase(),
    texto: elemento.textContent ?? '',
    hijos: [...elemento.childNodes].map(copiar)
  }
}

/**
 * Los bloques del documento, en orden.
 *
 * Función pura: recibe el árbol copiado y no toca el DOM, para poder probarla en Node.
 */
export function bloquesDeNodos (nodos: NodoSimple[]): Bloque[] {
  const bloques: Bloque[] = []

  for (const nodo of nodos) {
    const bloque = bloqueDe(nodo)

    if (bloque !== null) bloques.push(bloque)
  }

  return bloques
}

/** Atajo para el camino completo en el navegador. */
export function bloquesDeHtml (html: string): Bloque[] {
  return bloquesDeNodos(nodosDeHtml(html))
}

/** El bloque que corresponde a un nodo de primer nivel, o `null` si no aporta nada. */
function bloqueDe (nodo: NodoSimple): Bloque | null {
  const nivel = { h1: 1, h2: 2, h3: 3, h4: 4 }[nodo.etiqueta]

  if (nivel !== undefined) {
    return { tipo: 'titulo', nivel: nivel as 1 | 2 | 3 | 4, texto: fragmentosDe(nodo) }
  }

  if (nodo.etiqueta === 'ul' || nodo.etiqueta === 'ol') {
    const items = nodo.hijos
      .filter((hijo) => hijo.etiqueta === 'li')
      .map((hijo) => fragmentosDe(hijo))
      .filter((item) => item.length > 0)

    return items.length === 0 ? null : { tipo: 'lista', ordenada: nodo.etiqueta === 'ol', items }
  }

  if (nodo.etiqueta === 'blockquote') {
    return { tipo: 'cita', texto: fragmentosDe(nodo) }
  }

  if (nodo.etiqueta === 'hr') {
    return { tipo: 'separador' }
  }

  // Todo lo demás —`p`, un `div` pegado desde fuera, una tabla, texto suelto— sale como párrafo
  // antes que perderse: un acta exportada a la que le falta un trozo es peor que una mal formada.
  const fragmentos = fragmentosDe(nodo)

  return fragmentos.length === 0 ? null : { tipo: 'parrafo', texto: fragmentos }
}

/**
 * El texto de un nodo, partido en fragmentos según las marcas que lo envuelven.
 *
 * Los fragmentos vecinos con las mismas marcas se juntan: `<strong>Hola</strong><strong> a
 * todos</strong>` son dos nodos y una sola frase, y separarlos haría que Word inserte un salto de
 * formato donde no hay ninguno.
 */
function fragmentosDe (nodo: NodoSimple, heredadas: Omit<Fragmento, 'texto'> = {}): Fragmento[] {
  if (nodo.etiqueta === '#texto') {
    const texto = nodo.texto.replace(/\s+/g, ' ')

    return texto.trim() === '' ? [] : [{ texto, ...heredadas }]
  }

  const marca = MARCAS[nodo.etiqueta]
  const marcas = marca === undefined ? heredadas : { ...heredadas, [marca]: true }
  const fragmentos: Fragmento[] = []

  for (const hijo of nodo.hijos) {
    for (const fragmento of fragmentosDe(hijo, marcas)) {
      const anterior = fragmentos[fragmentos.length - 1]

      if (anterior !== undefined && mismasMarcas(anterior, fragmento)) {
        anterior.texto += fragmento.texto
        continue
      }

      fragmentos.push(fragmento)
    }
  }

  return recortarBordes(fragmentos)
}

/** Si dos fragmentos se pueden juntar sin cambiar cómo se ven. */
function mismasMarcas (uno: Fragmento, otro: Fragmento): boolean {
  return uno.negrita === otro.negrita
    && uno.cursiva === otro.cursiva
    && uno.subrayado === otro.subrayado
}

/** Quita el espacio del principio y del final del bloque, que en HTML es solo sangría del código. */
function recortarBordes (fragmentos: Fragmento[]): Fragmento[] {
  if (fragmentos.length === 0) return fragmentos

  const primero = fragmentos[0]
  const ultimo = fragmentos[fragmentos.length - 1]

  if (primero === undefined || ultimo === undefined) return fragmentos

  primero.texto = primero.texto.replace(/^\s+/, '')
  ultimo.texto = ultimo.texto.replace(/\s+$/, '')

  return fragmentos.filter((fragmento) => fragmento.texto !== '')
}

/** El texto plano de unos fragmentos, para nombres de archivo y para medir si algo quedó vacío. */
export function textoDe (fragmentos: Fragmento[]): string {
  return fragmentos.map((fragmento) => fragmento.texto).join('')
}
