'use client'

import type { ReactElement } from 'react'
import { Campo } from '@/componentes/formularios/Campo'
import { Entrada } from '@/componentes/formularios/Entrada'
import { Segmentado } from '@/componentes/formularios/Segmentado'
import { OPCIONES_FIN, type ModoFin } from '@/dominio/recurrencia'

/** Lo que el bloque edita. Todo texto: el formulario convierte recien al armar el cuerpo. */
export interface ValorFin {
  modo: ModoFin
  ciclos: string
  hasta: string
}

/**
 * "Termina: nunca / tras N veces / el día X", el mismo bloque en el alta y en la edicion de una Tarea.
 *
 * Un solo componente para las dos pantallas porque son la misma regla (`ParcheProceso::recurrencia()`
 * en la API) y ya divergieron una vez: el alta pedia "ciclos" con `0 = sin límite`, una convencion de
 * Perfex que nadie adivina. Aca el cero no existe: "nunca" es una opcion con nombre.
 *
 * El campo que corresponde entra desde abajo con la animacion del sistema (`animate-entrar-abajo`),
 * que el bloque global de movimiento reducido ya apaga.
 *
 * @param valor modo, veces y fecha actuales
 * @param onCambiar recibe el valor completo nuevo
 * @param inicio fecha de inicio de la Tarea, para no ofrecer un fin anterior
 * @param deshabilitado mientras se guarda
 */
export function FinDeRecurrencia ({ valor, onCambiar, inicio = '', deshabilitado = false }: {
  valor: ValorFin
  onCambiar: (valor: ValorFin) => void
  inicio?: string
  deshabilitado?: boolean
}): ReactElement {
  /** Cambia de modo y, si el campo del modo nuevo esta vacio, le deja un valor razonable. */
  function elegir (modo: string): void {
    const elegido = OPCIONES_FIN.find((opcion) => opcion.valor === modo)?.valor ?? 'nunca'
    const ciclos = elegido === 'ciclos' && (valor.ciclos === '' || valor.ciclos === '0') ? '12' : valor.ciclos

    onCambiar({ ...valor, modo: elegido, ciclos })
  }

  return (
    <fieldset className="flex flex-col gap-2 sm:col-span-3" disabled={deshabilitado}>
      <legend className="text-texto mb-1.5 text-sm font-medium">Termina</legend>
      <Segmentado
        etiqueta="Cuándo termina la recurrencia"
        tamano="chico"
        activo={valor.modo}
        onElegir={elegir}
        opciones={OPCIONES_FIN.map((opcion) => ({ valor: opcion.valor, etiqueta: opcion.etiqueta }))}
        className="self-start"
      />

      {valor.modo === 'ciclos' && (
        <Campo etiqueta="Cuántas veces" ayuda="Cuenta las copias que genera, sin contar esta tarea." className="animate-entrar-abajo max-w-48">
          {(props) => (
            <Entrada
              {...props}
              required
              type="number"
              min="1"
              max="365"
              step="1"
              value={valor.ciclos}
              onChange={(evento) => onCambiar({ ...valor, ciclos: evento.target.value })}
            />
          )}
        </Campo>
      )}

      {valor.modo === 'fecha' && (
        <Campo etiqueta="Último día" ayuda="No se generan copias con fecha posterior." className="animate-entrar-abajo max-w-56">
          {(props) => (
            <Entrada
              {...props}
              required
              type="date"
              min={inicio === '' ? undefined : inicio}
              value={valor.hasta}
              onChange={(evento) => onCambiar({ ...valor, hasta: evento.target.value })}
            />
          )}
        </Campo>
      )}
    </fieldset>
  )
}
