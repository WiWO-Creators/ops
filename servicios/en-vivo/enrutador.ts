import type { EventoDeBoard, MensajeDelServidor } from '../../src/dominio/en-vivo.ts'

/**
 * Enrutado de eventos del board a salas del bus. Puro: no toca sockets.
 *
 * Qué ve cada audiencia:
 *  - staff, equipo y espacio reciben el `{tipo, id, espacio_id}` del evento;
 *  - la sala de un cliente recibe el cambio SIN id ni espacio: el portal solo se entera de que algo
 *    cambió y vuelve a pedir a la API lo que ese contacto puede ver;
 *  - la sala de pantallas recibe un cambio genérico `pantalla` sin id, y a lo sumo cada 5 s.
 */

/** Espera mínima entre dos avisos a la sala de pantallas. */
export const ESTRANGULACION_DE_PANTALLAS_MS = 5000

type MensajeDeCambio = Extract<MensajeDelServidor, { t: 'cambio' }>

export interface Destino {
  sala: string
  mensaje: MensajeDeCambio
  /** Si viene, la sala no recibe más de un aviso por este intervalo (milisegundos). */
  estrangularMs?: number
}

/**
 * Las salas que deben enterarse de un evento y qué decirles a cada una.
 *
 * @param evento el evento del board, ya validado
 * @returns un destino por sala, sin repetir salas
 */
export function salasDe (evento: EventoDeBoard): Destino[] {
  const { tipo, id, espacio_id: espacioId, audiencia } = evento
  const completo: MensajeDeCambio = { t: 'cambio', tipo, id, espacio_id: espacioId }
  const destinos = new Map<string, Destino>()

  for (const staff of audiencia.staff) destinos.set(`staff:${staff}`, { sala: `staff:${staff}`, mensaje: completo })
  if (audiencia.equipo) destinos.set('equipo', { sala: 'equipo', mensaje: completo })
  if (audiencia.espacio && espacioId !== null) {
    destinos.set(`espacio:${espacioId}`, { sala: `espacio:${espacioId}`, mensaje: completo })
  }
  if (audiencia.cliente !== null) {
    destinos.set(`cliente:${audiencia.cliente}`, {
      sala: `cliente:${audiencia.cliente}`,
      mensaje: { t: 'cambio', tipo, id: null, espacio_id: null }
    })
  }
  if (audiencia.pantallas) {
    destinos.set('pantallas', {
      sala: 'pantallas',
      mensaje: { t: 'cambio', tipo: 'pantalla', id: null, espacio_id: null },
      estrangularMs: ESTRANGULACION_DE_PANTALLAS_MS
    })
  }

  return [...destinos.values()]
}
