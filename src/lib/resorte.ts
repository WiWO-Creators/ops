/**
 * Física de los gestos: resorte, banda elástica y proyección de un lanzamiento.
 *
 * Vive en `lib/` y en `.ts` —no dentro de un componente— para que las pruebas de Node la importen
 * sin JSX. Ningún valor depende del DOM: quien anima mide y le pasa números.
 *
 * Los parámetros siguen la convención de Apple (*Designing Fluid Interfaces*, WWDC 2018) y no la
 * tríada masa/rigidez/amortiguación: `amortiguacion` 1 es asentarse sin rebote y por debajo de 1
 * rebota; `respuesta` es cuánto tarda en llegar, en segundos. Es lo que se puede afinar a ojo.
 */

/** Curva lista para `animation-timing-function` o para la opción `easing` de WAAPI. */
export interface CurvaDeResorte {
  /** `linear(...)` muestreado del resorte. */
  curva: string
  /** Cuánto dura hasta quedar quieto, en milisegundos. */
  duracionMs: number
}

/** Por debajo de esta distancia al destino (en fracción del recorrido) el resorte se da por quieto. */
const REPOSO = 0.001
/** Tope de duración: un resorte mal afinado no puede congelar una interacción. */
const DURACION_MAXIMA_MS = 1200

/**
 * Muestrea un resorte amortiguado como curva `linear()` de CSS.
 *
 * `linear()` acepta valores fuera de [0, 1], así que el rebote de un resorte subamortiguado se
 * conserva tal cual: la curva pasa de largo el destino y vuelve.
 *
 * @param amortiguacion razón de amortiguación; 1 = sin rebote, 0.8 = rebote leve. Se acota a (0, 1]
 * @param respuesta segundos que tarda en responder; se acota a [0.05, 1]
 * @param muestras cantidad de puntos de la curva; más puntos, curva más fiel
 * @returns la curva y su duración; con parámetros no finitos devuelve un resorte crítico por defecto
 */
export function curvaDeResorte (amortiguacion: number, respuesta: number, muestras = 40): CurvaDeResorte {
  const zeta = Number.isFinite(amortiguacion) ? Math.min(Math.max(amortiguacion, 0.05), 1) : 1
  const periodo = Number.isFinite(respuesta) ? Math.min(Math.max(respuesta, 0.05), 1) : 0.4
  const puntos = Number.isInteger(muestras) && muestras >= 8 ? muestras : 40

  const omega = (2 * Math.PI) / periodo
  const duracion = duracionHastaReposo(zeta, omega)
  const valores: string[] = []

  for (let i = 0; i <= puntos; i++) {
    const t = (duracion * i) / puntos
    valores.push(redondear(i === puntos ? 1 : posicion(zeta, omega, t)))
  }

  return { curva: `linear(${valores.join(', ')})`, duracionMs: Math.round(duracion * 1000) }
}

/**
 * Posición normalizada (0 → 1) de un resorte que arranca quieto en 0 y busca 1.
 *
 * @param zeta razón de amortiguación en (0, 1]
 * @param omega frecuencia natural en rad/s
 * @param t segundos transcurridos
 * @returns la posición en ese instante
 */
function posicion (zeta: number, omega: number, t: number): number {
  if (zeta >= 1) return 1 - (1 + omega * t) * Math.exp(-omega * t)

  const amortiguada = omega * Math.sqrt(1 - zeta * zeta)
  const envolvente = Math.exp(-zeta * omega * t)
  return 1 - envolvente * (Math.cos(amortiguada * t) + (zeta * omega / amortiguada) * Math.sin(amortiguada * t))
}

/**
 * Segundos hasta que el resorte queda dentro de `REPOSO` del destino y ya no sale.
 *
 * Se mide sobre la envolvente y no sobre la posición: un resorte que rebota cruza el destino varias
 * veces, y cortar en el primer cruce dejaría la animación terminando en pleno rebote.
 */
function duracionHastaReposo (zeta: number, omega: number): number {
  const paso = 1 / 240
  for (let t = paso; t * 1000 < DURACION_MAXIMA_MS; t += paso) {
    const envolvente = zeta >= 1 ? (1 + omega * t) * Math.exp(-omega * t) : Math.exp(-zeta * omega * t) / Math.sqrt(1 - zeta * zeta)
    if (envolvente < REPOSO) return t
  }
  return DURACION_MAXIMA_MS / 1000
}

/** Cuatro decimales alcanzan para 60 fps y mantienen corta la cadena del estilo. */
function redondear (valor: number): string {
  return String(Math.round(valor * 10000) / 10000)
}

/**
 * Resistencia progresiva al tirar más allá de un límite.
 *
 * Cuanto más se pasa, menos sigue el elemento al dedo: un tope duro se lee como congelado, uno
 * elástico como "responde, pero no hay más". Es la función que usa iOS para el rebote del scroll.
 *
 * @param exceso píxeles más allá del límite (con signo)
 * @param dimension tamaño de referencia del elemento, en píxeles
 * @param constante 0.55 es la de iOS; más baja, más dura
 * @returns el desplazamiento visible, con el mismo signo que `exceso`; 0 ante entradas inválidas
 */
export function bandaElastica (exceso: number, dimension: number, constante = 0.55): number {
  if (!Number.isFinite(exceso) || !Number.isFinite(dimension) || dimension <= 0 || constante <= 0) return 0
  return (exceso * dimension * constante) / (dimension + constante * Math.abs(exceso))
}

/**
 * Dónde se detendría algo lanzado con esta velocidad, como la desaceleración del scroll.
 *
 * Es la proyección de Apple (tasa 0.998 por milisegundo), no la de la física de manual
 * (`v²/2a`): la de manual se queda corta con lanzamientos rápidos y se siente pesada.
 *
 * @param velocidad píxeles por milisegundo
 * @param tasa desaceleración por milisegundo; 0.998 normal, 0.99 más seca
 * @returns cuántos píxeles más recorrería; 0 ante entradas inválidas
 */
export function proyectar (velocidad: number, tasa = 0.998): number {
  if (!Number.isFinite(velocidad) || !(tasa > 0 && tasa < 1)) return 0
  return (velocidad * tasa) / (1 - tasa)
}

/**
 * Decide si una hoja arrastrada hacia abajo se cierra o vuelve a su lugar.
 *
 * Se decide sobre la posición proyectada y no sobre donde se soltó: un tirón corto y rápido tiene
 * que cerrar igual que un arrastre largo y lento. El umbral es la mitad de la altura.
 *
 * @param desplazamiento cuántos píxeles bajó la hoja (positivo = hacia abajo)
 * @param velocidad píxeles por milisegundo al soltar (positivo = hacia abajo)
 * @param altura altura de la hoja en píxeles
 * @returns `true` si corresponde cerrarla
 */
export function cierraLaHoja (desplazamiento: number, velocidad: number, altura: number): boolean {
  if (![desplazamiento, velocidad, altura].every(Number.isFinite) || altura <= 0) return false
  // Un lanzamiento hacia arriba nunca cierra, aunque la hoja todavía esté abajo.
  if (velocidad < -0.2) return false
  return desplazamiento + proyectar(velocidad) > altura / 2
}
