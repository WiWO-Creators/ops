'use client'

import { useState, type ReactElement } from 'react'
import { Boton } from '@/componentes/formularios/Boton'
import { Cargando, ErrorEstado, Vacio } from '@/componentes/estado/Estados'
import { LimiteDeError } from '@/componentes/estado/LimiteDeError'
import { Fecha } from '@/componentes/presentadores/Fecha'
import { Insignia } from '@/componentes/presentadores/Insignia'
import { FUENTES_SCOPE, ROTULO_LISTA } from '@/dominio/scope'
import { GLOSARIO } from '@/dominio/glosario'
import type { EstadoIa } from '@/dominio/ajustes'
import { rutasDeScope, type AnalisisScope, type EstadoScope, type Scope } from '@/datos/scope'
import { useRecurso } from './carga'
import { AnalisisDelScope } from './AnalisisScope'
import { EditorScope } from './EditorScope'

/**
 * Pestaña Scope del Proyecto: el alcance contratado y el analisis de las Tareas contra el.
 *
 * El área comercial carga el Scope —estructurado, pegado o en PDF—, la IA muestra lo que entendio y
 * recien entonces se guarda. Despues, cualquiera que vea el Proyecto puede pedir el analisis, que
 * clasifica cada Tarea como dentro, fuera o dudosa. Esas dos ultimas se marcan tambien en la pestaña
 * Tareas.
 *
 * **Solo equipo.** No tiene version de portal: el Scope es una conversacion comercial interna, y el
 * veredicto "fuera de scope" sobre una Tarea no es algo que el cliente deba leer en su pantalla.
 *
 * Quien puede editar lo decide la API (`puede_editar` en el `GET`), no este panel: la regla vive en un
 * solo metodo del backend para poder endurecerla despues sin tocar el frontend.
 */

interface PropsPanelScope {
  proyectoId: number
  /**
   * Estado de la capa de IA. Sin ella el Scope se lee igual —el `GET` no cuelga de `/ia/*`— pero no
   * se interpreta ni se analiza. Llega con el motivo para decirlo, como en el Meeting Paper.
   */
  ia: EstadoIa
}

export function PanelScope ({ proyectoId, ia }: PropsPanelScope): ReactElement {
  const { estado, recargar } = useRecurso<EstadoScope>(
    rutasDeScope(proyectoId).scope,
    `No se pudo cargar el ${GLOSARIO.scope.singular.toLowerCase()}.`
  )
  // Lo que devolvio la ultima escritura, atado a la lectura sobre la que se hizo. Si `useRecurso`
  // revalida y trae otra, gana la lectura nueva: es la que refleja lo que otra persona haya cambiado.
  const [escrito, setEscrito] = useState<{ base: EstadoScope, valor: EstadoScope } | null>(null)
  const [editando, setEditando] = useState(false)

  if (estado.fase === 'cargando') return <Cargando mensaje={`Cargando el ${GLOSARIO.scope.singular.toLowerCase()}…`} />
  if (estado.fase === 'error') return <ErrorEstado detalle={estado.mensaje} onReintentar={recargar} />

  const base = estado.datos
  const datos = escrito !== null && escrito.base === base ? escrito.valor : base
  const { scope, analisis, puede_editar: puedeEditar } = datos

  return (
    <div className="flex flex-col gap-4">
      {editando && puedeEditar
        ? (
          <LimiteDeError zona={`${GLOSARIO.scope.singular} — editor`}>
            <EditorScope
              proyectoId={proyectoId}
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
        : scope === null
          ? (
            <Vacio
              titulo={`Este ${GLOSARIO.espacio.singular.toLowerCase()} todavía no tiene ${GLOSARIO.scope.singular.toLowerCase()}`}
              descripcion={puedeEditar
                ? `Carga el alcance del contrato: la IA te muestra lo que entendió antes de guardarlo, y después puede revisar cada ${GLOSARIO.proceso.singular.toLowerCase()} contra él.`
                : `Comercial todavía no carga el ${GLOSARIO.scope.singular.toLowerCase()} del contrato de este ${GLOSARIO.espacio.singular.toLowerCase()}.`}
              accion={puedeEditar
                ? <Boton variante="primario" tamano="chico" onClick={() => { setEditando(true) }}>Cargar {GLOSARIO.scope.singular.toLowerCase()}</Boton>
                : undefined}
            />
            )
          : <VistaScope scope={scope} puedeEditar={puedeEditar} onEditar={() => { setEditando(true) }} />}

      <LimiteDeError zona={`${GLOSARIO.scope.singular} — análisis`}>
        <AnalisisDelScope
          proyectoId={proyectoId}
          analisis={analisis}
          hayScope={scope !== null}
          ia={ia}
          onAnalizado={(nuevo: AnalisisScope) => { setEscrito({ base, valor: { ...datos, analisis: nuevo } }) }}
        />
      </LimiteDeError>
    </div>
  )
}

interface PropsVistaScope {
  scope: Scope
  puedeEditar: boolean
  onEditar: () => void
}

/** El Scope guardado: resumen, las tres listas, de donde salio y quien lo toco por ultima vez. */
function VistaScope ({ scope, puedeEditar, onEditar }: PropsVistaScope): ReactElement {
  const fuente = FUENTES_SCOPE.find((opcion) => opcion.valor === scope.fuente)?.etiqueta ?? scope.fuente

  return (
    <section
      aria-labelledby="titulo-scope"
      className="border-linea bg-superficie-elevada rounded-tarjeta flex flex-col gap-4 border p-4"
    >
      <header className="flex flex-wrap items-start gap-3">
        <div className="flex flex-col gap-1">
          <h2 id="titulo-scope" className="text-texto text-base font-semibold">
            {GLOSARIO.scope.singular} del contrato
          </h2>
          <p className="text-texto-sutil flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
            <Insignia tono="contorno" tamano="chico">{fuente}</Insignia>
            {scope.archivo_nombre !== null && <span className="break-all">{scope.archivo_nombre}</span>}
            <span>
              Actualizado el <Fecha valor={scope.actualizado_en} conHora />
              {scope.actualizado_por !== null && <> por {scope.actualizado_por.nombre}</>}
            </span>
          </p>
        </div>
        {puedeEditar && (
          <Boton tamano="chico" className="ml-auto" onClick={onEditar}>
            Editar {GLOSARIO.scope.singular.toLowerCase()}
          </Boton>
        )}
      </header>

      {scope.resumen.trim() !== '' && (
        <p className="text-texto text-sm leading-relaxed whitespace-pre-line">{scope.resumen}</p>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        {(['incluye', 'excluye', 'supuestos'] as const).map((clave) => (
          <div key={clave} className="flex flex-col gap-2">
            <h3 className="text-texto text-sm font-semibold">{ROTULO_LISTA[clave]}</h3>
            {scope[clave].length === 0
              ? <p className="text-texto-sutil text-sm">Nada declarado.</p>
              : (
                <ul className="text-texto flex list-disc flex-col gap-1 pl-5 text-sm">
                  {scope[clave].map((item, indice) => <li key={`${indice}-${item}`}>{item}</li>)}
                </ul>
                )}
          </div>
        ))}
      </div>
    </section>
  )
}
