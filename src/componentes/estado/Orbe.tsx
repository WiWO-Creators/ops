'use client'

import { useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/clases'
import estilos from './orbe.module.css'

const TAMANOS = {
  chico: estilos.chico,
  medio: estilos.medio,
  grande: estilos.grande
} as const

export type TamanoOrbe = keyof typeof TAMANOS

interface PropsOrbe {
  tamano?: TamanoOrbe
  /**
   * Si el orbe se mueve.
   *
   * En reposo se pinta quieto a proposito: la regla de rendimiento del proyecto prohibe animaciones
   * infinitas en elementos siempre visibles —es lo que colgaba el panel en pantallas Retina— y la
   * mascota de la barra superior es exactamente eso.
   *
   * Ademas comunica mejor: si se moviera siempre, moverse dejaria de significar "hay algo en curso".
   */
  animado?: boolean
  className?: string
}

/**
 * El orbe de WiWO: mascota de la marca e indicador de carga.
 *
 * Es `aria-hidden` a proposito. Lo que se anuncia a un lector de pantalla es el TEXTO que lo acompaña
 * — ver `SuperposicionOrbe` y `CargandoConOrbe` —, no el adorno.
 *
 * @param tamano  24px dentro de un boton, 42px sobre un panel, 130px a pantalla completa
 * @param animado si hay una operacion en curso
 */
export function Orbe ({ tamano = 'medio', animado = false, className }: PropsOrbe) {
  return (
    <span
      aria-hidden="true"
      data-animado={animado ? 'true' : 'false'}
      className={cn(estilos.orbe, TAMANOS[tamano], className)}
    >
      <span className={estilos.cuerpo}>
        <span className={estilos.velo} />
        <span className={estilos.luz} />
      </span>
      <i className={cn(estilos.destello, estilos.destello1)} />
      <i className={cn(estilos.destello, estilos.destello2)} />
      <i className={cn(estilos.destello, estilos.destello3)} />
    </span>
  )
}

interface PropsSuperposicion {
  mensaje: string
  submensaje?: string
  /**
   * Si se acota al contenedor padre en vez de cubrir la pantalla.
   *
   * Acotarla es casi siempre lo correcto: la operacion afecta a ese panel y no a todo, y bloquear la
   * pantalla entera por una consulta de una tabla es desproporcionado.
   */
  acotada?: boolean
  tamano?: TamanoOrbe
}

/**
 * Superposicion con el orbe, para una operacion que bloquea.
 *
 * `role="status"` con `aria-live="polite"` hace que el mensaje se anuncie sin interrumpir lo que el
 * lector de pantalla este diciendo. El orbe queda fuera del arbol de accesibilidad.
 *
 * Cuando es acotada, el contenedor padre necesita `position: relative`. Se comprueba en desarrollo y
 * se avisa por consola en vez de fallar en silencio, que es como uno termina buscando por que la
 * superposicion aparecio en la esquina de la pagina.
 */
export function SuperposicionOrbe ({
  mensaje,
  submensaje,
  acotada = false,
  tamano = 'medio'
}: PropsSuperposicion) {
  const referencia = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!acotada || process.env.NODE_ENV === 'production') return

    const padre = referencia.current?.parentElement
    if (padre !== null && padre !== undefined && getComputedStyle(padre).position === 'static') {
      console.warn(
        '[Orbe] Una superposición acotada necesita que su contenedor tenga posición relativa; ' +
        'si no, se ubica respecto de la página.'
      )
    }
  }, [acotada])

  return (
    <div
      ref={referencia}
      role="status"
      aria-live="polite"
      className={cn(estilos.superposicion, acotada && estilos.acotada)}
    >
      <Orbe tamano={tamano} animado />
      <p className={estilos.mensaje}>{mensaje}</p>
      {submensaje !== undefined && <p className={estilos.submensaje}>{submensaje}</p>}
    </div>
  )
}

/**
 * Orbe con texto al lado, para una carga en linea.
 *
 * El retardo evita el parpadeo: una operacion que tarda 80 ms no debe mostrar un indicador que
 * aparece y desaparece: eso se percibe como un defecto, no como progreso.
 *
 * @param mensaje texto que acompaña al orbe
 * @param retardoMs cuanto esperar antes de mostrarse
 */
export function CargandoConOrbe ({
  mensaje,
  retardoMs = 250,
  className
}: {
  mensaje: string
  retardoMs?: number
  className?: string
}) {
  const [visible, setVisible] = useState(retardoMs === 0)

  useEffect(() => {
    if (retardoMs === 0) return
    const temporizador = setTimeout(() => setVisible(true), retardoMs)

    return () => clearTimeout(temporizador)
  }, [retardoMs])

  if (!visible) return null

  return (
    <span role="status" aria-live="polite" className={cn('inline-flex items-center gap-2', className)}>
      <Orbe tamano="chico" animado />
      <span className="text-texto-tenue text-sm">{mensaje}</span>
    </span>
  )
}
