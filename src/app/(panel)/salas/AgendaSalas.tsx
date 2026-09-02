'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { ChevronLeft, ChevronRight, Mail, Users } from 'lucide-react'
import { Avatar } from '@/componentes/presentadores/Avatar'
import { Boton } from '@/componentes/formularios/Boton'
import { Entrada } from '@/componentes/formularios/Entrada'
import { Insignia } from '@/componentes/presentadores/Insignia'
import { CerrarDialogo, ContenidoDialogo, Dialogo } from '@/componentes/superposiciones/Dialogo'
import { escribirEnBff } from '@/componentes/datos/mutaciones'
import { DialogoReserva, type BorradorReserva } from './DialogoReserva'
import { DialogoSalas } from './DialogoSalas'
import {
  bloqueDeReserva, DURACION_POR_DEFECTO_MINUTOS, formatearMinutos, franjas, horaLocal,
  HORA_CIERRE, minutosLocales, sumarDias
} from '@/dominio/salas'
import { cn } from '@/lib/clases'
import type { PersonaDeSala, Reserva, Sala } from '@/datos/recursos'

/** Alto de una franja de media hora, en pixeles. Fija el alto total de la grilla. */
const ALTO_FRANJA = 40

interface PropsAgenda {
  dia: string
  salas: Sala[]
  reservas: Reserva[]
  /** Personas del equipo que se pueden anotar en una reserva. */
  personas: PersonaDeSala[]
  /** Staff que mira, para decidir qué reservas puede tocar. */
  yoId: number
  esAdmin: boolean
}

/**
 * Agenda del dia: una columna por sala, una franja de media hora por fila.
 *
 * Es una grilla y no una tabla de reservas por una razon de uso: lo que la gente necesita ver de un
 * vistazo es **el hueco**, no la lista de lo que ya esta tomado. Un listado obliga a construir el
 * hueco mentalmente, que es exactamente lo que hoy falla con los calendarios sueltos.
 *
 * El dia viaja en la URL (`?dia=`) para que un enlace a "la agenda del jueves" sea compartible y el
 * boton atras haga lo que la persona espera.
 */
export function AgendaSalas ({ dia, salas, reservas, personas, yoId, esAdmin }: PropsAgenda) {
  const router = useRouter()
  const [borrador, setBorrador] = useState<BorradorReserva | null>(null)
  const [detalle, setDetalle] = useState<Reserva | null>(null)

  const filas = franjas()

  /** Navega a otro dia conservando el resto de la URL. */
  function irA (nuevoDia: string): void {
    router.push(`/salas?dia=${nuevoDia}`)
  }

  /** Abre el formulario en blanco sobre una franja libre. */
  function reservarEn (salaId: number, minuto: number): void {
    setBorrador({
      salaId,
      dia,
      desde: minuto,
      // No pasa del cierre: una franja de las 20:30 propondria terminar a las 21:30, fuera de la
      // grilla, y la persona veria un bloque que no puede ubicar.
      hasta: Math.min(minuto + DURACION_POR_DEFECTO_MINUTOS, HORA_CIERRE * 60),
      titulo: '',
      asistentes: '',
      notas: '',
      participantes: []
    })
  }

  return (
    <section className="flex flex-col gap-4">
      <header className="flex flex-wrap items-center gap-3">
        <h1 className="text-texto text-xl font-semibold">Salas</h1>

        <div className="ml-auto flex items-center gap-2">
          <Boton variante="sutil" tamano="chico" soloIcono aria-label="Día anterior" onClick={() => irA(sumarDias(dia, -1))}>
            <ChevronLeft size={16} aria-hidden="true" />
          </Boton>

          <Entrada
            type="date"
            aria-label="Día de la agenda"
            className="w-40"
            value={dia}
            onChange={(evento) => { if (evento.target.value !== '') irA(evento.target.value) }}
          />

          <Boton variante="sutil" tamano="chico" soloIcono aria-label="Día siguiente" onClick={() => irA(sumarDias(dia, 1))}>
            <ChevronRight size={16} aria-hidden="true" />
          </Boton>

          {esAdmin && <DialogoSalas salas={salas} onCambio={() => router.refresh()} />}
        </div>
      </header>

      {salas.length === 0
        ? (
          <p className="border-linea text-texto-tenue rounded-tarjeta border border-dashed p-8 text-center text-sm">
            No hay salas cargadas todavía.
          </p>
          )
        : (
          <div className="border-linea bg-superficie-elevada rounded-tarjeta overflow-x-auto border">
            <div
              className="grid min-w-max"
              style={{ gridTemplateColumns: `4rem repeat(${salas.length}, minmax(11rem, 1fr))` }}
            >
              {/* Esquina vacia sobre la columna de horas. */}
              <div className="border-linea bg-superficie-elevada sticky top-0 z-10 border-b" />

              {salas.map((sala) => (
                <div key={sala.id} className="border-linea bg-superficie-elevada sticky top-0 z-10 border-b border-l p-3">
                  <p className="text-texto text-sm font-semibold">{sala.name}</p>
                  <p className="text-texto-tenue mt-1 flex items-center gap-1.5 text-xs">
                    <Users size={12} aria-hidden="true" />
                    {sala.capacity} personas
                    {sala.location !== null && <span className="text-texto-sutil">· {sala.location}</span>}
                  </p>
                </div>
              ))}

              {/* Columna de horas. */}
              <div>
                {filas.map((minuto) => (
                  <div
                    key={minuto}
                    className="text-texto-sutil border-linea flex items-start justify-end border-b pr-2 pt-0.5 text-[0.6875rem]"
                    style={{ height: ALTO_FRANJA }}
                  >
                    {minuto % 60 === 0 ? formatearMinutos(minuto) : ''}
                  </div>
                ))}
              </div>

              {salas.map((sala) => {
                const suyas = reservas.filter((reserva) => reserva.room_id === sala.id)

                return (
                  <div key={sala.id} className="border-linea relative border-l">
                    {/* Fondo: una franja clicable por media hora. Es lo que convierte "hay un hueco"
                        en "reservo ese hueco" sin tener que tipear la hora. */}
                    {filas.map((minuto) => (
                      <button
                        key={minuto}
                        type="button"
                        className="border-linea hover:bg-hover block w-full border-b transition-colors duration-150"
                        style={{ height: ALTO_FRANJA }}
                        aria-label={`Reservar ${sala.name} a las ${formatearMinutos(minuto)}`}
                        onClick={() => reservarEn(sala.id, minuto)}
                      />
                    ))}

                    {suyas.map((reserva) => (
                      <BloqueReserva
                        key={reserva.id}
                        reserva={reserva}
                        dia={dia}
                        propia={reserva.staff_id === yoId}
                        onAbrir={() => setDetalle(reserva)}
                      />
                    ))}
                  </div>
                )
              })}
            </div>
          </div>
          )}

      {/* La `key` hace que abrir otra franja monte un formulario nuevo en vez de reciclar el
          anterior: sin ella, el estado tipeado sobreviviria al cambio de horario. */}
      {borrador !== null && (
        <DialogoReserva
          key={`${borrador.id ?? 'nueva'}-${borrador.salaId}-${borrador.desde}`}
          borrador={borrador}
          salas={salas}
          reservas={reservas}
          personas={personas}
          onCerrar={() => setBorrador(null)}
          onGuardado={() => {
            setBorrador(null)
            router.refresh()
          }}
        />
      )}

      <DetalleReserva
        reserva={detalle}
        puedeTocar={detalle !== null && (esAdmin || detalle.staff_id === yoId)}
        onCerrar={() => setDetalle(null)}
        onEditar={(reserva) => {
          setDetalle(null)
          setBorrador(borradorDe(reserva, dia))
        }}
        onCancelado={() => {
          setDetalle(null)
          router.refresh()
        }}
      />
    </section>
  )
}

/**
 * Convierte una reserva ya guardada en el borrador que espera el formulario.
 *
 * @param reserva la reserva a editar
 * @param dia dia de la agenda, que es el que muestra el formulario
 */
function borradorDe (reserva: Reserva, dia: string): BorradorReserva {
  return {
    id: reserva.id,
    salaId: reserva.room_id,
    dia,
    desde: minutosLocales(reserva.start) ?? 0,
    hasta: minutosLocales(reserva.end) ?? 0,
    titulo: reserva.title,
    asistentes: reserva.attendees === null ? '' : String(reserva.attendees),
    notas: reserva.notes ?? '',
    participantes: reserva.participants.map((persona) => persona.id)
  }
}

interface PropsBloque {
  reserva: Reserva
  dia: string
  propia: boolean
  onAbrir: () => void
}

/** Una reserva dibujada sobre la columna de su sala. */
function BloqueReserva ({ reserva, dia, propia, onAbrir }: PropsBloque) {
  const caja = bloqueDeReserva(reserva.start, reserva.end, dia)

  if (caja === null) return null

  return (
    <button
      type="button"
      onClick={onAbrir}
      style={{ top: `${caja.arriba}%`, height: `${caja.alto}%` }}
      className={cn(
        'rounded-chico absolute inset-x-1 z-[1] overflow-hidden px-2 py-1 text-left',
        'transition-[filter] duration-150 hover:brightness-95',
        // El verde de marca se reserva para la pantalla de puerta, donde "libre" u "ocupada" es TODO
        // el mensaje. En una grilla con veinte bloques grita y tapa la lectura del hueco, que es lo
        // que la gente viene a buscar. Aca la distincion propia/ajena alcanza con el acento.
        propia
          ? 'bg-acento text-acento-contenido'
          : 'bg-relleno-neutro text-relleno-neutro-contenido'
      )}
    >
      <span className="block truncate text-xs font-semibold">{reserva.title}</span>
      <span className="block truncate text-[0.6875rem] opacity-90">
        {caja.recortado && '· '}
        {horaLocal(reserva.start)}–{horaLocal(reserva.end)}
        {reserva.staff !== null && ` · ${reserva.staff.full_name}`}
      </span>
    </button>
  )
}

interface PropsDetalle {
  reserva: Reserva | null
  puedeTocar: boolean
  onCerrar: () => void
  onEditar: (reserva: Reserva) => void
  onCancelado: () => void
}

/**
 * Ficha de una reserva: quien la hizo, como contactarlo y que hacer con ella.
 *
 * El correo de quien reservo esta a un clic a proposito: el pedido original era poder preguntarle si
 * va a usar la sala antes de darla por perdida.
 */
function DetalleReserva ({ reserva, puedeTocar, onCerrar, onEditar, onCancelado }: PropsDetalle) {
  const [cancelando, setCancelando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (reserva === null) return null

  async function cancelar (): Promise<void> {
    if (reserva === null) return

    setCancelando(true)
    setError(null)

    const resultado = await escribirEnBff(`rooms/bookings/${reserva.id}`, 'DELETE')

    setCancelando(false)

    if (!resultado.ok) {
      setError(resultado.mensaje)
      return
    }

    onCancelado()
  }

  return (
    <Dialogo open onOpenChange={(abierto) => { if (!abierto) onCerrar() }}>
      <ContenidoDialogo titulo={reserva.title} descripcion={`${reserva.room_name} · ${horaLocal(reserva.start)} a ${horaLocal(reserva.end)}`}>
        <div className="flex flex-col gap-4">
          {reserva.staff !== null && (
            <div className="flex items-center gap-3">
              <Avatar nombre={reserva.staff.full_name} imagen={reserva.staff.profile_image_url} />
              <div className="min-w-0">
                <p className="text-texto truncate text-sm font-medium">{reserva.staff.full_name}</p>
                <a
                  href={`mailto:${reserva.staff.email}`}
                  className="text-texto-tenue hover:text-acento flex items-center gap-1.5 truncate text-xs"
                >
                  <Mail size={12} aria-hidden="true" />
                  {reserva.staff.email}
                </a>
              </div>
            </div>
          )}

          {reserva.attendees !== null && (
            <p className="flex items-center gap-2 text-sm">
              <Insignia tono={reserva.attendees > reserva.room_capacity ? 'aviso' : 'neutro'} tamano="chico">
                {reserva.attendees} de {reserva.room_capacity}
              </Insignia>
              <span className="text-texto-tenue text-xs">personas anotadas</span>
            </p>
          )}

          {reserva.participants.length > 0 && (
            <div>
              <p className="text-texto-tenue mb-2 text-xs font-medium">Van</p>
              <ul className="flex flex-wrap gap-1.5">
                {reserva.participants.map((persona) => (
                  <li
                    key={persona.id}
                    className="bg-relleno-neutro text-relleno-neutro-contenido rounded-control flex items-center gap-1.5 py-0.5 pl-0.5 pr-2 text-xs"
                  >
                    <Avatar nombre={persona.full_name} imagen={persona.profile_image_url} tamano="chico" />
                    <span className="max-w-40 truncate">{persona.full_name}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {reserva.notes !== null && (
            <p className="text-texto-tenue whitespace-pre-line text-sm">{reserva.notes}</p>
          )}

          {error !== null && <p role="alert" className="text-texto-peligro text-sm">{error}</p>}

          <div className="flex justify-end gap-2">
            <CerrarDialogo asChild>
              <Boton variante="sutil">Cerrar</Boton>
            </CerrarDialogo>

            {puedeTocar && (
              <>
                <Boton variante="secundario" onClick={() => onEditar(reserva)}>Editar</Boton>
                <Boton variante="peligro" cargando={cancelando} onClick={() => { void cancelar() }}>
                  Cancelar reserva
                </Boton>
              </>
            )}
          </div>
        </div>
      </ContenidoDialogo>
    </Dialogo>
  )
}
