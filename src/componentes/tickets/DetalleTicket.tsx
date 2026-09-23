'use client'

import Link from 'next/link'
import { Paperclip } from 'lucide-react'
import { useCallback, useEffect, useRef, useState, type ReactElement, type ReactNode } from 'react'
import { Avatar } from '@/componentes/presentadores/Avatar'
import { Fecha } from '@/componentes/presentadores/Fecha'
import { Insignia } from '@/componentes/presentadores/Insignia'
import { BarraProgreso } from '@/componentes/proyecto/CabeceraProyecto'
import { Cargando, ErrorEstado, Vacio } from '@/componentes/estado/Estados'
import { escribirEnBff } from '@/componentes/datos/mutaciones'
import { observarLista } from '@/datos/refresco-lista'
import type { Referencia } from '@/datos/recursos'
import type { Capacidad } from '@/datos/tipos'
import { GLOSARIO } from '@/dominio/glosario'
import {
  avisarCambioDeTicket,
  rutaDeTicket,
  vistaTrasResponder,
  type FuenteDeTicket,
  type MensajeDeTicket,
  type TicketVista
} from '@/dominio/ticket-vista'
import { cn } from '@/lib/clases'
import { AccionesDelSolicitante } from './AccionesDelSolicitante'
import { CajaDeRespuesta } from './CajaDeRespuesta'
import { cargarTicket, type CargaDeTicket } from './carga-de-ticket'
import { MenuAsignadoTicket } from './MenuAsignadoTicket'
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
 *
 * **El hilo esta en vivo** mientras el modal esta abierto (`observarLista`: cada 30 s, al volver a
 * la pestaña y al recuperar el foco). Cada lectura lleva un numero de secuencia y solo se aplica si
 * es mas nueva que la ultima aplicada: una lectura lenta que llega tarde no puede pisar la respuesta
 * que se acaba de confirmar. La caja de respuesta tiene su propio estado, asi que el refresco no toca
 * lo que se esta escribiendo.
 *
 * Se monta con `key` por ticket (lo hace `ModalTicket`): pasar de un ticket a otro no hereda nada.
 */
export function DetalleTicket ({
  ticketId,
  fuente,
  capacidades,
  proyectos = [],
  onAsunto,
  onFusionado
}: {
  ticketId: number
  fuente: FuenteDeTicket
  capacidades: Capacidad[]
  /**
   * Nombres de los Proyectos que quien mira ya tiene a mano, para no mostrar un numero pelado.
   * La ficha del ticket solo trae `project_id`; un Proyecto que no este aca se nombra por su id.
   */
  proyectos?: Referencia[]
  /** Informa el asunto cuando llega, para el titulo accesible del modal. */
  onAsunto?: (asunto: string) => void
  /** La API devolvio el ticket principal de una fusion: quien monta cambia la URL a ese id. */
  onFusionado?: (principalId: number) => void
}): ReactElement {
  const [carga, setCarga] = useState<CargaDeTicket>({ fase: 'cargando' })
  const [intento, setIntento] = useState(0)
  const [aviso, setAviso] = useState<string | null>(null)
  const solicitadas = useRef(0)
  const aplicadas = useRef(0)
  const refresco = useRef<AbortController | null>(null)
  const marcadoLeido = useRef(false)

  /**
   * Aplica una lectura si es la mas nueva.
   *
   * Un error o un aborto no borran un ticket que ya se estaba mostrando: el hilo en vivo reintenta
   * solo, y vaciar la pantalla por un corte de red de un segundo se lee como que el ticket se perdio.
   */
  const aplicar = useCallback((numero: number, resultado: CargaDeTicket): void => {
    if (resultado.fase === 'cargando' || numero < aplicadas.current) return

    aplicadas.current = numero
    setCarga((previa) => previa.fase === 'listo' && resultado.fase === 'error' ? previa : resultado)
  }, [])

  useEffect(() => {
    const detener = observarLista(
      async (senal) => {
        const numero = ++solicitadas.current

        return { numero, resultado: await cargarTicket(fuente, ticketId, senal) }
      },
      ({ numero, resultado }) => { aplicar(numero, resultado) },
      (fallo) => {
        setCarga((previa) => previa.fase === 'listo'
          ? previa
          : { fase: 'error', mensaje: fallo instanceof Error ? fallo.message : 'No se pudo cargar el ticket.' })
      }
    )

    return () => {
      detener()
      refresco.current?.abort()
    }
  }, [fuente, ticketId, intento, aplicar])

  /**
   * Vuelve a pedir la ficha sin pasar por «cargando», cancelando la recarga anterior si seguia.
   *
   * @returns `true` si la ficha llego al dia
   */
  const refrescar = useCallback(async (): Promise<boolean> => {
    refresco.current?.abort()

    const control = new AbortController()
    const numero = ++solicitadas.current

    refresco.current = control

    const resultado = await cargarTicket(fuente, ticketId, control.signal)

    aplicar(numero, resultado)

    return resultado.fase === 'listo'
  }, [fuente, ticketId, aplicar])

  const ticket = carga.fase === 'listo' ? carga.ticket : null

  useEffect(() => {
    if (ticket !== null) onAsunto?.(ticket.asunto)
  }, [ticket, onAsunto])

  // Fusion (contrato v2, D): se pidio un hijo y llego el principal. La URL pasa al principal para que
  // recargar, compartir o volver apunten al ticket que de verdad se esta leyendo.
  useEffect(() => {
    if (ticket !== null && ticket.fusionadoDesde !== null && ticket.id !== ticketId) onFusionado?.(ticket.id)
  }, [ticket, ticketId, onFusionado])

  // Lectura (contrato v2, E): abrir un ticket con novedades del equipo lo marca leido. Una vez por
  // apertura; si falla no se reintenta ni se avisa, porque lo unico que se pierde es la marca y la
  // proxima apertura la vuelve a pedir.
  useEffect(() => {
    if (ticket === null || !ticket.noLeido || fuente.leido === null || marcadoLeido.current) return

    marcadoLeido.current = true
    void escribirEnBff<unknown>(rutaDeTicket(fuente.leido, ticket.id), 'POST').then((resultado) => {
      if (resultado.ok) avisarCambioDeTicket(ticket.id)
    })
  }, [ticket, fuente.leido])

  /** Reintento visible, desde el estado de error. */
  function reintentar (): void {
    setCarga({ fase: 'cargando' })
    setIntento((n) => n + 1)
  }

  /**
   * Despues de una escritura confirmada: la vista con lo que devolvio la API, la ficha al dia y el
   * aviso hacia afuera (evento de ventana, que escuchan listas, contadores y bandejas).
   *
   * @param datos lo que devolvio la API, si sirve para mostrar algo sin esperar la recarga
   */
  const alEscribir = useCallback((datos?: unknown): void => {
    if (datos !== undefined) {
      // Lo confirmado por la API cuenta como la lectura mas nueva: una del hilo en vivo que salio
      // antes de escribir y llega despues ya no puede borrarlo.
      aplicadas.current = ++solicitadas.current
      setCarga((previa) => previa.fase === 'listo'
        ? { ...previa, ticket: vistaTrasResponder(fuente, previa.ticket, datos) }
        : previa)
    }
    setAviso(null)

    void refrescar().then((alDia) => {
      if (!alDia) {
        setAviso('Tu cambio quedó guardado, pero no pudimos actualizar la conversación. Se pondrá al día sola en unos segundos.')
      }
    })

    avisarCambioDeTicket(ticketId)
  }, [fuente, ticketId, refrescar])

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

  const { estados, prioridades } = carga
  const vista = carga.ticket
  const puedeEditar = capacidades.includes('edit')
  const rutaEditar = rutaDeTicket(fuente.editar, vista.id)

  return (
    <div className="flex flex-col gap-5">
      <header className="border-linea bg-superficie-acentuada rounded-tarjeta flex flex-col gap-3 border p-4">
        <div className="flex flex-col gap-1">
          <span className="text-texto-sutil text-xs font-medium tabular-nums">#{vista.id}</span>
          <h3 className="font-titular text-texto text-lg leading-snug font-semibold text-balance">
            {vista.asunto}
          </h3>
        </div>

        <div className="flex flex-wrap items-start gap-1.5">
          <MenuCatalogoTicket
            rotulo="Estado"
            campo="status"
            valor={vista.estado}
            catalogo={estados}
            rutaEditar={rutaEditar}
            puedeEditar={puedeEditar}
            sinNombre={fuente.catalogoSinNombre}
            onCambiado={alEscribir}
          />
          <MenuCatalogoTicket
            rotulo="Prioridad"
            campo="priority"
            valor={vista.prioridad}
            catalogo={prioridades}
            rutaEditar={rutaEditar}
            puedeEditar={puedeEditar}
            sinNombre={fuente.catalogoSinNombre}
            onCambiado={alEscribir}
          />
        </div>

        <DatosDelTicket
          ticket={vista}
          fuente={fuente}
          proyectos={proyectos}
          rutaEditar={rutaEditar}
          puedeEditar={puedeEditar}
          onCambiado={alEscribir}
        />

        <AccionesDelSolicitante ticket={vista} fuente={fuente} onCambiado={alEscribir} onRechazado={() => { void refrescar() }} />
      </header>

      <Hilo mensajes={vista.hilo} />

      {aviso !== null && (
        <p role="status" className="border-linea-suave bg-superficie-hundida rounded-tarjeta text-texto-tenue border p-3 text-sm">
          {aviso}
        </p>
      )}

      <CajaDeRespuesta
        key={vista.id}
        ticket={vista}
        fuente={fuente}
        estados={puedeEditar ? estados : []}
        onRespondido={alEscribir}
        onRechazado={() => { void refrescar() }}
      />
    </div>
  )
}

/** Proyecto, Tarea vinculada, quien lo abrio, a quien esta asignado y las dos fechas. */
function DatosDelTicket ({
  ticket,
  fuente,
  proyectos,
  rutaEditar,
  puedeEditar,
  onCambiado
}: {
  ticket: TicketVista
  fuente: FuenteDeTicket
  proyectos: Referencia[]
  rutaEditar: string
  puedeEditar: boolean
  onCambiado: () => void
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

      {ticket.asignacion !== null && (
        <Dato etiqueta="Asignado">
          <MenuAsignadoTicket
            asignado={ticket.asignacion.asignado}
            rutaEditar={rutaEditar}
            puedeEditar={puedeEditar}
            onCambiado={onCambiado}
          />
        </Dato>
      )}

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
 *
 * `aria-live="polite"` sobre la lista: lo que llega por el hilo en vivo se anuncia sin interrumpir.
 */
function Hilo ({ mensajes }: { mensajes: MensajeDeTicket[] }): ReactElement {
  return (
    <section className="flex flex-col gap-3" aria-label="Conversación">
      <h4 className="text-texto-tenue text-sm font-semibold">Conversación</h4>

      <ol className="flex flex-col gap-3" aria-live="polite" aria-relevant="additions">
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

              {mensaje.adjuntos.length > 0 && <Adjuntos adjuntos={mensaje.adjuntos} />}
            </div>
          </li>
        ))}
      </ol>
    </section>
  )
}

/** Los adjuntos de un mensaje, para bajar. Solo lectura: subir queda fuera de esta pantalla. */
function Adjuntos ({ adjuntos }: { adjuntos: MensajeDeTicket['adjuntos'] }): ReactElement {
  return (
    <ul className="mt-1 flex flex-wrap gap-1.5" aria-label="Adjuntos">
      {adjuntos.map((adjunto) => (
        <li key={adjunto.id} className="min-w-0">
          {adjunto.ruta === null
            ? (
              <span className="border-linea-suave rounded-control text-texto-sutil inline-flex max-w-64 items-center gap-1.5 border px-2 py-1 text-xs">
                <Paperclip size={12} strokeWidth={2} aria-hidden="true" className="shrink-0" />
                <span className="truncate">{adjunto.nombre}</span>
              </span>
              )
            : (
              <a
                href={adjunto.ruta}
                download={adjunto.nombre}
                aria-label={`Descargar ${adjunto.nombre}`}
                className="border-linea rounded-control text-texto hover:bg-hover hover:text-acento inline-flex max-w-64 items-center gap-1.5 border px-2 py-1 text-xs transition-colors duration-150"
              >
                <Paperclip size={12} strokeWidth={2} aria-hidden="true" className="shrink-0" />
                <span className="truncate">{adjunto.nombre}</span>
              </a>
              )}
        </li>
      ))}
    </ul>
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
