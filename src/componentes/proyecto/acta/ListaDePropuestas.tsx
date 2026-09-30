'use client'

import type { ReactElement } from 'react'
import { Boton } from '@/componentes/formularios/Boton'
import { CLASES_CASILLA } from '@/componentes/formularios/Entrada'
import { ConfirmacionEnLinea } from '@/componentes/datos/ConfirmacionEnLinea'
import type { EstadoLookup } from '@/datos/recursos'
import type { PropuestaDeTarea } from '@/definiciones/actas'
import { FilaPropuesta } from './FilaPropuesta'
import { YaCreadas } from './YaCreadas'
import type { PropuestasDelActaEnPantalla } from './usePropuestasDelActa'

interface PropsLista {
  propuestas: PropuestasDelActaEnPantalla
  prioridades: EstadoLookup[]
  proyectoId: number
  puedeCrear: boolean
  puedeProponer: boolean
  /** Si se está confirmando "Crear todas". */
  confirmandoTodas: boolean
  onEditar: (propuesta: PropuestaDeTarea) => void
  onCrearTanda: () => void
  onCrearTodas: () => void
  onCancelarTodas: () => void
}

/**
 * Lo que se ve con la sección desplegada: por qué está vacía, las propuestas pendientes con su
 * selección para crear en tanda, y las que ya son Procesos.
 */
export function ListaDePropuestas ({
  propuestas,
  prioridades,
  proyectoId,
  puedeCrear,
  puedeProponer,
  confirmandoTodas,
  onEditar,
  onCrearTanda,
  onCrearTodas,
  onCancelarTodas
}: PropsLista): ReactElement {
  const { pendientes, creadas, hayPendientes, sinAnalizar, seleccionadas, enCurso } = propuestas

  return (
    <>
      {sinAnalizar && (
        <p className="text-texto-tenue text-sm">
          Este Meeting Paper todavía no se analizó en busca de tareas.
          {puedeProponer
            ? ' "Analizar buscando tareas" lo lee con IA y propone las que quedaron comprometidas; ninguna se crea sin que la confirmes.'
            : ''}
        </p>
      )}

      {!sinAnalizar && !hayPendientes && creadas.length === 0 && (
        <p className="text-texto-tenue text-sm">
          De este Meeting Paper no salieron tareas.
          {puedeProponer
            ? ' Si la reunión sí acordó algo, "Volver a analizar" le pide al modelo que lo vuelva a leer.'
            : ''}
        </p>
      )}

      {puedeCrear && hayPendientes && (
        <label className="text-texto-tenue flex w-fit cursor-pointer items-center gap-2 text-sm">
          <input
            type="checkbox"
            className={CLASES_CASILLA}
            checked={propuestas.todasSeleccionadas}
            disabled={enCurso !== null}
            onChange={propuestas.alternarTodas}
          />
          Seleccionar todas
        </label>
      )}

      {hayPendientes && (
        <ul className="flex flex-col gap-2">
          {pendientes.map((propuesta) => (
            <li key={propuesta.id}>
              <FilaPropuesta
                propuesta={propuesta}
                prioridades={prioridades}
                puedeCrear={puedeCrear}
                seleccionada={seleccionadas.includes(propuesta.id)}
                descartando={enCurso?.que === 'descartando' && enCurso.id === propuesta.id}
                creando={enCurso?.que === 'creando' && enCurso.fila === propuesta.id}
                bloqueada={enCurso !== null}
                onAlternar={() => { propuestas.alternar(propuesta.id) }}
                onCrear={() => { void propuestas.crear([propuesta.id], propuesta.id) }}
                onEditar={() => { onEditar(propuesta) }}
                onRenombrar={async (titulo) => await propuestas.parchear(propuesta.id, { titulo })}
                onDescartar={() => { void propuestas.descartar(propuesta) }}
              />
            </li>
          ))}
        </ul>
      )}

      {puedeCrear && hayPendientes && confirmandoTodas && (
        <ConfirmacionEnLinea
          advertencia={pendientes.length === 1
            ? 'Se crea 1 tarea en el tablero de este proyecto. Deshacerlo es borrarla a mano.'
            : `Se crean ${pendientes.length} tareas en el tablero de este proyecto. Deshacerlo es borrarlas una por una.`}
          etiquetaConfirmar={pendientes.length === 1 ? 'Crear 1 tarea' : `Crear ${pendientes.length} tareas`}
          varianteConfirmar="primario"
          onConfirmar={onCrearTodas}
          onCancelar={onCancelarTodas}
        />
      )}

      {puedeCrear && hayPendientes && !confirmandoTodas && (
        <div className="flex justify-end">
          <Boton
            variante="primario"
            tamano="chico"
            disabled={enCurso !== null}
            cargando={enCurso?.que === 'creando' && enCurso.fila === null}
            onClick={onCrearTanda}
          >
            {seleccionadas.length === 0
              ? `Crear todas (${pendientes.length})`
              : seleccionadas.length === 1 ? 'Crear 1 seleccionada' : `Crear ${seleccionadas.length} seleccionadas`}
          </Boton>
        </div>
      )}

      {creadas.length > 0 && <YaCreadas propuestas={creadas} proyectoId={proyectoId} />}
    </>
  )
}
