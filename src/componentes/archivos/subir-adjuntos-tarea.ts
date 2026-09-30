import { escribirEnBff } from '@/componentes/datos/mutaciones'
import { subirConAvance } from '@/componentes/archivos/red-drive'
import { subirDirectoAGoogle } from '@/componentes/archivos/subida-resumable-drive'
import { usaSubidaDirecta } from '@/dominio/drive-explorador'
import type { DriveTarea } from '@/datos/recursos'

/** Resultado de subir un lote: los motivos de lo que falló, `«nombre»: motivo`. Vacío si todo subió. */
export interface ResultadoDeAdjuntos {
  fallidos: string[]
}

/**
 * Sube archivos a la carpeta de Drive de una Tarea recién creada.
 *
 * Reutiliza el Drive de la Tarea en vez de un almacén propio: pide la carpeta con el `POST
 * tasks/{id}/drive`, que es idempotente (la crea si falta y si no devuelve la que hay), y sube cada
 * archivo por el mismo camino que el explorador —multipart por debajo de 25 MB, sesión resumable
 * directa a Google por encima—. Sube de a uno: son pocos y así un fallo queda junto a su archivo sin
 * frenar al resto. Nunca lanza.
 *
 * @param tareaId id de la Tarea ya creada
 * @param archivos los que eligió la persona
 * @returns los que no se pudieron subir, cada uno con su motivo
 */
export async function subirAdjuntosATarea (tareaId: number, archivos: readonly File[]): Promise<ResultadoDeAdjuntos> {
  if (archivos.length === 0) return { fallidos: [] }

  const carpeta = await escribirEnBff<DriveTarea | undefined>(`tasks/${tareaId}/drive`, 'POST')
  const folderId = carpeta.ok ? carpeta.datos?.folder?.id : undefined

  if (folderId === undefined) {
    const motivo = carpeta.ok ? 'la tarea no tiene carpeta en Drive' : carpeta.mensaje

    return { fallidos: archivos.map((archivo) => `«${archivo.name}»: ${motivo}`) }
  }

  const fallidos: string[] = []
  const senal = new AbortController().signal

  for (const archivo of archivos) {
    const resultado = usaSubidaDirecta(archivo)
      ? await subirDirectoAGoogle(folderId, archivo, () => {}, senal, undefined, () => {})
      : await subirConAvance(folderId, archivo, () => {}, senal)

    if (!resultado.ok) fallidos.push(`«${archivo.name}»: ${resultado.mensaje}`)
  }

  return { fallidos }
}
