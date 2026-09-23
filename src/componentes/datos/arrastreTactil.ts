/**
 * Geometría del arrastre táctil del tablero: dónde cae una tarjeta según dónde está el dedo.
 *
 * Es la parte pura; `useArrastreTactil` mide las columnas y las tarjetas en pantalla y le pasa los
 * números. Sin DOM, para que las pruebas de Node la ejerciten.
 */

/** Una columna tal como se ve: sus bordes horizontales y el centro vertical de cada tarjeta. */
export interface GeometriaColumna {
  izquierda: number
  derecha: number
  tarjetas: Array<{ id: number, centro: number }>
}

/** Dónde caería la tarjeta: índice de la columna y posición dentro de ella, ya sin la arrastrada. */
export interface DestinoTactil {
  columna: number
  posicion: number
}

/**
 * Cuánto se tolera fuera de una columna. El hueco entre columnas es de 12px; con este margen, un
 * dedo que cae justo en el hueco elige la más cercana en vez de no elegir ninguna.
 */
const HOLGURA = 24

/**
 * Calcula el destino de la tarjeta arrastrada para una posición del dedo.
 *
 * La posición se cuenta sin la tarjeta arrastrada: es lo que espera `moverTarjeta` ("índice donde
 * queda dentro del destino, ya sin la tarjeta en su lugar viejo"). La tarjeta cae antes de la
 * primera cuyo centro esté por debajo del dedo, que es donde la persona ve el hueco.
 *
 * @param x coordenada horizontal del dedo
 * @param y coordenada vertical del dedo
 * @param columnas geometría de las columnas en orden
 * @param idArrastrada id de la tarjeta que se arrastra
 * @returns el destino, o `null` si el dedo está lejos de toda columna o las entradas son inválidas
 */
export function destinoDelPuntero (
  x: number,
  y: number,
  columnas: GeometriaColumna[],
  idArrastrada: number
): DestinoTactil | null {
  if (!Number.isFinite(x) || !Number.isFinite(y) || columnas.length === 0) return null

  let elegida = -1
  let menorDistancia = Number.POSITIVE_INFINITY
  columnas.forEach((columna, indice) => {
    const distancia = x < columna.izquierda ? columna.izquierda - x : x > columna.derecha ? x - columna.derecha : 0
    if (distancia < menorDistancia) {
      menorDistancia = distancia
      elegida = indice
    }
  })

  const columna = columnas[elegida]
  if (columna === undefined || menorDistancia > HOLGURA) return null

  const otras = columna.tarjetas.filter((tarjeta) => tarjeta.id !== idArrastrada)
  const debajo = otras.findIndex((tarjeta) => tarjeta.centro > y)
  return { columna: elegida, posicion: debajo === -1 ? otras.length : debajo }
}

/**
 * Si soltar en ese destino deja todo como estaba.
 *
 * Sin esta guarda, levantar una tarjeta y devolverla a su lugar dispararía un `POST` de mover y una
 * recarga del tablero entero por nada.
 *
 * @param origen columna y posición de donde salió la tarjeta
 * @param destino adónde caería
 * @returns `true` si no hay movimiento real
 */
export function esElMismoLugar (origen: DestinoTactil, destino: DestinoTactil): boolean {
  return origen.columna === destino.columna && origen.posicion === destino.posicion
}

/**
 * Inclinación del fantasma según la velocidad horizontal del dedo.
 *
 * Se inclina hacia donde va, como un objeto que arrastra el aire, y nunca más de 4 grados: más que
 * eso se lee como que la tarjeta se va a caer.
 *
 * @param velocidad píxeles por milisegundo, con signo
 * @returns grados, entre -4 y 4
 */
export function inclinacion (velocidad: number): number {
  if (!Number.isFinite(velocidad)) return 0
  return Math.max(-4, Math.min(4, velocidad * 3))
}
