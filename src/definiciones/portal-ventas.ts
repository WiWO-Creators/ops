import type { DefinicionRecurso } from './tipos.ts'
import type {
  ContratoPortal,
  DocumentoPortal,
  PropuestaPortal,
  SuscripcionPortal,
  TicketPortal
} from '../datos/portal.ts'
import { formatearFecha } from '../lib/fechas.ts'
import { formatearImporte } from '../componentes/proyecto/formatos.ts'
import { GLOSARIO } from '../dominio/glosario.ts'

/**
 * Las seis secciones de venta y soporte del portal del cliente.
 *
 * Viven juntas porque son la misma pantalla seis veces —listado declarativo sobre `TablaRecurso`— y
 * separarlas dejaria seis archivos de veinte lineas que siempre se editan juntos.
 *
 * Son distintas de las del panel (`ventas.ts`) aunque se parezcan: la ruta cuelga de `/portal`, el
 * catalogo de estados sale de `/portal/lookups`, y no hay columnas ni filtros que el cliente no
 * tenga por que ver. Reusar las del panel obligaria a que cada definicion supiera desde donde la
 * miran.
 *
 * Los filtros, el orden y los `include` tienen que coincidir con las whitelists de `RecursoPortal`:
 * un valor no declarado alla devuelve 422, no se ignora.
 */

/** Facturas. */
export const PORTAL_FACTURAS: DefinicionRecurso<DocumentoPortal> = {
  ruta: 'portal/invoices',
  titulo: GLOSARIO.factura,

  columnas: [
    { clave: 'number', encabezado: 'Número', ordenPor: 'number', presentar: (d) => d.number },
    { clave: 'date', encabezado: 'Fecha', ordenPor: 'date', presentar: (d) => formatearFecha(d.date) },
    { clave: 'due_date', encabezado: 'Vence', ordenPor: 'duedate', presentar: (d) => formatearFecha(d.due_date) },
    { clave: 'status', encabezado: 'Estado', comoInsignia: 'invoice_statuses', presentar: (d) => d.status },
    {
      clave: 'total',
      encabezado: 'Total',
      ordenPor: 'total',
      numerica: true,
      presentar: (d) => formatearImporte(d.total, d.currency?.symbol ?? null)
    }
  ],

  filtros: [{ clave: 'status', etiqueta: 'Estado', tipo: 'multiple', desdeLookup: 'invoice_statuses' }],
  ordenables: ['number', 'date', 'duedate', 'total'],
  ordenPorDefecto: '-date',
  busqueda: true,
  includes: []
}

/** Presupuestos. Misma forma que las facturas, otro catalogo de estados. */
export const PORTAL_PRESUPUESTOS: DefinicionRecurso<DocumentoPortal> = {
  ruta: 'portal/estimates',
  titulo: GLOSARIO.presupuesto,

  columnas: [
    { clave: 'number', encabezado: 'Número', ordenPor: 'number', presentar: (d) => d.number },
    { clave: 'date', encabezado: 'Fecha', ordenPor: 'date', presentar: (d) => formatearFecha(d.date) },
    { clave: 'due_date', encabezado: 'Vence', ordenPor: 'duedate', presentar: (d) => formatearFecha(d.due_date) },
    { clave: 'status', encabezado: 'Estado', comoInsignia: 'estimate_statuses', presentar: (d) => d.status },
    {
      clave: 'total',
      encabezado: 'Total',
      ordenPor: 'total',
      numerica: true,
      presentar: (d) => formatearImporte(d.total, d.currency?.symbol ?? null)
    }
  ],

  filtros: [{ clave: 'status', etiqueta: 'Estado', tipo: 'multiple', desdeLookup: 'estimate_statuses' }],
  ordenables: ['number', 'date', 'duedate', 'total'],
  ordenPorDefecto: '-date',
  busqueda: true,
  includes: []
}

/** Propuestas: las del cliente y las que quedaron atadas al prospecto del que se convirtio. */
export const PORTAL_PROPUESTAS: DefinicionRecurso<PropuestaPortal> = {
  ruta: 'portal/proposals',
  titulo: GLOSARIO.propuesta,

  columnas: [
    { clave: 'subject', encabezado: 'Asunto', ordenPor: 'subject', presentar: (p) => p.subject },
    { clave: 'date', encabezado: 'Fecha', ordenPor: 'date', presentar: (p) => formatearFecha(p.date) },
    { clave: 'open_till', encabezado: 'Vigente hasta', presentar: (p) => formatearFecha(p.open_till) },
    { clave: 'status', encabezado: 'Estado', comoInsignia: 'proposal_statuses', presentar: (p) => p.status },
    {
      clave: 'total',
      encabezado: 'Total',
      ordenPor: 'total',
      numerica: true,
      presentar: (p) => formatearImporte(p.total, p.currency?.symbol ?? null)
    }
  ],

  filtros: [{ clave: 'status', etiqueta: 'Estado', tipo: 'multiple', desdeLookup: 'proposal_statuses' }],
  ordenables: ['subject', 'date', 'total'],
  ordenPorDefecto: '-date',
  busqueda: true,
  includes: []
}

/** Contratos visibles para el cliente. */
export const PORTAL_CONTRATOS: DefinicionRecurso<ContratoPortal> = {
  ruta: 'portal/contracts',
  titulo: GLOSARIO.contrato,

  columnas: [
    { clave: 'subject', encabezado: 'Asunto', ordenPor: 'subject', presentar: (c) => c.subject },
    { clave: 'type', encabezado: 'Tipo', presentar: (c) => c.type?.name ?? '' },
    { clave: 'date_start', encabezado: 'Desde', ordenPor: 'datestart', presentar: (c) => formatearFecha(c.date_start) },
    { clave: 'date_end', encabezado: 'Hasta', ordenPor: 'dateend', presentar: (c) => formatearFecha(c.date_end) },
    { clave: 'signed', encabezado: 'Firmado', presentar: (c) => (c.signed ? 'Sí' : 'No') }
  ],

  filtros: [{ clave: 'contract_type', etiqueta: 'Tipo', tipo: 'seleccion', desdeLookup: 'contract_types' }],
  ordenables: ['subject', 'datestart', 'dateend'],
  ordenPorDefecto: '-datestart',
  busqueda: true,
  includes: []
}

/**
 * Suscripciones.
 *
 * Solo las ve el contacto primario y solo si la opcion del portal esta encendida: la API responde
 * 403 en cualquier otro caso, y por eso esta seccion puede no aparecer siquiera en la navegacion.
 */
export const PORTAL_SUSCRIPCIONES: DefinicionRecurso<SuscripcionPortal> = {
  ruta: 'portal/subscriptions',
  titulo: GLOSARIO.suscripcion,

  columnas: [
    { clave: 'name', encabezado: 'Nombre', ordenPor: 'name', presentar: (s) => s.name },
    { clave: 'status', encabezado: 'Estado', presentar: (s) => s.status },
    {
      clave: 'date_subscribed',
      encabezado: 'Desde',
      ordenPor: 'date_subscribed',
      presentar: (s) => formatearFecha(s.date_subscribed)
    },
    { clave: 'next_billing_cycle', encabezado: 'Próximo cobro', presentar: (s) => formatearFecha(s.next_billing_cycle) }
  ],

  filtros: [],
  ordenables: ['name', 'date_subscribed'],
  ordenPorDefecto: 'name',
  busqueda: true,
  includes: []
}

/** Tickets de soporte. */
export const PORTAL_TICKETS: DefinicionRecurso<TicketPortal> = {
  ruta: 'portal/tickets',
  titulo: GLOSARIO.ticket,

  columnas: [
    { clave: 'subject', encabezado: 'Asunto', ordenPor: 'subject', presentar: (t) => t.subject },
    { clave: 'status', encabezado: 'Estado', comoInsignia: 'ticket_statuses', presentar: (t) => t.status },
    { clave: 'priority', encabezado: 'Prioridad', comoInsignia: 'ticket_priorities', presentar: (t) => t.priority },
    { clave: 'date', encabezado: 'Abierto', ordenPor: 'date', presentar: (t) => formatearFecha(t.date) },
    {
      clave: 'last_reply',
      encabezado: 'Última respuesta',
      ordenPor: 'lastreply',
      presentar: (t) => formatearFecha(t.last_reply)
    }
  ],

  filtros: [
    { clave: 'status', etiqueta: 'Estado', tipo: 'multiple', desdeLookup: 'ticket_statuses' },
    { clave: 'priority', etiqueta: 'Prioridad', tipo: 'seleccion', desdeLookup: 'ticket_priorities' }
  ],

  ordenables: ['subject', 'date', 'lastreply'],
  ordenPorDefecto: '-date',
  busqueda: true,
  includes: []
}
