'use client'

import { useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/clases'

/**
 * Los estados del orbe.
 *
 * Son los tres que trae el componente de ops.wiwo.me, que es la version anterior de este mismo
 * proyecto: el orbe piensa, confirma o falla. `quieto` es propio y significa que no hay nada en
 * curso — ver la prop `estado`.
 */
export type EstadoOrbe = 'thinking' | 'success' | 'error'

export type TamanoOrbe = 'chico' | 'medio' | 'grande' | 'marca'

/**
 * Los tamaños discretos del componente original, mas `marca` para cuando el orbe es el centro de la
 * pantalla y se dimensiona con el ancho disponible.
 */
const CLASE_TAMANO: Record<TamanoOrbe, string> = {
  chico: 'orb-small',
  medio: 'orb-medium',
  grande: 'orb-large',
  marca: 'orb-x-large'
}

/** Los cuatro destellos, con la posicion, escala y ritmo del orbe original. */
const DESTELLOS = [
  { '--sx': '70%', '--sy': '18%', '--spark-scale': '0.02', '--spark-speed': '5600ms', '--spark-delay': '-900ms' },
  { '--sx': '25%', '--sy': '72%', '--spark-scale': '0.013', '--spark-speed': '6800ms', '--spark-delay': '-2400ms' },
  { '--sx': '79%', '--sy': '68%', '--spark-scale': '0.026', '--spark-speed': '6200ms', '--spark-delay': '-1800ms' },
  { '--sx': '34%', '--sy': '24%', '--spark-scale': '0.01', '--spark-speed': '7400ms', '--spark-delay': '-3100ms' }
] as const

interface PropsOrbe {
  /**
   * @see EstadoOrbe
   *
   * Sin estado el orbe queda **en reposo**: respira, pero apenas —y solo en los tamaños grandes y
   * en la medida libre, que aparecen de a uno en pantalla. El chico y el mediano, que se repiten
   * por fila y por boton, quedan quietos: la regla de rendimiento del proyecto —la que colgaba el
   * panel viejo en pantallas Retina— prohibe animaciones infinitas en elementos siempre visibles.
   * Ademas comunica mejor: si se deformara siempre, deformarse dejaria de significar "esta pasando
   * algo". Ver el bloque "Orbe en reposo" de `thinking-orb.css`.
   */
  estado?: EstadoOrbe
  /** `chico` en una fila, `medio` en un boton, `grande` en una tarjeta, `marca` a pantalla completa. */
  tamano?: TamanoOrbe
  /**
   * Medida libre, para cuando ninguno de los tamaños discretos sirve. Cualquier valor CSS. Cuenta
   * como tamaño grande para el reposo animado: se usa cuando el orbe es el foco de la pantalla.
   * Ej: `clamp(14rem, 26vw, 21rem)` — el que usa el orbe de marca en el acceso.
   */
  medida?: string
  className?: string
}

/**
 * El Thinking Orb de Wiwo.
 *
 * Es una esfera de vidrio translucida: **desenfoca lo que tiene detras en vez de traer su propio
 * fondo**, asi que se ve bien sobre claro, sobre oscuro o sobre una imagen sin configurar nada. El
 * aspecto vive en `src/estilos/thinking-orb.css`, portado de ops.wiwo.me.
 *
 * Es `aria-hidden` a proposito. Lo que se anuncia a un lector de pantalla es el TEXTO que lo acompaña
 * — ver `SuperposicionOrbe` y `CargandoConOrbe` —, no el adorno.
 */
export function Orbe ({ estado, tamano = 'medio', medida, className }: PropsOrbe) {
  return (
    <div
      aria-hidden="true"
      data-orb-state={estado ?? 'quieto'}
      style={medida === undefined ? undefined : ({ '--orb-size': medida } as React.CSSProperties)}
      className={cn(
        'wiwo-thinking-orb detail-full',
        CLASE_TAMANO[tamano],
        medida === undefined ? undefined : 'orb-libre',
        className
      )}
    >
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
      <span className="orb-particle orb-particle-one" />
      <span className="orb-particle orb-particle-two" />
      <span className="orb-particle orb-particle-three" />
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
  tamano = 'grande',
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
