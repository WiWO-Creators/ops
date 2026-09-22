import type { DefinicionRecurso } from './tipos.ts'
import type { ActividadEspacio, NotaEspacio } from '../datos/recursos.ts'
import { formatearFecha } from '../lib/fechas.ts'
import { textoPlano } from '../componentes/proyecto/formatos.ts'

/**
 * Definiciones de las dos pestañas de texto del Proyecto: Notas y Actividad.
 *
 * Comparten archivo porque comparten forma —una lista corta, sin filtros de catalogo— y porque las
 * dos se editan juntas cada vez que cambia el contrato de la vista del proyecto.
 *
 * Fuente: `CONTRATO-NUEVO.md` seccion 2.
 */

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

  filtros: [
    { clave: 'title', etiqueta: 'Título', tipo: 'campo', tipoDato: 'texto' },
    { clave: 'content', etiqueta: 'Contenido', tipo: 'campo', tipoDato: 'texto' },
    { clave: 'date_added', etiqueta: 'Creado', tipo: 'campo', tipoDato: 'fecha' },
  ],
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

  filtros: [
    { clave: 'date_added', etiqueta: 'Fecha', tipo: 'campo', tipoDato: 'fecha' },
    { clave: 'staff', etiqueta: 'Persona', tipo: 'campo', tipoDato: 'texto' },
    { clave: 'description', etiqueta: 'Descripción', tipo: 'campo', tipoDato: 'texto' },
    { clave: 'additional_data', etiqueta: 'Detalle', tipo: 'campo', tipoDato: 'texto' },
    { clave: 'visible_to_customer', etiqueta: 'Visible al cliente', tipo: 'campo', tipoDato: 'booleano' },
  ],
  ordenables: ['date_added'],
  ordenPorDefecto: '-date_added',
  busqueda: false,
  includes: []
}
