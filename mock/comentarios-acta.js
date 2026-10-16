/**
 * `/projects/{e}/actas/{a}/comentarios` del mock: los comentarios en línea del Meeting Paper
 * (fase 10 de «Ops en vivo»).
 *
 * Sirve lo mismo que `Escritura\ComentarioDeActa` y `Recursos\RecursoComentariosDeActa` del board:
 * hilos con su ancla, respuestas, edición solo del autor, borrado del autor o de un administrador
 * (borrar la raíz se lleva el hilo), resolver y reabrir. Las mismas validaciones: texto plano de hasta
 * 2000 caracteres, ancla `^[A-Za-z0-9_-]{1,64}$`, hasta 20 menciones y ninguna clave de más.
 *
 * Nace APAGADO, como la instalación real: con `MOCK_EN_VIVO=1` queda encendido el maestro y
 * `MOCK_COMENTARIOS=0` lo deja apagado (todo contesta 404, que es lo que hace el board sin
 * `wiwo_acta_comentarios`). Los hilos viven en memoria, por acta.
 */

import { ErrorApi } from './consulta.js'

const PATRON_DE_ANCLA = /^[A-Za-z0-9_-]{1,64}$/
const MAXIMO_CONTENIDO = 2000
const MAXIMO_MENCIONES = 20

/** @type {Map<number, Array<{id: number, anchor: string, resolved_at: string|null, comments: Array<object>}>>} */
const HILOS_POR_ACTA = new Map()

let ultimoId = 0

/** Si el interruptor `wiwo_acta_comentarios` está encendido en esta corrida del mock. */
export function comentariosEncendidos () {
  return process.env.MOCK_EN_VIVO === '1' && process.env.MOCK_COMENTARIOS !== '0'
}

/** La opción de `GET /settings` que lee el panel para saber si ofrece los comentarios. */
export function opcionesDeComentarios () {
  return { wiwo_acta_comentarios: { group: 'en_vivo', type: 'bool', value: comentariosEncendidos() ? '1' : '0' } }
}

function invalido (campo, regla) {
  return new ErrorApi(422, 'validation_failed', 'Hay campos que no se pueden escribir.', { [campo]: [regla] })
}

function soloClaves (cuerpo, permitidas) {
  const sobrantes = Object.keys(cuerpo).filter((clave) => !permitidas.includes(clave))

  if (sobrantes.length > 0) throw invalido(sobrantes[0], 'unknown_field')
}

function contenidoDe (cuerpo) {
  const texto = typeof cuerpo.content === 'string' ? cuerpo.content.trim() : ''

  if (texto === '') throw invalido('content', 'required')
  if (texto.length > MAXIMO_CONTENIDO) throw invalido('content', `max:${MAXIMO_CONTENIDO}`)

  return texto
}

function mencionesDe (cuerpo) {
  if (cuerpo.mentions === undefined) return []
  if (!Array.isArray(cuerpo.mentions) || cuerpo.mentions.some((id) => !Number.isInteger(id) || id <= 0)) {
    throw invalido('mentions', 'integer_list')
  }
  if (cuerpo.mentions.length > MAXIMO_MENCIONES) throw invalido('mentions', `max:${MAXIMO_MENCIONES}`)

  return [...new Set(cuerpo.mentions)]
}

/** El comentario como lo devuelve la API, con `mine` según quien pregunta. */
function presentarComentario (comentario, actual, autorDe) {
  const autor = autorDe(comentario.staff_id)

  return {
    id: comentario.id,
    staff_id: comentario.staff_id,
    staff_name: autor.staff_name,
    staff_image: autor.staff_image,
    content: comentario.content,
    mentions: comentario.mentions,
    mine: comentario.staff_id === actual.id,
    date_added: comentario.date_added,
    date_edited: comentario.date_edited
  }
}

function presentarHilo (hilo, actual, autorDe) {
  return {
    id: hilo.id,
    anchor: hilo.anchor,
    resolved: hilo.resolved_at !== null,
    resolved_at: hilo.resolved_at,
    comments: hilo.comments.map((comentario) => presentarComentario(comentario, actual, autorDe))
  }
}

/** El hilo que contiene un comentario (la raíz o una respuesta), con el comentario. */
function buscar (hilos, comentarioId) {
  for (const hilo of hilos) {
    const comentario = hilo.comments.find((c) => c.id === comentarioId)

    if (comentario !== undefined) return { hilo, comentario }
  }

  throw new ErrorApi(404, 'not_found', 'No existe ese comentario.')
}

function crear (hilos, actual, cuerpo) {
  soloClaves(cuerpo, ['content', 'anchor', 'hilo', 'mentions'])

  const content = contenidoDe(cuerpo)
  const mentions = mencionesDe(cuerpo)
  const comentario = {
    id: ++ultimoId,
    staff_id: actual.id,
    content,
    mentions,
    date_added: new Date().toISOString(),
    date_edited: null
  }

  if (cuerpo.hilo !== undefined) {
    if (!Number.isInteger(cuerpo.hilo) || cuerpo.hilo <= 0) throw invalido('hilo', 'integer')

    const hilo = hilos.find((h) => h.id === cuerpo.hilo)

    if (hilo === undefined) throw new ErrorApi(404, 'not_found', 'No existe ese hilo.')
    hilo.comments.push(comentario)

    return hilo
  }

  if (typeof cuerpo.anchor !== 'string' || !PATRON_DE_ANCLA.test(cuerpo.anchor)) throw invalido('anchor', 'invalid')
  if (hilos.some((h) => h.anchor === cuerpo.anchor)) throw invalido('anchor', 'unique')

  const hilo = { id: comentario.id, anchor: cuerpo.anchor, resolved_at: null, comments: [comentario] }

  hilos.push(hilo)

  return hilo
}

function editar (hilos, actual, comentarioId, cuerpo) {
  const { hilo, comentario } = buscar(hilos, comentarioId)

  if (comentario.staff_id !== actual.id) {
    throw new ErrorApi(403, 'forbidden', 'Solo quien escribió este comentario puede editarlo.')
  }

  soloClaves(cuerpo, ['content', 'mentions'])
  comentario.content = contenidoDe(cuerpo)
  if (cuerpo.mentions !== undefined) comentario.mentions = mencionesDe(cuerpo)
  comentario.date_edited = new Date().toISOString()

  return hilo
}

function borrar (hilos, actual, comentarioId) {
  const { hilo, comentario } = buscar(hilos, comentarioId)

  if (comentario.staff_id !== actual.id && actual.is_admin !== true) {
    throw new ErrorApi(403, 'forbidden', 'Solo quien escribió este comentario o un administrador puede borrarlo.')
  }

  if (hilo.id === comentario.id) hilos.splice(hilos.indexOf(hilo), 1)
  else hilo.comments.splice(hilo.comments.indexOf(comentario), 1)
}

function resolver (hilos, comentarioId, cuerpo) {
  const { hilo } = buscar(hilos, comentarioId)

  soloClaves(cuerpo, ['resolved'])

  const resuelto = cuerpo.resolved ?? true

  if (typeof resuelto !== 'boolean') throw invalido('resolved', 'boolean')
  hilo.resolved_at = resuelto ? new Date().toISOString() : null

  return hilo
}

/**
 * Atiende `/projects/{e}/actas/{a}/comentarios[/{id}[/resolver]]`.
 *
 * @param {string} metodo verbo HTTP
 * @param {string[]} resto los segmentos que siguen a `comentarios`
 * @param {number} actaId el acta, ya resuelta por quien llama
 * @param {{id: number, is_admin?: boolean}} actual el staff de la sesión
 * @param {() => Promise<object>} cuerpo thunk: el cuerpo se lee solo si la ruta lo pide
 * @param {(staffId: number) => {staff_name: string|null, staff_image: string|null}} autorDe nombre y foto de un staff
 * @returns {Promise<{estado: number, cuerpo: object|null}>}
 * @throws {ErrorApi} 404 apagado o ruta inventada, 403 editar o borrar lo ajeno, 422 cuerpo inválido
 */
export async function comentariosDelActaRuta (metodo, resto, actaId, actual, cuerpo, autorDe) {
  if (!comentariosEncendidos()) throw new ErrorApi(404, 'not_found', 'No existe ese recurso.')

  if (!HILOS_POR_ACTA.has(actaId)) HILOS_POR_ACTA.set(actaId, [])

  const hilos = HILOS_POR_ACTA.get(actaId)
  const presentar = (hilo) => ({ data: presentarHilo(hilo, actual, autorDe) })
  const [segmento, accion] = resto

  if (segmento === undefined) {
    if (metodo === 'GET') return { estado: 200, cuerpo: { data: hilos.map((hilo) => presentarHilo(hilo, actual, autorDe)) } }
    if (metodo === 'POST') return { estado: 201, cuerpo: presentar(crear(hilos, actual, await cuerpo())) }
  } else {
    const id = Number(segmento)

    if (!Number.isInteger(id) || id <= 0) throw new ErrorApi(404, 'not_found', 'Subrecurso desconocido.')

    if (accion === undefined && metodo === 'GET') return { estado: 200, cuerpo: presentar(buscar(hilos, id).hilo) }
    if (accion === undefined && metodo === 'PATCH') return { estado: 200, cuerpo: presentar(editar(hilos, actual, id, await cuerpo())) }

    if (accion === undefined && metodo === 'DELETE') {
      borrar(hilos, actual, id)

      return { estado: 204, cuerpo: null }
    }

    if (accion === 'resolver' && resto.length === 2 && metodo === 'POST') {
      return { estado: 200, cuerpo: presentar(resolver(hilos, id, await cuerpo())) }
    }
  }

  throw new ErrorApi(404, 'not_found', 'Subrecurso desconocido.')
}
