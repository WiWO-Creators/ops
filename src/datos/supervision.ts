/**
 * Las formas y las rutas de la Supervisión diaria.
 *
 * Un supervisor —de escalón `lead` hacia arriba— tiene gente a cargo en el árbol o clientes (los
 * asociados en la pestaña Supervisión y aquellos donde es Focal), y cada día le toca una hoja: las
 * Tareas de sus clientes y de su gente que vencen ese día, siguen atrasadas o se completaron ese día.
 * La revisa Tarea por Tarea (OK / No OK, con una nota opcional) y la firma; su jefatura la confirma
 * o se la devuelve con una nota, y devuelta vuelve a quedar abierta.
 *
 * **Nada de acá pide nada.** Son el contrato de la API y las rutas ya armadas, sin barra inicial:
 * así las pide el navegador por el BFF, y el servidor les antepone la barra. Por eso este archivo se
 * puede importar desde una prueba de `node --test` sin montar Next.
 */

import type { Escalon } from '../dominio/escalon.ts'

/** Lo que el supervisor dijo de una Tarea. */
export type EstadoDeRevision = 'ok' | 'no_ok'

/** La revisión guardada de una Tarea en una hoja. */
export interface RevisionDeTarea {
  estado: EstadoDeRevision
  nota: string | null
  staffid: number
  nombre: string
  /** Instante ISO 8601 en que se marcó. */
  marcado_en: string
}

/** Por qué una Tarea está en la hoja: por un cliente del supervisor, por su gente, o las dos. */
export type OrigenDeTarea = 'cliente' | 'equipo'

/** Lo que marcó de una Tarea, ese mismo día, un supervisor que cuelga del dueño de la hoja. */
export interface RevisionDelEquipo {
  staffid: number
  nombre: string
  estado: EstadoDeRevision
  nota: string | null
}

/** Una persona asignada a la Tarea, en la forma corta de la hoja. */
export interface AsignadoDeLaHoja {
  staffid: number
  nombre: string
}

/** Una fila de la hoja. */
export interface TareaDeLaHoja {
  id: number
  patente: string | null
  name: string
  status: number
  /** `YYYY-MM-DD`. */
  duedate: string | null
  /** Días entre el vencimiento y la fecha de la hoja; 0 si vence ese mismo día o está completada. */
  dias_atraso: number
  /** `status == 5`. */
  completada: boolean
  /** `YYYY-MM-DD HH:MM:SS` en hora de Santiago, o `null` si sigue abierta. */
  completada_en: string | null
  /**
   * Uno o los dos; vacío si la Tarea entra solo por tener revisión de ese día y ya salió del
   * universo del supervisor (le sacaron el cliente o la persona dejó de colgar de él).
   */
  origen: OrigenDeTarea[]
  proyecto: { id: number, name: string } | null
  asignados: AsignadoDeLaHoja[]
  revision: RevisionDeTarea | null
  /** Las revisiones de esa fecha de los supervisores que cuelgan del dueño; `[]` si ninguna. */
  revisiones_equipo: RevisionDelEquipo[]
}

/** Las Tareas de un cliente dentro de la hoja. */
export interface ClienteDeLaHoja {
  /** `null` en el grupo "Sin cliente", el de las Tareas que entran solo por la gente a cargo. */
  client_id: number | null
  company: string
  tareas: TareaDeLaHoja[]
}

/** El sello de una hoja firmada. */
export interface FirmaDeHoja {
  staffid: number
  nombre: string
  /** ISO 8601 con desfase. */
  firmado_en: string
}

/** Los conteos que la API calcula sobre la hoja entera. */
export interface TotalesDeHoja {
  tareas: number
  atrasadas: number
  completadas: number
  revisadas: number
  ok: number
  no_ok: number
}

/** Qué hizo la jefatura con una hoja firmada. */
export type EstadoDeConfirmacion = 'confirmada' | 'devuelta'

/** La contrafirma de la jefatura, o la devolución con su nota. */
export interface ConfirmacionDeHoja {
  estado: EstadoDeConfirmacion
  staffid: number
  nombre: string
  nota: string | null
  /** ISO 8601. */
  en: string
}

/** Lo que se le pide a la API al confirmar o devolver. */
export type AccionDeConfirmacion = 'confirmar' | 'devolver'

/** `GET /supervision/hoja`. */
export interface HojaDeSupervision {
  fecha: string
  /** Solo el propio supervisor y mientras la hoja no esté firmada. */
  puede_editar: boolean
  /** Quien mira está sobre el dueño (o es admin), no es él, y la hoja está firmada y sin confirmar. */
  puede_confirmar: boolean
  supervisor: { staffid: number, nombre: string, escalon: Escalon }
  /** `null` también después de una devolución: devolver anula la firma. */
  firma: FirmaDeHoja | null
  confirmacion: ConfirmacionDeHoja | null
  totales: TotalesDeHoja
  clientes: ClienteDeLaHoja[]
}

/** El estado de una hoja en la lista del equipo. */
export type EstadoDeHojaDelEquipo = 'sin_firmar' | 'firmada' | 'confirmada' | 'devuelta'

/** Una fila de `GET /supervision/equipo`. */
export interface HojaDelEquipo {
  staffid: number
  nombre: string
  escalon: Escalon
  jefe_staffid: number | null
  estado: EstadoDeHojaDelEquipo
  firmado_en: string | null
  confirmacion: ConfirmacionDeHoja | null
  totales: { tareas: number, revisadas: number, completadas: number }
}

/** Una fila de `GET /supervision/supervisores`. */
export interface SupervisorVisible {
  staffid: number
  nombre: string
  escalon: Escalon
  /** Cuántos clientes tiene: asociados más aquellos donde es Focal. */
  clientes: number
}

/** Una fila de `GET|PUT /clients/{id}/supervisores`. */
export interface SupervisorDeCliente {
  staffid: number
  firstname: string
  lastname: string
  escalon: Escalon
}

/** Una fila de `GET|PUT /staff/{id}/supervision`. */
export interface ClienteSupervisado {
  client_id: number
  company: string
}

/** `GET /supervision/supervisores`. */
export const RUTA_SUPERVISORES = 'supervision/supervisores'

/**
 * `GET /supervision/hoja`, con los dos parámetros opcionales.
 *
 * Sin fecha la API toma hoy en Santiago y sin persona toma a quien pregunta: se omiten en vez de
 * mandarse vacíos, porque un `fecha=` vacío es 422.
 *
 * @param fecha `YYYY-MM-DD`, o `null` para hoy
 * @param staffId el supervisor, o `null` para uno mismo
 * @returns la ruta sin barra inicial
 */
export function rutaDeHoja (fecha: string | null, staffId: number | null): string {
  const parametros = new URLSearchParams()

  if (fecha !== null) parametros.set('fecha', fecha)
  if (staffId !== null) parametros.set('staff_id', String(staffId))

  const consulta = parametros.toString()

  return consulta === '' ? 'supervision/hoja' : `supervision/hoja?${consulta}`
}

/** `PUT /supervision/hoja/{fecha}/revisiones`. */
export function rutaDeRevisiones (fecha: string): string {
  return `supervision/hoja/${encodeURIComponent(fecha)}/revisiones`
}

/** `POST /supervision/hoja/{fecha}/firma`. */
export function rutaDeFirma (fecha: string): string {
  return `supervision/hoja/${encodeURIComponent(fecha)}/firma`
}

/** `POST /supervision/hoja/{fecha}/confirmacion`. */
export function rutaDeConfirmacion (fecha: string): string {
  return `supervision/hoja/${encodeURIComponent(fecha)}/confirmacion`
}

/** `GET /supervision/equipo?fecha=`. */
export function rutaDeHojasDelEquipo (fecha: string): string {
  return `supervision/equipo?${new URLSearchParams({ fecha }).toString()}`
}

/** `GET|PUT /clients/{id}/supervisores`. */
export function rutaDeSupervisoresDeCliente (clienteId: number): string {
  return `clients/${encodeURIComponent(String(clienteId))}/supervisores`
}

/** `GET|PUT /staff/{id}/supervision`. */
export function rutaDeSupervisionDePersona (personaId: number): string {
  return `staff/${encodeURIComponent(String(personaId))}/supervision`
}
