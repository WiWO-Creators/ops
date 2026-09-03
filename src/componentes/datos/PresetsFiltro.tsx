'use client'

import { useEffect, useState } from 'react'
import { CerrarDialogo, ContenidoDialogo, Dialogo } from '@/componentes/superposiciones/Dialogo'
import { Boton } from '@/componentes/formularios/Boton'
import { Entrada } from '@/componentes/formularios/Entrada'
import { ContenidoMenu, DisparadorMenu, MenuContextual } from '@/componentes/superposiciones/MenuContextual'
import { escribirEnBff } from './mutaciones'
import { pedirSobre } from '@/datos/cliente'
import type { PresetFiltro } from '@/datos/recursos'

/**
 * Presets personales de filtro de un tablero: cargar uno, guardar el estado actual, borrar uno.
 *
 * Privados por staff del lado de la API — acá no hay nada que decidir sobre a quién pertenecen, solo
 * pedirlos, mandarlos y mostrarlos.
 *
 * Cada fila del menu es un par de botones propios y no un `ItemMenu`: aplicar y borrar son dos
 * objetivos de clic independientes, y un `Item` de Radix solo expone uno.
 */

interface PropsPresetsFiltro {
  board: PresetFiltro['board']
  /** Los filtros vigentes de la vista, tal como los guardaría un preset nuevo. */
  filtrosActuales: Record<string, string[]>
  /** Aplica los filtros de un preset a la vista. */
  onAplicar: (filtros: Record<string, string[]>) => void
}

export function PresetsFiltro ({ board, filtrosActuales, onAplicar }: PropsPresetsFiltro) {
  const [presets, setPresets] = useState<PresetFiltro[] | null>(null)
  const [menuAbierto, setMenuAbierto] = useState(false)
  const [dialogoAbierto, setDialogoAbierto] = useState(false)
  const [nombre, setNombre] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [borrandoId, setBorrandoId] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const control = new AbortController()

    void pedirSobre<PresetFiltro[]>(`filter-presets?board=${board}`, control.signal)
      .then((sobre) => { if (!control.signal.aborted) setPresets(sobre.data) })
      .catch(() => { if (!control.signal.aborted) setPresets([]) })

    return () => { control.abort() }
  }, [board])

  const hayFiltrosPuestos = Object.values(filtrosActuales).some((valores) => valores.length > 0)

  async function guardar (): Promise<void> {
    if (nombre.trim() === '') return

    setGuardando(true)
    setError(null)

    const resultado = await escribirEnBff<PresetFiltro>('filter-presets', 'POST', {
      board,
      name: nombre.trim(),
      filters: filtrosActuales
    })

    setGuardando(false)

    if (!resultado.ok) {
      setError(resultado.mensaje)
      return
    }

    setPresets((actuales) => [resultado.datos, ...(actuales ?? [])])
    setNombre('')
    setDialogoAbierto(false)
  }

  async function borrar (id: number): Promise<void> {
    setBorrandoId(id)

    const resultado = await escribirEnBff(`filter-presets/${id}`, 'DELETE')

    setBorrandoId(null)

    if (resultado.ok) setPresets((actuales) => (actuales ?? []).filter((p) => p.id !== id))
  }

  return (
    <div className="flex items-center gap-2">
      <MenuContextual open={menuAbierto} onOpenChange={setMenuAbierto}>
        <DisparadorMenu asChild>
          <Boton tamano="chico" variante="sutil">
            Presets{presets !== null && presets.length > 0 ? ` (${presets.length})` : ''}
          </Boton>
        </DisparadorMenu>
        <ContenidoMenu align="end" className="min-w-56">
          {presets === null && (
            <p className="text-texto-tenue px-2.5 py-1.5 text-xs">Cargando…</p>
          )}
          {presets !== null && presets.length === 0 && (
            <p className="text-texto-tenue px-2.5 py-1.5 text-xs">Sin presets guardados</p>
          )}
          {presets?.map((preset) => (
            <div key={preset.id} className="hover:bg-hover flex items-center gap-1 rounded-chico">
              <button
                type="button"
                className="flex-1 truncate px-2.5 py-1.5 text-left text-sm"
                onClick={() => {
                  onAplicar(preset.filters)
                  setMenuAbierto(false)
                }}
              >
                {preset.name}
              </button>
              <button
                type="button"
                aria-label={`Borrar preset "${preset.name}"`}
                disabled={borrandoId === preset.id}
                className="text-texto-tenue hover:text-texto-peligro shrink-0 px-2 py-1.5 text-sm disabled:opacity-50"
                onClick={() => { void borrar(preset.id) }}
              >
                ×
              </button>
            </div>
          ))}
        </ContenidoMenu>
      </MenuContextual>

      <Boton
        tamano="chico"
        variante="sutil"
        disabled={!hayFiltrosPuestos}
        onClick={() => { setDialogoAbierto(true) }}
      >
        Guardar preset
      </Boton>

      <Dialogo open={dialogoAbierto} onOpenChange={setDialogoAbierto}>
        <ContenidoDialogo ancho="chico" titulo="Guardar preset de filtros">
          {error !== null && <p role="alert" className="text-texto-peligro mb-3 text-sm">{error}</p>}

          <label className="text-texto-tenue mb-1 block text-xs" htmlFor="nombre-preset">
            Nombre
          </label>
          <Entrada
            id="nombre-preset"
            value={nombre}
            onChange={(evento) => { setNombre(evento.target.value) }}
            placeholder="Ej: Mis pendientes"
            maxLength={80}
            autoFocus
          />

          <div className="mt-4 flex justify-end gap-2">
            <CerrarDialogo asChild>
              <Boton variante="sutil">Cancelar</Boton>
            </CerrarDialogo>
            <Boton
              variante="primario"
              cargando={guardando}
              disabled={nombre.trim() === ''}
              onClick={() => { void guardar() }}
            >
              Guardar
            </Boton>
          </div>
        </ContenidoDialogo>
      </Dialogo>
    </div>
  )
}
