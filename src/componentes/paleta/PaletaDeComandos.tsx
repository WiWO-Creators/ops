'use client'

import './paleta.css'

import * as Radix from '@radix-ui/react-dialog'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { CornerDownLeft, LoaderCircle, Search } from 'lucide-react'
import { pedirSobre } from '@/datos/cliente'
import type { Seccion } from '@/lib/navegacion'
import { URL_SOPORTE } from '@/lib/soporte'
import { cn } from '@/lib/clases'
import { useFijados } from '@/componentes/fijados/almacen'
import type { Reciente } from '@/componentes/fijados/fijados'
import { EVENTO_ABRIR_PALETA } from './abrir'
import {
  aplanar, gruposDePaleta, LARGO_MINIMO_BUSQUEDA, moverActivo, normalizar,
  type Atajo, type Comando, type ResultadosDeBusqueda
} from './comandos'
import { ICONOS_DE_COMANDO } from './iconos'

/**
 * Destinos que no son una seccion del menu pero se buscan por nombre.
 *
 * Cada uno depende de una seccion: el Tablero y el Calendario son vistas de Tareas, y sin Tareas en
 * el menu la paleta no los ofrece. Soporte, el perfil y las novedades no dependen de nada.
 */
const ATAJOS: Atajo[] = [
  { etiqueta: 'Tablero de tareas', href: '/procesos/tablero', icono: 'tablero', requiere: '/procesos', sinonimos: ['kanban'] },
  { etiqueta: 'Calendario de tareas', href: '/procesos/calendario', icono: 'calendario', requiere: '/procesos', sinonimos: ['agenda'] },
  // La sección ya viaja sola a la paleta; este atajo lleva a la firma de la hoja y le da los nombres
  // con que se la busca sin saber que se llama Supervisión.
  { etiqueta: 'Firmar la hoja de supervisión', href: '/supervision#firma', icono: 'supervision', requiere: '/supervision', sinonimos: ['revisar tareas vencidas', 'hoja del día', 'imprimir hoja'] },
  { etiqueta: 'Mi perfil', href: '/perfil', icono: 'perfil', requiere: null, sinonimos: ['contraseña', 'foto', 'cuenta'] },
  { etiqueta: 'Novedades', href: '/novedades', icono: 'novedades', requiere: null, sinonimos: ['cambios', 'actualizaciones', 'changelog'] },
  { etiqueta: 'Soporte', href: URL_SOPORTE, icono: 'soporte', requiere: null, sinonimos: ['ayuda', 'wiwo.center'], externo: true }
]

/** Cuanto se espera despues de la ultima tecla antes de preguntarle a la API. */
const ESPERA_BUSQUEDA_MS = 180

/** Cuantos resultados por tipo: los que entran de un vistazo en la paleta sin volverla un listado. */
const POR_TIPO = 5

/** Prefijo de ids de la paleta. Uno solo en el documento: la paleta se monta una vez, en el armazon. */
const idBase = 'paleta'

/** Estado de la busqueda contra `/search`. */
type Busqueda =
  | { estado: 'inactiva' }
  | { estado: 'buscando', consulta: string, previos: ResultadosDeBusqueda | null }
  | { estado: 'lista', consulta: string, resultados: ResultadosDeBusqueda }
  | { estado: 'error', consulta: string, mensaje: string }

/**
 * Paleta de comandos del panel: `Ctrl K` / `⌘K`, o cualquier boton que llame a `abrirPaleta()`.
 *
 * Busca Tareas, Proyectos, Clientes y Personas por `GET /search` —que ya recorta cada tipo a lo que
 * quien mira puede ver— y ofrece ir a cualquier seccion del menu, tambien a las que el menu pliega.
 * Vacia, muestra lo reciente y lo fijado: es la forma mas corta de volver a donde se estaba.
 *
 * === Accesibilidad ===
 *
 * Es el patron combobox de ARIA 1.2 dentro de un dialogo: el foco se queda en el campo y la opcion
 * activa se anuncia con `aria-activedescendant`, que es lo que deja escribir y moverse con las
 * flechas sin saltar entre elementos. El dialogo es Radix —trampa de foco, `Escape`, devolucion del
 * foco al cerrar—, por la regla de superposiciones del proyecto. La combobox es propia: Radix no
 * tiene una, y `cmdk` sumaria una dependencia para lo que son cien lineas de teclado.
 *
 * @param secciones las mismas secciones de la barra, ya filtradas por permisos en el servidor
 */
export function PaletaDeComandos ({ secciones }: { secciones: Seccion[] }) {
  const router = useRouter()
  const [abierta, setAbierta] = useState(false)
  const [consulta, setConsulta] = useState('')
  const [activo, setActivo] = useState(0)
  const [recientes, setRecientes] = useState<Reciente[]>([])
  const fijados = useFijados()

  useAtajoDeTeclado(setAbierta)
  useRecientesAlAbrir(abierta, setRecientes)
  const busqueda = useBusqueda(abierta ? consulta : '')

  const resultados = busqueda.estado === 'lista'
    ? busqueda.resultados
    : busqueda.estado === 'buscando' ? busqueda.previos : null
  const grupos = useMemo(
    () => gruposDePaleta({ consulta, secciones, atajos: ATAJOS, recientes, fijados, resultados }),
    [consulta, secciones, recientes, fijados, resultados]
  )
  const opciones = useMemo(() => aplanar(grupos), [grupos])
  const indice = Math.min(activo, opciones.length - 1)

  /** Cierra y deja la paleta en blanco para la proxima vez. */
  const cerrar = useCallback(() => {
    setAbierta(false)
    setConsulta('')
    setActivo(0)
  }, [])

  /**
   * Va al destino de una opcion.
   *
   * @param comando la opcion elegida
   * @param nuevaPestana `Ctrl`/`⌘` + `Enter`: se abre en otra pestaña, como un enlace
   */
  const ejecutar = useCallback((comando: Comando, nuevaPestana = false) => {
    cerrar()
    if (comando.externo === true || nuevaPestana) {
      window.open(comando.href, '_blank', 'noopener,noreferrer')
      return
    }
    router.push(comando.href)
  }, [cerrar, router])

  /** Teclado de la combobox: flechas, Inicio, Fin y Enter. `Escape` lo resuelve Radix. */
  function alPresionar (evento: React.KeyboardEvent<HTMLInputElement>): void {
    if (evento.key === 'ArrowDown' || evento.key === 'ArrowUp' ||
      ((evento.key === 'Home' || evento.key === 'End') && evento.ctrlKey)) {
      evento.preventDefault()
      setActivo(moverActivo(indice, opciones.length, evento.key))
      return
    }

    if (evento.key === 'Enter' && !evento.nativeEvent.isComposing) {
      const comando = opciones[indice]
      if (comando === undefined) return
      evento.preventDefault()
      ejecutar(comando, evento.metaKey || evento.ctrlKey)
    }
  }

  return (
    <Radix.Root open={abierta} onOpenChange={(abrir) => { if (abrir) setAbierta(true); else cerrar() }}>
      <Radix.Portal>
        <Radix.Overlay className="bg-superficie-inversa/30 fixed inset-0 z-50 data-[state=closed]:animate-desaparecer data-[state=open]:animate-aparecer" />
        <Radix.Content
          aria-describedby={undefined}
          className={cn(
            'paleta-panel fixed inset-x-0 top-0 z-50 mx-auto flex max-h-dvh w-full flex-col overflow-hidden',
            'border-linea bg-superficie-flotante shadow-flotante border-b',
            'sm:top-[12vh] sm:max-h-[70vh] sm:w-[calc(100vw-2rem)] sm:max-w-xl sm:rounded-tarjeta sm:border'
          )}
          onOpenAutoFocus={(evento) => {
            // El foco va al campo y no al primer boton: la paleta se abre para escribir.
            evento.preventDefault()
            document.getElementById(`${idBase}-campo`)?.focus()
          }}
        >
          <Radix.Title className="sr-only">Buscar e ir a</Radix.Title>
          <CuerpoDePaleta
            idBase={idBase}
            consulta={consulta}
            alEscribir={(texto) => { setConsulta(texto); setActivo(0) }}
            alPresionar={alPresionar}
            grupos={grupos}
            opciones={opciones}
            indice={indice}
            alApuntar={setActivo}
            alElegir={ejecutar}
            busqueda={busqueda}
          />
        </Radix.Content>
      </Radix.Portal>
    </Radix.Root>
  )
}

interface PropsCuerpo {
  idBase: string
  consulta: string
  alEscribir: (texto: string) => void
  alPresionar: (evento: React.KeyboardEvent<HTMLInputElement>) => void
  grupos: ReturnType<typeof gruposDePaleta>
  opciones: Comando[]
  indice: number
  alApuntar: (indice: number) => void
  alElegir: (comando: Comando, nuevaPestana?: boolean) => void
  busqueda: Busqueda
}

/**
 * El campo y la lista. Separado del armazon del dialogo para que cada uno tenga un solo trabajo.
 *
 * @returns el contenido de la paleta
 */
function CuerpoDePaleta ({
  idBase: base, consulta, alEscribir, alPresionar, grupos, opciones, indice, alApuntar, alElegir, busqueda
}: PropsCuerpo) {
  const idLista = `${base}-lista`
  const idEstado = useId()
  const activa = opciones[indice]
  const buscando = busqueda.estado === 'buscando'
  const escrita = normalizar(consulta)

  return (
    <>
      <div className="border-linea flex items-center gap-3 border-b px-4">
        {buscando
          ? <LoaderCircle size={18} strokeWidth={2} aria-hidden="true" className="text-texto-sutil shrink-0 motion-safe:animate-spin" />
          : <Search size={18} strokeWidth={2} aria-hidden="true" className="text-texto-sutil shrink-0" />}
        {/* Sin el anillo de foco del sistema: el campo es lo unico enfocable mientras la paleta esta
            abierta y el cursor ya dice donde esta el foco; el anillo dibujaba una caja dentro de otra. */}
        <input
          id={`${base}-campo`}
          type="text"
          role="combobox"
          aria-expanded={opciones.length > 0}
          aria-controls={idLista}
          aria-autocomplete="list"
          aria-activedescendant={activa === undefined ? undefined : `${base}-op-${activa.id}`}
          aria-describedby={idEstado}
          aria-label="Buscar tareas, proyectos, clientes, personas o secciones"
          placeholder="Buscar o ir a…"
          autoComplete="off"
          spellCheck={false}
          value={consulta}
          onChange={(evento) => alEscribir(evento.target.value)}
          onKeyDown={alPresionar}
          className="text-texto placeholder:text-texto-sutil h-14 min-w-0 flex-1 bg-transparent text-base outline-none focus-visible:shadow-none focus-visible:outline-none"
        />
        <kbd className="border-linea text-texto-sutil hidden rounded-chico border px-1.5 py-0.5 text-xs sm:inline">Esc</kbd>
      </div>

      <ListaDeOpciones
        idLista={idLista}
        base={base}
        grupos={grupos}
        indice={indice}
        opciones={opciones}
        alApuntar={alApuntar}
        alElegir={alElegir}
      />

      <PieDePaleta
        idEstado={idEstado}
        busqueda={busqueda}
        escrita={escrita}
        vacia={opciones.length === 0}
      />
    </>
  )
}

interface PropsLista {
  idLista: string
  base: string
  grupos: ReturnType<typeof gruposDePaleta>
  indice: number
  opciones: Comando[]
  alApuntar: (indice: number) => void
  alElegir: (comando: Comando, nuevaPestana?: boolean) => void
}

/**
 * Las opciones agrupadas, con la marca de la activa que se desliza de fila en fila.
 *
 * La marca es un solo elemento que se mueve con `transform` hasta la fila activa, medida despues de
 * pintar. Pintar el fondo en cada fila haria que el resaltado saltara; asi viaja.
 *
 * @returns el `listbox`
 */
function ListaDeOpciones ({ idLista, base, grupos, indice, opciones, alApuntar, alElegir }: PropsLista) {
  const marca = useRef<HTMLSpanElement>(null)
  const activa = opciones[indice]
  const indicePorId = new Map(opciones.map((comando, orden) => [comando.id, orden]))

  // La marca se mueve escribiendo su estilo y no con estado: es el DOM el que se sincroniza con la
  // fila activa, y un `setState` aca costaria un render de mas en cada tecla de flecha.
  useLayoutEffect(() => {
    const destino = marca.current
    if (destino === null) return
    const fila = activa === undefined ? null : document.getElementById(`${base}-op-${activa.id}`)
    if (fila === null) {
      destino.style.opacity = '0'
      return
    }
    destino.style.transform = `translateY(${fila.offsetTop}px)`
    destino.style.height = `${fila.offsetHeight}px`
    destino.style.opacity = '1'
    fila.scrollIntoView({ block: 'nearest' })
  }, [activa, base, grupos])

  return (
    <div className="relative min-h-0 flex-1 overflow-y-auto overscroll-contain p-2" data-lenis-prevent>
      <span
        ref={marca}
        aria-hidden="true"
        className="paleta-marca bg-hover pointer-events-none absolute inset-x-2 top-0 h-0 rounded-medio opacity-0"
      />
      <div id={idLista} role="listbox" aria-label="Resultados" className="relative flex flex-col gap-3">
        {grupos.map((grupo) => (
          <div key={grupo.id} role="group" aria-labelledby={`${base}-g-${grupo.id}`} className="flex flex-col">
            <div id={`${base}-g-${grupo.id}`} className="text-texto-sutil px-3 pb-1 pt-1 text-xs font-semibold">
              {grupo.titulo}
            </div>
            {grupo.comandos.map((comando) => {
              const esta = indicePorId.get(comando.id) ?? -1
              return (
                <Opcion
                  key={comando.id}
                  id={`${base}-op-${comando.id}`}
                  comando={comando}
                  activa={esta === indice}
                  orden={esta}
                  alApuntar={() => alApuntar(esta)}
                  alElegir={(nueva) => alElegir(comando, nueva)}
                />
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}

interface PropsOpcion {
  id: string
  comando: Comando
  activa: boolean
  orden: number
  alApuntar: () => void
  alElegir: (nuevaPestana: boolean) => void
}

/**
 * Una opcion. `pointermove` y no `mouseenter` para apuntar: al desplazar la lista con la rueda, la
 * fila que queda bajo el puntero dispararia `mouseenter` y robaria la seleccion del teclado.
 *
 * @returns el `option`
 */
function Opcion ({ id, comando, activa, orden, alApuntar, alElegir }: PropsOpcion) {
  const Icono = ICONOS_DE_COMANDO[comando.icono]

  return (
    <div
      id={id}
      role="option"
      aria-selected={activa}
      onPointerMove={() => { if (!activa) alApuntar() }}
      onPointerDown={(evento) => evento.preventDefault()}
      onClick={(evento) => alElegir(evento.metaKey || evento.ctrlKey)}
      style={{ '--i': orden } as React.CSSProperties}
      className={cn(
        'paleta-opcion rounded-medio flex min-h-10 cursor-pointer items-center gap-3 px-3 py-2 text-sm',
        activa ? 'text-texto' : 'text-texto-tenue'
      )}
    >
      <Icono size={18} strokeWidth={2} aria-hidden="true" className={cn('shrink-0', activa && 'text-acento')} />
      <span className="min-w-0 flex-1 truncate">{comando.etiqueta}</span>
      {comando.detalle !== undefined && comando.detalle !== '' && (
        <span className="text-texto-sutil max-w-[45%] shrink truncate text-xs">{comando.detalle}</span>
      )}
      {activa && <CornerDownLeft size={14} strokeWidth={2} aria-hidden="true" className="text-texto-sutil shrink-0" />}
    </div>
  )
}

/**
 * La linea de estado: que esta pasando con la busqueda, para la vista y para el lector de pantalla.
 *
 * @returns el pie
 */
function PieDePaleta ({ idEstado, busqueda, escrita, vacia }: { idEstado: string, busqueda: Busqueda, escrita: string, vacia: boolean }) {
  const mensaje = mensajeDeEstado(busqueda, escrita, vacia)

  return (
    <div className="border-linea text-texto-sutil flex min-h-9 items-center justify-between gap-3 border-t px-4 py-2 text-xs">
      <p id={idEstado} role="status" aria-live="polite" className={cn(busqueda.estado === 'error' && 'text-texto-peligro')}>
        {mensaje}
      </p>
      <p className="hidden shrink-0 sm:block" aria-hidden="true">↑↓ para moverte · Enter para abrir</p>
    </div>
  )
}

/**
 * Texto del pie segun el estado.
 *
 * @returns el mensaje, o vacio si no hay nada que decir
 */
function mensajeDeEstado (busqueda: Busqueda, escrita: string, vacia: boolean): string {
  if (busqueda.estado === 'error') return busqueda.mensaje
  if (busqueda.estado === 'buscando') return 'Buscando…'
  if (escrita !== '' && escrita.length < LARGO_MINIMO_BUSQUEDA) return 'Escribe una letra más para buscar en tareas, proyectos y clientes.'
  if (vacia && escrita !== '') return `Sin resultados para «${escrita}».`
  return ''
}

/**
 * `Ctrl K` / `⌘K` abre y cierra; `abrirPaleta()` abre.
 *
 * No abre encima de otro dialogo: el modal de jornada, por ejemplo, es una compuerta, y una paleta
 * encima dejaria navegar sin pasar por ella.
 *
 * @param setAbierta el setter del estado
 */
function useAtajoDeTeclado (setAbierta: React.Dispatch<React.SetStateAction<boolean>>): void {
  useEffect(() => {
    function hayOtroDialogo (): boolean {
      return [...document.querySelectorAll('[role="dialog"][data-state="open"]')]
        .some((dialogo) => !dialogo.classList.contains('paleta-panel'))
    }

    function alTeclear (evento: KeyboardEvent): void {
      if (evento.key.toLowerCase() !== 'k' || !(evento.metaKey || evento.ctrlKey) || evento.altKey || evento.shiftKey) return
      if (hayOtroDialogo()) return
      evento.preventDefault()
      setAbierta((antes) => !antes)
    }

    function alPedir (): void {
      if (!hayOtroDialogo()) setAbierta(true)
    }

    window.addEventListener('keydown', alTeclear)
    window.addEventListener(EVENTO_ABRIR_PALETA, alPedir)
    return () => {
      window.removeEventListener('keydown', alTeclear)
      window.removeEventListener(EVENTO_ABRIR_PALETA, alPedir)
    }
  }, [setAbierta])
}

/**
 * Trae los recientes cada vez que se abre la paleta: pueden haber cambiado desde la ultima vez, y
 * son ocho filas.
 *
 * Un fallo no se avisa: la paleta sigue sirviendo para buscar y navegar, y los recientes son un
 * atajo. Se deja la lista que habia.
 */
function useRecientesAlAbrir (abierta: boolean, setRecientes: (lista: Reciente[]) => void): void {
  useEffect(() => {
    if (!abierta) return
    const control = new AbortController()

    pedirSobre<Reciente[]>('me/recientes', control.signal)
      .then((sobre) => { if (Array.isArray(sobre.data)) setRecientes(sobre.data) })
      .catch(() => { /* Sin recientes la paleta sigue sirviendo: se conserva la lista anterior. */ })

    return () => control.abort()
  }, [abierta, setRecientes])
}

/** La ultima respuesta de `/search`, con el termino al que responde. */
type Respuesta =
  | { consulta: string, resultados: ResultadosDeBusqueda }
  | { consulta: string, mensaje: string }

/**
 * Pregunta a `/search` despues de una pausa al escribir, cancelando la pregunta anterior.
 *
 * El estado visible se DERIVA de la ultima respuesta y del termino vigente, en vez de escribirse al
 * cambiar el termino: si la respuesta no es del termino que esta escrito, se esta buscando, y
 * mientras tanto se siguen mostrando los resultados anteriores para que la lista no parpadee.
 *
 * @param consulta lo escrito; vacio cuando la paleta esta cerrada
 * @returns el estado de la busqueda
 */
function useBusqueda (consulta: string): Busqueda {
  const termino = consulta.trim()
  const [respuesta, setRespuesta] = useState<Respuesta | null>(null)
  const [ultimos, setUltimos] = useState<ResultadosDeBusqueda | null>(null)

  useEffect(() => {
    if (termino.length < LARGO_MINIMO_BUSQUEDA) return

    const control = new AbortController()
    const espera = window.setTimeout(() => {
      const parametros = new URLSearchParams({ q: termino, per_type: String(POR_TIPO), q_mode: 'terms' })
      pedirSobre<ResultadosDeBusqueda>(`search?${parametros.toString()}`, control.signal)
        .then((sobre) => {
          const resultados = sobre.data ?? {}
          setRespuesta({ consulta: termino, resultados })
          setUltimos(resultados)
        })
        .catch((fallo: unknown) => {
          if (control.signal.aborted) return
          setRespuesta({
            consulta: termino,
            mensaje: fallo instanceof Error ? fallo.message : 'No se pudo buscar. Intenta de nuevo.'
          })
        })
    }, ESPERA_BUSQUEDA_MS)

    return () => {
      window.clearTimeout(espera)
      control.abort()
    }
  }, [termino])

  if (termino.length < LARGO_MINIMO_BUSQUEDA) return { estado: 'inactiva' }
  if (respuesta === null || respuesta.consulta !== termino) return { estado: 'buscando', consulta: termino, previos: ultimos }
  if ('mensaje' in respuesta) return { estado: 'error', consulta: termino, mensaje: respuesta.mensaje }
  return { estado: 'lista', consulta: termino, resultados: respuesta.resultados }
}
