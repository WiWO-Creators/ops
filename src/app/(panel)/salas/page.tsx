import { pedir } from '@/datos/servidor'
import { hoyLocal } from '@/lib/fechas'
import { ventanaDelDia } from '@/dominio/salas'
import { AgendaSalas } from './AgendaSalas'
import type { PersonaDeSala, Reserva, Sala } from '@/datos/recursos'
import type { Yo } from '@/datos/tipos'

export const metadata = { title: 'Salas · WiWO Ops' }

/**
 * Agenda de salas de reunion.
 *
 * Todo se resuelve en el servidor: la grilla no tiene estado propio que valga la pena hidratar, y
 * pedir las reservas desde el navegador agregaria un parpadeo a la pantalla que la gente mira de
 * paso, entre reunion y reunion.
 *
 * La ventana que se le pide a la API es el dia entero en hora local, de medianoche a medianoche, y
 * no el horario visible de la grilla: una reunion que arranco a las 06:30 ocupa la sala a las 07:00,
 * y si no viniera en la respuesta la grilla pintaria esa franja libre.
 */
export default async function SalasPage (props: PageProps<'/salas'>) {
  const params = await props.searchParams
  const pedido = typeof params.dia === 'string' ? params.dia : ''
  const dia = /^\d{4}-\d{2}-\d{2}$/.test(pedido) ? pedido : hoyLocal()

  // `ventanaDelDia` solo devuelve null con un dia mal formado, y `dia` ya paso por el regex.
  const ventana = ventanaDelDia(dia) ?? ventanaDelDia(hoyLocal())

  const [salas, reservas, personas, yo] = await Promise.all([
    pedir<Sala[]>('/rooms'),
    pedir<Reserva[]>(`/rooms/bookings?from=${encodeURIComponent(ventana?.desde ?? '')}&to=${encodeURIComponent(ventana?.hasta ?? '')}`),
    pedir<PersonaDeSala[]>('/rooms/people'),
    pedir<Yo>('/me')
  ])

  return (
    <AgendaSalas
      dia={dia}
      salas={salas.data}
      reservas={reservas.data}
      personas={personas.data}
      yoId={yo.data.id}
      esAdmin={yo.data.is_admin}
    />
  )
}
