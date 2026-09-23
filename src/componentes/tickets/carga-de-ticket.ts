import { listaDe } from '@/datos/catalogos'
import { mensajeDeRespuesta, pedirRespuesta } from '@/datos/cliente'
import type { AdjuntoTicket, EstadoLookup, Lookups, RespuestaPredefinida, RespuestaTicket, TicketDetalle } from '@/datos/recursos'
import type { TicketPortalDetalle } from '@/datos/portal'
import { rutaDeTicket, vistaDelTicket, type FuenteDeTicket, type TicketVista } from '@/dominio/ticket-vista'

/**
 * Lecturas del modal de ticket: la ficha con su hilo y adjuntos, y los catalogos.
 *
 * Los catalogos (`lookups`) se piden **una vez por pestaña y por sujeto** y se comparten entre
 * aperturas: abrir diez tickets seguidos no son diez viajes por la misma lista de estados. Si fallan,
 * el modal no se cae: los estados y prioridades se nombran por numero (o no se nombran, en el portal)
 * y el resto del ticket se lee igual, que es a lo que la persona vino.
 */

/** Lo que el modal tiene para dibujar. */
export type CargaDeTicket =
  | { fase: 'cargando' }
  | { fase: 'noEncontrado' }
  | { fase: 'error', mensaje: string }
  | { fase: 'listo', ticket: TicketVista, estados: EstadoLookup[], prioridades: EstadoLookup[] }

/** Los catalogos del ticket, ya reducidos a las dos listas que se usan. */
interface CatalogosDeTicket {
  estados: EstadoLookup[]
  prioridades: EstadoLookup[]
}

/** Catalogos en vuelo o resueltos, por ruta de lookups (una por sujeto). */
const catalogosEnMemoria = new Map<string, Promise<CatalogosDeTicket>>()

/** Predefinidas en vuelo o resueltas, por ruta. */
const predefinidasEnMemoria = new Map<string, Promise<RespuestaPredefinida[]>>()

/** Catalogos vacios: con ellos el modal nombra por numero y no ofrece menus. */
const SIN_CATALOGOS: CatalogosDeTicket = { estados: [], prioridades: [] }

/**
 * Los catalogos de un sujeto, compartidos por todas las aperturas.
 *
 * Sin señal de aborto a proposito: la promesa la comparten varias aperturas, y cerrar una no puede
 * cortarle la carga a la siguiente. Un fallo no se guarda, para que la proxima apertura reintente.
 *
 * @param ruta la ruta de lookups del sujeto
 * @returns los catalogos, o listas vacias si no se pudieron traer
 */
async function catalogos (ruta: string): Promise<CatalogosDeTicket> {
  let enVuelo = catalogosEnMemoria.get(ruta)

  if (enVuelo === undefined) {
    enVuelo = pedirRespuesta(ruta, new AbortController().signal).then(async (respuesta) => {
      if (!respuesta.ok) throw new Error(await mensajeDeRespuesta(respuesta))

      const { data } = await respuesta.json() as { data: Lookups }

      return { estados: listaDe(data, 'ticket_statuses'), prioridades: listaDe(data, 'ticket_priorities') }
    })
    catalogosEnMemoria.set(ruta, enVuelo)
    enVuelo.catch(() => { catalogosEnMemoria.delete(ruta) })
  }

  try {
    return await enVuelo
  } catch {
    // Degradar y no caer: sin nombres de estado el ticket se sigue leyendo y respondiendo.
    return SIN_CATALOGOS
  }
}

/**
 * Lee una ruta opcional del ticket: su falta no impide mostrar el resto.
 *
 * @returns el `data`, o `vacio` si la ruta no existe o fallo
 */
async function opcional<T> (ruta: string | null, senal: AbortSignal, vacio: T): Promise<T> {
  if (ruta === null) return vacio

  const respuesta = await pedirRespuesta(ruta, senal)

  if (!respuesta.ok) return vacio

  return (await respuesta.json() as { data: T }).data
}

/**
 * Trae la ficha, el hilo (si el sujeto lo pide aparte), los adjuntos de apertura y los catalogos.
 *
 * Nunca lanza: el error del contrato es un valor mas y el modal tiene que poder mostrarlo. Solo la
 * ficha y el hilo son obligatorios; catalogos y adjuntos degradan.
 *
 * @param fuente de donde baja el ticket
 * @param ticketId el ticket
 * @param senal aborta las peticiones si el modal se cierra o llega una lectura mas nueva
 * @returns la carga resuelta; `cargando` si se aborto
 */
export async function cargarTicket (fuente: FuenteDeTicket, ticketId: number, senal: AbortSignal): Promise<CargaDeTicket> {
  try {
    const rutaArchivos = fuente.archivos === null ? null : rutaDeTicket(fuente.archivos, ticketId)
    const [ficha, hilo, archivos, listas] = await Promise.all([
      pedirRespuesta(rutaDeTicket(fuente.ticket, ticketId), senal),
      fuente.respuestas === null ? Promise.resolve(null) : pedirRespuesta(rutaDeTicket(fuente.respuestas, ticketId), senal),
      opcional<AdjuntoTicket[]>(rutaArchivos, senal, []),
      catalogos(fuente.lookups)
    ])

    if (ficha.status === 404) return { fase: 'noEncontrado' }

    for (const respuesta of [ficha, hilo]) {
      if (respuesta !== null && !respuesta.ok) return { fase: 'error', mensaje: await mensajeDeRespuesta(respuesta) }
    }

    const { data } = await ficha.json() as { data: TicketDetalle | TicketPortalDetalle }
    const respuestas = hilo === null ? [] : (await hilo.json() as { data: RespuestaTicket[] }).data

    return {
      fase: 'listo',
      ticket: vistaDelTicket(fuente, data, respuestas, archivos),
      estados: listas.estados,
      prioridades: listas.prioridades
    }
  } catch (fallo) {
    if (senal.aborted) return { fase: 'cargando' }

    return { fase: 'error', mensaje: fallo instanceof Error ? fallo.message : 'No se pudo cargar el ticket.' }
  }
}

/**
 * Las respuestas predefinidas, pedidas una vez por pestaña.
 *
 * @param ruta la de la fuente
 * @returns la lista
 * @throws Error con el mensaje del contrato; el proximo llamado reintenta
 */
export async function cargarPredefinidas (ruta: string): Promise<RespuestaPredefinida[]> {
  let enVuelo = predefinidasEnMemoria.get(ruta)

  if (enVuelo === undefined) {
    enVuelo = pedirRespuesta(ruta, new AbortController().signal).then(async (respuesta) => {
      if (!respuesta.ok) throw new Error(await mensajeDeRespuesta(respuesta))

      return (await respuesta.json() as { data: RespuestaPredefinida[] }).data
    })
    predefinidasEnMemoria.set(ruta, enVuelo)
    enVuelo.catch(() => { predefinidasEnMemoria.delete(ruta) })
  }

  return await enVuelo
}
