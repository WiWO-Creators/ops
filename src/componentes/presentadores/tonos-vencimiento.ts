/**
 * Clases de color por tramo de vencimiento, para las superficies que pintan un plazo.
 *
 * El tramo lo decide `estadoVencimiento` de `@/lib/fechas`; aca solo vive como se pinta cada uno,
 * para que la fecha de una tabla, la tarjeta del calendario y la rejilla de entregas digan lo mismo.
 * Sin React: lo importan componentes de servidor y de cliente.
 */

import type { EstadoVencimiento } from '@/lib/fechas'

/** Color del texto de una fecha que es un plazo. */
export const TONO_VENCIMIENTO: Record<EstadoVencimiento, string> = {
  vencido: 'text-texto-peligro font-medium',
  hoy: 'text-texto-aviso font-medium',
  proximo: 'text-texto',
  lejano: 'text-texto-tenue',
  'sin-fecha': 'text-texto-sutil'
}

/** Color del borde izquierdo de una tarjeta segun su vencimiento. */
export const BORDE_VENCIMIENTO: Record<EstadoVencimiento, string> = {
  vencido: 'border-l-relleno-peligro',
  hoy: 'border-l-relleno-aviso',
  proximo: 'border-l-acento',
  lejano: 'border-l-linea',
  'sin-fecha': 'border-l-linea'
}
