import { notFound } from 'next/navigation'
import { llamarApiTipado } from '@/datos/api'
import { ErrorApi } from '@/datos/errores'
import { horaLocal } from '@/dominio/salas'
import { Refrescador } from './Refrescador'
import type { PanelDeSala } from '@/datos/recursos'

/** Cada cuanto se repinta la pantalla de puerta. */
const SEGUNDOS_DE_REFRESCO = 60

export const metadata = { title: 'Sala · WiWO Ops' }

/**
 * Pantalla colgada en la puerta de una sala.
 *
 * Es la unica ruta del proyecto **sin sesion**: una tablet en la pared no se loguea, y pedirle que
 * lo haga significa que a la semana esta mostrando la pantalla de acceso. La autoriza el
 * `panel_token` de la sala, que solo da acceso a la agenda de esa sala y se puede rotar desde
 * Salas > Administrar salas si se filtra.
 *
 * Por eso NO usa `pedir()`, que exige sesion y redirige a `/colab`: llama a la API directamente,
 * desde el servidor, sin token de persona.
 *
 * Se lee de lejos y de un vistazo: el estado —libre u ocupada— tiene que resolverse desde el pasillo,
 * antes de abrir la puerta. Esa es toda la funcion de esta pantalla.
 */
export default async function PantallaDeSala (props: PageProps<'/sala/[token]'>) {
  const { token } = await props.params

  let panel: PanelDeSala

  try {
    const sobre = await llamarApiTipado<PanelDeSala>(`/rooms/panel/${encodeURIComponent(token)}`)
    panel = sobre.data
  } catch (error) {
    // Un token que no existe es un 404 del contrato; cualquier otra cosa es un problema real y
    // tiene que seguir viéndose como error del servidor, no disfrazarse de sala inexistente.
    if (error instanceof ErrorApi && error.estado === 404) notFound()

    throw error
  }

  const ocupada = panel.current !== null

  return (
    <main
      className={
        'flex min-h-dvh flex-col justify-between p-[4vmin] transition-colors duration-500 '
        + (ocupada
          ? 'bg-relleno-peligro text-relleno-peligro-contenido'
          : 'bg-relleno-exito text-relleno-exito-contenido')
      }
    >
      <Refrescador segundos={SEGUNDOS_DE_REFRESCO} />

      <header className="flex items-baseline justify-between gap-4">
        <h1 className="font-titular text-[6vmin] leading-none font-extrabold">{panel.room.name}</h1>
        <p className="text-[3vmin] opacity-80">
          {panel.room.capacity} personas
          {panel.room.location !== null && ` · ${panel.room.location}`}
        </p>
      </header>

      <section className="py-[4vmin]">
        <p className="text-[10vmin] leading-none font-extrabold tracking-tight">
          {ocupada ? 'Ocupada' : 'Libre'}
        </p>

        {panel.current !== null && (
          <div className="mt-[3vmin] text-[4vmin] leading-tight">
            <p className="font-semibold">{panel.current.title}</p>
            <p className="opacity-90">
              {horaLocal(panel.current.start)} a {horaLocal(panel.current.end)}
              {panel.current.staff !== null && ` · ${panel.current.staff.full_name}`}
            </p>
          </div>
        )}
      </section>

      <footer className="text-[2.6vmin]">
        {panel.upcoming.length === 0
          ? <p className="opacity-80">No hay nada más agendado hoy.</p>
          : (
            <>
              <p className="mb-[1vmin] font-semibold opacity-80">Después</p>
              <ul className="flex flex-col gap-[0.8vmin]">
                {panel.upcoming.map((reserva) => (
                  <li key={reserva.id} className="flex gap-[2vmin]">
                    <span className="font-semibold tabular-nums">
                      {horaLocal(reserva.start)}–{horaLocal(reserva.end)}
                    </span>
                    <span className="truncate opacity-90">
                      {reserva.title}
                      {reserva.staff !== null && ` · ${reserva.staff.full_name}`}
                    </span>
                  </li>
                ))}
              </ul>
            </>
            )}
      </footer>
    </main>
  )
}
