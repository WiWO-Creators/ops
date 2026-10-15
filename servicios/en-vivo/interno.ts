import type { IncomingMessage, ServerResponse } from 'node:http'

import { MAXIMO_BYTES_LOTE, leerLoteDeEventos } from '../../src/dominio/en-vivo.ts'
import {
  CABECERA_FIRMA,
  CABECERA_MARCA,
  CABECERA_NONCE,
  AlmacenDeNonces,
  rutaCanonica,
  verificarFirma
} from '../../src/lib/en-vivo/firma.ts'
import type { Bus } from './bus.ts'
import type { ConfiguracionDelServicio } from './configuracion.ts'
import type { ServicioDeDocumentos } from './documentos.ts'
import { aplicarComoOrbe, leerPedidoDeAplicar } from './orbe.ts'
import { registrar } from './registro.ts'

/**
 * Rutas internas (`/en-vivo/interno/*`): las llama el board, firmadas con `EN_VIVO_SECRETO`.
 *
 * Nada de esto se publica hacia el navegador. Toda petición pasa por tres compuertas antes de
 * tocar el bus: el cuerpo no pasa de 64 KB, la firma coincide (ventana de 60 s) y el nonce no se
 * había visto en los últimos 120 s.
 */

export interface ContextoInterno {
  config: ConfiguracionDelServicio
  bus: Bus
  documentos: ServicioDeDocumentos
  nonces: AlmacenDeNonces
}

/** Tope del cuerpo de `aplicar`: un acta entera en HTML (el lector de reproducción acepta hasta 400 KB). */
const MAXIMO_BYTES_ACTA = 1_048_576

class CuerpoDemasiadoGrande extends Error {}

function responder (res: ServerResponse, estado: number, cuerpo: unknown): void {
  const texto = JSON.stringify(cuerpo)

  res.writeHead(estado, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
  res.end(texto)
}

function cabecera (req: IncomingMessage, nombre: string): string | null {
  const valor = req.headers[nombre]

  return typeof valor === 'string' ? valor : null
}

/**
 * Lee el cuerpo crudo con tope de tamaño.
 *
 * @throws CuerpoDemasiadoGrande si pasa del límite (se corta la lectura sin acumular el resto)
 */
async function leerCuerpoCrudo (req: IncomingMessage, maximo: number): Promise<Buffer> {
  const declarado = Number(req.headers['content-length'])

  if (Number.isFinite(declarado) && declarado > maximo) throw new CuerpoDemasiadoGrande()

  const trozos: Buffer[] = []
  let total = 0

  for await (const trozo of req) {
    const buffer = trozo as Buffer

    total += buffer.length
    if (total > maximo) throw new CuerpoDemasiadoGrande()
    trozos.push(buffer)
  }

  return Buffer.concat(trozos)
}

/** Aplica el lote al bus y, si un acta abierta cambió por fuera, la recarga. */
async function aplicarLote (cuerpo: Buffer, contexto: ContextoInterno): Promise<number | null> {
  const lote = leerLoteDeEventos(cuerpo.toString('utf8'))

  if (lote === null) return null

  for (const evento of lote.eventos) {
    contexto.bus.entregar(evento)

    const nombre = evento.tipo === 'acta' && evento.id !== null ? `acta:${evento.id}` : null

    if (nombre !== null && contexto.documentos.estaCargado(nombre)) {
      // Sin esperar: el board no tiene por qué aguardar a que se recargue un documento.
      contexto.documentos.sincronizar(nombre).catch(() => {
        registrar({ evento: 'sincronia_fallida', documento: nombre })
      })
    }
  }

  return lote.eventos.length
}

/** Lo que el board puede pedir: un lote de eventos o aplicar el HTML del orbe a un acta abierta. */
type Destino = { tipo: 'eventos' } | { tipo: 'aplicar', actaId: number }

const RUTA_DE_APLICAR = /^interno\/actas\/([1-9]\d{0,9})\/aplicar$/

function destinoDe (canonica: string): Destino | null {
  if (canonica === 'interno/eventos') return { tipo: 'eventos' }

  const aplicar = RUTA_DE_APLICAR.exec(canonica)

  return aplicar === null ? null : { tipo: 'aplicar', actaId: Number(aplicar[1]) }
}

/**
 * Atiende `interno/actas/{id}/aplicar`: el Thinking Orb escribe en un acta abierta en edición conjunta.
 *
 * 202 `{aplicada:true}` apenas el cambio queda en marcha (se aplica y guarda de forma asíncrona);
 * 404 `{abierta:false}` si el acta no está abierta con conexiones, es de otro Espacio o su HTML no
 * se pudo convertir: en esos casos el board sigue su camino de siempre; 422 si el cuerpo es inválido.
 */
function aplicarActa (res: ServerResponse, cuerpo: Buffer, actaId: number, contexto: ContextoInterno): void {
  const pedido = leerPedidoDeAplicar(cuerpo.toString('utf8'))

  if (pedido === null) return responder(res, 422, { error: { code: 'pedido_invalido' } })

  const resultado = aplicarComoOrbe(contexto.documentos, actaId, pedido)

  if (resultado.estado !== 'aplicando') return responder(res, 404, { abierta: false })

  // El board no espera a que el orbe termine de escribir.
  resultado.terminada.catch(() => undefined)
  responder(res, 202, { aplicada: true })
}

/**
 * Atiende una petición `POST` interna.
 *
 * `interno/eventos`: 202 `{aceptados}` al lote; 422 si el lote es inválido. `interno/actas/{id}/aplicar`:
 * ver {@link aplicarActa}. En ambas, 401 si la firma no cuadra o el nonce se repite; 413 si el cuerpo
 * pasa del tope (64 KB el lote, 1 MB el acta); 404 si la ruta no existe.
 *
 * @param req la petición
 * @param res la respuesta
 * @param ruta la ruta ya sin el prefijo del servicio ni la barra inicial (p. ej. `interno/eventos`)
 * @param contexto bus, documentos y memoria de nonces
 */
export async function manejarInterno (
  req: IncomingMessage,
  res: ServerResponse,
  ruta: string,
  contexto: ContextoInterno
): Promise<void> {
  const canonica = rutaCanonica(ruta)
  const destino = req.method === 'POST' ? destinoDe(canonica) : null

  if (destino === null) return responder(res, 404, { error: 'no_encontrado' })

  let cuerpo: Buffer

  try {
    cuerpo = await leerCuerpoCrudo(req, destino.tipo === 'aplicar' ? MAXIMO_BYTES_ACTA : MAXIMO_BYTES_LOTE)
  } catch (error) {
    return error instanceof CuerpoDemasiadoGrande
      ? responder(res, 413, { error: 'cuerpo_demasiado_grande' })
      : responder(res, 400, { error: 'cuerpo_ilegible' })
  }

  const nonce = cabecera(req, CABECERA_NONCE)
  const resultado = verificarFirma(contexto.config.secreto, 'POST', canonica, cuerpo, {
    marca: cabecera(req, CABECERA_MARCA),
    nonce,
    firma: cabecera(req, CABECERA_FIRMA)
  })

  // El nonce se anota solo con la firma buena: un tercero no puede «gastar» nonces ajenos.
  if (resultado !== 'ok' || nonce === null || !contexto.nonces.registrar(nonce)) {
    registrar({ evento: 'interno_rechazado', motivo: resultado === 'ok' ? 'nonce_repetido' : resultado })

    return responder(res, 401, { error: { code: 'firma_invalida' } })
  }

  if (destino.tipo === 'aplicar') return aplicarActa(res, cuerpo, destino.actaId, contexto)

  const aceptados = await aplicarLote(cuerpo, contexto)

  if (aceptados === null) return responder(res, 422, { error: { code: 'lote_invalido' } })

  responder(res, 202, { aceptados })
}
