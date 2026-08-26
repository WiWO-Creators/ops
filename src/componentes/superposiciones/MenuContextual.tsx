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
          // Crece desde el disparador y no desde su propio centro: Radix calcula el origen segun el
          // lado por el que finalmente entro el menu, que puede no ser el pedido si no habia lugar.
          'origin-[var(--radix-dropdown-menu-content-transform-origin)]',
          // `animation` y no `transition`: Radix retiene el nodo durante el cierre solo si detecta
          // una animacion CSS.
          'data-[state=open]:animate-entrar-escala data-[state=closed]:animate-salir-escala',
          className
        )}
        {...resto}
      />
    </Radix.Portal>
  )
}

/**
 * Clases de una fila del menu.
 *
 * @param peligroso accion destructiva: se pinta en el tono de peligro
 * @returns las clases de la fila
 */
function clasesDeItem (peligroso: boolean): string {
  return cn(
    'rounded-chico flex cursor-pointer items-center gap-2 px-2.5 py-1.5 text-sm outline-none',
    // `data-highlighted` cubre teclado y puntero a la vez: con `:hover` el elemento seleccionado
    // por flechas no se marcaria.
    'transition-colors duration-rapida data-[highlighted]:bg-hover',
    'data-[disabled]:pointer-events-none data-[disabled]:opacity-50',
    peligroso ? 'text-texto-peligro data-[highlighted]:bg-superficie-peligro' : 'text-texto'
  )
}

interface PropsItem extends React.ComponentPropsWithoutRef<typeof Radix.Item> {
  /** Accion destructiva: se pinta en el tono de peligro. */
  peligroso?: boolean
}

export function ItemMenu ({ peligroso = false, className, ...resto }: PropsItem) {
  return <Radix.Item className={cn(clasesDeItem(peligroso), className)} {...resto} />
}

type PropsItemMarcable = React.ComponentPropsWithoutRef<typeof Radix.CheckboxItem>

/**
 * Fila del menu que se marca y se desmarca, para elegir varias cosas a la vez.
 *
 * Sobre `CheckboxItem` de Radix y no sobre `ItemMenu` con un tilde dibujado: la primitiva emite
 * `role="menuitemcheckbox"` y `aria-checked`, que es lo que un lector de pantalla necesita para
 * decir si la opcion esta elegida. Un tilde suelto no dice nada.
 *
 * El menu no se cierra al marcar (`preventDefault` en `onSelect`): elegir varias opciones cerrando
 * y reabriendo el menu en cada una es exactamente lo que este control existe para evitar.
 */
export function ItemMenuMarcable ({ className, onSelect, children, ...resto }: PropsItemMarcable) {
  return (
    <Radix.CheckboxItem
      className={cn(clasesDeItem(false), className)}
      onSelect={(evento) => {
        evento.preventDefault()
        onSelect?.(evento)
      }}
      {...resto}
    >
      {/* La marca ocupa lugar siempre, tambien apagada: si apareciera al marcar, el texto de la
          fila se correria justo cuando la persona la esta mirando. */}
      <span className="flex size-3.5 shrink-0 items-center justify-center">
        <Radix.ItemIndicator asChild>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true" className="text-acento">
            <path d="m5 13 4 4L19 7" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </Radix.ItemIndicator>
      </span>
      {children}
    </Radix.CheckboxItem>
  )
}
