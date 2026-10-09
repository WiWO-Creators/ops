'use client'

import { useRef, useState, type ReactElement } from 'react'
import { AvisoEnLinea } from '@/componentes/estado/Estados'
import { Boton } from '@/componentes/formularios/Boton'
import { ConfirmacionEnLinea } from '@/componentes/datos/ConfirmacionEnLinea'
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
        <ConfirmacionEnLinea
          disposicion="linea"
          advertencia="¿Cerrar este ticket? Podrás reabrirlo por un tiempo si hace falta."
          etiquetaConfirmar="Sí, cerrar"
          varianteConfirmar="primario"
          cargando={enCurso}
          onCancelar={() => { setConfirmando(false) }}
          onConfirmar={() => { void ejecutar('cerrar') }}
        />
      )}

      {puedeReabrir && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-texto-tenue text-sm">¿El problema volvió? Puedes reabrir el ticket.</p>
          <Boton variante="secundario" tamano="chico" cargando={enCurso} onClick={() => { void ejecutar('reabrir') }}>
            Reabrir ticket
          </Boton>
        </div>
      )}

      {fallo !== null && <AvisoEnLinea variante="error" mensaje={fallo} className="text-sm" />}
    </div>
  )
}
