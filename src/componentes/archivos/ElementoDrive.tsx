'use client'

import type { DragEvent, KeyboardEvent, MouseEvent, ReactNode } from 'react'
import { Ellipsis, Lock } from 'lucide-react'
import { IconoArchivoDrive } from '@/componentes/archivos/IconoArchivoDrive'
import { EditorNombreDrive } from '@/componentes/archivos/EdicionDrive'
import type { PropsDestino } from '@/componentes/archivos/useArrastreDrive'
import { CLASES_CASILLA } from '@/componentes/formularios/Entrada'
import { ETIQUETA_TIPO, fechaDeModificacion, formatearTamano, type TipoArchivoDrive } from '@/dominio/drive-explorador'
import { cn } from '@/lib/clases'
import type { NodoDrive } from '@/datos/recursos'

/** Todo lo que una fila o una tarjeta necesita saber y avisar. Es lo mismo en las dos vistas. */
export interface PropsElementoDrive {
  nodo: NodoDrive
  tipo: TipoArchivoDrive
  indice: number
  seleccionado: boolean
  /** Si es el item con el foco de la vista: el único con `tabIndex=0`. */
  enfocable: boolean
  /** Operación en curso sobre el item (borrado): se atenúa y no se toca. */
  ocupado: boolean
  /** Si es parte de lo que se está arrastrando. */
  arrastrando: boolean
  /** Si se puede arrastrar: su carpeta deja escribir, no es de sistema y no es una pantalla táctil. */
  arrastrable: boolean
  /** Props de destino, solo en carpetas. */
  destino?: PropsDestino
  /** El editor del nombre, si se está renombrando. */
  renombrando: boolean
  validarNombre: (nombre: string) => string | null
  onGuardarNombre: (nombre: string) => Promise<string | null>
  onCancelarNombre: () => void
  onClic: (evento: MouseEvent<HTMLElement>, indice: number) => void
  onAbrir: (nodo: NodoDrive) => void
  onCasilla: (indice: number, conShift: boolean) => void
  onMenu: (evento: MouseEvent<HTMLElement>, indice: number) => void
  onFoco: (indice: number) => void
  onIniciarArrastre: (evento: DragEvent<HTMLElement>, indice: number) => void
  onTerminarArrastre: () => void
  ahora: Date
}

/** El nombre de quien subió el archivo, o nada si se subió directo en Drive. */
function subidoPor (nodo: NodoDrive): string {
  return nodo.uploaded_by?.name ?? '—'
}

/** La línea bajo el nombre: tamaño (si Drive lo informa) y fecha. */
function lineaSecundaria (nodo: NodoDrive, relativa: string): string {
  const tamano = nodo.is_folder ? '—' : formatearTamano(nodo.size_bytes)
  return tamano === '—' ? relativa : `${tamano} · ${relativa}`
}

/** Atributos comunes a fila y tarjeta: rol, foco, selección, arrastre y los gestos del puntero. */
function atributosComunes (props: PropsElementoDrive) {
  const { nodo, indice, seleccionado, enfocable, ocupado, arrastrando, arrastrable, destino } = props

  return {
    role: 'row',
    tabIndex: enfocable ? 0 : -1,
    'aria-selected': seleccionado,
    'aria-busy': ocupado || undefined,
    'aria-rowindex': indice + 2,
    'data-indice': indice,
    'data-nodo': nodo.id,
    'data-arrastrando': arrastrando ? 'true' : undefined,
    draggable: arrastrable && !props.renombrando,
    onDragStart: (evento: DragEvent<HTMLElement>) => { props.onIniciarArrastre(evento, indice) },
    onDragEnd: props.onTerminarArrastre,
    onClick: (evento: MouseEvent<HTMLElement>) => { props.onClic(evento, indice) },
    onDoubleClick: () => { props.onAbrir(nodo) },
    onContextMenu: (evento: MouseEvent<HTMLElement>) => { props.onMenu(evento, indice) },
    onFocus: (evento: { target: EventTarget, currentTarget: EventTarget }) => {
      if (evento.target === evento.currentTarget) props.onFoco(indice)
    },
    ...(destino ?? {})
  }
}

/** La casilla de selección. Fuera del recorrido del tabulador: con teclado se selecciona con Espacio. */
function Casilla ({ props, className }: { props: PropsElementoDrive, className?: string }) {
  return (
    <input
      type="checkbox"
      tabIndex={-1}
      checked={props.seleccionado}
      aria-label={`Seleccionar ${props.nodo.name}`}
      className={cn(CLASES_CASILLA, className)}
      onClick={(evento) => { evento.stopPropagation() }}
      onChange={(evento) => { props.onCasilla(props.indice, (evento.nativeEvent as unknown as { shiftKey?: boolean }).shiftKey === true) }}
    />
  )
}

/** El botón ⋯ que abre el mismo menú que el clic derecho. */
function BotonMenu ({ props, className }: { props: PropsElementoDrive, className?: string }) {
  return (
    <button
      type="button"
      tabIndex={-1}
      aria-label={`Acciones de ${props.nodo.name}`}
      aria-haspopup="menu"
      onClick={(evento) => {
        evento.stopPropagation()
        props.onMenu(evento, props.indice)
      }}
      className={cn(
        'text-texto-tenue hover:bg-hover hover:text-texto rounded-control grid size-8 shrink-0 place-items-center',
        'transition-colors duration-150',
        className
      )}
    >
      <Ellipsis className="size-4" aria-hidden="true" />
    </button>
  )
}

/** El nombre, o el editor si se está renombrando. Las teclas del editor no suben a la vista. */
function Nombre ({ props, compacto, children }: { props: PropsElementoDrive, compacto: boolean, children: ReactNode }) {
  if (!props.renombrando) return <>{children}</>

  return (
    <div
      className="min-w-0 flex-1"
      onClick={(evento) => { evento.stopPropagation() }}
      onDoubleClick={(evento) => { evento.stopPropagation() }}
      onKeyDown={(evento: KeyboardEvent) => { evento.stopPropagation() }}
    >
      <EditorNombreDrive
        inicial={props.nodo.name}
        etiqueta={`Nuevo nombre de ${props.nodo.name}`}
        textoGuardar="Guardar"
        compacto={compacto}
        validar={props.validarNombre}
        onGuardar={props.onGuardarNombre}
        onCancelar={props.onCancelarNombre}
      />
    </div>
  )
}

/** La insignia de carpeta de Tarea: dice por qué no se renombra ni se mueve. */
function InsigniaTarea () {
  return (
    <span
      title="Carpeta de una Tarea: no se renombra, mueve ni elimina, pero puedes soltar archivos adentro"
      className="bg-relleno-neutro text-texto-tenue rounded-control inline-flex shrink-0 items-center gap-1 px-1.5 py-0.5 text-[0.6875rem] font-semibold"
    >
      <Lock className="size-3" aria-hidden="true" />
      Tarea
    </span>
  )
}

/** Clases de fondo según el estado, compartidas por fila y tarjeta. */
function clasesDeEstado (props: PropsElementoDrive): string {
  return cn(
    'outline-none transition-[background-color,opacity] duration-150 ease-neo',
    'focus-visible:outline-[3px] focus-visible:outline-offset-[-3px] focus-visible:outline-[var(--foco)]',
    props.seleccionado ? 'bg-seleccionado' : 'hover:bg-hover',
    props.ocupado && 'pointer-events-none opacity-50',
    props.arrastrable ? 'cursor-grab active:cursor-grabbing' : 'cursor-default'
  )
}

/**
 * Una fila de la vista de lista: casilla, ícono, nombre, fecha, tamaño, quién subió y el menú.
 *
 * En un contenedor angosto (la ficha de una Tarea, el celular) las columnas se pliegan en una línea
 * bajo el nombre: "hace 2 días · 1,2 MB". La maqueta la decide el ancho del explorador y no el de la
 * ventana, porque el mismo explorador vive en una pestaña ancha y en un panel lateral.
 */
export function FilaDrive (props: PropsElementoDrive) {
  const { nodo, tipo, ahora } = props
  const fecha = fechaDeModificacion(nodo.modified_time, ahora)
  const tamano = nodo.is_folder ? '—' : formatearTamano(nodo.size_bytes)

  return (
    <div
      {...atributosComunes(props)}
      className={cn(
        'group/fila border-linea-suave grid min-h-12 items-center gap-3 border-b px-3 last:border-b-0',
        'grid-cols-[auto_minmax(0,1fr)_auto] @2xl:grid-cols-[auto_minmax(0,1fr)_8.5rem_5.5rem_auto]',
        '@4xl:grid-cols-[auto_minmax(0,1fr)_8.5rem_5.5rem_9rem_auto]',
        clasesDeEstado(props)
      )}
    >
      <div role="gridcell" className="flex items-center">
        <Casilla props={props} />
      </div>

      <div role="gridcell" className="flex min-w-0 items-center gap-3 py-2">
        <IconoArchivoDrive tipo={tipo} />
        <Nombre props={props} compacto={false}>
          <div className="min-w-0">
            <div className="flex min-w-0 items-center gap-2">
              <span className="text-texto truncate text-sm font-medium" title={nodo.name}>{nodo.name}</span>
              {nodo.locked === true && <InsigniaTarea />}
            </div>
            <p className="text-texto-sutil truncate text-xs @2xl:hidden">
              <span className="sr-only">{ETIQUETA_TIPO[tipo]} · </span>
              {lineaSecundaria(nodo, fecha.relativa)}
            </p>
          </div>
        </Nombre>
      </div>

      <div role="gridcell" className="text-texto-tenue hidden truncate text-sm @2xl:block" title={fecha.absoluta}>
        {fecha.relativa}
      </div>
      <div role="gridcell" className="text-texto-tenue hidden text-right text-sm tabular-nums @2xl:block">
        {tamano}
      </div>
      <div role="gridcell" className="text-texto-tenue hidden truncate text-sm @4xl:block">
        {nodo.is_folder ? '—' : subidoPor(nodo)}
      </div>

      <div role="gridcell" className="flex justify-end">
        <BotonMenu
          props={props}
          className={cn(
            !props.seleccionado && '@2xl:opacity-0 @2xl:group-hover/fila:opacity-100 @2xl:group-focus-visible/fila:opacity-100',
            'pointer-coarse:opacity-100'
          )}
        />
      </div>
    </div>
  )
}

/**
 * Una tarjeta de la vista de cuadrícula: la baldosa grande del tipo arriba y el nombre en dos líneas.
 *
 * La casilla y el menú aparecen al pasar el puntero o cuando la tarjeta está elegida: en reposo la
 * cuadrícula se lee como archivos, no como un formulario.
 */
export function TarjetaDrive (props: PropsElementoDrive) {
  const { nodo, tipo, ahora, seleccionado } = props
  const fecha = fechaDeModificacion(nodo.modified_time, ahora)

  return (
    <div
      {...atributosComunes(props)}
      className={cn(
        'group/tarjeta border-linea rounded-tarjeta relative flex min-w-0 flex-col gap-3 border p-3',
        seleccionado && 'border-acento',
        clasesDeEstado(props)
      )}
    >
      <div role="gridcell" className="flex items-start justify-between gap-2">
        <IconoArchivoDrive tipo={tipo} medida="tarjeta" />
        <div className="flex items-center gap-1">
          <Casilla
            props={props}
            className={cn(!seleccionado && 'opacity-0 group-hover/tarjeta:opacity-100 focus-visible:opacity-100 pointer-coarse:opacity-100')}
          />
          <BotonMenu props={props} className={cn(!seleccionado && 'opacity-0 group-hover/tarjeta:opacity-100 pointer-coarse:opacity-100')} />
        </div>
      </div>

      <div role="gridcell" className="flex min-w-0 flex-col gap-1">
        <Nombre props={props} compacto>
          <span className="text-texto line-clamp-2 text-sm leading-snug font-medium break-words" title={nodo.name}>{nodo.name}</span>
        </Nombre>
        <div className="flex min-w-0 items-center gap-2">
          <span className="text-texto-sutil truncate text-xs" title={fecha.absoluta}>
            {lineaSecundaria(nodo, fecha.relativa)}
          </span>
          {nodo.locked === true && <InsigniaTarea />}
        </div>
      </div>
    </div>
  )
}
