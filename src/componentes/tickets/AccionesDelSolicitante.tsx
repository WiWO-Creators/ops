'use client'

import { useEffect, useId, useRef, useState, type ReactElement } from 'react'
import { Boton } from '@/componentes/formularios/Boton'
import { escribirEnBff } from '@/componentes/datos/mutaciones'
import { falloDeTicket, rutaDeTicket, type FuenteDeTicket, type TicketVista } from '@/dominio/ticket-vista'

/**
 * Cerrar y reabrir la solicitud, del lado de quien la pidio (contrato v2, E).
 *
 * Solo aparece donde la fuente tiene esas rutas (el portal) y solo lo que la API permite en la ficha
 * (`puede_cerrar`, `puede_reabrir`): la pantalla no recalcula plazos ni estados. El equipo no usa
 * esto: cambia el estado desde la insignia.
 *
 * Cerrar pide confirmacion en el lugar —dos botones que reemplazan al primero— y no con otro dialogo
 * encima del modal: es una pregunta de si o no, y un segundo velo sobre el primero pierde el contexto
 * de que se esta cerrando. Reabrir no pide nada: es la accion que deshace y no destruye nada.
 */
export function AccionesDelSolicitante ({
  ticket,
  fuente,
  onCambiado,
  onRechazado
}: {
  ticket: TicketVista
  fuente: FuenteDeTicket
  /** La API confirmo: recibe la ficha que devolvio. */
  onCambiado: (datos: unknown) => void
  /** La API rechazo (por ejemplo, alguien lo cerro antes): la ficha se vuelve a pedir. */
  onRechazado: () => void
}): ReactElement | null {
  const [confirmando, setConfirmando] = useState(false)
  const [enCurso, setEnCurso] = useState(false)
  const [fallo, setFallo] = useState<string | null>(null)
  const enCursoAhora = useRef(false)
  const idPregunta = useId()
  const idConfirmar = useId()

  // El foco va al «Sí, cerrar»: quien llego con el teclado sigue en la pregunta que se le hizo.
  useEffect(() => {
    if (confirmando) document.getElementById(idConfirmar)?.focus()
  }, [confirmando, idConfirmar])

  const puedeCerrar = fuente.cerrar !== null && ticket.acciones.cerrar
  const puedeReabrir = fuente.reabrir !== null && ticket.acciones.reabrir

  if (!puedeCerrar && !puedeReabrir && fallo === null) return null

  /**
   * Manda el cierre o la reapertura. Nunca lanza: el rechazo se explica aca mismo.
   *
   * @param accion cual de las dos
   */
  async function ejecutar (accion: 'cerrar' | 'reabrir'): Promise<void> {
    const plantilla = accion === 'cerrar' ? fuente.cerrar : fuente.reabrir

    if (plantilla === null || enCursoAhora.current) return

    enCursoAhora.current = true
    setEnCurso(true)
    setFallo(null)

    const resultado = await escribirEnBff<unknown>(rutaDeTicket(plantilla, ticket.id), 'POST')

    enCursoAhora.current = false
    setEnCurso(false)
    setConfirmando(false)

    if (!resultado.ok) {
      setFallo(falloDeTicket(resultado, accion).texto)
      if (resultado.estado === 409) onRechazado()

      return
    }

    onCambiado(resultado.datos)
  }

  return (
    <div className="border-linea-suave flex flex-col gap-2 border-t pt-3">
      {puedeCerrar && !confirmando && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-texto-tenue text-sm">¿Ya se resolvió? Puedes cerrar el ticket.</p>
          <Boton variante="secundario" tamano="chico" onClick={() => { setConfirmando(true) }}>
            Cerrar ticket
          </Boton>
        </div>
      )}

      {puedeCerrar && confirmando && (
        <div role="group" aria-labelledby={idPregunta} className="flex flex-wrap items-center justify-between gap-2">
          <p id={idPregunta} className="text-texto text-sm font-medium">
            ¿Cerrar este ticket? Podrás reabrirlo por un tiempo si hace falta.
          </p>
          <div className="flex gap-2">
            <Boton variante="sutil" tamano="chico" disabled={enCurso} onClick={() => { setConfirmando(false) }}>
              Cancelar
            </Boton>
            <Boton id={idConfirmar} variante="primario" tamano="chico" cargando={enCurso} onClick={() => { void ejecutar('cerrar') }}>
              Sí, cerrar
            </Boton>
          </div>
        </div>
      )}

      {puedeReabrir && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-texto-tenue text-sm">¿El problema volvió? Puedes reabrir el ticket.</p>
          <Boton variante="secundario" tamano="chico" cargando={enCurso} onClick={() => { void ejecutar('reabrir') }}>
            Reabrir ticket
          </Boton>
        </div>
      )}

      {fallo !== null && <p role="alert" className="text-texto-peligro text-sm">{fallo}</p>}
    </div>
  )
}
