import { GLOSARIO } from '../../dominio/glosario.ts'
import { esMesDeGestion } from '../../dominio/gestion.ts'
import type {
  CambiosGestion,
  MotivosDeRetrabajo,
  PuntoDeTendencia
} from '@/datos/portal'

/**
 * Cómo se leen los tres bloques que el tablero de gestión acaba de estrenar.
 *
 * Vive aparte de los componentes por lo mismo que `componentes/portal/resumen.ts`: esto no es
 * maquetado, son las decisiones de qué significa cada número, y una decisión así se prueba
 * (`pruebas/gestion-lectura.test.js`). Las tres que toma este archivo son las tres que, mal
 * tomadas, hacen que el primer informe mensual mienta:
 *
 *   1. **Un `null` de la serie no es un 0.** `porcentaje_en_plazo`, `rondas_promedio` y
 *      `deuda_dias` llegan en `null` cuando no hubo denominador. Un gráfico que los dibuje en cero
 *      traza una caída a fondo que nunca ocurrió; acá el mes sin dato queda como un HUECO, la línea
 *      se corta y el mes se nombra debajo.
 *   2. **El mes en curso no se compara.** Viene `parcial: true` porque se cortó en AHORA: son los
 *      días transcurridos contra meses de treinta. No se extrapola —sería inventar trabajo— y no se
 *      esconde: se marca y se explica.
 *   3. **Sin auditoría no hay ceros.** Los cambios de compromiso y el desglose de retrabajo pueden
 *      llegar enteros en `null` porque la instalación no tiene la migración. Eso es «no lo
 *      registramos», y dibujar ceros ahí publica un mes impecable que nadie midió.
 */

/** Un mes de la serie, ya ordenado y rotulado para el eje. */
export interface MesDeTendencia {
  /** `YYYY-MM`. */
  mes: string
  /** El rótulo corto del eje: «sept 26». */
  rotulo: string
  /** `true` en el mes en curso, cortado en AHORA. No se puede comparar contra meses completos. */
  parcial: boolean
  recibidas: number
  cerradas: number
  porcentaje_en_plazo: number | null
  rondas_promedio: number | null
  deuda_dias: number | null
}

/**
 * Las dos lecturas posibles de la serie.
 *
 * `sin_serie` no es un error: una instalación cuyo backend todavía no emite el bloque, o un cliente
 * cuyo primer mes es éste, no tienen serie que mostrar. La pantalla lo dice en una frase en vez de
 * dibujar seis meses en cero, que se leerían como medio año sin trabajo.
 */
export type LecturaDeTendencia =
  | { clase: 'sin_serie' }
  | {
    clase: 'serie'
    /** Del mes más viejo al pedido. El orden lo garantiza esta función, no el transporte. */
    meses: MesDeTendencia[]
    /** El tope del eje de volumen: la barra más alta de las dos series. Nunca 0. */
    maximoVolumen: number
    /** Los rótulos de los meses cortados en AHORA. Vacío casi siempre: a lo sumo hay uno. */
    parciales: string[]
  }

/**
 * Normaliza un número que puede no venir.
 *
 * Un `null`, un `undefined` y un `NaN` terminan todos en `null` y NUNCA en 0: es la regla que
 * gobierna el archivo entero, y el lugar donde se rompería es acá, convirtiendo en silencio.
 *
 * @param valor lo que trajo la API
 * @returns el número, o `null` si no hay un número utilizable
 */
function numeroONulo (valor: unknown): number | null {
  return typeof valor === 'number' && Number.isFinite(valor) ? valor : null
}

/** Un conteo siempre es un número: un conteo ausente sí es 0, porque se contó y no había nada. */
function conteo (valor: unknown): number {
  const numero = numeroONulo(valor)

  return numero === null ? 0 : Math.max(0, Math.trunc(numero))
}

/**
 * Nombre corto de un mes para el eje: «sept 26».
 *
 * En UTC y contra el día 1, igual que `rotularMes()`: `YYYY-MM` no tiene hora ni huso, y pasarlo
 * por el reloj local lo corre al mes anterior en cualquier zona al oeste de Greenwich.
 *
 * @param mes el mes, `YYYY-MM`
 * @returns el rótulo corto, o el texto crudo si no tiene la forma esperada
 */
export function rotularMesCorto (mes: string): string {
  if (!esMesDeGestion(mes)) return mes

  const [anio, numero] = mes.split('-').map(Number)

  if (anio === undefined || numero === undefined) return mes

  const nombre = new Intl.DateTimeFormat('es-AR', { month: 'short', timeZone: 'UTC' })
    .format(new Date(Date.UTC(anio, numero - 1, 1)))
    .replace('.', '')

  return `${nombre} ${String(anio).padStart(4, '0').slice(-2)}`
}

/**
 * Ordena y normaliza la serie de seis meses.
 *
 * El orden se impone acá aunque la API ya lo mande ordenado, y no es desconfianza: el eje del
 * gráfico ES el orden, así que una serie invertida no se ve rota, se ve como una tendencia al
 * revés. Que el orden lo garantice una función probada cuesta una línea.
 *
 * Los meses mal formados se descartan en vez de dibujarse: un punto cuyo lugar en el eje no se
 * puede calcular no tiene dónde ir.
 *
 * @param puntos el bloque `tendencia` tal como llega de la API
 * @returns la serie lista para dibujar, o `sin_serie` si no quedó ningún mes utilizable
 */
export function leerTendencia (puntos: PuntoDeTendencia[] | null | undefined): LecturaDeTendencia {
  if (!Array.isArray(puntos) || puntos.length === 0) return { clase: 'sin_serie' }

  const meses: MesDeTendencia[] = puntos
    .filter((punto) => punto !== null && punto !== undefined && esMesDeGestion(punto.mes))
    .map((punto) => ({
      mes: punto.mes,
      rotulo: rotularMesCorto(punto.mes),
      parcial: punto.parcial === true,
      recibidas: conteo(punto.recibidas),
      cerradas: conteo(punto.cerradas),
      porcentaje_en_plazo: numeroONulo(punto.porcentaje_en_plazo),
      rondas_promedio: numeroONulo(punto.rondas_promedio),
      deuda_dias: numeroONulo(punto.deuda_dias)
    }))
    .sort((uno, otro) => uno.mes.localeCompare(otro.mes))

  if (meses.length === 0) return { clase: 'sin_serie' }

  const maximoVolumen = meses.reduce(
    (tope, mes) => Math.max(tope, mes.recibidas, mes.cerradas),
    0
  )

  return {
    clase: 'serie',
    meses,
    // Nunca 0: es un divisor. Un mes sin nada recibido ni cerrado dibuja barras de alto cero contra
    // un eje de 1, que es lo correcto; dividir por 0 dibuja `NaN%` en el atributo de estilo.
    maximoVolumen: Math.max(1, maximoVolumen),
    parciales: meses.filter((mes) => mes.parcial).map((mes) => mes.rotulo)
  }
}

/** Los tres indicadores de la serie que pueden no tener dato. Los volúmenes no están: siempre son. */
export type ClaveDeIndicador = 'porcentaje_en_plazo' | 'rondas_promedio' | 'deuda_dias'

/** Un mes dentro de un indicador: su lugar en el eje y su valor, que puede faltar. */
export interface PuntoDeIndicador {
  mes: string
  rotulo: string
  parcial: boolean
  /** `null` es un HUECO en la línea, jamás un 0. */
  valor: number | null
}

/** Un indicador de la serie, listo para dibujar. */
export interface SerieDeIndicador {
  clave: ClaveDeIndicador
  puntos: PuntoDeIndicador[]
  /** Tope del eje. Nunca 0: se usa como divisor. */
  maximo: number
  /** Cuántos meses tienen valor. Con 0 no hay línea que dibujar. */
  conDato: number
  /** Los rótulos de los meses sin dato, para nombrarlos debajo en vez de dibujarlos en cero. */
  sinDato: string[]
  /** El último mes con valor: es el único punto que se rotula directamente. `null` si no hay. */
  ultimo: { rotulo: string, valor: number, parcial: boolean } | null
}

/**
 * Arma un indicador de la serie con su escala.
 *
 * El `techo` se pasa desde afuera porque un porcentaje tiene un tope natural —100— y los días y las
 * rondas no: escalar un porcentaje contra su propio máximo haría que un mes de 12% llenara la
 * caja, y el gráfico diría «excelente» con el peor número del semestre.
 *
 * @param meses la serie ya leída por {@link leerTendencia}
 * @param clave qué indicador se extrae
 * @param techo el tope fijo del eje, si el indicador tiene uno
 * @returns el indicador con sus huecos declarados
 */
export function serieDeIndicador (
  meses: MesDeTendencia[],
  clave: ClaveDeIndicador,
  techo?: number
): SerieDeIndicador {
  const puntos: PuntoDeIndicador[] = meses.map((mes) => ({
    mes: mes.mes,
    rotulo: mes.rotulo,
    parcial: mes.parcial,
    valor: mes[clave]
  }))

  const conValor = puntos.filter((punto) => punto.valor !== null)
  const mayor = conValor.reduce((tope, punto) => Math.max(tope, punto.valor ?? 0), 0)
  const ultimo = conValor.at(-1) ?? null

  return {
    clave,
    puntos,
    maximo: techo ?? Math.max(1, mayor),
    conDato: conValor.length,
    sinDato: puntos.filter((punto) => punto.valor === null).map((punto) => punto.rotulo),
    ultimo: ultimo === null || ultimo.valor === null
      ? null
      : { rotulo: ultimo.rotulo, valor: ultimo.valor, parcial: ultimo.parcial }
  }
}

/** Un tramo de la línea, en porcentaje del área de dibujo. El `y` ya viene medido desde abajo. */
export interface TramoDeIndicador {
  x1: number
  y1: number
  x2: number
  y2: number
  /** `true` si alguno de los dos extremos es el mes cortado: el tramo se dibuja punteado. */
  parcial: boolean
}

/** Dónde cae un mes en el eje horizontal, en porcentaje. */
function posicionDe (indice: number, total: number): number {
  return total <= 1 ? 50 : (indice / (total - 1)) * 100
}

/** A qué altura queda un valor, en porcentaje y medido desde abajo. */
function alturaDe (valor: number, maximo: number): number {
  return Math.min(100, Math.max(0, (valor / maximo) * 100))
}

/**
 * Los tramos de la línea, saltando los meses sin dato.
 *
 * SÓLO se unen meses ADYACENTES que los dos tengan valor. Unir por encima de un hueco dibujaría una
 * línea que atraviesa el mes que no se midió, y esa línea afirma un valor intermedio que nadie
 * calculó. Es la misma razón por la que el hueco no se rellena con cero.
 *
 * @param serie el indicador ya armado
 * @returns los tramos, en porcentaje del área de dibujo
 */
export function tramosDeIndicador (serie: SerieDeIndicador): TramoDeIndicador[] {
  const total = serie.puntos.length
  const tramos: TramoDeIndicador[] = []

  for (let indice = 1; indice < total; indice++) {
    const previo = serie.puntos[indice - 1]
    const actual = serie.puntos[indice]

    if (previo?.valor === null || previo?.valor === undefined) continue
    if (actual?.valor === null || actual?.valor === undefined) continue

    tramos.push({
      x1: posicionDe(indice - 1, total),
      y1: alturaDe(previo.valor, serie.maximo),
      x2: posicionDe(indice, total),
      y2: alturaDe(actual.valor, serie.maximo),
      parcial: previo.parcial || actual.parcial
    })
  }

  return tramos
}

/** Una marca sobre la línea: el mes que sí tiene valor. */
export interface MarcaDeIndicador extends PuntoDeIndicador {
  valor: number
  x: number
  y: number
}

/**
 * Las marcas de los meses con valor. Los meses sin dato no tienen marca: ése es el hueco.
 *
 * @param serie el indicador ya armado
 * @returns una marca por mes medido, con su posición en porcentaje
 */
export function marcasDeIndicador (serie: SerieDeIndicador): MarcaDeIndicador[] {
  const total = serie.puntos.length

  return serie.puntos.flatMap((punto, indice) => (
    punto.valor === null
      ? []
      : [{
          ...punto,
          valor: punto.valor,
          x: posicionDe(indice, total),
          y: alturaDe(punto.valor, serie.maximo)
        }]
  ))
}

/** Qué alto tiene una barra de volumen, en porcentaje del área. */
export function altoDeBarra (valor: number, maximo: number): number {
  return alturaDe(valor, Math.max(1, maximo))
}

/** Por qué no hay serie que dibujar. Ni una cifra: explicar la ausencia no es publicar un cero. */
export const MOTIVO_SIN_SERIE
  = 'Todavía no tenemos meses anteriores con los que comparar este mes. La serie se arma sola a '
  + 'medida que pasan los meses.'

/**
 * Qué dice la pantalla del mes cortado.
 *
 * Es un aviso y no una nota al pie: sin esta frase, el último punto de la serie se lee como una
 * caída y no como un mes que todavía no terminó.
 *
 * @param parciales los rótulos de los meses cortados, tal como los devolvió {@link leerTendencia}
 * @returns la advertencia, o `null` si los seis meses están completos
 */
export function avisoDeMesParcial (parciales: string[]): string | null {
  if (parciales.length === 0) return null

  return `${parciales.join(' y ')} es el mes en curso: está medido hasta hoy, así que tiene menos `
    + 'días que los meses completos y no se puede comparar con ellos de igual a igual. No lo '
    + 'proyectamos a fin de mes: sería inventar trabajo que todavía no ocurrió.'
}

/** Un campo del compromiso que se movió, con sus dos números. */
export interface FilaDeCambio {
  clave: 'reprogramaciones' | 'cambios_de_prioridad' | 'cambios_de_hito'
  rotulo: string
  /** Los movimientos registrados en el mes. */
  cambios: number
  /** Cuántos {procesos} distintos se movieron. */
  procesos: number
}

/**
 * Las dos lecturas del bloque de cambios de compromiso.
 *
 * `sin_registro` es la instalación sin la migración: NO es un mes sin cambios. Con la tabla
 * presente y sin filas sí hay ceros, y son ceros medidos.
 */
export type LecturaDeCambios =
  | { clase: 'sin_registro' }
  | { clase: 'medido', filas: FilaDeCambio[], totalCambios: number }

/** Cómo se nombra cada campo del compromiso. `hito` sale del glosario: el renombre es de una línea. */
const CAMPOS_DEL_COMPROMISO: FilaDeCambio[] = [
  { clave: 'reprogramaciones', rotulo: 'Reprogramaciones', cambios: 0, procesos: 0 },
  { clave: 'cambios_de_prioridad', rotulo: 'Cambios de prioridad', cambios: 0, procesos: 0 },
  { clave: 'cambios_de_hito', rotulo: `Cambios de ${GLOSARIO.hito.singular}`, cambios: 0, procesos: 0 }
]

/**
 * Decide si el bloque de cambios de compromiso tiene números o no tiene dato.
 *
 * Los tres campos viajan juntos: o los tres son medidos o los tres son `null`, porque lo que falta
 * es la tabla entera. Se contemplan igual los tres por separado —y se descarta el bloque sólo
 * cuando NINGUNO llegó— para que una versión posterior del backend que emita dos de tres no deje la
 * pantalla vacía.
 *
 * @param cambios el bloque `cambios` tal como llega de la API
 * @returns las tres filas, o `sin_registro` cuando no hay ninguna que mostrar
 */
export function leerCambiosDeCompromiso (
  cambios: CambiosGestion | null | undefined
): LecturaDeCambios {
  if (cambios === null || cambios === undefined) return { clase: 'sin_registro' }

  const filas = CAMPOS_DEL_COMPROMISO.flatMap((campo) => {
    const valor = cambios[campo.clave]

    if (valor === null || valor === undefined) return []

    return [{ ...campo, cambios: conteo(valor.cambios), procesos: conteo(valor.procesos) }]
  })

  if (filas.length === 0) return { clase: 'sin_registro' }

  return {
    clase: 'medido',
    filas,
    // Sólo se suman los movimientos. Un total de `procesos` NO se puede sumar entre campos: un
    // {proceso} al que se le movió la fecha Y la prioridad contaría dos veces.
    totalCambios: filas.reduce((suma, fila) => suma + fila.cambios, 0)
  }
}

/** Por qué esta instalación no puede decir cuánto se movió lo acordado. */
export const MOTIVO_SIN_AUDITORIA
  = 'Esta instalación todavía no guarda los movimientos de fecha, prioridad e '
  + `${GLOSARIO.hito.singular}, así que no tenemos de dónde contarlos. No es que nada se haya `
  + 'movido: es que no lo registrábamos.'

/**
 * La advertencia que SIEMPRE acompaña a los cambios de compromiso.
 *
 * Sin esta frase el primer informe mensual miente. La auditoría empieza a registrar el día que se
 * desplegó y no hay backfill posible —el valor anterior de una fecha no quedó guardado en ningún
 * lado—, así que los meses previos muestran cero movimientos. Ese cero es el de una tabla que
 * todavía no escribía, no el de un mes tranquilo.
 */
export const AVISO_SIN_HISTORIA
  = 'Empezamos a registrar estos movimientos el día que encendimos la auditoría, y lo anterior no '
  + 'se puede recuperar: el valor que tenía una fecha antes de moverse no quedó guardado en ningún '
  + 'lado. Por eso los meses previos aparecen sin movimientos, y eso no quiere decir que no los '
  + 'hubo: quiere decir que todavía no los mirábamos. La serie se lee hacia adelante.'

/** Una categoría del desglose de retrabajo. */
export interface FilaDeMotivo {
  clave: 'error_evitable' | 'ajuste_de_contenido' | 'cambio_de_alcance'
  rotulo: string
  /** Qué significa la categoría, escrito para el cliente. */
  detalle: string
  total: number
  /** Sobre el total de iteraciones del mes, incluidas las sin clasificar. */
  porcentaje: number
}

/**
 * Las tres lecturas del desglose de retrabajo.
 *
 * `sin_registro` y `sin_retrabajo` son distintas y ésa es toda la gracia: la primera es «no lo
 * medimos» y la segunda es «lo medimos y no hubo». Colapsarlas publica un mes impecable que nadie
 * midió.
 */
export type LecturaDeRetrabajo =
  | { clase: 'sin_registro' }
  | { clase: 'sin_retrabajo' }
  | {
    clase: 'desglose'
    filas: FilaDeMotivo[]
    /** Iteraciones sin categoría. No es una cuarta categoría: es lo que falta clasificar. */
    sinMotivo: number
    total: number
    /** `true` si las tres categorías más las sin clasificar suman el total declarado. */
    cuadra: boolean
  }

/** Cómo se nombra cada categoría del catálogo de motivos (migración 0680). */
const CATEGORIAS_DE_MOTIVO: Array<Pick<FilaDeMotivo, 'clave' | 'rotulo' | 'detalle'>> = [
  {
    clave: 'error_evitable',
    rotulo: 'Error evitable',
    detalle: 'Lo rehicimos porque nos equivocamos'
  },
  {
    clave: 'ajuste_de_contenido',
    rotulo: 'Ajuste de contenido',
    detalle: 'Estaba bien hecho y se pidió otra versión'
  },
  {
    clave: 'cambio_de_alcance',
    rotulo: 'Cambio de alcance',
    detalle: 'Apareció trabajo que no estaba pedido'
  }
]

/**
 * Parte el retrabajo del mes en sus tres categorías.
 *
 * El porcentaje se calcula sobre el TOTAL declarado por la API y no sobre la suma de las tres
 * categorías: si hay iteraciones sin clasificar, repartir el 100% entre las tres haría que una
 * categoría con 4 de 40 iteraciones apareciera como el 40% del retrabajo del mes.
 *
 * @param motivos el bloque `calidad.motivos` tal como llega de la API
 * @returns el desglose, o por qué no lo hay
 */
export function leerMotivosDeRetrabajo (
  motivos: MotivosDeRetrabajo | null | undefined
): LecturaDeRetrabajo {
  if (motivos === null || motivos === undefined) return { clase: 'sin_registro' }

  const total = conteo(motivos.total)
  const sinMotivo = conteo(motivos.sin_motivo)

  if (total === 0) return { clase: 'sin_retrabajo' }

  const filas: FilaDeMotivo[] = CATEGORIAS_DE_MOTIVO.map((categoria) => {
    const cuantas = conteo(motivos[categoria.clave])

    return { ...categoria, total: cuantas, porcentaje: Math.round((cuantas / total) * 100) }
  })

  const clasificadas = filas.reduce((suma, fila) => suma + fila.total, 0)

  return {
    clase: 'desglose',
    filas,
    sinMotivo,
    total,
    cuadra: clasificadas + sinMotivo === total
  }
}

/** Por qué no hay desglose del retrabajo. Cuatro ceros dirían «no rehicimos nada», que no se sabe. */
export const MOTIVO_SIN_MOTIVOS
  = 'Todavía no clasificamos por qué se rehace el trabajo, así que este mes no tiene desglose. No '
  + 'es que no hubo retrabajo: es que no lo registramos.'
