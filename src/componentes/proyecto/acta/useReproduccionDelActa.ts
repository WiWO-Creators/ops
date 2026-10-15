'use client'

import { useCallback, useEffect, useState } from 'react'
import { useAviso } from '@/componentes/estado/useAviso'
import { armarGuion, resumenDeCambios, type Guion } from '@/dominio/diff-acta'
import { EVENTO_ORBE_ESCRITURA, escrituraAlcanzaAlActa } from '@/dominio/orbe-escritura'
import { cumpleConsulta, MENOS_MOVIMIENTO } from '@/lib/useConsultaDeMedios'

/**
 * Cuánto se espera, tras el aviso del Orbe, a que llegue el acta nueva. Pasado esto el aviso se da
 * por perdido: un cambio de otra persona una hora después no es obra del asistente.
 */
const VENTANA_DE_ESPERA_MS = 30_000

interface OpcionesDeReproduccion {
  /** El Meeting Paper en pantalla. */
  actaId: number
  /** El cuerpo que se está viendo (ya con `cuerpoDelActa`). */
  html: string
  /**
   * Qué versión del documento es `html` (el idioma elegido). Un cambio de idioma cambia el HTML sin
   * que nadie lo haya editado, y eso no se reproduce.
   */
  vista: string
  /** El editor está abierto: ahí el visor no se muestra y nada se reproduce. */
  editando: boolean
}

export interface ReproduccionDelActa {
  /** El guion en marcha, o `null` si se ve el visor normal. */
  guion: Guion | null
  /** El resumen de la última edición del Orbe, para la región `aria-live`. Vacío si no hubo. */
  resumen: string
  /** Termina la reproducción (al acabar, al saltarla o con Escape). */
  terminar: () => void
}

/**
 * Decide cuándo se reproduce la edición del Orbe sobre el acta que se está leyendo.
 *
 * Se dispara solo si se juntan cuatro cosas: llegó `ops:orbe-escritura` para esta acta (o sin acta),
 * el editor está cerrado, el cuerpo nuevo llegó dentro de la ventana de espera y el texto de sus
 * bloques difiere del que se veía al llegar el aviso. Esa comparación es contra el cuerpo que había
 * **al llegar el aviso**, no contra el anterior a cualquier render: así una revalidación que no
 * cambia nada, o un cambio de idioma, no animan nada.
 *
 * Con `prefers-reduced-motion` no hay guion: el cambio se muestra directo y se avisa con un mensaje
 * corto. El resumen se deja en `resumen` en los dos casos, para el lector de pantalla.
 *
 * Los estados se ajustan en el propio render (el patrón de React para derivar estado de props) y no
 * en un efecto: así el cuerpo nuevo no alcanza a pintarse un fotograma antes de que arranque la
 * reproducción desde el viejo.
 *
 * @param opciones el acta, su cuerpo visible y si se está corrigiendo
 * @returns el guion en marcha, el resumen y cómo terminar
 */
export function useReproduccionDelActa ({ actaId, html, vista, editando }: OpcionesDeReproduccion): ReproduccionDelActa {
  const aviso = useAviso()
  const [pendiente, setPendiente] = useState<{ previo: string, vista: string } | null>(null)
  const [visto, setVisto] = useState({ html, vista })
  const [guion, setGuion] = useState<Guion | null>(null)
  const [resumen, setResumen] = useState('')
  /** El aviso de un cambio que se mostró sin animar; `numero` distingue dos avisos con el mismo texto. */
  const [sinAnimar, setSinAnimar] = useState<{ texto: string, numero: number } | null>(null)

  const terminar = useCallback(() => { setGuion(null) }, [])

  useEffect(() => {
    if (editando) return

    const alEscribirElOrbe = (evento: Event): void => {
      if (!escrituraAlcanzaAlActa((evento as CustomEvent<unknown>).detail, actaId)) return
      setPendiente((actual) => actual ?? { previo: html, vista })
    }

    window.addEventListener(EVENTO_ORBE_ESCRITURA, alEscribirElOrbe)

    return () => { window.removeEventListener(EVENTO_ORBE_ESCRITURA, alEscribirElOrbe) }
  }, [actaId, html, vista, editando])

  const hayPendiente = pendiente !== null

  useEffect(() => {
    if (!hayPendiente) return

    const espera = window.setTimeout(() => { setPendiente(null) }, VENTANA_DE_ESPERA_MS)

    return () => { window.clearTimeout(espera) }
  }, [hayPendiente])

  // Con el reduced-motion el cambio ya se ve; solo falta contarlo.
  useEffect(() => {
    if (sinAnimar === null) return

    aviso.info(sinAnimar.texto)
    // `aviso` es estable (funciones de módulo): no hace falta volver a correr por él.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sinAnimar])

  if (editando && guion !== null) setGuion(null)

  if (visto.html !== html || visto.vista !== vista) {
    setVisto({ html, vista })
    if (guion !== null) setGuion(null)

    if (pendiente !== null) {
      setPendiente(null)

      if (!editando && pendiente.vista === vista && pendiente.previo !== html) {
        const nuevo = armarGuion(pendiente.previo, html)

        if (nuevo.hayCambios) {
          const texto = resumenDeCambios(nuevo.secciones)

          setResumen(texto)
          if (cumpleConsulta(MENOS_MOVIMIENTO)) setSinAnimar((anterior) => ({ texto, numero: (anterior?.numero ?? 0) + 1 }))
          else setGuion(nuevo)
        }
      }
    }
  }

  return { guion, resumen, terminar }
}
