'use client'

import { useState, type KeyboardEvent } from 'react'
import { ChevronRight, Folder, FolderLock, FolderOpen, HardDrive } from 'lucide-react'
import type { EntradaCarpeta } from '@/componentes/archivos/useCarpetasDrive'
import type { PropsDestino } from '@/componentes/archivos/useArrastreDrive'
import { ordenarNodos, ORDEN_INICIAL } from '@/dominio/drive-explorador'
import { cn } from '@/lib/clases'
import type { MigaDrive } from '@/datos/recursos'

interface PropsArbol {
  raiz: MigaDrive
  actualId: string
  /** Ids de la ruta de la carpeta actual: esas ramas se abren solas. */
  rutaActual: readonly string[]
  carpetas: Readonly<Record<string, EntradaCarpeta>>
  cargar: (id: string) => void
  onIr: (id: string) => void
  destino: (id: string, nombre: string) => PropsDestino
}

/**
 * El árbol de carpetas al costado del explorador, en pantallas anchas.
 *
 * Sirve para dos cosas que la vista de una sola carpeta no da: ver dónde se está parado dentro de
 * todo el Drive de la entidad, y tener a mano destinos lejanos para soltar sin navegar. Comparte la
 * caché con la vista, así que abrir una rama que ya se visitó no vuelve a pedir nada.
 */
export function ArbolLateralDrive ({ raiz, actualId, rutaActual, carpetas, cargar, onIr, destino }: PropsArbol) {
  // Lo que la persona abrió o cerró a mano; el resto sigue a la carpeta actual, cuya ruta queda
  // desplegada sola: navegar desde la vista abre las ramas sin que nadie las toque.
  const [alternadas, setAlternadas] = useState<ReadonlyMap<string, boolean>>(() => new Map([[raiz.id, true]]))
  const abiertas = new Set([
    ...rutaActual.filter((id) => alternadas.get(id) !== false),
    ...[...alternadas].filter(([, abierta]) => abierta).map(([id]) => id)
  ])

  function alternar (id: string): void {
    const abriendo = !abiertas.has(id)
    setAlternadas((antes) => new Map(antes).set(id, abriendo))
    if (abriendo && carpetas[id] === undefined) cargar(id)
  }

  return (
    <ul role="tree" aria-label="Carpetas" className="flex flex-col gap-px">
      <RamaDrive
        miga={raiz}
        nivel={1}
        bloqueada={false}
        esRaiz
        {...{ actualId, carpetas, abiertas, alternar, onIr, destino }}
      />
    </ul>
  )
}

interface PropsRama {
  miga: MigaDrive
  nivel: number
  bloqueada: boolean
  esRaiz?: boolean
  actualId: string
  carpetas: Readonly<Record<string, EntradaCarpeta>>
  abiertas: ReadonlySet<string>
  alternar: (id: string) => void
  onIr: (id: string) => void
  destino: (id: string, nombre: string) => PropsDestino
}

/** Una rama del árbol: la carpeta, su flecha y, si está abierta, sus subcarpetas. */
function RamaDrive ({ miga, nivel, bloqueada, esRaiz = false, actualId, carpetas, abiertas, alternar, onIr, destino }: PropsRama) {
  const entrada = carpetas[miga.id]
  const abierta = abiertas.has(miga.id)
  const actual = miga.id === actualId
  const hijas = entrada?.fase === 'listo'
    ? ordenarNodos(entrada.hijos.filter((hijo) => hijo.is_folder), ORDEN_INICIAL)
    : []
  const sinHijas = entrada?.fase === 'listo' && hijas.length === 0
  const Icono = esRaiz ? HardDrive : bloqueada ? FolderLock : abierta && !sinHijas ? FolderOpen : Folder

  /** Flechas a los costados abren y cierran, como en cualquier árbol. */
  function alPulsar (evento: KeyboardEvent<HTMLButtonElement>): void {
    if (evento.key === 'ArrowRight' && !abierta) {
      evento.preventDefault()
      alternar(miga.id)
    }
    if (evento.key === 'ArrowLeft' && abierta) {
      evento.preventDefault()
      alternar(miga.id)
    }
  }

  return (
    <li role="treeitem" aria-expanded={sinHijas ? undefined : abierta} aria-selected={actual} aria-level={nivel}>
      <div
        {...destino(miga.id, miga.name)}
        className="rounded-chico flex items-center"
        style={{ paddingLeft: `${(nivel - 1) * 0.875}rem` }}
      >
        <button
          type="button"
          tabIndex={-1}
          aria-label={abierta ? `Cerrar ${miga.name}` : `Abrir ${miga.name}`}
          onClick={() => { alternar(miga.id) }}
          className={cn(
            'text-texto-sutil hover:text-texto grid size-6 shrink-0 place-items-center',
            sinHijas && 'invisible'
          )}
        >
          <ChevronRight className={cn('size-3.5 transition-transform duration-150', abierta && 'rotate-90')} aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={() => { onIr(miga.id) }}
          onKeyDown={alPulsar}
          title={miga.name}
          className={cn(
            'rounded-chico flex min-w-0 flex-1 items-center gap-2 py-1.5 pr-2 pl-1 text-left text-sm transition-colors duration-150',
            actual ? 'bg-seleccionado text-texto font-semibold' : 'text-texto-tenue hover:bg-hover hover:text-texto'
          )}
        >
          <Icono className={cn('size-4 shrink-0', actual && 'text-acento')} aria-hidden="true" />
          <span className="truncate">{miga.name}</span>
        </button>
      </div>

      {abierta && entrada?.fase === 'cargando' && (
        <p className="text-texto-sutil py-1 text-xs" style={{ paddingLeft: `${nivel * 0.875 + 1.75}rem` }}>Cargando…</p>
      )}
      {abierta && entrada?.fase === 'error' && (
        <p className="text-texto-peligro py-1 text-xs" style={{ paddingLeft: `${nivel * 0.875 + 1.75}rem` }}>No se pudo abrir.</p>
      )}
      {abierta && hijas.length > 0 && (
        <ul role="group" className="flex flex-col gap-px">
          {hijas.map((hija) => (
            <RamaDrive
              key={hija.id}
              miga={{ id: hija.id, name: hija.name }}
              nivel={nivel + 1}
              bloqueada={hija.locked === true}
              {...{ actualId, carpetas, abiertas, alternar, onIr, destino }}
            />
          ))}
        </ul>
      )}
    </li>
  )
}
