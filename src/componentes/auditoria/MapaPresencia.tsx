'use client'

import { useId, useState } from 'react'
import { Building2, ChevronLeft, ChevronRight, FolderOpen, ListTodo, MoveHorizontal, Users } from 'lucide-react'
import { cn } from '@/lib/clases'
import type { RamaPresencia } from './presentacion'
import { PersonaActiva } from './PersonaActiva'
import estilos from './MapaPresencia.module.css'

/** Muestra la misma jerarquía de presencia como tarjetas conectadas en un lienzo desplazable. */
export function MapaPresencia ({ ramas }: { ramas: RamaPresencia[] }) {
  const ayudaId = useId()

  return (
    <div className="border-linea bg-superficie-hundida rounded-tarjeta overflow-hidden border">
      <p id={ayudaId} className="text-texto-tenue border-linea flex items-center gap-2 border-b px-4 py-3 text-xs">
        <MoveHorizontal size={16} aria-hidden="true" className="shrink-0" />
        Desplázate por el mapa y pliega las ramas para enfocar el trabajo.
      </p>
      <div
        role="region"
        aria-label="Mapa de actividad por cliente, proyecto y tarea"
        aria-describedby={ayudaId}
        tabIndex={0}
        className={cn(estilos.lienzo, 'focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-acento')}
      >
        <ul className={estilos.mapa}>
          {ramas.map((rama) => <NodoPresencia key={rama.clave} rama={rama} />)}
        </ul>
      </div>
    </div>
  )
}

/** Tarjeta de entidad y sus ramas; el estado local conserva los pliegues entre latidos. */
function NodoPresencia ({ rama }: { rama: RamaPresencia }) {
  const [abierta, setAbierta] = useState(true)
  const hijosId = useId()
  const esCliente = rama.clave.startsWith('cliente:')
  const esProyecto = rama.clave.startsWith('proyecto:')
  const tipo = esCliente ? 'Cliente' : esProyecto ? 'Proyecto' : 'Tarea'
  const Icono = esCliente ? Building2 : esProyecto ? FolderOpen : ListTodo
  const conHijos = rama.ramas.length > 0

  return (
    <li className={estilos.rama} data-nodo-presencia={rama.clave}>
      <article
        aria-label={`${tipo}: ${rama.nombre}`}
        className={cn(estilos.tarjeta, conHijos && abierta && estilos.conectada,
          'border-linea bg-superficie-elevada rounded-tarjeta border')}
      >
        <div className="flex flex-col gap-3 p-4">
          <div className="flex items-center justify-between gap-2">
            <span className={cn('flex items-center gap-2 text-xs font-medium', esCliente ? 'text-acento' : 'text-texto-tenue')}>
              <Icono size={16} strokeWidth={1.75} aria-hidden="true" />{tipo}
            </span>
            <span className="text-texto-tenue flex items-center gap-1.5 text-xs tabular-nums">
              <Users size={14} aria-hidden="true" />{rama.total}
              <span className="sr-only">{rama.total === 1 ? 'persona activa' : 'personas activas'}</span>
            </span>
          </div>
          <h3 className="text-texto text-balance break-words text-sm font-semibold [overflow-wrap:anywhere]">{rama.nombre}</h3>
          {rama.personas.length > 0 && (
            <ul className="divide-linea-suave border-linea-suave divide-y border-t">
              {rama.personas.map((persona) => <PersonaActiva key={persona.staff.id} persona={persona} compacta />)}
            </ul>
          )}
        </div>
        {conHijos && (
          <button
            type="button"
            aria-label={`${abierta ? 'Contraer' : 'Expandir'} ${rama.nombre}`}
            aria-expanded={abierta}
            aria-controls={hijosId}
            onClick={() => setAbierta(!abierta)}
            className="text-texto-tenue border-linea hover:bg-hover flex min-h-11 w-full items-center justify-between gap-2 rounded-b-[inherit] border-t px-4 py-2 text-xs focus-visible:outline-2 focus-visible:outline-acento"
          >
            <span>{rama.ramas.length} {esCliente ? (rama.ramas.length === 1 ? 'proyecto' : 'proyectos') : (rama.ramas.length === 1 ? 'tarea' : 'tareas')}</span>
            {abierta ? <ChevronLeft size={16} aria-hidden="true" /> : <ChevronRight size={16} aria-hidden="true" />}
          </button>
        )}
      </article>
      {conHijos && (
        <ul id={hijosId} className={estilos.hijos} hidden={!abierta}>
          {rama.ramas.map((hija) => <NodoPresencia key={hija.clave} rama={hija} />)}
        </ul>
      )}
    </li>
  )
}
