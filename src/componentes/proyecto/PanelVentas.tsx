'use client'

import { Suspense, useMemo, type ReactElement } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Cargando } from '@/componentes/estado/Estados'
import { cn } from '@/lib/clases'
import { PanelRecurso } from './PanelRecurso'
import { FACTURAS, GASTOS, PRESUPUESTOS } from '@/definiciones/ventas'
import type { DefinicionRecurso } from '@/definiciones/tipos'

/** Lo unico que el motor de tabla necesita de una fila de ventas: como identificarla. */
interface FilaVenta {
  id: number
}

/**
 * Pestaña Ventas: gastos, facturas y presupuestos del Proyecto.
 *
 * En el panel viejo son tres pestañas hermanas dentro de un desplegable. Aca son un selector dentro
 * de una sola pestaña: tres entradas en la barra principal para tres listas que casi siempre estan
 * vacias empujarian el resto fuera de la pantalla.
 *
 * La lista elegida viaja en `?ventas=`, igual que el resto del estado de las vistas.
 */

/** Las tres listas, en el orden del panel. */
const LISTAS = [
  { clave: 'gastos', etiqueta: 'Gastos', definicion: GASTOS, subruta: 'expenses' },
  { clave: 'facturas', etiqueta: 'Facturas', definicion: FACTURAS, subruta: 'invoices' },
  { clave: 'presupuestos', etiqueta: 'Presupuestos', definicion: PRESUPUESTOS, subruta: 'estimates' }
] as const

export function PanelVentas ({ proyectoId }: { proyectoId: number }): ReactElement {
  // Lee `useSearchParams`: sin este limite de Suspense el build de la pagina falla.
  return (
    <Suspense fallback={<Cargando filas={6} />}>
      <VentasDelProyecto proyectoId={proyectoId} />
    </Suspense>
  )
}

function VentasDelProyecto ({ proyectoId }: { proyectoId: number }): ReactElement {
  const router = useRouter()
  const params = useSearchParams()

  const pedida = params.get('ventas')
  const activa = LISTAS.find((lista) => lista.clave === pedida) ?? LISTAS[0]

  // Las tres definiciones tienen filas distintas (`GastoEspacio` y `DocumentoVenta`), y el motor de
  // tabla solo necesita saber identificar la fila. Se estrecha a lo unico que comparten en vez de
  // duplicar la pestaña tres veces para complacer al compilador.
  const definicion = useMemo(
    () => ({
      ...activa.definicion,
      ruta: `projects/${encodeURIComponent(String(proyectoId))}/${activa.subruta}`
    }) as unknown as DefinicionRecurso<FilaVenta>,
    [proyectoId, activa]
  )

  /** Cambia de lista conservando el resto de la vista, y descarta la paginacion de la anterior. */
  function elegir (clave: string): void {
    const siguientes = new URLSearchParams(params.toString())
    siguientes.set('ventas', clave)
    siguientes.delete('page')
    siguientes.delete('sort')

    router.replace(`?${siguientes.toString()}`, { scroll: false })
  }

  const barra = (
    <div role="group" aria-label="Listas de ventas" className="flex flex-wrap gap-1">
      {LISTAS.map((lista) => (
        <button
          key={lista.clave}
          type="button"
          aria-pressed={lista.clave === activa.clave}
          onClick={() => { elegir(lista.clave) }}
          className={cn(
            'rounded-control px-3 py-1 text-xs font-medium transition-colors',
            lista.clave === activa.clave
              ? 'bg-seleccionado text-texto'
              : 'text-texto-tenue hover:bg-hover hover:text-texto'
          )}
        >
          {lista.etiqueta}
        </button>
      ))}
    </div>
  )

  return (
    <PanelRecurso
      // Remonta al cambiar de lista: las tres tienen columnas y filtros distintos.
      key={activa.clave}
      definicion={definicion}
      claveFila={(fila) => fila.id}
      barra={barra}
    />
  )
}
