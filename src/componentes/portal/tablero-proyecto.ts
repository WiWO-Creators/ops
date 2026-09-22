import { formatearFecha } from '../../lib/fechas.ts'
import { resolverEstado, type CatalogoDeEstados } from '../../dominio/estados-tarea.ts'
import type {
  AvanceDelProyecto,
  ConteoPorEstado,
  HitoDelTablero,
  TableroDelProyecto,
  TareasDelTablero
} from '../../datos/portal.ts'

/**
 * Las cuentas del tablero de UN {espacio} del portal.
 *
 * Vive en un `.ts` sin React ni `fetch` para que `pruebas/tablero-proyecto.test.js` la pueda
 * recorrer, igual que `tablero.ts` con los gráficos de la portada. Los imports son relativos y con
 * extensión porque el runner de Node no resuelve el alias `@/` fuera de `import type`.
 *
 * === LA REGLA DE TODO EL ARCHIVO ===
 *
 * `null` nunca se convierte en 0. La API manda `null` cuando no hay denominador —un {espacio} sin
 * {procesos} visibles no está al 0 % de avance—, y cada función de acá lo propaga en vez de
 * aplanarlo. La pantalla tiene que poder escribir «todavía no lo sabemos» en vez de dibujar una
 * barra vacía que se lee «no hicieron nada».
 *
 * **Acá no se calcula ninguna fecha.** El día sale de `formatearFecha`, el mismo formateador que usa
 * el resto del producto: derivar el día con otra zona horaria haría que una entrada de las 22:00
 * cayera en un día distinto según quién la pinte.
 */

/** Lo que se escribe cuando un gráfico no tiene ni una fila. Misma frase que la portada. */
export const SIN_NADA_QUE_MOSTRAR = 'Todavía no hay nada que mostrar acá.'

// =================================================================================================
// AVANCE
// =================================================================================================

/** Una lectura del avance, ya decidida: o hay porcentaje, o hay un motivo por el que no lo hay. */
export interface LecturaDeAvance {
  /** `null` cuando no hay {procesos} visibles que contar. */
  porcentaje: number | null
  cerradas: number
  abiertas: number
  total: number
  /** Qué escribir cuando `porcentaje` es `null`. Vacío cuando sí hay porcentaje. */
  motivo: string
}

/**
 * Lee el bloque de avance y decide qué se puede afirmar.
 *
 * El motivo NO es decoración: es lo único que separa «no hay {procesos} compartidas» de «no se hizo
 * nada», que es exactamente la confusión que un 0 % provocaría.
 */
export function leerAvance (avance: AvanceDelProyecto): LecturaDeAvance {
  return {
    porcentaje: avance.porcentaje,
    cerradas: avance.cerradas,
    abiertas: avance.abiertas,
    total: avance.tareas,
    motivo: avance.porcentaje === null
      ? 'Todavía no hay tareas compartidas en este proyecto, así que no hay avance que medir.'
      : ''
  }
}

// =================================================================================================
// PRIORIDADES Y CONTEOS
// =================================================================================================

/**
 * El resumen accesible de la barra de prioridades: el mismo dato, en una frase.
 *
 * Nombra solo las prioridades que tienen {procesos}. Las que están en cero salen en la leyenda, que
 * es donde se leen; enumerarlas también acá alargaría la frase con cuatro «0 en» sin agregar nada.
 */
export function resumenDePrioridades (tareas: TareasDelTablero): string {
  const conFilas = tareas.por_prioridad.filter((prioridad) => prioridad.total > 0)

  if (conFilas.length === 0) return 'Sin tareas para repartir por prioridad.'

  const total = conFilas.reduce((suma, prioridad) => suma + prioridad.total, 0)

  return `${total} tareas: `
    + conFilas.map((p) => `${p.total} en ${p.name}`).join(', ') + '.'
}

// =================================================================================================
// LOS ESTADOS
// =================================================================================================

/**
 * Un estado ya resuelto contra el catálogo, listo para pintar una marca.
 *
 * El color es el que administra Perfex, tal cual: acá no hay paleta propia, igual que en la
 * insignia de cada fila (`resolverEstado`). Así la barra de «En proceso» tiene el mismo color que la
 * insignia «En proceso» de la pestaña de {procesos}, que es la única forma de que el cliente
 * reconozca el estado sin leer la leyenda dos veces.
 */
export interface EstadoPintado {
  status: number
  etiqueta: string
  /** El color del catálogo. `null` cuando el estado no tiene color: se pinta con el tono neutro. */
  color: string | null
  /**
   * `true` cuando el catálogo no conoce el estado. Se dibuja con contorno y sin relleno, como la
   * insignia: un estado que no sabemos nombrar no puede llevar el color de otro.
   */
  desconocido: boolean
}

/** Una barra del gráfico de {procesos} por estado. */
export interface BarraDeEstado extends EstadoPintado {
  total: number
  /** 0-1 sobre el estado con más {procesos}: la barra más larga llena el carril. */
  fraccion: number
  /** Porcentaje sobre el total de {procesos}, para el tooltip. Redondeado a entero. */
  porcentaje: number
}

/**
 * Resuelve un estado contra el catálogo.
 *
 * @param status el id que mandó la API
 * @param catalogo `task_statuses` del portal, o nada si todavía no llegó
 */
export function pintarEstado (status: number, catalogo: CatalogoDeEstados | undefined): EstadoPintado {
  const resuelto = resolverEstado(status, catalogo)

  return {
    status,
    etiqueta: resuelto.etiqueta,
    color: resuelto.color === undefined || resuelto.color === '' ? null : resuelto.color,
    desconocido: resuelto.desconocido
  }
}

/**
 * Las {procesos} por estado como barras, una por estado con alguna.
 *
 * La API manda los ceros —el catálogo completo— y acá se descartan: una barra de largo cero no se
 * ve y ocupa una fila, que es el «mucha data hacia abajo» que se rechazó. El orden es el que llegó,
 * que es el del catálogo, y NO se reordena por total: el catálogo es el flujo de trabajo —de «Por
 * iniciar» a «Completado»— y leído en ese orden el gráfico cuenta dónde está parado el trabajo.
 *
 * La escala es el estado con más {procesos} de la propia lista, como en el resto del archivo.
 *
 * @param porEstado `tareas.por_estado` tal como llegó
 * @param catalogo `task_statuses` del portal
 */
export function barrasPorEstado (
  porEstado: readonly ConteoPorEstado[],
  catalogo: CatalogoDeEstados | undefined
): BarraDeEstado[] {
  const conFilas = porEstado.filter((conteo) => conteo.total > 0)
  const mayor = conFilas.reduce((alto, conteo) => Math.max(alto, conteo.total), 0)
  const total = conFilas.reduce((suma, conteo) => suma + conteo.total, 0)

  return conFilas.map((conteo) => ({
    ...pintarEstado(conteo.status, catalogo),
    total: conteo.total,
    fraccion: mayor === 0 ? 0 : conteo.total / mayor,
    porcentaje: total === 0 ? 0 : Math.round((conteo.total * 100) / total)
  }))
}

/** El resumen accesible de las barras por estado: el mismo dato, en una frase. */
export function resumenPorEstado (barras: readonly BarraDeEstado[]): string {
  if (barras.length === 0) return 'Sin tareas para repartir por estado.'

  const total = barras.reduce((suma, barra) => suma + barra.total, 0)

  return `${total} tareas: ` + barras.map((b) => `${b.total} en ${b.etiqueta}`).join(', ') + '.'
}

// =================================================================================================
// LAS PENDIENTES POR HITO
// =================================================================================================

/** Cuántos {hitos} se ven antes del `<details>`. Más que en las otras listas: cada fila es baja. */
export const HITOS_VISIBLES = 6

/** Un tramo de la barra apilada de un {hito}. */
export interface TramoDePendientes extends EstadoPintado {
  total: number
  /** Porcentaje sobre las pendientes de ESE {hito}: el ancho del tramo dentro de su barra. */
  porcentaje: number
}

/** Una fila del gráfico: un {hito} con sus pendientes. */
export interface FilaDePendientes {
  id: number
  nombre: string
  pendientes: number
  /**
   * 0-1 sobre el {hito} con más pendientes: el largo de la barra entera.
   *
   * La escala es COMÚN a todas las filas, y es lo que hace comparables a los {hitos}: con cada
   * barra estirada a su propio 100 % un {hito} con 2 pendientes se vería igual de cargado que uno
   * con 30.
   */
  fraccion: number
  tramos: TramoDePendientes[]
}

/** El gráfico entero: las filas y la leyenda que las explica una sola vez. */
export interface PendientesPorHito {
  filas: FilaDePendientes[]
  /** Los estados que aparecen en alguna fila, en el orden del catálogo y los desconocidos al final. */
  leyenda: EstadoPintado[]
  /** Suma de las pendientes de todas las filas. */
  total: number
  /** Cuántos {hitos} tiene la lista, con y sin pendientes: para decir cuántos no tienen nada. */
  hitos: number
}

/**
 * Arma el gráfico de pendientes por {hito}.
 *
 * Entran solo los {hitos} con algo pendiente. Uno con todo cerrado no tiene barra que dibujar, y
 * una fila vacía entre dos llenas se lee como un dato que no cargó; `hitos` guarda el total para
 * que la pantalla pueda decir cuántos quedaron fuera por estar al día.
 *
 * El orden es el de la API, que es el orden del {espacio} —el mismo de la pestaña de {hitos}—, y no
 * se reordena por carga: el cliente conoce sus {hitos} en esa secuencia, y encontrar «Guiones»
 * donde siempre está vale más que un ranking.
 *
 * @param lista `hitos.lista` tal como llegó
 * @param catalogo `task_statuses` del portal
 */
export function pendientesPorHito (
  lista: readonly HitoDelTablero[],
  catalogo: CatalogoDeEstados | undefined
): PendientesPorHito {
  const conPendientes = lista.filter((hito) => hito.pendientes > 0)
  const mayor = conPendientes.reduce((alto, hito) => Math.max(alto, hito.pendientes), 0)

  const filas = conPendientes.map((hito) => {
    // El denominador del tramo es la suma de SUS estados y no `pendientes`: si alguna vez no
    // coinciden, los tramos igual llenan la barra en vez de dejar un hueco sin explicación.
    const suma = hito.por_estado.reduce((total, conteo) => total + Math.max(0, conteo.total), 0)

    return {
      id: hito.id,
      nombre: hito.name,
      pendientes: hito.pendientes,
      fraccion: mayor === 0 ? 0 : hito.pendientes / mayor,
      tramos: hito.por_estado
        .filter((conteo) => conteo.total > 0)
        .map((conteo) => ({
          ...pintarEstado(conteo.status, catalogo),
          total: conteo.total,
          porcentaje: suma === 0 ? 0 : (conteo.total * 100) / suma
        }))
    }
  })

  return {
    filas,
    leyenda: leyendaDeEstados(filas, catalogo),
    total: conPendientes.reduce((suma, hito) => suma + hito.pendientes, 0),
    hitos: lista.length
  }
}

/**
 * Los estados que usa alguna fila, una sola vez y en el orden del catálogo.
 *
 * El orden del catálogo, y no el de aparición, porque es el mismo que el de los tramos dentro de
 * cada barra: la leyenda se lee de izquierda a derecha igual que las barras. Los desconocidos van
 * al final, donde también los pone la API.
 */
function leyendaDeEstados (
  filas: readonly FilaDePendientes[],
  catalogo: CatalogoDeEstados | undefined
): EstadoPintado[] {
  const vistos = new Map<number, EstadoPintado>()

  for (const fila of filas) {
    for (const tramo of fila.tramos) {
      if (!vistos.has(tramo.status)) vistos.set(tramo.status, pintarEstado(tramo.status, catalogo))
    }
  }

  const posicion = (status: number): number => {
    const indice = (catalogo ?? []).findIndex((item) => String('valor' in item ? item.valor : item.id) === String(status))

    return indice === -1 ? Number.MAX_SAFE_INTEGER : indice
  }

  return [...vistos.values()].sort((a, b) => posicion(a.status) - posicion(b.status) || a.status - b.status)
}

/** El resumen accesible de una fila: el {hito}, sus pendientes y en qué estado está cada una. */
export function resumenDeFila (fila: FilaDePendientes): string {
  return `${fila.nombre}: ${fila.pendientes} pendientes, `
    + fila.tramos.map((tramo) => `${tramo.total} en ${tramo.etiqueta}`).join(', ') + '.'
}

// =================================================================================================
// EL REPARTO EN COLUMNAS
// =================================================================================================

/** Los bloques del tablero. Cada uno puede faltar según las pestañas del contacto. */
export type BloqueDelTablero = 'avance' | 'cifras' | 'hitos' | 'estados' | 'prioridades' | 'novedades'

/** Un bloque presente, con cuánto alto se estima que ocupa. */
export interface BloqueConPeso {
  bloque: BloqueDelTablero
  /** Alto estimado, en decenas de píxeles. Sólo se compara contra otros pesos: no es una medida. */
  peso: number
}

/** Las dos columnas de la rejilla en escritorio, cada una en orden de lectura. */
export interface Columnas {
  /** La de cinco doceavos, a la izquierda. */
  estrecha: BloqueDelTablero[]
  /** La de siete doceavos, a la derecha. */
  ancha: BloqueDelTablero[]
}

/**
 * El orden de lectura: de lo que pide una acción a lo que sólo informa.
 *
 * Es también el orden en móvil, donde todo va en una columna. El medidor primero porque es la
 * figura protagonista —«¿cuánto falta?»—; las cifras después porque ahí están las vencidas; las
 * pendientes por {hito} antes que los estados porque dicen DÓNDE está lo pendiente; lo que pasó al
 * final.
 */
export const ORDEN_DE_LECTURA: readonly BloqueDelTablero[] =
  ['avance', 'cifras', 'hitos', 'estados', 'prioridades', 'novedades']

/**
 * A qué columna tira cada bloque cuando nada lo obliga a cambiar.
 *
 * El medidor, las cifras y los estados son angostos por naturaleza —un anillo, tarjetas de un
 * número, barras con rótulo corto— y viven bien en cinco columnas. Los {hitos} tienen nombres
 * largos y barras que se comparan a lo largo, las novedades son frases: esos quieren las siete.
 */
const AFINIDAD: Record<BloqueDelTablero, keyof Columnas> = {
  avance: 'estrecha',
  cifras: 'estrecha',
  estados: 'estrecha',
  hitos: 'ancha',
  prioridades: 'ancha',
  novedades: 'ancha'
}

/**
 * Reparte los bloques presentes en dos columnas que terminen a la misma altura.
 *
 * === POR QUÉ DOS PILAS Y NO UNA REJILLA DE FILAS ===
 *
 * Una rejilla de filas deja huecos en cuanto los bloques son asimétricos: el alto de la fila lo
 * pone el más alto, y al lado del anillo queda un vacío. O deja un bloque solo en su fila cuando el
 * vecino no llegó. El usuario pidió lo contrario: «que no quede con cosas solas en una fila, que todo
 * calce independiente de que sean asimétricos». Dos pilas lo resuelven por construcción: cada
 * columna apila sus bloques sin mirar a la otra, y el ÚLTIMO de cada una se estira hasta el piso
 * común. No hay filas, así que no hay fila donde quedarse solo.
 *
 * === CÓMO SE REPARTE ===
 *
 *   1. Cada bloque va a su columna de {@link AFINIDAD}.
 *   2. Mientras mover un bloque de la columna más pesada a la otra achique la diferencia, se mueve
 *      —empezando por el último en orden de lectura, para que lo de arriba no se desplace—. La
 *      columna que cede nunca queda vacía.
 *   3. Cada columna se ordena por {@link ORDEN_DE_LECTURA}.
 *
 * Balancear importa porque el bloque que se estira es el último: si una columna es mucho más baja,
 * su último bloque crece hasta ser un panel con aire adentro.
 *
 * Con un solo bloque, va a la ancha y la estrecha queda sin dibujar: estirar un bloque a las doce
 * columnas es justo la «fila del ancho de la pantalla» que se rechazó.
 *
 * @param presentes los bloques que llegaron, con su peso; el orden no importa
 * @returns las dos columnas, cada una en orden de lectura
 */
export function repartirEnColumnas (presentes: readonly BloqueConPeso[]): Columnas {
  const ordenados = [...presentes].sort((a, b) => lugarDeLectura(a.bloque) - lugarDeLectura(b.bloque))

  if (ordenados.length === 0) return { estrecha: [], ancha: [] }
  if (ordenados.length === 1) return { estrecha: [], ancha: [(ordenados[0] as BloqueConPeso).bloque] }

  const columnas: Record<keyof Columnas, BloqueConPeso[]> = { estrecha: [], ancha: [] }
  for (const bloque of ordenados) columnas[AFINIDAD[bloque.bloque]].push(bloque)

  // Cada vuelta mueve un bloque y achica la diferencia, así que termina; el tope es por si acaso.
  for (let vuelta = 0; vuelta < ordenados.length; vuelta++) {
    if (!moverUnoHaciaLaMasLiviana(columnas)) break
  }

  const enOrden = (bloques: BloqueConPeso[]): BloqueDelTablero[] =>
    [...bloques].sort((a, b) => lugarDeLectura(a.bloque) - lugarDeLectura(b.bloque)).map((b) => b.bloque)

  return { estrecha: enOrden(columnas.estrecha), ancha: enOrden(columnas.ancha) }
}

/**
 * Mueve de la columna más pesada a la otra el primer bloque —desde el final de la lectura— que
 * achique la diferencia. Devuelve si movió alguno.
 */
function moverUnoHaciaLaMasLiviana (columnas: Record<keyof Columnas, BloqueConPeso[]>): boolean {
  const carga = (lado: keyof Columnas): number => columnas[lado].reduce((suma, b) => suma + b.peso, 0)
  const pesada: keyof Columnas = carga('estrecha') > carga('ancha') ? 'estrecha' : 'ancha'
  const liviana: keyof Columnas = pesada === 'estrecha' ? 'ancha' : 'estrecha'
  const diferencia = carga(pesada) - carga(liviana)

  if (columnas[pesada].length <= 1) return false

  const candidatos = [...columnas[pesada]].sort((a, b) => lugarDeLectura(b.bloque) - lugarDeLectura(a.bloque))
  const elegido = candidatos.find((b) => Math.abs(diferencia - 2 * b.peso) < diferencia)

  if (elegido === undefined) return false

  columnas[pesada] = columnas[pesada].filter((b) => b !== elegido)
  columnas[liviana].push(elegido)

  return true
}

/** El lugar de un bloque en {@link ORDEN_DE_LECTURA}. */
function lugarDeLectura (bloque: BloqueDelTablero): number {
  return ORDEN_DE_LECTURA.indexOf(bloque)
}

/**
 * Cuánto alto se estima que ocupa cada bloque, en decenas de píxeles.
 *
 * Son estimaciones de lo que dibuja cada componente —la cabecera del panel más sus filas—, y sólo
 * sirven para comparar columnas. No tienen que ser exactas: el último bloque de cada columna
 * absorbe la diferencia estirándose, y esto sólo evita que la diferencia sea grande.
 */
export const PESO = {
  /** Cabecera, relleno y separación de un panel. */
  panel: 6.4,
  /** El anillo de 128 px con su pie. */
  avance: 15,
  /** Una fila de tarjetas de cifra, con su separación. */
  filaDeCifras: 8,
  /** La barra apilada de prioridades con su leyenda. */
  prioridades: 6,
  /** Una fila de barra con rótulo. */
  fila: 2.4,
  /** La leyenda o el desplegable de «ver todos». */
  extra: 2
} as const

/**
 * Cuántas filas de tarjetas hacen las cifras.
 *
 * Cuatro tarjetas van en dos filas de dos; tres o menos, en una. Es lo que evita la tarjeta sola en
 * su fila: con cuatro en una rejilla de tres, la cuarta quedaría huérfana abajo.
 */
export function filasDeCifras (tarjetas: number): number {
  if (tarjetas <= 0) return 0

  return tarjetas === 4 ? 2 : Math.ceil(tarjetas / 3)
}
// =================================================================================================
// LA ACTIVIDAD
// =================================================================================================

/**
 * Qué dice cada clave del feed, en las palabras del cliente.
 *
 * La API manda la `description_key` de Perfex y no la frase, para no mantener dos traducciones de la
 * misma línea. Acá se traduce SOLO lo que sobrevive al filtro del servidor: las claves internas
 * —asignación de {procesos}, borrados, reaperturas— nunca llegan, y por eso no están en este mapa.
 *
 * Una clave que no esté acá NO se dibuja. Es deliberado: antes que mostrarle al cliente un
 * `not_project_activity_task_status_changed` crudo, o adivinar qué significa una clave nueva de una
 * actualización de Perfex, la línea se omite. El feed completo está en su propia pestaña.
 */
const TEXTO_DE_ACTIVIDAD: Record<string, string> = {
  project_activity_task_marked_complete: 'Se completó una tarea',
  not_project_activity_task_status_changed: 'Cambió el estado de una tarea',
  project_activity_new_task_comment: 'Hay un comentario nuevo en una tarea',
  project_activity_created_milestone: 'Se creó un hito',
  project_activity_added_team_member: 'Se sumó alguien al equipo',
  project_activity_updated: 'Se actualizó el proyecto',
  project_activity_created: 'Se creó el proyecto'
}

/** Una novedad del feed, lista para pintar. */
export interface Novedad {
  /** La fecha cruda, que sirve de clave de React: dos novedades del mismo segundo no existen. */
  fecha: string
  etiqueta: string
  texto: string
}

/**
 * Traduce el feed y descarta lo que no se sabe decir.
 *
 * @param actividad el feed tal como llegó
 * @param tope cuántas novedades dibujar
 */
export function novedades (
  actividad: Array<{ fecha: string, clave: string }>,
  tope: number
): Novedad[] {
  return actividad
    .filter((linea) => TEXTO_DE_ACTIVIDAD[linea.clave] !== undefined)
    .slice(0, tope)
    .map((linea) => ({
      fecha: linea.fecha,
      etiqueta: formatearFecha(linea.fecha),
      texto: TEXTO_DE_ACTIVIDAD[linea.clave] as string
    }))
}

// =================================================================================================
// LAS CIFRAS
// =================================================================================================

/** Una cifra de la fila de contexto, con lo que significa. */
export interface Cifra {
  clave: string
  etiqueta: string
  valor: number
  /** `true` cuando el número es una mala noticia y hay que poder verlo sin leer el rótulo. */
  alarma: boolean
}

/**
 * Las cifras de contexto del tablero.
 *
 * Son TRES, y no las cuatro que manda la API. De las dos ventanas de cierres queda `cerradas_7`,
 * la que contesta «¿se está moviendo esto?» sin cuentas: treinta días es un mes entero, y en un
 * {espacio} tranquilo esa cifra dice lo mismo que el medidor de avance de al lado. Una cifra que
 * repite lo que otro bloque ya dice es exactamente el relleno que se rechazó.
 *
 * El pedido fue «más que 3 números piñuflas» y esto son tres números. No se contradice: la queja no
 * era la cantidad, era que fueran lo único. Estos tres se pueden accionar —hay 16 vencidas— y viven
 * al lado de la forma que los explica, no en su lugar.
 *
 * `vencidas` es la única que puede llevar alarma. Las otras dos son hechos: «cerradas esta semana»
 * en 0 no es malo en sí —un {espacio} puede estar entre entregas— y pintarlo de rojo mentiría.
 */
export function cifrasDelTablero (tareas: TareasDelTablero): Cifra[] {
  return [
    { clave: 'vencidas', etiqueta: 'Vencidas', valor: tareas.vencidas, alarma: tareas.vencidas > 0 },
    { clave: 'cerradas_7', etiqueta: 'Cerradas esta semana', valor: tareas.cerradas_7, alarma: false },
    { clave: 'sin_fecha', etiqueta: 'Abiertas sin fecha', valor: tareas.sin_fecha, alarma: false }
  ]
}

// =================================================================================================
// GEOMETRÍA DE LOS GRÁFICOS
//
// Todo lo que sigue convierte datos en coordenadas. Vive acá y no en el componente por la misma
// razón que el resto del archivo: se puede verificar sin navegador, y un error de geometría —una
// fracción que se sale de 0-1, un área que no cierra— dibuja un gráfico plausible y equivocado.
// =================================================================================================

/**
 * Cuánto pinta el anillo del medidor de avance.
 *
 * Un anillo y no una dona: la dona reparte un total entre categorías, el anillo mide UNA razón
 * contra su límite. Son formas distintas para preguntas distintas, y acá la pregunta es «cuánto de
 * lo comprometido está hecho».
 *
 * Se devuelve en unidades de `stroke-dasharray` porque es lo único que un SVG necesita para dibujar
 * un arco sin trigonometría: la circunferencia completa y cuánto de ella se pinta.
 *
 * @param porcentaje 0-100, o `null` si no hay avance medido
 * @param radio radio del círculo en unidades de `viewBox`
 */
export function arcoDeAvance (porcentaje: number | null, radio: number): { circunferencia: number, pintado: number } {
  const circunferencia = 2 * Math.PI * radio
  // `null` pinta cero arco, pero el componente NO dibuja el anillo en ese caso: escribe el motivo.
  // El cero de acá es para que la función sea total y no para que se pinte.
  const fraccion = porcentaje === null ? 0 : Math.min(100, Math.max(0, porcentaje)) / 100

  return { circunferencia, pintado: circunferencia * fraccion }
}

/** Un tramo de la barra apilada de prioridades. */
export interface TramoDePrioridad {
  priority: number
  etiqueta: string
  total: number
  /** Porcentaje del total, para el ancho. */
  porcentaje: number
  /** 1-4: qué paso de la rampa ordinal le toca. Bajo es el más claro en tema claro. */
  paso: number
  /** `true` si la etiqueta cabe DENTRO del tramo. Si no, la lleva la leyenda y el tooltip. */
  rotuloAdentro: boolean
}

/**
 * Las prioridades como una barra apilada horizontal.
 *
 * Apilada y no dona, aunque la dona se haya pedido: en los Proyectos reales el reparto es 0/74/6/2
 * sobre 82, o sea que Alto y Urgente serían dos gajos de 26 y 9 grados. La skill de visualización
 * lo marca como anti-patrón —«una dona para comparar valores cercanos»— y para part-to-whole manda
 * barra apilada, en horizontal cuando las categorías tienen nombre largo. Apilados, 6 y 2 se ven.
 *
 * Horizontal y no vertical porque los rótulos son palabras («Urgente»), y en vertical habría que
 * girarlos.
 *
 * Las prioridades vacías NO entran a la barra —un tramo de ancho cero no se ve y ensucia el
 * apilado— pero sí salen en la leyenda con su cero, que es donde el cliente puede leerlas.
 *
 * `rotuloAdentro` se decide acá y no en el CSS: un rótulo dentro de un tramo del 2 % se recorta, y
 * la skill es explícita en que un rótulo que no cabe se mueve o se omite, nunca se recorta. El
 * umbral del 12 % es el ancho mínimo donde entra «Urgente» con aire a los dos lados.
 */
export function tramosDePrioridad (tareas: TareasDelTablero): TramoDePrioridad[] {
  const total = tareas.por_prioridad.reduce((suma, p) => suma + p.total, 0)

  if (total === 0) return []

  return tareas.por_prioridad
    .map((prioridad, i) => {
      const porcentaje = (prioridad.total * 100) / total

      return {
        priority: prioridad.priority,
        etiqueta: prioridad.name,
        total: prioridad.total,
        porcentaje,
        paso: i + 1,
        rotuloAdentro: porcentaje >= 12
      }
    })
    .filter((tramo) => tramo.total > 0)
}

/** Una prioridad en la leyenda: sale siempre, también en cero. */
export interface ClaveDePrioridad {
  priority: number
  etiqueta: string
  total: number
  paso: number
}

/** La leyenda de la barra de prioridades: las cuatro, en el orden de la escala. */
export function clavesDePrioridad (tareas: TareasDelTablero): ClaveDePrioridad[] {
  return tareas.por_prioridad.map((prioridad, i) => ({
    priority: prioridad.priority,
    etiqueta: prioridad.name,
    total: prioridad.total,
    paso: i + 1
  }))
}

/** Cuántas novedades se calculan. El componente muestra cinco y pliega el resto. */
export const TOPE_DE_NOVEDADES = 12

/** Cuántas filas muestran las listas cortas —novedades— antes del `<details>`. */
export const FILAS_VISIBLES = 5

/**
 * Cuántas tarjetas de cifra lleva el tablero: las tres de contexto más la próxima entrega.
 *
 * `undefined` en `proxima_entrega` es «no tiene la pestaña» y `null` es «no queda ninguna entrega
 * pendiente». Los dos terminan en «sin tarjeta», y se decide acá una sola vez para que la rejilla y
 * el peso del bloque no puedan decidir distinto sobre el mismo dato.
 */
export function tarjetasDeCifras (tablero: TableroDelProyecto): number {
  if (tablero.tareas === undefined) return 0

  const hayProxima = tablero.proxima_entrega !== undefined && tablero.proxima_entrega !== null

  return cifrasDelTablero(tablero.tareas).length + (hayProxima ? 1 : 0)
}

/**
 * Los bloques que este tablero va a dibujar, cada uno con su peso estimado.
 *
 * Qué bloque está lo deciden las pestañas del contacto, que la API ya aplicó al omitir claves:
 * `tareas` trae las cifras, las prioridades y los estados; `hitos`, las pendientes por {hito};
 * `actividad`, las novedades. El medidor está siempre. El peso sale de las filas que cada bloque va
 * a dibujar de verdad, para que un {espacio} con dos {hitos} no reserve el alto de seis.
 *
 * @param tablero el tablero tal como llegó
 * @param catalogo `task_statuses` del portal, para saber cuántas barras de estado hay
 */
export function bloquesDelTablero (
  tablero: TableroDelProyecto,
  catalogo: CatalogoDeEstados | undefined
): BloqueConPeso[] {
  const bloques: BloqueConPeso[] = [{ bloque: 'avance', peso: PESO.panel + PESO.avance }]

  if (tablero.tareas !== undefined) {
    const filas = filasDeCifras(tarjetasDeCifras(tablero))
    const estados = barrasPorEstado(tablero.tareas.por_estado, catalogo).length

    bloques.push(
      { bloque: 'cifras', peso: filas * PESO.filaDeCifras },
      { bloque: 'estados', peso: PESO.panel + PESO.fila * Math.max(1, estados) },
      { bloque: 'prioridades', peso: PESO.panel + PESO.prioridades }
    )
  }

  if (tablero.hitos !== undefined) {
    const filas = pendientesPorHito(tablero.hitos.lista, catalogo).filas.length

    bloques.push({
      bloque: 'hitos',
      peso: PESO.panel + PESO.extra + PESO.fila * Math.max(1, Math.min(filas, HITOS_VISIBLES))
        + (filas > HITOS_VISIBLES ? PESO.extra : 0)
    })
  }

  if (tablero.actividad !== undefined) {
    const filas = novedades(tablero.actividad, TOPE_DE_NOVEDADES).length

    bloques.push({
      bloque: 'novedades',
      peso: PESO.panel + PESO.fila * Math.max(1, Math.min(filas, FILAS_VISIBLES))
        + (filas > FILAS_VISIBLES ? PESO.extra : 0)
    })
  }

  return bloques
}
