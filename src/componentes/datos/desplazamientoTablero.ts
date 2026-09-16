/**
 * Calcula la velocidad horizontal del arrastre cerca de los bordes visibles.
 * @param x coordenada horizontal del puntero
 * @param izquierda límite visible izquierdo
 * @param derecha límite visible derecho
 * @returns píxeles por segundo; cero fuera del tablero o lejos de los bordes
 */
export function velocidadDeArrastre (x: number, izquierda: number, derecha: number): number {
  if (![x, izquierda, derecha].every(Number.isFinite) || derecha <= izquierda || x < izquierda || x > derecha) return 0
  const margen = Math.min(72, (derecha - izquierda) / 3)
  const velocidadMaxima = 720
  if (x < izquierda + margen) return -velocidadMaxima * (1 - (x - izquierda) / margen)
  if (x > derecha - margen) return velocidadMaxima * (1 - (derecha - x) / margen)
  return 0
}
