'use client'

import { useState } from 'react'
import { TriangleAlert } from 'lucide-react'
import { Boton } from '@/componentes/formularios/Boton'
import { Campo } from '@/componentes/formularios/Campo'
import { AreaTexto, Entrada } from '@/componentes/formularios/Entrada'
import {
  ContenidoSelector, DisparadorSelector, Opcion, Selector
} from '@/componentes/formularios/Selector'
import { CerrarDialogo, ContenidoDialogo, Dialogo } from '@/componentes/superposiciones/Dialogo'
import { escribirEnBff } from '@/componentes/datos/mutaciones'
import { SelectorPersonas } from './SelectorPersonas'
import {
  formatearMinutos, instanteDe, minutosDeHora, PASO_MINUTOS, revisarReserva, seSuperpone,
  sugerirAsistentes
} from '@/dominio/salas'
import type { PersonaDeSala, Reserva, Sala } from '@/datos/recursos'

export interface BorradorReserva {
  /** Reserva que se edita. Ausente en un alta. */
  id?: number
  salaId: number
  dia: string
  /** Minutos desde la medianoche local. */
  desde: number
  hasta: number
  titulo: string
  asistentes: string
  notas: string
  /** Quienes del equipo van. Los ids son de `tblstaff`. */
  participantes: number[]
}

interface PropsDialogoReserva {
  borrador: BorradorReserva
  salas: Sala[]
  /** Reservas vigentes del dia, para avisar del choque antes de mandar. */
  reservas: Reserva[]
  /** Personas del equipo que se pueden anotar. */
  personas: PersonaDeSala[]
  onCerrar: () => void
  onGuardado: () => void
}

/**
 * Alta y edicion de una reserva.
 *
 * El choque se comprueba dos veces a proposito: aca para poder avisar sin ida y vuelta, y en la API
 * bajo lock, que es la que decide de verdad. Si solo estuviera aca, dos personas reservando el mismo
 * minuto volverian a producir el sobreagendamiento que la feature viene a resolver; si solo estuviera
 * en la API, cada intento costaria un viaje al servidor para enterarse de algo que la pantalla ya
 * sabe.
 *
 * Las horas se editan como hora de pared (`<input type="time">`) y se convierten al instante UTC
 * recien al enviar. Es la unica forma de que alguien conectado desde otro huso reserve la hora que
 * eligio y no la equivalente en su reloj.
 *
 * El borrador solo se lee al montar. Quien lo abre le pone una `key` distinta por franja, asi que
 * abrir otra franja monta un formulario nuevo en vez de sincronizar estado desde un efecto — que es
 * el patron que React desaconseja y que ademas dejaba lo tipeado a merced de un render del padre.
 */
export function DialogoReserva ({ borrador, salas, reservas, personas, onCerrar, onGuardado }: PropsDialogoReserva) {
  const [campos, setCampos] = useState<BorradorReserva>(borrador)
  const [guardando, setGuardando] = useState(false)
  const [errorApi, setErrorApi] = useState<string | null>(null)

  const sala = salas.find((s) => s.id === campos.salaId) ?? salas[0]
  const capacidad = sala?.capacity ?? 0

  const revision = revisarReserva({
    titulo: campos.titulo,
    desde: campos.desde,
    hasta: campos.hasta,
    asistentes: campos.asistentes,
    capacidad
  })

  const inicio = instanteDe(campos.dia, campos.desde)
  const fin = instanteDe(campos.dia, campos.hasta)

  const ocupada = inicio !== null && fin !== null && seSuperpone(
    reservas.filter((reserva) => reserva.room_id === campos.salaId),
    inicio.toISOString(),
    fin.toISOString(),
    campos.id
  )

  const hayErrores = Object.keys(revision.errores).length > 0

  /**
   * Manda el alta o la edicion.
   *
   * En la edicion se mandan todos los campos igual que en el alta: son seis, y calcular el subconjunto
   * que cambio para ahorrar bytes es complejidad que no se paga sola.
   */
  async function guardar (): Promise<void> {
    if (hayErrores || ocupada || inicio === null || fin === null) return

    setGuardando(true)
    setErrorApi(null)

    const cuerpo = {
      room_id: campos.salaId,
      title: campos.titulo.trim(),
      start: inicio.toISOString(),
      end: fin.toISOString(),
      attendees: campos.asistentes.trim() === '' ? null : Number(campos.asistentes),
      notes: campos.notas.trim() === '' ? null : campos.notas.trim(),
      participant_ids: campos.participantes
    }

    const resultado = campos.id === undefined
      ? await escribirEnBff<Reserva>('rooms/bookings', 'POST', cuerpo)
      : await escribirEnBff<Reserva>(`rooms/bookings/${campos.id}`, 'PATCH', cuerpo)

    setGuardando(false)

    if (!resultado.ok) {
      setErrorApi(resultado.mensaje)
      return
    }

    onGuardado()
  }

  const editando = campos.id !== undefined

  return (
    <Dialogo open onOpenChange={(abierto) => { if (!abierto) onCerrar() }}>
      <ContenidoDialogo
        titulo={editando ? 'Editar reserva' : 'Reservar sala'}
        descripcion={`${campos.dia} · ${formatearMinutos(campos.desde)} a ${formatearMinutos(campos.hasta)}`}
      >
        <div className="flex flex-col gap-4">
          <Campo etiqueta="¿De qué es la reunión?" requerido error={revision.errores.titulo}>
            {(props) => (
              <Entrada
                {...props}
                value={campos.titulo}
                autoFocus
                placeholder="Revisión de campaña"
                onChange={(evento) => setCampos({ ...campos, titulo: evento.target.value })}
              />
            )}
          </Campo>

          <Campo etiqueta="Sala">
            {(props) => (
              <Selector
                value={String(campos.salaId)}
                onValueChange={(valor) => setCampos({ ...campos, salaId: Number(valor) })}
              >
                <DisparadorSelector id={props.id} />
                <ContenidoSelector>
                  {salas.map((opcion) => (
                    <Opcion key={opcion.id} value={String(opcion.id)}>
                      {`${opcion.name} · ${opcion.capacity} personas`}
                    </Opcion>
                  ))}
                </ContenidoSelector>
              </Selector>
            )}
          </Campo>

          <div className="grid grid-cols-2 gap-3">
            <Campo etiqueta="Desde">
              {(props) => (
                <Entrada
                  {...props}
                  type="time"
                  step={PASO_MINUTOS * 60}
                  value={formatearMinutos(campos.desde)}
                  onChange={(evento) => {
                    const minutos = minutosDeHora(evento.target.value)
                    if (minutos !== null) setCampos({ ...campos, desde: minutos })
                  }}
                />
              )}
            </Campo>

            <Campo etiqueta="Hasta" error={revision.errores.hasta}>
              {(props) => (
                <Entrada
                  {...props}
                  type="time"
                  step={PASO_MINUTOS * 60}
                  value={formatearMinutos(campos.hasta)}
                  onChange={(evento) => {
                    const minutos = minutosDeHora(evento.target.value)
                    if (minutos !== null) setCampos({ ...campos, hasta: minutos })
                  }}
                />
              )}
            </Campo>
          </div>

          <div className="grid gap-3 sm:grid-cols-[1fr_7rem]">
            {/* Sin texto de ayuda: el marcador del control ya dice "Agregar personas", y la ayuda
                quedaba DEBAJO de los chips —`Campo` los cuenta como contenido—, leyendose como si
                hablara de la persona de mas abajo en vez del control. */}
            <Campo etiqueta="Quiénes van">
              {(props) => (
                <SelectorPersonas
                  id={props.id}
                  personas={personas}
                  elegidas={campos.participantes}
                  onCambiar={(ids) => setCampos({
                    ...campos,
                    participantes: ids,
                    // El total se sigue solo mientras nadie lo haya tocado a mano.
                    asistentes: sugerirAsistentes(campos.asistentes, campos.participantes.length, ids.length)
                  })}
                />
              )}
            </Campo>

            <Campo
              etiqueta="Total"
              ayuda={`Entran ${capacidad}.`}
              error={revision.errores.asistentes}
            >
              {(props) => (
                <Entrada
                  {...props}
                  type="number"
                  min={1}
                  max={500}
                  value={campos.asistentes}
                  onChange={(evento) => setCampos({ ...campos, asistentes: evento.target.value })}
                />
              )}
            </Campo>
          </div>

          <Campo etiqueta="Notas">
            {(props) => (
              <AreaTexto
                {...props}
                value={campos.notas}
                placeholder="Opcional: qué hace falta en la sala, si viene alguien de afuera…"
                onChange={(evento) => setCampos({ ...campos, notas: evento.target.value })}
              />
            )}
          </Campo>

          {revision.avisos.map((aviso) => (
            <p key={aviso} className="text-texto-aviso flex items-center gap-2 text-xs">
              <TriangleAlert size={14} aria-hidden="true" />
              {aviso}
            </p>
          ))}

          {ocupada && (
            <p role="alert" className="text-texto-peligro flex items-center gap-2 text-xs">
              <TriangleAlert size={14} aria-hidden="true" />
              Ese horario ya está tomado en esta sala. Elegí otro, o cambiá de sala.
            </p>
          )}

          {errorApi !== null && (
            <p role="alert" className="text-texto-peligro text-sm">{errorApi}</p>
          )}

          <div className="flex justify-end gap-2">
            <CerrarDialogo asChild>
              <Boton variante="sutil">Cancelar</Boton>
            </CerrarDialogo>
            <Boton
              variante="primario"
              cargando={guardando}
              disabled={hayErrores || ocupada}
              onClick={() => { void guardar() }}
            >
              {editando ? 'Guardar cambios' : 'Reservar'}
            </Boton>
          </div>
        </div>
      </ContenidoDialogo>
    </Dialogo>
  )
}
