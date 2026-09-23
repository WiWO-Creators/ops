'use client'

import Link from 'next/link'
import { Lock, MessageCircleQuestion } from 'lucide-react'
import { useCallback, useEffect, useState, type ReactElement, type ReactNode } from 'react'
import { Boton } from '@/componentes/formularios/Boton'
import { AreaTexto } from '@/componentes/formularios/Entrada'
import { ContenidoSelector, DisparadorSelector, Opcion, Selector } from '@/componentes/formularios/Selector'
import { Avatar } from '@/componentes/presentadores/Avatar'
import { Fecha } from '@/componentes/presentadores/Fecha'
import { Insignia } from '@/componentes/presentadores/Insignia'
import { BarraProgreso } from '@/componentes/proyecto/CabeceraProyecto'
import { Cargando, ErrorEstado, Vacio } from '@/componentes/estado/Estados'
import { escribirEnBff } from '@/componentes/datos/mutaciones'
import { listaDe } from '@/datos/catalogos'
import { mensajeDeRespuesta, pedirRespuesta } from '@/datos/cliente'
import type { EstadoLookup, Lookups, Referencia, RespuestaTicket, TicketDetalle } from '@/datos/recursos'
import type { TicketPortalDetalle } from '@/datos/portal'
import type { Capacidad } from '@/datos/tipos'
import { GLOSARIO } from '@/dominio/glosario'
import {
  avisoSinRespuesta,
  cuerpoDeRespuesta,
  rutaDeTicket,
  vistaDelTicket,
  type FuenteDeTicket,
  type MensajeDeTicket,
  type TicketVista
} from '@/dominio/ticket-vista'
import { cn } from '@/lib/clases'
import { MenuCatalogoTicket } from './MenuCatalogoTicket'

/**
 * El detalle de un ticket: cabecera con estado y prioridad, datos, hilo y caja de respuesta.
 *
 * Es el mismo dibujo para el equipo y para el cliente. Lo que cambia entra por dos props y ninguna
 * rama: `fuente` (de donde bajan los datos) y `capacidades` (que se puede escribir). Con
 * `capacidades={[]}` estado y prioridad son insignias y la respuesta no ofrece cambio de estado.
 *
 * Responder no cuelga de las capacidades sino de la regla que manda la API en la propia ficha
 * (`respuesta.permitida`, contrato T2): el cliente escribe en el hilo aunque no edite nada mas, y la
 * decision de cuando puede hacerlo es del backend, no de esta pantalla.
 */

/** Centinela de «no cambiar el estado al responder». Radix no admite un `value` vacio. */
const SIN_CAMBIO = 'sin-cambio'

type Carga =
  | { fase: 'cargando' }
  | { fase: 'noEncontrado' }
  | { fase: 'error', mensaje: string }
  | { fase: 'listo', ticket: TicketVista, estados: EstadoLookup[], prioridades: EstadoLookup[] }

export function DetalleTicket ({
  ticketId,
  fuente,
  capacidades,
  proyectos = [],
  onCambiado
}: {
  ticketId: number
  fuente: FuenteDeTicket
  capacidades: Capacidad[]
  /**
   * Nombres de los Proyectos que quien mira ya tiene a mano, para no mostrar un numero pelado.
   * La ficha del ticket solo trae `project_id`; un Proyecto que no este aca se nombra por su id.
   */
  proyectos?: Referencia[]
  /** Se llama despues de cualquier escritura, para que el listado de atras se ponga al dia. */
  onCambiado?: () => void
}): ReactElement {
  const [carga, setCarga] = useState<Carga>({ fase: 'cargando' })
  const [intento, setIntento] = useState(0)

  useEffect(() => {
    const control = new AbortController()

    void cargarTicket(fuente, ticketId, control.signal).then((resultado) => {
      if (!control.signal.aborted) setCarga(resultado)
    })

    return () => { control.abort() }
  }, [fuente, ticketId, intento])

  /**
   * Vuelve a pedir la ficha sin pasar por «cargando».
   *
   * Tras responder o tras un 409 el hilo tiene que ponerse al dia, pero borrar la pantalla para
   * pintarla igual un instante despues es un parpadeo que se lee como error. Si la recarga falla, se
   * queda lo que habia: la escritura ya informo lo suyo.
   */
  const refrescar = useCallback(async (): Promise<void> => {
    const resultado = await cargarTicket(fuente, ticketId, new AbortController().signal)

    if (resultado.fase === 'listo') setCarga(resultado)
  }, [fuente, ticketId])

  /** Reintento visible, desde el estado de error. */
  function reintentar (): void {
    setCarga({ fase: 'cargando' })
    setIntento((n) => n + 1)
  }

  /** Despues de escribir: ficha al dia y aviso hacia afuera. */
  const alEscribir = useCallback(() => {
    void refrescar()
    onCambiado?.()
  }, [refrescar, onCambiado])

  if (carga.fase === 'cargando') return <Cargando alto="min-h-60" mensaje="Cargando el ticket…" />

  if (carga.fase === 'noEncontrado') {
    return (
      <Vacio
        titulo="No encontramos este ticket"
        descripcion="Puede que ya no esté disponible o que el enlace apunte a otro."
      />
    )
  }

  if (carga.fase === 'error') return <ErrorEstado detalle={carga.mensaje} onReintentar={reintentar} />

  const { ticket, estados, prioridades } = carga
  const puedeEditar = capacidades.includes('edit')
  const rutaEditar = rutaDeTicket(fuente.editar, ticket.id)

  return (
    <div className="flex flex-col gap-5">
      <header className="border-linea bg-superficie-acentuada rounded-tarjeta flex flex-col gap-3 border p-4">
        <div className="flex flex-col gap-1">
          <span className="text-texto-sutil text-xs font-medium tabular-nums">#{ticket.id}</span>
          <h3 className="font-titular text-texto text-lg leading-snug font-semibold text-balance">
            {ticket.asunto}
          </h3>
        </div>

        <div className="flex flex-wrap items-start gap-1.5">
          <MenuCatalogoTicket
            rotulo="Estado"
            campo="status"
            valor={ticket.estado}
            catalogo={estados}
            rutaEditar={rutaEditar}
            puedeEditar={puedeEditar}
            onCambiado={alEscribir}
          />
          <MenuCatalogoTicket
            rotulo="Prioridad"
            campo="priority"
            valor={ticket.prioridad}
            catalogo={prioridades}
            rutaEditar={rutaEditar}
            puedeEditar={puedeEditar}
            onCambiado={alEscribir}
          />
        </div>

        <DatosDelTicket ticket={ticket} fuente={fuente} proyectos={proyectos} />
      </header>

      <Hilo mensajes={ticket.hilo} />

      <CajaDeRespuesta
        key={ticket.id}
        ticket={ticket}
        rutaResponder={rutaDeTicket(fuente.responder, ticket.id)}
        estados={puedeEditar ? estados : []}
        onRespondido={alEscribir}
        onRechazado={() => { void refrescar() }}
      />
    </div>
  )
}

/** Proyecto, Tarea vinculada, quien lo abrio y las dos fechas. Lo que falta no se dibuja. */
function DatosDelTicket ({
  ticket,
  fuente,
  proyectos
}: {
  ticket: TicketVista
  fuente: FuenteDeTicket
  proyectos: Referencia[]
}): ReactElement {
  const proyectoId = ticket.proyectoId
  const nombreProyecto = proyectoId === null
    ? null
    : (proyectos.find((p) => p.id === proyectoId)?.name ?? `${GLOSARIO.espacio.singular} #${proyectoId}`)

  return (
    <dl className="border-linea-suave grid gap-x-6 gap-y-3 border-t pt-3 sm:grid-cols-2">
      <Dato etiqueta={GLOSARIO.espacio.singular}>
        {proyectoId === null || nombreProyecto === null
          ? <span className="text-texto-sutil">Sin {GLOSARIO.espacio.singular.toLowerCase()}</span>
          : <Enlace href={rutaDeTicket(fuente.paginaProyecto, proyectoId)}>{nombreProyecto}</Enlace>}
      </Dato>

      <Dato etiqueta={`${GLOSARIO.proceso.singular} vinculada`}>
        <TareaVinculada ticket={ticket} fuente={fuente} />
      </Dato>

      {ticket.solicitante !== null && <Dato etiqueta="Solicitante">{ticket.solicitante}</Dato>}

      <Dato etiqueta="Abierto"><Fecha valor={ticket.abierto} conHora /></Dato>

      <Dato etiqueta="Última respuesta"><Fecha valor={ticket.ultimaRespuesta} conHora /></Dato>
    </dl>
  )
}

/**
 * La Tarea que atiende el ticket.
 *
 * Una tarea interna llega al cliente **sin nombre**: se pinta el avance y nada mas. Inventarle un
 * titulo seria filtrar el tablero interno con palabras nuestras.
 */
function TareaVinculada ({ ticket, fuente }: { ticket: TicketVista, fuente: FuenteDeTicket }): ReactElement {
  const { tarea, proyectoId } = ticket

  if (tarea === null) {
    return <span className="text-texto-sutil">Sin {GLOSARIO.proceso.singular.toLowerCase()} todavía</span>
  }

  const nombre = tarea.nombre ?? 'En curso'
  const titulo = tarea.id !== null && proyectoId !== null
    ? <Enlace href={rutaDeTicket(fuente.paginaTarea, tarea.id, proyectoId)}>{nombre}</Enlace>
    : <span>{nombre}</span>

  return (
    <span className="flex flex-col gap-1.5">
      {titulo}
      {tarea.progreso !== null && (
        <span className="flex items-center gap-2">
          <BarraProgreso porcentaje={tarea.progreso} className="min-w-0 flex-1" />
          <span className="text-texto-tenue text-xs tabular-nums">{Math.round(tarea.progreso)}%</span>
        </span>
      )}
    </span>
  )
}

/**
 * La conversacion, del mensaje que abrio el ticket a la ultima respuesta.
 *
 * El lado se marca con relleno y una insignia, no con la alineacion: en un modal ancho, alternar
 * izquierda y derecha deja la mitad del texto lejos del ojo. El mensaje del equipo lleva el tono de
 * acento suave porque es el que casi siempre se busca al volver a un ticket.
 */
function Hilo ({ mensajes }: { mensajes: MensajeDeTicket[] }): ReactElement {
  return (
    <section className="flex flex-col gap-3" aria-label="Conversación">
      <h4 className="text-texto-tenue text-sm font-semibold">Conversación</h4>

      <ol className="flex flex-col gap-3">
        {mensajes.map((mensaje) => (
          <li
            key={mensaje.clave}
            className={cn(
              'rounded-tarjeta flex gap-3 border p-3',
              mensaje.lado === 'equipo'
                ? 'border-linea bg-superficie-elevada shadow-1'
                : 'border-linea-suave bg-transparent'
            )}
          >
            <Avatar nombre={mensaje.autor} imagen={null} />

            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <span className="flex flex-wrap items-center gap-2">
                <span className="text-texto text-sm font-medium">{mensaje.autor}</span>
                <Insignia tamano="chico" tono={mensaje.lado === 'equipo' ? 'acento' : 'neutro'}>
                  {mensaje.lado === 'equipo' ? 'Equipo' : 'Cliente'}
                </Insignia>
                <Fecha valor={mensaje.fecha} conHora className="text-texto-sutil text-xs" />
              </span>

              {mensaje.texto.trim() === ''
                ? <p className="text-texto-sutil text-sm">Sin texto.</p>
                : <p className="text-texto text-sm break-words whitespace-pre-line text-pretty">{mensaje.texto}</p>}
            </div>
          </li>
        ))}
      </ol>
    </section>
  )
}

/**
 * La caja para sumar una respuesta, o el aviso de por que no se puede.
 *
 * Sin estado optimista: el mensaje aparece en el hilo cuando la API lo confirmo. Si la API lo
 * rechaza —por ejemplo el 409 de T2, porque el ticket se cerro mientras se escribia— lo escrito
 * queda intacto, el error se lee aca y la ficha se vuelve a pedir: si la regla cambio, la caja se
 * vuelve el aviso que corresponde.
 */
function CajaDeRespuesta ({
  ticket,
  rutaResponder,
  estados,
  onRespondido,
  onRechazado
}: {
  ticket: TicketVista
  rutaResponder: string
  /** Estados que se ofrecen para cambiar al responder. Vacio = no se ofrece. */
  estados: EstadoLookup[]
  onRespondido: () => void
  onRechazado: () => void
}): ReactElement {
  const [mensaje, setMensaje] = useState('')
  const [estado, setEstado] = useState(SIN_CAMBIO)
  const [enviando, setEnviando] = useState(false)
  const [fallo, setFallo] = useState<string | null>(null)

  /** Manda la respuesta. Nunca lanza: el error del contrato se lee debajo de la caja. */
  async function responder (): Promise<void> {
    const cuerpo = cuerpoDeRespuesta(mensaje, estado === SIN_CAMBIO ? null : Number(estado))

    if (cuerpo === null) return

    setEnviando(true)
    setFallo(null)

    const resultado = await escribirEnBff<unknown>(rutaResponder, 'POST', cuerpo)

    setEnviando(false)

    if (!resultado.ok) {
      setFallo(resultado.mensaje)
      onRechazado()

      return
    }

    setMensaje('')
    setEstado(SIN_CAMBIO)
    onRespondido()
  }

  if (!ticket.respuesta.permitida) {
    const cerrado = ticket.respuesta.motivo === 'cerrado'
    const Icono = cerrado ? Lock : MessageCircleQuestion

    return (
      <section className="flex flex-col gap-2">
        <div
          role="status"
          className="border-linea-suave bg-superficie-hundida rounded-tarjeta text-texto-tenue flex items-start gap-3 border p-4 text-sm"
        >
          <Icono size={16} strokeWidth={1.75} aria-hidden="true" className="mt-0.5 shrink-0" />
          <p className="text-pretty">{avisoSinRespuesta(ticket.respuesta.motivo)}</p>
        </div>
        {fallo !== null && <p role="alert" className="text-texto-peligro text-sm">{fallo}</p>}
      </section>
    )
  }

  return (
    <form
      className="flex flex-col gap-3"
      aria-label="Responder"
      onSubmit={(evento) => {
        evento.preventDefault()
        void responder()
      }}
    >
      <label htmlFor={`respuesta-${ticket.id}`} className="text-texto-tenue text-sm font-semibold">
        Tu respuesta
      </label>
      <AreaTexto
        id={`respuesta-${ticket.id}`}
        rows={4}
        value={mensaje}
        placeholder="Escribe tu respuesta."
        onChange={(evento) => { setMensaje(evento.target.value) }}
      />

      {fallo !== null && <p role="alert" className="text-texto-peligro text-sm">{fallo}</p>}

      <div className="flex flex-wrap items-center justify-end gap-2">
        {estados.length > 0 && (
          <Selector value={estado} onValueChange={setEstado}>
            <DisparadorSelector aria-label="Estado al responder" className="w-auto min-w-48" />
            <ContenidoSelector>
              <Opcion value={SIN_CAMBIO}>Sin cambiar el estado</Opcion>
              {estados.map((opcion) => (
                <Opcion key={opcion.id} value={String(opcion.id)}>Dejar en {opcion.name}</Opcion>
              ))}
            </ContenidoSelector>
          </Selector>
        )}
        <Boton type="submit" variante="primario" cargando={enviando} disabled={mensaje.trim() === ''}>
          Responder
        </Boton>
      </div>
    </form>
  )
}

/** Un par etiqueta/valor, como el `Dato` de la ficha de una Tarea. */
function Dato ({ etiqueta, children }: { etiqueta: string, children: ReactNode }): ReactElement {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <dt className="text-texto-sutil text-xs font-medium tracking-[0.08em] uppercase">{etiqueta}</dt>
      <dd className="text-texto min-w-0 text-sm">{children}</dd>
    </div>
  )
}

function Enlace ({ href, children }: { href: string, children: ReactNode }): ReactElement {
  return (
    <Link href={href} className="text-texto hover:text-acento font-medium underline-offset-4 hover:underline">
      {children}
    </Link>
  )
}

/**
 * Trae la ficha, el hilo (si el sujeto lo pide aparte) y los catalogos.
 *
 * Nunca lanza: el error del contrato es un valor mas y el modal tiene que poder mostrarlo.
 *
 * @param fuente de donde baja el ticket
 * @param ticketId el ticket
 * @param senal aborta las peticiones si el modal se cierra
 * @returns la carga resuelta
 */
async function cargarTicket (fuente: FuenteDeTicket, ticketId: number, senal: AbortSignal): Promise<Carga> {
  try {
    const [ficha, lookups, hilo] = await Promise.all([
      pedirRespuesta(rutaDeTicket(fuente.ticket, ticketId), senal),
      pedirRespuesta(fuente.lookups, senal),
      fuente.respuestas === null ? Promise.resolve(null) : pedirRespuesta(rutaDeTicket(fuente.respuestas, ticketId), senal)
    ])

    if (ficha.status === 404) return { fase: 'noEncontrado' }

    for (const respuesta of [ficha, lookups, hilo]) {
      if (respuesta !== null && !respuesta.ok) return { fase: 'error', mensaje: await mensajeDeRespuesta(respuesta) }
    }

    const { data } = await ficha.json() as { data: TicketDetalle | TicketPortalDetalle }
    const catalogos = (await lookups.json() as { data: Lookups }).data
    const respuestas = hilo === null ? [] : (await hilo.json() as { data: RespuestaTicket[] }).data

    return {
      fase: 'listo',
      ticket: vistaDelTicket(fuente, data, respuestas),
      estados: listaDe(catalogos, 'ticket_statuses'),
      prioridades: listaDe(catalogos, 'ticket_priorities')
    }
  } catch (fallo) {
    if (senal.aborted) return { fase: 'cargando' }

    return { fase: 'error', mensaje: fallo instanceof Error ? fallo.message : 'No se pudo cargar el ticket.' }
  }
}
