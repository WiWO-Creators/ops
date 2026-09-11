import { Minus, TrendingDown, TrendingUp } from 'lucide-react'
import { Insignia, type TonoInsignia } from '@/componentes/presentadores/Insignia'
import type { ScoreCliente, SemaforoCliente as Tramo, SenalCarga, SenalPlazos, SenalVencimientos } from '@/datos/recursos'
import { GLOSARIO } from '@/dominio/glosario'
import { cn } from '@/lib/clases'

/**
 * El semáforo de un cliente: el score de 1 a 100 y las tres señales que lo explican.
 *
 * === Por qué el desglose no es opcional ===
 *
 * Este número se va a usar para juzgar equipos. Un 43 solo, sin decir de dónde salió, no es
 * información: es una acusación sin pruebas, y la primera reacción de cualquiera que lo lea es
 * discutir el número en vez de arreglar lo que lo bajó. Por eso la forma normal del componente trae
 * el desglose con los contadores crudos —12 de 30 Tareas incumplidas, 9 días de atraso promedio—,
 * y `compacto` existe solo para la fila de una tabla, donde el desglose no cabe.
 *
 * === Por qué "sin datos" no es rojo ===
 *
 * Un cliente sin Proyectos o sin Tareas no vale 0. El servidor manda `score: null` y
 * `semaforo: 'sin_datos'`, y acá se pinta en contorno, sin color: pintarlo rojo manda a alguien a
 * apagar un incendio que no existe, que es el peor error que puede cometer un indicador de salud.
 *
 * === Por qué el color nunca va solo ===
 *
 * Cada tramo lleva su palabra ("Al día", "Atención", "Crítico"), no solo su tono. El semáforo se
 * lee igual sin distinguir colores, y sigue siendo legible en una captura en blanco y negro.
 *
 * === Por qué las piezas se exportan ===
 *
 * El mismo semáforo existe un escalón más abajo, por Proyecto, y llega con la MISMA forma: mismo
 * score, mismo tramo, mismas tres señales con los mismos pesos. `TRAMOS`, `Puntaje`, `Variacion` y
 * `DesgloseSenales` se exportan para que esa pantalla los reuse en vez de copiarlos: dos copias de
 * un semáforo son dos semáforos que pueden terminar pintando distinto el mismo número.
 */

/** Cómo se lee y se pinta cada tramo. Vive una sola vez: el mapa es la definición del semáforo. */
export const TRAMOS: Record<Tramo, { etiqueta: string, tono: TonoInsignia, numero: string }> = {
  verde: { etiqueta: 'Al día', tono: 'exito', numero: 'text-texto' },
  amarillo: { etiqueta: 'Atención', tono: 'aviso', numero: 'text-texto-aviso' },
  rojo: { etiqueta: 'Crítico', tono: 'peligro', numero: 'text-texto-peligro' },
  sin_datos: { etiqueta: 'Sin datos', tono: 'contorno', numero: 'text-texto-tenue' }
}

/** Las tres señales, tal como viajan tanto en el score de un cliente como en el de un Proyecto. */
export interface SenalesDelScore {
  plazos: SenalPlazos
  carga: SenalCarga
  vencimientos: SenalVencimientos
}

interface PropsSemaforo {
  /** La foto que devuelve `GET /scores` o `GET /scores/{clientId}`. */
  score: ScoreCliente | null | undefined
  /** Solo el número y la píldora, para una fila de tabla o una cabecera. */
  compacto?: boolean
  className?: string
}

/**
 * @param score la foto del día; `null` o ausente no dibuja nada
 * @param compacto sin desglose, para superficies donde no cabe
 */
export function SemaforoCliente ({ score, compacto = false, className }: PropsSemaforo) {
  if (score === null || score === undefined) return null

  const cabecera = <Puntaje score={score.score} semaforo={score.semaforo} variacion={score.variacion} />

  if (compacto) return <div className={className}>{cabecera}</div>

  return (
    <section
      className={cn(
        'border-linea bg-superficie-elevada rounded-tarjeta shadow-1 flex flex-col gap-3 border p-4',
        className
      )}
      aria-label="Semáforo del cliente"
    >
      <header className="flex items-start justify-between gap-2">
        {cabecera}
        <span className="text-texto-tenue text-xs">Al {score.fecha}</span>
      </header>

      {score.score === null
        ? <SinDatos score={score} />
        : <DesgloseSenales senales={score.senales} />}
    </section>
  )
}

/**
 * El número, su píldora y la flecha contra la medición anterior.
 *
 * Se pide por partes y no con la foto entera porque lo usan las dos pantallas: la del cliente le
 * pasa un `ScoreCliente` y la de Focals, un score por Proyecto. Las tres cosas que dibuja son las
 * únicas que las dos formas comparten con seguridad.
 *
 * @param score el número de 1 a 100, o `null` si no hay nada que puntuar
 * @param semaforo el tramo que decide el color y la palabra
 * @param variacion puntos contra la foto anterior; `null` si no hay con qué comparar
 */
export function Puntaje (
  { score, semaforo, variacion }: { score: number | null, semaforo: Tramo, variacion: number | null }
) {
  const tramo = TRAMOS[semaforo] ?? TRAMOS.sin_datos

  return (
    <div className="flex items-center gap-2">
      <span
        className={cn('text-2xl leading-none font-semibold tabular-nums', tramo.numero)}
        title={score === null ? 'Todavía no hay datos para calcular el score' : 'Score de 1 a 100'}
      >
        {score ?? '—'}
      </span>
      <Insignia tono={tramo.tono} tamano="chico">{tramo.etiqueta}</Insignia>
      <Variacion puntos={variacion} />
    </div>
  )
}

/**
 * Puntos ganados o perdidos contra la foto anterior.
 *
 * Sin foto anterior no dibuja nada: un "0" ahí se lee como "no se movió", que es distinto de "es la
 * primera medición". El icono acompaña al signo, no lo reemplaza.
 */
export function Variacion ({ puntos }: { puntos: number | null }) {
  if (puntos === null) return null

  const Icono = puntos > 0 ? TrendingUp : puntos < 0 ? TrendingDown : Minus
  const tono = puntos > 0 ? 'text-texto-exito' : puntos < 0 ? 'text-texto-peligro' : 'text-texto-tenue'

  return (
    <span
      className={cn('inline-flex items-center gap-1 text-xs font-medium tabular-nums', tono)}
      title="Contra la medición anterior"
    >
      <Icono size={12} aria-hidden="true" />
      {puntos > 0 ? `+${puntos}` : puntos}
    </span>
  )
}

/**
 * Las tres señales con su sub-score, su peso y los contadores que las explican.
 *
 * @param senales el bloque `senales` de cualquiera de los dos scores
 */
export function DesgloseSenales ({ senales, className }: { senales: SenalesDelScore, className?: string }) {
  return (
    <dl className={cn('flex flex-col gap-2', className)}>
      <Senal
        nombre="Cumplimiento de plazos"
        senal={senales.plazos}
        detalle={detallePlazos(senales.plazos)}
      />
      <Senal
        nombre="Carga y actividad"
        senal={senales.carga}
        detalle={detalleCarga(senales.carga)}
      />
      <Senal
        nombre="Vencimientos próximos"
        senal={senales.vencimientos}
        detalle={detalleVencimientos(senales.vencimientos)}
      />
    </dl>
  )
}

/**
 * Una señal: su nombre, su sub-score sobre 100, cuánto pesa, y los contadores que lo explican.
 *
 * Una señal con `score: null` **no aplica** —no hay universo que medir— y su peso quedó fuera del
 * promedio. Se muestra igual, con su motivo: esconderla haría que los pesos visibles no sumaran y
 * que el score pareciera mal calculado.
 */
function Senal (
  { nombre, senal, detalle }:
  { nombre: string, senal: { peso: number, score: number | null }, detalle: string }
) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-sm">
      <div className="flex min-w-0 flex-col">
        <dt className="truncate font-medium">{nombre}</dt>
        <dd className="text-texto-tenue text-xs">{detalle}</dd>
      </div>
      <div className="flex shrink-0 items-baseline gap-1 tabular-nums">
        <span className={senal.score === null ? 'text-texto-tenue' : 'font-semibold'}>
          {senal.score ?? 'n/a'}
        </span>
        <span className="text-texto-tenue text-xs">· {senal.peso}%</span>
      </div>
    </div>
  )
}

/**
 * Por qué este cliente no tiene score.
 *
 * Se nombra la causa concreta —ningún Proyecto, o Proyectos sin Tareas— en vez de repetir "sin
 * datos": la causa es lo único accionable de esta tarjeta.
 */
function SinDatos ({ score }: { score: ScoreCliente }) {
  const espacios = GLOSARIO.espacio
  const procesos = GLOSARIO.proceso

  const motivo = score.espacios === 0
    ? `Este cliente no tiene ningún ${espacios.singular}.`
    : score.procesos === 0
      ? `Sus ${score.espacios === 1
        ? `${espacios.singular} no tiene`
        : `${score.espacios} ${espacios.plural} no tienen`} ninguna ${procesos.singular}.`
      : `Sus ${procesos.plural} no tienen vencimiento ni actividad que medir.`

  return <p className="text-texto-tenue text-sm">{motivo} Sin eso no hay nada que puntuar.</p>
}

/** "3 de 30 Tareas incumplidas, 9,2 días de atraso promedio". */
export function detallePlazos (plazos: SenalPlazos): string {
  const { medibles, incumplidos, en_riesgo: enRiesgo, atraso_promedio: atraso } = plazos

  if (medibles === 0) {
    return `Ninguna ${GLOSARIO.proceso.singular} con vencimiento: no hay plazo que medir`
  }

  const partes = [`${incumplidos} de ${medibles} ${medibles === 1 ? 'incumplida' : 'incumplidas'}`]

  if (enRiesgo > 0) partes.push(`${enRiesgo} en riesgo`)
  if (atraso !== null) partes.push(`${formatearDias(atraso)} de atraso promedio`)

  return partes.join(', ')
}

/** "12 Tareas abiertas, 4 sin movimiento en 14 días". */
export function detalleCarga (carga: SenalCarga): string {
  const { abiertos, estancados, dias_ventana: ventana } = carga
  const procesos = GLOSARIO.proceso

  if (abiertos === 0) {
    return `Ninguna ${procesos.singular} abierta: no hay nada que pueda estancarse`
  }

  const partes = [`${abiertos} ${abiertos === 1 ? `${procesos.singular} abierta` : `${procesos.plural} abiertas`}`]

  partes.push(
    estancados === 0
      ? `todas con movimiento en ${ventana} días`
      : `${estancados} sin movimiento en ${ventana} días`
  )

  return partes.join(', ')
}

/** "9 vencidas, 2 por vencer ya, 4 en la ventana de aviso". */
export function detalleVencimientos (vencimientos: SenalVencimientos): string {
  const { score: sub, vencidos, criticos, por_vencer: porVencer } = vencimientos

  // Sin sub-score la señal no aplica, y decir "nada vencido" sonaria a buena noticia cuando lo que
  // pasa es que no hay ninguna Tarea abierta con vencimiento contra la cual medir.
  if (sub === null) {
    return `Ninguna ${GLOSARIO.proceso.singular} abierta con vencimiento: no hay nada que medir`
  }

  const partes: string[] = []

  if (vencidos > 0) partes.push(`${vencidos} ${vencidos === 1 ? 'vencida' : 'vencidas'}`)
  if (criticos > 0) partes.push(`${criticos} por vencer ya`)
  if (porVencer > 0) partes.push(`${porVencer} en la ventana de aviso`)

  return partes.length === 0 ? 'Nada vencido ni por vencer' : partes.join(', ')
}

/** Días con un decimal solo cuando lo tiene, y con coma: "9" y "9,2", nunca "9.0". */
function formatearDias (dias: number): string {
  const texto = new Intl.NumberFormat('es-CL', { maximumFractionDigits: 1 }).format(dias)

  return `${texto} ${Math.abs(dias) === 1 ? 'día' : 'días'}`
}
