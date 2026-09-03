'use client'

import { useMemo } from 'react'
import { useRouter, useSearchParams, type ReadonlyURLSearchParams } from 'next/navigation'
import { construirConsulta, leerConsulta } from '@/datos/consulta'
import { useRecurso } from '@/componentes/proyecto/carga'
import { Cargando, ErrorEstado, Vacio } from '@/componentes/estado/Estados'
import { ControlesTabla } from './ControlesTabla'
import { PresetsFiltro } from './PresetsFiltro'
import { Tablero } from './Tablero'
import { unirConsultas } from './tabla'
import type { CuerpoMover, FilaConId, GrupoTablero } from './tablero'
import type { DefinicionRecurso, EstadoConsulta, OpcionFiltro } from '@/definiciones/tipos'
import type { PresetFiltro } from '@/datos/recursos'

/**
 * Un tablero kanban con su propia barra de filtros y presets.
 *
 * Es `Tablero` mas lo que le falta para que los filtros sean editables desde ahí: hasta ahora un
 * tablero solo heredaba los filtros que alguien ya había puesto en la URL —al llegar desde la tabla,
 * o desde una tarjeta de resumen—, pero no había forma de ponerlos ni de sacarlos estando parado en
 * el tablero.
 *
 * El estado de los filtros vive en la URL, igual que en `TablaRecurso`: así una vista filtrada se
 * comparte con un enlace. Cada cambio vuelve a pedir el tablero entero al BFF —no hay `inicial` desde
 * el servidor— y por eso el primer pintado siempre muestra el bloque de carga, igual que ya hace el
 * tablero de Hitos.
 */

interface PropsTableroFiltrable<T extends FilaConId> {
  definicion: DefinicionRecurso<T>
  /** Primer segmento de la ruta en el BFF. Ej: `tasks`, o `projects/80/milestones`. */
  ruta: string
  /** Bajo que tablero se guardan y se leen los presets. */
  board: PresetFiltro['board']
  /** Opciones ya resueltas de los filtros que las sacan de `/lookups`. */
  opcionesDeFiltro?: Record<string, OpcionFiltro[]>
  mensajeError?: string
  tituloVacio?: string
  descripcionVacio?: string
  adaptarCuerpo?: (cuerpo: CuerpoMover) => unknown
  ordenarColumnas?: (grupos: Array<GrupoTablero<T>>) => Array<GrupoTablero<T>>
}

export function TableroFiltrable<T extends FilaConId> ({
  definicion,
  ruta,
  board,
  opcionesDeFiltro,
  mensajeError = 'No se pudo cargar el tablero.',
  tituloVacio = 'Sin tarjetas',
  descripcionVacio,
  adaptarCuerpo,
  ordenarColumnas
}: PropsTableroFiltrable<T>) {
  const router = useRouter()
  const params = useSearchParams()

  const estado = useMemo(
    () => leerConsulta(new URLSearchParams(params.toString()), definicion),
    [params, definicion]
  )
  const consulta = useMemo(
    () => unirConsultas(definicion.consultaFija, construirConsulta(estado, definicion)),
    [estado, definicion]
  )

  const { estado: carga, recargar } = useRecurso<Array<GrupoTablero<T>>>(
    `${ruta}?vista=tablero${consulta === '' ? '' : `&${consulta}`}`,
    mensajeError
  )

  /** Aplica un cambio parcial de filtros escribiéndolo en la URL, que es su única fuente. */
  function cambiar (parcial: Partial<EstadoConsulta>): void {
    const siguiente = { ...estado, ...parcial }
    const query = construirConsulta(siguiente, definicion)

    router.replace(conParametrosPropios(params, estado, definicion, query), { scroll: false })
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <ControlesTabla
          definicion={definicion}
          estado={estado}
          visibles={[]}
          opcionesDeFiltro={opcionesDeFiltro}
          onCambiar={cambiar}
          onVisibles={() => {}}
          sinColumnas
        />
        <PresetsFiltro
          board={board}
          filtrosActuales={estado.filtros}
          onAplicar={(filtros) => { cambiar({ filtros }) }}
        />
      </div>

      {carga.fase === 'cargando' && <Cargando mensaje="Cargando el tablero…" />}

      {carga.fase === 'error' && <ErrorEstado detalle={carga.mensaje} onReintentar={recargar} />}

      {carga.fase === 'listo' && (
        (ordenarColumnas?.(carga.datos) ?? carga.datos).length === 0
          ? <Vacio titulo={tituloVacio} descripcion={descripcionVacio} />
          : (
            <Tablero
              key={consulta}
              definicion={definicion}
              inicial={carga.datos}
              consulta={consulta}
              adaptarCuerpo={adaptarCuerpo}
              ordenarColumnas={ordenarColumnas}
            />
            )
      )}
    </div>
  )
}

/**
 * Combina la consulta nueva de filtros con los parametros de la URL que no le pertenecen.
 *
 * Sin esto cada cambio de filtro reescribiria la query entera y se llevaria puesto lo que otra parte
 * de la pantalla haya guardado ahí —`vistaHitos`, `excluirCompletadas`, `tarea`—. Se descartan solo
 * las claves que produce la consulta vigente de la definicion: lo demas es de otro dueño.
 */
function conParametrosPropios<T> (
  params: ReadonlyURLSearchParams,
  estado: EstadoConsulta,
  definicion: DefinicionRecurso<T>,
  query: string
): string {
  const ajenos = new URLSearchParams(params.toString())

  for (const clave of new URLSearchParams(construirConsulta(estado, definicion)).keys()) {
    ajenos.delete(clave)
  }

  const combinada = [query, ajenos.toString()].filter((parte) => parte !== '').join('&')

  return combinada === '' ? '?' : `?${combinada}`
}
