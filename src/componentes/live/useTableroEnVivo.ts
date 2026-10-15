'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useEnVivo } from '@/componentes/en-vivo/useEnVivo'
import { estaConectadoEnVivo } from '@/datos/en-vivo'
import type { FilaDeLive } from '@/datos/live'
import { conLimite, esTiempoAgotado, TIEMPO_LECTURA_MS } from '@/datos/red'
import { sondeoSinApilar } from '@/datos/sondeo'
import { debeSondear, type TipoDeCambio } from '@/dominio/en-vivo'
import { escucharMedidor } from './medidor'

/** Lo que el tablero entrega a quien lo pinta. */
export interface TableroEnVivo {
  /** Las filas de la última lectura de `GET /live`. */
  filas: FilaDeLive[]
  /**
   * Segundos desde esa lectura. Los contadores suman esto a los segundos que mandó el servidor, así
   * el tic es uno solo y no hay intervalos por fila.
   */
  transcurrido: number
  /** Mensaje de la última lectura fallida, o `null` si la última salió bien. */
  error: string | null
}

interface OpcionesDelTablero {
  inicial: FilaDeLive[]
  /** Mensaje si el servidor no pudo leer el tablero al pintar. */
  errorInicial: string | null
  /** Cada cuántos segundos se vuelve a preguntar (respaldo, si el bus de «en vivo» está conectado). */
  segundos: number
  /**
   * Tipos de cambio del bus que releen el tablero al instante, además de los avisos de medidor que
   * ya llegan por `escucharMedidor`. Vacío —el valor por defecto— deja el tablero como era: solo
   * sondeo y avisos de medidor.
   */
  tiposEnVivo?: readonly TipoDeCambio[]
}

/**
 * Mantiene al día el tablero del equipo de `/live` y el contador de segundos que cuelga de él.
 *
 * Es lo que antes vivía dentro de `PanelEquipo`, sacado para que lo compartan la lista y las
 * tarjetas sin que haya dos formas de repreguntar lo mismo. Pide `/api/bff/live` por su cuenta y no
 * con `router.refresh()`: refrescar la página reiniciaría el control de jornada que está al lado.
 *
 * Con la pestaña oculta no pregunta. Con el bus conectado el intervalo pasa a respaldo
 * (`debeSondear`) y los cambios llegan por aviso; sin bus todo sigue por sondeo, como siempre.
 *
 * @param opciones las filas iniciales, el intervalo y los tipos del bus que importan
 * @returns las filas vigentes, los segundos desde la lectura y el error si lo hay
 */
export function useTableroEnVivo ({ inicial, errorInicial, segundos, tiposEnVivo = [] }: OpcionesDelTablero): TableroEnVivo {
  const [filas, setFilas] = useState(inicial)
  const [transcurrido, setTranscurrido] = useState(0)
  const [error, setError] = useState<string | null>(errorInicial)

  /** Cuándo se leyeron las filas. Los contadores cuentan desde acá, no desde `start_time`. */
  const leidoEn = useRef(0)
  /** La consulta vigente, para que un aviso del bus la dispare sin volver a armar el sondeo. */
  const consultaVigente = useRef<((descartable?: boolean) => void) | null>(null)

  // `Date.now()` no se puede leer durante el render —regla de pureza de React— y tampoco haría falta:
  // el contador arranca en cero para no romper la hidratación, así que la marca se sella al montar,
  // que es justo cuando empieza a correr.
  useEffect(() => { leidoEn.current = Date.now() }, [])

  const refrescar = useCallback(async (senal: AbortSignal): Promise<void> => {
    const respuesta = await fetch('/api/bff/live', { signal: conLimite(senal, TIEMPO_LECTURA_MS) })

    if (!respuesta.ok) throw new Error('La API no respondió a la consulta del tablero.')

    const sobre = await respuesta.json() as { data: FilaDeLive[] }

    leidoEn.current = Date.now()
    setFilas(sobre.data)
    setTranscurrido(0)
    setError(null)
  }, [])

  useEffect(() => {
    const control = new AbortController()
    let ultimaConsulta = 0

    const consultar = sondeoSinApilar(async () => {
      ultimaConsulta = Date.now()

      try {
        await refrescar(control.signal)
      } catch (fallo) {
        if (control.signal.aborted) return

        setError(
          esTiempoAgotado(fallo)
            ? 'El tablero tardó en responder. Se vuelve a intentar solo.'
            : fallo instanceof Error ? fallo.message : 'No se pudo actualizar el tablero.'
        )
      }
    })

    consultaVigente.current = consultar

    // Con la pestaña oculta no se pregunta: nadie está mirando, y el tablero se pone al día solo
    // en cuanto vuelve al frente. El tic periódico no se apila sobre una consulta en camino.
    const tic = (): void => { if (!document.hidden) consultar(false) }
    const ticPeriodico = (): void => { if (!document.hidden) consultar(true) }
    // Con el bus de «en vivo» conectado el intervalo es solo respaldo: los cambios llegan por
    // `escucharMedidor` (el puente lo avisa en cada evento de jornada o cronómetro).
    const ticDelIntervalo = (): void => {
      if (estaConectadoEnVivo() && !debeSondear(ultimaConsulta, segundos * 1000, true, Date.now())) return
      ticPeriodico()
    }

    const dejarDeEscuchar = escucharMedidor(tic)
    const intervalo = globalThis.setInterval(ticDelIntervalo, segundos * 1000)
    document.addEventListener('visibilitychange', ticPeriodico)

    return () => {
      consultaVigente.current = null
      dejarDeEscuchar()
      globalThis.clearInterval(intervalo)
      document.removeEventListener('visibilitychange', ticPeriodico)
      control.abort()
    }
  }, [refrescar, segundos])

  // Un aviso real (no un tic): si hay una consulta en vuelo se repite al terminar. Con la pestaña
  // oculta se omite, como el resto: al volver al frente el tic la pone al día.
  useEnVivo(tiposEnVivo, () => { if (!document.hidden) consultaVigente.current?.(false) })

  const hayMedidores = filas.some((fila) => fila.medidor !== null || fila.jornada !== null)

  // El tic de un segundo es uno solo y solo existe mientras haya algo corriendo: cincuenta filas con
  // su propio intervalo repintarían el tablero entero cincuenta veces por segundo.
  useEffect(() => {
    if (!hayMedidores) return

    const id = globalThis.setInterval(() => {
      setTranscurrido((Date.now() - leidoEn.current) / 1000)
    }, 1000)

    return () => { globalThis.clearInterval(id) }
  }, [hayMedidores])

  return { filas, transcurrido, error }
}
