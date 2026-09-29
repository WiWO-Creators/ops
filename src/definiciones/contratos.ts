import type { DefinicionRecurso, OpcionFiltro } from './tipos.ts'
import type { Contrato } from '../datos/recursos.ts'
import { GLOSARIO } from '../dominio/glosario.ts'
import { formatearFecha, LOCALE } from '../lib/fechas.ts'

/**
 * Definicion del recurso Contratos (WIW-0502): los contratos de Perfex para Finanzas y Comercial.
 *
 * La API no recorta filas —la puerta es la seccion entera—, asi que la tabla es la base completa
 * menos la papelera de Perfex. `vigencia` compara contra el dia de hoy en el servidor; los rangos
 * de fecha son los de siempre.
 */

/** Las tres vigencias que entiende `filter[vigencia]` (`RecursoContratos::VIGENCIAS`). */
export const VIGENCIAS_DE_CONTRATO: OpcionFiltro[] = [
  { valor: 'vigentes', etiqueta: 'Vigentes' },
  { valor: 'por_vencer', etiqueta: 'Por vencer (30 días)' },
  { valor: 'vencidos', etiqueta: 'Vencidos' }
]

/**
 * El valor del contrato para mostrar. Sin simbolo de moneda: Perfex no guarda la moneda del
 * contrato, y pintar "$" sobre un monto en otra moneda es peor que no pintar ninguno.
 *
 * @param valor `contract_value` tal como llega.
 * @returns El numero con separadores de es-CL, o cadena vacia si no hay monto.
 */
export function formatearValorDeContrato (valor: number | null): string {
  return valor === null ? '' : valor.toLocaleString(LOCALE, { maximumFractionDigits: 2 })
}

export const CONTRATOS: DefinicionRecurso<Contrato> = {
  ruta: 'contratos',
  titulo: GLOSARIO.contrato,

  columnas: [
    { clave: 'subject', encabezado: 'Asunto', ordenPor: 'subject', presentar: (c) => c.subject },
    { clave: 'client', encabezado: GLOSARIO.cliente.singular, presentar: (c) => c.client?.company ?? '' },
    { clave: 'contract_type', encabezado: 'Tipo', presentar: (c) => c.contract_type?.name ?? '' },
    {
      clave: 'contract_value',
      encabezado: 'Valor',
      ordenPor: 'contract_value',
      numerica: true,
      presentar: (c) => formatearValorDeContrato(c.contract_value)
    },
    { clave: 'datestart', encabezado: 'Inicio', ordenPor: 'datestart', presentar: (c) => formatearFecha(c.datestart) },
    { clave: 'dateend', encabezado: 'Término', ordenPor: 'dateend', presentar: (c) => formatearFecha(c.dateend) },
    { clave: 'signed', encabezado: 'Firmado', angosta: true, presentar: (c) => (c.signed ? 'Sí' : 'No') },
    {
      clave: 'project',
      encabezado: GLOSARIO.espacio.singular,
      ocultaPorDefecto: true,
      presentar: (c) => c.project?.name ?? ''
    },
    {
      clave: 'dateadded',
      encabezado: 'Creado',
      ordenPor: 'dateadded',
      ocultaPorDefecto: true,
      presentar: (c) => formatearFecha(c.dateadded, true)
    }
  ],

  // Las opciones de cliente y tipo no viven en `/lookups`: las arma la pagina y llegan por
  // `opcionesDeFiltro` bajo estas claves de `desdeLookup`.
  filtros: [
    { clave: 'vigencia', etiqueta: 'Vigencia', tipo: 'seleccion', opciones: VIGENCIAS_DE_CONTRATO },
    { clave: 'client', etiqueta: GLOSARIO.cliente.singular, tipo: 'seleccion', desdeLookup: 'contratos_clientes' },
    { clave: 'contract_type', etiqueta: 'Tipo', tipo: 'seleccion', desdeLookup: 'contratos_tipos' },
    {
      clave: 'signed',
      etiqueta: 'Firmado',
      tipo: 'seleccion',
      opciones: [{ valor: '1', etiqueta: 'Firmados' }, { valor: '0', etiqueta: 'Sin firmar' }]
    },
    { clave: 'termino', etiqueta: 'Termina entre', tipo: 'rangoFechas', clavesRango: ['dateend_from', 'dateend_to'] }
  ],

  ordenables: ['subject', 'contract_value', 'datestart', 'dateend', 'dateadded'],
  ordenPorDefecto: '-datestart',
  busqueda: true,
  includes: []
}
