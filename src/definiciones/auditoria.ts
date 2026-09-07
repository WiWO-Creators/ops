import type { DefinicionRecurso } from './tipos.ts'
import type { RegistroAuditoria } from '../datos/auditoria.ts'
import { TIPOS_AUDITORIA } from '../datos/auditoria.ts'
import { formatearFecha } from '../lib/fechas.ts'

/**
 * Definición del historial de acciones (`GET /audit`, sobre `tblactivity_log`).
 *
 * Es una **tabla con filtros y no una línea de tiempo**, y el motivo está en la tabla, no en el
 * gusto: ninguna fila enlaza a una entidad (no hay `rel_type` ni `rel_id`), así que no hay ficha que
 * abrir; y el actor es un `varchar` con el nombre escrito, no un id, así que tampoco hay persona a la
 * que ir. Lo único que se puede hacer con estas filas es buscarlas y contarlas.
 *
 * `columnas` no declara `ordenPor` en Tipo ni en Acción porque la API sólo ordena por `date` e `id`:
 * un `sort` que no esté en su whitelist devuelve 422, no se ignora.
 *
 * Sin `filtros` de tipo la pantalla es inútil — de ~6.100 filas, 2.442 son correos: las primeras
 * páginas serían todas notificaciones. Las opciones salen de `GET /audit/filters` y las inyecta la
 * pantalla, no un lookup: este catálogo es propio de la auditoría y no vive en `/lookups`.
 */
export const AUDITORIA: DefinicionRecurso<RegistroAuditoria> = {
  ruta: 'audit',
  titulo: { singular: 'Acción', plural: 'Historial de acciones' },

  columnas: [
    {
      clave: 'date',
      encabezado: 'Cuándo',
      ordenPor: 'date',
      sinCortar: true,
      // Texto y no JSX: el presentador alimenta también la exportación a CSV.
      presentar: (fila) => formatearFecha(fila.date, true)
    },
    {
      clave: 'actor',
      encabezado: 'Quién',
      // `null` es el cron y los intentos de acceso de cuentas que no existen. "Sistema" es más
      // honesto que un guion: dice que la acción no la hizo una persona.
      presentar: (fila) => fila.actor ?? 'Sistema'
    },
    {
      clave: 'type',
      encabezado: 'Tipo',
      sinCortar: true,
      presentar: (fila) => TIPOS_AUDITORIA[fila.type]?.etiqueta ?? fila.type
    },
    {
      clave: 'description',
      encabezado: 'Qué pasó',
      // Texto ya renderizado por quien anotó la fila: no hay clave de idioma que resolver.
      presentar: (fila) => fila.description
    }
  ],

  filtros: [
    { clave: 'type', etiqueta: 'Tipo', tipo: 'multiple' },
    { clave: 'actor', etiqueta: 'Persona', tipo: 'seleccion' },
    { clave: 'fecha', etiqueta: 'Fecha', tipo: 'rangoFechas', clavesRango: ['date_from', 'date_to'] }
  ],

  ordenables: ['date', 'id'],
  ordenPorDefecto: '-date',
  busqueda: true,
  includes: []
}
