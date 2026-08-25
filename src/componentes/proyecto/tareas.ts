import type { AccionMasiva, DefinicionCampoPersonalizado, ProcesoAmpliado, ValorCampoPersonalizado } from '@/datos/recursos'
import type { Capacidad } from '@/datos/tipos'
import { estadoVencimiento } from '../../lib/fechas.ts'

/**
 * Logica de la pestaña de Tareas que no necesita React.
 *
 * Vive en un `.ts` para poder probarse con el runner de Node, que despoja tipos pero no JSX. Todo lo
 * que decida *que* se muestra —columnas de campos personalizados, filas vencidas, que accion masiva
 * se ofrece— se prueba desde aca.
 */

/** El estado "Completo" de Perfex. Es una constante del codigo del panel, no una fila de tabla. */
export const ESTADO_COMPLETO = 5

/**
 * Una tarea vencida que todavia no esta completa.
 *
 * Es lo que el panel viejo pinta con `row-border-danger`. La comparacion por dia calendario ya vive
 * en `estadoVencimiento`: repetirla aca daria dos reglas que se pueden contradecir.
 *
 * @param proceso la tarea
 * @param hoy dia de referencia; entra por parametro para que la regla se pueda probar
 * @returns `true` si hay que marcar la fila
 */
export function estaVencida (proceso: { due_date: string | null, status: number }, hoy: Date = new Date()): boolean {
  if (proceso.status === ESTADO_COMPLETO) return false

  return estadoVencimiento(proceso.due_date, hoy) === 'vencido'
}

/**
 * Los campos personalizados que se convierten en columnas de la tabla.
 *
 * Solo los que tienen `show_on_table`: las tareas tienen mas campos de los que entran en una fila, y
 * es exactamente el criterio del panel viejo. Se ordenan por `order` y, a igualdad, por nombre, para
 * que el orden no dependa de como los devolvio la base.
 *
 * @param definiciones lo que devuelve `GET /custom-fields?para=tasks`
 * @returns las definiciones que son columna, ya ordenadas
 */
export function camposDeTabla (definiciones: DefinicionCampoPersonalizado[]): DefinicionCampoPersonalizado[] {
  return definiciones
    .filter((campo) => campo.show_on_table)
    .sort((a, b) => a.order - b.order || a.name.localeCompare(b.name))
}

/**
 * Texto de un campo personalizado en una fila.
 *
 * Un `multiselect` llega como lista y hay que unirla; un campo sin valor da cadena vacia, que la
 * celda pinta como un guion.
 *
 * @param proceso la fila
 * @param slug el campo buscado
 * @returns el valor listo para mostrar, o cadena vacia si no hay
 */
export function valorDeCampo (proceso: ProcesoAmpliado, slug: string): string {
  const campo: ValorCampoPersonalizado | undefined = proceso.custom_fields?.find((c) => c.slug === slug)

  if (campo === undefined || campo.value === null) return ''

  return Array.isArray(campo.value) ? campo.value.join(', ') : campo.value
}

/** Como se pide el valor de una accion masiva. Decide que control dibuja el dialogo. */
export type ControlAccionMasiva = 'estado' | 'prioridad' | 'personas' | 'hito' | 'booleano' | 'etiquetas' | 'ninguno'

export interface AccionMasivaDescrita {
  clave: AccionMasiva
  etiqueta: string
  control: ControlAccionMasiva
  /** Capacidad del area `tasks` que hace falta. Ocultar no autoriza: el backend vuelve a decidir. */
  requiere: Capacidad
  peligrosa?: boolean
}

/**
 * Las acciones masivas del panel viejo, en su orden.
 *
 * `delete` pide `delete tasks`; el resto pide `edit tasks`. `status` ademas se aplica fila por fila
 * del lado del backend —solo si sos creador, asignado o admin— y las que se saltea vuelven en
 * `meta.omitidos`: por eso el frontend no las filtra de antemano.
 */
export const ACCIONES_MASIVAS: AccionMasivaDescrita[] = [
  { clave: 'status', etiqueta: 'Cambiar estado', control: 'estado', requiere: 'edit' },
  { clave: 'priority', etiqueta: 'Cambiar prioridad', control: 'prioridad', requiere: 'edit' },
  { clave: 'assignees', etiqueta: 'Agregar asignados', control: 'personas', requiere: 'edit' },
  { clave: 'milestone', etiqueta: 'Mover a un hito', control: 'hito', requiere: 'edit' },
  { clave: 'billable', etiqueta: 'Marcar facturable', control: 'booleano', requiere: 'edit' },
  { clave: 'tags', etiqueta: 'Agregar etiquetas', control: 'etiquetas', requiere: 'edit' },
  { clave: 'delete', etiqueta: 'Eliminar', control: 'ninguno', requiere: 'delete', peligrosa: true }
]

/**
 * Las acciones masivas que la persona puede ejecutar.
 *
 * @param capacidades `permissions.tasks` de `/me`
 * @returns las acciones visibles, en el orden declarado
 */
export function accionesMasivasPermitidas (capacidades: Capacidad[]): AccionMasivaDescrita[] {
  return ACCIONES_MASIVAS.filter((accion) => capacidades.includes(accion.requiere))
}

/**
 * Convierte lo elegido en el dialogo al `valor` que espera `POST /tasks/bulk`.
 *
 * @param control el tipo de control que se uso
 * @param crudo lo que quedo seleccionado o escrito
 * @returns el valor tipado, o `null` si todavia no hay nada que mandar
 */
export function valorDeAccionMasiva (
  control: ControlAccionMasiva,
  crudo: string
): number | boolean | string[] | number[] | null {
  if (control === 'ninguno') return null

  if (control === 'etiquetas') {
    const etiquetas = crudo.split(',').map((t) => t.trim()).filter((t) => t !== '')

    return etiquetas.length > 0 ? etiquetas : null
  }

  if (control === 'personas') {
    const ids = crudo.split(',').map((n) => Number(n.trim())).filter((n) => Number.isInteger(n) && n > 0)

    return ids.length > 0 ? ids : null
  }

  if (control === 'booleano') return crudo === 'si'

  const numero = Number(crudo)

  return Number.isInteger(numero) && numero > 0 ? numero : null
}

/**
 * Alterna un id dentro de la seleccion.
 *
 * @param seleccion los ids ya seleccionados
 * @param id el que se toco
 * @returns la seleccion nueva; no muta la anterior
 */
export function alternarSeleccion (seleccion: number[], id: number): number[] {
  return seleccion.includes(id) ? seleccion.filter((n) => n !== id) : [...seleccion, id]
}
