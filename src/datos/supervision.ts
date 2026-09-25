/**
 * Las formas y las rutas de la Supervisión diaria.
 *
 * Un supervisor —de escalón `lead` hacia arriba— tiene clientes asociados, y cada día le toca una
 * hoja: las Tareas de esos clientes que vencen ese día o ya vencieron. La revisa Tarea por Tarea
 * (OK / No OK, con una nota opcional) y la firma; firmada, queda cerrada.
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
  /** Días entre el vencimiento y la fecha de la hoja; 0 si vence ese mismo día. */
  dias_atraso: number
  proyecto: { id: number, name: string } | null
  asignados: AsignadoDeLaHoja[]
  revision: RevisionDeTarea | null
}

/** Las Tareas de un cliente dentro de la hoja. */
export interface ClienteDeLaHoja {
  client_id: number
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
  revisadas: number
  ok: number
  no_ok: number
}

/** `GET /supervision/hoja`. */
export interface HojaDeSupervision {
  fecha: string
  /** Solo el propio supervisor y mientras la hoja no esté firmada. */
  puede_editar: boolean
  supervisor: { staffid: number, nombre: string, escalon: Escalon }
  firma: FirmaDeHoja | null
  totales: TotalesDeHoja
  clientes: ClienteDeLaHoja[]
}

/** Una fila de `GET /supervision/supervisores`. */
export interface SupervisorVisible {
  staffid: number
  nombre: string
  escalon: Escalon
  /** Cuántos clientes tiene asociados. */
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

/** `GET|PUT /clients/{id}/supervisores`. */
export function rutaDeSupervisoresDeCliente (clienteId: number): string {
  return `clients/${encodeURIComponent(String(clienteId))}/supervisores`
}

/** `GET|PUT /staff/{id}/supervision`. */
export function rutaDeSupervisionDePersona (personaId: number): string {
  return `staff/${encodeURIComponent(String(personaId))}/supervision`
}
