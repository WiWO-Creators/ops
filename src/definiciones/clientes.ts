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
    { clave: 'company', etiqueta: 'Empresa', tipo: 'campo', tipoDato: 'texto' },
    { clave: 'vat', etiqueta: 'RUT', tipo: 'campo', tipoDato: 'texto' },
    { clave: 'phonenumber', etiqueta: 'Teléfono', tipo: 'campo', tipoDato: 'texto' },
    { clave: 'city', etiqueta: 'Ciudad', tipo: 'campo', tipoDato: 'texto' },
    { clave: 'datecreated', etiqueta: 'Creado', tipo: 'campo', tipoDato: 'fecha' },
    { clave: 'active', etiqueta: 'Activo', tipo: 'booleano' },
    { clave: 'country_id', etiqueta: 'País', tipo: 'seleccion' },
    // "Mis clientes" son las cuentas donde una es focal, y el reposo es la cartera entera. Va como
    // `seleccion` de una sola opcion y no como `booleano` porque el "No" de un booleano seria "los
    // clientes de los que NO soy focal", que nadie pide y que ademas se lee como un error.
    {
      clave: 'focal',
      etiqueta: 'Cartera',
      etiquetaSinFiltro: 'Todos los clientes',
      tipo: 'seleccion',
      opciones: [{ valor: '1', etiqueta: 'Mis clientes' }]
    }
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

  filtros: [
    { clave: 'description', etiqueta: 'Nota', tipo: 'campo', tipoDato: 'texto' },
    { clave: 'staff', etiqueta: 'Autor', tipo: 'campo', tipoDato: 'texto' },
    { clave: 'date_contacted', etiqueta: 'Fecha contacto', tipo: 'campo', tipoDato: 'fecha' },
    { clave: 'date_added', etiqueta: 'Creado', tipo: 'campo', tipoDato: 'fecha' },
  ],
  ordenables: ['date_added', 'date_contacted'],
  ordenPorDefecto: '-date_added',
  busqueda: true,
  includes: []
}
