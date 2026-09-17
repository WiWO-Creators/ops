import type { DefinicionRecurso } from './tipos.ts'
import type { Acta } from '../datos/recursos.ts'
import { formatearFecha } from '../lib/fechas.ts'
import { aTextoPlano } from '../componentes/proyecto/formatos.ts'

/**
 * Meeting Paper del Proyecto.
 *
 * A diferencia de `NOTAS`, la lista es **compartida**: el backend no filtra por autor, asi que acá
 * aparece la columna de quien la escribio. Sin ella, dos actas del mismo dia son indistinguibles.
 *
 * La vista previa del contenido pasa por `aTextoPlano` y no se pinta como HTML. No es una limitacion
 * de la tabla: es la regla del repo. El HTML del acta solo se muestra dentro del iframe aislado del
 * visor.
 *
 * `ordenables` tiene que coincidir con la whitelist del backend (`RecursoActas::consulta()`) o la
 * primera carga devuelve 422.
 */
export const ACTAS: DefinicionRecurso<Acta> = {
  ruta: 'actas',
  titulo: { singular: 'Meeting Paper', plural: 'Meeting Papers' },

  columnas: [
    { clave: 'title', encabezado: 'Título', ordenPor: 'title', presentar: (a) => a.title },
    { clave: 'client', encabezado: 'Cliente', presentar: (a) => a.client === '' ? '—' : a.client },
    {
      clave: 'meeting_date',
      encabezado: 'Fecha de la reunión',
      ordenPor: 'meeting_date',
      presentar: (a) => formatearFecha(a.meeting_date)
    },
    {
      clave: 'author',
      encabezado: 'Escrito por',
      presentar: (a) => a.author === null ? '—' : a.author.full_name
    },
    {
      clave: 'date_added',
      encabezado: 'Creado',
      ordenPor: 'date_added',
      presentar: (a) => formatearFecha(a.date_added)
    }
  ],

  filtros: [],
  ordenables: ['title', 'meeting_date', 'date_added'],
  ordenPorDefecto: '-date_added',
  busqueda: true,
  includes: []
}

/** Marcas del holding, para el selector del formulario. Los codigos son los que acepta la API. */
export const MARCAS: Array<{ valor: string, etiqueta: string }> = [
  { valor: 'mgc', etiqueta: 'MGC' },
  { valor: 'wiwo', etiqueta: 'Wiwo' },
  { valor: 'palta', etiqueta: 'Palta' }
]

/** Modalidades de la reunión. La cadena vacía es "no se dijo", que no es lo mismo que inválida. */
export const MODALIDADES: Array<{ valor: string, etiqueta: string }> = [
  { valor: 'online', etiqueta: 'Online' },
  { valor: 'presencial', etiqueta: 'Presencial' },
  { valor: 'hibrida', etiqueta: 'Híbrida' }
]

/** Vista previa del contenido, sin HTML. Se usa donde haga falta resumir un acta en una línea. */
export function vistaPrevia (html: string | null | undefined, maximo = 120): string {
  const plano = aTextoPlano(html ?? '').replace(/\s+/g, ' ').trim()

  return plano.length <= maximo ? plano : `${plano.slice(0, maximo - 1).trimEnd()}…`
}

/**
 * === TAREAS PROPUESTAS A PARTIR DE UN MEETING PAPER ===
 *
 * Lo que el modelo leyó como un acuerdo o un compromiso dentro del acta y todavía no es una Tarea.
 * Son propuestas, no Procesos: viven aparte hasta que alguien del equipo las revisa y las crea, y
 * por eso tienen estado propio (`pendiente`, `creada`, `descartada`) en vez de nacer en el tablero.
 *
 * Las claves van en el idioma del contrato de la API, que las emite en español.
 */

/** En qué punto de la revisión está una propuesta. */
export type EstadoDePropuesta = 'pendiente' | 'creada' | 'descartada'

/** Qué parte del acta la originó. `ia` es lo que el modelo dedujo sin que el acta lo rotulara. */
export type OrigenDePropuesta = 'acuerdo' | 'compromiso' | 'ia'

/** Una persona ya resuelta contra el equipo. Las que el modelo no pudo resolver van en `no_resuelto`. */
export interface PersonaDePropuesta {
  id: number
  nombre: string
}

/** Una etiqueta ya resuelta contra el catálogo. */
export interface EtiquetaDePropuesta {
  id: number
  nombre: string
}

/** Una tarea propuesta, tal como la emite `GET projects/{id}/actas/{actaId}/tareas`. */
export interface PropuestaDeTarea {
  id: number
  acta_id: number
  estado: EstadoDePropuesta
  titulo: string
  descripcion: string | null
  /** `YYYY-MM-DD`, o `null` cuando en la reunión no se dijo para cuándo. */
  vence: string | null
  /** Id de `task_priorities` (1..4). */
  prioridad: number
  origen: OrigenDePropuesta
  /** El fragmento del acta del que salió. Es lo que deja verificar la propuesta sin releer el acta. */
  texto_origen: string
  asignados: PersonaDePropuesta[]
  etiquetas: EtiquetaDePropuesta[]
  /**
   * Lo que el modelo no pudo resolver contra los catálogos, ya redactado por la API
   * (`persona "Juan"`). Cada entrada es un campo que quedó vacío y hay que completar a mano.
   */
  no_resuelto: string[]
  /** El Proceso que se creó desde esta propuesta. `null` mientras siga pendiente. */
  task_id: number | null
  task_name: string | null
}

/** Los contadores de la sección, para no recorrer la lista en cada render. */
export interface MetaDePropuestas {
  pendientes: number
  creadas: number
  descartadas: number
  /** Cuándo corrió el modelo. `null` cuando de esta acta nunca se propuso nada. */
  generado_en: string | null
  origen_ia: boolean
}

/** Respuesta del listado y de "Volver a proponer": las dos tienen la misma forma. */
export interface PropuestasDelActa {
  items: PropuestaDeTarea[]
  meta: MetaDePropuestas
}

/**
 * Cuerpo del `PATCH` de una propuesta. Todo opcional: se manda solo lo que se tocó.
 *
 * `etiquetas` son nombres y no ids a propósito —así lo acepta la API—: el modelo propone etiquetas
 * que todavía no existen, y exigir un id obligaría a crearlas antes de poder guardar la propuesta.
 */
export interface ParcheDePropuesta {
  titulo?: string
  descripcion?: string | null
  vence?: string | null
  prioridad?: number
  asignados?: number[]
  etiquetas?: string[]
}

/** Respuesta de `POST .../tareas/crear`: qué se creó y qué no, propuesta por propuesta. */
export interface ResultadoDeCreacion {
  creadas: Array<{ propuesta_id: number, task_id: number, name: string }>
  fallidas: Array<{ propuesta_id: number, error: string }>
}
