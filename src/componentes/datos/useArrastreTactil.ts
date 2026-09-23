'use client'

import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'
import { curvaDeResorte } from '@/lib/resorte'
import { MENOS_MOVIMIENTO, cumpleConsulta } from '@/lib/useConsultaDeMedios'
import { destinoDelPuntero, esElMismoLugar, inclinacion, type DestinoTactil, type GeometriaColumna } from './arrastreTactil'
import { velocidadDeArrastre } from './desplazamientoTablero'

/** Cuánto hay que mantener el dedo quieto para levantar la tarjeta. Menos, y un scroll la levanta. */
const TOQUE_LARGO_MS = 380
/** Si el dedo se mueve más que esto antes del toque largo, era un scroll y no un arrastre. */
const TOLERANCIA_PX = 10
/** Cuánto crece la tarjeta al levantarse: lo justo para que se lea "en el aire". */
const ESCALA_EN_EL_AIRE = 1.04
/** El aterrizaje: resorte casi crítico, sin rebote que se note sobre una columna llena. */
const ATERRIZAJE = curvaDeResorte(0.9, 0.3)

/** Atributos con los que el hook encuentra columnas y tarjetas en el DOM del tablero. */
export const ATRIBUTO_COLUMNA = 'data-columna-tablero'
export const ATRIBUTO_TARJETA = 'data-tarjeta-tablero'
export const ATRIBUTO_RANURA = 'data-ranura-tablero'

interface OpcionesArrastreTactil {
  /** El contenedor con scroll horizontal que tiene las columnas. */
  contenedor: RefObject<HTMLDivElement | null>
  /** `false` con el tablero de solo lectura o mientras se guarda. */
  habilitado: boolean
  /** Se llama al soltar en un lugar distinto del de origen. */
  alSoltar: (idTarjeta: number, indiceColumna: number, posicion: number) => void
}

/** Todo lo que vive mientras dura UN arrastre. Fuera de React: cambia en cada cuadro. */
interface Arrastre {
  id: number
  tarjeta: HTMLElement
  fantasma: HTMLElement
  origen: DestinoTactil
  agarre: { x: number, y: number }
  dedo: { x: number, y: number }
  velocidadX: number
  ultimo: { x: number, t: number }
  escala: number
  giro: number
  cuadro: number
  anterior: number
  destino: DestinoTactil | null
  scrollVertical: HTMLElement | null
}

/**
 * Arrastre de tarjetas con el dedo, para el kanban en pantallas táctiles.
 *
 * El arrastre nativo de HTML (`draggable`) no funciona con el dedo en iOS y en Android pelea con el
 * scroll. Esto lo resuelve con Pointer Events y deja el nativo para el mouse, donde anda bien:
 *
 * - **Toque largo** para levantar. Un toque corto sigue siendo tocar y un deslizamiento sigue siendo
 *   scroll; solo mantener el dedo quieto levanta la tarjeta, con una vibración corta que lo confirma.
 * - **Fantasma**: una copia de la tarjeta que sigue al dedo desde donde se la agarró, crece un poco
 *   y se inclina hacia donde va. La original queda como hueco atenuado.
 * - **Desplazamiento automático** al acercarse a los bordes, horizontal en el tablero y vertical en
 *   el contenedor de la página, con la misma curva que el arrastre de escritorio.
 * - **Aterrizaje**: al soltar, el fantasma viaja con un resorte hasta la ranura y recién ahí se
 *   mueve la tarjeta. Si se suelta fuera de toda columna, vuelve a su lugar.
 *
 * Con menos movimiento pedido no hay viaje ni inclinación: el fantasma aparece y desaparece.
 *
 * @returns el manejador de `pointerdown` de cada tarjeta, la tarjeta levantada y el destino actual
 */
export function useArrastreTactil ({ contenedor, habilitado, alSoltar }: OpcionesArrastreTactil) {
  const [levantada, setLevantada] = useState<number | null>(null)
  const [destino, setDestino] = useState<DestinoTactil | null>(null)
  const arrastre = useRef<Arrastre | null>(null)
  const limpiezas = useRef<Array<() => void>>([])
  const alSoltarVigente = useRef(alSoltar)

  useEffect(() => { alSoltarVigente.current = alSoltar }, [alSoltar])

  /** Deshace todo lo que un arrastre dejó enganchado en el documento. */
  const desenganchar = useCallback(() => {
    for (const limpiar of limpiezas.current) limpiar()
    limpiezas.current = []
  }, [])

  useEffect(() => () => {
    desenganchar()
    const actual = arrastre.current
    if (actual !== null) {
      cancelAnimationFrame(actual.cuadro)
      actual.fantasma.remove()
    }
  }, [desenganchar])

  /** Termina el arrastre: anima el aterrizaje y, si corresponde, avisa el movimiento. */
  const terminar = useCallback((soltado: boolean) => {
    const actual = arrastre.current
    if (actual === null) return
    arrastre.current = null
    cancelAnimationFrame(actual.cuadro)
    desenganchar()
    // El clic que sigue a levantar el dedo no tiene que abrir la tarjeta que se acaba de soltar.
    tragarClicSiguiente()

    const final = soltado ? actual.destino : null
    const valido = final !== null && !esElMismoLugar(actual.origen, final)
    const ranura = document.querySelector(`[${ATRIBUTO_RANURA}]`)
    const hacia = valido && ranura !== null ? ranura.getBoundingClientRect() : actual.tarjeta.getBoundingClientRect()

    aterrizar(actual, hacia, () => {
      actual.fantasma.remove()
      setLevantada(null)
      setDestino(null)
      if (valido) alSoltarVigente.current(actual.id, final.columna, final.posicion)
    })
  }, [desenganchar])

  /** Levanta la tarjeta: crea el fantasma y engancha el seguimiento del dedo. */
  const levantar = useCallback((tarjeta: HTMLElement, id: number, dedo: { x: number, y: number }) => {
    const caja = contenedor.current
    if (caja === null) return
    const origen = ubicarTarjeta(caja, tarjeta)
    if (origen === null) return

    const rect = tarjeta.getBoundingClientRect()
    const fantasma = crearFantasma(tarjeta, rect)
    const actual: Arrastre = {
      id,
      tarjeta,
      fantasma,
      origen,
      agarre: { x: dedo.x - rect.left, y: dedo.y - rect.top },
      dedo,
      velocidadX: 0,
      ultimo: { x: dedo.x, t: performance.now() },
      escala: 1,
      giro: 0,
      cuadro: 0,
      anterior: 0,
      destino: origen,
      scrollVertical: scrollerVertical(caja)
    }
    arrastre.current = actual
    setLevantada(id)
    setDestino(origen)
    navigator.vibrate?.(8)

    const seguir = (evento: PointerEvent) => {
      const ahora = performance.now()
      const lapso = Math.max(ahora - actual.ultimo.t, 1)
      actual.velocidadX = (evento.clientX - actual.ultimo.x) / lapso
      actual.ultimo = { x: evento.clientX, t: ahora }
      actual.dedo = { x: evento.clientX, y: evento.clientY }
    }
    const soltar = () => { terminar(true) }
    const cancelar = () => { terminar(false) }
    // Con la tarjeta en el aire, el dedo es del arrastre: el navegador no puede tomarlo para hacer
    // scroll. Tiene que ser un `touchmove` no pasivo; `touch-action` ya no se puede cambiar a mitad
    // de un gesto.
    const sinScroll = (evento: TouchEvent) => { evento.preventDefault() }
    const conTeclado = (evento: KeyboardEvent) => { if (evento.key === 'Escape') cancelar() }

    window.addEventListener('pointermove', seguir)
    window.addEventListener('pointerup', soltar)
    window.addEventListener('pointercancel', cancelar)
    window.addEventListener('keydown', conTeclado)
    document.addEventListener('touchmove', sinScroll, { passive: false })
    limpiezas.current.push(() => {
      window.removeEventListener('pointermove', seguir)
      window.removeEventListener('pointerup', soltar)
      window.removeEventListener('pointercancel', cancelar)
      window.removeEventListener('keydown', conTeclado)
      document.removeEventListener('touchmove', sinScroll)
    })

    seguirCuadroACuadro(actual, caja, setDestino)
  }, [contenedor, terminar])

  /**
   * `pointerdown` de una tarjeta. Solo arma la espera del toque largo; el mouse queda para el
   * arrastre nativo y los controles de la tarjeta (enlaces, "Mover a…") siguen siendo controles.
   */
  const alPresionar = useCallback((evento: React.PointerEvent<HTMLElement>, id: number) => {
    if (!habilitado || evento.pointerType === 'mouse' || arrastre.current !== null) return
    const objetivo = evento.target
    if (objetivo instanceof Element && objetivo.closest('button, [role="menuitem"], input, textarea, select') !== null) return

    const tarjeta = evento.currentTarget
    const inicio = { x: evento.clientX, y: evento.clientY }
    let dedo = inicio

    const esperar = window.setTimeout(() => {
      desenganchar()
      levantar(tarjeta, id, dedo)
    }, TOQUE_LARGO_MS)

    const mover = (movimiento: PointerEvent) => {
      dedo = { x: movimiento.clientX, y: movimiento.clientY }
      if (Math.hypot(dedo.x - inicio.x, dedo.y - inicio.y) > TOLERANCIA_PX) abandonar()
    }
    const abandonar = () => {
      window.clearTimeout(esperar)
      desenganchar()
    }
    // El menú de "copiar / compartir" del toque largo taparía la tarjeta justo al levantarla.
    const sinMenu = (menu: Event) => { menu.preventDefault() }

    window.addEventListener('pointermove', mover)
    window.addEventListener('pointerup', abandonar)
    window.addEventListener('pointercancel', abandonar)
    tarjeta.addEventListener('contextmenu', sinMenu)
    limpiezas.current.push(() => {
      window.clearTimeout(esperar)
      window.removeEventListener('pointermove', mover)
      window.removeEventListener('pointerup', abandonar)
      window.removeEventListener('pointercancel', abandonar)
      tarjeta.removeEventListener('contextmenu', sinMenu)
    })
  }, [habilitado, desenganchar, levantar])

  return { alPresionar, levantada, destino }
}

/**
 * El bucle de cuadros de un arrastre: mueve el fantasma, desplaza los bordes y recalcula el destino.
 *
 * Vive fuera del hook a proposito: escribe el scroll del tablero y de la pagina en cada cuadro, y
 * eso es exactamente lo que un componente no deberia hacer durante el render. Aca es un efecto del
 * gesto, no del arbol. Se detiene solo cuando `terminar` cancela `actual.cuadro`.
 *
 * @param actual el arrastre en curso
 * @param caja el contenedor de columnas
 * @param avisar recibe el destino nuevo cuando cambia
 */
function seguirCuadroACuadro (actual: Arrastre, caja: HTMLElement, avisar: (destino: DestinoTactil | null) => void): void {
  const cuadro = (ahora: number) => {
    const paso = actual.anterior === 0 ? 16 : Math.min(ahora - actual.anterior, 32)
    actual.anterior = ahora
    const quieto = cumpleConsulta(MENOS_MOVIMIENTO)
    // Aproximacion exponencial al objetivo: suaviza sin atrasar al dedo mas de un par de cuadros.
    actual.escala += (ESCALA_EN_EL_AIRE - actual.escala) * 0.3
    actual.giro += ((quieto ? 0 : inclinacion(actual.velocidadX)) - actual.giro) * 0.2
    actual.velocidadX *= 0.9
    pintarFantasma(actual)

    const limites = caja.getBoundingClientRect()
    const horizontal = velocidadDeArrastre(actual.dedo.x, Math.max(0, limites.left), Math.min(window.innerWidth, limites.right))
    if (horizontal !== 0) caja.scrollLeft += horizontal * paso / 1000
    const pagina = actual.scrollVertical
    if (pagina !== null) {
      const borde = pagina.getBoundingClientRect()
      const vertical = velocidadDeArrastre(actual.dedo.y, Math.max(0, borde.top), Math.min(window.innerHeight, borde.bottom))
      if (vertical !== 0) pagina.scrollTop += vertical * paso / 1000
    }

    const nuevo = destinoDelPuntero(actual.dedo.x, actual.dedo.y, medirColumnas(caja), actual.id)
    if (!mismoDestino(nuevo, actual.destino)) {
      actual.destino = nuevo
      avisar(nuevo)
    }

    actual.cuadro = requestAnimationFrame(cuadro)
  }
  actual.cuadro = requestAnimationFrame(cuadro)
}

/** Copia visual de la tarjeta, fija en la ventana, en el lugar exacto de la original. */
function crearFantasma (tarjeta: HTMLElement, rect: DOMRect): HTMLElement {
  const fantasma = tarjeta.cloneNode(true) as HTMLElement
  fantasma.removeAttribute(ATRIBUTO_TARJETA)
  fantasma.removeAttribute('data-levantada')
  fantasma.removeAttribute('id')
  fantasma.setAttribute('aria-hidden', 'true')
  fantasma.inert = true
  fantasma.classList.add('tablero-fantasma')
  fantasma.style.width = `${rect.width}px`
  fantasma.style.transform = `translate3d(${rect.left}px, ${rect.top}px, 0)`
  document.body.append(fantasma)
  return fantasma
}

/** Pone el fantasma bajo el dedo, respetando desde dónde se agarró la tarjeta. */
function pintarFantasma (actual: Arrastre): void {
  const x = actual.dedo.x - actual.agarre.x
  const y = actual.dedo.y - actual.agarre.y
  actual.fantasma.style.transform = `translate3d(${x}px, ${y}px, 0) rotate(${actual.giro}deg) scale(${actual.escala})`
}

/**
 * El vuelo final del fantasma hasta `hacia`, con resorte. Sin animación posible, termina en seco.
 */
function aterrizar (actual: Arrastre, hacia: DOMRect, alTerminar: () => void): void {
  const destino = `translate3d(${hacia.left}px, ${hacia.top}px, 0) rotate(0deg) scale(1)`
  if (cumpleConsulta(MENOS_MOVIMIENTO) || typeof actual.fantasma.animate !== 'function') {
    alTerminar()
    return
  }
  const animacion = actual.fantasma.animate(
    [{ transform: actual.fantasma.style.transform }, { transform: destino }],
    { duration: ATERRIZAJE.duracionMs, easing: CSS.supports('animation-timing-function', 'linear(0, 1)') ? ATERRIZAJE.curva : 'cubic-bezier(.2, .8, .2, 1)', fill: 'forwards' }
  )
  animacion.onfinish = alTerminar
  animacion.oncancel = alTerminar
}

/** Mide columnas y tarjetas tal como están en pantalla ahora. */
function medirColumnas (caja: HTMLElement): GeometriaColumna[] {
  return [...caja.querySelectorAll<HTMLElement>(`[${ATRIBUTO_COLUMNA}]`)].map((columna) => {
    const rect = columna.getBoundingClientRect()
    return {
      izquierda: rect.left,
      derecha: rect.right,
      tarjetas: [...columna.querySelectorAll<HTMLElement>(`[${ATRIBUTO_TARJETA}]`)].map((tarjeta) => {
        const caja = tarjeta.getBoundingClientRect()
        return { id: Number(tarjeta.getAttribute(ATRIBUTO_TARJETA)), centro: caja.top + caja.height / 2 }
      })
    }
  })
}

/** Columna y posición de una tarjeta dentro del tablero. */
function ubicarTarjeta (caja: HTMLElement, tarjeta: HTMLElement): DestinoTactil | null {
  const columnas = [...caja.querySelectorAll<HTMLElement>(`[${ATRIBUTO_COLUMNA}]`)]
  const columna = columnas.findIndex((c) => c.contains(tarjeta))
  if (columna === -1) return null
  const posicion = [...(columnas[columna]?.querySelectorAll(`[${ATRIBUTO_TARJETA}]`) ?? [])].indexOf(tarjeta)
  return posicion === -1 ? null : { columna, posicion }
}

/** El primer ancestro que scrollea en vertical: en el panel es `ScrollSuave`, no el `body`. */
function scrollerVertical (desde: HTMLElement): HTMLElement | null {
  for (let nodo = desde.parentElement; nodo !== null; nodo = nodo.parentElement) {
    const { overflowY } = getComputedStyle(nodo)
    if ((overflowY === 'auto' || overflowY === 'scroll') && nodo.scrollHeight > nodo.clientHeight) return nodo
  }
  return null
}

function mismoDestino (a: DestinoTactil | null, b: DestinoTactil | null): boolean {
  if (a === null || b === null) return a === b
  return esElMismoLugar(a, b)
}

/** Descarta el próximo clic de la página, si llega en el medio segundo siguiente. */
function tragarClicSiguiente (): void {
  const tragar = (evento: MouseEvent) => {
    evento.preventDefault()
    evento.stopPropagation()
    quitar()
  }
  const quitar = () => {
    window.clearTimeout(plazo)
    window.removeEventListener('click', tragar, true)
  }
  const plazo = window.setTimeout(quitar, 500)
  window.addEventListener('click', tragar, true)
}
