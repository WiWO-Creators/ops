'use client'

import { useEffect, useState } from 'react'
import {
  ContenidoSelector,
  DisparadorSelector,
  Opcion,
  Selector
} from '@/componentes/formularios/Selector'
import { pedirSobre } from '@/datos/cliente'
import type { Proceso } from '@/datos/recursos'
import { GLOSARIO } from '@/dominio/glosario'
import { cn } from '@/lib/clases'

/**
 * Cuantas Tareas se traen para el combo. Mismo criterio que `SelectorEspacio`: es un desplegable,
 * no un listado, y no pagina. Son las Tareas abiertas de UNA persona dentro de UN Espacio; pasar de
 * cien ahi es un caso que se resuelve desde la ficha del Espacio, que es el camino que ya existia.
 */
const TAREAS_A_TRAER = 100

/**
 * Estados de Tarea que no estan terminadas (`5` es completada).
 *
 * Se filtra en la API y no aca: una Tarea cerrada no es una opcion valida para medir tiempo, y
 * traerla para descartarla en el navegador gasta la respuesta entera. Es la misma cadena que usa
 * `equipo/PanelTrabajoPersona`.
 */
const ESTADOS_ABIERTOS = '1,2,3,4'

interface PropsSelectorTarea {
  /** El Espacio del que se listan las Tareas. */
  espacioId: number
  /** De quien son las Tareas. Solo se puede medir sobre una Tarea propia; ver abajo. */
  staffId: number
  /** La Tarea elegida, o `null` si todavia no se eligio ninguna. */
  valor: number | null
  onElegir: (id: number) => void
  deshabilitado?: boolean
  /** Para asociarlo con la etiqueta que lo nombra desde afuera. */
  id?: string
  /** Id del texto que lo explica. Lo lee el lector de pantalla junto con la etiqueta. */
  describedBy?: string
  className?: string
}

/**
 * Combo de Tareas para decir sobre cual se esta trabajando.
 *
 * === POR QUE SOLO LAS ASIGNADAS A UNO ===
 *
 * La API responde **403** al arrancar un cronometro sobre una Tarea que no es de quien lo pide. Un
 * combo con todas las del Espacio ofreceria opciones que van a fallar al elegirlas, y el error
 * llegaria despues de haber detenido el medidor anterior. Por eso la lista se pide con `assignee`:
 * lo que se ofrece es exactamente lo que se puede arrancar.
 *
 * **`assignee` va suelto en la query, NO dentro de `filter[]`**: `filter[assignee]` responde 422.
 * `status` si es un filtro. No es una inconsistencia del frontend, es el contrato.
 *
 * === CUANDO PIDE ===
 *
 * Una vez por Espacio, al montarse y cada vez que el Espacio cambia. Nunca entra en el intervalo del
 * control: LIVE tiene exactamente dos sitios que repreguntan solos y este no es ninguno. Un fallo
 * aca tampoco puede tumbar el control — se dice que la lista no cargo y la jornada se sigue cerrando
 * igual, que es lo principal que el control hace.
 */
export function SelectorTarea ({
  espacioId,
  staffId,
  valor,
  onElegir,
  deshabilitado = false,
  id,
  describedBy,
  className
}: PropsSelectorTarea) {
  // La respuesta se guarda JUNTO al Espacio del que salio, y no en un estado aparte que haya que
  // limpiar al cambiar de Espacio. Limpiarlo seria un `setTareas(null)` sincrono dentro del efecto:
  // un render en cascada, y ademas la puerta a la ventana en la que el combo muestra las Tareas del
  // Espacio anterior como si fueran del nuevo. Con la llave adentro, una respuesta vieja
  // sencillamente no coincide y se ignora.
  const [traido, setTraido] = useState<{ espacioId: number, tareas: Proceso[] } | null>(null)
  const [fallo, setFallo] = useState<{ espacioId: number, mensaje: string } | null>(null)

  useEffect(() => {
    const control = new AbortController()

    pedirSobre<Proceso[]>(
      `tasks?assignee=${staffId}&filter[project_id]=${espacioId}&filter[status]=${ESTADOS_ABIERTOS}&per_page=${TAREAS_A_TRAER}&sort=due_date`,
      control.signal
    )
      .then((sobre) => { setTraido({ espacioId, tareas: sobre.data }) })
      .catch((error: unknown) => {
        if (control.signal.aborted) return

        setFallo({
          espacioId,
          mensaje: error instanceof Error ? error.message : 'No se pudo cargar la lista.'
        })
      })

    return () => { control.abort() }
  }, [espacioId, staffId])

  const tareas = traido?.espacioId === espacioId ? traido.tareas : null
  const error = fallo?.espacioId === espacioId ? fallo.mensaje : null

  if (error !== null) {
    return <p className="text-texto-peligro text-xs">{error}</p>
  }

  // Un combo vacio no dice nada: parece que la lista no cargo. Con palabras, quien mira sabe que no
  // tiene nada que elegir y que el camino es que le asignen la Tarea, no reintentar.
  if (tareas !== null && tareas.length === 0) {
    return (
      <p className="text-texto-sutil text-xs">
        No tienes {GLOSARIO.proceso.plural.toLowerCase()} asignadas en este{' '}
        {GLOSARIO.espacio.singular.toLowerCase()}.
      </p>
    )
  }

  const cargando = tareas === null

  return (
    <Selector
      value={valor === null ? undefined : String(valor)}
      onValueChange={(elegido) => { onElegir(Number(elegido)) }}
      disabled={deshabilitado || cargando}
    >
      <DisparadorSelector
        id={id}
        aria-describedby={describedBy}
        marcador={cargando ? 'Cargando…' : `Elige una ${GLOSARIO.proceso.singular.toLowerCase()}`}
        className={cn('w-full', className)}
      />
      <ContenidoSelector>
        {(tareas ?? []).map((tarea) => (
          <Opcion key={tarea.id} value={String(tarea.id)}>
            {tarea.name}
          </Opcion>
        ))}
      </ContenidoSelector>
    </Selector>
  )
}
