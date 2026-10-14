import { escribirEnBff, type Resultado } from '@/componentes/datos/mutaciones'
import type { ProcesoDeFicha } from '@/componentes/proyecto/tareas'
import type { CuerpoDeEdicion, CuerpoDeEstado } from '@/dominio/tareas-del-portal'

/**
 * Escritura del contacto sobre una Tarea suya: `PATCH /portal/tasks/{id}`.
 *
 * Una sola ruta para editar campos, cancelar y reabrir; lo que cambia es el cuerpo (ver
 * `CuerpoDeEdicion` y `CuerpoDeEstado`). El id es el de la Tarea: el cliente sale del token, y la
 * API contesta `404` si la Tarea no es de un Proyecto del contacto o la funcion esta apagada.
 *
 * Vive junto al portal y no en `datos/portal.ts` porque ese modulo solo declara tipos del contrato
 * y no importa nada del navegador. Es una funcion de cliente: usa `escribirEnBff`, que va por el BFF.
 *
 * @param tareaId id de la Tarea
 * @param cuerpo los campos que cambiaron, o el estado al que pasa
 * @param idempotencia clave del intento: la misma al reintentar lo mismo, para no repetir el cambio
 * @returns la ficha ya actualizada, o el rechazo como valor (nunca lanza)
 */
export async function editarTareaPortal (
  tareaId: number,
  cuerpo: CuerpoDeEdicion | CuerpoDeEstado,
  idempotencia?: string
): Promise<Resultado<ProcesoDeFicha>> {
  return await escribirEnBff<ProcesoDeFicha>(`portal/tasks/${tareaId}`, 'PATCH', cuerpo, { idempotencia })
}
