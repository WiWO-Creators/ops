'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { AltaRapidaProceso } from './AltaRapidaProceso'
import type { Referencia } from '@/datos/recursos'
import type { OpcionFiltro } from '@/definiciones/tipos'

/** Abre el formulario común con el espacio de la pestaña preseleccionado. */
export function FormularioTarea ({ proyectoId, conIa, onCreada }: {
  proyectoId: number
  prioridades: OpcionFiltro[]
  etiquetasDisponibles: Referencia[]
  conIa: boolean
  onCreada: () => void
}) {
  const parametros = useSearchParams()
  const router = useRouter()
  /** Retira la orden de apertura para que el botón de cabecera pueda abrir otra alta. */
  function cerrar (): void {
    if (!parametros.has('nuevaTarea')) return
    const siguientes = new URLSearchParams(parametros.toString())
    siguientes.delete('nuevaTarea')
    router.replace(`?${siguientes.toString()}`, { scroll: false })
  }
  return <AltaRapidaProceso proyectoId={proyectoId} conIa={conIa} onCreada={onCreada} onCerrar={cerrar}
    key={`${proyectoId}-${parametros.get('nuevaTarea') ?? ''}`}
    abrirInicialmente={parametros.get('nuevaTarea') === '1'} />
}
