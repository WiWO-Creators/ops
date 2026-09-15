export const MAXIMO_PREGUNTA_AGENTE = 12000

/** Contratos públicos del agente durable; las escrituras se autorizan en el servidor. */
export interface ErrorHerramienta { codigo: string, mensaje: string, reintentable: boolean }
export interface ResultadoHerramienta { resumen: string }
export interface Paso {
  id: string
  descripcion: string
  detalle?: string[]
  supuestos?: string[]
  estado: string
  resultado?: ResultadoHerramienta
  error?: ErrorHerramienta
}
export interface Plan { id: string, version: string, resumen: string, pasos: Paso[] }
export interface Ejecucion {
  id: string
  estado: 'en_cola' | 'planificando' | 'esperando_datos' | 'esperando_confirmacion' | 'ejecutando' | 'completada' | 'error' | 'cancelada' | 'incompleta'
  pregunta: string
  aclaraciones?: string[]
  mensaje?: string
  progreso?: string
  plan?: Plan
  preguntas?: Array<{ pregunta: string, opciones?: string[] }>
  resultado?: ResultadoHerramienta
  error?: ErrorHerramienta
}

export const ESTADOS_EJECUCION: Record<Ejecucion['estado'], string> = {
  en_cola: 'Solicitud recibida', planificando: 'Consultando y preparando el plan',
  esperando_datos: 'Necesito estos datos para continuar', esperando_confirmacion: 'Revisa el plan completo',
  ejecutando: 'Ejecutando el plan aprobado', completada: 'Completado', error: 'No se pudo completar',
  cancelada: 'Cancelado', incompleta: 'Trabajo pendiente de continuar'
}

/** Indica si el servidor sigue trabajando. @param ejecucion Snapshot actual. @returns Si requiere seguimiento. */
export function estaTrabajando (ejecucion: Ejecucion): boolean {
  return ['en_cola', 'planificando', 'ejecutando'].includes(ejecucion.estado)
}

/** Conserva la conversación en orden al refrescar una ejecución. @param historial Historial actual. @param nueva Snapshot confirmado. @returns Historial actualizado. */
export function actualizarEjecucion (historial: Ejecucion[], nueva: Ejecucion): Ejecucion[] {
  return historial.some(e => e.id === nueva.id)
    ? historial.map(e => e.id === nueva.id ? nueva : e)
    : [...historial, nueva]
}

/** Valida campos esenciales sin descartar resultados por ausencia de prosa. @param valor Respuesta remota. @returns Snapshot validado. @throws Error si el contrato no es válido. */
export function leerEjecucion (valor: unknown): Ejecucion {
  if (valor === null || typeof valor !== 'object') throw new Error('El servidor no devolvió la ejecución. Recupera su estado antes de continuar.')
  const e = valor as Ejecucion
  if (typeof e.id !== 'string' || !/^\d+$/.test(e.id) || typeof e.pregunta !== 'string' || !Object.hasOwn(ESTADOS_EJECUCION, e.estado)) {
    throw new Error('El estado recibido no es válido. Recupera la ejecución antes de continuar.')
  }
  if (e.plan && (typeof e.plan.id !== 'string' || typeof e.plan.version !== 'string' || typeof e.plan.resumen !== 'string' || !Array.isArray(e.plan.pasos) || e.plan.pasos.some(p => !p || typeof p.id !== 'string' || typeof p.descripcion !== 'string' || typeof p.estado !== 'string'))) {
    throw new Error('No se pudo leer el plan completo. Recupera la ejecución antes de confirmar.')
  }
  const listas = [e.aclaraciones, ...(e.plan?.pasos ?? []).flatMap(p => [p.detalle, p.supuestos])]
  if (listas.some(lista => lista != null && (!Array.isArray(lista) || lista.some(t => typeof t !== 'string')))) throw new Error('No se pudo leer el detalle completo del plan. Recupera su estado antes de confirmar.')
  const textos = [e.mensaje, e.progreso, e.resultado?.resumen, e.error?.mensaje]
  if (textos.some(t => t != null && typeof t !== 'string') || (e.preguntas != null && (!Array.isArray(e.preguntas) || e.preguntas.some(p => !p || typeof p.pregunta !== 'string' || (p.opciones != null && (!Array.isArray(p.opciones) || p.opciones.some(o => typeof o !== 'string'))))))) {
    throw new Error('El contenido recibido no es válido. Recupera la ejecución antes de continuar.')
  }
  return e
}
