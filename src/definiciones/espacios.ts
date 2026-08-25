import type { DefinicionRecurso } from './tipos.ts'
import type { Espacio } from '../datos/recursos.ts'
import { GLOSARIO } from '../dominio/glosario.ts'

/**
 * Definicion del recurso Espacios.
 *
 * Fuente: `docs/modulos/02-espacios.md`. `date_from` y `date_to` filtran sobre `start_date` aca,
 * mientras que en Procesos filtran sobre `duedate`: el nombre del parametro es el mismo y el campo
 * al que apunta no, asi que la etiqueta visible tiene que decirlo.
 */
export const ESPACIOS: DefinicionRecurso<Espacio> = {
  ruta: 'projects',
  titulo: GLOSARIO.espacio,

  columnas: [
    { clave: 'name', encabezado: 'Nombre', ordenPor: 'name', presentar: (e) => e.name },
    { clave: 'client', encabezado: 'Cliente', presentar: (e) => e.client?.company ?? '' },
    { clave: 'status', encabezado: 'Estado', comoInsignia: 'project_statuses', presentar: (e) => e.status },
    // `progress` lo calcula el backend; no es la columna de la base y no se edita.
    { clave: 'progress', encabezado: 'Avance', ordenPor: 'progress', numerica: true, presentar: (e) => `${e.progress}%` },
    {
      clave: 'tasks_open',
      encabezado: `${GLOSARIO.proceso.plural} abiertos`,
      numerica: true,
      presentar: (e) => e.counts.tasks_open
    },
    { clave: 'start_date', encabezado: 'Inicio', ordenPor: 'start_date', presentar: (e) => e.start_date ?? '' },
    { clave: 'deadline', encabezado: 'Entrega', ordenPor: 'deadline', presentar: (e) => e.deadline ?? '' }
  ],

  filtros: [
    { clave: 'status', etiqueta: 'Estado', tipo: 'multiple', desdeLookup: 'project_statuses' },
    { clave: 'clientid', etiqueta: 'Cliente', tipo: 'seleccion' },
    { clave: 'inicia', etiqueta: 'Inicia', tipo: 'rangoFechas', clavesRango: ['date_from', 'date_to'] }
  ],

  ordenables: ['name', 'start_date', 'deadline', 'progress'],
  ordenPorDefecto: 'name',
  busqueda: true,
  includes: ['custom_fields', 'members']
}
