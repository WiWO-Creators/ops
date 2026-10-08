import type { ComponentType } from 'react'
import { EscenaCalabaza } from './EscenaCalabaza'
import { EscenaCaldero } from './EscenaCaldero'
import { EscenaFantasma } from './EscenaFantasma'
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
 * Las escenas de cada modo especial, que reemplazan a las de siempre mientras el modo se ve.
 *
 * La clave es la del modo (`dominio/modos-especiales.ts`). Mismo encuadre y mismas reglas que
 * `ESCENAS`: agregar un modo con escenas propias es una entrada aca.
 */
export const ESCENAS_DE_MODO: Readonly<Record<string, readonly [EscenaDeBienvenida, ...EscenaDeBienvenida[]]>> = {
  halloween: [
    { clave: 'calabaza', nombre: 'Calabaza', Dibujo: EscenaCalabaza, frase: 'Tallando las novedades…', duracion: 3500 },
    { clave: 'caldero', nombre: 'Caldero', Dibujo: EscenaCaldero, frase: 'Cocinando la actualización…', duracion: 3300 },
    { clave: 'fantasma', nombre: 'Fantasma', Dibujo: EscenaFantasma, frase: 'Cazando los últimos bugs…', duracion: 3400 }
  ]
}

/**
 * Elige una escena al azar, de las del modo especial si hay uno a la vista y de las de siempre si no.
 *
 * Al azar y no por turnos: recordar cual toco la vez pasada obliga a guardar estado entre sesiones
 * para algo que dura tres segundos y se ve, con suerte, una vez por semana.
 *
 * @returns una de las escenas; nunca `undefined` mientras las listas no esten vacias
 */
export function elegirEscena (): EscenaDeBienvenida {
  const modo = typeof document === 'undefined' ? null : document.documentElement.getAttribute('data-modo')
  const lista = (modo !== null ? ESCENAS_DE_MODO[modo] : undefined) ?? ESCENAS
  const indice = Math.floor(Math.random() * lista.length)

  // `Math.random()` no llega a 1, pero un redondeo desafortunado en algun motor no puede terminar en
  // una pantalla en blanco: la primera escena es un respaldo valido.
  return lista[indice] ?? lista[0]
}
