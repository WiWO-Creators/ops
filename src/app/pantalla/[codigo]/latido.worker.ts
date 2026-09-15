/**
 * El latido de la pantalla, fuera del hilo principal.
 *
 * === POR QUE UN WORKER PARA ALGO TAN TONTO ===
 *
 * Porque un `setInterval` en una pestaña oculta se estrangula a **uno por minuto**. Y una pestaña
 * casteada a un televisor —Chromecast, AirPlay, un stick HDMI— esta oculta en cuanto quien la lanzo
 * cambia de pestaña en su computador: el receptor la sigue mostrando, pero `document.hidden` pasa a
 * `true` y el navegador frena los temporizadores.
 *
 * El resultado es el fallo mas traicionero de esta pantalla: **en el computador se ve bien y en la
 * pared se ve congelada**. Las escenas dejan de rotar, los cronometros avanzan a saltos de un minuto
 * y nadie entiende por que, porque quien mira la pared no es quien tiene el computador.
 *
 * Los temporizadores de un worker dedicado no se estrangulan igual. Por eso el reloj vive acá y el
 * hilo principal solo reacciona.
 *
 * === UN SOLO TIC PARA TODO ===
 *
 * El hilo principal deriva de este tic las tres cosas que necesitan reloj: la rotacion de escenas, el
 * contador de segundos y el sondeo. Un unico temporizador en vez de tres es menos que apagar al
 * desmontar y una sola cosa que puede fallar.
 */

/** Cada cuanto late, en milisegundos. Lo fija quien arranca. */
let latido: ReturnType<typeof setInterval> | null = null

interface Arrancar { tipo: 'arrancar', cadaMs: number }
interface Parar { tipo: 'parar' }

self.onmessage = (evento: MessageEvent<Arrancar | Parar>) => {
  if (latido !== null) {
    clearInterval(latido)
    latido = null
  }

  if (evento.data.tipo !== 'arrancar') return

  // `Date.now()` y no `performance.now()`: el del worker es otro reloj, y lo que el hilo principal
  // necesita saber es cuando ocurrio el tic en tiempo de pared, no cuanto lleva vivo este worker.
  latido = setInterval(() => { self.postMessage(Date.now()) }, evento.data.cadaMs)
}
