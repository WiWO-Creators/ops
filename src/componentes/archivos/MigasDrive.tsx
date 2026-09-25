'use client'

import { ChevronRight, HardDrive } from 'lucide-react'
import {
  ContenidoMenu, DisparadorMenu, ItemMenu, MenuContextual
} from '@/componentes/superposiciones/MenuContextual'
import type { PropsDestino } from '@/componentes/archivos/useArrastreDrive'
import { recortarMigas } from '@/dominio/drive-explorador'
import { cn } from '@/lib/clases'
import type { MigaDrive } from '@/datos/recursos'

/** Pasos que entran antes de plegar los del medio. */
const MAXIMO_MIGAS = 4

/**
 * Las migas de la carpeta actual, desde la carpeta de la entidad: cada paso navega y además recibe
 * lo que se suelta encima, como en cualquier explorador. Subir un nivel arrastrando es soltar sobre
 * la miga de arriba.
 *
 * @param migas la ruta, raíz primero y la actual al final
 * @param onIr navega a una carpeta de la ruta
 * @param destino props de destino de la carpeta de cada paso
 */
export function MigasDrive ({ migas, onIr, destino }: {
  migas: readonly MigaDrive[]
  onIr: (id: string) => void
  destino: (id: string, nombre: string) => PropsDestino
}) {
  const pasos = recortarMigas(migas, MAXIMO_MIGAS)

  return (
    <nav aria-label="Ubicación en Drive" className="min-w-0">
      <ol className="flex min-w-0 items-center gap-0.5">
        {pasos.map((paso, indice) => {
          const ultimo = indice === pasos.length - 1

          return (
            <li key={paso.tipo === 'miga' ? paso.miga.id : 'elipsis'} className={cn('flex min-w-0 items-center gap-0.5', ultimo && 'shrink')}>
              {indice > 0 && <ChevronRight className="text-texto-sutil size-3.5 shrink-0" aria-hidden="true" />}

              {paso.tipo === 'elipsis'
                ? (
                  <MenuContextual>
                    <DisparadorMenu asChild>
                      <button
                        type="button"
                        aria-label="Carpetas intermedias"
                        className="text-texto-tenue hover:bg-hover hover:text-texto rounded-chico px-1.5 py-1 text-sm"
                      >
                        …
                      </button>
                    </DisparadorMenu>
                    <ContenidoMenu align="start">
                      {paso.ocultas.map((miga) => (
                        <ItemMenu key={miga.id} onSelect={() => { onIr(miga.id) }}>{miga.name}</ItemMenu>
                      ))}
                    </ContenidoMenu>
                  </MenuContextual>
                  )
                : (
                  <button
                    type="button"
                    aria-current={ultimo ? 'location' : undefined}
                    onClick={() => { if (!ultimo) onIr(paso.miga.id) }}
                    title={paso.miga.name}
                    {...destino(paso.miga.id, paso.miga.name)}
                    className={cn(
                      'rounded-chico flex min-w-0 items-center gap-1.5 px-1.5 py-1 text-sm transition-colors duration-150',
                      ultimo ? 'text-texto cursor-default font-semibold' : 'text-texto-tenue hover:bg-hover hover:text-texto'
                    )}
                  >
                    {indice === 0 && <HardDrive className="size-4 shrink-0" aria-hidden="true" />}
                    <span className="truncate">{paso.miga.name}</span>
                  </button>
                  )}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
