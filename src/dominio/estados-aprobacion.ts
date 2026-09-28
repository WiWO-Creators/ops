import type { TonoInsignia } from '@/componentes/presentadores/Insignia'

/**
 * Como se lee cada estado de una ronda de aprobacion del cliente.
 *
 * Un solo mapa para el bloque de SLA (`BloqueSla`) y para su historial de rondas
 * (`HistorialDeAprobaciones`): son la misma escala de estados sobre el mismo dato
 * (`AprobacionProceso.estado` / `RondaDeAprobacion.estado`), y dos copias que solo coincidian por
 * casualidad tarde o temprano dicen cosas distintas de un mismo estado. "Aprobada" es el unico verde
 * de las dos pantallas, y se lo gana.
 */
export const ESTADO_DE_APROBACION: Record<string, { etiqueta: string, tono: TonoInsignia }> = {
  pendiente: { etiqueta: 'Pendiente', tono: 'acento' },
  aprobada: { etiqueta: 'Aprobada', tono: 'exito' },
  rechazada: { etiqueta: 'Rechazada', tono: 'peligro' }
}
