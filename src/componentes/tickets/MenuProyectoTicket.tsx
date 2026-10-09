'use client'

import { ChevronDown } from 'lucide-react'
import { useState, type ReactElement } from 'react'
import {
  BuscadorMenu, ContenidoMenu, DisparadorMenu, GrupoRadioMenu, ItemMenuRadio, MenuContextual, SinResultadosMenu, UMBRAL_BUSCADOR
} from '@/componentes/superposiciones/MenuContextual'
import { escribirEnBff } from '@/componentes/datos/mutaciones'
import { useAviso } from '@/componentes/estado/useAviso'
import { GLOSARIO } from '@/dominio/glosario'
import { buscarProyectos, falloDeTicket, type ProyectoElegible } from '@/dominio/ticket-vista'
import { cn } from '@/lib/clases'

/** Valor del menu para «Sin Proyecto». La API guarda `0` en `tbltickets.project_id` cuando no hay ninguno. */
const SIN_PROYECTO = '0'

/**
 * El menu para mover un ticket a otro Proyecto, que acompaña al enlace del Proyecto actual.
 *
 * El cambio es optimista, igual que el del asignado: el nombre nuevo se pinta de inmediato y se
 * revierte si la API lo rechaza. Los rechazos 422 propios de este campo (`otro_cliente`,
 * `ticket_sin_cliente`, `no_visible`) llegan explicados por `falloDeTicket`. Al confirmar avisa a
 * quien monta el detalle, que refresca la ficha y emite `ops:tickets-cambiados` para las bandejas.
 *
 * @param props.actual el Proyecto del ticket (`null` si no tiene)
 * @param props.opciones los Proyectos elegibles, ya filtrados al cliente del ticket
 * @param props.rutaEditar `PATCH` del ticket, ya resuelta
 * @param props.onElegido recibe el id del Proyecto elegido apenas se pinta, para que el enlace de al lado lo refleje
 * @param props.onCambiado avisa que la API confirmo el cambio
 */
export function MenuProyectoTicket ({
  actual,
  opciones,
  rutaEditar,
  onElegido,
  onCambiado
}: {
  actual: number | null
  opciones: ProyectoElegible[]
  rutaEditar: string
  onElegido: (proyectoId: number | null) => void
  onCambiado: () => void
}): ReactElement {
  const avisar = useAviso()
  const [busqueda, setBusqueda] = useState('')
  const [enCurso, setEnCurso] = useState(false)

  const visibles = buscarProyectos(opciones, busqueda)
  const nombre = GLOSARIO.espacio.singular.toLowerCase()

  /**
   * Manda el cambio de Proyecto.
   *
   * @param elegido el id como texto del menu; {@link SIN_PROYECTO} lo quita
   */
  async function elegir (elegido: string): Promise<void> {
    const destino = Number(elegido)

    if (!Number.isInteger(destino) || destino < 0 || destino === (actual ?? 0) || enCurso) return

    setEnCurso(true)
    onElegido(destino === 0 ? null : destino)

    const resultado = await escribirEnBff<unknown>(rutaEditar, 'PATCH', { project_id: destino })

    setEnCurso(false)

    if (!resultado.ok) {
      onElegido(actual)
      avisar.error(falloDeTicket(resultado, 'editar').texto)

      return
    }

    onCambiado()
  }

  return (
    <MenuContextual onOpenChange={(abierto) => { if (!abierto) setBusqueda('') }}>
      <DisparadorMenu asChild>
        <button
          type="button"
          disabled={enCurso}
          aria-label={`Cambiar ${nombre}`}
          className={cn(
            'rounded-control hover:bg-hover text-texto-sutil inline-flex size-6 shrink-0 cursor-pointer items-center justify-center',
            'transition-colors duration-rapida ease-neo',
            enCurso && 'cursor-progress opacity-60'
          )}
        >
          <ChevronDown size={14} strokeWidth={2} aria-hidden="true" />
        </button>
      </DisparadorMenu>

      <ContenidoMenu align="start" className="w-72">
        {opciones.length >= UMBRAL_BUSCADOR && (
          <BuscadorMenu valor={busqueda} onCambiar={setBusqueda} placeholder={`Buscar ${nombre}…`} />
        )}
        <div className="max-h-64 overflow-y-auto">
          <GrupoRadioMenu value={actual === null ? SIN_PROYECTO : String(actual)} onValueChange={(valor) => { void elegir(valor) }}>
            {busqueda.trim() === '' && actual !== null && (
              <ItemMenuRadio value={SIN_PROYECTO} disabled={enCurso}>Sin {nombre}</ItemMenuRadio>
            )}
            {visibles.map((proyecto) => (
              <ItemMenuRadio key={proyecto.id} value={String(proyecto.id)} disabled={enCurso}>
                <span className="truncate">{proyecto.name}</span>
              </ItemMenuRadio>
            ))}
          </GrupoRadioMenu>
          {visibles.length === 0 && <SinResultadosMenu />}
        </div>
      </ContenidoMenu>
    </MenuContextual>
  )
}
