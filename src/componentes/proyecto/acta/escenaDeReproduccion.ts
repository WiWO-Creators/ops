import { animate, createTimeline, stagger, type JSAnimation } from 'animejs'
import {
  TIEMPOS_REPRODUCCION,
  msDeEscritura,
  msDeSeleccion,
  palabrasDe,
  type EntradaDeGuion,
  type EtiquetaDeUnidad,
  type Guion,
  type PasoGuion,
  type SegmentoDePalabras,
  type UnidadActa
} from '@/dominio/diff-acta'
import { ASISTENTE } from '@/dominio/glosario'

/**
 * La reproducción de una edición del Orbe sobre el documento: un cursor con su etiqueta que va a
 * cada bloque que cambió, marca y borra lo viejo y escribe lo nuevo palabra a palabra.
 *
 * === POR QUE ESTO ARMA NODOS A MANO ===
 *
 * El visor del acta es un iframe sin scripts, y la animación no puede vivir adentro. Esta escena se
 * monta en un contenedor normal del panel, así que el texto que pinta pasa por el DOM del panel y
 * ahí **no se inyecta HTML**: cada bloque se crea con `createElement` de una lista cerrada de
 * etiquetas (`h1`–`h3`, `p`, `ul`, `ol`, `li`, `blockquote`) y el texto entra por `textContent`, sin
 * un solo atributo que venga del documento. Un enlace se ve como texto. Lo que no entra por ahí no
 * existe para esta capa.
 *
 * === QUE SE ANIMA ===
 *
 * Solo `transform` y `opacity`, y el texto de los tramos que se escriben o se marcan. El resto es
 * contenido que cambia de golpe en el momento justo: sin `blur`, sin `box-shadow`, sin tocar medidas.
 * Cuando algo desaparece o aparece, los bloques de abajo no saltan: se les devuelve la posición que
 * tenían con un desplazamiento corto (técnica FLIP, solo `transform`).
 *
 * La línea de tiempo la arma `createTimeline` con los tiempos de `dominio/diff-acta.ts` (las mismas
 * funciones que usó para prometer la duración). Lo que depende del diseño real del texto —a dónde
 * desplazar, dónde queda el cursor— se mide en el momento, dentro de `call`.
 */

/** La lista cerrada de etiquetas con que se construye el documento. */
const ETIQUETA_DE_UNIDAD: Readonly<Record<EtiquetaDeUnidad, 'h1' | 'h2' | 'h3' | 'p' | 'li' | 'blockquote' | 'hr'>> = {
  h1: 'h1', h2: 'h2', h3: 'h3', p: 'p', li: 'li', blockquote: 'blockquote', hr: 'hr'
}

/** Cuánto tarda en apagarse lo que se va con el fundido, antes de cambiar el diseño. */
const MS_DE_SALIDA_EN_FUNDIDO = 180

/** Cuánto tarda en encenderse lo que entra con el fundido. */
const MS_DE_ENTRADA_EN_FUNDIDO = 240

/** Cuánto dura el desplazamiento del reflujo cuando un bloque aparece o desaparece. */
const MS_DE_REFLUJO = 220

/** Cuánto tarda en desvanecerse un bloque eliminado antes de que se cierre su hueco. */
const MS_DE_DESVANECIDO = 120

/** Máximo de bloques a los que se les mide el reflujo: más allá de esto no se nota y cuesta. */
const MAX_BLOQUES_REFLUJO = 80

/** Fracción de la altura de la hoja a la que se deja el cursor al desplazar. */
const POSICION_DE_LLEGADA = 0.35

/** Margen de la hoja, en fracción de su altura, dentro del cual el cursor ya está a la vista. */
const BANDA_VISIBLE = { arriba: 0.12, abajo: 0.78 } as const

/** Una parte que cambia dentro de un bloque. */
interface Tramo {
  tipo: SegmentoDePalabras['tipo']
  palabras: string[]
  /** El tramo escrito o conservado: un solo nodo de texto. `null` en lo borrado. */
  nodo: HTMLElement | null
  /** Lo borrado: una palabra por nodo, para marcarlas de a una. */
  nodosDePalabra: HTMLElement[]
}

/**
 * Lo que le pasa, al final, a un cambio que no se animó con cursor: se quita, se escribe de nuevo
 * con el texto nuevo o aparece. Los tres con un fundido.
 */
type Fundido = { tipo: 'quitar' } | { tipo: 'cambiar', texto: string } | { tipo: 'mostrar' }

/** Un bloque del documento de trabajo con lo que hace falta para animarlo. */
interface BloqueDeEscena {
  entrada: EntradaDeGuion
  /** `null` solo si la entrada no tiene unidad que dibujar. */
  elemento: HTMLElement | null
  tramos: Tramo[]
  /** Qué le pasa en el fundido final; `null` si se anima con cursor o no cambia. */
  fundido: Fundido | null
}

/** Un bloque recién armado, con la unidad de la que sale (para agrupar los puntos de lista). */
type BloqueArmado = Omit<BloqueDeEscena, 'entrada'> & { unidad: UnidadActa | null }

/** Lo que se necesita para montar la escena. */
export interface OpcionesDeEscena {
  /** El contenedor con desplazamiento. */
  hoja: HTMLElement
  /** Donde se dibujan los bloques. Se vacía al montar. */
  documento: HTMLElement
  /** La capa entera: se apaga con un fundido al terminar. */
  capa: HTMLElement
  guion: Guion
  /** Se llama una vez cuando la reproducción termina sola. No se llama al cancelar. */
  alTerminar: () => void
}

/**
 * Crea un elemento de la lista cerrada y le pone texto.
 *
 * @param etiqueta etiqueta de la unidad
 * @param texto texto plano; entra por `textContent`
 * @returns el elemento, sin atributos
 */
function crearBloque (etiqueta: EtiquetaDeUnidad, texto = ''): HTMLElement {
  const elemento = document.createElement(ETIQUETA_DE_UNIDAD[etiqueta])

  if (texto !== '') elemento.textContent = texto

  return elemento
}

/**
 * Crea un nodo de texto en línea con las palabras dadas.
 *
 * @param palabras las palabras del tramo
 * @returns un `span` con las palabras separadas y un espacio al final
 */
function crearTexto (palabras: readonly string[]): HTMLElement {
  const nodo = document.createElement('span')

  nodo.textContent = textoDe(palabras)

  return nodo
}

/** Las palabras como texto, con un espacio detrás: los tramos se pegan sin juntar palabras. */
function textoDe (palabras: readonly string[]): string {
  return palabras.length === 0 ? '' : `${palabras.join(' ')} `
}

/**
 * Arma los tramos de un bloque que se corrige.
 *
 * @param bloque el elemento del bloque
 * @param segmentos el diff por palabras
 * @returns los tramos, con lo escrito vacío al principio
 */
function armarTramos (bloque: HTMLElement, segmentos: readonly SegmentoDePalabras[]): Tramo[] {
  return segmentos.map((segmento) => {
    if (segmento.tipo === 'borrado') {
      const nodosDePalabra = segmento.palabras.map((palabra) => crearTexto([palabra]))

      bloque.append(...nodosDePalabra)

      return { tipo: 'borrado', palabras: segmento.palabras, nodo: null, nodosDePalabra }
    }

    const nodo = crearTexto(segmento.tipo === 'igual' ? segmento.palabras : [])

    bloque.append(nodo)

    return { tipo: segmento.tipo, palabras: segmento.palabras, nodo, nodosDePalabra: [] }
  })
}

/**
 * Arma el bloque de una entrada con el aspecto que tiene al empezar la reproducción.
 *
 * @param entrada la entrada del guion
 * @returns el bloque y sus tramos, o sin elemento si no se dibuja
 */
function armarBloque (entrada: EntradaDeGuion): BloqueArmado {
  const { cambio, animada } = entrada
  const unidad = cambio.nuevo ?? cambio.anterior

  if (unidad === null) return { unidad: null, elemento: null, tramos: [], fundido: null }

  if (cambio.tipo === 'igual') {
    return { unidad, elemento: crearBloque(unidad.etiqueta, unidad.texto), tramos: [], fundido: null }
  }

  if (cambio.tipo === 'eliminado') {
    // Se dibuja siempre: la capa tiene que empezar idéntica al visor, también con lo que se va.
    const anterior = cambio.anterior ?? unidad

    if (!animada) return { unidad: anterior, elemento: crearBloque(anterior.etiqueta, anterior.texto), tramos: [], fundido: { tipo: 'quitar' } }

    const elemento = crearBloque(anterior.etiqueta)

    return { unidad: anterior, elemento, tramos: armarTramos(elemento, [{ tipo: 'borrado', palabras: palabrasDe(anterior.texto) }]), fundido: null }
  }

  if (cambio.tipo === 'modificado') {
    if (!animada) {
      const texto = cambio.anterior?.texto ?? ''

      return { unidad, elemento: crearBloque(unidad.etiqueta, texto), tramos: [], fundido: { tipo: 'cambiar', texto: unidad.texto } }
    }

    const elemento = crearBloque(unidad.etiqueta)

    return { unidad, elemento, tramos: armarTramos(elemento, cambio.segmentos ?? []), fundido: null }
  }

  // Insertado: escondido hasta que le toca, con cursor o con fundido.
  const elemento = crearBloque(unidad.etiqueta, animada ? '' : unidad.texto)

  elemento.hidden = true
  if (!animada) {
    elemento.style.opacity = '0'

    return { unidad, elemento, tramos: [], fundido: { tipo: 'mostrar' } }
  }

  return { unidad, elemento, tramos: armarTramos(elemento, [{ tipo: 'insertado', palabras: palabrasDe(unidad.texto) }]), fundido: null }
}

/**
 * Dibuja el documento de trabajo: la versión vieja completa, con lo que se va todavía en su lugar, y
 * lo que va a aparecer ya en el suyo pero escondido. El primer fotograma es igual al del visor.
 *
 * Los puntos de lista consecutivos del mismo tipo comparten su `ul` u `ol`.
 *
 * @param documento el contenedor, que se vacía
 * @param entradas las entradas del guion
 * @returns los bloques de la escena, uno por entrada
 */
function construirDocumento (documento: HTMLElement, entradas: readonly EntradaDeGuion[]): BloqueDeEscena[] {
  documento.replaceChildren()

  let envoltura: { lista: 'ul' | 'ol', elemento: HTMLElement } | null = null

  return entradas.map((entrada) => {
    const { unidad, ...bloque } = armarBloque(entrada)

    if (unidad === null || bloque.elemento === null) return { entrada, ...bloque }

    if (unidad.etiqueta !== 'li' || unidad.lista === null) {
      envoltura = null
      documento.append(bloque.elemento)

      return { entrada, ...bloque }
    }

    if (envoltura?.lista !== unidad.lista) {
      envoltura = { lista: unidad.lista, elemento: document.createElement(unidad.lista) }
      documento.append(envoltura.elemento)
    }
    envoltura.elemento.append(bloque.elemento)

    return { entrada, ...bloque }
  })
}

/**
 * El cursor de la colaboración: una barra y la etiqueta con el nombre del asistente.
 *
 * Es un nodo en línea de ancho cero que vive dentro del texto, así que acompaña a lo que se escribe
 * sin medir nada; para cambiar de lugar se mueve el nodo y se le devuelve la posición vieja con un
 * `transform`.
 *
 * @returns el cursor y su etiqueta
 */
function crearCursor (): { cursor: HTMLElement, etiqueta: HTMLElement } {
  const cursor = document.createElement('span')
  const barra = document.createElement('span')
  const etiqueta = document.createElement('span')

  cursor.className = 'acta-cursor'
  barra.className = 'acta-cursor__barra'
  etiqueta.className = 'acta-cursor__etiqueta'
  etiqueta.textContent = ASISTENTE
  cursor.append(barra, etiqueta)

  return { cursor, etiqueta }
}

/**
 * Monta la reproducción y la pone en marcha.
 *
 * Devuelve la función que la detiene: cancela la línea de tiempo y todo lo que se animó por fuera de
 * ella, y apaga cualquier llamada que quedara pendiente. Sirve para saltarla, para cuando el acta
 * vuelve a cambiar y para el desmontaje; no llama a `alTerminar`.
 *
 * @param opciones el contenedor, el guion y qué hacer al terminar
 * @returns la función que cancela
 */
export function montarEscena ({ hoja, documento, capa, guion, alTerminar }: OpcionesDeEscena): () => void {
  const bloques = construirDocumento(documento, guion.entradas)
  const { cursor, etiqueta } = crearCursor()
  const libres = new Set<JSAnimation>()
  const { ritmo } = guion
  let activa = true

  /** Registra una animación suelta para poder cancelarla. */
  const seguir = (animacion: JSAnimation): JSAnimation => {
    libres.add(animacion)

    return animacion
  }

  /** Los bloques dibujados y a la vista que vienen después de `ancla`: los que se mueven si ella cambia. */
  const siguientesA = (ancla: HTMLElement): HTMLElement[] => bloques
    .flatMap((bloque) => {
      const elemento = bloque.elemento

      return elemento !== null && elemento.isConnected && !elemento.hidden && elemento !== ancla
        && (ancla.compareDocumentPosition(elemento) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0
        ? [elemento]
        : []
    })
    .slice(0, MAX_BLOQUES_REFLUJO)

  /**
   * Hace un cambio de diseño sin que los bloques de abajo salten: mide, cambia y devuelve a cada uno
   * la posición que tenía con un desplazamiento corto.
   *
   * @param ancla el bloque que aparece o desaparece
   * @param mutar el cambio (mostrar o quitar el bloque)
   */
  const conReflujoSuave = (ancla: HTMLElement, mutar: () => void): void => {
    const antes = siguientesA(ancla).map((elemento) => [elemento, elemento.getBoundingClientRect().top] as const)

    mutar()

    for (const [elemento, arriba] of antes) {
      if (!elemento.isConnected) continue

      const desplazamiento = arriba - elemento.getBoundingClientRect().top

      if (Math.abs(desplazamiento) < 1) continue
      seguir(animate(elemento, {
        translateY: [desplazamiento, 0],
        duration: MS_DE_REFLUJO,
        ease: 'outQuart',
        onComplete: () => { elemento.style.removeProperty('transform') }
      }))
    }
  }

  /** Si la etiqueta se saldría por la derecha de la hoja, se pone hacia la izquierda del cursor. */
  const acomodarEtiqueta = (): void => {
    const posicion = cursor.getBoundingClientRect()
    const limite = hoja.getBoundingClientRect()

    cursor.classList.toggle('acta-cursor--izquierda', posicion.left + etiqueta.offsetWidth > limite.right - 16)
  }

  /** Desplaza la hoja hasta que `y` (en coordenadas del contenido) quede a la vista, con suavidad. */
  const desplazarA = (y: number, duracion: number): void => {
    const alto = hoja.clientHeight
    const arriba = hoja.scrollTop
    const aLaVista = y >= arriba + alto * BANDA_VISIBLE.arriba && y <= arriba + alto * BANDA_VISIBLE.abajo

    if (aLaVista) return

    const destino = Math.max(0, Math.min(hoja.scrollHeight - alto, y - alto * POSICION_DE_LLEGADA))
    const progreso = { posicion: arriba }

    seguir(animate(progreso, {
      posicion: destino,
      duration: duracion,
      ease: 'inOutQuad',
      onUpdate: () => { hoja.scrollTop = progreso.posicion }
    }))
  }

  /**
   * Mueve el cursor a un lugar nuevo del texto: cambia el nodo de sitio, le devuelve con un
   * `transform` la posición que tenía y desplaza la hoja hasta él.
   *
   * @param colocar pone el cursor en su nuevo lugar del DOM
   * @param duracion lo que dura el viaje
   */
  const llevarCursor = (colocar: () => void, duracion: number): void => {
    const antes = cursor.isConnected ? cursor.getBoundingClientRect() : null

    cursor.style.removeProperty('transform')
    colocar()

    const despues = cursor.getBoundingClientRect()

    if (antes !== null && duracion > 0) {
      seguir(animate(cursor, {
        translateX: [antes.left - despues.left, 0],
        translateY: [antes.top - despues.top, 0],
        duration: duracion,
        ease: 'outQuart'
      }))
    }

    desplazarA(despues.top - hoja.getBoundingClientRect().top + hoja.scrollTop, duracion)
    acomodarEtiqueta()
  }

  /** Mientras se escribe, mantiene el cursor a la vista sin esperar al próximo viaje. */
  const mantenerALaVista = (): void => {
    const posicion = cursor.getBoundingClientRect()
    const limite = hoja.getBoundingClientRect()
    const margen = limite.height * (1 - BANDA_VISIBLE.abajo)

    if (posicion.bottom > limite.bottom - margen) hoja.scrollTop += posicion.bottom - (limite.bottom - margen * 2)
    acomodarEtiqueta()
  }

  /** El primer nodo de un tramo, que es donde el cursor se para para trabajarlo. */
  const inicioDe = (tramo: Tramo): HTMLElement | null => tramo.nodo ?? tramo.nodosDePalabra[0] ?? null

  /** Pone el cursor delante de un tramo. */
  const antesDe = (tramo: Tramo): void => {
    inicioDe(tramo)?.before(cursor)
  }

  /** Marca las primeras `cuantas` palabras de un tramo borrado y deja el cursor tras la última. */
  const marcar = (tramo: Tramo, cuantas: number): void => {
    const marcadas = Math.max(1, cuantas)

    tramo.nodosDePalabra.forEach((nodo, posicion) => { nodo.classList.toggle('acta-palabra--marcada', posicion < marcadas) })
    tramo.nodosDePalabra[marcadas - 1]?.after(cursor)
    mantenerALaVista()
  }

  /** Muestra las primeras `cuantas` palabras de un tramo escrito. */
  const escribir = (tramo: Tramo, cuantas: number): void => {
    if (tramo.nodo === null) return
    tramo.nodo.textContent = textoDe(tramo.palabras.slice(0, cuantas))
    tramo.nodo.after(cursor)
    mantenerALaVista()
  }

  /** Quita lo marcado de un tramo borrado; el cursor queda donde estaba el tramo. */
  const borrar = (tramo: Tramo): void => {
    tramo.nodosDePalabra.forEach((nodo) => { nodo.remove() })
  }

  /** El bloque dibujado más cercano a otro, para que el cursor no se quede dentro de lo que se va. */
  const vecinoDe = (bloque: BloqueDeEscena): HTMLElement | null => {
    const posicion = bloques.indexOf(bloque)
    const sirve = (candidato: BloqueDeEscena | undefined): HTMLElement | null =>
      candidato?.elemento != null && candidato.elemento.isConnected && !candidato.elemento.hidden ? candidato.elemento : null
    let siguiente: HTMLElement | null = null
    let anterior: HTMLElement | null = null

    for (let i = posicion + 1; i < bloques.length && siguiente === null; i++) siguiente = sirve(bloques[i])
    for (let i = posicion - 1; i >= 0 && anterior === null; i--) anterior = sirve(bloques[i])

    return siguiente ?? anterior
  }

  /**
   * Cierra el hueco de un bloque eliminado: el cursor pasa al bloque vecino, el eliminado se
   * desvanece y los de abajo suben.
   */
  const colapsar = (bloque: BloqueDeEscena): void => {
    const elemento = bloque.elemento

    if (elemento === null) return

    const vecino = vecinoDe(bloque)

    if (vecino !== null) llevarCursor(() => { vecino.prepend(cursor) }, MS_DE_DESVANECIDO + 60)

    seguir(animate(elemento, {
      opacity: [1, 0],
      duration: MS_DE_DESVANECIDO,
      ease: 'outQuad',
      onComplete: () => {
        if (activa) conReflujoSuave(elemento, () => { elemento.remove() })
      }
    }))
  }

  /** Muestra un bloque nuevo, vacío, y empuja con suavidad lo de abajo. */
  const abrirBloque = (bloque: BloqueDeEscena): void => {
    const elemento = bloque.elemento

    if (elemento === null) return
    conReflujoSuave(elemento, () => { elemento.hidden = false })
  }

  /**
   * Aplica de una vez los cambios que entran con fundido: quita lo que se va, pone el texto nuevo
   * donde cambió algo y muestra lo que apareció. Los de abajo se acomodan con suavidad.
   */
  const aplicarFundido = (lista: readonly BloqueDeEscena[]): void => {
    const primero = lista[0]?.elemento

    if (primero === null || primero === undefined) return

    conReflujoSuave(primero, () => {
      for (const { elemento, fundido } of lista) {
        if (elemento === null || fundido === null) continue
        if (fundido.tipo === 'quitar') elemento.remove()
        else if (fundido.tipo === 'cambiar') elemento.textContent = fundido.texto
        else elemento.hidden = false
      }
    })
  }

  /** Lleva el cursor al comienzo del trabajo de un paso. */
  const llegarA = (bloque: BloqueDeEscena, paso: PasoGuion): void => {
    const primero = bloque.tramos.find((tramo) => tramo.tipo !== 'igual')

    llevarCursor(() => {
      if (paso.accion === 'editar' && primero !== undefined) antesDe(primero)
      else bloque.elemento?.prepend(cursor)
    }, ritmo.msDeLlegada)
  }

  /** Los tramos de un bloque que se trabajan, en el orden de las partes del paso. */
  const tramosDe = (bloque: BloqueDeEscena): Tramo[] => bloque.tramos.filter((tramo) => tramo.tipo !== 'igual')

  const linea = createTimeline({ defaults: { ease: 'linear' }, autoplay: true })
  /** Ejecuta `accion` en el instante `ms` de la línea, si la escena sigue activa. */
  const en = (ms: number, accion: () => void): void => {
    linea.call(() => { if (activa) accion() }, ms)
  }

  // El acta puede estar a medias bajo el pliegue de la página: se trae a la vista, sin tocar el foco.
  capa.scrollIntoView({ block: 'nearest', behavior: 'smooth' })

  // El cursor aparece en la cabecera del documento y de ahí viaja al primer cambio. Va dentro del
  // primer bloque, no suelto: un nodo en línea fuera de un bloque abre una línea y corre el texto.
  cursor.style.opacity = '0'
  bloques.find((bloque) => bloque.elemento !== null && !bloque.elemento.hidden)?.elemento?.prepend(cursor)
  linea.add(cursor, { opacity: [0, 1], duration: 240, ease: 'outQuad' }, TIEMPOS_REPRODUCCION.intro - 300)

  let reloj: number = TIEMPOS_REPRODUCCION.intro

  for (const paso of guion.pasos) {
    const bloque = bloques[paso.indice]

    if (bloque === undefined) continue

    const tramos = tramosDe(bloque)
    let t = reloj

    en(t, () => {
      if (paso.accion === 'insertar') abrirBloque(bloque)
      llegarA(bloque, paso)
    })
    t += ritmo.msDeLlegada
    if (paso.accion === 'insertar') t += TIEMPOS_REPRODUCCION.creacionDeBloque

    paso.partes.forEach((parte, posicion) => {
      const tramo = tramos[posicion]

      if (tramo === undefined) return

      if (posicion > 0) {
        en(t, () => { llevarCursor(() => { antesDe(tramo) }, TIEMPOS_REPRODUCCION.salto) })
        t += TIEMPOS_REPRODUCCION.salto
      }

      if (parte.tipo === 'borrado') {
        const duracion = msDeSeleccion(parte.palabras, ritmo)

        linea.add({ duration: duracion, onUpdate: (tic) => { if (activa) marcar(tramo, Math.ceil(tic.progress * parte.palabras)) } }, t)
        t += duracion + TIEMPOS_REPRODUCCION.pausaDeBorrado
        if (paso.accion !== 'eliminar') en(t, () => { borrar(tramo) })
      } else {
        const duracion = msDeEscritura(parte.palabras, ritmo)

        linea.add({ duration: duracion, onUpdate: (tic) => { if (activa) escribir(tramo, Math.ceil(tic.progress * parte.palabras)) } }, t)
        t += duracion + TIEMPOS_REPRODUCCION.pausaDeEscritura
      }
    })

    if (paso.accion === 'eliminar') en(t, () => { colapsar(bloque) })

    reloj += paso.duracionMs
  }

  const conFundido = bloques.filter((bloque) => bloque.fundido !== null && bloque.elemento !== null)

  if (conFundido.length > 0) {
    const elementosDe = (aceptados: ReadonlyArray<Fundido['tipo']>): HTMLElement[] => conFundido.flatMap((bloque) =>
      bloque.elemento !== null && bloque.fundido !== null && aceptados.includes(bloque.fundido.tipo) ? [bloque.elemento] : [])
    const salen = elementosDe(['quitar', 'cambiar'])
    const entran = elementosDe(['cambiar', 'mostrar'])
    const cambio = reloj + MS_DE_SALIDA_EN_FUNDIDO

    if (salen.length > 0) linea.add(salen, { opacity: [1, 0], duration: MS_DE_SALIDA_EN_FUNDIDO, ease: 'outQuad' }, reloj)
    en(cambio, () => { aplicarFundido(conFundido) })
    if (entran.length > 0) linea.add(entran, { opacity: [0, 1], duration: MS_DE_ENTRADA_EN_FUNDIDO, ease: 'outQuad', delay: stagger(25) }, cambio)
    reloj += TIEMPOS_REPRODUCCION.fundido
  }

  reloj += ritmo.esperaFinalMs
  linea.add(cursor, { opacity: [1, 0], duration: 200, ease: 'outQuad' }, reloj)
  linea.add(capa, { opacity: [1, 0], duration: 240, ease: 'outQuad' }, reloj + TIEMPOS_REPRODUCCION.salida - 240)
  en(reloj + TIEMPOS_REPRODUCCION.salida, alTerminar)

  return () => {
    activa = false
    linea.cancel()
    libres.forEach((animacion) => { animacion.cancel() })
    libres.clear()
  }
}
