'use client'

import { useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/clases'

/**
 * Los estados que define Neo (https://neo.wiwo.me, seccion "Orb states").
 *
 * Cada uno cambia ritmo, brillo, deformacion y direccion del movimiento. No son decorativos: el orbe
 * es la señal de Wiwo para comunicar que el sistema esta pensando, y el estado es lo que dice **que**
 * esta pensando.
 *
 *   idle        casi quieto, vidrio respirando, presencia disponible
 *   listening   pulsos sensibles al input
 *   thinking    auroras rapidas y anillos de luz — el estado por defecto de una espera
 *   generating  el campo de luz se expande
 *   routing     orbitas conectadas, agentes coordinando
 *   success     destello corto, estabilizacion y regreso a la calma
 *   error       contraccion fria y baja energia, sin dramatizar el problema
 */
export type EstadoOrbe =
  | 'idle'
  | 'listening'
  | 'thinking'
  | 'generating'
  | 'routing'
  | 'success'
  | 'error'

/**
 * Clase de estado del CSS de Neo.
 *
 * `thinking` no tiene modificador propio: es el comportamiento base de `.wiwo-orb`, que ya respira y
 * fluye. Y `error` comparte tratamiento con `retry` en el CSS original.
 */
const CLASE_ESTADO: Record<EstadoOrbe, string> = {
  idle: 'wiwo-orb--idle',
  listening: 'wiwo-orb--listening',
  thinking: '',
  generating: 'wiwo-orb--generating',
  routing: 'wiwo-orb--routing',
  success: 'wiwo-orb--success',
  error: 'wiwo-orb--error wiwo-orb--retry'
}

/** Los tres tamaños de Neo, en el extremo bajo de cada rango porque esto es una herramienta de trabajo. */
const MEDIDA: Record<TamanoOrbe, number> = {
  chico: 24,
  medio: 48,
  grande: 130
}

export type TamanoOrbe = 'chico' | 'medio' | 'grande'

interface PropsOrbe {
  /**
   * @see EstadoOrbe
   *
   * Sin estado el orbe se pinta **quieto**. La regla de rendimiento del proyecto —la que colgaba el
   * panel viejo en pantallas Retina— prohibe animaciones infinitas en elementos siempre visibles, y
   * la mascota de la barra superior es exactamente eso. Ademas comunica mejor: si se moviera siempre,
   * moverse dejaria de significar "esta pasando algo".
   */
  estado?: EstadoOrbe
  /** 24px dentro de un boton o una fila, 48px sobre una tarjeta, 130px a pantalla completa. */
  tamano?: TamanoOrbe
  className?: string
}

/**
 * El Thinking Orb de Wiwo.
 *
 * Es `aria-hidden` a proposito. Lo que se anuncia a un lector de pantalla es el TEXTO que lo acompaña
 * — ver `SuperposicionOrbe` y `CargandoConOrbe` —, no el adorno.
 *
 * El aspecto y las animaciones son de `src/estilos/thinking-orb.css`, que es el archivo que Neo
 * publica para copiar tal cual. Este componente solo elige el estado y el tamaño.
 */
export function Orbe ({ estado, tamano = 'medio', className }: PropsOrbe) {
  const medida = MEDIDA[tamano]

  return (
    <span
      aria-hidden="true"
      data-estado={estado ?? 'quieto'}
      style={{ width: medida, height: medida }}
      className={cn('wiwo-orb', estado === undefined ? 'wiwo-orb--quieto' : CLASE_ESTADO[estado], className)}
    />
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
  estado?: EstadoOrbe
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
  tamano = 'medio',
  estado = 'thinking'
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
      className={cn(
        'flex flex-col items-center justify-center gap-4 bg-superficie/80 p-8 text-center',
        acotada ? 'absolute inset-0 z-10' : 'fixed inset-0 z-50'
      )}
    >
      <Orbe tamano={tamano} estado={estado} />
      <p className="text-texto text-sm font-medium">{mensaje}</p>
      {submensaje !== undefined && <p className="text-texto-tenue text-xs">{submensaje}</p>}
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
  estado = 'thinking',
  className
}: {
  mensaje: string
  retardoMs?: number
  estado?: EstadoOrbe
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
      <Orbe tamano="chico" estado={estado} />
      <span className="text-texto-tenue text-sm">{mensaje}</span>
    </span>
  )
}
