/**
 * Consultas periódicas que no se apilan.
 *
 * Con una red lenta una consulta puede tardar más que el intervalo que la dispara: cada tic lanzaba
 * otra encima de la anterior y el navegador se llenaba de peticiones en vuelo que además llegaban
 * desordenadas. Esto serializa: si hay una en camino, el tic periódico se descarta y un aviso de
 * cambio real (una acción propia) se atiende en cuanto la actual termine.
 */

/**
 * Envuelve una consulta para que nunca haya dos en vuelo a la vez.
 *
 * @param consulta la consulta a ejecutar; debe manejar sus propios errores (si lanza, el rechazo se descarta)
 * @returns un disparador; `descartable` es `true` para los tics periódicos, que no merecen repetirse
 */
export function sondeoSinApilar (consulta: () => Promise<void>): (descartable?: boolean) => void {
  let enVuelo = false
  let repetir = false

  /** Ejecuta la consulta y, si llegó un aviso real durante ella, la repite una vez. */
  async function correr (): Promise<void> {
    enVuelo = true
    try {
      await consulta()
    } catch {
      // La consulta informa sus propios fallos; un rechazo suelto no puede dejar el sondeo trabado.
    } finally {
      enVuelo = false
    }

    if (!repetir) return
    repetir = false
    await correr()
  }

  return (descartable = false) => {
    if (enVuelo) {
      if (!descartable) repetir = true
      return
    }

    void correr()
  }
}
