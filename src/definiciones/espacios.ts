import { filtrosDeCamposPersonalizados } from './filtros.ts'
import type { Columna, DefinicionRecurso, OpcionFiltro } from './tipos.ts'
import type { CampoPersonalizadoMeta, Espacio } from '../datos/recursos.ts'
import { GLOSARIO } from '../dominio/glosario.ts'
import { formatearFecha } from '../lib/fechas.ts'

/**
 * Definicion del recurso Espacios.
 *
 * Fuente: `docs/modulos/02-espacios.md` y el contrato ampliado del listado.
 *
 * Los presentadores de este archivo devuelven **texto plano** a proposito: son los que alimentan la
 * exportacion a CSV, y ademas un `.ts` no puede contener JSX. La tabla enriquece despues las columnas
 * que necesitan avatares, etiquetas o enlaces (`ColumnasProyecto.tsx`), sin duplicar la lista.
 *
 * `date_from` y `date_to` filtran sobre `start_date` aca, mientras que en Procesos filtran sobre
 * `duedate`: el nombre del parametro es el mismo y el campo al que apunta no, asi que la etiqueta
 * visible tiene que decirlo.
 */

/**
 * Tipos de facturacion de un Espacio (`tblprojects.billing_type`).
 *
 * Van fijos y no en `lookups` porque no son configurables en Perfex: son tres ramas de codigo del
 * panel, no un catalogo que alguien administre.
 */
export const TIPOS_DE_FACTURACION: OpcionFiltro[] = [
  { valor: '1', etiqueta: 'Costo fijo' },
  { valor: '2', etiqueta: 'Horas del proyecto' },
  { valor: '3', etiqueta: 'Horas de tareas por tarifa' }
]

export const ESPACIOS: DefinicionRecurso<Espacio> = {
  ruta: 'projects',
  titulo: GLOSARIO.espacio,

  columnas: [
    { clave: 'id', encabezado: '#', ordenPor: 'id', numerica: true, presentar: (e) => e.id },
    { clave: 'name', encabezado: `Nombre del ${GLOSARIO.espacio.singular.toLowerCase()}`, ordenPor: 'name', presentar: (e) => e.name },
    { clave: 'client', encabezado: 'Cliente', presentar: (e) => e.client?.company ?? '' },
    { clave: 'tags', encabezado: 'Etiquetas', presentar: (e) => e.tags.map((t) => t.name).join(', ') },
    { clave: 'start_date', encabezado: 'Fecha de inicio', ordenPor: 'start_date', presentar: (e) => formatearFecha(e.start_date) },
    { clave: 'deadline', encabezado: 'Fecha de entrega', ordenPor: 'deadline', presentar: (e) => formatearFecha(e.deadline) },
    { clave: 'members', encabezado: 'Miembros', presentar: (e) => (e.members ?? []).map((m) => m.full_name).join(', ') },
    { clave: 'status', encabezado: 'Estado', comoInsignia: 'project_statuses', presentar: (e) => e.status },
    // `progress` lo calcula el backend; no es la columna de la base y no se edita.
    {
      clave: 'progress',
      encabezado: 'Avance',
      ordenPor: 'progress',
      numerica: true,
      ocultaPorDefecto: true,
      presentar: (e) => `${e.progress}%`
    },
    {
      clave: 'tasks_open',
      encabezado: `${GLOSARIO.proceso.plural} abiertas`,
      numerica: true,
      ocultaPorDefecto: true,
      presentar: (e) => e.counts.tasks_open
    }
  ],

  filtros: [
    { clave: 'id', etiqueta: 'ID', tipo: 'campo', tipoDato: 'numero' },
    { clave: 'name', etiqueta: 'Nombre', tipo: 'campo', tipoDato: 'texto' },
    { clave: 'description', etiqueta: 'Descripción', tipo: 'campo', tipoDato: 'texto' },
    { clave: 'tags', etiqueta: 'Etiquetas', tipo: 'campo', tipoDato: 'texto' },
    { clave: 'start_date', etiqueta: 'Inicio', tipo: 'campo', tipoDato: 'fecha' },
    { clave: 'deadline', etiqueta: 'Entrega', tipo: 'campo', tipoDato: 'fecha' },
    { clave: 'progress', etiqueta: 'Avance', tipo: 'campo', tipoDato: 'numero' },
    { clave: 'tasks_open', etiqueta: 'Tareas abiertas', tipo: 'campo', tipoDato: 'numero' },
    { clave: 'date_finished', etiqueta: 'Finalizado', tipo: 'campo', tipoDato: 'fecha' },
    { clave: 'progress_from_tasks', etiqueta: 'Avance por tareas', tipo: 'campo', tipoDato: 'booleano' },
    { clave: 'project_cost', etiqueta: 'Costo', tipo: 'campo', tipoDato: 'numero' },
    { clave: 'project_rate_per_hour', etiqueta: 'Tarifa por hora', tipo: 'campo', tipoDato: 'numero' },
    { clave: 'estimated_hours', etiqueta: 'Horas estimadas', tipo: 'campo', tipoDato: 'numero' },
    { clave: 'added_from', etiqueta: 'Creado por', tipo: 'campo', tipoDato: 'numero' },
    { clave: 'project_created', etiqueta: 'Creado', tipo: 'campo', tipoDato: 'fecha' },
    { clave: 'archived_at', etiqueta: 'Archivado el', tipo: 'campo', tipoDato: 'fecha' },
    { clave: 'status', etiqueta: 'Estado', tipo: 'multiple', desdeLookup: 'project_statuses' },
    { clave: 'clientid', etiqueta: 'Cliente', tipo: 'seleccion', desdeLookup: 'clients' },
    { clave: 'member', etiqueta: 'Miembros', tipo: 'multiple', desdeLookup: 'staff' },
    { clave: 'billing_type', etiqueta: 'Facturación', tipo: 'seleccion', opciones: TIPOS_DE_FACTURACION },
    { clave: 'inicia', etiqueta: 'Inicia', tipo: 'rangoFechas', clavesRango: ['date_from', 'date_to'] },
    // Sin este filtro los archivados no se ven en ninguna parte: el backend los deja fuera de
    // `GET /projects` mientras nadie mande `filter[archivado]`. Por eso la opcion de reposo no es
    // "todos" sino "Solo activos", y la unica alternativa trae solo los archivados: pedir
    // `filter[archivado]=0,1` mostraria las dos cosas mezcladas y el selector no sabria cual esta
    // puesta al releer la URL.
    {
      clave: 'archivado',
      etiqueta: 'Archivo',
      etiquetaSinFiltro: 'Solo activos',
      tipo: 'seleccion',
      opciones: [{ valor: '1', etiqueta: 'Ver archivados' }]
    }
  ],

  ordenables: ['id', 'name', 'start_date', 'deadline', 'progress'],
  // El panel viejo abre ordenado por fecha de entrega ascendente; se conserva para no mover el piso.
  ordenPorDefecto: 'deadline',
  busqueda: true,
  includes: ['custom_fields', 'members'],
  // Miembros y campos personalizados son columnas de la tabla, no un extra: se piden siempre.
  incluirSiempre: ['custom_fields', 'members']
}

/**
 * Convierte el `<br />` que Perfex guarda en los `textarea` en saltos de linea de verdad.
 *
 * Los valores de campo personalizado de tipo `textarea` se guardan pasados por `nl2br()`, asi que
 * llegan con etiquetas HTML embebidas. Mostrarlos crudos deja "<br />" a la vista.
 *
 * @param valor Valor tal como lo devuelve la API.
 * @returns El mismo texto con saltos reales y sin etiquetas.
 */
export function textoDeCampo (valor: string | null): string {
  if (valor === null) return ''

  return valor.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '').trim()
}

/**
 * Valor de un campo personalizado de una fila, por `slug`.
 *
 * @param espacio Fila del listado, con `custom_fields` ya incluido.
 * @param slug Identificador del campo. Ej: `projects_palabra_clave`.
 * @returns El texto listo para mostrar; vacio si la fila no trae ese campo.
 */
export function valorDeCampo (espacio: Espacio, slug: string): string {
  const campo = (espacio.custom_fields ?? []).find((c) => c.slug === slug)

  return campo === undefined ? '' : textoDeCampo(campo.value)
}

/**
 * Columnas del listado que salen de los campos personalizados marcados `show_on_table`.
 *
 * Son dinamicas porque las administra Perfex: hoy son "N° de Cotización" y "Palabra Clave", y mañana
 * pueden ser otras. Por eso no estan escritas en `ESPACIOS.columnas`, y por eso no son ordenables:
 * el backend no acepta ordenar por un campo personalizado.
 *
 * @param campos Metadatos de `GET /custom-fields?para=projects`.
 * @returns Una columna por campo visible en tabla, en el orden que declara Perfex.
 */
export function columnasDeCamposPersonalizados (campos: CampoPersonalizadoMeta[]): Array<Columna<Espacio>> {
  return campos
    .filter((campo) => campo.show_on_table)
    .sort((a, b) => a.order - b.order)
    .map((campo) => ({
      clave: `cf_${campo.slug}`,
      encabezado: campo.name,
      numerica: campo.type === 'number',
      presentar: (espacio: Espacio) => valorDeCampo(espacio, campo.slug)
    }))
}

/**
 * La definicion con las columnas de campos personalizados ya anexadas.
 *
 * @param campos Metadatos de `GET /custom-fields?para=projects`. Vacio deja la definicion base.
 * @returns Una definicion nueva; `ESPACIOS` no se muta.
 */
export function espaciosConCampos (campos: CampoPersonalizadoMeta[]): DefinicionRecurso<Espacio> {
  return { ...ESPACIOS, filtros: [...ESPACIOS.filtros, ...filtrosDeCamposPersonalizados(campos)], columnas: [...ESPACIOS.columnas, ...columnasDeCamposPersonalizados(campos)] }
}
