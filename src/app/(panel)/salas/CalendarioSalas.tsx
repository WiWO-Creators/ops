'use client'

import { ChevronLeft, ChevronRight, Users } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { Boton } from '@/componentes/formularios/Boton'
import { Entrada } from '@/componentes/formularios/Entrada'
import { cn } from '@/lib/clases'
import { diaLocal, diasDeCalendarioMes, reservaTocaDia, sumarMeses } from '@/dominio/salas'
import type { Reserva, Sala } from '@/datos/recursos'

const DIAS_SEMANA = ['L', 'M', 'X', 'J', 'V', 'S', 'D']

interface PropsCalendarioSalas {
  /** Cualquier día del mes que se muestra. */
  dia: string
  salas: Sala[]
  reservas: Reserva[]
}

/**
 * Calendario mensual de ocupación, con una miniagenda por sala.
 *
 * La vista muestra disponibilidad de meses completos; elegir un día lleva a la agenda horaria,
 * que conserva la reserva y edición en el lugar donde esas acciones ya están resueltas.
 */
export function CalendarioSalas ({ dia, salas, reservas }: PropsCalendarioSalas) {
  const router = useRouter()
  const dias = diasDeCalendarioMes(dia)
  const mes = dia.slice(0, 7)
  const tituloMes = new Intl.DateTimeFormat('es-AR', { month: 'long', year: 'numeric', timeZone: 'UTC' })
    .format(new Date(`${mes}-01T12:00:00Z`))
  const hoy = diaLocal(new Date().toISOString())

  function irAlMes (nuevoDia: string): void {
    router.push(`/salas?dia=${nuevoDia}&vista=calendario`)
  }

  if (salas.length === 0) {
    return (
      <p className="border-linea text-texto-tenue rounded-tarjeta border border-dashed p-8 text-center text-sm">
        No hay salas cargadas todavía.
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-wrap items-center gap-2">
        <Boton variante="sutil" tamano="chico" soloIcono aria-label="Mes anterior" onClick={() => irAlMes(sumarMeses(dia, -1))}>
          <ChevronLeft size={16} aria-hidden="true" />
        </Boton>
        <p className="text-texto min-w-40 text-center text-sm font-semibold capitalize">{tituloMes}</p>
        <Boton variante="sutil" tamano="chico" soloIcono aria-label="Mes siguiente" onClick={() => irAlMes(sumarMeses(dia, 1))}>
          <ChevronRight size={16} aria-hidden="true" />
        </Boton>
        <Entrada
          type="month"
          aria-label="Mes del calendario"
          className="ml-auto w-36"
          value={mes}
          onChange={(evento) => { if (evento.target.value !== '') irAlMes(`${evento.target.value}-01`) }}
        />
      </header>

      <p className="text-texto-tenue text-xs">Cada tono indica reservas en el día. Elige una fecha para abrir su agenda.</p>

      <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
        {salas.map((sala) => {
          const reservasDeSala = reservas.filter((reserva) => reserva.room_id === sala.id)

          return (
            <section key={sala.id} className="border-linea bg-superficie-elevada rounded-tarjeta overflow-hidden border">
              <header className="border-linea flex items-center justify-between border-b px-3 py-2.5">
                <div>
                  <h2 className="text-texto text-sm font-semibold">{sala.name}</h2>
                  <p className="text-texto-tenue mt-1 flex items-center gap-1.5 text-xs">
                    <Users size={12} aria-hidden="true" />
                    {sala.capacity} personas
                  </p>
                </div>
                <span className="text-texto-sutil text-xs">{reservasDeSala.length} reservas</span>
              </header>

              <div className="grid grid-cols-7 gap-px p-2">
                {DIAS_SEMANA.map((nombre) => (
                  <span key={nombre} className="text-texto-sutil py-1 text-center text-[0.6875rem] font-medium" aria-hidden="true">
                    {nombre}
                  </span>
                ))}

                {dias.map(({ dia: fecha, perteneceAlMes }) => {
                  const reservasDelDia = perteneceAlMes
                    ? reservasDeSala.filter((reserva) => reservaTocaDia(reserva, fecha))
                    : []
                  const cantidad = reservasDelDia.length
                  const esHoy = fecha === hoy
                  const etiqueta = `${sala.name}, ${fecha}: ${cantidad === 0 ? 'sin reservas' : `${cantidad} reserva${cantidad === 1 ? '' : 's'}`}`

                  if (!perteneceAlMes) {
                    return <span key={fecha} aria-hidden="true" className="h-10 rounded-chico" />
                  }

                  return (
                    <button
                      key={fecha}
                      type="button"
                      aria-label={etiqueta}
                      title={etiqueta}
                      onClick={() => router.push(`/salas?dia=${fecha}`)}
                      className={cn(
                        'rounded-chico relative h-10 text-left transition-[background-color,color,transform] duration-150 active:scale-[0.98]',
                        'focus-visible:shadow-[0_0_0_3px_var(--foco-halo)]',
                        cantidad === 0 && 'bg-superficie-hundida text-texto-tenue hover:bg-hover',
                        cantidad === 1 && 'bg-acento/10 text-acento hover:bg-acento/20',
                        cantidad === 2 && 'bg-acento/20 text-acento hover:bg-acento/30',
                        cantidad >= 3 && 'bg-acento text-acento-contenido hover:bg-acento-fuerte',
                        esHoy && 'ring-acento ring-1 ring-inset'
                      )}
                    >
                      <span className="absolute left-1.5 top-1 text-[0.6875rem] font-semibold">{Number(fecha.slice(-2))}</span>
                      {cantidad > 0 && (
                        <span className="absolute bottom-1 right-1.5 text-[0.625rem] font-semibold">
                          {cantidad > 3 ? '3+' : cantidad}
                        </span>
                      )}
                    </button>
                  )
                })}
              </div>
            </section>
          )
        })}
      </div>
    </div>
  )
}
