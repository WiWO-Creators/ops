import { debeSondear } from '../dominio/en-vivo.ts'
import { estaConectadoEnVivo } from './en-vivo.ts'

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
  /**
   * Si el bus de «en vivo» está conectado; por defecto, el del navegador. Conectado, el intervalo
   * pasa a respaldo (ver `debeSondear`); los eventos, la vuelta a la pestaña y el foco no cambian.
   */
  conectado?: () => boolean
}

/** Primer segmento de una ruta del BFF: `tasks/12` → `tasks`. */
function primerSegmento (ruta: string): string {
  return ruta.split('/')[0] ?? ''
}

/**
 * Si un `ops:recurso-cambiado` obliga a una tabla de esa ruta a volver a pedir sus datos.
 *
 * Las escrituras propias (sin `origen`) invalidan todo, como siempre. Un aviso del bus
 * (`origen: 'en-vivo'`) solo invalida a la tabla del mismo recurso: el bus dice «cambió la tarea 12»
 * y no hay por qué releer la lista de tickets.
 *
 * @param detalle el `detail` del evento
 * @param rutaDeLaTabla la ruta de la definición de la tabla (`tasks`, `tickets`…)
 * @returns `true` si la tabla debe invalidarse
 */
export function afectaALaRuta (detalle: unknown, rutaDeLaTabla: string): boolean {
  if (typeof detalle !== 'object' || detalle === null) return true

  const { origen, ruta } = detalle as { origen?: unknown, ruta?: unknown }

  if (origen !== 'en-vivo') return true

  return typeof ruta === 'string' && primerSegmento(ruta) === primerSegmento(rutaDeLaTabla)
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
  { eventos = EVENTOS_POR_DEFECTO, inmediato = true, conectado = estaConectadoEnVivo }: OpcionesDeObservacion = {}
): () => void {
  const control = new AbortController()
  const documento = document
  const ventana = window
  let enCurso = false
  let pendiente = false
  let ultima = 0

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
    ultima = Date.now()
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
  // Con el bus conectado el intervalo es solo respaldo. La comprobación va solo con el bus conectado:
  // apagado, el intervalo sigue exactamente igual (sin depender de la precisión del reloj).
  const ticPeriodico = (): void => {
    if (conectado() && !debeSondear(ultima, REFRESCO_LISTA_MS, true, Date.now())) return
    tic()
  }
  const intervalo = globalThis.setInterval(ticPeriodico, REFRESCO_LISTA_MS)
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
