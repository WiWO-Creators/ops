'use client'

import { useEffect, useEffectEvent, useId, useLayoutEffect, useMemo, useRef } from 'react'
import { createPortal } from 'react-dom'
import { animate, createTimeline, onScroll, stagger } from 'animejs'
import { ChevronDown, X } from 'lucide-react'
import { Boton } from '@/componentes/formularios/Boton'
import { Insignia } from '@/componentes/presentadores/Insignia'
import { TONO_NOVEDAD } from '@/componentes/presentadores/tono-novedad'
import { ROTULO_TIPO, type Novedad } from '@/dominio/novedades'
import { cn } from '@/lib/clases'
import { cumpleConsulta, MENOS_MOVIMIENTO } from '@/lib/useConsultaDeMedios'
import {
  ENCUADRE_RECORRIDO, PIEZAS_RECORRIDO, formacion, formacionesDelRecorrido, transformDe, type Pose
} from './formaciones'
import { sinHuecos } from './useSecuenciaDeObra'

/** Duracion de cada tramo del timeline. Solo importa la proporcion: el scroll decide el avance. */
const TRAMO = 1000
/** Retraso entre piezas dentro de un tramo. Con 48 piezas deja la cascada dentro del tramo. */
const RETRASO_POR_PIEZA = 6
/** Suavizado del avance respecto del scroll: sin el, cada rueda del mouse se ve como un salto. */
const SUAVIZADO = 0.2
/** El color de cada pieza, en rotacion. Una de cada tres es de marca. */
const COLORES = ['fill-acento', 'fill-texto-tenue', 'fill-linea-fuerte'] as const
/** Pose neutra de respaldo, por si una formacion devolviera menos poses que piezas. */
const REPOSO: Pose = { x: 0, y: 0, rotacion: 0, escala: 1 }

interface PropsRecorrido {
  /** Las novedades a contar, una por pantalla. Vacio deja solo la portada y el cierre. */
  novedades: readonly Novedad[]
  /** Se llama al cerrar: boton, Escape o el boton del final. */
  onCerrar: () => void
}

/**
 * Lo que cambio en Ops, contado como un recorrido que se maneja con el scroll.
 *
 * Es la idea de la portada de anime.js: un escenario fijo de piezas y un timeline atado a la
 * posicion del scroll. Cada seccion —la portada, una por novedad y el cierre— tiene su formacion
 * (`formaciones.ts`), y bajar interpola las piezas de una a la otra; subir las devuelve. Como el
 * avance lo pone quien scrollea, no hay nada que esperar ni nada que se pierda si se va rapido.
 *
 * Con `prefers-reduced-motion` no hay timeline: el escenario queda quieto en la grilla y las
 * tarjetas se ven desde el principio. El contenido es el mismo.
 *
 * @param novedades lo que se cuenta
 * @param onCerrar al salir del recorrido
 */
export function RecorridoDeNovedades ({ novedades, onCerrar }: PropsRecorrido) {
  const idTitulo = useId()
  const contenedorRef = useRef<HTMLDivElement | null>(null)
  const contenidoRef = useRef<HTMLDivElement | null>(null)
  const piezaRefs = useRef<Array<SVGRectElement | null>>([])
  const tarjetaRefs = useRef<Array<HTMLElement | null>>([])
  const poses = useMemo(
    () => formacionesDelRecorrido(novedades.length).map((nombre) => formacion(nombre)),
    [novedades.length]
  )
  const alCerrar = useEffectEvent(onCerrar)

  useEffect(() => {
    function alTeclear (evento: KeyboardEvent): void {
      if (evento.key === 'Escape') alCerrar()
    }

    document.addEventListener('keydown', alTeclear)

    return () => { document.removeEventListener('keydown', alTeclear) }
  }, [])

  // En `useLayoutEffect` por lo mismo que las escenas: las tarjetas se ocultan antes del primer
  // pintado, o se alcanzan a ver un fotograma antes de que la entrada las esconda para empezar.
  useLayoutEffect(() => {
    const piezas = sinHuecos(piezaRefs.current)

    if (cumpleConsulta(MENOS_MOVIMIENTO)) {
      acomodarQuietas(piezas)
      return
    }

    const contenedor = contenedorRef.current
    const contenido = contenidoRef.current

    if (contenedor === null || contenido === null) return

    const linea = armarLineaDelEscenario(contenedor, contenido, piezas, poses)
    const entradas = sinHuecos(tarjetaRefs.current).map((tarjeta) => animate(tarjeta, {
      opacity: [0, 1],
      translateY: [56, 0],
      duration: 700,
      ease: 'outExpo',
      autoplay: onScroll({ container: contenedor })
    }))

    return () => {
      linea.revert()
      for (const entrada of entradas) entrada.revert()
    }
  }, [poses])

  const inicial = poses[0] ?? formacion('grilla')

  // En un portal por lo mismo que la capa de bienvenida: dentro de una pagina heredaria la opacidad
  // de la entrada escalonada pausada.
  return createPortal(
    <div
      ref={contenedorRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby={idTitulo}
      className="bienvenida-capa bg-superficie fixed inset-0 z-bienvenida overflow-y-auto overscroll-contain"
    >
      <div ref={contenidoRef} className="relative">
        <div aria-hidden="true" className="pointer-events-none sticky top-0 grid h-dvh place-items-center overflow-hidden">
          <svg viewBox={ENCUADRE_RECORRIDO} className="h-auto w-[min(60rem,110vw)] max-w-none">
            {Array.from({ length: PIEZAS_RECORRIDO }, (_, i) => (
              <rect
                key={i}
                ref={(el) => { piezaRefs.current[i] = el }}
                className={COLORES[i % COLORES.length]}
                x="-5"
                y="-5"
                width="10"
                height="10"
                rx="2.5"
                style={{ transformBox: 'fill-box', transformOrigin: 'center', transform: transformDe(inicial[i] ?? REPOSO) }}
              />
            ))}
          </svg>
        </div>

        <div className="relative -mt-[100dvh]">
          <section className="flex h-dvh flex-col items-center justify-center gap-3 px-6 text-center">
            <p className="text-acento text-xs antetitulo">Ops se actualizó</p>
            <h2 id={idTitulo} className="text-texto max-w-xl text-3xl font-semibold text-balance sm:text-5xl">
              Esto es lo que cambió
            </h2>
            <p className="text-texto-tenue text-sm">Baja para recorrerlo.</p>
            <ChevronDown className="text-texto-sutil mt-4 size-5" aria-hidden="true" />
          </section>

          {novedades.map((novedad, i) => (
            <section
              key={`${novedad.fecha}-${novedad.titulo}`}
              className={cn(
                'flex min-h-dvh items-end px-4 pb-10 sm:items-center sm:px-12 sm:pb-0',
                i % 2 === 1 && 'sm:justify-end'
              )}
            >
              <article
                ref={(el) => { tarjetaRefs.current[i] = el }}
                className="border-linea bg-superficie-flotante shadow-flotante rounded-tarjeta w-full max-w-md border p-5 sm:p-6"
              >
                <div className="flex items-center justify-between gap-3">
                  <Insignia tono={TONO_NOVEDAD[novedad.tipo]} tamano="chico">{ROTULO_TIPO[novedad.tipo]}</Insignia>
                  <span className="text-texto-sutil text-xs tabular-nums">{i + 1} de {novedades.length}</span>
                </div>
                <h3 className="text-texto mt-3 text-xl font-semibold text-balance">{novedad.titulo}</h3>
                {novedad.detalle !== undefined && (
                  <p className="text-texto-tenue mt-2 text-sm leading-relaxed text-pretty">{novedad.detalle}</p>
                )}
              </article>
            </section>
          ))}

          <section className="flex h-dvh flex-col items-center justify-end gap-4 px-6 pb-[12dvh] text-center">
            <p className="text-texto text-2xl font-semibold text-balance">Listo, ya estás al día</p>
            <Boton variante="primario" onClick={onCerrar}>Volver a Ops</Boton>
          </section>
        </div>
      </div>

      <Boton
        variante="sutil"
        soloIcono
        autoFocus
        className="bg-superficie-flotante pointer-coarse:min-h-11 pointer-coarse:min-w-11 fixed top-4 right-4 z-10"
        aria-label="Cerrar el recorrido"
        onClick={onCerrar}
      >
        <X className="size-4" aria-hidden="true" />
      </Boton>
    </div>,
    document.body
  )
}

/**
 * Arma el timeline del escenario, atado al scroll del recorrido.
 *
 * Un tramo por paso entre secciones: con la seccion `j` quieta en pantalla el avance es
 * `j / (secciones - 1)`, que es justo donde termina el tramo `j`. El progreso va de 0 cuando el
 * contenido empieza donde empieza el contenedor, a 1 cuando termina donde termina.
 *
 * @param contenedor el elemento que scrollea
 * @param contenido lo que se scrollea dentro de el
 * @param piezas las piezas del escenario, en el orden de las poses
 * @param poses una formacion por seccion
 * @returns el timeline, para revertirlo al desmontar
 */
function armarLineaDelEscenario (
  contenedor: HTMLElement,
  contenido: HTMLElement,
  piezas: SVGRectElement[],
  poses: readonly Pose[][]
) {
  const linea = createTimeline({
    autoplay: onScroll({ container: contenedor, target: contenido, enter: 'start start', leave: 'end end', sync: SUAVIZADO }),
    defaults: { duration: TRAMO - RETRASO_POR_PIEZA * PIEZAS_RECORRIDO, ease: 'inOutQuad' }
  })

  for (const [paso, destino] of poses.slice(1).entries()) {
    linea.add(piezas, {
      translateX: (_: unknown, i = 0) => destino[i]?.x ?? 0,
      translateY: (_: unknown, i = 0) => destino[i]?.y ?? 0,
      rotate: (_: unknown, i = 0) => destino[i]?.rotacion ?? 0,
      scale: (_: unknown, i = 0) => destino[i]?.escala ?? 1,
      // Alternar desde donde arranca la cascada es lo que hace que cada cambio se vea distinto.
      delay: stagger(RETRASO_POR_PIEZA, { from: paso % 2 === 0 ? 'center' : 'first' })
    }, paso * TRAMO)
  }

  return linea
}

/**
 * Deja las piezas quietas en la grilla, para `prefers-reduced-motion`.
 *
 * Una grilla ordenada y no la formacion dispersa de la portada: sin movimiento que la resuelva, la
 * dispersion queda como un fondo desordenado detras de todo el recorrido.
 *
 * @param piezas las piezas del escenario
 */
function acomodarQuietas (piezas: SVGRectElement[]): void {
  const quieta = formacion('grilla', piezas.length || PIEZAS_RECORRIDO)

  for (const [i, pieza] of piezas.entries()) pieza.style.transform = transformDe(quieta[i] ?? REPOSO)
}
