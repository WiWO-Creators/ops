import type { ReactElement } from 'react'
import { Campo } from '@/componentes/formularios/Campo'
import { Entrada } from '@/componentes/formularios/Entrada'
import {
  ContenidoSelector,
  DisparadorSelector,
  Opcion,
  Selector,
  SelectorBuscable
} from '@/componentes/formularios/Selector'
import { RELACIONES_TAREA, type RelacionTarea } from '@/dominio/espacios-destino'
import { GLOSARIO } from '@/dominio/glosario'
import type { Hito, Lookups, Referencia } from '@/datos/recursos'
import { SelectorEspacios } from '../SelectorEspacios'
import { destinoDelAlta, NINGUNO, NOMBRES_DE_RELACION, type BorradorAlta } from './modelo'
import type { CambiarCampo } from './useBorradorAlta'

interface PropsCamposDeDestino {
  borrador: BorradorAlta
  cambiar: CambiarCampo
  onRelacion: (relacion: RelacionTarea) => void
  onEspacios: (ids: number[]) => void
  /** Los Espacios de la clase elegida. */
  espaciosVisibles: Referencia[]
  opcionesDeClientes: Array<{ valor: string, etiqueta: string }>
  prioridades: ReadonlyArray<Referencia>
  estados?: Lookups['task_statuses']
  hitos: Hito[]
  avisoTipos: string | null
  /** Espacios donde falló el último alta múltiple. */
  conFallo: number[]
}

/** Con qué se relaciona la tarea, dónde se crea, su prioridad, su estado y su hito. */
export function CamposDeDestino (props: PropsCamposDeDestino): ReactElement {
  const { borrador, cambiar, hitos, avisoTipos } = props
  const { relacion, espacios } = borrador
  const { espacio, multiple, vaAEspacio } = destinoDelAlta(borrador)

  return (
    <>
      <Campo etiqueta="Relacionada con">
        {({ id }) => <Selector value={relacion} onValueChange={(valor) => { props.onRelacion(valor as RelacionTarea) }}>
          <DisparadorSelector id={id} />
          <ContenidoSelector>
            {RELACIONES_TAREA.map((clase) => (
              <Opcion key={clase} value={clase}>{NOMBRES_DE_RELACION[clase].singular}</Opcion>
            ))}
          </ContenidoSelector>
        </Selector>}
      </Campo>
      {!vaAEspacio && <Campo etiqueta={GLOSARIO.cliente.singular} requerido>
        {({ id }) => (
          <SelectorBuscable
            id={id}
            valor={borrador.relacionId}
            onElegir={(valor) => { cambiar('relacionId', valor) }}
            opciones={props.opcionesDeClientes}
            marcador={`Elige un ${GLOSARIO.cliente.singular.toLowerCase()}`}
            nombre={GLOSARIO.cliente.singular.toLowerCase()}
          />
        )}
      </Campo>}
      <div className="grid gap-4 sm:grid-cols-2">
        {vaAEspacio && <Campo
          etiqueta={NOMBRES_DE_RELACION[relacion].plural}
          ayuda={multiple
            ? `La misma tarea se crea ${espacios.length} veces, una en cada ${GLOSARIO.espacio.singular.toLowerCase()}.`
            : `Puedes elegir varios: la misma tarea se crea en todos.`}
        >
          {({ id }) => (
            <SelectorEspacios
              id={id}
              espacios={props.espaciosVisibles}
              elegidos={espacios}
              onCambiar={props.onEspacios}
              conFallo={props.conFallo}
              nombres={NOMBRES_DE_RELACION[relacion]}
            />
          )}
        </Campo>}

        <Campo etiqueta="Prioridad">
          {({ id }) => (
            <Selector value={borrador.prioridad} onValueChange={(valor) => { cambiar('prioridad', valor) }}>
              <DisparadorSelector id={id} />
              <ContenidoSelector>
                <Opcion value={NINGUNO}>La que trae por defecto</Opcion>
                {props.prioridades.map((fila) => (
                  <Opcion key={fila.id} value={String(fila.id)}>{fila.name}</Opcion>
                ))}
              </ContenidoSelector>
            </Selector>
          )}
        </Campo>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Campo etiqueta="Estado">
          {({ id }) => <Selector value={borrador.estado} onValueChange={(valor) => { cambiar('estado', valor) }}>
            <DisparadorSelector id={id} />
            <ContenidoSelector>
              <Opcion value={NINGUNO}>Estado inicial</Opcion>
              {props.estados?.map((fila) => <Opcion key={fila.id} value={String(fila.id)}>{fila.name}</Opcion>)}
            </ContenidoSelector>
          </Selector>}
        </Campo>
        <Campo
          etiqueta={GLOSARIO.hito.singular}
          ayuda={multiple
            ? `Cada ${GLOSARIO.espacio.singular.toLowerCase()} tiene sus propios hitos: la tarea nace sin hito y se mueve después.`
            : avisoTipos ?? (espacio === NINGUNO ? 'Elige un proyecto para ver sus hitos.' : undefined)}
        >
          {({ id }) => <Selector value={borrador.hito} onValueChange={(valor) => { cambiar('hito', valor) }} disabled={!vaAEspacio || multiple || hitos.length === 0}>
            <DisparadorSelector id={id} />
            <ContenidoSelector>
              <Opcion value={NINGUNO}>Sin hito</Opcion>
              {hitos.map((fila) => <Opcion key={fila.id} value={String(fila.id)}>{fila.name}</Opcion>)}
            </ContenidoSelector>
          </Selector>}
        </Campo>
      </div>
      {borrador.estado === '5' && <Campo etiqueta="Fecha real de cierre" ayuda="Vacío usa la fecha y hora de creación.">
        {(campo) => <Entrada {...campo} type="datetime-local" value={borrador.cierre} onChange={(evento) => { cambiar('cierre', evento.target.value) }} />}
      </Campo>}
    </>
  )
}
