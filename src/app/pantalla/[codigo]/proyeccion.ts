'use client'

import { useEffect, useRef } from 'react'

/**
 * Lo que hace falta para que la pantalla sobreviva a ser proyectada desde otro aparato.
 *
 * Castear —Chromecast, AirPlay, un stick HDMI— rompe dos supuestos que una pantalla colgada por
 * cable no tiene: el aparato puede dormirse, y la pestaña que se esta enviando puede quedar oculta
 * para el navegador aunque el receptor la siga mostrando.
 */

/** Cada cuanto late el worker. Es el grano de todo lo que depende del reloj en la pantalla. */
export const TIC_MS = 250

/**
 * Un latido que NO se estrangula con la pestaña oculta.
 *
 * Usa un worker dedicado; si no se puede crear —un navegador viejo, una CSP que lo prohiba— cae a un
 * `setInterval` normal. La caida es peor pero no es una pantalla en negro: con el temporizador
 * estrangulado la rotacion se vuelve lenta, y el vencimiento absoluto de `Escenario` hace que al
 * volver a primer plano se ponga al dia de una sola vez en lugar de recorrer el guion entero.
 *
 * `alTic` se guarda en una ref y se lee en cada latido, asi que el worker se crea UNA vez aunque el
 * callback cambie de identidad en cada render. Sin eso, cada render mataria y recrearia el worker, y
 * el tic se perderia justo mientras la pantalla esta repintando.
 *
 * @param alTic se llama en cada latido, con el instante en tiempo de pared
 */
export function useLatido (alTic: (ahora: number) => void): void {
  const callback = useRef(alTic)

  useEffect(() => { callback.current = alTic })

  useEffect(() => {
    let worker: Worker | null = null
    let respaldo: ReturnType<typeof setInterval> | null = null

    try {
      worker = new Worker(new URL('./latido.worker.ts', import.meta.url))
      worker.onmessage = (evento: MessageEvent<number>) => { callback.current(evento.data) }
      worker.postMessage({ tipo: 'arrancar', cadaMs: TIC_MS })
    } catch {
      // Sin worker, el reloj del hilo principal. Se estrangula con la pestaña oculta, que es
      // justamente lo que el worker viene a evitar, pero sigue funcionando en primer plano.
      worker = null
      respaldo = globalThis.setInterval(() => { callback.current(Date.now()) }, TIC_MS)
    }

    return () => {
      if (worker !== null) {
        worker.postMessage({ tipo: 'parar' })
        worker.terminate()
      }

      if (respaldo !== null) globalThis.clearInterval(respaldo)
    }
  }, [])
}

/**
 * Pide al sistema que no apague la pantalla.
 *
 * Un televisor al que se le castea una pestaña sigue las reglas de ahorro de energia del aparato que
 * la envia: a los diez minutos se apaga la pantalla del portatil y, segun el receptor, la proyeccion
 * se va con ella. `navigator.wakeLock` es la forma estandar de pedir que no.
 *
 * **El permiso se pierde solo** cada vez que la pestaña se oculta, y no vuelve al mostrarse: hay que
 * volver a pedirlo. Por eso el oyente de `visibilitychange`, que es la mitad del trabajo y la que se
 * olvida.
 *
 * Falla en silencio a proposito. No esta en todos los navegadores, exige HTTPS, y el sistema puede
 * negarlo por bateria baja; en ninguno de esos casos hay nada que la pantalla pueda hacer, y un aviso
 * en la pared que diga "no pude evitar que te apagues" no ayuda a nadie.
 */
export function useNoApagarPantalla (): void {
  useEffect(() => {
    let permiso: WakeLockSentinel | null = null
    let vivo = true

    const pedir = async (): Promise<void> => {
      if (!vivo || document.hidden) return

      try {
        permiso = await navigator.wakeLock?.request('screen') ?? null
      } catch {
        permiso = null
      }
    }

    const alVolver = (): void => { if (!document.hidden) void pedir() }

    void pedir()
    document.addEventListener('visibilitychange', alVolver)

    return () => {
      vivo = false
      document.removeEventListener('visibilitychange', alVolver)
      void permiso?.release().catch(() => {})
    }
  }, [])
}
