'use client'

import { Suspense, useCallback, useEffect, useMemo, useState, type ReactElement } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { PARAMETRO_TAREA } from '@/componentes/datos/tabla'
import { TablaRecurso } from '@/componentes/datos/TablaRecurso'
import { TableroFiltrable } from '@/componentes/datos/TableroFiltrable'
import { Segmentado, type OpcionSegmentada } from '@/componentes/formularios/Segmentado'
import { Cargando, ErrorEstado } from '@/componentes/estado/Estados'
import { staffParaFiltros } from '@/datos/asignables'
import { opcionesDeFiltros } from '@/datos/catalogos'
import { pedirSobre } from '@/datos/cliente'
import { filtrosDeCamposPersonalizados } from '@/definiciones/filtros'
import { construirConsulta, leerConsulta } from '@/datos/consulta'
import type { DefinicionRecurso, OpcionFiltro, ResultadoLista } from '@/definiciones/tipos'
import type {
  DefinicionCampoPersonalizado,
  Hito,
  Lookups,
  Referencia,
  ProcesoAmpliado,
  ResumenEstadoTareas
} from '@/datos/recursos'
import type { Capacidad } from '@/datos/tipos'
import { conConsulta, type FuenteDeProyecto } from '@/dominio/fuente-proyecto'
import { AccionesMasivasTareas } from './AccionesMasivasTareas'
import { CalendarioTareas } from './CalendarioTareas'
import { ModalTarea } from './ModalTarea'
import { FormularioTarea } from './FormularioTarea'
import { ResumenEstadosTareas } from './ResumenEstadosTareas'
import { TarjetaTarea, type ProcesoDeTarjeta } from './TarjetaTarea'
import { definicionDeTareas } from './columnas-tareas'
import { opcionesDeFiltroDeHito, TOPE_DE_HITOS } from './hitos'
import { BotonCompletados } from './BotonCompletados'
import { estaVencida } from './tareas'

/**
 * Pestaña Tareas de un proyecto: resumen por estado, tabla, tablero y calendario.
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

/** Las tres lecturas de las tareas. `tabla` es la de por defecto y no escribe `?vista=`. */
const VISTAS: readonly OpcionSegmentada[] = [
  { valor: 'tabla', etiqueta: 'Tabla', icono: 'tabla' },
  { valor: 'tablero', etiqueta: 'Tablero', icono: 'tablero' },
  { valor: 'calendario', etiqueta: 'Calendario', icono: 'calendario' }
]

/**
 * `true` si la definicion puede acotar por rango de fechas.
 *
 * El calendario pide un mes con `filter[due_date__gte]` y `filter[due_date__lte]`, asi que existe
 * solo donde ese filtro esta declarado: donde no —el contrato del contacto solo acepta `status`— cada
 * cambio de periodo devolvia 422 y la grilla quedaba con el error encima.
 *
 * No es una pregunta sobre el sujeto sino sobre la definicion, y por eso no hace falta saber quien
 * mira. El cliente igual tiene calendario: es una pestaña propia del Proyecto (`PanelCalendario`),
 * que la API habilita aparte y que baja el mes entero de una vez sin filtrar por rango.
 *
 * @param definicion La definicion vigente.
 * @returns Si se puede ofrecer la lectura de calendario.
 */
function admiteCalendario (definicion: DefinicionRecurso<ProcesoAmpliado>): boolean {
  return definicion.filtros.some((filtro) => filtro.clave === 'due_date' && filtro.tipo === 'campo')
}

interface PropsPanelTareas {
  proyectoId: number
  /**
   * De donde bajan los datos: del panel del colaborador o del portal del cliente.
   *
   * Es lo unico que cambia entre los dos sujetos. Adentro de esta pestaña **no hay ninguna rama por
   * sujeto**: las rutas llegan resueltas y los recursos que un contacto no tiene llegan en `null`,
   * asi que el resumen por estado y las columnas personalizadas simplemente no se piden.
   */
  fuente: FuenteDeProyecto
  /**
   * Lo que se puede escribir sobre Procesos. `[]` apaga el alta, las acciones masivas y la edicion
   * en linea: es como el portal deja la pestaña en solo lectura, sin quitarle ninguna lectura.
   */
  capacidades: Capacidad[]
  /**
   * Si la capa de IA esta encendida. Viaja desde el servidor y no se consulta aca: `GET /settings`
   * desde el navegador seria una peticion mas por cada panel que quiera saberlo.
   */
  conIa: boolean
}

export function PanelTareas (props: PropsPanelTareas): ReactElement {
  // `TablaRecurso` y el propio panel leen `useSearchParams`. Sin este limite de Suspense el build de
  // cualquier pagina que los monte falla, y esa pagina la escribe otra persona.
  return (
    <Suspense fallback={<Cargando mensaje="Cargando las tareas…" />}>
      <TareasDelProyecto {...props} />
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
      /** Etiquetas ya creadas: el alta solo acepta estas, la API rechaza las que no existen. */
      etiquetas: Referencia[]
      /** `null` cuando el backend todavia no expone el resumen: la pestaña funciona igual. */
      resumen: ResumenEstadoTareas[] | null
      campos: DefinicionCampoPersonalizado[]
      avisos: string[]
    }

function TareasDelProyecto ({ proyectoId, fuente, capacidades, conIa }: PropsPanelTareas): ReactElement {
  const router = useRouter()
  const params = useSearchParams()

  const presentacion = params.get('vista')
  const enTablero = presentacion === 'tablero'

  const [carga, setCarga] = useState<Carga>({ fase: 'cargando' })
  const [intento, setIntento] = useState(0)

  // Se memoizan porque son dependencias del `useMemo` de la definicion: un array nuevo en cada
  // render la reconstruiria siempre, y con ella todas las celdas.
  const catalogos = carga.fase === 'listo' ? carga.opciones : VACIO_CATALOGOS
  const campos = useMemo(() => carga.fase === 'listo' ? carga.campos : [], [carga])
  const estados = useMemo(() => catalogos.task_statuses ?? [], [catalogos])
  const prioridades = useMemo(() => catalogos.task_priorities ?? [], [catalogos])
  const etiquetas = useMemo(() => carga.fase === 'listo' ? carga.etiquetas : [], [carga])

  /** Vuelve a pedirlo todo. Va fuera del efecto: un `setState` sincronico dentro encadena renders. */
  const recargar = useCallback(() => {
    setCarga({ fase: 'cargando' })
    setIntento((n) => n + 1)
  }, [])

  const definicion = useMemo(
    () => definicionDeTareas({
      proyectoId,
      fuente,
      camposPersonalizados: campos,
      capacidades,
      estados,
      onCambiado: recargar
    }),
    [proyectoId, fuente, campos, capacidades, estados, recargar]
  )

  // Se decide contra la definicion y no contra la URL sola: con `?vista=calendario` en una
  // definicion que no acota por fechas, la lectura cae a la tabla en vez de pedir un 422 por mes.
  const conCalendario = admiteCalendario(definicion)
  const enCalendario = presentacion === 'calendario' && conCalendario
  const vistas = useMemo(
    () => conCalendario ? VISTAS : VISTAS.filter((vista) => vista.valor !== 'calendario'),
    [conCalendario]
  )

  // Se pide con la consulta vigente al montar y cada vez que algo escribio, pero NO cuando la
  // consulta cambia: de eso se encarga `TablaRecurso`, que ya sabe pedir la pagina siguiente. Pedirla
  // tambien desde aca duplicaria cada filtro y cada cambio de orden.
  useEffect(() => {
    const control = new AbortController()

    void cargarPestana(fuente, definicion, params.toString(), enTablero, control.signal)
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
  const esperandoLaListaDeLaTabla = !enTablero && !enCalendario && carga.esTablero

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
  // Las acciones masivas cambian estado, prioridad, asignados y borran: sin ninguna de esas
  // capacidades la barra quedaria vacia y las casillas de seleccion no llevarian a ningun lado.
  const puedeAccionarEnMasa = capacidades.includes('edit') || capacidades.includes('delete')

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
        <BotonCompletados />
        <Segmentado
          etiqueta="Presentación"
          opciones={vistas}
          activo={enTablero ? 'tablero' : enCalendario ? 'calendario' : 'tabla'}
          onElegir={(valor) => {
            irA((siguientes) => {
              // La tabla es la vista por defecto: se representa QUITANDO el parametro, no
              // escribiendo `vista=tabla`. Asi la URL que se comparte es la corta.
              if (valor === 'tabla') siguientes.delete('vista')
              else siguientes.set('vista', valor)

              // La pagina es de la tabla: el tablero pagina por columna y el calendario reparte por
              // dia; arrastrar un `page=3` hasta ellos pediria una pagina que ahi no significa nada.
              siguientes.delete('page')
            })
          }}
        />

        <div className="ml-auto">
          {capacidades.includes('create') && (
            <FormularioTarea
              proyectoId={proyectoId}
              prioridades={prioridades}
              etiquetasDisponibles={etiquetas}
              conIa={conIa}
              onCreada={recargar}
            />
          )}
        </div>
      </div>

      {enCalendario
        // Sin `fuente`: este calendario arma sus rutas desde `definicion.ruta`, que ya es la suya.
        ? <CalendarioTareas definicion={definicion} capacidades={capacidades} opcionesDeFiltro={carga.opciones} />
        : enTablero
          ? (
          <TableroFiltrable<ProcesoAmpliado>
            definicion={definicionDeTablero(definicion, estados)}
            ruta={definicion.ruta}
            // Sin `board` fijo: `ControlesTabla` lo deduce de la ruta y devuelve `null` para el
            // portal, que no tiene presets de filtro. Escribirlo a mano pediria `filter-presets` con
            // la sesion de un contacto, que es un 404 del BFF y un aviso de error en pantalla.
            opcionesDeFiltro={carga.opciones}
          />
            )
          : (
          <TablaRecurso
            key={intento}
            definicion={definicion}
            inicial={carga.inicial}
            claveFila={(proceso) => proceso.id}
            // `alerta-vencida` es el parpadeo acotado (`estilos/alerta-vencida.css`), que se apaga
            // solo a los seis ciclos y no corre para quien pidio menos movimiento. El rojo de
            // fondo es lo que queda cuando se apaga, asi que la alerta no depende de la animacion.
            claseFila={(proceso) => estaVencida(proceso) ? 'bg-superficie-peligro alerta-vencida' : undefined}
            // La fila entera abre el detalle, igual que en la vista global. El enlace del nombre
            // sigue siendo el camino del teclado; esto es la comodidad del mouse encima de el.
            abrirEn={{ clave: PARAMETRO_TAREA, valor: (proceso) => proceso.id }}
            capacidades={capacidades}
            opcionesDeFiltro={carga.opciones}
            // Ver el comentario del tablero: el `board` sale de la ruta, no escrito a mano.
            //
            // La seleccion la dibuja el motor. `recargar` es el del panel y no el del motor a
            // proposito: una accion masiva tambien cambia el resumen por estado de arriba.
            //
            // Sin capacidad de escritura no se pasa: las casillas de seleccion por fila existen para
            // llegar a estas acciones, y ofrecerlas para despues no poder hacer nada con ellas es
            // como el portal terminaria con una barra de acciones vacia encima de la tabla.
            seleccionMasiva={puedeAccionarEnMasa
              ? (filas, limpiar) => (
                <AccionesMasivasTareas
                  proyectoId={proyectoId}
                  filas={filas}
                  capacidades={capacidades}
                  estados={estados}
                  prioridades={prioridades}
                  limpiar={limpiar}
                  recargar={recargar}
                />
                )
              : undefined}
          />
            )}

      <ModalTarea
        fuente={fuente}
        puedeEditar={capacidades.includes('edit')}
        puedeBorrar={capacidades.includes('delete')}
        puedeCrear={capacidades.includes('create')}
      />
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
  estados: OpcionFiltro[]
): DefinicionRecurso<ProcesoAmpliado> {
  return {
    ...definicion,
    tablero: {
      // Las columnas llegan ordenadas por `order`, NO por `id`: el orden real es 1, 4, 3, 2, 5.
      columnasDesde: 'task_statuses',
      rutaMover: 'tasks/:id/mover',
      // `ProcesoDeTarjeta` y no `ProcesoAmpliado`: la tarjeta declara lo minimo que dibuja, y el
      // contrato del cliente manda menos que el del equipo.
      presentarTarjeta: (fila) => (
        <TarjetaTarea proceso={fila as ProcesoDeTarjeta} estados={estados} />
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
 * **Ninguna ruta se escribe aca.** Todas salen de `fuente`, y las que llegan en `null` son los
 * recursos que ese sujeto no tiene: no se piden y la pestaña se dibuja igual. Eso es lo que deja
 * esta funcion sin una sola rama por sujeto.
 *
 * @param fuente de donde bajan los datos: panel del colaborador o portal del cliente
 * @param definicion la definicion ya acotada al proyecto
 * @param consulta query string sin `?`
 * @param enTablero la presentacion a la vista, que queda anotada en el resultado
 * @param senal aborta las peticiones si el componente se desmonta
 * @returns el estado de carga resuelto
 */
async function cargarPestana (
  fuente: FuenteDeProyecto,
  definicion: DefinicionRecurso<ProcesoAmpliado>,
  consulta: string,
  enTablero: boolean,
  senal: AbortSignal
): Promise<Carga> {
  try {
    // Sin campos personalizados no hay columnas ni filtros `cf_`, y la tabla es la misma sin ellos.
    const campos = fuente.camposDeTareas === null
      ? []
      : (await pedirSobre<DefinicionCampoPersonalizado[]>(fuente.camposDeTareas, senal)).data
    const completa = { ...definicion, filtros: [...definicion.filtros.filter((filtro) => !filtro.clave.startsWith('cf_')), ...filtrosDeCamposPersonalizados(campos)] }
    const query = construirConsulta(leerConsulta(new URLSearchParams(consulta), completa), completa)
    const ruta = conConsulta(fuente.tareas, query)
    // El equipo no viene en `/lookups` y es lo que llena los filtros por persona (Asignado, Creado
    // por, Seguidor). Se pide junto con lo demas y ya esta cacheado por pestaña; si falla, esos
    // filtros quedan sin opciones y el resto de la tabla no se entera. En el portal la definicion no
    // declara ningun filtro por persona, asi que `staffParaFiltros` no pide nada.
    const [lista, lookups, personas] = await Promise.all([
      pedirSobre<ProcesoAmpliado[]>(ruta, senal),
      pedirSobre<Lookups>(fuente.lookups, senal),
      staffParaFiltros(definicion)
    ])

    const avisos: string[] = []

    const resumen = fuente.resumenDeTareas === null
      ? null
      : await opcional(pedirSobre<ResumenEstadoTareas[]>(fuente.resumenDeTareas, senal))
    // El aviso es para el backend que todavia no lo expone, no para el sujeto que no lo tiene: con
    // la ruta en `null` las tarjetas de arriba simplemente no van, y no hay nada que avisar.
    if (fuente.resumenDeTareas !== null && resumen === null) {
      avisos.push('El resumen por estado todavía no está disponible en la API.')
    }

    // Los hitos no salen de `/lookups`: cuelgan de un Espacio, asi que hay que pedirlos por su ruta.
    // Accesorio como los dos de arriba, pero sin aviso: si no llegan, el motor simplemente no dibuja
    // el filtro por hito, y una tabla sin ese desplegable sigue sirviendo entera.
    const hitos = await opcional(
      pedirSobre<Hito[]>(conConsulta(fuente.hitos, `per_page=${TOPE_DE_HITOS}`), senal)
    )

    return {
      fase: 'listo',
      esTablero: enTablero,
      inicial: { filas: lista.data, paginacion: lista.meta?.pagination },
      opciones: {
        ...catalogosDeInsignias(definicion, { ...lookups.data, staff: personas }),
        ...opcionesDeFiltros(definicion, { ...lookups.data, staff: personas }),
        milestones: opcionesDeFiltroDeHito(hitos ?? [])
      },
      etiquetas: lookups.data.tags ?? [],
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
 * Los catalogos que piden las columnas que se pintan como insignia.
 *
 * `opcionesDeFiltros` resuelve los de los **filtros**, y en el panel eso alcanza por casualidad:
 * Estado y Prioridad son columna y filtro a la vez. El contrato del contacto no acepta filtrar por
 * prioridad, asi que sin esto su columna Prioridad mostraba `#4` en vez del nombre.
 *
 * Se reusa `opcionesDeFiltros` con las columnas disfrazadas de filtro en vez de repetir el mapeo:
 * el color y el nombre de cada opcion se resuelven en un solo lugar.
 *
 * @param definicion La definicion vigente, con sus columnas.
 * @param lookups Los catalogos ya cargados.
 * @returns Un mapa indexado por el catalogo que pide cada columna.
 */
function catalogosDeInsignias (
  definicion: DefinicionRecurso<ProcesoAmpliado>,
  lookups: Lookups
): Record<string, OpcionFiltro[]> {
  const comoFiltros = definicion.columnas
    .filter((columna) => columna.comoInsignia !== undefined)
    .map((columna) => ({
      clave: columna.clave,
      etiqueta: columna.encabezado,
      tipo: 'multiple' as const,
      desdeLookup: columna.comoInsignia
    }))

  return opcionesDeFiltros({ ...definicion, filtros: comoFiltros }, lookups)
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
