import { GLOSARIO } from './glosario.ts'
import type { ComparacionDeIndicadores, FotoDeIndicadores } from '@/datos/recursos'

/**
 * Como se leen los indicadores operativos.
 *
 * Vive en un `.ts` y fuera de todo componente por la regla de `docs/convenciones.md`: Node despoja
 * los tipos de un `.ts` pero no el JSX, asi que solo lo que esta aca se puede probar con el runner.
 *
 * === Por que cada indicador declara hacia donde es mejor ===
 *
 * Porque "-99" no dice nada por si solo. En "vencidos", bajar es una mejora; en "espacios", bajar
 * puede ser que se cerro una cuenta. Pintar todo lo negativo de verde seria mentir la mitad de las
 * veces, y no pintar nada obligaria a quien mira a recordar el sentido de cada fila.
 *
 * `neutro` existe para los que no tienen sentido bueno ni malo —cuantos Espacios, cuantos Procesos—:
 * son contexto, no metas.
 */

/** Hacia donde es mejor que se mueva un indicador. */
export type SentidoDeIndicador = 'menos_es_mejor' | 'mas_es_mejor' | 'neutro'

export interface IndicadorDescrito {
  clave: keyof Omit<FotoDeIndicadores, 'fecha' | 'calidad_tareas'>
  etiqueta: string
  /** Que significa el numero, en una linea. Va debajo del valor. */
  detalle: string
  sentido: SentidoDeIndicador
  /** `true` para el promedio de calidad, que lleva un decimal y puede ser `null`. */
  decimal?: boolean
}

/**
 * Los indicadores, en orden de lectura.
 *
 * Primero lo que duele —lo incumplido y lo vencido—, despues lo que esta por doler, y al final el
 * contexto. Una tabla que arranca por "cuantos Espacios hay" entierra el dato que se vino a buscar.
 */
export const INDICADORES: readonly IndicadorDescrito[] = [
  {
    clave: 'incumplidos',
    etiqueta: 'Incumplidos',
    detalle: 'Cerraron tarde o siguen abiertos pasada la fecha',
    sentido: 'menos_es_mejor'
  },
  {
    clave: 'vencidos',
    etiqueta: 'Vencidos',
    detalle: 'La fecha ya pasó y siguen abiertos',
    sentido: 'menos_es_mejor'
  },
  {
    clave: 'criticos',
    etiqueta: 'Críticos',
    detalle: 'Vencen dentro del aviso final',
    sentido: 'menos_es_mejor'
  },
  {
    clave: 'por_vencer',
    etiqueta: 'Por vencer',
    detalle: 'Entraron en la ventana de aviso',
    sentido: 'menos_es_mejor'
  },
  {
    clave: 'en_riesgo',
    etiqueta: 'En riesgo',
    detalle: 'Pasaron su ETA y todavía no vencen',
    sentido: 'menos_es_mejor'
  },
  {
    clave: 'estancados',
    etiqueta: 'Estancados',
    detalle: 'Abiertos y sin ningún movimiento registrado',
    sentido: 'menos_es_mejor'
  },
  {
    clave: 'aprobacion_pendiente',
    etiqueta: 'Esperan al cliente',
    detalle: 'Pidieron aprobación y no la respondieron',
    sentido: 'menos_es_mejor'
  },
  {
    clave: 'calidad_promedio',
    etiqueta: 'Nota de calidad',
    detalle: 'Qué tan bien planteados están, de 0 a 100',
    sentido: 'mas_es_mejor',
    decimal: true
  },
  {
    clave: 'abiertos',
    etiqueta: 'Abiertos',
    detalle: 'Sin completar a la fecha del corte',
    sentido: 'neutro'
  },
  {
    clave: 'procesos',
    etiqueta: GLOSARIO.proceso.plural,
    detalle: 'Todos los que existían ese día',
    sentido: 'neutro'
  },
  {
    clave: 'espacios',
    etiqueta: GLOSARIO.espacio.plural,
    detalle: 'Cuántos entraron en el corte',
    sentido: 'neutro'
  }
]

/** Como se pinta una diferencia: mejora, retroceso o sin cambio. */
export type TonoDeDelta = 'mejora' | 'retroceso' | 'igual'

/**
 * Si la diferencia es una buena o una mala noticia.
 *
 * Cero es `igual` y no una mejora: quedarse donde se estaba no es avanzar. `null` —el promedio de
 * calidad cuando a una de las dos fotos le falta— tambien es `igual`, porque no hay noticia.
 *
 * @param delta La diferencia (corte menos base), o `null` si no se puede calcular.
 * @param sentido Hacia donde es mejor que se mueva ese indicador.
 * @returns El tono con el que pintarla.
 */
export function tonoDeDelta (delta: number | null, sentido: SentidoDeIndicador): TonoDeDelta {
  if (delta === null || delta === 0 || sentido === 'neutro') return 'igual'

  const bajo = delta < 0

  return (sentido === 'menos_es_mejor') === bajo ? 'mejora' : 'retroceso'
}

/**
 * La diferencia, escrita con su signo.
 *
 * El `+` va explicito porque sin el "3" y "-3" no se leen como el mismo tipo de dato: uno parece un
 * total y el otro una diferencia. Cero se escribe "=" y no "0" por lo mismo.
 *
 * @param delta La diferencia, o `null`.
 * @param decimal Si lleva un decimal (solo el promedio de calidad).
 * @returns El texto listo para pintar.
 */
export function formatearDelta (delta: number | null, decimal = false): string {
  if (delta === null) return '—'
  if (delta === 0) return '='

  const numero = new Intl.NumberFormat('es-CL', {
    minimumFractionDigits: decimal ? 1 : 0,
    maximumFractionDigits: decimal ? 1 : 0
  }).format(Math.abs(delta))

  return `${delta > 0 ? '+' : '−'}${numero}`
}

/**
 * Un valor de la foto, listo para pintar.
 *
 * `null` solo le pasa al promedio de calidad, y significa "ese dia no habia ninguna Tarea evaluada".
 * Se escribe con raya y no con cero: un cero se leeria como "todas pésimas".
 *
 * @param valor El numero de la foto.
 * @param decimal Si lleva un decimal.
 * @returns El texto listo para pintar.
 */
export function formatearValor (valor: number | null, decimal = false): string {
  if (valor === null) return '—'

  return new Intl.NumberFormat('es-CL', {
    minimumFractionDigits: decimal ? 1 : 0,
    maximumFractionDigits: decimal ? 1 : 0
  }).format(valor)
}

/**
 * Las filas del tablero, ya resueltas.
 *
 * Se arma aca y no en el JSX para que el orden, los tonos y los textos se puedan probar: son
 * exactamente las tres cosas que se rompen en silencio cuando se agrega un indicador.
 *
 * @param comparacion Lo que devuelve `GET /indicadores`.
 * @returns Una fila por indicador, en orden de lectura.
 */
export function filasDelTablero (comparacion: ComparacionDeIndicadores): Array<{
  clave: string
  etiqueta: string
  detalle: string
  base: string
  corte: string
  delta: string
  tono: TonoDeDelta
}> {
  return INDICADORES.map((indicador) => {
    const delta = comparacion.delta[indicador.clave]

    return {
      clave: indicador.clave,
      etiqueta: indicador.etiqueta,
      detalle: indicador.detalle,
      base: formatearValor(comparacion.base[indicador.clave], indicador.decimal),
      corte: formatearValor(comparacion.corte[indicador.clave], indicador.decimal),
      delta: formatearDelta(delta, indicador.decimal),
      tono: tonoDeDelta(delta, indicador.sentido)
    }
  })
}
