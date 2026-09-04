/**
 * Traduce un fallo al prender microfono, camara o pantalla.
 *
 * Los tres fallan por los mismos tres motivos, y ninguno es culpa de quien pulsa el boton: no dio
 * permiso, no tiene el aparato, o se lo esta usando otro programa. Decirlo con esas palabras es la
 * diferencia entre arreglarlo en diez segundos y pensar que la sala esta rota.
 *
 * Vive en un `.ts` y no dentro del componente porque es logica con casos y necesita prueba: Node
 * puede despojar los tipos de un `.ts`, pero no el JSX de un `.tsx`.
 *
 * @param error Lo que rechazo la promesa. Puede no ser un `Error`: el navegador tambien rechaza con
 *              `DOMException` y, en el camino del WebSocket, con un `Event` pelado.
 * @param que   Que se estaba prendiendo, para nombrarlo en el mensaje.
 * @returns El mensaje para la persona, o cadena vacia si no hay nada que avisar.
 */
export function motivoDelFallo (error: unknown, que: string): string {
  const nombre = error instanceof Error ? error.name : ''

  if (nombre === 'NotAllowedError' || nombre === 'SecurityError') {
    return `El navegador bloqueó ${que}. Dale permiso desde el candado de la barra de direcciones y vuelve a intentar.`
  }

  if (nombre === 'NotFoundError' || nombre === 'DevicesNotFoundError') {
    return `No encontramos ${que} en este equipo.`
  }

  if (nombre === 'NotReadableError' || nombre === 'TrackStartError') {
    return `Otro programa está usando ${que}. Ciérralo y vuelve a intentar.`
  }

  // `AbortError` es lo que deja cancelar el dialogo de compartir pantalla: no es un fallo, es un no.
  if (nombre === 'AbortError') return ''

  return `No pudimos activar ${que}.`
}
