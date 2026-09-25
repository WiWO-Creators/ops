import { mensajeDeRespuesta } from '@/datos/cliente'
import { escribirEnBff, type Resultado } from '@/componentes/datos/mutaciones'
import { partirEnLotes } from '@/dominio/drive-explorador'
import type {
  ArchivoDriveSubido, CambioNodoDrive, FalloTrasladoDrive, NodoDrive, ResultadoTrasladoDrive, TrasladoDrive
} from '@/datos/recursos'

/**
 * Las escrituras del explorador de Drive que no caben en `escribirEnBff` tal cual: la subida con
 * progreso y el traslado en lote con su resultado por item.
 */

/** Ruta del BFF de una carpeta, con el id escapado. */
export function rutaDeCarpeta (folderId: string): string {
  return `drive/${encodeURIComponent(folderId)}`
}

/** Ruta del BFF de un hijo de una carpeta: la del `PATCH` y el `DELETE`. */
export function rutaDeHijo (folderId: string, itemId: string): string {
  return `${rutaDeCarpeta(folderId)}/files/${encodeURIComponent(itemId)}`
}

/**
 * Sube un archivo mostrando el avance, con posibilidad de cancelar.
 *
 * Va por `XMLHttpRequest` y no por `fetch` porque `fetch` todavía no informa el avance de lo que se
 * manda: sin eso, una subida de 20 MB es una barra quieta durante un minuto. El error se lee con
 * `mensajeDeRespuesta`, igual que el resto de las escrituras, para que un `422` diga "La extensión
 * .exe no está permitida" y no un código.
 *
 * @param folderId la carpeta de destino
 * @param archivo el archivo a subir, en el campo `file` del multipart
 * @param alAvanzar recibe la fracción enviada, de 0 a 1
 * @param senal cancela la subida; la promesa resuelve con `cancelada: true`
 * @returns el archivo creado, o el motivo del fallo
 */
export function subirConAvance (
  folderId: string,
  archivo: File,
  alAvanzar: (fraccion: number) => void,
  senal: AbortSignal
): Promise<Resultado<ArchivoDriveSubido> & { cancelada?: boolean }> {
  return new Promise((resolver) => {
    const pedido = new XMLHttpRequest()
    const cuerpo = new FormData()
    cuerpo.append('file', archivo)

    pedido.open('POST', `/api/bff/${rutaDeCarpeta(folderId)}/files`)
    pedido.upload.onprogress = (evento) => {
      if (evento.lengthComputable && evento.total > 0) alAvanzar(evento.loaded / evento.total)
    }
    pedido.onerror = () => { resolver({ ok: false, mensaje: 'No se pudo contactar al servidor. Revisa tu conexión.' }) }
    pedido.onabort = () => { resolver({ ok: false, mensaje: 'Subida cancelada.', cancelada: true }) }
    pedido.onload = () => { void resolverCarga(pedido).then(resolver) }

    senal.addEventListener('abort', () => { pedido.abort() }, { once: true })
    pedido.send(cuerpo)
  })
}

/** Convierte la respuesta de una subida en el mismo resultado que devuelve `escribirEnBff`. */
async function resolverCarga (pedido: XMLHttpRequest): Promise<Resultado<ArchivoDriveSubido>> {
  const respuesta = new Response(pedido.responseText, {
    status: pedido.status,
    headers: { 'content-type': pedido.getResponseHeader('content-type') ?? 'application/json' }
  })

  if (!respuesta.ok) return { ok: false, mensaje: await mensajeDeRespuesta(respuesta), estado: respuesta.status }

  try {
    const sobre = await respuesta.json() as { data?: ArchivoDriveSubido | null }
    if (sobre.data !== undefined && sobre.data !== null) return { ok: true, datos: sobre.data, estado: respuesta.status }
  } catch {
    // Un proxy puede devolver HTML con 200: eso no confirma que el archivo se haya guardado.
  }

  return { ok: false, mensaje: 'El servidor no confirmó que el archivo se haya guardado. Inténtalo de nuevo.' }
}

/** Lleva un fallo de un pedido entero a un fallo por cada id del pedido. */
function fallosDeTodos (ids: readonly string[], mensaje: string, estado: number | undefined): FalloTrasladoDrive[] {
  return ids.map((id) => ({ id, error: mensaje, status: estado ?? 0 }))
}

/** Mueve un solo item con el `PATCH`, y lo cuenta como un lote de uno. */
async function trasladarUno (padreId: string, id: string, destinoId: string): Promise<ResultadoTrasladoDrive> {
  const cambio: CambioNodoDrive = { parent_id: destinoId }
  const resultado = await escribirEnBff<NodoDrive>(rutaDeHijo(padreId, id), 'PATCH', cambio)

  return resultado.ok
    ? { moved: [id], failed: [] }
    : { moved: [], failed: fallosDeTodos([id], resultado.mensaje, resultado.estado) }
}

/** Suma los resultados de varios lotes en uno. */
function sumarResultados (resultados: readonly ResultadoTrasladoDrive[]): ResultadoTrasladoDrive {
  return {
    moved: resultados.flatMap((resultado) => resultado.moved),
    failed: resultados.flatMap((resultado) => resultado.failed)
  }
}

/**
 * Mueve varios hijos de una carpeta a otra y devuelve qué se movió y qué no, item por item.
 *
 * Un solo item va por el `PATCH` de siempre; varios, por `POST /drive/{folder_id}/move` en lotes de
 * 50. Si esa ruta todavía no existe en el backend (`404` del pedido entero), se cae al `PATCH` uno por
 * uno: la pantalla funciona igual contra un backend anterior al lote, solo que con más viajes.
 *
 * Nunca lanza: un pedido que falla entero se cuenta como un fallo por cada id, con el mismo motivo.
 *
 * @param padreId la carpeta donde están hoy los items
 * @param ids los items, todos hijos directos de `padreId`
 * @param destinoId la carpeta de destino
 */
export async function trasladarNodos (padreId: string, ids: readonly string[], destinoId: string): Promise<ResultadoTrasladoDrive> {
  if (ids.length === 0) return { moved: [], failed: [] }
  if (ids.length === 1 && ids[0] !== undefined) return await trasladarUno(padreId, ids[0], destinoId)

  const resultados: ResultadoTrasladoDrive[] = []

  for (const lote of partirEnLotes(ids)) {
    const cuerpo: TrasladoDrive = { item_ids: lote, parent_id: destinoId }
    const resultado = await escribirEnBff<ResultadoTrasladoDrive>(`${rutaDeCarpeta(padreId)}/move`, 'POST', cuerpo)

    if (resultado.ok && resultado.datos !== undefined) {
      resultados.push({ moved: resultado.datos.moved ?? [], failed: resultado.datos.failed ?? [] })
      continue
    }

    if (!resultado.ok && resultado.estado === 404) {
      resultados.push(sumarResultados(await Promise.all(lote.map((id) => trasladarUno(padreId, id, destinoId)))))
      continue
    }

    const mensaje = resultado.ok ? 'El servidor no informó qué se movió.' : resultado.mensaje
    resultados.push({ moved: [], failed: fallosDeTodos(lote, mensaje, resultado.estado) })
  }

  return sumarResultados(resultados)
}

/**
 * Corre una tarea por cada elemento con un tope de tareas en paralelo, y devuelve los resultados en
 * el mismo orden.
 *
 * @param elementos lo que hay que procesar
 * @param limite cuántas tareas a la vez
 * @param tarea lo que se hace con cada elemento; no debería lanzar
 */
export async function enParalelo<T, R> (elementos: readonly T[], limite: number, tarea: (elemento: T) => Promise<R>): Promise<R[]> {
  const resultados: R[] = new Array<R>(elementos.length)
  let siguiente = 0

  async function trabajador (): Promise<void> {
    while (siguiente < elementos.length) {
      const indice = siguiente++
      resultados[indice] = await tarea(elementos[indice] as T)
    }
  }

  await Promise.all(Array.from({ length: Math.min(limite, elementos.length) }, trabajador))
  return resultados
}
