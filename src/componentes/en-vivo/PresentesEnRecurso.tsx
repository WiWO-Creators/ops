'use client'

import { useEffect, useRef, useState, type ReactElement } from 'react'
import { animate, stagger } from 'animejs'
import { useConfigEnVivo } from '@/componentes/en-vivo/ProveedorEnVivo'
import { GrupoEnlacesPersona } from '@/componentes/presentadores/GrupoEnlacesPersona'
import { cargarAsignables } from '@/datos/asignables'
import type { PersonaAsignable } from '@/datos/recursos'
import {
  personasDeIds,
  textoDeEscribiendo,
  textoDePresentes,
  type TipoDeRecurso
} from '@/dominio/presencia-en-recurso'
import { cn } from '@/lib/clases'
import { cumpleConsulta, MENOS_MOVIMIENTO } from '@/lib/useConsultaDeMedios'
import { usePresenciaEnRecurso } from './usePresenciaEnRecurso'

interface PropsPresentesEnRecurso {
  tipo: TipoDeRecurso
  id: number
  className?: string
}

/**
 * Las personas del equipo, para ponerle nombre y foto a los ids de la presencia.
 *
 * Usa el catálogo que el panel ya comparte (`cargarAsignables`, una petición por minuto como mucho).
 * Si no carga, la presencia simplemente no se dibuja: es un accesorio, no un requisito.
 *
 * @returns el catálogo, vacío mientras llega o si falló
 */
function useEquipo (): PersonaAsignable[] {
  const [equipo, setEquipo] = useState<PersonaAsignable[]>([])

  useEffect(() => {
    let vigente = true

    cargarAsignables().then((personas) => {
      if (vigente) setEquipo(personas)
    }).catch(() => undefined)

    return () => { vigente = false }
  }, [])

  return equipo
}

/**
 * «Ana está respondiendo…»: tres puntos que laten (anime.js) y la frase, que entra con un fundido.
 *
 * Solo anima `transform` y `opacity`. Con `prefers-reduced-motion` no anima nada: la frase ya lo dice
 * todo. Los puntos son decorativos (`aria-hidden`); la frase la lee el lector de pantalla por el
 * `role="status"` de quien la contiene.
 *
 * @param texto la frase ya armada
 */
function FraseDeEscritura ({ texto }: { texto: string }): ReactElement {
  const raiz = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    const elemento = raiz.current

    if (elemento === null || cumpleConsulta(MENOS_MOVIMIENTO)) return

    const entrada = animate(elemento, { opacity: [0, 1], translateY: [4, 0], duration: 220, ease: 'outQuad' })
    const puntos = animate(elemento.querySelectorAll('[data-punto]'), {
      translateY: [0, -3, 0],
      opacity: [0.35, 1, 0.35],
      delay: stagger(140),
      duration: 900,
      ease: 'inOutSine',
      loop: true
    })

    return () => {
      entrada.revert()
      puntos.revert()
    }
  }, [])

  return (
    <span ref={raiz} className="text-texto-tenue inline-flex items-center gap-1.5 text-xs">
      <span className="inline-flex items-center gap-0.5" aria-hidden="true">
        {[0, 1, 2].map((punto) => (
          <span key={punto} data-punto className="bg-acento inline-block size-1 rounded-full" />
        ))}
      </span>
      {texto}
    </span>
  )
}

/** El cuerpo de {@link PresentesEnRecurso}, que solo existe con la presencia encendida. */
function PresentesActivos ({ tipo, id, className }: PropsPresentesEnRecurso): ReactElement {
  const { presentes, escribiendo } = usePresenciaEnRecurso(tipo, id)
  const equipo = useEquipo()
  const personas = personasDeIds(presentes, equipo)
  const quienEscribe = personasDeIds(escribiendo, equipo)
  const frase = textoDeEscribiendo(quienEscribe.map((persona) => persona.full_name))

  // Vacía no ocupa lugar (ni siquiera el hueco de un `gap` del contenedor), pero conserva la región
  // de estado en la página.
  const vacia = personas.length === 0 && frase === ''

  return (
    <div className={vacia ? 'sr-only' : cn('flex flex-wrap items-center gap-x-3 gap-y-1', className)}>
      {personas.length > 0 && (
        <span className="inline-flex items-center gap-2">
          <GrupoEnlacesPersona personas={personas} maximo={4} />
          <span className="text-texto-tenue text-xs">{textoDePresentes(personas.length)}</span>
        </span>
      )}
      {/* La región existe aunque esté vacía: un lector de pantalla solo anuncia lo que cambia dentro
          de una región que ya estaba en la página. */}
      <span role="status" className="contents">
        {frase !== '' && <FraseDeEscritura texto={frase} />}
      </span>
    </div>
  )
}

/**
 * Quiénes más están mirando un recurso (Tarea, Ticket o Proyecto) y, en un Ticket, quién está
 * respondiendo.
 *
 * Solo se dibuja con la presencia de «Ops en vivo» encendida (`config.presencia`); apagada no renderiza
 * nada ni abre ninguna conexión. Las personas salen del catálogo del equipo y enlazan a su ficha como
 * cualquier otro `GrupoEnlacesPersona`. Quien mira no se cuenta a sí misma.
 *
 * @param tipo qué recurso es
 * @param id su id
 * @param className clases extra
 * @returns la fila de presencia, o nada si la presencia está apagada
 */
export function PresentesEnRecurso (props: PropsPresentesEnRecurso): ReactElement | null {
  const { presencia } = useConfigEnVivo()

  return presencia ? <PresentesActivos {...props} /> : null
}
