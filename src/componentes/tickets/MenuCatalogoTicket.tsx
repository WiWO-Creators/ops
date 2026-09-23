'use client'

import { useState, type ReactElement } from 'react'
import { Insignia } from '@/componentes/presentadores/Insignia'
import {
  ContenidoMenu, DisparadorMenu, GrupoRadioMenu, ItemMenuRadio, MenuContextual
} from '@/componentes/superposiciones/MenuContextual'
import { escribirEnBff } from '@/componentes/datos/mutaciones'
import type { EstadoLookup } from '@/datos/recursos'
import { cn } from '@/lib/clases'

/**
 * Estado o prioridad de un ticket: una insignia que, si se puede editar, abre un menu.
 *
 * Es el mismo gesto que la insignia de estado de una Tarea (`MenuEstadoTarea`): lo mas repetido del
 * detalle no puede pedir abrir un formulario. Sin `puedeEditar` —el portal— queda la insignia sola,
 * sin boton, y nadie ve un control que no hace nada.
 *
 * El cambio es optimista y se revierte si la API lo rechaza: una insignia que dice «Cerrado» despues
 * de un 422 mentiria sobre el ticket.
 */
export function MenuCatalogoTicket ({
  rotulo,
  campo,
  valor,
  catalogo,
  rutaEditar,
  puedeEditar,
  onCambiado
}: {
  /** Que se esta eligiendo, para el nombre accesible: «Estado», «Prioridad». */
  rotulo: string
  /** La clave del `PATCH`. */
  campo: 'status' | 'priority'
  valor: number
  catalogo: EstadoLookup[]
  /** `PATCH` del ticket, ya resuelta. */
  rutaEditar: string
  puedeEditar: boolean
  onCambiado: () => void
}): ReactElement {
  const [pintado, setPintado] = useState(valor)
  const [ultimoDeLaApi, setUltimoDeLaApi] = useState(valor)
  const [enCurso, setEnCurso] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Se realinea cuando la ficha recargada trae otro valor. `setState` en el render, como en
  // `MenuEstadoTarea`, en vez de encadenar renders desde un efecto.
  if (ultimoDeLaApi !== valor) {
    setUltimoDeLaApi(valor)
    setPintado(valor)
    setError(null)
  }

  const opcion = catalogo.find((item) => item.id === pintado)
  const nombre = opcion?.name ?? `#${pintado}`
  const insignia = (
    <Insignia tono={opcion === undefined ? 'contorno' : 'neutro'} tamano="chico" color={opcion?.color ?? null}>
      {nombre}
    </Insignia>
  )

  /**
   * Manda el cambio y avisa a quien monta el detalle.
   *
   * @param elegido el id elegido, como texto del menu
   */
  async function elegir (elegido: string): Promise<void> {
    const destino = Number(elegido)

    if (!Number.isInteger(destino) || destino === pintado || enCurso) return

    const previo = pintado

    setPintado(destino)
    setError(null)
    setEnCurso(true)

    const resultado = await escribirEnBff<unknown>(rutaEditar, 'PATCH', { [campo]: destino })

    setEnCurso(false)

    if (!resultado.ok) {
      setPintado(previo)
      setError(resultado.mensaje)

      return
    }

    onCambiado()
  }

  if (!puedeEditar || catalogo.length === 0) return insignia

  return (
    <div className="flex flex-col items-start gap-1">
      <MenuContextual>
        <DisparadorMenu asChild>
          <button
            type="button"
            disabled={enCurso}
            aria-label={`${rotulo}: ${nombre}. Cambiar ${rotulo.toLowerCase()}.`}
            className={cn(
              'rounded-control cursor-pointer transition-opacity duration-150',
              enCurso ? 'cursor-progress opacity-60' : 'hover:opacity-80'
            )}
          >
            {insignia}
          </button>
        </DisparadorMenu>

        <ContenidoMenu align="start">
          <GrupoRadioMenu value={String(pintado)} onValueChange={(elegido) => { void elegir(elegido) }}>
            {catalogo.map((item) => (
              <ItemMenuRadio key={item.id} value={String(item.id)} disabled={enCurso}>
                {item.name}
              </ItemMenuRadio>
            ))}
          </GrupoRadioMenu>
        </ContenidoMenu>
      </MenuContextual>

      {error !== null && <p role="alert" className="text-texto-peligro text-xs">{error}</p>}
    </div>
  )
}
