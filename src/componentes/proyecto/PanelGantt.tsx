'use client'

import { useEffect, useId, useRef, useState, type ReactElement, type RefObject } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { TriangleAlert } from 'lucide-react'
import { Segmentado } from '@/componentes/formularios/Segmentado'
import { Boton } from '@/componentes/formularios/Boton'
import { Cargando, ErrorEstado, Vacio } from '@/componentes/estado/Estados'
import { GLOSARIO } from '@/dominio/glosario'
import { cn } from '@/lib/clases'
import { formatearFecha, hoyLocal } from '@/lib/fechas'
import { useRecurso } from './carga'
import {
  ALTO_FILA,
  ANCHO_NOMBRES,
  ESTADO_COMPLETA,
  PASO_FILA,
  ZOOMS,
  altoDeGantt,
  anchoDeGantt,
  contarCompletadasDeGantt,
  contarFueraDeVentanaDeGantt,
  describirDependencias,
  esZoomGantt,
  filasDeGantt,
  flechasDeGantt,
  lecturasDelGantt,
  marcasDeGantt,
  ocultarCompletadasDeGantt,
  posicionDeHoy,
  rangoDeGantt,
  recortarGanttAVentana,
  ventanaDeGantt,
  zoomSugerido,
  type FilaGantt,
  type MarcaGantt,
  type RangoGantt,
  type ZoomGantt
} from './gantt'
import { ExportarGantt } from './ExportarGantt'
import { NOMBRE_DE_AGRUPACION, NOMBRE_DE_ZOOM } from './exportar-gantt'
import type { AgrupacionGantt, GrupoGantt, Lookups } from '@/datos/recursos'
import { conConsulta, type FuenteDeProyecto } from '@/dominio/fuente-proyecto'

/**
 * Pestaña Diagrama de Gantt del Proyecto.
 *
 * **El mismo lo abren el equipo y el cliente.** Lo unico que cambia es de donde bajan los grupos
 * —`fuente`— y que agrupaciones acepta cada contrato, que resuelve `lecturasDelGantt`: acá no hay
 * ninguna rama por sujeto. El diagrama no se arrastra para nadie (ver abajo), asi que no hay nada
 * que apagar en el portal mas alla de lo que el endpoint no atiende.
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
 *
 * **Ocultar completadas** se resuelve en el cliente: los datos ya traen el estado de cada tarea, asi
 * que esconderlas no necesita otra vuelta a la API. Arranca apagado por el mismo motivo que el
 * checkbox de la pestaña Hitos (ver el docblock de `PanelHitos.tsx`): al entrar a la pestaña se ve
 * todo, y esconder es una decision explicita que ademas se anuncia al pie del diagrama.
 *
 * El interruptor y la ficha "Completa" del filtro por estado se apagan entre si. Son dos formas de
 * hablar del mismo estado y, encendidas a la vez, se piden dos cosas incompatibles —solo completadas
 * y ninguna completada— que dejarian el diagrama vacio sin nada que lo explique.
 *
 * **Abre en las proximas dos semanas**: la linea de tiempo por defecto va de hoy a trece dias
 * despues (`ventanaDeGantt`), y solo entran las tareas con algun dia dentro. Ver el proyecto entero
 * es el control "Ver"; lo que queda fuera de la ventana se anuncia al pie, como las completadas.
 */

/** Parametros con los que el diagrama guarda su estado en la URL. */
const PARAMETRO = {
  agrupar: 'gantt-agrupar',
  zoom: 'gantt-zoom',
  estado: 'gantt-estado',
  completadas: 'gantt-completadas',
  ventana: 'gantt-ventana'
} as const

/**
 * Valor con el que la URL pide ver el proyecto entero en vez de las proximas dos semanas.
 *
 * Sin el parametro se ve la ventana desde hoy: es el valor por defecto y no ensucia el enlace.
 */
const VENTANA_TODO = 'todo'

/** Opciones del control "Ver". `semanas` nunca viaja a la URL: es la ausencia del parametro. */
const OPCIONES_VENTANA = [
  { valor: 'semanas', etiqueta: 'Próximas 2 semanas' },
  { valor: VENTANA_TODO, etiqueta: 'Todo el proyecto' }
]

/**
 * Valor con el que la URL pide esconder las completadas.
 *
 * Es un valor con nombre y no un `1` porque el enlace del diagrama se comparte: `gantt-completadas=
 * ocultas` se entiende leyendo la barra de direcciones. Sin el parametro se ve todo.
 */
const COMPLETADAS_OCULTAS = 'ocultas'

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

/**
 * @param proyectoId El Proyecto que se esta mirando. Lo usa la exportacion para nombrar el archivo.
 * @param fuente De donde bajan los grupos del diagrama. Ver `dominio/fuente-proyecto.ts`.
 * @returns El diagrama con sus controles.
 */
export function PanelGantt ({
  proyectoId,
  fuente
}: {
  proyectoId: number
  fuente: FuenteDeProyecto
}): ReactElement {
  const router = useRouter()
  const params = useSearchParams()

  // Las etiquetas salen de `exportar-gantt.ts` y no se escriben acá: el pie del archivo exportado
  // dice por cual esta agrupado el diagrama, y dos copias del mismo nombre se separan en el primer
  // renombre.
  const agrupaciones = lecturasDelGantt(fuente).agrupaciones
  const pedida = params.get(PARAMETRO.agrupar)
  const agrupar: AgrupacionGantt = agrupaciones.includes(pedida as AgrupacionGantt)
    ? pedida as AgrupacionGantt
    : 'milestones'

  const estados = leerEstados(params.get(PARAMETRO.estado))
  const ocultarCompletadas = params.get(PARAMETRO.completadas) === COMPLETADAS_OCULTAS
  const { estado, recargar } = useRecurso<GrupoGantt[]>(
    rutaDelGantt(fuente, agrupar, estados),
    'No se pudo cargar el Gantt.'
  )
  const lookups = useRecurso<Lookups>(fuente.lookups, 'No se pudieron cargar los estados.')

  // El dia se congela al montar: recalcularlo en cada render movería el marcador de hoy y la marca
  // de vencida en medio de una sesion abierta desde ayer, sin que nada mas cambie en pantalla.
  const [hoy] = useState(() => hoyLocal())
  const recibidos = estado.fase === 'listo' ? estado.datos : []
  const completadas = contarCompletadasDeGantt(recibidos)
  // Todo lo que sigue —rango, escala sugerida, filas, contadores y exportacion— trabaja sobre los
  // grupos ya filtrados: si la linea de tiempo siguiera cubriendo tareas escondidas, el diagrama
  // abriria meses vacios que nadie puede explicar mirando la pantalla.
  const sinCompletadas = ocultarCompletadas ? ocultarCompletadasDeGantt(recibidos) : recibidos
  const verTodo = params.get(PARAMETRO.ventana) === VENTANA_TODO
  const ventana = verTodo ? null : ventanaDeGantt(hoy)
  const grupos = ventana === null ? sinCompletadas : recortarGanttAVentana(sinCompletadas, ventana)
  const fueraDeVentana = ventana === null ? 0 : contarFueraDeVentanaDeGantt(sinCompletadas, ventana)
  // Con ventana la linea de tiempo es fija aunque las tareas no la llenen: hoy siempre queda a la
  // izquierda y las dos semanas se leen con la misma escala todos los dias.
  const rango = ventana === null
    ? rangoDeGantt(grupos)
    : grupos.length > 0 ? ventana : null
  const zoomPedido = params.get(PARAMETRO.zoom)
  // El zoom se resuelve acá y no dentro del diagrama porque el archivo exportado tiene que salir en
  // la misma escala que se esta viendo.
  const zoom: ZoomGantt = esZoomGantt(zoomPedido)
    ? zoomPedido
    : rango === null ? 'mes' : zoomSugerido(rango)

  /**
   * Escribe parametros del diagrama en la URL conservando el resto de la vista.
   *
   * Acepta varios de una vez porque los controles que se apagan entre si tienen que viajar en la
   * misma navegacion: en dos `router.replace` seguidos el segundo lee los parametros de antes del
   * primero y lo pisa.
   *
   * @param cambios pares clave-valor; `null` borra el parametro
   */
  function elegir (cambios: Record<string, string | null>): void {
    const siguientes = new URLSearchParams(params.toString())

    for (const [clave, valor] of Object.entries(cambios)) {
      if (valor === null) siguientes.delete(clave)
      else siguientes.set(clave, valor)
    }

    router.replace(`?${siguientes.toString()}`, { scroll: false })
  }

  /** Suma o quita un estado del filtro. Sin ninguno, la API devuelve todos. */
  function alternarEstado (id: number): void {
    const siguientes = estados.includes(id) ? estados.filter((n) => n !== id) : [...estados, id]
    const enciendeCompleta = id === ESTADO_COMPLETA && !estados.includes(id)

    elegir({
      [PARAMETRO.estado]: siguientes.length === 0 ? null : siguientes.join(','),
      // Pedir la ficha "Completa" es pedir ver completadas: el interruptor que las esconde se apaga.
      ...(enciendeCompleta ? { [PARAMETRO.completadas]: null } : {})
    })
  }

  /** Enciende o apaga el ocultamiento de completadas, dejando el filtro por estado de acuerdo. */
  function alternarCompletadas (): void {
    if (ocultarCompletadas) {
      elegir({ [PARAMETRO.completadas]: null })
      return
    }

    // Esconder las completadas mientras la ficha "Completa" esta encendida no dejaria nada que ver:
    // se apaga la ficha, que es la que se acaba de contradecir.
    const sinCompleta = estados.filter((id) => id !== ESTADO_COMPLETA)

    elegir({
      [PARAMETRO.completadas]: COMPLETADAS_OCULTAS,
      [PARAMETRO.estado]: sinCompleta.length === 0 ? null : sinCompleta.join(',')
    })
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        {/* Con una sola agrupacion no hay nada que elegir: un control de una opcion es ruido. */}
        {agrupaciones.length > 1 && (
          <Segmentado
            etiqueta="Agrupar por"
            etiquetaVisible
            opciones={agrupaciones.map((valor) => ({ valor, etiqueta: NOMBRE_DE_AGRUPACION[valor] }))}
            activo={agrupar}
            onElegir={(valor) => { elegir({ [PARAMETRO.agrupar]: valor }) }}
          />
        )}

        <Segmentado
          etiqueta="Ver"
          etiquetaVisible
          opciones={OPCIONES_VENTANA}
          activo={verTodo ? VENTANA_TODO : 'semanas'}
          onElegir={(valor) => { elegir({ [PARAMETRO.ventana]: valor === VENTANA_TODO ? VENTANA_TODO : null }) }}
        />

        <Segmentado
          etiqueta="Escala"
          etiquetaVisible
          opciones={ZOOMS.map((z) => ({ valor: z, etiqueta: NOMBRE_DE_ZOOM[z] }))}
          activo={zoomPedido}
          onElegir={(valor) => { elegir({ [PARAMETRO.zoom]: valor }) }}
        />

        {lookups.estado.fase === 'listo' && (
          <FiltroEstados
            opciones={lookups.estado.datos.task_statuses}
            elegidos={estados}
            onAlternar={alternarEstado}
          />
        )}

        {estado.fase === 'listo' && (
          <InterruptorCompletadas activo={ocultarCompletadas} onAlternar={alternarCompletadas} />
        )}

        {estado.fase === 'listo' && (
          <ExportarGantt
            grupos={grupos}
            zoom={zoom}
            agrupar={agrupar}
            hoy={hoy}
            proyectoId={proyectoId}
            estados={lookups.estado.fase === 'listo' ? lookups.estado.datos.task_statuses : []}
          />
        )}
      </div>

      {estado.fase === 'cargando' && <Cargando mensaje="Cargando el Gantt…" />}
      {estado.fase === 'error' && <ErrorEstado detalle={estado.mensaje} onReintentar={recargar} />}
      {estado.fase === 'listo' && (
        <Diagrama
          grupos={grupos}
          rango={rango}
          zoom={zoom}
          hoy={hoy}
          ocultas={ocultarCompletadas ? completadas : 0}
          onMostrarCompletadas={alternarCompletadas}
          fueraDeVentana={fueraDeVentana}
          onVerTodo={() => { elegir({ [PARAMETRO.ventana]: VENTANA_TODO }) }}
        />
      )}
    </div>
  )
}

/**
 * Ruta del diagrama en la API, con el filtro por estado si lo hay.
 *
 * @param fuente de donde bajan los grupos de este sujeto
 * @param agrupar como se agrupan las filas
 * @param estados ids de `task_statuses` elegidos; vacio significa "todos"
 * @returns la ruta relativa que consume `useRecurso`
 */
function rutaDelGantt (fuente: FuenteDeProyecto, agrupar: AgrupacionGantt, estados: number[]): string {
  const consulta = new URLSearchParams({ agrupar })
  if (estados.length > 0) consulta.set('filter[status]', estados.join(','))

  return conConsulta(fuente.gantt, consulta.toString())
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
 * Interruptor que esconde las tareas ya terminadas.
 *
 * Se dibuja como una ficha igual a las del filtro por estado porque hace lo mismo —decide que se ve—,
 * y con `aria-pressed` en vez de un checkbox porque no forma parte de ningun formulario: es el mismo
 * patron del boton "Completados" del listado de tareas.
 *
 * Esta siempre a la vista mientras el diagrama este cargado, aunque el proyecto no tenga ninguna
 * tarea completada. Esconderlo en ese caso lo haria aparecer y desaparecer al cambiar el filtro por
 * estado, y un control que se mueve cuesta mas de encontrar que uno que a veces no hace nada.
 *
 * @param activo si las completadas estan escondidas ahora mismo
 * @param onAlternar que hacer al tocarlo
 */
function InterruptorCompletadas ({
  activo,
  onAlternar
}: {
  activo: boolean
  onAlternar: () => void
}): ReactElement {
  return (
    <button
      type="button"
      aria-pressed={activo}
      onClick={onAlternar}
      className={cn(
        'rounded-control border px-2.5 py-1 text-xs font-medium transition-colors',
        activo
          ? 'border-acento bg-acento-suave text-texto'
          : 'border-linea text-texto-tenue hover:bg-hover hover:text-texto'
      )}
    >
      Ocultar {GLOSARIO.proceso.plural.toLowerCase()} completadas
    </button>
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
 * @param rango la linea de tiempo, o `null` si nada tiene fechas
 * @param zoom la escala ya resuelta por el panel
 * @param hoy fecha `YYYY-MM-DD` congelada por el panel
 * @param ocultas cuantas tareas completadas se estan escondiendo; `0` si el interruptor esta apagado
 * @param onMostrarCompletadas apaga el interruptor desde el estado vacio
 * @returns la grilla de pistas, o el estado vacio si nada tiene fechas que dibujar
 */
function Diagrama ({
  grupos,
  rango,
  zoom,
  hoy,
  ocultas,
  onMostrarCompletadas,
  fueraDeVentana,
  onVerTodo
}: {
  grupos: GrupoGantt[]
  rango: RangoGantt | null
  zoom: ZoomGantt
  hoy: string
  ocultas: number
  onMostrarCompletadas: () => void
  fueraDeVentana: number
  onVerTodo: () => void
}): ReactElement {
  const [caja, anchoCaja] = useAnchoMedido()
  const idResumen = useId()

  if (rango === null && fueraDeVentana > 0) {
    // Hay trabajo, solo que no cae en las proximas dos semanas: decir "sin fechas" seria falso y la
    // salida es la vista completa.
    return (
      <Vacio
        titulo="Nada en las próximas 2 semanas"
        descripcion={`${fraseFueraDeVentana(fueraDeVentana)}.`}
        accion={(
          <Boton variante="secundario" tamano="chico" onClick={onVerTodo}>
            Ver todo el proyecto
          </Boton>
        )}
      />
    )
  }

  if (rango === null) {
    // Con el interruptor encendido el diagrama puede quedarse sin nada que dibujar porque todo esta
    // terminado, no porque falten fechas. Decir "sin fechas" ahi seria mentir, y dejar la pantalla en
    // blanco sin una salida obligaria a adivinar que el filtro propio la vacio.
    const mostrar = (
      <Boton variante="secundario" tamano="chico" onClick={onMostrarCompletadas}>
        Mostrar completadas
      </Boton>
    )

    if (ocultas > 0 && !grupos.some((grupo) => grupo.tareas.length > 0)) {
      return <Vacio titulo="Todo está completado" descripcion={frasePendiente(ocultas)} accion={mostrar} />
    }

    // Puede haber tareas pendientes sin fechas y completadas escondidas al mismo tiempo: entonces el
    // motivo del vacio es el de siempre, pero el aviso de lo escondido tiene que seguir estando.
    const sinFechas = `Ninguna ${GLOSARIO.proceso.singular.toLowerCase()} visible de este proyecto tiene fecha de inicio o de entrega.`

    return (
      <Vacio
        titulo="Sin fechas que mostrar"
        descripcion={ocultas > 0 ? `${sinFechas} ${fraseOcultas(ocultas)}.` : sinFechas}
        accion={ocultas > 0 ? mostrar : undefined}
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
  // El interruptor no altera este numero: una tarea completa nunca cuenta como vencida (`estaVencida`
  // en `gantt.ts`), asi que lo que se esconde no estaba sumando aca.
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
            <Escala marcas={marcas} hoy={hoyEnDiagrama} ancho={ancho} />

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
        {ocultas > 0 && <span>{fraseOcultas(ocultas)}</span>}
        {fueraDeVentana > 0 && <span>{fraseFueraDeVentana(fueraDeVentana)}</span>}
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
          Gantt de {tareas.size}{' '}
          {GLOSARIO.proceso.plural.toLowerCase()} entre {formatearFecha(fechaDeDia(rango.inicio))} y{' '}
          {formatearFecha(fechaDeDia(rango.fin))}, en escala de {NOMBRE_DE_ZOOM[zoom].toLowerCase()}.
        </p>
        {ocultas > 0 && <p>{fraseOcultas(ocultas)}</p>}
        {fueraDeVentana > 0 && <p>{fraseFueraDeVentana(fueraDeVentana)}</p>}
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
 * Si "Hoy" cae pegado al nombre de un periodo —siempre pasa en la vista de las proximas dos semanas,
 * que abre en hoy— las dos etiquetas se pisarian: entonces "Hoy" viaja dentro de la del periodo.
 *
 * @param marcas las columnas de la escala
 * @param hoy posicion del dia de hoy en porcentaje, o `null` si queda fuera del diagrama
 * @param ancho ancho del area de pistas en pixeles, para saber si las etiquetas se tocan
 */
function Escala ({ marcas, hoy, ancho }: { marcas: MarcaGantt[], hoy: number | null, ancho: number }): ReactElement {
  const pegada = hoy === null ? undefined : marcaPegadaAHoy(marcas, hoy, ancho)

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
              {marca === pegada && <span className="text-acento-2 font-medium"> · Hoy</span>}
            </span>
          ))}

        {hoy !== null && pegada === undefined && (
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

/**
 * Frase que anuncia cuantas tareas completadas se estan escondiendo.
 *
 * Vive en una funcion porque la dicen dos lugares —el pie visible y el resumen para lectores de
 * pantalla— y dos copias del mismo texto se separan en el primer retoque.
 *
 * @param ocultas cuantas tareas completadas se esconden; siempre mayor que cero cuando se llama
 * @returns el texto ya conjugado en singular o en plural
 */
function fraseOcultas (ocultas: number): string {
  return ocultas === 1
    ? `1 ${GLOSARIO.proceso.singular.toLowerCase()} completada oculta`
    : `${String(ocultas)} ${GLOSARIO.proceso.plural.toLowerCase()} completadas ocultas`
}

/**
 * Espacio que ocupa el nombre de un periodo en la escala, en pixeles. "sept 2026" en `text-xs`
 * semibold ronda los 60; el resto es aire para que "Hoy" no quede rozandolo.
 */
const ANCHO_ETIQUETA_PERIODO = 80

/**
 * Busca el nombre de periodo que taparia la etiqueta "Hoy".
 *
 * @param marcas las columnas de la escala
 * @param hoy posicion del dia de hoy en porcentaje
 * @param ancho ancho del area de pistas en pixeles
 * @returns la marca cuyo nombre empieza a menos de `ANCHO_ETIQUETA_PERIODO` a la izquierda de hoy, o
 *          `undefined` si ninguna choca
 */
function marcaPegadaAHoy (marcas: MarcaGantt[], hoy: number, ancho: number): MarcaGantt | undefined {
  return marcas.find((marca) => {
    if (marca.periodo === null) return false
    const distancia = ((hoy - marca.izquierda) / 100) * ancho

    return distancia >= 0 && distancia < ANCHO_ETIQUETA_PERIODO
  })
}

/**
 * Aviso de las tareas que no caen en las proximas dos semanas.
 *
 * @param fuera cuantas tareas distintas quedan fuera; siempre mayor que cero cuando se llama
 * @returns el texto ya conjugado en singular o en plural, sin punto final
 */
function fraseFueraDeVentana (fuera: number): string {
  return fuera === 1
    ? `1 ${GLOSARIO.proceso.singular.toLowerCase()} fuera de las próximas 2 semanas`
    : `${String(fuera)} ${GLOSARIO.proceso.plural.toLowerCase()} fuera de las próximas 2 semanas`
}

/**
 * Descripcion del estado vacio cuando lo unico que habia estaba completado.
 *
 * @param ocultas cuantas tareas completadas se esconden; siempre mayor que cero cuando se llama
 * @returns el texto ya conjugado en singular o en plural
 */
function frasePendiente (ocultas: number): string {
  return ocultas === 1
    ? `La única ${GLOSARIO.proceso.singular.toLowerCase()} de este proyecto está completada y el diagrama la está ocultando.`
    : `Las ${String(ocultas)} ${GLOSARIO.proceso.plural.toLowerCase()} de este proyecto están completadas y el diagrama las está ocultando.`
}
