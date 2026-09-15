'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Pencil } from 'lucide-react'
import { Boton } from '@/componentes/formularios/Boton'
import { SelectorPersonas } from '@/componentes/formularios/SelectorPersonas'
import { GrupoAvatares } from '@/componentes/presentadores/Avatar'
import { escribirEnBff } from '@/componentes/datos/mutaciones'
import { cargarAsignables } from '@/datos/asignables'
import { pedirSobre } from '@/datos/cliente'
import type { StaffReferencia } from '@/datos/tipos'

/**
 * Muestra el equipo y permite editarlo a quienes tienen `projects.edit`.
 *
 * El equipo **es** el boton: se toca a la gente para cambiar la gente. Antes al lado de los avatares
 * colgaba un "Editar equipo" que competia por atencion con las acciones reales de la cabecera —crear
 * un proceso, mover el estado— siendo mucho menos frecuente que cualquiera de las dos.
 */
export function EquipoProyecto ({ proyectoId, miembros, puedeEditar, yoId }: {
  proyectoId: number
  miembros: StaffReferencia[]
  puedeEditar: boolean
  /** Quien mira. Sin esto no se puede distinguir sacar a otro de sacarse uno mismo. */
  yoId?: number
}) {
  const router = useRouter()
  const [editando, setEditando] = useState(false)
  const [guardado, setGuardado] = useState(false)

  const equipo = miembros.length > 0
    ? <GrupoAvatares personas={miembros} maximo={5} />
    : <span className="text-texto-sutil">{puedeEditar ? 'Añadir personas' : 'Sin personas'}</span>

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        {puedeEditar && !editando
          ? (
            <button
              type="button"
              onClick={() => { setGuardado(false); setEditando(true) }}
              aria-label="Editar el equipo del proyecto"
              className="rounded-control hover:bg-hover duration-rapida -m-1 flex cursor-pointer items-center gap-2 p-1 transition-colors"
            >
              {equipo}
              {/* El lapiz se queda siempre, tenue: en tactil no hay hover que revele nada, y sin el
                  los avatares no se leen como algo que se pueda tocar. */}
              <Pencil aria-hidden="true" className="text-texto-sutil size-3.5 shrink-0" strokeWidth={1.5} />
            </button>
            )
          : equipo}
        {guardado && <span role="status" className="text-texto-tenue text-xs">Equipo actualizado.</span>}
      </div>
      {puedeEditar && editando && (
        <EditorEquipo
          proyectoId={proyectoId}
          yoId={yoId}
          onCancelar={() => setEditando(false)}
          onGuardado={() => { setEditando(false); setGuardado(true); router.refresh() }}
          onSalidaPropia={() => { router.push('/proyectos') }}
        />
      )}
    </div>
  )
}

/** Carga el equipo actual al abrir y reemplaza sus miembros al guardar; conserva errores y cambios. */
function EditorEquipo ({ proyectoId, yoId, onCancelar, onGuardado, onSalidaPropia }: {
  proyectoId: number
  yoId?: number
  onCancelar: () => void
  onGuardado: () => void
  onSalidaPropia: () => void
}) {
  const [personas, setPersonas] = useState<StaffReferencia[]>([])
  const [elegidas, setElegidas] = useState<number[]>([])
  const [cargando, setCargando] = useState(true)
  const [cargado, setCargado] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const aborto = new AbortController()
    void Promise.all([
      cargarAsignables(),
      pedirSobre<StaffReferencia[]>(`projects/${proyectoId}/members`, aborto.signal)
    ]).then(([asignables, equipo]) => {
      if (aborto.signal.aborted) return
      // Conserva miembros inactivos que ya no aparecen en el catálogo de asignables.
      setPersonas([...new Map([...asignables, ...equipo.data].map((persona) => [persona.id, persona])).values()])
      setElegidas(equipo.data.map((persona) => persona.id))
      setCargado(true)
    }).catch((fallo: unknown) => {
      if (!aborto.signal.aborted) setError(fallo instanceof Error ? fallo.message : 'No se pudo cargar el equipo.')
    }).finally(() => {
      if (!aborto.signal.aborted) setCargando(false)
    })
    return () => aborto.abort()
  }, [proyectoId])

  /** Envía únicamente los IDs seleccionados; una lista vacía deja el proyecto sin miembros. */
  async function guardar (evento: React.FormEvent) {
    evento.preventDefault()
    if (!cargado || enviando) return
    setEnviando(true)
    setError(null)
    const resultado = await escribirEnBff(`projects/${proyectoId}/members`, 'PUT', { members: elegidas })
    setEnviando(false)
    if (!resultado.ok) {
      setError(resultado.mensaje)
      return
    }

    // Sacarse uno mismo no se refresca, se sale: sin `projects.view` global el proyecto deja de ser
    // visible en el mismo instante en que se guarda, y quedarse aca daria un 404 sobre una pantalla
    // que ya no corresponde ver. Mismo destino que "Salir del proyecto".
    if (yoId !== undefined && !elegidas.includes(yoId)) {
      onSalidaPropia()
      return
    }

    onGuardado()
  }

  return (
    <form onSubmit={guardar} className="flex w-full max-w-md flex-col gap-3">
      {cargando && <p role="status">Cargando equipo…</p>}
      {error !== null && <p role="alert" className="text-texto-peligro text-sm">{error} Cierra y vuelve a intentar si el problema continúa.</p>}
      {cargado && (
        <fieldset disabled={enviando} className="min-w-0">
          <legend className="mb-2 text-sm font-medium">Personas del proyecto</legend>
          <SelectorPersonas personas={personas} elegidas={elegidas} onCambiar={setElegidas} />
          {elegidas.length === 0 && <p className="text-texto-tenue mt-2 text-xs">El proyecto quedará sin miembros.</p>}
        </fieldset>
      )}
      <div className="flex flex-wrap gap-2">
        <Boton type="submit" tamano="chico" variante="primario" disabled={!cargado || enviando} cargando={enviando}>Guardar equipo</Boton>
        <Boton tamano="chico" disabled={enviando} onClick={onCancelar}>Cancelar</Boton>
      </div>
    </form>
  )
}
