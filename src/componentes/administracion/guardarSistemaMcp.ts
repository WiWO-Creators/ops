import { escribirEnBff } from '@/componentes/datos/mutaciones'
import { leerSistemaMcp, mensajeDeErrorDeClaves } from '@/dominio/mcp-externo'
import type { SistemaMcp } from '@/datos/accesos'

/** Lo que devuelve un guardado: el sistema tal como quedó, o por qué no se pudo. */
export type ResultadoDeGuardado = { ok: true, sistema: SistemaMcp } | { ok: false, mensaje: string }

/**
 * Guarda parte de la configuración de un sistema MCP (`PUT accesos/integraciones/{id}/mcp`).
 *
 * El `PUT` es parcial: solo cambia lo que el cuerpo trae. La API contesta con el sistema completo, que
 * es lo que se devuelve para que la pantalla muestre lo guardado y no lo que se creyó guardar. Los 422
 * de claves con explicación propia (`proposito_inmutable`…) se traducen a un mensaje claro.
 *
 * @param integracionId id de la integración
 * @param cuerpo los campos a cambiar, con los nombres del contrato (`dominios`, `rpm_persona`…)
 */
export async function guardarSistemaMcp (integracionId: number, cuerpo: Record<string, unknown>): Promise<ResultadoDeGuardado> {
  const resultado = await escribirEnBff<unknown>(`accesos/integraciones/${integracionId}/mcp`, 'PUT', cuerpo)

  if (!resultado.ok) return { ok: false, mensaje: mensajeDeErrorDeClaves(resultado.detalles, resultado.codigo, resultado.mensaje) }

  const sistema = leerSistemaMcp(resultado.datos)

  return sistema === null ? { ok: false, mensaje: 'No se pudo leer lo guardado.' } : { ok: true, sistema }
}
