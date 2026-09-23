'use client'

import { ChevronDown } from 'lucide-react'
import { useState, type ReactElement } from 'react'
import { Avatar } from '@/componentes/presentadores/Avatar'
import {
  BuscadorMenu, ContenidoMenu, DisparadorMenu, GrupoRadioMenu, ItemMenuRadio, MenuContextual, SinResultadosMenu
} from '@/componentes/superposiciones/MenuContextual'
import { escribirEnBff } from '@/componentes/datos/mutaciones'
import { cargarAsignables } from '@/datos/asignables'
import type { PersonaAsignable } from '@/datos/recursos'
import { filtrarPersonas } from '@/dominio/salas'
import { falloDeTicket, type PersonaDelTicket } from '@/dominio/ticket-vista'
import { cn } from '@/lib/clases'

/** Valor del menu para «Sin asignar». Perfex guarda `0` en `tbltickets.assigned` cuando no hay nadie. */
const SIN_ASIGNAR = '0'

type Personas =
  | { fase: 'sinPedir' }
  | { fase: 'cargando' }
  | { fase: 'error', mensaje: string }
  | { fase: 'listo', lista: PersonaAsignable[] }

/**
 * A quien del equipo esta asignado un ticket, y el menu para cambiarlo.
 *
 * La lista de personas es la de todo el panel (`cargarAsignables`, `/staff/asignables`, una vez por
 * pestaña): la misma que ofrece el asignado de una Tarea, asi nadie ve listas distintas en dos
 * selectores iguales. Se pide al abrir el menu y no al abrir el ticket: la mayoria de las veces el
 * ticket se lee y no se reasigna.
 *
 * Sin `puedeEditar` queda el nombre solo. El cambio es optimista y se revierte si la API lo rechaza.
 */
export function MenuAsignadoTicket ({
  asignado,
  rutaEditar,
  puedeEditar,
  onCambiado
}: {
  asignado: PersonaDelTicket | null
  /** `PATCH` del ticket, ya resuelta. */
  rutaEditar: string
  puedeEditar: boolean
  onCambiado: () => void
}): ReactElement {
  const [pintado, setPintado] = useState(asignado)
  const [ultimoDeLaApi, setUltimoDeLaApi] = useState(asignado)
  const [personas, setPersonas] = useState<Personas>({ fase: 'sinPedir' })
  const [busqueda, setBusqueda] = useState('')
  const [enCurso, setEnCurso] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Se realinea cuando la ficha recargada trae otro asignado, como `MenuCatalogoTicket`.
  if (ultimoDeLaApi?.id !== asignado?.id) {
    setUltimoDeLaApi(asignado)
    setPintado(asignado)
    setError(null)
  }

  const nombre = pintado?.nombre ?? 'Sin asignar'

  if (!puedeEditar) {
    return <span className={cn(pintado === null && 'text-texto-sutil')}>{nombre}</span>
  }

  /** Pide la lista al abrir el menu por primera vez, o de nuevo si la anterior fallo. */
  function alAbrir (abierto: boolean): void {
    if (!abierto) {
      setBusqueda('')
      return
    }

    if (personas.fase === 'listo' || personas.fase === 'cargando') return

    setPersonas({ fase: 'cargando' })
    cargarAsignables()
      .then((lista) => { setPersonas({ fase: 'listo', lista }) })
      .catch((fallo: unknown) => {
        setPersonas({ fase: 'error', mensaje: fallo instanceof Error ? fallo.message : 'No se pudo cargar el equipo.' })
      })
  }

  /**
   * Manda el cambio y avisa a quien monta el detalle.
   *
   * @param elegido el id elegido como texto del menu; {@link SIN_ASIGNAR} quita la asignacion
   */
  async function elegir (elegido: string): Promise<void> {
    const destino = Number(elegido)

    if (!Number.isInteger(destino) || destino < 0 || destino === (pintado?.id ?? 0) || enCurso) return

    const previo = pintado
    const persona = personas.fase === 'listo' ? personas.lista.find((p) => p.id === destino) : undefined

    setPintado(destino === 0 ? null : { id: destino, nombre: persona?.full_name ?? `Persona #${destino}` })
    setError(null)
    setEnCurso(true)

    const resultado = await escribirEnBff<unknown>(rutaEditar, 'PATCH', { assigned: destino })

    setEnCurso(false)

    if (!resultado.ok) {
      setPintado(previo)
      setError(falloDeTicket(resultado, 'editar').texto)

      return
    }

    onCambiado()
  }

  return (
    <span className="flex flex-col items-start gap-1">
      <MenuContextual onOpenChange={alAbrir}>
        <DisparadorMenu asChild>
          <button
            type="button"
            disabled={enCurso}
            aria-label={`Asignado: ${nombre}. Cambiar asignado.`}
            className={cn(
              'rounded-control hover:bg-hover -mx-1.5 inline-flex max-w-full cursor-pointer items-center gap-1.5 px-1.5 py-0.5',
              'transition-colors duration-150',
              enCurso && 'cursor-progress opacity-60'
            )}
          >
            {pintado !== null && <Avatar nombre={pintado.nombre} imagen={null} tamano="chico" />}
            <span className={cn('truncate', pintado === null && 'text-texto-sutil')}>{nombre}</span>
            <ChevronDown size={14} strokeWidth={2} aria-hidden="true" className="text-texto-sutil shrink-0" />
          </button>
        </DisparadorMenu>

        <ContenidoMenu align="start" className="w-72">
          <OpcionesDePersonas
            personas={personas}
            busqueda={busqueda}
            onBuscar={setBusqueda}
            elegido={pintado === null ? SIN_ASIGNAR : String(pintado.id)}
            onElegir={(valor) => { void elegir(valor) }}
            deshabilitado={enCurso}
          />
        </ContenidoMenu>
      </MenuContextual>

      {error !== null && <span role="alert" className="text-texto-peligro text-xs">{error}</span>}
    </span>
  )
}

/** El cuerpo del menu segun en que va la carga de personas. */
function OpcionesDePersonas ({
  personas,
  busqueda,
  onBuscar,
  elegido,
  onElegir,
  deshabilitado
}: {
  personas: Personas
  busqueda: string
  onBuscar: (valor: string) => void
  elegido: string
  onElegir: (valor: string) => void
  deshabilitado: boolean
}): ReactElement {
  if (personas.fase === 'error') {
    return <p role="alert" className="text-texto-peligro px-2.5 py-2 text-sm">{personas.mensaje}</p>
  }

  if (personas.fase !== 'listo') {
    return <p role="status" className="text-texto-sutil px-2.5 py-2 text-sm">Cargando el equipo…</p>
  }

  const visibles = filtrarPersonas(personas.lista, busqueda)

  return (
    <>
      <BuscadorMenu valor={busqueda} onCambiar={onBuscar} placeholder="Buscar persona…" />
      <div className="max-h-64 overflow-y-auto">
        <GrupoRadioMenu value={elegido} onValueChange={onElegir}>
          {busqueda.trim() === '' && (
            <ItemMenuRadio value={SIN_ASIGNAR} disabled={deshabilitado}>Sin asignar</ItemMenuRadio>
          )}
          {visibles.map((persona) => (
            <ItemMenuRadio key={persona.id} value={String(persona.id)} disabled={deshabilitado}>
              <span className="truncate">{persona.full_name}</span>
            </ItemMenuRadio>
          ))}
        </GrupoRadioMenu>
        {visibles.length === 0 && <SinResultadosMenu />}
      </div>
    </>
  )
}
