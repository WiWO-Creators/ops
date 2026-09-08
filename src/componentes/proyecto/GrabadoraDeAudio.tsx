'use client'

import { useCallback, useEffect, useRef, useState, type ReactElement } from 'react'
import { Boton } from '@/componentes/formularios/Boton'
import { Orbe } from '@/componentes/estado/Orbe'
import {
  MAXIMO_GRABACION_MS,
  formatoPeso,
  mensajeDeMicrofono,
  mimeDeGrabacion,
  nombreDeGrabacion,
  reloj
} from '@/dominio/actas'

/**
 * Grabación de la reunión desde el navegador.
 *
 * Porta la grabadora de MeetingMatico con dos correcciones que allá son fallos reales:
 *
 * 1. **La fuga de micrófono.** El original solo detiene las pistas dentro de `onstop`, así que si el
 *    componente se desmonta grabando, el `MediaStream` queda vivo y la luz del micrófono sigue
 *    encendida hasta cerrar el navegador. Acá pasa todo el tiempo: `Pestanas` desmonta la pestaña
 *    inactiva, o sea que basta con cambiar de pestaña. La limpieza vive en el `useEffect` de
 *    desmontaje, que es el único lugar que corre siempre.
 * 2. **Safari.** El original fija `audio/webm`, que Safari no graba: la grabación falla en todos los
 *    iPhone. `mimeDeGrabacion()` prueba en orden y deja que el navegador elija el suyo.
 *
 * `getUserMedia` se llama **solo dentro del handler del botón**, nunca en un efecto de montaje: es
 * la diferencia entre pedir el micrófono cuando alguien pidió grabar y pedirlo por abrir la pestaña.
 *
 * `audioBitsPerSecond: 32000` es la perilla que hace que esto entre en el límite de subida: a 32 kbps
 * una hora de voz pesa ~14 MB; con el valor por defecto de Chrome (~128 kbps) pesa ~58 MB y se
 * rechaza. Para voz de reunión, 32 kbps sobra.
 */

/** Ritmo con el que `MediaRecorder` entrega trozos. Sin esto, todo el audio llega al final de una vez. */
const TROZO_MS = 1000

/** Bits por segundo de la grabación. Ver el docblock: es lo que hace que una reunión larga entre. */
const BITS_POR_SEGUNDO = 32000

interface PropsGrabadora {
  /** Recibe el archivo cuando la persona detiene la grabación. */
  onGrabado: (archivo: File) => void
  /** Se llama con el archivo en `null` cuando la grabación se descarta. */
  onDescartado: () => void
  /** Deshabilita el control mientras el acta se está generando. */
  ocupado?: boolean
}

export function GrabadoraDeAudio ({ onGrabado, onDescartado, ocupado = false }: PropsGrabadora): ReactElement {
  const [grabando, setGrabando] = useState(false)
  const [transcurrido, setTranscurrido] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [listo, setListo] = useState<{ nombre: string, bytes: number } | null>(null)

  const grabadora = useRef<MediaRecorder | null>(null)
  const flujo = useRef<MediaStream | null>(null)
  const trozos = useRef<Blob[]>([])
  const intervalo = useRef<ReturnType<typeof setInterval> | null>(null)

  /**
   * Suelta el micrófono y los temporizadores.
   *
   * Es idempotente porque se llama desde tres lados: al detener, al desmontar y al fallar. Detener
   * las pistas es lo que apaga la luz del micrófono; sin eso el navegador la deja encendida aunque
   * la aplicación ya no esté grabando.
   */
  const soltar = useCallback(() => {
    if (intervalo.current !== null) {
      clearInterval(intervalo.current)
      intervalo.current = null
    }

    flujo.current?.getTracks().forEach((pista) => { pista.stop() })
    flujo.current = null
    grabadora.current = null
  }, [])

  // La limpieza del desmontaje es el arreglo del bug portado: cambiar de pestaña desmonta este
  // componente, y sin esto el micrófono se queda tomado.
  useEffect(() => () => {
    if (grabadora.current !== null && grabadora.current.state !== 'inactive') {
      grabadora.current.stop()
    }
    soltar()
  }, [soltar])

  const detener = useCallback(() => {
    if (grabadora.current !== null && grabadora.current.state !== 'inactive') {
      grabadora.current.stop()
    }
    setGrabando(false)
  }, [])

  async function empezar (): Promise<void> {
    setError(null)
    setListo(null)
    onDescartado()

    let entrada: MediaStream
    try {
      entrada = await navigator.mediaDevices.getUserMedia({ audio: true })
    } catch (fallo: unknown) {
      setError(mensajeDeMicrofono(fallo instanceof Error ? fallo.name : ''))

      return
    }

    const mime = mimeDeGrabacion()
    const opciones: MediaRecorderOptions = { audioBitsPerSecond: BITS_POR_SEGUNDO }
    if (mime !== '') opciones.mimeType = mime

    let motor: MediaRecorder
    try {
      motor = new MediaRecorder(entrada, opciones)
    } catch {
      entrada.getTracks().forEach((pista) => { pista.stop() })
      setError('Este navegador no puede grabar audio.')

      return
    }

    trozos.current = []
    flujo.current = entrada
    grabadora.current = motor

    motor.ondataavailable = (evento) => {
      if (evento.data.size > 0) trozos.current.push(evento.data)
    }

    motor.onstop = () => {
      const tipo = motor.mimeType === '' ? 'audio/webm' : motor.mimeType
      const bloque = new Blob(trozos.current, { type: tipo })
      trozos.current = []
      soltar()

      if (bloque.size === 0) {
        setError('La grabación quedó vacía.')

        return
      }

      const archivo = new File([bloque], nombreDeGrabacion(tipo), { type: tipo })
      setListo({ nombre: archivo.name, bytes: archivo.size })
      onGrabado(archivo)
    }

    motor.start(TROZO_MS)
    setGrabando(true)
    setTranscurrido(0)

    const desde = Date.now()
    intervalo.current = setInterval(() => {
      const ms = Date.now() - desde
      setTranscurrido(ms)
      // Tope duro: más allá, el archivo no entra en el límite de subida y la persona se entera
      // recién al mandarlo, cuando ya grabó dos horas.
      if (ms >= MAXIMO_GRABACION_MS) detener()
    }, 1000)
  }

  return (
    <div className="border-linea bg-superficie-hundida rounded-tarjeta flex flex-col gap-3 border p-4">
      <div className="flex items-center gap-3">
        {grabando
          ? (
            <>
              <Orbe medida="2rem" estado="listening" />
              {/* El cronómetro se oculta al lector de pantalla: un contador que cambia cada segundo
                  dentro de una región viva es insoportable. El estado se anuncia una vez, al lado. */}
              <span aria-hidden="true" className="text-texto font-mono text-lg tabular-nums">
                {reloj(transcurrido)}
              </span>
              <span role="status" className="sr-only">Grabando</span>
              <Boton variante="peligro" tamano="chico" onClick={detener} data-prueba="detener">
                Detener
              </Boton>
            </>
            )
          : (
            <>
              <Boton
                variante="secundario"
                tamano="chico"
                onClick={() => { void empezar() }}
                disabled={ocupado}
                aria-describedby={error === null ? undefined : 'error-microfono'}
                data-prueba="grabar"
              >
                {listo === null ? 'Grabar la reunión' : 'Grabar de nuevo'}
              </Boton>
              {listo !== null && (
                <span role="status" className="text-texto-tenue text-sm">
                  Grabación lista: {listo.nombre} ({formatoPeso(listo.bytes)})
                </span>
              )}
            </>
            )}
      </div>

      {error !== null && (
        <p id="error-microfono" role="alert" className="text-texto-peligro text-sm">{error}</p>
      )}

      {!grabando && listo === null && error === null && (
        <p className="text-texto-sutil text-xs">
          Se graba solo el audio, se envía para escribir el acta y no queda guardado en el servidor.
        </p>
      )}
    </div>
  )
}
