import type { GrupoGantt } from '@/datos/recursos'

/**
 * Logica pura del diagrama de Gantt: convertir fechas en posiciones de barra.
 *
 * El diagrama se dibuja con CSS propio, sin libreria: lo unico que hace falta es traducir cada rango
 * de fechas a un porcentaje de desplazamiento y de ancho sobre la linea de tiempo del proyecto.
 *
 * Sin imports de valor: el runner de Node no resuelve el alias `@/` fuera de `import type`.
 */

/** Un dia en milisegundos. */
const DIA = 86400000

/** Linea de tiempo del diagrama, en dias UTC desde la epoca. */
export interface RangoGantt {
  /** Primer dia representado. */
  inicio: number
  /** Ultimo dia representado. */
  fin: number
  /** Cantidad de dias que abarca, siempre >= 1. */
  dias: number
}

/**
 * Convierte una fecha `YYYY-MM-DD` en dias UTC desde la epoca.
 *
 * Se parte el texto en vez de usar `new Date(valor)` porque el constructor interpreta la cadena en
 * hora local segun el navegador y corre la fecha un dia hacia atras al oeste de Greenwich.
 *
 * @param valor fecha del contrato, o `null`
 * @returns el dia, o `null` si no viene o no tiene la forma esperada
 */
export function diaDeFecha (valor: string | null | undefined): number | null {
  if (typeof valor !== 'string') return null

  const partes = valor.slice(0, 10).split('-').map(Number)
  const [anio, mes, dia] = partes

  if (anio === undefined || mes === undefined || dia === undefined) return null
  if (partes.some((n) => !Number.isFinite(n))) return null

  return Date.UTC(anio, mes - 1, dia) / DIA
}

/**
 * Calcula la linea de tiempo que cubre a todos los grupos y todas sus tareas.
 *
 * @param grupos los grupos tal como los devuelve `GET /projects/{id}/gantt`
 * @returns el rango, o `null` si ninguna fila trae fechas utilizables — sin fechas no hay diagrama
 */
export function rangoDeGantt (grupos: GrupoGantt[]): RangoGantt | null {
  const dias: number[] = []

  for (const grupo of grupos) {
    for (const valor of [grupo.start, grupo.end]) {
      const dia = diaDeFecha(valor)
      if (dia !== null) dias.push(dia)
    }

    for (const tarea of grupo.tareas) {
      for (const valor of [tarea.start, tarea.end]) {
        const dia = diaDeFecha(valor)
        if (dia !== null) dias.push(dia)
      }
    }
  }

  if (dias.length === 0) return null

  const inicio = Math.min(...dias)
  const fin = Math.max(...dias)

  return { inicio, fin, dias: Math.max(1, fin - inicio + 1) }
}

/** Posicion de una barra dentro de la linea de tiempo, en porcentaje del ancho total. */
export interface Barra {
  izquierda: number
  ancho: number
}

/**
 * Ubica una barra dentro del rango.
 *
 * Una fila con una sola fecha se dibuja como un dia: una barra de ancho cero seria invisible y
 * ocultaria informacion que si existe.
 *
 * @param desde fecha de inicio del tramo
 * @param hasta fecha de fin del tramo
 * @param rango la linea de tiempo del diagrama
 * @returns el desplazamiento y el ancho en porcentaje, o `null` si el tramo no tiene ninguna fecha
 */
export function barraDeGantt (
  desde: string | null,
  hasta: string | null,
  rango: RangoGantt
): Barra | null {
  const a = diaDeFecha(desde)
  const b = diaDeFecha(hasta)

  if (a === null && b === null) return null

  const primero = Math.min(a ?? b ?? rango.inicio, b ?? a ?? rango.inicio)
  const ultimo = Math.max(a ?? b ?? rango.inicio, b ?? a ?? rango.inicio)

  const inicio = Math.max(rango.inicio, primero)
  const fin = Math.min(rango.fin, ultimo)

  if (fin < inicio) return null

  return {
    izquierda: ((inicio - rango.inicio) / rango.dias) * 100,
    ancho: Math.max(((fin - inicio + 1) / rango.dias) * 100, 100 / rango.dias)
  }
}

// -- Filas y flechas de dependencia -------------------------------------------------------------

/**
 * Alto de una fila del diagrama, en pixeles.
 *
 * Espeja la clase `h-6` con la que se pintan las pistas. Vive aca porque las flechas se trazan en
 * coordenadas de pixel y necesitan saber donde cae cada fila; si una de las dos cambia, la otra
 * tiene que cambiar con ella.
 */
export const ALTO_FILA = 24

/** Separacion entre filas, en pixeles. Espeja la clase `gap-1` de las dos columnas del diagrama. */
export const ESPACIO_FILA = 4

/** Distancia de una fila a la siguiente, de borde superior a borde superior. */
export const PASO_FILA = ALTO_FILA + ESPACIO_FILA

/** Cuanto sale la flecha en horizontal antes de doblar. */
const SALIENTE = 10

/** Radio de los codos. Se recorta si el tramo es mas corto que su doble. */
const RADIO = 4

/** Largo del triangulo de la punta. */
const PUNTA = 6

/** Media altura del triangulo de la punta. */
const MEDIA_PUNTA = 4

/** Una dependencia tal como viaja dentro de la tarea. */
export interface DependenciaDeTarea {
  depends_on: number
  type: string | null
}

/**
 * Una fila dibujada del diagrama, ya aplanada: los grupos y sus tareas en el orden en que se pintan.
 *
 * Aplanar es lo que permite que las flechas crucen de un grupo a otro: la geometria solo necesita el
 * indice de la fila, no a que hito pertenece.
 */
export interface FilaGantt {
  /** Clave estable para React. */
  clave: string
  esGrupo: boolean
  titulo: string
  desde: string | null
  hasta: string | null
  /** Color que administra Perfex. Es un dato, no un token del sistema. */
  color: string | null
  /** Posicion de la barra, o `null` si la fila no tiene fechas dibujables. */
  barra: Barra | null
  /** Id de la tarea, o `null` en las filas de grupo. */
  tareaId: number | null
  dependencias: DependenciaDeTarea[]
}

/** Un grupo del Gantt, con lo justo que la geometria necesita leer. */
interface GrupoDibujable {
  id: string
  nombre: string
  start: string | null
  end: string | null
  tareas: Array<{
    id: number
    name: string
    start: string | null
    end: string | null
    color: string | null
    dependencies?: DependenciaDeTarea[]
  }>
}

/**
 * Aplana los grupos y sus tareas en la lista de filas que se dibuja, con la barra ya calculada.
 *
 * @param grupos los grupos tal como los devuelve `GET /projects/{id}/gantt`
 * @param rango la linea de tiempo del diagrama
 * @returns una fila por grupo seguida de una fila por tarea, en orden de pintado
 */
export function filasDeGantt (grupos: GrupoDibujable[], rango: RangoGantt): FilaGantt[] {
  const filas: FilaGantt[] = []

  for (const grupo of grupos) {
    filas.push({
      clave: grupo.id,
      esGrupo: true,
      titulo: grupo.nombre,
      desde: grupo.start,
      hasta: grupo.end,
      color: null,
      barra: barraDeGantt(grupo.start, grupo.end, rango),
      tareaId: null,
      dependencias: []
    })

    for (const tarea of grupo.tareas) {
      filas.push({
        clave: `${grupo.id}-${tarea.id}`,
        esGrupo: false,
        titulo: tarea.name,
        desde: tarea.start,
        hasta: tarea.end,
        color: tarea.color,
        barra: barraDeGantt(tarea.start, tarea.end, rango),
        tareaId: tarea.id,
        dependencias: tarea.dependencies ?? []
      })
    }
  }

  return filas
}

/**
 * Alto total del area de pistas, en pixeles.
 *
 * @param cantidad cuantas filas se dibujan
 * @returns el alto que tiene que declarar el SVG para cubrirlas
 */
export function altoDeGantt (cantidad: number): number {
  return cantidad <= 0 ? 0 : cantidad * ALTO_FILA + (cantidad - 1) * ESPACIO_FILA
}

/** Una flecha de dependencia lista para pintar, en coordenadas de pixel del area de pistas. */
export interface FlechaGantt {
  clave: string
  /** Trazo de la linea, con los codos redondeados. */
  d: string
  /** Triangulo de la punta, cerrado. */
  punta: string
  /** Texto para el `<title>` del grupo, que es lo que anuncia un lector de pantalla al enfocarlo. */
  titulo: string
}

/**
 * Traza una flecha por cada dependencia dibujable.
 *
 * La flecha va **de la tarea de la que se depende hacia la que depende**: sale del borde derecho de
 * la primera y entra por el borde izquierdo de la segunda, que es como se lee un Gantt.
 *
 * Tres decisiones para que varias flechas no terminen en un plato de espaguetis:
 * 1. El tramo horizontal corre por la propia pista de cada extremo, donde no hay ninguna otra barra
 *    —cada pista dibuja una sola—, y solo el tramo vertical puede cruzar filas intermedias.
 * 2. Ese tramo vertical se pega lo mas posible al destino, para que el cruce sea corto.
 * 3. Cuando el destino empieza **antes** de que termine el origen no hay corredor por delante, asi
 *    que la flecha vuelve hacia atras por el hueco entre dos filas, donde no hay barras que cruzar.
 *
 * Una tarea que aparece en dos grupos —pasa con `agrupar=members`— se conecta solo en su primera
 * fila: dibujar la misma flecha una vez por copia llenaria el diagrama de lineas repetidas.
 *
 * @param filas las filas ya aplanadas
 * @param ancho ancho medido del area de pistas, en pixeles; con 0 no hay nada que trazar todavia
 * @returns las flechas, o una lista vacia si ningun par tiene sus dos barras dibujadas
 */
export function flechasDeGantt (filas: FilaGantt[], ancho: number): FlechaGantt[] {
  if (ancho <= 0) return []

  const primeraFila = new Map<number, number>()
  filas.forEach((fila, indice) => {
    if (fila.tareaId !== null && !primeraFila.has(fila.tareaId)) primeraFila.set(fila.tareaId, indice)
  })

  const flechas: FlechaGantt[] = []

  filas.forEach((fila, destino) => {
    const barraDestino = fila.barra
    if (fila.tareaId === null || barraDestino === null) return
    if (primeraFila.get(fila.tareaId) !== destino) return

    for (const dependencia of fila.dependencias) {
      const origen = primeraFila.get(dependencia.depends_on)
      if (origen === undefined || origen === destino) continue

      const filaOrigen = filas[origen]
      if (filaOrigen?.barra == null) continue

      flechas.push({
        clave: `${dependencia.depends_on}-${fila.tareaId}`,
        titulo: `${fila.titulo} empieza después de ${filaOrigen.titulo}`,
        ...trazarFlecha(filaOrigen.barra, origen, barraDestino, destino, ancho)
      })
    }
  })

  return flechas
}

/**
 * Describe las dependencias en palabras, para el resumen accesible del diagrama.
 *
 * Es lo que se lee cuando no se ve el dibujo, asi que tambien nombra los dos casos que la flecha no
 * puede mostrar: la tarea de la que se depende quedo fuera del diagrama, o no tiene fechas y por eso
 * no tiene barra donde empezar.
 *
 * @param filas las filas ya aplanadas
 * @returns una frase por dependencia, en el orden en que se dibujan las filas
 */
export function describirDependencias (filas: FilaGantt[]): string[] {
  const primeraFila = new Map<number, number>()
  filas.forEach((fila, indice) => {
    if (fila.tareaId !== null && !primeraFila.has(fila.tareaId)) primeraFila.set(fila.tareaId, indice)
  })

  const frases: string[] = []

  filas.forEach((fila, indice) => {
    if (fila.tareaId === null || fila.dependencias.length === 0) return
    if (primeraFila.get(fila.tareaId) !== indice) return

    for (const dependencia of fila.dependencias) {
      const origen = primeraFila.get(dependencia.depends_on)
      const filaOrigen = origen === undefined ? undefined : filas[origen]

      if (filaOrigen === undefined) {
        frases.push(`${fila.titulo} depende de otra tarea que no está en este diagrama.`)
        continue
      }

      frases.push(
        filaOrigen.barra === null
          ? `${fila.titulo} empieza después de ${filaOrigen.titulo}, que no tiene fechas.`
          : `${fila.titulo} empieza después de ${filaOrigen.titulo}.`
      )
    }
  })

  return frases
}

// -- Trazado ------------------------------------------------------------------------------------

/** Un punto del trazo, en pixeles. */
interface Punto {
  x: number
  y: number
}

/**
 * Centro vertical de una fila, que es por donde entran y salen las flechas.
 *
 * @param indice posicion de la fila
 */
function centroDeFila (indice: number): number {
  return indice * PASO_FILA + ALTO_FILA / 2
}

/**
 * Puntos y triangulo de una flecha entre dos barras.
 *
 * @param origen barra de la tarea de la que se depende
 * @param filaOrigen indice de su fila
 * @param destino barra de la tarea que depende
 * @param filaDestino indice de su fila
 * @param ancho ancho del area de pistas en pixeles
 * @returns el trazo y la punta, listos para el atributo `d`
 */
function trazarFlecha (
  origen: Barra,
  filaOrigen: number,
  destino: Barra,
  filaDestino: number,
  ancho: number
): { d: string, punta: string } {
  const salida = ((origen.izquierda + origen.ancho) / 100) * ancho
  const entrada = (destino.izquierda / 100) * ancho
  const y1 = centroDeFila(filaOrigen)
  const y2 = centroDeFila(filaDestino)

  // La linea se corta donde empieza el triangulo para que la punta no quede rellena dos veces.
  const llegada = entrada - PUNTA

  const puntos: Punto[] = llegada - salida >= SALIENTE * 2
    ? tramoDirecto(salida, y1, llegada, y2)
    : tramoDeRetorno(salida, y1, llegada, y2, filaOrigen, filaDestino)

  return {
    d: trazoRedondeado(puntos, RADIO),
    punta: [
      `M ${redondear(entrada)} ${redondear(y2)}`,
      `L ${redondear(entrada - PUNTA)} ${redondear(y2 - MEDIA_PUNTA)}`,
      `L ${redondear(entrada - PUNTA)} ${redondear(y2 + MEDIA_PUNTA)}`,
      'Z'
    ].join(' ')
  }
}

/**
 * Recorrido cuando el destino empieza despues de que termina el origen: un solo codo doble, con el
 * tramo vertical lo mas pegado posible al destino.
 */
function tramoDirecto (salida: number, y1: number, llegada: number, y2: number): Punto[] {
  const quiebre = Math.max(salida + SALIENTE, llegada - SALIENTE)

  return [
    { x: salida, y: y1 },
    { x: quiebre, y: y1 },
    { x: quiebre, y: y2 },
    { x: llegada, y: y2 }
  ]
}

/**
 * Recorrido cuando el destino empieza antes de que termine el origen: la flecha sale hacia adelante,
 * vuelve hacia atras por el hueco entre filas —donde no hay barras— y entra por la izquierda.
 */
function tramoDeRetorno (
  salida: number,
  y1: number,
  llegada: number,
  y2: number,
  filaOrigen: number,
  filaDestino: number
): Punto[] {
  // El hueco que toca la fila de destino por el lado del origen.
  const hueco = filaDestino > filaOrigen
    ? filaDestino * PASO_FILA - ESPACIO_FILA / 2
    : (filaDestino + 1) * PASO_FILA - ESPACIO_FILA / 2

  return [
    { x: salida, y: y1 },
    { x: salida + SALIENTE, y: y1 },
    { x: salida + SALIENTE, y: hueco },
    { x: llegada - SALIENTE, y: hueco },
    { x: llegada - SALIENTE, y: y2 },
    { x: llegada, y: y2 }
  ]
}

/**
 * Convierte una polilinea en un trazo con los codos redondeados.
 *
 * El radio se recorta a la mitad del tramo mas corto de cada codo: sin ese recorte, dos quiebres
 * cercanos se comerian el uno al otro y la curva se saldria de la polilinea.
 *
 * @param puntos los vertices, de dos en adelante
 * @param radio radio maximo de cada codo
 * @returns el atributo `d`, o una cadena vacia si no hay dos puntos
 */
function trazoRedondeado (puntos: Punto[], radio: number): string {
  const ultimo = puntos[puntos.length - 1]
  if (puntos.length < 2 || puntos[0] === undefined || ultimo === undefined) return ''

  const partes = [`M ${coordenadas(puntos[0])}`]

  for (let i = 1; i < puntos.length - 1; i += 1) {
    const anterior = puntos[i - 1]
    const actual = puntos[i]
    const siguiente = puntos[i + 1]
    if (anterior === undefined || actual === undefined || siguiente === undefined) continue

    const entra = Math.min(radio, distancia(anterior, actual) / 2)
    const sale = Math.min(radio, distancia(actual, siguiente) / 2)

    partes.push(
      `L ${coordenadas(avanzar(actual, anterior, entra))}`,
      `Q ${coordenadas(actual)} ${coordenadas(avanzar(actual, siguiente, sale))}`
    )
  }

  partes.push(`L ${coordenadas(ultimo)}`)

  return partes.join(' ')
}

/** Distancia entre dos puntos. */
function distancia (a: Punto, b: Punto): number {
  return Math.hypot(b.x - a.x, b.y - a.y)
}

/**
 * Punto a `paso` pixeles de `desde` en direccion a `hacia`.
 *
 * @returns el mismo `desde` cuando los dos puntos coinciden, para no dividir por cero
 */
function avanzar (desde: Punto, hacia: Punto, paso: number): Punto {
  const largo = distancia(desde, hacia)
  if (largo === 0) return desde

  return {
    x: desde.x + ((hacia.x - desde.x) / largo) * paso,
    y: desde.y + ((hacia.y - desde.y) / largo) * paso
  }
}

/** Un punto como par de coordenadas del atributo `d`. */
function coordenadas (punto: Punto): string {
  return `${redondear(punto.x)} ${redondear(punto.y)}`
}

/** Recorta a dos decimales: mas precision solo engorda el atributo `d`. */
function redondear (valor: number): number {
  return Math.round(valor * 100) / 100
}
