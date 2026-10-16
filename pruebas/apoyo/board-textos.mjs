import { createHash } from 'node:crypto'
import { createServer } from 'node:http'
import { rutaCanonica, verificarFirma } from '../../src/lib/en-vivo/firma.ts'
import { SECRETO } from './en-vivo.mjs'

/**
 * Un board falso con la descripción de una tarea y el borrador de respuesta de un ticket, con las
 * rutas firmadas de la fase 8 (`en-vivo/tareas/{id}` y `en-vivo/tickets/{id}/borrador`) y el control
 * de revisión del board real (texto opaco, `sha1` del contenido): un `PUT` con otra revisión es 409, la
 * descripción de la tarea no puede quedar vacía (422) y un borrador sin nada visible se borra y
 * contesta `date_updated: null`.
 *
 * `estado.tarea` y `estado.borrador` son el contenido vigente; `puts` guarda cada guardado aceptado.
 */

const TAREA = 500
const TICKET = 40

function leerCuerpo (req) {
  return new Promise((resolver, rechazar) => {
    const trozos = []

    req.on('data', (trozo) => trozos.push(trozo))
    req.on('end', () => resolver(Buffer.concat(trozos)))
    req.on('error', rechazar)
  })
}

function responder (res, estado, cuerpo) {
  res.writeHead(estado, { 'content-type': 'application/json' })
  res.end(JSON.stringify(cuerpo))
}

/** La revisión opaca de un texto en el board: `sha1` del contenido. */
export function revisionDe (content) {
  return createHash('sha1').update(content).digest('hex')
}

/** `true` si el HTML no tiene texto visible ni imágenes. */
function sinNadaVisible (html) {
  return html.replace(/<[^>]*>/g, '').trim() === '' && !/<img\b/.test(html)
}

/**
 * Levanta el board falso.
 *
 * @param opciones el contenido inicial de la descripción y del borrador
 * @returns `{estado, url, cerrar}`; `estado` expone el contenido, los guardados y ganchos para simular lo que pasa por fuera
 */
export async function crearBoardDeTextos ({ descripcion = '<p>Descripción inicial</p>', borrador = null } = {}) {
  const estado = {
    tarea: { content: descripcion, revision: revisionDe(descripcion), contador: 1 },
    borrador: borrador === null
      ? { content: '', revision: null, contador: 0 }
      : { content: borrador, revision: revisionDe(borrador), contador: 1 },
    puts: [],
    gets: [],
    estadoGet: null,
    estadoPut: null,
    /** `staff_id` a los que el PUT niega (403). */
    denegarA: new Set(),
    /**
     * Alguien cambia otra cosa de la tarea (estado, fecha…): la descripción y su revisión, que es
     * `sha1(description)`, no se mueven.
     */
    cambiarOtraCosaDeLaTarea () {
      this.tarea.contador += 1
    },
    /** Alguien guarda la descripción por otra vía. */
    editarTareaPorFuera (html) {
      this.tarea.contador += 1
      this.tarea.content = html
      this.tarea.revision = revisionDe(html)
    },
    /** Se envió la respuesta del ticket: el board consume el borrador. */
    consumirBorrador () {
      this.borrador = { content: '', revision: null, contador: this.borrador.contador }
    },
    firmasInvalidas: 0
  }

  const servidor = createServer(async (req, res) => {
    const cuerpo = await leerCuerpo(req)
    const ruta = rutaCanonica(new URL(req.url, 'http://board').pathname.replace('/api/v1', ''))
    const firma = verificarFirma(SECRETO, req.method, ruta, cuerpo, {
      marca: req.headers['x-envivo-marca'],
      nonce: req.headers['x-envivo-nonce'],
      firma: req.headers['x-envivo-firma']
    })

    if (firma !== 'ok') {
      estado.firmasInvalidas += 1

      return responder(res, 401, { error: { code: 'firma_invalida' } })
    }

    const esTarea = ruta === `en-vivo/tareas/${TAREA}`
    const esBorrador = ruta === `en-vivo/tickets/${TICKET}/borrador`

    if (!esTarea && !esBorrador) return responder(res, 404, { error: { code: 'not_found' } })

    const texto = esTarea ? estado.tarea : estado.borrador

    if (req.method === 'GET') {
      estado.gets.push(ruta)
      if (estado.estadoGet !== null) return responder(res, estado.estadoGet, { error: { code: 'forzado' } })

      return responder(res, 200, {
        data: esTarea
          ? { content: texto.content, date_updated: texto.revision, espacio_id: 3 }
          : { content: texto.content, date_updated: texto.revision }
      })
    }

    const pedido = JSON.parse(cuerpo.toString('utf8'))

    if (estado.estadoPut !== null) return responder(res, estado.estadoPut, { error: { code: 'forzado' } })
    if (estado.denegarA.has(pedido.staff_id)) return responder(res, 403, { error: { code: 'forbidden' } })
    if (!Number.isInteger(pedido.staff_id) || typeof pedido.content !== 'string') return responder(res, 422, { error: { code: 'validation_error' } })
    if (pedido.revision !== texto.revision) return responder(res, 409, { error: { code: 'conflict' } })

    if (sinNadaVisible(pedido.content)) {
      if (esTarea) return responder(res, 422, { error: { code: 'validation_error' } })

      estado.puts.push({ ruta, ...pedido })
      estado.borrador = { content: '', revision: null, contador: texto.contador }

      return responder(res, 200, { data: { date_updated: null } })
    }

    estado.puts.push({ ruta, ...pedido })
    texto.content = pedido.content
    texto.contador += 1
    texto.revision = revisionDe(pedido.content)

    return responder(res, 200, { data: { date_updated: texto.revision } })
  })

  await new Promise((resolver) => servidor.listen(0, '127.0.0.1', resolver))

  return {
    estado,
    url: `http://127.0.0.1:${servidor.address().port}/api/v1`,
    cerrar: async () => {
      servidor.closeAllConnections()
      await new Promise((resolver) => servidor.close(resolver))
    }
  }
}
