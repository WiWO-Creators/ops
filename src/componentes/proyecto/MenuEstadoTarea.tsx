'use client'

import { useState, type ReactElement } from 'react'
import { Insignia } from '@/componentes/presentadores/Insignia'
import {
  ContenidoMenu,
  DisparadorMenu,
  GrupoRadioMenu,
  ItemMenuRadio,
  MenuContextual
} from '@/componentes/superposiciones/MenuContextual'
import { escribirEnBff } from '@/componentes/datos/mutaciones'
import { resolverEstado } from '@/dominio/estados-tarea'
import { cn } from '@/lib/clases'
import { accionDeEstado } from './estado-proceso'
import type { EstadoLookup, Proceso } from '@/datos/recursos'

/**
 * La insignia de estado de una tarea, convertida en menu para cambiarlo ahi mismo.
 *
 * Existe para el kanban de Hitos, donde las columnas son hitos y no estados: mover la tarjeta no
 * cambia el estado, y hasta ahora la unica forma de avanzarlo era abrir el modal de detalle, tocar
 * el selector y guardar. Cuatro pasos para el gesto mas repetido del tablero.
 *
 * **Es la misma insignia que se lee en el resto del producto**, con el color que administra Perfex:
 * no se inventa un control nuevo, se le pone un menu al que ya estaba. Asi la tarjeta no crece y el
 * estado se sigue leyendo de un vistazo cuando no se piensa cambiarlo.
 *
 * `GrupoRadioMenu` y no una lista de items sueltos: elegir un estado apaga el anterior, y la
 * primitiva de Radix es la que emite `role="menuitemradio"` con `aria-checked`. Un tilde dibujado a
 * mano no le dice nada a un lector de pantalla.
 *
 * El cambio se pinta en optimista y se revierte si la API lo rechaza, con el motivo a la vista: una
 * tarjeta que se queda mostrando el estado que no se guardo es peor que no tener el control.
 */

interface PropsMenuEstadoTarea {
  tareaId: number
  /** Nombre de la tarea. Solo para el texto accesible: en la tarjeta ya se lee al lado. */
  nombreTarea: string
  /** El `status` que devolvio la API en la ultima carga. */
  estado: number
  /** `task_statuses` de `GET /lookups`. Vacio no pinta nada: sin catalogo no hay que ofrecer. */
  catalogo: EstadoLookup[]
  /** Se llama despues de un cambio confirmado, para que quien monta el control refresque su vista. */
  onCambiado: () => void
}

export function MenuEstadoTarea ({
  tareaId,
  nombreTarea,
  estado,
  catalogo,
  onCambiado
}: PropsMenuEstadoTarea): ReactElement | null {
  // Lo que se pinta: arranca en el estado de la API y se adelanta al elegir. Se vuelve a alinear
  // sola cuando la recarga del tablero trae un `status` distinto al del render anterior. React
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
   * @param valor el id del estado, en texto: es lo que entrega el grupo de radio de Radix
   */
  async function elegir (valor: string): Promise<void> {
    const destino = Number(valor)

    if (destino === pintado || enCurso) return

    const accion = accionDeEstado(tareaId, destino)

    if (accion === null) {
      setError('No se pudo cambiar el estado: la opción elegida no es válida.')

      return
    }

    const previo = pintado

    setPintado(destino)
    setError(null)
    setEnCurso(true)

    const resultado = await escribirEnBff<Proceso>(accion.ruta, 'POST', accion.cuerpo)

    setEnCurso(false)

    if (!resultado.ok) {
      setPintado(previo)
      setError(resultado.mensaje)

      return
    }

    onCambiado()
  }

  // Sin catalogo no hay con que traducir ningun estado, y un menu de "#1" y "#4" no se puede usar.
  // Va despues de los hooks: una salida temprana arriba los saltearia entre renders.
  if (catalogo.length === 0) return null

  const resuelto = resolverEstado(pintado, catalogo)

  return (
    // `draggable={false}`: la tarjeta que contiene este control es arrastrable, y sin esto un
    // arrastre que empieza sobre la insignia mueve la tarjeta de columna en vez de abrir el menu.
    <div className="flex flex-col items-start gap-1" draggable={false}>
      <MenuContextual>
        <DisparadorMenu asChild>
          <button
            type="button"
            disabled={enCurso}
            aria-label={`Estado de "${nombreTarea}": ${resuelto.etiqueta}. Cambiar estado.`}
            className={cn(
              'rounded-control cursor-pointer',
              'transition-opacity duration-150',
              enCurso ? 'cursor-progress opacity-60' : 'hover:opacity-80'
            )}
          >
            <Insignia
              tono={resuelto.desconocido ? 'contorno' : 'neutro'}
              tamano="chico"
              color={resuelto.color}
            >
              {resuelto.etiqueta}
            </Insignia>
          </button>
        </DisparadorMenu>

        <ContenidoMenu align="start">
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
