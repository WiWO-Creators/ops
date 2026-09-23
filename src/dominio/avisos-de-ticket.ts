import type { AvisosDeTicket } from '../datos/recursos.ts'

/**
 * A quien avisa un Proyecto cuando entra un ticket nuevo (contrato T3).
 *
 * Es una decision y no un dibujo: cuando el formulario se puede guardar y que cuerpo viaja. Si se
 * equivoca, el Proyecto queda sin nadie que se entere de los tickets, y eso no se nota hasta que un
 * cliente se queja de que nadie le contesto. Por eso vive aca, con prueba.
 */

/** Tope de personas de la API. Uno mas es 422. */
export const TOPE_PERSONAS_AVISADAS = 20

/** Lo que el formulario tiene en la mano. */
export interface BorradorDeAvisos {
  avisoAlEquipo: boolean
  personas: number[]
}

/** El borrador inicial, a partir de lo que devolvio la API. */
export function borradorDeAvisos (guardado: AvisosDeTicket): BorradorDeAvisos {
  return { avisoAlEquipo: guardado.aviso_al_equipo, personas: guardado.personas.map((p) => p.id) }
}

/**
 * Por que el borrador no se puede guardar, o `null` si se puede.
 *
 * Con el aviso al equipo apagado tiene que quedar alguien: la API responde 422 si no hay ni personas
 * ni correos. Los correos no se editan aca, pero cuentan: un Proyecto que ya tenia una casilla de
 * soporte configurada puede apagar el aviso al equipo sin elegir personas.
 *
 * @param borrador lo elegido
 * @param correos los correos guardados, que viajan tal cual
 * @returns el motivo para mostrar, o `null`
 */
export function problemaDeAvisos (borrador: BorradorDeAvisos, correos: string[]): string | null {
  if (borrador.personas.length > TOPE_PERSONAS_AVISADAS) {
    return `Puedes elegir hasta ${TOPE_PERSONAS_AVISADAS} personas.`
  }

  if (!borrador.avisoAlEquipo && borrador.personas.length === 0 && correos.length === 0) {
    return 'Elige al menos una persona para avisarle.'
  }

  return null
}

/**
 * Cuerpo de `PUT /projects/{id}/ticket-notifications`.
 *
 * Con el aviso al equipo encendido las personas elegidas **viajan igual**: asi, apagar y volver a
 * encender no le borra a nadie la lista que ya habia armado. Los correos viajan como llegaron, para
 * que guardar desde esta pantalla no borre una configuracion que no muestra.
 *
 * @param borrador lo elegido
 * @param correos los correos guardados
 * @returns el cuerpo listo para mandar
 */
export function cuerpoDeAvisos (
  borrador: BorradorDeAvisos,
  correos: string[]
): { aviso_al_equipo: boolean, correos: string[], personas: number[] } {
  return {
    aviso_al_equipo: borrador.avisoAlEquipo,
    correos,
    personas: [...new Set(borrador.personas)]
  }
}

/** Si el borrador difiere de lo guardado. Con el orden de las personas no se compara. */
export function avisosCambiaron (borrador: BorradorDeAvisos, guardado: AvisosDeTicket): boolean {
  const antes = guardado.personas.map((p) => p.id).sort((a, b) => a - b)
  const ahora = [...new Set(borrador.personas)].sort((a, b) => a - b)

  return borrador.avisoAlEquipo !== guardado.aviso_al_equipo || antes.join(',') !== ahora.join(',')
}
