'use client'

import { useEffect, useRef, useTransition } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { EVENTO_RECURSO_CAMBIADO } from '@/datos/refresco-lista'
import {
  debeRefrescarPortal,
  esElementoDeEdicion,
  REFRESCO_PERDIDO_PORTAL_MS,
  type MotivoDeRefrescoPortal
} from '@/datos/refresco-portal'

/** Cada cuánto se evalúa si toca refrescar; la regla de «un minuto» la aplica `debeRefrescarPortal`. */
const REVISION_MS = 15_000

/**
 * Mantiene al día las páginas del portal, que se resuelven en el servidor.
 *
 * Sin esto cada página quedaba como una foto del momento en que se abrió: el tablero, las
 * aprobaciones, la lista de inicio y el resumen no cambiaban hasta recargar. Vuelve a pedirlas con
 * `router.refresh()` dentro de una transición, así la pantalla actual no se vacía mientras llega la
 * nueva:
 *
 * - cada minuto, con la pestaña visible;
 * - al volver a la pestaña, si estuvo fuera más de treinta segundos;
 * - después de cualquier escritura confirmada (`ops:recurso-cambiado`).
 *
 * Nunca apila un refresco sobre otro, y no refresca mientras haya un campo de edición con el foco:
 * si una escritura llega en ese momento, queda anotada y se atiende cuando el foco sale del campo.
 * No pinta nada.
 */
export function RefrescoDelPortal () {
  const router = useRouter()
  const ruta = usePathname()
  const [pendiente, empezar] = useTransition()
  const ultimoRefresco = useRef(0)
  const enVueloDesde = useRef<number | null>(null)
  const escrituraPendiente = useRef(false)

  // Una navegación ya trae datos frescos: el reloj del minuto parte de ahí.
  useEffect(() => { ultimoRefresco.current = Date.now() }, [ruta])

  useEffect(() => {
    if (!pendiente) enVueloDesde.current = null
  }, [pendiente])

  useEffect(() => {
    /**
     * Pregunta si toca refrescar y, de ser así, lo hace.
     *
     * @param motivo qué disparó la pregunta
     */
    function evaluar (motivo: MotivoDeRefrescoPortal): void {
      const ahora = Date.now()
      const enVuelo = enVueloDesde.current !== null && ahora - enVueloDesde.current < REFRESCO_PERDIDO_PORTAL_MS
      const editando = esElementoDeEdicion(document.activeElement)

      // Una escritura que no pudo refrescar ahora (oculto, escribiendo, otro refresco en camino)
      // queda anotada: al volver o al soltar el foco se atiende sin esperar al minuto.
      const efectivo = motivo === 'regreso' && escrituraPendiente.current ? 'escritura' : motivo
      const debe = debeRefrescarPortal(
        { oculto: document.hidden, ultimoRefrescoMs: ultimoRefresco.current, ahoraMs: ahora, editando, enVuelo },
        efectivo
      )

      if (!debe && efectivo === 'escritura') escrituraPendiente.current = true

      if (!debe) return

      escrituraPendiente.current = false
      ultimoRefresco.current = ahora
      enVueloDesde.current = ahora
      empezar(() => { router.refresh() })
    }

    const alIntervalo = (): void => { evaluar('intervalo') }
    const alVolver = (): void => { evaluar('regreso') }
    const alEscribir = (): void => { evaluar('escritura') }
    // El foco sale del campo: si una escritura quedó esperando, se atiende ahora.
    const alSoltarFoco = (): void => {
      globalThis.setTimeout(() => { if (escrituraPendiente.current) evaluar('escritura') }, 0)
    }

    const intervalo = globalThis.setInterval(alIntervalo, REVISION_MS)
    document.addEventListener('visibilitychange', alVolver)
    window.addEventListener('focus', alVolver)
    window.addEventListener(EVENTO_RECURSO_CAMBIADO, alEscribir)
    document.addEventListener('focusout', alSoltarFoco)

    return () => {
      globalThis.clearInterval(intervalo)
      document.removeEventListener('visibilitychange', alVolver)
      window.removeEventListener('focus', alVolver)
      window.removeEventListener(EVENTO_RECURSO_CAMBIADO, alEscribir)
      document.removeEventListener('focusout', alSoltarFoco)
    }
  }, [router, empezar])

  return null
}
