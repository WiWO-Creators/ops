import type { TareaDePlantillaHito } from '../datos/recursos.ts'
import type { OpcionFiltro } from '../definiciones/tipos.ts'
import { sumarDias } from './fechas.ts'

/**
 * Logica pura de las plantillas de Hito.
 *
 * Vive en `.ts` y no en un `.tsx` a proposito: el runner de Node despoja tipos pero no JSX, asi que
 * lo que esta aca se puede probar sin navegador. La parte visual esta en
 * `componentes/proyecto/PantallaPlantillasHito.tsx` y `EditorPlantillaHito.tsx`.
 *
 * **El calculo de fechas de este modulo es una vista previa, no la regla.** Quien decide las fechas
 * reales es `POST /projects/{id}/milestones` con `plantilla_id`; esto solo muestra de antemano lo
 * que va a pasar, para que nadie cree cuatro Tareas mal fechadas y se entere despues.
 */

/** Tope de tareas por plantilla que declara el backend. Pasarse responde 422. */
export const TOPE_TAREAS = 100

/** Distancia maxima en dias que acepta el backend: diez años, el filtro de lo absurdo. */
export const OFFSET_MAXIMO = 3650

/** Prioridad por defecto de `tbltasks`, la misma que usa el alta de Proceso. */
export const PRIORIDAD_POR_DEFECTO = 2

/**
 * La escala de prioridad de `tbltasks`, con su nombre visible.
 *
 * Se declara aca y no en el componente porque la usan el editor y la vista previa del alta de hito:
 * dos copias del mismo mapa terminan diciendo cosas distintas del mismo numero.
 */
export const PRIORIDADES: OpcionFiltro[] = [
  { valor: '1', etiqueta: 'Baja' },
  { valor: '2', etiqueta: 'Media' },
  { valor: '3', etiqueta: 'Alta' },
  { valor: '4', etiqueta: 'Urgente' }
]

/**
 * Nombre visible de una prioridad.
 *
 * @param prioridad Valor tal como lo guarda la API (1..4).
 * @returns La etiqueta, o el numero crudo si la API inventa una escala nueva.
 */
export function nombreDePrioridad (prioridad: number): string {
  return PRIORIDADES.find((opcion) => opcion.valor === String(prioridad))?.etiqueta ?? String(prioridad)
}

/**
 * Fila del editor, con los numeros todavia como texto.
 *
 * Se guardan como los escribe el navegador y se convierten al armar el cuerpo: convertir en cada
 * pulsacion hace que borrar el contenido de un campo numerico lo reponga en `0`.
 */
export interface FilaTarea {
  /** Identidad local estable, para el `key` de React. No viaja a la API. */
  clave: string
  name: string
  description: string
  /** Vacio = `null` = "el inicio del hito". No es lo mismo que `'0'`, que tambien es el inicio pero declarado. */
  start_offset_days: string
  /** Vacio = `null` = "el cierre del hito". */
  due_offset_days: string
  /** Prioridad como texto, para el selector. */
  priority: string
  /** Id del tipo de Proceso como texto; vacio = sin tipo. */
  task_type_id: string
}

/** Tarea tal como la acepta `POST`/`PATCH /hito-plantillas`. */
export interface TareaParaGuardar {
  name: string
  description: string | null
  start_offset_days: number | null
  due_offset_days: number | null
  priority: number
  task_type_id: number | null
}

/**
 * Entero de un campo de texto, o `null` si esta vacio.
 *
 * El vacio NO se aplana a `0`: el contrato distingue "a cero dias del inicio" de "la fecha del
 * hito", y confundirlos cambia el vencimiento de una tarea sin que nadie lo haya pedido. Lo que no
 * sea un entero viaja tal cual convertido para que el `422` del backend lo señale en su fila.
 *
 * @param texto Lo escrito en el campo.
 * @returns El entero, o `null` para el campo vacio.
 */
function offset (texto: string): number | null {
  if (texto.trim() === '') return null

  const valor = Number(texto)

  return Number.isFinite(valor) ? Math.trunc(valor) : 0
}

/**
 * Convierte las filas del editor en las tareas que espera la API.
 *
 * @param filas Filas del editor, en el orden en que se ven.
 * @returns Las tareas, en el mismo orden. `order` no se manda: es la posicion.
 */
export function tareasParaGuardar (filas: FilaTarea[]): TareaParaGuardar[] {
  return filas.map((fila) => ({
    name: fila.name.trim(),
    description: fila.description.trim() === '' ? null : fila.description.trim(),
    start_offset_days: offset(fila.start_offset_days),
    due_offset_days: offset(fila.due_offset_days),
    priority: Number.isFinite(Number(fila.priority)) && fila.priority !== ''
      ? Number(fila.priority)
      : PRIORIDAD_POR_DEFECTO,
    task_type_id: fila.task_type_id === '' ? null : Number(fila.task_type_id)
  }))
}

/**
 * Reconstruye las filas del editor a partir de una plantilla leida.
 *
 * @param tareas `tasks` de `GET /hito-plantillas/{id}`.
 * @returns Las filas del editor, en el orden declarado.
 */
export function filasDeTareas (tareas: TareaDePlantillaHito[]): FilaTarea[] {
  return tareas.map((tarea, indice) => ({
    clave: `tarea-${tarea.id}-${indice}`,
    name: tarea.name,
    description: tarea.description ?? '',
    start_offset_days: tarea.start_offset_days === null ? '' : String(tarea.start_offset_days),
    due_offset_days: tarea.due_offset_days === null ? '' : String(tarea.due_offset_days),
    priority: String(tarea.priority),
    task_type_id: tarea.task_type_id === null ? '' : String(tarea.task_type_id)
  }))
}

/**
 * Valida las filas antes de gastar un viaje a la API.
 *
 * Solo comprueba lo que se ve desde el navegador —nombre vacio, offset fuera de rango, vencimiento
 * antes del arranque—; el resto lo dice el backend y se reparte con `erroresDeTareas()`.
 *
 * @param filas Filas del editor.
 * @returns Mapa posicion -> campo -> mensaje ya legible. Vacio si esta todo bien.
 */
export function validarFilas (filas: FilaTarea[]): Record<number, Record<string, string>> {
  const porFila: Record<number, Record<string, string>> = {}

  filas.forEach((fila, indice) => {
    const errores: Record<string, string> = {}

    if (fila.name.trim() === '') errores.name = 'Pon un nombre.'

    const desde = offset(fila.start_offset_days)
    const hasta = offset(fila.due_offset_days)

    if (desde !== null && (desde < 0 || desde > OFFSET_MAXIMO)) {
      errores.start_offset_days = `Entre 0 y ${OFFSET_MAXIMO} días.`
    }
    if (hasta !== null && (hasta < 0 || hasta > OFFSET_MAXIMO)) {
      errores.due_offset_days = `Entre 0 y ${OFFSET_MAXIMO} días.`
    }
    if (desde !== null && hasta !== null && hasta < desde && errores.due_offset_days === undefined) {
      errores.due_offset_days = 'El vencimiento cae antes que el arranque.'
    }

    if (Object.keys(errores).length > 0) porFila[indice] = errores
  })

  return porFila
}

/**
 * Reparte los `details` de un `422` entre las filas del editor.
 *
 * La API los devuelve con la posicion adentro de la clave (`tasks.0.due_offset_days`) justamente
 * para que se puedan pintar al lado del campo que fallo, en vez de como un parrafo al pie que no
 * dice cual de las cien tareas esta mal.
 *
 * @param detalles `details` del envelope de error.
 * @returns Mapa posicion -> campo -> mensaje ya legible. Las claves que no hablan de una tarea quedan afuera.
 */
export function erroresDeTareas (
  detalles: Record<string, string[]> | undefined
): Record<number, Record<string, string>> {
  const porFila: Record<number, Record<string, string>> = {}

  for (const [clave, motivos] of Object.entries(detalles ?? {})) {
    const partes = /^tasks\.(\d+)\.(.+)$/.exec(clave)

    if (partes === null || !Array.isArray(motivos)) continue

    const indice = Number(partes[1])
    const campo = partes[2] ?? ''
    const motivo = motivos[0]

    if (motivo === undefined) continue

    porFila[indice] = { ...porFila[indice], [campo]: textoDeMotivo(motivo) }
  }

  return porFila
}

/** Motivos del contrato propios de las plantillas de Hito, en castellano. */
const MOTIVOS: Record<string, string> = {
  required: 'Pon un nombre.',
  integer: 'Tiene que ser un número entero.',
  fuera_de_rango: `Entre 0 y ${OFFSET_MAXIMO} días.`,
  anterior_al_inicio: 'El vencimiento cae antes que el arranque.',
  no_editable: 'Este campo no se puede escribir.',
  scalar: 'Valor inválido.',
  invalid: 'Valor inválido.'
}

/**
 * Texto legible de un motivo del contrato.
 *
 * @param motivo Codigo tal como lo manda la API.
 * @returns La frase, o el codigo con los guiones bajos cambiados por espacios.
 */
export function textoDeMotivo (motivo: string): string {
  return MOTIVOS[motivo] ?? motivo.replace(/_/g, ' ')
}

/** Una tarea de la plantilla con las fechas que le tocarian dentro de un hito concreto. */
export interface TareaPrevista {
  nombre: string
  /** `YYYY-MM-DD`, o `null` mientras la fecha de inicio del hito no sea utilizable. */
  inicio: string | null
  vence: string | null
  prioridad: string
}

/**
 * Calcula las fechas que tendria cada tarea si el hito se creara con estas fechas.
 *
 * Replica la formula del backend (`PlantillaHito::fechas()`): el ancla es SIEMPRE el inicio del
 * hito, tambien para el vencimiento; un offset `null` cae en la fecha del hito que corresponda; y
 * un vencimiento anterior al arranque se aplana al arranque en vez de tumbar el alta.
 *
 * @param inicioHito Fecha de inicio del hito, en `YYYY-MM-DD`. Vacia o mal formada devuelve fechas nulas.
 * @param cierreHito Fecha de vencimiento del hito, en `YYYY-MM-DD`.
 * @param tareas Tareas de la plantilla, en su orden declarado.
 * @returns Una fila por tarea, en el mismo orden.
 */
export function previsualizarTareas (
  inicioHito: string | null | undefined,
  cierreHito: string | null | undefined,
  tareas: TareaDePlantillaHito[]
): TareaPrevista[] {
  return tareas.map((tarea) => {
    const inicio = tarea.start_offset_days === null
      ? (sumarDias(inicioHito, 0))
      : sumarDias(inicioHito, tarea.start_offset_days)

    const vence = tarea.due_offset_days === null
      ? sumarDias(cierreHito, 0)
      : sumarDias(inicioHito, tarea.due_offset_days)

    return {
      nombre: tarea.name,
      inicio,
      // `YYYY-MM-DD` ordena igual como texto que como fecha: no hace falta parsear para comparar.
      vence: inicio !== null && vence !== null && vence < inicio ? inicio : vence,
      prioridad: nombreDePrioridad(tarea.priority)
    }
  })
}
