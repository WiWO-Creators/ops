'use client'

import { BellRing, CalendarClock, Eraser, History, Pause, PencilLine, Play, Repeat2, RepeatOff, TriangleAlert } from 'lucide-react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { startTransition, useEffect, useMemo, useState, ViewTransition, type ReactElement } from 'react'
import { escribirEnBff } from '@/componentes/datos/mutaciones'
import { PARAMETRO_TAREA } from '@/componentes/datos/tabla'
import { ErrorEstado, Vacio } from '@/componentes/estado/Estados'
import { Boton } from '@/componentes/formularios/Boton'
import { Segmentado } from '@/componentes/formularios/Segmentado'
import { SelectorBuscable } from '@/componentes/formularios/Selector'
import { GrupoAvatares } from '@/componentes/presentadores/Avatar'
import { Insignia } from '@/componentes/presentadores/Insignia'
import { ModalTarea } from '@/componentes/proyecto/ModalTarea'
import { useRecurso, type EstadoCarga } from '@/componentes/proyecto/carga'
import { ContenidoDialogo, Dialogo } from '@/componentes/superposiciones/Dialogo'
import { EVENTO_TAREAS_CAMBIADAS } from '@/datos/refresco-lista'
import type { Referencia } from '@/datos/recursos'
import type { Capacidad } from '@/datos/tipos'
import {
  ESTADOS_REGLA, rutaDeRecurrentes, textoDeDistancia, textoDeFin, type EstadoRegla, type FiltrosRecurrentes, type ReglaRecurrente
} from '@/dominio/recurrencia'
import { avisoDeSinUso, estaSinUso, PARAMETRO_REGLA, reglaDeLaUrl } from '@/dominio/copias-recurrencia'
import { diasHasta, formatearFecha, hoyLocal } from '@/lib/fechas'
import { cn } from '@/lib/clases'
import { EditorDeRegla } from './EditorDeRegla'
import { EsqueletoRecurrentes } from './EsqueletoRecurrentes'
import { HistorialDeCopias } from './HistorialDeCopias'
import { LimpiezaDeCopias, type ReglaALimpiar } from './LimpiezaDeCopias'
import { ImportadorRecurrentes } from './ImportadorRecurrentes'
import './recurrencia.css'

/**
 * Que parte de la lista se mira. "Atencion" junta lo atrasado, lo mal configurado y lo que nadie usa:
 * las tres cosas piden que alguien haga algo con la regla.
 */
type Vista = 'todas' | 'atencion' | 'sin_uso' | 'activas' | 'pausadas' | 'terminadas'

/** True si la regla esta en alguno de esos estados. */
const enEstado = (...estados: EstadoRegla[]) => (regla: ReglaRecurrente): boolean => estados.includes(regla.state)

const VISTAS: ReadonlyArray<{ valor: Vista, etiqueta: string, incluye: (regla: ReglaRecurrente) => boolean, vacia: string }> = [
  { valor: 'todas', etiqueta: 'Todas', incluye: () => true, vacia: 'No hay reglas.' },
  {
    valor: 'atencion',
    etiqueta: 'Requieren atención',
    incluye: (regla) => enEstado('atrasada', 'sin_calcular')(regla) || estaSinUso(regla),
    vacia: 'Todas las reglas están al día.'
  },
  { valor: 'sin_uso', etiqueta: 'Sin uso', incluye: estaSinUso, vacia: 'Todas las reglas tienen copias que alguien usó.' },
  { valor: 'activas', etiqueta: 'Activas', incluye: enEstado('activa'), vacia: 'Ninguna regla está generando copias ahora.' },
  { valor: 'pausadas', etiqueta: 'Pausadas', incluye: enEstado('pausada'), vacia: 'No hay reglas pausadas.' },
  { valor: 'terminadas', etiqueta: 'Terminadas', incluye: enEstado('terminada', 'suspendida'), vacia: 'Ninguna regla terminó todavía.' }
]

/** Lo que se confirma antes de aplicarlo. Reanudar no esta: no pierde nada y no se confirma. */
type Confirmable = 'pausar' | 'dejar'

const SIN_FILTROS: FiltrosRecurrentes = { proyecto: '', responsable: '', area: '' }

/**
 * Tareas recurrentes: la lista de reglas y el importador, en un solo lugar.
 *
 * Una regla es una Tarea madre. El nombre abre su ficha (`ModalTarea`, por el parametro `?tarea=`);
 * "Editar regla" abre en un clic el editor de la regla (`EditorDeRegla`), que es lo que se viene a
 * cambiar aca. Pausar y reanudar conservan la regla (`recurring_paused`); "Dejar de repetir" es el
 * `PATCH` que la borra. La lista escucha `ops:tareas-cambiadas`, asi que cualquier escritura —aca, en
 * la ficha o en el editor— vuelve reflejada sin recargar.
 *
 * Los filtros de Proyecto, responsable y area viajan a la API (`filter[...]`); la vista por estado se
 * resuelve aca, porque el estado lo calcula la API por fila y ya viene en cada una.
 *
 * @param proyectos Proyectos que la persona ve, para el filtro y para el importador
 * @param personas personas asignables, para el filtro y para resolver nombres de la planilla
 * @param areas areas del organigrama, para el filtro
 * @param capacidades lo que puede hacer sobre Tareas (`permissions.tasks` de `/me`)
 * @param esAdmin si puede limpiar copias sin uso (`is_admin` o `is_superadmin` de `/me`)
 */
export function VistaRecurrentes ({ proyectos, personas, areas, capacidades, esAdmin }: {
  proyectos: Referencia[]
  personas: Referencia[]
  areas: Referencia[]
  capacidades: Capacidad[]
  esAdmin: boolean
}): ReactElement {
  const [filtros, setFiltros] = useState<FiltrosRecurrentes>(SIN_FILTROS)
  const [vista, setVista] = useState<Vista>('todas')
  const [panel, setPanel] = useState<'reglas' | 'importar'>('reglas')
  const { estado, recargar } = useRecurso<ReglaRecurrente[]>(rutaDeRecurrentes(filtros), 'No se pudieron cargar las tareas recurrentes.')

  useEffect(() => {
    window.addEventListener(EVENTO_TAREAS_CAMBIADAS, recargar)

    return () => { window.removeEventListener(EVENTO_TAREAS_CAMBIADAS, recargar) }
  }, [recargar])

  const puedeCrear = capacidades.includes('create')
  const puedeEditar = capacidades.includes('edit')

  /** Cambia de panel dentro de una transicion, para que `<ViewTransition>` anime el relevo. */
  function mostrar (siguiente: string): void {
    startTransition(() => { setPanel(siguiente === 'importar' ? 'importar' : 'reglas') })
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <Segmentado
          etiqueta="Qué mirar"
          activo={panel}
          onElegir={mostrar}
          opciones={[
            { valor: 'reglas', etiqueta: 'Reglas', icono: 'tabla' },
            ...(puedeCrear ? [{ valor: 'importar', etiqueta: 'Importar planilla' }] : [])
          ]}
        />
      </div>

      {panel === 'reglas'
        ? (
          <ViewTransition key="reglas" enter="rec-entrada" exit="rec-salida" default="none">
            <div className="flex flex-col gap-4">
              <BarraDeFiltros
                filtros={filtros}
                onCambiar={setFiltros}
                proyectos={proyectos}
                personas={personas}
                areas={areas}
              />
              <ListaDeReglas
                estado={estado}
                vista={vista}
                onVista={setVista}
                puedeEditar={puedeEditar}
                esAdmin={esAdmin}
                onReintentar={recargar}
                hayFiltros={filtros.proyecto !== '' || filtros.responsable !== '' || filtros.area !== ''}
              />
            </div>
          </ViewTransition>
          )
        : (
          <ViewTransition key="importar" enter="rec-entrada" exit="rec-salida" default="none">
            <div>
              <ImportadorRecurrentes
                proyectos={proyectos}
                personas={personas}
                onTerminar={(creadas) => {
                  if (creadas > 0) recargar()
                  mostrar('reglas')
                }}
              />
            </div>
          </ViewTransition>
          )}

      <ModalTarea puedeEditar={puedeEditar} puedeBorrar={capacidades.includes('delete')} puedeCrear={puedeCrear} />
    </div>
  )
}

/**
 * Proyecto, responsable y area. Cada uno con su opcion "todos", que es la que devuelve el filtro a
 * vacio: un selector de filtro sin forma de quitarlo obliga a recargar la pagina.
 */
function BarraDeFiltros ({ filtros, onCambiar, proyectos, personas, areas }: {
  filtros: FiltrosRecurrentes
  onCambiar: (filtros: FiltrosRecurrentes) => void
  proyectos: Referencia[]
  personas: Referencia[]
  areas: Referencia[]
}): ReactElement {
  const opciones = (lista: Referencia[], todos: string): Array<{ valor: string, etiqueta: string }> => [
    { valor: '', etiqueta: todos },
    ...lista.map((elemento) => ({ valor: String(elemento.id), etiqueta: elemento.name }))
  ]

  return (
    <div role="group" aria-label="Filtros" className="grid grid-cols-1 gap-2 sm:grid-cols-3">
      <SelectorBuscable
        nombre="proyecto"
        marcador="Todos los proyectos"
        valor={filtros.proyecto}
        onElegir={(valor) => { onCambiar({ ...filtros, proyecto: valor }) }}
        opciones={opciones(proyectos, 'Todos los proyectos')}
      />
      <SelectorBuscable
        nombre="persona"
        marcador="Todos los responsables"
        valor={filtros.responsable}
        onElegir={(valor) => { onCambiar({ ...filtros, responsable: valor }) }}
        opciones={opciones(personas, 'Todos los responsables')}
      />
      <SelectorBuscable
        nombre="área"
        marcador="Todas las áreas"
        valor={filtros.area}
        onElegir={(valor) => { onCambiar({ ...filtros, area: valor }) }}
        opciones={opciones(areas, 'Todas las áreas')}
      />
    </div>
  )
}

/**
 * La lista con sus cuatro estados: cargando (esqueleto), error, vacia y con reglas.
 *
 * Tambien es duena de lo que se abre sobre ella —el editor de la regla y las dos confirmaciones—, asi
 * hay uno solo de cada uno para toda la lista y no uno montado por fila.
 */
function ListaDeReglas ({ estado, vista, onVista, puedeEditar, esAdmin, onReintentar, hayFiltros }: {
  estado: EstadoCarga<ReglaRecurrente[]>
  vista: Vista
  onVista: (vista: Vista) => void
  puedeEditar: boolean
  esAdmin: boolean
  onReintentar: () => void
  hayFiltros: boolean
}): ReactElement {
  // El ultimo pedido se conserva al cerrar: si se borrara, el dialogo cambiaria de titulo durante su
  // animacion de salida. Lo que abre y cierra es `confirmando`.
  const [aConfirmar, setAConfirmar] = useState<{ regla: ReglaRecurrente, accion: Confirmable } | null>(null)
  const [confirmando, setConfirmando] = useState(false)
  const [aEditar, setAEditar] = useState<ReglaRecurrente | null>(null)
  const [aVerCopias, setAVerCopias] = useState<ReglaALimpiar | null>(null)
  const [aLimpiar, setALimpiar] = useState<ReglaALimpiar | null>(null)
  const reglas = useMemo(() => (estado.fase === 'listo' ? estado.datos : []), [estado])

  // `?regla={id}` es el enlace de la campana de "sin uso": abre el historial de esa regla y la
  // resalta en la lista. Se deriva en vez de copiarse a un estado: la lista llega despues que la URL.
  const router = useRouter()
  const ruta = usePathname()
  const params = useSearchParams()
  const reglaPedida = reglaDeLaUrl(params.get(PARAMETRO_REGLA))
  const [atendida, setAtendida] = useState<number | null>(null)
  const pedida = reglaPedida === null ? undefined : reglas.find((regla) => regla.id === reglaPedida)
  const historial = aVerCopias ?? (pedida !== undefined && pedida.id !== atendida ? { id: pedida.id, name: pedida.name } : null)

  /** Cierra el historial y, si lo abrio la URL, saca el parametro para no reabrirlo al recargar. */
  function cerrarHistorial (): void {
    setAVerCopias(null)
    if (reglaPedida === null) return
    setAtendida(reglaPedida)
    const siguientes = new URLSearchParams(params.toString())
    siguientes.delete(PARAMETRO_REGLA)
    const texto = siguientes.toString()
    router.replace(texto === '' ? ruta : `${ruta}?${texto}`, { scroll: false })
  }

  const elegida = VISTAS.find((opcion) => opcion.valor === vista)
  const visibles = elegida === undefined ? reglas : reglas.filter(elegida.incluye)

  // Los dialogos van siempre en la misma posicion del arbol, fuera de lo que cambia con la carga:
  // cada escritura recarga la lista (pasa por "cargando"), y si colgaran del contenido se
  // desmontarian a mitad de un flujo —la limpieza volvia a validar apenas terminaba de aplicar—.
  return (
    <>
      <ContenidoDeLista
        estado={estado}
        vista={vista}
        onVista={onVista}
        reglas={reglas}
        visibles={visibles}
        vacia={elegida?.vacia ?? 'No hay reglas.'}
        onReintentar={onReintentar}
        hayFiltros={hayFiltros}
        fila={(regla, posicion) => (
          <FilaDeRegla
            regla={regla}
            posicion={posicion}
            puedeEditar={puedeEditar}
            esAdmin={esAdmin}
            resaltada={regla.id === reglaPedida}
            onVerCopias={() => { setAVerCopias({ id: regla.id, name: regla.name }) }}
            onLimpiar={() => { setALimpiar({ id: regla.id, name: regla.name }) }}
            onEditar={() => { setAEditar(regla) }}
            onConfirmar={(accion) => { setAConfirmar({ regla, accion }); setConfirmando(true) }}
          />
        )}
      />
      <EditorDeRegla tarea={aEditar} onCerrar={() => { setAEditar(null) }} />
      <ConfirmarCambioDeRegla pedido={aConfirmar} abierto={confirmando} onCerrar={() => { setConfirmando(false) }} />
      <HistorialDeCopias regla={historial} esAdmin={esAdmin} onCerrar={cerrarHistorial} />
      <LimpiezaDeCopias regla={aLimpiar} onCerrar={() => { setALimpiar(null) }} />
    </>
  )
}

/**
 * Lo que se ve de la lista segun su carga: esqueleto, error, vacia, o las vistas con sus reglas.
 *
 * @param fila dibuja una regla; la arma quien es dueño de los dialogos que esa fila abre
 */
function ContenidoDeLista ({ estado, vista, onVista, reglas, visibles, vacia, onReintentar, hayFiltros, fila }: {
  estado: EstadoCarga<ReglaRecurrente[]>
  vista: Vista
  onVista: (vista: Vista) => void
  reglas: ReglaRecurrente[]
  visibles: ReglaRecurrente[]
  vacia: string
  onReintentar: () => void
  hayFiltros: boolean
  fila: (regla: ReglaRecurrente, posicion: number) => ReactElement
}): ReactElement {
  if (estado.fase === 'cargando') return <EsqueletoRecurrentes />
  if (estado.fase === 'error') return <ErrorEstado detalle={estado.mensaje} onReintentar={onReintentar} />

  if (reglas.length === 0) {
    return (
      <Vacio
        className="border-linea rounded-tarjeta border"
        titulo={hayFiltros ? 'Ninguna tarea recurrente con estos filtros' : 'Todavía no hay tareas recurrentes'}
        descripcion={hayFiltros
          ? 'Prueba con otro Proyecto, responsable o área.'
          : 'Marca una tarea como "Recurrente" al crearla, o importa tu planilla con la lista completa.'}
      />
    )
  }

  return (
    <div className="flex flex-col gap-3">
      <Segmentado
        etiqueta="Estado de las reglas"
        tamano="chico"
        activo={vista}
        onElegir={(valor) => { onVista(VISTAS.find((opcion) => opcion.valor === valor)?.valor ?? 'todas') }}
        opciones={VISTAS.map((opcion) => ({ valor: opcion.valor, etiqueta: `${opcion.etiqueta} · ${reglas.filter(opcion.incluye).length}` }))}
        className="self-start"
      />

      {visibles.length === 0
        ? <Vacio titulo="Nada en esta vista" descripcion={vacia} className="border-linea rounded-tarjeta border" />
        : (
          <ul aria-label="Tareas recurrentes" className="flex flex-col gap-2">
            {visibles.map((regla, posicion) => (
              <ViewTransition key={regla.id} name={`rec-regla-${regla.id}`} exit="rec-salida" update="auto" default="none">
                {fila(regla, posicion)}
              </ViewTransition>
            ))}
          </ul>
          )}
    </div>
  )
}

/**
 * Una regla: que se repite, cada cuanto, cuando toca la proxima copia y quien la hace.
 *
 * El nombre es el foco de la fila (peso y tamaño); frecuencia y fechas son el segundo nivel. La
 * proxima copia se escribe en fecha y en distancia ("en 3 dias"), que es lo que se pregunta al mirar.
 * Una regla pausada no tiene proxima copia: en su lugar dice desde cuando esta pausada y que pasa
 * al reanudarla, que es lo unico que hay que saber antes de apretar el boton.
 */
function FilaDeRegla ({ regla, posicion, puedeEditar, esAdmin, resaltada, onVerCopias, onLimpiar, onEditar, onConfirmar }: {
  regla: ReglaRecurrente
  posicion: number
  puedeEditar: boolean
  esAdmin: boolean
  /** La pidio la URL (`?regla=`): se marca para encontrarla de un vistazo. */
  resaltada: boolean
  onVerCopias: () => void
  onLimpiar: () => void
  onEditar: () => void
  onConfirmar: (accion: Confirmable) => void
}): ReactElement {
  const router = useRouter()
  const ruta = usePathname()
  const params = useSearchParams()
  const estado = ESTADOS_REGLA[regla.state]
  const hoy = hoyLocal()
  const aunNoEmpieza = regla.copies_count === 0 && regla.start_date !== null && regla.start_date > hoy
  const pausada = regla.state === 'pausada'
  // Una regla que ya termino (o cuya Tarea esta completada) no tiene nada que pausar.
  const pausable = regla.state === 'activa' || regla.state === 'atrasada'
  const sinUso = avisoDeSinUso(regla.usage, (fecha) => formatearFecha(fecha))
  const limpiable = esAdmin && (regla.usage?.untouched_count ?? 0) > 0

  /** Abre la ficha de una Tarea sobre esta misma pantalla, como hace el listado de Tareas. */
  function abrir (id: number): void {
    const siguientes = new URLSearchParams(params.toString())
    siguientes.set(PARAMETRO_TAREA, String(id))
    router.replace(`${ruta}?${siguientes.toString()}`, { scroll: false })
  }

  const donde = [regla.project?.name, regla.client?.name].filter((parte) => parte !== undefined && parte !== '').join(' · ')

  return (
    <li
      style={{ '--i': posicion } as React.CSSProperties}
      data-resaltada={resaltada || undefined}
      className={cn(
        'rec-escalonada border-linea bg-superficie rounded-tarjeta hover:border-linea-fuerte grid grid-cols-1 items-center gap-x-4 gap-y-2 border px-4 py-3 transition-colors duration-150 md:grid-cols-[minmax(0,2.2fr)_minmax(0,1fr)_minmax(0,1fr)_auto]',
        resaltada && 'border-acento ring-acento/30 ring-2'
      )}
    >
      <div className="flex min-w-0 flex-col gap-1">
        <button
          type="button"
          onClick={() => { abrir(regla.id) }}
          className="text-texto hover:text-acento truncate text-left font-semibold transition-colors duration-150"
        >
          {regla.name}
        </button>
        <p className="text-texto-tenue truncate text-xs">{donde === '' ? 'Sin Proyecto' : donde}</p>
        {sinUso !== null && (
          <p className="text-texto-aviso flex flex-wrap items-center gap-x-1.5 text-xs">
            <TriangleAlert size={13} aria-hidden="true" className="shrink-0" />
            <span>{sinUso.texto}</span>
            {sinUso.avisado !== null && (
              <span className="text-texto-sutil inline-flex items-center gap-1">
                <BellRing size={12} aria-hidden="true" />
                {sinUso.avisado}
              </span>
            )}
          </p>
        )}
      </div>

      <div className="flex min-w-0 flex-col gap-1 text-sm">
        <span className="text-texto inline-flex items-center gap-1.5">
          <Repeat2 size={14} aria-hidden="true" className="text-texto-sutil shrink-0" />
          {regla.frequency_label ?? 'Sin frecuencia'}
        </span>
        <span className="text-texto-sutil text-xs">{textoDeFin(regla, (fecha) => formatearFecha(fecha))}</span>
      </div>

      <div className="flex min-w-0 flex-col gap-1 text-sm">
        {pausada
          ? (
            <>
              <span className="text-texto inline-flex items-center gap-1.5">
                <Pause size={14} aria-hidden="true" className="text-texto-sutil shrink-0" />
                {regla.paused_at === null ? 'Pausada' : `Pausada desde el ${formatearFecha(regla.paused_at)}`}
              </span>
              <span className="text-texto-sutil text-xs">Al reanudarla no se crean las copias que correspondían mientras estuvo pausada.</span>
            </>
            )
          : (
            <span className="text-texto inline-flex items-center gap-1.5">
              <CalendarClock size={14} aria-hidden="true" className="text-texto-sutil shrink-0" />
              {regla.next_date === null
                ? 'Sin próxima copia'
                : aunNoEmpieza
                  ? `Empieza el ${formatearFecha(regla.start_date)}`
                  : <>{formatearFecha(regla.next_date)} <span className="text-texto-sutil text-xs">({textoDeDistancia(diasHasta(regla.next_date) ?? 0)})</span></>}
            </span>
            )}
        {!pausada && (regla.last_copy === null
          ? <span className="text-texto-sutil text-xs">Todavía sin copias</span>
          : (
            <button
              type="button"
              onClick={() => { abrir(regla.last_copy?.id ?? regla.id) }}
              className="text-texto-sutil hover:text-acento self-start text-left text-xs underline-offset-2 transition-colors duration-150 hover:underline"
            >
              Última copia: {formatearFecha(regla.last_copy.start_date ?? regla.last_copy.created_at)}
            </button>
            ))}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 md:justify-end">
        <GrupoAvatares personas={regla.assignees} />
        <span className="rec-marca" style={{ '--i': posicion } as React.CSSProperties} title={estado.ayuda}>
          <Insignia tono={estado.tono}>{estado.etiqueta}</Insignia>
        </span>
        <span className="flex items-center gap-1">
          <Boton variante="sutil" tamano="chico" soloIcono aria-label={`Ver las copias de ${regla.name}`} title="Ver copias" onClick={onVerCopias}>
            <History size={15} aria-hidden="true" />
          </Boton>
          {limpiable && (
            <Boton variante="sutil" tamano="chico" soloIcono aria-label={`Limpiar copias sin uso de ${regla.name}`} title="Limpiar copias sin uso" onClick={onLimpiar}>
              <Eraser size={15} aria-hidden="true" />
            </Boton>
          )}
        </span>
        {puedeEditar && (
          <span className="flex items-center gap-1">
            {pausada && <BotonReanudar regla={regla} />}
            <Boton variante="sutil" tamano="chico" soloIcono aria-label={`Editar la regla de ${regla.name}`} title="Editar regla" onClick={onEditar}>
              <PencilLine size={15} aria-hidden="true" />
            </Boton>
            {pausable && (
              <Boton variante="sutil" tamano="chico" soloIcono aria-label={`Pausar ${regla.name}`} title="Pausar" onClick={() => { onConfirmar('pausar') }}>
                <Pause size={15} aria-hidden="true" />
              </Boton>
            )}
            <Boton
              variante="sutil"
              tamano="chico"
              soloIcono
              aria-label={`Dejar de repetir ${regla.name}`}
              title="Dejar de repetir"
              onClick={() => { onConfirmar('dejar') }}
              className="hover:text-texto-peligro"
            >
              <RepeatOff size={15} aria-hidden="true" />
            </Boton>
          </span>
        )}
      </div>
    </li>
  )
}

/**
 * Reanuda una regla pausada, sin confirmar: no pierde nada, y lo unico que conviene saber —que no se
 * crean las copias de la pausa— ya esta escrito en la misma fila. La lista se recarga sola por el
 * aviso de `escribirEnBff`.
 */
function BotonReanudar ({ regla }: { regla: ReglaRecurrente }): ReactElement {
  const [enCurso, setEnCurso] = useState(false)
  const [error, setError] = useState<string | null>(null)

  /** Manda el `PATCH` que quita la pausa. */
  async function reanudar (): Promise<void> {
    setEnCurso(true)
    setError(null)
    const resultado = await escribirEnBff(`tasks/${regla.id}`, 'PATCH', { recurring_paused: false })
    setEnCurso(false)
    if (!resultado.ok) setError(resultado.mensaje)
  }

  return (
    <>
      <Boton variante="secundario" tamano="chico" cargando={enCurso} onClick={() => { void reanudar() }} aria-label={`Reanudar ${regla.name}`}>
        {!enCurso && <Play size={13} aria-hidden="true" />}
        Reanudar
      </Boton>
      {error !== null && <span role="alert" className="text-texto-peligro basis-full text-right text-xs">{error}</span>}
    </>
  )
}

/** Textos y cuerpo de cada accion que se confirma. */
const CONFIRMACIONES: Record<Confirmable, {
  titulo: string
  descripcion: string
  detalle: string
  boton: string
  variante: 'primario' | 'peligro'
  cuerpo: Record<string, boolean>
}> = {
  pausar: {
    titulo: '¿Pausar esta tarea recurrente?',
    descripcion: 'Deja de generar copias hasta que la reanudes. La regla se conserva.',
    detalle: 'Las copias que ya existen se quedan como están. Al reanudar no se crean las que correspondían durante la pausa.',
    boton: 'Pausar',
    variante: 'primario',
    cuerpo: { recurring_paused: true }
  },
  dejar: {
    titulo: '¿Dejar de repetir esta tarea?',
    descripcion: 'Se borra la regla: frecuencia, días excluidos y cómo termina. No se puede reanudar.',
    detalle: 'Las copias que ya existen se quedan como están. Para volver a repetirla habrá que configurar la recurrencia desde cero. Si solo quieres detenerla un tiempo, usa Pausar.',
    boton: 'Dejar de repetir',
    variante: 'peligro',
    // Como `ParcheProceso::CANCELAR`: apagar la recurrencia borra toda su configuracion.
    cuerpo: { recurring: false }
  }
}

/**
 * Confirma y aplica pausar o dejar de repetir.
 *
 * Pausar se confirma por ser una accion que cambia lo que el cron hace mañana, aunque se deshaga con
 * un clic; dejar de repetir se confirma en rojo porque borra la regla y no tiene vuelta atras.
 */
function ConfirmarCambioDeRegla ({ pedido, abierto, onCerrar }: {
  pedido: { regla: ReglaRecurrente, accion: Confirmable } | null
  abierto: boolean
  onCerrar: () => void
}): ReactElement {
  const [enCurso, setEnCurso] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const textos = CONFIRMACIONES[pedido?.accion ?? 'pausar']

  /** Cierra y olvida el error, para que no reaparezca al abrir la proxima. */
  function cerrar (): void {
    setError(null)
    onCerrar()
  }

  /** Manda el PATCH; si sale bien cierra, y la lista se recarga por el aviso de `escribirEnBff`. */
  async function aplicar (): Promise<void> {
    if (pedido === null) return
    setEnCurso(true)
    setError(null)
    const resultado = await escribirEnBff(`tasks/${pedido.regla.id}`, 'PATCH', textos.cuerpo)
    setEnCurso(false)

    if (!resultado.ok) {
      setError(resultado.mensaje)
      return
    }

    cerrar()
  }

  return (
    <Dialogo open={abierto && pedido !== null} onOpenChange={(siguiente) => { if (!siguiente) cerrar() }}>
      <ContenidoDialogo titulo={textos.titulo} descripcion={textos.descripcion} ancho="chico">
        <p className="text-texto text-sm font-semibold">{pedido?.regla.name}</p>
        <p className="text-texto-tenue mt-2 text-sm">{textos.detalle}</p>
        {error !== null && <p role="alert" className="text-texto-peligro animate-entrar-abajo mt-3 text-sm">{error}</p>}
        <div className="mt-5 flex justify-end gap-2">
          <Boton variante="secundario" onClick={cerrar} disabled={enCurso}>Cancelar</Boton>
          <Boton variante={textos.variante} cargando={enCurso} onClick={() => { void aplicar() }}>{textos.boton}</Boton>
        </div>
      </ContenidoDialogo>
    </Dialogo>
  )
}
