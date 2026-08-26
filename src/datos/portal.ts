import type { Referencia } from './recursos.ts'

/**
 * Recursos que ve el cliente en su portal.
 *
 * Viven aparte de `recursos.ts` a proposito: aunque una factura sea la misma fila de `tblinvoices`,
 * lo que el portal recibe NO es lo que recibe el panel. El portal nunca ve el `hash` publico del
 * documento, ni quien lo cargo, ni el agente de venta. Compartir el tipo invitaria a pintar en el
 * portal un campo que la API no manda, y a descubrirlo recien en pantalla.
 */

/** Moneda de un documento. */
export interface MonedaPortal {
  id: number
  symbol: string
  name: string
}

/** Linea de una factura, presupuesto o propuesta. */
export interface LineaPortal {
  id: number
  description: string
  long_description: string
  qty: number
  rate: number
  unit: string
}

/** Factura o presupuesto en el listado. */
export interface DocumentoPortal {
  id: number
  number: string
  date: string | null
  /** Un solo nombre para `duedate` de facturas y `expirydate` de presupuestos. */
  due_date: string | null
  status: number
  subtotal: number
  total: number
  currency: MonedaPortal | null
  project_id: number | null
  kind: 'invoice' | 'estimate'
}

/** El mismo documento con sus lineas, y con los pagos si es una factura. */
export interface DocumentoPortalDetalle extends DocumentoPortal {
  total_tax: number
  discount_total: number
  adjustment: number
  client_note: string
  terms: string
  items: LineaPortal[]
  payments?: PagoPortal[]
}

export interface PagoPortal {
  id: number
  amount: number
  date: string | null
  payment_mode: string
  transaction_id: string
  note: string
}

export interface PropuestaPortal {
  id: number
  subject: string
  date: string | null
  open_till: string | null
  status: number
  subtotal: number
  total: number
  currency: MonedaPortal | null
}

export interface PropuestaPortalDetalle extends PropuestaPortal {
  content: string
  total_tax: number
  discount_total: number
  adjustment: number
  proposal_to: string
  items: LineaPortal[]
}

export interface ContratoPortal {
  id: number
  subject: string
  date_start: string | null
  date_end: string | null
  value: number
  type: Referencia | null
  /** `true` si esta firmado por el cliente o marcado como firmado por el equipo. */
  signed: boolean
}

export interface ContratoPortalDetalle extends ContratoPortal {
  description: string
  content: string
  date_added: string | null
}

export interface SuscripcionPortal {
  id: number
  name: string
  description: string
  status: string
  date_subscribed: string | null
  next_billing_cycle: string | null
  ends_at: string | null
  currency: MonedaPortal | null
  project_id: number | null
}

export interface SuscripcionPortalDetalle extends SuscripcionPortal {
  quantity: number
  terms: string
}

export interface TicketPortal {
  id: number
  subject: string
  date: string | null
  last_reply: string | null
  status: number
  priority: number
  project_id: number | null
}

export interface TicketPortalDetalle extends TicketPortal {
  message: string
  replies: RespuestaTicketPortal[]
}

/**
 * Respuesta de un ticket.
 *
 * `from` viene ya resuelto por la API: el panel distingue autor de staff y de contacto mirando si la
 * columna `admin` esta vacia, y esa convencion no tiene por que cruzar la red.
 */
export interface RespuestaTicketPortal {
  id: number
  message: string
  date: string | null
  from: 'cliente' | 'equipo'
  name: string
}
