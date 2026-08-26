import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/clases'

/**
 * Tonos disponibles.
 *
 * `exito` usa el verde de marca como RELLENO con tinta encima, nunca como texto sobre claro: sobre
 * blanco es ilegible. Esa pareja esta fijada en los tokens y verificada por `pruebas/marca.test.js`.
 */
const insignia = cva(
  'inline-flex items-center gap-1.5 whitespace-nowrap rounded-control font-medium leading-none transition-colors duration-150',
  {
    variants: {
      tono: {
        neutro: 'bg-relleno-neutro text-relleno-neutro-contenido',
        acento: 'bg-acento-suave text-acento',
        exito: 'bg-relleno-exito text-relleno-exito-contenido',
        aviso: 'bg-superficie-aviso text-texto-aviso',
        peligro: 'bg-superficie-peligro text-texto-peligro',
        contorno: 'border border-linea text-texto-tenue'
      },
      tamano: {
        chico: 'h-5 px-2 text-xs',
        medio: 'h-6 px-2.5 text-xs'
      }
    },
    defaultVariants: { tono: 'neutro', tamano: 'medio' }
  }
)

export type TonoInsignia = NonNullable<VariantProps<typeof insignia>['tono']>

/**
 * `color` de HTMLAttributes es el atributo HTML heredado (`<font color>`), que acepta `string` y no
 * `null`. Se lo saca del tipo base para poder aceptar el `color` de la entidad, que la API devuelve
 * como `string | null`.
 */
interface PropsInsignia
  extends Omit<React.HTMLAttributes<HTMLSpanElement>, 'color'>,
    VariantProps<typeof insignia> {
  /** Color libre, para estados que vienen de la base (`lookups`) y no de la paleta. */
  color?: string | null
}

/**
 * Etiqueta compacta de estado, prioridad o categoria.
 *
 * Cuando llega `color`, se pinta un punto de ese color y el fondo queda neutro, en vez de usar el
 * color como fondo. Los colores de estado de Perfex (`#84cc16`, `#0284c7`) fueron elegidos para
 * puntos de 8px en Bootstrap 3, no para contrastar contra texto: usarlos de fondo produce
 * combinaciones ilegibles que ademas cambian solas cuando alguien edita un estado en el panel.
 *
 * @param tono paleta semantica; se ignora el contraste solo si se pasa `color`
 * @param tamano alto del componente
 * @param color color crudo de la entidad, si lo tiene
 */
export function Insignia ({ tono, tamano, color, className, children, ...resto }: PropsInsignia) {
  const conColor = typeof color === 'string' && color.length > 0

  return (
    <span
      className={cn(insignia({ tono: conColor ? 'neutro' : tono, tamano }), className)}
      {...resto}
    >
      {conColor && (
        <span
          aria-hidden="true"
          className="size-1.5 shrink-0 rounded-full"
          style={{ backgroundColor: color }}
        />
      )}
      {children}
    </span>
  )
}
