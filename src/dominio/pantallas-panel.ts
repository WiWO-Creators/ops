/**
 * La logica del editor de pantallas: como se nombran las escenas y como se reordenan.
 *
 * Vive aparte del componente porque es lo unico de esta pantalla que se puede equivocar en silencio:
 * un reordenado que pierde un elemento, o una lista que queda vacia y deja un televisor en negro sin
 * que nadie se entere hasta que alguien pasa por delante.
 */
import { GLOSARIO } from './glosario.ts'
import type { EscenaConfigurada } from '@/datos/recursos'

export type ClaseConfigurable = EscenaConfigurada['clase']

/** Las cinco escenas, en el orden en que se ofrecen cuando no hay nada configurado. */
export const CLASES_CONFIGURABLES: ClaseConfigurable[] = [
  'portada',
  'trabajando',
  'cronometros',
  'procesos',
  'espacios'
]

/**
 * Como se llama cada escena y que muestra, en la pantalla de configuracion.
 *
 * Los nombres de Tarea y Proyecto salen de `GLOSARIO` y no escritos a mano: el producto ya los
 * renombro antes y lo volvera a hacer.
 */
export const ESCENAS: Record<ClaseConfigurable, { nombre: string, descripcion: string }> = {
  portada: {
    nombre: 'Portada',
    descripcion: 'El nombre del área, el reloj y tres cifras del día.'
  },
  trabajando: {
    nombre: 'Trabajando ahora',
    descripcion: 'Quién tiene la jornada abierta y desde qué hora.'
  },
  cronometros: {
    nombre: 'Midiendo ahora',
    descripcion: 'Los cronómetros corriendo, con su Tarea y su Proyecto.'
  },
  procesos: {
    nombre: `${GLOSARIO.proceso.plural} del área`,
    descripcion: `Las ${GLOSARIO.proceso.plural.toLowerCase()} abiertas, las vencidas primero.`
  },
  espacios: {
    nombre: `${GLOSARIO.espacio.plural} en curso`,
    descripcion: `Dónde está trabajando el área, con el avance de cada ${GLOSARIO.espacio.singular.toLowerCase()}.`
  }
}

/** Duracion por defecto de una escena que se acaba de encender. */
export const SEGUNDOS_POR_DEFECTO: Record<ClaseConfigurable, number> = {
  portada: 12,
  trabajando: 20,
  cronometros: 20,
  procesos: 20,
  espacios: 20
}

/** Los limites que acepta la API. Repetirlos acá evita un viaje para que conteste 422. */
export const SEGUNDOS_MINIMO = 5
export const SEGUNDOS_MAXIMO = 120

/**
 * Enciende o apaga una escena.
 *
 * Al encenderla se agrega al final: es donde el ojo la busca, y mover cosas de sitio solas es lo que
 * hace que una lista se sienta impredecible. Apagar la ultima que queda **no hace nada**: la API lo
 * rechazaria con un 422, y es mejor que el interruptor no se deje apagar a que se apague y vuelva.
 */
export function alternar (escenas: EscenaConfigurada[], clase: ClaseConfigurable): EscenaConfigurada[] {
  const encendida = escenas.some((escena) => escena.clase === clase)

  if (!encendida) {
    return [...escenas, { clase, segundos: SEGUNDOS_POR_DEFECTO[clase] }]
  }

  if (escenas.length <= 1) return escenas

  return escenas.filter((escena) => escena.clase !== clase)
}

/**
 * Mueve una escena un lugar arriba o abajo.
 *
 * Con botones y no arrastrando: se usa con el teclado, funciona en un lector de pantalla, y no hay
 * forma de soltar un elemento fuera de la lista y perderlo. En una lista de cinco, arrastrar no
 * ahorra nada.
 *
 * En los extremos devuelve la MISMA lista, no una copia: quien la llame puede comparar por identidad
 * para saber que no paso nada.
 */
export function mover (
  escenas: EscenaConfigurada[],
  clase: ClaseConfigurable,
  direccion: -1 | 1
): EscenaConfigurada[] {
  const desde = escenas.findIndex((escena) => escena.clase === clase)

  if (desde < 0) return escenas

  const hasta = desde + direccion

  if (hasta < 0 || hasta >= escenas.length) return escenas

  const copia = [...escenas]
  const [movida] = copia.splice(desde, 1)

  if (movida === undefined) return escenas

  copia.splice(hasta, 0, movida)

  return copia
}

/**
 * Cambia la duracion de una escena, acotandola.
 *
 * Se acota acá y no al guardar para que el numero que se ve sea el que se va a guardar: un campo que
 * acepta 999 y despues guarda 120 es un campo que miente.
 */
export function durar (
  escenas: EscenaConfigurada[],
  clase: ClaseConfigurable,
  segundos: number
): EscenaConfigurada[] {
  if (!Number.isFinite(segundos)) return escenas

  const acotados = Math.round(Math.min(Math.max(segundos, SEGUNDOS_MINIMO), SEGUNDOS_MAXIMO))

  return escenas.map((escena) => escena.clase === clase ? { ...escena, segundos: acotados } : escena)
}

/**
 * Si dos configuraciones son la misma.
 *
 * Decide si el boton de guardar esta habilitado. Compara orden y duracion, no solo el conjunto: mover
 * una escena de sitio es un cambio aunque las cinco sigan encendidas.
 */
export function iguales (unas: EscenaConfigurada[], otras: EscenaConfigurada[]): boolean {
  if (unas.length !== otras.length) return false

  return unas.every((escena, i) => escena.clase === otras[i]?.clase && escena.segundos === otras[i]?.segundos)
}

/**
 * Cuanto dura una vuelta entera, en segundos.
 *
 * Es el dato que decide si una configuracion sirve: una vuelta de cuatro minutos significa que quien
 * pasa por delante de la pared ve una escena y nunca vuelve a ver esa misma.
 */
export function duracionDeLaVuelta (escenas: EscenaConfigurada[]): number {
  return escenas.reduce((total, escena) => total + escena.segundos, 0)
}
