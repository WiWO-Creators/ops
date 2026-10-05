/** Cadencia compartida de actualización de las listas personales visibles. */
export const REFRESCO_LISTA_MS = 30_000
export const EVENTO_TAREAS_CAMBIADAS = 'ops:tareas-cambiadas'

const EVENTOS_POR_DEFECTO: readonly string[] = [EVENTO_TAREAS_CAMBIADAS]

/** Opciones de {@link observarLista}; sin ellas se comporta como siempre para las listas de Tareas. */
export interface OpcionesDeObservacion {
  /**
   * Eventos de ventana que adelantan la consulta, ademas del intervalo, la vuelta a la pestaña y el
   * foco. Por defecto, `EVENTO_TAREAS_CAMBIADAS`; `[]` para quien no depende de las Tareas.
   */
  eventos?: readonly string[]
}

/**
 * Mantiene una consulta actualizada sin borrar sus datos durante los refrescos.
 *
 * Volver a la pestaña dispara `visibilitychange` y `focus` casi a la vez: el segundo se descarta si
 * ya hay una consulta en vuelo, porque la que sigue en camino es la de ese mismo regreso. Una
 * escritura avisada por evento, en cambio, siempre repite la consulta al terminar la actual.
 *
 * @param cargar Consulta de la página actual, cancelable al desmontar.
 * @param recibir Publica únicamente respuestas completas y vigentes.
 * @param fallar Publica errores; quien consume conserva su última respuesta válida.
 * @param opciones Eventos que escucha; ver {@link OpcionesDeObservacion}.
 * @returns Limpieza del intervalo, escuchadores y consulta pendiente.
 */
export function observarLista<T> (
  cargar: (senal: AbortSignal) => Promise<T>,
  recibir: (datos: T) => void,
  fallar: (fallo: unknown) => void,
  { eventos = EVENTOS_POR_DEFECTO }: OpcionesDeObservacion = {}
): () => void {
  const control = new AbortController()
  const documento = document
  const ventana = window
  let enCurso = false
  let pendiente = false

  /**
   * Agrupa avisos simultáneos y repite si hubo una escritura durante la consulta.
   * @param descartableEnCurso `true` en los avisos de regreso, que no merecen repetir una consulta en vuelo.
   */
  async function actualizar (descartableEnCurso: boolean): Promise<void> {
    if (control.signal.aborted || documento.hidden) return
    if (enCurso) {
      if (!descartableEnCurso) pendiente = true
      return
    }
    enCurso = true
    try {
      const datos = await cargar(control.signal)
      if (!control.signal.aborted) recibir(datos)
    } catch (fallo) {
      if (!control.signal.aborted) fallar(fallo)
    } finally {
      enCurso = false
      if (pendiente) {
        pendiente = false
        void actualizar(false)
      }
    }
  }

  const tic = (): void => { void actualizar(false) }
  const regreso = (): void => { void actualizar(true) }
  const intervalo = globalThis.setInterval(tic, REFRESCO_LISTA_MS)
  documento.addEventListener('visibilitychange', regreso)
  ventana.addEventListener('focus', regreso)
  for (const evento of eventos) ventana.addEventListener(evento, tic)
  tic()

  return () => {
    control.abort()
    globalThis.clearInterval(intervalo)
    documento.removeEventListener('visibilitychange', regreso)
    ventana.removeEventListener('focus', regreso)
    for (const evento of eventos) ventana.removeEventListener(evento, tic)
  }
}

/** Notifica escrituras de tareas confirmadas; rutas ajenas no invalidan las listas. */
export function avisarCambioDeTareas (ruta: string): void {
  if (/^tasks(?:\/|$)/.test(ruta) && typeof window !== 'undefined') {
    window.dispatchEvent(new Event(EVENTO_TAREAS_CAMBIADAS))
  }
}
