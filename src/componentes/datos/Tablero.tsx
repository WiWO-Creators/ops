'use client'

import { useCallback, useState } from 'react'
import { Boton } from '@/componentes/formularios/Boton'
import { Vacio } from '@/componentes/estado/Estados'
import {
  ContenidoMenu,
  DisparadorMenu,
  ItemMenu,
  MenuContextual
} from '@/componentes/superposiciones/MenuContextual'
import { cn } from '@/lib/clases'
import {
  agregarPagina,
  columnaIncompleta,
  moverTarjeta,
  ordenarGrupos,
  posicionAlSoltar,
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
  ordenarColumnas = ordenarGrupos
}: PropsTablero<T>) {
  const tablero = definicion.tablero
  const [grupos, setGrupos] = useState(() => ordenarColumnas(inicial))
  const [aviso, setAviso] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const [arrastrada, setArrastrada] = useState<number | null>(null)

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
   */
  const recargar = useCallback(async () => {
    const respuesta = await fetch(urlTablero(1), { headers: { accept: 'application/json' } })
    if (!respuesta.ok) return
    const sobre = await respuesta.json() as Sobre<Array<GrupoTablero<T>>>
    setGrupos(ordenarColumnas(sobre.data))
  }, [urlTablero, ordenarColumnas])

  if (tablero === undefined) {
    return <Vacio titulo={`${definicion.titulo.plural} no tiene vista de tablero`} />
  }

  /**
   * Mueve una tarjeta en pantalla y confirma con la API.
   *
   * El movimiento es optimista: se pinta primero y se revierte si el `POST` falla. Un `409` es un
   * caso real y esperado (la columna no existe, el proceso esta facturado), no un bug.
   */
  async function mover (idTarjeta: number, idColumna: number, posicion: number): Promise<void> {
    if (tablero === undefined) return

    const previo = grupos
    const movimiento = moverTarjeta(previo, idTarjeta, idColumna, posicion)
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
      setAviso('No se pudo mover: revisá la conexión.')
    } finally {
      setOcupado(false)
    }
  }

  /** Trae la pagina siguiente de UNA columna y la agrega al final. */
  async function cargarMas (idColumna: number): Promise<void> {
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
      setAviso('No se pudieron traer más tarjetas: revisá la conexión.')
    } finally {
      setOcupado(false)
    }
  }

  /**
   * Decide si se puede soltar en una columna.
   *
   * Una columna con paginas sin cargar no admite reordenamiento: `columna_completa` viaja con los
   * ids que tiene el cliente y el backend empuja al fondo todo lo que no le mandaron, o sea que
   * soltar ahi reescribe el orden de tarjetas que la persona nunca vio.
   */
  function admiteSoltar (grupo: GrupoTablero<T>): boolean {
    return !columnaIncompleta(grupo)
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
    setArrastrada(null)

    if (!admiteSoltar(grupo)) {
      setAviso(`"${grupo.columna.name}" tiene tarjetas sin cargar. Cargá el resto antes de reordenarla.`)
      return
    }

    const idTarjeta = Number(evento.dataTransfer.getData('text/plain'))
    if (!Number.isFinite(idTarjeta) || idTarjeta === 0) return

    const destino = sobreTarjeta ? posicionAlSoltar(grupo, posicion, idTarjeta) : posicion
    void mover(idTarjeta, grupo.columna.id, destino)
  }

  return (
    <div className="flex flex-col gap-3">
      {aviso !== null && (
        <p
          role="alert"
          className="border-linea bg-superficie-peligro text-texto-peligro rounded-tarjeta border px-3 py-2 text-sm"
        >
          {aviso}
        </p>
      )}

      <div className="flex items-start gap-3 overflow-x-auto pb-2">
        {grupos.map((grupo) => (
          <section
            key={grupo.columna.id}
            aria-label={grupo.columna.name}
            className="bg-superficie-hundida rounded-tarjeta border-linea flex w-72 shrink-0 flex-col gap-2 border p-2"
            onDragOver={(evento) => {
              // Sin `preventDefault` el navegador no considera la zona valida y nunca dispara `drop`.
              if (admiteSoltar(grupo)) evento.preventDefault()
            }}
            onDrop={(evento) => alSoltar(evento, grupo, grupo.tarjetas.length)}
          >
            <header className="flex items-center gap-2 px-1">
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
            </header>

            {grupo.tarjetas.length === 0 && (
              <p className="text-texto-sutil px-1 py-6 text-center text-xs">Sin tarjetas</p>
            )}

            {grupo.tarjetas.map((tarjeta, indice) => (
              <article
                key={tarjeta.id}
                draggable
                onDragStart={(evento) => {
                  evento.dataTransfer.setData('text/plain', String(tarjeta.id))
                  evento.dataTransfer.effectAllowed = 'move'
                  setArrastrada(tarjeta.id)
                }}
                onDragEnd={() => setArrastrada(null)}
                onDragOver={(evento) => {
                  if (admiteSoltar(grupo)) evento.preventDefault()
                }}
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

                <MenuContextual>
                  <DisparadorMenu asChild>
                    <Boton variante="sutil" tamano="chico" disabled={ocupado} className="self-start">
                      Mover a…
                    </Boton>
                  </DisparadorMenu>
                  <ContenidoMenu align="start">
                    {grupos.map((destino) => (
                      <ItemMenu
                        key={destino.columna.id}
                        disabled={destino.columna.id === grupo.columna.id || !admiteSoltar(destino)}
                        onSelect={() => {
                          void mover(tarjeta.id, destino.columna.id, destino.tarjetas.length)
                        }}
                      >
                        {admiteSoltar(destino)
                          ? destino.columna.name
                          : `${destino.columna.name} (sin cargar del todo)`}
                      </ItemMenu>
                    ))}
                  </ContenidoMenu>
                </MenuContextual>
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
 */
async function mensajeDeError (respuesta: Response): Promise<string> {
  try {
    const cuerpo = await respuesta.json() as { error?: { message?: string } }
    if (typeof cuerpo.error?.message === 'string') return cuerpo.error.message
  } catch {
    // Cuerpo no JSON: se cae al mensaje generico de abajo.
  }
  return `No se pudo completar la operación (${respuesta.status}).`
}
