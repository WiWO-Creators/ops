'use client'

import { ArrowLeft, ArrowRight, GripVertical, MoreHorizontal } from 'lucide-react'
import { useCallback, useRef, useState, type ReactNode } from 'react'
import { Boton } from '@/componentes/formularios/Boton'
import { Vacio } from '@/componentes/estado/Estados'
import {
  ContenidoMenu,
  DisparadorMenu,
  ItemMenu,
  MenuContextual
} from '@/componentes/superposiciones/MenuContextual'
import { useDesplazamientoTablero } from './useDesplazamientoTablero'
import { cn } from '@/lib/clases'
import { MENSAJE_SESION_CERRADA } from '@/componentes/proyecto/carga'
import {
  agregarPagina,
  columnaIncompleta,
  moverTarjeta,
  moverColumna,
  ordenarGrupos,
  posicionAlSoltar,
  sacarTarjeta,
  type ColumnaTablero,
  type CuerpoMover,
  type FilaConId,
  type GrupoTablero
} from './tablero'
import type { DefinicionRecurso } from '@/definiciones/tipos'
import type { Sobre } from '@/datos/tipos'

interface PropsTablero<T extends FilaConId> {
  definicion: DefinicionRecurso<T>
  /** Los grupos tal como los devolvio `GET /<recurso>?vista=tablero`. */
  inicial: Array<GrupoTablero<T>>
  /**
   * Filtros ya serializados que definen el tablero, sin `?` ni `vista`. Ej: `filter[project_id]=8`.
   * Viajan en cada recarga y en cada "cargar mas": sin ellos, la pagina siguiente vendria de otro
   * tablero.
   */
  consulta?: string
  // frente: detalle — dos ganchos opcionales para el kanban de Hitos. Sin ellos el motor se comporta
  // exactamente igual que antes.
  /**
   * Traduce el cuerpo de `mover` antes de enviarlo. El tablero de Hitos usa `POST
   * /tasks/{id}/mover-hito`, que nombra `hito` a lo que el de estados llama `columna`.
   */
  adaptarCuerpo?: (cuerpo: CuerpoMover) => unknown
  /**
   * Ordena y poda las columnas. Por defecto solo ordena por `columna.order`; el kanban de Hitos
   * necesita ademas dejar "Sin categorizar" siempre primera y omitirla cuando queda vacia.
   */
  ordenarColumnas?: (grupos: Array<GrupoTablero<T>>) => Array<GrupoTablero<T>>
  /**
   * Accion propia en la cabecera de una columna. El kanban de Hitos pinta ahi el "+" que agrega una
   * tarea al hito.
   *
   * Recibe `recargar` porque despues de escribir hay que refrescar el tablero **por el mismo camino
   * que usa el arrastre**: quien monta la accion no tiene forma de llegar a el desde afuera, y un
   * segundo camino de recarga terminaria mostrando algo distinto a lo que deja mover una tarjeta.
   *
   * Devolver `null` deja la columna sin accion, que es lo que hace la sintetica "Sin categorizar".
   */
  accionDeColumna?: (columna: ColumnaTablero, recargar: () => Promise<void>) => ReactNode
  /**
   * Accion propia al pie de cada tarjeta, en la misma fila que "Mover a…".
   *
   * El kanban de Hitos pinta ahi el "Duplicar…" de una tarea. Va como gancho y no dentro del motor
   * porque duplicar es propio de las Tareas: el tablero de Espacios usa el mismo motor y no tiene
   * nada que duplicar.
   *
   * Recibe `recargar` por lo mismo que `accionDeColumna`: despues de crear la copia el tablero tiene
   * que refrescarse **por el mismo camino que usa el arrastre**, o la tarjeta nueva aparece recien
   * cuando algo mas lo obligue a recargar.
   */
  accionDeTarjeta?: (tarjeta: T, recargar: () => Promise<void>) => ReactNode
  /** Ruta que habilita guardar el orden de columnas con id positivo. */
  rutaOrdenColumnas?: string
  /**
   * Todos los destinos a los que se puede mover una tarjeta, tenga columna o no.
   *
   * El menu "Mover a…" ofrecia solo las columnas del tablero, y el tablero de Procesos no pinta
   * "Completado" —muestra el trabajo abierto—: no habia forma de completar una tarea desde el
   * kanban. Con esto el menu ofrece el catalogo entero y la tarjeta desaparece al mandarla a un
   * estado sin columna, que es lo que se espera al completarla.
   *
   * Sin el prop el menu se comporta como antes: solo las columnas cargadas.
   */
  destinos?: ColumnaTablero[]
}

/**
 * Motor de tablero (kanban) para cualquier recurso que declare `tablero` en su definicion.
 *
 * El arrastre usa la API nativa de HTML: `draggable` + `dragover` + `drop`. No hay libreria de
 * drag and drop, y por eso cada tarjeta lleva ademas un menu "Mover a…" en un `<button>` real —
 * el arrastre con mouse no puede ser la unica via.
 */
export function Tablero<T extends FilaConId> ({
  definicion,
  inicial,
  consulta = '',
  // frente: detalle — por defecto, el comportamiento historico.
  adaptarCuerpo = (cuerpo) => cuerpo,
  ordenarColumnas = ordenarGrupos,
  accionDeColumna,
  accionDeTarjeta,
  rutaOrdenColumnas,
  destinos
}: PropsTablero<T>) {
  const tablero = definicion.tablero
  const [grupos, setGrupos] = useState(() => ordenarColumnas(inicial))
  const guardandoOrden = useRef(false)
  const [columnaArrastrada, setColumnaArrastrada] = useState<number | null>(null)
  const [destinoColumna, setDestinoColumna] = useState<number | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const [arrastrada, setArrastrada] = useState<number | null>(null)
  const { contenedor, limites, desplazar } = useDesplazamientoTablero(arrastrada !== null || columnaArrastrada !== null, grupos.length)

  /** Arma la URL del tablero en el BFF para una pagina dada. La pagina aplica a cada columna. */
  const urlTablero = useCallback(
    (pagina: number) => {
      const partes = ['vista=tablero', `page=${pagina}`]
      if (consulta !== '') partes.push(consulta)
      return `/api/bff/${definicion.ruta}?${partes.join('&')}`
    },
    [definicion.ruta, consulta]
  )

  /**
   * Vuelve a pedir el tablero entero.
   *
   * Mover son dos operaciones del lado del servidor —el cambio de estado con su cascada y despues
   * el reordenamiento de la columna completa—, asi que despues de mover hay que refrescar mas que
   * la tarjeta tocada: un cronometro cerrado o una fecha de fin sellada aparecen en otras tarjetas.
   *
   * Una recarga que falla **se dice**. Antes hacia `if (!respuesta.ok) return` y dejaba el tablero
   * congelado en la version anterior sin una sola señal: si la que fallaba era la recarga de despues
   * de mover, la tarjeta se veia en su columna nueva mientras el resto del tablero seguia siendo el
   * de antes, y eso es exactamente lo que el equipo reporta como "se desincronizan". El `401` lleva
   * su propia frase porque no es un fallo del tablero sino de la sesion, y no hay reintento que lo
   * arregle.
   */
  const recargar = useCallback(async () => {
    try {
      const respuesta = await fetch(urlTablero(1), { headers: { accept: 'application/json' } })

      if (!respuesta.ok) {
        setAviso(await mensajeDeError(respuesta))
        return
      }

      const sobre = await respuesta.json() as Sobre<Array<GrupoTablero<T>>>
      setGrupos(ordenarColumnas(sobre.data))
      setAviso(null)
    } catch {
      setAviso('No se pudo actualizar el tablero: revisa la conexión. Lo que ves puede estar desactualizado.')
    }
  }, [urlTablero, ordenarColumnas])

  if (tablero === undefined) {
    return <Vacio titulo={`${definicion.titulo.plural} no tiene vista de tablero`} />
  }

  // Las columnas del tablero primero —en su orden— y después los destinos que no tienen columna,
  // que van al final por lo mismo que "Completado" no es una columna: no son parte del flujo que el
  // tablero pinta. `cuantas` es la posición donde cae la tarjeta; para un destino sin columna la
  // decide `sacarTarjeta()` y el valor no se usa.
  // Sin ruta de mover el tablero es de solo lectura: ni arrastre ni menu. Ver `DefinicionTablero`.
  const puedeMover = tablero.rutaMover !== undefined
  const idsEnPantalla = new Set(grupos.map((grupo) => grupo.columna.id))
  const destinosDelMenu = [
    ...grupos.map((grupo) => ({ columna: grupo.columna, cuantas: grupo.tarjetas.length })),
    ...(destinos ?? [])
      .filter((columna) => !idsEnPantalla.has(columna.id))
      .map((columna) => ({ columna, cuantas: 0 }))
  ]

  /**
   * Mueve una tarjeta en pantalla y confirma con la API.
   *
   * El movimiento es optimista: se pinta primero y se revierte si el `POST` falla. Un `409` es un
   * caso real y esperado (la columna no existe, el proceso esta facturado), no un bug.
   */
  async function mover (idTarjeta: number, idColumna: number, posicion: number): Promise<void> {
    if (tablero?.rutaMover === undefined || ocupado || guardandoOrden.current) return

    const previo = grupos
    // Un destino sin columna en pantalla —"Completado" en el tablero de Procesos— se saca del
    // tablero en vez de reubicarse: no hay dónde ponerlo, y la tarjeta tiene que irse igual.
    const enPantalla = previo.some((grupo) => grupo.columna.id === idColumna)
    const movimiento = enPantalla
      ? moverTarjeta(previo, idTarjeta, idColumna, posicion)
      : sacarTarjeta(previo, idTarjeta, idColumna)
    if (movimiento === null) return

    setGrupos(movimiento.grupos)
    setAviso(null)
    setOcupado(true)

    try {
      const respuesta = await fetch(`/api/bff/${tablero.rutaMover.replace(':id', String(idTarjeta))}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify(adaptarCuerpo(movimiento.cuerpo))
      })

      if (!respuesta.ok) {
        setGrupos(previo)
        setAviso(await mensajeDeError(respuesta))
        return
      }

      await recargar()
    } catch {
      setGrupos(previo)
      setAviso('No se pudo mover: revisa la conexión.')
    } finally {
      setOcupado(false)
    }
  }

  /**
   * Guarda el orden de columnas y revierte la vista si falla la petición.
   * @param origen id de la columna movida
   * @param destino id de la columna cuya posición ocupará
   * @returns promesa resuelta al finalizar; los errores se muestran en el tablero
   */
  async function reordenar (origen: number, destino: number): Promise<void> {
    if (rutaOrdenColumnas === undefined || ocupado || guardandoOrden.current) return
    const siguientes = moverColumna(grupos, origen, destino)
    if (siguientes === null) return
    const previo = grupos
    guardandoOrden.current = true
    setOcupado(true)
    setAviso(null)
    setGrupos(siguientes)
    try {
      const respuesta = await fetch(`/api/bff/${rutaOrdenColumnas}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({ orden: siguientes.map((g) => g.columna.id).filter((id) => id > 0) })
      })
      if (!respuesta.ok) {
        setGrupos(previo)
        setAviso(await mensajeDeError(respuesta))
      }
    } catch {
      setGrupos(previo)
      setAviso('No se pudo guardar el orden: revisa la conexión e inténtalo de nuevo.')
    } finally {
      guardandoOrden.current = false
      setOcupado(false)
    }
  }

  /** Trae la pagina siguiente de UNA columna y la agrega al final. */
  async function cargarMas (idColumna: number): Promise<void> {
    if (ocupado || guardandoOrden.current) return
    const grupo = grupos.find((g) => g.columna.id === idColumna)
    if (grupo === undefined) return

    setOcupado(true)
    try {
      // El endpoint del tablero no acepta paginar una sola columna: `page` aplica a todas por igual,
      // asi que se pide la pagina y se conserva solo el grupo que la pidio. Es una peticion de mas a
      // cambio de no meter en la definicion un campo de filtro por columna que hoy no existe.
      const respuesta = await fetch(urlTablero(grupo.pagination.page + 1), {
        headers: { accept: 'application/json' }
      })

      if (!respuesta.ok) {
        setAviso(await mensajeDeError(respuesta))
        return
      }

      const sobre = await respuesta.json() as Sobre<Array<GrupoTablero<T>>>
      const traido = sobre.data.find((g) => g.columna.id === idColumna)
      if (traido === undefined) return

      setGrupos((actuales) => agregarPagina(actuales, idColumna, traido.tarjetas, traido.pagination))
    } catch {
      setAviso('No se pudieron traer más tarjetas: revisa la conexión.')
    } finally {
      setOcupado(false)
    }
  }

  /**
   * Resuelve un `drop`: valida la columna destino y dispara el movimiento.
   *
   * @param posicion indice de la tarjeta sobre la que se solto, o el largo de la columna al soltar
   *   en el fondo
   * @param sobreTarjeta si se solto encima de otra tarjeta, para ajustar el indice al reordenar
   */
  function alSoltar (
    evento: React.DragEvent,
    grupo: GrupoTablero<T>,
    posicion: number,
    sobreTarjeta = false
  ): void {
    evento.preventDefault()
    if (columnaArrastrada !== null) {
      void reordenar(columnaArrastrada, grupo.columna.id)
      setColumnaArrastrada(null)
      setDestinoColumna(null)
      return
    }
    if (evento.dataTransfer.types.includes('application/x-columna-tablero')) return
    setArrastrada(null)

    const idTarjeta = Number(evento.dataTransfer.getData('text/plain'))
    if (!Number.isFinite(idTarjeta) || idTarjeta === 0) return

    const destino = sobreTarjeta ? posicionAlSoltar(grupo, posicion, idTarjeta) : posicion
    void mover(idTarjeta, grupo.columna.id, destino)
  }

  return (
    <div className="flex min-w-0 max-w-full flex-col gap-3" aria-busy={ocupado}>
      {aviso !== null && (
        <p
          role="alert"
          className="border-linea bg-superficie-peligro text-texto-peligro rounded-tarjeta border px-3 py-2 text-sm"
        >
          {aviso}
        </p>
      )}

      <p role="status" className="sr-only">{ocupado ? 'Guardando cambios…' : ''}</p>
      {(limites.izquierda || limites.derecha) && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-texto-sutil text-xs">{puedeMover ? 'Arrastra hacia los bordes o usa «Mover a…» para elegir cualquier columna.' : 'Desplázate para ver las demás columnas.'}</p>
          <div className="flex shrink-0 gap-1">
            <Boton variante="secundario" tamano="chico" soloIcono className="min-h-11 min-w-11" aria-label="Ver columnas a la izquierda" disabled={!limites.izquierda} onClick={() => desplazar(-1)}>
              <ArrowLeft className="size-4" aria-hidden="true" />
            </Boton>
            <Boton variante="secundario" tamano="chico" soloIcono className="min-h-11 min-w-11" aria-label="Ver columnas a la derecha" disabled={!limites.derecha} onClick={() => desplazar(1)}>
              <ArrowRight className="size-4" aria-hidden="true" />
            </Boton>
          </div>
        </div>
      )}
      <div
        ref={contenedor}
        role="region"
        aria-label="Columnas del tablero"
        tabIndex={0}
        onKeyDown={(evento) => {
          if (evento.target !== evento.currentTarget || !['ArrowLeft', 'ArrowRight'].includes(evento.key)) return
          evento.preventDefault()
          desplazar(evento.key === 'ArrowLeft' ? -1 : 1)
        }}
        className="focus-visible:outline-acento flex min-w-0 max-w-full items-start gap-3 overflow-x-auto overscroll-x-contain pb-2 focus-visible:outline-2 focus-visible:outline-offset-2"
      >
        {grupos.map((grupo, indiceGrupo) => (
          <section
            key={grupo.columna.id}
            aria-label={grupo.columna.name}
            className={cn(
              'bg-superficie-hundida rounded-tarjeta border-linea flex w-72 max-w-full shrink-0 flex-col gap-2 border p-2',
              columnaArrastrada === grupo.columna.id && 'opacity-50',
              destinoColumna === grupo.columna.id && 'outline-acento outline-2'
            )}
            onDragOver={(evento) => {
              // Sin `preventDefault` el navegador no considera la zona valida y nunca dispara `drop`.
              evento.preventDefault()
              if (columnaArrastrada !== null && grupo.columna.id > 0) setDestinoColumna(grupo.columna.id)
            }}
            onDrop={(evento) => alSoltar(evento, grupo, grupo.tarjetas.length)}
          >
            <header className="flex items-center gap-2 px-1">
              {rutaOrdenColumnas !== undefined && grupo.columna.id > 0 && (
                <>
                  <Boton
                    variante="sutil"
                    tamano="chico"
                    soloIcono
                    disabled={ocupado}
                    draggable={!ocupado}
                    aria-label={`Reordenar ${grupo.columna.name}`}
                    title="Arrastra para reordenar"
                    className="shrink-0 cursor-grab active:cursor-grabbing"
                    onKeyDown={(evento) => {
                      if (evento.key !== 'ArrowLeft' && evento.key !== 'ArrowRight') return
                      evento.preventDefault()
                      const vecino = grupos[indiceGrupo + (evento.key === 'ArrowLeft' ? -1 : 1)]
                      if (vecino) void reordenar(grupo.columna.id, vecino.columna.id)
                    }}
                    onDragStart={(evento) => {
                      evento.stopPropagation()
                      evento.dataTransfer.setData('application/x-columna-tablero', String(grupo.columna.id))
                      evento.dataTransfer.effectAllowed = 'move'
                      setColumnaArrastrada(grupo.columna.id)
                    }}
                    onDragEnd={() => {
                      setColumnaArrastrada(null)
                      setDestinoColumna(null)
                    }}
                  >
                    <GripVertical className="size-4" aria-hidden="true" />
                  </Boton>
                  <MenuContextual>
                    <DisparadorMenu asChild>
                      <Boton variante="sutil" tamano="chico" soloIcono disabled={ocupado} aria-label={`Opciones de orden de ${grupo.columna.name}`}>
                        <MoreHorizontal className="size-4" aria-hidden="true" />
                      </Boton>
                    </DisparadorMenu>
                    <ContenidoMenu align="start">
                      <ItemMenu
                        disabled={ocupado || (grupos[indiceGrupo - 1]?.columna.id ?? 0) <= 0}
                        onSelect={() => { void reordenar(grupo.columna.id, (grupos[indiceGrupo - 1]?.columna.id ?? 0)) }}
                      >
                        Mover a la izquierda
                      </ItemMenu>
                      <ItemMenu
                        disabled={ocupado || indiceGrupo === grupos.length - 1}
                        onSelect={() => { void reordenar(grupo.columna.id, (grupos[indiceGrupo + 1]?.columna.id ?? 0)) }}
                      >
                        Mover a la derecha
                      </ItemMenu>
                    </ContenidoMenu>
                  </MenuContextual>
                </>
              )}
              {grupo.columna.color !== null && (
                <span
                  aria-hidden="true"
                  className="size-2.5 shrink-0 rounded-full"
                  // El color lo elige quien administra los estados en el panel: es un dato, no un
                  // token del sistema, y por eso va en `style` y no en una clase.
                  style={{ backgroundColor: grupo.columna.color }}
                />
              )}
              <h3 className="text-texto truncate text-sm font-semibold">{grupo.columna.name}</h3>
              <span className="text-texto-tenue ml-auto text-xs tabular-nums">
                {grupo.pagination.total}
              </span>
              {accionDeColumna?.(grupo.columna, recargar)}
            </header>

            {grupo.tarjetas.length === 0 && (
              <p className="text-texto-sutil px-1 py-6 text-center text-xs">Sin tarjetas</p>
            )}

            {grupo.tarjetas.map((tarjeta, indice) => (
              <article
                key={tarjeta.id}
                draggable={puedeMover && !ocupado}
                onDragStart={(evento) => {
                  evento.dataTransfer.setData('text/plain', String(tarjeta.id))
                  evento.dataTransfer.effectAllowed = 'move'
                  setArrastrada(tarjeta.id)
                }}
                onDragEnd={() => setArrastrada(null)}
                onDragOver={(evento) => evento.preventDefault()}
                onDrop={(evento) => {
                  evento.stopPropagation()
                  alSoltar(evento, grupo, indice, true)
                }}
                className={cn(
                  'border-linea bg-superficie-elevada rounded-tarjeta flex flex-col gap-1.5 border p-2',
                  'transition-opacity duration-150',
                  arrastrada === tarjeta.id && 'opacity-50'
                )}
              >
                {tablero.presentarTarjeta(tarjeta)}

                {/* Las acciones de la tarjeta en una sola fila: "Mover a…" y lo que monte quien use
                    el motor. Envuelve en vez de apilarse para que dos botones cortos no se coman dos
                    renglones de una tarjeta que ya es angosta. */}
                <div className="flex flex-wrap items-center gap-1">
                  {puedeMover && (
                  <MenuContextual>
                    <DisparadorMenu asChild>
                      <Boton variante="sutil" tamano="chico" className="pointer-coarse:min-h-11" disabled={ocupado}>
                        Mover a…
                      </Boton>
                    </DisparadorMenu>
                    <ContenidoMenu align="start" className="max-w-[calc(100vw-1rem)]">
                      {destinosDelMenu.map((destino) => (
                        <ItemMenu
                          key={destino.columna.id}
                          className="pointer-coarse:min-h-11 break-words"
                          disabled={destino.columna.id === grupo.columna.id}
                          onSelect={() => {
                            void mover(tarjeta.id, destino.columna.id, destino.cuantas)
                          }}
                        >
                          {destino.columna.name}
                        </ItemMenu>
                      ))}
                    </ContenidoMenu>
                  </MenuContextual>
                  )}

                  {accionDeTarjeta?.(tarjeta, recargar)}
                </div>
              </article>
            ))}

            {columnaIncompleta(grupo) && (
              <Boton
                variante="secundario"
                tamano="chico"
                cargando={ocupado}
                onClick={() => { void cargarMas(grupo.columna.id) }}
              >
                Cargar más ({grupo.pagination.total - grupo.tarjetas.length})
              </Boton>
            )}
          </section>
        ))}
      </div>
    </div>
  )
}

/**
 * Saca un mensaje legible de una respuesta con error.
 *
 * Prefiere el `message` del contrato; ante un cuerpo que no es JSON (un 502 del proxy) devuelve un
 * texto propio en vez de dejar que reviente el `json()`.
 *
 * El `401` se atiende antes que nada y con la frase del sistema: el BFF lo devuelve tanto cuando la
 * cookie ya no esta como cuando la API cerro todas las sesiones, y su `message` —«La sesion se
 * cerro»— no dice lo unico que hay que hacer, que es volver a entrar. Se decide aca y no en cada
 * llamada para que mover, reordenar, paginar y recargar digan todos lo mismo.
 */
async function mensajeDeError (respuesta: Response): Promise<string> {
  if (respuesta.status === 401) return MENSAJE_SESION_CERRADA

  try {
    const cuerpo = await respuesta.json() as { error?: { message?: string } }
    if (typeof cuerpo.error?.message === 'string') return cuerpo.error.message
  } catch {
    // Cuerpo no JSON: se cae al mensaje generico de abajo.
  }
  return `No se pudo completar la operación (${respuesta.status}).`
}
