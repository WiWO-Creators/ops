import { formatearRelativo } from '../lib/fechas.ts'
import type { Regeneracion } from './ia.ts'

/**
 * Las dos piezas con reglas del resumen del Inicio.
 *
 * Viven en un `.ts` y no dentro de `ResumenDelDia.tsx` porque el runner de pruebas es `node --test`,
 * que despoja tipos pero **no JSX**: logica metida en un `.tsx` es logica que no se puede probar.
 *
 * Ninguna de las dos habla con la red ni con el DOM. La cola recibe texto y lo devuelve de a poco;
 * el motivo de bloqueo traduce a español lo que ya decidio el backend.
 */

/**
 * Caracteres que la cola entrega por tick.
 *
 * Con ticks de 16 ms (un cuadro a 60 Hz) son ~187 caracteres por segundo: mas rapido que cualquier
 * mecanografo y aun asi visiblemente progresivo. Pintar el `delta` entero apenas llega se ve como
 * tartamudeo —el proveedor manda rafagas de largo irregular—, no como escritura.
 */
const POR_TICK = 3

/** Lo que se dice cuando ya no quedan generaciones del dia. El tope de dos lo fija el backend. */
const SIN_CUPO = 'Ya lo regeneraste dos veces hoy. Volvé mañana.'

/** Respaldo para un bloqueo por espera al que el backend no le mando el instante de reapertura. */
const SIN_FECHA = 'Todavía no podés regenerarlo.'

/** Opciones de `crearCola()`. */
export interface OpcionesCola {
  /**
   * Cuantos caracteres salen por `drenar()`. `Infinity` entrega todo de una.
   *
   * Es lo que se usa con `prefers-reduced-motion: reduce`: la escritura progresiva es movimiento, y
   * quien pidio que no lo haya recibe el texto completo en el primer tick.
   */
  porTick?: number
}

/** Buffer que convierte las rafagas del stream en un goteo parejo de caracteres. */
export interface ColaDeEscritura {
  /** Agrega texto al final de lo que falta escribir. */
  empujar: (texto: string) => void
  /** Saca el proximo trozo. Devuelve `''` si no queda nada. */
  drenar: () => string
  /** Deja de dosificar: a partir de aca cada `drenar()` entrega todo lo que haya. */
  saltar: () => void
  /** Caracteres todavia sin entregar. */
  readonly pendiente: number
  /** `true` cuando no queda nada por entregar. */
  readonly terminada: boolean
}

/**
 * Crea la cola de escritura.
 *
 * El estado es un solo string cerrado en el closure. No es una clase porque no hay nada que heredar
 * ni que sustituir, y no es un `useState` porque cambia 60 veces por segundo: guardarlo en el estado
 * de React repintaria el componente entero por cada tres caracteres.
 *
 * @param opciones ritmo de salida; por defecto `POR_TICK`
 * @returns la cola, con su estado ya encapsulado
 */
export function crearCola (opciones: OpcionesCola = {}): ColaDeEscritura {
  let porTick = opciones.porTick ?? POR_TICK
  let cola = ''

  return {
    empujar (texto: string) {
      cola += texto
    },
    drenar () {
      if (cola === '') return ''

      const corte = corteSeguro(cola, porTick)
      const trozo = cola.slice(0, corte)

      cola = cola.slice(corte)

      return trozo
    },
    saltar () {
      porTick = Infinity
    },
    get pendiente () {
      return cola.length
    },
    get terminada () {
      return cola === ''
    }
  }
}

/**
 * Donde cortar sin partir un caracter en dos.
 *
 * `String.slice()` corta por unidades UTF-16, asi que un corte en el medio de un par sustituto deja
 * media mitad en pantalla —el rombo con el signo de pregunta— hasta el tick siguiente. Se corre un
 * lugar y el caracter sale entero.
 *
 * @param cola lo que falta entregar
 * @param porTick cuantos caracteres se pidieron; `Infinity` se lleva todo
 * @returns un indice de corte de al menos 1, nunca mayor que el largo de la cola
 */
function corteSeguro (cola: string, porTick: number): number {
  if (porTick >= cola.length) return cola.length

  const corte = Math.max(1, Math.floor(porTick))
  const ultimo = cola.charCodeAt(corte - 1)

  return ultimo >= 0xd800 && ultimo <= 0xdbff ? corte + 1 : corte
}

/**
 * La frase que acompaña al boton de regenerar cuando esta deshabilitado.
 *
 * **El backend siempre gana**: si dice `puede_ahora`, no hay bloqueo que inventar aunque los otros
 * campos digan otra cosa. La regla de 2 por dia con 4 horas de espera no se recalcula aca —
 * duplicarla seria dos fuentes de verdad, y ademas se saltearia desde la consola del navegador.
 * Esta funcion solo traduce.
 *
 * El texto de la espera sale de `formatearRelativo()`, asi que dice "dentro de 2 horas" con las
 * mismas palabras que el resto del panel en vez de inventar un formateo propio.
 *
 * @param regeneracion el bloque tal como lo mando el backend
 * @param ahora momento de referencia; inyectable para poder probarlo sin depender del reloj
 * @returns la frase, o `null` si se puede regenerar
 */
export function motivoDeBloqueo (regeneracion: Regeneracion, ahora: Date = new Date()): string | null {
  if (regeneracion.puede_ahora) return null

  // Sin `motivo` explicito se deduce del cupo: quedan generaciones, entonces lo que falta es esperar.
  const esperando = regeneracion.motivo === 'espera'
    || (regeneracion.motivo === null && regeneracion.restantes_hoy > 0)

  if (!esperando) return SIN_CUPO
  if (regeneracion.disponible_desde === null) return SIN_FECHA

  return `Vas a poder regenerarlo ${formatearRelativo(regeneracion.disponible_desde, ahora)}.`
}
