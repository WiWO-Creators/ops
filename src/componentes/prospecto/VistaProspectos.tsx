'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { TablaRecurso } from '@/componentes/datos/TablaRecurso'
import { Boton } from '@/componentes/formularios/Boton'
import { Insignia, type TonoInsignia } from '@/componentes/presentadores/Insignia'
import { FlujoLicitacion } from './FlujoLicitacion'
import type { OpcionCampo } from '@/componentes/proyecto/formulario'
import type { EstadoProspecto, Prospecto } from '@/datos/recursos'
import type { Capacidad } from '@/datos/tipos'
import { PROSPECTOS, etiquetaDeEstadoDeProspecto } from '@/definiciones/prospectos'
import type { ResultadoLista } from '@/definiciones/tipos'

/**
 * Tono de insignia de cada estado derivado.
 *
 * No sale de `comoInsignia`: ese camino resuelve el valor contra un catalogo de `/lookups`, y estos
 * cuatro estados los deriva la API del resumen de licitaciones, asi que ahi no estan y la celda
 * quedaria en blanco. El mapa vive aca —y no en `definiciones/prospectos.ts`— porque pintar una
 * insignia es JSX y ese archivo es `.ts` a proposito, para poder probarlo sin transformar.
 *
 * `sin_licitaciones` va en contorno y no en un tono lleno: no es un resultado, es la ausencia de
 * uno, y darle el mismo peso visual que a "Ganado" pondria a competir por la mirada a la fila que
 * menos tiene para contar.
 */
const TONO_DEL_ESTADO: Record<EstadoProspecto, TonoInsignia> = {
  abierto: 'acento',
  ganado: 'exito',
  perdido: 'peligro',
  sin_licitaciones: 'contorno'
}

/**
 * Listado de Prospectos.
 *
 * Solo tabla: un prospecto se compara por empresa, estado y cuantas licitaciones tiene, y esas tres
 * comparaciones se hacen en columnas.
 *
 * Vive del lado cliente de la frontera por la misma restriccion que `VistaLicitaciones`: una
 * `DefinicionRecurso` esta llena de funciones y **una funcion no cruza de un Server Component a uno
 * cliente**, asi que la definicion se importa de este lado y la pagina solo manda datos serializables.
 */
interface PropsVistaProspectos {
  usuarioId: number
  /** Primera pagina ya resuelta en el servidor: sin esto la tabla parpadearia al montar. */
  inicial: ResultadoLista<Prospecto>
  /** Capacidades sobre `projects`: el prospecto es la antesala de un Espacio y usa ese permiso. */
  capacidades?: Capacidad[]
  /** Catalogo `countries` de `GET /lookups`, para el formulario de alta. */
  paises: OpcionCampo[]
  /** Catalogo `areas` de `GET /lookups`, para el campo Área del alta de licitación. */
  areas: OpcionCampo[]
  /** Catalogo `staff` de `GET /lookups`, para los campos Owner y Focal del alta de licitación. */
  staff: OpcionCampo[]
}

export function VistaProspectos ({ inicial, capacidades = [], paises, areas, staff, usuarioId }: PropsVistaProspectos) {
  const router = useRouter()
  const [creando, setCreando] = useState(false)

  // Se memoiza porque `TablaRecurso` la usa como dependencia de sus efectos: una definicion nueva en
  // cada render volveria a pedir la pagina en bucle.
  const definicion = useMemo(() => ({
    ...PROSPECTOS,
    columnas: PROSPECTOS.columnas.map((columna) => {
      if (columna.clave === 'empresa') {
        return {
          ...columna,
          presentar: (prospecto: Prospecto) => (
            <Link
              href={`/prospectos/${prospecto.id}`}
              className="text-texto hover:text-acento font-medium underline-offset-4 hover:underline"
            >
              {prospecto.empresa}
            </Link>
          )
        }
      }

      if (columna.clave === 'estado') {
        return {
          ...columna,
          presentar: (prospecto: Prospecto) => (
            <Insignia tamano="chico" tono={TONO_DEL_ESTADO[prospecto.estado]}>
              {etiquetaDeEstadoDeProspecto(prospecto.estado)}
            </Insignia>
          )
        }
      }

      return columna
    })
  }), [])

  return (
    <div className="flex flex-col gap-3">
      <TablaRecurso
        definicion={definicion}
        inicial={inicial}
        claveFila={(prospecto) => prospecto.id}
        capacidades={capacidades}
        accion={capacidades.includes('create')
          ? (
            <Boton tamano="chico" variante="primario" onClick={() => { setCreando(true) }}>
              Nueva licitación
            </Boton>
            )
          : undefined}
      />

      {creando && capacidades.includes('create') && (
        <FlujoLicitacion
          usuarioId={usuarioId}
          capacidades={capacidades}
          paises={paises}
          areas={areas}
          staff={staff}
          onCerrar={() => { setCreando(false) }}
          onGuardado={() => { router.refresh() }}
        />
      )}
    </div>
  )
}
