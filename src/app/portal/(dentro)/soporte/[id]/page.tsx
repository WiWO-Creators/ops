import { redirect } from 'next/navigation'
import { idDeParametro } from '@/componentes/datos/tabla'
import { PARAMETRO_TICKET } from '@/dominio/ticket-vista'

/**
 * Enlace profundo a un ticket del portal: `/portal/soporte/{id}`.
 *
 * El hilo ya no es una pagina propia sino el modal de la bandeja (el mismo que ve el equipo), pero
 * esta direccion la llevan los correos que ya se mandaron y el contrato T3 la fija como el enlace al
 * cliente. Asi que sigue existiendo y redirige a la bandeja con el modal abierto. Quien no puede ver
 * el ticket lo descubre ahi, con el «No encontramos este ticket» del modal.
 *
 * Un id que no es un entero positivo lleva a la bandeja sin modal: no hay ticket que abrir.
 */
export default async function TicketPagina (props: PageProps<'/portal/soporte/[id]'>) {
  const { id } = await props.params
  const ticketId = idDeParametro(id)

  redirect(ticketId === null ? '/portal/soporte' : `/portal/soporte?${PARAMETRO_TICKET}=${ticketId}`)
}
