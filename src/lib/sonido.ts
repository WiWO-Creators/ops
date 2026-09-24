/**
 * Sonidos cortos del panel, sintetizados con Web Audio: sin archivos que servir ni cachear.
 *
 * === POR QUE HAY QUE "DESBLOQUEAR" EL AUDIO ===
 *
 * Los navegadores no dejan sonar un `AudioContext` que no nació de un gesto de la persona: creado
 * desde un temporizador queda `suspended` y el sonido no sale. Por eso `prepararSonido()` escucha el
 * primer clic o tecla de la sesión y crea el contexto ahí; cuando más tarde un aviso quiere sonar,
 * el contexto ya está habilitado aunque quien lo pida sea un intervalo.
 */

/** Notas del aviso, en hercios: dos tonos ascendentes, reconocibles sin ser una alarma. */
const NOTAS_DEL_AVISO = [880, 1320] as const

/** Duración de cada nota, en segundos. */
const DURACION_DE_NOTA = 0.18

/** Volumen máximo, de 0 a 1. Bajo: el aviso tiene que oírse, no sobresaltar. */
const VOLUMEN = 0.2

const EVENTOS_DE_GESTO = ['pointerdown', 'keydown'] as const

let contexto: AudioContext | null = null

/**
 * Devuelve el contexto de audio compartido, creándolo si hace falta.
 *
 * @returns el contexto, o `null` si el navegador no tiene Web Audio o se niega a crearlo
 */
function contextoDeAudio (): AudioContext | null {
  if (contexto !== null) return contexto
  if (typeof globalThis.AudioContext !== 'function') return null

  try {
    contexto = new AudioContext()
  } catch {
    // Sin contexto no hay sonido; el aviso visual sigue igual.
    return null
  }

  return contexto
}

/** Crea o reanuda el contexto dentro de un gesto, que es cuando el navegador lo permite. */
function desbloquear (): void {
  const audio = contextoDeAudio()

  if (audio?.state === 'suspended') void audio.resume().catch(() => undefined)

  for (const evento of EVENTOS_DE_GESTO) globalThis.removeEventListener(evento, desbloquear)
}

/**
 * Deja el audio listo para sonar más tarde, en cuanto la persona toque la página.
 *
 * Idempotente: llamarla varias veces no suma escuchas, porque `addEventListener` ignora la misma
 * función repetida.
 */
export function prepararSonido (): void {
  if (typeof globalThis.addEventListener !== 'function') return
  if (contexto !== null && contexto.state === 'running') return

  for (const evento of EVENTOS_DE_GESTO) globalThis.addEventListener(evento, desbloquear, { passive: true })
}

/**
 * Hace sonar el aviso de dos tonos.
 *
 * No falla nunca: sin Web Audio, o con el contexto todavía bloqueado, simplemente no suena. Un
 * sonido es un refuerzo del aviso en pantalla, no el aviso.
 */
export function sonarAviso (): void {
  const audio = contextoDeAudio()

  if (audio === null) return
  if (audio.state === 'suspended') void audio.resume().catch(() => undefined)

  const inicio = audio.currentTime

  NOTAS_DEL_AVISO.forEach((frecuencia, indice) => {
    const oscilador = audio.createOscillator()
    const ganancia = audio.createGain()
    const desde = inicio + indice * DURACION_DE_NOTA

    oscilador.type = 'sine'
    oscilador.frequency.value = frecuencia
    // Subida y caída cortas: sin ellas la onda arranca y corta en seco y se oye un chasquido.
    ganancia.gain.setValueAtTime(0, desde)
    ganancia.gain.linearRampToValueAtTime(VOLUMEN, desde + 0.02)
    ganancia.gain.exponentialRampToValueAtTime(0.0001, desde + DURACION_DE_NOTA)

    oscilador.connect(ganancia).connect(audio.destination)
    oscilador.start(desde)
    oscilador.stop(desde + DURACION_DE_NOTA)
  })
}
