'use client'

import { X } from 'lucide-react'
import { useRouter, useSearchParams } from 'next/navigation'
import type { ReactElement } from 'react'
import { Boton } from '@/componentes/formularios/Boton'
import { CerrarDialogo, ContenidoDialogo, Dialogo } from '@/componentes/superposiciones/Dialogo'
import { idDeParametro, PARAMETRO_TAREA } from '@/componentes/datos/tabla'
import { GLOSARIO } from '@/dominio/glosario'
import { DetalleTarea } from './DetalleTarea'

/**
 * El modal con el detalle de una tarea, atado a `?tarea={id}`.
 *
 * Es el unico detalle de tarea del producto: cualquier vista que liste tareas —la global, la pestaña
 * de un espacio, el Inicio— monta este componente y escribe el mismo parametro, en vez de armarse el
 * suyo.
 *
 * **Es un modal centrado y no un panel lateral** a proposito: la descripcion de una tarea suele ser
 * larga y en 448px de costado se lee en columna de diario. El modal ancho da el doble de superficie
 * sin sacar a la persona del listado, que es lo que se ganaba con el cajon.
 *
 * **El estado vive en la URL**: la tarea abierta se comparte por chat, recargar no la pierde y
 * "atras" la cierra, porque abrirla fue un `push` del historial.
 */

export function ModalTarea (): ReactElement {
  const router = useRouter()
  const params = useSearchParams()

  const tareaAbierta = idDeParametro(params.get(PARAMETRO_TAREA))

  /**
   * Cierra el modal quitando el parametro y conservando el resto de la URL.
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
    <Dialogo open={tareaAbierta !== null} onOpenChange={(abierto) => { if (!abierto) cerrar() }}>
      <ContenidoDialogo
        ancho="grande"
        titulo={GLOSARIO.proceso.singular}
        descripcion="Detalle y tiempo registrado"
      >
        {/* Los demas dialogos cierran con el "Cancelar" de su pie; este no tiene pie, y un modal de
            esta superficie sin salida visible obliga a adivinar `Escape` o el clic afuera.

            Va `sticky` y no `absolute`: el que scrollea es el panel entero, asi que un boton
            absoluto se iria con el encabezado apenas se baja por una descripcion larga —justo el
            caso para el que existe este modal. El fondo propio es lo que evita que el contenido se
            lea por debajo del boton al pasarle por atras.

            `-top-6` y no `top-0` porque el scrollport de un contenedor con `overflow` empieza
            debajo de su relleno: anclado en 0 quedaba una franja arriba por la que el contenido
            asomaba. */}
        <div className="bg-superficie-flotante sticky -top-6 z-10 flex justify-end pb-2">
          <CerrarDialogo asChild>
            <Boton variante="sutil" tamano="chico" soloIcono aria-label="Cerrar">
              <X size={16} strokeWidth={2} aria-hidden="true" />
            </Boton>
          </CerrarDialogo>
        </div>

        {tareaAbierta !== null && <DetalleTarea procesoId={tareaAbierta} />}
      </ContenidoDialogo>
    </Dialogo>
  )
}
