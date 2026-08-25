import type { DefinicionRecurso } from './tipos.ts'
import type { ContratoEspacio } from '../datos/recursos.ts'
import { formatearFecha } from '../lib/fechas.ts'
import { formatearImporte } from '../componentes/proyecto/formatos.ts'

/**
 * Definicion del recurso Contratos acotado a un Proyecto.
 *
 * Solo lectura: el panel viejo tampoco ofrece crear un contrato desde la vista del proyecto.
 *
 * Fuente: `CONTRATO-NUEVO.md` seccion 2.
 */
export const CONTRATOS: DefinicionRecurso<ContratoEspacio> = {
  ruta: 'contracts',
  titulo: { singular: 'Contrato', plural: 'Contratos' },

  columnas: [
    { clave: 'subject', encabezado: 'Asunto', ordenPor: 'subject', presentar: (c) => c.subject },
    { clave: 'contract_type', encabezado: 'Tipo', presentar: (c) => c.contract_type?.name ?? '' },
    { clave: 'client', encabezado: 'Cliente', presentar: (c) => c.client?.company ?? '' },
    { clave: 'datestart', encabezado: 'Inicio', ordenPor: 'datestart', presentar: (c) => formatearFecha(c.datestart) },
    { clave: 'dateend', encabezado: 'Fin', ordenPor: 'dateend', presentar: (c) => formatearFecha(c.dateend) },
    { clave: 'contract_value', encabezado: 'Valor', numerica: true, presentar: (c) => formatearImporte(c.contract_value) },
    { clave: 'signed', encabezado: 'Firmado', presentar: (c) => (c.signed ? 'Sí' : 'No') }
  ],

  filtros: [
    { clave: 'contract_type', etiqueta: 'Tipo', tipo: 'seleccion', desdeLookup: 'contract_types' }
  ],

  ordenables: ['subject', 'datestart', 'dateend'],
  ordenPorDefecto: '-datestart',
  busqueda: true,
  includes: []
}
