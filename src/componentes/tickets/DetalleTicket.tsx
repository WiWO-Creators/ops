'use client'

import { useCallback, useEffect, useState, type ReactElement } from 'react'
import { Cargando, ErrorEstado, Vacio } from '@/componentes/estado/Estados'
import type { Capacidad } from '@/datos/tipos'
import { avisarCambioDeTicket } from '@/dominio/ticket-estados'
import { nombreDelTicket, rutaDeTicket, type FuenteDeTicket, type ProyectoElegible } from '@/dominio/ticket-vista'
import { AccionesDelSolicitante } from './AccionesDelSolicitante'
import { CajaDeRespuesta } from './CajaDeRespuesta'
import { DatosDelTicket } from './DatosDelTicket'
import { Hilo } from './Hilo'
import { MenuCatalogoTicket } from './MenuCatalogoTicket'
import { useTicketEnVivo } from './useTicketEnVivo'

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
 * **El hilo esta en vivo** mientras el modal esta abierto (ver `useTicketEnVivo`). La caja de respuesta
 * tiene su propio estado, asi que el refresco no toca lo que se esta escribiendo.
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
   * Los Proyectos que quien mira ya tiene a mano: nombran el del ticket sin mostrar un numero pelado
   * (la ficha solo trae `project_id`) y, si puede editar, son los que ofrece el menu para moverlo.
   * Un Proyecto que no este aca se nombra por su id.
   */
  proyectos?: ProyectoElegible[]
  /** Informa el asunto cuando llega, para el titulo accesible del modal. */
  onAsunto?: (asunto: string) => void
  /** La API devolvio el ticket principal de una fusion: quien monta cambia la URL a ese id. */
  onFusionado?: (principalId: number) => void
}): ReactElement {
  const { carga, refrescar, reintentar, aplicarEscritura } = useTicketEnVivo(fuente, ticketId)
  const [aviso, setAviso] = useState<string | null>(null)
  const ticket = carga.fase === 'listo' ? carga.ticket : null

  useEffect(() => {
    if (ticket !== null) onAsunto?.(ticket.asunto)
  }, [ticket, onAsunto])

  // Fusion (contrato v2, D): se pidio un hijo y llego el principal. La URL pasa al principal para que
  // recargar, compartir o volver apunten al ticket que de verdad se esta leyendo.
  useEffect(() => {
    if (ticket !== null && ticket.fusionadoDesde !== null && ticket.id !== ticketId) onFusionado?.(ticket.id)
  }, [ticket, ticketId, onFusionado])

  /**
   * Despues de una escritura confirmada: la vista con lo que devolvio la API, la ficha al dia y el
   * aviso hacia afuera (evento de ventana, que escuchan listas, contadores y bandejas).
   *
   * @param datos lo que devolvio la API, si sirve para mostrar algo sin esperar la recarga
   */
  const alEscribir = useCallback((datos?: unknown): void => {
    if (datos !== undefined) aplicarEscritura(datos)
    setAviso(null)

    void refrescar().then((alDia) => {
      if (!alDia) {
        setAviso('Tu cambio quedó guardado, pero no pudimos actualizar la conversación. Se pondrá al día sola en unos segundos.')
      }
    })

    avisarCambioDeTicket(ticketId)
  }, [aplicarEscritura, refrescar, ticketId])

  if (carga.fase === 'cargando') return <Cargando alto="min-h-60" mensaje={`Cargando ${nombreDelTicket(fuente).el}…`} />

  if (carga.fase === 'noEncontrado') {
    return (
      <Vacio
        titulo={`No encontramos ${nombreDelTicket(fuente).este}`}
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
            rutaResponder={rutaDeTicket(fuente.responder, vista.id)}
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
