import { cn } from '@/lib/clases'

/**
 * Presentacion de tabla.
 *
 * Es solo el aspecto: el motor con virtualizacion, orden, filtros y definiciones declarativas es otro
 * trabajo. Lo que se fija acá son las decisiones visuales de Neo que hacen legible una grilla densa.
 *
 * El contenedor hace scroll horizontal propio: una tabla ancha nunca debe empujar el ancho de la
 * pagina, porque eso rompe el layout entero en vez de solo la tabla.
 */
export function Tabla ({ className, children, ...resto }: React.TableHTMLAttributes<HTMLTableElement>) {
  return (
    <div className="border-linea rounded-tarjeta overflow-x-auto border">
      <table className={cn('w-full border-collapse text-sm', className)} {...resto}>
        {children}
      </table>
    </div>
  )
}

/**
 * Encabezado.
 *
 * Sin mayusculas forzadas —regla de Neo, que las quita explicitamente de Bootstrap— y en tono tenue:
 * el encabezado orienta, no compite con los datos. Se queda fijo al hacer scroll vertical.
 */
export function EncabezadoTabla ({ className, ...resto }: React.HTMLAttributes<HTMLTableSectionElement>) {
  return (
    <thead
      className={cn('bg-superficie-hundida text-texto-tenue sticky top-0 z-10 text-xs', className)}
      {...resto}
    />
  )
}

export function CuerpoTabla ({ className, ...resto }: React.HTMLAttributes<HTMLTableSectionElement>) {
  return <tbody className={cn('divide-linea-suave divide-y', className)} {...resto} />
}

interface PropsFila extends React.HTMLAttributes<HTMLTableRowElement> {
  /** Si la fila lleva a algun lado al hacer clic. */
  interactiva?: boolean
}

export function FilaTabla ({ interactiva = false, className, ...resto }: PropsFila) {
  return (
    <tr
      className={cn(
        'transition-colors duration-150',
        // El `has-[:focus-visible]` no es adorno: quien llega con el teclado enfoca el enlace de la
        // celda, no la fila, y sin esto la fila que se va a abrir es la unica que no se marca.
        interactiva && 'hover:bg-hover has-[:focus-visible]:bg-hover cursor-pointer',
        className
      )}
      {...resto}
    />
  )
}

interface PropsCelda extends React.TdHTMLAttributes<HTMLTableCellElement> {
  /**
   * Contenido numerico.
   *
   * Alinea a la derecha y usa cifras de ancho fijo: sin eso, una columna de importes baila al
   * actualizarse porque el `1` es mas angosto que el `8`, y las unidades no quedan alineadas.
   */
  numerica?: boolean
}

export function CeldaTabla ({ numerica = false, className, ...resto }: PropsCelda) {
  return (
    <td
      className={cn('px-3 py-1.5 align-middle', numerica && 'text-right tabular-nums', className)}
      {...resto}
    />
  )
}

export function CeldaEncabezado ({ numerica = false, className, ...resto }: PropsCelda & React.ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      scope="col"
      className={cn(
        'px-3 py-2 text-left font-semibold whitespace-nowrap',
        numerica && 'text-right',
        className
      )}
      {...resto}
    />
  )
}
