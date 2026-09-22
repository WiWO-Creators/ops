'use client'

import { useMemo, useState } from 'react'
import { FolderPlus, X } from 'lucide-react'
import { ChevronSelector, CLASES_DISPARADOR } from '@/componentes/formularios/Selector'
import {
  BuscadorMenu,
  ContenidoMenu,
  DisparadorMenu,
  ItemMenuMarcable,
  MenuContextual,
  SinResultadosMenu
} from '@/componentes/superposiciones/MenuContextual'
import { GLOSARIO } from '@/dominio/glosario'
import { cn } from '@/lib/clases'
import type { Referencia } from '@/datos/recursos'

/** Cuántos nombres se pintan como chip antes de resumir el resto en un contador. */
const CHIPS_VISIBLES = 8

/** Constante y no un literal en el `default`: uno nuevo por render reharía los `useMemo`. */
const SIN_LICITACIONES: ReadonlySet<number> = new Set<number>()

interface PropsSelectorEspacios {
  espacios: readonly Referencia[]
  elegidos: readonly number[]
  onCambiar: (ids: number[]) => void
  id?: string
  disabled?: boolean
  /** Espacios que fallaron en el último intento de alta: se marcan para poder verlos y reintentar. */
  conFallo?: number[]
  /**
   * Cuáles de `espacios` son Licitaciones.
   *
   * Vacío —lo normal en una instalación sin el módulo comercial— deja el menú como una sola lista
   * sin rótulos, que es como se veía antes.
   */
  licitaciones?: ReadonlySet<number>
}

/** Un bloque del menú: las filas que van bajo un mismo rótulo. */
interface GrupoDeEspacios {
  rotulo: string
  espacios: readonly Referencia[]
}

/**
 * Parte los Espacios visibles en Proyectos y Licitaciones.
 *
 * Con un solo grupo se devuelve sin rótulo: rotular "Proyectos" una lista donde todo es un Proyecto
 * ocupa una fila para no decir nada.
 *
 * @param visibles los Espacios que pasaron el buscador, en su orden
 * @param licitaciones los ids que son Licitación
 * @returns un grupo por clase con algo que mostrar; rótulo vacío si no hay nada que distinguir
 */
function agrupar (
  visibles: readonly Referencia[], licitaciones: ReadonlySet<number>
): readonly GrupoDeEspacios[] {
  if (licitaciones.size === 0) return [{ rotulo: '', espacios: visibles }]

  const proyectos = visibles.filter((espacio) => !licitaciones.has(espacio.id))
  const comerciales = visibles.filter((espacio) => licitaciones.has(espacio.id))

  if (comerciales.length === 0) return [{ rotulo: '', espacios: proyectos }]
  if (proyectos.length === 0) return [{ rotulo: GLOSARIO.licitacion.plural, espacios: comerciales }]

  return [
    { rotulo: GLOSARIO.espacio.plural, espacios: proyectos },
    { rotulo: GLOSARIO.licitacion.plural, espacios: comerciales }
  ]
}

/**
 * Texto comparable: sin tildes, en minúsculas y sin espacio sobrante.
 *
 * Los nombres de Espacio vienen del cliente y llegan con y sin tilde según quién los escribió
 * ("Colbún" y "Colbun" son el mismo). Buscar sobre el texto crudo obliga a acertar la tilde.
 */
function normalizar (texto: string): string {
  return texto.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim()
}

/**
 * Los Espacios cuyo nombre contiene TODAS las palabras buscadas, en cualquier orden.
 *
 * Por palabra y no por la frase entera: el catálogo mezcla cliente y campaña en el mismo nombre
 * ("Colbún — Grilla septiembre"), así que "grilla colbun" tiene que encontrarlo igual que
 * "colbun grilla".
 */
function filtrarEspacios (espacios: readonly Referencia[], busqueda: string): readonly Referencia[] {
  const partes = normalizar(busqueda).split(/\s+/).filter((parte) => parte !== '')

  if (partes.length === 0) return espacios

  return espacios.filter((espacio) => {
    const nombre = normalizar(espacio.name)

    return partes.every((parte) => nombre.includes(parte))
  })
}

/**
 * Elige uno o varios Espacios destino.
 *
 * Reemplaza al `Selector` de una sola opción del alta: la misma tarea se pide muchas veces en varios
 * Espacios a la vez —la misma grilla para tres clientes de una campaña— y hacerlo hoy significa
 * repetir el formulario entero una vez por Espacio.
 *
 * Menú con marcas y no un `Select`: el de Radix es de una sola opción. Es el mismo control que
 * `SelectorPersonas`, así que se ve y se maneja igual que el de asignados que está tres campos más
 * abajo.
 *
 * **El buscador no es opcional**: el catálogo trae hasta quinientos Espacios y una lista de
 * quinientas filas sin filtrar no es un control. `BuscadorMenu` ya resuelve el foco y las teclas que
 * Radix se lleva puestas.
 *
 * **Los elegidos se ven como chips**, no como un "3 espacios": crear la misma tarea en el Espacio
 * equivocado es caro de deshacer —hay que borrarla en cada uno— y el resumen numérico obliga a abrir
 * el menú para saber dónde va a caer. Pasados `CHIPS_VISIBLES` se resume el excedente, porque una
 * alfombra de veinte chips empuja el botón de crear fuera de la pantalla.
 */
export function SelectorEspacios ({
  espacios, elegidos, onCambiar, id, disabled = false, conFallo = [], licitaciones = SIN_LICITACIONES
}: PropsSelectorEspacios) {
  const [busqueda, setBusqueda] = useState('')

  const visibles = useMemo(() => filtrarEspacios(espacios, busqueda), [espacios, busqueda])
  const grupos = useMemo(() => agrupar(visibles, licitaciones), [visibles, licitaciones])
  // En el orden en que se eligieron, no en el del catálogo: el primero manda —de él salen los hitos
  // y los tipos cuando hay uno solo— y verlo saltar de lugar al agregar otro es desconcertante.
  const elegidosEnOrden = useMemo(
    () => elegidos
      .map((elegido) => espacios.find((espacio) => espacio.id === elegido))
      .filter((espacio): espacio is Referencia => espacio !== undefined),
    [elegidos, espacios]
  )

  const singular = GLOSARIO.espacio.singular.toLowerCase()
  const plural = GLOSARIO.espacio.plural.toLowerCase()

  /** Agrega o saca un Espacio de la lista. */
  function alternar (espacioId: number): void {
    onCambiar(
      elegidos.includes(espacioId)
        ? elegidos.filter((elegido) => elegido !== espacioId)
        : [...elegidos, espacioId]
    )
  }

  const visiblesEnChips = elegidosEnOrden.slice(0, CHIPS_VISIBLES)
  const ocultosEnChips = elegidosEnOrden.length - visiblesEnChips.length

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
            <FolderPlus size={14} aria-hidden="true" className="shrink-0" />
            <span className="truncate">
              {elegidos.length === 0
                ? `Sin ${singular}`
                : elegidos.length === 1
                  ? elegidosEnOrden[0]?.name ?? `1 ${singular}`
                  : `${elegidos.length} ${plural}`}
            </span>
          </span>
          <ChevronSelector />
        </DisparadorMenu>

        <ContenidoMenu align="start" className="w-[var(--radix-dropdown-menu-trigger-width)]">
          <BuscadorMenu
            valor={busqueda}
            onCambiar={setBusqueda}
            placeholder={`Buscar un ${singular}…`}
          />

          {/* La lista scrollea dentro del menú: con quinientas filas, un menú del alto del contenido
              tapa la pantalla y deja el diálogo inalcanzable. */}
          <div className="max-h-64 overflow-y-auto">
            {visibles.length === 0
              ? <SinResultadosMenu>{`Ningún ${singular} con ese nombre.`}</SinResultadosMenu>
              : grupos.map((grupo) => (
                <div key={grupo.rotulo}>
                  {grupo.rotulo !== '' && (
                    <p className="text-texto-sutil px-2 pt-2 pb-1 text-[11px] font-semibold tracking-wide uppercase">
                      {grupo.rotulo}
                    </p>
                  )}
                  {grupo.espacios.map((espacio) => (
                    <ItemMenuMarcable
                      key={espacio.id}
                      checked={elegidos.includes(espacio.id)}
                      onCheckedChange={() => { alternar(espacio.id) }}
                    >
                      <span className="truncate">{espacio.name}</span>
                    </ItemMenuMarcable>
                  ))}
                </div>
                ))}
          </div>
        </ContenidoMenu>
      </MenuContextual>

      {elegidosEnOrden.length > 0 && (
        <ul className="flex flex-wrap gap-1.5">
          {visiblesEnChips.map((espacio) => (
            <li key={espacio.id}>
              <button
                type="button"
                disabled={disabled}
                onClick={() => { alternar(espacio.id) }}
                aria-label={`Sacar ${espacio.name}`}
                className={cn(
                  'rounded-control flex items-center gap-1.5 px-2 py-0.5 text-xs',
                  'transition-[filter] duration-150 hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-50',
                  conFallo.includes(espacio.id)
                    ? 'bg-superficie-peligro text-texto-peligro'
                    : 'bg-relleno-neutro text-relleno-neutro-contenido'
                )}
              >
                <span className="max-w-48 truncate">{espacio.name}</span>
                {/* El chip dice de qué clase es el destino: los dos grupos del menú se pierden una
                    vez elegidos, y una tarea creada en la licitación equivocada hay que borrarla. */}
                {licitaciones.has(espacio.id) && (
                  <span className="shrink-0 text-[10px] opacity-70">
                    {GLOSARIO.licitacion.singular}
                  </span>
                )}
                <X size={12} aria-hidden="true" className="shrink-0 opacity-70" />
              </button>
            </li>
          ))}
          {ocultosEnChips > 0 && (
            <li className="text-texto-sutil self-center text-xs">
              y {ocultosEnChips} más
            </li>
          )}
        </ul>
      )}
    </div>
  )
}
