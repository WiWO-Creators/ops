'use client'

import { useState, type ReactElement } from 'react'
import { Boton } from '@/componentes/formularios/Boton'
import { Cargando, ErrorEstado, Vacio } from '@/componentes/estado/Estados'
import { LimiteDeError } from '@/componentes/estado/LimiteDeError'
import { EnlaceProyecto } from '@/componentes/presentadores/EnlaceProyecto'
import { Insignia } from '@/componentes/presentadores/Insignia'
import { useRecurso } from '@/componentes/proyecto/carga'
import { EditorScope } from '@/componentes/proyecto/EditorScope'
import { VistaScope } from '@/componentes/proyecto/PanelScope'
import type { EstadoIa } from '@/dominio/ajustes'
import { GLOSARIO } from '@/dominio/glosario'
import { rutasDeScopeContrato, type EstadoScopeContrato } from '@/datos/scope'

interface PropsPanelScopeContrato {
  contratoId: number
  ia: EstadoIa
}

/**
 * Scope principal de un Contrato, en su ficha.
 *
 * Es el scope que heredan los Proyectos que se crean «dentro del scope principal»: se carga aca una
 * vez y el analisis de Tareas de cada uno de esos Proyectos lo usa como vara. Reutiliza el editor y
 * la vista del Scope de Proyecto (misma forma, mismas reglas); lo propio es la lista de Proyectos a
 * los que afecta editarlo, para que nadie cambie el alcance sin saber a cuantos toca.
 *
 * @param contratoId id del contrato
 * @param ia estado de la capa de IA: sin ella se lee y se edita a mano, pero no se interpreta
 * @returns el bloque Scope de la ficha
 */
export function PanelScopeContrato ({ contratoId, ia }: PropsPanelScopeContrato): ReactElement {
  const { estado, recargar } = useRecurso<EstadoScopeContrato>(
    rutasDeScopeContrato(contratoId).scope,
    `No se pudo cargar el ${GLOSARIO.scope.singular.toLowerCase()} del contrato.`
  )
  // Lo que devolvio el ultimo `PUT`, atado a la lectura sobre la que se hizo: si `useRecurso`
  // revalida y trae otra, gana la nueva.
  const [escrito, setEscrito] = useState<{ base: EstadoScopeContrato, valor: EstadoScopeContrato } | null>(null)
  const [editando, setEditando] = useState(false)

  if (estado.fase === 'cargando') return <Cargando mensaje={`Cargando el ${GLOSARIO.scope.singular.toLowerCase()}…`} />
  if (estado.fase === 'error') return <ErrorEstado detalle={estado.mensaje} onReintentar={recargar} />

  const base = estado.datos
  const datos = escrito !== null && escrito.base === base ? escrito.valor : base
  const { scope, proyectos, puede_editar: puedeEditar } = datos

  if (editando && puedeEditar) {
    return (
      <LimiteDeError zona={`${GLOSARIO.scope.singular} del contrato — editor`}>
        <EditorScope<EstadoScopeContrato>
          rutas={rutasDeScopeContrato(contratoId)}
          scope={scope}
          ia={ia}
          onGuardado={(guardado) => {
            setEscrito({ base, valor: guardado })
            setEditando(false)
          }}
          onCancelar={() => { setEditando(false) }}
        />
      </LimiteDeError>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      {scope === null
        ? (
          <Vacio
            titulo={`Este contrato todavía no tiene ${GLOSARIO.scope.singular.toLowerCase()}`}
            descripcion={`Cárgalo una vez: los ${GLOSARIO.espacio.plural.toLowerCase()} que se creen dentro del ${GLOSARIO.scope.singular.toLowerCase()} principal lo heredan y se revisan contra él.`}
            accion={puedeEditar
              ? <Boton variante="primario" tamano="chico" onClick={() => { setEditando(true) }}>Cargar {GLOSARIO.scope.singular.toLowerCase()}</Boton>
              : undefined}
          />
          )
        : <VistaScope scope={scope} puedeEditar={puedeEditar} onEditar={() => { setEditando(true) }} />}

      {proyectos.length > 0 && <ProyectosDelContrato proyectos={proyectos} />}
    </div>
  )
}

/** Los Proyectos vinculados al Contrato, con la marca de si van dentro del scope o son cotización aparte. */
function ProyectosDelContrato ({ proyectos }: { proyectos: EstadoScopeContrato['proyectos'] }): ReactElement {
  return (
    <section aria-labelledby="titulo-proyectos-scope" className="flex flex-col gap-2">
      <h3 id="titulo-proyectos-scope" className="text-texto text-sm font-semibold">
        {GLOSARIO.espacio.plural} de este contrato
      </h3>
      <ul className="border-linea divide-linea-suave rounded-tarjeta flex flex-col divide-y border text-sm">
        {proyectos.map((proyecto) => (
          <li key={proyecto.id} className="flex flex-wrap items-center gap-2 px-3 py-2">
            <EnlaceProyecto id={proyecto.id} nombre={proyecto.nombre} className="text-acento underline-offset-4 hover:underline" />
            <Insignia tono={proyecto.dentro_scope ? 'acento' : 'contorno'} tamano="chico" className="ml-auto">
              {proyecto.dentro_scope ? `Dentro del ${GLOSARIO.scope.singular.toLowerCase()}` : 'Cotización aparte'}
            </Insignia>
          </li>
        ))}
      </ul>
    </section>
  )
}
