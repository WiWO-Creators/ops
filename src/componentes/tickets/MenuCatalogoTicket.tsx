'use client'

import { ChevronDown } from 'lucide-react'
import { useState, type ReactElement } from 'react'
import { Boton } from '@/componentes/formularios/Boton'
import { AreaTexto } from '@/componentes/formularios/Entrada'
import { Insignia } from '@/componentes/presentadores/Insignia'
import { CerrarDialogo, ContenidoDialogo, Dialogo } from '@/componentes/superposiciones/Dialogo'
import {
  ContenidoMenu, DisparadorMenu, GrupoRadioMenu, ItemMenuRadio, MenuContextual
} from '@/componentes/superposiciones/MenuContextual'
import { escribirEnBff } from '@/componentes/datos/mutaciones'
import { useAviso } from '@/componentes/estado/useAviso'
import type { EstadoLookup } from '@/datos/recursos'
import { ESTADO_TICKET_EN_ESPERA } from '@/dominio/ticket-estados'
import { cuerpoDeRespuesta, falloDeTicket, nombreEnCatalogo, type FuenteDeTicket } from '@/dominio/ticket-vista'
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
 *
 * Con `rutaResponder`, elegir «En espera» abre un dialogo para anotar el motivo (opcional). Si se
 * escribe, viaja como respuesta con el cambio de estado, asi queda en el hilo y lo ven equipo y
 * cliente; sin motivo, es el `PATCH` de siempre.
 *
 * Un valor que el catalogo no nombra se dibuja segun `sinNombre`: «Estado #7» para el equipo, nada
 * para el cliente.
 */
export function MenuCatalogoTicket ({
  rotulo,
  campo,
  valor,
  catalogo,
  rutaEditar,
  rutaResponder,
  puedeEditar,
  sinNombre,
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
  /** `POST` de respuestas ya resuelta; si viaja, «En espera» pide un motivo. */
  rutaResponder?: string
  puedeEditar: boolean
  /** Que hacer con un valor sin nombre en el catalogo (ver `FuenteDeTicket.catalogoSinNombre`). */
  sinNombre: FuenteDeTicket['catalogoSinNombre']
  onCambiado: () => void
}): ReactElement | null {
  const avisar = useAviso()
  const [pintado, setPintado] = useState(valor)
  const [ultimoDeLaApi, setUltimoDeLaApi] = useState(valor)
  const [enCurso, setEnCurso] = useState(false)
  const [pidiendoMotivo, setPidiendoMotivo] = useState(false)
  const [motivo, setMotivo] = useState('')

  // Se realinea cuando la ficha recargada trae otro valor. `setState` en el render, como en
  // `MenuEstadoTarea`, en vez de encadenar renders desde un efecto.
  if (ultimoDeLaApi !== valor) {
    setUltimoDeLaApi(valor)
    setPintado(valor)
  }

  const opcion = catalogo.find((item) => item.id === pintado)
  const nombre = nombreEnCatalogo(catalogo, pintado, rotulo, sinNombre)

  if (nombre === null) return null

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

    if (campo === 'status' && rutaResponder !== undefined && destino === ESTADO_TICKET_EN_ESPERA) {
      setMotivo('')
      setPidiendoMotivo(true)

      return
    }

    await aplicar(destino, null)
  }

  /**
   * Cambia el valor, con el motivo como respuesta si lo hay.
   *
   * @param destino el id elegido
   * @param texto el motivo escrito, o `null` para el `PATCH` simple
   */
  async function aplicar (destino: number, texto: string | null): Promise<void> {
    const previo = pintado
    const cuerpo = texto === null ? null : cuerpoDeRespuesta(texto, destino)

    setPintado(destino)
    setEnCurso(true)

    const resultado = cuerpo !== null && rutaResponder !== undefined
      ? await escribirEnBff<unknown>(rutaResponder, 'POST', cuerpo)
      : await escribirEnBff<unknown>(rutaEditar, 'PATCH', { [campo]: destino })

    setEnCurso(false)

    if (!resultado.ok) {
      setPintado(previo)
      avisar.error(falloDeTicket(resultado, 'editar').texto)

      return
    }

    onCambiado()
  }

  if (!puedeEditar || catalogo.length === 0) return insignia

  return (
    <div className="flex flex-col items-start gap-1">
      <Dialogo open={pidiendoMotivo} onOpenChange={setPidiendoMotivo}>
        <ContenidoDialogo
          titulo="Poner en espera"
          descripcion="El motivo queda en el hilo y lo ven el equipo y el cliente. Es opcional."
          ancho="chico"
          cerrable
        >
          <form
            className="flex flex-col gap-3"
            onSubmit={(evento) => {
              evento.preventDefault()
              setPidiendoMotivo(false)
              void aplicar(ESTADO_TICKET_EN_ESPERA, motivo)
            }}
          >
            <AreaTexto
              rows={4}
              value={motivo}
              autoFocus
              aria-label="Motivo de la espera"
              placeholder="¿Por qué queda en espera?"
              onChange={(evento) => { setMotivo(evento.target.value) }}
            />
            <div className="flex justify-end gap-2">
              <CerrarDialogo asChild>
                <Boton type="button">Cancelar</Boton>
              </CerrarDialogo>
              <Boton type="submit" variante="primario">Poner en espera</Boton>
            </div>
          </form>
        </ContenidoDialogo>
      </Dialogo>
      <MenuContextual>
        <DisparadorMenu asChild>
          <button
            type="button"
            disabled={enCurso}
            aria-label={`${rotulo}: ${nombre}. Cambiar ${rotulo.toLowerCase()}.`}
            className={cn(
              'rounded-control inline-flex cursor-pointer items-center gap-1 transition-opacity duration-150',
              enCurso ? 'cursor-progress opacity-60' : 'hover:opacity-80'
            )}
          >
            {insignia}
            <ChevronDown size={14} strokeWidth={2} aria-hidden="true" className="text-texto-sutil shrink-0" />
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
    </div>
  )
}
