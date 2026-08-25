'use client'

import { useEffect, useId, useRef, useState, type ReactElement, type RefObject } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { TriangleAlert } from 'lucide-react'
import { Cargando, ErrorEstado, Vacio } from '@/componentes/estado/Estados'
import { GLOSARIO } from '@/dominio/glosario'
import { cn } from '@/lib/clases'
import { formatearFecha, hoyLocal } from '@/lib/fechas'
import { useRecurso } from './carga'
import {
  ALTO_FILA,
  ANCHO_NOMBRES,
  PASO_FILA,
  ZOOMS,
  altoDeGantt,
  anchoDeGantt,
  describirDependencias,
  esZoomGantt,
  filasDeGantt,
  flechasDeGantt,
  marcasDeGantt,
  posicionDeHoy,
  rangoDeGantt,
  zoomSugerido,
  type FilaGantt,
  type MarcaGantt,
  type ZoomGantt
} from './gantt'
import type { AgrupacionGantt, GrupoGantt, Lookups } from '@/datos/recursos'

/**
 * Pestaña Diagrama de Gantt del Proyecto.
 *
 * Se dibuja con CSS propio y **sin dependencias nuevas**: cada fila es una pista de ancho completo y
 * cada barra un bloque posicionado en porcentaje sobre la linea de tiempo. Una libreria de Gantt
 * traeria arrastre que esta pantalla no pide, un modelo de dependencias peor que el nuestro y un
 * paquete mas que mantener.
 *
 * Toda la geometria —alto de fila, ancho de la columna de nombres, columnas de la escala, trazado de
 * las flechas— vive en `gantt.ts`. Este archivo solo pinta: cuando necesita un numero de esa
 * geometria lo lee de la constante y lo pone en `style`, en vez de repetirlo en una clase de
 * Tailwind que se puede desincronizar sin que nadie se entere.
 *
 * Las flechas van en un SVG que cubre la columna de pistas. Por eso el ancho de esa columna se mide
 * con un `ResizeObserver` en vez de dejarlo en porcentaje: un SVG estirado con
 * `preserveAspectRatio="none"` habria evitado la medicion, pero deforma las puntas y el grosor del
 * trazo, que es justo lo que hace legible una flecha.
 *
 * Los grupos sin tareas no llegan: los omite la API, igual que el panel.
 */

/** Las tres agrupaciones del panel, con su etiqueta. `milestones` es la de por defecto. */
const AGRUPACIONES = [
  { valor: 'milestones', etiqueta: GLOSARIO.hito.plural },
  { valor: 'members', etiqueta: 'Miembros' },
  { valor: 'status', etiqueta: 'Estado' }
] as const

/** Etiqueta visible de cada zoom. */
const NOMBRE_ZOOM: Record<ZoomGantt, string> = {
  dia: 'Día',
  semana: 'Semana',
  mes: 'Mes',
  anio: 'Año'
}

/** Parametros con los que el diagrama guarda su estado en la URL. */
const PARAMETRO = { agrupar: 'gantt-agrupar', zoom: 'gantt-zoom', estado: 'gantt-estado' } as const

/**
 * Alto de cada una de las dos filas de la escala, en pixeles.
 *
 * Se declara aca y no como clase porque la capa de fondo —grilla, cebrado y marcador de hoy— tiene
 * que empezar justo debajo de la escala, y esa resta ocurre en JavaScript.
 */
const ALTO_ESCALA = 20

/** True si la fila lleva el tono del cebrado. Se aplica igual en las dos columnas. */
function esCebrada (indice: number): boolean {
  return indice % 2 === 1
}

export function PanelGantt ({ proyectoId }: { proyectoId: number }): ReactElement {
  const router = useRouter()
  const params = useSearchParams()

  const pedida = params.get(PARAMETRO.agrupar)
  const agrupar: AgrupacionGantt = AGRUPACIONES.some((o) => o.valor === pedida)
    ? pedida as AgrupacionGantt
    : 'milestones'

  const estados = leerEstados(params.get(PARAMETRO.estado))
  const { estado, recargar } = useRecurso<GrupoGantt[]>(
    rutaDelGantt(proyectoId, agrupar, estados),
    'No se pudo cargar el diagrama de Gantt.'
  )
  const lookups = useRecurso<Lookups>('lookups', 'No se pudieron cargar los estados.')

  /** Escribe un parametro del diagrama en la URL conservando el resto de la vista. */
  function elegir (clave: string, valor: string | null): void {
    const siguientes = new URLSearchParams(params.toString())

    if (valor === null) siguientes.delete(clave)
    else siguientes.set(clave, valor)

    router.replace(`?${siguientes.toString()}`, { scroll: false })
  }

  /** Suma o quita un estado del filtro. Sin ninguno, la API devuelve todos. */
  function alternarEstado (id: number): void {
    const siguientes = estados.includes(id) ? estados.filter((n) => n !== id) : [...estados, id]

    elegir(PARAMETRO.estado, siguientes.length === 0 ? null : siguientes.join(','))
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        <Segmentado
          etiqueta="Agrupar por"
          opciones={AGRUPACIONES.map((o) => ({ valor: o.valor, etiqueta: o.etiqueta }))}
          activo={agrupar}
          onElegir={(valor) => { elegir(PARAMETRO.agrupar, valor) }}
        />

        <Segmentado
          etiqueta="Escala"
          opciones={ZOOMS.map((z) => ({ valor: z, etiqueta: NOMBRE_ZOOM[z] }))}
          activo={params.get(PARAMETRO.zoom)}
          onElegir={(valor) => { elegir(PARAMETRO.zoom, valor) }}
        />

        {lookups.estado.fase === 'listo' && (
          <FiltroEstados
            opciones={lookups.estado.datos.task_statuses}
            elegidos={estados}
            onAlternar={alternarEstado}
          />
        )}
      </div>

      {estado.fase === 'cargando' && <Cargando filas={6} />}
      {estado.fase === 'error' && <ErrorEstado detalle={estado.mensaje} onReintentar={recargar} />}
      {estado.fase === 'listo' && (
        <Diagrama grupos={estado.datos} zoomPedido={params.get(PARAMETRO.zoom)} />
      )}
    </div>
  )
}

/**
 * Ruta del diagrama en la API, con el filtro por estado si lo hay.
 *
 * @param proyectoId id del proyecto
 * @param agrupar como se agrupan las filas
 * @param estados ids de `task_statuses` elegidos; vacio significa "todos"
 * @returns la ruta relativa que consume `useRecurso`
 */
function rutaDelGantt (proyectoId: number, agrupar: AgrupacionGantt, estados: number[]): string {
  const consulta = new URLSearchParams({ agrupar })
  if (estados.length > 0) consulta.set('filter[status]', estados.join(','))

  return `projects/${String(proyectoId)}/gantt?${consulta.toString()}`
}

/**
 * Lee la lista de estados del parametro de la URL.
 *
 * @param valor el texto del parametro, o `null` si no venia
 * @returns los ids validos, sin repetidos y en orden; una lista vacia si el parametro es basura
 */
function leerEstados (valor: string | null): number[] {
  if (valor === null) return []

  const ids = valor
    .split(',')
    .map((parte) => Number.parseInt(parte, 10))
    .filter((id) => Number.isInteger(id) && id > 0)

  return [...new Set(ids)].sort((a, b) => a - b)
}

/**
 * Control de una sola eleccion, con aspecto de control segmentado.
 *
 * @param etiqueta nombre del grupo; tambien es el `aria-label` del contenedor
 * @param opciones las alternativas, en el orden en que se muestran
 * @param activo valor elegido; cuando no coincide con ninguno no se marca ninguno
 * @param onElegir que hacer al elegir
 */
function Segmentado ({
  etiqueta,
  opciones,
  activo,
  onElegir
}: {
  etiqueta: string
  opciones: Array<{ valor: string, etiqueta: string }>
  activo: string | null
  onElegir: (valor: string) => void
}): ReactElement {
  return (
    <div className="flex items-center gap-2">
      <span className="text-texto-sutil text-xs font-medium">{etiqueta}</span>
      <div
        role="group"
        aria-label={etiqueta}
        className="bg-superficie-hundida rounded-control inline-flex gap-0.5 p-0.5"
      >
        {opciones.map((opcion) => (
          <button
            key={opcion.valor}
            type="button"
            aria-pressed={opcion.valor === activo}
            onClick={() => { onElegir(opcion.valor) }}
            className={cn(
              'rounded-control px-2.5 py-1 text-xs font-medium transition-colors',
              opcion.valor === activo
                ? 'bg-superficie-elevada text-texto shadow-1'
                : 'text-texto-tenue hover:text-texto'
            )}
          >
            {opcion.etiqueta}
          </button>
        ))}
      </div>
    </div>
  )
}

/**
 * Filtro por estado de tarea: fichas que se encienden y se apagan.
 *
 * Se distingue a proposito del control segmentado de al lado: ahi se elige una cosa, aca se
 * enciende cualquier combinacion. Sin ninguna encendida el diagrama muestra todas.
 *
 * @param opciones los estados del catalogo
 * @param elegidos los ids encendidos
 * @param onAlternar que hacer al tocar uno
 */
function FiltroEstados ({
  opciones,
  elegidos,
  onAlternar
}: {
  opciones: Array<{ id: number, name: string }>
  elegidos: number[]
  onAlternar: (id: number) => void
}): ReactElement {
  return (
    <div className="flex items-center gap-2">
      <span className="text-texto-sutil text-xs font-medium">Estado</span>
      <div role="group" aria-label="Filtrar por estado" className="flex flex-wrap gap-1">
        {opciones.map((opcion) => {
          const activo = elegidos.includes(opcion.id)

          return (
            <button
              key={opcion.id}
              type="button"
              aria-pressed={activo}
              onClick={() => { onAlternar(opcion.id) }}
              className={cn(
                'rounded-control border px-2.5 py-1 text-xs font-medium transition-colors',
                activo
                  ? 'border-acento bg-acento-suave text-texto'
                  : 'border-linea text-texto-tenue hover:bg-hover hover:text-texto'
              )}
            >
              {opcion.name}
            </button>
          )
        })}
      </div>
    </div>
  )
}

/**
 * Mide el ancho de un elemento y lo mantiene al dia.
 *
 * @returns la referencia que hay que colgar del elemento y su ancho en pixeles, 0 hasta la primera
 *          medicion
 */
function useAnchoMedido (): [RefObject<HTMLDivElement | null>, number] {
  const referencia = useRef<HTMLDivElement | null>(null)
  const [ancho, setAncho] = useState(0)

  useEffect(() => {
    const nodo = referencia.current
    if (nodo === null) return

    const observador = new ResizeObserver((entradas) => {
      const entrada = entradas[0]
      if (entrada !== undefined) setAncho(entrada.contentRect.width)
    })

    observador.observe(nodo)

    return () => { observador.disconnect() }
  }, [])

  return [referencia, ancho]
}

/**
 * El diagrama en si: la escala, la columna de nombres, la de pistas y las flechas encima.
 *
 * @param grupos los grupos ya cargados
 * @param zoomPedido el zoom que venia en la URL, o `null` para el que sugiere la duracion
 * @returns la grilla de pistas, o el estado vacio si nada tiene fechas que dibujar
 */
function Diagrama ({
  grupos,
  zoomPedido
}: {
  grupos: GrupoGantt[]
  zoomPedido: string | null
}): ReactElement {
  const [caja, anchoCaja] = useAnchoMedido()
  const idResumen = useId()
  // El dia se congela al montar: recalcularlo en cada render movería el marcador de hoy y la marca
  // de vencida en medio de una sesion abierta desde ayer, sin que nada mas cambie en pantalla.
  const [hoy] = useState(() => hoyLocal())
  const rango = rangoDeGantt(grupos)

  const zoom: ZoomGantt = esZoomGantt(zoomPedido)
    ? zoomPedido
    : rango === null ? 'mes' : zoomSugerido(rango)

  if (rango === null) {
    return (
      <Vacio
        titulo="Sin fechas que mostrar"
        descripcion={`Ninguna ${GLOSARIO.proceso.singular.toLowerCase()} de este proyecto tiene fecha de inicio o de entrega.`}
      />
    )
  }

  const marcas = marcasDeGantt(rango, zoom)
  const filas = filasDeGantt(grupos, rango, hoy)
  const ancho = anchoDeGantt(marcas.length, zoom, Math.max(0, anchoCaja - ANCHO_NOMBRES))
  const flechas = flechasDeGantt(filas, ancho)
  const dependencias = describirDependencias(filas)
  const alto = altoDeGantt(filas.length)
  const hoyEnDiagrama = posicionDeHoy(rango, hoy)
  // Se cuentan tareas y no filas: con `agrupar=members` la misma tarea aparece en la fila de cada
  // persona asignada, y contarla dos veces diria que hay mas trabajo del que hay.
  const tareas = new Set(filas.filter((fila) => fila.tareaId !== null).map((fila) => fila.tareaId))
  const vencidas = new Set(
    filas.filter((fila) => fila.vencida).map((fila) => fila.tareaId)
  ).size

  return (
    <figure
      aria-describedby={idResumen}
      className="border-linea bg-superficie-elevada rounded-tarjeta shadow-1 flex flex-col gap-3 border p-4"
    >
      <div ref={caja} className="overflow-x-auto">
        <div className="flex min-w-max">
          <div
            className="bg-superficie-elevada border-linea sticky left-0 z-20 shrink-0 border-r"
            style={{ width: ANCHO_NOMBRES }}
          >
            <div className="border-linea border-b" style={{ height: ALTO_ESCALA * 2 }} />

            {filas.map((fila, indice) => (
              <div
                key={fila.clave}
                className={cn(
                  'flex items-center gap-1 pr-2',
                  // La sangria vive en la fila y no en el texto: asi el aviso de vencida no corre el
                  // nombre unos pixeles y rompe la columna.
                  fila.esGrupo ? 'pl-0' : 'pl-3',
                  esCebrada(indice) && 'bg-superficie'
                )}
                style={{ height: PASO_FILA }}
              >
                {fila.vencida && (
                  <TriangleAlert
                    aria-hidden="true"
                    className="text-texto-peligro size-3.5 shrink-0"
                  />
                )}
                <span
                  title={fila.titulo}
                  className={cn(
                    'truncate text-xs',
                    fila.esGrupo && 'text-texto font-semibold',
                    !fila.esGrupo && (fila.vencida ? 'text-texto-peligro' : 'text-texto-tenue')
                  )}
                >
                  {fila.titulo}
                </span>
              </div>
            ))}
          </div>

          <div className="relative shrink-0" style={{ width: ancho }}>
            <Escala marcas={marcas} hoy={hoyEnDiagrama} />

            <div className="relative" style={{ height: alto }}>
              <Fondo marcas={marcas} filas={filas.length} hoy={hoyEnDiagrama} />

              {filas.map((fila) => <Pista key={fila.clave} fila={fila} />)}

              {flechas.length > 0 && (
                <svg
                  width={ancho}
                  height={alto}
                  viewBox={`0 0 ${ancho} ${alto}`}
                  aria-hidden="true"
                  focusable="false"
                  className="pointer-events-none absolute inset-x-0 top-0"
                >
                  {flechas.map((flecha) => (
                    <g key={flecha.clave}>
                      {/* Un trazo grueso del color del fondo separa la flecha de las barras que
                          cruza: sin ese halo, dos lineas sobre una barra oscura se vuelven una
                          mancha. */}
                      <path d={flecha.d} fill="none" strokeWidth={4} strokeLinejoin="round" className="stroke-superficie-elevada" />
                      <path d={flecha.d} fill="none" strokeWidth={1.5} strokeLinejoin="round" className="stroke-texto-sutil" />
                      <path d={flecha.punta} strokeWidth={1.5} strokeLinejoin="round" className="fill-texto-sutil stroke-superficie-elevada" />
                    </g>
                  ))}
                </svg>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="text-texto-sutil flex flex-wrap gap-x-4 gap-y-1 text-xs">
        {flechas.length > 0 && (
          <span>Cada flecha va de la {GLOSARIO.proceso.singular.toLowerCase()} que bloquea a la que espera.</span>
        )}
        {hoyEnDiagrama !== null && (
          <span className="flex items-center gap-1.5">
            <span aria-hidden="true" className="bg-acento-2 inline-block h-3 w-0.5" />
            Hoy
          </span>
        )}
        {vencidas > 0 && (
          <span className="text-texto-peligro flex items-center gap-1.5">
            <TriangleAlert aria-hidden="true" className="size-3.5" />
            {vencidas === 1
              ? `1 ${GLOSARIO.proceso.singular.toLowerCase()} vencida`
              : `${String(vencidas)} ${GLOSARIO.proceso.plural.toLowerCase()} vencidas`}
          </span>
        )}
      </div>

      <figcaption id={idResumen} className="sr-only">
        <p>
          Diagrama de Gantt de {tareas.size}{' '}
          {GLOSARIO.proceso.plural.toLowerCase()} entre {formatearFecha(fechaDeDia(rango.inicio))} y{' '}
          {formatearFecha(fechaDeDia(rango.fin))}, en escala de {NOMBRE_ZOOM[zoom].toLowerCase()}.
        </p>
        {vencidas > 0 && (
          <p>
            {vencidas === 1
              ? `1 ${GLOSARIO.proceso.singular.toLowerCase()} está vencida.`
              : `${String(vencidas)} ${GLOSARIO.proceso.plural.toLowerCase()} están vencidas.`}
          </p>
        )}
        {dependencias.length === 0
          ? <p>Ninguna {GLOSARIO.proceso.singular.toLowerCase()} depende de otra.</p>
          : (
            <>
              <p>Dependencias:</p>
              <ul>
                {dependencias.map((frase, indice) => <li key={`${String(indice)}-${frase}`}>{frase}</li>)}
              </ul>
            </>
            )}
      </figcaption>
    </figure>
  )
}

/**
 * Las dos filas de etiquetas de la linea de tiempo.
 *
 * La de arriba nombra el periodo y solo aparece cuando el periodo cambia —asi se lee "abr 2026" una
 * vez y no treinta—; la de abajo nombra cada columna. Es lo que faltaba para saber en que mes cae
 * una barra sin contar cuadraditos.
 *
 * @param marcas las columnas de la escala
 * @param hoy posicion del dia de hoy en porcentaje, o `null` si queda fuera del diagrama
 */
function Escala ({ marcas, hoy }: { marcas: MarcaGantt[], hoy: number | null }): ReactElement {
  return (
    <div className="border-linea relative border-b" style={{ height: ALTO_ESCALA * 2 }}>
      <div className="relative" style={{ height: ALTO_ESCALA }}>
        {marcas
          .filter((marca) => marca.periodo !== null)
          .map((marca) => (
            <span
              key={marca.clave}
              className="text-texto absolute top-0 pl-1.5 text-xs leading-5 font-semibold whitespace-nowrap"
              style={{ left: `${marca.izquierda}%` }}
            >
              {marca.periodo}
            </span>
          ))}

        {hoy !== null && (
          <span
            className="text-acento-2 absolute top-0 -translate-x-1/2 text-xs leading-5 font-medium"
            style={{ left: `${hoy}%` }}
          >
            Hoy
          </span>
        )}
      </div>

      <div className="relative" style={{ height: ALTO_ESCALA }}>
        {marcas.map((marca) => (
          <span
            key={marca.clave}
            className="text-texto-sutil absolute top-0 overflow-hidden text-center text-xs leading-5 tabular-nums"
            style={{ left: `${marca.izquierda}%`, width: `${marca.ancho}%` }}
          >
            {marca.unidad}
          </span>
        ))}
      </div>
    </div>
  )
}

/**
 * Capa de fondo del area de pistas: cebrado, grilla vertical y marcador de hoy.
 *
 * Va debajo de las barras a proposito. El marcador de hoy tiene que estar siempre a la vista, pero
 * si se dibujara encima competiria con la barra que cruza; abajo se lee en los huecos, que es donde
 * hace falta.
 *
 * @param marcas las columnas de la escala
 * @param filas cuantas filas se dibujan
 * @param hoy posicion del dia de hoy en porcentaje, o `null` si queda fuera del diagrama
 */
function Fondo ({
  marcas,
  filas,
  hoy
}: {
  marcas: MarcaGantt[]
  filas: number
  hoy: number | null
}): ReactElement {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
      {Array.from({ length: filas }, (_, indice) => (
        esCebrada(indice) && (
          <span
            key={indice}
            className="bg-superficie absolute inset-x-0 block"
            style={{ top: indice * PASO_FILA, height: PASO_FILA }}
          />
        )
      ))}

      {marcas.map((marca, indice) => indice === 0
        ? null
        : (
          <span
            key={marca.clave}
            className={cn(
              'absolute inset-y-0 block w-px',
              marca.limite ? 'bg-linea' : 'bg-grafico-rejilla'
            )}
            style={{ left: `${marca.izquierda}%` }}
          />
          ))}

      {hoy !== null && (
        <span className="bg-acento-2 absolute inset-y-0 block w-0.5" style={{ left: `${hoy}%` }} />
      )}
    </div>
  )
}

/**
 * Una fila del diagrama sobre la linea de tiempo.
 *
 * El grupo se dibuja como un riel fino y la tarea como una barra completa: la jerarquia la marca el
 * peso de la marca, no un tamaño de fila distinto. Todas las filas miden `PASO_FILA` porque la
 * geometria de las flechas cuenta filas, y la pista queda centrada dentro de esa banda.
 */
function Pista ({ fila }: { fila: FilaGantt }): ReactElement {
  const posicion = fila.barra === null
    ? undefined
    : { left: `${fila.barra.izquierda}%`, width: `${fila.barra.ancho}%` }

  if (fila.esGrupo) {
    return (
      <div className="relative flex items-center" style={{ height: PASO_FILA }}>
        <span className="relative block h-1.5 w-full">
          {posicion !== undefined && (
            <span className="bg-acento-suave rounded-control absolute inset-y-0 block" style={posicion} />
          )}
        </span>
      </div>
    )
  }

  const vencimiento = fila.vencida ? ' — vencida' : ''

  return (
    <div className="relative flex items-center" style={{ height: PASO_FILA }}>
      <span className="bg-superficie-hundida rounded-chico relative block w-full" style={{ height: ALTO_FILA }}>
        {posicion !== undefined && (
          <span
            className={cn(
              'rounded-chico absolute inset-y-0 block',
              fila.color === null && 'bg-acento',
              // El contorno marca la tarea vencida sin pisar su color de estado, que es un dato.
              fila.vencida && 'text-texto-peligro outline-1 outline-current'
            )}
            style={{
              ...posicion,
              // El color lo elige quien administra los estados en el panel: es un dato de la API, no
              // un token del sistema, y por eso va en `style` y no en una clase.
              ...(fila.color === null ? {} : { backgroundColor: fila.color })
            }}
            title={`${formatearFecha(fila.desde)} → ${formatearFecha(fila.hasta)}${vencimiento}`}
          />
        )}
      </span>
    </div>
  )
}

/**
 * Convierte un dia UTC desde la epoca de vuelta a `YYYY-MM-DD`.
 *
 * @param dia el dia que devuelve `rangoDeGantt`
 * @returns la fecha en el formato del contrato
 */
function fechaDeDia (dia: number): string {
  return new Date(dia * 86400000).toISOString().slice(0, 10)
}
