import type { DefinicionRecurso } from './tipos.ts'
import type { ArchivoProyecto } from '../datos/recursos.ts'
import { formatearFecha } from '../lib/fechas.ts'

/**
 * Definicion del recurso Archivos de un Proyecto.
 *
 * La `ruta` neutra la reemplaza la pestaña por `projects/{id}/files`.
 *
 * Fuente: `docs/modulos/02-espacios.md` y `E1-pestanas-legado.md` seccion 6.
 */
export const ARCHIVOS: DefinicionRecurso<ArchivoProyecto> = {
  ruta: 'files',
  titulo: { singular: 'Archivo', plural: 'Archivos' },

  columnas: [
    { clave: 'file_name', encabezado: 'Nombre de archivo', ordenPor: 'file_name', presentar: (a) => a.subject ?? a.original_file_name ?? a.file_name },
    { clave: 'filetype', encabezado: 'Tipo', presentar: (a) => a.filetype ?? '' },
    { clave: 'visible_to_customer', encabezado: 'Visible para el cliente', presentar: (a) => (a.visible_to_customer ? 'Sí' : 'No') },
    { clave: 'date_added', encabezado: 'Fecha de subida', ordenPor: 'date_added', presentar: (a) => formatearFecha(a.date_added, true) },
    { clave: 'external', encabezado: 'Origen', presentar: (a) => (a.external === null || a.external === '' ? 'Interno' : a.external) }
  ],

  filtros: [],
  ordenables: ['file_name', 'date_added'],
  ordenPorDefecto: '-date_added',
  busqueda: false,
  includes: []
}
