'use client'

import { useEffect, useRef, useState, type ReactElement } from 'react'
import { ChevronDown, ChevronRight, Pencil, Sparkles, Trash2 } from 'lucide-react'
import { useLenis } from 'lenis/react'
import { Boton } from '@/componentes/formularios/Boton'
import { Campo } from '@/componentes/formularios/Campo'
import { AreaTexto, CLASES_CASILLA, Entrada } from '@/componentes/formularios/Entrada'
import {
  ContenidoSelector,
  DisparadorSelector,
  Opcion,
  Selector
} from '@/componentes/formularios/Selector'
import { SelectorPersonas } from '@/componentes/formularios/SelectorPersonas'
import { Avatar } from '@/componentes/presentadores/Avatar'
import { Fecha } from '@/componentes/presentadores/Fecha'
import { Insignia } from '@/componentes/presentadores/Insignia'
import { Dialogo, ContenidoDialogo } from '@/componentes/superposiciones/Dialogo'
import { escribirEnBff, leerDelBff } from '@/componentes/datos/mutaciones'
import { PARAMETRO_TAREA } from '@/componentes/datos/tabla'
import { cargarAsignables } from '@/datos/asignables'
import { cn } from '@/lib/clases'
import { EstadoDeTarea } from '../EstadoDeTarea'
import type { EstadoLookup, Lookups } from '@/datos/recursos'
import type { StaffReferencia } from '@/datos/tipos'
import type {
  ParcheDePropuesta,
  PropuestaDeTarea,
  PropuestasDelActa,
  ResultadoDeCreacion
} from '@/definiciones/actas'

/**
 * Las tareas que el modelo leyó dentro de un Meeting Paper y todavía no son Procesos.
 *
 * === POR QUÉ SON PROPUESTAS Y NO TAREAS ===
 *
 * Lo que un acta dice —"Juan manda la propuesta el viernes"— se parece a una Tarea pero no lo es:
 * lo escribió un modelo a partir de lo que alguien dijo en una reunión, y crearlo directo en el
 * tablero llenaría el Espacio de Procesos que nadie revisó, con responsables inventados y fechas que
 * la reunión nunca fijó. Acá viven aparte, con su propio estado, hasta que una persona del equipo
 * las mira, las corrige y decide cuáles existen de verdad.
 *
 * Por eso la fila se edita **antes** de crear y no después: corregir el título de un Proceso ya
 * creado obliga a abrirlo, y descartar uno mal propuesto obliga a borrarlo, que deja rastro en la
 * actividad del Espacio. Una propuesta descartada no llegó a ser nada.
 *
 * === LO QUE EL MODELO NO PUDO RESOLVER SE DICE, NO SE ESCONDE ===
 *
 * `no_resuelto` es la lista de campos que el acta nombró y el catálogo no reconoció: un "Juan" que
 * no está en el equipo, una etiqueta que no existe. Esos campos llegan vacíos, y una fila con el
 * responsable en blanco y sin explicación se lee como un descuido del modelo. Dicho al lado, es una
 * instrucción: falta completarlo a mano.
 *
 * === SE MONTA SOLO DONDE EL RECURSO EXISTE ===
 *
 * La ruta entra por prop y ya viene resuelta: `fuente.actaTareas` es `null` en el portal —proponer y
 * crear Procesos es trabajo del equipo—, así que allí la sección ni se dibuja y no hay ninguna rama
 * por sujeto acá adentro. Ver `dominio/fuente-proyecto.ts`.
 */

interface PropsTareasPropuestas {
  /** Ruta del recurso, con el id del acta ya resuelto. Sin barra inicial: la pone el BFF. */
  ruta: string
  /** Catálogos, para traducir la prioridad a su nombre y su color. Sale de la fuente. */
  rutaLookups: string
  /** El Espacio al que pertenece el acta: arma el enlace a la Tarea creada y la ruta de la IA. */
  proyectoId: number
  /** El acta de la que salieron. Va en el cuerpo de "Analizar buscando tareas". */
  actaId: number
  /**
   * Crear, editar y descartar propuestas. Es la capacidad `create` sobre Procesos, no sobre el acta:
   * lo que esta sección produce son Tareas. Sin ella la sección queda en solo lectura.
   */
  puedeCrear: boolean
  /** Si la capa de IA responde. Con ella apagada, `/ia/*` da 404 y analizar no se ofrece. */
  conIa: boolean
  /**
   * El acta se acaba de generar. Las propuestas ya vienen calculadas —el backend las guarda antes
   * de cerrar el stream—, así que la sección se abre, se trae a la vista y dice cuántas encontró:
   * debajo de un documento de 46rem nadie las descubre solo.
   */
  destacar?: boolean
}

/** Estado de la primera carga. El error es un texto listo para mostrar, no un envelope. */
type Carga =
  | { fase: 'cargando' }
  | { fase: 'error', mensaje: string }
  | { fase: 'listo', datos: PropuestasDelActa }

/**
 * Qué operación está en vuelo. Una sola a la vez: las tres escriben sobre la misma lista.
 *
 * Al crear se guarda desde qué fila se pidió —`null` si fue la tanda de abajo— para que el spinner
 * aparezca en el botón que se apretó y no en todos los que crean.
 */
type EnCurso =
  | null
  | { que: 'proponiendo' }
  | { que: 'creando', fila: number | null }
  | { que: 'descartando', id: number }

export function TareasPropuestas ({
  ruta,
  rutaLookups,
  proyectoId,
  actaId,
  puedeCrear,
  conIa,
  destacar = false
}: PropsTareasPropuestas): ReactElement {
  const seccion = useRef<HTMLElement>(null)
  const lenis = useLenis()
  const [carga, setCarga] = useState<Carga>({ fase: 'cargando' })
  const [intento, setIntento] = useState(0)
  /**
   * Si la sección está desplegada, o `null` mientras nadie la haya tocado.
   *
   * Con `null` manda el contenido: se abre sola cuando hay algo que mirar y se queda cerrada cuando
   * de esa acta no salió nada, que es lo que evita un bloque abierto y vacío bajo cada acta vieja.
   * Una decisión explícita gana sobre eso hasta que se cambie de acta.
   */
  const [desplegada, setDesplegada] = useState<boolean | null>(null)
  const [seleccionadas, setSeleccionadas] = useState<number[]>([])
  const [error, setError] = useState<string | null>(null)
  /** Confirmación de la última creación. Se limpia al empezar otra operación para no mentir. */
  const [aviso, setAviso] = useState<string | null>(null)
  const [enCurso, setEnCurso] = useState<EnCurso>(null)
  const [editando, setEditando] = useState<PropuestaDeTarea | null>(null)
  const [prioridades, setPrioridades] = useState<EstadoLookup[]>([])
  const [personas, setPersonas] = useState<StaffReferencia[]>([])
  const [errorEquipo, setErrorEquipo] = useState<string | null>(null)

  /**
   * Volver a "cargando" en el render y no en el efecto.
   *
   * Es el mismo idiom que `useRecurso` (`componentes/proyecto/carga.ts`): cambiar de acta con las
   * propuestas de la anterior todavia en pantalla mostraria por un instante la lista equivocada, y
   * hacerlo desde un efecto encadena renders —la regla de hooks lo rechaza—. React admite este
   * `setState` durante el render: reinicia el render antes de pintar.
   */
  const peticion = `${ruta}|${intento}`
  const [enVuelo, setEnVuelo] = useState(peticion)

  if (enVuelo !== peticion) {
    setEnVuelo(peticion)
    setCarga({ fase: 'cargando' })
    setSeleccionadas([])
    setError(null)
    setAviso(null)
  }

  useEffect(() => {
    let vivo = true

    void leerDelBff<PropuestasDelActa>(ruta).then((resultado) => {
      if (!vivo) return

      setCarga(resultado.ok
        ? { fase: 'listo', datos: resultado.datos }
        : { fase: 'error', mensaje: resultado.mensaje })
    })

    return () => { vivo = false }
  }, [ruta, intento])

  const items = carga.fase === 'listo' ? carga.datos.items : []
  const pendientes = items.filter((propuesta) => propuesta.estado === 'pendiente')
  const creadas = items.filter((propuesta) => propuesta.estado === 'creada')
  const hayPendientes = pendientes.length > 0
  const todasSeleccionadas = hayPendientes && pendientes.every((propuesta) => seleccionadas.includes(propuesta.id))

  /**
   * Los catálogos solo se piden si hay algo que editar.
   *
   * Un acta de la que no salió ninguna tarea —que son la mayoría de las viejas— no tiene por qué
   * gastar dos peticiones para dibujar una línea que dice que no hay nada. `cargarAsignables`
   * además comparte la respuesta con el resto de la pestaña, así que casi siempre ya está.
   */
  useEffect(() => {
    if (!hayPendientes || !puedeCrear) return

    let vivo = true

    void leerDelBff<Lookups>(rutaLookups).then((resultado) => {
      // Sin catálogo la insignia de prioridad no se pinta —ver `EstadoDeTarea`— y el resto de la
      // fila se sigue editando: una lista de "#1" y "#4" no dice nada que valga la pena mostrar.
      if (vivo && resultado.ok) setPrioridades(resultado.datos.task_priorities)
    })

    void cargarAsignables()
      .then((lista) => {
        if (!vivo) return

        setPersonas(lista)
        setErrorEquipo(null)
      })
      .catch((fallo: unknown) => {
        if (!vivo) return

        setErrorEquipo(fallo instanceof Error
          ? fallo.message
          : 'No se pudo cargar el equipo: los responsables no se pueden cambiar desde aquí.')
      })

    return () => { vivo = false }
  }, [hayPendientes, puedeCrear, rutaLookups])

  /** Pedir propuestas nuevas gasta IA y escribe: las mismas dos condiciones que el resto de la pantalla. */
  const puedeProponer = puedeCrear && conIa
  /**
   * Sin ninguna fila —ni pendiente, ni creada, ni descartada— el acta nunca pasó por el análisis:
   * es anterior a él, se escribió a mano o el proveedor falló al generarla. Se distingue de "no
   * salieron tareas" porque lo que corresponde ofrecer es analizarla, no volver a hacerlo.
   */
  const sinAnalizar = carga.fase === 'listo' && items.length === 0
  const abierta = desplegada ?? (hayPendientes || creadas.length > 0 || destacar || (sinAnalizar && puedeProponer))

  /**
   * Trae la sección a la vista una sola vez, cuando el acta recién generada terminó de cargar sus
   * propuestas. El scroll es de Lenis y no del `body` —ver `ScrollSuave`—: sin él, `scrollIntoView`
   * mueve el contenedor por debajo y Lenis lo devuelve a donde estaba en el siguiente fotograma.
   * `resize()` va antes porque la pantalla anterior era el asistente, mucho más corto: Lenis todavía
   * tiene su alto y recortaría el destino a ese tope.
   */
  const destacada = useRef(false)
  useEffect(() => {
    const destino = seccion.current
    if (!destacar || destacada.current || carga.fase !== 'listo' || destino === null) return

    const fotograma = requestAnimationFrame(() => {
      destacada.current = true
      if (lenis === undefined) {
        destino.scrollIntoView({ behavior: 'smooth', block: 'start' })

        return
      }
      lenis.resize()
      lenis.scrollTo(destino, { offset: -24 })
    })

    return () => { cancelAnimationFrame(fotograma) }
  }, [destacar, carga.fase, lenis])

  /** Deja la lista como la devolvió la API y suelta lo que estuviera seleccionado de la tanda vieja. */
  function reponer (datos: PropuestasDelActa): void {
    setCarga({ fase: 'listo', datos })
    setSeleccionadas([])
  }

  /** Cambia una sola propuesta de la lista, sin volver a pedirla entera. */
  function reemplazar (propuesta: PropuestaDeTarea): void {
    setCarga((previo) => previo.fase !== 'listo'
      ? previo
      : {
          fase: 'listo',
          datos: {
            ...previo.datos,
            items: previo.datos.items.map((item) => item.id === propuesta.id ? propuesta : item)
          }
        })
  }

  /** Marca o desmarca una propuesta para la creación en tanda. */
  function alternar (id: number): void {
    setSeleccionadas((previas) => previas.includes(id)
      ? previas.filter((elegida) => elegida !== id)
      : [...previas, id])
  }

  /** "Seleccionar todas": si ya están todas marcadas las suelta, si no marca todas las pendientes. */
  function alternarTodas (): void {
    setSeleccionadas(todasSeleccionadas ? [] : pendientes.map((propuesta) => propuesta.id))
  }

  /**
   * Guarda los campos que se tocaron de una propuesta.
   *
   * @param id la propuesta que se edita
   * @param parche solo lo que cambió; la API deja el resto como estaba
   * @returns `true` si la API lo aceptó, para que el diálogo sepa si puede cerrarse
   */
  async function parchear (id: number, parche: ParcheDePropuesta): Promise<boolean> {
    setError(null)

    const resultado = await escribirEnBff<PropuestaDeTarea>(`${ruta}/${id}`, 'PATCH', parche)

    if (!resultado.ok) {
      setError(resultado.mensaje)

      return false
    }

    reemplazar(resultado.datos)

    return true
  }

  /** Saca una propuesta de la lista. No crea ni borra ningún Proceso: nunca llegó a existir. */
  async function descartar (propuesta: PropuestaDeTarea): Promise<void> {
    setEnCurso({ que: 'descartando', id: propuesta.id })
    setError(null)

    const resultado = await escribirEnBff(`${ruta}/${propuesta.id}`, 'DELETE')

    setEnCurso(null)

    if (!resultado.ok) {
      setError(resultado.mensaje)

      return
    }

    setSeleccionadas((previas) => previas.filter((elegida) => elegida !== propuesta.id))
    setCarga((previo) => previo.fase !== 'listo'
      ? previo
      : {
          fase: 'listo',
          datos: {
            ...previo.datos,
            items: previo.datos.items.filter((item) => item.id !== propuesta.id)
          }
        })
  }

  /**
   * Convierte en Procesos las propuestas pedidas: una sola desde su fila, o la tanda de abajo.
   *
   * La API contesta con dos listas y las dos importan: crear ocho tareas y que dos fallen no es un
   * error de la operación, y esconder las seis que sí se crearon obligaría a recargar para saber
   * qué pasó. Las creadas bajan a "Ya creadas" y las fallidas se quedan donde estaban, con el motivo
   * a la vista para poder arreglarlas y volver a intentar.
   *
   * @param ids las propuestas a crear; una lista vacía no hace nada
   * @param fila la fila desde la que se pidió, o `null` si fue la tanda
   */
  async function crear (ids: number[], fila: number | null): Promise<void> {
    if (ids.length === 0) return

    setEnCurso({ que: 'creando', fila })
    setError(null)
    setAviso(null)

    const resultado = await escribirEnBff<ResultadoDeCreacion>(
      `${ruta}/crear`, 'POST', { propuestas: ids }
    )

    setEnCurso(null)

    if (!resultado.ok) {
      setError(resultado.mensaje)

      return
    }

    const creadasPorId = new Map(resultado.datos.creadas.map((fila) => [fila.propuesta_id, fila]))

    setCarga((previo) => previo.fase !== 'listo'
      ? previo
      : {
          fase: 'listo',
          datos: {
            ...previo.datos,
            items: previo.datos.items.map((item) => {
              const creada = creadasPorId.get(item.id)

              if (creada === undefined) return item

              return { ...item, estado: 'creada', task_id: creada.task_id, task_name: creada.name }
            })
          }
        })

    // Lo que falló queda marcado para reintentarlo; lo que no se pidió conserva su marca, porque
    // crear una fila suelta no es decidir sobre las otras.
    const fallidas = resultado.datos.fallidas.map((fallida) => fallida.propuesta_id)
    setSeleccionadas((previas) => [
      ...previas.filter((elegida) => !ids.includes(elegida)),
      ...fallidas
    ])

    const cuantas = resultado.datos.creadas.length
    if (cuantas > 0) setAviso(cuantas === 1 ? 'Se creó 1 tarea.' : `Se crearon ${cuantas} tareas.`)

    if (resultado.datos.fallidas.length > 0) {
      setError(`No se pudieron crear ${resultado.datos.fallidas.length === 1 ? '1 tarea' : `${resultado.datos.fallidas.length} tareas`}: ${resultado.datos.fallidas.map((fila) => fila.error).join(' · ')}`)
    }
  }

  /**
   * El botón de abajo: crea lo marcado o, si no hay nada marcado, todas las pendientes.
   *
   * Sin selección no queda deshabilitado —antes lo estaba, y un botón gris sin explicación no dice
   * que hacía falta marcar casillas—. Crear todas de una vez sí se confirma: son varias Tareas que
   * aparecen en el tablero del Espacio y deshacerlo es borrarlas una por una.
   */
  function crearTanda (): void {
    if (seleccionadas.length > 0) {
      void crear(seleccionadas, null)

      return
    }

    const todas = pendientes.map((propuesta) => propuesta.id)
    const texto = todas.length === 1 ? '¿Crear 1 tarea en este proyecto?' : `¿Crear ${todas.length} tareas en este proyecto?`
    if (!confirm(texto)) return

    void crear(todas, null)
  }

  /**
   * Le pide al modelo que vuelva a leer el acta.
   *
   * Se pregunta antes cuando ya hay propuestas pendientes: lo que se pierde no es lo que escribió el
   * modelo —eso se vuelve a generar— sino las correcciones a mano que alguien ya hizo sobre ellas.
   */
  async function proponer (): Promise<void> {
    if (hayPendientes && !confirm(
      'Volver a analizar reemplaza las tareas pendientes de este Meeting Paper, incluidas las que ya corregiste. ¿Seguir?'
    )) return

    setEnCurso({ que: 'proponiendo' })
    setError(null)
    setAviso(null)

    const resultado = await escribirEnBff<PropuestasDelActa>(
      `ia/proyectos/${proyectoId}/acta-tareas`, 'POST', { acta_id: actaId }
    )

    setEnCurso(null)

    if (!resultado.ok) {
      setError(resultado.mensaje)

      return
    }

    reponer(resultado.datos)
    setDesplegada(true)
  }

  const Chevron = abierta ? ChevronDown : ChevronRight

  return (
    <section ref={seccion} className="flex scroll-mt-6 flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => { setDesplegada(!abierta) }}
          aria-expanded={abierta}
          className="text-texto rounded-control hover:bg-hover -ml-1.5 flex cursor-pointer items-center gap-2 p-1.5 text-sm font-semibold transition-colors duration-150"
        >
          <Chevron size={16} strokeWidth={2} aria-hidden="true" className="text-texto-sutil shrink-0" />
          Tareas propuestas
          {hayPendientes && (
            <Insignia tono="acento" tamano="chico">
              {pendientes.length === 1 ? '1 pendiente' : `${pendientes.length} pendientes`}
            </Insignia>
          )}
        </button>

        {puedeProponer && carga.fase === 'listo' && (
          <Boton
            variante={sinAnalizar ? 'primario' : 'sutil'}
            tamano="chico"
            cargando={enCurso?.que === 'proponiendo'}
            disabled={enCurso !== null}
            onClick={() => { void proponer() }}
          >
            <Sparkles size={14} strokeWidth={2} aria-hidden="true" className="shrink-0" />
            {sinAnalizar ? 'Analizar buscando tareas' : 'Volver a analizar'}
          </Boton>
        )}
      </div>

      {error !== null && (
        <p role="alert" className="bg-superficie-peligro text-texto-peligro rounded-chico px-3 py-2 text-sm">
          {error}
        </p>
      )}

      {aviso !== null && (
        <p role="status" className="border-linea bg-superficie-acentuada rounded-chico border px-3 py-2 text-sm">
          {aviso}
        </p>
      )}

      {enCurso?.que === 'proponiendo' && (
        <p role="status" className="text-texto-sutil text-sm">
          Analizando el Meeting Paper con IA… puede tardar unos segundos.
        </p>
      )}

      {destacar && carga.fase === 'listo' && hayPendientes && (
        <p role="status" className="border-linea bg-superficie-acentuada rounded-chico border px-3 py-2 text-sm">
          La IA encontró {pendientes.length === 1 ? '1 tarea' : `${pendientes.length} tareas`} en este
          Meeting Paper. Revísalas, corrige lo que haga falta y crea las que correspondan.
        </p>
      )}

      {carga.fase === 'cargando' && (
        <p role="status" className="text-texto-sutil text-sm">
          Buscando las tareas de este Meeting Paper…
        </p>
      )}

      {carga.fase === 'error' && (
        <div className="bg-superficie-peligro rounded-chico flex flex-wrap items-center gap-3 px-3 py-2">
          <p role="alert" className="text-texto-peligro text-sm">{carga.mensaje}</p>
          <Boton variante="sutil" tamano="chico" onClick={() => { setIntento((n) => n + 1) }}>
            Reintentar
          </Boton>
        </div>
      )}

      {carga.fase === 'listo' && abierta && (
        <>
          {sinAnalizar && (
            <p className="text-texto-tenue text-sm">
              Este Meeting Paper todavía no se analizó en busca de tareas.
              {puedeProponer
                ? ' "Analizar buscando tareas" lo lee con IA y propone las que quedaron comprometidas; ninguna se crea sin que la confirmes.'
                : ''}
            </p>
          )}

          {!sinAnalizar && !hayPendientes && creadas.length === 0 && (
            <p className="text-texto-tenue text-sm">
              De este Meeting Paper no salieron tareas.
              {puedeProponer
                ? ' Si la reunión sí acordó algo, "Volver a analizar" le pide al modelo que lo vuelva a leer.'
                : ''}
            </p>
          )}

          {puedeCrear && hayPendientes && (
            <label className="text-texto-tenue flex w-fit cursor-pointer items-center gap-2 text-sm">
              <input
                type="checkbox"
                className={CLASES_CASILLA}
                checked={todasSeleccionadas}
                disabled={enCurso !== null}
                onChange={alternarTodas}
              />
              Seleccionar todas
            </label>
          )}

          {hayPendientes && (
            <ul className="flex flex-col gap-2">
              {pendientes.map((propuesta) => (
                <li key={propuesta.id}>
                  <FilaPropuesta
                    propuesta={propuesta}
                    prioridades={prioridades}
                    puedeCrear={puedeCrear}
                    seleccionada={seleccionadas.includes(propuesta.id)}
                    descartando={enCurso?.que === 'descartando' && enCurso.id === propuesta.id}
                    creando={enCurso?.que === 'creando' && enCurso.fila === propuesta.id}
                    bloqueada={enCurso !== null}
                    onAlternar={() => { alternar(propuesta.id) }}
                    onCrear={() => { void crear([propuesta.id], propuesta.id) }}
                    onEditar={() => { setEditando(propuesta) }}
                    onRenombrar={async (titulo) => await parchear(propuesta.id, { titulo })}
                    onDescartar={() => { void descartar(propuesta) }}
                  />
                </li>
              ))}
            </ul>
          )}

          {puedeCrear && hayPendientes && (
            <div className="flex justify-end">
              <Boton
                variante="primario"
                tamano="chico"
                disabled={enCurso !== null}
                cargando={enCurso?.que === 'creando' && enCurso.fila === null}
                onClick={crearTanda}
              >
                {seleccionadas.length === 0
                  ? `Crear todas (${pendientes.length})`
                  : seleccionadas.length === 1 ? 'Crear 1 seleccionada' : `Crear ${seleccionadas.length} seleccionadas`}
              </Boton>
            </div>
          )}

          {creadas.length > 0 && <YaCreadas propuestas={creadas} proyectoId={proyectoId} />}
        </>
      )}

      {editando !== null && (
        <DialogoDePropuesta
          propuesta={editando}
          personas={personas}
          errorEquipo={errorEquipo}
          prioridades={prioridades}
          onGuardar={async (parche) => await parchear(editando.id, parche)}
          onCerrar={() => { setEditando(null) }}
        />
      )}
    </section>
  )
}

/**
 * Una propuesta pendiente: lo que se va a crear y de dónde salió.
 *
 * El título se corrige **en la fila** porque es lo que se corrige siempre —el modelo escribe
 * "Enviar propuesta" donde el equipo diría "Enviar propuesta a Codelco"— y abrir un diálogo para
 * cambiar tres palabras en cada una de ocho filas es el camino largo del caso frecuente. El resto
 * de los campos sí vive en el diálogo: se tocan de a una y necesitan controles que no entran en
 * una línea.
 *
 * Se guarda al salir del campo y no con un botón por fila: un botón "Guardar" por cada título
 * multiplicaría los controles de la lista por dos para confirmar algo que la persona ya decidió al
 * irse del campo.
 *
 * "Crear tarea" sí va en cada fila y a la vista: es la acción para la que existe la lista, y
 * esconderla detrás de marcar casillas hacía que nadie descubriera cómo convertir una propuesta.
 */
function FilaPropuesta ({
  propuesta,
  prioridades,
  puedeCrear,
  seleccionada,
  descartando,
  creando,
  bloqueada,
  onAlternar,
  onCrear,
  onEditar,
  onRenombrar,
  onDescartar
}: {
  propuesta: PropuestaDeTarea
  prioridades: EstadoLookup[]
  puedeCrear: boolean
  seleccionada: boolean
  descartando: boolean
  creando: boolean
  bloqueada: boolean
  onAlternar: () => void
  onCrear: () => void
  onEditar: () => void
  onRenombrar: (titulo: string) => Promise<boolean>
  onDescartar: () => void
}): ReactElement {
  /**
   * Lo que se está escribiendo, junto al título con el que se empezó.
   *
   * Comparar contra `visto` durante el render —y no reponerlo desde un efecto— es lo que deja que el
   * diálogo de edición cambie el título sin pelearse con lo que hay tipeado: si el título de la
   * propuesta ya no es el que esta fila vio, manda el de la propuesta.
   */
  const [borrador, setBorrador] = useState({ visto: propuesta.titulo, titulo: propuesta.titulo })
  const [guardando, setGuardando] = useState(false)
  const [descripcionAbierta, setDescripcionAbierta] = useState(false)
  const titulo = borrador.visto === propuesta.titulo ? borrador.titulo : propuesta.titulo

  /** Manda el título solo si de verdad cambió: salir del campo sin tocarlo no es una escritura. */
  async function alSalir (): Promise<void> {
    const limpio = titulo.trim()

    if (limpio === '' || limpio === propuesta.titulo) {
      setBorrador({ visto: propuesta.titulo, titulo: propuesta.titulo })

      return
    }

    setGuardando(true)
    const guardado = await onRenombrar(limpio)
    setGuardando(false)

    // Si la API lo rechazó, lo escrito se queda en pantalla: es lo único que quedaría de ese texto.
    if (guardado) setBorrador({ visto: limpio, titulo: limpio })
  }

  return (
    <div className="border-linea bg-superficie-elevada rounded-tarjeta flex gap-3 border p-3">
      {puedeCrear && (
        <input
          type="checkbox"
          className={cn(CLASES_CASILLA, 'mt-2')}
          checked={seleccionada}
          disabled={bloqueada}
          aria-label={`Elegir "${propuesta.titulo}" para crearla`}
          onChange={onAlternar}
        />
      )}

      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div className="flex items-start gap-2">
          {puedeCrear
            ? (
              <Entrada
                value={titulo}
                maxLength={600}
                disabled={guardando}
                aria-label="Título de la tarea propuesta"
                className="h-8"
                onChange={(evento) => { setBorrador({ visto: propuesta.titulo, titulo: evento.target.value }) }}
                onBlur={() => { void alSalir() }}
              />
              )
            : <p className="text-texto min-w-0 flex-1 text-sm font-medium">{propuesta.titulo}</p>}

          {puedeCrear && (
            <div className="flex shrink-0 items-center gap-1">
              <Boton
                variante="primario"
                tamano="chico"
                cargando={creando}
                disabled={bloqueada}
                onClick={onCrear}
              >
                Crear tarea
              </Boton>
              <Boton
                variante="sutil"
                tamano="chico"
                soloIcono
                disabled={bloqueada}
                aria-label={`Editar "${propuesta.titulo}"`}
                onClick={onEditar}
              >
                <Pencil size={14} aria-hidden="true" />
              </Boton>
              <Boton
                variante="sutil"
                tamano="chico"
                soloIcono
                cargando={descartando}
                disabled={bloqueada}
                aria-label={`Descartar "${propuesta.titulo}"`}
                onClick={onDescartar}
              >
                <Trash2 size={14} aria-hidden="true" />
              </Boton>
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs">
          {propuesta.asignados.length === 0
            ? <span className="text-texto-sutil">Sin responsable</span>
            : propuesta.asignados.map((persona) => (
              <span
                key={persona.id}
                className="bg-relleno-neutro text-relleno-neutro-contenido rounded-control flex items-center gap-1.5 py-0.5 pl-0.5 pr-2"
              >
                <Avatar nombre={persona.nombre} imagen={null} tamano="chico" />
                <span className="max-w-40 truncate">{persona.nombre}</span>
              </span>
              ))}

          <Fecha valor={propuesta.vence} comoVencimiento className="text-xs" />
          <EstadoDeTarea status={propuesta.prioridad} catalogo={prioridades} />

          {propuesta.etiquetas.map((etiqueta) => (
            <Insignia key={etiqueta.id} tono="contorno" tamano="chico">{etiqueta.nombre}</Insignia>
          ))}
        </div>

        {propuesta.descripcion !== null && (
          <div className="flex flex-col items-start gap-1">
            <p className={cn('text-texto-tenue whitespace-pre-line text-sm', !descripcionAbierta && 'line-clamp-4')}>
              {propuesta.descripcion}
            </p>
            {esDescripcionLarga(propuesta.descripcion) && (
              <button
                type="button"
                aria-expanded={descripcionAbierta}
                className="text-texto-sutil hover:text-texto cursor-pointer text-xs underline-offset-2 hover:underline"
                onClick={() => { setDescripcionAbierta(!descripcionAbierta) }}
              >
                {descripcionAbierta ? 'Ver menos' : 'Ver más'}
              </button>
            )}
          </div>
        )}

        {propuesta.no_resuelto.length > 0 && (
          <p className="text-texto-aviso text-xs">
            No se resolvió: {propuesta.no_resuelto.join(' · ')}. Queda vacío hasta que lo completes.
          </p>
        )}

        {/* Entre comillas y recortado: es lo que se dijo en la reunión, no una descripción escrita
            para esta pantalla. Dos líneas alcanzan para reconocer el pasaje; el resto está en el
            acta, que se está viendo justo arriba. */}
        <p className="text-texto-sutil line-clamp-2 text-xs italic" title={propuesta.texto_origen}>
          «{propuesta.texto_origen}»
        </p>
      </div>
    </div>
  )
}

/**
 * Si la descripción no entra en las cuatro líneas del recorte y merece "Ver más".
 *
 * Es una estimación por texto y no una medición del DOM: medir exigiría un efecto y un observador de
 * tamaño por fila para decidir si se ofrece un botón. Más de cuatro renglones escritos, o un párrafo
 * que a ancho de fila ocupa más de cuatro, es lo que el recorte corta.
 */
function esDescripcionLarga (descripcion: string): boolean {
  return descripcion.split('\n').length > 4 || descripcion.length > 320
}

/**
 * Las propuestas que ya son Procesos.
 *
 * Van en una lista aparte y no se borran de la pantalla: haber creado ocho tareas y que el bloque
 * quede vacío deja a quien las creó sin forma de comprobar qué salió de ahí. El enlace abre el
 * detalle con el mismo `?tarea={id}` que usa cualquier listado, sobre la pestaña de Procesos del
 * Espacio.
 */
function YaCreadas ({ propuestas, proyectoId }: {
  propuestas: PropuestaDeTarea[]
  proyectoId: number
}): ReactElement {
  return (
    <div className="flex flex-col gap-2">
      <h4 className="text-texto-tenue text-xs font-semibold uppercase">Ya creadas</h4>
      <ul className="flex flex-col gap-1">
        {propuestas.map((propuesta) => (
          <li key={propuesta.id} className="text-sm">
            {propuesta.task_id === null
              ? <span className="text-texto-tenue">{propuesta.task_name ?? propuesta.titulo}</span>
              : (
                <a
                  href={`/proyectos/${proyectoId}?tab=tareas&${PARAMETRO_TAREA}=${propuesta.task_id}`}
                  className="text-acento hover:underline"
                >
                  {propuesta.task_name ?? propuesta.titulo}
                </a>
                )}
          </li>
        ))}
      </ul>
    </div>
  )
}

/**
 * La propuesta entera, para corregir lo que el modelo no pudo resolver.
 *
 * Son los mismos controles del alta de un Proceso —`SelectorPersonas` para los responsables, el
 * campo de fecha nativo para la entrega, el `Selector` para la prioridad—: lo que se está editando
 * termina siendo una Tarea, y dos formas distintas de elegir un responsable en el mismo producto es
 * lo que hace que una de las dos ofrezca una lista que la otra no.
 *
 * Solo se manda lo que cambió: la API deja el resto como estaba, y un `PATCH` completo pisaría con
 * lo que esta pantalla vio hace un minuto algo que otra persona pudo haber corregido mientras tanto.
 */
function DialogoDePropuesta ({ propuesta, personas, errorEquipo, prioridades, onGuardar, onCerrar }: {
  propuesta: PropuestaDeTarea
  personas: StaffReferencia[]
  errorEquipo: string | null
  prioridades: EstadoLookup[]
  onGuardar: (parche: ParcheDePropuesta) => Promise<boolean>
  onCerrar: () => void
}): ReactElement {
  const [titulo, setTitulo] = useState(propuesta.titulo)
  const [descripcion, setDescripcion] = useState(propuesta.descripcion ?? '')
  const [vence, setVence] = useState(propuesta.vence ?? '')
  const [prioridad, setPrioridad] = useState(String(propuesta.prioridad))
  const [asignados, setAsignados] = useState(propuesta.asignados.map((persona) => persona.id))
  const [guardando, setGuardando] = useState(false)

  const limpio = titulo.trim()
  /** Un título vacío no se puede guardar: es lo único de la propuesta que la API exige. */
  const errorTitulo = limpio === '' ? 'La tarea necesita un título.' : undefined

  /** Arma el parche con lo que de verdad cambió y cierra solo si la API lo aceptó. */
  async function guardar (): Promise<void> {
    if (errorTitulo !== undefined) return

    const mismosAsignados =
      asignados.length === propuesta.asignados.length &&
      propuesta.asignados.every((persona) => asignados.includes(persona.id))
    const parche: ParcheDePropuesta = {
      ...(limpio === propuesta.titulo ? {} : { titulo: limpio }),
      ...(descripcion === (propuesta.descripcion ?? '') ? {} : { descripcion: descripcion === '' ? null : descripcion }),
      ...(vence === (propuesta.vence ?? '') ? {} : { vence: vence === '' ? null : vence }),
      ...(prioridad === String(propuesta.prioridad) ? {} : { prioridad: Number(prioridad) }),
      ...(mismosAsignados ? {} : { asignados })
    }

    if (Object.keys(parche).length === 0) {
      onCerrar()

      return
    }

    setGuardando(true)
    const guardado = await onGuardar(parche)
    setGuardando(false)

    if (guardado) onCerrar()
  }

  return (
    <Dialogo open onOpenChange={(abierto) => { if (!abierto && !guardando) onCerrar() }}>
      <ContenidoDialogo
        titulo="Editar la tarea propuesta"
        descripcion="Se guarda sobre la propuesta. La Tarea se crea después, con «Crear tarea»."
        cerrable
      >
        <div className="flex flex-col gap-4">
          <Campo etiqueta="Título" requerido error={errorTitulo}>
            {(props) => (
              <Entrada
                {...props}
                value={titulo}
                maxLength={600}
                onChange={(evento) => { setTitulo(evento.target.value) }}
              />
            )}
          </Campo>

          <Campo etiqueta="Descripción" ayuda="Lo que haga falta para que se entienda sin volver al acta.">
            {(props) => (
              <AreaTexto
                {...props}
                value={descripcion}
                onChange={(evento) => { setDescripcion(evento.target.value) }}
              />
            )}
          </Campo>

          <div className="grid gap-4 sm:grid-cols-2">
            <Campo etiqueta="Entrega">
              {(props) => (
                <Entrada
                  {...props}
                  type="date"
                  value={vence}
                  onChange={(evento) => { setVence(evento.target.value) }}
                />
              )}
            </Campo>

            <Campo etiqueta="Prioridad">
              {({ id }) => (
                <Selector value={prioridad} onValueChange={setPrioridad}>
                  <DisparadorSelector id={id} marcador="Elegir prioridad" />
                  <ContenidoSelector>
                    {prioridades.map((opcion) => (
                      <Opcion key={opcion.id} value={String(opcion.id)}>{opcion.name}</Opcion>
                    ))}
                  </ContenidoSelector>
                </Selector>
              )}
            </Campo>
          </div>

          <Campo
            etiqueta="Responsables"
            error={errorEquipo ?? undefined}
            ayuda="Quien el acta nombró y el modelo no pudo resolver llega vacío."
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

          <div className="flex justify-end gap-2">
            <Boton variante="sutil" disabled={guardando} onClick={onCerrar}>Cancelar</Boton>
            <Boton
              variante="primario"
              cargando={guardando}
              disabled={errorTitulo !== undefined}
              onClick={() => { void guardar() }}
            >
              Guardar
            </Boton>
          </div>
        </div>
      </ContenidoDialogo>
    </Dialogo>
  )
}
