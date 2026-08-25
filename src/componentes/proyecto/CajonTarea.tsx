'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import type { ReactElement } from 'react'
import { Cajon, ContenidoCajon } from '@/componentes/superposiciones/Cajon'
import { idDeParametro } from '@/componentes/datos/tabla'
import { GLOSARIO } from '@/dominio/glosario'
import { DetalleTarea } from './DetalleTarea'

/**
 * El cajon con el detalle de una tarea, atado a `?tarea={id}`.
 *
 * Es el mismo trato que hace la pestaña de Tareas de un proyecto, sacado a un componente para que
 * cualquier vista que liste tareas —la global incluida— abra el mismo detalle con la misma URL en vez
 * de escribir el suyo.
 *
 * **El estado vive en la URL**: la tarea abierta se comparte por chat, recargar no la pierde y
 * "atras" la cierra, porque abrirla fue un `push` del historial.
 */

/** Parametro que abre el detalle. Lo lee este cajon y lo escriben los enlaces de la tabla. */
export const PARAMETRO_TAREA = 'tarea'

export function CajonTarea (): ReactElement {
  const router = useRouter()
  const params = useSearchParams()

  const tareaAbierta = idDeParametro(params.get(PARAMETRO_TAREA))

  /**
   * Cierra el cajon quitando el parametro y conservando el resto de la URL.
   *
   * `replace` y no `push`: cerrar no es un paso nuevo del historial, y con `push` "atras" reabriria
   * el detalle que la persona acaba de cerrar.
   */
  function cerrar (): void {
    const siguientes = new URLSearchParams(params.toString())

    siguientes.delete(PARAMETRO_TAREA)

    router.replace(`?${siguientes.toString()}`, { scroll: false })
  }

  return (
    <Cajon open={tareaAbierta !== null} onOpenChange={(abierto) => { if (!abierto) cerrar() }}>
      <ContenidoCajon titulo={GLOSARIO.proceso.singular} descripcion="Detalle y tiempo registrado">
        {tareaAbierta !== null && <DetalleTarea procesoId={tareaAbierta} />}
      </ContenidoCajon>
    </Cajon>
  )
}
