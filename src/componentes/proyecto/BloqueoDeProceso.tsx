'use client'

import { useState, type ReactElement } from 'react'
import { Boton } from '@/componentes/formularios/Boton'
import { Campo } from '@/componentes/formularios/Campo'
import { AreaTexto } from '@/componentes/formularios/Entrada'
import { escribirEnBff } from '@/componentes/datos/mutaciones'
import { Fecha } from '@/componentes/presentadores/Fecha'
import { Insignia } from '@/componentes/presentadores/Insignia'
import type { BloqueoProceso } from '@/datos/recursos'
import type { ProcesoDeFicha } from './tareas'

/**
 * Bloqueo del Proceso: por que no avanza, desde cuando, y el boton para destrabarlo.
 *
 * === Por que es un bloque y no un estado mas ===
 *
 * Una Tarea bloqueada no dejo de estar en progreso: esta en progreso Y detenida. El estado dice en
 * que etapa va el trabajo; el bloqueo, por que esa etapa no se mueve. Son dos hechos distintos y el
 * backend los guarda en dos lugares (migracion 0620), asi que la ficha tambien los muestra aparte.
 *
 * === Por que el motivo es obligatorio ===
 *
 * Mientras dura el bloqueo, el atraso deja de ser de quien tiene la Tarea. Sin motivo esa excusa no
 * se puede revisar ni destrabar. El backend responde 422 sin el; aca el boton simplemente no se
 * habilita, que es la misma regla dicha antes.
 *
 * **No pide nada por su cuenta**: el bloque `bloqueo` ya viene con la tarea que el detalle cargo.
 * Despues de escribir le avisa al detalle que recargue, porque el backend es quien sabe como quedo.
 */

interface PropsBloqueo {
  tarea: ProcesoDeFicha
  /** `true` si quien mira tiene `edit` sobre tareas. Esconder no autoriza: el backend vuelve a decidir. */
  puedeEditar: boolean
  /** Se llama tras bloquear o destrabar, para que el detalle vuelva a pedir la tarea. */
  onCambiado: () => void
}

/**
 * Decide si el bloque tiene algo que decir.
 *
 * Una base sin la migracion 0620 no manda la clave, y ahi el bloque **no se renderiza**: es la
 * diferencia entre "no aplica" y "no esta bloqueada". Y una Tarea que nunca estuvo bloqueada
 * tampoco ocupa lugar: solo se ofrece el boton, y solo a quien puede editar.
 */
export function hayDatosDeBloqueo (tarea: ProcesoDeFicha, puedeEditar: boolean): boolean {
  if (tarea.bloqueo === undefined) return false

  return puedeEditar || tarea.bloqueo.motivo !== null
}

export function BloqueoDeProceso ({ tarea, puedeEditar, onCambiado }: PropsBloqueo): ReactElement | null {
  const [escribiendo, setEscribiendo] = useState(false)
  const [motivo, setMotivo] = useState('')
  const [enCurso, setEnCurso] = useState(false)
  const [fallo, setFallo] = useState<string | null>(null)

  const bloqueo = tarea.bloqueo

  if (bloqueo === undefined || !hayDatosDeBloqueo(tarea, puedeEditar)) return null

  /** Bloquea con el motivo escrito. Nunca lanza: el error del contrato se lee debajo del boton. */
  async function bloquear (): Promise<void> {
    setEnCurso(true)
    setFallo(null)

    const resultado = await escribirEnBff<BloqueoProceso>(
      `tasks/${tarea.id}/bloqueo`,
      'POST',
      { motivo: motivo.trim() }
    )

    setEnCurso(false)

    if (!resultado.ok) {
      setFallo(resultado.mensaje)
      return
    }

    setEscribiendo(false)
    setMotivo('')
    onCambiado()
  }

  /** Destraba. La fila se conserva del lado del backend: el motivo sigue explicando el atraso. */
  async function destrabar (): Promise<void> {
    setEnCurso(true)
    setFallo(null)

    const resultado = await escribirEnBff<BloqueoProceso>(`tasks/${tarea.id}/bloqueo`, 'DELETE')

    setEnCurso(false)

    if (!resultado.ok) {
      setFallo(resultado.mensaje)
      return
    }

    onCambiado()
  }

  return (
    <section className="border-linea bg-superficie-elevada rounded-tarjeta flex flex-col gap-3 border p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-texto-sutil text-xs font-medium tracking-[0.08em] uppercase">Bloqueo</span>
        {bloqueo.activo
          ? <Insignia tono="peligro">Bloqueada</Insignia>
          : <span className="text-texto-sutil text-sm">Sin bloqueo activo</span>}
      </div>

      {bloqueo.motivo !== null && (
        <div className="flex flex-col gap-1">
          <p className="text-texto text-sm">{bloqueo.motivo}</p>
          <p className="text-texto-sutil text-xs">
            {bloqueo.activo ? 'Desde ' : 'Estuvo bloqueada desde '}
            {bloqueo.bloqueado_en !== null && <Fecha valor={bloqueo.bloqueado_en} conHora />}
            {/* El bloqueo resuelto conserva sus dos fechas: es lo que explica un atraso pasado. */}
            {!bloqueo.activo && bloqueo.desbloqueado_en !== null && (
              <> hasta <Fecha valor={bloqueo.desbloqueado_en} conHora /></>
            )}
          </p>
        </div>
      )}

      {puedeEditar && bloqueo.activo && (
        <div className="flex flex-col items-start gap-2">
          <Boton
            variante="secundario"
            tamano="chico"
            cargando={enCurso}
            onClick={() => { void destrabar() }}
          >
            Destrabar
          </Boton>
        </div>
      )}

      {puedeEditar && !bloqueo.activo && !escribiendo && (
        <Boton variante="secundario" tamano="chico" onClick={() => setEscribiendo(true)}>
          Marcar como bloqueada
        </Boton>
      )}

      {puedeEditar && escribiendo && (
        <div className="flex flex-col gap-2">
          <Campo etiqueta="¿Qué la detiene?" ayuda="Lo lee quien tenga que destrabarla.">
            {(props) => (
              <AreaTexto
                value={motivo}
                onChange={(evento) => setMotivo(evento.target.value)}
                rows={2}
                placeholder="Esperando la aprobación de arte del cliente"
                {...props}
              />
            )}
          </Campo>

          <div className="flex flex-wrap gap-2">
            <Boton
              tamano="chico"
              cargando={enCurso}
              // Sin motivo el backend responde 422: el boton apagado dice la misma regla antes.
              disabled={motivo.trim() === ''}
              onClick={() => { void bloquear() }}
            >
              Bloquear
            </Boton>
            <Boton
              variante="sutil"
              tamano="chico"
              onClick={() => { setEscribiendo(false); setMotivo(''); setFallo(null) }}
            >
              Cancelar
            </Boton>
          </div>
        </div>
      )}

      {fallo !== null && <p role="alert" className="text-texto-peligro text-sm">{fallo}</p>}
    </section>
  )
}
