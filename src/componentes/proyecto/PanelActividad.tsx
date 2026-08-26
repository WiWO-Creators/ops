'use client'

import { useCallback, useMemo, useState, type ReactElement } from 'react'
import { mensajeDeRespuesta } from '@/datos/cliente'
import { ACTIVIDAD } from '@/definiciones/discusiones'
import { PanelRecurso } from './PanelRecurso'
import type { ActividadEspacio } from '@/datos/recursos'
import type { Capacidad } from '@/datos/tipos'
import type { DefinicionRecurso } from '@/definiciones/tipos'

/**
 * Pestaña Actividad del Proyecto.
 *
 * `description` y `additional_data` llegan ya traducidas y con los pseudo-tags `<seconds>` y `<lang>`
 * resueltos por la API. Rehacer esa sustitucion aca seria duplicar logica del backend, que es
 * justamente lo que hace inseguro un rollback.
 *
 * El interruptor de "Visible para el cliente" solo se ofrece con `create projects`, igual que en el
 * panel: es lo que decide que ve el cliente en su portal.
 */

interface PropsPanelActividad {
  proyectoId: number
  /** Capacidades sobre `projects`. */
  capacidades: Capacidad[]
}

export function PanelActividad ({ proyectoId, capacidades }: PropsPanelActividad): ReactElement {
  const [revision, setRevision] = useState(0)
  const puedeCambiarVisibilidad = capacidades.includes('create')

  const recargar = useCallback(() => { setRevision((n) => n + 1) }, [])

  const definicion = useMemo<DefinicionRecurso<ActividadEspacio>>(
    () => ({
      ...ACTIVIDAD,
      ruta: `projects/${encodeURIComponent(String(proyectoId))}/activity`,
      columnas: ACTIVIDAD.columnas.map((columna) => (
        columna.clave === 'visible_to_customer'
          ? {
              ...columna,
              presentar: (entrada: ActividadEspacio) => (
                <InterruptorVisibilidad
                  entrada={entrada}
                  proyectoId={proyectoId}
                  habilitado={puedeCambiarVisibilidad}
                  recargar={recargar}
                />
              )
            }
          : columna
      ))
    }),
    [proyectoId, puedeCambiarVisibilidad, recargar]
  )

  return <PanelRecurso definicion={definicion} claveFila={(a) => a.id} revision={revision} />
}

interface PropsInterruptor {
  entrada: ActividadEspacio
  proyectoId: number
  habilitado: boolean
  recargar: () => void
}

/**
 * Interruptor de visibilidad de una entrada de actividad.
 *
 * Es optimista: pinta el cambio y lo revierte si el `PATCH` falla. Sin permiso queda deshabilitado
 * pero visible, para que se lea el valor actual.
 */
function InterruptorVisibilidad ({
  entrada,
  proyectoId,
  habilitado,
  recargar
}: PropsInterruptor): ReactElement {
  const [visible, setVisible] = useState(entrada.visible_to_customer)
  const [guardando, setGuardando] = useState(false)
  const [fallo, setFallo] = useState<string | null>(null)

  /** Cambia la visibilidad. Nunca lanza: el fallo vuelve el interruptor a su valor anterior. */
  async function cambiar (siguiente: boolean): Promise<void> {
    const previo = visible

    setVisible(siguiente)
    setGuardando(true)
    setFallo(null)

    try {
      const respuesta = await fetch(`/api/bff/projects/${proyectoId}/activity/${entrada.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({ visible_to_customer: siguiente })
      })

      if (!respuesta.ok) {
        setVisible(previo)
        setFallo(await mensajeDeRespuesta(respuesta))
        return
      }

      recargar()
    } catch {
      setVisible(previo)
      setFallo('No se pudo cambiar: revisá la conexión.')
    } finally {
      setGuardando(false)
    }
  }

  /*
   * Sin orbe a proposito. El cambio es optimista: la casilla ya se pinto en su valor nuevo, asi que
   * no hay nada que esperar en pantalla. Lo unico que falta comunicar es que todavia no esta
   * confirmado, y eso lo dice `aria-busy` con la casilla deshabilitada. Un indicador de carga al lado
   * de un valor que ya cambio es el orbe puesto sin logica, que es justo lo que se saco del producto.
   */
  return (
    <span className="flex flex-col gap-1" aria-busy={guardando}>
      <label className="text-texto-tenue flex items-center gap-2 text-xs">
        <input
          type="checkbox"
          checked={visible}
          disabled={!habilitado || guardando}
          onChange={(evento) => { void cambiar(evento.target.checked) }}
          className="accent-acento size-4"
        />
        {visible ? 'Sí' : 'No'}
      </label>
      {fallo !== null && <span role="alert" className="text-texto-peligro text-xs">{fallo}</span>}
    </span>
  )
}
