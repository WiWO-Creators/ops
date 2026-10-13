import type { FaseConversacion } from './fase-orbe.ts'
import { leerCita, type Cita } from './ia.ts'

export const MAXIMO_PREGUNTA_AGENTE = 12000

/** Segundos sin avances tras los cuales una ejecución en trabajo «parece detenida», si el servidor no dice otro umbral. */
export const UMBRAL_DETENIDA_SEGUNDOS = 180

/** Intervalo máximo del seguimiento cuando la ejecución trabaja sin cambios. */
export const INTERVALO_SEGUIMIENTO_MAXIMO_MS = 5000

/** Cuánto crece el intervalo del seguimiento por cada consulta sin cambios. */
const FACTOR_BACKOFF_SEGUIMIENTO = 1.5

/** Reintentos del seguimiento ante un fallo antes de mostrar el error. */
export const REINTENTOS_SEGUIMIENTO = 3

/** Espera base del primer reintento tras un fallo de seguimiento. */
const ESPERA_REINTENTO_BASE_MS = 1000

/** Contratos públicos del agente durable; las escrituras se autorizan en el servidor. */
export interface ErrorHerramienta { codigo: string, mensaje: string, reintentable: boolean }
export interface ResultadoHerramienta {
  resumen: string
  /** Fuentes verificadas por el servidor. Opcional: el backend actual no las manda. */
  citas?: unknown
}

/** Qué le hace un paso a los datos: solo consulta, modifica o elimina/quita. */
export type RiesgoPaso = 'lectura' | 'escritura' | 'destructiva'
export interface Paso {
  id: string
  descripcion: string
  detalle?: string[]
  supuestos?: string[]
  estado: string
  /** Opcional: backends anteriores no lo mandan y el paso se pinta neutro. */
  riesgo?: string
  resultado?: ResultadoHerramienta
  error?: ErrorHerramienta
}

/** Una pregunta del agente. `id`, `opciones` y `admite_texto` pueden faltar en backends anteriores. */
export interface PreguntaAgente {
  id?: string | number
  pregunta: string
  opciones?: string[]
  admite_texto?: boolean
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
  preguntas?: PreguntaAgente[]
  resultado?: ResultadoHerramienta
  error?: ErrorHerramienta
  /** Última vez que el servidor avanzó la ejecución. Opcional: backends anteriores no lo mandan. */
  actualizada_en?: string
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
  const textos = [e.mensaje, e.progreso, e.resultado?.resumen, e.error?.mensaje, e.actualizada_en]
  if (textos.some(t => t != null && typeof t !== 'string') || (e.preguntas != null && (!Array.isArray(e.preguntas) || e.preguntas.some(p => !p || typeof p.pregunta !== 'string' || (p.opciones != null && (!Array.isArray(p.opciones) || p.opciones.some(o => typeof o !== 'string'))))))) {
    throw new Error('El contenido recibido no es válido. Recupera la ejecución antes de continuar.')
  }
  return e
}

/**
 * Huella del snapshot para saber si una consulta trajo algo nuevo.
 *
 * Cubre estado, progreso, versión del plan, `actualizada_en`, el largo del mensaje, cuántas preguntas hay y el estado de cada paso: si cambia
 * alguno de ellos hay algo que pintar; si ninguno, repintar solo gasta renders.
 *
 * @param ejecucion Snapshot actual.
 * @returns Cadena estable para comparar con `===`.
 */
export function firmaDeEjecucion (ejecucion: Ejecucion): string {
  const pasos = (ejecucion.plan?.pasos ?? []).map(p => `${p.id}:${p.estado}`).join(',')
  return [ejecucion.id, ejecucion.estado, ejecucion.progreso ?? '', ejecucion.plan?.version ?? '', ejecucion.actualizada_en ?? '', ejecucion.mensaje?.length ?? 0, ejecucion.preguntas?.length ?? 0, pasos].join('|')
}

/** Indica si dos snapshots son equivalentes para el seguimiento. @param a Snapshot previo, si hay. @param b Snapshot nuevo. @returns `true` si no hay nada que repintar. */
export function mismaInstantanea (a: Ejecucion | undefined, b: Ejecucion): boolean {
  return a !== undefined && firmaDeEjecucion(a) === firmaDeEjecucion(b)
}

/**
 * Intervalo del siguiente sondeo mientras la ejecución trabaja sin cambios.
 *
 * Crece por un factor fijo desde el intervalo base hasta el máximo; un intervalo base ya mayor que
 * el máximo se respeta tal cual.
 *
 * @param base Intervalo base que dicta el servidor, en ms.
 * @param sinCambios Consultas seguidas sin cambios (0 tras un cambio).
 * @returns Espera en ms.
 */
export function intervaloSeguimiento (base: number, sinCambios: number): number {
  if (base >= INTERVALO_SEGUIMIENTO_MAXIMO_MS) return base
  return Math.min(INTERVALO_SEGUIMIENTO_MAXIMO_MS, Math.round(base * FACTOR_BACKOFF_SEGUIMIENTO ** Math.max(0, sinCambios)))
}

/** Espera antes de reintentar tras un fallo de seguimiento. @param fallos Fallos seguidos, desde 1. @returns Espera en ms, exponencial y acotada al máximo del seguimiento. */
export function esperaReintentoSeguimiento (fallos: number): number {
  return Math.min(INTERVALO_SEGUIMIENTO_MAXIMO_MS, ESPERA_REINTENTO_BASE_MS * 2 ** Math.max(0, fallos - 1))
}

/** Indica si la ejecución está lista para recibir cambios al plan escritos. @param ejecucion Última ejecución. @returns `true` si espera confirmación con plan. */
export function estaEditando (ejecucion: Ejecucion | undefined): boolean {
  return ejecucion?.estado === 'esperando_confirmacion' && ejecucion.plan != null
}

/** Indica si lo escrito responde a la ejecución abierta en vez de abrir otra. @param ejecucion Última ejecución. @returns `true` si se reanuda en vez de crear. */
export function respondeEjecucion (ejecucion: Ejecucion | undefined): boolean {
  return estaEditando(ejecucion) || ejecucion?.estado === 'esperando_datos'
}

/** Indica si la última ejecución espera una decisión de la persona. @param ejecucion Última ejecución. @returns `true` si hay que seguir, confirmar o descartar. */
export function estaPendiente (ejecucion: Ejecucion | undefined): boolean {
  return ejecucion !== undefined && (['incompleta', 'error'].includes(ejecucion.estado) || (ejecucion.estado === 'esperando_confirmacion' && !estaEditando(ejecucion)))
}

/** Lo que bloquea o libera el compositor del agente. */
export interface EntornoCompositor {
  enviando: boolean
  conError: boolean
  nuevasHabilitadas: boolean
}

/**
 * Indica si el compositor debe estar bloqueado.
 *
 * @param ejecucion Última ejecución.
 * @param entorno Operación en vuelo, error de seguimiento y si se aceptan solicitudes nuevas.
 * @returns `true` si no se puede escribir.
 */
export function estaBloqueado (ejecucion: Ejecucion | undefined, entorno: EntornoCompositor): boolean {
  return entorno.enviando || (ejecucion !== undefined && estaTrabajando(ejecucion)) || estaPendiente(ejecucion) || entorno.conError || (!entorno.nuevasHabilitadas && !respondeEjecucion(ejecucion))
}

/**
 * Explica por qué el compositor está bloqueado.
 *
 * @param ejecucion Última ejecución.
 * @param entorno Operación en vuelo, error de seguimiento y si se aceptan solicitudes nuevas.
 * @returns El motivo, o `null` si el compositor está libre.
 */
export function motivoBloqueo (ejecucion: Ejecucion | undefined, entorno: EntornoCompositor): string | null {
  if (entorno.enviando) return 'Enviando…'
  if (ejecucion !== undefined && estaTrabajando(ejecucion)) return 'Espera a que termine la ejecución en curso…'
  if (entorno.conError) return 'Pulsa Reintentar para seguir escribiendo…'
  if (estaPendiente(ejecucion)) return 'Responde o detén la ejecución pendiente para preguntar…'
  if (!entorno.nuevasHabilitadas && !respondeEjecucion(ejecucion)) return 'Las nuevas solicitudes están pausadas…'
  return null
}

/** Indica si la última ejecución se descarta en vez de seguirse. @param ejecucion Última ejecución. @returns `true` si está incompleta o falló sin reintento. */
export function esDescartable (ejecucion: Ejecucion | undefined): boolean {
  return ejecucion !== undefined && (ejecucion.estado === 'incompleta' || (ejecucion.estado === 'error' && !ejecucion.error?.reintentable))
}

/**
 * Fase de conversación que corresponde a la última ejecución del agente.
 *
 * @param ejecucion Última ejecución.
 * @param entorno Operación en vuelo y error de seguimiento.
 * @returns La fase a publicar.
 */
export function faseDeEjecucion (ejecucion: Ejecucion | undefined, entorno: { enviando: boolean, conError: boolean }): FaseConversacion {
  if (entorno.conError || ejecucion?.estado === 'error') return 'error'
  if (entorno.enviando || (ejecucion !== undefined && estaTrabajando(ejecucion))) return 'generando'
  if (ejecucion !== undefined && ['esperando_datos', 'esperando_confirmacion', 'incompleta'].includes(ejecucion.estado)) return 'esperando'
  return 'reposo'
}

const RIESGOS: readonly RiesgoPaso[] = ['lectura', 'escritura', 'destructiva']

/**
 * Riesgo de un paso, tolerando que falte o venga con un valor desconocido.
 *
 * @param paso Paso del plan.
 * @returns El riesgo, o `null` si el servidor no lo dijo (el paso se pinta neutro).
 */
export function riesgoDePaso (paso: Paso): RiesgoPaso | null {
  return RIESGOS.find(r => r === paso.riesgo) ?? null
}

/** Indica si algún paso elimina o quita datos. @param plan Plan a aprobar. @returns `true` si hay un paso destructivo. */
export function hayPasoDestructivo (plan: Plan): boolean {
  return plan.pasos.some(p => riesgoDePaso(p) === 'destructiva')
}

/** Una pregunta que se puede contestar con botones. */
export interface PreguntaPulsable {
  id: string
  pregunta: string
  opciones: string[]
  admiteTexto: boolean
}

/**
 * Convierte una pregunta del agente en una pulsable.
 *
 * @param pregunta Pregunta recibida.
 * @returns La pregunta normalizada, o `null` si falta el id o las opciones (se degrada a la vista de lista).
 */
export function preguntaPulsable (pregunta: PreguntaAgente): PreguntaPulsable | null {
  const { id, opciones } = pregunta
  if (typeof id !== 'string' && typeof id !== 'number') return null
  if (!Array.isArray(opciones)) return null
  const limpias = opciones.filter(o => typeof o === 'string' && o.trim() !== '')
  if (limpias.length === 0) return null
  return { id: String(id), pregunta: pregunta.pregunta, opciones: limpias, admiteTexto: pregunta.admite_texto === true }
}

/**
 * Texto de `reanudar` a partir de las respuestas dadas.
 *
 * @param respuestas Pares pregunta-respuesta, en el orden de las preguntas.
 * @returns La respuesta sola si hay una pregunta; una línea «pregunta: respuesta» por cada una si hay varias.
 */
export function respuestaDePreguntas (respuestas: Array<{ pregunta: string, respuesta: string }>): string {
  if (respuestas.length === 1) return respuestas[0]?.respuesta ?? ''
  return respuestas.map(r => `${r.pregunta}: ${r.respuesta}`).join('\n')
}

/**
 * Indica si lo escrito abriría una pregunta nueva: el compositor está libre y no hay una ejecución abierta que responder.
 *
 * Es la condición de «Reintentar» y «Editar pregunta» en cada respuesta.
 *
 * @param ejecucion Última ejecución.
 * @param entorno Operación en vuelo, error de seguimiento y si se aceptan solicitudes nuevas.
 * @returns `true` si se puede iniciar otra ejecución.
 */
export function puedeNuevaPregunta (ejecucion: Ejecucion | undefined, entorno: EntornoCompositor): boolean {
  return !estaBloqueado(ejecucion, entorno) && !respondeEjecucion(ejecucion)
}

/**
 * Las citas del resultado de una ejecución, descartando las inválidas.
 *
 * @param resultado Resultado recibido, sin fiarse de su forma.
 * @returns Citas válidas; vacío si el servidor no manda ninguna.
 */
export function citasDeResultado (resultado: ResultadoHerramienta | undefined): Cita[] {
  const crudas = resultado?.citas
  if (!Array.isArray(crudas)) return []
  return crudas.map(leerCita).filter((c): c is Cita => c !== null)
}

/**
 * El texto de una respuesta del agente para copiarlo: explicación, pasos del plan, resultado y error.
 *
 * @param ejecucion Ejecución a copiar.
 * @returns Texto plano (conserva el markdown de origen).
 */
export function textoDeEjecucion (ejecucion: Ejecucion): string {
  const partes: string[] = []
  if (ejecucion.mensaje?.trim()) partes.push(ejecucion.mensaje.trim())
  if (ejecucion.plan) {
    const { resumen, pasos } = ejecucion.plan
    if (resumen.trim() && resumen.trim() !== ejecucion.mensaje?.trim()) partes.push(resumen.trim())
    if (pasos.length > 0) partes.push(pasos.map((p, i) => `${i + 1}. ${p.descripcion}`).join('\n'))
  }
  const resumen = ejecucion.resultado?.resumen?.trim()
  if (resumen && resumen !== ejecucion.mensaje?.trim()) partes.push(resumen)
  if (ejecucion.error?.mensaje) partes.push(ejecucion.error.mensaje)
  return partes.join('\n\n')
}
