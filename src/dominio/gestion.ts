import { ZONA_NEGOCIO } from '../lib/fechas.ts'
import type {
  AbiertasAlCierre,
  MedicionPorEtapa,
  ResponsableDeTraba,
  ResumenEstadistico,
  TrabaGestion,
  TramoDeAntiguedad
} from '@/datos/portal'

/**
 * La lógica del tablero de control de gestión mensual del cliente.
 *
 * Vive acá y no dentro de los componentes por la misma razón que el resto del dominio: son las
 * decisiones que hacen que el tablero diga la verdad, y una decisión así se prueba.
 *
 * Las tres reglas que gobiernan este archivo, y que son el punto de la pantalla entera:
 *
 *   1. `null` NUNCA es 0. La API devuelve `null` cuando el denominador estaba vacío —un mes sin
 *      aprobaciones resueltas, un mes sin nada comprometido—. Convertirlo en 0 publica «cumplimos
 *      todo» o «no cumplimos nada» según el signo, y las dos son mentira. Acá `null` sale como el
 *      guion largo o como una frase, nunca como un número.
 *   2. Una mediana con `n` chico miente. Cada bloque de tiempos trae su `n` justamente para que la
 *      pantalla pueda decidir no dibujar la mediana: `leerMediana()` es esa decisión, tomada una
 *      sola vez y probada.
 *   3. Un bloque sin dato se EXPLICA, no se esconde ni se rellena. Con
 *      `medicion_por_etapa = "sin_datos"` —que es el valor de hoy en producción— el bloque de
 *      etapas se dibuja con su motivo, no con cuatro ceros.
 */

/** Lo que se muestra donde no hay número. El mismo guion largo del resto del producto. */
export const SIN_DATO = '—'

/**
 * Cuántas {procesos} hacen falta para que una mediana sea una mediana.
 *
 * Tres es el piso, no el ideal: con dos valores la «mediana» es el promedio de los dos y con uno es
 * ese valor. Proyectar cualquiera de esas dos en una reunión mensual como «la mediana del mes» es
 * presentar una anécdota con cara de estadística.
 */
export const N_MINIMO_MEDIANA = 3

/**
 * Meses hacia atrás que la API acepta (`RecursoGestion::MESES_ATRAS`).
 *
 * Se repite acá porque el selector no puede ofrecer un mes que la API va a rechazar con 422: la
 * alternativa era descubrir el tope probando, que es un error en pantalla por cada intento.
 */
export const MESES_ATRAS = 24

/** La forma exacta que exige la API. Cualquier otra cosa es un 422. */
const FORMA_DEL_MES = /^\d{4}-(0[1-9]|1[0-2])$/

/** True si el texto tiene la forma `YYYY-MM` con un mes real. */
export function esMesDeGestion (mes: string | null | undefined): mes is string {
  return typeof mes === 'string' && FORMA_DEL_MES.test(mes)
}

/**
 * El mes en curso, en la zona del negocio.
 *
 * No se usa el reloj local del servidor a propósito, y no es una precaución teórica: el backend
 * corre en Santiago y el contenedor en UTC, así que entre las 20:00 y la medianoche el «mes en
 * curso» calculado en UTC ya es el siguiente. En un tablero mensual eso no corre un día, corre el
 * mes entero: el 31 a las 21:00 el tablero aparecería vacío.
 *
 * @param ahora instante de referencia, inyectable para probar
 * @returns el mes como `YYYY-MM`
 */
export function mesEnCurso (ahora: Date = new Date()): string {
  const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone: ZONA_NEGOCIO,
    year: 'numeric',
    month: '2-digit'
  }).formatToParts(ahora)

  const anio = partes.find((p) => p.type === 'year')?.value ?? '0000'
  const mes = partes.find((p) => p.type === 'month')?.value ?? '01'

  return `${anio}-${mes}`
}

/**
 * Corre un mes `YYYY-MM` hacia atrás o hacia adelante.
 *
 * La cuenta se hace en meses enteros y no con `Date`: sumarle 30 días a un mes de 31 aterriza en el
 * mes equivocado, y hacerlo con `setMonth` sobre un día 31 salta de enero a marzo.
 *
 * @param mes mes de partida, `YYYY-MM`
 * @param desplazamiento meses a sumar; negativo para ir hacia atrás
 * @returns el mes resultante, `YYYY-MM`
 */
export function desplazarMes (mes: string, desplazamiento: number): string {
  const [anio, numero] = mes.split('-').map(Number)

  if (anio === undefined || numero === undefined) return mes

  const total = anio * 12 + (numero - 1) + desplazamiento
  const anioFinal = Math.floor(total / 12)
  const mesFinal = total - anioFinal * 12 + 1

  return `${String(anioFinal).padStart(4, '0')}-${String(mesFinal).padStart(2, '0')}`
}

/**
 * Los meses que el selector puede ofrecer, del más nuevo al más viejo.
 *
 * El futuro no entra: un mes que todavía no pasó no es «todavía no hay datos», es un pedido
 * imposible, y un tablero en cero para el mes que viene se leería como un mes sin trabajo.
 *
 * @param actual el mes en curso, `YYYY-MM`
 * @param atras cuántos meses hacia atrás se ofrecen además del actual
 * @returns la lista de meses, el actual primero
 */
export function mesesOfrecidos (actual: string, atras: number = MESES_ATRAS): string[] {
  if (!esMesDeGestion(actual)) return []

  return Array.from({ length: atras + 1 }, (_, i) => desplazarMes(actual, -i))
}

/**
 * El mes que hay que pedirle a la API a partir de lo que vino en la URL.
 *
 * Un `?mes=` ausente es el mes en curso, que es lo que la API hace por su cuenta. Uno mal formado o
 * fuera del tope se deja pasar TAL CUAL para que la API conteste su 422: corregirlo en silencio
 * mostraría un mes distinto del que dice la barra de direcciones, y ese enlace se comparte.
 *
 * @param pedido el valor crudo de `?mes=`
 * @param actual el mes en curso
 * @returns el mes a pedir, y si está dentro de lo que la API acepta
 */
export function resolverMesPedido (
  pedido: string | null | undefined,
  actual: string = mesEnCurso()
): { mes: string, aceptable: boolean } {
  if (pedido === null || pedido === undefined || pedido === '') {
    return { mes: actual, aceptable: true }
  }

  return { mes: pedido, aceptable: mesesOfrecidos(actual).includes(pedido) }
}

/**
 * Nombre legible de un mes: «Septiembre 2026».
 *
 * Se arma en UTC contra el día 1 porque `YYYY-MM` no tiene hora ni huso: pasarlo por el reloj local
 * lo correría al mes anterior en cualquier zona al oeste de Greenwich.
 *
 * @param mes el mes, `YYYY-MM`
 * @returns el nombre con la inicial en mayúscula, o el texto crudo si no tiene la forma esperada
 */
export function rotularMes (mes: string): string {
  if (!esMesDeGestion(mes)) return mes

  const [anio, numero] = mes.split('-').map(Number)

  if (anio === undefined || numero === undefined) return mes

  const nombre = new Intl.DateTimeFormat('es-AR', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC'
  }).format(new Date(Date.UTC(anio, numero - 1, 1)))
    .replace(' de ', ' ')

  return nombre.charAt(0).toUpperCase() + nombre.slice(1)
}

/**
 * Qué se puede decir de una mediana, mirando su `n`.
 *
 * Son tres casos y no dos porque «no hubo ninguna» y «hubo dos» son cosas distintas: la primera es
 * un mes sin ese trabajo, la segunda es un mes con poquísimo. Colapsarlas en «sin datos» escondería
 * dos {procesos} reales que el cliente quizás quiere mirar una por una.
 */
export type LecturaDeMediana =
  | { clase: 'sinDatos' }
  | { clase: 'muestraChica', n: number }
  | { clase: 'mediana', n: number, mediana: number, p90: number | null }

/**
 * Decide si una mediana se dibuja.
 *
 * @param resumen el bloque `{ n, mediana, p90 }` tal como llega de la API
 * @returns `sinDatos` si el mes no tuvo ninguna, `muestraChica` si tuvo menos de
 *   {@link N_MINIMO_MEDIANA}, y la mediana sólo cuando el `n` la sostiene
 */
export function leerMediana (resumen: ResumenEstadistico | null | undefined): LecturaDeMediana {
  if (resumen === null || resumen === undefined || resumen.n <= 0) return { clase: 'sinDatos' }

  if (resumen.n < N_MINIMO_MEDIANA) return { clase: 'muestraChica', n: resumen.n }

  // `n` suficiente pero mediana ausente no debería pasar; si pasa, manda el `null`: inventar el
  // número es exactamente lo que este archivo existe para no hacer.
  if (resumen.mediana === null) return { clase: 'sinDatos' }

  return { clase: 'mediana', n: resumen.n, mediana: resumen.mediana, p90: resumen.p90 }
}

/**
 * Frase que explica por qué no hay mediana.
 *
 * Nunca es un cero ni un guion suelto: la pantalla se proyecta en una reunión y alguien va a
 * preguntar qué significa. La respuesta va escrita.
 *
 * @param lectura lo que devolvió {@link leerMediana}
 * @param que qué se estaba midiendo, en plural y en minúscula. Ej: `aprobaciones resueltas`
 * @returns la frase, o `null` si la mediana sí se dibuja
 */
export function motivoSinMediana (lectura: LecturaDeMediana, que: string): string | null {
  if (lectura.clase === 'sinDatos') return `Este mes no hubo ${que}: todavía no hay datos.`

  if (lectura.clase === 'muestraChica') {
    return lectura.n === 1
      ? 'Hubo 1 sola: muy poco para una mediana, así que mostramos el conteo.'
      : `Hubo ${lectura.n}: muy pocas para una mediana, así que mostramos el conteo.`
  }

  return null
}

/**
 * Formatea una cantidad de días que puede no venir.
 *
 * @param valor los días, o `null` si no hubo con qué calcularlos
 * @returns los días con su unidad, o el guion largo. Nunca «0 días» por un `null`
 */
export function formatearDias (valor: number | null | undefined): string {
  if (typeof valor !== 'number' || !Number.isFinite(valor)) return SIN_DATO

  const numero = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 1 }).format(valor)

  return `${numero} ${valor === 1 ? 'día' : 'días'}`
}

/**
 * Formatea un porcentaje que puede no venir.
 *
 * @param valor el porcentaje entero, o `null` si el denominador estaba vacío
 * @returns el porcentaje con su signo, o el guion largo
 */
export function formatearPorcentaje (valor: number | null | undefined): string {
  if (typeof valor !== 'number' || !Number.isFinite(valor)) return SIN_DATO

  return `${new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 }).format(valor)}%`
}

/** Cómo se pinta una cifra. `neutro` es también el tono de lo que no se sabe. */
export type TonoDeCifra = 'exito' | 'aviso' | 'peligro' | 'neutro'

/** Hacia dónde es bueno que se mueva un porcentaje. */
export type SentidoDelPorcentaje = 'mas_es_mejor' | 'menos_es_mejor'

/** Umbrales del semáforo, en puntos de porcentaje. */
const BIEN = 85
const ATENCION = 60

/**
 * El tono de un porcentaje.
 *
 * Un `null` es SIEMPRE neutro y nunca rojo: no saber no es una mala noticia, y pintar de rojo un
 * mes sin denominador acusa al equipo —o al cliente— de algo que no pasó.
 *
 * @param valor el porcentaje, o `null`
 * @param sentido si subir es mejorar o empeorar
 * @returns el tono, `neutro` cuando no hay dato
 */
export function tonoDePorcentaje (
  valor: number | null | undefined,
  sentido: SentidoDelPorcentaje = 'mas_es_mejor'
): TonoDeCifra {
  if (typeof valor !== 'number' || !Number.isFinite(valor)) return 'neutro'

  const escala = sentido === 'mas_es_mejor' ? valor : 100 - valor

  if (escala >= BIEN) return 'exito'
  if (escala >= ATENCION) return 'aviso'

  return 'peligro'
}

/**
 * Los rótulos de los cuatro cubos de estado.
 *
 * Son los de `Recursos\EtapasDeProceso::CUBOS` y tienen que seguir siéndolo: el mismo cubo con dos
 * nombres según la pantalla es como el tablero termina diciendo una cosa y la ficha otra.
 */
export const ROTULOS_DE_CUBO: Record<string, string> = {
  produccion: 'Producción',
  revision_interna: 'Revisión interna',
  revision_vp: 'Revisión VP',
  terminado: 'Completo'
}

/** Los cuatro cubos leídos, más lo que falta para que cierren. */
export interface LecturaDeCubos {
  /** `true` si el estado al cierre se dedujo del `status` de hoy en vez de leerse del histórico. */
  estimado: boolean
  cubos: Array<{ clave: string, rotulo: string, total: number }>
  /** Ortogonal a los cubos: una {proceso} bloqueada ya se contó en el suyo. */
  bloqueadas: number
  suma: number
  total: number
  /**
   * Las que quedaron sin cubo. Sólo puede pasar con `estimado`, y es correcto que pase: de una
   * {proceso} que hoy dice Completo pero al cierre seguía abierta se sabe que el cubo es falso, no
   * cuál era el verdadero.
   */
  sin_clasificar: number
  /** `true` si los cuatro cubos suman el total y se pueden presentar como una partición. */
  cuadra: boolean
}

/**
 * Lee el bloque de cubos sin dejar que la pantalla los presente como algo que no son.
 *
 * @param bloque `abiertas_al_cierre` tal como llega de la API
 * @param total el total de abiertas al cierre, que viene en `volumen`
 * @returns los cubos con su rótulo, la suma, lo que quedó afuera y si cuadra
 */
export function leerCubos (bloque: AbiertasAlCierre, total: number): LecturaDeCubos {
  const claves = ['produccion', 'revision_interna', 'revision_vp', 'terminado'] as const

  const cubos = claves.map((clave) => ({
    clave,
    rotulo: ROTULOS_DE_CUBO[clave] ?? clave,
    total: bloque[clave]
  }))

  const suma = cubos.reduce((acumulado, cubo) => acumulado + cubo.total, 0)

  return {
    estimado: bloque.estado_al_cierre === 'estimado',
    cubos,
    bloqueadas: bloque.bloqueadas,
    suma,
    total,
    sin_clasificar: Math.max(0, total - suma),
    cuadra: suma === total
  }
}

/**
 * Por qué el bloque de etapas no se dibuja.
 *
 * Con `sin_datos` el histórico de transiciones está vacío y no hay días por etapa que mostrar. La
 * pantalla dice esto y no cuatro ceros, que se leerían «el equipo no tarda nada en ninguna etapa».
 *
 * @param medicion el valor de `alcance.medicion_por_etapa` o de `etapas.medicion`
 * @returns la explicación, o `null` si los días por etapa son un dato medido
 */
export function motivoSinEtapas (medicion: MedicionPorEtapa): string | null {
  return medicion === 'medida'
    ? null
    : 'El historial de cambios de estado recién empieza a guardarse, así que este mes no tiene con '
      + 'qué calcularse. Los días por etapa no son cero: todavía no los medimos.'
}

/**
 * La advertencia de unidades del bloque de etapas.
 *
 * `compromiso_dias` está en días HÁBILES y los cubos en días CORRIDOS. Restarlos sin decirlo produce
 * una diferencia inventada de dos días por cada semana que dure el ciclo.
 *
 * @param habiles el `compromiso_dias_habiles` de la API
 * @returns la advertencia, o `null` si no hay dos unidades que confundir
 */
export function advertenciaDeUnidades (habiles: boolean): string | null {
  return habiles
    ? 'El tiempo acordado está en días hábiles y los tiempos medidos en días corridos: lo único '
      + 'comparable contra el acuerdo es el ciclo completo, no cada etapa por separado.'
    : null
}

/** Cómo se nombra cada responsable de un bloqueo. El enum no es una persona. */
export const ROTULOS_DE_RESPONSABLE: Record<ResponsableDeTraba, string> = {
  cliente: 'Depende de ustedes',
  equipo: 'Depende de nosotros',
  tercero: 'Depende de un tercero'
}

/**
 * Cómo se nombra un responsable, incluido el que nadie declaró.
 *
 * @param responsable el enum de la API, o `null` si el bloqueo se escribió antes de la 0699
 * @returns el rótulo para pantalla
 */
export function rotularResponsable (responsable: ResponsableDeTraba | null): string {
  return responsable === null ? 'Sin responsable declarado' : ROTULOS_DE_RESPONSABLE[responsable]
}

/**
 * Parte las trabas en las que el cliente puede resolver solo y el resto.
 *
 * Es el corte que justifica que el tablero empiece por acá: `responsable = 'cliente'` es lo único
 * de toda la pantalla sobre lo que la gerencia del cliente tiene poder de acción inmediato. Dentro
 * de cada grupo manda el tiempo bloqueada, de mayor a menor; una traba sin fecha va al final porque
 * no se sabe cuánto lleva, no porque lleve poco.
 *
 * @param trabas la lista tal como llega de la API
 * @returns los dos grupos, cada uno ya ordenado
 */
export function separarTrabas (
  trabas: readonly TrabaGestion[]
): { del_cliente: TrabaGestion[], del_resto: TrabaGestion[] } {
  const porAntiguedad = (a: TrabaGestion, b: TrabaGestion): number =>
    (b.dias_bloqueada ?? -1) - (a.dias_bloqueada ?? -1)

  return {
    del_cliente: trabas.filter((t) => t.responsable === 'cliente').sort(porAntiguedad),
    del_resto: trabas.filter((t) => t.responsable !== 'cliente').sort(porAntiguedad)
  }
}

/** Un tramo de antigüedad listo para dibujar. */
export interface BarraDeAntiguedad {
  rango: string
  etiqueta: string
  total: number
  /** Ancho de la barra, 0-100, relativo al tramo más poblado. */
  porcentaje: number
}

/**
 * Rótulo de un tramo de antigüedad.
 *
 * @param tramo el tramo tal como llega de la API
 * @returns `8–15 días`, o `61+ días` para el tramo abierto de la derecha
 */
export function rotularTramo (tramo: TramoDeAntiguedad): string {
  return tramo.hasta_dias === null
    ? `${tramo.desde_dias}+ días`
    : `${tramo.desde_dias}–${tramo.hasta_dias} días`
}

/**
 * La distribución de antigüedad, con el ancho de cada barra ya resuelto.
 *
 * El ancho es relativo al tramo más poblado y no al total: con cinco tramos parejos, dividir por el
 * total daría cinco barras del 20% en las que no se distingue nada. Los cinco tramos viajan siempre,
 * también los vacíos, para que la forma del gráfico no cambie según el mes.
 *
 * @param tramos los cinco tramos de la API
 * @returns las barras y el total de {procesos} abiertas
 */
export function distribucionDeAntiguedad (
  tramos: readonly TramoDeAntiguedad[]
): { barras: BarraDeAntiguedad[], total: number } {
  const maximo = tramos.reduce((mayor, tramo) => Math.max(mayor, tramo.total), 0)
  const total = tramos.reduce((suma, tramo) => suma + tramo.total, 0)

  return {
    total,
    barras: tramos.map((tramo) => ({
      rango: tramo.rango,
      etiqueta: rotularTramo(tramo),
      total: tramo.total,
      porcentaje: maximo === 0 ? 0 : Math.round((tramo.total * 100) / maximo)
    }))
  }
}
