'use client'

import Link from 'next/link'
import { useMemo } from 'react'
import { TablaRecurso } from '@/componentes/datos/TablaRecurso'
import { CLIENTES } from '@/definiciones/clientes'
import type { OpcionFiltro, ResultadoLista } from '@/definiciones/tipos'
import type { Cliente } from '@/datos/recursos'
import type { Capacidad } from '@/datos/tipos'

/**
 * La tabla de Clientes con el nombre enlazado a su detalle.
 *
 * Existe por la misma restriccion que `componentes/datos/vistas.tsx`: una `DefinicionRecurso` esta
 * llena de funciones y **una funcion no cruza de un Server Component a uno cliente**, asi que la
 * definicion se importa de este lado de la frontera y la pagina solo manda datos serializables.
 *
 * El enlace se agrega aca y no en `definiciones/clientes.ts` porque ese archivo es `.ts`: no puede
 * contener JSX, y ademas sus presentadores alimentan la exportacion a CSV, donde una etiqueta `<a>`
 * seria basura. Misma division que en Espacios.
 *
 * @param inicial Primera pagina ya resuelta en el servidor.
 * @param capacidades Capacidades sobre `customers`, de `permissions` de `/me`.
 * @param opcionesDeFiltro Opciones de los filtros que salen de `/lookups`.
 * @returns El motor de tabla con la columna `company` enlazada.
 */
export function TablaClientes ({
  inicial,
  capacidades,
  opcionesDeFiltro
}: {
  inicial: ResultadoLista<Cliente>
  capacidades?: Capacidad[]
  opcionesDeFiltro?: Record<string, OpcionFiltro[]>
}) {
  // Se memoiza porque `TablaRecurso` la usa como dependencia de sus efectos: una definicion nueva en
  // cada render volveria a pedir la pagina en bucle.
  const definicion = useMemo(() => ({
    ...CLIENTES,
    columnas: CLIENTES.columnas.map((columna) => (
      columna.clave === 'company'
        ? {
            ...columna,
            presentar: (cliente: Cliente) => (
              <Link
                href={`/clientes/${cliente.id}`}
                className="text-texto hover:text-acento font-medium underline-offset-4 hover:underline"
              >
                {cliente.company}
              </Link>
            )
          }
        : columna
    ))
  }), [])

  return (
    <TablaRecurso
      definicion={definicion}
      inicial={inicial}
      claveFila={(cliente) => cliente.id}
      capacidades={capacidades}
      opcionesDeFiltro={opcionesDeFiltro}
    />
  )
}
