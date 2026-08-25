import type { DefinicionRecurso } from './tipos.ts'
import type { Cliente } from '../datos/recursos.ts'

/**
 * Definicion del recurso Clientes.
 *
 * Fuente: `docs/modulos/03-clientes.md`. `company` nunca llega vacio: el backend ya aplica el
 * respaldo al contacto primario y, si tampoco hay, a "Cliente #N". El frontend no debe repetirlo.
 */
export const CLIENTES: DefinicionRecurso<Cliente> = {
  ruta: 'clients',
  titulo: { singular: 'Cliente', plural: 'Clientes' },

  columnas: [
    { clave: 'company', encabezado: 'Empresa', ordenPor: 'company', presentar: (c) => c.company },
    { clave: 'vat', encabezado: 'RUT', presentar: (c) => c.vat ?? '' },
    { clave: 'phonenumber', encabezado: 'Teléfono', presentar: (c) => c.phonenumber ?? '' },
    { clave: 'city', encabezado: 'Ciudad', ocultaPorDefecto: true, presentar: (c) => c.city ?? '' },
    { clave: 'active', encabezado: 'Activo', presentar: (c) => (c.active ? 'Sí' : 'No') },
    {
      clave: 'datecreated',
      encabezado: 'Alta',
      ordenPor: 'datecreated',
      ocultaPorDefecto: true,
      presentar: (c) => c.datecreated
    }
  ],

  filtros: [
    { clave: 'active', etiqueta: 'Activo', tipo: 'booleano' },
    { clave: 'country_id', etiqueta: 'País', tipo: 'seleccion' }
  ],

  ordenables: ['company', 'datecreated'],
  ordenPorDefecto: 'company',
  busqueda: true,
  includes: ['custom_fields', 'contacts']
}
