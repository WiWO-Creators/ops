'use client'

import { useEffect, useRef } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'
import { PARAMETRO_TAREA } from '@/componentes/datos/tabla'
import { rutaDeRastreo } from '@/dominio/rastreo-portal'
import { EVENTO_PESTANA, type DetallePestana } from './eventos'
import { MotorDeRastreo, type CuerpoDeRastreo } from './MotorDeRastreo'

const RUTA_API = '/api/bff/portal/actividad'
const TIC_MS = 5_000
const EVENTOS_DE_ACTIVIDAD = ['pointerdown', 'pointermove', 'keydown', 'wheel', 'touchstart'] as const

/**
 * Envia un lote. Al cerrar la pestaña usa `sendBeacon`, que sobrevive a la descarga de la pagina; el
 * resto va con `fetch` y `keepalive`. Un fallo se descarta: el rastreo nunca rompe ni retrasa el
 * portal, y reintentar sin limite llenaria la cola de un navegador que no puede enviar.
 */
function enviar (cuerpo: CuerpoDeRastreo, final: boolean): void {
  const json = JSON.stringify(cuerpo)

  if (final && typeof navigator.sendBeacon === 'function' &&
    navigator.sendBeacon(RUTA_API, new Blob([json], { type: 'application/json' }))) return

  void fetch(RUTA_API, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: json,
    keepalive: true
  }).catch(() => undefined)
}

/**
 * Anota lo que el contacto hace en el portal: paginas y pestañas que abre, cuanto las ve y que
 * botones pulsa. No pinta nada.
 *
 * Se monta una vez en el armazon del portal, ANTES del contenido, para que sus efectos corran antes
 * que los de la pagina (la pestaña avisa al montarse). Con `activo` en falso —`/portal/me` dijo que
 * el seguimiento esta apagado— no registra nada.
 *
 * @param activo `rastreo` de `/portal/me`
 */
export function RastreadorPortal ({ activo }: { activo: boolean }) {
  const ruta = usePathname()
  const tarea = useSearchParams().get(PARAMETRO_TAREA)
  const motor = useRef<MotorDeRastreo | null>(null)

  useEffect(() => {
    if (!activo) return

    const nuevo = new MotorDeRastreo(enviar, window.matchMedia('(max-width: 767px)').matches ? 'movil' : 'escritorio')
    const alPulsar = (e: MouseEvent): void => {
      if (e.target instanceof Element) nuevo.clickEn(e.target)
    }
    const alCambiarVisibilidad = (): void => {
      if (document.visibilityState === 'hidden') nuevo.ocultar()
      else nuevo.mostrar()
    }
    const alSalir = (): void => nuevo.ocultar()
    const alCambiarPestana = (e: Event): void => {
      const { ruta: rutaPestana, clave } = (e as CustomEvent<DetallePestana>).detail
      const normal = rutaDeRastreo(rutaPestana)

      if (normal !== null) nuevo.cambiarPestana(normal, clave)
    }
    const alHaberActividad = (): void => nuevo.avisarActividad()
    const tic = window.setInterval(() => nuevo.tic(), TIC_MS)

    motor.current = nuevo
    document.addEventListener('click', alPulsar, true)
    document.addEventListener('visibilitychange', alCambiarVisibilidad)
    window.addEventListener('pagehide', alSalir)
    window.addEventListener(EVENTO_PESTANA, alCambiarPestana)
    for (const nombre of EVENTOS_DE_ACTIVIDAD) window.addEventListener(nombre, alHaberActividad, { passive: true })

    return () => {
      window.clearInterval(tic)
      document.removeEventListener('click', alPulsar, true)
      document.removeEventListener('visibilitychange', alCambiarVisibilidad)
      window.removeEventListener('pagehide', alSalir)
      window.removeEventListener(EVENTO_PESTANA, alCambiarPestana)
      for (const nombre of EVENTOS_DE_ACTIVIDAD) window.removeEventListener(nombre, alHaberActividad)
      nuevo.terminar()
      motor.current = null
    }
  }, [activo])

  useEffect(() => {
    const normal = rutaDeRastreo(ruta)

    if (normal !== null) motor.current?.cambiarRuta(normal)
  }, [ruta, activo])

  // La ficha de una tarea se abre con `?tarea=` sin cambiar de ruta: es lo que mas interesa saber
  // de lo que el cliente mira, y ni la ruta ni la pestaña lo dicen.
  useEffect(() => {
    if (tarea !== null && /^\d{1,9}$/.test(tarea)) motor.current?.registrarClick('tarea.abrir', Number(tarea))
  }, [tarea])

  return null
}
