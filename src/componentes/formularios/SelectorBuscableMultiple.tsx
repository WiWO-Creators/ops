'use client'

import { useMemo, useState, type ComponentType } from 'react'
import { X } from 'lucide-react'
import { Avatar } from '@/componentes/presentadores/Avatar'
import { ChevronSelector, CLASES_DISPARADOR } from '@/componentes/formularios/Selector'
import {
  BuscadorMenu, ContenidoMenu, DisparadorMenu, ItemMenuMarcable, MenuContextual, SinResultadosMenu
} from '@/componentes/superposiciones/MenuContextual'
import { filtrarPorPalabras } from '@/dominio/busqueda'
import { cn } from '@/lib/clases'

/** Una opcion del selector, ya traducida desde el registro de la API. */
export interface OpcionBuscable {
  id: number
  nombre: string
  /** Con `undefined` la fila y el chip van sin avatar; con `null`, avatar de iniciales. */
  imagen?: string | null
}

interface PropsSelectorBuscableMultiple {
  opciones: readonly OpcionBuscable[]
  elegidos: readonly number[]
  onCambiar: (ids: number[]) => void
  /** Icono del disparador: dice de un vistazo que se elige. */
  icono: ComponentType<{ size?: number, className?: string, 'aria-hidden'?: boolean | 'true' }>
  /**
   * Texto del disparador segun lo elegido.
   *
   * @param elegidos las opciones elegidas, en el orden en que se eligieron
   */
  resumen: (elegidos: OpcionBuscable[]) => string
  /** Texto del buscador; tambien es su nombre accesible. */
  placeholder: string
  /** Fila del menu cuando la busqueda no deja nada. */
  sinResultados: string
  /** Nombre accesible del chip que saca una opcion. Por defecto, «Sacar <nombre>». */
  etiquetaSacar?: (nombre: string) => string
  /** Cuantos chips se pintan antes de resumir el resto en un contador. Sin tope por defecto. */
  chipsVisibles?: number
  /** Ids que se pintan en rojo entre los chips: los que fallaron en el ultimo intento. */
  conFallo?: readonly number[]
  id?: string
  disabled?: boolean
}

/**
 * Elige varias opciones de una lista larga, escribiendo: la base de los selectores de relacion
 * (`SelectorPersonas`, `SelectorClientes`, `SelectorEspacios`).
 *
 * Menu con marcas y no un `Select`: se eligen varias, y el `Select` de Radix es de una sola opcion.
 * **El buscador no es opcional**: los catalogos traen cientos de filas, y una lista de cientos de
 * filas sin filtrar no es un control. `BuscadorMenu` ya resuelve el foco y las teclas que Radix se
 * lleva puestas, y `filtrarPorPalabras` busca sin acentos y en cualquier orden.
 *
 * Los elegidos se ven como chips debajo, cada uno es el boton que lo saca, y van en el orden en que
 * se eligieron: el resumen «3 personas» obliga a abrir el menu para saber cuales son, que es justo lo
 * que se esta revisando, y ver un chip saltar de lugar al agregar otro desconcierta.
 */
export function SelectorBuscableMultiple ({
  opciones, elegidos, onCambiar, icono: Icono, resumen, placeholder, sinResultados,
  etiquetaSacar = (nombre) => `Sacar ${nombre}`, chipsVisibles, conFallo = [], id, disabled = false
}: PropsSelectorBuscableMultiple) {
  const [busqueda, setBusqueda] = useState('')

  const visibles = useMemo(
    () => filtrarPorPalabras(opciones, busqueda, (opcion) => [opcion.nombre]),
    [opciones, busqueda]
  )
  const elegidosEnOrden = useMemo(
    () => elegidos
      .map((elegido) => opciones.find((opcion) => opcion.id === elegido))
      .filter((opcion): opcion is OpcionBuscable => opcion !== undefined),
    [elegidos, opciones]
  )
  const enChips = chipsVisibles === undefined ? elegidosEnOrden : elegidosEnOrden.slice(0, chipsVisibles)
  const ocultos = elegidosEnOrden.length - enChips.length

  /** Agrega o saca una opcion de la lista. */
  function alternar (opcionId: number): void {
    onCambiar(
      elegidos.includes(opcionId)
        ? elegidos.filter((elegido) => elegido !== opcionId)
        : [...elegidos, opcionId]
    )
  }

  return (
    <div className="flex flex-col gap-2">
      <MenuContextual onOpenChange={(abierto) => { if (!abierto) setBusqueda('') }}>
        <DisparadorMenu
          id={id}
          disabled={disabled}
          className={cn(
            CLASES_DISPARADOR,
            elegidos.length === 0 && 'text-texto-sutil',
            disabled && 'cursor-not-allowed opacity-50'
          )}
        >
          <span className="flex min-w-0 items-center gap-2">
            <Icono size={14} aria-hidden="true" className="shrink-0" />
            <span className="truncate">{resumen(elegidosEnOrden)}</span>
          </span>
          <ChevronSelector />
        </DisparadorMenu>

        <ContenidoMenu align="start" className="w-[var(--radix-dropdown-menu-trigger-width)]">
          <BuscadorMenu valor={busqueda} onCambiar={setBusqueda} placeholder={placeholder} />

          {/* La lista scrollea dentro del menú: un menú del alto del contenido tapa la pantalla
              entera y deja el diálogo inalcanzable. */}
          <div className="max-h-64 overflow-y-auto">
            {visibles.length === 0
              ? <SinResultadosMenu>{sinResultados}</SinResultadosMenu>
              : visibles.map((opcion) => (
                <ItemMenuMarcable
                  key={opcion.id}
                  checked={elegidos.includes(opcion.id)}
                  onCheckedChange={() => { alternar(opcion.id) }}
                >
                  <span className="flex min-w-0 items-center gap-2">
                    {opcion.imagen !== undefined && <Avatar nombre={opcion.nombre} imagen={opcion.imagen} tamano="chico" />}
                    <span className="truncate">{opcion.nombre}</span>
                  </span>
                </ItemMenuMarcable>
                ))}
          </div>
        </ContenidoMenu>
      </MenuContextual>

      {elegidosEnOrden.length > 0 && (
        <ul className="flex flex-wrap gap-1.5">
          {enChips.map((opcion) => (
            <li key={opcion.id}>
              <button
                type="button"
                disabled={disabled}
                onClick={() => { alternar(opcion.id) }}
                aria-label={etiquetaSacar(opcion.nombre)}
                className={cn(
                  'rounded-control flex items-center gap-1.5 py-0.5 pr-2 text-xs',
                  'transition-[filter] duration-150 hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-50',
                  opcion.imagen === undefined ? 'pl-2' : 'pl-0.5',
                  conFallo.includes(opcion.id)
                    ? 'bg-superficie-peligro text-texto-peligro'
                    : 'bg-relleno-neutro text-relleno-neutro-contenido'
                )}
              >
                {opcion.imagen !== undefined && <Avatar nombre={opcion.nombre} imagen={opcion.imagen} tamano="chico" />}
                <span className="max-w-48 truncate">{opcion.nombre}</span>
                <X size={12} aria-hidden="true" className="shrink-0 opacity-70" />
              </button>
            </li>
          ))}
          {ocultos > 0 && (
            <li className="text-texto-sutil self-center text-xs">
              y {ocultos} más
            </li>
          )}
        </ul>
      )}
    </div>
  )
}
