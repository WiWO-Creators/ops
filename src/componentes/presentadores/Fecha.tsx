import { cn } from '@/lib/clases'
import { estadoVencimiento, formatearFecha, formatearRelativo } from '@/lib/fechas'

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
 */
export function Fecha ({ valor, comoVencimiento = false, conHora = false, className }: PropsFecha) {
  const texto = formatearFecha(valor, conHora)
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
