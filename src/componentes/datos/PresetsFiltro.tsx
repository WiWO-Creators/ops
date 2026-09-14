'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { Download, Trash2 } from 'lucide-react'
import { CerrarDialogo, ContenidoDialogo, Dialogo } from '@/componentes/superposiciones/Dialogo'
import { Boton } from '@/componentes/formularios/Boton'
import { Entrada } from '@/componentes/formularios/Entrada'
import { ContenidoMenu, DisparadorMenu, MenuContextual } from '@/componentes/superposiciones/MenuContextual'
import { escribirEnBff } from './mutaciones'
import { pedirSobre } from '@/datos/cliente'
import { descripcionDeCondicion, conflictosDePreset, leerPreset, TOPE_PRESET, type PresetPortable } from './presets'
import type { Hito, PresetFiltro } from '@/datos/recursos'
import type { DefinicionRecurso, OpcionFiltro } from '@/definiciones/tipos'

interface PropsPresetsFiltro<T> {
  board: PresetFiltro['board']
  filtrosActuales: Record<string, string[]>
  busqueda: string
  definicion: DefinicionRecurso<T>
  opcionesDeFiltro: Record<string, OpcionFiltro[]>
  onAplicar: (filtros: Record<string, string[]>, busqueda: string) => void
}

/** Presets personales compartidos entre vistas, con importación validada y referencias revisables. */
export function PresetsFiltro<T> ({ board, filtrosActuales, busqueda, definicion, opcionesDeFiltro, onAplicar }: PropsPresetsFiltro<T>) {
  const [presets, setPresets] = useState<PresetFiltro[] | null>(null)
  const [revision, setRevision] = useState(0)
  const [menuAbierto, setMenuAbierto] = useState(false)
  const [nombre, setNombre] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [borrandoId, setBorrandoId] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [errorCarga, setErrorCarga] = useState<string | null>(null)
  const [preparando, setPreparando] = useState(false)
  const [opcionesDestino, setOpcionesDestino] = useState<Record<string, OpcionFiltro[]> | null>(null)
  const [pendiente, setPendiente] = useState<{ filters: Record<string, string[]>, guardar: boolean } | null>(null)
  const archivo = useRef<HTMLInputElement>(null)
  const nombreId = useId()
  const actuales = { ...filtrosActuales, ...(busqueda.trim() === '' ? {} : { __q: [busqueda] }) }
  const conflictos = pendiente === null ? [] : conflictosDePreset(pendiente.filters, definicion, opcionesDestino ?? opcionesDeFiltro)

  useEffect(() => {
    const control = new AbortController()
    void pedirSobre<PresetFiltro[]>(`filter-presets?board=${board}`, control.signal)
      .then((sobre) => { if (!control.signal.aborted) { setPresets(sobre.data); setErrorCarga(null) } })
      .catch((error: unknown) => { if (!control.signal.aborted) setErrorCarga(error instanceof Error ? error.message : 'No se pudieron cargar los presets.') })
    return () => { control.abort() }
  }, [board, revision])

  /** Aplica búsqueda y filtros juntos; el contenedor restablece la paginación. */
  function aplicar (filters: Record<string, string[]>): void {
    const { __q, ...filtros } = filters
    onAplicar(filtros, __q?.[0] ?? '')
    setPendiente(null)
    setMenuAbierto(false)
  }

  /** Abre revisión antes de guardar o cuando un preset requiere adaptación al destino. */
  async function preparar (filters: Record<string, string[]>, name: string, guardar: boolean, revisar = false): Promise<void> {
    setError(null)
    setNombre(name)
    setMenuAbierto(false)
    setPreparando(true)
    let opciones = opcionesDeFiltro
    try {
      const proyecto = filters.project_id?.[0]
      if (filters.milestone_id?.length && proyecto !== undefined && /^\d+$/.test(proyecto) && definicion.filtros.some((filtro) => filtro.clave === 'project_id')) {
        const { data } = await pedirSobre<Hito[]>(`projects/${encodeURIComponent(proyecto)}/milestones?per_page=500`, new AbortController().signal)
        opciones = { ...opciones, milestones: [{ valor: '0', etiqueta: 'Sin hito' }, ...data.map((hito) => ({ valor: String(hito.id), etiqueta: hito.name }))] }
      }
      setOpcionesDestino(opciones)
      if (!guardar && !revisar && conflictosDePreset(filters, definicion, opciones).length === 0) aplicar(filters)
      else setPendiente({ filters, guardar })
    } catch (error) {
      setError(error instanceof Error ? error.message : 'No se pudo comprobar el proyecto del preset.')
    } finally { setPreparando(false) }
  }

  /** Guarda una copia privada; un fallo mantiene el borrador para reintentar. */
  async function guardar (): Promise<void> {
    if (pendiente === null || nombre.trim() === '' || conflictos.length > 0) return
    setGuardando(true)
    setError(null)
    const resultado = await escribirEnBff<PresetFiltro>('filter-presets', 'POST', { board, name: nombre.trim(), filters: pendiente.filters })
    setGuardando(false)
    if (!resultado.ok) { setError(resultado.mensaje); return }
    if (resultado.datos === undefined) { setError('El servidor no devolvió el preset guardado. Reintenta cargar los presets.'); return }
    setPresets((actuales) => [resultado.datos, ...(actuales ?? [])])
    aplicar(pendiente.filters)
  }

  /** Borra únicamente el preset solicitado y conserva visible cualquier error del servidor. */
  async function borrar (id: number): Promise<void> {
    setBorrandoId(id)
    const resultado = await escribirEnBff(`filter-presets/${id}`, 'DELETE')
    setBorrandoId(null)
    if (resultado.ok) setPresets((actuales) => (actuales ?? []).filter((preset) => preset.id !== id))
    else setError(resultado.mensaje)
  }

  /** Descarga un preset portable sin identificadores del dueño ni datos ajenos a sus condiciones. */
  function exportar (filters: Record<string, string[]>, name: string): void {
    const contenido: PresetPortable = { version: 1, board, name, filters }
    const url = URL.createObjectURL(new Blob([JSON.stringify(contenido, null, 2)], { type: 'application/json' }))
    const enlace = document.createElement('a')
    enlace.href = url
    enlace.download = `preset-${board}.json`
    enlace.click()
    URL.revokeObjectURL(url)
  }

  /** Lee un archivo acotado y lo mantiene en revisión hasta resolver todas las incompatibilidades. */
  async function importar (file: File | undefined): Promise<void> {
    if (file === undefined) return
    try {
      if (file.size > TOPE_PRESET) throw new Error('El preset supera los 16 KB.')
      const preset = leerPreset(await file.text(), board)
      await preparar(preset.filters, preset.name, true)
    } catch (error) { setError(error instanceof Error ? error.message : 'No se pudo leer el archivo.') }
  }

  return (
    <div className="flex max-w-full flex-wrap items-center gap-2">
      <MenuContextual open={menuAbierto} onOpenChange={setMenuAbierto}>
        <DisparadorMenu asChild><Boton tamano="chico" variante="sutil">Presets{presets === null ? '' : ` (${presets.length})`}</Boton></DisparadorMenu>
        <ContenidoMenu align="end" className="min-w-56">
          {errorCarga !== null
            ? <div className="p-2"><p role="alert" className="text-texto-peligro text-sm">{errorCarga}</p><Boton tamano="chico" onClick={() => { setRevision(revision + 1) }}>Reintentar</Boton></div>
            : presets === null ? <p className="p-2 text-sm">Cargando…</p> : presets.length === 0 ? <p className="p-2 text-sm">Sin presets guardados</p> : null}
          {presets?.map((preset) => (
            <div key={preset.id} className="flex items-center gap-1">
              <Boton variante="sutil" className="min-w-0 flex-1 justify-start truncate" disabled={preparando} onClick={() => { void preparar(preset.filters, preset.name, false) }}>{preset.name}</Boton>
              <Boton variante="sutil" soloIcono aria-label={`Exportar ${preset.name}`} onClick={() => { exportar(preset.filters, preset.name) }}><Download size={16} aria-hidden="true" /></Boton>
              <Boton variante="sutil" soloIcono aria-label={`Borrar ${preset.name}`} disabled={borrandoId === preset.id} onClick={() => { void borrar(preset.id) }}><Trash2 size={16} aria-hidden="true" /></Boton>
            </div>
          ))}
        </ContenidoMenu>
      </MenuContextual>
      <Boton tamano="chico" variante="sutil" disabled={preparando} onClick={() => { void preparar(actuales, '', true) }}>Guardar preset</Boton>
      <Boton tamano="chico" variante="sutil" disabled={preparando} onClick={() => { archivo.current?.click() }}>Importar preset</Boton>
      <input ref={archivo} type="file" accept=".json,application/json" className="sr-only" aria-label="Archivo de preset" onChange={(evento) => { void importar(evento.target.files?.[0]); evento.target.value = '' }} />
      {error !== null && pendiente === null && <p role="alert" className="text-texto-peligro text-sm">{error}</p>}
      <Dialogo open={pendiente !== null} onOpenChange={(abierto) => { if (!abierto && !guardando) setPendiente(null) }}>
        <ContenidoDialogo ancho="chico" titulo={pendiente?.guardar ? 'Guardar preset' : 'Adaptar preset a esta vista'}>
          <p className="mb-3 text-sm">Los presets son personales y se pueden reutilizar en otras vistas del mismo recurso.</p>
          {pendiente?.guardar && <label htmlFor={nombreId} className="mb-3 block text-sm">Nombre<Entrada id={nombreId} value={nombre} maxLength={80} onChange={(evento) => { setNombre(evento.target.value) }} /></label>}
          <p className="mb-3 text-sm">{Object.values(pendiente?.filters ?? {}).filter((valores) => valores.length > 0).length} condiciones. Se reemplazarán los filtros y la búsqueda actuales.</p>
          <ul className="mb-3 max-h-40 overflow-y-auto text-sm">
            {Object.entries(pendiente?.filters ?? {}).filter(([, valores]) => valores.length > 0).map(([clave, valores]) => (
              <li key={clave} className="break-words py-1"><strong>{clave === '__q' ? 'Búsqueda' : definicion.filtros.find((filtro) => filtro.clave === clave)?.etiqueta ?? clave}:</strong> {descripcionDeCondicion(clave, valores, definicion.filtros, opcionesDeFiltro)}</li>
            ))}
          </ul>
          {conflictos.map((conflicto) => (
            <div key={conflicto.clave} className="border-linea mb-3 rounded-chico border p-3">
              <p className="text-sm font-semibold">{conflicto.etiqueta}</p><p className="my-2 text-sm">{conflicto.motivo}</p>
              {conflicto.opciones.length > 0 && <select aria-label={`Reemplazar ${conflicto.etiqueta}`} value="" className="border-control-borde bg-control text-texto mb-2 h-9 w-full rounded-control border px-2 text-sm" onChange={(evento) => {
                if (pendiente !== null) void preparar({ ...pendiente.filters, [conflicto.clave]: [evento.target.value] }, nombre, pendiente.guardar, true)
              }}><option value="" disabled>Elegir reemplazo…</option>{conflicto.opciones.map((opcion) => <option key={opcion.valor} value={opcion.valor}>{opcion.etiqueta}</option>)}</select>}
              <Boton tamano="chico" variante="sutil" onClick={() => {
                if (pendiente === null) return
                const filtros = { ...pendiente.filters }
                delete filtros[conflicto.clave]
                setPendiente({ ...pendiente, filters: filtros })
              }}>Quitar condición</Boton>
            </div>
          ))}
          {error !== null && <p role="alert" className="text-texto-peligro mb-3 text-sm">{error}</p>}
          <div className="mt-4 flex justify-end gap-2">
            <CerrarDialogo asChild><Boton variante="sutil" disabled={guardando}>Cancelar</Boton></CerrarDialogo>
            <Boton variante="primario" cargando={guardando} disabled={preparando || conflictos.length > 0 || (pendiente?.guardar === true && nombre.trim() === '')} onClick={() => { if (pendiente?.guardar) void guardar(); else if (pendiente !== null) aplicar(pendiente.filters) }}>{pendiente?.guardar ? 'Guardar y aplicar' : 'Aplicar'}</Boton>
          </div>
        </ContenidoDialogo>
      </Dialogo>
    </div>
  )
}
