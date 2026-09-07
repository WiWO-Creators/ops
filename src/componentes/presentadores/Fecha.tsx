import { cn } from '@/lib/clases'
import { estadoVencimiento, formatearFecha, formatearRelativo, formatearVencimiento } from '@/lib/fechas'

const TONO_VENCIMIENTO = {
  vencido: 'text-texto-peligro font-medium',
  hoy: 'text-texto-aviso font-medium',
  proximo: 'text-texto',
  lejano: 'text-texto-tenue',
  'sin-fecha': 'text-texto-sutil'
} as const

interface PropsFecha {
  valor: string | null | undefined
  /** Colorea segun cercania al vencimiento. Solo para fechas que son un plazo. */
  comoVencimiento?: boolean
  conHora?: boolean
  className?: string
}

/**
 * Muestra una fecha con su forma relativa en el `title`.
 *
 * La forma absoluta va visible y la relativa en el tooltip, y no al reves: en una tabla de plazos, "3
 * de septiembre" se compara entre filas y "en 2 semanas" no.
 *
 * Un plazo ausente se lee "Sin fecha" y no con el guion del resto: una tarea puede no tener fecha de
 * entrega a proposito, y el guion la haria pasar por un dato que falta. La distincion vive aca y no
 * en cada pantalla para que las cinco superficies que muestran un vencimiento digan lo mismo.
 */
export function Fecha ({ valor, comoVencimiento = false, conHora = false, className }: PropsFecha) {
  const texto = comoVencimiento ? formatearVencimiento(valor) : formatearFecha(valor, conHora)
  if (!valor) return <span className={cn('text-texto-sutil', className)}>{texto}</span>

  return (
    <time
      dateTime={valor}
      title={formatearRelativo(valor)}
      className={cn(comoVencimiento && TONO_VENCIMIENTO[estadoVencimiento(valor)], className)}
    >
      {texto}
    </time>
  )
}
