'use client'

import * as Radix from '@radix-ui/react-dialog'
import { cn } from '@/lib/clases'

/**
 * Dialogo modal.
 *
 * Sobre Radix a proposito: la trampa de foco, el cierre con `Escape`, el `aria-modal`, el bloqueo del
 * scroll de fondo y la devolucion del foco al elemento que lo abrio son exactamente el trabajo que no
 * conviene reimplementar. Acá solo se pone el aspecto.
 *
 * El velo NO usa `backdrop-filter`: es la regla de rendimiento del proyecto. La separacion con el
 * fondo se consigue con opacidad y con la sombra del panel.
 */
export const Dialogo = Radix.Root
export const DisparadorDialogo = Radix.Trigger
export const CerrarDialogo = Radix.Close

const ANCHOS = {
  chico: 'max-w-sm',
  medio: 'max-w-lg',
  grande: 'max-w-3xl'
} as const

interface PropsContenido extends React.ComponentPropsWithoutRef<typeof Radix.Content> {
  titulo: string
  descripcion?: string
  /** Oculta el titulo visualmente pero lo deja para lectores de pantalla. */
  tituloOculto?: boolean
  ancho?: keyof typeof ANCHOS
}

/**
 * Panel del dialogo.
 *
 * `titulo` es obligatorio: Radix advierte si falta, y un dialogo sin nombre accesible deja a quien usa
 * un lector de pantalla sin saber que se abrio. Si el diseño no lo muestra, va `tituloOculto`.
 */
export function ContenidoDialogo ({
  titulo,
  descripcion,
  tituloOculto = false,
  ancho = 'medio',
  className,
  children,
  ...resto
}: PropsContenido) {
  return (
    <Radix.Portal>
      <Radix.Overlay className="bg-superficie-inversa/40 fixed inset-0 z-50" />
      <Radix.Content
        className={cn(
          'fixed left-1/2 top-1/2 z-50 w-[calc(100vw-2rem)] -translate-x-1/2 -translate-y-1/2',
          'border-linea bg-superficie-flotante rounded-tarjeta shadow-flotante border p-6',
          // El contenido largo hace scroll dentro del panel, no en la pagina de atras.
          'max-h-[calc(100dvh-4rem)] overflow-y-auto',
          ANCHOS[ancho],
          className
        )}
        {...resto}
      >
        <Radix.Title className={cn('font-titular text-lg font-extrabold', tituloOculto && 'sr-only')}>
          {titulo}
        </Radix.Title>
        {descripcion !== undefined && (
          <Radix.Description className="text-texto-tenue mt-1 text-sm">{descripcion}</Radix.Description>
        )}
        <div className={cn(!tituloOculto && 'mt-4')}>{children}</div>
      </Radix.Content>
    </Radix.Portal>
  )
}
