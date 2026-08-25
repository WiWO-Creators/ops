'use client'

import { useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/clases'

/**
 * Los estados que define Neo (https://neo.wiwo.me, seccion "Orb states").
 *
 * Cada uno cambia ritmo, brillo, deformacion y direccion del movimiento. No son decorativos: el orbe
 * es la señal de Wiwo para comunicar que el sistema esta pensando, y el estado dice **que** esta
 * pensando.
 *
 *   listening   scan vertical y pulsos sensibles al input
 *   thinking    auroras rapidas y anillos de luz — el estado por defecto de una espera
 *   generating  el campo de luz se expande y empuja trails hacia la interfaz
 *   routing     orbitas conectadas, agentes coordinando una ruta
 *   success     destello corto, estabilizacion y regreso a la calma
 *   error       contraccion fria y baja energia, sin dramatizar el problema
 *
 * `idle` de Neo no esta: alli describe un orbe presente y disponible, que aca es el orbe sin estado
 * — ver la prop `estado`.
 */
export type EstadoOrbe = 'listening' | 'thinking' | 'generating' | 'routing' | 'success' | 'error'

export type TamanoOrbe = 'chico' | 'medio' | 'grande'

/** Alto del escenario. El orbe lo llena: no es un objeto con medida propia sino un campo de luz. */
const ALTO: Record<TamanoOrbe, number> = {
  chico: 24,
  medio: 48,
  grande: 260
}

/**
 * Los cuatro destellos, con la posicion, medida, color y ritmo que trae el orbe de Neo.
 *
 * Los `--spark-delay` negativos arrancan la animacion ya empezada, asi que al montar el orbe los
 * cuatro estan en puntos distintos de su ciclo en vez de encenderse todos juntos.
 */
const DESTELLOS = [
  { '--sx': '70%', '--sy': '18%', '--spark-size': '6px', '--spark-color': 'rgba(248, 250, 215, .92)', '--spark-speed': '5600ms', '--spark-delay': '-900ms' },
  { '--sx': '25%', '--sy': '72%', '--spark-size': '4px', '--spark-color': 'rgba(66, 66, 255, .92)', '--spark-speed': '6800ms', '--spark-delay': '-2400ms' },
  { '--sx': '79%', '--sy': '68%', '--spark-size': '8px', '--spark-color': 'rgba(59, 255, 0, .9)', '--spark-speed': '6200ms', '--spark-delay': '-1800ms' },
  { '--sx': '34%', '--sy': '24%', '--spark-size': '3px', '--spark-color': 'rgba(248, 250, 215, .72)', '--spark-speed': '7400ms', '--spark-delay': '-3100ms' }
] as const

interface PropsOrbe {
  /**
   * @see EstadoOrbe
   *
   * Sin estado el orbe queda **quieto**. La regla de rendimiento del proyecto —la que colgaba el
   * panel viejo en pantallas Retina— prohibe animaciones infinitas en elementos siempre visibles, y
   * la mascota de la barra superior es exactamente eso. Ademas comunica mejor: si se moviera
   * siempre, moverse dejaria de significar "esta pasando algo".
   */
  estado?: EstadoOrbe
  /** 24px en una fila, 48px sobre una tarjeta, 260px cuando el orbe es el centro de la pantalla. */
  tamano?: TamanoOrbe
  className?: string
}

/**
 * El Thinking Orb de Wiwo.
 *
 * No es un circulo con degradado: es un campo de luz de trece capas —membrana liquida, causticas,
 * tres auroras, borde, nucleo y destellos— dentro de un escenario con `overflow: hidden`. El markup
 * y el orden de las capas son los de neo.wiwo.me; el aspecto vive en `src/estilos/thinking-orb.css`.
 *
 * Es `aria-hidden` a proposito. Lo que se anuncia a un lector de pantalla es el TEXTO que lo acompaña
 * — ver `SuperposicionOrbe` y `CargandoConOrbe` —, no el adorno.
 */
export function Orbe ({ estado, tamano = 'medio', className }: PropsOrbe) {
  return (
    <div
      aria-hidden="true"
      /*
       * `thinking-orb-demo` y `data-thinking-state` no son nombres elegidos aca: son el gancho con
       * el que el CSS de Neo activa cada estado, y sus reglas los buscan en un ancestro del orbe.
       * Renombrarlos obligaria a reescribir las 43 reglas de estado y a re-traducirlas en cada
       * version nueva del sistema.
       */
      className={cn(
        'thinking-orb-demo thinking-orb-stage',
        estado === undefined && 'orbe-quieto',
        className
      )}
      data-thinking-state={estado ?? 'idle'}
      style={{ height: ALTO[tamano], width: ALTO[tamano] }}
    >
      <div className="orb-state-field">
        <span className="orb-state-ring" />
        <span className="orb-state-ring alt" />
        <span className="orb-scan-line" />
        <span className="orb-output-trail one" />
        <span className="orb-output-trail two" />
        <span className="orb-output-trail three" />
        <span className="orb-success-burst" />
        <span className="orb-retry-notch" />
      </div>

      <div className="wiwo-thinking-orb">
        <span className="orb-pulse" />
        <span className="orb-pulse" />
        <span className="orb-pulse" />
        <span className="orb-liquid-veil" />
        <span className="orb-caustic" />
        <span className="orb-light-field" />
        <span className="orb-aurora orb-aurora-one" />
        <span className="orb-aurora orb-aurora-two" />
        <span className="orb-aurora orb-aurora-three" />
        <span className="orb-rim" />
        <span className="orb-core" />
        <span className="orb-glint" />
      </div>

      <span className="orb-particle" />
      <span className="orb-particle" />
      <span className="orb-particle" />

      {DESTELLOS.map((destello, indice) => (
        <span key={indice} className="orb-spark" style={destello as React.CSSProperties} />
      ))}
    </div>
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
