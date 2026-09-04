import { mensajeDeRespuesta } from './cliente.ts'

/**
 * Cliente de Server-Sent Events del navegador.
 *
 * Se usa `fetch` + `getReader()` y **no `EventSource`**, que a primera vista seria lo obvio. Las tres
 * razones son bloqueantes, no de gusto: `EventSource` solo hace `GET`, no manda cuerpo, y no se
 * cancela con un `AbortSignal` —solo con `close()`, que no se puede pasar a un `useEffect`—. La capa
 * de IA necesita las tres cosas: genera con `POST`, manda la pregunta en el cuerpo y aborta cuando
 * la persona cambia de pestaña, porque un stream que nadie mira igual quema tokens.
 *
 * Este archivo no sabe nada de IA: parte texto y entrega frames. Interpretarlos es de `dominio/ia.ts`.
 */

/** Metodos que la capa de IA usa. `DELETE` no transmite, pero comparte el mismo camino de error. */
export type MetodoSSE = 'GET' | 'POST' | 'DELETE'

export interface OpcionesSSE {
  /** Por defecto `POST`: en este contrato el `GET` lee lo guardado y el `POST` es el que genera. */
  metodo?: MetodoSSE
  /** Cuerpo JSON. `undefined` no manda cuerpo ni `content-type`. */
  cuerpo?: unknown
  /** Para abortar al desmontar el componente o al cambiar de pestaña. */
  senal?: AbortSignal
}

/**
 * Parte un buffer de texto en frames SSE completos.
 *
 * Es la unica parte de todo esto con reglas, y por eso esta exportada y probada aparte: si se rompe,
 * **toda respuesta de IA sale truncada sin dar un solo error**. Un splitter que se equivoca no lanza:
 * simplemente se come el ultimo pedazo o parte un frame por la mitad.
 *
 * Un frame termina en una linea en blanco. Los saltos pueden ser `\n` o `\r\n` —el contrato dice
 * `\n`, pero un proxy que reescriba la respuesta puede cambiarlos—, asi que se normalizan. El `\r`
 * final del buffer se retiene sin normalizar: puede ser la primera mitad de un `\r\n` cuyo `\n`
 * llega en el chunk siguiente, y convertirlo ahi mismo inventaria un fin de frame que no existe.
 *
 * Un frame puede traer varias lineas `data:`; eso NO lo parte, porque el separador es la linea en
 * blanco y no el salto de linea. Los frames vacios (los que deja un `: ping` seguido de dos saltos,
 * o dos lineas en blanco juntas) se descartan.
 *
 * @param buffer todo lo recibido y todavia no entregado, incluido el `resto` de la llamada anterior
 * @returns los frames completos, sin la linea en blanco final, y lo que quedo a medias
 */
export function partirEventos (buffer: string): { eventos: string[], resto: string } {
  const colgante = buffer.endsWith('\r') ? '\r' : ''
  const seguro = colgante === '' ? buffer : buffer.slice(0, -1)
  const partes = seguro.replace(/\r\n|\r/g, '\n').split('\n\n')
  const resto = partes.pop() ?? ''

  return {
    eventos: partes.filter((frame) => frame.trim() !== ''),
    resto: resto + colgante
  }
}

/**
 * Pide una ruta del BFF como stream y entrega los frames a medida que llegan.
 *
 * El error se arma con `mensajeDeRespuesta()` para no reescribir la lectura del envelope: un `429`
 * o un `503` anteriores al primer byte llegan como JSON con su codigo HTTP real, igual que en
 * cualquier otra llamada del panel. Una vez abierto el stream el HTTP ya es `200`, y a partir de ahi
 * los errores viajan como un frame mas: quien consume tiene que mirarlos, no esperarlos como
 * excepcion.
 *
 * @param ruta ruta sin la base del BFF ni barra inicial. Ej: `ia/inicio`.
 * @param opciones metodo, cuerpo y señal de aborto
 * @returns un generador de frames SSE crudos, tal como llegaron
 * @throws Error con el mensaje del contrato si la respuesta no es correcta o no trae cuerpo
 */
export async function * leerSSE (ruta: string, opciones: OpcionesSSE = {}): AsyncGenerator<string> {
  const { metodo = 'POST', cuerpo, senal } = opciones

  const respuesta = await fetch(`/api/bff/${ruta}`, {
    method: metodo,
    headers: cabeceras(cuerpo),
    body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
    signal: senal
  })

  if (!respuesta.ok) throw new Error(await mensajeDeRespuesta(respuesta))
  if (respuesta.body === null) throw new Error('El servidor respondió sin cuerpo')

  yield * frames(respuesta.body, senal)
}

/** Cabeceras del pedido. El `content-type` solo va si hay cuerpo, o el servidor espera uno vacio. */
function cabeceras (cuerpo: unknown): Record<string, string> {
  const base = { accept: 'text/event-stream' }

  return cuerpo === undefined ? base : { ...base, 'content-type': 'application/json' }
}

/**
 * Lee el cuerpo hasta el final y va soltando frames completos.
 *
 * El ultimo frame se emite aunque el servidor cierre sin la linea en blanco final: cerrar la
 * conexion tambien termina un frame, y perder el `fin` por eso dejaria la interfaz esperando para
 * siempre.
 *
 * El lector se cancela en el `finally` y no solo al terminar: si quien consume abandona el generador
 * a media respuesta —cambia de pestaña, desmonta el componente—, sin ese `cancel()` la conexion
 * queda abierta y el servidor sigue generando para nadie.
 *
 * @param cuerpo el stream de la respuesta
 * @param senal la misma señal del pedido, para no seguir leyendo despues de abortar
 */
async function * frames (cuerpo: ReadableStream<Uint8Array>, senal?: AbortSignal): AsyncGenerator<string> {
  const lector = cuerpo.getReader()
  const decodificador = new TextDecoder()
  let buffer = ''

  try {
    while (senal?.aborted !== true) {
      const { done, value } = await lector.read()

      if (done) break

      buffer += decodificador.decode(value, { stream: true })

      const { eventos, resto } = partirEventos(buffer)

      buffer = resto
      yield * eventos
    }

    yield * partirEventos(`${buffer}\n\n`).eventos
  } finally {
    await lector.cancel().catch(() => {
      // El stream ya estaba cerrado por el otro lado: no hay nada que cancelar ni nada que informar.
    })
  }
}
