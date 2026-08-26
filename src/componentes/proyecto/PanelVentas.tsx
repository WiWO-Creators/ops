'use client'

import { Suspense, useMemo, type ReactElement } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Cargando } from '@/componentes/estado/Estados'
import { Segmentado } from '@/componentes/formularios/Segmentado'
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
    <Suspense fallback={<Cargando mensaje="Cargando las ventas…" />}>
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
    <Segmentado
      etiqueta="Listas de ventas"
      opciones={LISTAS.map((lista) => ({ valor: lista.clave, etiqueta: lista.etiqueta }))}
      activo={activa.clave}
      onElegir={elegir}
    />
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
