'use client'

import { useLayoutEffect, useRef, type ReactNode } from 'react'
import { animate } from 'animejs'
import { cumpleConsulta, MENOS_MOVIMIENTO } from '@/lib/useConsultaDeMedios'

interface PropsEntradaEscalonada {
  /**
   * El contenido a envolver, ya armado por quien llama (tipicamente un Server Component). Se marca
   * con `data-entrada="cabecera"` en el elemento que entra primero y `data-entrada="item"` en cada
   * fila que entra despues, de a una.
   */
  children: ReactNode
  /**
   * La cabecera la anima `entrada-pagina.css` (titulo y firma de `TituloModulo`) y no este
   * componente: los items esperan a que arranque el ultimo grupo de esa entrada en vez de salir ya.
   */
  trasEntradaDePagina?: boolean
  /**
   * Repite la entrada cada vez que cambia: la pagina, el filtro o el orden de una lista que no se
   * remonta al cambiarlos. Tiene que describir lo que se ve y no lo que se pidio —una tabla que pide
   * por la red la cambia cuando llegan las filas nuevas, no cuando cambia la URL—, y no cambiar con
   * un refresco de los mismos datos, que no es una entrada.
   */
  clave?: string | number
  /** Paso corto, para filas de tabla y grillas de tarjetas, que se recorren muchas veces al dia. */
  densa?: boolean
  /** Clases del envoltorio. */
  className?: string
}

/** Cuando arranca el ultimo grupo de `entrada-pagina.css`. */
const INICIO_TRAS_ENTRADA_DE_PAGINA = 180

/** Cuando arrancan los items si hay cabecera: poco despues que ella, no al terminar. */
const INICIO_TRAS_CABECERA = 160

/** Distancia entre la entrada de un item y la del siguiente, en milisegundos. */
const PASO_MS = 45

/** El paso de `densa`. */
const PASO_DENSO_MS = 20

/**
 * Cuantos items escalonan antes de que el retraso deje de crecer. Sin tope, una pagina de cien filas
 * tardaria segundos en terminar de aparecer; pasado el tope entran juntos, y a esa altura no se nota.
 */
const TOPE_ESCALONADO = 12

/**
 * Los elementos marcados con `valor` que son de esta raiz y no de una `EntradaEscalonada` anidada,
 * que anima los suyos por su cuenta.
 *
 * @param raiz el envoltorio de esta instancia
 * @param valor el valor de `data-entrada` a buscar
 * @returns los elementos, en orden de documento
 */
function marcados (raiz: HTMLElement, valor: 'cabecera' | 'item'): HTMLElement[] {
  return Array.from(raiz.querySelectorAll<HTMLElement>(`[data-entrada="${valor}"]`))
    .filter((elemento) => elemento.closest('[data-entrada-raiz]') === raiz)
}

/**
 * Envoltorio cliente, minimo, para hacer entrar una lista en dos tiempos: la cabecera primero y
 * despues los items, escalonados. Es el unico mecanismo de entrada escalonada del panel.
 *
 * Busca los elementos por atributo dentro de su propio subarbol en vez de recibir un ref por fila:
 * asi la pagina que arma la lista —casi siempre un Server Component, como `novedades/page.tsx`— no
 * necesita volverse cliente entera para poder animar. Solo marca sus elementos y los envuelve aca.
 *
 * Anima al montar y cada vez que cambia `clave`; nunca por un render cualquiera. Un item que llega
 * despues —una fila nueva tras un refresco— aparece sin entrada.
 *
 * Con `prefers-reduced-motion` no hace nada: el contenido queda tal cual el marcado lo deja, que ya
 * es su estado final. Es tambien la garantia contra el destello sin animar: sin JavaScript, o antes
 * de que el efecto corra, se ve el contenido completo y no un hueco vacio.
 */
export function EntradaEscalonada ({
  children,
  trasEntradaDePagina = false,
  clave,
  densa = false,
  className
}: PropsEntradaEscalonada) {
  const raizRef = useRef<HTMLDivElement | null>(null)

  useLayoutEffect(() => {
    const raiz = raizRef.current

    if (raiz === null || cumpleConsulta(MENOS_MOVIMIENTO)) return

    const cabecera = marcados(raiz, 'cabecera')
    const items = marcados(raiz, 'item')

    if (cabecera.length > 0) {
      animate(cabecera, { opacity: [0, 1], translateY: [-8, 0], duration: 320, ease: 'outQuad' })
    }

    if (items.length > 0) {
      const inicio = cabecera.length > 0 ? INICIO_TRAS_CABECERA : (trasEntradaDePagina ? INICIO_TRAS_ENTRADA_DE_PAGINA : 0)
      const paso = densa ? PASO_DENSO_MS : PASO_MS

      animate(items, {
        opacity: [0, 1],
        translateY: [10, 0],
        duration: 360,
        ease: 'outQuad',
        delay: (_elemento?: unknown, indice = 0) => inicio + Math.min(indice, TOPE_ESCALONADO) * paso
      })
    }
  }, [trasEntradaDePagina, clave, densa])

  return <div ref={raizRef} data-entrada-raiz="" className={className}>{children}</div>
}
