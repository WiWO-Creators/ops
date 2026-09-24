'use client'

import { ArrowLeft, MessagesSquare, Search, SquareArrowOutUpRight } from 'lucide-react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useEffect, useState, type ReactElement } from 'react'
import { idDeParametro, PARAMETRO_TAREA, urlConParametro } from '@/componentes/datos/tabla'
import { Cargando, ErrorEstado, Vacio } from '@/componentes/estado/Estados'
import { Boton } from '@/componentes/formularios/Boton'
import { Entrada } from '@/componentes/formularios/Entrada'
import { GrupoAvatares } from '@/componentes/presentadores/Avatar'
import { Insignia } from '@/componentes/presentadores/Insignia'
import type { Capacidad, Meta } from '@/datos/tipos'
import type { FuenteDeProyecto } from '@/dominio/fuente-proyecto'
import { GLOSARIO } from '@/dominio/glosario'
import { cn } from '@/lib/clases'
import { formatearRelativo } from '@/lib/fechas'
import { useRecurso } from './carga'
import { autorBreve, extractoDeComentario, type ConversacionDeProyecto } from './discusiones'
import { HiloDeComentarios } from './HiloDeComentarios'
import { ModalTarea } from './ModalTarea'
import { ESTADO_COMPLETO } from './tareas'

/**
 * Pestaña Discusiones de un Proyecto: las conversaciones de sus Tareas, en una bandeja.
 *
 * A la izquierda, una conversacion por Tarea con comentarios, la mas reciente arriba; a la derecha,
 * el hilo elegido con su cuadro para responder. Es el mismo hilo que tiene la ficha de la Tarea
 * (`HiloDeComentarios`): responder aca comenta en la Tarea, y comentar en la Tarea sube la
 * conversacion al primer lugar de esta lista.
 *
 * **La conversacion abierta vive en la URL** (`?conversacion={id}`), igual que la pestaña y la
 * Tarea: el enlace se comparte y recargar no la pierde. Sin parametro, en pantalla ancha se abre la
 * primera; en el telefono la lista ocupa todo y elegir una la reemplaza, con un "Volver".
 *
 * "Abrir tarea" escribe `?tarea=` y monta el mismo `ModalTarea` que el resto del Proyecto.
 */

/** Parametro de la URL con la Tarea cuya conversacion esta abierta. */
const PARAMETRO_CONVERSACION = 'conversacion'
const POR_PAGINA = 30
/** Espera antes de buscar: una peticion por palabra, no una por tecla. */
const ESPERA_BUSQUEDA_MS = 300

interface PropsPanelDiscusiones {
  proyectoId: number
  /** Fuente del Proyecto, para el modal de la Tarea. */
  fuente: FuenteDeProyecto
  /** Capacidades sobre `tasks`, para lo que el modal de la Tarea deja hacer. */
  capacidadesTareas: Capacidad[]
}

export function PanelDiscusiones ({ proyectoId, fuente, capacidadesTareas }: PropsPanelDiscusiones): ReactElement {
  const router = useRouter()
  const params = useSearchParams()

  const [pagina, setPagina] = useState(1)
  const [escrito, setEscrito] = useState('')
  const [busqueda, setBusqueda] = useState('')
  /** La conversacion se eligio con un clic: el hilo toma el foco para responder. */
  const [elegidaAMano, setElegidaAMano] = useState(false)

  useEffect(() => {
    const espera = setTimeout(() => {
      setBusqueda(escrito.trim())
      setPagina(1)
    }, ESPERA_BUSQUEDA_MS)

    return () => { clearTimeout(espera) }
  }, [escrito])

  const consulta = new URLSearchParams({ page: String(pagina), per_page: String(POR_PAGINA) })
  if (busqueda !== '') consulta.set('q', busqueda)

  const { estado, recargar } = useRecurso<ConversacionDeProyecto[]>(
    `projects/${encodeURIComponent(String(proyectoId))}/discussions?${consulta.toString()}`,
    'No se pudieron cargar las discusiones.'
  )

  // La ultima lista que llego se sigue mostrando mientras se pide la siguiente (al responder, al
  // buscar, al volver a la pestaña). Sin eso la lista y el hilo abierto se desmontan en cada recarga:
  // el cuadro pierde el foco y la pantalla parpadea justo despues de escribir.
  const [ultima, setUltima] = useState<{ datos: ConversacionDeProyecto[], meta: Meta | undefined } | null>(null)
  if (estado.fase === 'listo' && estado.datos !== ultima?.datos) setUltima({ datos: estado.datos, meta: estado.meta })

  const ultimaLista = ultima?.datos ?? null
  const conversaciones = estado.fase === 'listo' ? estado.datos : (ultimaLista ?? [])
  const recargando = estado.fase === 'cargando' && ultimaLista !== null
  const paginacion = (estado.fase === 'listo' ? estado.meta : ultima?.meta)?.pagination
  const elegida = idDeParametro(params.get(PARAMETRO_CONVERSACION))
  // Sin eleccion, la pantalla ancha abre la primera: una bandeja con el hilo vacio no dice nada.
  const abierta = elegida ?? conversaciones[0]?.task.id ?? null
  const resumenAbierta = conversaciones.find((c) => c.task.id === abierta)

  /**
   * Abre una conversacion escribiendola en la URL.
   *
   * @param tareaId la Tarea de la conversacion, o `null` para volver a la lista
   */
  function abrir (tareaId: number | null): void {
    const siguientes = new URLSearchParams(params.toString())

    if (tareaId === null) siguientes.delete(PARAMETRO_CONVERSACION)
    else siguientes.set(PARAMETRO_CONVERSACION, String(tareaId))

    setElegidaAMano(tareaId !== null)
    router.replace(`?${siguientes.toString()}`, { scroll: false })
  }

  const sinNada = estado.fase === 'listo' && busqueda === '' && escrito === '' && conversaciones.length === 0

  if (sinNada) {
    return (
      <Vacio
        titulo="Todavía no hay discusiones"
        descripcion={`Cuando alguien comente una ${GLOSARIO.proceso.singular.toLowerCase()} de este proyecto, la conversación aparece aquí y se puede responder sin salir de la pestaña.`}
        accion={
          <Link
            href={urlConParametro(new URLSearchParams(params.toString()), 'tab', 'tareas')}
            className="text-acento text-sm font-semibold underline underline-offset-4"
          >
            Ir a {GLOSARIO.proceso.plural}
          </Link>
        }
      />
    )
  }

  return (
    <>
      <div
        className={cn(
          'border-linea bg-superficie-elevada rounded-tarjeta shadow-1 grid overflow-hidden border',
          'lg:min-h-[32rem] lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)]'
        )}
      >
        {/* La lista. En el telefono se esconde cuando hay una conversacion elegida. */}
        <nav
          aria-label="Conversaciones"
          className={cn('border-linea flex min-w-0 flex-col lg:border-r', elegida !== null && 'max-lg:hidden')}
        >
          <div className="border-linea-suave border-b p-3">
            <label className="relative block">
              <span className="sr-only">Buscar en las discusiones</span>
              <Search aria-hidden className="text-texto-sutil pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" strokeWidth={1.75} />
              <Entrada
                type="search"
                value={escrito}
                onChange={(evento) => { setEscrito(evento.target.value) }}
                placeholder={`Buscar por ${GLOSARIO.proceso.singular.toLowerCase()} o comentario`}
                className="pl-9"
              />
            </label>
          </div>

          {estado.fase === 'cargando' && ultimaLista === null && <Cargando alto="min-h-48" mensaje="Cargando las discusiones…" />}
          {estado.fase === 'error' && <ErrorEstado detalle={estado.mensaje} onReintentar={recargar} className="m-3" />}

          {estado.fase === 'listo' && conversaciones.length === 0 && (
            <p className="text-texto-sutil px-4 py-8 text-center text-sm text-pretty">
              Nada coincide con «{busqueda}».
            </p>
          )}

          {conversaciones.length > 0 && (
            <ol
              aria-busy={recargando || undefined}
              className={cn(
                'flex max-h-[70dvh] flex-col gap-0.5 overflow-y-auto overscroll-contain p-1.5 transition-opacity duration-150',
                recargando && 'opacity-70'
              )}
              data-lenis-prevent
            >
              {conversaciones.map((conversacion) => (
                <li key={conversacion.task.id}>
                  <FilaDeConversacion
                    conversacion={conversacion}
                    activa={conversacion.task.id === abierta}
                    onAbrir={() => { abrir(conversacion.task.id) }}
                  />
                </li>
              ))}
            </ol>
          )}

          {paginacion !== undefined && paginacion.total_pages > 1 && (
            <div className="border-linea-suave text-texto-tenue mt-auto flex items-center justify-between gap-2 border-t px-3 py-2 text-xs">
              <span aria-live="polite" className="tabular-nums">
                {(paginacion.page - 1) * paginacion.per_page + 1}-{Math.min(paginacion.page * paginacion.per_page, paginacion.total)} de {paginacion.total}
              </span>
              <span className="flex gap-1">
                <Boton variante="sutil" tamano="chico" disabled={paginacion.page <= 1} onClick={() => { setPagina(paginacion.page - 1) }}>
                  Anteriores
                </Boton>
                <Boton variante="sutil" tamano="chico" disabled={paginacion.page >= paginacion.total_pages} onClick={() => { setPagina(paginacion.page + 1) }}>
                  Siguientes
                </Boton>
              </span>
            </div>
          )}
        </nav>

        {/* El hilo. En el telefono aparece solo con una conversacion elegida. */}
        <section
          aria-label="Conversación abierta"
          className={cn('flex min-w-0 flex-col', elegida === null && 'max-lg:hidden')}
        >
          {abierta === null
            ? (
              <div className="text-texto-sutil flex flex-1 flex-col items-center justify-center gap-2 p-8 text-center text-sm">
                <MessagesSquare aria-hidden className="size-6" strokeWidth={1.5} />
                Elige una conversación para leerla y responder.
              </div>
              )
            : (
              <>
                <header className="border-linea-suave flex flex-wrap items-start gap-x-3 gap-y-2 border-b p-4">
                  <Boton
                    variante="sutil"
                    tamano="chico"
                    soloIcono
                    aria-label="Volver a las conversaciones"
                    className="lg:hidden"
                    onClick={() => { abrir(null) }}
                  >
                    <ArrowLeft aria-hidden className="size-4" strokeWidth={1.75} />
                  </Boton>

                  <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <h3 className="text-texto text-base font-semibold text-balance">
                      {resumenAbierta?.task.name ?? `${GLOSARIO.proceso.singular} #${abierta}`}
                    </h3>
                    {resumenAbierta !== undefined && (
                      <p className="text-texto-tenue text-xs">
                        {cantidadDeComentarios(resumenAbierta.comments_count)}, la última {formatearRelativo(resumenAbierta.last_activity)}
                      </p>
                    )}
                  </div>

                  <Boton
                    variante="secundario"
                    tamano="chico"
                    onClick={() => { router.push(urlConParametro(new URLSearchParams(params.toString()), PARAMETRO_TAREA, String(abierta)), { scroll: false }) }}
                  >
                    <SquareArrowOutUpRight aria-hidden className="size-3.5" strokeWidth={1.75} />
                    Abrir {GLOSARIO.proceso.singular.toLowerCase()}
                  </Boton>
                </header>

                <div className="max-h-[70dvh] flex-1 overflow-y-auto overscroll-contain p-4" data-lenis-prevent>
                  <HiloDeComentarios
                    key={abierta}
                    procesoId={abierta}
                    titulo={null}
                    enfocarAlAbrir={elegidaAMano}
                    onCambiado={recargar}
                  />
                </div>
              </>
              )}
        </section>
      </div>

      <ModalTarea
        fuente={fuente}
        puedeEditar={capacidadesTareas.includes('edit')}
        puedeBorrar={capacidadesTareas.includes('delete')}
        puedeCrear={capacidadesTareas.includes('create')}
      />
    </>
  )
}

interface PropsFilaDeConversacion {
  conversacion: ConversacionDeProyecto
  activa: boolean
  onAbrir: () => void
}

/**
 * Una conversacion en la lista: la Tarea, quien dijo lo ultimo y que dijo, y quienes participan.
 */
function FilaDeConversacion ({ conversacion, activa, onAbrir }: PropsFilaDeConversacion): ReactElement {
  const ultimo = conversacion.last_comment
  const quien = ultimo === null ? null : autorBreve(ultimo)
  const extracto = ultimo === null ? '' : extractoDeComentario(ultimo.content)
  const completa = conversacion.task.status === ESTADO_COMPLETO

  return (
    <button
      type="button"
      onClick={onAbrir}
      aria-current={activa ? 'true' : undefined}
      className={cn(
        'rounded-medio relative flex w-full flex-col gap-1.5 px-3 py-2.5 text-left transition-colors duration-150',
        'hover:bg-hover focus-visible:outline-foco focus-visible:outline-2 focus-visible:-outline-offset-2',
        activa && 'bg-seleccionado hover:bg-seleccionado',
        // La barra marca la elegida sin depender solo del fondo, que en oscuro se distingue poco.
        activa && 'before:bg-acento before:absolute before:inset-y-2 before:left-0 before:w-0.5 before:rounded-full'
      )}
    >
      <span className="flex items-baseline justify-between gap-3">
        <span className={cn('text-texto min-w-0 truncate text-sm font-medium', completa && 'text-texto-tenue')}>
          {conversacion.task.name}
        </span>
        <span className="text-texto-sutil shrink-0 text-xs tabular-nums">{formatearRelativo(conversacion.last_activity)}</span>
      </span>

      {extracto !== '' && (
        <span className="text-texto-tenue line-clamp-2 text-xs leading-relaxed">
          {quien !== null && <span className="text-texto font-medium">{quien}: </span>}
          {extracto}
        </span>
      )}

      <span className="flex items-center gap-2">
        <GrupoAvatares
          personas={conversacion.participants.map((persona) => ({ id: persona.id, full_name: persona.full_name }))}
          maximo={4}
        />
        <span className="text-texto-sutil text-xs tabular-nums">{cantidadDeComentarios(conversacion.comments_count)}</span>
        {conversacion.client_comments_count > 0 && <Insignia tamano="chico" tono="acento">Cliente</Insignia>}
        {completa && <Insignia tamano="chico" tono="contorno">Completa</Insignia>}
      </span>
    </button>
  )
}

/** "1 comentario", "3 comentarios". */
function cantidadDeComentarios (cantidad: number): string {
  return `${cantidad} ${cantidad === 1 ? 'comentario' : 'comentarios'}`
}
