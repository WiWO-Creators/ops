'use client'

import {
  useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type DragEvent, type KeyboardEvent, type MouseEvent
} from 'react'
import {
  ArrowDown, ArrowUp, ArrowUpDown, ExternalLink, FolderInput, FolderOpen, FolderPlus, PanelLeftClose, PanelLeftOpen,
  Pencil, Search, Trash2, Upload, Users, X
} from 'lucide-react'
import { Boton } from '@/componentes/formularios/Boton'
import { CLASES_CASILLA, Entrada } from '@/componentes/formularios/Entrada'
import { Segmentado } from '@/componentes/formularios/Segmentado'
import {
  ContenidoMenu, DisparadorMenu, GrupoRadioMenu, ItemMenu, ItemMenuRadio, MenuContextual, SeparadorMenu
} from '@/componentes/superposiciones/MenuContextual'
import { Cargando, ErrorEstado } from '@/componentes/estado/Estados'
import { CargandoConOrbe } from '@/componentes/estado/Orbe'
import { escribirEnBff } from '@/componentes/datos/mutaciones'
import { ArbolLateralDrive } from '@/componentes/archivos/ArbolLateralDrive'
import { BandejaSubidasDrive } from '@/componentes/archivos/BandejaSubidasDrive'
import { DialogoEliminarDrive, DialogoMoverDrive, EditorNombreDrive } from '@/componentes/archivos/EdicionDrive'
import { FilaDrive, TarjetaDrive, type PropsElementoDrive } from '@/componentes/archivos/ElementoDrive'
import { IconoArchivoDrive } from '@/componentes/archivos/IconoArchivoDrive'
import { MigasDrive } from '@/componentes/archivos/MigasDrive'
import { DialogoPermisosDrive } from '@/componentes/archivos/PermisosDrive'
import { enParalelo, rutaDeCarpeta, rutaDeHijo, trasladarNodos } from '@/componentes/archivos/red-drive'
import { useArrastreDrive } from '@/componentes/archivos/useArrastreDrive'
import { useCarpetasDrive } from '@/componentes/archivos/useCarpetasDrive'
import { useSubidasDrive } from '@/componentes/archivos/useSubidasDrive'
import { esEditable, reemplazarNodo } from '@/dominio/drive-arbol'
import {
  ORDEN_INICIAL, SELECCION_VACIA, filtrarPorNombre, indiceTrasTecla, nombreRepetido, ordenarNodos,
  resumenDeBorrado, resumenDeTraslado, seleccionar, separarNodos, sumarNodos, tipoDeNodo,
  type CriterioOrden, type ModoSeleccion, type OrdenDrive, type SeleccionDrive, type TeclaNavegacion
} from '@/dominio/drive-explorador'
import { useConsultaDeMedios } from '@/lib/useConsultaDeMedios'
import { cn } from '@/lib/clases'
import type { CarpetaDrive, MigaDrive, NodoDrive, RaizDrive } from '@/datos/recursos'

/** Cómo se llama la carpeta de cada entidad en las migas. */
const NOMBRE_RAIZ: Record<RaizDrive, string> = {
  clients: 'Drive del Cliente',
  projects: 'Drive del Proyecto',
  tasks: 'Drive de la Tarea'
}

/** Clave de las preferencias del explorador en `localStorage`: vista, orden y panel lateral. */
const CLAVE_PREFERENCIAS = 'ops-drive-explorador'

/** Items que se pintan de una vez; el resto entra a medida que se baja. */
const TANDA_DE_ITEMS = 200

/** Cuánto queda a la vista un aviso de éxito. Los errores quedan hasta que se cierran. */
const DURACION_AVISO_MS = 6000

/** Borrados en paralelo: cada uno es un pedido a Drive. */
const BORRADOS_EN_PARALELO = 3

const NOMBRE_REPETIDO = 'Ya hay un elemento con ese nombre en esta carpeta.'

/** El `409` de crear carpeta: la API ya tiene una hermana con ese nombre. */
const CARPETA_REPETIDA = 'Ya existe una carpeta con ese nombre.'

type Vista = 'lista' | 'cuadricula'

interface Preferencias {
  vista: Vista
  orden: OrdenDrive
  panel: boolean
}

const PREFERENCIAS_INICIALES: Preferencias = { vista: 'lista', orden: ORDEN_INICIAL, panel: true }

const ETIQUETA_CRITERIO: Record<CriterioOrden, string> = { nombre: 'Nombre', fecha: 'Modificado', tamano: 'Tamaño' }

/**
 * Lee las preferencias guardadas. `localStorage` puede no estar (ventana privada, bloqueado) o traer
 * basura de una versión anterior: en cualquiera de los dos casos valen las iniciales.
 */
function leerPreferencias (): Preferencias {
  try {
    const crudo = window.localStorage.getItem(CLAVE_PREFERENCIAS)
    if (crudo === null) return PREFERENCIAS_INICIALES
    const guardadas = JSON.parse(crudo) as Partial<Preferencias>
    return {
      vista: guardadas.vista === 'cuadricula' ? 'cuadricula' : 'lista',
      orden: guardadas.orden !== undefined && guardadas.orden.criterio in ETIQUETA_CRITERIO
        ? { criterio: guardadas.orden.criterio, ascendente: guardadas.orden.ascendente !== false }
        : ORDEN_INICIAL,
      panel: guardadas.panel !== false
    }
  } catch {
    return PREFERENCIAS_INICIALES
  }
}

/** Guarda las preferencias. Si no se puede, la pantalla sigue igual: solo no se recuerdan. */
function guardarPreferencias (preferencias: Preferencias): void {
  try {
    window.localStorage.setItem(CLAVE_PREFERENCIAS, JSON.stringify(preferencias))
  } catch {
    // Sin almacenamiento (ventana privada, cuota llena): la preferencia vale solo para esta visita.
  }
}

/** Un aviso al pie del explorador con el resultado de la última operación. */
interface Aviso {
  tono: 'exito' | 'aviso' | 'error'
  texto: string
}

/** El menú contextual abierto: dónde y sobre qué items. */
interface MenuAbierto {
  x: number
  y: number
  ids: string[]
  /** El item desde donde se abrió, para devolverle el foco al cerrar. */
  indice: number
}

type DialogoAbierto =
  | { tipo: 'mover', ids: string[] }
  | { tipo: 'eliminar', ids: string[] }
  | { tipo: 'permisos', nodo: NodoDrive }

const TECLAS_NAVEGACION = new Set<string>(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End', 'PageUp', 'PageDown'])

/** Tono de un aviso según cuánto salió bien. */
function tonoDe (bien: number, mal: number): Aviso['tono'] {
  if (mal === 0) return 'exito'
  return bien === 0 ? 'error' : 'aviso'
}

/**
 * El explorador de Drive de una entidad: migas, barra de acciones, árbol lateral y el contenido de la
 * carpeta actual en lista o cuadrícula, con arrastrar y soltar para mover y para subir.
 *
 * Todo lo que se hace arrastrando tiene su camino sin arrastrar —menú contextual, botón ⋯, teclado—,
 * porque en el celular no hay arrastre y con teclado tampoco. Las carpetas de Tarea (`locked`) no se
 * renombran, mueven ni borran, pero reciben lo que se suelta: el backend decide si quien suelta puede
 * escribir ahí, y su `403` sale en el aviso.
 *
 * @param raiz la entidad dueña de la carpeta, para nombrar la raíz
 * @param folder la carpeta de la entidad, con su primer nivel ya resuelto
 */
export function ExploradorDrive ({ raiz, folder }: { raiz: RaizDrive, folder: CarpetaDrive }) {
  const raizMiga: MigaDrive = useMemo(() => ({ id: folder.id, name: NOMBRE_RAIZ[raiz] }), [folder.id, raiz])
  const almacen = useCarpetasDrive(folder, raizMiga.name)
  const { carpetas, rutas, cargar, soltar, cambiarHijos, renombrarEnRutas, reubicar, anotarRuta } = almacen

  const [actualId, setActualId] = useState(folder.id)
  const [seleccion, setSeleccion] = useState<SeleccionDrive>(SELECCION_VACIA)
  const [foco, setFoco] = useState(-1)
  const [filtro, setFiltro] = useState('')
  const [preferencias, setPreferencias] = useState<Preferencias>(leerPreferencias)
  const [renombrandoId, setRenombrandoId] = useState<string | null>(null)
  const [creandoCarpeta, setCreandoCarpeta] = useState(false)
  const [menu, setMenu] = useState<MenuAbierto | null>(null)
  const [dialogo, setDialogo] = useState<DialogoAbierto | null>(null)
  const [ocupados, setOcupados] = useState<ReadonlySet<string>>(new Set())
  const [aviso, setAviso] = useState<Aviso | null>(null)
  const [limite, setLimite] = useState(TANDA_DE_ITEMS)
  const [ahora, setAhora] = useState(() => new Date())
  const tactil = useConsultaDeMedios('(pointer: coarse)')
  const vistaRef = useRef<HTMLDivElement>(null)
  const entradaArchivos = useRef<HTMLInputElement>(null)
  const centinela = useRef<HTMLDivElement>(null)

  const entrada = carpetas[actualId]
  const hijos = useMemo(() => (entrada?.fase === 'listo' ? entrada.hijos : []), [entrada])
  const puedeEscribir = entrada?.fase === 'listo' && entrada.canWrite
  const migas = useMemo(() => rutas[actualId] ?? [raizMiga], [rutas, actualId, raizMiga])
  const actual = migas[migas.length - 1] ?? raizMiga
  const visibles = useMemo(
    () => ordenarNodos(filtrarPorNombre(hijos, filtro), preferencias.orden),
    [hijos, filtro, preferencias.orden]
  )
  const idsVisibles = useMemo(() => visibles.map((nodo) => nodo.id), [visibles])
  const seleccionados = useMemo(() => hijos.filter((nodo) => seleccion.ids.includes(nodo.id)), [hijos, seleccion.ids])

  useEffect(() => { guardarPreferencias(preferencias) }, [preferencias])

  // Un aviso de éxito se va solo; uno con fallos se queda hasta que alguien lo cierre y lo lea.
  useEffect(() => {
    if (aviso?.tono !== 'exito') return
    const temporizador = setTimeout(() => { setAviso(null) }, DURACION_AVISO_MS)
    return () => { clearTimeout(temporizador) }
  }, [aviso])

  // Las carpetas largas se pintan por tandas a medida que se baja: una carpeta de mil archivos no
  // bloquea la pestaña al abrirse.
  const hayMas = visibles.length > limite
  useEffect(() => {
    const nodo = centinela.current
    if (nodo === null || !hayMas) return
    const observador = new IntersectionObserver((entradas) => {
      if (entradas.some((e) => e.isIntersecting)) setLimite((antes) => antes + TANDA_DE_ITEMS)
    }, { rootMargin: '400px' })
    observador.observe(nodo)
    return () => { observador.disconnect() }
  }, [hayMas])

  /** La ruta de una carpeta: la conocida, o la de la actual más ella si es una hija recién llegada. */
  const rutaDe = useCallback((id: string, nombre: string): MigaDrive[] => {
    return rutas[id] ?? [...migas, { id, name: nombre }]
  }, [rutas, migas])

  // --- Navegación -----------------------------------------------------------------------------

  const ir = useCallback((id: string, nombre?: string) => {
    if (id === actualId) return

    if (rutas[id] === undefined && nombre !== undefined) anotarRuta(id, [...migas, { id, name: nombre }])
    soltar(actualId)
    setActualId(id)
    setSeleccion(SELECCION_VACIA)
    setFoco(-1)
    setFiltro('')
    setRenombrandoId(null)
    setCreandoCarpeta(false)
    setLimite(TANDA_DE_ITEMS)
    setAhora(new Date())
    cargar(id)
  }, [actualId, rutas, migas, anotarRuta, soltar, cargar])

  const abrir = useCallback((nodo: NodoDrive) => {
    if (nodo.is_folder) {
      ir(nodo.id, nodo.name)
      requestAnimationFrame(() => { vistaRef.current?.focus() })
      return
    }
    window.open(nodo.web_view_link, '_blank', 'noopener,noreferrer')
  }, [ir])

  // --- Escrituras ---------------------------------------------------------------------------

  /** Mueve items de una carpeta a otra, primero en pantalla y después en Drive, revirtiendo lo que falle. */
  const mover = useCallback(async (ids: readonly string[], padreId: string, destino: MigaDrive): Promise<void> => {
    const origen = carpetas[padreId]
    const movidos = origen?.fase === 'listo' ? origen.hijos.filter((nodo) => ids.includes(nodo.id) && esEditable(nodo)) : []
    const idsMovidos = movidos.map((nodo) => nodo.id)
    if (idsMovidos.length === 0) return

    cambiarHijos(padreId, (lista) => separarNodos(lista, idsMovidos).quedan)
    cambiarHijos(destino.id, (lista) => sumarNodos(lista, movidos))
    setSeleccion(SELECCION_VACIA)
    setAviso(null)

    const resultado = await trasladarNodos(padreId, idsMovidos, destino.id)
    const fallidos = resultado.failed.map((fallo) => fallo.id)

    if (fallidos.length > 0) {
      cambiarHijos(padreId, (lista) => sumarNodos(lista, movidos.filter((nodo) => fallidos.includes(nodo.id))))
      cambiarHijos(destino.id, (lista) => separarNodos(lista, fallidos).quedan)
    }
    for (const nodo of movidos) {
      if (nodo.is_folder && resultado.moved.includes(nodo.id)) reubicar(nodo.id, nodo.name, destino.id)
    }

    const nombreDe = (id: string): string => movidos.find((nodo) => nodo.id === id)?.name ?? id
    setAviso({ tono: tonoDe(resultado.moved.length, fallidos.length), texto: resumenDeTraslado(resultado, nombreDe, destino.name) })
    if (carpetas[destino.id] !== undefined) cargar(destino.id)
  }, [carpetas, cambiarHijos, reubicar, cargar])

  const alSubir = useCallback((destinoId: string, nodo: NodoDrive) => {
    cambiarHijos(destinoId, (lista) => sumarNodos(lista, [nodo]))
  }, [cambiarHijos])

  const subidas = useSubidasDrive(alSubir)

  const arrastre = useArrastreDrive({
    onMover: (ids, padreId, destino) => { void mover(ids, padreId, destino) },
    onSubir: subidas.encolar
  })

  const propsDestino = useCallback((id: string, nombre: string) => {
    const conocida = carpetas[id]
    return arrastre.destino({
      id,
      ruta: rutaDe(id, nombre).map((miga) => miga.id),
      ...(conocida?.fase === 'listo' ? { canWrite: conocida.canWrite } : {})
    }, nombre)
  }, [arrastre, carpetas, rutaDe])

  async function renombrar (nodo: NodoDrive, nombre: string): Promise<string | null> {
    const resultado = await escribirEnBff<NodoDrive | undefined>(rutaDeHijo(actualId, nodo.id), 'PATCH', { name: nombre })
    if (!resultado.ok) return resultado.mensaje

    const actualizado = resultado.datos ?? { ...nodo, name: nombre }
    cambiarHijos(actualId, (lista) => reemplazarNodo(lista, actualizado))
    if (nodo.is_folder) renombrarEnRutas(nodo.id, actualizado.name)
    setRenombrandoId(null)
    enfocar(idsVisibles.indexOf(nodo.id))
    return null
  }

  async function crearCarpeta (nombre: string): Promise<string | null> {
    const resultado = await escribirEnBff<NodoDrive | undefined>(`${rutaDeCarpeta(actualId)}/folders`, 'POST', { name: nombre })
    // El `409` es una hermana con el mismo nombre que la pantalla todavía no veía (la creó otra persona).
    if (!resultado.ok) return resultado.estado === 409 ? CARPETA_REPETIDA : resultado.mensaje
    if (resultado.datos === undefined) {
      cargar(actualId)
    } else {
      const nueva = resultado.datos
      cambiarHijos(actualId, (lista) => sumarNodos(lista, [nueva]))
      anotarRuta(nueva.id, [...migas, { id: nueva.id, name: nueva.name }])
    }
    setCreandoCarpeta(false)
    setAviso({ tono: 'exito', texto: `Carpeta «${nombre}» creada.` })
    return null
  }

  async function eliminar (ids: readonly string[]): Promise<void> {
    const padreId = actualId
    const nodos = hijos.filter((nodo) => ids.includes(nodo.id) && esEditable(nodo))
    setDialogo(null)
    setOcupados((antes) => new Set([...antes, ...nodos.map((nodo) => nodo.id)]))

    const resultados = await enParalelo(nodos, BORRADOS_EN_PARALELO, async (nodo) => ({
      id: nodo.id,
      resultado: await escribirEnBff(rutaDeHijo(padreId, nodo.id), 'DELETE')
    }))

    const enviados = resultados.filter((r) => r.resultado.ok).map((r) => r.id)
    const fallos = resultados.flatMap((r) => (r.resultado.ok ? [] : [{ id: r.id, error: r.resultado.mensaje }]))
    cambiarHijos(padreId, (lista) => separarNodos(lista, enviados).quedan)
    setOcupados((antes) => new Set([...antes].filter((id) => !nodos.some((nodo) => nodo.id === id))))
    setSeleccion(SELECCION_VACIA)

    const nombreDe = (id: string): string => nodos.find((nodo) => nodo.id === id)?.name ?? id
    setAviso({ tono: tonoDe(enviados.length, fallos.length), texto: resumenDeBorrado(enviados, fallos, nombreDe) })
  }

  function alElegirArchivos (evento: ChangeEvent<HTMLInputElement>): void {
    const lista = Array.from(evento.target.files ?? [])
    evento.target.value = ''
    if (lista.length > 0) subidas.encolar(lista, actual)
  }

  // --- Selección, foco y teclado --------------------------------------------------------------

  /** Mueve el foco a un item, pintando más si todavía no estaba en pantalla. */
  function enfocar (indice: number): void {
    if (indice < 0) return
    setFoco(indice)
    if (indice >= limite) setLimite(indice + TANDA_DE_ITEMS)
    requestAnimationFrame(() => {
      vistaRef.current?.querySelector<HTMLElement>(`[data-indice="${indice}"]`)?.focus()
    })
  }

  /** Items por fila en la cuadrícula, leídos de la maqueta real: dependen del ancho. */
  function columnas (): number {
    if (preferencias.vista === 'lista' || vistaRef.current === null) return 1
    const plantilla = getComputedStyle(vistaRef.current).gridTemplateColumns
    return Math.max(1, plantilla.split(' ').filter(Boolean).length)
  }

  function elegir (indice: number, modo: ModoSeleccion): void {
    const id = idsVisibles[indice]
    if (id === undefined) return
    setSeleccion((antes) => seleccionar(idsVisibles, antes, id, modo))
    setFoco(indice)
  }

  function alClic (evento: MouseEvent<HTMLElement>, indice: number): void {
    const nodo = visibles[indice]
    if (nodo === undefined) return

    // En pantallas táctiles un toque abre, como en cualquier explorador del celular. Con algo ya
    // elegido, un toque suma o saca: es el modo selección de la casilla.
    if (tactil) {
      if (seleccion.ids.length > 0) elegir(indice, 'alternar')
      else abrir(nodo)
      return
    }

    elegir(indice, evento.shiftKey ? 'rango' : evento.metaKey || evento.ctrlKey ? 'alternar' : 'unico')
  }

  /** Los items sobre los que actúa una acción iniciada en `indice`: la selección si lo incluye. */
  function objetivosDe (indice: number): string[] {
    const id = idsVisibles[indice]
    if (id === undefined) return []
    return seleccion.ids.includes(id) ? seleccion.ids : [id]
  }

  function abrirMenu (evento: MouseEvent<HTMLElement>, indice: number): void {
    evento.preventDefault()
    const id = idsVisibles[indice]
    if (id === undefined) return
    if (!seleccion.ids.includes(id)) setSeleccion({ ids: [id], ancla: id })
    setFoco(indice)

    const caja = evento.currentTarget.getBoundingClientRect()
    const desdeBoton = evento.type !== 'contextmenu'
    setMenu({
      x: desdeBoton ? caja.right : evento.clientX,
      y: desdeBoton ? caja.bottom : evento.clientY,
      ids: objetivosDe(indice),
      indice
    })
  }

  function abrirMenuConTeclado (indice: number): void {
    const fila = vistaRef.current?.querySelector<HTMLElement>(`[data-indice="${indice}"]`)
    const id = idsVisibles[indice]
    if (fila === null || fila === undefined || id === undefined) return
    const caja = fila.getBoundingClientRect()
    if (!seleccion.ids.includes(id)) setSeleccion({ ids: [id], ancla: id })
    setMenu({ x: caja.left + 48, y: caja.bottom, ids: objetivosDe(indice), indice })
  }

  function pedirEliminar (ids: readonly string[]): void {
    const editables = hijos.filter((nodo) => ids.includes(nodo.id) && esEditable(nodo)).map((nodo) => nodo.id)
    if (puedeEscribir && editables.length > 0) setDialogo({ tipo: 'eliminar', ids: editables })
  }

  function pedirMover (ids: readonly string[]): void {
    const editables = hijos.filter((nodo) => ids.includes(nodo.id) && esEditable(nodo)).map((nodo) => nodo.id)
    if (puedeEscribir && editables.length > 0) setDialogo({ tipo: 'mover', ids: editables })
  }

  function pedirRenombrar (id: string | undefined): void {
    const nodo = hijos.find((otro) => otro.id === id)
    if (nodo !== undefined && puedeEscribir && esEditable(nodo)) setRenombrandoId(nodo.id)
  }

  function alPulsarTecla (evento: KeyboardEvent<HTMLDivElement>): void {
    const tecla = evento.key
    const conModificador = evento.metaKey || evento.ctrlKey
    const nodo = visibles[foco]

    if (TECLAS_NAVEGACION.has(tecla) && !(evento.altKey && tecla === 'ArrowUp')) {
      evento.preventDefault()
      const destino = indiceTrasTecla(foco, visibles.length, tecla as TeclaNavegacion, columnas())
      if (destino < 0) return
      if (evento.shiftKey) elegir(destino, 'rango')
      else if (!conModificador) elegir(destino, 'unico')
      enfocar(destino)
      return
    }

    const acciones: Record<string, () => void> = {
      Enter: () => { if (nodo !== undefined) abrir(nodo) },
      ' ': () => { if (foco >= 0) elegir(foco, 'alternar') },
      Delete: () => { pedirEliminar(objetivosDe(foco)) },
      F2: () => { pedirRenombrar(nodo?.id) },
      Escape: () => { setSeleccion(SELECCION_VACIA) },
      Backspace: () => { irArriba() },
      ContextMenu: () => { abrirMenuConTeclado(foco) }
    }

    if (evento.altKey && tecla === 'ArrowUp') {
      evento.preventDefault()
      irArriba()
      return
    }
    if (conModificador && tecla.toLowerCase() === 'a') {
      evento.preventDefault()
      setSeleccion({ ids: idsVisibles, ancla: idsVisibles[0] ?? null })
      return
    }
    if (evento.shiftKey && tecla === 'F10') {
      evento.preventDefault()
      abrirMenuConTeclado(foco)
      return
    }

    const accion = acciones[tecla]
    if (accion === undefined) return
    if (tecla === 'Escape' && seleccion.ids.length === 0) return
    evento.preventDefault()
    accion()
  }

  function irArriba (): void {
    const padre = migas[migas.length - 2]
    if (padre !== undefined) ir(padre.id)
  }

  function alIniciarArrastre (evento: DragEvent<HTMLElement>, indice: number): void {
    const nodo = visibles[indice]
    if (nodo === undefined || !puedeEscribir || !esEditable(nodo)) {
      evento.preventDefault()
      return
    }

    const enSeleccion = seleccion.ids.includes(nodo.id)
    const ids = enSeleccion
      ? hijos.filter((otro) => seleccion.ids.includes(otro.id) && esEditable(otro)).map((otro) => otro.id)
      : [nodo.id]
    if (!enSeleccion) setSeleccion({ ids: [nodo.id], ancla: nodo.id })

    arrastre.iniciar(evento, ids, actualId, ids.length === 1 ? nodo.name : `${ids.length} elementos`)
  }

  // --- Dibujo ---------------------------------------------------------------------------------

  const nodoActual = migas.length >= 2
    ? (() => {
        const padre = carpetas[migas[migas.length - 2]?.id ?? '']
        return padre?.fase === 'listo' ? padre.hijos.find((nodo) => nodo.id === actualId) : undefined
      })()
    : undefined
  const soltandoArchivos = arrastre.arrastre === null && arrastre.resaltado === actualId
  const cuenta = entrada?.fase === 'listo' ? contarHijos(hijos) : ''

  const propsDeElemento = (nodo: NodoDrive, indice: number): PropsElementoDrive => ({
    nodo,
    tipo: tipoDeNodo(nodo),
    indice,
    seleccionado: seleccion.ids.includes(nodo.id),
    enfocable: indice === (foco < 0 ? 0 : foco),
    ocupado: ocupados.has(nodo.id),
    arrastrando: arrastre.arrastre?.ids.includes(nodo.id) === true,
    arrastrable: !tactil && puedeEscribir && esEditable(nodo),
    ...(nodo.is_folder ? { destino: propsDestino(nodo.id, nodo.name) } : {}),
    renombrando: renombrandoId === nodo.id,
    validarNombre: (nombre) => (nombreRepetido(nombre, hijos, nodo.id) ? NOMBRE_REPETIDO : null),
    onGuardarNombre: (nombre) => renombrar(nodo, nombre),
    onCancelarNombre: () => {
      setRenombrandoId(null)
      enfocar(indice)
    },
    onClic: alClic,
    onAbrir: abrir,
    onCasilla: (i, conShift) => { elegir(i, conShift ? 'rango' : 'alternar') },
    onMenu: abrirMenu,
    onFoco: setFoco,
    onIniciarArrastre: alIniciarArrastre,
    onTerminarArrastre: arrastre.terminar,
    ahora
  })

  return (
    <section
      aria-label={`Archivos: ${actual.name}`}
      className="@container border-linea bg-superficie-elevada rounded-tarjeta shadow-1 overflow-clip border"
    >
      <header className="border-linea flex flex-col gap-3 border-b px-3 pt-3 pb-3 @2xl:px-4">
        <div className="flex min-h-8 items-center gap-1">
          <button
            type="button"
            onClick={() => { setPreferencias((antes) => ({ ...antes, panel: !antes.panel })) }}
            aria-label={preferencias.panel ? 'Ocultar el panel de carpetas' : 'Mostrar el panel de carpetas'}
            aria-pressed={preferencias.panel}
            className="text-texto-tenue hover:bg-hover hover:text-texto rounded-control hidden size-8 shrink-0 place-items-center @3xl:grid"
          >
            {preferencias.panel ? <PanelLeftClose className="size-4" aria-hidden="true" /> : <PanelLeftOpen className="size-4" aria-hidden="true" />}
          </button>

          <div className="min-w-0 flex-1">
            <MigasDrive migas={migas} onIr={(id) => { ir(id) }} destino={propsDestino} />
          </div>

          {nodoActual !== undefined && (
            <a
              href={nodoActual.web_view_link}
              target="_blank"
              rel="noreferrer"
              className="text-texto-tenue hover:bg-hover hover:text-texto rounded-control inline-flex h-8 shrink-0 items-center gap-1.5 px-2.5 text-xs font-semibold"
            >
              <ExternalLink className="size-3.5" aria-hidden="true" />
              <span className="hidden @xl:inline">Abrir en Drive</span>
              <span className="sr-only @xl:hidden">Abrir en Drive</span>
            </a>
          )}
        </div>

        {seleccion.ids.length > 0
          ? (
            <BarraSeleccion
              cantidad={seleccion.ids.length}
              editables={puedeEscribir ? seleccionados.filter(esEditable).length : 0}
              onMover={() => { pedirMover(seleccion.ids) }}
              onEliminar={() => { pedirEliminar(seleccion.ids) }}
              onQuitar={() => { setSeleccion(SELECCION_VACIA) }}
            />
            )
          : (
            <div className="flex flex-wrap items-center gap-2">
              <Boton
                variante="primario"
                tamano="chico"
                disabled={!puedeEscribir}
                title={puedeEscribir ? undefined : 'No tienes permiso para subir archivos aquí'}
                onClick={() => { entradaArchivos.current?.click() }}
              >
                <Upload className="size-3.5" aria-hidden="true" />
                Subir
              </Boton>
              <Boton
                variante="secundario"
                tamano="chico"
                disabled={!puedeEscribir}
                title={puedeEscribir ? undefined : 'No tienes permiso para crear carpetas aquí'}
                onClick={() => { setCreandoCarpeta(true) }}
              >
                <FolderPlus className="size-3.5" aria-hidden="true" />
                Nueva carpeta
              </Boton>

              <div className="order-last flex w-full items-center gap-2 @xl:order-none @xl:ml-auto @xl:w-auto">
                <label className="relative min-w-0 flex-1 @xl:w-52 @xl:flex-none">
                  <span className="sr-only">Buscar en {actual.name}</span>
                  <Search className="text-texto-sutil pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2" aria-hidden="true" />
                  <Entrada
                    type="search"
                    value={filtro}
                    placeholder="Buscar en esta carpeta"
                    onChange={(evento) => {
                      setFiltro(evento.target.value)
                      setSeleccion(SELECCION_VACIA)
                      setFoco(-1)
                    }}
                    onKeyDown={(evento) => {
                      if (evento.key === 'Escape' && filtro !== '') {
                        evento.preventDefault()
                        setFiltro('')
                      }
                    }}
                    className="h-8 pl-8 text-sm"
                  />
                </label>

                <MenuOrden
                  orden={preferencias.orden}
                  onCambiar={(orden) => { setPreferencias((antes) => ({ ...antes, orden })) }}
                />

                <Segmentado
                  etiqueta="Vista"
                  activo={preferencias.vista}
                  onElegir={(valor) => { setPreferencias((antes) => ({ ...antes, vista: valor === 'cuadricula' ? 'cuadricula' : 'lista' })) }}
                  opciones={[
                    { valor: 'lista', etiqueta: 'Lista', icono: 'lista' },
                    { valor: 'cuadricula', etiqueta: 'Cuadrícula', icono: 'tarjetas' }
                  ]}
                  className="hidden @lg:inline-flex"
                />
              </div>
            </div>
            )}

        <input ref={entradaArchivos} type="file" multiple className="sr-only" tabIndex={-1} aria-hidden="true" onChange={alElegirArchivos} />
      </header>

      <div className={cn(preferencias.panel && '@3xl:grid @3xl:grid-cols-[15rem_minmax(0,1fr)]')}>
        {preferencias.panel && (
          <aside aria-label="Carpetas" className="border-linea hidden border-r @3xl:block">
            <div data-lenis-prevent className="sticky top-0 max-h-[40rem] overflow-y-auto p-2">
              <ArbolLateralDrive
                raiz={raizMiga}
                actualId={actualId}
                rutaActual={migas.map((miga) => miga.id)}
                carpetas={carpetas}
                cargar={cargar}
                onIr={(id) => { ir(id) }}
                destino={propsDestino}
              />
            </div>
          </aside>
        )}

        <div
          {...propsDestino(actualId, actual.name)}
          data-destino-activo={undefined}
          onClick={(evento) => {
            if (evento.target === evento.currentTarget) setSeleccion(SELECCION_VACIA)
          }}
          className="relative min-h-72"
        >
          {creandoCarpeta && (
            <div className="border-linea-suave bg-superficie-hundida flex items-start gap-3 border-b px-3 py-2.5">
              <IconoArchivoDrive tipo="carpeta" />
              <div className="min-w-0 flex-1">
                <EditorNombreDrive
                  inicial=""
                  etiqueta="Nombre de la carpeta nueva"
                  textoGuardar="Crear"
                  validar={(nombre) => (nombreRepetido(nombre, hijos) ? NOMBRE_REPETIDO : null)}
                  onGuardar={crearCarpeta}
                  onCancelar={() => { setCreandoCarpeta(false) }}
                />
              </div>
            </div>
          )}

          <ContenidoCarpeta
            fase={entrada?.fase ?? 'cargando'}
            mensajeError={entrada?.fase === 'error' ? entrada.mensaje : ''}
            onReintentar={() => { cargar(actualId) }}
            vacia={hijos.length === 0}
            sinCoincidencias={hijos.length > 0 && visibles.length === 0}
            filtro={filtro}
            onLimpiarFiltro={() => { setFiltro('') }}
            puedeEscribir={puedeEscribir}
            onSubir={() => { entradaArchivos.current?.click() }}
            onNuevaCarpeta={() => { setCreandoCarpeta(true) }}
          >
            <div className={cn('relative transition-opacity duration-150', entrada?.fase === 'listo' && entrada.refrescando && 'opacity-60')}>
              {entrada?.fase === 'listo' && entrada.refrescando && (
                <CargandoConOrbe mensaje="Actualizando…" className="absolute top-2 right-3 z-10" />
              )}

              {preferencias.vista === 'lista'
                ? (
                  <div
                    ref={vistaRef}
                    role="grid"
                    aria-label={`Contenido de ${actual.name}`}
                    aria-multiselectable="true"
                    aria-rowcount={visibles.length + 1}
                    tabIndex={-1}
                    onKeyDown={alPulsarTecla}
                    className="outline-none"
                  >
                    <EncabezadoLista
                      orden={preferencias.orden}
                      onOrdenar={(criterio) => {
                        setPreferencias((antes) => ({
                          ...antes,
                          orden: { criterio, ascendente: antes.orden.criterio === criterio ? !antes.orden.ascendente : criterio === 'nombre' }
                        }))
                      }}
                      todos={visibles.length > 0 && seleccion.ids.length === visibles.length}
                      algunos={seleccion.ids.length > 0}
                      onTodos={(marcar) => { setSeleccion(marcar ? { ids: idsVisibles, ancla: idsVisibles[0] ?? null } : SELECCION_VACIA) }}
                    />
                    {visibles.slice(0, limite).map((nodo, indice) => <FilaDrive key={nodo.id} {...propsDeElemento(nodo, indice)} />)}
                  </div>
                  )
                : (
                  <div
                    ref={vistaRef}
                    role="grid"
                    aria-label={`Contenido de ${actual.name}`}
                    aria-multiselectable="true"
                    tabIndex={-1}
                    onKeyDown={alPulsarTecla}
                    className="grid grid-cols-[repeat(auto-fill,minmax(9.5rem,1fr))] gap-3 p-3 outline-none @2xl:p-4"
                  >
                    {visibles.slice(0, limite).map((nodo, indice) => <TarjetaDrive key={nodo.id} {...propsDeElemento(nodo, indice)} />)}
                  </div>
                  )}

              {hayMas && (
                <div ref={centinela} className="flex justify-center p-3">
                  <Boton variante="sutil" tamano="chico" onClick={() => { setLimite((antes) => antes + TANDA_DE_ITEMS) }}>
                    Mostrar {Math.min(TANDA_DE_ITEMS, visibles.length - limite)} más de {visibles.length - limite}
                  </Boton>
                </div>
              )}
            </div>
          </ContenidoCarpeta>

          {soltandoArchivos && (
            <div
              aria-hidden="true"
              className="border-acento bg-acento-suave rounded-medio pointer-events-none absolute inset-2 z-20 grid place-items-center border-2 border-dashed"
            >
              <div className="bg-superficie-flotante rounded-control shadow-2 flex items-center gap-2 px-4 py-2 text-sm font-semibold">
                <Upload className="text-acento size-4" aria-hidden="true" />
                Suelta para subir a «{actual.name}»
              </div>
            </div>
          )}
        </div>
      </div>

      {/* El pie queda pegado abajo mientras se recorre una carpeta larga: el resultado de mover o
          subir se ve sin tener que bajar hasta el final de la lista. `overflow-clip` en la sección
          (y no `hidden`) es lo que deja que esto se pegue: `hidden` la volvería su propio scroll. */}
      <div className="bg-superficie-elevada sticky bottom-0 z-20">
        {aviso !== null && (
          <div
            role={aviso.tono === 'exito' ? 'status' : 'alert'}
            className={cn(
              'border-linea flex items-start gap-3 border-t px-4 py-2.5 text-sm',
              aviso.tono === 'exito' && 'bg-superficie-exito',
              aviso.tono === 'aviso' && 'bg-superficie-aviso',
              aviso.tono === 'error' && 'bg-superficie-peligro'
            )}
          >
            <p className="text-texto min-w-0 flex-1">{aviso.texto}</p>
            <button
              type="button"
              aria-label="Cerrar aviso"
              onClick={() => { setAviso(null) }}
              className="text-texto-tenue hover:text-texto -my-1 grid size-7 shrink-0 place-items-center"
            >
              <X className="size-4" aria-hidden="true" />
            </button>
          </div>
        )}

        <BandejaSubidasDrive
          subidas={subidas.subidas}
          onCancelar={subidas.cancelar}
          onReintentar={subidas.reintentar}
          onLimpiar={subidas.limpiar}
        />

        <footer className="border-linea text-texto-sutil flex items-center gap-3 border-t px-4 py-2 text-xs">
          <span className="tabular-nums">{cuenta}</span>
          {puedeEscribir && !tactil && (
            <span className="ml-auto hidden @2xl:inline">
              Arrastra para mover o soltar archivos · <kbd className="font-sans">F2</kbd> renombra · <kbd className="font-sans">Supr</kbd> envía a la papelera
            </span>
          )}
        </footer>
      </div>

      {menu !== null && (
        <MenuDeNodos
          menu={menu}
          nodos={hijos.filter((nodo) => menu.ids.includes(nodo.id))}
          puedeEscribir={puedeEscribir}
          onCerrar={() => {
            setMenu(null)
            enfocar(menu.indice)
          }}
          onElegir={(accion) => {
            // Se cierra acá y no en `onOpenChange`: la acción puede abrir un diálogo, y un menú que
            // sigue montado debajo le disputa el foco.
            setMenu(null)
            accion()
          }}
          onAbrir={abrir}
          onRenombrar={(id) => { pedirRenombrar(id) }}
          onMover={() => { pedirMover(menu.ids) }}
          onEliminar={() => { pedirEliminar(menu.ids) }}
          onPermisos={(nodo) => { setDialogo({ tipo: 'permisos', nodo }) }}
        />
      )}

      {dialogo?.tipo === 'mover' && (
        <DialogoMoverDrive
          nodos={hijos.filter((nodo) => dialogo.ids.includes(nodo.id))}
          padreId={actualId}
          raizId={raizMiga.id}
          raizNombre={raizMiga.name}
          onElegir={(destino) => {
            setDialogo(null)
            void mover(dialogo.ids, actualId, destino)
          }}
          onCerrar={() => { setDialogo(null) }}
        />
      )}
      {dialogo?.tipo === 'eliminar' && (
        <DialogoEliminarDrive
          nodos={hijos.filter((nodo) => dialogo.ids.includes(nodo.id))}
          onConfirmar={() => { void eliminar(dialogo.ids) }}
          onCerrar={() => { setDialogo(null) }}
        />
      )}
      {dialogo?.tipo === 'permisos' && (
        <DialogoPermisosDrive folderId={dialogo.nodo.id} nombre={dialogo.nodo.name} onCerrar={() => { setDialogo(null) }} />
      )}
    </section>
  )
}

/** "3 carpetas · 12 archivos", en singular cuando toca. */
function contarHijos (hijos: readonly NodoDrive[]): string {
  const carpetas = hijos.filter((nodo) => nodo.is_folder).length
  const archivos = hijos.length - carpetas
  if (hijos.length === 0) return 'Carpeta vacía'
  return [
    carpetas > 0 ? `${carpetas} ${carpetas === 1 ? 'carpeta' : 'carpetas'}` : null,
    archivos > 0 ? `${archivos} ${archivos === 1 ? 'archivo' : 'archivos'}` : null
  ].filter(Boolean).join(' · ')
}

/**
 * La barra que reemplaza a la de acciones mientras hay algo elegido: cuántos y qué se puede hacer
 * con ellos. Ocupa el mismo alto que la otra, así la lista no salta al elegir.
 */
function BarraSeleccion ({ cantidad, editables, onMover, onEliminar, onQuitar }: {
  cantidad: number
  editables: number
  onMover: () => void
  onEliminar: () => void
  onQuitar: () => void
}) {
  const bloqueados = cantidad - editables

  return (
    <div className="bg-acento-suave rounded-control flex min-h-8 flex-wrap items-center gap-2 py-0.5 pr-1 pl-3">
      <p className="text-texto text-sm font-semibold tabular-nums" aria-live="polite">
        {cantidad === 1 ? '1 seleccionado' : `${cantidad} seleccionados`}
        {bloqueados > 0 && <span className="text-texto-tenue font-normal"> · {bloqueados} no se pueden mover</span>}
      </p>
      <div className="ml-auto flex items-center gap-1">
        <Boton variante="sutil" tamano="chico" disabled={editables === 0} onClick={onMover}>
          <FolderInput className="size-3.5" aria-hidden="true" />
          Mover a…
        </Boton>
        <Boton variante="sutil" tamano="chico" disabled={editables === 0} onClick={onEliminar}>
          <Trash2 className="size-3.5" aria-hidden="true" />
          Eliminar
        </Boton>
        <Boton variante="sutil" tamano="chico" soloIcono aria-label="Quitar la selección" onClick={onQuitar}>
          <X className="size-3.5" aria-hidden="true" />
        </Boton>
      </div>
    </div>
  )
}

/** El desplegable de orden: criterio y sentido. En la lista también ordenan los encabezados. */
function MenuOrden ({ orden, onCambiar }: { orden: OrdenDrive, onCambiar: (orden: OrdenDrive) => void }) {
  return (
    <MenuContextual>
      <DisparadorMenu asChild>
        <Boton variante="sutil" tamano="chico" aria-label={`Ordenar: ${ETIQUETA_CRITERIO[orden.criterio]}, ${orden.ascendente ? 'ascendente' : 'descendente'}`}>
          <ArrowUpDown className="size-3.5" aria-hidden="true" />
          <span className="hidden @md:inline">{ETIQUETA_CRITERIO[orden.criterio]}</span>
        </Boton>
      </DisparadorMenu>
      <ContenidoMenu align="end">
        <GrupoRadioMenu
          value={orden.criterio}
          onValueChange={(valor) => { onCambiar({ ...orden, criterio: valor as CriterioOrden }) }}
        >
          {(Object.keys(ETIQUETA_CRITERIO) as CriterioOrden[]).map((criterio) => (
            <ItemMenuRadio key={criterio} value={criterio}>{ETIQUETA_CRITERIO[criterio]}</ItemMenuRadio>
          ))}
        </GrupoRadioMenu>
        <SeparadorMenu />
        <GrupoRadioMenu
          value={orden.ascendente ? 'asc' : 'desc'}
          onValueChange={(valor) => { onCambiar({ ...orden, ascendente: valor === 'asc' }) }}
        >
          <ItemMenuRadio value="asc">Ascendente</ItemMenuRadio>
          <ItemMenuRadio value="desc">Descendente</ItemMenuRadio>
        </GrupoRadioMenu>
      </ContenidoMenu>
    </MenuContextual>
  )
}

/** Una columna de la lista que ordena, con su `aria-sort` y la flecha del sentido. */
function ColumnaOrdenable ({ criterio, orden, onOrdenar, className }: {
  criterio: CriterioOrden
  orden: OrdenDrive
  onOrdenar: (criterio: CriterioOrden) => void
  className?: string
}) {
  const activa = orden.criterio === criterio
  const Flecha = orden.ascendente ? ArrowUp : ArrowDown

  return (
    <div
      role="columnheader"
      aria-sort={activa ? (orden.ascendente ? 'ascending' : 'descending') : 'none'}
      className={className}
    >
      <button
        type="button"
        tabIndex={-1}
        onClick={() => { onOrdenar(criterio) }}
        className={cn('hover:text-texto inline-flex items-center gap-1', activa && 'text-texto')}
      >
        {ETIQUETA_CRITERIO[criterio]}
        {activa && <Flecha className="size-3" aria-hidden="true" />}
      </button>
    </div>
  )
}

/** Los encabezados de la lista: la casilla de todos y las columnas que ordenan. */
function EncabezadoLista ({ orden, onOrdenar, todos, algunos, onTodos }: {
  orden: OrdenDrive
  onOrdenar: (criterio: CriterioOrden) => void
  todos: boolean
  algunos: boolean
  onTodos: (marcar: boolean) => void
}) {
  return (
    <div
      role="row"
      aria-rowindex={1}
      className={cn(
        'border-linea text-texto-sutil hidden min-h-9 items-center gap-3 border-b px-3 text-xs font-medium @2xl:grid',
        'grid-cols-[auto_minmax(0,1fr)_8.5rem_5.5rem_auto] @4xl:grid-cols-[auto_minmax(0,1fr)_8.5rem_5.5rem_9rem_auto]'
      )}
    >
      <div role="columnheader" className="flex items-center">
        <input
          type="checkbox"
          tabIndex={-1}
          aria-label="Seleccionar todo"
          checked={todos}
          ref={(casilla) => { if (casilla !== null) casilla.indeterminate = algunos && !todos }}
          onChange={(evento) => { onTodos(evento.target.checked) }}
          className={CLASES_CASILLA}
        />
      </div>
      <ColumnaOrdenable criterio="nombre" orden={orden} onOrdenar={onOrdenar} className="pl-11" />
      <ColumnaOrdenable criterio="fecha" orden={orden} onOrdenar={onOrdenar} />
      <ColumnaOrdenable criterio="tamano" orden={orden} onOrdenar={onOrdenar} className="text-right" />
      <div role="columnheader" className="hidden @4xl:block">Subido por</div>
      <div role="columnheader" className="w-8"><span className="sr-only">Acciones</span></div>
    </div>
  )
}

/**
 * Lo que va en el lugar de la lista según la fase de la carpeta: la ventana de carga, el error con
 * reintentar, el vacío que invita a soltar, o la lista.
 */
function ContenidoCarpeta ({
  fase, mensajeError, onReintentar, vacia, sinCoincidencias, filtro, onLimpiarFiltro, puedeEscribir, onSubir, onNuevaCarpeta, children
}: {
  fase: 'cargando' | 'error' | 'listo'
  mensajeError: string
  onReintentar: () => void
  vacia: boolean
  sinCoincidencias: boolean
  filtro: string
  onLimpiarFiltro: () => void
  puedeEscribir: boolean
  onSubir: () => void
  onNuevaCarpeta: () => void
  children: React.ReactNode
}) {
  if (fase === 'cargando') return <Cargando alto="min-h-64" mensaje="Abriendo la carpeta…" className="m-3" />
  if (fase === 'error') return <ErrorEstado titulo="No se pudo abrir esta carpeta" detalle={mensajeError} onReintentar={onReintentar} className="m-3" />

  if (vacia) {
    return (
      <div className="border-linea rounded-tarjeta m-3 flex min-h-64 flex-col items-center justify-center gap-3 border-2 border-dashed px-6 py-10 text-center">
        <span className="tipo-drive rounded-medio grid size-14 place-items-center" data-tipo="carpeta" aria-hidden="true">
          <FolderOpen className="size-7" strokeWidth={1.75} />
        </span>
        <div className="flex flex-col gap-1">
          <p className="text-texto font-semibold">Esta carpeta está vacía</p>
          <p className="text-texto-tenue max-w-prose text-sm">
            {puedeEscribir
              ? 'Arrastra archivos aquí o crea una carpeta para ordenar lo que viene.'
              : 'No tienes permiso para agregar archivos en esta carpeta.'}
          </p>
        </div>
        {puedeEscribir && (
          <div className="flex flex-wrap justify-center gap-2">
            <Boton variante="primario" tamano="chico" onClick={onSubir}>
              <Upload className="size-3.5" aria-hidden="true" />
              Subir archivos
            </Boton>
            <Boton variante="secundario" tamano="chico" onClick={onNuevaCarpeta}>
              <FolderPlus className="size-3.5" aria-hidden="true" />
              Nueva carpeta
            </Boton>
          </div>
        )}
      </div>
    )
  }

  if (sinCoincidencias) {
    return (
      <div className="flex min-h-48 flex-col items-center justify-center gap-3 px-6 py-10 text-center">
        <p className="text-texto font-semibold">Nada coincide con «{filtro}»</p>
        <p className="text-texto-tenue text-sm">La búsqueda mira solo esta carpeta, no las de adentro.</p>
        <Boton variante="secundario" tamano="chico" onClick={onLimpiarFiltro}>Limpiar la búsqueda</Boton>
      </div>
    )
  }

  return <>{children}</>
}

/**
 * El menú de acciones de uno o varios items: el mismo para el clic derecho, el botón ⋯ y Shift+F10.
 *
 * Se ancla a un punto fijo de la ventana (donde se hizo clic, o bajo el botón) con un disparador
 * invisible: Radix necesita uno, y así el menú sale donde está la mano y no en una esquina de la fila.
 */
function MenuDeNodos ({ menu, nodos, puedeEscribir, onCerrar, onElegir, onAbrir, onRenombrar, onMover, onEliminar, onPermisos }: {
  menu: MenuAbierto
  nodos: readonly NodoDrive[]
  puedeEscribir: boolean
  onCerrar: () => void
  /** Cierra el menú y corre la acción elegida. */
  onElegir: (accion: () => void) => void
  onAbrir: (nodo: NodoDrive) => void
  onRenombrar: (id: string) => void
  onMover: () => void
  onEliminar: () => void
  onPermisos: (nodo: NodoDrive) => void
}) {
  const unico = nodos.length === 1 ? nodos[0] : undefined
  const editables = puedeEscribir ? nodos.filter(esEditable).length : 0
  const sufijo = nodos.length > 1 ? ` ${nodos.length} elementos` : ''

  return (
    <MenuContextual open onOpenChange={(abierto) => { if (!abierto) onCerrar() }}>
      <DisparadorMenu asChild>
        <span aria-hidden="true" className="pointer-events-none fixed size-0" style={{ left: menu.x, top: menu.y }} />
      </DisparadorMenu>
      <ContenidoMenu align="start" onCloseAutoFocus={(evento) => { evento.preventDefault() }}>
        {unico !== undefined && (
          <>
            <ItemMenu onSelect={() => { onElegir(() => { onAbrir(unico) }) }}>
              {unico.is_folder ? <FolderOpen className="size-4" aria-hidden="true" /> : <ExternalLink className="size-4" aria-hidden="true" />}
              {unico.is_folder ? 'Abrir' : 'Abrir en Drive'}
            </ItemMenu>
            {unico.is_folder && (
              <ItemMenu onSelect={() => { onElegir(() => { window.open(unico.web_view_link, '_blank', 'noopener,noreferrer') }) }}>
                <ExternalLink className="size-4" aria-hidden="true" />
                Abrir en Drive
              </ItemMenu>
            )}
            <SeparadorMenu />
            <ItemMenu disabled={editables === 0} onSelect={() => { onElegir(() => { onRenombrar(unico.id) }) }}>
              <Pencil className="size-4" aria-hidden="true" />
              Renombrar
              <span className="text-texto-sutil ml-auto pl-4 text-xs">F2</span>
            </ItemMenu>
          </>
        )}
        <ItemMenu disabled={editables === 0} onSelect={() => { onElegir(onMover) }}>
          <FolderInput className="size-4" aria-hidden="true" />
          Mover{sufijo} a…
        </ItemMenu>
        {unico?.is_folder === true && (
          <ItemMenu onSelect={() => { onElegir(() => { onPermisos(unico) }) }}>
            <Users className="size-4" aria-hidden="true" />
            Permisos
          </ItemMenu>
        )}
        <SeparadorMenu />
        <ItemMenu peligroso disabled={editables === 0} onSelect={() => { onElegir(onEliminar) }}>
          <Trash2 className="size-4" aria-hidden="true" />
          Eliminar{sufijo}
          <span className="ml-auto pl-4 text-xs opacity-70">Supr</span>
        </ItemMenu>
        {nodos.some((nodo) => nodo.locked === true) && (
          <p className="text-texto-sutil max-w-60 px-2.5 py-1.5 text-xs">
            Las carpetas de Tarea no se renombran, mueven ni eliminan.
          </p>
        )}
      </ContenidoMenu>
    </MenuContextual>
  )
}
