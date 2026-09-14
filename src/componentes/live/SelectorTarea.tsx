'use client'

import { useEffect, useState } from 'react'
import { ChevronSelector, CLASES_DISPARADOR } from '@/componentes/formularios/Selector'
import {
  BuscadorMenu,
  ContenidoMenu,
  DisparadorMenu,
  GrupoRadioMenu,
  ItemMenuRadio,
  MenuContextual,
  SinResultadosMenu,
  UMBRAL_BUSCADOR
} from '@/componentes/superposiciones/MenuContextual'
import { pedirSobre } from '@/datos/cliente'
import type { Proceso } from '@/datos/recursos'
import { GLOSARIO } from '@/dominio/glosario'
import { filtrarPorNombre } from '@/dominio/live'
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
 *
 * === POR QUE UN MENU Y NO UN `Select` ===
 *
 * El mismo motivo que en `SelectorEspacio`, y se construye con las mismas piezas: el `Select` de
 * Radix no admite un campo de texto dentro del panel, y una persona con las cien Tareas del tope
 * abiertas en un Espacio grande no encuentra la suya a ojo. El buscador solo aparece a partir de
 * `UMBRAL_BUSCADOR` opciones, asi que la lista corta —el caso normal aca— se ve exactamente igual
 * que antes.
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
  /** Lo tipeado en el buscador. Se vacia al cerrar el menu: al reabrirlo la lista esta entera. */
  const [busqueda, setBusqueda] = useState('')

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
  const todas = tareas ?? []
  const elegida = todas.find((tarea) => tarea.id === valor) ?? null
  const visibles = filtrarPorNombre(todas, busqueda)
  const conBuscador = todas.length >= UMBRAL_BUSCADOR
  const nombre = GLOSARIO.proceso.singular.toLowerCase()

  return (
    <MenuContextual onOpenChange={(abierto) => { if (!abierto) setBusqueda('') }}>
      <DisparadorMenu
        id={id}
        aria-describedby={describedBy}
        disabled={deshabilitado || cargando}
        className={cn(CLASES_DISPARADOR, 'w-full', elegida === null && 'text-texto-sutil', className)}
      >
        <span className="truncate">
          {cargando ? 'Cargando…' : elegida?.name ?? `Elige una ${nombre}`}
        </span>
        <ChevronSelector />
      </DisparadorMenu>

      <ContenidoMenu
        align="start"
        className="w-[var(--radix-dropdown-menu-trigger-width)] max-w-[calc(100vw-2rem)]"
      >
        {conBuscador && (
          <BuscadorMenu valor={busqueda} onCambiar={setBusqueda} placeholder={`Buscar ${nombre}…`} />
        )}

        <GrupoRadioMenu
          value={elegida === null ? '' : String(elegida.id)}
          onValueChange={(nueva) => { onElegir(Number(nueva)) }}
        >
          {visibles.map((tarea) => (
            <ItemMenuRadio key={tarea.id} value={String(tarea.id)}>
              <span className="truncate">{tarea.name}</span>
            </ItemMenuRadio>
          ))}
        </GrupoRadioMenu>

        {/* No es el vacio de "no tienes Tareas asignadas" —ese se resuelve arriba, sin desplegable—:
            este se arregla escribiendo otra cosa. */}
        {visibles.length === 0 && (
          <SinResultadosMenu>Ninguna {GLOSARIO.proceso.singular} coincide.</SinResultadosMenu>
        )}

        {/* Filtrar no mueve el foco: sin esto la lista cambia en silencio debajo del campo. */}
        {conBuscador && (
          <p role="status" aria-live="polite" className="sr-only">
            {visibles.length === 1
              ? `1 ${nombre} en la lista`
              : `${visibles.length} ${GLOSARIO.proceso.plural.toLowerCase()} en la lista`}
          </p>
        )}
      </ContenidoMenu>
    </MenuContextual>
  )
}
