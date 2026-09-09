import { Minus, TrendingDown, TrendingUp } from 'lucide-react'
import { Insignia, type TonoInsignia } from '@/componentes/presentadores/Insignia'
import type { ScoreCliente, SemaforoCliente as Tramo } from '@/datos/recursos'
import { cn } from '@/lib/clases'

/**
 * El semáforo de un cliente: el score de 1 a 100 y las tres señales que lo explican.
 *
 * === Por qué el desglose no es opcional ===
 *
 * Este número se va a usar para juzgar equipos. Un 43 solo, sin decir de dónde salió, no es
 * información: es una acusación sin pruebas, y la primera reacción de cualquiera que lo lea es
 * discutir el número en vez de arreglar lo que lo bajó. Por eso la forma normal del componente trae
 * el desglose con los contadores crudos —12 de 30 Procesos incumplidos, 9 días de atraso promedio—,
 * y `compacto` existe solo para la fila de una tabla, donde el desglose no cabe.
 *
 * === Por qué "sin datos" no es rojo ===
 *
 * Un cliente sin Espacios o sin Procesos no vale 0. El servidor manda `score: null` y
 * `semaforo: 'sin_datos'`, y acá se pinta en contorno, sin color: pintarlo rojo manda a alguien a
 * apagar un incendio que no existe, que es el peor error que puede cometer un indicador de salud.
 *
 * === Por qué el color nunca va solo ===
 *
 * Cada tramo lleva su palabra ("Al día", "Atención", "Crítico"), no solo su tono. El semáforo se
 * lee igual sin distinguir colores, y sigue siendo legible en una captura en blanco y negro.
 */

/** Cómo se lee y se pinta cada tramo. Vive una sola vez: el mapa es la definición del semáforo. */
const TRAMOS: Record<Tramo, { etiqueta: string, tono: TonoInsignia, numero: string }> = {
  verde: { etiqueta: 'Al día', tono: 'exito', numero: 'text-texto' },
  amarillo: { etiqueta: 'Atención', tono: 'aviso', numero: 'text-texto-aviso' },
  rojo: { etiqueta: 'Crítico', tono: 'peligro', numero: 'text-texto-peligro' },
  sin_datos: { etiqueta: 'Sin datos', tono: 'contorno', numero: 'text-texto-tenue' }
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

  const tramo = TRAMOS[score.semaforo] ?? TRAMOS.sin_datos

  const cabecera = (
    <div className="flex items-center gap-2">
      <span
        className={cn('text-2xl leading-none font-semibold tabular-nums', tramo.numero)}
        title={score.score === null ? 'Todavía no hay datos para calcular el score' : 'Score de 1 a 100'}
      >
        {score.score ?? '—'}
      </span>
      <Insignia tono={tramo.tono} tamano="chico">{tramo.etiqueta}</Insignia>
      <Variacion puntos={score.variacion} />
    </div>
  )

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
        : (
          <dl className="flex flex-col gap-2">
            <Senal
              nombre="Cumplimiento de plazos"
              senal={score.senales.plazos}
              detalle={detallePlazos(score)}
            />
            <Senal
              nombre="Carga y actividad"
              senal={score.senales.carga}
              detalle={detalleCarga(score)}
            />
            <Senal
              nombre="Vencimientos próximos"
              senal={score.senales.vencimientos}
              detalle={detalleVencimientos(score)}
            />
          </dl>
          )}
    </section>
  )
}

/**
 * Puntos ganados o perdidos contra la foto anterior.
 *
 * Sin foto anterior no dibuja nada: un "0" ahí se lee como "no se movió", que es distinto de "es la
 * primera medición". El icono acompaña al signo, no lo reemplaza.
 */
function Variacion ({ puntos }: { puntos: number | null }) {
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
 * Se nombra la causa concreta —ningún Espacio, o Espacios sin Procesos— en vez de repetir "sin
 * datos": la causa es lo único accionable de esta tarjeta.
 */
function SinDatos ({ score }: { score: ScoreCliente }) {
  const motivo = score.espacios === 0
    ? 'Este cliente no tiene ningún Espacio.'
    : score.procesos === 0
      ? `Sus ${score.espacios === 1 ? 'Espacio no tiene' : `${score.espacios} Espacios no tienen`} ningún Proceso.`
      : 'Sus Procesos no tienen vencimiento ni actividad que medir.'

  return <p className="text-texto-tenue text-sm">{motivo} Sin eso no hay nada que puntuar.</p>
}

/** "3 de 30 Procesos incumplidos, 9,2 días de atraso promedio". */
function detallePlazos (score: ScoreCliente): string {
  const { medibles, incumplidos, en_riesgo: enRiesgo, atraso_promedio: atraso } = score.senales.plazos

  if (medibles === 0) return 'Ningún Proceso con vencimiento: no hay plazo que medir'

  const partes = [`${incumplidos} de ${medibles} ${medibles === 1 ? 'incumplido' : 'incumplidos'}`]

  if (enRiesgo > 0) partes.push(`${enRiesgo} en riesgo`)
  if (atraso !== null) partes.push(`${formatearDias(atraso)} de atraso promedio`)

  return partes.join(', ')
}

/** "12 Procesos abiertos, 4 sin movimiento en 14 días". */
function detalleCarga (score: ScoreCliente): string {
  const { abiertos, estancados, dias_ventana: ventana } = score.senales.carga

  if (abiertos === 0) return 'Ningún Proceso abierto: no hay nada que pueda estancarse'

  const partes = [`${abiertos} ${abiertos === 1 ? 'Proceso abierto' : 'Procesos abiertos'}`]

  partes.push(
    estancados === 0
      ? `todos con movimiento en ${ventana} días`
      : `${estancados} sin movimiento en ${ventana} días`
  )

  return partes.join(', ')
}

/** "9 vencidos, 2 por vencer ya, 4 en la ventana de aviso". */
function detalleVencimientos (score: ScoreCliente): string {
  const { score: sub, vencidos, criticos, por_vencer: porVencer } = score.senales.vencimientos

  // Sin sub-score la señal no aplica, y decir "nada vencido" sonaria a buena noticia cuando lo que
  // pasa es que no hay ningún Proceso abierto con vencimiento contra el cual medir.
  if (sub === null) return 'Ningún Proceso abierto con vencimiento: no hay nada que medir'

  const partes: string[] = []

  if (vencidos > 0) partes.push(`${vencidos} ${vencidos === 1 ? 'vencido' : 'vencidos'}`)
  if (criticos > 0) partes.push(`${criticos} por vencer ya`)
  if (porVencer > 0) partes.push(`${porVencer} en la ventana de aviso`)

  return partes.length === 0 ? 'Nada vencido ni por vencer' : partes.join(', ')
}

/** Días con un decimal solo cuando lo tiene, y con coma: "9" y "9,2", nunca "9.0". */
function formatearDias (dias: number): string {
  const texto = new Intl.NumberFormat('es-CL', { maximumFractionDigits: 1 }).format(dias)

  return `${texto} ${Math.abs(dias) === 1 ? 'día' : 'días'}`
}
