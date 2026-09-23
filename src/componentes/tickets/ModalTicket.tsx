'use client'

import { X } from 'lucide-react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useCallback, type ReactElement } from 'react'
import { Boton } from '@/componentes/formularios/Boton'
import { CerrarDialogo, ContenidoDialogo, Dialogo } from '@/componentes/superposiciones/Dialogo'
import { idDeParametro } from '@/componentes/datos/tabla'
import type { Referencia } from '@/datos/recursos'
import type { Capacidad } from '@/datos/tipos'
import { GLOSARIO } from '@/dominio/glosario'
import { PARAMETRO_TICKET, type FuenteDeTicket } from '@/dominio/ticket-vista'
import { DetalleTicket } from './DetalleTicket'

/**
 * El modal con el detalle de un ticket, atado a `?ticket={id}`.
 *
 * Es el unico detalle de ticket del producto, como `ModalTarea` lo es de las Tareas: la pestaña
 * Tickets del Proyecto y la bandeja de Soporte del portal montan este componente y escriben el mismo
 * parametro. Lo que cambia de un sujeto al otro entra por `fuente` y `capacidades`.
 *
 * **El estado vive en la URL**: el enlace del correo (`/proyectos/{id}?tab=tickets&ticket={n}`) lo
 * abre directo, recargar no lo pierde y «atras» lo cierra, porque abrirlo desde la tabla fue un
 * `push` del historial.
 *
 * Tras cualquier escritura hace `router.refresh()` —que es lo que pone al dia la bandeja del portal,
 * resuelta en el servidor— y ademas llama a `onCambiado`, que es lo que usa la pestaña del equipo,
 * cuya tabla se pide desde el navegador.
 */
export function ModalTicket ({
  fuente,
  capacidades,
  proyectos,
  onCambiado
}: {
  fuente: FuenteDeTicket
  capacidades: Capacidad[]
  /** Nombres de Proyectos a mano, para nombrar el del ticket sin otra peticion. */
  proyectos?: Referencia[]
  onCambiado?: () => void
}): ReactElement {
  const router = useRouter()
  const params = useSearchParams()
  const abierto = idDeParametro(params.get(PARAMETRO_TICKET))

  /**
   * Cierra quitando el parametro y conservando el resto de la URL.
   *
   * `replace` y no `push`: cerrar no es un paso nuevo del historial; con `push`, «atras» reabriria el
   * ticket que se acaba de cerrar.
   */
  function cerrar (): void {
    const siguientes = new URLSearchParams(params.toString())

    siguientes.delete(PARAMETRO_TICKET)

    router.replace(`?${siguientes.toString()}`, { scroll: false })
  }

  const alCambiar = useCallback(() => {
    router.refresh()
    onCambiado?.()
  }, [router, onCambiado])

  return (
    <Dialogo open={abierto !== null} onOpenChange={(abrir) => { if (!abrir) cerrar() }}>
      <ContenidoDialogo ancho="grande" titulo={GLOSARIO.ticket.singular} descripcion="Conversación y estado">
        {/* `sticky` y `-top-6` por lo mismo que en `ModalTarea`: el que scrollea es el panel entero, y
            un hilo largo se llevaria la salida con el encabezado. */}
        <div className="bg-superficie-flotante sticky -top-6 z-10 flex justify-end pb-2">
          <CerrarDialogo asChild>
            <Boton variante="sutil" tamano="chico" soloIcono aria-label="Cerrar">
              <X size={16} strokeWidth={2} aria-hidden="true" />
            </Boton>
          </CerrarDialogo>
        </div>

        {abierto !== null && (
          <DetalleTicket
            ticketId={abierto}
            fuente={fuente}
            capacidades={capacidades}
            proyectos={proyectos}
            onCambiado={alCambiar}
          />
        )}
      </ContenidoDialogo>
    </Dialogo>
  )
}
