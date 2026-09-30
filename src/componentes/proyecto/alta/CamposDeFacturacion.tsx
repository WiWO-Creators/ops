import type { ReactElement } from 'react'
import { Campo } from '@/componentes/formularios/Campo'
import { Entrada } from '@/componentes/formularios/Entrada'
import {
  ContenidoSelector,
  DisparadorSelector,
  Opcion,
  Selector
} from '@/componentes/formularios/Selector'
import { DiasExcluidos } from '@/componentes/recurrencia/DiasExcluidos'
import { FinDeRecurrencia } from '@/componentes/recurrencia/FinDeRecurrencia'
import type { BorradorAlta } from './modelo'
import type { CambiarCampo } from './useBorradorAlta'

interface PropsCamposDeFacturacion {
  borrador: BorradorAlta
  cambiar: CambiarCampo
}

/** Horas, tarifa, visibilidad y recurrencia de la tarea. */
export function CamposDeFacturacion ({ borrador, cambiar }: PropsCamposDeFacturacion): ReactElement {
  return (
    <>
      <Campo etiqueta="Horas estimadas" ayuda="Acepta decimales. Déjalo vacío si todavía no se estimó.">
        {(campo) => (
          <Entrada
            {...campo}
            type="number"
            step="any"
            min="0"
            value={borrador.horasEstimadas}
            onChange={(evento) => { cambiar('horasEstimadas', evento.target.value) }}
          />
        )}
      </Campo>

      <Campo etiqueta="Tarifa por hora">
        {(campo) => <Entrada {...campo} type="number" min="0" step="0.01" value={borrador.tarifa} onChange={(evento) => { cambiar('tarifa', evento.target.value) }} />}
      </Campo>
      <label className="text-texto flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={borrador.facturable}
          onChange={(evento) => { cambiar('facturable', evento.target.checked) }}
        />
        Facturable
      </label>
      <label className="text-texto flex items-center gap-2 text-sm">
        <input type="checkbox" checked={borrador.publica} onChange={(evento) => { cambiar('publica', evento.target.checked) }} />
        Pública para el equipo
      </label>
      <label className="text-texto flex items-center gap-2 text-sm">
        <input type="checkbox" checked={borrador.visibleCliente} onChange={(evento) => { cambiar('visibleCliente', evento.target.checked) }} />
        Visible para el cliente
      </label>
      <label className="text-texto flex items-center gap-2 text-sm">
        <input type="checkbox" checked={borrador.recurrente} onChange={(evento) => { cambiar('recurrente', evento.target.checked) }} />
        Recurrente
      </label>
      {borrador.recurrente && <div className="grid gap-4 sm:grid-cols-3">
        <Campo etiqueta="Repetir cada">
          {(campo) => <Entrada {...campo} type="number" min="1" max="365" step="1" value={borrador.cada} onChange={(evento) => { cambiar('cada', evento.target.value) }} />}
        </Campo>
        <Campo etiqueta="Unidad">
          {({ id }) => <Selector value={borrador.unidad} onValueChange={(valor) => { cambiar('unidad', valor) }}>
            <DisparadorSelector id={id} />
            <ContenidoSelector>
              <Opcion value="day">Días</Opcion><Opcion value="week">Semanas</Opcion>
              <Opcion value="month">Meses</Opcion><Opcion value="year">Años</Opcion>
            </ContenidoSelector>
          </Selector>}
        </Campo>
        <DiasExcluidos valor={borrador.diasExcluidos} onCambiar={(dias) => { cambiar('diasExcluidos', dias) }} />
        <FinDeRecurrencia valor={borrador.fin} onCambiar={(fin) => { cambiar('fin', fin) }} inicio={borrador.inicio} />
      </div>}
    </>
  )
}
