import { cva, type VariantProps } from 'class-variance-authority'
import { Orbe } from '@/componentes/estado/Orbe'
import { cn } from '@/lib/clases'

const boton = cva(
  [
    'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-control font-semibold',
    // Solo `transform`, `opacity` y color: animar `filter` o `box-shadow` en un control que aparece
    // cientos de veces por pantalla es lo que hacia pesado al panel actual.
    'transition-[background-color,border-color,color,transform] duration-150 ease-neo',
    'active:scale-[0.98]',
    /* Neo: "Disabled — no depende solo de opacidad; conserva lectura y cursor claro". Un boton al
       50% de opacidad se vuelve ilegible sobre superficies claras, asi que se apaga con superficie y
       texto propios y se conserva el cursor, que es lo que le dice a la persona que el control existe
       y no responde. `pointer-events: none` mataria tambien el cursor. */
    'disabled:cursor-not-allowed disabled:border-transparent',
    'disabled:bg-relleno-neutro disabled:text-texto-sutil disabled:shadow-none'
  ],
  {
    variants: {
      variante: {
        // El verde de marca es RELLENO con tinta encima. Nunca texto verde sobre claro.
        primario: 'bg-acento text-acento-contenido hover:bg-acento-fuerte',
        marca: 'bg-relleno-exito text-relleno-exito-contenido hover:brightness-95',
        secundario: 'bg-control text-texto border border-control-borde hover:bg-hover',
        sutil: 'text-texto-tenue hover:bg-hover hover:text-texto',
        peligro: 'bg-relleno-peligro text-relleno-peligro-contenido hover:brightness-95'
      },
      tamano: {
        chico: 'h-8 px-3 text-xs',
        medio: 'h-9 px-4 text-sm',
        grande: 'h-11 px-6 text-base'
      },
      soloIcono: {
        true: 'aspect-square px-0',
        false: ''
      }
    },
    defaultVariants: { variante: 'secundario', tamano: 'medio', soloIcono: false }
  }
)

interface PropsBoton
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof boton> {
  cargando?: boolean
}

/**
 * Boton del sistema.
 *
 * Mientras `cargando` esta activo queda deshabilitado: sin eso, un doble clic en "Guardar" manda dos
 * peticiones, que en creacion produce dos registros. El indicador es el orbe del producto, que se
 * anima de forma `infinite` pero vive solo mientras dura la operacion — la regla prohibe animaciones
 * infinitas en elementos SIEMPRE visibles, no en las que se desmontan.
 *
 * @param cargando deshabilita e indica que hay una operacion en curso
 */
export function Boton ({
  variante,
  tamano,
  soloIcono,
  cargando = false,
  disabled,
  className,
  children,
  ...resto
}: PropsBoton) {
  return (
    <button
      type="button"
      className={cn(boton({ variante, tamano, soloIcono }), className)}
      disabled={disabled ?? cargando}
      aria-busy={cargando || undefined}
      {...resto}
    >
      {cargando && (
        /* La caja reserva los 0.875rem que ocupaba el indicador anterior, asi que el orbe no corre
           el texto ni cambia el ancho del boton respecto de la version con spinner. */
        <span className="inline-flex size-3.5 shrink-0 items-center justify-center">
          <Orbe tamano="chico" estado="thinking" />
        </span>
      )}
      {children}
    </button>
  )
}
