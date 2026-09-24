import { aTextoPlano } from './formatos.ts'
import type { ComentarioDeFicha } from './tareas.ts'

/**
 * Las Discusiones de un Proyecto y el hilo de comentarios de una Tarea: lo que no es dibujo.
 *
 * Una discusion NO es una entidad aparte: es el hilo de comentarios de una Tarea, leido desde el
 * Proyecto (`GET /projects/{id}/discussions`). Comentar en la ficha de la Tarea y responder desde la
 * pestaña de Discusiones escriben la misma fila (`POST /tasks/{id}/comments`), asi que las dos
 * pantallas no pueden desincronizarse: son la misma conversacion vista desde dos lugares.
 */

/** Un comentario de `GET /tasks/{id}/comments`: el de la ficha mas su lugar en el hilo. */
export interface ComentarioDeHilo extends ComentarioDeFicha {
  task_id: number
  /** El comentario raiz al que responde. La API anida un solo nivel. */
  parent_id: number | null
}

/** Una conversacion de `GET /projects/{id}/discussions`: el hilo de una Tarea, resumido. */
export interface ConversacionDeProyecto {
  task: { id: number, name: string, status: number }
  comments_count: number
  client_comments_count: number
  last_activity: string | null
  last_comment: ComentarioDeHilo | null
  /** Quienes comentaron, del mas reciente al primero, con tope en la API. */
  participants: Array<{ id: number, full_name: string, is_client: boolean }>
}

/** Un comentario raiz con sus respuestas, en el orden en que se escribieron. */
export interface HiloDeComentario {
  raiz: ComentarioDeHilo
  respuestas: ComentarioDeHilo[]
}

/**
 * Marca que Perfex concatena al contenido de un comentario con adjuntos
 * (`ComentarioProceso::MARCA_ADJUNTO` en la API). No es texto de nadie: se quita al mostrar.
 */
const MARCA_ADJUNTO = '[task_attachment]'

/**
 * Tope del texto que se escribe. La columna aguanta 64 KB de HTML (`ComentarioProceso::MAXIMO`), pero
 * un comentario no es un documento, y atajarlo de este lado evita un `422` despues de escribir.
 */
export const MAXIMO_COMENTARIO = 10000

/**
 * Arma el hilo: cada comentario raiz con sus respuestas debajo.
 *
 * Una respuesta cuyo padre no llego —borrado entre medio, o fuera de lo que devolvio la API— se
 * muestra como raiz y no se descarta: perder un comentario en silencio es peor que verlo sin su
 * contexto.
 *
 * @param comentarios la lista plana de la API, de la mas vieja a la mas nueva
 * @returns los hilos en el orden de su comentario raiz
 */
export function armarHilos (comentarios: ComentarioDeHilo[]): HiloDeComentario[] {
  const raices = new Set(comentarios.filter((c) => c.parent_id === null).map((c) => c.id))
  const hilos = new Map<number, HiloDeComentario>()

  for (const comentario of comentarios) {
    const padre = comentario.parent_id

    if (padre !== null && raices.has(padre)) {
      hilos.get(padre)?.respuestas.push(comentario)
      continue
    }

    hilos.set(comentario.id, { raiz: comentario, respuestas: [] })
  }

  return [...hilos.values()]
}

/**
 * El texto legible de un comentario, sin HTML ni la marca de adjunto.
 *
 * El contenido llega como HTML del editor de Perfex —parrafos, menciones como
 * `<span data-mention-id>`—, asi que se pinta como texto y nunca con `dangerouslySetInnerHTML`.
 *
 * @param html el `content` de la API
 * @returns el texto y si el comentario traia un adjunto
 */
export function textoDeComentario (html: string): { texto: string, conAdjunto: boolean } {
  const conAdjunto = html.includes(MARCA_ADJUNTO)
  // Entre dos parrafos va una linea en blanco: `aTextoPlano` los deja pegados con un salto simple,
  // y un comentario de tres parrafos se leeria como uno solo con renglones cortos.
  const conParrafos = html.replaceAll(MARCA_ADJUNTO, '').replace(/<\/p>\s*<p\b/gi, '</p><br><p')

  return { texto: aTextoPlano(conParrafos), conAdjunto }
}

/**
 * Una linea de vista previa del comentario, para la lista de conversaciones.
 *
 * @param html el `content` de la API
 * @param maximo cuantos caracteres como mucho
 * @returns el texto en una linea, cortado con puntos suspensivos si no entra
 */
export function extractoDeComentario (html: string, maximo = 140): string {
  const { texto, conAdjunto } = textoDeComentario(html)
  const plano = texto.replace(/\s+/g, ' ').trim()

  if (plano === '') return conAdjunto ? 'Adjuntó un archivo' : ''
  if (plano.length <= maximo) return plano

  return `${plano.slice(0, maximo - 1).trimEnd()}…`
}

/**
 * Convierte lo que se escribio en el cuadro en el HTML que guarda la API.
 *
 * Se escapa todo: el texto es de una persona, no marcado. Una linea en blanco separa parrafos y un
 * salto simple queda como `<br>`, que es como lo muestran el panel clasico y la lectura de aca.
 *
 * @param texto lo que se escribio
 * @returns el HTML listo para `content`, o `''` si no habia nada que mandar
 */
export function htmlDeComentario (texto: string): string {
  const limpio = texto.replace(/\r\n?/g, '\n').trim()
  if (limpio === '') return ''

  return limpio
    .split(/\n{2,}/)
    .map((parrafo) => `<p>${escaparHtml(parrafo).replace(/\n/g, '<br>')}</p>`)
    .join('')
}

/** Escapa los cinco caracteres con significado en HTML. */
function escaparHtml (texto: string): string {
  return texto
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

/**
 * Quien firmo un comentario, en una palabra para la lista.
 *
 * @param comentario el comentario
 * @returns el nombre de pila, o `null` si el autor se dio de baja
 */
export function autorBreve (comentario: Pick<ComentarioDeFicha, 'staff' | 'contact'>): string | null {
  const nombre = (comentario.staff ?? comentario.contact)?.full_name.trim() ?? ''

  return nombre === '' ? null : (nombre.split(/\s+/)[0] ?? null)
}
