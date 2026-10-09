import type { CSSProperties, ReactElement, ReactNode } from 'react'
import { cn } from '@/lib/clases'
import { htmlVacio, nodosDeHtml, type NodoRico } from '@/dominio/texto-rico'

interface PropsContenido {
  /** HTML saneado por la API (`message_html`, `description_html`, `content_html`) o escrito en el editor. */
  html?: string | null
  /** Texto plano. Se usa cuando no hay `html`: filas viejas, o una API que aun no manda el campo. */
  texto?: string | null
  /** Lo que se dibuja si no hay nada que mostrar. Sin esto, no se dibuja nada. */
  vacio?: ReactNode
  /** Color, tamaño y ancho del texto: los decide cada vista, igual que con un `<p>` suelto. */
  className?: string
  /** Cuantas lineas se ven antes de cortar con puntos suspensivos. Sin esto, se ve todo. */
  recortar?: number
}

/**
 * Convierte un nodo del arbol en su elemento de React.
 *
 * @param nodo un nodo ya filtrado por la lista blanca de `nodosDeHtml`
 * @param clave posicion entre sus hermanos, que es la clave de React
 * @returns el elemento, o el texto tal cual
 */
function dibujar (nodo: NodoRico, clave: number): ReactNode {
  if (nodo.tipo === 'texto') return nodo.texto

  const hijos = nodo.hijos.map(dibujar)

  switch (nodo.etiqueta) {
    case 'br':
      return <br key={clave} />
    case 'a':
      return <a key={clave} href={nodo.href} target="_blank" rel="noopener noreferrer">{hijos}</a>
    case 'p': return <p key={clave}>{hijos}</p>
    case 'h2': return <h2 key={clave}>{hijos}</h2>
    case 'h3': return <h3 key={clave}>{hijos}</h3>
    case 'ul': return <ul key={clave}>{hijos}</ul>
    case 'ol': return <ol key={clave}>{hijos}</ol>
    case 'li': return <li key={clave}>{hijos}</li>
    case 'strong': return <strong key={clave}>{hijos}</strong>
    case 'em': return <em key={clave}>{hijos}</em>
    case 'u': return <u key={clave}>{hijos}</u>
    case 's': return <s key={clave}>{hijos}</s>
    case 'blockquote': return <blockquote key={clave}>{hijos}</blockquote>
  }
}

/** Los estilos que cortan el bloque a N lineas; `line-clamp-*` de Tailwind solo trae valores fijos. */
function estiloDeRecorte (lineas: number | undefined): CSSProperties | undefined {
  if (lineas === undefined || !Number.isInteger(lineas) || lineas < 1) return undefined

  return { display: '-webkit-box', WebkitBoxOrient: 'vertical', WebkitLineClamp: lineas, overflow: 'hidden' }
}

/**
 * Texto enriquecido de solo lectura: tickets, comentarios, descripciones y notas.
 *
 * Arma elementos de React desde la lista blanca de `nodosDeHtml`; no inyecta HTML en la pagina. Los
 * enlaces abren en otra pestana con `rel="noopener noreferrer"`. Sin `html`, pinta el `texto` con los
 * saltos de linea respetados, que es lo que hacian las vistas antes de existir el formato.
 *
 * @param props ver `PropsContenido`
 * @returns el contenido, `vacio` o nada
 */
export function Contenido ({ html, texto, vacio, className, recortar }: PropsContenido): ReactElement | null {
  const estilo = estiloDeRecorte(recortar)

  if (typeof html === 'string' && !htmlVacio(html)) {
    return (
      <div className={cn('texto-rico', className)} style={estilo}>
        {nodosDeHtml(html).map(dibujar)}
      </div>
    )
  }

  if (typeof texto === 'string' && texto.trim() !== '') {
    return <p className={cn('break-words whitespace-pre-line', className)} style={estilo}>{texto}</p>
  }

  return vacio === undefined ? null : <>{vacio}</>
}
