'use client'

import { X } from 'lucide-react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useCallback, useState, type ReactElement } from 'react'
import { Boton } from '@/componentes/formularios/Boton'
import { CerrarDialogo, ContenidoDialogo, Dialogo } from '@/componentes/superposiciones/Dialogo'
import { idDeParametro, urlConParametro } from '@/componentes/datos/tabla'
import type { Referencia } from '@/datos/recursos'
import type { Capacidad } from '@/datos/tipos'
import { PARAMETRO_TICKET, tituloDelModal, type FuenteDeTicket } from '@/dominio/ticket-vista'
import { DetalleTicket } from './DetalleTicket'

/** Como se llego al ticket abierto, que decide como se sale. */
interface Apertura {
  /** El ticket del parametro la ultima vez que se miro. */
  ticket: number | null
  /**
   * `true` si se abrio **desde esta pantalla** (la URL paso de sin ticket a con ticket mientras el
   * modal estaba montado): eso fue un `push`, y cerrar es volver atras. `false` si la pagina ya
   * cargo con el ticket (enlace de correo, recarga, la redireccion de `/portal/soporte/{id}`): ahi no
   * hay un paso anterior propio al que volver, y cerrar reemplaza la URL.
   */
  porNavegacion: boolean
  /** El asunto que informo el detalle, para el titulo accesible. */
  asunto: string | null
}

/**
 * El modal con el detalle de un ticket, atado a `?ticket={id}`.
 *
 * Es el unico detalle de ticket del producto, como `ModalTarea` lo es de las Tareas: la pestaña
 * Tickets del Proyecto y la bandeja de Soporte del portal montan este componente y escriben el mismo
 * parametro. Lo que cambia de un sujeto al otro entra por `fuente` y `capacidades`.
 *
 * **El estado vive en la URL**: el enlace del correo (`/proyectos/{id}?tab=tickets&ticket={n}`) lo
 * abre directo, recargar no lo pierde y «atras» lo cierra.
 *
 * **Cerrar no duplica historial.** Si el ticket se abrio desde la tabla (un `push`), cerrar es
 * `router.back()`: con `replace` quedaban dos entradas iguales de la lista y «atras» parecia no hacer
 * nada. Si la pagina cargo ya con el ticket, cerrar reemplaza la URL.
 *
 * El detalle lleva `key` por ticket: pasar de uno a otro (o a su principal, en una fusion) monta un
 * detalle nuevo, sin carga, borrador ni errores del anterior.
 *
 * Tras cualquier escritura hace `router.refresh()` —que es lo que pone al dia la bandeja del portal,
 * resuelta en el servidor— y ademas llama a `onCambiado`, que es lo que usa la pestaña del equipo,
 * cuya tabla se pide desde el navegador. El detalle, ademas, emite `ops:tickets-cambiados`.
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
  const [apertura, setApertura] = useState<Apertura>({ ticket: abierto, porNavegacion: false, asunto: null })

  // `setState` en el render, como en `MenuCatalogoTicket`: la URL es la fuente y esto solo recuerda
  // de donde vino el cambio. Un paso de ticket a ticket (la fusion) conserva el origen.
  if (apertura.ticket !== abierto) {
    setApertura({
      ticket: abierto,
      porNavegacion: abierto !== null && (apertura.ticket === null || apertura.porNavegacion),
      asunto: null
    })
  }

  /** Cierra quitando el parametro y conservando el resto de la URL. */
  function cerrar (): void {
    if (apertura.porNavegacion) {
      router.back()

      return
    }

    const siguientes = new URLSearchParams(params.toString())

    siguientes.delete(PARAMETRO_TICKET)

    router.replace(`?${siguientes.toString()}`, { scroll: false })
  }

  const alCambiar = useCallback(() => {
    router.refresh()
    onCambiado?.()
  }, [router, onCambiado])

  const alAsunto = useCallback((asunto: string) => {
    setApertura((previa) => previa.asunto === asunto ? previa : { ...previa, asunto })
  }, [])

  const alFusionado = useCallback((principalId: number) => {
    router.replace(urlConParametro(new URLSearchParams(params.toString()), PARAMETRO_TICKET, String(principalId)), { scroll: false })
  }, [router, params])

  return (
    <Dialogo open={abierto !== null} onOpenChange={(abrir) => { if (!abrir) cerrar() }}>
      <ContenidoDialogo
        ancho="grande"
        titulo={abierto === null ? 'Ticket' : tituloDelModal(abierto, apertura.asunto)}
        tituloOculto
        aria-describedby={undefined}
      >
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
            key={abierto}
            ticketId={abierto}
            fuente={fuente}
            capacidades={capacidades}
            proyectos={proyectos}
            onCambiado={alCambiar}
            onAsunto={alAsunto}
            onFusionado={alFusionado}
          />
        )}
      </ContenidoDialogo>
    </Dialogo>
  )
}
