'use client'

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import {
  componerDictado,
  crearMotorDeDictado,
  hayDictado,
  leerTrozos,
  mensajeDeErrorDeDictado,
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

/** Lo que el hook le entrega al boton que lo usa. */
export interface Dictado {
  /** `false` cuando el navegador no sabe reconocer voz: el boton no se dibuja. */
  soportado: boolean
  /** El microfono esta abierto. */
  dictando: boolean
  /** Ultimo fallo legible, o cadena vacia. Se limpia al volver a dictar. */
  error: string
  /** Abre el microfono si estaba cerrado, lo cierra si estaba abierto. */
  alternar: () => void
}

/**
 * Maneja el microfono y va escribiendo lo dictado en el campo de texto de quien lo llama.
 *
 * El hook no guarda el texto: lo manda por `alEscribir` en cada evento del motor, asi el campo
 * sigue siendo la unica fuente de verdad y lo dictado se puede editar a mano sin pelear con el
 * dictado. Lo que si guarda es el texto que habia al arrancar (`previo`), porque lo confirmado se
 * acumula sobre eso y no sobre el valor actual: leer el valor actual en cada evento duplicaria la
 * frase que el hook mismo acaba de escribir.
 *
 * El motor se aborta al desmontar. Sin eso el microfono queda abierto —con el punto rojo en la
 * pestaña— despues de cerrar el chat.
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
  const soportado = useSyncExternalStore(SIN_CAMBIOS, hayDictado, SIN_SOPORTE)
  const [dictando, setDictando] = useState(false)
  const [error, setError] = useState('')

  const motor = useRef<MotorDeDictado | null>(null)
  const previo = useRef('')
  const confirmado = useRef('')

  useEffect(() => () => {
    motor.current?.abort()
    motor.current = null
  }, [])

  const alternar = useCallback(() => {
    const abierto = motor.current
    if (abierto !== null) {
      // `stop()` y no `abort()`: deja llegar lo ultimo que el motor tenia a medio confirmar.
      abierto.stop()
      return
    }

    const nuevo = crearMotorDeDictado()
    if (nuevo === null) return

    previo.current = leerValor()
    confirmado.current = ''
    setError('')

    nuevo.onresult = (evento) => {
      const trozos = leerTrozos(evento)
      confirmado.current += trozos.confirmado
      alEscribir(componerDictado(previo.current, unirDictado(confirmado.current, trozos.parcial), maximo))
    }

    nuevo.onerror = (evento) => {
      const mensaje = mensajeDeErrorDeDictado(evento.error)
      if (mensaje !== '') setError(mensaje)
    }

    nuevo.onend = () => {
      // Lo parcial muere con el motor: en el campo queda solo lo que alcanzo a confirmarse.
      alEscribir(componerDictado(previo.current, confirmado.current, maximo))
      motor.current = null
      setDictando(false)
    }

    try {
      nuevo.start()
    } catch {
      // `start()` lanza si el motor ya estaba corriendo en otra instancia de la misma pestaña.
      setError('El micrófono ya está en uso en esta pestaña.')
      return
    }

    motor.current = nuevo
    setDictando(true)
  }, [leerValor, alEscribir, maximo])

  return { soportado, dictando, error, alternar }
}
