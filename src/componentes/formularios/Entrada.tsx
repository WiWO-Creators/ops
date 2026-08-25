import { cn } from '@/lib/clases'

/**
 * Clases compartidas por todos los controles de texto.
 *
 * Radio 6px, no píldora: es una regla de Neo y es deliberada — el botón es píldora y el input
 * cuadrado, y ese contraste es lo que separa visualmente "acción" de "dato".
 */
export const CLASES_CONTROL = [
  'w-full rounded-chico border border-control-borde bg-control px-3 text-texto',
  'placeholder:text-texto-sutil',
  'transition-[border-color,box-shadow] duration-150 ease-neo',
  'hover:border-linea-fuerte',
  /* Neo: el deshabilitado conserva lectura. Se apaga con superficie, no bajando la opacidad del
     texto, que es lo que vuelve ilegible un valor ya cargado. */
  'disabled:cursor-not-allowed disabled:bg-superficie-hundida disabled:text-texto-tenue',
  'aria-[invalid=true]:border-relleno-peligro'
].join(' ')

type PropsEntrada = React.InputHTMLAttributes<HTMLInputElement>

/** Campo de texto de una línea. */
export function Entrada ({ className, ...resto }: PropsEntrada) {
  return <input className={cn(CLASES_CONTROL, 'h-9 text-sm', className)} {...resto} />
}

type PropsAreaTexto = React.TextareaHTMLAttributes<HTMLTextAreaElement>

/**
 * Campo de texto de varias líneas.
 *
 * `field-sizing: content` deja que el navegador lo agrande solo con lo que se escribe, sin JavaScript
 * que mida alturas. Donde no está soportado, cae al alto mínimo — que es el comportamiento de
 * siempre, no un fallo.
 */
export function AreaTexto ({ className, ...resto }: PropsAreaTexto) {
  return (
    <textarea
      className={cn(CLASES_CONTROL, 'min-h-20 py-2 text-sm [field-sizing:content]', className)}
      {...resto}
    />
  )
}
