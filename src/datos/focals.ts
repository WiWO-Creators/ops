/**
 * Los datos de la pantalla de Focals: el semáforo de las cuentas de las que uno responde.
 *
 * Vive en su propio archivo y no en `datos/recursos.ts` por el mismo motivo que `datos/auditoria.ts`:
 * no es un recurso de negocio —nadie crea ni edita un semáforo— sino la lectura que sostiene una
 * pantalla. `ScoreCliente` sí está en `recursos.ts`, y desde acá se reusa: el score por Proyecto es
 * la misma forma con `project_id`/`espacio` donde el otro trae `client_id`/`cliente`, y repetir los
 * tipos de las tres señales acá sería tener dos definiciones del mismo contrato.
 *
 * **Nada de acá pide nada.** No importa `datos/servidor`: las dos llamadas las hace la página, que es
 * un Server Component. Así este archivo se puede probar con `node --test` sin montar Next.
 */

import type { PuntoScoreCliente, ScoreCliente, SemaforoCliente } from './recursos'

/** El parrafo con que la IA explica un semáforo. `null` mientras nadie lo haya pedido. */
export interface EstadoDeSalud {
  texto: string
  /** Instante en que se redactó, `YYYY-MM-DD HH:MM:SS`. */
  generado_en: string
  /**
   * `false` cuando las señales se movieron después de redactarlo. El texto sigue viajando —dice de
   * cuándo es y es mejor que nada—, pero cita números que ya cambiaron.
   */
  vigente: boolean
}

/**
 * La foto diaria del semáforo de un Proyecto, tal como la devuelven `GET /scores/espacios` y
 * `GET /scores/espacios/{projectId}`.
 *
 * Es la MISMA forma que `ScoreCliente` —mismo `score`, mismo `semaforo`, mismas tres señales con los
 * mismos pesos— para que la pantalla no tenga que aprender dos formatos. Lo único que cambia es qué
 * se está puntuando y el `estado`, que en el del cliente no existe.
 */
export interface ScoreEspacio {
  project_id: number
  /** Nombre del Proyecto, resuelto por el servidor para no pedir la ficha aparte. */
  espacio: string | null
  client_id: number | null
  cliente: string | null
  /** Día de la foto, `YYYY-MM-DD`. El cálculo corre una vez al día. */
  fecha: string
  score: number | null
  semaforo: SemaforoCliente
  /** Puntos ganados o perdidos contra la foto anterior. `null` si no hay con qué comparar. */
  variacion: number | null
  procesos: number
  /** Las mismas tres señales del score de cliente, con los mismos pesos. */
  senales: ScoreCliente['senales']
  estado: EstadoDeSalud | null
  /** Solo en `GET /scores/espacios/{projectId}`: las últimas fotos, de la más vieja a la más nueva. */
  historia?: PuntoScoreCliente[]
}

/** Lo que devuelve `POST /ia/proyectos/{id}/estado`. */
export interface EstadoRedactado extends EstadoDeSalud {
  /** `true` cuando el texto ya estaba pagado sobre estas mismas señales y no se llamó al modelo. */
  reutilizado: boolean
}

/** Un cliente del que uno es focal, con su semáforo y el de cada uno de sus Proyectos. */
export interface CuentaFocal {
  cliente: ScoreCliente
  espacios: ScoreEspacio[]
}

/** `GET /scores?focal=me`: los clientes de los que esta persona responde. */
export const RUTA_CLIENTES_FOCAL = '/scores?focal=me'

/** `GET /scores/espacios?focal=me`: los Proyectos de esos mismos clientes, de una sola vez. */
export const RUTA_ESPACIOS_FOCAL = '/scores/espacios?focal=me'

/** `POST /ia/proyectos/{id}/estado`, para el BFF (sin barra inicial), con el id ya escapado. */
export function rutaDeEstado (espacioId: number): string {
  return `ia/proyectos/${encodeURIComponent(String(espacioId))}/estado`
}

/**
 * Une las dos listas en una por cliente, en el orden en que llegaron los clientes.
 *
 * El orden lo pone el servidor —del peor score al mejor, y los `sin_datos` al final—, y acá no se
 * reordena: la pantalla mostraría un orden distinto del que el listado declara. Lo que sí se ordena
 * son los Proyectos dentro de cada cliente, porque llegan mezclados entre todos.
 *
 * Un Proyecto cuyo `client_id` no esté entre los clientes se descarta en vez de inventarle una
 * tarjeta: significaría que las dos llamadas vieron carteras distintas, y media pantalla con un
 * cliente sin nombre es peor que un Proyecto de menos.
 *
 * @param clientes lo que devolvió `GET /scores?focal=me`
 * @param espacios lo que devolvió `GET /scores/espacios?focal=me`
 * @returns una entrada por cliente, con sus Proyectos ya ordenados
 */
export function agruparPorCliente (clientes: ScoreCliente[], espacios: ScoreEspacio[]): CuentaFocal[] {
  const porCliente = new Map<number, ScoreEspacio[]>(clientes.map((c) => [c.client_id, []]))

  for (const espacio of espacios) {
    if (espacio.client_id === null) continue

    porCliente.get(espacio.client_id)?.push(espacio)
  }

  return clientes.map((cliente) => ({
    cliente,
    espacios: ordenarPorSemaforo(porCliente.get(cliente.client_id) ?? [])
  }))
}

/**
 * Del peor al mejor, y lo que no se puede puntuar al final.
 *
 * Es el mismo criterio con el que el servidor ordena los listados. Un `sin_datos` arriba de todo
 * ocuparía el lugar de lo urgente sin ser urgente: no es lo peor, es lo que no se sabe.
 *
 * @param espacios los Proyectos de un cliente, en cualquier orden
 * @returns una copia ordenada; el arreglo de entrada no se toca
 */
export function ordenarPorSemaforo (espacios: ScoreEspacio[]): ScoreEspacio[] {
  return [...espacios].sort((uno, otro) => {
    if (uno.score === null && otro.score === null) return nombreDe(uno).localeCompare(nombreDe(otro), 'es')
    if (uno.score === null) return 1
    if (otro.score === null) return -1
    if (uno.score !== otro.score) return uno.score - otro.score

    return nombreDe(uno).localeCompare(nombreDe(otro), 'es')
  })
}

/**
 * Cuántos Proyectos hay en cada tramo del semáforo.
 *
 * Es lo que deja leer una cuenta sin abrirla: "4 Proyectos, 3 en rojo" dice más que el promedio de
 * sus scores, que además no es el score del cliente —el servidor lo calcula sobre las Tareas, no
 * promediando Proyectos—.
 *
 * @param espacios los Proyectos de un cliente
 * @returns la cuenta de cada tramo, con los cuatro tramos siempre presentes
 */
export function contarPorTramo (espacios: ScoreEspacio[]): Record<SemaforoCliente, number> {
  const cuenta: Record<SemaforoCliente, number> = { verde: 0, amarillo: 0, rojo: 0, sin_datos: 0 }

  for (const espacio of espacios) cuenta[espacio.semaforo] += 1

  return cuenta
}

/** El nombre del Proyecto, o una marca legible si el servidor no lo trae. */
export function nombreDe (espacio: ScoreEspacio): string {
  return espacio.espacio ?? `#${espacio.project_id}`
}

/**
 * Qué decir cuando `POST /ia/proyectos/{id}/estado` no devolvió un párrafo.
 *
 * Los tres primeros códigos se traducen acá y no se muestra el mensaje del servidor porque los tres
 * significan "esto no está roto": la IA está apagada, todavía no corrió el cálculo del día, o se
 * acabó la cuota. Decirlo con las palabras del servidor —`Recurso desconocido: "ia"`— parece un
 * error de la aplicación, y manda a alguien a buscar un problema que no existe.
 *
 * El 404 es inconfundible: con el interruptor apagado la rama `/ia/*` entera responde 404, y la
 * falta de foto del día viaja como 409 justamente para no mezclarse con eso.
 *
 * @param estadoHttp el código con el que respondió el BFF
 * @param mensajeApi el mensaje del contrato, para lo que no está previsto acá
 * @returns una línea para mostrar debajo del semáforo, que sigue pintado
 */
export function mensajeDeFalloDeEstado (estadoHttp: number, mensajeApi: string): string {
  if (estadoHttp === 404) return 'WiBot está apagado: el semáforo se ve igual, pero nadie puede redactar el estado.'
  if (estadoHttp === 409) return 'Todavía no hay foto de hoy de este Proyecto. El cálculo corre una vez al día.'
  if (estadoHttp === 429) return 'Se acabó la cuota de WiBot por ahora. El semáforo no depende de ella.'

  return mensajeApi
}
