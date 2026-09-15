/** Cadencia compartida de actualización de las listas personales visibles. */
export const REFRESCO_LISTA_MS = 30_000
export const EVENTO_TAREAS_CAMBIADAS = 'ops:tareas-cambiadas'

/**
 * Mantiene una consulta actualizada sin borrar sus datos durante los refrescos.
 * @param cargar Consulta de la página actual, cancelable al desmontar.
 * @param recibir Publica únicamente respuestas completas y vigentes.
 * @param fallar Publica errores; quien consume conserva su última respuesta válida.
 * @returns Limpieza del intervalo, escuchadores y consulta pendiente.
 */
export function observarLista<T> (
  cargar: (senal: AbortSignal) => Promise<T>,
  recibir: (datos: T) => void,
  fallar: (fallo: unknown) => void
): () => void {
  const control = new AbortController()
  const documento = document
  const ventana = window
  let enCurso = false
  let pendiente = false

  /** Agrupa avisos simultáneos y repite si hubo una escritura durante la consulta. */
  async function actualizar (): Promise<void> {
    if (control.signal.aborted || documento.hidden) return
    if (enCurso) {
      pendiente = true
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
        void actualizar()
      }
    }
  }

  const tic = (): void => { void actualizar() }
  const intervalo = globalThis.setInterval(tic, REFRESCO_LISTA_MS)
  documento.addEventListener('visibilitychange', tic)
  ventana.addEventListener('focus', tic)
  ventana.addEventListener(EVENTO_TAREAS_CAMBIADAS, tic)
  tic()

  return () => {
    control.abort()
    globalThis.clearInterval(intervalo)
    documento.removeEventListener('visibilitychange', tic)
    ventana.removeEventListener('focus', tic)
    ventana.removeEventListener(EVENTO_TAREAS_CAMBIADAS, tic)
  }
}

/** Notifica escrituras de tareas confirmadas; rutas ajenas no invalidan las listas. */
export function avisarCambioDeTareas (ruta: string): void {
  if (/^tasks(?:\/|$)/.test(ruta) && typeof window !== 'undefined') {
    window.dispatchEvent(new Event(EVENTO_TAREAS_CAMBIADAS))
  }
}
