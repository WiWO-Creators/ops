'use client'

import { Suspense, useCallback, useEffect, useMemo, useState, type ReactElement } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { TablaRecurso } from '@/componentes/datos/TablaRecurso'
import { TableroFiltrable } from '@/componentes/datos/TableroFiltrable'
import { Segmentado, type OpcionSegmentada } from '@/componentes/formularios/Segmentado'
import { Cargando, ErrorEstado } from '@/componentes/estado/Estados'
import { opcionesDeFiltros } from '@/datos/catalogos'
import { pedirSobre } from '@/datos/cliente'
import { construirConsulta, leerConsulta } from '@/datos/consulta'
import type { DefinicionRecurso, OpcionFiltro, ResultadoLista } from '@/definiciones/tipos'
import type {
  DefinicionCampoPersonalizado,
  Lookups,
  ProcesoAmpliado,
  ResumenEstadoTareas
} from '@/datos/recursos'
import type { Capacidad } from '@/datos/tipos'
import { AccionesMasivasTareas } from './AccionesMasivasTareas'
import { ModalTarea } from './CajonTarea'
import { FormularioTarea } from './FormularioTarea'
import { ResumenEstadosTareas } from './ResumenEstadosTareas'
import { TarjetaTarea } from './TarjetaTarea'
import { definicionDeTareas, ProveedorSeleccion } from './columnas-tareas'
import { estaVencida } from './tareas'

/**
 * Pestaña Tareas de un proyecto: resumen por estado, tabla y tablero.
 *
 * No escribe una tabla ni un tablero: arma una `DefinicionRecurso` y se la da a los motores. Lo unico
 * propio es como se pinta cada celda y cada tarjeta.
 *
 * **Todo el estado de la vista vive en la URL** —`?vista=`, `?tarea=`, los filtros, el orden y la
 * pagina—, no en `useState`. Asi una vista filtrada se comparte con un enlace, "atras" hace lo que la
 * persona espera y una tarea abierta se puede mandar por chat.
 *
 * Los datos se piden desde el navegador y no bajan resueltos del servidor porque este componente
 * recibe solo un id: mientras llegan se muestra el bloque de carga, que reserva el alto.
 */

/** Catalogos vacios, estables entre renders: un objeto literal nuevo reconstruiria la definicion. */
const VACIO_CATALOGOS: Record<string, OpcionFiltro[]> = {}

/** Las dos lecturas de las tareas. `tabla` es la de por defecto y no escribe `?vista=`. */
const VISTAS: readonly OpcionSegmentada[] = [
  { valor: 'tabla', etiqueta: 'Tabla', icono: 'tabla' },
  { valor: 'tablero', etiqueta: 'Tablero', icono: 'tablero' }
]

interface PropsPanelTareas {
  proyectoId: number
  capacidades: Capacidad[]
}

export function PanelTareas ({ proyectoId, capacidades }: PropsPanelTareas): ReactElement {
  // `TablaRecurso` y el propio panel leen `useSearchParams`. Sin este limite de Suspense el build de
  // cualquier pagina que los monte falla, y esa pagina la escribe otra persona.
  return (
    <Suspense fallback={<Cargando mensaje="Cargando las tareas…" />}>
      <TareasDelProyecto proyectoId={proyectoId} capacidades={capacidades} />
    </Suspense>
  )
}

/** Lo que hace falta para pintar la pestaña. El error es un texto listo, no un envelope. */
type Carga =
  | { fase: 'cargando' }
  | { fase: 'error', mensaje: string }
  | {
      fase: 'listo'
      inicial: ResultadoLista<ProcesoAmpliado>
      /** Con que presentacion a la vista se pidieron estos datos. Ver `esperandoLaListaDeLaTabla`. */
      esTablero: boolean
      opciones: Record<string, OpcionFiltro[]>
      /** `null` cuando el backend todavia no expone el resumen: la pestaña funciona igual. */
      resumen: ResumenEstadoTareas[] | null
      campos: DefinicionCampoPersonalizado[]
      avisos: string[]
    }

function TareasDelProyecto ({ proyectoId, capacidades }: PropsPanelTareas): ReactElement {
  const router = useRouter()
  const params = useSearchParams()

  const enTablero = params.get('vista') === 'tablero'

  const [carga, setCarga] = useState<Carga>({ fase: 'cargando' })
  const [intento, setIntento] = useState(0)
  const [seleccion, setSeleccion] = useState<number[]>([])

  // Se memoizan porque son dependencias del `useMemo` de la definicion: un array nuevo en cada
  // render la reconstruiria siempre, y con ella todas las celdas.
  const catalogos = carga.fase === 'listo' ? carga.opciones : VACIO_CATALOGOS
  const campos = useMemo(() => carga.fase === 'listo' ? carga.campos : [], [carga])
  const estados = useMemo(() => catalogos.task_statuses ?? [], [catalogos])
  const prioridades = useMemo(() => catalogos.task_priorities ?? [], [catalogos])

  /** Vuelve a pedirlo todo. Va fuera del efecto: un `setState` sincronico dentro encadena renders. */
  const recargar = useCallback(() => {
    setSeleccion([])
    setCarga({ fase: 'cargando' })
    setIntento((n) => n + 1)
  }, [])

  const definicion = useMemo(
    () => definicionDeTareas({
      proyectoId,
      camposPersonalizados: campos,
      capacidades,
      estados,
      onCambiado: recargar
    }),
    [proyectoId, campos, capacidades, estados, recargar]
  )

  const consulta = useMemo(
    () => construirConsulta(leerConsulta(new URLSearchParams(params.toString()), definicion), definicion),
    [params, definicion]
  )

  // Se pide con la consulta vigente al montar y cada vez que algo escribio, pero NO cuando la
  // consulta cambia: de eso se encarga `TablaRecurso`, que ya sabe pedir la pagina siguiente. Pedirla
  // tambien desde aca duplicaria cada filtro y cada cambio de orden.
  useEffect(() => {
    const control = new AbortController()

    void cargarPestana(proyectoId, definicion, consulta, enTablero, control.signal)
      .then((resultado) => { if (!control.signal.aborted) setCarga(resultado) })

    return () => { control.abort() }
    // `definicion` y `consulta` cambian cuando llegan los campos personalizados o cuando se filtra;
    // volver a entrar aca por eso pediria en bucle o duplicaria lo que ya hace el motor de tabla.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [proyectoId, enTablero, intento])

  if (carga.fase === 'cargando') return <Cargando mensaje="Cargando las tareas…" />

  if (carga.fase === 'error') {
    return <ErrorEstado detalle={carga.mensaje} onReintentar={recargar} />
  }

  // Al volver del tablero, la lista en mano es la de antes de los filtros que se pusieron alli, y
  // `TablaRecurso` fija su consulta inicial al montar: montarla ahora la dejaria mostrando esa lista
  // vieja para siempre. Se espera a que llegue la de la consulta vigente. Entrar al tablero no
  // espera nada: `TableroFiltrable` pide lo suyo por su cuenta.
  const esperandoLaListaDeLaTabla = !enTablero && carga.esTablero

  if (esperandoLaListaDeLaTabla) return <Cargando mensaje="Cargando las tareas…" />

  /** Escribe la URL conservando lo que no toca. `replace` para no llenar el historial. */
  function irA (cambiar: (siguientes: URLSearchParams) => void): void {
    const siguientes = new URLSearchParams(params.toString())

    cambiar(siguientes)

    router.replace(`?${siguientes.toString()}`, { scroll: false })
  }

  /** Filtra la tabla por un estado desde las tarjetas de resumen. `null` quita el filtro. */
  function filtrarPorEstado (status: number | null): void {
    irA((siguientes) => {
      if (status === null) siguientes.delete('filter[status]')
      else siguientes.set('filter[status]', String(status))

      siguientes.delete('page')
    })
  }

  const estadoFiltrado = unicoEstadoFiltrado(params.get('filter[status]'))
  const filas = carga.inicial.filas

  return (
    <div className="flex flex-col gap-4">
      {carga.avisos.map((aviso) => (
        <p
          key={aviso}
          role="status"
          className="border-linea bg-superficie-aviso text-texto-aviso rounded-tarjeta border px-3 py-2 text-xs"
        >
          {aviso}
        </p>
      ))}

      {carga.resumen !== null && (
        <ResumenEstadosTareas
          resumen={carga.resumen}
          estadoActivo={estadoFiltrado}
          onElegir={filtrarPorEstado}
        />
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Segmentado
          etiqueta="Presentación"
          opciones={VISTAS}
          activo={enTablero ? 'tablero' : 'tabla'}
          onElegir={(valor) => {
            irA((siguientes) => {
              // La tabla es la vista por defecto: se representa QUITANDO el parametro, no
              // escribiendo `vista=tabla`. Asi la URL que se comparte es la corta.
              if (valor === 'tablero') siguientes.set('vista', 'tablero')
              else siguientes.delete('vista')

              // La pagina es de la tabla: el tablero pagina por columna y arrastrar un `page=3`
              // hasta el le pediria al BFF una pagina que ahi no significa nada.
              siguientes.delete('page')
            })
          }}
        />

        <div className="ml-auto">
          {capacidades.includes('create') && (
            <FormularioTarea proyectoId={proyectoId} prioridades={prioridades} onCreada={recargar} />
          )}
        </div>
      </div>

      {enTablero
        ? (
          <TableroFiltrable<ProcesoAmpliado>
            definicion={definicionDeTablero(definicion, prioridades)}
            ruta={definicion.ruta}
            board="tasks"
            opcionesDeFiltro={carga.opciones}
          />
          )
        : (
          <>
            <AccionesMasivasTareas
              proyectoId={proyectoId}
              ids={seleccion}
              totalEnPagina={filas.length}
              capacidades={capacidades}
              estados={estados}
              prioridades={prioridades}
              onSeleccionarTodo={() => setSeleccion(filas.map((fila) => fila.id))}
              onLimpiar={() => setSeleccion([])}
              onAplicado={recargar}
            />

            <ProveedorSeleccion seleccion={seleccion} onSeleccion={setSeleccion}>
              <TablaRecurso
                key={intento}
                definicion={definicion}
                inicial={carga.inicial}
                claveFila={(proceso) => proceso.id}
                claseFila={(proceso) => estaVencida(proceso) ? 'bg-superficie-peligro' : undefined}
                capacidades={capacidades}
                opcionesDeFiltro={carga.opciones}
                board="tasks"
              />
            </ProveedorSeleccion>
          </>
          )}

      <ModalTarea />
    </div>
  )
}

/**
 * El estado por el que la tabla esta filtrada, si es uno solo.
 *
 * El filtro admite varios valores separados por coma; con dos o mas, ninguna tarjeta del resumen
 * queda activa, porque ninguna representa esa combinacion.
 */
function unicoEstadoFiltrado (crudo: string | null): number | null {
  if (crudo === null) return null

  const valores = crudo.split(',').filter((v) => v !== '')

  if (valores.length !== 1) return null

  const id = Number(valores[0])

  return Number.isInteger(id) ? id : null
}

/**
 * La definicion que consume el tablero, con la tarjeta rica del panel.
 *
 * `presentarTarjeta` recibe `unknown` porque el motor no conoce el recurso: la conversion ocurre en
 * un solo punto, aca, y no en cada campo de la tarjeta.
 */
function definicionDeTablero (
  definicion: DefinicionRecurso<ProcesoAmpliado>,
  prioridades: OpcionFiltro[]
): DefinicionRecurso<ProcesoAmpliado> {
  return {
    ...definicion,
    tablero: {
      // Las columnas llegan ordenadas por `order`, NO por `id`: el orden real es 1, 4, 3, 2, 5.
      columnasDesde: 'task_statuses',
      rutaMover: 'tasks/:id/mover',
      presentarTarjeta: (fila) => (
        <TarjetaTarea proceso={fila as ProcesoAmpliado} prioridades={prioridades} />
      )
    }
  }
}

/**
 * Pide todo lo que la pestaña necesita: la lista para la tabla, los catalogos de los filtros, el
 * resumen por estado y las definiciones de campos personalizados.
 *
 * El tablero no se pide aca: `TableroFiltrable` se lo pide al BFF por su cuenta con los filtros de
 * la URL.
 *
 * La lista y los catalogos son criticos: sin ellos no hay nada que mostrar, y el fallo se convierte
 * en la pantalla de error. El resumen por estado y las definiciones de campos personalizados son
 * accesorios —el backend los esta agregando— y su fallo baja como aviso: una tabla sin las tarjetas
 * de arriba sigue sirviendo, una pantalla de error no.
 *
 * Nunca lanza: el error del contrato es un valor mas.
 *
 * @param proyectoId el proyecto que se esta mirando
 * @param definicion la definicion ya acotada al proyecto
 * @param consulta query string sin `?`
 * @param enTablero la presentacion a la vista, que queda anotada en el resultado
 * @param senal aborta las peticiones si el componente se desmonta
 * @returns el estado de carga resuelto
 */
async function cargarPestana (
  proyectoId: number,
  definicion: DefinicionRecurso<ProcesoAmpliado>,
  consulta: string,
  enTablero: boolean,
  senal: AbortSignal
): Promise<Carga> {
  const ruta = consulta === '' ? definicion.ruta : `${definicion.ruta}?${consulta}`

  try {
    const [lista, lookups] = await Promise.all([
      pedirSobre<ProcesoAmpliado[]>(ruta, senal),
      pedirSobre<Lookups>('lookups', senal)
    ])

    const avisos: string[] = []

    const resumen = await opcional(
      pedirSobre<ResumenEstadoTareas[]>(`projects/${proyectoId}/tasks/summary`, senal)
    )
    if (resumen === null) avisos.push('El resumen por estado todavía no está disponible en la API.')

    const campos = await opcional(
      pedirSobre<DefinicionCampoPersonalizado[]>('custom-fields?para=tasks', senal)
    )
    if (campos === null) avisos.push('No se pudieron traer los campos personalizados: la tabla va sin ellos.')

    return {
      fase: 'listo',
      esTablero: enTablero,
      inicial: { filas: lista.data, paginacion: lista.meta?.pagination },
      opciones: opcionesDeFiltros(definicion, lookups.data),
      resumen,
      campos: campos ?? [],
      avisos
    }
  } catch (fallo) {
    if (senal.aborted) return { fase: 'cargando' }

    return {
      fase: 'error',
      mensaje: fallo instanceof Error ? fallo.message : 'No se pudieron cargar las tareas.'
    }
  }
}

/**
 * Resuelve una peticion accesoria sin dejar que su fallo tumbe la pantalla.
 *
 * @param promesa la peticion
 * @returns los datos, o `null` si fallo
 */
async function opcional<T> (promesa: Promise<{ data: T }>): Promise<T | null> {
  try {
    return (await promesa).data
  } catch {
    // El fallo de un accesorio se informa como aviso, no como error: quien llama decide el texto.
    return null
  }
}
