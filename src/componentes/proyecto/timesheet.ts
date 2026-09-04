import type { RegistroTiempo } from '@/datos/recursos'

/**
 * Logica del Registro de horas que no necesita React.
 *
 * Vive en un `.ts` y no dentro del `.tsx` por la misma razon que `componentes/datos/tabla.ts`: Node
 * despoja los tipos de un `.ts` pero no el JSX, asi que solo lo que esta fuera del componente se
 * puede probar. Y esto merece prueba: una duracion mal parseada son horas que alguien factura.
 *
 * **El frontend no calcula las duraciones de los registros cerrados.** `duration_hm` y
 * `duration_decimal` llegan hechos del backend y se muestran tal cual. Lo unico que se calcula aca es
 * el conteo en vivo de un registro que esta corriendo, porque ese valor envejece en pantalla.
 */

const MS_POR_SEGUNDO = 1000
const SEGUNDOS_POR_HORA = 3600
const SEGUNDOS_POR_MINUTO = 60

/** Texto que se le muestra a la persona cuando la duracion no se entiende. */
export const AYUDA_DURACION = 'Formato H:M — «2:30» son 2 h 30 min, «:15» son 15 min, «2» son 2 h.'

/**
 * Convierte la duracion escrita a mano en segundos.
 *
 * Acepta las tres formas que acepta el panel viejo: `H:M`, `H` a secas (horas enteras) y `:M` (solo
 * minutos). Los minutos no se acotan a 59 a proposito: `0:90` es hora y media, igual que en el panel.
 *
 * @param texto lo que se escribio en el campo
 * @returns los segundos, o `null` si el texto no es una duracion valida
 */
export function parsearDuracion (texto: string): number | null {
  const limpio = texto.trim()

  if (limpio === '') return null
  if (!/^\d*:?\d*$/.test(limpio) || limpio === ':') return null

  const [horas, minutos] = limpio.includes(':')
    ? limpio.split(':')
    : [limpio, '0']

  const h = horas === '' ? 0 : Number(horas)
  const m = minutos === undefined || minutos === '' ? 0 : Number(minutos)

  if (!Number.isInteger(h) || !Number.isInteger(m)) return null

  const segundos = h * SEGUNDOS_POR_HORA + m * SEGUNDOS_POR_MINUTO

  return segundos > 0 ? segundos : null
}

/**
 * Segundos que lleva un registro.
 *
 * Cerrado: manda `duration_seconds`, que es lo que el backend calculo. Corriendo: se cuenta contra
 * `ahora`, porque el backend lo calculo cuando respondio y en pantalla ya envejecio.
 *
 * @param registro una fila del Registro de horas
 * @param ahora momento de referencia; entra por parametro para que el conteo se pueda probar
 * @returns segundos, nunca negativo y nunca `NaN`
 */
export function segundosEnVivo (registro: RegistroTiempo, ahora: Date = new Date()): number {
  if (!registro.corriendo) return Math.max(0, registro.duration_seconds)

  const inicio = new Date(registro.start_time).getTime()

  if (Number.isNaN(inicio)) return Math.max(0, registro.duration_seconds)

  return Math.max(0, Math.floor((ahora.getTime() - inicio) / MS_POR_SEGUNDO))
}

/**
 * Formatea segundos como la columna "Hora (h)": `HH:MM`, **sin dias**.
 *
 * Treinta horas se muestran `30:00`, no `06:00` de un dia y seis horas: es la regla del panel viejo
 * (`Format::secondsToTime`), y cambiarla mueve numeros que la gente ya reconoce.
 *
 * @param segundos duracion
 * @returns el texto, con dos digitos como minimo en cada parte
 */
export function formatearHm (segundos: number): string {
  const total = Number.isFinite(segundos) && segundos > 0 ? Math.floor(segundos) : 0
  const horas = Math.floor(total / SEGUNDOS_POR_HORA)
  const minutos = Math.floor((total % SEGUNDOS_POR_HORA) / SEGUNDOS_POR_MINUTO)

  return `${String(horas).padStart(2, '0')}:${String(minutos).padStart(2, '0')}`
}

/**
 * Formatea segundos como la columna "Hora (decimal)": horas con dos decimales.
 *
 * @param segundos duracion
 * @returns las horas redondeadas a dos decimales (`Format::sec2qty`)
 */
export function formatearDecimal (segundos: number): number {
  const total = Number.isFinite(segundos) && segundos > 0 ? segundos : 0

  return Math.round((total / SEGUNDOS_POR_HORA) * 100) / 100
}

/** Lo que la tabla muestra en las dos columnas de duracion de un registro. */
export interface DuracionMostrada {
  hm: string
  decimal: number
}

/**
 * Las dos duraciones de una fila.
 *
 * Un registro cerrado devuelve lo que mando el backend, textual: dos maneras de calcular lo mismo
 * terminan discrepando en el ultimo minuto. Uno corriendo se cuenta contra `ahora`.
 *
 * @param registro la fila
 * @param ahora momento de referencia para los que corren
 */
export function duracionMostrada (registro: RegistroTiempo, ahora: Date = new Date()): DuracionMostrada {
  if (!registro.corriendo) return { hm: registro.duration_hm, decimal: registro.duration_decimal }

  const segundos = segundosEnVivo(registro, ahora)

  return { hm: formatearHm(segundos), decimal: formatearDecimal(segundos) }
}

/** `true` si alguna fila esta corriendo, o sea si vale la pena mantener un intervalo vivo. */
export function hayRegistroCorriendo (registros: RegistroTiempo[]): boolean {
  return registros.some((registro) => registro.corriendo)
}

/** Lo que el formulario junta antes de mandarlo. Todo cadena: sale de campos de texto. */
export interface EntradaTimesheet {
  modo: 'fechas' | 'duracion'
  taskId: string
  staffId: string
  inicio: string
  fin: string
  duracion: string
  nota: string
  etiquetas: string
}

/** Cuerpo que viaja a `POST /projects/{id}/timesheets`. */
export interface CuerpoTimesheet {
  task_id: number
  staff_id?: number
  note?: string
  tags?: string[]
  start_time?: string
  end_time?: string
  duration?: string
}

export type Validacion =
  | { ok: true, cuerpo: CuerpoTimesheet }
  | { ok: false, campo: keyof EntradaTimesheet, mensaje: string }

/**
 * Valida el formulario y arma el cuerpo de la peticion.
 *
 * Los dos modos son excluyentes en el contrato: mandar `duration` junto con `start_time` es un 422.
 * Por eso el cuerpo se arma segun el modo visible y nunca con los dos.
 *
 * No decide permisos ni recalcula duraciones: solo traduce lo que se escribio.
 *
 * @param entrada lo que hay en los campos
 * @returns el cuerpo listo, o el campo que hay que corregir con su mensaje
 */
export function validarTimesheet (entrada: EntradaTimesheet): Validacion {
  const taskId = Number(entrada.taskId)

  if (!Number.isInteger(taskId) || taskId <= 0) {
    return { ok: false, campo: 'taskId', mensaje: 'Elige la tarea.' }
  }

  const cuerpo: CuerpoTimesheet = { task_id: taskId }

  const staffId = Number(entrada.staffId)
  if (Number.isInteger(staffId) && staffId > 0) cuerpo.staff_id = staffId

  if (entrada.nota.trim() !== '') cuerpo.note = entrada.nota.trim()

  const etiquetas = entrada.etiquetas.split(',').map((t) => t.trim()).filter((t) => t !== '')
  if (etiquetas.length > 0) cuerpo.tags = etiquetas

  if (entrada.modo === 'duracion') {
    if (parsearDuracion(entrada.duracion) === null) {
      return { ok: false, campo: 'duracion', mensaje: AYUDA_DURACION }
    }

    cuerpo.duration = entrada.duracion.trim()

    return { ok: true, cuerpo }
  }

  const inicio = new Date(entrada.inicio).getTime()
  const fin = new Date(entrada.fin).getTime()

  if (entrada.inicio === '' || Number.isNaN(inicio)) {
    return { ok: false, campo: 'inicio', mensaje: 'Indica cuándo empezó.' }
  }

  if (entrada.fin === '' || Number.isNaN(fin)) {
    return { ok: false, campo: 'fin', mensaje: 'Indica cuándo terminó.' }
  }

  if (fin < inicio) {
    return { ok: false, campo: 'fin', mensaje: 'La hora de finalización es anterior a la de inicio.' }
  }

  cuerpo.start_time = new Date(inicio).toISOString()
  cuerpo.end_time = new Date(fin).toISOString()

  return { ok: true, cuerpo }
}

/**
 * Atajos de duracion del registro rapido, en minutos.
 *
 * Son los tres tramos que la gente anota al final del dia. No salen de configuracion porque no son
 * una regla de negocio: son el punto de partida de un control que despues se ajusta con `PASO_MINUTOS`.
 */
export const ATAJOS_MINUTOS = [30, 60, 120]

/** Cuanto suma o resta cada toque de `+` o `−` en el registro rapido. */
export const PASO_MINUTOS = 15

/**
 * Tope del registro rapido, en minutos.
 *
 * Doce horas. Sin tope, mantener `+` apretado registra jornadas imposibles, y esto son horas que
 * alguien factura. Para algo mas largo esta el formulario completo, que acepta fechas.
 */
export const MINUTOS_MAXIMOS = 12 * 60

/**
 * Mueve la duracion del registro rapido sin salirse de los limites.
 *
 * @param minutos duracion actual
 * @param delta cuanto sumar (negativo para restar)
 * @returns la duracion nueva, entre cero y `MINUTOS_MAXIMOS`
 */
export function ajustarMinutos (minutos: number, delta: number): number {
  if (!Number.isFinite(minutos)) return 0

  return Math.min(MINUTOS_MAXIMOS, Math.max(0, Math.round(minutos + delta)))
}

/**
 * Formatea minutos como la duracion `H:MM` que acepta el contrato en `duration`.
 *
 * Las horas no se acotan: son las mismas reglas que `parsearDuracion` lee de vuelta.
 *
 * @param minutos duracion; un valor negativo o no finito da `0:00`
 * @returns el texto listo para mandar y para mostrar
 */
export function duracionDesdeMinutos (minutos: number): string {
  const total = Number.isFinite(minutos) && minutos > 0 ? Math.floor(minutos) : 0

  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
}
