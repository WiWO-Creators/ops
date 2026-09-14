'use client'

import { useState, type ReactElement } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronDown } from 'lucide-react'
import { Insignia } from '@/componentes/presentadores/Insignia'
import {
  ContenidoMenu,
  DisparadorMenu,
  GrupoRadioMenu,
  ItemMenuRadio,
  MenuContextual
} from '@/componentes/superposiciones/MenuContextual'
import { escribirEnBff } from '@/componentes/datos/mutaciones'
import { cn } from '@/lib/clases'
import { ESTADOS_DESTACADOS, estadoDelCatalogo, pildoraDeEstado } from './estado-proyecto'
import type { EstadoLookup } from '@/datos/recursos'

interface PropsMenuEstadoProyecto {
  proyectoId: number
  /** Nombre del proyecto. Solo para el texto accesible: al lado ya se lee el titulo. */
  nombreProyecto: string
  /** El `status` que devolvio la API en la ultima carga. */
  estado: number
  /** Nombre y color ya resueltos, para un id que el catalogo no conozca. */
  respaldo: { nombre: string, color: string | null }
  /** `project_statuses` de `GET /lookups`. Vacio no pinta menu: sin catalogo no hay que ofrecer. */
  catalogo: EstadoLookup[]
}

/**
 * La pildora de estado del Proyecto, convertida en menu para cambiarlo ahi mismo.
 *
 * Es el mismo gesto que `MenuEstadoTarea` resolvio en el tablero: hasta ahora el estado de un
 * Espacio solo se movia abriendo "Mas" y buscando un "Marcar como…" entre otras ocho acciones, o
 * abriendo el formulario entero de edicion. Dos caminos largos para el cambio que mas se repite.
 *
 * **Es la misma insignia que se lee en el resto del producto**, con el color que administra el
 * panel: no se inventa un control nuevo, se le pone un menu al que ya estaba. Quien solo mira el
 * estado lo sigue leyendo igual; quien lo quiere mover lo mueve en un clic.
 *
 * El cambio se pinta en optimista y se revierte si la API lo rechaza, con el motivo a la vista: una
 * cabecera que se queda mostrando el estado que no se guardo es peor que no tener el control.
 */
export function MenuEstadoProyecto ({
  proyectoId,
  nombreProyecto,
  estado,
  respaldo,
  catalogo
}: PropsMenuEstadoProyecto): ReactElement | null {
  const router = useRouter()
  // Lo que se pinta: arranca en el estado de la API y se adelanta al elegir. Se vuelve a alinear
  // sola cuando el refresco de la ficha trae un `status` distinto al del render anterior. React
  // admite este `setState` durante el render —reinicia el render antes de pintar— y es lo que la
  // regla de hooks pide en vez de encadenar renders desde un efecto.
  const [pintado, setPintado] = useState(estado)
  const [ultimoDeLaApi, setUltimoDeLaApi] = useState(estado)
  const [enCurso, setEnCurso] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (ultimoDeLaApi !== estado) {
    setUltimoDeLaApi(estado)
    setPintado(estado)
    setError(null)
  }

  /**
   * Manda el estado elegido y revierte si la API lo rechaza.
   *
   * `status` de un Espacio es editable por `PATCH` y arrastra `date_finished` del lado del
   * servidor: no se toca esa fecha desde aca.
   *
   * @param valor el id del estado, en texto: es lo que entrega el grupo de radio de Radix
   */
  async function elegir (valor: string): Promise<void> {
    const destino = Number(valor)

    if (!Number.isInteger(destino) || destino === pintado || enCurso) return

    const previo = pintado

    setPintado(destino)
    setError(null)
    setEnCurso(true)

    const resultado = await escribirEnBff(`projects/${proyectoId}`, 'PATCH', { status: destino })

    setEnCurso(false)

    if (!resultado.ok) {
      setPintado(previo)
      setError(resultado.mensaje)

      return
    }

    // El avance, las fechas y la botonera de la ficha dependen del estado: se refresca la pantalla
    // entera y no solo esta pildora.
    router.refresh()
  }

  // Va despues de los hooks: una salida temprana arriba los saltearia entre renders.
  if (catalogo.length === 0) return null

  const resuelto = estadoDelCatalogo(pintado, catalogo, respaldo)

  return (
    <div className="flex flex-col items-start gap-1">
      <MenuContextual>
        <DisparadorMenu asChild>
          <button
            type="button"
            disabled={enCurso}
            aria-label={`Estado de "${nombreProyecto}": ${resuelto.nombre}. Cambiar estado.`}
            className={cn(
              'rounded-control cursor-pointer',
              'transition-opacity duration-150',
              enCurso ? 'cursor-progress opacity-60' : 'hover:opacity-80'
            )}
          >
            <Insignia
              {...pildoraDeEstado(pintado, resuelto.color)}
              className={ESTADOS_DESTACADOS.includes(pintado) ? 'motion-safe:animate-pulse' : undefined}
            >
              {resuelto.nombre}
              {/* La flecha es la unica diferencia visible con la pildora de solo lectura del
                  portal: sin ella nada dice que esto se puede tocar. */}
              <ChevronDown aria-hidden="true" className="size-3 shrink-0 opacity-70" strokeWidth={2} />
            </Insignia>
          </button>
        </DisparadorMenu>

        <ContenidoMenu align="end">
          <GrupoRadioMenu
            value={String(pintado)}
            onValueChange={(valor) => { void elegir(valor) }}
          >
            {catalogo.map((opcion) => (
              <ItemMenuRadio key={opcion.id} value={String(opcion.id)} disabled={enCurso}>
                {opcion.name}
              </ItemMenuRadio>
            ))}
          </GrupoRadioMenu>
        </ContenidoMenu>
      </MenuContextual>

      {error !== null && (
        <p role="alert" className="text-texto-peligro text-xs">{error}</p>
      )}
    </div>
  )
}
