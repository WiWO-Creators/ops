import { escribirEnBff, leerDelBff, type Resultado } from '@/componentes/datos/mutaciones'
import {
  opcionesDeDestino,
  rutaDeDestinos,
  rutaDeFusion,
  rutaDePrevisualizacion,
  PALABRA_DE_FUSION,
  type EleccionesDeFusion,
  type EntidadFusionable,
  type OpcionDeDestino,
  type PrevisualizacionDeFusion,
  type ResultadoDeFusion,
  type ResultadoDeReintento,
  type ResultadoDeReversion
} from '@/dominio/fusion'

/**
 * Las cinco llamadas de la fusion contra el BFF. Ninguna lanza: el error es un valor (`Resultado`),
 * y el dialogo que la provoco tiene que poder mostrarlo sin desmontarse.
 */

/**
 * Las opciones entre las que se elige el destino.
 *
 * @param entidad que se fusiona
 * @param origenId id del origen, que no se ofrece
 * @returns las opciones, o el motivo por el que no vinieron
 */
export async function cargarDestinos (entidad: EntidadFusionable, origenId: number): Promise<Resultado<OpcionDeDestino[]>> {
  const respuesta = await leerDelBff<unknown>(rutaDeDestinos(entidad))

  if (!respuesta.ok) return respuesta

  return { ok: true, datos: opcionesDeDestino(entidad, respuesta.datos, origenId) }
}

/**
 * Lo que pasaria si se fusionara ahora.
 *
 * @param entidad que se fusiona
 * @param origenId id del que se fusiona
 * @param destinoId id del que lo recibe
 */
export async function cargarPrevia (
  entidad: EntidadFusionable,
  origenId: number,
  destinoId: number
): Promise<Resultado<PrevisualizacionDeFusion>> {
  return await leerDelBff<PrevisualizacionDeFusion>(rutaDePrevisualizacion(entidad, origenId, destinoId))
}

/**
 * Ejecuta la fusion. El destino y la palabra viajan siempre: la API vuelve a comprobar todo.
 *
 * @param entidad que se fusiona
 * @param origenId id del que se fusiona
 * @param destinoId id del que lo recibe
 * @param elecciones de que lado se queda cada campo en conflicto
 */
export async function ejecutarFusion (
  entidad: EntidadFusionable,
  origenId: number,
  destinoId: number,
  elecciones: EleccionesDeFusion
): Promise<Resultado<ResultadoDeFusion>> {
  return await escribirEnBff<ResultadoDeFusion>(rutaDeFusion(entidad, origenId), 'POST', {
    into: destinoId,
    elecciones,
    confirmacion: PALABRA_DE_FUSION
  })
}

/**
 * Deshace una fusion.
 *
 * @param fusionId id de la fusion del historial
 */
export async function deshacerFusion (fusionId: number): Promise<Resultado<ResultadoDeReversion>> {
  return await escribirEnBff<ResultadoDeReversion>(`merges/${fusionId}/actions/revert`, 'POST')
}

/**
 * Vuelve a mover los archivos que una fusion dejo pendientes.
 *
 * @param fusionId id de la fusion del historial, en estado `pendiente_archivos`
 */
export async function reintentarArchivos (fusionId: number): Promise<Resultado<ResultadoDeReintento>> {
  return await escribirEnBff<ResultadoDeReintento>(`merges/${fusionId}/actions/retry-files`, 'POST')
}
