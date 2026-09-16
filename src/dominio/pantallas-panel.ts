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

/**
 * Duracion por defecto de una escena que se acaba de encender.
 *
 * === POR QUE BAJARON DE 20 A 10 SEGUNDOS ===
 *
 * Los veinte venian de cuando una escena eran cinco fichas grandes: con tan poco en pantalla, la
 * unica forma de que la vuelta enseñara algo era que cada escena durara. Desde que las escenas son un
 * tablero denso —quince Tareas por pagina en horizontal, treinta en vertical; ver `REJILLAS` en
 * `src/dominio/pantalla-area.ts`— el problema se dio vuelta: hay cuatro veces mas que mostrar y el
 * cuello de botella es cuanto tarda la pared en volver a la escena que a uno le interesa.
 *
 * Diez segundos es lo que tarda en recorrerse una tabla de quince filas buscando la propia, que es lo
 * que la gente hace con un tablero de aeropuerto: no lo lee entero, busca su fila. Nadie se queda
 * parado leyendo una pared; quien necesite el detalle lo tiene en el panel.
 *
 * La portada dura un 40% menos —seis segundos— por lo mismo de siempre: es un titulo y tres cifras,
 * no una lista que haya que leer. Es la misma proporcion que `duracionDe()` usa cuando la escena
 * llega sin `seconds`, y se mantiene a mano acá porque lo que el panel guarda es un numero por
 * escena, no una proporcion.
 *
 * === LA VUELTA COMPLETA ===
 *
 * Con estos valores, un area grande da 1 min 46 s en horizontal y 1 min 06 s en vertical; un area
 * normal, con todo en una pagina, da 46 s. La cuenta entera esta en el docblock de `TOPE_DE_PAGINAS`.
 *
 * **Esto es un valor por defecto, no una migracion.** Las pantallas que ya estan colgadas conservan
 * los segundos que tengan guardados: para que hereden este ritmo hay que editarlas en el panel, que
 * es donde se decide cuanto dura cada escena de cada area.
 */
export const SEGUNDOS_POR_DEFECTO: Record<ClaseConfigurable, number> = {
  portada: 6,
  trabajando: 10,
  cronometros: 10,
  procesos: 10,
  espacios: 10
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
