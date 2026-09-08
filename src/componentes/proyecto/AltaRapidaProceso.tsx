'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useState, type FormEvent, type ReactElement } from 'react'
import { Boton } from '@/componentes/formularios/Boton'
import { useAccionPresencia } from '@/componentes/auditoria/accion'
import { Campo } from '@/componentes/formularios/Campo'
import { AreaTexto, Entrada } from '@/componentes/formularios/Entrada'
import { Segmentado } from '@/componentes/formularios/Segmentado'
import {
  ContenidoSelector,
  DisparadorSelector,
  Opcion,
  Selector
} from '@/componentes/formularios/Selector'
import { SelectorPersonas } from '@/componentes/formularios/SelectorPersonas'
import {
  CerrarDialogo,
  ContenidoDialogo,
  Dialogo,
  DisparadorDialogo
} from '@/componentes/superposiciones/Dialogo'
import { escribirEnBff } from '@/componentes/datos/mutaciones'
import { pedirSobre } from '@/datos/cliente'
import { interpretarAltaRapida, type CatalogosAlta } from '@/dominio/alta-rapida'
import {
  fusionarEspacio,
  fusionarInterpretacion,
  leerCamposTarea,
  type CampoDeTarea,
  type CatalogosTarea,
  type TareaFusionada
} from '@/dominio/ia-tarea'
import { GLOSARIO } from '@/dominio/glosario'
import { errorDeHorasEstimadas, horasDeTexto } from '@/dominio/tiempo-estimado'
import { formatearFecha } from '@/lib/fechas'
import { VistaPreviaAlta, type MarcaPrevia } from './VistaPreviaAlta'
import type {
  ConfiguracionTiposEspacio,
  Referencia,
  TipoDeProcesoDelEspacio
} from '@/datos/recursos'
import type { StaffReferencia } from '@/datos/tipos'

/**
 * Alta de un Proceso desde cualquier pantalla, en una linea.
 *
 * Existe por una razon concreta: hasta ahora la unica forma de crear una tarea era entrar al Espacio
 * y usar su formulario, lo que obliga a **saber a que Espacio pertenece antes de poder anotarla**.
 * Esa decision previa es la que termina mandando las tareas a un chat. Aca el Espacio es opcional y
 * se asigna despues.
 *
 * Lo que se escribe se interpreta con `interpretarAltaRapida`, que vive fuera de React porque es la
 * parte con reglas. Lo que el parser no reconoce **queda en el titulo**: nada se pierde en silencio.
 *
 * === POR QUE HAY DOS MODOS ===
 *
 * La linea es rapida cuando uno ya sabe la sintaxis, pero deja de serlo en cuanto un `@` no resuelve:
 * hay cuatro personas cuyo nombre empieza con "javier" y el parser, con razon, no elige por nadie.
 * Ahi la unica salida honesta es un campo donde se elija. "Por campos" es el mismo formulario que la
 * pantalla de un Espacio muestra cuando la IA esta apagada, mas el Espacio y los asignados, que ahi
 * vienen fijos y aca no. Lo accesorio —tipo, seguidores, descripcion, horas estimadas— vive plegado
 * en "Mas detalles": el alta tiene que poder dejar la tarea lista de una vez sin dejar de ser rapida para
 * quien solo quiere anotar un titulo.
 *
 * Los dos modos terminan en el mismo `POST /tasks`: lo que cambia es como se llenan los campos, no
 * que se crea.
 *
 * === QUE HACE LA IA Y QUE NO ===
 *
 * En "Por campos" hay un texto libre con un boton que **rellena el formulario y nada mas**. No crea
 * la tarea, no manda nada y no decide: vuelca lo que entendio en los campos, marca en la vista
 * previa que salio de ella, y deja "Deshacer" al lado. Crear sigue siendo un clic aparte sobre
 * campos que se pueden corregir uno por uno, porque una tarea que aparece sola en el tablero de
 * alguien es un error que nadie audita hasta que ya paso.
 */

interface PropsAltaRapida {
  /** Personas, Espacios y prioridades contra los que resolver `@`, `#` y `!`. */
  catalogos: CatalogosAlta
  /**
   * Etiquetas que ya existen (`lookups.tags`).
   *
   * Se ofrecen como sugerencia en un `datalist`, no como limite: una etiqueta escrita que no esta
   * en el catalogo se crea en el alta. Solo las usa el modo por campos.
   */
  etiquetas: Referencia[]
  /**
   * Si la capa de IA esta encendida (`ia_habilitada`).
   *
   * Apagada, el campo de texto libre y su boton no se pintan: la API responde 404 a `/ia/*` y
   * ofrecer un boton que falla es peor que no ofrecerlo.
   */
  conIa: boolean
}

/** Valor del selector cuando no se eligio nada. Radix no admite `value=""` en una opcion. */
const NINGUNO = 'ninguno'

/** `id` del `datalist` de etiquetas; el `list` del campo lo referencia por nombre. */
const LISTA_ETIQUETAS = 'etiquetas-alta-rapida'

/** Los dos modos del dialogo. */
const MODOS = [
  { valor: 'linea', etiqueta: 'En una línea' },
  { valor: 'campos', etiqueta: 'Por campos' }
] as const

type Modo = typeof MODOS[number]['valor']

/** Los campos manuales, para poder devolverlos tal como estaban antes de que la IA los pisara. */
interface CamposManuales {
  nombre: string
  espacio: string
  asignados: number[]
  seguidores: number[]
  tipo: string
  prioridad: string
  inicio: string
  vencimiento: string
  etiquetasEscritas: string
  descripcion: string
}

export function AltaRapidaProceso ({ catalogos, etiquetas, conIa }: PropsAltaRapida): ReactElement {
  const router = useRouter()
  const [abierto, setAbierto] = useState(false)

  useAccionPresencia('creando_tarea', abierto)
  const [modo, setModo] = useState<Modo>('linea')
  const [texto, setTexto] = useState('')
  const [enCurso, setEnCurso] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Campos del modo "por campos". Viven aparte de la linea a proposito: cambiar de modo no debe
  // borrar lo que se escribio en el otro, porque se alterna justo cuando un `@` no resolvio.
  const [nombre, setNombre] = useState('')
  const [espacio, setEspacio] = useState(NINGUNO)
  const [asignados, setAsignados] = useState<number[]>([])
  const [seguidores, setSeguidores] = useState<number[]>([])
  const [prioridad, setPrioridad] = useState(NINGUNO)
  const [inicio, setInicio] = useState('')
  const [vencimiento, setVencimiento] = useState('')
  const [etiquetasEscritas, setEtiquetasEscritas] = useState('')
  const [descripcion, setDescripcion] = useState('')
  // Se pide en el alta y no solo en la ficha: la estimacion se define al solicitar la tarea, y lo que
  // no se anota en ese momento no se anota nunca.
  const [horasEstimadas, setHorasEstimadas] = useState('')
  const [facturable, setFacturable] = useState(true)
  // El tipo depende del Espacio, asi que su catalogo se pide y no viene en `catalogos`.
  const [tipo, setTipo] = useState(NINGUNO)
  const [tipos, setTipos] = useState<TipoDeProcesoDelEspacio[]>([])
  const [avisoTipos, setAvisoTipos] = useState<string | null>(null)
  // Lo accesorio arranca plegado: el alta rapida deja de serlo si hay que pasar por diez campos.
  const [masDetalles, setMasDetalles] = useState(false)

  // Lo del texto libre que rellena los campos.
  const [textoLibre, setTextoLibre] = useState('')
  const [interpretando, setInterpretando] = useState(false)
  const [avisoIa, setAvisoIa] = useState<string | null>(null)
  const [fusion, setFusion] = useState<TareaFusionada | null>(null)
  const [previo, setPrevio] = useState<CamposManuales | null>(null)
  // Aparte de `fusion.deIa` porque el Espacio no es uno de los campos que fusiona
  // `fusionarInterpretacion()`: lo resuelve `fusionarEspacio()`, que es otra decision.
  const [espacioDeIa, setEspacioDeIa] = useState(false)

  /*
   * Los tipos de Proceso que ofrece el Espacio elegido.
   *
   * No salen de `lookups.task_types`: la API valida el tipo contra `tblproject_task_types` —la
   * relacion Espacio <-> tipo— y rechaza con `422 no_pertenece_al_espacio` cualquier otro id, ademas
   * de que el catalogo global repite los mismos tres nombres una vez por Espacio. Sin Espacio no hay
   * tipo posible: el selector queda deshabilitado hasta que se elija uno.
   */
  useEffect(() => {
    if (espacio === NINGUNO) return

    const control = new AbortController()

    void pedirSobre<ConfiguracionTiposEspacio>(`projects/${espacio}/task-types`, control.signal)
      .then((sobre) => {
        if (!control.signal.aborted) setTipos(sobre.data.task_types)
      })
      .catch(() => {
        // Sin tipos el alta sigue funcionando: se dice y se deja crear la tarea sin tipo.
        if (!control.signal.aborted) setAvisoTipos('No se pudieron traer los tipos de este espacio.')
      })

    return () => { control.abort() }
  }, [espacio])

  /**
   * Elige el Espacio y descarta el tipo que hubiera.
   *
   * El descarte va aca y no en el efecto: un tipo del Espacio anterior es justo lo que la API
   * rechaza con `422 no_pertenece_al_espacio`, y dejarlo puesto convertiria un cambio de Espacio en
   * un error al crear.
   */
  function elegirEspacio (valor: string): void {
    setEspacio(valor)
    setTipo(NINGUNO)
    setTipos([])
    setAvisoTipos(null)
  }

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

  function limpiar (): void {
    setTexto('')
    setError(null)
    setNombre('')
    setEspacio(NINGUNO)
    setAsignados([])
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
    setMasDetalles(false)
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
    // La descripcion vive en "Mas detalles": si queda plegada, lo que el modelo escribio no se
    // revisa, y revisar antes de crear es toda la gracia del boton.
    if (resultado.description !== null) {
      setDescripcion(resultado.description)
      setMasDetalles(true)
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
   * No se manda `project_id`: aca no hay ningun Espacio de partida, asi que el que nombre el texto
   * es la unica pista, y la API ya sabe resolverlo contra los Espacios que la persona ve.
   */
  async function completar (): Promise<void> {
    const limpio = textoLibre.trim()

    if (limpio === '') {
      setAvisoIa('Escribe primero qué hay que hacer.')
      return
    }

    setInterpretando(true)
    setAvisoIa(null)

    const localLeido = interpretarAltaRapida(limpio, catalogos)
    const respuesta = await escribirEnBff<unknown>('ia/tareas/interpretar', 'POST', { texto: limpio })
    const delModelo = respuesta.ok ? leerCamposTarea(respuesta.datos) : null
    const resultado = fusionarInterpretacion(localLeido, delModelo, catalogosConEtiquetas)
    const elegido = fusionarEspacio(localLeido, delModelo, catalogosConEtiquetas)

    if (elegido.descartado !== null) resultado.noResuelto.push(elegido.descartado)

    setPrevio({
      nombre, espacio, asignados, seguidores, tipo, prioridad, inicio, vencimiento,
      etiquetasEscritas, descripcion
    })
    volcar(resultado, elegido.id)
    setFusion(resultado)
    setEspacioDeIa(elegido.deIa)
    setInterpretando(false)

    if (!respuesta.ok) setAvisoIa(`${respuesta.mensaje} Quedó sólo lo que se entendió del texto.`)
    else if (delModelo === null) setAvisoIa('El modelo respondió algo que no se entendió. Quedó sólo lo que se entendió del texto.')
  }

  /** Devuelve los campos tal como estaban justo antes de la ultima interpretacion. */
  function deshacer (): void {
    if (previo === null) return

    setNombre(previo.nombre)
    setEspacio(previo.espacio)
    setAsignados(previo.asignados)
    setSeguidores(previo.seguidores)
    setTipo(previo.tipo)
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

  /**
   * Manda el alta con el cuerpo que armo el modo activo.
   *
   * @param cuerpo el cuerpo de `POST /tasks`, ya sin campos vacios
   */
  async function enviar (cuerpo: Record<string, unknown>): Promise<void> {
    setEnCurso(true)
    setError(null)

    const resultado = await escribirEnBff<{ id: number }>('tasks', 'POST', cuerpo)

    setEnCurso(false)

    if (!resultado.ok) {
      setError(resultado.mensaje)
      return
    }

    limpiar()
    setAbierto(false)
    router.refresh()
  }

  /**
   * Alta desde la linea.
   *
   * `sinResolver` no bloquea: si alguien escribio `@nadie`, la tarea igual se crea con ese texto en
   * el titulo. Es preferible una tarea anotada con un dato de mas que una tarea que no se anoto.
   */
  async function crearDesdeLinea (): Promise<void> {
    if (leido.name.trim() === '') {
      setError('Escribe al menos un título.')
      return
    }

    await enviar({
      name: leido.name,
      due_date: leido.due_date,
      priority: leido.priority ?? undefined,
      assignees: leido.assignees,
      rel_type: leido.rel_type,
      rel_id: leido.rel_id
    })
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
    if (nombre.trim() === '') {
      setError('La tarea necesita un nombre.')
      return
    }

    const horasMal = errorDeHorasEstimadas(horasEstimadas)

    if (horasMal !== null) {
      setError(horasMal)
      return
    }

    // La colacion de `tbltags` es `_ci`: "urgente" y "Urgente" son la misma fila para la API, asi
    // que no hace falta normalizar nada aca.
    const pedidas = etiquetasEscritas.split(',').map((t) => t.trim()).filter((t) => t !== '')
    const horas = horasDeTexto(horasEstimadas)

    await enviar({
      name: nombre.trim(),
      billable: facturable,
      ...(espacio === NINGUNO ? {} : { rel_type: 'project', rel_id: Number(espacio) }),
      ...(asignados.length === 0 ? {} : { assignees: asignados }),
      ...(seguidores.length === 0 ? {} : { followers: seguidores }),
      ...(tipo === NINGUNO ? {} : { task_type: Number(tipo) }),
      ...(prioridad === NINGUNO ? {} : { priority: Number(prioridad) }),
      ...(inicio === '' ? {} : { start_date: inicio }),
      ...(vencimiento === '' ? {} : { due_date: vencimiento }),
      ...(descripcion.trim() === '' ? {} : { description: descripcion.trim() }),
      ...(horas === null ? {} : { estimated_hours: horas }),
      ...(pedidas.length === 0 ? {} : { tags: pedidas })
    })
  }

  /** Manda el alta del modo activo. */
  async function crear (evento: FormEvent): Promise<void> {
    evento.preventDefault()

    if (modo === 'linea') await crearDesdeLinea()
    else await crearPorCampos()
  }

  return (
    <Dialogo
      open={abierto}
      onOpenChange={(estado) => {
        setAbierto(estado)
        if (!estado) limpiar()
      }}
    >
      <DisparadorDialogo asChild>
        <Boton variante="primario">Nueva tarea</Boton>
      </DisparadorDialogo>

      <ContenidoDialogo
        titulo={`${GLOSARIO.proceso.singular} nuevo`}
        descripcion={`Una línea o campo por campo. El ${GLOSARIO.espacio.singular.toLowerCase()} puede quedar vacío y asignarse después.`}
      >
        <form className="flex flex-col gap-4" onSubmit={(evento) => { void crear(evento) }}>
          <Segmentado
            etiqueta="Cómo escribir la tarea"
            opciones={MODOS}
            activo={modo}
            onElegir={(valor) => { setModo(valor as Modo); setError(null) }}
          />

          {modo === 'linea'
            ? (
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

                <p className="text-texto-sutil text-xs">
                  <code className="text-texto-tenue">@persona</code> asigna ·{' '}
                  <code className="text-texto-tenue">#{GLOSARIO.espacio.singular.toLowerCase()}</code> lo
                  vincula · <code className="text-texto-tenue">!prioridad</code> ·{' '}
                  <code className="text-texto-tenue">mañana</code>, <code className="text-texto-tenue">viernes</code>{' '}
                  o <code className="text-texto-tenue">30/9</code> ponen la entrega. Con espacios, entre comillas.
                  {' '}Si un nombre coincide con varias personas queda en el título: ahí conviene «Por campos».
                </p>
              </>
              )
            : (
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

                <div className="grid gap-4 sm:grid-cols-2">
                  <Campo etiqueta={GLOSARIO.espacio.singular}>
                    {({ id }) => (
                      <Selector value={espacio} onValueChange={elegirEspacio}>
                        <DisparadorSelector id={id} />
                        <ContenidoSelector>
                          <Opcion value={NINGUNO}>Sin {GLOSARIO.espacio.singular.toLowerCase()}</Opcion>
                          {catalogos.espacios.map((fila) => (
                            <Opcion key={fila.id} value={String(fila.id)}>{fila.name}</Opcion>
                          ))}
                        </ContenidoSelector>
                      </Selector>
                    )}
                  </Campo>

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
                        list={LISTA_ETIQUETAS}
                        onChange={(evento) => { setEtiquetasEscritas(evento.target.value) }}
                      />
                      {/* `datalist` es la sugerencia nativa: no valida ni obliga, y reusar la
                          etiqueta que ya existe evita fundar la variante con typo. */}
                      <datalist id={LISTA_ETIQUETAS}>
                        {etiquetas.map((e) => <option key={e.id} value={e.name} />)}
                      </datalist>
                    </>
                  )}
                </Campo>

                {/* `details` nativo: pliega sin estado propio ni dependencia, y lo que esconde
                    sigue estando en el formulario y en el orden de tabulacion. El `open` si es
                    controlado porque la IA tiene que poder abrirlo al escribir la descripcion. */}
                <details
                  className="border-borde rounded-tarjeta border px-3 py-2.5"
                  open={masDetalles}
                  onToggle={(evento) => { setMasDetalles(evento.currentTarget.open) }}
                >
                  <summary className="text-texto-tenue hover:text-texto cursor-pointer list-none text-sm transition-colors [&::-webkit-details-marker]:hidden">
                    Más detalles
                  </summary>

                  <div className="mt-4 flex flex-col gap-4">
                    <Campo
                      etiqueta="Tipo"
                      ayuda={avisoTipos ?? (
                        espacio === NINGUNO
                          ? `Cada ${GLOSARIO.espacio.singular.toLowerCase()} define sus tipos: elige uno primero.`
                          : tipos.length === 0
                            ? `Este ${GLOSARIO.espacio.singular.toLowerCase()} no ofrece tipos.`
                            : undefined
                      )}
                    >
                      {({ id }) => (
                        <Selector value={tipo} onValueChange={setTipo} disabled={tipos.length === 0}>
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

                    <Campo etiqueta="Descripción">
                      {(props) => (
                        <AreaTexto
                          {...props}
                          value={descripcion}
                          onChange={(evento) => { setDescripcion(evento.target.value) }}
                        />
                      )}
                    </Campo>

                    <Campo etiqueta="Horas estimadas" ayuda="Acepta decimales. Déjalo vacío si todavía no se estimó.">
                      {(props) => (
                        <Entrada
                          {...props}
                          type="number"
                          step="0.5"
                          value={horasEstimadas}
                          onChange={(evento) => { setHorasEstimadas(evento.target.value) }}
                        />
                      )}
                    </Campo>

                    <label className="text-texto flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={facturable}
                        onChange={(evento) => { setFacturable(evento.target.checked) }}
                      />
                      Facturable
                    </label>
                  </div>
                </details>
              </>
              )}

          {error !== null && (
            <p role="alert" className="text-texto-peligro text-sm">{error}</p>
          )}

          <div className="flex justify-end gap-2">
            <CerrarDialogo asChild>
              <Boton variante="sutil" type="button">Cancelar</Boton>
            </CerrarDialogo>
            <Boton type="submit" variante="primario" cargando={enCurso}>Crear</Boton>
          </div>
        </form>
      </ContenidoDialogo>
    </Dialogo>
  )
}
