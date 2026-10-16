'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useEnVivo } from '@/componentes/en-vivo/useEnVivo'
import { pedirSobre } from '@/datos/cliente'
import { estaConectadoEnVivo } from '@/datos/en-vivo'
import { debeSondear } from '@/dominio/en-vivo'
import { conHilo, sinComentario, type HiloDeActa } from '@/dominio/comentarios-acta'

/** Cada cuánto se mira si hay comentarios nuevos cuando el aviso en vivo no llega (o no hay socket). */
const SONDEO_DE_COMENTARIOS_MS = 60_000

/** Cómo va la carga de los hilos. */
export type FaseDeHilos = 'apagado' | 'cargando' | 'listo' | 'error'

export interface HilosDelActa {
  fase: FaseDeHilos
  hilos: HiloDeActa[]
  /** El texto del último fallo de carga; `null` si no hay. */
  error: string | null
  /** Vuelve a pedir los hilos mostrando «cargando»: el botón «Reintentar». */
  recargar: () => void
  /** Pone al día un hilo con lo que devolvió una escritura, sin otra petición. */
  aplicarHilo: (hilo: HiloDeActa) => void
  /** Quita un comentario ya borrado (el hilo entero si era la raíz). */
  quitarComentario: (comentarioId: number) => void
}

interface OpcionesDeHilos {
  /** Ruta del acta (`projects/{id}/actas/{actaId}`). */
  ruta: string
  actaId: number
  /** Los comentarios están encendidos y esta persona los ve; apagado, el hook no pide nada. */
  activo: boolean
}

/**
 * Los hilos de comentarios en línea de un Meeting Paper, siempre al día.
 *
 * Se piden al abrir el acta y se vuelven a pedir en silencio cuando llega el aviso en vivo
 * `acta_comentario` de esta acta, al volver a la pestaña y cada minuto: con el socket conectado el
 * sondeo baja a respaldo (`debeSondear`), sin socket sigue como siempre. Con `activo` en `false` no
 * hace ninguna petición ni escucha nada.
 *
 * Una lectura en silencio que falla conserva lo que ya estaba en pantalla; solo la primera carga (o
 * un «Reintentar») muestra el error.
 *
 * @param opciones la ruta del acta, su id y si están activos los comentarios
 * @returns la fase, los hilos y las funciones para ponerlos al día
 */
export function useHilosDelActa ({ ruta, actaId, activo }: OpcionesDeHilos): HilosDelActa {
  const [hilos, setHilos] = useState<HiloDeActa[]>([])
  const [fase, setFase] = useState<FaseDeHilos>('cargando')
  const [error, setError] = useState<string | null>(null)
  const [intento, setIntento] = useState(0)
  const [peticion, setPeticion] = useState(`${ruta}|0`)
  const revalidarAhora = useRef<(() => void) | null>(null)

  // Cambiar de acta o de intento vuelve a «cargando» en el render y no en el efecto, igual que
  // `useRecurso`: así no se ve un instante la lista de otra acta.
  const actual = `${ruta}|${intento}`
  if (peticion !== actual) {
    setPeticion(actual)
    setFase('cargando')
    setHilos([])
  }

  useEffect(() => {
    if (!activo) return

    const control = new AbortController()
    let ultimaLectura = 0

    async function leer (silenciosa: boolean): Promise<void> {
      ultimaLectura = Date.now()

      try {
        const sobre = await pedirSobre<HiloDeActa[]>(`${ruta}/comentarios`, control.signal)

        if (control.signal.aborted) return

        setHilos(sobre.data)
        setFase('listo')
        setError(null)
      } catch (fallo: unknown) {
        if (control.signal.aborted || silenciosa) return

        setFase('error')
        setError(fallo instanceof Error ? fallo.message : 'No se pudieron cargar los comentarios.')
      }
    }

    function siSeVe (sondeo: boolean): void {
      if (document.hidden) return
      if (sondeo && !debeSondear(ultimaLectura, SONDEO_DE_COMENTARIOS_MS, estaConectadoEnVivo(), Date.now())) return

      void leer(true)
    }

    revalidarAhora.current = () => { siSeVe(false) }
    void leer(false)

    const intervalo = globalThis.setInterval(() => { siSeVe(true) }, SONDEO_DE_COMENTARIOS_MS)
    const alVolver = (): void => { siSeVe(true) }

    document.addEventListener('visibilitychange', alVolver)

    return () => {
      revalidarAhora.current = null
      globalThis.clearInterval(intervalo)
      document.removeEventListener('visibilitychange', alVolver)
      control.abort()
    }
  }, [activo, ruta, intento])

  useEnVivo(['acta_comentario'], (cambio) => {
    if (activo && cambio.id === actaId) revalidarAhora.current?.()
  })

  const recargar = useCallback(() => { setIntento((n) => n + 1) }, [])
  const aplicarHilo = useCallback((hilo: HiloDeActa) => { setHilos((previos) => conHilo(previos, hilo)) }, [])
  const quitarComentario = useCallback((id: number) => { setHilos((previos) => sinComentario(previos, id)) }, [])

  return { fase: activo ? fase : 'apagado', hilos: activo ? hilos : [], error, recargar, aplicarHilo, quitarComentario }
}
