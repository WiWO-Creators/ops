import type { DefinicionRecurso } from './tipos.ts'
import type { ActividadEspacio, Discusion, NotaEspacio } from '../datos/recursos.ts'
import { formatearFecha } from '../lib/fechas.ts'
import { textoPlano } from '../componentes/proyecto/formatos.ts'
import type { FuenteDeProyecto } from '../dominio/fuente-proyecto.ts'

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

  filtros: [
    { clave: 'subject', etiqueta: 'Asunto', tipo: 'campo', tipoDato: 'texto' },
    { clave: 'last_activity', etiqueta: 'Última actividad', tipo: 'campo', tipoDato: 'fecha' },
    { clave: 'comments', etiqueta: 'Comentarios', tipo: 'campo', tipoDato: 'numero' },
    { clave: 'show_to_customer', etiqueta: 'Visible al cliente', tipo: 'campo', tipoDato: 'booleano' },
    { clave: 'staff', etiqueta: 'Publicado por', tipo: 'campo', tipoDato: 'texto' },
  ],
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

/**
 * Las columnas de Discusiones que el contrato del contacto **si** emite.
 *
 * Falta `show_to_customer`: al portal solo llegan las que la tienen, asi que la columna diria
 * siempre "Sí" y delataria que existe la distincion (ver `DiscusionPortal`).
 */
const COLUMNAS_DE_DISCUSION_DEL_CONTACTO = ['subject', 'last_activity', 'comments', 'staff']

/**
 * Las Discusiones de un Proyecto para el equipo.
 *
 * @param proyectoId El Proyecto que se esta mirando.
 * @returns La definicion con la ruta ya acotada al Proyecto.
 */
export function discusionesDelEspacio (proyectoId: number): DefinicionRecurso<Discusion> {
  return { ...DISCUSIONES, ruta: `projects/${encodeURIComponent(String(proyectoId))}/discussions` }
}

/**
 * Las Discusiones de un Proyecto tal como las ve un contacto.
 *
 * **Se deriva de la del equipo**, como `procesosDelContacto`: encabezados, orden de columnas y
 * rotulos salen de un solo lugar. Lo unico propio es cuanto se muestra.
 *
 * Los filtros, el orden y la busqueda **si** viajan: `RecursoDiscusiones::paraContacto()` usa la
 * misma whitelist que el endpoint del equipo. El unico que se cae es el de visibilidad al cliente,
 * por lo mismo que la columna.
 *
 * @param proyectoId El Proyecto que el cliente esta mirando.
 * @returns La definicion lista para la tabla del portal.
 */
export function discusionesDelContacto (proyectoId: number): DefinicionRecurso<Discusion> {
  return {
    ...DISCUSIONES,
    ruta: `portal/projects/${encodeURIComponent(String(proyectoId))}/discussions`,
    columnas: DISCUSIONES.columnas.filter((c) => COLUMNAS_DE_DISCUSION_DEL_CONTACTO.includes(c.clave)),
    filtros: DISCUSIONES.filtros.filter((f) => f.clave !== 'show_to_customer')
  }
}

/**
 * Elige la definicion de Discusiones que corresponde al sujeto.
 *
 * **Es la unica lectura de `sujeto`** de esta pestaña, y vive aca y no en el panel: que columnas y
 * que filtros existen es propiedad del contrato, no del dibujo.
 *
 * @param fuente De donde bajan los datos del Proyecto.
 * @param proyectoId El Proyecto que se esta mirando.
 * @returns La definicion del sujeto que corresponda.
 */
export function definicionDeDiscusiones (fuente: FuenteDeProyecto, proyectoId: number): DefinicionRecurso<Discusion> {
  return fuente.sujeto === 'portal' ? discusionesDelContacto(proyectoId) : discusionesDelEspacio(proyectoId)
}
