/**
 * La petición de reescritura de un fragmento del Meeting Paper con IA.
 *
 * Vive aparte del editor para poder probar lo que decide qué viaja al servidor: el fragmento en HTML
 * (para no perder listas ni los rótulos `Responsable:` que otras partes leen), el contexto acotado y
 * el tope de la instrucción. Los topes son los de la API (`ActaDeReunion`), que los vuelve a exigir.
 */

/** Largo máximo de la instrucción libre. */
export const LARGO_MAXIMO_INSTRUCCION = 500

/** Largo máximo del contexto (la sección que rodea al fragmento). */
export const LARGO_MAXIMO_CONTEXTO = 4000

/** Largo máximo del fragmento en HTML. */
export const LARGO_MAXIMO_FRAGMENTO = 20000

/** Las acciones atajo y el verbo con el que las ve la persona. */
export const ACCIONES_DE_REESCRITURA = [
  { clave: 'acortar', etiqueta: 'Acortar' },
  { clave: 'alargar', etiqueta: 'Alargar' },
  { clave: 'simplificar', etiqueta: 'Simplificar' },
  { clave: 'complejizar', etiqueta: 'Formalizar' },
  { clave: 'resumir', etiqueta: 'Resumir' },
  { clave: 'tono_cliente', etiqueta: 'Tono cliente' }
] as const

export type ClaveDeAccion = typeof ACCIONES_DE_REESCRITURA[number]['clave']

/** Lo que pide la persona: un atajo o una instrucción escrita. */
export type PedidoDeReescritura =
  | { tipo: 'accion', accion: ClaveDeAccion }
  | { tipo: 'instruccion', instruccion: string }

/** Cuerpo de `POST /ia/proyectos/{id}/acta-transformar`. */
export interface CuerpoDeReescritura {
  texto: string
  acta_id: number
  accion?: ClaveDeAccion
  instruccion?: string
  contexto?: string
}

/**
 * Arma el cuerpo de la petición, o explica por qué no se puede mandar.
 *
 * @param pedido el atajo o la instrucción
 * @param fragmentoHtml el fragmento seleccionado, como HTML
 * @param contexto texto de la sección que rodea al fragmento (se recorta al tope)
 * @param actaId el acta que se está editando
 * @returns el cuerpo listo, o el motivo en español
 */
export function armarReescritura (
  pedido: PedidoDeReescritura,
  fragmentoHtml: string,
  contexto: string,
  actaId: number
): { ok: true, cuerpo: CuerpoDeReescritura } | { ok: false, motivo: string } {
  const fragmento = fragmentoHtml.trim()

  if (fragmento === '' || fragmento.replace(/<[^>]+>/g, '').trim() === '') {
    return { ok: false, motivo: 'Selecciona un fragmento con texto para reescribirlo.' }
  }
  if (fragmento.length > LARGO_MAXIMO_FRAGMENTO) {
    return { ok: false, motivo: 'El fragmento es demasiado largo. Selecciona una parte más corta.' }
  }

  const base = {
    texto: fragmento,
    acta_id: actaId,
    ...(contexto.trim() === '' ? {} : { contexto: contexto.trim().slice(0, LARGO_MAXIMO_CONTEXTO) })
  }

  if (pedido.tipo === 'accion') return { ok: true, cuerpo: { ...base, accion: pedido.accion } }

  const instruccion = pedido.instruccion.trim()

  if (instruccion === '') return { ok: false, motivo: 'Escribe qué cambio quieres.' }
  if (instruccion.length > LARGO_MAXIMO_INSTRUCCION) {
    return { ok: false, motivo: `La instrucción admite hasta ${LARGO_MAXIMO_INSTRUCCION} caracteres.` }
  }

  return { ok: true, cuerpo: { ...base, instruccion } }
}

/**
 * Pasa un fragmento HTML a texto para compararlo en pantalla sin renderizarlo.
 *
 * Los ítems y párrafos quedan en líneas separadas. Es solo para el «antes y después»: lo que se
 * inserta en el documento es el HTML.
 */
export function textoDeFragmento (html: string): string {
  return html
    .replace(/<\/(p|li|h[1-6]|blockquote)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}
