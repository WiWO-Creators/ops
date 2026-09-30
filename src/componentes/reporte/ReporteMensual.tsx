import Link from 'next/link'
import { ArrowUpRight, CalendarClock, Hourglass, PackageCheck } from 'lucide-react'
import { Bloque } from '@/app/portal/(dentro)/detalle'
import { TituloModulo } from '@/componentes/estructura/TituloModulo'
import { Insignia } from '@/componentes/presentadores/Insignia'
import { BarraProgreso } from '@/componentes/presentadores/BarraProgreso'
import { PARAMETRO_TAREA } from '@/componentes/datos/tabla'
import { Clave } from '@/componentes/portal/GraficosDelTablero'
import { SelectorDelReporte } from './SelectorDelReporte'
import { GLOSARIO } from '@/dominio/glosario'
import { rotularMes } from '@/dominio/gestion'
import {
  agruparPorProyecto,
  altoRelativo,
  enlaceAReunion,
  enlaceATarea,
  formatearHoras,
  frenteAlAnterior,
  leerTendenciaDelReporte,
  nombreDelMes,
  resumenDelReporte,
  type SerieDeReporte
} from '@/dominio/reporte-mensual'
import { cn } from '@/lib/clases'
import { formatearFecha, formatearVencimiento } from '@/lib/fechas'
import type { ReporteMensual as Reporte, TareaDelReporte } from '@/datos/portal'

/** Filas visibles de una lista larga antes de plegar el resto. */
const FILAS_A_LA_VISTA = 8

/** La lista con filas separadas por una linea, sin tarjeta propia: ya vive dentro de un `Bloque`. */
const LISTA = 'flex flex-col divide-y divide-linea-suave'

/** La fila enlazada de esas listas. */
const FILA = 'group flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-2.5 first:pt-0 last:pb-0'

/** El nombre de una tarea enlazada a su ficha. */
const NOMBRE = 'text-texto min-w-0 text-sm font-medium underline-offset-4 decoration-linea hover:underline hover:decoration-acento focus-visible:underline'

/**
 * El reporte mensual del cliente, entero.
 *
 * === El orden es la decisión de diseño ===
 *
 * Es una rendición de cuentas, y se lee como tal: primero el párrafo que resume el mes, después lo
 * que se ENTREGÓ —la pregunta que motiva el reporte— y lo completado, y al costado lo que le toca al
 * cliente y lo que viene. Abajo el avance por hito y la tendencia, que dan contexto pero no cambian
 * nada de lo que hay que hacer hoy.
 *
 * Cada bloque se dibuja SOLO si su clave llegó: la API la omite cuando ningún {espacio} del alcance
 * comparte esa pestaña con el cliente, y una clave ausente no es una lista vacía. Lo que llegó vacío
 * sí se dibuja, con su frase.
 *
 * Server Component sin estado: lo único interactivo es el formulario del selector.
 */
export function ReporteMensual (
  { reporte, meses, proyectoId }: { reporte: Reporte, meses: string[], proyectoId?: string }
) {
  const { alcance } = reporte
  const hayEsperando = reporte.esperando !== undefined && reporte.esperando.length > 0
  const hayLateral = reporte.esperando !== undefined || reporte.proximas !== undefined
    || reporte.reuniones !== undefined || reporte.horas !== undefined

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
      {/* El selector va en su propia fila y no en `acciones` de `TituloModulo`: ese contenedor no se
          encoge, y con dos desplegables desbordaba la pantalla en un teléfono. */}
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
        <TituloModulo
          className="min-w-0"
          titulo="Reporte mensual"
          descripcion={`${rotularMes(alcance.mes)}. ${alcanceEnPalabras(alcance.proyectos)}`}
        />
        <SelectorDelReporte
          mes={alcance.mes}
          meses={meses}
          proyectos={alcance.proyectos_disponibles}
          proyectoId={proyectoId}
        />
      </div>

      <ResumenDelMes reporte={reporte} />

      {/* En una columna, lo que espera al cliente sube antes de las listas del mes: es lo único del
          reporte que le pide algo, y abajo de todo nadie lo ve. */}
      {hayEsperando && <Esperando tareas={reporte.esperando ?? []} className="flex lg:hidden" />}

      <div className={cn('grid gap-6', hayLateral && 'lg:grid-cols-[minmax(0,1.75fr)_minmax(0,1fr)]')}>
        <div className="flex min-w-0 flex-col gap-6">
          {reporte.entregables !== undefined && <Entregables tareas={reporte.entregables} mes={alcance.mes} hayCompletadas={(reporte.completadas?.length ?? 0) > 0} />}
          {reporte.completadas !== undefined && <Completadas tareas={reporte.completadas} mes={alcance.mes} />}
          {reporte.completadas === undefined && <SinTareasCompartidas />}
        </div>

        {hayLateral && (
          <aside className="flex min-w-0 flex-col gap-6" aria-label="Pendientes y actividad del mes">
            {hayEsperando && <Esperando tareas={reporte.esperando ?? []} className="hidden lg:flex" />}
            {reporte.proximas !== undefined && <Proximas tareas={reporte.proximas} />}
            {reporte.reuniones !== undefined && <Reuniones reuniones={reporte.reuniones} mes={alcance.mes} />}
            {reporte.horas !== undefined && <Horas horas={reporte.horas} mes={alcance.mes} />}
          </aside>
        )}
      </div>

      {reporte.hitos !== undefined && <Hitos hitos={reporte.hitos} mes={alcance.mes} />}
      <Tendencia tendencia={reporte.tendencia} />
    </div>
  )
}

/**
 * Sobre qué {espacios} se calculó, en una frase.
 *
 * @param proyectos los {espacios} del alcance
 * @returns la frase
 */
function alcanceEnPalabras (proyectos: Array<{ name: string }>): string {
  if (proyectos.length === 1) return `${GLOSARIO.espacio.singular}: ${proyectos[0]?.name ?? ''}.`

  return `Suma tus ${proyectos.length} ${GLOSARIO.espacio.plural.toLowerCase()}.`
}

/**
 * El párrafo que abre el reporte: el mes contado en frases, cada cifra contra el mes anterior.
 *
 * No es una fila de cuatro números grandes: un reporte se lee, y «7 tareas completadas, 6 más que
 * en agosto» dice en una línea lo que cuatro tarjetas dirían en cuatro. Cada frase existe solo si
 * su cifra llegó.
 */
function ResumenDelMes ({ reporte }: { reporte: Reporte }) {
  const resumen = resumenDelReporte(reporte)
  const { alcance } = reporte
  const anterior = alcance.mes_anterior
  const frases: React.ReactNode[] = []

  if (resumen.completadas !== undefined) {
    frases.push(
      <span key="completadas">
        completamos <Numero>{contar(resumen.completadas.actual, 'tarea', 'tareas')}</Numero>
        {' '}<Comparacion>{frenteAlAnterior(resumen.completadas, anterior)}</Comparacion>
      </span>
    )
  }

  if (resumen.entregables !== undefined) {
    frases.push(
      <span key="entregables">
        hicimos <Numero>{contar(resumen.entregables.actual, 'entrega', 'entregas')}</Numero>
        {' '}<Comparacion>{frenteAlAnterior(resumen.entregables, anterior)}</Comparacion>
      </span>
    )
  }

  if (resumen.reuniones !== undefined) {
    frases.push(
      <span key="reuniones">
        tuvimos <Numero>{contar(resumen.reuniones.actual, 'reunión', 'reuniones')}</Numero>
        {' '}<Comparacion>{frenteAlAnterior(resumen.reuniones, anterior)}</Comparacion>
      </span>
    )
  }

  if (resumen.horas_segundos !== undefined) {
    frases.push(
      <span key="horas">
        registramos <Numero>{formatearHoras(resumen.horas_segundos.actual)}</Numero> de trabajo
        {' '}<Comparacion>{frenteAlAnterior(resumen.horas_segundos, anterior, formatearHoras)}</Comparacion>
      </span>
    )
  }

  return (
    <section aria-labelledby="reporte-resumen" className="border-linea-suave border-b pb-6">
      <h2 id="reporte-resumen" className="sr-only">Resumen del mes</h2>

      {frases.length === 0
        ? (
          <Vacio accion={IR_A_PROYECTOS}>
            Tus {GLOSARIO.espacio.plural.toLowerCase()} todavía no comparten tareas, reuniones ni horas en el portal, así que
            este mes no tiene cifras que mostrar. Pídele a tu equipo que las habilite si quieres verlas acá.
          </Vacio>
          )
        : (
          <p className="text-texto font-titular max-w-3xl text-xl leading-relaxed text-pretty sm:text-2xl sm:leading-relaxed">
            En {nombreDelMes(alcance.mes)}{' '}
            {frases.map((frase, indice) => (
              <span key={indice}>
                {frase}
                {separador(indice, frases.length)}
              </span>
            ))}
          </p>
          )}

      <p className="text-texto-sutil mt-3 text-xs text-pretty">
        {alcance.cerrado
          ? 'Mes cerrado: estas cifras ya no cambian.'
          : `Mes en curso: medido hasta el ${formatearFecha(alcance.medido_hasta)}, así que todavía puede cambiar.`}
      </p>
    </section>
  )
}

/** La comparación con el mes anterior: contexto de la cifra, en tinta más tenue que la frase. */
function Comparacion ({ children }: { children: React.ReactNode }) {
  return <span className="text-texto-sutil text-base sm:text-lg">({children})</span>
}

/** La cifra destacada dentro del párrafo del resumen. */
function Numero ({ children }: { children: React.ReactNode }) {
  return <strong className="text-texto font-semibold tabular-nums">{children}</strong>
}

/**
 * Número con su sustantivo en singular o plural.
 *
 * @returns «1 tarea», «7 tareas», «0 tareas»
 */
function contar (cantidad: number, singular: string, plural: string): string {
  return `${cantidad} ${cantidad === 1 ? singular : plural}`
}

/**
 * El signo que sigue a cada frase del resumen: coma, «y» antes de la última, punto al final.
 */
function separador (indice: number, total: number): string {
  if (indice === total - 1) return '.'
  if (indice === total - 2) return ' y '

  return ', '
}

/** El hueco de la columna principal cuando ningún {espacio} comparte sus tareas. */
function SinTareasCompartidas () {
  return (
    <Bloque titulo="Entregables y tareas completadas">
      <Vacio>
        Ningún {GLOSARIO.espacio.singular.toLowerCase()} de este reporte comparte su lista de tareas contigo, así que no
        podemos mostrarte qué se entregó ni qué se completó.
      </Vacio>
    </Bloque>
  )
}

/**
 * Lo entregado en el mes: tareas marcadas como entregables que se completaron, con su enlace.
 *
 * Es el bloque por el que existe el reporte. El enlace a la pieza final va como acción de la fila y
 * no escondido en la ficha: es lo que el cliente viene a buscar.
 */
function Entregables (
  { tareas, mes, hayCompletadas }: { tareas: TareaDelReporte[], mes: string, hayCompletadas: boolean }
) {
  return (
    <Bloque titulo={`Entregables de ${nombreDelMes(mes)}`}>
      {tareas.length === 0
        ? (
          <Vacio accion={hayCompletadas ? { href: '#reporte-completadas', etiqueta: 'Ver las tareas completadas' } : undefined}>
            En {nombreDelMes(mes)} no se completó ninguna tarea marcada como entregable.
          </Vacio>
          )
        : (
          <ul className={LISTA}>
            {tareas.map((tarea) => (
              <li key={tarea.id} className={FILA}>
                <div className="flex min-w-0 items-start gap-2.5">
                  <PackageCheck size={16} aria-hidden="true" className="text-texto-exito mt-0.5 shrink-0" />
                  <div className="flex min-w-0 flex-col gap-0.5">
                    <Link href={enlaceATarea(tarea, PARAMETRO_TAREA)} className={NOMBRE}>{tarea.name}</Link>
                    <span className="text-texto-sutil text-xs">
                      {detalleDeTarea(tarea)}, entregado el {formatearFecha(tarea.completed_at)}
                    </span>
                  </div>
                </div>
                {tarea.deliverable_url !== null && (
                  <a
                    href={tarea.deliverable_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-acento hover:bg-hover rounded-control inline-flex shrink-0 items-center gap-1 px-2 py-1 text-sm font-semibold transition-colors"
                  >
                    Abrir entregable
                    <ArrowUpRight size={15} aria-hidden="true" />
                    <span className="sr-only">: {tarea.name} (se abre en otra pestaña)</span>
                  </a>
                )}
              </li>
            ))}
          </ul>
          )}
    </Bloque>
  )
}

/**
 * {Espacio} e hito de una tarea, en una línea.
 *
 * @returns «Sitio web, Piezas gráficas»
 */
function detalleDeTarea (tarea: TareaDelReporte): string {
  return tarea.milestone === null ? tarea.project.name : `${tarea.project.name}, ${tarea.milestone.name}`
}

/**
 * Las tareas completadas en el mes, agrupadas por {espacio} y con las primeras a la vista.
 *
 * Una lista de cuarenta filas no se lee: se muestran las más recientes y el resto se despliega. El
 * total va en el título, así que plegar no esconde el tamaño del mes.
 */
function Completadas ({ tareas, mes }: { tareas: TareaDelReporte[], mes: string }) {
  const grupos = agruparPorProyecto(tareas)
  const variosProyectos = grupos.length > 1

  return (
    <div id="reporte-completadas" className="scroll-mt-6">
    <Bloque titulo={`Tareas completadas en ${nombreDelMes(mes)} (${tareas.length})`}>
      {tareas.length === 0
        ? <Vacio>En {nombreDelMes(mes)} no se completó ninguna tarea.</Vacio>
        : (
          <div className="flex flex-col gap-5">
            {grupos.map((grupo) => (
              <section key={grupo.proyecto.id} aria-label={grupo.proyecto.name} className="flex flex-col gap-2">
                {variosProyectos && (
                  <h3 className="text-texto-tenue text-xs font-semibold">
                    {grupo.proyecto.name} <span className="text-texto-sutil font-normal">({grupo.tareas.length})</span>
                  </h3>
                )}
                <FilasPlegables tareas={grupo.tareas} />
              </section>
            ))}
          </div>
          )}
    </Bloque>
    </div>
  )
}

/** Las filas de un grupo de completadas, con el resto plegado en un `<details>`. */
function FilasPlegables ({ tareas }: { tareas: TareaDelReporte[] }) {
  const visibles = tareas.slice(0, FILAS_A_LA_VISTA)
  const resto = tareas.slice(FILAS_A_LA_VISTA)

  return (
    <>
      <ul className={LISTA}>
        {visibles.map((tarea) => <FilaCompletada key={tarea.id} tarea={tarea} />)}
      </ul>
      {resto.length > 0 && (
        <details className="group/plegable">
          <summary className="text-acento hover:bg-hover rounded-control w-fit cursor-pointer list-none px-2 py-1 text-sm font-semibold">
            <span className="group-open/plegable:hidden">Ver {contar(resto.length, 'tarea más', 'tareas más')}</span>
            <span className="hidden group-open/plegable:inline">Ver menos</span>
          </summary>
          <ul className={cn(LISTA, 'mt-2')}>
            {resto.map((tarea) => <FilaCompletada key={tarea.id} tarea={tarea} />)}
          </ul>
        </details>
      )}
    </>
  )
}

/** Una tarea completada: nombre, hito, fecha y la marca de entregable si la tiene. */
function FilaCompletada ({ tarea }: { tarea: TareaDelReporte }) {
  return (
    <li className={FILA}>
      <div className="flex min-w-0 flex-col gap-0.5">
        <Link href={enlaceATarea(tarea, PARAMETRO_TAREA)} className={NOMBRE}>{tarea.name}</Link>
        {tarea.milestone !== null && <span className="text-texto-sutil text-xs">{tarea.milestone.name}</span>}
      </div>
      <span className="flex shrink-0 items-center gap-2">
        {tarea.deliverable && <Insignia tono="acento" tamano="chico">Entregable</Insignia>}
        <span className="text-texto-tenue text-xs tabular-nums">{formatearFecha(tarea.completed_at)}</span>
      </span>
    </li>
  )
}

/**
 * Lo que espera una respuesta del cliente HOY: la única lista del reporte que le pide algo.
 *
 * Solo aparece si hay algo. «Nada espera tu respuesta» no ocupa una tarjeta al costado del mes.
 */
function Esperando ({ tareas, className }: { tareas: TareaDelReporte[], className?: string }) {
  return (
    <section
      aria-label="Espera tu respuesta"
      className={cn('border-texto-aviso/30 bg-superficie-aviso rounded-tarjeta flex-col gap-3 border p-5', className ?? 'flex')}
    >
      <h2 className="font-titular text-texto-aviso flex items-center gap-2 text-sm font-semibold">
        <Hourglass size={16} aria-hidden="true" />
        Espera tu respuesta ({tareas.length})
      </h2>
      <ul className="flex flex-col gap-2">
        {tareas.map((tarea) => (
          <li key={tarea.id} className="flex flex-col gap-0.5">
            <Link href={enlaceATarea(tarea, PARAMETRO_TAREA)} className={NOMBRE}>{tarea.name}</Link>
            <span className="text-texto-tenue text-xs">{tarea.project.name}</span>
          </li>
        ))}
      </ul>
      <p className="text-texto-tenue text-xs">Al día de hoy, no del mes que estás mirando.</p>
    </section>
  )
}

/** Lo que vence en los próximos 30 días, medido desde hoy. */
function Proximas ({ tareas }: { tareas: TareaDelReporte[] }) {
  return (
    <Bloque titulo="Lo que viene">
      {tareas.length === 0
        ? <Vacio>No hay tareas con entrega en los próximos 30 días.</Vacio>
        : (
          <ul className={LISTA}>
            {tareas.slice(0, FILAS_A_LA_VISTA).map((tarea) => (
              <li key={tarea.id} className={FILA}>
                <div className="flex min-w-0 flex-col gap-0.5">
                  <Link href={enlaceATarea(tarea, PARAMETRO_TAREA)} className={NOMBRE}>{tarea.name}</Link>
                  <span className="text-texto-sutil text-xs">{tarea.project.name}</span>
                </div>
                <span className="text-texto-tenue flex shrink-0 items-center gap-1 text-xs tabular-nums">
                  <CalendarClock size={13} aria-hidden="true" />
                  {formatearVencimiento(tarea.due_date)}
                </span>
              </li>
            ))}
          </ul>
          )}
      <p className="text-texto-sutil mt-3 text-xs text-pretty">
        Próximos 30 días desde hoy.
        {tareas.length > FILAS_A_LA_VISTA && ` Y ${contar(tareas.length - FILAS_A_LA_VISTA, 'tarea más', 'tareas más')}.`}
      </p>
    </Bloque>
  )
}

/** Los Meeting Papers del mes, cada uno enlazado a su acta. */
function Reuniones ({ reuniones, mes }: { reuniones: NonNullable<Reporte['reuniones']>, mes: string }) {
  return (
    <Bloque titulo="Reuniones">
      {reuniones.length === 0
        ? <Vacio>En {nombreDelMes(mes)} no hubo reuniones con Meeting Paper.</Vacio>
        : (
          <ul className={LISTA}>
            {reuniones.map((reunion) => (
              <li key={reunion.id} className={FILA}>
                <div className="flex min-w-0 flex-col gap-0.5">
                  <Link href={enlaceAReunion(reunion)} className={NOMBRE}>{reunion.title}</Link>
                  <span className="text-texto-sutil text-xs">{reunion.project.name}</span>
                </div>
                <span className="text-texto-tenue shrink-0 text-xs tabular-nums">{formatearFecha(reunion.fecha)}</span>
              </li>
            ))}
          </ul>
          )}
    </Bloque>
  )
}

/**
 * Las horas registradas en el mes, con el reparto por {espacio} si hay más de uno.
 *
 * La barra de cada fila no lleva pista de fondo: no mide contra un tope, solo compara las filas
 * entre sí.
 */
function Horas ({ horas, mes }: { horas: NonNullable<Reporte['horas']>, mes: string }) {
  const mayor = horas.por_proyecto[0]?.segundos ?? 0

  return (
    <Bloque titulo="Horas registradas">
      <p className="text-texto font-titular text-2xl font-semibold tabular-nums">{formatearHoras(horas.total_segundos)}</p>
      {horas.total_segundos === 0 && (
        <div className="mt-1">
          <Vacio>En {nombreDelMes(mes)} no se registraron horas en tareas compartidas contigo.</Vacio>
        </div>
      )}
      {horas.por_proyecto.length > 1 && (
        <ul className="mt-4 flex flex-col gap-3">
          {horas.por_proyecto.map((fila) => (
            <li key={fila.project.id} className="flex flex-col gap-1">
              <span className="flex items-baseline justify-between gap-3 text-sm">
                <span className="text-texto min-w-0 truncate">{fila.project.name}</span>
                <span className="text-texto-tenue shrink-0 text-xs tabular-nums">{formatearHoras(fila.segundos)}</span>
              </span>
              <span aria-hidden="true" className="bg-acento block h-1.5 rounded-full" style={{ width: `${altoRelativo(fila.segundos, mayor)}%` }} />
            </li>
          ))}
        </ul>
      )}
    </Bloque>
  )
}

/** El avance de cada hito: lo cerrado sobre lo que tiene, y cuánto de eso se cerró este mes. */
function Hitos ({ hitos, mes }: { hitos: NonNullable<Reporte['hitos']>, mes: string }) {
  return (
    <Bloque titulo={`Avance por ${GLOSARIO.hito.singular.toLowerCase()}`}>
      {hitos.length === 0
        ? <Vacio>Ningún {GLOSARIO.hito.singular.toLowerCase()} tuvo movimiento en {nombreDelMes(mes)} ni tiene tareas pendientes.</Vacio>
        : (
          <ul className="grid gap-x-8 gap-y-4 sm:grid-cols-2">
            {hitos.map((hito) => (
              <li key={hito.id} className="flex min-w-0 flex-col gap-1.5">
                <span className="flex items-baseline justify-between gap-3">
                  <span className="text-texto min-w-0 truncate text-sm font-medium" title={hito.name}>{hito.name}</span>
                  <span className="text-texto shrink-0 text-sm font-semibold tabular-nums">
                    {hito.porcentaje === null ? 'Sin tareas' : `${hito.porcentaje}%`}
                  </span>
                </span>
                {hito.porcentaje !== null && <BarraProgreso porcentaje={hito.porcentaje} />}
                <span className="text-texto-sutil text-xs">
                  {hito.project.name}. {hito.cerradas} de {hito.tareas} completadas
                  {hito.cerradas_mes > 0 && `, ${hito.cerradas_mes} en ${nombreDelMes(mes)}`}.
                </span>
              </li>
            ))}
          </ul>
          )}
    </Bloque>
  )
}

/** Nombre, color y clase de leyenda de cada serie de la tendencia. */
const SERIES: Record<SerieDeReporte, { nombre: string, color: string, clave: string }> = {
  completadas: { nombre: 'Tareas completadas', color: 'var(--color-grafico-1)', clave: 'bg-grafico-1' },
  entregables: { nombre: 'Entregables', color: 'var(--color-grafico-2)', clave: 'bg-grafico-2' },
  reuniones: { nombre: 'Reuniones', color: 'var(--color-grafico-3)', clave: 'bg-grafico-3' }
}

/**
 * Los últimos seis meses, en columnas agrupadas por mes.
 *
 * Las tres series van en el mismo dibujo porque están en la misma unidad —cosas contadas— y lo que
 * se compara es justamente cuántas de cada una hubo por mes. La tabla de abajo es el mismo dato
 * para lector de pantalla.
 */
function Tendencia ({ tendencia }: { tendencia: Reporte['tendencia'] }) {
  const lectura = leerTendenciaDelReporte(tendencia)

  if (lectura === null) return null

  return (
    <Bloque titulo="Últimos seis meses">
      {lectura.vacia
        ? <Vacio>No hay tareas completadas, entregables ni reuniones en estos seis meses.</Vacio>
        : (
          <div className="flex flex-col gap-3">
            <div aria-hidden="true" className="border-grafico-rejilla flex h-44 items-end gap-2 border-b pt-5 sm:gap-6">
              {lectura.meses.map((mes) => (
                <div key={mes.mes} className="flex h-full min-w-0 flex-1 items-end justify-center gap-0.5 sm:gap-1">
                  {lectura.series.map((serie) => (
                    <span key={serie} className="relative flex h-full w-full max-w-8 flex-col justify-end">
                      <span className="text-texto-tenue mb-0.5 text-center text-[0.625rem] leading-none tabular-nums">
                        {mes.valores[serie] ?? 0}
                      </span>
                      <span
                        className="block w-full rounded-t-sm"
                        style={{ height: `${altoRelativo(mes.valores[serie] ?? 0, lectura.maximo)}%`, backgroundColor: SERIES[serie].color }}
                      />
                    </span>
                  ))}
                </div>
              ))}
            </div>
            <div aria-hidden="true" className="flex gap-2 sm:gap-6">
              {lectura.meses.map((mes) => (
                <span key={mes.mes} className="text-texto-sutil min-w-0 flex-1 text-center text-xs">{mes.rotulo}</span>
              ))}
            </div>
            <div className="flex flex-wrap gap-x-5 gap-y-1">
              {lectura.series.map((serie) => <Clave key={serie} className={SERIES[serie].clave}>{SERIES[serie].nombre}</Clave>)}
            </div>

            <div className="sr-only">
            <table>
              <caption>Últimos seis meses</caption>
              <thead>
                <tr>
                  <th scope="col">Mes</th>
                  {lectura.series.map((serie) => <th key={serie} scope="col">{SERIES[serie].nombre}</th>)}
                </tr>
              </thead>
              <tbody>
                {lectura.meses.map((mes) => (
                  <tr key={mes.mes}>
                    <th scope="row">{rotularMes(mes.mes)}</th>
                    {lectura.series.map((serie) => <td key={serie}>{mes.valores[serie] ?? 0}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          </div>
          )}
    </Bloque>
  )
}

/** La acción por omisión de un bloque vacío: volver a los {espacios}, donde está todo el detalle. */
const IR_A_PROYECTOS = { href: '/portal/proyectos', etiqueta: `Ver tus ${GLOSARIO.espacio.plural.toLowerCase()}` }

/**
 * La frase de un bloque que llegó vacío, con una sola acción siguiente.
 *
 * @param accion a dónde ir desde acá; por omisión, los {espacios} del cliente
 */
function Vacio (
  { children, accion = IR_A_PROYECTOS }: { children: React.ReactNode, accion?: { href: string, etiqueta: string } }
) {
  return (
    <div className="flex flex-col items-start gap-2">
      <p className="text-texto-tenue max-w-prose text-sm text-pretty">{children}</p>
      <Link href={accion.href} className="text-acento hover:bg-hover rounded-control -mx-2 px-2 py-1 text-sm font-semibold transition-colors">
        {accion.etiqueta}
      </Link>
    </div>
  )
}
