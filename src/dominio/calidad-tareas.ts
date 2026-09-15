import { GLOSARIO } from './glosario.ts'
import type { TonoInsignia } from '@/componentes/presentadores/Insignia'
import type { DescripcionEvaluada, EjeDeCalidad, EjeDeIncoherencia, TareaCalidad, TramoCalidad } from '@/datos/recursos'

/**
 * Lo que el detector de tareas insuficientes dice en palabras.
 *
 * Vive en un `.ts` y fuera de todo componente por la regla de `docs/convenciones.md`: Node despoja
 * los tipos de un `.ts` pero no el JSX, asi que solo lo que esta aca se puede probar con el runner.
 *
 * === Por que el color nunca va solo ===
 *
 * La nota se va a leer para juzgar el trabajo de alguien. Cada tramo lleva su palabra ademas de su
 * tono —"Completa", "Floja", "Insuficiente"—, igual que el semaforo de clientes: la tabla se tiene
 * que poder leer sin distinguir colores y sobrevivir a una captura en blanco y negro.
 *
 * === Por que la nota vieja se marca y no se esconde ===
 *
 * Una descripcion que cambio despues de puntuarla deja una nota que describe un texto que ya no
 * existe. Esconderla dejaria la fila en blanco sin decir por que, y mostrarla como si nada la
 * convertiria en una acusacion desactualizada. Se muestra avisando que quedo vieja.
 */

/** Como se lee y se pinta cada tramo. Vive una sola vez: el mapa es la definicion del semaforo. */
export const TRAMOS_DE_CALIDAD: Record<TramoCalidad, { etiqueta: string, tono: TonoInsignia, numero: string }> = {
  completa: { etiqueta: 'Completa', tono: 'exito', numero: 'text-texto' },
  floja: { etiqueta: 'Floja', tono: 'aviso', numero: 'text-texto-aviso' },
  insuficiente: { etiqueta: 'Insuficiente', tono: 'peligro', numero: 'text-texto-peligro' }
}

/**
 * Como se nombra cada eje que la nota mira.
 *
 * `descripcion` no dice "Descripcion de la tarea" sino solo "Descripcion": la columna ya esta en una
 * tabla de Tareas y repetir el sujeto en cada insignia gasta el ancho que necesitan los nombres.
 */
export const EJES_DE_CALIDAD: Record<EjeDeCalidad, string> = {
  descripcion: 'Descripción',
  asignado: 'Sin responsable',
  fecha: 'Sin fecha'
}

/** Orden de lectura de los ejes, de lo mas caro de arreglar a lo mas barato. */
export const ORDEN_DE_EJES: readonly EjeDeCalidad[] = ['descripcion', 'asignado', 'fecha']

/**
 * Como se nombra cada incoherencia.
 *
 * Nombran el CAMPO y no la ausencia, al reves que `EJES_DE_CALIDAD`: aca el campo esta lleno, lo que
 * pasa es que dice algo que las fechas contradicen. "Sin estado" seria mentira.
 */
export const EJES_DE_INCOHERENCIA: Record<EjeDeIncoherencia, string> = {
  estado: 'Estado',
  prioridad: 'Prioridad'
}

/** Orden de lectura: el estado primero, que es el que mas se mira. */
export const ORDEN_DE_INCOHERENCIAS: readonly EjeDeIncoherencia[] = ['estado', 'prioridad']

/**
 * Las incoherencias de una Tarea, en una sola linea.
 *
 * Es el texto que baja al CSV, asi que devuelve cadena y no nodos. El motivo lo escribe el backend
 * —"Venció hace 20 días y sigue en 'Por iniciar'"— y no se reescribe aca: repetir la regla en el
 * navegador daria dos textos que pueden decir cosas distintas sobre la misma fila.
 *
 * Una Tarea sin incoherencias devuelve cadena vacia y no "ninguna": la columna se lee buscando lo
 * que hay que arreglar, y una palabra en cada fila sana tapa las que importan.
 *
 * @param incoherencias Lo que manda la API.
 * @returns Los motivos separados por punto y espacio, o cadena vacia.
 */
export function describirIncoherencias (incoherencias: TareaCalidad['incoherencias']): string {
  if (incoherencias.length === 0) return ''

  return ORDEN_DE_INCOHERENCIAS
    .map((eje) => incoherencias.find((una) => una.eje === eje))
    .filter((una) => una !== undefined)
    .map((una) => una.motivo)
    .join(' ')
}

/**
 * Nombre visible de un tramo, cayendo a la clave cuando no lo conoce.
 *
 * Cae a la clave en vez de dejar la celda vacia: si el backend agregara un cuarto tramo, ver la
 * clave cruda dice que paso; una celda en blanco parece un error de esta pantalla.
 *
 * @param tramo El tramo tal como llego.
 * @returns El nombre listo para mostrar.
 */
export function etiquetaDeTramo (tramo: TramoCalidad): string {
  return TRAMOS_DE_CALIDAD[tramo]?.etiqueta ?? tramo
}

/**
 * Los ejes que faltan, en orden de lectura y en una sola linea.
 *
 * Es el texto que baja al CSV, asi que devuelve cadena y no nodos. Una Tarea sin faltas no dice
 * "ninguno" sino que esta completa: el listado se mira para encontrar lo que hay que arreglar, y
 * "ninguno" en esa columna se lee como si el dato no hubiera llegado.
 *
 * @param falta Los ejes que no cumplen, tal como los manda la API.
 * @returns La lista separada por comas, o "Nada: está completa".
 */
export function describirFalta (falta: EjeDeCalidad[]): string {
  if (falta.length === 0) return 'Nada: está completa'

  return ORDEN_DE_EJES
    .filter((eje) => falta.includes(eje))
    .map((eje) => EJES_DE_CALIDAD[eje])
    .join(', ')
}

/**
 * Si la nota que se ve describe un texto que ya no existe.
 *
 * `vigente` en `false` significa dos cosas distintas y solo una es esta: **nunca se puntuo** —ahi
 * `puntaje` es `null`— o **la descripcion cambio despues de puntuarla**, que es el unico caso en que
 * corresponde decir que la nota quedo vieja. Confundirlos acusaria de desactualizado a algo que la
 * IA todavia no miro, y los dos se arreglan de maneras distintas: uno esperando la cola, el otro
 * volviendo a evaluar.
 *
 * @param descripcion El bloque `descripcion` de la fila.
 * @returns `true` si hay una nota y quedo desactualizada.
 */
export function notaQuedoVieja (descripcion: DescripcionEvaluada): boolean {
  return descripcion.puntaje !== null && !descripcion.vigente
}

/**
 * Si la IA todavia no miro la descripcion de esta Tarea.
 *
 * La señal es `evaluado_en`, no la nota: `nota` **siempre** llega como entero 0-100, incluso sin
 * evaluar —el eje de descripcion usa entonces un valor provisional por largo—, asi que mirar la nota
 * no distingue "la IA dijo que es mala" de "la IA no la vio". Esto no es un error de la Tarea y la
 * pantalla no lo marca como tal: es trabajo pendiente de la cola.
 *
 * @param descripcion El bloque `descripcion` de la fila.
 * @returns `true` si no hay evaluacion todavia.
 */
export function sinRevisarTodavia (descripcion: DescripcionEvaluada): boolean {
  return descripcion.evaluado_en === null || descripcion.puntaje === null
}

/**
 * Por que esta Tarea tiene la nota que tiene, en una linea.
 *
 * Prefiere el motivo que escribio la IA porque es el unico que dice algo accionable sobre el texto.
 * Sin motivo cae a los ejes que faltan, que siempre existen. Devuelve `null` cuando no hay nada que
 * agregar: una Tarea completa y ya evaluada no necesita una segunda linea que repita la nota.
 *
 * @param fila La Tarea del detector.
 * @returns El texto secundario de la celda de nota, o `null`.
 */
export function motivoDeLaNota (fila: TareaCalidad): string | null {
  if (fila.descripcion.motivo !== null && fila.descripcion.motivo !== '') return fila.descripcion.motivo
  if (sinRevisarTodavia(fila.descripcion)) {
    return `Sin revisar aún: la nota de esta ${GLOSARIO.proceso.singular.toLowerCase()} todavía no mira el texto.`
  }
  if (fila.falta.length > 0) return describirFalta(fila.falta)

  return null
}

/**
 * El promedio de la foto, con un decimal y coma decimal, o el aviso de que no hay nada medido.
 *
 * `null` no se formatea como cero: cero seria "todas malas" y lo que pasa es que todavia no hay
 * ninguna Tarea evaluada.
 *
 * @param promedio El `nota_promedio` del resumen.
 * @returns El numero listo para pintar, o una raya.
 */
export function formatearPromedio (promedio: number | null): string {
  if (promedio === null) return '—'

  return new Intl.NumberFormat('es-CL', { maximumFractionDigits: 1 }).format(promedio)
}
