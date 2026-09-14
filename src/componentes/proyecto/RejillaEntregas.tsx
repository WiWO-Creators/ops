'use client'

import Link from 'next/link'
import type { ReactElement } from 'react'
import { GrupoAvatares } from '@/componentes/presentadores/Avatar'
import { Fecha } from '@/componentes/presentadores/Fecha'
import { Vacio } from '@/componentes/estado/Estados'
import { nombreDeDia, numeroDeDia } from '@/dominio/calendario'
import { cn } from '@/lib/clases'
import { estadoVencimiento } from '@/lib/fechas'
import { EstadoDeTarea } from './EstadoDeTarea'
import {
  agendaDeEntregas,
  diaDeVencimiento,
  esDelMismoMes,
  estaCompleta,
  sinFechaDeEntrega,
  TOPE_CELDA_MES
} from './calendario-entregas'
import type { Proceso } from '@/datos/recursos'
import type { CatalogoDeEstados } from '@/dominio/estados-tarea'

/**
 * Las cuatro presentaciones del calendario de entregas.
 *
 * Solo dibujan: la aritmetica de fechas vive en `calendario-entregas.ts` y la carga de datos en
 * `PanelCalendario.tsx`. La separacion es la misma que el proyecto ya usa en Gantt y en Hitos, y es
 * lo que permite probar la parte que se rompe en silencio —en que celda cae una entrega— sin montar
 * React.
 *
 * **Una entrega ocupa una sola celda: la de su vencimiento.** El tramo entre inicio y entrega no se
 * dibuja como barra a lo largo de los dias; eso es un Gantt, el Gantt del Espacio ya existe y dos
 * lineas de tiempo que se contradicen son peores que una.
 *
 * **Cada entrega es un enlace a `?tarea={id}`**, nunca un `onClick`: es el criterio del proyecto y el
 * mismo detalle que abren la tabla, el tablero y el kanban de Hitos. Un enlace se abre en otra
 * pestaña, se copia y se puede recorrer con el teclado.
 */

/** Cabecera de las siete columnas de la rejilla del mes. El primer dia es el lunes, como en Hitos. */
const CABECERAS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'] as const

/**
 * Color del borde izquierdo de la tarjeta.
 *
 * **Una entrega vencida y no completada se pinta en rojo; una entregada a tiempo, no.** Es la
 * distincion que la pestaña pide y la que ya hace `estaVencida` en la tabla de Tareas: sin el filtro
 * por estado, un Espacio terminado se veria entero en rojo y el color dejaria de decir nada.
 */
const BORDE = {
  vencido: 'border-l-relleno-peligro',
  hoy: 'border-l-relleno-aviso',
  proximo: 'border-l-acento',
  lejano: 'border-l-linea',
  'sin-fecha': 'border-l-linea',
  completa: 'border-l-relleno-exito'
} as const

interface PropsComunes {
  /** Procesos del Espacio que caen en el periodo visible. */
  tareas: Proceso[]
  /** `task_statuses` de `/lookups`. Vacio no pinta ninguna insignia. */
  estados: CatalogoDeEstados
  /** Hoy en hora local, `YYYY-MM-DD`. Entra por prop para que la rejilla no lea el reloj. */
  hoy: string
  /** URL del detalle de una entrega, con el resto de la vista conservado. */
  urlDeTarea: (id: number) => string
  /** URL de la vista de un dia concreto. La usa el "+N más" de la rejilla del mes. */
  urlDelDia: (dia: string) => string
}

/**
 * Rejilla del mes: siete columnas, semanas completas de lunes a domingo.
 *
 * **Sigue siendo una rejilla de siete columnas en pantalla angosta**, y no degrada a lista: un mes
 * partido en una columna deja de ser un mes, y para leerlo en columna ya esta la vista lista, que es
 * una de las cuatro. Lo que cambia por debajo de `sm` es el contenido de la celda: en vez de las
 * tarjetas, que a 50px de ancho son ilegibles, cada dia muestra su numero y una pastilla con cuantas
 * entregas tiene, que lleva a la vista de ese dia.
 */
export function RejillaMes ({
  dias,
  ancla,
  tareas,
  estados,
  hoy,
  urlDeTarea,
  urlDelDia
}: PropsComunes & {
  /** Los dias de la rejilla, en orden: 28, 35 o 42. */
  dias: string[]
  /** Cualquier dia del mes que se esta mirando; decide que celdas son de relleno. */
  ancla: string
}): ReactElement {
  const porDia = repartir(tareas, dias)

  return (
    <div className="border-linea rounded-tarjeta overflow-hidden border">
      <div className="border-linea bg-superficie-hundida grid grid-cols-7 border-b">
        {CABECERAS.map((nombre) => (
          <span key={nombre} className="text-texto-tenue px-1 py-1.5 text-center text-[0.6875rem] font-medium">
            {nombre}
          </span>
        ))}
      </div>

      <div className="bg-linea grid grid-cols-7 gap-px">
        {dias.map((dia) => (
          <CeldaDeMes
            key={dia}
            dia={dia}
            deOtroMes={!esDelMismoMes(dia, ancla)}
            esHoy={dia === hoy}
            tareas={porDia.get(dia) ?? []}
            estados={estados}
            urlDeTarea={urlDeTarea}
            urlDelDia={urlDelDia}
          />
        ))}
      </div>
    </div>
  )
}

/**
 * Un dia de la rejilla del mes.
 *
 * El alto minimo es fijo para que las semanas midan lo mismo aunque una tenga seis entregas y la
 * siguiente ninguna: una rejilla con filas de alturas distintas se lee como si faltaran dias.
 */
function CeldaDeMes ({
  dia,
  deOtroMes,
  esHoy,
  tareas,
  estados,
  urlDeTarea,
  urlDelDia
}: {
  dia: string
  deOtroMes: boolean
  esHoy: boolean
  tareas: Proceso[]
  estados: CatalogoDeEstados
  urlDeTarea: (id: number) => string
  urlDelDia: (dia: string) => string
}): ReactElement {
  const visibles = tareas.slice(0, TOPE_CELDA_MES)
  const excedente = tareas.length - visibles.length

  return (
    <div
      className={cn(
        'bg-superficie flex min-h-16 flex-col gap-1 p-1 sm:min-h-28 sm:p-1.5',
        deOtroMes && 'bg-superficie-hundida',
        esHoy && 'ring-acento ring-1 ring-inset'
      )}
    >
      <div className="flex items-baseline justify-between gap-1">
        <span
          className={cn(
            'text-xs font-semibold tabular-nums',
            esHoy ? 'text-acento' : deOtroMes ? 'text-texto-sutil' : 'text-texto'
          )}
        >
          {numeroDeDia(dia)}
          {esHoy && <span className="sr-only"> (hoy)</span>}
        </span>

        {/* Angosto: la cuenta es todo el contenido de la celda y lleva al dia. Desde `sm` la cuenta
            sobra porque se ven las tarjetas, y el excedente lo dice el "+N más" de abajo. */}
        {tareas.length > 0 && (
          <Link
            href={urlDelDia(dia)}
            scroll={false}
            className="bg-relleno-neutro text-relleno-neutro-contenido rounded-control hover:bg-hover px-1.5 text-[0.6875rem] tabular-nums transition-colors duration-150 sm:hidden"
          >
            {tareas.length}
            <span className="sr-only">
              {tareas.length === 1 ? ' entrega' : ' entregas'} este día
            </span>
          </Link>
        )}
      </div>

      {visibles.length > 0 && (
        <ul className="hidden flex-col gap-1 sm:flex">
          {visibles.map((tarea) => (
            <TarjetaEntrega key={tarea.id} tarea={tarea} estados={estados} href={urlDeTarea(tarea.id)} compacta />
          ))}
        </ul>
      )}

      {excedente > 0 && (
        <Link
          href={urlDelDia(dia)}
          scroll={false}
          className="text-texto-tenue hover:text-acento hidden text-left text-[0.6875rem] underline-offset-4 hover:underline sm:block"
        >
          +{excedente} más
        </Link>
      )}
    </div>
  )
}

/**
 * Columnas de dia: una por dia visible, con todas sus entregas.
 *
 * Sirve a las vistas de semana y de dia, que son la misma columna repetida siete veces o una sola.
 * Cada lista tiene scroll propio y alto tope: un dia con treinta entregas estiraria su columna y
 * dejaria las otras seis como una tira. `data-lenis-prevent` la saca del scroll suave del armazon;
 * sin eso el gesto se lo queda Lenis y la lista no se mueve.
 */
export function ColumnasDeDias ({
  dias,
  tareas,
  estados,
  hoy,
  urlDeTarea,
  urlDelDia,
  enSemana
}: PropsComunes & {
  dias: string[]
  /** Reparte en siete columnas desde `md`. En un solo dia la columna ocupa todo el ancho. */
  enSemana: boolean
}): ReactElement {
  const porDia = repartir(tareas, dias)

  return (
    <div className={cn('grid gap-2', enSemana && 'md:grid-cols-7')}>
      {dias.map((dia) => {
        const delDia = porDia.get(dia) ?? []

        return (
          <section
            key={dia}
            className={cn(
              'border-linea bg-superficie-elevada rounded-tarjeta flex min-w-0 flex-col overflow-hidden border',
              dia === hoy && 'ring-acento ring-1 ring-inset'
            )}
          >
            <header className="border-linea flex items-baseline justify-between gap-2 border-b px-2.5 py-2">
              <Link
                href={urlDelDia(dia)}
                scroll={false}
                className="hover:text-acento flex items-baseline gap-1.5 underline-offset-4 hover:underline"
              >
                <span className="text-texto-tenue text-xs font-medium capitalize">{nombreDeDia(dia)}</span>
                <span className={cn('text-sm font-semibold tabular-nums', dia === hoy ? 'text-acento' : 'text-texto')}>
                  {numeroDeDia(dia)}
                </span>
              </Link>

              {delDia.length > 0 && (
                <span className="bg-relleno-neutro text-relleno-neutro-contenido rounded-control px-1.5 text-[0.6875rem] tabular-nums">
                  {delDia.length}
                  <span className="sr-only">{delDia.length === 1 ? ' entrega' : ' entregas'} este día</span>
                </span>
              )}
            </header>

            {delDia.length === 0
              ? <p className="text-texto-sutil px-2.5 py-6 text-center text-xs">Sin entregas</p>
              : (
                <ul
                  data-lenis-prevent
                  className={cn(
                    'flex flex-col gap-1.5 overflow-y-auto p-2',
                    enSemana ? 'max-h-[28rem] min-h-24' : 'max-h-[36rem]'
                  )}
                >
                  {delDia.map((tarea) => (
                    <TarjetaEntrega key={tarea.id} tarea={tarea} estados={estados} href={urlDeTarea(tarea.id)} />
                  ))}
                </ul>
                )}
          </section>
        )
      })}
    </div>
  )
}

/**
 * Agenda: los dias del periodo que tienen entrega, uno debajo del otro.
 *
 * Es la unica de las cuatro vistas que **no dibuja los dias vacios**: una agenda de treinta lineas de
 * las que veinte dicen "sin entregas" no es una agenda, y para ver el mes completo con sus huecos
 * esta la rejilla.
 *
 * Es tambien la unica que muestra los Procesos **sin fecha de entrega**, en un bloque al final. No
 * tienen dia, asi que no hay celda posible para ellos en ninguna de las otras tres: ponerlos en "hoy"
 * o en el dia 1 seria afirmar un plazo que nadie fijo. Aca no se les inventa una fecha, se los nombra
 * aparte — porque desaparecer en silencio de un calendario de entregas es peor que no tener lugar.
 */
export function AgendaEntregas ({
  dias,
  tareas,
  todas,
  estados,
  hoy,
  urlDeTarea,
  urlDelDia
}: PropsComunes & {
  dias: string[]
  /**
   * Todos los Procesos del Espacio, no solo los del periodo.
   *
   * El bloque "sin fecha" sale de aca: una entrega sin plazo no pertenece a ningun mes, asi que
   * filtrarla por el periodo visible la haria aparecer y desaparecer segun el mes que se mire.
   */
  todas: Proceso[]
}): ReactElement {
  const agenda = agendaDeEntregas(tareas, dias)
  const sinFecha = sinFechaDeEntrega(todas)

  return (
    <div className="flex flex-col gap-3">
      {agenda.length === 0
        ? (
          <Vacio
            titulo="Sin entregas en este período"
            // Sin el término del glosario: "Proceso" y "Tarea" no tienen el mismo género, y un
            // "ningún" fijo se lee mal en cuanto el glosario cambia de palabra.
            descripcion="Nada vence en estas fechas. Cambia de período o revisa el bloque de abajo."
            className="border-linea rounded-tarjeta border border-dashed"
          />
          )
        : (
          <ol className="flex flex-col gap-3">
            {agenda.map((jornada) => (
              <li key={jornada.dia} className="border-linea bg-superficie-elevada rounded-tarjeta overflow-hidden border">
                <header
                  className={cn(
                    'border-linea flex items-baseline justify-between gap-2 border-b px-3 py-2',
                    jornada.dia === hoy && 'bg-superficie-hundida'
                  )}
                >
                  <Link
                    href={urlDelDia(jornada.dia)}
                    scroll={false}
                    className="hover:text-acento flex items-baseline gap-2 underline-offset-4 hover:underline"
                  >
                    <span
                      className={cn(
                        'text-sm font-semibold capitalize',
                        jornada.dia === hoy ? 'text-acento' : 'text-texto'
                      )}
                    >
                      {nombreDeDia(jornada.dia)} {numeroDeDia(jornada.dia)}
                    </span>
                    {jornada.dia === hoy && <span className="text-texto-aviso text-xs font-medium">Hoy</span>}
                  </Link>

                  <span className="text-texto-tenue text-xs tabular-nums">
                    {jornada.tareas.length} {jornada.tareas.length === 1 ? 'entrega' : 'entregas'}
                  </span>
                </header>

                <ul className="flex flex-col gap-1.5 p-2">
                  {jornada.tareas.map((tarea) => (
                    <TarjetaEntrega key={tarea.id} tarea={tarea} estados={estados} href={urlDeTarea(tarea.id)} />
                  ))}
                </ul>
              </li>
            ))}
          </ol>
          )}

      {sinFecha.length > 0 && (
        <section className="border-linea rounded-tarjeta border border-dashed p-3">
          <h3 className="text-texto text-sm font-semibold">Sin fecha de entrega ({sinFecha.length})</h3>
          <p className="text-texto-tenue mt-1 text-xs">
            No tienen vencimiento, así que no ocupan ningún día del calendario. Se listan acá para que
            no desaparezcan al cambiar de vista.
          </p>

          <ul data-lenis-prevent className="mt-2 flex max-h-72 flex-col gap-1.5 overflow-y-auto">
            {sinFecha.map((tarea) => (
              <TarjetaEntrega key={tarea.id} tarea={tarea} estados={estados} href={urlDeTarea(tarea.id)} />
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}

/**
 * Una entrega dentro de su dia.
 *
 * El borde izquierdo es el unico color de la tarjeta, para que un dia lleno se lea de un vistazo:
 * verde lo ya completado, rojo lo vencido y sin completar, ambar lo de hoy, acento lo que vence
 * dentro de tres dias. El nombre va tachado cuando esta completo, igual que en el kanban de Hitos.
 *
 * `compacta` es la version de la rejilla del mes, donde la celda mide unos 100px: se cae el estado y
 * los avatares, y el nombre se recorta en una linea. La informacion completa esta a un clic, en la
 * vista del dia o en el detalle.
 */
export function TarjetaEntrega ({
  tarea,
  estados,
  href,
  compacta = false
}: {
  tarea: Proceso
  estados: CatalogoDeEstados
  href: string
  compacta?: boolean
}): ReactElement {
  const completa = estaCompleta(tarea)
  const tono = completa ? 'completa' : estadoVencimiento(diaDeVencimiento(tarea))
  const vencida = tono === 'vencido'

  return (
    <li>
      <Link
        href={href}
        scroll={false}
        className={cn(
          'rounded-chico bg-superficie hover:bg-hover flex flex-col gap-1 border-l-2 transition-colors duration-150',
          compacta ? 'px-1.5 py-1' : 'p-2',
          BORDE[tono]
        )}
      >
        <span
          className={cn(
            'text-xs leading-snug',
            compacta && 'truncate',
            completa ? 'text-texto-tenue line-through' : 'text-texto font-medium'
          )}
        >
          {tarea.name}
        </span>

        {!compacta && (
          <>
            <span className="text-texto-sutil flex flex-wrap items-center gap-x-2 gap-y-1 text-[0.6875rem]">
              <EstadoDeTarea status={tarea.status} catalogo={estados} />
              {vencida && (
                <span className="text-texto-peligro font-medium">
                  Vencido
                </span>
              )}
              {tarea.patente !== null && <span className="tabular-nums">{tarea.patente}</span>}
              <Fecha valor={tarea.due_date} comoVencimiento className="text-[0.6875rem]" />
            </span>

            {tarea.assignees.length > 0 && <GrupoAvatares personas={tarea.assignees} maximo={3} />}
          </>
        )}
      </Link>
    </li>
  )
}

/**
 * Reparte los Procesos en la celda de su fecha de entrega.
 *
 * Devuelve **todos** los dias como clave, aunque su lista quede vacia: la rejilla necesita dibujar el
 * dia sin entregas, no saltearlo. Dentro de cada dia se ordena por nombre para que el orden no
 * dependa de como la API devolvio las filas.
 *
 * @param tareas Procesos del Espacio.
 * @param dias Dias visibles, en orden.
 * @returns Un mapa dia -> entregas de ese dia.
 */
function repartir (tareas: readonly Proceso[], dias: readonly string[]): Map<string, Proceso[]> {
  const grupos = new Map<string, Proceso[]>(dias.map((dia) => [dia, []]))

  for (const tarea of tareas) {
    const clave = diaDeVencimiento(tarea)

    if (clave === null) continue

    grupos.get(clave)?.push(tarea)
  }

  for (const grupo of grupos.values()) {
    grupo.sort((una, otra) => una.name.localeCompare(otra.name, 'es'))
  }

  return grupos
}
