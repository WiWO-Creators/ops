'use client'

import { Suspense, useEffect, useMemo, useState, type ReactElement } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Boton } from '@/componentes/formularios/Boton'
import { Entrada } from '@/componentes/formularios/Entrada'
import { Segmentado, type OpcionSegmentada } from '@/componentes/formularios/Segmentado'
import { Cargando, ErrorEstado, Vacio } from '@/componentes/estado/Estados'
import { PARAMETRO_TAREA } from '@/componentes/datos/tabla'
import { pedirSobre } from '@/datos/cliente'
import { GLOSARIO } from '@/dominio/glosario'
import { hoyLocal } from '@/lib/fechas'
import { ModalTarea } from './ModalTarea'
import { AgendaEntregas, ColumnasDeDias, RejillaMes } from './RejillaEntregas'
import { ESTADO_COMPLETO } from './tareas'
import {
  diaDeVencimiento,
  estaCompleta,
  diasDelPeriodo,
  leerDiaAncla,
  leerVistaEntregas,
  moverPeriodoEntregas,
  tituloDeEntregas,
  TOPE_DE_PROCESOS,
  type VistaEntregas
} from './calendario-entregas'
import type { EstadoLookup, Lookups, Proceso } from '@/datos/recursos'
import type { Capacidad } from '@/datos/tipos'

/**
 * Pestaña Calendario de un Espacio: el mes de entregas, en cuatro lecturas.
 *
 * Contesta la pregunta que ni la tabla ni el Gantt contestan de un vistazo: **que se entrega y
 * cuando**. El Gantt dibuja duraciones y dependencias; esto dibuja el dia de entrega, que es la fecha
 * de vencimiento de cada Proceso.
 *
 * **Las cuatro vistas son el mismo dato, no cuatro consultas.** Los Procesos del Espacio se bajan al
 * montar y todo lo demas —repartir por dia, cambiar de mes, pasar a lista, esconder lo completado—
 * ocurre en el navegador. Pedir el rango de cada periodo costaria una peticion por clic en
 * "siguiente", que en un calendario es el gesto mas repetido; y ademas dejaria el bloque "sin fecha"
 * en una aproximacion, porque una entrega sin plazo no pertenece a ningun mes que se pueda pedir.
 *
 * **Se piden dos listados y se unen.** `GET /projects/{id}/tasks` **esconde lo completado** cuando no
 * viaja `filter[status]`, y en un calendario de ENTREGAS eso seria mentir: el mes de un Espacio que ya
 * entrego se veria vacio, y la distincion entre lo vencido y lo entregado a tiempo —que es media
 * pantalla— no tendria nada que pintar. La segunda consulta pide justamente el estado "Completo" y
 * las dos se funden por id. La tabla de la pestaña Tareas no lo necesita porque alli lo completado se
 * mira aparte, con el boton "Completados"; aca no es otra lista, es la misma entrega ya hecha.
 *
 * **La vista y la fecha viven en la URL** (`vistaEntregas` y `diaEntregas`), como el resto del panel:
 * asi un mes concreto se comparte por enlace, recargar no lo pierde y "atras" hace lo que la persona
 * espera. Las claves llevan sufijo porque `vista`, `modo` y `dia` ya estan ocupadas por el calendario
 * de la pestaña Tareas, que convive en la misma URL.
 *
 * **No reemplaza a `VistaCalendario`** (la grilla dia/semana de la pestaña Tareas y del calendario
 * global): aquella es una lectura mas del listado filtrable de Procesos, con sus filtros y su
 * paginacion; esta es una pestaña propia del Espacio, centrada en el mes y sin filtros, y agrega las
 * dos lecturas que aquella no tiene. Comparten la aritmetica de `dominio/calendario.ts`, que es lo
 * unico que no puede haber por duplicado.
 */

/**
 * Las cuatro lecturas, en orden de mas agregada a mas detallada, y la lista al final.
 *
 * El mes es la primera porque es la de reposo. La lista va ultima y no entre semana y dia: no es un
 * zoom mas, es la misma tanda leida en columna.
 */
const VISTAS: readonly OpcionSegmentada[] = [
  { valor: 'mes', etiqueta: 'Mes' },
  { valor: 'semana', etiqueta: 'Semana' },
  { valor: 'dia', etiqueta: 'Día' },
  { valor: 'lista', etiqueta: 'Lista' }
]

/** Clave de la URL con la vista elegida. Lleva sufijo: `vista` ya la usan otras pestañas. */
const CLAVE_VISTA = 'vistaEntregas'

/** Clave de la URL con el dia ancla del periodo. Lleva sufijo por lo mismo que `CLAVE_VISTA`. */
const CLAVE_DIA = 'diaEntregas'

/**
 * Clave de la URL del interruptor de completados.
 *
 * Arranca **apagado**: la primera pantalla muestra el mes entero, entregado y pendiente, y esconder es
 * una decision explicita. Es el mismo criterio que la pestaña Hitos tomo para su casilla, y por el
 * mismo motivo: un Espacio terminado que se abre vacio no dice que esta terminado, dice que algo
 * fallo.
 */
const CLAVE_OCULTAR = 'ocultarCompletados'

/** Lo que hay que tener en mano para dibujar el calendario. */
interface Carga {
  tareas: Proceso[]
  estados: EstadoLookup[]
  /** La API devolvio el tope de filas: hay entregas que no se ven. */
  truncado: boolean
}

interface PropsPanelCalendario {
  proyectoId: number
  /** Capacidades sobre `tasks`, de `permissions` de `/me`. Mandan sobre los botones del detalle. */
  capacidades: Capacidad[]
}

export function PanelCalendario (props: PropsPanelCalendario): ReactElement {
  // Lee `useSearchParams`: sin este limite de Suspense el build de la pagina falla.
  return (
    <Suspense fallback={<Cargando mensaje="Cargando el calendario…" />}>
      <CalendarioDelEspacio {...props} />
    </Suspense>
  )
}

function CalendarioDelEspacio ({ proyectoId, capacidades }: PropsPanelCalendario): ReactElement {
  const router = useRouter()
  const params = useSearchParams()

  // Se guarda junto al Espacio que la produjo —mismo patron que `CalendarioTareas`— en vez de
  // vaciarla al empezar el efecto: un `setCarga(null)` sincronico dentro del efecto encadena un
  // render de mas, y comparar el id dice lo mismo sin ese costo.
  const [carga, setCarga] = useState<{ para: number, datos: Carga | null, error: string | null } | null>(null)

  // Se calcula una vez por render y no dentro de cada celda: leer el reloj en varios lugares abre la
  // puerta a que dos partes de la misma pantalla discrepen si el render cruza la medianoche.
  const hoy = hoyLocal()
  const vista = leerVistaEntregas(params.get(CLAVE_VISTA))
  const dia = leerDiaAncla(params.get(CLAVE_DIA), hoy)
  // Sin parametro se muestra todo: hay que pedir `si` para esconder lo entregado.
  const ocultarCompletados = params.get(CLAVE_OCULTAR) === 'si'

  useEffect(() => {
    const control = new AbortController()

    const listado = `projects/${encodeURIComponent(String(proyectoId))}/tasks?per_page=${TOPE_DE_PROCESOS}&sort=due_date`

    void Promise.all([
      pedirSobre<Proceso[]>(listado, control.signal),
      pedirSobre<Proceso[]>(`${listado}&filter[status]=${ESTADO_COMPLETO}`, control.signal),
      pedirSobre<Lookups>('lookups', control.signal)
    ]).then(([abiertos, completos, lookups]) => {
      if (control.signal.aborted) return

      setCarga({
        para: proyectoId,
        error: null,
        datos: {
          tareas: unir(abiertos.data, completos.data),
          estados: lookups.data.task_statuses,
          truncado: abiertos.data.length >= TOPE_DE_PROCESOS || completos.data.length >= TOPE_DE_PROCESOS
        }
      })
    }).catch((fallo: unknown) => {
      if (control.signal.aborted) return

      setCarga({
        para: proyectoId,
        datos: null,
        error: fallo instanceof Error ? fallo.message : 'No se pudo cargar el calendario.'
      })
    })

    return () => { control.abort() }
  }, [proyectoId])

  const dias = useMemo(() => diasDelPeriodo(dia, vista), [dia, vista])

  // Se acota al periodo una sola vez y no dentro de cada vista: las tres presentaciones con celdas
  // reparten sobre la misma lista, y filtrar tres veces la misma condicion es como se llega a que una
  // vista muestre una entrega que otra esconde.
  const visibles = useMemo(
    () => (carga?.datos?.tareas ?? []).filter((tarea) => !ocultarCompletados || !estaCompleta(tarea)),
    [carga, ocultarCompletados]
  )

  const delPeriodo = useMemo(() => {
    if (dias.length === 0) return []

    const desde = dias[0] ?? ''
    const hasta = dias[dias.length - 1] ?? ''

    return visibles.filter((tarea) => {
      const vence = diaDeVencimiento(tarea)

      return vence !== null && vence >= desde && vence <= hasta
    })
  }, [visibles, dias])

  /**
   * Reescribe la URL cambiando solo las claves indicadas.
   *
   * El detalle abierto se cierra siempre: cambiar de mes o de vista puede dejar afuera justamente la
   * entrega que estaba abierta, y un modal sobre una vista que ya no la contiene no tiene salida.
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

  /** URL del detalle de una entrega, conservando el periodo y la vista. */
  function urlDeTarea (id: number): string {
    const siguientes = new URLSearchParams(params.toString())

    siguientes.set(PARAMETRO_TAREA, String(id))

    return `?${siguientes.toString()}`
  }

  /** URL de la vista de un dia concreto. Es el destino del "+N más" y de cada cabecera de dia. */
  function urlDelDia (destino: string): string {
    return urlCon({ [CLAVE_VISTA]: 'dia', [CLAVE_DIA]: destino })
  }

  /** Cambia de periodo. `push` y no `replace`: moverse en el tiempo es un paso del historial. */
  function irA (destino: string): void {
    router.push(urlCon({ [CLAVE_DIA]: destino }), { scroll: false })
  }

  const barra = (
    <div className="flex flex-wrap items-center gap-2">
      <Boton
        variante="sutil"
        tamano="chico"
        soloIcono
        aria-label={`${etiquetaDePeriodo(vista)} anterior`}
        onClick={() => { irA(moverPeriodoEntregas(dia, vista, -1)) }}
      >
        <ChevronLeft size={16} aria-hidden="true" />
      </Boton>

      {/* `first-letter:uppercase` y no `capitalize`: el titulo tiene varias palabras
          ("martes 8 sept 2026") y `capitalize` las levantaria todas. */}
      <p className="text-texto min-w-44 text-center text-sm font-semibold first-letter:uppercase">
        {tituloDeEntregas(dia, vista)}
      </p>

      <Boton
        variante="sutil"
        tamano="chico"
        soloIcono
        aria-label={`${etiquetaDePeriodo(vista)} siguiente`}
        onClick={() => { irA(moverPeriodoEntregas(dia, vista, 1)) }}
      >
        <ChevronRight size={16} aria-hidden="true" />
      </Boton>

      <Boton variante="sutil" tamano="chico" onClick={() => { irA(hoyLocal()) }}>Hoy</Boton>

      {/* Nativo y no un calendario propio: ya trae teclado, formato local y el picker del sistema.
          Es el mismo control que usan la agenda de Salas y el calendario de Procesos. */}
      <Entrada
        type="date"
        aria-label="Ir a una fecha"
        className="w-40"
        value={dia}
        onChange={(evento) => { if (evento.target.value !== '') irA(evento.target.value) }}
      />

      <label className="text-texto-tenue ml-auto flex items-center gap-2 text-xs">
        <input
          type="checkbox"
          checked={ocultarCompletados}
          onChange={(evento) => {
            router.replace(urlCon({ [CLAVE_OCULTAR]: evento.target.checked ? 'si' : null }), { scroll: false })
          }}
          className="accent-acento size-4"
        />
        Ocultar entregados
      </label>

      <Segmentado
        etiqueta="Vista del calendario"
        opciones={VISTAS}
        activo={vista}
        onElegir={(valor) => { router.replace(urlCon({ [CLAVE_VISTA]: valor }), { scroll: false }) }}
      />
    </div>
  )

  // Mientras lo que hay en mano sea de otro Espacio, se muestra la carga: pintar las entregas del
  // anterior bajo la cabecera nueva diria algo que no es.
  if (carga === null || carga.para !== proyectoId) return <Cargando mensaje="Cargando el calendario…" />
  if (carga.error !== null) return <ErrorEstado titulo="No se pudo cargar el calendario" detalle={carga.error} />
  if (carga.datos === null) return <Cargando mensaje="Cargando el calendario…" />

  const { tareas, estados, truncado } = carga.datos
  const hayAlgoQueMostrar = delPeriodo.length > 0 || (vista === 'lista' && visibles.length > 0)

  return (
    <section className="flex flex-col gap-3">
      {barra}

      {truncado && (
        <p className="text-texto-tenue text-xs">
          Se muestran los primeros {TOPE_DE_PROCESOS} {GLOSARIO.proceso.plural.toLowerCase()} del{' '}
          {GLOSARIO.espacio.singular.toLowerCase()}. Puede haber entregas que no se vean.
        </p>
      )}

      {tareas.length === 0
        ? (
          <Vacio
            titulo="Todavía no hay entregas"
            // El texto no lleva articulo delante del termino del glosario: "Proceso" y "Tarea" no tienen
            // el mismo genero, y un "ningún" fijo se lee mal en cuanto el glosario cambia de palabra.
            descripcion={`Este ${GLOSARIO.espacio.singular.toLowerCase()} todavía no tiene ${GLOSARIO.proceso.plural.toLowerCase()}. Todo lo que tenga fecha de vencimiento aparecerá acá, en el día en que se entrega.`}
            className="border-linea rounded-tarjeta border border-dashed"
          />
          )
        : vista === 'lista'
          ? (
            <AgendaEntregas
              dias={dias}
              tareas={delPeriodo}
              todas={visibles}
              estados={estados}
              hoy={hoy}
              urlDeTarea={urlDeTarea}
              urlDelDia={urlDelDia}
            />
            )
          : vista === 'mes'
            ? (
              <>
                <RejillaMes
                  dias={dias}
                  ancla={dia}
                  tareas={delPeriodo}
                  estados={estados}
                  hoy={hoy}
                  urlDeTarea={urlDeTarea}
                  urlDelDia={urlDelDia}
                />
                {!hayAlgoQueMostrar && <SinEntregas vista={vista} />}
              </>
              )
            : (
              <>
                <ColumnasDeDias
                  dias={dias}
                  tareas={delPeriodo}
                  estados={estados}
                  hoy={hoy}
                  urlDeTarea={urlDeTarea}
                  urlDelDia={urlDelDia}
                  enSemana={vista === 'semana'}
                />
                {!hayAlgoQueMostrar && <SinEntregas vista={vista} />}
              </>
              )}

      <ModalTarea
        puedeEditar={capacidades.includes('edit')}
        puedeBorrar={capacidades.includes('delete')}
      />
    </section>
  )
}

/**
 * Aviso de periodo sin entregas.
 *
 * Va **debajo** de la rejilla y no en su lugar: el mes vacio sigue siendo informacion —dice que no
 * hay nada comprometido en esas semanas— y borrarlo para poner un cartel dejaria a la persona sin
 * saber que mes esta mirando ni donde cae hoy.
 *
 * @param vista La lectura activa, para nombrar el periodo en el texto.
 * @returns La linea de aviso.
 */
function SinEntregas ({ vista }: { vista: VistaEntregas }): ReactElement {
  return (
    <p className="border-linea text-texto-tenue rounded-tarjeta border border-dashed px-4 py-6 text-center text-sm">
      Nada se entrega en {vista === 'dia' ? 'este día' : vista === 'semana' ? 'esta semana' : 'este mes'}.
      Usa las flechas para mirar otro período o pasa a la vista Lista.
    </p>
  )
}

/**
 * Como se llama el periodo que mueven las flechas, para el nombre accesible de los botones.
 *
 * La lista comparte periodo con el mes, asi que sus flechas tambien mueven meses: decir "Lista
 * anterior" no significaria nada.
 *
 * @param vista La lectura activa.
 * @returns "Mes", "Semana" o "Día".
 */
function etiquetaDePeriodo (vista: VistaEntregas): string {
  if (vista === 'semana') return 'Semana'
  if (vista === 'dia') return 'Día'

  return 'Mes'
}

/**
 * Funde los dos listados en uno, sin repetidos.
 *
 * Los dos vienen de la misma tabla y podrian solaparse si el backend cambiara su valor por defecto:
 * unir por id deja el calendario a salvo de eso en vez de mostrar la misma entrega dos veces.
 *
 * @param abiertos Lo que devuelve el listado sin filtro de estado.
 * @param completos Lo que devuelve el listado pidiendo el estado "Completo".
 * @returns Los Procesos de las dos consultas, cada uno una sola vez.
 */
function unir (abiertos: Proceso[], completos: Proceso[]): Proceso[] {
  const porId = new Map<number, Proceso>()

  for (const tarea of [...abiertos, ...completos]) porId.set(tarea.id, tarea)

  return [...porId.values()]
}
