/**
 * Lectura del error de `PATCH /settings`, sin nada de React.
 *
 * Lo comparten todas las pantallas que escriben ajustes: el mensaje que devuelve la API es uno solo
 * para el cuerpo entero («Hay ajustes que no se pueden escribir»), asi que sin el `details` traducido
 * quien administra no sabe cual de las claves fue.
 */

/** Los dos motivos que devuelve `Escritura\Ajuste::escribir()` en el `details` del 422. */
const MOTIVO_DE_RECHAZO: Record<string, string> = {
  no_editable: 'la API no acepta escribir esta opción',
  invalid: 'el valor no pasó la validación del backend'
}

/**
 * Traduce el `details` del 422 a lineas legibles.
 *
 * Un motivo o una clave que no esten en los mapas se muestran crudos: inventar un texto para algo
 * que no se conoce esconde justamente el caso que hay que investigar.
 *
 * @param detalles el `details` del 422, `{ clave: ['no_editable' | 'invalid'] }`
 * @param etiquetas nombre legible de cada clave; la API contesta con el nombre tecnico
 * @returns una linea por clave rechazada, en el orden en que vinieron
 */
export function detallesDeAjustesLegibles (
  detalles: Record<string, string[]>,
  etiquetas: Record<string, string>
): string[] {
  return Object.entries(detalles).map(([clave, motivos]) => {
    const razones = motivos.map((motivo) => MOTIVO_DE_RECHAZO[motivo] ?? motivo).join(', ')

    return `${etiquetas[clave] ?? clave}: ${razones}`
  })
}
