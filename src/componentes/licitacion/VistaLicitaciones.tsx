'use client'

import Link from 'next/link'
import { useMemo } from 'react'
import { TablaRecurso } from '@/componentes/datos/TablaRecurso'
import type { Licitacion } from '@/datos/recursos'
import type { Capacidad } from '@/datos/tipos'
import { LICITACIONES } from '@/definiciones/licitaciones'
import type { OpcionFiltro, ResultadoLista } from '@/definiciones/tipos'

/**
 * Listado de Licitaciones.
 *
 * Solo tabla: una licitacion se compara por empresa, estado y fecha de inicio, y esas tres
 * comparaciones se hacen en columnas. La vista de tarjetas de `/clientes` y `/espacios` existe porque
 * ahi hay imagen y avatares que mirar; aca no.
 *
 * Vive del lado cliente de la frontera por la misma restriccion que `TablaClientes`: una
 * `DefinicionRecurso` esta llena de funciones y **una funcion no cruza de un Server Component a uno
 * cliente**, asi que la definicion se importa de este lado y la pagina solo manda datos serializables.
 */
interface PropsVistaLicitaciones {
  /** Primera pagina ya resuelta en el servidor: sin esto la tabla parpadearia al montar. */
  inicial: ResultadoLista<Licitacion>
  /** Capacidades sobre `projects`: una Licitacion **es** un Espacio, y el backend usa ese permiso. */
  capacidades?: Capacidad[]
  opcionesDeFiltro?: Record<string, OpcionFiltro[]>
}

export function VistaLicitaciones ({
  inicial,
  capacidades = [],
  opcionesDeFiltro
}: PropsVistaLicitaciones) {

  // Se memoiza porque `TablaRecurso` la usa como dependencia de sus efectos: una definicion nueva en
  // cada render volveria a pedir la pagina en bucle.
  const definicion = useMemo(() => ({
    ...LICITACIONES,
    columnas: LICITACIONES.columnas.map((columna) => (
      columna.clave === 'company'
        ? {
            ...columna,
            presentar: (licitacion: Licitacion) => (
              <Link
                href={`/licitaciones/${licitacion.id}`}
                className="text-texto hover:text-acento font-medium underline-offset-4 hover:underline"
              >
                {licitacion.company}
              </Link>
            )
          }
        : columna
    ))
  }), [])

  return (
    <div className="flex flex-col gap-3">
      {capacidades.includes('create') && (
        <div className="flex justify-end">
          <Link href="/prospectos" className="text-acento text-sm font-semibold underline underline-offset-4">
            Crear licitación desde un prospecto
          </Link>
        </div>
      )}

      <TablaRecurso
        definicion={definicion}
        inicial={inicial}
        claveFila={(licitacion) => licitacion.id}
        capacidades={capacidades}
        opcionesDeFiltro={opcionesDeFiltro}
      />

    </div>
  )
}
