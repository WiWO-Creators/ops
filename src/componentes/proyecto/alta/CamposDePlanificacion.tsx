import type { ReactElement } from 'react'
import { Campo } from '@/componentes/formularios/Campo'
import { Entrada } from '@/componentes/formularios/Entrada'
import {
  ContenidoSelector,
  DisparadorSelector,
  Opcion,
  Selector
} from '@/componentes/formularios/Selector'
import { SelectorEtiquetas } from '@/componentes/formularios/SelectorEtiquetas'
import { SelectorPersonas } from '@/componentes/formularios/SelectorPersonas'
import { GLOSARIO } from '@/dominio/glosario'
import type { TipoDeProcesoDelEspacio } from '@/datos/recursos'
import type { StaffReferencia } from '@/datos/tipos'
import { destinoDelAlta, NINGUNO, type BorradorAlta } from './modelo'
import type { CambiarCampo } from './useBorradorAlta'

interface PropsCamposDePlanificacion {
  borrador: BorradorAlta
  cambiar: CambiarCampo
  personas: StaffReferencia[]
  vencimientoRequerido: boolean
  /** Nombres de las etiquetas que ya existen, para sugerirlas. */
  nombresDelCatalogo: string[]
  tipos: TipoDeProcesoDelEspacio[]
  avisoTipos: string | null
}

/**
 * Ayuda del campo Tipo según el destino elegido.
 *
 * @param multiple si hay varios destinos
 * @param espacio el primer Espacio elegido
 * @param hayTipos si el Espacio ofrece tipos
 * @param avisoTipos el fallo de la consulta de tipos, si lo hubo
 * @returns el texto de ayuda, o `undefined` si no hace falta
 */
function ayudaDelTipo (multiple: boolean, espacio: string, hayTipos: boolean, avisoTipos: string | null): string | undefined {
  const espacioEnMinuscula = GLOSARIO.espacio.singular.toLowerCase()

  if (multiple) return `Cada ${espacioEnMinuscula} ofrece sus propios tipos: la tarea nace sin tipo y se define después en cada una.`
  if (avisoTipos !== null) return avisoTipos
  if (espacio === NINGUNO) return `Cada ${espacioEnMinuscula} define sus tipos: elige uno primero.`

  return hayTipos ? undefined : `Este ${espacioEnMinuscula} no ofrece tipos.`
}

/** Quién la hace, cuándo, con qué etiquetas y tipo, y quién la sigue. */
export function CamposDePlanificacion (props: PropsCamposDePlanificacion): ReactElement {
  const { borrador, cambiar, personas, vencimientoRequerido, tipos } = props
  const { espacio, multiple, vaAEspacio } = destinoDelAlta(borrador)

  return (
    <>
      <Campo
        etiqueta="Asignados"
        ayuda={personas.length === 0 ? 'No se pudo traer el equipo.' : undefined}
      >
        {({ id }) => (
          <SelectorPersonas
            id={id}
            personas={personas}
            elegidas={borrador.asignados}
            onCambiar={(ids) => { cambiar('asignados', ids) }}
          />
        )}
      </Campo>

      <div className="grid gap-4 sm:grid-cols-2">
        <Campo etiqueta="Fecha de inicio">
          {(campo) => (
            <Entrada
              {...campo}
              type="date"
              value={borrador.inicio}
              onChange={(evento) => { cambiar('inicio', evento.target.value) }}
            />
          )}
        </Campo>
        <Campo etiqueta="Fecha de vencimiento" requerido={vencimientoRequerido}>
          {(campo) => (
            <Entrada
              {...campo}
              type="date"
              required={vencimientoRequerido}
              value={borrador.vencimiento}
              onChange={(evento) => { cambiar('vencimiento', evento.target.value) }}
            />
          )}
        </Campo>
      </div>

      <Campo etiqueta="Etiquetas" ayuda="Elige una existente o escribe una nueva: si no existe, se crea.">
        {({ id, 'aria-describedby': idAyuda }) => (
          <SelectorEtiquetas
            id={id}
            {...(idAyuda === undefined ? {} : { idAyuda })}
            catalogo={props.nombresDelCatalogo}
            elegidas={borrador.etiquetasEscritas}
            onCambiar={(etiquetas) => { cambiar('etiquetasEscritas', etiquetas) }}
          />
        )}
      </Campo>

      <Campo etiqueta="Tipo" ayuda={ayudaDelTipo(multiple, espacio, tipos.length > 0, props.avisoTipos)}>
        {({ id }) => (
          <Selector value={borrador.tipo} onValueChange={(valor) => { cambiar('tipo', valor) }} disabled={!vaAEspacio || multiple || tipos.length === 0}>
            <DisparadorSelector id={id} />
            <ContenidoSelector>
              <Opcion value={NINGUNO}>Sin tipo</Opcion>
              {tipos.map((fila) => (
                <Opcion key={fila.id} value={String(fila.id)}>{fila.name}</Opcion>
              ))}
            </ContenidoSelector>
          </Selector>
        )}
      </Campo>

      <Campo etiqueta="Seguidores" ayuda="Reciben las novedades sin ser responsables.">
        {({ id }) => (
          <SelectorPersonas
            id={id}
            personas={personas}
            elegidas={borrador.seguidores}
            onCambiar={(ids) => { cambiar('seguidores', ids) }}
          />
        )}
      </Campo>
    </>
  )
}
