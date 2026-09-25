/**
 * Las copias que deja una recurrencia: si alguien las uso, si la regla esta sin uso y como se
 * limpian.
 *
 * Todo puro y sin React, para el runner de Node. Lo que NO vive aca: decidir si una copia se toco o
 * si su ciclo termino. Eso lo calcula la API (`touched`, `evaluable`, `usage`) con la actividad real
 * de cada Tarea; el navegador solo lo cuenta en palabras.
 */

/** Por que una copia cuenta como usada. El orden es el de la API. */
export type MotivoMovimiento = 'estado' | 'comentario' | 'tiempo' | 'archivo' | 'checklist' | 'edicion'

/** Como se nombra cada motivo en pantalla. */
export const MOTIVOS_MOVIMIENTO: Record<MotivoMovimiento, string> = {
  estado: 'Cambió de estado',
  comentario: 'Comentarios',
  tiempo: 'Tiempo registrado',
  archivo: 'Archivos',
  checklist: 'Checklist',
  edicion: 'Editada'
}

/** El `usage` de una regla de `GET /tasks/recurrentes`. */
export interface UsoDeRegla {
  /** Copias evaluables seguidas sin movimiento, desde la mas reciente. */
  streak: number
  /** Copias evaluables sin movimiento que siguen vivas. */
  untouched_count: number
  /** La racha llego al umbral de la API. */
  unused: boolean
  /** Cuando se aviso a los administradores, o null. */
  alerted_at: string | null
}

/** Una fila de `GET /tasks/recurrentes/{id}/copias`. */
export interface CopiaDeRegla {
  id: number
  name: string
  start_date: string | null
  due_date: string | null
  status: number
  created_at: string
  /** En la papelera. */
  deleted: boolean
  /** Su ciclo termino: ya nacio una mas nueva o vencio. Solo entonces se juzga si se uso. */
  evaluable: boolean
  touched: boolean
  touched_reasons: string[]
}

/** Lo que contesta `limpiar` con `modo: validar`. */
export interface ValidacionDeLimpieza {
  candidatas: Array<{ id: number, name: string, start_date: string | null, status: number, vigente?: boolean }>
  conservadas: Array<{ id: number, name: string, touched_reasons: string[] }>
}

/** Lo que contesta `limpiar` con `modo: aplicar`. */
export interface ResultadoDeLimpieza {
  eliminadas: number[]
  omitidas: Array<{ id: number, motivo: string }>
  detenida: Detencion | null
}

/** Que hacer con la regla ademas de limpiar. */
export type Detencion = 'pausar' | 'dejar_de_repetir'

/** Las opciones del selector "Además", en orden. El valor vacio es "no hacer nada". */
export const OPCIONES_DETENCION: ReadonlyArray<{ valor: '' | Detencion, etiqueta: string }> = [
  { valor: '', etiqueta: 'No hacer nada' },
  { valor: 'pausar', etiqueta: 'Pausar la recurrencia' },
  { valor: 'dejar_de_repetir', etiqueta: 'Dejar de repetir' }
]

/**
 * Los motivos de una copia, en palabras y en el orden en que llegaron.
 *
 * Un codigo que este frontend no conoce se muestra con los guiones bajos cambiados por espacios: la
 * API puede sumar uno antes que la pantalla, y esconderlo diria que la copia no se uso.
 *
 * @param motivos los `touched_reasons`
 * @returns las etiquetas
 */
export function textosDeMotivos (motivos: readonly string[]): string[] {
  return motivos.map((motivo) => MOTIVOS_MOVIMIENTO[motivo as MotivoMovimiento] ?? motivo.replace(/_/g, ' '))
}

/** Como se ve una copia en el historial. El tono es un nombre de token, no un color. */
export interface SituacionDeCopia {
  etiqueta: string
  tono: 'neutro' | 'exito' | 'aviso' | 'contorno'
}

/**
 * La situacion de una copia: en papelera, en curso, con movimiento o sin movimiento.
 *
 * "En curso" va antes que el movimiento: una copia cuyo ciclo no termino todavia no se juzga, y
 * decir "Sin movimiento" de la de esta semana es acusar a alguien que todavia esta a tiempo.
 */
export function situacionDeCopia (copia: Pick<CopiaDeRegla, 'deleted' | 'evaluable' | 'touched'>): SituacionDeCopia {
  if (copia.deleted) return { etiqueta: 'En papelera', tono: 'contorno' }
  if (!copia.evaluable) return { etiqueta: 'En curso', tono: 'neutro' }

  return copia.touched ? { etiqueta: 'Con movimiento', tono: 'exito' } : { etiqueta: 'Sin movimiento', tono: 'aviso' }
}

/**
 * True si la regla esta sin uso. Tolera el `usage` ausente: una API anterior al campo no lo manda,
 * y eso no es "sin uso".
 */
export function estaSinUso (regla: { usage?: UsoDeRegla | null }): boolean {
  return regla.usage?.unused === true
}

/**
 * El aviso de la fila de una regla sin uso: "4 copias seguidas sin movimiento", y si ya se aviso.
 *
 * @param uso el `usage` de la regla
 * @param formatear como se escribe la fecha del aviso
 * @returns el texto principal y el del aviso a administradores, o null si la regla se usa
 */
export function avisoDeSinUso (uso: UsoDeRegla | null | undefined, formatear: (fecha: string) => string): { texto: string, avisado: string | null } | null {
  if (uso == null || !uso.unused) return null

  return {
    texto: `${uso.streak} ${uso.streak === 1 ? 'copia' : 'copias seguidas'} sin movimiento`,
    avisado: uso.alerted_at === null ? null : `Ya se avisó a los administradores el ${formatear(uso.alerted_at)}.`
  }
}

/**
 * Las candidatas que arrancan marcadas: todas menos la vigente, que todavia esta a tiempo de usarse.
 *
 * @param candidatas las de `validar`
 * @returns los ids marcados
 */
export function seleccionInicial (candidatas: ValidacionDeLimpieza['candidatas']): number[] {
  return candidatas.filter((candidata) => candidata.vigente !== true).map((candidata) => candidata.id)
}

/**
 * El cuerpo de `limpiar` para aplicar.
 *
 * @param ids los marcados
 * @param detener lo elegido en "Además"; `''` es no hacer nada
 */
export function cuerpoDeLimpieza (ids: readonly number[], detener: '' | Detencion): { modo: 'aplicar', ids: number[], detener: Detencion | null } {
  return { modo: 'aplicar', ids: [...new Set(ids)], detener: detener === '' ? null : detener }
}

/** "Se moverá 1 tarea a la papelera" / "Se moverán 3 tareas a la papelera". */
export function textoDeConfirmacion (cantidad: number): string {
  return cantidad === 1 ? 'Se moverá 1 tarea a la papelera' : `Se moverán ${cantidad} tareas a la papelera`
}

/** Por que no se borro una copia marcada. */
const MOTIVOS_DE_OMISION: Record<string, string> = {
  tocada: 'Alguien la modificó mientras tanto.'
}

/** El motivo de una omitida, en palabras. */
export function textoDeOmision (motivo: string): string {
  return MOTIVOS_DE_OMISION[motivo] ?? `No se movió (${motivo.replace(/_/g, ' ')}).`
}

/** El parametro de la URL que abre una regla: el enlace de la campana es `?regla={id}`. */
export const PARAMETRO_REGLA = 'regla'

/**
 * La regla que pide la URL, o null.
 *
 * @param valor lo que trae `?regla=`
 * @returns un id positivo, o null si no hay o no es un entero
 */
export function reglaDeLaUrl (valor: string | null): number | null {
  if (valor === null || !/^\d+$/.test(valor)) return null

  const id = Number(valor)

  return Number.isSafeInteger(id) && id > 0 ? id : null
}

/** Ruta del BFF del historial de una regla. */
export function rutaDeCopias (reglaId: number): string {
  return `tasks/recurrentes/${reglaId}/copias`
}

/** Ruta del BFF de la limpieza de una regla. */
export function rutaDeLimpieza (reglaId: number): string {
  return `tasks/recurrentes/${reglaId}/limpiar`
}
