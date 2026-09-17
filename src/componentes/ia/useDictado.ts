'use client'

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { subirArchivoEnBff } from '@/componentes/datos/mutaciones'
import { mensajeDeMicrofono, mimeDeGrabacion } from '@/dominio/actas'
import {
  CAMPO_DICTADO,
  componerDictado,
  crearMotorDeDictado,
  hayDictado,
  leerTrozos,
  mensajeDeErrorDeDictado,
  MAXIMO_BYTES_DICTADO,
  nombreDeDictado,
  pideRespaldo,
  RUTA_DICTADO,
  SEGUNDOS_MAXIMOS_DICTADO,
  unirDictado,
  type MotorDeDictado
} from '@/dominio/dictado'

/**
 * Suscripcion vacia: el soporte del navegador no cambia durante la sesion.
 *
 * Se define fuera del hook porque `useSyncExternalStore` vuelve a suscribirse cada vez que esta
 * funcion cambia de identidad, y una definida dentro cambia en cada render.
 */
const SIN_CAMBIOS = (): (() => void) => () => {}

/** En el servidor no hay `window`, y decir que si ahi rompe la hidratacion del boton. */
const SIN_SOPORTE = (): boolean => false

/** Bits por segundo de la grabacion del respaldo: los mismos que usa la grabadora del Meeting Paper. */
const BITS_POR_SEGUNDO = 32000

/** Ritmo con el que `MediaRecorder` entrega trozos. Sin esto, todo el audio llega al final de una vez. */
const TROZO_MS = 1000

/** Donde se recuerda que el motor del navegador no sirve, para no reintentarlo en cada dictado. */
const CLAVE_SIN_MOTOR = 'ops:dictado-sin-motor'

/** En que anda el dictado. Son cuatro estados y no un booleano porque el respaldo tiene espera. */
export type FaseDictado = 'reposo' | 'escuchando' | 'grabando' | 'transcribiendo'

/** Lo que el hook le entrega al boton que lo usa. */
export interface Dictado {
  /** `false` cuando este navegador no puede dictar por ningun camino: el boton no se dibuja. */
  soportado: boolean
  /** En que anda ahora. */
  fase: FaseDictado
  /** Ultimo fallo legible, o cadena vacia. Se limpia al volver a dictar. */
  error: string
  /** Arranca el dictado si estaba en reposo, lo termina si estaba andando. */
  alternar: () => void
}

/** Si este navegador sabe grabar audio, que es lo que necesita el respaldo. */
function hayGrabacion (): boolean {
  return typeof window !== 'undefined'
    && typeof MediaRecorder !== 'undefined'
    && navigator.mediaDevices?.getUserMedia !== undefined
}

/** Si se puede dictar de alguna de las dos formas. */
function hayAlgunMotor (): boolean {
  return hayDictado() || hayGrabacion()
}

/** Lo que quedo anotado de una sesion anterior: el motor del navegador no sirve en este navegador. */
function motorDescartado (): boolean {
  try {
    return window.sessionStorage.getItem(CLAVE_SIN_MOTOR) === '1'
  } catch {
    // Ventana privada o almacenamiento bloqueado: se reintenta el motor del navegador y, si vuelve
    // a fallar, se cae al respaldo igual. Se pierde una llamada fallida, no la funcion.
    return false
  }
}

/** Anota que el motor del navegador no sirve, para que el proximo dictado no lo reintente. */
function descartarMotor (): void {
  try {
    window.sessionStorage.setItem(CLAVE_SIN_MOTOR, '1')
  } catch {
    // Ver `motorDescartado()`: sin almacenamiento se reintenta, y eso es aceptable.
  }
}

/**
 * Maneja el dictado y va escribiendo lo dictado en el campo de texto de quien lo llama.
 *
 * Prueba el motor del navegador y, cuando ese navegador no puede reconocer voz, graba y manda el
 * audio al board sin pedir otro clic. El detalle de por que hay dos motores esta en
 * `dominio/dictado.ts`.
 *
 * El hook no guarda el texto: lo manda por `alEscribir` en cada evento, asi el campo sigue siendo
 * la unica fuente de verdad y lo dictado se puede editar a mano. Lo que si guarda es el texto que
 * habia al arrancar (`previo`), porque lo confirmado se acumula sobre eso y no sobre el valor
 * actual: leer el valor actual en cada evento duplicaria la frase que el hook acaba de escribir.
 *
 * Al desmontar se aborta el motor y se sueltan las pistas del microfono. Sin eso el microfono queda
 * abierto —con el punto rojo en la pestaña— despues de cerrar el chat.
 *
 * @param leerValor  devuelve lo que hay ahora en el campo; se lee solo al arrancar el dictado
 * @param alEscribir recibe el texto compuesto que el campo tiene que mostrar
 * @param maximo     largo maximo del campo, en caracteres
 * @returns el estado del dictado y la funcion para prenderlo o apagarlo
 */
export function useDictado (
  leerValor: () => string,
  alEscribir: (texto: string) => void,
  maximo: number
): Dictado {
  // `useSyncExternalStore` y no un efecto: React pinta el servidor con `false` y el cliente con lo
  // que el navegador tenga, sin un render intermedio que esconda el boton a quien si puede dictar.
  const soportado = useSyncExternalStore(SIN_CAMBIOS, hayAlgunMotor, SIN_SOPORTE)
  const [fase, setFase] = useState<FaseDictado>('reposo')
  const [error, setError] = useState('')

  const motor = useRef<MotorDeDictado | null>(null)
  const grabadora = useRef<MediaRecorder | null>(null)
  const flujo = useRef<MediaStream | null>(null)
  const trozos = useRef<Blob[]>([])
  const corte = useRef<ReturnType<typeof setTimeout> | null>(null)
  const vivo = useRef(true)
  const previo = useRef('')
  const confirmado = useRef('')

  /** Suelta el microfono y el temporizador del corte. Se llama en todos los finales. */
  const soltar = useCallback(() => {
    if (corte.current !== null) {
      clearTimeout(corte.current)
      corte.current = null
    }

    flujo.current?.getTracks().forEach((pista) => { pista.stop() })
    flujo.current = null
    grabadora.current = null
  }, [])

  useEffect(() => {
    vivo.current = true

    return () => {
      vivo.current = false
      motor.current?.abort()
      motor.current = null
      if (grabadora.current?.state === 'recording') grabadora.current.stop()
      soltar()
    }
  }, [soltar])

  /** El respaldo: graba, sube y escribe lo que el board transcribio. */
  const grabar = useCallback(async () => {
    if (!hayGrabacion()) {
      setError('Este navegador no puede dictar: no sabe reconocer voz ni grabar audio.')

      return
    }

    let entrada: MediaStream
    try {
      entrada = await navigator.mediaDevices.getUserMedia({ audio: true })
    } catch (fallo: unknown) {
      setError(mensajeDeMicrofono(fallo instanceof Error ? fallo.name : ''))

      return
    }

    // Entre el `await` y aca el chat pudo cerrarse: seguir dejaria el microfono abierto sin nadie
    // mirando y subiria un audio que ya no tiene donde escribirse.
    if (!vivo.current) {
      entrada.getTracks().forEach((pista) => { pista.stop() })

      return
    }

    const mime = mimeDeGrabacion()
    const opciones: MediaRecorderOptions = { audioBitsPerSecond: BITS_POR_SEGUNDO }
    if (mime !== '') opciones.mimeType = mime

    let motorDeGrabacion: MediaRecorder
    try {
      motorDeGrabacion = new MediaRecorder(entrada, opciones)
    } catch {
      entrada.getTracks().forEach((pista) => { pista.stop() })
      setError('Este navegador no puede grabar audio.')

      return
    }

    trozos.current = []
    flujo.current = entrada
    grabadora.current = motorDeGrabacion

    motorDeGrabacion.ondataavailable = (evento) => {
      if (evento.data.size > 0) trozos.current.push(evento.data)
    }

    motorDeGrabacion.onstop = () => {
      const tipo = motorDeGrabacion.mimeType === '' ? 'audio/webm' : motorDeGrabacion.mimeType
      const bloque = new Blob(trozos.current, { type: tipo })
      trozos.current = []
      soltar()

      if (!vivo.current) return

      if (bloque.size === 0) {
        setFase('reposo')
        setError('No se grabó nada. Revisa que el micrófono esté conectado.')

        return
      }

      if (bloque.size > MAXIMO_BYTES_DICTADO) {
        setFase('reposo')
        setError('El dictado quedó demasiado largo. Dilo en frases más cortas.')

        return
      }

      setFase('transcribiendo')

      const archivo = new File([bloque], nombreDeDictado(tipo), { type: tipo })

      void subirArchivoEnBff<{ texto: string }>(RUTA_DICTADO, archivo, CAMPO_DICTADO).then((resultado) => {
        if (!vivo.current) return

        setFase('reposo')

        if (!resultado.ok) {
          setError(resultado.mensaje)

          return
        }

        const texto = resultado.datos.texto.trim()

        if (texto === '') {
          setError('No se entendió nada de lo que se dictó.')

          return
        }

        alEscribir(componerDictado(previo.current, texto, maximo))
      })
    }

    // El corte existe porque el respaldo se paga por segundo de GPU: ver `SEGUNDOS_MAXIMOS_DICTADO`.
    corte.current = setTimeout(() => {
      if (grabadora.current?.state === 'recording') grabadora.current.stop()
    }, SEGUNDOS_MAXIMOS_DICTADO * 1000)

    motorDeGrabacion.start(TROZO_MS)
    setFase('grabando')
  }, [alEscribir, maximo, soltar])

  /** El camino principal: el motor del navegador, que escribe mientras se habla. */
  const escuchar = useCallback((): boolean => {
    const nuevo = crearMotorDeDictado()
    if (nuevo === null) return false

    nuevo.onresult = (evento) => {
      const partes = leerTrozos(evento)
      confirmado.current += partes.confirmado
      alEscribir(componerDictado(previo.current, unirDictado(confirmado.current, partes.parcial), maximo))
    }

    nuevo.onerror = (evento) => {
      // El navegador declara la API pero no puede usarla: se cambia de motor con el mismo gesto,
      // sin contarle a la persona un fallo que no es suyo ni pedirle que aprete de nuevo.
      if (pideRespaldo(evento.error)) {
        descartarMotor()
        motor.current?.abort()
        motor.current = null
        void grabar()

        return
      }

      const mensaje = mensajeDeErrorDeDictado(evento.error)
      if (mensaje !== '') setError(mensaje)
    }

    nuevo.onend = () => {
      // Lo parcial muere con el motor: en el campo queda solo lo que alcanzo a confirmarse.
      if (motor.current !== null) {
        alEscribir(componerDictado(previo.current, confirmado.current, maximo))
        motor.current = null
      }

      // Si el fallo ya arranco el respaldo, la fase es suya y no hay que pisarla.
      if (vivo.current) setFase((actual) => (actual === 'escuchando' ? 'reposo' : actual))
    }

    try {
      nuevo.start()
    } catch {
      // `start()` lanza si el motor ya estaba corriendo en otra instancia de la misma pestaña.
      setError('El micrófono ya está en uso en esta pestaña.')

      return true
    }

    motor.current = nuevo
    setFase('escuchando')

    return true
  }, [alEscribir, grabar, maximo])

  const alternar = useCallback(() => {
    if (fase === 'transcribiendo') return

    if (motor.current !== null) {
      // `stop()` y no `abort()`: deja llegar lo ultimo que el motor tenia a medio confirmar.
      motor.current.stop()

      return
    }

    if (grabadora.current !== null) {
      if (grabadora.current.state === 'recording') grabadora.current.stop()

      return
    }

    previo.current = leerValor()
    confirmado.current = ''
    setError('')

    if (!motorDescartado() && escuchar()) return

    void grabar()
  }, [escuchar, fase, grabar, leerValor])

  return { soportado, fase, error, alternar }
}
