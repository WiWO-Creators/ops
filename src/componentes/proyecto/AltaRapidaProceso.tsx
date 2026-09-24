'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useRef, useState, useId, type FormEvent, type ReactElement } from 'react'
import { Boton } from '@/componentes/formularios/Boton'
import { useAccionPresencia } from '@/componentes/auditoria/accion'
import { Campo } from '@/componentes/formularios/Campo'
import { AreaTexto, Entrada } from '@/componentes/formularios/Entrada'
import { CamposPersonalizados } from '@/componentes/formularios/CamposPersonalizados'
import { cargarAsignables } from '@/datos/asignables'
import { cargarClientesDestino, cargarEspaciosDestino } from '@/datos/espacios-destino'
import {
  camposOrdenados, cuerpoDeCamposPersonalizados, esquemaDeCamposPersonalizados, valoresPorDefecto,
  type ValoresDeCampos, type ErroresDeCampos
} from '@/dominio/campos-personalizados'
import { Segmentado } from '@/componentes/formularios/Segmentado'
import {
  ContenidoSelector,
  DisparadorSelector,
  Opcion,
  Selector,
  SelectorBuscable
} from '@/componentes/formularios/Selector'
import { SelectorPersonas } from '@/componentes/formularios/SelectorPersonas'
import { FinDeRecurrencia, type ValorFin } from '@/componentes/recurrencia/FinDeRecurrencia'
import { cuerpoDeFin, errorDeFin } from '@/dominio/recurrencia'
import {
  CerrarDialogo,
  ContenidoDialogo,
  Dialogo,
  DisparadorDialogo
} from '@/componentes/superposiciones/Dialogo'
import { escribirEnBff } from '@/componentes/datos/mutaciones'
import { pedirSobre } from '@/datos/cliente'
import { asignadosIniciales, interpretarAltaRapida, type CatalogosAlta } from '@/dominio/alta-rapida'
import {
  fusionarEspacio,
  fusionarInterpretacion,
  leerCamposTarea,
  type CampoDeTarea,
  type CatalogosTarea,
  type TareaFusionada
} from '@/dominio/ia-tarea'
import { errorDeDescripcion, errorDeDetalle } from '@/dominio/descripcion-tarea'
import {
  claseDeEspacio, espaciosDeClase, esRelacionDeEspacio, relTypeDeRelacion, RELACIONES_TAREA,
  type RelacionTarea
} from '@/dominio/espacios-destino'
import { GLOSARIO } from '@/dominio/glosario'
import { errorDeHorasEstimadas, horasDeTexto } from '@/dominio/tiempo-estimado'
import { formatearFecha } from '@/lib/fechas'
import { enFormatoTitulo } from '@/lib/titulo'
import { AsistenteDescripcion } from './AsistenteDescripcion'
import { SelectorEspacios } from './SelectorEspacios'
import { VistaPreviaAlta, type MarcaPrevia } from './VistaPreviaAlta'
import type {
  DefinicionCampoPersonalizado,
  Hito,
  Lookups,
  ConfiguracionTiposEspacio,
  Referencia,
  TipoDeProcesoDelEspacio
} from '@/datos/recursos'
import type { StaffReferencia, Yo } from '@/datos/tipos'

/** Formulario único de creación, con entrada por campos o interpretación de una línea. */
interface PropsAltaRapida {
  /** Personas, Espacios y prioridades contra los que resolver `@`, `#` y `!`. */
  catalogos?: CatalogosAlta
  /**
   * Etiquetas que ya existen (`lookups.tags`).
   *
   * Se ofrecen como sugerencia en un `datalist`, no como limite: una etiqueta escrita que no esta
   * en el catalogo se crea en el alta. Solo las usa el modo por campos.
   */
  etiquetas?: Referencia[]
  /**
   * Si la capa de IA esta encendida (`ia_habilitada`).
   *
   * Apagada, el campo de texto libre y su boton no se pintan: la API responde 404 a `/ia/*` y
   * ofrecer un boton que falla es peor que no ofrecerlo.
   */
  conIa: boolean
  proyectoId?: number
  hitoInicial?: number
  integrado?: boolean
  abrirInicialmente?: boolean
  onCreada?: () => void
  onCerrar?: () => void
  onOcupado?: (ocupado: boolean) => void
}

/** Valor del selector cuando no se eligio nada. Radix no admite `value=""` en una opcion. */
const NINGUNO = 'ninguno'

/** `id` del `datalist` de etiquetas; el `list` del campo lo referencia por nombre. */
const CATALOGOS_VACIOS: CatalogosAlta = { personas: [], espacios: [], prioridades: [] }
const ETIQUETAS_VACIAS: Referencia[] = []

/** Mientras el catalogo no llega no hay ninguna Licitacion ni Upsell que separar. */
const SIN_OPORTUNIDADES: ReadonlySet<number> = new Set<number>()
const SIN_CLIENTES: Referencia[] = []

/** Como se nombra cada relacion en el selector y en el campo de destino. */
const NOMBRES_DE_RELACION: Record<RelacionTarea, { singular: string, plural: string }> = {
  project: GLOSARIO.espacio,
  licitacion: GLOSARIO.licitacion,
  // "Upselling" y no "Upsell": es como el equipo llama a la seccion y a lo que cuelga de ella.
  upsell: { singular: GLOSARIO.upsell.plural, plural: GLOSARIO.upsell.plural },
  customer: GLOSARIO.cliente
}

/** Los dos modos del dialogo. */
const MODOS = [
  { valor: 'linea', etiqueta: 'En una línea' },
  { valor: 'campos', etiqueta: 'Por campos' }
] as const

type Modo = typeof MODOS[number]['valor']

/** Ruta del alta en varios Espacios a la vez. Ver `POST /tasks/multi-espacio` en la API. */
const RUTA_MULTI = 'tasks/multi-espacio'

/** Una recurrencia recien encendida no termina: es lo que pide la mayoria y lo que hacia el alta antes. */
const FIN_INICIAL: ValorFin = { modo: 'nunca', ciclos: '12', hasta: '' }

/**
 * Cuántos Espacios acepta un alta múltiple.
 *
 * Copia del tope del servidor (`CrearProceso::MAXIMO_ESPACIOS`). Se repite acá solo para avisar
 * antes del viaje; quien decide sigue siendo la API, que responde 422 `espacios: ["demasiados"]`.
 */
const MAXIMO_ESPACIOS = 20

/** Lo que devuelve `POST /tasks/multi-espacio` por cada destino que se creó. */
interface AltaEnEspacio {
  espacio_id: number
  task_id: number
}

/** Lo que devuelve `POST /tasks/multi-espacio` por cada destino que no se pudo crear. */
interface FalloEnEspacio {
  espacio_id: number
  motivo: string
}

/** El parte del alta múltiple, tal como llega en `data`. */
interface ParteMulti {
  creados: AltaEnEspacio[]
  fallidos: FalloEnEspacio[]
}

/** Lo que el diálogo tiene que seguir mostrando cuando un alta múltiple sale a medias. */
interface ResumenParcial {
  /** Nombre del Espacio y qué pasó ahí, ya en texto para la persona. */
  hechos: Array<{ espacioId: number, nombre: string, detalle: string, ok: boolean }>
  /** Espacios que hay que reintentar; los que ya tienen su tarea no vuelven a viajar. */
  pendientes: number[]
}

/** Los campos manuales, para poder devolverlos tal como estaban antes de que la IA los pisara. */
interface CamposManuales {
  nombre: string
  hito: string
  relacion: RelacionTarea
  relacionId: string
  espacios: number[]
  asignados: number[]
  seguidores: number[]
  tipo: string
  prioridad: string
  inicio: string
  vencimiento: string
  etiquetasEscritas: string
  descripcion: string
}

export function AltaRapidaProceso ({
  catalogos: catalogosRecibidos, etiquetas: etiquetasRecibidas, conIa,
  proyectoId, hitoInicial, integrado = false, abrirInicialmente = false, onCreada, onCerrar, onOcupado
}: PropsAltaRapida): ReactElement {
  const router = useRouter()
  const [abierto, setAbierto] = useState(integrado || abrirInicialmente)
  const listaEtiquetas = useId()
  const enviando = useRef(false)
  const [catalogosCargados, setCatalogosCargados] = useState<CatalogosAlta>(catalogosRecibidos ?? CATALOGOS_VACIOS)
  const [lookups, setLookups] = useState<Lookups | null>(null)
  /**
   * Cuales de los Espacios del catalogo son Licitaciones y cuales Upsells.
   *
   * Solo para ofrecer cada catalogo por su lado: la Tarea se crea igual que en un Proyecto
   * —`rel_type` `project` y el id del Espacio—, porque una Licitacion o un Upsell **es** un Espacio.
   */
  const [licitaciones, setLicitaciones] = useState<ReadonlySet<number>>(SIN_OPORTUNIDADES)
  const [upsells, setUpsells] = useState<ReadonlySet<number>>(SIN_OPORTUNIDADES)
  const [clientes, setClientes] = useState<Referencia[]>(SIN_CLIENTES)
  const catalogos = catalogosCargados
  const etiquetas = etiquetasRecibidas ?? lookups?.tags ?? ETIQUETAS_VACIAS
  const [cargando, setCargando] = useState(true)
  const [errorCarga, setErrorCarga] = useState<string | null>(null)
  const [intentoCarga, setIntentoCarga] = useState(0)
  const [definiciones, setDefiniciones] = useState<DefinicionCampoPersonalizado[]>([])
  const [personalizados, setPersonalizados] = useState<ValoresDeCampos>({})
  const [erroresCampos, setErroresCampos] = useState<ErroresDeCampos>({})
  const [creadaId, setCreadaId] = useState<number | null>(null)
  const [relacion, setRelacion] = useState<RelacionTarea>('project')
  const [relacionId, setRelacionId] = useState('')
  const [estado, setEstado] = useState(NINGUNO)
  const [hito, setHito] = useState(hitoInicial === undefined ? NINGUNO : String(hitoInicial))
  const [hitos, setHitos] = useState<Hito[]>([])
  const [tarifa, setTarifa] = useState('')
  const [publica, setPublica] = useState(false)
  // Nace marcada: el portal solo muestra lo visible, y una tarea que arranca oculta le deja al
  // cliente la impresion de que nadie esta trabajando. Lo interno se desmarca a mano.
  const [visibleCliente, setVisibleCliente] = useState(true)
  const [recurrente, setRecurrente] = useState(false)
  const [cada, setCada] = useState('1')
  const [unidad, setUnidad] = useState('month')
  const [fin, setFin] = useState<ValorFin>(FIN_INICIAL)
  const [cierre, setCierre] = useState('')

  useAccionPresencia('creando_tarea', abierto)
  const [modo, setModo] = useState<Modo>('campos')
  const [texto, setTexto] = useState('')
  const [enCurso, setEnCurso] = useState(false)
  const [error, setError] = useState<string | null>(null)
  /**
   * El parte del último alta múltiple que salió a medias.
   *
   * Va aparte de `error` y no se borra al reintentar hasta tener uno nuevo: cuando se crean tres de
   * cinco, lo que la persona necesita saber es cuáles tres —para no volver a crearlas— y por qué
   * fallaron las otras dos. Un cartel genérico que además vacíe el formulario obliga a reescribir
   * todo y adivinar dónde quedó la tarea.
   */
  const [parcial, setParcial] = useState<ResumenParcial | null>(null)

  // Campos del modo "por campos". Viven aparte de la linea a proposito: cambiar de modo no debe
  // borrar lo que se escribio en el otro, porque se alterna justo cuando un `@` no resolvio.
  const [nombre, setNombre] = useState('')
  /**
   * Los Espacios destino, en el orden en que se eligieron. **Es la fuente de verdad.**
   *
   * Antes era un solo id en un `Selector`. Ahora es una lista porque la misma tarea se pide muchas
   * veces en varios Espacios a la vez, y repetir el formulario entero una vez por Espacio es lo que
   * hace que esas tareas terminen en un chat.
   *
   * Con cero o un elemento el alta es EXACTAMENTE la de siempre: mismo `POST /tasks`, mismo cuerpo.
   * La ruta múltiple aparece recién con dos.
   */
  const [espacios, setEspacios] = useState<number[]>(proyectoId === undefined ? [] : [proyectoId])
  /**
   * El primer Espacio elegido, en la forma de cadena que ya usaban los campos que dependen de él.
   *
   * Derivado y no un estado propio: dos estados para el mismo dato es el que se desincroniza. De
   * este salen los hitos, los tipos y el contexto del asistente de descripción, y por eso el orden
   * de elección importa.
   */
  const espacio = espacios.length === 0 ? NINGUNO : String(espacios[0])
  /** Hay más de un destino: el hito y el tipo dejan de tener sentido (son por Espacio). */
  const multiple = espacios.length > 1
  /** La relacion elegida es un Espacio —Proyecto, Licitacion o Upsell— y no un Cliente. */
  const vaAEspacio = esRelacionDeEspacio(relacion)
  const [asignados, setAsignados] = useState<number[]>([])
  /** Quien esta creando. Arranca como responsable y vuelve a serlo al limpiar el alta (WIW-0444). */
  const [yoId, setYoId] = useState<number | null>(null)
  const [seguidores, setSeguidores] = useState<number[]>([])
  const [prioridad, setPrioridad] = useState(NINGUNO)
  const [inicio, setInicio] = useState('')
  const [vencimiento, setVencimiento] = useState('')
  const [etiquetasEscritas, setEtiquetasEscritas] = useState('')
  const [descripcion, setDescripcion] = useState('')
  /**
   * El error de la descripcion va aparte del `error` del formulario.
   *
   * La descripcion es obligatoria desde esta tanda, y el cartel generico de arriba del boton Crear
   * no sirve para un campo que esta a media pantalla de distancia: hay que verlo donde se escribe y
   * hay que quedar parado ahi. Por eso este estado y `enfocarDescripcion()`, y por eso no es un
   * `alert()`, que ademas se lleva el foco a un boton de Aceptar y lo devuelve al body.
   */
  const [errorDescripcion, setErrorDescripcion] = useState<string | null>(null)
  /**
   * Caja del campo Descripcion, solo para poder enfocarlo.
   *
   * Se apunta al contenedor y se busca el `textarea` adentro, como ya hace `ChatDeSala`: `AreaTexto`
   * no reenvia `ref`, y el `id` que cablea `Campo` lo genera `Campo` con su `useId()` y no sale de
   * su funcion hija.
   */
  const cajaDescripcion = useRef<HTMLDivElement | null>(null)
  // Se pide en el alta y no solo en la ficha: la estimacion se define al solicitar la tarea, y lo que
  // no se anota en ese momento no se anota nunca.
  const [horasEstimadas, setHorasEstimadas] = useState('')
  const [facturable, setFacturable] = useState(true)
  // El tipo depende del Espacio, asi que su catalogo se pide y no viene en `catalogos`.
  const [tipo, setTipo] = useState(NINGUNO)
  const [tipos, setTipos] = useState<TipoDeProcesoDelEspacio[]>([])
  const [avisoTipos, setAvisoTipos] = useState<string | null>(null)

  // Lo del texto libre que rellena los campos.
  const [textoLibre, setTextoLibre] = useState('')
  const [interpretando, setInterpretando] = useState(false)
  const [avisoIa, setAvisoIa] = useState<string | null>(null)
  const [fusion, setFusion] = useState<TareaFusionada | null>(null)
  const [previo, setPrevio] = useState<CamposManuales | null>(null)
  // Aparte de `fusion.deIa` porque el Espacio no es uno de los campos que fusiona
  // `fusionarInterpretacion()`: lo resuelve `fusionarEspacio()`, que es otra decision.
  const [espacioDeIa, setEspacioDeIa] = useState(false)

  // No se habilita el alta hasta conocer también los campos personalizados obligatorios.
  useEffect(() => {
    if (!abierto) return
    const control = new AbortController()
    const cargar = async (): Promise<void> => {
      try {
        const [campos, opciones, personas, destinos, cartera, yo] = await Promise.all([
          pedirSobre<DefinicionCampoPersonalizado[]>('custom-fields?para=tasks', control.signal),
          pedirSobre<Lookups>('lookups', control.signal),
          cargarAsignables(),
          cargarEspaciosDestino(control.signal),
          cargarClientesDestino(control.signal),
          // Sin `/me` el alta sigue funcionando, solo que sin responsable preelegido.
          pedirSobre<Yo>('me', control.signal).then((sobre) => sobre.data.id, () => null)
        ])
        if (control.signal.aborted) return
        const ordenadas = camposOrdenados(campos.data)
        setDefiniciones(ordenadas)
        setPersonalizados(valoresPorDefecto(ordenadas))
        setLookups(opciones.data)
        setLicitaciones(destinos.licitaciones)
        setUpsells(destinos.upsells)
        setClientes(cartera)
        // Abierta desde una Licitacion o un Upsell, la relacion arranca en su clase: si no, el
        // Espacio fijado no estaria en el catalogo que se muestra.
        if (proyectoId !== undefined) setRelacion(claseDeEspacio(proyectoId, destinos))
        setCatalogosCargados({ personas, espacios: destinos.espacios, prioridades: opciones.data.task_priorities })
        const iniciales = asignadosIniciales(yo, personas)
        setYoId(iniciales[0] ?? null)
        // Solo si nadie eligio todavia: un reintento de carga no pisa lo que la persona ya decidio.
        setAsignados((actuales) => actuales.length === 0 ? iniciales : actuales)
        setErrorCarga(null)
      } catch (fallo) {
        if (!control.signal.aborted) setErrorCarga(fallo instanceof Error ? fallo.message : 'No se pudieron cargar los campos de la tarea.')
      } finally {
        if (!control.signal.aborted) setCargando(false)
      }
    }
    void cargar()
    return () => { control.abort() }
  }, [abierto, intentoCarga, proyectoId])

  /*
   * Los tipos de Proceso que ofrece el Espacio elegido.
   *
   * No salen de `lookups.task_types`: la API valida el tipo contra `tblproject_task_types` —la
   * relacion Espacio <-> tipo— y rechaza con `422 no_pertenece_al_espacio` cualquier otro id, ademas
   * de que el catalogo global repite los mismos tres nombres una vez por Espacio. Sin Espacio no hay
   * tipo posible: el selector queda deshabilitado hasta que se elija uno.
   */
  useEffect(() => {
    // Con varios destinos no se piden: cada Espacio ofrece los suyos y la API rechaza un tipo o un
    // hito que no sea del Espacio de la tarea, así que no hay una lista común que mostrar.
    if (!abierto || espacio === NINGUNO || multiple) return

    const control = new AbortController()

    void Promise.all([
      pedirSobre<ConfiguracionTiposEspacio>(`projects/${espacio}/task-types`, control.signal),
      pedirSobre<Hito[]>(`projects/${espacio}/milestones`, control.signal)
    ]).then(([sobre, lista]) => {
        if (!control.signal.aborted) {
          setTipos(sobre.data.task_types)
          setHitos(lista.data)
        }
      })
      .catch(() => {
        // Sin tipos el alta sigue funcionando: se dice y se deja crear la tarea sin tipo.
        if (!control.signal.aborted) setAvisoTipos('No se pudieron traer los tipos y los hitos de este proyecto. Vuelve a elegirlo para reintentar.')
      })

    return () => { control.abort() }
  }, [espacio, abierto, multiple])

  /** Deja el hito y el tipo sin elegir, con su catálogo vacío. */
  function olvidarHitoYTipo (): void {
    setHito(NINGUNO)
    setHitos([])
    setTipo(NINGUNO)
    setTipos([])
    setAvisoTipos(null)
  }

  /**
   * Elige UN Espacio y descarta el tipo que hubiera. La usan la línea y la interpretación de IA,
   * que resuelven un solo destino.
   *
   * El descarte va aca y no en el efecto: un tipo del Espacio anterior es justo lo que la API
   * rechaza con `422 no_pertenece_al_espacio`, y dejarlo puesto convertiria un cambio de Espacio en
   * un error al crear.
   */
  function elegirEspacio (valor: string): void {
    setRelacion(valor === NINGUNO ? (vaAEspacio ? relacion : 'project') : claseDeEspacio(Number(valor), { licitaciones, upsells }))
    if (valor === espacio && espacios.length <= 1) return
    setEspacios(valor === NINGUNO ? [] : [Number(valor)])
    olvidarHitoYTipo()
  }

  /**
   * Elige la lista completa de Espacios destino.
   *
   * El hito y el tipo se descartan cuando cambia el primer Espacio —de él salen sus catálogos— y
   * también al pasar a varios destinos, porque ahí dejan de existir: son por Espacio y la API los
   * rechaza en el alta múltiple.
   */
  function elegirEspacios (ids: number[]): void {
    setEspacios(ids)
    setParcial(null)
    if (ids[0] !== espacios[0] || ids.length > 1) olvidarHitoYTipo()
  }

  /**
   * Cambia con que se relaciona la Tarea.
   *
   * Los Espacios elegidos se descartan al cambiar de clase: el selector solo muestra los de la clase
   * nueva, y dejar puestos los de la anterior crearia la tarea en un destino que ya no se ve.
   */
  function cambiarRelacion (nueva: RelacionTarea): void {
    if (nueva === relacion) return
    setRelacion(nueva)
    setRelacionId('')
    elegirEspacios([])
  }

  /** Los Espacios de la clase elegida: Proyectos, Licitaciones o Upsells, cada uno por su lado. */
  const espaciosVisibles = useMemo(
    () => espaciosDeClase({ espacios: catalogos.espacios, licitaciones, upsells }, relacion),
    [catalogos.espacios, licitaciones, upsells, relacion]
  )
  const opcionesDeClientes = useMemo(
    () => clientes.map((cliente) => ({ valor: String(cliente.id), etiqueta: cliente.name })),
    [clientes]
  )

  // `SelectorPersonas` pinta el avatar de cada persona y los catalogos del alta pueden venir sin la
  // foto: se completa aca para no obligar a cada pantalla que monta el alta a traerla.
  const personas: StaffReferencia[] = useMemo(
    () => catalogos.personas.map((persona) => ({
      id: persona.id,
      full_name: persona.full_name,
      profile_image_url: persona.profile_image_url ?? null
    })),
    [catalogos.personas]
  )

  // Se recalcula mientras se escribe: la vista previa es lo que hace confiable a una sintaxis que
  // nadie leyo en un manual.
  const leido = useMemo(
    () => interpretarAltaRapida(texto, catalogos),
    [texto, catalogos]
  )

  const nombreDe = (id: number, lista: ReadonlyArray<{ id: number }>, campo: 'full_name' | 'name'): string => {
    const fila = lista.find((f) => f.id === id) as Record<string, unknown> | undefined
    return fila === undefined ? '' : String(fila[campo])
  }

  // Las marcas se arman aca, no en la vista previa: los nombres salen de los catalogos de esta
  // pantalla y la vista previa solo pinta lo que ya viene con nombre. Aca todas son 'texto': el alta
  // rapida no llama al modelo, su gracia es ser instantanea.
  const marcas: MarcaPrevia[] = []

  if (leido.due_date !== null) {
    marcas.push({ texto: `Vence ${formatearFecha(leido.due_date)}`, origen: 'texto' })
  }
  if (leido.rel_id !== null) {
    marcas.push({ texto: nombreDe(leido.rel_id, catalogos.espacios, 'name'), origen: 'texto' })
  }
  if (leido.priority !== null) {
    marcas.push({ texto: nombreDe(leido.priority, catalogos.prioridades, 'name'), origen: 'texto' })
  }
  for (const id of leido.assignees) {
    marcas.push({ texto: nombreDe(id, catalogos.personas, 'full_name'), origen: 'texto' })
  }

  /** Restablece los valores del alta y conserva el contexto de apertura. */
  function limpiar (): void {
    setTexto('')
    setError(null)
    setErrorDescripcion(null)
    setParcial(null)
    setNombre('')
    setEspacios(proyectoId === undefined ? [] : [proyectoId])
    setAsignados(yoId === null ? [] : [yoId])
    setSeguidores([])
    setPrioridad(NINGUNO)
    setInicio('')
    setVencimiento('')
    setEtiquetasEscritas('')
    setDescripcion('')
    setHorasEstimadas('')
    setFacturable(true)
    setTipo(NINGUNO)
    setTipos([])
    setAvisoTipos(null)
    setModo('campos')
    setHito(hitoInicial === undefined ? NINGUNO : String(hitoInicial))
    setHitos([])
    setRelacion(proyectoId === undefined ? 'project' : claseDeEspacio(proyectoId, { licitaciones, upsells }))
    setRelacionId('')
    setEstado(NINGUNO)
    setTarifa('')
    setPublica(false)
    setVisibleCliente(false)
    setRecurrente(false)
    setCada('1')
    setUnidad('month')
    setFin(FIN_INICIAL)
    setCierre('')
    setCreadaId(null)
    setPersonalizados(valoresPorDefecto(definiciones))
    setErroresCampos({})
    setCargando(true)
    setErrorCarga(null)
    setTextoLibre('')
    setAvisoIa(null)
    setFusion(null)
    setPrevio(null)
    setEspacioDeIa(false)
  }

  /** Los catalogos con los que se valida todo lo que devuelve el modelo. */
  const catalogosConEtiquetas: CatalogosTarea = { ...catalogos, etiquetas }

  /**
   * Vuelca en los campos lo que resolvio la fusion.
   *
   * Solo escribe lo que tiene valor: un campo que quedo en `null` no borra lo que ya se habia
   * escrito a mano antes de apretar el boton.
   */
  function volcar (resultado: TareaFusionada, espacioElegido: number | null): void {
    if (resultado.name !== '') setNombre(resultado.name)
    if (espacioElegido !== null) elegirEspacio(String(espacioElegido))
    if (resultado.assignees.length > 0) setAsignados([...resultado.assignees])
    if (resultado.priority !== null) setPrioridad(String(resultado.priority))
    if (resultado.start_date !== null) setInicio(resultado.start_date)
    if (resultado.due_date !== null) setVencimiento(resultado.due_date)
    if (resultado.tags.length > 0) setEtiquetasEscritas(resultado.tags.join(', '))
    if (resultado.description !== null) {
      setDescripcion(resultado.description)
      // El reclamo de "falta la descripcion" deja de tener sentido en cuanto algo la llena.
      setErrorDescripcion(null)
    }
  }

  /**
   * Interpreta el texto libre y rellena los campos. **No crea nada.**
   *
   * Corren las dos lecturas en el mismo clic: `interpretarAltaRapida()`, que es instantanea y
   * gratis, y el modelo. No hay heuristica que decida si vale la pena llamar. Si el modelo no
   * responde queda lo del parser con el aviso al lado, porque dejar el formulario vacio por un 503
   * es peor que llenarlo a medias.
   *
   * El espacio elegido acota la interpretación; sin selección se resuelve desde el texto.
   */
  async function completar (): Promise<void> {
    const limpio = textoLibre.trim()

    // Requisito previo: sin un pedido con detalle el modelo no interpreta, supone. El aviso dice
    // que le falta —cuantas palabras, cuantos caracteres— y no solo que no alcanza.
    const flojo = errorDeDetalle(limpio)

    if (flojo !== null) {
      setAvisoIa(flojo)
      return
    }

    setInterpretando(true)
    onOcupado?.(true)
    setAvisoIa(null)

    const localLeido = interpretarAltaRapida(limpio, catalogos)
    const respuesta = await escribirEnBff<unknown>('ia/tareas/interpretar', 'POST', { texto: limpio, ...(espacio === NINGUNO ? {} : { project_id: Number(espacio) }) })
    const delModelo = respuesta.ok ? leerCamposTarea(respuesta.datos) : null
    const resultado = fusionarInterpretacion(localLeido, delModelo, catalogosConEtiquetas)
    const elegido = fusionarEspacio(localLeido, delModelo, catalogosConEtiquetas)

    if (elegido.descartado !== null) resultado.noResuelto.push(elegido.descartado)

    setPrevio({
      nombre, hito, relacion, relacionId, espacios, asignados, seguidores, tipo, prioridad, inicio, vencimiento,
      etiquetasEscritas, descripcion
    })
    volcar(resultado, elegido.id)
    setFusion(resultado)
    setEspacioDeIa(elegido.deIa)
    setInterpretando(false)
    onOcupado?.(false)

    if (!respuesta.ok) setAvisoIa(`${respuesta.mensaje} Quedó sólo lo que se entendió del texto.`)
    else if (delModelo === null) setAvisoIa('El modelo respondió algo que no se entendió. Quedó sólo lo que se entendió del texto.')
  }

  /** Devuelve los campos tal como estaban justo antes de la ultima interpretacion. */
  function deshacer (): void {
    if (previo === null) return

    setNombre(previo.nombre)
    setEspacios(previo.espacios)
    setAsignados(previo.asignados)
    setSeguidores(previo.seguidores)
    setTipo(previo.tipo)
    setHito(previo.hito)
    setRelacion(previo.relacion)
    setRelacionId(previo.relacionId)
    setPrioridad(previo.prioridad)
    setInicio(previo.inicio)
    setVencimiento(previo.vencimiento)
    setEtiquetasEscritas(previo.etiquetasEscritas)
    setDescripcion(previo.descripcion)
    setPrevio(null)
    setFusion(null)
    setAvisoIa(null)
    setEspacioDeIa(false)
  }

  // Cada marca declara de donde salio: lo que propuso el modelo no puede verse igual que lo que
  // escribio la persona, porque lo primero hay que revisarlo y lo segundo no.
  const marcasDeLaFusion: MarcaPrevia[] = []

  if (fusion !== null) {
    const origen = (campo: CampoDeTarea): 'texto' | 'ia' => fusion.deIa.includes(campo) ? 'ia' : 'texto'

    if (fusion.due_date !== null) marcasDeLaFusion.push({ texto: `Vence ${formatearFecha(fusion.due_date)}`, origen: origen('due_date') })
    if (fusion.start_date !== null) marcasDeLaFusion.push({ texto: `Empieza ${formatearFecha(fusion.start_date)}`, origen: origen('start_date') })
    if (espacio !== NINGUNO) marcasDeLaFusion.push({ texto: nombreDe(Number(espacio), catalogos.espacios, 'name'), origen: espacioDeIa ? 'ia' : 'texto' })
    if (fusion.priority !== null) marcasDeLaFusion.push({ texto: nombreDe(fusion.priority, catalogos.prioridades, 'name'), origen: origen('priority') })
    for (const id of fusion.assignees) marcasDeLaFusion.push({ texto: nombreDe(id, catalogos.personas, 'full_name'), origen: origen('assignees') })
    if (fusion.description !== null) marcasDeLaFusion.push({ texto: 'Con descripción', origen: origen('description') })
    for (const etiqueta of fusion.tags) marcasDeLaFusion.push({ texto: etiqueta, origen: origen('tags') })
  }

  /** El nombre del Espacio para mostrar, o su id cuando el catálogo no lo tiene. */
  function nombreDeEspacio (id: number): string {
    return catalogos.espacios.find((fila) => fila.id === id)?.name ?? `${GLOSARIO.espacio.singular} #${id}`
  }

  /**
   * Lo que las dos rutas de alta comprueban antes de escribir nada.
   *
   * @returns `true` si se puede enviar; si no, ya dejó el motivo a la vista.
   */
  function puedeEnviar (): boolean {
    if (enviando.current || cargando || errorCarga !== null) return false

    const fallos = esquemaDeCamposPersonalizados(definiciones).validar(personalizados, valoresPorDefecto(definiciones))

    setErroresCampos(fallos)
    if (Object.keys(fallos).length > 0) {
      setError('Revisa los campos personalizados marcados.')
      setModo('campos')

      return false
    }

    return true
  }

  /**
   * Guarda los campos personalizados de una tarea recién creada.
   *
   * Van en un PATCH aparte porque `POST /tasks` no los acepta: necesitan el id de la tarea. Con
   * varios destinos se repite el mismo PATCH con los mismos valores, uno por tarea.
   *
   * @param id id de la tarea creada
   * @returns `null` si se guardaron o si no había nada que guardar; el mensaje del fallo si no.
   */
  async function guardarPersonalizados (id: number): Promise<string | null> {
    const parche = cuerpoDeCamposPersonalizados('tasks', id, definiciones, valoresPorDefecto(definiciones), personalizados)

    if (parche === null) return null

    const guardados = await escribirEnBff('custom-fields/values', 'PATCH', parche)

    return guardados.ok ? null : guardados.mensaje
  }

  /** Cierra el diálogo como en un alta que salió bien. */
  function cerrarTrasCrear (): void {
    limpiar()
    setAbierto(false)
    onCerrar?.()
    onCreada?.()
    router.refresh()
  }

  /**
   * Manda el alta de UNA tarea. Es el camino de todos los días y no cambió.
   *
   * @param cuerpo el cuerpo de `POST /tasks`, ya sin campos vacios
   */
  async function enviar (cuerpo: Record<string, unknown>): Promise<void> {
    if (!puedeEnviar()) return
    enviando.current = true
    onOcupado?.(true)
    setEnCurso(true)
    setError(null)
    try {
      let id = creadaId
      if (id === null) {
        const resultado = await escribirEnBff<{ id: number }>('tasks', 'POST', cuerpo)
        if (!resultado.ok) { setError(resultado.mensaje); return }
        if (!Number.isInteger(resultado.datos?.id)) {
          setError('El servidor no devolvió el identificador. Revisa la lista antes de volver a crear la tarea.')
          return
        }
        id = resultado.datos.id
        setCreadaId(id)
      }
      const falloDeCampos = await guardarPersonalizados(id)
      if (falloDeCampos !== null) {
        setError(`La tarea #${id} ya está creada. Reintenta guardar sus campos personalizados: ${falloDeCampos}`)
        return
      }
      cerrarTrasCrear()
    } finally {
      enviando.current = false
      onOcupado?.(false)
      setEnCurso(false)
    }
  }

  /**
   * Manda el alta de la MISMA tarea en varios Espacios, en una sola petición.
   *
   * Una petición y no una por Espacio: `POST /tasks/multi-espacio` valida el cuerpo compartido antes
   * de crear la primera tarea, así que un error de tipeo no deja tres tareas creadas y dos sin
   * crear. Lo que puede salir a medias de ahí para adelante —un Espacio que alguien eliminó, un
   * choque de la base— vuelve en el parte, destino por destino.
   *
   * Si algo falla NO se toca el formulario: se muestra qué pasó en cada Espacio y la selección queda
   * reducida a los que faltan, para que el siguiente clic no duplique los que ya se crearon.
   *
   * @param cuerpo el cuerpo compartido, sin `rel_type`, `rel_id`, `milestone` ni `task_type`
   * @param destinos ids de los Espacios donde crear la tarea
   */
  async function enviarEnVariosEspacios (cuerpo: Record<string, unknown>, destinos: number[]): Promise<void> {
    if (!puedeEnviar()) return
    enviando.current = true
    onOcupado?.(true)
    setEnCurso(true)
    setError(null)
    try {
      const respuesta = await escribirEnBff<ParteMulti>(RUTA_MULTI, 'POST', { ...cuerpo, espacios: destinos })

      if (!respuesta.ok) {
        // Incluye la caída de red: `escribirEnBff` no lanza. No se creó nada o no se sabe, y por eso
        // el formulario queda intacto con su selección completa.
        setError(respuesta.mensaje)

        return
      }

      const parte = respuesta.datos

      if (!Array.isArray(parte?.creados) || !Array.isArray(parte.fallidos)) {
        setError(`El servidor no devolvió en qué ${GLOSARIO.espacio.plural.toLowerCase()} quedó la tarea. Revísalos antes de volver a crearla.`)

        return
      }

      const hechos: ResumenParcial['hechos'] = []
      const pendientes: number[] = []

      for (const creado of parte.creados) {
        const falloDeCampos = await guardarPersonalizados(creado.task_id)

        hechos.push({
          espacioId: creado.espacio_id,
          nombre: nombreDeEspacio(creado.espacio_id),
          detalle: falloDeCampos === null
            ? `Tarea #${creado.task_id} creada.`
            : `Tarea #${creado.task_id} creada, pero sus campos personalizados no se guardaron: ${falloDeCampos}`,
          ok: falloDeCampos === null
        })
      }

      for (const fallido of parte.fallidos) {
        hechos.push({
          espacioId: fallido.espacio_id,
          nombre: nombreDeEspacio(fallido.espacio_id),
          detalle: fallido.motivo,
          ok: false
        })
        pendientes.push(fallido.espacio_id)
      }

      if (hechos.length > 0 && hechos.every((hecho) => hecho.ok)) {
        cerrarTrasCrear()

        return
      }

      setParcial({ hechos, pendientes })
      // Solo se recorta la selección cuando queda algo que reintentar. Dejarla vacía convertiría el
      // siguiente clic en una tarea sin Espacio.
      if (pendientes.length > 0) setEspacios(pendientes)
      // Las que sí se crearon ya existen: la lista de atrás tiene que mostrarlas aunque el diálogo
      // siga abierto.
      if (parte.creados.length > 0) router.refresh()
    } finally {
      enviando.current = false
      onOcupado?.(false)
      setEnCurso(false)
    }
  }

  /** Deja el cursor en el campo Descripcion. Ver `cajaDescripcion`. */
  function enfocarDescripcion (): void {
    cajaDescripcion.current?.querySelector('textarea')?.focus()
  }

  /**
   * Alta por campos.
   *
   * Solo el nombre es obligatorio; lo que quedo sin elegir no viaja, para que la API aplique sus
   * propios valores por defecto en vez de recibir un `null` que significa otra cosa.
   *
   * Las etiquetas viajan como nombres: la API resuelve las que existen y crea las que no. El
   * `datalist` sugiere las creadas para que la variante con typo sea la excepcion y no la regla.
   */
  async function crearPorCampos (): Promise<void> {
    if (creadaId !== null) { await enviar({}); return }
    if (nombre.trim() === '') {
      setError('La tarea necesita un nombre.')
      return
    }

    // Cortesia, no la regla: la regla la aplica `POST /tasks`, que devuelve 422 con
    // `description: ["requerido"]`. Esto solo evita el viaje y deja el foco donde se arregla.
    const descripcionMal = errorDeDescripcion(descripcion, `La ${GLOSARIO.proceso.singular.toLowerCase()}`)

    if (descripcionMal !== null) {
      setErrorDescripcion(descripcionMal)
      setError(null)
      enfocarDescripcion()
      return
    }

    const horasMal = errorDeHorasEstimadas(horasEstimadas)

    if (horasMal !== null) {
      setError(horasMal)
      return
    }

    if (inicio !== '' && vencimiento !== '' && vencimiento < inicio) {
      setError('El vencimiento no puede ser anterior al inicio.')
      return
    }
    if (!vaAEspacio && (!Number.isSafeInteger(Number(relacionId)) || Number(relacionId) < 1)) {
      setError(`Elige un ${GLOSARIO.cliente.singular.toLowerCase()}.`)
      return
    }
    if (tarifa !== '' && (!Number.isFinite(Number(tarifa)) || Number(tarifa) < 0)) {
      setError('La tarifa debe ser un número mayor o igual a cero.')
      return
    }
    if (recurrente && (!Number.isInteger(Number(cada)) || Number(cada) < 1)) {
      setError('La frecuencia debe ser un entero positivo.')
      return
    }
    const errorFin = recurrente ? errorDeFin(fin.modo, fin.ciclos, fin.hasta, inicio) : null
    if (errorFin !== null) {
      setError(errorFin)
      return
    }
    if (vaAEspacio && espacios.length > MAXIMO_ESPACIOS) {
      setError(`Como máximo ${MAXIMO_ESPACIOS} ${GLOSARIO.espacio.plural.toLowerCase()} por vez. Saca algunos y repite el alta con el resto.`)
      return
    }

    // La colacion de `tbltags` es `_ci`: "urgente" y "Urgente" son la misma fila para la API, asi
    // que no hace falta normalizar nada aca.
    const pedidas = etiquetasEscritas.split(',').map((t) => t.trim()).filter((t) => t !== '')
    const horas = horasDeTexto(horasEstimadas)

    // Lo que es igual en todos los destinos. El hito, el tipo y la relacion quedan fuera: son de UN
    // Espacio, y son justo lo que el alta multiple no acepta.
    const comun = {
      // En formato de titulo al guardar y no mientras se escribe: corregir el campo bajo el
      // cursor pelea con quien esta tecleando. Solo convierte lo que viene todo en mayusculas.
      name: enFormatoTitulo(nombre),
      billable: facturable,
      is_public: publica,
      visible_to_client: visibleCliente,
      ...(estado === NINGUNO ? {} : { status: Number(estado) }),
      ...(tarifa === '' ? {} : { hourly_rate: Number(tarifa) }),
      ...(recurrente ? { recurring: true, repeat_every: Number(cada), recurring_type: unidad, ...cuerpoDeFin(fin.modo, fin.ciclos, fin.hasta) } : {}),
      ...(estado === '5' && cierre !== '' ? { completed_at: new Date(cierre).toISOString() } : {}),
      ...(asignados.length === 0 ? {} : { assignees: asignados }),
      ...(seguidores.length === 0 ? {} : { followers: seguidores }),
      ...(prioridad === NINGUNO ? {} : { priority: Number(prioridad) }),
      ...(inicio === '' ? {} : { start_date: inicio }),
      ...(vencimiento === '' ? {} : { due_date: vencimiento }),
      // Siempre viaja: es obligatoria, y omitirla cuando esta vacia le escondia al servidor
      // justamente el caso que ahora tiene que rechazar.
      description: descripcion.trim(),
      ...(horas === null ? {} : { estimated_hours: horas }),
      ...(pedidas.length === 0 ? {} : { tags: pedidas })
    }

    // Dos o mas Espacios: la ruta multiple. Con cero o uno se manda el mismo `POST /tasks` de
    // siempre, con el mismo cuerpo, para que el alta de todos los dias no dependa de esto.
    if (vaAEspacio && multiple) {
      await enviarEnVariosEspacios(comun, espacios)

      return
    }

    await enviar({
      ...comun,
      ...(!vaAEspacio || hito === NINGUNO ? {} : { milestone: Number(hito) }),
      ...(!vaAEspacio ? { rel_type: relTypeDeRelacion(relacion), rel_id: Number(relacionId) } : espacio === NINGUNO ? {} : { rel_type: 'project', rel_id: Number(espacio) }),
      ...(!vaAEspacio || tipo === NINGUNO ? {} : { task_type: Number(tipo) })
    })
  }

  /** Manda el alta del modo activo. */
  async function crear (evento: FormEvent): Promise<void> {
    evento.preventDefault()

    await crearPorCampos()
  }

  const formulario = (
        <form className="flex flex-col gap-4" onSubmit={(evento) => { void crear(evento) }}>
          {errorCarga !== null && <div role="alert" className="text-texto-peligro text-sm">{errorCarga} <Boton onClick={() => { setCargando(true); setIntentoCarga((valor) => valor + 1) }}>Reintentar carga</Boton></div>}
          {cargando && <p role="status">Cargando campos…</p>}
          <fieldset disabled={enCurso || interpretando || cargando || errorCarga !== null || creadaId !== null} className="flex min-w-0 flex-col gap-4">
          <Segmentado
            etiqueta="Cómo escribir la tarea"
            opciones={MODOS}
            activo={modo}
            onElegir={(valor) => { setModo(valor as Modo); setError(null) }}
          />

          {modo === 'linea' && (
              <>
                <Campo etiqueta="Qué hay que hacer" requerido>
                  {(props) => (
                    <Entrada
                      {...props}
                      value={texto}
                      autoFocus
                      placeholder="Grilla Colbún septiembre mañana @franz #Colbún !alta"
                      onChange={(e) => { setTexto(e.target.value) }}
                    />
                  )}
                </Campo>

                <VistaPreviaAlta titulo={leido.name} marcas={marcas} sinResolver={leido.sinResolver} />
                <Boton variante="secundario" onClick={() => {
                  volcar(fusionarInterpretacion(leido, null, catalogosConEtiquetas), leido.rel_id)
                  setModo('campos')
                }}>Completar campos desde la línea</Boton>

                <p className="text-texto-sutil text-xs">
                  <code className="text-texto-tenue">@persona</code> asigna ·{' '}
                  <code className="text-texto-tenue">#{GLOSARIO.espacio.singular.toLowerCase()}</code> lo
                  vincula · <code className="text-texto-tenue">!prioridad</code> ·{' '}
                  <code className="text-texto-tenue">mañana</code>, <code className="text-texto-tenue">viernes</code>{' '}
                  o <code className="text-texto-tenue">30/9</code> ponen la entrega. Con espacios, entre comillas.
                  {' '}Si un nombre coincide con varias personas queda en el título: ahí conviene «Por campos».
                </p>
              </>
              )}
              <>
                {conIa && (
                  <div className="border-borde flex flex-col gap-2 border-b pb-4">
                    <Campo
                      etiqueta="Escríbelo como lo dirías"
                      ayuda="Se convierte en campos y los corriges antes de crear. Nada se crea solo."
                    >
                      {(props) => (
                        <AreaTexto
                          {...props}
                          value={textoLibre}
                          placeholder="Hay que rehacer la grilla de septiembre de Colbún para el viernes, que la vea Franz, es urgente."
                          onChange={(evento) => { setTextoLibre(evento.target.value) }}
                        />
                      )}
                    </Campo>

                    <div className="flex flex-wrap items-center gap-2">
                      <Boton
                        variante="secundario"
                        tamano="chico"
                        cargando={interpretando}
                        onClick={() => { void completar() }}
                      >
                        Completar campos
                      </Boton>

                      {previo !== null && (
                        <Boton variante="sutil" tamano="chico" onClick={deshacer}>Deshacer</Boton>
                      )}
                    </div>

                    {fusion !== null && (
                      <VistaPreviaAlta
                        titulo={fusion.name}
                        origenTitulo={fusion.deIa.includes('name') ? 'ia' : 'texto'}
                        marcas={marcasDeLaFusion}
                        sinResolver={fusion.noResuelto}
                      />
                    )}

                    {avisoIa !== null && (
                      <p role="status" className="text-texto-tenue text-xs">{avisoIa}</p>
                    )}
                  </div>
                )}

                <Campo etiqueta="Nombre" requerido>
                  {(props) => (
                    <Entrada
                      {...props}
                      value={nombre}
                      autoFocus
                      placeholder="Revisar el contrato"
                      onChange={(evento) => { setNombre(evento.target.value) }}
                    />
                  )}
                </Campo>

                <Campo etiqueta="Relacionada con">
                  {({ id }) => <Selector value={relacion} onValueChange={(valor) => { cambiarRelacion(valor as RelacionTarea) }}>
                    <DisparadorSelector id={id} />
                    <ContenidoSelector>
                      {RELACIONES_TAREA.map((clase) => (
                        <Opcion key={clase} value={clase}>{NOMBRES_DE_RELACION[clase].singular}</Opcion>
                      ))}
                    </ContenidoSelector>
                  </Selector>}
                </Campo>
                {!vaAEspacio && <Campo etiqueta={GLOSARIO.cliente.singular} requerido>
                  {(props) => (
                    <SelectorBuscable
                      id={props.id}
                      valor={relacionId}
                      onElegir={setRelacionId}
                      opciones={opcionesDeClientes}
                      marcador={`Elige un ${GLOSARIO.cliente.singular.toLowerCase()}`}
                      nombre={GLOSARIO.cliente.singular.toLowerCase()}
                    />
                  )}
                </Campo>}
                <div className="grid gap-4 sm:grid-cols-2">
                  {vaAEspacio && <Campo
                    etiqueta={NOMBRES_DE_RELACION[relacion].plural}
                    ayuda={multiple
                      ? `La misma tarea se crea ${espacios.length} veces, una en cada ${GLOSARIO.espacio.singular.toLowerCase()}.`
                      : `Puedes elegir varios: la misma tarea se crea en todos.`}
                  >
                    {({ id }) => (
                      <SelectorEspacios
                        id={id}
                        espacios={espaciosVisibles}
                        elegidos={espacios}
                        onCambiar={elegirEspacios}
                        conFallo={parcial?.pendientes ?? []}
                        nombres={NOMBRES_DE_RELACION[relacion]}
                      />
                    )}
                  </Campo>}

                  <Campo etiqueta="Prioridad">
                    {({ id }) => (
                      <Selector value={prioridad} onValueChange={setPrioridad}>
                        <DisparadorSelector id={id} />
                        <ContenidoSelector>
                          <Opcion value={NINGUNO}>La que trae por defecto</Opcion>
                          {catalogos.prioridades.map((fila) => (
                            <Opcion key={fila.id} value={String(fila.id)}>{fila.name}</Opcion>
                          ))}
                        </ContenidoSelector>
                      </Selector>
                    )}
                  </Campo>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <Campo etiqueta="Estado">
                    {({ id }) => <Selector value={estado} onValueChange={setEstado}>
                      <DisparadorSelector id={id} />
                      <ContenidoSelector>
                        <Opcion value={NINGUNO}>Estado inicial</Opcion>
                        {lookups?.task_statuses.map((fila) => <Opcion key={fila.id} value={String(fila.id)}>{fila.name}</Opcion>)}
                      </ContenidoSelector>
                    </Selector>}
                  </Campo>
                  <Campo
                    etiqueta={GLOSARIO.hito.singular}
                    ayuda={multiple
                      ? `Cada ${GLOSARIO.espacio.singular.toLowerCase()} tiene sus propios hitos: la tarea nace sin hito y se mueve después.`
                      : avisoTipos ?? (espacio === NINGUNO ? 'Elige un proyecto para ver sus hitos.' : undefined)}
                  >
                    {({ id }) => <Selector value={hito} onValueChange={setHito} disabled={!vaAEspacio || multiple || hitos.length === 0}>
                      <DisparadorSelector id={id} />
                      <ContenidoSelector>
                        <Opcion value={NINGUNO}>Sin hito</Opcion>
                        {hitos.map((fila) => <Opcion key={fila.id} value={String(fila.id)}>{fila.name}</Opcion>)}
                      </ContenidoSelector>
                    </Selector>}
                  </Campo>
                </div>
                {estado === '5' && <Campo etiqueta="Fecha real de cierre" ayuda="Vacío usa la fecha y hora de creación.">
                  {(props) => <Entrada {...props} type="datetime-local" value={cierre} onChange={(evento) => setCierre(evento.target.value)} />}
                </Campo>}

                <Campo
                  etiqueta="Asignados"
                  ayuda={catalogos.personas.length === 0 ? 'No se pudo traer el equipo.' : undefined}
                >
                  {({ id }) => (
                    <SelectorPersonas
                      id={id}
                      personas={personas}
                      elegidas={asignados}
                      onCambiar={setAsignados}
                    />
                  )}
                </Campo>

                <div className="grid gap-4 sm:grid-cols-2">
                  <Campo etiqueta="Fecha de inicio">
                    {(props) => (
                      <Entrada
                        {...props}
                        type="date"
                        value={inicio}
                        onChange={(evento) => { setInicio(evento.target.value) }}
                      />
                    )}
                  </Campo>
                  <Campo etiqueta="Fecha de vencimiento">
                    {(props) => (
                      <Entrada
                        {...props}
                        type="date"
                        value={vencimiento}
                        onChange={(evento) => { setVencimiento(evento.target.value) }}
                      />
                    )}
                  </Campo>
                </div>

                <Campo etiqueta="Etiquetas" ayuda="Separadas por coma. Si escribes una que no existe, se crea.">
                  {(props) => (
                    <>
                      <Entrada
                        {...props}
                        value={etiquetasEscritas}
                        placeholder="urgente, cliente-clave"
                        list={listaEtiquetas}
                        onChange={(evento) => { setEtiquetasEscritas(evento.target.value) }}
                      />
                      {/* `datalist` es la sugerencia nativa: no valida ni obliga, y reusar la
                          etiqueta que ya existe evita fundar la variante con typo. */}
                      <datalist id={listaEtiquetas}>
                        {etiquetas.map((e) => <option key={e.id} value={e.name} />)}
                      </datalist>
                    </>
                  )}
                </Campo>

                <Campo
                  etiqueta="Tipo"
                  ayuda={multiple
                    ? `Cada ${GLOSARIO.espacio.singular.toLowerCase()} ofrece sus propios tipos: la tarea nace sin tipo y se define después en cada una.`
                    : avisoTipos ?? (
                      espacio === NINGUNO
                        ? `Cada ${GLOSARIO.espacio.singular.toLowerCase()} define sus tipos: elige uno primero.`
                        : tipos.length === 0
                          ? `Este ${GLOSARIO.espacio.singular.toLowerCase()} no ofrece tipos.`
                          : undefined
                    )}
                >
                  {({ id }) => (
                    <Selector value={tipo} onValueChange={setTipo} disabled={!vaAEspacio || multiple || tipos.length === 0}>
                      <DisparadorSelector id={id} />
                      <ContenidoSelector>
                        <Opcion value={NINGUNO}>Sin tipo</Opcion>
                        {tipos.map((fila) => (
                          <Opcion key={fila.id} value={String(fila.id)}>{fila.name}</Opcion>
                        ))}
                      </ContenidoSelector>
                    </Selector>
                  )}
                </Campo>

                <Campo etiqueta="Seguidores" ayuda="Reciben las novedades sin ser responsables.">
                  {({ id }) => (
                    <SelectorPersonas
                      id={id}
                      personas={personas}
                      elegidas={seguidores}
                      onCambiar={setSeguidores}
                    />
                  )}
                </Campo>

                <div ref={cajaDescripcion} className="flex flex-col gap-2">
                  <Campo
                    etiqueta="Descripción"
                    requerido
                    error={errorDescripcion ?? undefined}
                    ayuda="Qué hay que hacer y con qué se da por terminada. Quien abra la tarea no estuvo en esta conversación."
                  >
                    {(props) => (
                      <AreaTexto
                        {...props}
                        rows={4}
                        value={descripcion}
                        onChange={(evento) => { setDescripcion(evento.target.value); setErrorDescripcion(null) }}
                      />
                    )}
                  </Campo>

                  {/* Con la capa de IA apagada el asistente no existe y el campo se escribe a mano.
                      `conIa` evita hasta la sonda; el propio componente se oculta igual si la API
                      dice que no. */}
                  {conIa && (
                    <div className="flex justify-end">
                      <AsistenteDescripcion
                        titulo={nombre}
                        descripcionActual={descripcion}
                        proyectoId={vaAEspacio && espacio !== NINGUNO ? Number(espacio) : null}
                        deshabilitado={enCurso}
                        onRedactada={(texto) => { setDescripcion(texto); setErrorDescripcion(null) }}
                      />
                    </div>
                  )}
                </div>

                <Campo etiqueta="Horas estimadas" ayuda="Acepta decimales. Déjalo vacío si todavía no se estimó.">
                  {(props) => (
                    <Entrada
                      {...props}
                      type="number"
                      step="any"
                      min="0"
                      value={horasEstimadas}
                      onChange={(evento) => { setHorasEstimadas(evento.target.value) }}
                    />
                  )}
                </Campo>

                <Campo etiqueta="Tarifa por hora">
                  {(props) => <Entrada {...props} type="number" min="0" step="0.01" value={tarifa} onChange={(evento) => setTarifa(evento.target.value)} />}
                </Campo>
                <label className="text-texto flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={facturable}
                    onChange={(evento) => { setFacturable(evento.target.checked) }}
                  />
                  Facturable
                </label>
                <label className="text-texto flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={publica} onChange={(evento) => setPublica(evento.target.checked)} />
                  Pública para el equipo
                </label>
                <label className="text-texto flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={visibleCliente} onChange={(evento) => setVisibleCliente(evento.target.checked)} />
                  Visible para el cliente
                </label>
                <label className="text-texto flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={recurrente} onChange={(evento) => setRecurrente(evento.target.checked)} />
                  Recurrente
                </label>
                {recurrente && <div className="grid gap-4 sm:grid-cols-3">
                  <Campo etiqueta="Repetir cada">
                    {(props) => <Entrada {...props} type="number" min="1" max="365" step="1" value={cada} onChange={(evento) => setCada(evento.target.value)} />}
                  </Campo>
                  <Campo etiqueta="Unidad">
                    {({ id }) => <Selector value={unidad} onValueChange={setUnidad}>
                      <DisparadorSelector id={id} />
                      <ContenidoSelector>
                        <Opcion value="day">Días</Opcion><Opcion value="week">Semanas</Opcion>
                        <Opcion value="month">Meses</Opcion><Opcion value="year">Años</Opcion>
                      </ContenidoSelector>
                    </Selector>}
                  </Campo>
                  <FinDeRecurrencia valor={fin} onCambiar={setFin} inicio={inicio} />
                </div>}
              </>
          </fieldset>
          <CamposPersonalizados definiciones={definiciones} valores={personalizados} errores={erroresCampos}
            onCambiar={(valores) => { setPersonalizados(valores); setErroresCampos({}) }} deshabilitado={enCurso || cargando || errorCarga !== null} />

          {/* El parte del alta multiple: que paso en cada Espacio, con nombre. Sin esto, "se
              crearon 3 de 5" obliga a abrir los cinco para saber cuales faltan. */}
          {parcial !== null && (
            <div role="alert" className="border-linea rounded-medio flex flex-col gap-1.5 border p-3">
              <p className="text-texto text-sm font-medium">
                La tarea se creó en {parcial.hechos.filter((hecho) => hecho.ok).length} de {parcial.hechos.length} {GLOSARIO.espacio.plural.toLowerCase()}.
              </p>
              <ul className="flex flex-col gap-1">
                {parcial.hechos.map((hecho) => (
                  <li key={hecho.espacioId} className={hecho.ok ? 'text-texto-sutil text-xs' : 'text-texto-peligro text-xs'}>
                    <span className="font-medium">{hecho.nombre}:</span> {hecho.detalle}
                  </li>
                ))}
              </ul>
              {parcial.pendientes.length > 0 && (
                <p className="text-texto-sutil text-xs">
                  Los que fallaron quedaron seleccionados: corrige lo que haga falta y vuelve a crear.
                  Los que ya se crearon no se repiten.
                </p>
              )}
            </div>
          )}

          {error !== null && (
            <p role="alert" className="text-texto-peligro text-sm">{error}</p>
          )}

          <div className="flex justify-end gap-2">
            <CerrarDialogo asChild>
              <Boton variante="sutil" type="button">Cancelar</Boton>
            </CerrarDialogo>
            {/* Nada que reintentar y todas las tareas ya creadas: el boton no puede seguir diciendo
                "Crear", porque otro clic las duplicaria. */}
            {parcial !== null && parcial.pendientes.length === 0
              ? (
                <Boton variante="primario" type="button" onClick={cerrarTrasCrear}>Entendido, cerrar</Boton>
                )
              : (
                <Boton type="submit" variante="primario" cargando={enCurso} disabled={enCurso || interpretando || cargando || errorCarga !== null}>
                  {creadaId !== null
                    ? 'Reintentar campos personalizados'
                    : parcial === null
                      ? 'Crear'
                      : `Reintentar en ${parcial.pendientes.length} ${parcial.pendientes.length === 1 ? GLOSARIO.espacio.singular.toLowerCase() : GLOSARIO.espacio.plural.toLowerCase()}`}
                </Boton>
                )}
          </div>
        </form>
  )

  if (integrado) return formulario

  return (
    <Dialogo open={abierto} onOpenChange={(valor) => {
      if (enviando.current || interpretando) return
      setAbierto(valor)
      if (!valor) { limpiar(); onCerrar?.() }
    }}>
      <DisparadorDialogo asChild><Boton variante="primario">Nueva tarea</Boton></DisparadorDialogo>
      <ContenidoDialogo titulo="Nueva tarea" ancho="grande" descripcion="Completa todos los campos antes de crear la tarea.">
        {formulario}
      </ContenidoDialogo>
    </Dialogo>
  )
}
