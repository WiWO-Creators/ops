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
      <Radix.Overlay
        className={cn(
          'bg-superficie-inversa/40 fixed inset-0 z-50',
          'data-[state=open]:animate-aparecer data-[state=closed]:animate-desaparecer'
        )}
      />
      <Radix.Content
        className={cn(
          // El centrado es por margenes automaticos (`inset-0 m-auto h-fit`) y NO por
          // `left-1/2 top-1/2 -translate-1/2`. La razon: los keyframes de entrada y salida animan
          // `transform`, y una animacion pisa entera la propiedad `transform` del elemento. Con el
          // centrado apoyado en `translate`, el dialogo salta al cuadrante inferior derecho apenas
          // arranca la animacion. Con margenes automaticos, `transform` queda libre para animar.
          'fixed inset-0 z-50 m-auto h-fit w-[calc(100vw-2rem)]',
          'border-linea bg-superficie-flotante rounded-tarjeta shadow-flotante border p-6',
          // El contenido largo hace scroll dentro del panel, no en la pagina de atras.
          'max-h-[calc(100dvh-4rem)] overflow-y-auto',
          // `animation` y no `transition`: Radix solo retiene el nodo durante el cierre si detecta
          // una animacion CSS. Con una transicion, la salida nunca llegaria a verse.
          'data-[state=open]:animate-entrar-escala data-[state=closed]:animate-salir-escala',
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
