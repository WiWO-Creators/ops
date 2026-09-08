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
