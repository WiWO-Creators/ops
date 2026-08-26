'use client'

import { useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/clases'

/**
 * Los estados del orbe.
 *
 * Son los siete de https://neo.wiwo.me, que es de donde viene el aspecto. `thinking`, `success` y
 * `error` significan lo mismo que en la version anterior del componente, asi que los consumidores
 * que ya existian no cambian. Los otros cuatro estaban en el diseño y no en el codigo:
 *
 * - `idle`: presencia disponible, casi quieto. Es el orbe esperando a que pase algo.
 * - `listening`: hay entrada del usuario en curso (un formulario, un dictado, una busqueda).
 * - `generating`: sale contenido hacia la interfaz. El orbe se corre y empuja tres estelas.
 * - `routing`: se esta decidiendo a donde va la operacion. Orbitas conectadas.
 *
 * `undefined` es reposo: no hay ninguna operacion. No es lo mismo que `idle`, que es un estado
 * declarado y se ve.
 */
export type EstadoOrbe =
  | 'idle'
  | 'listening'
  | 'thinking'
  | 'generating'
  | 'routing'
  | 'success'
  | 'error'

export type TamanoOrbe = 'chico' | 'medio' | 'grande' | 'marca'

/**
 * Los tamaños discretos, en las clases que fijan `--orbe-ancho` en `thinking-orb.css`.
 *
 * La escala sale del propio sistema de diseño de neo: 24-32px para botones y microestados, 48-72px
 * para tarjetas y respuestas en linea, 120-240px para una generacion completa. `marca` es el
 * `clamp()` de la pagina, para cuando el orbe ES la pantalla.
 */
const CLASE_TAMANO: Record<TamanoOrbe, string> = {
  chico: 'orbe-chico',
  medio: 'orbe-medio',
  grande: 'orbe-grande',
  marca: 'orbe-marca'
}

/**
 * Los cuatro destellos, con la posicion, el color y el ritmo del orbe original.
 *
 * El tamaño no va en pixeles fijos: `--orbe-u` es un pixel del orbe a tamaño de referencia (245px de
 * ancho), asi que un destello de 6 unidades mide 6px en el orbe de marca y 0.8px en el de un boton.
 * Sin eso, los destellos de un orbe de 28px serian mas grandes que el orbe.
 */
const DESTELLOS = [
  { '--sx': '70%', '--sy': '18%', '--spark-size': 'calc(6 * var(--orbe-u))', '--spark-color': 'rgba(248, 250, 215, .92)', '--spark-speed': '5600ms', '--spark-delay': '-900ms' },
  { '--sx': '25%', '--sy': '72%', '--spark-size': 'calc(4 * var(--orbe-u))', '--spark-color': 'rgba(66, 66, 255, .92)', '--spark-speed': '6800ms', '--spark-delay': '-2400ms' },
  { '--sx': '79%', '--sy': '68%', '--spark-size': 'calc(8 * var(--orbe-u))', '--spark-color': 'rgba(59, 255, 0, .9)', '--spark-speed': '6200ms', '--spark-delay': '-1800ms' },
  { '--sx': '34%', '--sy': '24%', '--spark-size': 'calc(3 * var(--orbe-u))', '--spark-color': 'rgba(248, 250, 215, .72)', '--spark-speed': '7400ms', '--spark-delay': '-3100ms' }
] as const

interface PropsOrbe {
  /**
   * @see EstadoOrbe
   *
   * Sin estado el orbe queda **en reposo**: respira, pero solo en los tamaños que aparecen de a uno
   * en pantalla —`grande`, `marca` y la `medida` libre—. El chico y el mediano, que se repiten por
   * boton y por fila, quedan quietos: la regla de rendimiento del proyecto —la que colgaba el panel
   * viejo en pantallas Retina— prohibe animaciones infinitas en elementos siempre visibles. Ademas
   * comunica mejor: si se deformara siempre, deformarse dejaria de significar "esta pasando algo".
   * Con un `estado` activo animan todos, porque entonces el orbe vive lo que dura la operacion.
   */
  estado?: EstadoOrbe
  /** `chico` en un boton, `medio` en una fila, `grande` en una tarjeta, `marca` a pantalla completa. */
  tamano?: TamanoOrbe
  /**
   * Medida libre, para cuando ninguno de los tamaños discretos sirve. Fija el ANCHO y el alto sale de
   * la misma proporcion 245x205 del orbe original. Cuenta como tamaño grande para el reposo animado:
   * se usa cuando el orbe es el foco de la pantalla.
   * Ej: `clamp(14rem, 22vw, 21rem)` — la que usa el orbe de marca en el acceso.
   *
   * **Tiene que ser una longitud absoluta, nunca un porcentaje.** De la medida sale la unidad interna
   * del orbe (`--orbe-u`), y esa unidad se usa tanto en anchos como en altos: un `%` se resuelve
   * contra el ancho del contenedor en unos y contra el alto en otros, y el orbe sale aplastado.
   */
  medida?: string
  className?: string
}

/**
 * El Thinking Orb de Wiwo — la mascota, y el indicador de carga del producto.
 *
 * Es un campo de luz: capas de gradiente que se suman en `screen` sobre lo que haya detras. No trae
 * fondo propio ni recorte, asi que se ve igual sobre claro, sobre oscuro o sobre una imagen. El
 * aspecto vive en `src/estilos/thinking-orb.css`, portado de https://neo.wiwo.me.
 *
 * El estado viaja en `data-thinking-state` **sobre el contenedor**, no sobre el orbe: todo el CSS de
 * estado se escribe como `.orbe-wiwo[data-thinking-state="x"] .wiwo-thinking-orb`, y ademas las
 * particulas y los destellos son hermanas del orbe, no hijas —dentro del orbe se recortan—.
 *
 * Es `aria-hidden` a proposito. Lo que se anuncia a un lector de pantalla es el TEXTO que lo acompaña
 * —ver `SuperposicionOrbe` y `CargandoConOrbe`—, no el adorno.
 */
export function Orbe ({ estado, tamano = 'medio', medida, className }: PropsOrbe) {
  // El reposo quieto es solo de los tamaños que se repiten en pantalla; una medida libre siempre es
  // un orbe protagonista, aunque el valor sea chico.
  const quieto = estado === undefined && medida === undefined && (tamano === 'chico' || tamano === 'medio')

  return (
    <span
      aria-hidden="true"
      data-thinking-state={estado}
      style={medida === undefined ? undefined : ({ '--orbe-ancho': medida } as React.CSSProperties)}
      className={cn('orbe-wiwo', CLASE_TAMANO[tamano], quieto && 'orbe-quieto', className)}
    >
      <span className="orbe-escenario">
        <span className="orb-state-field">
          <span className="orb-state-ring" />
          <span className="orb-state-ring alt" />
          <span className="orb-scan-line" />
          <span className="orb-output-trail one" />
          <span className="orb-output-trail two" />
          <span className="orb-output-trail three" />
          <span className="orb-success-burst" />
          <span className="orb-retry-notch" />
        </span>

        <span className="wiwo-thinking-orb">
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
        </span>

        <span className="orb-particle orb-particle-uno" />
        <span className="orb-particle orb-particle-dos" />
        <span className="orb-particle orb-particle-tres" />
        {DESTELLOS.map((destello, indice) => (
          <span key={indice} className="orb-spark" style={destello as React.CSSProperties} />
        ))}
      </span>
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
  estado?: EstadoOrbe
}

/**
 * Superposicion con el orbe, para una operacion que bloquea.
 *
 * Son dos capas con trabajos distintos: el velo atenua lo que hay debajo para decir "esto no se toca
 * ahora", y adentro va la **ventana** del orbe —la misma que usa `Cargando`—, que lo recorta y le da
 * un lugar propio. Sin la ventana el halo se derrama sobre el contenido que esta tapando y la
 * superposicion se lee como una mancha, no como un aviso.
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
        'bg-superficie/80 grid place-items-center overflow-hidden p-4',
        acotada ? 'absolute inset-0 z-10' : 'fixed inset-0 z-50'
      )}
    >
      <div className={cn(
        'border-linea bg-superficie-hundida rounded-tarjeta shadow-1 grid max-w-full place-items-center gap-3',
        'overflow-hidden border p-5 text-center'
      )}
      >
        {/* La misma medida que la ventana de `Cargando`: cargar se ve igual en todo el producto, y una
            superposicion acotada tiene que entrar en el panel que tapa, que puede ser bajo. */}
        <Orbe medida="4.5rem" estado={estado} />
        <div className="grid gap-1">
          <p className="text-texto text-sm font-medium">{mensaje}</p>
          {submensaje !== undefined && <p className="text-texto-tenue text-xs">{submensaje}</p>}
        </div>
      </div>
    </div>
  )
}

/**
 * Chip de carga en linea, para una operacion que corre SOBRE contenido ya pintado.
 *
 * Es la tercera forma del mismo lenguaje. `Cargando` es la ventana que ocupa el lugar del contenido
 * que todavia no llego; esto es lo contrario: los datos ya estan en pantalla y se los esta
 * refrescando, asi que taparlos con una ventana seria esconder lo unico util que hay. El chip se
 * pone al lado —o encima de una esquina— y dice que hay algo en curso sin quitar nada.
 *
 * Es un chip y no un orbe suelto por la misma razon que la ventana es una ventana: el orbe desborda
 * su caja, y suelto sobre una tabla se fusiona con las filas. El chip lo recorta.
 *
 * El retardo evita el parpadeo: una operacion que tarda 80 ms no debe mostrar un indicador que
 * aparece y desaparece: eso se percibe como un defecto, no como progreso.
 *
 * @param mensaje texto que acompaña al orbe
 * @param retardoMs cuanto esperar antes de mostrarse
 * @param className clases extra del chip. Sirve para posicionarlo (`absolute right-2 top-2`)
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
    <span
      role="status"
      aria-live="polite"
      className={cn(
        'border-linea bg-superficie-flotante rounded-control shadow-1 inline-flex items-center gap-2',
        'overflow-hidden border py-1 pl-1.5 pr-3',
        className
      )}
    >
      <Orbe medida="1.5rem" estado={estado} />
      <span className="text-texto-tenue text-sm">{mensaje}</span>
    </span>
  )
}
