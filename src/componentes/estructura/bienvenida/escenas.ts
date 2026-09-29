import type { ComponentType } from 'react'
import { EscenaGantt } from './EscenaGantt'
import { EscenaIndicadores } from './EscenaIndicadores'
import { EscenaJornada } from './EscenaJornada'
import { EscenaTablero } from './EscenaTablero'
import { EscenaTickets } from './EscenaTickets'

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
 * Cada una cuenta un pedazo de Ops —el tablero, el Gantt, los indicadores, la jornada, los tickets—
 * con las mismas piezas que se ven en el panel. Comparten encuadre (`viewBox="-120 -60 240 120"`,
 * centrado en cero), suelo en `y=52` cuando hay personajes (`Personaje.tsx`) y el color de marca
 * para lo que protagoniza. Agregar una mas es agregar una entrada aca: nada fuera de este archivo
 * las enumera.
 *
 * El tipo es una tupla con al menos un elemento, no un arreglo suelto: asi el respaldo de
 * `elegirEscena` es una escena de verdad y no un `undefined` que el compilador tenga que tolerar.
 */
export const ESCENAS: readonly [EscenaDeBienvenida, ...EscenaDeBienvenida[]] = [
  { clave: 'tablero', nombre: 'Tablero', Dibujo: EscenaTablero, frase: 'Moviendo las tareas a su columna…', duracion: 3300 },
  { clave: 'gantt', nombre: 'Gantt', Dibujo: EscenaGantt, frase: 'Poniendo al día el cronograma…', duracion: 3200 },
  { clave: 'indicadores', nombre: 'Indicadores', Dibujo: EscenaIndicadores, frase: 'Recalculando los números…', duracion: 3200 },
  { clave: 'jornada', nombre: 'Jornada', Dibujo: EscenaJornada, frase: 'Repartiendo las horas del día…', duracion: 3400 },
  { clave: 'tickets', nombre: 'Tickets', Dibujo: EscenaTickets, frase: 'Asignando cada ticket a su responsable…', duracion: 3100 }
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
