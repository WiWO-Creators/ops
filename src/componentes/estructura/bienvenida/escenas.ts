import type { ComponentType } from 'react'
import { EscenaGrilla } from './EscenaGrilla'
import { EscenaOrbitas } from './EscenaOrbitas'
import { EscenaPiezas } from './EscenaPiezas'

/** Una de las coreografias que pueden recibir a quien acaba de actualizar. */
export interface EscenaDeBienvenida {
  /** Identificador estable. No se muestra: sirve para nombrar la escena en el codigo y en pruebas. */
  clave: string
  /** Nombre visible en el laboratorio de animaciones. */
  nombre: string
  /** El dibujo. Decorativo y `aria-hidden`: el texto de al lado es el que se anuncia. */
  Dibujo: ComponentType
  /** La linea de abajo. Cambia con la escena para que la repeticion no se note tanto como el dibujo. */
  frase: string
  /**
   * Cuanto dura la coreografia, en milisegundos. La capa espera esto antes de empezar a irse, asi
   * que tiene que cubrir la ultima fase del timeline: si es menor, la escena se corta a mitad.
   */
  duracion: number
}

/**
 * Las escenas disponibles, en el orden en que se fueron sumando.
 *
 * Todas comparten encuadre (`viewBox="-120 -60 240 120"`, centrado en cero) y una sola mancha de
 * color de marca. Agregar una mas es agregar una entrada aca: nada fuera de este archivo las enumera.
 *
 * El tipo es una tupla con al menos un elemento, no un arreglo suelto: asi el respaldo de
 * `elegirEscena` es una escena de verdad y no un `undefined` que el compilador tenga que tolerar.
 */
export const ESCENAS: readonly [EscenaDeBienvenida, ...EscenaDeBienvenida[]] = [
  { clave: 'grilla', nombre: 'Grilla', Dibujo: EscenaGrilla, frase: 'Ordenando cada pieza en su lugar…', duracion: 3200 },
  { clave: 'piezas', nombre: 'Piezas', Dibujo: EscenaPiezas, frase: 'Encajando las partes nuevas…', duracion: 3300 },
  { clave: 'orbitas', nombre: 'Órbitas', Dibujo: EscenaOrbitas, frase: 'Poniendo todo en movimiento…', duracion: 3100 }
]

/**
 * Elige una escena al azar.
 *
 * Al azar y no por turnos: recordar cual toco la vez pasada obliga a guardar estado entre sesiones
 * para algo que dura tres segundos y se ve, con suerte, una vez por semana.
 *
 * @returns una de las escenas de `ESCENAS`; nunca `undefined` mientras la lista no este vacia
 */
export function elegirEscena (): EscenaDeBienvenida {
  const indice = Math.floor(Math.random() * ESCENAS.length)

  // `Math.random()` no llega a 1, pero un redondeo desafortunado en algun motor no puede terminar en
  // una pantalla en blanco: la primera escena es un respaldo valido.
  return ESCENAS[indice] ?? ESCENAS[0]
}
