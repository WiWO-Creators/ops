'use client'

import { useEffect, useState, type ReactElement } from 'react'
import { Boton } from '@/componentes/formularios/Boton'
import { CargandoConOrbe } from '@/componentes/estado/Orbe'
import { Campo } from '@/componentes/formularios/Campo'
import { CLASES_CASILLA, Entrada } from '@/componentes/formularios/Entrada'
import {
  ContenidoSelector,
  DisparadorSelector,
  Opcion,
  Selector
} from '@/componentes/formularios/Selector'
import {
  CerrarDialogo,
  ContenidoDialogo,
  Dialogo
} from '@/componentes/superposiciones/Dialogo'
import {
  ContenidoMenu,
  DisparadorMenu,
  ItemMenu,
  MenuContextual
} from '@/componentes/superposiciones/MenuContextual'
import { normalizar } from '@/dominio/salas'
import { cargarAsignables } from '@/datos/asignables'
import { pedirSobre } from '@/datos/cliente'
import { leerError } from '@/datos/errores'
import type { Espacio, Hito, PersonaAsignable, Proceso, ResultadoAccionMasiva } from '@/datos/recursos'
import type { Capacidad } from '@/datos/tipos'
import type { OpcionFiltro } from '@/definiciones/tipos'
import {
  accionesMasivasPermitidas,
  valorDeAccionMasiva,
  type AccionMasivaDescrita
} from './tareas'

/**
 * Barra de acciones masivas de la tabla de tareas.
 *
 * Aparece solo con filas seleccionadas y desaparece al vaciarlas: una barra siempre visible con
 * botones que no hacen nada ocupa el lugar donde deberia estar la tabla.
 *
 * Cada accion abre un dialogo con el control que le corresponde en vez de aplicarse de una: cambiar
 * el estado de veinte tareas sin poder elegir cual es un boton que nadie va a tocar.
 *
 * **El permiso lo vuelve a decidir el backend.** Aca solo se poda lo que ya se sabe que falla, y en
 * `status` ni siquiera eso: el backend aplica fila por fila y devuelve en `meta.omitidos` las que se
 * salteo, que es lo que la barra informa al terminar.
 *
 * Recibe la forma que pide `seleccionMasiva` de `TablaRecurso` —las filas, limpiar y recargar—, asi
 * que la misma barra sirve en la vista global y en la pestaña de un Espacio, y las casillas las
 * dibuja el motor en las dos.
 */

/**
 * Un Espacio como destino de la copia masiva.
 *
 * `GET /projects` ya devuelve la patente y el Cliente en la misma fila del listado, asi que
 * mostrarlos no cuesta una peticion mas. Se pidieron porque el nombre solo no alcanza para elegir:
 * hay Espacios homonimos en Clientes distintos ("Gestion Paid Media" existe para varios), y la
 * patente es el codigo con el que se los nombra fuera de la pantalla.
 */
type ProyectoDestino = Pick<Espacio, 'id' | 'name' | 'patente' | 'client'>

/**
 * El codigo visible de un Espacio.
 *
 * Cae a `#id` cuando no hay patente, igual que el resto de la interfaz: un Espacio recien creado, o
 * una instalacion sin la tabla de patentes, no puede quedar sin identificador en una lista donde el
 * nombre se repite.
 */
function codigoDeProyecto (proyecto: ProyectoDestino): string {
  const patente = proyecto.patente ?? null
  return patente === null || patente === '' ? `#${proyecto.id}` : patente
}

/**
 * Todo el texto por el que se puede encontrar un Espacio en el buscador del dialogo.
 *
 * Incluye el codigo y el Cliente y no solo el nombre: quien copia veinte tareas a "Bodenor" escribe
 * el Cliente, no el nombre del Espacio, y quien trabaja con codigos escribe la patente.
 */
function textoBuscableDeProyecto (proyecto: ProyectoDestino): string {
  return normalizar(`${proyecto.name} ${codigoDeProyecto(proyecto)} ${proyecto.client?.company ?? ''}`)
}

/**
 * Como se nombra un destino ya elegido: codigo, nombre y Cliente en una sola linea.
 *
 * Va en una linea y no en dos como la lista de arriba porque aca cada destino comparte renglon con
 * su boton de quitar y con la marca de "Originales"/"Copias".
 *
 * @param proyectos el catalogo cargado
 * @param id        el destino elegido
 * @returns el texto, o el `#id` pelado si el catalogo todavia no lo tiene
 */
function etiquetaDeDestino (proyectos: ProyectoDestino[], id: number): string {
  const proyecto = proyectos.find((candidato) => candidato.id === id)
  if (proyecto === undefined) return `#${id}`
  const cliente = proyecto.client === null ? '' : ` · ${proyecto.client.company}`
  return `${codigoDeProyecto(proyecto)} · ${proyecto.name}${cliente}`
}

interface PropsAcciones {
  /**
   * El Espacio, cuando la barra vive dentro de uno. Sin el se poda "Mover a un hito": los hitos
   * cuelgan de un Espacio y la API no expone un listado global, el mismo motivo por el que el filtro
   * de Hito depende de elegir Espacio.
   */
  proyectoId?: number
  /** Las tareas seleccionadas en la pagina visible. */
  filas: Proceso[]
  capacidades: Capacidad[]
  estados: OpcionFiltro[]
  prioridades: OpcionFiltro[]
  limpiar: () => void
  /** Se llama cuando el backend confirmo: la tabla tiene que volver a pedir los datos. */
  recargar: () => void
}

export function AccionesMasivasTareas ({
  proyectoId,
  filas,
  capacidades,
  estados,
  prioridades,
  limpiar,
  recargar
}: PropsAcciones): ReactElement | null {
  const [accion, setAccion] = useState<AccionMasivaDescrita | null>(null)
  const [valor, setValor] = useState('')
  const [enCurso, setEnCurso] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [personal, setPersonal] = useState<PersonaAsignable[]>([])
  const [hitos, setHitos] = useState<Hito[]>([])

  const [destinos, setDestinos] = useState<number[]>([])
  const [busquedaProyecto, setBusquedaProyecto] = useState('')
  const [proyectos, setProyectos] = useState<ProyectoDestino[]>([])
  const [cargandoProyectos, setCargandoProyectos] = useState(false)
  const [errorProyectos, setErrorProyectos] = useState<string | null>(null)

  useEffect(() => {
    if (accion?.control !== 'proyecto') return
    const control = new AbortController()
    /** Carga el catálogo completo de destinos visibles, sin truncarlo en la primera página. */
    async function cargarProyectos (): Promise<void> {
      setCargandoProyectos(true)
      setErrorProyectos(null)
      setProyectos([])
      try {
        const destinos: ProyectoDestino[] = []
        let pagina = 1
        let ultima = 1
        do {
          const sobre = await pedirSobre<ProyectoDestino[]>(`projects?per_page=500&page=${pagina}`, control.signal)
          destinos.push(...sobre.data)
          ultima = sobre.meta?.pagination?.total_pages ?? 1
          pagina++
        } while (pagina <= ultima)
        if (!control.signal.aborted) setProyectos(destinos)
      } catch {
        if (!control.signal.aborted) setErrorProyectos('No se pudieron cargar los proyectos. Cierra y vuelve a abrir para reintentar.')
      } finally {
        if (!control.signal.aborted) setCargandoProyectos(false)
      }
    }
    void cargarProyectos()
    return () => { control.abort() }
  }, [accion?.control])

  const ids = filas.map((fila) => fila.id)
  const buscado = normalizar(busquedaProyecto)
  const coincidentes = proyectos.filter((proyecto) => textoBuscableDeProyecto(proyecto).includes(buscado))
  const disponibles = accionesMasivasPermitidas(capacidades)
    .filter((accion) => accion.control !== 'hito' || proyectoId !== undefined)

  if (ids.length === 0 || disponibles.length === 0) return null

  /**
   * Abre el dialogo de una accion y trae las opciones que esa accion necesita.
   *
   * Los catalogos grandes —el personal activo, los hitos del proyecto— se piden al abrir y no al
   * montar la pantalla: la mayoria de las veces nadie usa acciones masivas, y son dos peticiones que
   * no le sirven a nadie.
   */
  function abrir (elegida: AccionMasivaDescrita): void {
    setAccion(elegida)
    setValor('')
    setDestinos([])
    setBusquedaProyecto('')
    setError(null)

    if (elegida.control === 'personas' && personal.length === 0) {
      // `GET /staff/asignables` y no `GET /staff`: este exige `staff.view`, que tienen 19 de 184
      // personas, y sin el la lista llegaba vacia. Es la misma fuente que el selector de la tarea,
      // asi que las dos pantallas ofrecen exactamente la misma gente.
      void cargarAsignables()
        .then(setPersonal)
        .catch(() => setError('No se pudo traer el equipo.'))
    }

    if (elegida.control === 'hito' && proyectoId !== undefined && hitos.length === 0) {
      void pedirSobre<Hito[]>(`projects/${proyectoId}/milestones`, new AbortController().signal)
        .then((sobre) => setHitos(sobre.data))
        .catch(() => setError('No se pudieron traer los hitos.'))
    }
  }

  /** Manda la accion al backend y avisa cuantas se aplicaron y cuantas se saltearon. */
  async function aplicar (): Promise<void> {
    if (accion === null || enCurso) return

    const valorTipado = accion.control === 'proyecto' ? destinos : valorDeAccionMasiva(accion.control, valor)

    if (accion.control !== 'ninguno' && valorTipado === null) {
      setError('Elige un valor antes de aplicar.')
      return
    }

    if (accion.control === 'proyecto' && (cargandoProyectos || destinos.length === 0 || destinos.some((id) => !proyectos.some((proyecto) => proyecto.id === id)))) {
      setError('Elige un proyecto disponible antes de aplicar.')
      return
    }

    setEnCurso(true)
    setError(null)

    try {
      const respuesta = await fetch('/api/bff/tasks/bulk', {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({
          ids,
          accion: accion.clave,
          ...(valorTipado === null ? {} : { valor: valorTipado })
        })
      })

      if (!respuesta.ok) {
        setError((await leerError(respuesta)).message)
        return
      }

      const sobre = await respuesta.json() as { data: ResultadoAccionMasiva, meta?: { omitidos?: number[] } }
      const omitidos = sobre.meta?.omitidos ?? []

      setAccion(null)
      limpiar()
      recargar()

      if (omitidos.length > 0) {
        setError(`Se aplicó a ${sobre.data.aplicados}. ${omitidos.length} quedaron sin cambiar por permisos.`)
      }
    } catch {
      setError('No se pudo aplicar: revisa la conexión.')
    } finally {
      setEnCurso(false)
    }
  }

  return (
    <div
      role="group"
      aria-label="Acciones sobre las tareas seleccionadas"
      className="border-linea bg-superficie-elevada rounded-tarjeta flex flex-wrap items-center gap-2 border p-2"
    >
      <span className="text-texto text-sm font-medium tabular-nums">
        {ids.length} seleccionada{ids.length === 1 ? '' : 's'}
      </span>

      <Boton variante="sutil" tamano="chico" onClick={limpiar}>
        Limpiar
      </Boton>

      <MenuContextual>
        <DisparadorMenu asChild>
          <Boton variante="secundario" tamano="chico" className="ml-auto">
            Acción masiva
          </Boton>
        </DisparadorMenu>
        <ContenidoMenu align="end">
          {disponibles.map((disponible) => (
            <ItemMenu
              key={disponible.clave}
              peligroso={disponible.peligrosa === true}
              onSelect={() => abrir(disponible)}
            >
              {disponible.etiqueta}
            </ItemMenu>
          ))}
        </ContenidoMenu>
      </MenuContextual>

      {error !== null && (
        <p role="alert" className="text-texto-peligro w-full text-xs">{error}</p>
      )}

      <Dialogo open={accion !== null} onOpenChange={(abierto) => { if (!abierto && !enCurso) setAccion(null) }}>
        <ContenidoDialogo
          titulo={accion?.etiqueta ?? ''}
          descripcion={accion?.control === 'proyecto'
            ? `Elige uno o más proyectos para las ${ids.length} tareas seleccionadas. Cada copia tendrá su propio código.`
            : `Se aplica a ${ids.length} tarea${ids.length === 1 ? '' : 's'}.`}
        >
          <div className="flex flex-col gap-4">
            {/* Las tareas que se van a copiar, por su nombre. La cuenta sola ("1 tareas
                seleccionadas") no deja comprobar que lo seleccionado es lo que se creia: la tabla
                queda tapada por el dialogo. */}
            {accion?.control === 'proyecto' && (
              <div className="flex min-w-0 flex-col gap-1">
                <p className="text-sm font-medium">Tarea{ids.length === 1 ? '' : 's'} a copiar</p>
                <ul className="text-texto-sutil flex max-h-28 flex-col gap-1 overflow-y-auto text-sm">
                  {filas.map((fila) => (
                    <li key={fila.id} className="min-w-0 break-words">
                      <span data-numerico className="font-mono text-xs">{fila.patente ?? `#${fila.id}`}</span>
                      {' · '}{fila.name}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {accion?.control === 'proyecto' ? (
              <fieldset className="flex min-w-0 flex-col gap-2" disabled={enCurso || cargandoProyectos || errorProyectos !== null}>
                <legend className="mb-2 text-sm font-medium">Proyectos destino</legend>
                <Entrada
                  type="search"
                  aria-label="Buscar proyectos por nombre, código o cliente"
                  placeholder="Escribe el nombre, el código o el cliente…"
                  value={busquedaProyecto}
                  onChange={(evento) => setBusquedaProyecto(evento.target.value)}
                />
                {cargandoProyectos ? <p role="status" className="text-texto-sutil text-sm">Cargando proyectos…</p> : (
                  <div className="border-linea max-h-48 overflow-y-auto rounded-chico border">
                    {coincidentes.map((proyecto) => (
                      <label key={proyecto.id} className="hover:bg-superficie-hundida flex min-h-11 cursor-pointer items-center gap-3 px-3 py-2 text-sm">
                        <input
                          type="checkbox"
                          className={CLASES_CASILLA}
                          checked={destinos.includes(proyecto.id)}
                          onChange={(evento) => setDestinos((previos) => evento.target.checked
                            ? [...previos, proyecto.id]
                            : previos.filter((id) => id !== proyecto.id))}
                        />
                        <span className="flex min-w-0 flex-col">
                          <span className="min-w-0 break-words">{proyecto.name}</span>
                          {/* El codigo y el Cliente en una segunda linea tenue: son para desempatar
                              homonimos, no lo primero que se lee. */}
                          <span className="text-texto-sutil min-w-0 break-words text-xs">
                            <span data-numerico className="font-mono">{codigoDeProyecto(proyecto)}</span>
                            {proyecto.client !== null && ` · ${proyecto.client.company}`}
                          </span>
                        </span>
                      </label>
                    ))}
                    {proyectos.length > 0 && coincidentes.length === 0 && (
                      <p role="status" className="text-texto-sutil px-3 py-3 text-sm">No hay proyectos con ese nombre, código ni cliente.</p>
                    )}
                  </div>
                )}
                {destinos.length > 0 && (
                  <div className="flex flex-col gap-2 text-sm" aria-live="polite">
                    <p>{destinos.length} proyecto{destinos.length === 1 ? '' : 's'} seleccionado{destinos.length === 1 ? '' : 's'}:</p>
                    <ol className="flex max-h-28 flex-col gap-1 overflow-y-auto">
                      {destinos.map((id, indice) => (
                        <li key={id} className="flex min-w-0 items-center justify-between gap-2">
                          <span className="min-w-0 break-words">{etiquetaDeDestino(proyectos, id)} · {indice === 0 ? 'Originales' : 'Copias'}</span>
                          <Boton variante="sutil" tamano="chico" disabled={enCurso} aria-label={`Quitar ${etiquetaDeDestino(proyectos, id)}`} onClick={() => setDestinos((previos) => previos.filter((destino) => destino !== id))}>Quitar</Boton>
                        </li>
                      ))}
                    </ol>
                    <p className="text-texto-sutil">
                      Se trasladarán {ids.length} tareas al primer proyecto{destinos.length > 1 ? ` y se crearán ${ids.length * (destinos.length - 1)} copias en los demás` : ''}. Las tareas trasladadas quedarán sin el hito ni el tipo del proyecto anterior.
                    </p>
                  </div>
                )}
              </fieldset>
            ) : accion !== null && (
              <ControlDeAccion
                accion={accion}
                valor={valor}
                onValor={setValor}
                estados={estados}
                prioridades={prioridades}
                personal={personal}
                hitos={hitos}
              />
            )}

            {accion?.control === 'proyecto' && errorProyectos !== null && <p role="alert" className="text-texto-peligro text-xs">{errorProyectos}</p>}
            {accion?.control === 'proyecto' && !cargandoProyectos && errorProyectos === null && proyectos.length === 0 && <p role="status" className="text-texto-sutil text-sm">No hay proyectos disponibles.</p>}

            {error !== null && <p role="alert" className="text-texto-peligro text-xs">{error}</p>}

            <div className="flex justify-end gap-2">
              <CerrarDialogo asChild>
                <Boton variante="sutil" disabled={enCurso}>Cancelar</Boton>
              </CerrarDialogo>
              <Boton
                variante={accion?.peligrosa === true ? 'peligro' : 'primario'}
                cargando={enCurso}
                disabled={enCurso || (accion?.control === 'proyecto' && (cargandoProyectos || destinos.length === 0 || errorProyectos !== null || proyectos.length === 0))}
                onClick={() => { void aplicar() }}
              >
                {accion?.control === 'proyecto' ? 'Agregar a proyecto' : 'Aplicar'}
              </Boton>
            </div>
          </div>
        </ContenidoDialogo>
      </Dialogo>
    </div>
  )
}

interface PropsControl {
  accion: AccionMasivaDescrita
  valor: string
  onValor: (valor: string) => void
  estados: OpcionFiltro[]
  prioridades: OpcionFiltro[]
  personal: PersonaAsignable[]
  hitos: Hito[]
}

/**
 * El control con el que se elige el valor de la accion.
 *
 * Los ids elegidos viajan como una cadena separada por comas y `valorDeAccionMasiva` los tipa: asi la
 * traduccion al cuerpo del contrato queda en un `.ts` que se prueba, y no repartida por el JSX.
 */
function ControlDeAccion ({
  accion,
  valor,
  onValor,
  estados,
  prioridades,
  personal,
  hitos
}: PropsControl): ReactElement {
  if (accion.control === 'ninguno') {
    return (
      <p className="text-texto-tenue text-sm">
        Esta acción no se puede deshacer.
      </p>
    )
  }

  if (accion.control === 'etiquetas') {
    return (
      <Campo etiqueta="Etiquetas" ayuda="Separadas por coma. Se agregan a las que ya tenga la tarea.">
        {(props) => (
          <Entrada
            value={valor}
            onChange={(evento) => onValor(evento.target.value)}
            placeholder="urgente, revisión"
            {...props}
          />
        )}
      </Campo>
    )
  }

  if (accion.control === 'personas') {
    const elegidos = valor.split(',').filter((n) => n !== '')

    // Una lista de casillas no es un control: cada casilla lleva su propia etiqueta, y el grupo se
    // nombra con `fieldset`/`legend`. Por eso no usa `Campo`, que cablea UN `label` a UN control.
    return (
      <fieldset className="flex flex-col gap-1.5">
        <legend className="text-texto text-sm font-medium">Personas</legend>

        {/* Scroller vertical dentro del scroller del armazon: `data-lenis-prevent` le devuelve la
            rueda al navegador, que es lo que se espera de una lista acotada dentro de un panel. */}
        <ul data-lenis-prevent className="border-linea rounded-medio max-h-64 overflow-y-auto border">
          {personal.length === 0 && (
            <li className="p-3">
              <CargandoConOrbe mensaje="Cargando el equipo…" retardoMs={0} />
            </li>
          )}
          {personal.map((persona) => (
            <li key={persona.id} className="border-linea-suave border-b last:border-b-0">
              <label className="hover:bg-hover flex cursor-pointer items-center gap-2 px-3 py-2 text-sm">
                <input
                  type="checkbox"
                  checked={elegidos.includes(String(persona.id))}
                  onChange={() => {
                    const id = String(persona.id)
                    const siguiente = elegidos.includes(id)
                      ? elegidos.filter((n) => n !== id)
                      : [...elegidos, id]

                    onValor(siguiente.join(','))
                  }}
                />
                {persona.full_name}
              </label>
            </li>
          ))}
        </ul>

        <p className="text-texto-sutil text-xs">Se agregan a quienes ya estén asignados.</p>
      </fieldset>
    )
  }

  const opciones = accion.control === 'estado'
    ? estados
    : accion.control === 'prioridad'
      ? prioridades
      : accion.control === 'hito'
        ? hitos.map((hito) => ({ valor: String(hito.id), etiqueta: hito.name }))
        : [{ valor: 'si', etiqueta: 'Sí' }, { valor: 'no', etiqueta: 'No' }]

  return (
    <Campo etiqueta={accion.etiqueta}>
      {(props) => (
        <Selector value={valor} onValueChange={onValor}>
          <DisparadorSelector marcador="Elige una opción" id={props.id} />
          <ContenidoSelector>
            {opciones.map((opcion) => (
              <Opcion key={opcion.valor} value={opcion.valor}>{opcion.etiqueta}</Opcion>
            ))}
          </ContenidoSelector>
        </Selector>
      )}
    </Campo>
  )
}
