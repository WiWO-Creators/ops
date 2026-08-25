import type { DefinicionRecurso } from './tipos.ts'
import type { Cliente, NotaCliente } from '../datos/recursos.ts'
import { formatearFecha } from '../lib/fechas.ts'

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

/**
 * Notas de un Cliente (`GET /clients/{id}/notes`).
 *
 * **No es `NOTAS` de un Espacio.** Aquellas son privadas —cada persona ve solo las suyas— y tienen
 * `title` y `content`; estas las ve todo el staff, traen autor y el texto vive en `description`.
 * Reusar la otra definicion dejaria tres columnas vacias y escondería quien escribio cada nota.
 *
 * El backend no expone escrituras de notas de cliente: la pestaña es de solo lectura.
 */
export const NOTAS_CLIENTE: DefinicionRecurso<NotaCliente> = {
  ruta: 'notes',
  titulo: { singular: 'Nota', plural: 'Notas' },

  columnas: [
    { clave: 'description', encabezado: 'Nota', presentar: (n) => n.description },
    { clave: 'staff', encabezado: 'Autor', presentar: (n) => n.staff?.full_name ?? '' },
    {
      clave: 'date_contacted',
      encabezado: 'Contacto',
      ordenPor: 'date_contacted',
      presentar: (n) => formatearFecha(n.date_contacted, true)
    },
    {
      clave: 'date_added',
      encabezado: 'Añadida',
      ordenPor: 'date_added',
      presentar: (n) => formatearFecha(n.date_added, true)
    }
  ],

  filtros: [],
  ordenables: ['date_added', 'date_contacted'],
  ordenPorDefecto: '-date_added',
  busqueda: true,
  includes: []
}
