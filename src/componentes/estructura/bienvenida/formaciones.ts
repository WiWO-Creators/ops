/**
 * Las formaciones del recorrido de novedades: a donde va cada pieza en cada seccion.
 *
 * El recorrido tiene un escenario con muchas piezas y un scroll que lo maneja. Cada seccion le
 * corresponde a una formacion, y bajar interpola las piezas de una a la siguiente. Aca solo se
 * calculan las posiciones —numeros puros, sin DOM ni anime.js— para poder probarlas con el
 * interprete de pruebas y para que el mismo arreglo sirva de pose inicial y de destino.
 *
 * Todo vive en el sistema de coordenadas del SVG del escenario (`ENCUADRE_RECORRIDO`), centrado en
 * cero: una formacion que se sale de ese marco es una pieza que desaparece por el borde.
 */

/** Donde queda una pieza en una formacion. `x` e `y` en unidades del SVG; `rotacion` en grados. */
export interface Pose {
  x: number
  y: number
  rotacion: number
  escala: number
}

/** Las formaciones disponibles, en el orden en que se reparten entre las novedades. */
export type NombreFormacion = 'dispersa' | 'grilla' | 'anillo' | 'ola' | 'barras' | 'espiral' | 'visto'

/** Cuantas piezas tiene el escenario. Da para leer figuras sin volverse pesado en un telefono. */
export const PIEZAS_RECORRIDO = 48

/** El `viewBox` del escenario. Centrado en cero para que las formaciones se escriban simetricas. */
export const ENCUADRE_RECORRIDO = '-180 -110 360 220'

/** Las formaciones que se turnan entre novedades. La primera y la ultima seccion tienen la suya. */
const ROTACION_DE_NOVEDADES: readonly NombreFormacion[] = ['anillo', 'ola', 'barras', 'espiral']

/** Columnas de la grilla: 8 x 6 = 48, la cantidad de piezas. */
const COLUMNAS_GRILLA = 8
/** Separacion entre centros de piezas en la grilla. */
const PASO_GRILLA = 22
/** El angulo aureo: reparte los puntos de la espiral sin que se alineen en rayos. */
const ANGULO_AUREO = Math.PI * (3 - Math.sqrt(5))
/** Alturas de las ocho columnas del grafico de barras, en piezas. Suman 48. */
const ALTURAS_BARRAS = [3, 5, 4, 7, 6, 8, 6, 9]

/**
 * Un generador pseudoaleatorio con semilla (mulberry32).
 *
 * Con semilla y no `Math.random()`: la formacion dispersa tiene que ser la misma en cada render y en
 * cada prueba, o la pose inicial saltaria al volver a pintar.
 *
 * @param semilla entero cualquiera
 * @returns una funcion que devuelve numeros en [0, 1)
 */
function azarConSemilla (semilla: number): () => number {
  let estado = semilla >>> 0

  return () => {
    estado = (estado + 0x6D2B79F5) >>> 0
    let t = estado
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)

    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * Reparte `total` puntos a lo largo de una polilinea, a distancias iguales.
 *
 * @param vertices los vertices de la polilinea, al menos dos
 * @param total cuantos puntos repartir
 * @returns `total` puntos sobre la polilinea
 */
function sobrePolilinea (vertices: ReadonlyArray<readonly [number, number]>, total: number): Array<[number, number]> {
  const tramos = vertices.slice(1).map((fin, i) => {
    const inicio = vertices[i] ?? fin

    return { inicio, fin, largo: Math.hypot(fin[0] - inicio[0], fin[1] - inicio[1]) }
  })
  const largoTotal = tramos.reduce((suma, tramo) => suma + tramo.largo, 0)

  return Array.from({ length: total }, (_, i) => {
    let recorrido = total === 1 ? 0 : (i / (total - 1)) * largoTotal

    for (const { inicio, fin, largo } of tramos) {
      if (recorrido <= largo || largo === 0) {
        const t = largo === 0 ? 0 : recorrido / largo

        return [inicio[0] + (fin[0] - inicio[0]) * t, inicio[1] + (fin[1] - inicio[1]) * t]
      }

      recorrido -= largo
    }

    const ultimo = vertices[vertices.length - 1] ?? [0, 0]

    return [ultimo[0], ultimo[1]]
  })
}

/**
 * La pose de la pieza `i` en una formacion.
 *
 * @param nombre la formacion
 * @param i indice de la pieza, de 0 a `total - 1`
 * @param total cuantas piezas hay
 * @param azar generador para las formaciones que lo usan
 * @returns la pose de esa pieza
 */
function poseEn (nombre: NombreFormacion, i: number, total: number, azar: () => number): Pose {
  switch (nombre) {
    case 'dispersa':
      return { x: (azar() - 0.5) * 340, y: (azar() - 0.5) * 200, rotacion: (azar() - 0.5) * 360, escala: 0.4 + azar() * 0.6 }
    case 'grilla': {
      const filas = Math.ceil(total / COLUMNAS_GRILLA)
      const columna = i % COLUMNAS_GRILLA
      const fila = Math.floor(i / COLUMNAS_GRILLA)

      return {
        x: (columna - (COLUMNAS_GRILLA - 1) / 2) * PASO_GRILLA,
        y: (fila - (filas - 1) / 2) * PASO_GRILLA,
        rotacion: 0,
        escala: 1
      }
    }
    case 'anillo': {
      const angulo = (i / total) * Math.PI * 2
      // Dos anillos concentricos alternados: uno solo con 48 piezas se leia como un collar apretado.
      const radio = i % 2 === 0 ? 86 : 58

      return { x: Math.cos(angulo) * radio, y: Math.sin(angulo) * radio, rotacion: (angulo * 180) / Math.PI, escala: i % 2 === 0 ? 1 : 0.7 }
    }
    case 'ola': {
      const t = total === 1 ? 0 : i / (total - 1)

      return { x: -160 + t * 320, y: Math.sin(t * Math.PI * 3) * 46, rotacion: Math.cos(t * Math.PI * 3) * 40, escala: 0.8 }
    }
    case 'barras':
      return poseEnBarras(i)
    case 'espiral': {
      const radio = 8 * Math.sqrt(i + 1) * 1.6

      return { x: Math.cos(i * ANGULO_AUREO) * radio, y: Math.sin(i * ANGULO_AUREO) * radio, rotacion: i * 20, escala: 0.5 + (i / total) * 0.7 }
    }
    case 'visto': {
      const puntos = sobrePolilinea([[-70, 0], [-20, 50], [80, -60]], total)
      const [x, y] = puntos[i] ?? [0, 0]

      return { x, y, rotacion: 45, escala: 0.9 }
    }
  }
}

/**
 * La pose de una pieza en el grafico de barras: columnas de abajo hacia arriba.
 *
 * @param i indice de la pieza
 * @returns su pose; las piezas que no entran en ninguna columna quedan apiladas en la ultima
 */
function poseEnBarras (i: number): Pose {
  let restante = i

  for (const [columna, altura] of ALTURAS_BARRAS.entries()) {
    if (restante < altura) {
      return {
        x: (columna - (ALTURAS_BARRAS.length - 1) / 2) * 30,
        y: 90 - restante * 20,
        rotacion: 0,
        escala: 0.9
      }
    }

    restante -= altura
  }

  return { x: ((ALTURAS_BARRAS.length - 1) / 2) * 30, y: 90 - restante * 20, rotacion: 0, escala: 0.9 }
}

/**
 * Las poses de todas las piezas en una formacion.
 *
 * @param nombre la formacion
 * @param total cuantas piezas; por defecto `PIEZAS_RECORRIDO`
 * @returns un arreglo de `total` poses, en el orden de las piezas
 * @throws {RangeError} si `total` no es un entero positivo
 */
export function formacion (nombre: NombreFormacion, total = PIEZAS_RECORRIDO): Pose[] {
  if (!Number.isInteger(total) || total < 1) throw new RangeError(`total invalido: ${total}`)

  const azar = azarConSemilla(nombre.length * 7919)

  return Array.from({ length: total }, (_, i) => poseEn(nombre, i, total, azar))
}

/**
 * Que formacion le toca a cada seccion del recorrido.
 *
 * La portada arranca dispersa —las piezas todavia no dicen nada—, cada novedad toma la siguiente
 * de la rotacion y el cierre forma un visto. Una formacion por seccion es lo que hace que el scroll
 * y el escenario coincidan: con la seccion `j` quieta en pantalla, las piezas estan en la suya.
 *
 * @param novedades cuantas novedades muestra el recorrido; 0 deja solo portada y cierre
 * @returns una formacion por seccion: `novedades + 2`
 */
export function formacionesDelRecorrido (novedades: number): NombreFormacion[] {
  const cantidad = Math.max(0, Math.floor(novedades))
  const intermedias = Array.from(
    { length: cantidad },
    (_, i) => ROTACION_DE_NOVEDADES[i % ROTACION_DE_NOVEDADES.length] ?? 'grilla'
  )

  return ['dispersa', ...intermedias, 'visto']
}

/**
 * Escribe una pose como `transform` CSS, con las mismas funciones que anima anime.js.
 *
 * Mismo orden y mismas funciones que las propiedades que despues interpola la linea de tiempo: asi
 * anime.js la lee como punto de partida y no hay salto en el primer fotograma.
 *
 * @param pose la pose
 * @returns el valor para `style.transform`
 */
export function transformDe (pose: Pose): string {
  return `translateX(${pose.x.toFixed(2)}px) translateY(${pose.y.toFixed(2)}px) rotate(${pose.rotacion.toFixed(2)}deg) scale(${pose.escala.toFixed(3)})`
}
