/**
 * Reglas puras de los archivos que se eligen al crear una Tarea.
 *
 * Los archivos no viajan con el `POST /tasks`: esperan en el formulario y se suben a la carpeta de
 * Drive de la Tarea cuando esta ya existe. Viven aparte del componente para probarlos sin navegador.
 */

import { motivoParaNoSubir } from './drive-explorador.ts'

/** Tope de archivos por alta: más que eso es trabajo de la pestaña Archivos, que tiene bandeja. */
export const MAXIMO_ADJUNTOS_EN_ALTA = 10

/** Lo mínimo que se lee de un `File`. */
export interface ArchivoElegido {
  name: string
  size: number
  lastModified: number
}

/** La lista resultante y, por cada archivo que no entró, el motivo listo para mostrar. */
export interface ResultadoDeAgregar<T extends ArchivoElegido> {
  lista: T[]
  rechazados: string[]
}

/**
 * Suma archivos a los ya elegidos, descartando duplicados, vacíos de nombre y lo que excede el tope.
 *
 * Un archivo es el mismo si coinciden nombre, tamaño y fecha de modificación: elegir dos veces el
 * mismo no lo sube dos veces.
 *
 * @param actuales los que ya estaban elegidos
 * @param nuevos los que la persona acaba de elegir
 * @returns la lista final y los motivos de lo descartado
 */
export function agregarAdjuntos<T extends ArchivoElegido> (actuales: readonly T[], nuevos: readonly T[]): ResultadoDeAgregar<T> {
  const lista = [...actuales]
  const rechazados: string[] = []

  for (const archivo of nuevos) {
    const repetido = lista.some((otro) => otro.name === archivo.name && otro.size === archivo.size && otro.lastModified === archivo.lastModified)
    if (repetido) continue

    const motivo = motivoParaNoSubir(archivo)
    if (motivo !== null) {
      rechazados.push(`«${archivo.name}»: ${motivo}`)
      continue
    }

    if (lista.length >= MAXIMO_ADJUNTOS_EN_ALTA) {
      rechazados.push(`«${archivo.name}»: como máximo ${MAXIMO_ADJUNTOS_EN_ALTA} archivos por tarea al crearla. El resto se sube desde la tarea.`)
      continue
    }

    lista.push(archivo)
  }

  return { lista, rechazados }
}

/**
 * Resume en una frase qué pasó al subir los adjuntos de una Tarea ya creada.
 *
 * @param nombreDeTarea cómo llamar a la tarea en el mensaje. Ej: `#512`
 * @param fallidos motivos por archivo, `«nombre»: motivo`
 * @returns el mensaje, o `null` si todo subió
 */
export function mensajeDeAdjuntosFallidos (nombreDeTarea: string, fallidos: readonly string[]): string | null {
  if (fallidos.length === 0) return null

  return `La tarea ${nombreDeTarea} ya está creada, pero no se subieron ${fallidos.length === 1 ? 'un archivo' : `${fallidos.length} archivos`}: ${fallidos.join(' · ')}`
}
