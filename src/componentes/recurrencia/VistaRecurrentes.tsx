'use client'

import { CalendarClock, Pause, PencilLine, Repeat2 } from 'lucide-react'
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
import { diasHasta, formatearFecha, hoyLocal } from '@/lib/fechas'
import { EsqueletoRecurrentes } from './EsqueletoRecurrentes'
import { ImportadorRecurrentes } from './ImportadorRecurrentes'
import './recurrencia.css'

/** Que parte de la lista se mira. "Atencion" junta lo atrasado y lo mal configurado. */
type Vista = 'todas' | 'atencion' | 'activas' | 'terminadas'

const VISTAS: ReadonlyArray<{ valor: Vista, etiqueta: string, estados: EstadoRegla[] }> = [
  { valor: 'todas', etiqueta: 'Todas', estados: ['activa', 'atrasada', 'sin_calcular', 'terminada', 'suspendida'] },
  { valor: 'atencion', etiqueta: 'Requieren atención', estados: ['atrasada', 'sin_calcular'] },
  { valor: 'activas', etiqueta: 'Activas', estados: ['activa'] },
  { valor: 'terminadas', etiqueta: 'Terminadas', estados: ['terminada', 'suspendida'] }
]

const SIN_FILTROS: FiltrosRecurrentes = { proyecto: '', responsable: '', area: '' }

/**
 * Tareas recurrentes: la lista de reglas y el importador, en un solo lugar.
 *
 * Una regla es una Tarea madre; por eso "Editar" abre la ficha de siempre (`ModalTarea`, por el
 * parametro `?tarea=`) en vez de un formulario propio, y "Pausar" es el mismo `PATCH` que apaga la
 * casilla "Recurrente" de la edicion. La lista escucha `ops:tareas-cambiadas`, asi que lo que se
 * guarde en la ficha vuelve reflejado sin recargar.
 *
 * Los filtros de Proyecto, responsable y area viajan a la API (`filter[...]`); la vista por estado se
 * resuelve aca, porque el estado lo calcula la API por fila y ya viene en cada una.
 *
 * @param proyectos Proyectos que la persona ve, para el filtro y para el importador
 * @param personas personas asignables, para el filtro y para resolver nombres de la planilla
 * @param areas areas del organigrama, para el filtro
 * @param capacidades lo que puede hacer sobre Tareas (`permissions.tasks` de `/me`)
 */
export function VistaRecurrentes ({ proyectos, personas, areas, capacidades }: {
  proyectos: Referencia[]
  personas: Referencia[]
  areas: Referencia[]
  capacidades: Capacidad[]
}): ReactElement {
  const [filtros, setFiltros] = useState<FiltrosRecurrentes>(SIN_FILTROS)
  const [vista, setVista] = useState<Vista>('todas')
  const [panel, setPanel] = useState<'reglas' | 'importar'>('reglas')
  const [pausadas, setPausadas] = useState<ReadonlySet<number>>(new Set())
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
                pausadas={pausadas}
                puedeEditar={puedeEditar}
                onReintentar={recargar}
                onPausada={(id) => {
                  startTransition(() => { setPausadas((antes) => new Set([...antes, id])) })
                  recargar()
                }}
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
 */
function ListaDeReglas ({ estado, vista, onVista, pausadas, puedeEditar, onReintentar, onPausada, hayFiltros }: {
  estado: EstadoCarga<ReglaRecurrente[]>
  vista: Vista
  onVista: (vista: Vista) => void
  pausadas: ReadonlySet<number>
  puedeEditar: boolean
  onReintentar: () => void
  onPausada: (id: number) => void
  hayFiltros: boolean
}): ReactElement {
  const [aPausar, setAPausar] = useState<ReglaRecurrente | null>(null)
  const reglas = useMemo(
    () => (estado.fase === 'listo' ? estado.datos.filter((regla) => !pausadas.has(regla.id)) : []),
    [estado, pausadas]
  )

  if (estado.fase === 'cargando') return <EsqueletoRecurrentes />
  if (estado.fase === 'error') return <ErrorEstado detalle={estado.mensaje} onReintentar={onReintentar} />

  const cuenta = (estados: EstadoRegla[]): number => reglas.filter((regla) => estados.includes(regla.state)).length
  const elegida = VISTAS.find((opcion) => opcion.valor === vista)
  const visibles = elegida === undefined ? reglas : reglas.filter((regla) => elegida.estados.includes(regla.state))

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
        opciones={VISTAS.map((opcion) => ({ valor: opcion.valor, etiqueta: `${opcion.etiqueta} · ${cuenta(opcion.estados)}` }))}
        className="self-start"
      />

      {visibles.length === 0
        ? <Vacio titulo="Nada en esta vista" descripcion="Todas las reglas están al día." className="border-linea rounded-tarjeta border" />
        : (
          <ul aria-label="Tareas recurrentes" className="flex flex-col gap-2">
            {visibles.map((regla, posicion) => (
              <ViewTransition key={regla.id} name={`rec-regla-${regla.id}`} exit="rec-salida" update="auto" default="none">
                <FilaDeRegla regla={regla} posicion={posicion} puedeEditar={puedeEditar} onPausar={() => { setAPausar(regla) }} />
              </ViewTransition>
            ))}
          </ul>
          )}

      <ConfirmarPausa regla={aPausar} onCerrar={() => { setAPausar(null) }} onPausada={onPausada} />
    </div>
  )
}

/**
 * Una regla: que se repite, cada cuanto, cuando toca la proxima copia y quien la hace.
 *
 * El nombre es el foco de la fila (peso y tamaño); frecuencia y fechas son el segundo nivel. La
 * proxima copia se escribe en fecha y en distancia ("en 3 dias"), que es lo que se pregunta al mirar.
 */
function FilaDeRegla ({ regla, posicion, puedeEditar, onPausar }: {
  regla: ReglaRecurrente
  posicion: number
  puedeEditar: boolean
  onPausar: () => void
}): ReactElement {
  const router = useRouter()
  const ruta = usePathname()
  const params = useSearchParams()
  const estado = ESTADOS_REGLA[regla.state]
  const hoy = hoyLocal()
  const aunNoEmpieza = regla.copies_count === 0 && regla.start_date !== null && regla.start_date > hoy

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
      className="rec-escalonada border-linea bg-superficie rounded-tarjeta hover:border-linea-fuerte grid grid-cols-1 items-center gap-x-4 gap-y-2 border px-4 py-3 transition-colors duration-150 md:grid-cols-[minmax(0,2.2fr)_minmax(0,1fr)_minmax(0,1fr)_auto]"
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
      </div>

      <div className="flex min-w-0 flex-col gap-1 text-sm">
        <span className="text-texto inline-flex items-center gap-1.5">
          <Repeat2 size={14} aria-hidden="true" className="text-texto-sutil shrink-0" />
          {regla.frequency_label ?? 'Sin frecuencia'}
        </span>
        <span className="text-texto-sutil text-xs">{textoDeFin(regla, (fecha) => formatearFecha(fecha))}</span>
      </div>

      <div className="flex min-w-0 flex-col gap-1 text-sm">
        <span className="text-texto inline-flex items-center gap-1.5">
          <CalendarClock size={14} aria-hidden="true" className="text-texto-sutil shrink-0" />
          {regla.next_date === null
            ? 'Sin próxima copia'
            : aunNoEmpieza
              ? `Empieza el ${formatearFecha(regla.start_date)}`
              : <>{formatearFecha(regla.next_date)} <span className="text-texto-sutil text-xs">({textoDeDistancia(diasHasta(regla.next_date) ?? 0)})</span></>}
        </span>
        {regla.last_copy === null
          ? <span className="text-texto-sutil text-xs">Todavía sin copias</span>
          : (
            <button
              type="button"
              onClick={() => { abrir(regla.last_copy?.id ?? regla.id) }}
              className="text-texto-sutil hover:text-acento self-start text-left text-xs underline-offset-2 transition-colors duration-150 hover:underline"
            >
              Última copia: {formatearFecha(regla.last_copy.start_date ?? regla.last_copy.created_at)}
            </button>
            )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 md:justify-end">
        <GrupoAvatares personas={regla.assignees} />
        <span className="rec-marca" style={{ '--i': posicion } as React.CSSProperties} title={estado.ayuda}>
          <Insignia tono={estado.tono}>{estado.etiqueta}</Insignia>
        </span>
        {puedeEditar && (
          <span className="flex items-center gap-1">
            <Boton variante="sutil" tamano="chico" soloIcono aria-label={`Editar ${regla.name}`} title="Editar" onClick={() => { abrir(regla.id) }}>
              <PencilLine size={15} aria-hidden="true" />
            </Boton>
            <Boton variante="sutil" tamano="chico" soloIcono aria-label={`Pausar ${regla.name}`} title="Pausar" onClick={onPausar}>
              <Pause size={15} aria-hidden="true" />
            </Boton>
          </span>
        )}
      </div>
    </li>
  )
}

/**
 * Confirma y aplica la pausa: el `PATCH` que apaga `recurring`.
 *
 * Se confirma porque no es reversible con un clic: la API borra la frecuencia al apagar la
 * recurrencia (`ParcheProceso::CANCELAR`), asi que reanudar es volver a configurarla en la ficha.
 * Las copias ya creadas no se tocan.
 */
function ConfirmarPausa ({ regla, onCerrar, onPausada }: {
  regla: ReglaRecurrente | null
  onCerrar: () => void
  onPausada: (id: number) => void
}): ReactElement {
  const [enCurso, setEnCurso] = useState(false)
  const [error, setError] = useState<string | null>(null)

  /** Manda el PATCH y, si sale bien, saca la fila de la lista con su transicion. */
  async function pausar (): Promise<void> {
    if (regla === null) return
    setEnCurso(true)
    setError(null)
    const resultado = await escribirEnBff(`tasks/${regla.id}`, 'PATCH', { recurring: false })
    setEnCurso(false)

    if (!resultado.ok) {
      setError(resultado.mensaje)
      return
    }

    onPausada(regla.id)
    onCerrar()
  }

  return (
    <Dialogo open={regla !== null} onOpenChange={(abierto) => { if (!abierto) { setError(null); onCerrar() } }}>
      <ContenidoDialogo
        titulo="¿Pausar esta tarea recurrente?"
        descripcion="Deja de generar copias. Las que ya existen se quedan como están."
        ancho="chico"
      >
        <p className="text-texto text-sm font-semibold">{regla?.name}</p>
        <p className="text-texto-tenue mt-2 text-sm">
          Para reanudarla, abre la tarea y vuelve a marcarla como recurrente con su frecuencia.
        </p>
        {error !== null && <p role="alert" className="text-texto-peligro animate-entrar-abajo mt-3 text-sm">{error}</p>}
        <div className="mt-5 flex justify-end gap-2">
          <Boton variante="secundario" onClick={onCerrar} disabled={enCurso}>Cancelar</Boton>
          <Boton variante="peligro" cargando={enCurso} onClick={() => { void pausar() }}>Pausar</Boton>
        </div>
      </ContenidoDialogo>
    </Dialogo>
  )
}
