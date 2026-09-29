'use client'

import { CircleCheck } from 'lucide-react'
import { cn } from '@/lib/clases'
import type {
  IndicadorDeSalud, ProblemaDeArea, ProblemaDePersona, SaludDeOrganizacion as Salud
} from '@/dominio/organizacion'

interface PropsSalud {
  salud: Salud
  /** El hueco que está filtrando ahora, para marcar su botón. */
  activo: string | null
  onPersonas: (problema: ProblemaDePersona) => void
  onAreas: (problema: ProblemaDeArea) => void
}

/**
 * La salud del organigrama: los huecos que dejan a alguien fuera de la jerarquía, con su cuenta.
 *
 * Cada contador es un botón que lleva a la lista ya filtrada, porque saber que hay 31 personas sin
 * área no sirve de nada si después hay que buscarlas una por una. Los que están en cero no se
 * muestran: un cero no pide nada, y una fila de ceros esconde al que sí importa.
 *
 * Ninguno es un error. Una casa que está armando su organigrama los tiene todos; por eso cada uno dice
 * su consecuencia y no un "falta".
 */
export function SaludDeOrganizacion ({ salud, activo, onPersonas, onAreas }: PropsSalud) {
  if (salud.total === 0) {
    return (
      <p className="text-texto-tenue flex items-center gap-2 text-sm">
        <CircleCheck aria-hidden="true" className="text-texto-exito size-4" />
        El organigrama no tiene huecos: toda la gente activa tiene área y jefe, y cada área tiene jefatura.
      </p>
    )
  }

  return (
    <section aria-label="Salud del organigrama" className="flex flex-wrap gap-2">
      {salud.personas.map((indicador) => (
        <Contador key={indicador.clave} indicador={indicador} activo={activo === indicador.clave} onElegir={onPersonas} />
      ))}
      {salud.areas.map((indicador) => (
        <Contador key={indicador.clave} indicador={indicador} activo={activo === indicador.clave} onElegir={onAreas} />
      ))}
    </section>
  )
}

/** Un contador de la salud, si tiene algo que contar. */
function Contador<P extends string> ({
  indicador, activo, onElegir
}: {
  indicador: IndicadorDeSalud<P>
  activo: boolean
  onElegir: (clave: P) => void
}) {
  if (indicador.ids.length === 0) return null

  return (
    <button
      type="button"
      title={indicador.consecuencia}
      aria-pressed={activo}
      onClick={() => { onElegir(indicador.clave) }}
      className={cn(
        'rounded-control border-linea flex items-center gap-2 border px-3 py-1.5 text-left text-sm transition-colors',
        activo ? 'bg-acento-suave border-acento text-texto' : 'bg-superficie hover:bg-hover text-texto'
      )}
    >
      <span className="font-titular tabular-nums font-semibold">{indicador.ids.length}</span>
      <span className="text-texto-tenue">{indicador.etiqueta}</span>
    </button>
  )
}
