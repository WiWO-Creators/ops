/** Cadencia compartida de actualización de las listas personales visibles. */
export const REFRESCO_LISTA_MS = 30_000
export const EVENTO_TAREAS_CAMBIADAS = 'ops:tareas-cambiadas'
/** Se emite tras cualquier escritura confirmada; las tablas montadas vuelven a pedir lo suyo. */
export const EVENTO_RECURSO_CAMBIADO = 'ops:recurso-cambiado'

/** Escrituras periódicas o de presencia, que no cambian ningún listado y no deben invalidarlos. */
const RUTAS_SIN_INVALIDACION = /^(?:live\/|audit\/|ia\/|me\/(?:presence|jornada|foto)|push\/)/

const EVENTOS_POR_DEFECTO: readonly string[] = [EVENTO_TAREAS_CAMBIADAS]

/** Opciones de {@link observarLista}; sin ellas se comporta como siempre para las listas de Tareas. */
export interface OpcionesDeObservacion {
  /**
   * Eventos de ventana que adelantan la consulta, ademas del intervalo, la vuelta a la pestaña y el
   * foco. Por defecto, `EVENTO_TAREAS_CAMBIADAS`; `[]` para quien no depende de las Tareas.
   */
  eventos?: readonly string[]
  /**
   * `false` si quien observa ya tiene datos al montar y no necesita una primera consulta inmediata;
   * la siguiente llega con el intervalo, el foco o un evento.
   */
  inmediato?: boolean
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
  { eventos = EVENTOS_POR_DEFECTO, inmediato = true }: OpcionesDeObservacion = {}
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
  if (inmediato) tic()

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

/**
 * Notifica una escritura confirmada para que las tablas visibles vuelvan a pedir sus datos.
 *
 * Es lo que hace que una escritura hecha fuera de la tabla —un alta, el modal de detalle— se vea sin
 * depender de `router.refresh()`, que solo alcanza a lo resuelto en el servidor.
 *
 * @param ruta la ruta del BFF que se escribió
 */
export function avisarCambioDeRecurso (ruta: string): void {
  if (typeof window === 'undefined' || RUTAS_SIN_INVALIDACION.test(ruta)) return

  window.dispatchEvent(new CustomEvent(EVENTO_RECURSO_CAMBIADO, { detail: { ruta } }))
}
