'use client'

import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import type { ReactElement } from 'react'
import { AlertTriangle, ChevronLeft, ChevronRight } from 'lucide-react'
import { Boton } from '@/componentes/formularios/Boton'
import { Entrada } from '@/componentes/formularios/Entrada'
import { Segmentado } from '@/componentes/formularios/Segmentado'
import {
  ContenidoSelector,
  DisparadorSelector,
  Opcion,
  Selector
} from '@/componentes/formularios/Selector'
import { ErrorEstado, Vacio } from '@/componentes/estado/Estados'
import { GrupoAvatares } from '@/componentes/presentadores/Avatar'
import { Insignia } from '@/componentes/presentadores/Insignia'
import { PARAMETRO_TAREA } from '@/componentes/datos/tabla'
import { ModalTarea } from '@/componentes/proyecto/ModalTarea'
import {
  agruparPorVencimiento,
  contarAvisos,
  diasDeVista,
  moverPeriodo,
  nombreDeDia,
  numeroDeDia,
  tituloDePeriodo,
  TOPE_POR_VISTA,
  type VistaCalendario as ModoCalendario
} from '@/dominio/calendario'
import { GLOSARIO } from '@/dominio/glosario'
import { cn } from '@/lib/clases'
import { estadoVencimiento, formatearFecha, hoyLocal } from '@/lib/fechas'
import type { Proceso, ProcesoConAviso } from '@/datos/recursos'
import type { Capacidad } from '@/datos/tipos'
import type { OpcionFiltro } from '@/definiciones/tipos'

/**
 * Calendario de Procesos: la misma lista de tareas leida por dia y por semana.
 *
 * Contesta la pregunta que ni la tabla ni el tablero contestan: **que cae este dia**. El tablero
 * agrupa por estado y la tabla por el orden que uno elija; ninguno de los dos deja ver de un vistazo
 * que el jueves tiene seis entregas y el viernes ninguna.
 *
 * **Cada tarea ocupa una sola celda, la de su vencimiento.** Cuando ademas tiene fecha de inicio, el
 * tramo NO se dibuja como barra a lo largo de los dias: eso es un Gantt, el Gantt del Espacio ya
 * existe (`PanelGantt`) y duplicarlo aca daria dos lineas de tiempo que se contradicen en cuanto una
 * cambie. El inicio se lee dentro de la tarjeta ("Desde 3 sept"), que es lo que hace falta para saber
 * si el trabajo ya arranco.
 *
 * **Las tareas sin vencimiento no tienen dia**, asi que no entran en la grilla. Van a una tira propia
 * debajo —"Sin fecha de entrega"— con las que ARRANCAN dentro del periodo, que es el unico vinculo
 * que tienen con lo que se esta mirando. Las que no tienen ninguna de las dos fechas no aparecen en
 * ningun calendario posible y se ven en la tabla; la tira lo dice.
 *
 * El estado vive entero en la URL —`dia`, la clave de `claveVista`, `assignee`, `filter[project_id]`—
 * para que una vista se comparta con un enlace y "atras" haga lo que la persona espera.
 *
 * **La misma grilla sirve dos pantallas**: el calendario global (`/procesos/calendario`, que baja los
 * datos desde el servidor) y la pestaña Tareas de un Espacio (`CalendarioTareas`, que los pide desde
 * el navegador contra la ruta acotada del Espacio). Todo lo que cambia entre las dos son props: que
 * filtros se ofrecen, si hay bloque de alertas y en que clave de la URL se guarda dia/semana. No hay
 * una segunda grilla ni una segunda aritmetica de fechas: `dominio/calendario.ts` es una sola.
 */

/** Color del borde de la tarjeta segun cuan cerca esta el vencimiento. Mismo criterio que `Fecha`. */
const BORDE_VENCIMIENTO = {
  vencido: 'border-l-relleno-peligro',
  hoy: 'border-l-relleno-aviso',
  proximo: 'border-l-acento',
  lejano: 'border-l-linea',
  'sin-fecha': 'border-l-linea'
} as const

/**
 * Centinela de "sin filtrar" de los desplegables.
 *
 * Radix Select no acepta un item con valor vacio, y "todos" tiene que ser elegible. Es el mismo
 * centinela que usa `ControlesTabla`; viaja solo por la interfaz y nunca llega a la URL.
 */
const SIN_FILTRO = '__todos__'

/** Ancho de los dos desplegables, para que la barra no se reacomode al elegir. */
const ANCHO_FILTRO = 'w-52'

interface PropsVistaCalendario {
  /** Dia ancla del periodo, ya validado por el servidor. */
  dia: string
  vista: ModoCalendario
  /** Lo que vence dentro del periodo. */
  tareas: Proceso[]
  /** Lo que arranca dentro del periodo y no tiene fecha de entrega. */
  sinVencimiento: Proceso[]
  /** Mensaje de la API cuando fallo la consulta de lo que arranca en el periodo. */
  errorSinVencimiento: string | null
  /**
   * `GET /me/vencimientos`: lo propio vencido o por vencer.
   *
   * Vacio —el valor por defecto— esconde el bloque entero. Dentro de un Espacio no se pide: ese
   * endpoint devuelve las tareas propias de TODOS los Espacios, y colgarlas de la pestaña de uno
   * mostraria plazos de otro sin decirlo. Las alertas viven en el calendario global.
   */
  avisos?: ProcesoConAviso[]
  /** Mensaje de la API cuando el listado del periodo fallo. */
  errorTareas: string | null
  /** Mensaje de la API cuando fallaron las alertas. Nunca tumba la grilla. */
  errorAvisos?: string | null
  /** Opciones del filtro de Espacio. Vacio —por defecto— no dibuja el desplegable. */
  espacios?: OpcionFiltro[]
  /** Opciones del filtro de persona. Vacio —por defecto— no dibuja el desplegable. */
  personas?: OpcionFiltro[]
  espacioElegido?: string | null
  asignadoElegido?: string | null
  /**
   * Clave de la URL donde se guarda dia/semana.
   *
   * Es prop y no una constante porque en la pestaña de un Espacio `vista` ya esta ocupada por la
   * presentacion (tabla, tablero, calendario): alli el modo del calendario viaja en `modo`.
   */
  claveVista?: string
  /**
   * Dibuja el detalle de la tarea. Se apaga cuando quien monta la grilla ya tiene su propio
   * `ModalTarea`: dos modales sobre el mismo `?tarea=` abririan la tarea dos veces.
   */
  conModal?: boolean
  /** La API devolvio el tope de filas: hay mas de las que se ven. */
  truncado: boolean
  /** Capacidades sobre `tasks`, para los botones del detalle. */
  capacidades: Capacidad[]
}

export function VistaCalendario ({
  dia,
  vista,
  tareas,
  sinVencimiento,
  errorSinVencimiento,
  avisos = [],
  errorTareas,
  errorAvisos = null,
  espacios = [],
  personas = [],
  espacioElegido = null,
  asignadoElegido = null,
  claveVista = 'vista',
  conModal = true,
  truncado,
  capacidades
}: PropsVistaCalendario): ReactElement {
  const router = useRouter()
  const params = useSearchParams()

  const dias = diasDeVista(dia, vista)
  const porDia = agruparPorVencimiento(tareas, dias)
  const hoy = hoyLocal()

  /**
   * Reescribe la URL cambiando solo las claves indicadas.
   *
   * El detalle abierto se cierra siempre: cambiar de semana o de filtro puede dejar afuera
   * justamente la tarea que estaba abierta, y un modal sobre una vista que ya no la contiene es un
   * callejon sin salida.
   *
   * @param cambios Clave a poner, o `null` para sacarla.
   * @returns La query lista para navegar, con `?` inicial.
   */
  function urlCon (cambios: Record<string, string | null>): string {
    const siguientes = new URLSearchParams(params.toString())

    for (const [clave, valor] of Object.entries(cambios)) {
      if (valor === null) siguientes.delete(clave)
      else siguientes.set(clave, valor)
    }

    siguientes.delete(PARAMETRO_TAREA)

    return `?${siguientes.toString()}`
  }

  /** Cambia de periodo. `push` y no `replace`: moverse en el tiempo es un paso del historial. */
  function irA (nuevoDia: string): void {
    router.push(urlCon({ dia: nuevoDia }), { scroll: false })
  }

  /** Cambia un filtro. `replace`: filtrar es afinar lo que ya se mira, no ir a otro lado. */
  function filtrar (clave: string, valor: string | null): void {
    router.replace(urlCon({ [clave]: valor }), { scroll: false })
  }

  const vacio = tareas.length === 0 && sinVencimiento.length === 0

  return (
    <section className="flex flex-col gap-4">
      <AvisoDeVencimientos avisos={avisos} error={errorAvisos} />

      <div className="flex flex-wrap items-center gap-2">
        <Boton
          variante="sutil"
          tamano="chico"
          soloIcono
          aria-label={vista === 'dia' ? 'Día anterior' : 'Semana anterior'}
          onClick={() => irA(moverPeriodo(dia, vista, -1))}
        >
          <ChevronLeft size={16} aria-hidden="true" />
        </Boton>

        {/* `first-letter:uppercase` y no `capitalize`: el titulo del dia tiene cuatro palabras
            ("martes 8 sept 2026") y `capitalize` las levantaria todas. */}
        <p className="text-texto min-w-44 text-center text-sm font-semibold first-letter:uppercase">
          {tituloDePeriodo(dia, vista)}
        </p>

        <Boton
          variante="sutil"
          tamano="chico"
          soloIcono
          aria-label={vista === 'dia' ? 'Día siguiente' : 'Semana siguiente'}
          onClick={() => irA(moverPeriodo(dia, vista, 1))}
        >
          <ChevronRight size={16} aria-hidden="true" />
        </Boton>

        <Boton variante="sutil" tamano="chico" onClick={() => irA(hoyLocal())}>Hoy</Boton>

        {/* Nativo y no un calendario propio: ya trae teclado, formato local y el picker del sistema.
            Es el mismo control que usan la agenda de Salas y el filtro de rango de la tabla. */}
        <Entrada
          type="date"
          aria-label="Ir a una fecha"
          className="w-40"
          value={dia}
          onChange={(evento) => { if (evento.target.value !== '') irA(evento.target.value) }}
        />

        <Segmentado
          etiqueta="Modo del calendario"
          activo={vista}
          opciones={[
            { valor: 'dia', etiqueta: 'Día' },
            { valor: 'semana', etiqueta: 'Semana' }
          ]}
          onElegir={(valor) => { router.push(urlCon({ [claveVista]: valor }), { scroll: false }) }}
        />

        <div className="ml-auto flex flex-wrap items-center gap-2">
          <FiltroSimple
            etiqueta="Asignado"
            opciones={personas}
            valor={asignadoElegido}
            onCambiar={(valor) => filtrar('assignee', valor)}
          />
          <FiltroSimple
            etiqueta={GLOSARIO.espacio.singular}
            opciones={espacios}
            valor={espacioElegido}
            onCambiar={(valor) => filtrar('filter[project_id]', valor)}
          />
        </div>
      </div>

      {truncado && (
        <p className="text-texto-tenue text-xs">
          Se muestran las primeras {TOPE_POR_VISTA} tareas del período. Acota con los filtros o mira un solo día.
        </p>
      )}

      {errorTareas !== null
        ? <ErrorEstado titulo="No se pudo cargar el calendario" detalle={errorTareas} />
        : vacio
          ? (
            <Vacio
              titulo="Nada vence en este período"
              descripcion={
                espacioElegido !== null || asignadoElegido !== null
                  ? 'Con los filtros puestos no queda ninguna entrega. Quítalos o mira otro período.'
                  : 'No hay entregas ni vencimientos anotados. Mira otro período o revisa la tabla completa.'
              }
              className="border-linea rounded-tarjeta border border-dashed"
            />
            )
          : (
            <div className={cn('grid gap-2', vista === 'semana' && 'md:grid-cols-7')}>
              {dias.map((fecha) => (
                <ColumnaDia
                  key={fecha}
                  dia={fecha}
                  esHoy={fecha === hoy}
                  vista={vista}
                  tareas={porDia.get(fecha) ?? []}
                  urlDeTarea={(id) => urlDeTarea(params, id)}
                />
              ))}
            </div>
            )}

      {/* El fallo de la segunda consulta se dice, no se traga: sin esta linea, las tareas sin
          vencimiento desaparecerian de la pantalla como si no existiera ninguna. */}
      {errorSinVencimiento !== null && (
        <p role="alert" className="border-linea-fuerte bg-superficie-aviso text-texto-aviso rounded-tarjeta border-l-4 p-3 text-sm">
          No se pudieron cargar las tareas sin fecha de entrega: {errorSinVencimiento}
        </p>
      )}

      {sinVencimiento.length > 0 && (
        <TiraSinVencimiento tareas={sinVencimiento} urlDeTarea={(id) => urlDeTarea(params, id)} />
      )}

      {conModal && (
        <ModalTarea
          puedeEditar={capacidades.includes('edit')}
          puedeBorrar={capacidades.includes('delete')}
        />
      )}
    </section>
  )
}

/**
 * Enlace al detalle de una tarea, conservando el periodo y los filtros vigentes.
 *
 * Es el mismo `?tarea={id}` que escriben la tabla, el tablero y el Inicio: una tarea abierta se ve
 * igual venga de donde venga, y su URL es la misma.
 */
function urlDeTarea (params: URLSearchParams | ReturnType<typeof useSearchParams>, id: number): string {
  const siguientes = new URLSearchParams(params.toString())

  siguientes.set(PARAMETRO_TAREA, String(id))

  return `?${siguientes.toString()}`
}

interface PropsColumna {
  dia: string
  esHoy: boolean
  vista: ModoCalendario
  tareas: Proceso[]
  urlDeTarea: (id: number) => string
}

/**
 * Un dia del calendario, con sus vencimientos.
 *
 * La lista tiene scroll propio y alto tope: un dia con treinta entregas estiraria la columna y
 * dejaria las otras seis como una tira de un centimetro. `data-lenis-prevent` la saca del scroll
 * suave del armazon; sin eso, Lenis se queda el gesto y la lista no se mueve.
 */
function ColumnaDia ({ dia, esHoy, vista, tareas, urlDeTarea }: PropsColumna): ReactElement {
  return (
    <section
      className={cn(
        'border-linea bg-superficie-elevada rounded-tarjeta flex min-w-0 flex-col overflow-hidden border',
        esHoy && 'ring-acento ring-1 ring-inset'
      )}
    >
      {/* El nombre y el numero van juntos a la izquierda y la cuenta sola a la derecha: pegados,
          "2" y "11" se leen como un solo numero partido. */}
      <header className="border-linea flex items-baseline justify-between gap-2 border-b px-2.5 py-2">
        <span className="flex items-baseline gap-1.5">
          <span className="text-texto-tenue text-xs font-medium capitalize">{nombreDeDia(dia)}</span>
          <span className={cn('text-sm font-semibold tabular-nums', esHoy ? 'text-acento' : 'text-texto')}>
            {numeroDeDia(dia)}
          </span>
        </span>
        {tareas.length > 0 && (
          <span className="bg-relleno-neutro text-relleno-neutro-contenido rounded-control px-1.5 text-[0.6875rem] tabular-nums">
            {tareas.length}
            <span className="sr-only">{tareas.length === 1 ? ' tarea vence' : ' tareas vencen'} este día</span>
          </span>
        )}
      </header>

      {tareas.length === 0
        ? (
          <p className="text-texto-sutil px-2.5 py-6 text-center text-xs">Sin vencimientos</p>
          )
        : (
          <ul
            data-lenis-prevent
            className={cn(
              'flex flex-col gap-1.5 overflow-y-auto p-2',
              vista === 'semana' ? 'max-h-[28rem] min-h-24' : 'max-h-[36rem]'
            )}
          >
            {tareas.map((tarea) => (
              <TarjetaDelDia key={tarea.id} tarea={tarea} href={urlDeTarea(tarea.id)} />
            ))}
          </ul>
          )}
    </section>
  )
}

/**
 * Una tarea dentro de su dia.
 *
 * El borde izquierdo repite el criterio de color de `Fecha`: rojo lo vencido, ambar lo de hoy, acento
 * lo que vence dentro de tres dias. Es el unico color de la tarjeta, para que una columna llena se
 * lea de un vistazo.
 *
 * "Desde <fecha>" es como se representa el tramo de una tarea que ademas tiene inicio: texto y no
 * barra. Ver el docblock de `VistaCalendario`.
 */
function TarjetaDelDia ({ tarea, href }: { tarea: Proceso, href: string }): ReactElement {
  return (
    <li>
      <Link
        href={href}
        scroll={false}
        className={cn(
          'rounded-chico bg-superficie hover:bg-hover flex flex-col gap-1 border-l-2 p-2',
          'transition-colors duration-150',
          BORDE_VENCIMIENTO[estadoVencimiento(tarea.due_date)]
        )}
      >
        <span className="text-texto text-xs leading-snug font-medium">{tarea.name}</span>

        <span className="text-texto-sutil flex flex-wrap items-center gap-x-2 gap-y-1 text-[0.6875rem]">
          {tarea.patente !== null && <span className="tabular-nums">{tarea.patente}</span>}
          {tarea.start_date !== null && (
            <span title={`Empieza el ${formatearFecha(tarea.start_date)}`}>
              Desde {formatearFecha(tarea.start_date)}
            </span>
          )}
        </span>

        {tarea.assignees.length > 0 && <GrupoAvatares personas={tarea.assignees} maximo={3} />}
      </Link>
    </li>
  )
}

/**
 * Las tareas sin fecha de entrega que arrancan dentro del periodo.
 *
 * Existen porque el requisito es que nada desaparezca en silencio: una tarea sin vencimiento no tiene
 * celda posible en un calendario, pero tampoco puede evaporarse al cambiar de vista. Se listan las
 * que EMPIEZAN en el periodo, que es el unico vinculo que tienen con lo que se esta mirando.
 */
function TiraSinVencimiento (
  { tareas, urlDeTarea }: { tareas: Proceso[], urlDeTarea: (id: number) => string }
): ReactElement {
  return (
    <section className="border-linea rounded-tarjeta border border-dashed p-3">
      <h2 className="text-texto text-sm font-semibold">Sin fecha de entrega ({tareas.length})</h2>
      <p className="text-texto-tenue mt-1 text-xs">
        Arrancan en este período pero no tienen vencimiento, así que no ocupan ningún día. Las que
        tampoco tienen fecha de inicio se ven en la tabla.
      </p>

      <ul data-lenis-prevent className="mt-2 flex max-h-56 flex-wrap gap-1.5 overflow-y-auto">
        {tareas.map((tarea) => (
          <li key={tarea.id}>
            <Link
              href={urlDeTarea(tarea.id)}
              scroll={false}
              className="border-linea rounded-chico bg-superficie hover:bg-hover text-texto flex items-center gap-2 border px-2 py-1.5 text-xs transition-colors duration-150"
            >
              {tarea.name}
              {tarea.start_date !== null && (
                <span className="text-texto-sutil text-[0.6875rem]">Desde {formatearFecha(tarea.start_date)}</span>
              )}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}

/**
 * Alertas de vencimiento de quien mira (`GET /me/vencimientos`).
 *
 * Va arriba de todo y siempre desplegada en su forma corta: el pedido era que las alertas se vean sin
 * buscarlas. El detalle va en un `<details>` nativo —cero estado, cero JavaScript— porque la lista
 * puede tener decenas de filas y no puede empujar el calendario fuera de la pantalla.
 *
 * El producto no tiene campana ni centro de avisos donde colgarlas: el unico lugar del panel donde
 * hoy se leen los plazos propios es esta pantalla.
 *
 * Un fallo de este endpoint NO tumba el calendario: se avisa en una linea y la grilla sigue.
 */
function AvisoDeVencimientos (
  { avisos, error }: { avisos: ProcesoConAviso[], error: string | null }
): ReactElement | null {
  if (error !== null) {
    return (
      <p role="alert" className="border-linea-fuerte bg-superficie-aviso text-texto-aviso rounded-tarjeta border-l-4 p-3 text-sm">
        No se pudieron cargar tus alertas de vencimiento: {error}
      </p>
    )
  }

  if (avisos.length === 0) return null

  const { vencidos, hoy, porVencer } = contarAvisos(avisos)

  return (
    <details
      className={cn(
        'rounded-tarjeta border-l-4 p-3',
        vencidos > 0
          ? 'border-linea-fuerte bg-superficie-peligro'
          : 'border-linea-fuerte bg-superficie-aviso'
      )}
    >
      <summary className="flex cursor-pointer flex-wrap items-center gap-2 text-sm">
        <AlertTriangle
          size={16}
          aria-hidden="true"
          className={cn('shrink-0', vencidos > 0 ? 'text-texto-peligro' : 'text-texto-aviso')}
        />
        <span className={cn('font-semibold', vencidos > 0 ? 'text-texto-peligro' : 'text-texto-aviso')}>
          Tus vencimientos
        </span>
        {vencidos > 0 && (
          <Insignia tono="peligro" tamano="chico">{vencidos} {vencidos === 1 ? 'vencido' : 'vencidos'}</Insignia>
        )}
        {hoy > 0 && (
          <Insignia tono="aviso" tamano="chico">{hoy} {hoy === 1 ? 'vence' : 'vencen'} hoy</Insignia>
        )}
        {porVencer > 0 && <Insignia tono="contorno" tamano="chico">{porVencer} por vencer</Insignia>}
      </summary>

      <ul data-lenis-prevent className="mt-3 flex max-h-64 flex-col gap-1 overflow-y-auto">
        {avisos.map((tarea) => (
          <li key={tarea.id} className="flex flex-wrap items-center gap-2 text-xs">
            <Insignia tono={tarea.aviso.estado === 'vencido' ? 'peligro' : tarea.aviso.estado === 'hoy' ? 'aviso' : 'contorno'} tamano="chico">
              {textoDeAviso(tarea.aviso)}
            </Insignia>
            <Link
              href={`/procesos?${PARAMETRO_TAREA}=${tarea.id}`}
              className="text-texto hover:text-acento font-medium underline-offset-4 hover:underline"
            >
              {tarea.name}
            </Link>
            <span className="text-texto-sutil">{formatearFecha(tarea.due_date)}</span>
          </li>
        ))}
      </ul>
    </details>
  )
}

/**
 * Texto del aviso de una tarea.
 *
 * `final` y `temprano` son dos umbrales del cron, no dos mensajes: los dos dicen cuantos dias faltan,
 * y el numero ya lo manda la API.
 *
 * @param aviso El bloque que devuelve `GET /me/vencimientos`.
 * @returns La frase corta de la insignia.
 */
function textoDeAviso (aviso: ProcesoConAviso['aviso']): string {
  if (aviso.estado === 'vencido') {
    const dias = Math.abs(aviso.dias_restantes)

    return dias === 1 ? 'Venció ayer' : `Venció hace ${dias} días`
  }

  if (aviso.estado === 'hoy') return 'Vence hoy'

  return aviso.dias_restantes === 1 ? 'Vence mañana' : `En ${aviso.dias_restantes} días`
}

interface PropsFiltroSimple {
  etiqueta: string
  opciones: OpcionFiltro[]
  valor: string | null
  onCambiar: (valor: string | null) => void
}

/**
 * Desplegable de un filtro, con la opcion de no filtrar.
 *
 * Es el mismo control que arma `ControlesTabla` —mismo disparador, mismo centinela, mismo "tenue
 * mientras no filtra"— y no un componente compartido: `ControlesTabla` dibuja los NUEVE filtros de la
 * definicion de Procesos, incluido el rango de fechas que esta pantalla ya resuelve con el periodo.
 * Traerla entera pondria dos controles que se pelean por `filter[date_from]`.
 *
 * Sin opciones no se dibuja: un desplegable vacio no filtra nada y ocupa el lugar de uno que si
 * funciona. Es lo mismo que hace `ControlFiltro`.
 */
function FiltroSimple ({ etiqueta, opciones, valor, onCambiar }: PropsFiltroSimple): ReactElement | null {
  if (opciones.length === 0) return null

  return (
    <Selector
      value={valor ?? SIN_FILTRO}
      onValueChange={(elegido) => onCambiar(elegido === SIN_FILTRO ? null : elegido)}
    >
      <DisparadorSelector
        aria-label={etiqueta}
        marcador={etiqueta}
        className={cn(ANCHO_FILTRO, valor === null && 'text-texto-sutil')}
      />
      <ContenidoSelector>
        <Opcion value={SIN_FILTRO}>{etiqueta}: todos</Opcion>
        {opciones.map((opcion) => (
          <Opcion key={opcion.valor} value={opcion.valor}>{opcion.etiqueta}</Opcion>
        ))}
      </ContenidoSelector>
    </Selector>
  )
}
