'use client'

import * as Radix from '@radix-ui/react-dialog'
import { cn } from '@/lib/clases'

/**
 * Panel lateral deslizante.
 *
 * Comparte primitiva con el dialogo —es un modal— y por eso hereda su manejo de foco y de `Escape`.
 * Lo que cambia es de donde entra y cuanto ocupa.
 *
 * En pantallas angostas entra desde abajo y no desde el costado: un panel lateral de 448px en un
 * telefono de 390px no es un panel lateral, es una pantalla completa mal puesta.
 */
export const Cajon = Radix.Root
export const DisparadorCajon = Radix.Trigger
export const CerrarCajon = Radix.Close

interface PropsContenidoCajon extends React.ComponentPropsWithoutRef<typeof Radix.Content> {
  titulo: string
  descripcion?: string
  tituloOculto?: boolean
}

export function ContenidoCajon ({
  titulo,
  descripcion,
  tituloOculto = false,
  className,
  children,
  ...resto
}: PropsContenidoCajon) {
  return (
    <Radix.Portal>
      <Radix.Overlay className="bg-superficie-inversa/40 fixed inset-0 z-50" />
      <Radix.Content
        className={cn(
          'border-linea bg-superficie-flotante shadow-flotante fixed z-50 flex flex-col',
          // Movil: hoja inferior, con las esquinas superiores redondeadas.
          'rounded-t-tarjeta inset-x-0 bottom-0 max-h-[85dvh] border-t',
          // Desde tablet: panel lateral de alto completo.
          'sm:rounded-l-tarjeta sm:inset-y-0 sm:left-auto sm:right-0 sm:max-h-none sm:w-[28rem] sm:rounded-t-none sm:border-l sm:border-t-0',
          className
        )}
        {...resto}
      >
        <header className="border-linea flex shrink-0 flex-col gap-1 border-b px-6 py-4">
          <Radix.Title className={cn('font-titular text-lg font-extrabold', tituloOculto && 'sr-only')}>
            {titulo}
          </Radix.Title>
          {descripcion !== undefined && (
            <Radix.Description className="text-texto-tenue text-sm">{descripcion}</Radix.Description>
          )}
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">{children}</div>
      </Radix.Content>
    </Radix.Portal>
  )
}
