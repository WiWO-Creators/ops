import type { DefinicionRecurso } from './tipos.ts'
import type { ActividadEspacio, Discusion, NotaEspacio } from '../datos/recursos.ts'
import { formatearFecha } from '../lib/fechas.ts'
import { textoPlano } from '../componentes/proyecto/formatos.ts'

/**
 * Definiciones de las tres pestañas de texto del Proyecto: Discusiones, Notas y Actividad.
 *
 * Comparten archivo porque comparten forma —una lista corta, sin filtros de catalogo— y porque las
 * tres se editan juntas cada vez que cambia el contrato de la vista del proyecto.
 *
 * Fuente: `CONTRATO-NUEVO.md` seccion 2.
 */

/** Discusiones del proyecto. */
export const DISCUSIONES: DefinicionRecurso<Discusion> = {
  ruta: 'discussions',
  titulo: { singular: 'Discusión', plural: 'Discusiones' },

  columnas: [
    { clave: 'subject', encabezado: 'Asunto', ordenPor: 'subject', presentar: (d) => d.subject },
    { clave: 'last_activity', encabezado: 'Última actividad', ordenPor: 'last_activity', presentar: (d) => formatearFecha(d.last_activity, true) },
    { clave: 'comments', encabezado: 'Comentarios', numerica: true, presentar: (d) => String(d.counts.comments) },
    { clave: 'show_to_customer', encabezado: 'Mostrar al cliente', presentar: (d) => (d.show_to_customer ? 'Sí' : 'No') },
    { clave: 'staff', encabezado: 'Publicado por', presentar: (d) => d.staff?.full_name ?? d.contact?.full_name ?? '' }
  ],

  filtros: [],
  ordenables: ['subject', 'last_activity', 'date_created'],
  ordenPorDefecto: '-last_activity',
  busqueda: true,
  includes: []
}

/**
 * Notas privadas.
 *
 * Cada persona ve **solo las suyas**: el backend filtra por el staff de la sesion sin parametro, asi
 * que aca no hay filtro por autor y no debe haberlo.
 */
export const NOTAS: DefinicionRecurso<NotaEspacio> = {
  ruta: 'notes',
  titulo: { singular: 'Nota', plural: 'Notas' },

  columnas: [
    { clave: 'title', encabezado: 'Título', ordenPor: 'title', presentar: (n) => n.title },
    { clave: 'content', encabezado: 'Contenido', presentar: (n) => textoPlano(n.content) },
    { clave: 'date_added', encabezado: 'Fecha añadida', ordenPor: 'date_added', presentar: (n) => formatearFecha(n.date_added) }
  ],

  filtros: [],
  ordenables: ['title', 'date_added'],
  ordenPorDefecto: '-date_added',
  busqueda: false,
  includes: []
}

/**
 * Feed de actividad.
 *
 * `description` y `additional_data` llegan ya traducidas y con los pseudo-tags `<seconds>` y `<lang>`
 * resueltos: eso lo hace la API, y rehacerlo aca seria duplicar logica del backend.
 */
export const ACTIVIDAD: DefinicionRecurso<ActividadEspacio> = {
  ruta: 'activity',
  titulo: { singular: 'Actividad', plural: 'Actividad' },

  columnas: [
    { clave: 'date_added', encabezado: 'Cuándo', ordenPor: 'date_added', presentar: (a) => formatearFecha(a.date_added, true) },
    { clave: 'staff', encabezado: 'Quién', presentar: (a) => a.staff?.full_name ?? a.contact?.full_name ?? 'Sistema' },
    { clave: 'description', encabezado: 'Qué pasó', presentar: (a) => a.description },
    { clave: 'additional_data', encabezado: 'Detalle', presentar: (a) => textoPlano(a.additional_data) },
    { clave: 'visible_to_customer', encabezado: 'Visible para el cliente', presentar: (a) => (a.visible_to_customer ? 'Sí' : 'No') }
  ],

  filtros: [],
  ordenables: ['date_added'],
  ordenPorDefecto: '-date_added',
  busqueda: false,
  includes: []
}
