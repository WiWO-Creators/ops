import { createServer } from 'node:http'
import { setTimeout as esperar } from 'node:timers/promises'
import WebSocket from 'ws'
import { leerConfiguracion } from '../../servicios/en-vivo/configuracion.ts'
import { crearServicio } from '../../servicios/en-vivo/servicio.ts'
import { emitirBoleto } from '../../src/lib/en-vivo/boleto.ts'
import { firmar, rutaCanonica, verificarFirma } from '../../src/lib/en-vivo/firma.ts'

/**
 * Apoyo de las pruebas de «Ops en vivo» (`pruebas/en-vivo-*.test.js`).
 *
 * Levanta el servicio real en un puerto libre contra un board falso que habla el mismo protocolo
 * firmado, y da clientes de socket con los que mirar lo que el servicio manda.
 */

process.env.EN_VIVO_REGISTRO = '0'

export const SECRETO ='secreto-de-prueba-en-vivo-0123456789abcdef'
export const SECRETO_BOLETO = 'secreto-del-boleto-de-prueba-9876543210fedcba'
export const ORIGEN = 'http://localhost:3000'
export const PREFIJO = '/en-vivo'

/** Espera a que se cumpla la condición; falla con el motivo si pasa el límite. */
export async function esperarHasta (condicion, limiteMs = 3000, motivo = 'la condición no se cumplió') {
  const fin = Date.now() + limiteMs

  while (!condicion()) {
    if (Date.now() > fin) throw new Error(`Tiempo agotado: ${motivo}`)
    await esperar(20)
  }
}

/** Un boleto firmado con el secreto de prueba. */
export function boletoDe (datos) {
  return emitirBoleto(datos, SECRETO_BOLETO).boleto
}

function leerCuerpo (req) {
  return new Promise((resolver, rechazar) => {
    const trozos = []

    req.on('data', (trozo) => trozos.push(trozo))
    req.on('end', () => resolver(Buffer.concat(trozos)))
    req.on('error', rechazar)
  })
}

function responderJson (res, estado, cuerpo) {
  res.writeHead(estado, { 'content-type': 'application/json' })
  res.end(JSON.stringify(cuerpo))
}

/**
 * Un board falso con el acta `12`: `GET` y `PUT en-vivo/actas/12` con firma y control de revisión.
 *
 * `estado.estadoGet` / `estado.estadoPut` fuerzan un código de respuesta; `estado.editarPorFuera()`
 * simula que alguien guardó el acta por otra vía (cambia contenido y revisión).
 */
export async function crearBoardFalso ({ content = '<p>Inicial</p>', espacioId = 3 } = {}) {
  const estado = {
    content,
    espacioId,
    revision: 'r1',
    contador: 1,
    puts: [],
    gets: 0,
    estadoGet: null,
    estadoPut: null,
    firmasInvalidas: 0,
    editarPorFuera (nuevoContenido) {
      this.contador += 1
      this.revision = `r${this.contador}`
      this.content = nuevoContenido
    }
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

      return responderJson(res, 401, { error: { code: 'firma_invalida' } })
    }

    if (ruta !== 'en-vivo/actas/12') return responderJson(res, 404, { error: { code: 'not_found' } })

    if (req.method === 'GET') {
      estado.gets += 1
      if (estado.estadoGet !== null) return responderJson(res, estado.estadoGet, { error: { code: 'forzado' } })

      return responderJson(res, 200, { data: { content: estado.content, date_updated: estado.revision, espacio_id: estado.espacioId } })
    }

    const pedido = JSON.parse(cuerpo.toString('utf8'))

    if (estado.estadoPut !== null) return responderJson(res, estado.estadoPut, { error: { code: 'forzado' } })
    if (pedido.revision !== estado.revision) return responderJson(res, 409, { error: { code: 'conflict' } })

    estado.puts.push(pedido)
    estado.content = pedido.content
    estado.contador += 1
    estado.revision = `r${estado.contador}`

    return responderJson(res, 200, { data: { date_updated: estado.revision } })
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

/** Levanta el servicio en un puerto libre; `entorno` pisa la configuración de prueba. */
export async function iniciarServicio ({ board = null, entorno = {} } = {}) {
  const config = leerConfiguracion({
    API_BASE: board?.url ?? 'http://127.0.0.1:9/api/v1',
    EN_VIVO_SECRETO: SECRETO,
    EN_VIVO_BOLETO_SECRETO: SECRETO_BOLETO,
    EN_VIVO_ORIGENES: ORIGEN,
    EN_VIVO_PUERTO: '0',
    EN_VIVO_DEBOUNCE_MS: '150',
    EN_VIVO_MAX_DEBOUNCE_MS: '500',
    EN_VIVO_TIEMPO_API_MS: '2000',
    EN_VIVO_ESPERA_HOLA_MS: '5000',
    ...entorno
  })
  const servicio = crearServicio(config)
  const puerto = await servicio.escuchar()

  return {
    servicio,
    config,
    puerto,
    urlBase: `http://127.0.0.1:${puerto}${PREFIJO}`,
    urlDoc: `ws://127.0.0.1:${puerto}${PREFIJO}/doc`,
    urlBus: `ws://127.0.0.1:${puerto}${PREFIJO}/bus`,
    cerrar: async () => { await servicio.cerrar() }
  }
}

/** Manda un lote de eventos firmado como lo haría el board. */
export async function enviarEventos (urlBase, eventos, { secreto = SECRETO } = {}) {
  const cuerpo = JSON.stringify({ eventos, emitido_en: Math.floor(Date.now() / 1000) })
  const respuesta = await fetch(`${urlBase}/interno/eventos`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...firmar(secreto, 'POST', 'interno/eventos', cuerpo) },
    body: cuerpo
  })

  return { estado: respuesta.status, datos: await respuesta.json() }
}

/** El evento mínimo del board, con la audiencia que se indique. */
export function evento (tipo, id, audiencia = {}, espacioId = null) {
  return {
    tipo,
    id,
    espacio_id: espacioId,
    audiencia: { staff: [], equipo: false, espacio: false, cliente: null, pantallas: false, ...audiencia }
  }
}

/** `WebSocket` de `ws` que manda siempre el `Origin` de prueba, para usarlo como `WebSocketPolyfill`. */
export class WebSocketConOrigen extends WebSocket {
  constructor (url, protocolos) {
    super(url, protocolos, { headers: { origin: ORIGEN } })
  }
}

/** Un cliente del bus que guarda todo lo que recibe. */
export class ClienteBus {
  constructor (ws) {
    this.ws = ws
    this.mensajes = []
    this.cierre = new Promise((resolver) => ws.on('close', (codigo) => resolver(codigo)))
    ws.on('message', (datos) => this.mensajes.push(JSON.parse(datos.toString())))
  }

  /** Abre el socket; rechaza con el motivo si el servidor lo niega. */
  static async abrir (url, { origen = ORIGEN } = {}) {
    const headers = origen === null ? {} : { origin: origen }
    const ws = new WebSocket(url, { headers })

    await new Promise((resolver, rechazar) => {
      ws.once('open', resolver)
      ws.once('error', rechazar)
    })

    return new ClienteBus(ws)
  }

  enviar (mensaje) {
    this.ws.send(typeof mensaje === 'string' ? mensaje : JSON.stringify(mensaje))
  }

  /** Espera un mensaje que cumpla el predicado y lo devuelve. */
  async esperar (predicado, limiteMs = 2000) {
    await esperarHasta(() => this.mensajes.some(predicado), limiteMs, 'no llegó el mensaje esperado')

    return this.mensajes.find(predicado)
  }

  cerrar () {
    this.ws.close()
  }
}
