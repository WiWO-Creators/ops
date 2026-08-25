import { cn } from '@/lib/clases'

/** Ruta del wordmark dentro de `public/`. */
const RUTA = '/marca/wiwo-ops.png'

/**
 * Dimensiones del archivo, para derivar el ancho de la altura.
 *
 * El logo se usa siempre midiendo la altura (la del texto que acompaña); el ancho sale de la
 * proporcion, asi que nunca hay que escribir dos numeros que puedan quedar desfasados.
 */
const ANCHO = 1740
const ALTO = 399

const TAMANOS = {
  chico: 'h-4',
  medio: 'h-5',
  grande: 'h-8'
} as const

export type TamanoLogo = keyof typeof TAMANOS

interface PropsLogo {
  tamano?: TamanoLogo
  className?: string
}

/**
 * Logotipo "wiwo.Ops".
 *
 * El archivo es una silueta de un solo color, asi que se usa como **mascara** y el color lo pone
 * `--marca`: azul sobre claro, beige sobre oscuro. Es un solo asset para los dos temas, y el cambio
 * de tema no depende de JavaScript ni de `prefers-color-scheme` — sigue al `data-theme` del
 * documento igual que el resto de los tokens.
 *
 * Es `role="img"` con etiqueta porque no hay texto: sin eso, quien navega con lector de pantalla no
 * sabe de que sistema es la pantalla que abrio.
 *
 * @param tamano altura del logo; el ancho lo fija la proporcion del archivo
 */
export function Logo ({ tamano = 'medio', className }: PropsLogo) {
  return (
    <span
      role="img"
      aria-label="WiWO Ops"
      className={cn('inline-block bg-marca', TAMANOS[tamano], className)}
      style={{
        aspectRatio: `${ANCHO} / ${ALTO}`,
        maskImage: `url(${RUTA})`,
        WebkitMaskImage: `url(${RUTA})`,
        maskSize: 'contain',
        WebkitMaskSize: 'contain',
        maskRepeat: 'no-repeat',
        WebkitMaskRepeat: 'no-repeat',
        maskPosition: 'center',
        WebkitMaskPosition: 'center'
      }}
    />
  )
}
