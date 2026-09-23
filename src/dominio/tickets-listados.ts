import { formatearRelativo } from '../lib/fechas.ts'

/**
 * Reglas de los listados de tickets: la pestaña del Proyecto, la bandeja global del equipo y la
 * bandeja de Solicitudes del portal.
 *
 * Vive en un `.ts` sin JSX para poder probarse con `node --test`: quien espera a quien, que cuenta
 * como no leido y que dice el contador de la pestaña son justo las reglas que se rompen en silencio
 * cuando la API cambia un tipo (`adminread` pasa de booleano a `0|1`, por ejemplo).
 *
 * Fuente: `CONTRATO2.md`, secciones E (portal) y F (listados del equipo).
 */

/**
 * Evento de ventana que avisa que un ticket cambio (respuesta, estado, prioridad, alta).
 *
 * Lo dispara el modal del ticket; lo escuchan la pestaña Tickets, su contador, la bandeja global y la
 * bandeja del portal para volver a pedir su pagina con la consulta que tienen puesta. Es un evento y
 * no una prop porque el modal y los listados no siempre comparten padre: el contador vive en la barra
 * de pestañas y la tabla dentro del panel.
 */
// Tiene que coincidir con `EVENTO_TICKETS_CAMBIADOS` de `dominio/ticket-vista.ts` (rama del modal,
// que lo emite con `detail: { id }`). Es el unico lugar de los listados donde se nombra: al integrar
// las dos ramas, este `export` pasa a reexportar aquel y los listados no cambian.
export const EVENTO_TICKETS_CAMBIADOS = 'ops:tickets-cambiados'

/** Estado «Cerrado» de Perfex (`tbltickets_status`, id 5). Un ticket cerrado no espera a nadie. */
const CERRADO = 5

/** Quien escribio el ultimo mensaje del hilo, tal como lo manda la API (`ultimo_de`). */
export type LadoDelTicket = 'equipo' | 'cliente'

/** Lo minimo de una fila de listado del equipo para decidir espera y lectura. */
export interface FilaConEspera {
  status: number
  ultimo_de?: LadoDelTicket | null
  /** ISO del ultimo mensaje del cliente, solo cuando `ultimo_de` es `cliente`. */
  espera_desde?: string | null
  lastreply?: string | null
  date?: string | null
  /** `0|1` segun el contrato v2; la forma anterior lo mandaba booleano. Se aceptan las dos. */
  adminread?: boolean | number | null
}

/** Espera de un ticket, lista para pintar. */
export interface EsperaDeTicket {
  /** A quien le toca mover: `equipo` si el cliente escribio lo ultimo, `cliente` al reves. */
  lado: LadoDelTicket
  etiqueta: string
  /** Desde cuando, en forma relativa ("hace 3 horas"), o `null` si la API no dio la fecha. */
  desde: string | null
  /** El instante crudo, para el `title` y el `dateTime`. */
  instante: string | null
}

/**
 * A quien espera un ticket, o `null` si no espera a nadie.
 *
 * Un ticket cerrado no espera, y uno sin `ultimo_de` tampoco: sin el dato no se inventa un lado. La
 * fecha del lado equipo sale de `espera_desde` (el contrato la manda solo en ese caso); la del lado
 * cliente, de `lastreply`, que es cuando el equipo contesto.
 *
 * @param fila la fila del listado
 * @param ahora referencia para el tiempo relativo, inyectable en pruebas
 * @returns la espera, o `null`
 */
export function esperaDelTicket (fila: FilaConEspera, ahora: Date = new Date()): EsperaDeTicket | null {
  if (fila.status === CERRADO) return null
  if (fila.ultimo_de !== 'equipo' && fila.ultimo_de !== 'cliente') return null

  const lado: LadoDelTicket = fila.ultimo_de === 'cliente' ? 'equipo' : 'cliente'
  const instante = lado === 'equipo'
    ? (fila.espera_desde ?? fila.lastreply ?? fila.date ?? null)
    : (fila.lastreply ?? null)
  const relativo = instante === null ? null : formatearRelativo(instante, ahora)

  return {
    lado,
    etiqueta: lado === 'equipo' ? 'Esperando al equipo' : 'Esperando al cliente',
    desde: relativo === null || relativo === '—' ? null : relativo,
    instante
  }
}

/**
 * Si el equipo todavia no leyo lo ultimo que escribio el cliente.
 *
 * Solo `adminread` en `0` o `false` cuenta: una fila que no trae el campo (backend anterior al
 * contrato v2) no se marca, porque resaltar todo es lo mismo que no resaltar nada.
 *
 * @param fila la fila del listado
 * @returns `true` si hay que resaltarla
 */
export function noLeidoPorElEquipo (fila: Pick<FilaConEspera, 'adminread'>): boolean {
  return fila.adminread === 0 || fila.adminread === false
}

/** Contadores de la pestaña Tickets (`GET /projects/{id}/tickets/contadores`). */
export interface ContadoresDeTickets {
  abiertos: number
  esperandoEquipo: number
  sinLeer: number
}

/**
 * Sanea la respuesta de los contadores.
 *
 * Nunca lanza: un contador ilegible no puede tumbar la barra de pestañas. Si `abiertos` no es un
 * entero no negativo, no hay contador que mostrar (`null`) y la pestaña queda con su nombre a secas;
 * los otros dos caen a 0 porque solo acompañan.
 *
 * @param crudo el `data` tal como llego
 * @returns los contadores, o `null` si no son usables
 */
export function leerContadores (crudo: unknown): ContadoresDeTickets | null {
  if (crudo === null || typeof crudo !== 'object') return null

  const datos = crudo as Record<string, unknown>
  const abiertos = entero(datos.abiertos)

  if (abiertos === null) return null

  return {
    abiertos,
    esperandoEquipo: entero(datos.esperando_equipo) ?? 0,
    sinLeer: entero(datos.sin_leer) ?? 0
  }
}

/**
 * Entero no negativo, o `null`.
 *
 * @param valor lo que llego
 * @returns el entero truncado, o `null` si no es un numero finito no negativo
 */
function entero (valor: unknown): number | null {
  if (typeof valor !== 'number' || !Number.isFinite(valor) || valor < 0) return null

  return Math.trunc(valor)
}

/**
 * Nombre accesible completo de la pestaña con su contador ("Tickets · 3, 1 esperando al equipo").
 *
 * @param base el rotulo de la pestaña
 * @param contadores lo que dijo la API, o `null` si todavia no llego o fallo
 * @returns el texto para lectores de pantalla y para el `title`
 */
export function etiquetaDePestana (base: string, contadores: ContadoresDeTickets | null): string {
  if (contadores === null) return base

  const abiertos = `${base} · ${contadores.abiertos} ${contadores.abiertos === 1 ? 'abierto' : 'abiertos'}`

  if (contadores.esperandoEquipo === 0) return abiertos

  return `${abiertos}, ${contadores.esperandoEquipo} esperando al equipo`
}

/** Lo minimo de una fila del portal para decidir su resaltado. */
export interface FilaDelPortal {
  status: number
  no_leido?: boolean
  /** No esta en el contrato del portal; si algun dia llega, manda sobre `no_leido`. */
  ultimo_de?: LadoDelTicket | null
}

/**
 * Si la solicitud tiene una respuesta del equipo que el cliente no vio.
 *
 * @param fila la fila del portal
 * @returns `true` solo si la API dijo `no_leido: true`
 */
export function noLeidoPorElCliente (fila: Pick<FilaDelPortal, 'no_leido'>): boolean {
  return fila.no_leido === true
}

/**
 * Si la solicitud espera una respuesta del cliente.
 *
 * El listado del portal no trae `ultimo_de` (CONTRATO2 E): lo que si trae es `no_leido`, que por
 * definicion implica que lo ultimo lo escribio el equipo. Asi que sin `ultimo_de` una solicitud no
 * leida espera respuesta, y una leida no se marca. Una cerrada nunca espera.
 *
 * @param fila la fila del portal
 * @returns `true` si hay que mostrar "Esperando tu respuesta"
 */
export function esperaTuRespuesta (fila: FilaDelPortal): boolean {
  if (fila.status === CERRADO) return false
  if (fila.ultimo_de === 'equipo' || fila.ultimo_de === 'cliente') return fila.ultimo_de === 'equipo'

  return noLeidoPorElCliente(fila)
}

/**
 * Ultima actividad de un ticket: la ultima respuesta, o la apertura si nadie respondio.
 *
 * @param fila la fila del listado
 * @returns el instante, o `null` si no hay ninguno
 */
export function ultimaActividad (fila: { lastreply?: string | null, last_reply?: string | null, date?: string | null }): string | null {
  return fila.lastreply ?? fila.last_reply ?? fila.date ?? null
}

/** Parametro de URL del filtro por espera; es el mismo que escribe el selector de filtros. */
const PARAMETRO_ESPERA = 'filter[esperando]'

/**
 * Si la URL tiene puesto el filtro "Esperando al equipo".
 *
 * @param params los parametros de la URL
 * @returns `true` si el filtro vale exactamente `equipo`
 */
export function filtraEsperandoAlEquipo (params: URLSearchParams): boolean {
  return params.get(PARAMETRO_ESPERA) === 'equipo'
}

/**
 * La URL con el filtro rapido "Esperando al equipo" alternado.
 *
 * Vuelve a la primera pagina (`page` fuera): la pagina 3 de una lista filtrada suele no existir.
 * Conserva el resto —estado, orden, pestaña, ticket abierto—, porque el filtro rapido es un atajo del
 * selector de filtros y no una vista aparte.
 *
 * @param params los parametros de la URL
 * @returns la query nueva, siempre con `?` aunque quede vacia
 */
export function alternarEsperandoAlEquipo (params: URLSearchParams): string {
  const siguientes = new URLSearchParams(params.toString())

  if (filtraEsperandoAlEquipo(params)) siguientes.delete(PARAMETRO_ESPERA)
  else siguientes.set(PARAMETRO_ESPERA, 'equipo')

  siguientes.delete('page')

  return `?${siguientes.toString()}`
}
