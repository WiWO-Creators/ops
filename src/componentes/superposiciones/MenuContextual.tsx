'use client'

import * as Radix from '@radix-ui/react-dropdown-menu'
import { cn } from '@/lib/clases'

/**
 * Menu desplegable de acciones.
 *
 * Sobre Radix por la navegacion con teclado: flechas, `Home`/`End`, busqueda por letra escrita y
 * cierre con `Escape` devolviendo el foco al disparador. Reimplementar eso a mano es donde se pierden
 * las tardes.
 */
export const MenuContextual = Radix.Root
export const DisparadorMenu = Radix.Trigger

export function SeparadorMenu () {
  return <Radix.Separator className="bg-linea my-1 h-px" />
}

export function ContenidoMenu ({
  className,
  ...resto
}: React.ComponentPropsWithoutRef<typeof Radix.Content>) {
  return (
    <Radix.Portal>
      <Radix.Content
        sideOffset={6}
        collisionPadding={8}
        className={cn(
          'border-linea bg-superficie-flotante rounded-medio shadow-2 z-50 min-w-44 border p-1',
          // Radix expone el alto disponible: el menu hace scroll en vez de salirse de la ventana.
          'max-h-[var(--radix-dropdown-menu-content-available-height)] overflow-y-auto',
          className
        )}
        {...resto}
      />
    </Radix.Portal>
  )
}

interface PropsItem extends React.ComponentPropsWithoutRef<typeof Radix.Item> {
  /** Accion destructiva: se pinta en el tono de peligro. */
  peligroso?: boolean
}

export function ItemMenu ({ peligroso = false, className, ...resto }: PropsItem) {
  return (
    <Radix.Item
      className={cn(
        'rounded-chico flex cursor-pointer items-center gap-2 px-2.5 py-1.5 text-sm outline-none',
        // `data-highlighted` cubre teclado y puntero a la vez: con `:hover` el elemento seleccionado
        // por flechas no se marcaria.
        'data-[highlighted]:bg-hover',
        'data-[disabled]:pointer-events-none data-[disabled]:opacity-50',
        peligroso ? 'text-texto-peligro data-[highlighted]:bg-superficie-peligro' : 'text-texto',
        className
      )}
      {...resto}
    />
  )
}
