import { GLOSARIO } from '../../dominio/glosario.ts'
import { diasHasta } from '../../lib/fechas.ts'
import { ordenarEstados } from './resumen.ts'
import type { ResumenDeProyecto } from '../proyecto/overview.ts'
import type {
  BloqueoDelResumen,
  EspacioPortal,
  EstadoDelResumen,
  HitoProximoDelResumen
} from '../../datos/portal.ts'

/**
 * La geometria de los graficos del tablero del cliente: numeros -> posiciones.
 *
 * Vive aparte del `.tsx` por la misma razon que `estado.ts`: un grafico es una AFIRMACION dibujada,
 * y la afirmacion se prueba mientras que el `<svg>` no. Lo que se decide acá es lo que hace que un
 * grafico mienta o no: contra que escala se mide cada barra, que pasa cuando el denominador es cero,
 * y —lo mas importante— que filas NO se pueden dibujar porque les falta el dato.
 *
 * Ninguna funcion de este archivo sabe de colores ni de pixeles. Devuelven fracciones 0-1 y
 * clasificaciones; el componente decide con que tinta y en que caja.
 */

/**
 * Como va un {espacio} contra su propio plazo.
 *
 * Es la unica comparacion que de verdad contesta «¿vamos bien?». El avance solo no alcanza: 40%
 * hecho es excelente si paso el 20% del tiempo y es un problema si paso el 90%. Por eso los dos
 * numeros viajan juntos y el tercero —la diferencia— viaja calculado, que es el que se lee.
 */
export interface FilaDeSalud {
  id: number
  nombre: string
  /** Avance 0-100 que ya derivo el backend. */
  avance: number
  /**
   * Cuanto del plazo se consumio, 0-100. `null` cuando no se puede saber.
   *
   * Son DOS causas y las dos terminan igual: el {espacio} no tiene fecha de entrega, o no comparte
   * la pestaña de resumen y por eso no llego `days`. En cualquiera de las dos, la fila se dibuja con
   * su avance y sin la segunda marca: inventarle un plazo para completar el par seria dibujar un
   * dato que nadie midio.
   */
  plazoConsumido: number | null
  /**
   * Puntos de atraso: plazo consumido menos avance. `null` si no hay plazo con que comparar.
   *
   * Positivo es ir atrasado —se gasto mas tiempo del que se avanzo— y negativo es ir adelantado.
   */
  atraso: number | null
  /** Si el {espacio} ya se cerro. Un entregado no se compara contra su plazo. */
  entregado: boolean
}

/** Cuanta diferencia entre plazo y avance se tolera antes de llamarla atraso, en puntos. */
export const HOLGURA_DE_ATRASO = 10

/**
 * En que anda un {espacio} respecto de su plazo.
 *
 * `sin_plazo` es una tercera clase y no un `al_dia` disimulado: un {espacio} sin fecha de entrega no
 * esta al dia con nada, no tiene contra que estarlo. Pintarlo verde seria afirmar algo que nadie
 * midio.
 *
 * `entregado` es la cuarta por la misma razon al reves: un {espacio} cerrado no va ni atrasado ni al
 * dia, ya termino. Compararlo contra su plazo diria «100% del tiempo usado» de algo que se entrego,
 * que es la misma acusacion de atraso que la tarjeta ya aprendio a no hacer.
 */
export type ClaseDeSalud = 'atrasado' | 'al_dia' | 'sin_plazo' | 'entregado'

/**
 * Clasifica una fila de salud.
 *
 * La holgura existe porque sin ella el grafico marca en rojo a un {espacio} que va un punto por
 * debajo de su plazo, y un tablero que grita por todo se deja de mirar en una semana.
 *
 * @param fila la fila ya armada
 * @returns la clase que le toca
 */
export function claseDeSalud (fila: FilaDeSalud): ClaseDeSalud {
  if (fila.entregado) return 'entregado'
  if (fila.atraso === null) return 'sin_plazo'

  return fila.atraso > HOLGURA_DE_ATRASO ? 'atrasado' : 'al_dia'
}

/**
 * Arma las filas del grafico de salud, peor primero.
 *
 * El orden es por atraso descendente y NO alfabetico: el grafico existe para que el {espacio} con
 * problemas salte a la vista, y en una lista alfabetica hay que leerla entera para encontrarlo. Las
 * filas sin plazo van al final, juntas: no compiten por atencion porque no hay nada que comparar.
 *
 * @param espacios las filas de `GET /portal/projects`
 * @param detalles lo que devolvio `/overview` por {espacio}
 * @returns una fila por {espacio}, la mas atrasada primero
 */
export function filasDeSalud (
  espacios: readonly EspacioPortal[],
  detalles: ReadonlyMap<number, ResumenDeProyecto> = new Map()
): FilaDeSalud[] {
  const filas = espacios.map((espacio) => {
    const entregado = estaCerrado(espacio)
    const dias = detalles.get(espacio.id)?.days ?? null
    const avance = acotar(espacio.progress)
    // Un {espacio} entregado no lleva la marca del plazo: `days` se calcula contra hoy, asi que en
    // uno cerrado hace meses dice «100% del tiempo usado» de un trabajo que ya se hizo.
    const plazoConsumido = entregado || dias === null ? null : acotar(100 - dias.left_percent)

    return {
      id: espacio.id,
      nombre: espacio.name,
      avance,
      plazoConsumido,
      atraso: plazoConsumido === null ? null : plazoConsumido - avance,
      entregado
    }
  })

  return filas.sort((uno, otro) => (otro.atraso ?? -Infinity) - (uno.atraso ?? -Infinity))
}

/** Acota un porcentaje al 0-100 dibujable. La API puede mandar 103 en algo sobrecumplido. */
function acotar (valor: number): number {
  if (!Number.isFinite(valor)) return 0

  return Math.max(0, Math.min(100, valor))
}

/**
 * Un tramo de la barra apilada de {espacios} por estado.
 *
 * `fraccion` es 0-1 sobre el total y no un ancho en pixeles: el componente decide el tamaño de la
 * caja, y una geometria que ya venga en pixeles no se puede reusar en otro ancho ni probar sin
 * inventar uno.
 */
export interface TramoApilado {
  clave: string
  etiqueta: string
  total: number
  fraccion: number
}

/**
 * Reparte los {espacios} por estado en tramos de una barra apilada.
 *
 * Los estados en cero se DESCARTAN acá aunque la API los mande todos: un tramo de ancho cero no se
 * ve pero si ocupa un hueco en la leyenda, y una leyenda con cuatro entradas de las que dos no
 * existen se lee como un grafico roto. El contador de arriba ya dice cuantos {espacios} hay en
 * total, asi que no se pierde nada.
 *
 * El orden lo fija el catalogo (`order`), que es el mismo del filtro del listado: dos ordenes
 * distintos para la misma lista se leen como dos listas distintas.
 *
 * @param estados `espacios.by_status` tal como llego
 * @returns los tramos con algo que mostrar, en el orden del catalogo
 */
export function tramosPorEstado (estados: readonly EstadoDelResumen[]): TramoApilado[] {
  const total = estados.reduce((suma, estado) => suma + Math.max(0, estado.total), 0)

  if (total <= 0) return []

  return ordenarEstados(estados)
    .filter((estado) => estado.total > 0)
    .map((estado) => ({
      clave: String(estado.status),
      etiqueta: estado.name,
      total: estado.total,
      fraccion: estado.total / total
    }))
}

/**
 * Los dos tramos de {procesos} de un {espacio}: lo listo y lo que queda.
 *
 * Devuelve `null` —y no dos tramos en cero— cuando el {espacio} no comparte {procesos}: una barra
 * apilada vacia se lee como «no queda nada por hacer», que es lo contrario de «no lo sabemos».
 *
 * @param counts el bloque `counts` del {espacio}
 * @returns los dos tramos, o `null` si no hay nada que repartir
 */
export function tramosDeTareas (counts: EspacioPortal['counts']): TramoApilado[] | null {
  if (counts.tasks <= 0) return null

  const abiertas = Math.max(0, Math.min(counts.tasks, counts.tasks_open))
  const listas = counts.tasks - abiertas

  return [
    { clave: 'listas', etiqueta: 'Listas', total: listas, fraccion: listas / counts.tasks },
    { clave: 'abiertas', etiqueta: 'Abiertas', total: abiertas, fraccion: abiertas / counts.tasks }
  ]
}

/**
 * Una marca de la linea de tiempo de entregas.
 *
 * `fraccion` es 0-1 sobre la ventana dibujada, ya acotada: un {hito} vencido cae en 0 y uno mas
 * lejos que la ventana cae en 1, en vez de salirse de la caja.
 */
export interface MarcaDeEntrega {
  id: number
  nombre: string
  espacio: string
  fecha: string | null
  vencido: boolean
  /** Dias desde hoy; negativo si ya paso. `null` si la fila no trae fecha. */
  dias: number | null
  fraccion: number
}

/**
 * La ventana de la linea de tiempo y las marcas ubicadas dentro.
 *
 * `desde` y `hasta` son dias respecto de hoy —negativo es pasado— y existen para que el componente
 * pueda dibujar el eje sin recalcular nada.
 */
export interface LineaDeEntregas {
  marcas: MarcaDeEntrega[]
  desde: number
  hasta: number
}

/**
 * Ubica los {hitos} que vienen sobre una linea de tiempo.
 *
 * La ventana se calcula sobre los datos y no es fija: con todas las entregas dentro del mes, un eje
 * de un año las amontona en el borde izquierdo y no se distingue una de otra. El minimo de un dia
 * evita la division por cero cuando todas caen el mismo dia.
 *
 * Las filas sin fecha se descartan: no se pueden ubicar, y ponerlas en un extremo les inventaria
 * una posicion. El bloque que las dibuja ya dice cuantos {hitos} tiene el {espacio} en total.
 *
 * @param hitos `proximos_hitos` del resumen
 * @param hoy dia de referencia, inyectable para poder probarlo sin depender del reloj
 * @returns la ventana y las marcas; `marcas` vacio si ninguna tiene fecha
 */
export function lineaDeEntregas (
  hitos: readonly HitoProximoDelResumen[],
  hoy: Date = new Date()
): LineaDeEntregas {
  const conFecha = hitos
    .map((hito) => ({ hito, dias: diasHasta(hito.due_date, hoy) }))
    .filter((fila): fila is { hito: HitoProximoDelResumen, dias: number } => fila.dias !== null)

  if (conFecha.length === 0) return { marcas: [], desde: 0, hasta: 0 }

  const dias = conFecha.map((fila) => fila.dias)
  // Hoy entra siempre en la ventana: sin eso, con todas las entregas vencidas el eje empieza en la
  // mas vieja y el cliente no ve donde esta parado.
  const desde = Math.min(0, ...dias)
  const hasta = Math.max(0, ...dias)
  const ancho = Math.max(1, hasta - desde)

  return {
    desde,
    hasta,
    marcas: conFecha.map(({ hito, dias: cuantos }) => ({
      id: hito.id,
      nombre: hito.name,
      espacio: hito.project.name,
      fecha: hito.due_date,
      vencido: hito.vencido,
      dias: cuantos,
      fraccion: (cuantos - desde) / ancho
    }))
  }
}

/** Una barra del grafico de lo trabado: cuanto lleva detenida una {proceso}. */
export interface BarraDeTraba {
  id: number
  nombre: string
  espacio: string
  dias: number
  fraccion: number
  deTuLado: boolean
}

/**
 * Las {procesos} detenidas, de la mas vieja a la mas nueva, medidas contra la peor.
 *
 * La escala es el maximo de la propia lista y no un tope fijo: lo que el cliente necesita ver es
 * cual lleva mas detenida, no cuanto es «mucho» en abstracto.
 *
 * Las filas sin `dias_bloqueada` quedan fuera del grafico —no se pueden medir— pero NO desaparecen
 * de la pantalla: la lista de texto de abajo las sigue mostrando con su motivo. Un grafico que
 * calla una fila es peor que uno que no la puede medir.
 *
 * @param bloqueados `bloqueados` del resumen; `undefined` es la clave que no vino
 * @returns las barras medibles, la mas vieja primero
 */
export function barrasDeTrabas (
  bloqueados: readonly BloqueoDelResumen[] | null | undefined
): BarraDeTraba[] {
  if (!Array.isArray(bloqueados)) return []

  const medibles = bloqueados.filter(
    (uno) => typeof uno.dias_bloqueada === 'number' && Number.isFinite(uno.dias_bloqueada)
      && uno.dias_bloqueada >= 0
  )

  if (medibles.length === 0) return []

  // El maximo nunca baja de 1: con todas trabadas hoy, dividir por cero daria NaN y la barra
  // desapareceria justo en el caso en que todo se trabo a la vez.
  const tope = Math.max(1, ...medibles.map((uno) => uno.dias_bloqueada ?? 0))

  return medibles
    .map((uno) => ({
      id: uno.id,
      nombre: uno.name,
      espacio: uno.project.name,
      dias: uno.dias_bloqueada ?? 0,
      fraccion: (uno.dias_bloqueada ?? 0) / tope,
      deTuLado: uno.responsable === 'cliente'
    }))
    .sort((uno, otro) => otro.dias - uno.dias)
}

/** Lo que se dice cuando un grafico no tiene ni una fila que dibujar. */
export const SIN_NADA_QUE_GRAFICAR
  = `Todavía no hay suficientes datos de tus ${GLOSARIO.espacio.plural.toLowerCase()} para dibujar `
  + 'esto.'

/**
 * El grafico de salud, dicho en una frase.
 *
 * Existe porque un `<svg>` no se lee con un lector de pantalla ni se entiende en un resumen por
 * correo: el grafico va con `role="img"` y esta frase es su `aria-label`. No es un pie de foto
 * decorativo, es el MISMO dato por otro canal, que es lo que evita que la version accesible sea
 * peor que la visual.
 *
 * @param filas las filas del grafico
 * @returns la frase, o el motivo de que no haya grafico
 */
export function resumenDeSalud (filas: readonly FilaDeSalud[]): string {
  const medibles = filas.filter((fila) => fila.atraso !== null)

  if (medibles.length === 0) return SIN_NADA_QUE_GRAFICAR

  const atrasados = medibles.filter((fila) => claseDeSalud(fila) === 'atrasado')
  const espacios = GLOSARIO.espacio.plural.toLowerCase()

  if (atrasados.length === 0) {
    return `Los ${medibles.length} ${espacios} con plazo van al día respecto del tiempo consumido.`
  }

  const peor = atrasados[0]

  return `${atrasados.length} de ${medibles.length} ${espacios} con plazo van atrasados respecto del `
    + `tiempo consumido. El que más, ${peor?.nombre}: ${Math.round(peor?.avance ?? 0)}% de avance `
    + `con ${Math.round(peor?.plazoConsumido ?? 0)}% del plazo usado.`
}

/**
 * La linea de entregas, dicha en una frase.
 *
 * @param linea lo que devolvio `lineaDeEntregas()`
 * @returns la frase, o el motivo de que no haya linea
 */
export function resumenDeEntregas (linea: LineaDeEntregas): string {
  if (linea.marcas.length === 0) return SIN_NADA_QUE_GRAFICAR

  const vencidas = linea.marcas.filter((marca) => marca.vencido).length
  const hitos = GLOSARIO.hito.plural.toLowerCase()
  const proxima = linea.marcas.filter((marca) => !marca.vencido).sort((uno, otro) => uno.dias! - otro.dias!)[0]

  const cola = proxima === undefined
    ? 'No queda ninguna entrega por delante en esta ventana.'
    : `La próxima es ${proxima.nombre}, de ${proxima.espacio}, en ${proxima.dias} días.`

  return `${linea.marcas.length} ${hitos} en la ventana, ${vencidas} vencidos. ${cola}`
}

/**
 * Lo trabado, dicho en una frase.
 *
 * @param barras lo que devolvio `barrasDeTrabas()`
 * @returns la frase, o el motivo de que no haya grafico
 */
export function resumenDeTrabas (barras: readonly BarraDeTraba[]): string {
  if (barras.length === 0) return SIN_NADA_QUE_GRAFICAR

  const tuyas = barras.filter((barra) => barra.deTuLado).length
  const peor = barras[0]

  return `${barras.length} ${barras.length === 1 ? 'cosa detenida' : 'cosas detenidas'}, `
    + `${tuyas} esperando algo de tu parte. La más antigua lleva ${peor?.dias} días: `
    + `${peor?.nombre}, de ${peor?.espacio}.`
}

/**
 * El `status` de un {espacio} terminado en Perfex (`tblprojects.status`).
 *
 * Es una constante del core y NO una fila de catalogo editable: los estados de {espacio} son un enum
 * fijo —1 no iniciado, 2 en progreso, 3 en espera, 4 terminado— y lo unico que el panel deja cambiar
 * de ellos son el nombre y el color. Por eso acá se puede razonar sobre el id, cosa que con los
 * estados de {proceso} —esos si son filas de una tabla— seria un error.
 *
 * Existe porque `date_finished` NO alcanza, y eso se vio en pantalla: llega en `null` tambien en los
 * {espacios} marcados como terminados, porque el panel viejo no siempre la escribe. Sin esta
 * constante, un {espacio} entregado con la fecha de compromiso ya pasada salia con «Entrega
 * vencida» en rojo, que es acusar de atraso a un trabajo que ya se entrego.
 */
const ESTADO_TERMINADO = 4

/** La fecha de cierre, o `null` si la fila no la trae. Perfex guarda cadenas vacias. */
function fechaDeCierre (espacio: EspacioPortal): string | null {
  const cierre = espacio.date_finished

  return typeof cierre === 'string' && cierre.trim() !== '' ? cierre : null
}

/**
 * Si un {espacio} ya esta cerrado.
 *
 * Dos señales y no una, porque ninguna de las dos sola alcanza: la fecha de cierre PRUEBA que se
 * cerro pero falta en filas viejas, y el estado terminado esta siempre pero no dice cuando. Con
 * cualquiera de las dos, el {espacio} deja de estar en curso y sus fechas dejan de acusar atraso.
 */
function estaCerrado (espacio: EspacioPortal): boolean {
  return fechaDeCierre(espacio) !== null || espacio.status === ESTADO_TERMINADO
}
