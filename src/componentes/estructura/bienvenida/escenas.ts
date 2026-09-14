import type { ComponentType } from 'react'
import { EscenaMartillo } from './EscenaMartillo'
import { EscenaMartilloNeumatico } from './EscenaMartilloNeumatico'
import { EscenaGruaHorquilla } from './EscenaGruaHorquilla'
import { EscenaSoldador } from './EscenaSoldador'

/** Una de las escenas que pueden recibir a quien acaba de actualizar. */
export interface EscenaDeBienvenida {
  /** Identificador estable. No se muestra: sirve para nombrar la escena en el codigo y en pruebas. */
  clave: string
  /** El dibujo. Decorativo y `aria-hidden`: el texto de al lado es el que se anuncia. */
  Dibujo: ComponentType
  /** La linea de abajo. Cambia con la escena para que la repeticion no se note tanto como el dibujo. */
  frase: string
}

/**
 * Las escenas disponibles, en el orden en que se fueron sumando.
 *
 * Todas comparten encuadre (`viewBox="34 8 116 102"`), suelo en `y=102` y una sola mancha de color de
 * marca. Agregar una mas es agregar una entrada aca: nada fuera de este archivo las enumera.
 *
 * El tipo es una tupla con al menos un elemento, no un arreglo suelto: asi el respaldo de
 * `elegirEscena` es una escena de verdad y no un `undefined` que el compilador tenga que tolerar.
 */
export const ESCENAS: readonly [EscenaDeBienvenida, ...EscenaDeBienvenida[]] = [
  { clave: 'martillo', Dibujo: EscenaMartillo, frase: 'Dejando todo en su lugar…' },
  { clave: 'neumatico', Dibujo: EscenaMartilloNeumatico, frase: 'Sacando lo viejo del camino…' },
  { clave: 'grua', Dibujo: EscenaGruaHorquilla, frase: 'Moviendo las piezas nuevas…' },
  { clave: 'soldador', Dibujo: EscenaSoldador, frase: 'Uniendo las partes…' }
]

/**
 * Elige una escena al azar.
 *
 * Al azar y no por turnos: recordar cual toco la vez pasada obliga a guardar estado entre sesiones
 * para algo que dura dos segundos y se ve, con suerte, una vez por semana.
 *
 * @returns una de las escenas de `ESCENAS`; nunca `undefined` mientras la lista no este vacia
 */
export function elegirEscena (): EscenaDeBienvenida {
  const indice = Math.floor(Math.random() * ESCENAS.length)

  // `Math.random()` no llega a 1, pero un redondeo desafortunado en algun motor no puede terminar en
  // una pantalla en blanco: la primera escena es un respaldo valido.
  return ESCENAS[indice] ?? ESCENAS[0]
}
