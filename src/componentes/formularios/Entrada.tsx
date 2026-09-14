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

/**
 * Casilla de verificación nativa, teñida con el acento.
 *
 * Sin componente propio a propósito: `<input type="checkbox">` ya trae el estado indeterminado, el
 * foco y el manejo de teclado que Radix tendría que reimplementar. Sólo se le pone el color.
 */
export const CLASES_CASILLA = 'size-4 shrink-0 accent-[var(--color-acento)] cursor-pointer'

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
 *
 * Los tres añadidos al control base valen para TODO el panel, no solo para el Meeting Paper:
 *
 * - `max-h-80` le pone techo a `field-sizing: content`. Sin techo, pegar una transcripción de una hora
 *   estira la caja miles de píxeles y empuja fuera de la pantalla el botón que la envía: el campo se
 *   vuelve imposible de terminar de usar. Con techo, crece hasta 20rem y después desplaza.
 * - `resize-y` saca el tirador horizontal que trae el navegador por omisión. Agrandar a lo ancho no
 *   arregla nada en un campo de ancho completo y sí rompe la rejilla que lo contiene; a lo alto sigue
 *   estando, que es lo único que alguien quiere de un área de texto.
 * - `leading-relaxed` es la altura de línea de un texto que se LEE. El 1.25 que traía era el del campo
 *   de una línea, donde no hay renglón siguiente con el que apretarse.
 */
export function AreaTexto ({ className, ...resto }: PropsAreaTexto) {
  return (
    <textarea
      className={cn(
        CLASES_CONTROL,
        'min-h-20 max-h-80 resize-y overflow-y-auto py-2 text-sm leading-relaxed [field-sizing:content]',
        className
      )}
      {...resto}
    />
  )
}
