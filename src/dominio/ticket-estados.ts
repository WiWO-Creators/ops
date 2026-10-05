/**
 * Constantes compartidas de los tickets: estados de Perfex, el parametro de URL del modal y el evento
 * de ventana que avisa un cambio.
 *
 * Vive en un modulo sin dependencias ni `'use client'` para que lo importen por igual los listados
 * (`tickets-listados.ts`), el modal (`ticket-vista.ts`) y los Server Components del portal, sin que
 * ninguno dependa del otro.
 */

/**
 * Parametro de la URL que abre el modal de un ticket.
 *
 * Vive en un modulo sin `'use client'` por lo mismo que `PARAMETRO_TAREA`: la pagina del portal es un
 * Server Component y arma enlaces con el; importado desde un modulo cliente llegaria como referencia
 * y no como texto.
 */
export const PARAMETRO_TICKET = 'ticket'

/** Estado «Cerrado» de Perfex (`tbltickets_status`, id 5). Es el que usa la regla T2. */
export const ESTADO_TICKET_CERRADO = 5

/** Estado «Abierto» de Perfex (id 1): el de un ticket que el equipo todavia no contesto. */
export const ESTADO_TICKET_ABIERTO = 1

/** Estado «En espera» de Perfex (`On Hold`, id 4): el que pide un motivo al elegirlo desde la insignia. */
export const ESTADO_TICKET_EN_ESPERA = 4

/** Estado «Respondido» de Perfex (id 3): a donde pasa un ticket abierto cuando el equipo contesta (G). */
export const ESTADO_TICKET_RESPONDIDO = 3

/** Estado «En progreso» de Perfex (id 2). */
export const ESTADO_TICKET_EN_PROGRESO = 2

/**
 * Los estados de un ticket que sigue vivo: todos los de Perfex menos Cerrado, que es lo que la bandeja
 * muestra por defecto.
 *
 * Es una lista y no «distinto de Cerrado» porque `filter[status]` solo admite `IN`. Un estado
 * personalizado que se agregue en Perfex no entra aca y queda fuera del reposo de la bandeja; sigue
 * apareciendo con «Todos» o marcandolo a mano.
 */
export const ESTADOS_TICKET_ABIERTOS: readonly number[] = [
  ESTADO_TICKET_ABIERTO,
  ESTADO_TICKET_EN_PROGRESO,
  ESTADO_TICKET_RESPONDIDO,
  ESTADO_TICKET_EN_ESPERA
]

/**
 * Evento de ventana que avisa que un ticket cambio (respuesta, estado, asignado, cierre, lectura).
 *
 * Lo emite el modal y lo escuchan las listas y bandejas para ponerse al dia sin esperar su propio
 * refresco. Lleva `{ id }` en `detail`. El nombre es parte del contrato entre frentes: no cambiarlo.
 */
export const EVENTO_TICKETS_CAMBIADOS = 'ops:tickets-cambiados'

/**
 * Avisa a la ventana que un ticket cambio. Ver {@link EVENTO_TICKETS_CAMBIADOS}.
 *
 * @param id el ticket
 * @param ventana la ventana; por defecto la global, si existe
 */
export function avisarCambioDeTicket (id: number, ventana: Pick<Window, 'dispatchEvent'> | null = typeof window === 'undefined' ? null : window): void {
  ventana?.dispatchEvent(new CustomEvent(EVENTO_TICKETS_CAMBIADOS, { detail: { id } }))
}

