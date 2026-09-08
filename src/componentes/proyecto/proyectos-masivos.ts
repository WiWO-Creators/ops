/** Operación soportada por los endpoints existentes de proyectos. */
export type CambioMasivoProyecto = { status: number } | { archive: boolean }

/**
 * Aplica un cambio por proyecto y conserva los fallos parciales para informar al usuario.
 * @param ids Identificadores seleccionados, sin duplicados en la petición efectiva.
 * @param cambio Estado o archivado solicitado.
 * @param solicitar Transporte HTTP; admite sustitución en la prueba ejecutable.
 * @returns Cantidad aplicada y detalle de cada fallo; rechaza entradas inválidas antes de escribir.
 */
export async function cambiarProyectos (
  ids: number[],
  cambio: CambioMasivoProyecto,
  solicitar: typeof fetch = fetch
): Promise<{ aplicados: number, fallos: Array<{ id: number, mensaje: string }> }> {
  if (ids.length === 0 || ids.some((id) => !Number.isSafeInteger(id) || id <= 0)) {
    throw new Error('Selecciona proyectos válidos.')
  }
  if ('status' in cambio ? !Number.isSafeInteger(cambio.status) || cambio.status <= 0 : typeof cambio.archive !== 'boolean') {
    throw new Error('Elige una acción válida.')
  }
  const resultado = { aplicados: 0, fallos: [] as Array<{ id: number, mensaje: string }> }
  for (const id of new Set(ids)) {
    try {
      const ruta = 'status' in cambio ? `projects/${id}` : `projects/${id}/actions/${cambio.archive ? 'archive' : 'unarchive'}`
      const respuesta = await solicitar(`/api/bff/${ruta}`, {
        method: 'status' in cambio ? 'PATCH' : 'POST',
        headers: { accept: 'application/json', 'content-type': 'application/json' },
        ...('status' in cambio ? { body: JSON.stringify(cambio) } : {})
      })
      if (respuesta.ok) {
        resultado.aplicados++
      } else {
        const cuerpo = await respuesta.json() as { error?: { message?: string } }
        resultado.fallos.push({ id, mensaje: cuerpo.error?.message ?? `Error ${respuesta.status}` })
      }
    } catch {
      resultado.fallos.push({ id, mensaje: 'No se pudo confirmar el cambio. Revisa el proyecto antes de reintentar.' })
    }
  }
  return resultado
}
