'use client'

import { X } from 'lucide-react'
import { useSearchParams } from 'next/navigation'
import { useCallback, useState, type ReactElement } from 'react'
import { Boton } from '@/componentes/formularios/Boton'
import { CerrarDialogo, ContenidoDialogo, Dialogo } from '@/componentes/superposiciones/Dialogo'
import { idDeParametro, urlConParametro } from '@/componentes/datos/tabla'
import type { Referencia } from '@/datos/recursos'
import type { Capacidad } from '@/datos/tipos'
import { PARAMETRO_TICKET, nombreDelTicket, tituloDelModal, type FuenteDeTicket } from '@/dominio/ticket-vista'
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
 * **Abrir y cerrar no pasan por el servidor.** La tabla y el enlace del asunto abren con
 * `window.history.pushState`, y aca se cierra con `history.back()` o `history.replaceState`: los
 * dos los sigue `useSearchParams`, asi que el modal aparece y se va sin volver a renderizar la
 * pagina (en el portal eso era un render completo de la bandeja por cada apertura).
 *
 * **Cerrar no duplica historial.** Si el ticket se abrio desde la tabla (un `push`), cerrar es volver
 * atras: con `replace` quedaban dos entradas iguales de la lista y «atras» parecia no hacer nada. Si
 * la pagina cargo ya con el ticket, cerrar reemplaza la URL.
 *
 * El detalle lleva `key` por ticket: pasar de uno a otro (o a su principal, en una fusion) monta un
 * detalle nuevo, sin carga, borrador ni errores del anterior.
 *
 * Tras cualquier escritura el detalle emite `ops:tickets-cambiados`, que escuchan la pestaña, su
 * contador y las dos bandejas para volver a pedir su pagina con los filtros puestos. Es el unico
 * aviso: no hay `router.refresh()` ni callback aparte, porque los listados se piden desde el
 * navegador y cada uno de esos sumaba un render del servidor o una peticion repetida.
 */
export function ModalTicket ({
  fuente,
  capacidades,
  proyectos
}: {
  fuente: FuenteDeTicket
  capacidades: Capacidad[]
  /** Nombres de Proyectos a mano, para nombrar el del ticket sin otra peticion. */
  proyectos?: Referencia[]
}): ReactElement {
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
      window.history.back()

      return
    }

    const siguientes = new URLSearchParams(params.toString())

    siguientes.delete(PARAMETRO_TICKET)

    window.history.replaceState(null, '', `?${siguientes.toString()}${window.location.hash}`)
  }

  const alAsunto = useCallback((asunto: string) => {
    setApertura((previa) => previa.asunto === asunto ? previa : { ...previa, asunto })
  }, [])

  const alFusionado = useCallback((principalId: number) => {
    window.history.replaceState(null, '', urlConParametro(new URLSearchParams(params.toString()), PARAMETRO_TICKET, String(principalId)))
  }, [params])

  return (
    <Dialogo open={abierto !== null} onOpenChange={(abrir) => { if (!abrir) cerrar() }}>
      <ContenidoDialogo
        ancho="grande"
        titulo={abierto === null ? nombreDelTicket(fuente).titulo : tituloDelModal(abierto, apertura.asunto, nombreDelTicket(fuente))}
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
            onAsunto={alAsunto}
            onFusionado={alFusionado}
          />
        )}
      </ContenidoDialogo>
    </Dialogo>
  )
}
