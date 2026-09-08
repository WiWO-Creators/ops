import type { Filtro } from './tipos.ts'
import type { CampoPersonalizadoMeta } from '../datos/recursos.ts'

/** Operadores admitidos según el tipo del campo; los vacíos no necesitan valor. */
export function operadoresCampo (filtro: Filtro): string[] {
  const comunes = ['eq', 'ne', 'empty', 'not_empty']
  if (filtro.tipoDato === 'numero' || filtro.tipoDato === 'fecha') return [...comunes, 'gt', 'gte', 'lt', 'lte']
  return filtro.tipoDato === 'booleano' ? comunes : [...comunes, 'contains']
}

/** Convierte metadatos en filtros, incluidos los campos que no son columnas visibles. */
export function filtrosDeCamposPersonalizados (campos: Array<Pick<CampoPersonalizadoMeta, 'id' | 'name' | 'type' | 'order'>>): Filtro[] {
  return [...campos].sort((a, b) => a.order - b.order).map((campo) => ({
    clave: `cf_${campo.id}`,
    etiqueta: campo.name,
    tipo: 'campo',
    tipoDato: campo.type === 'number' ? 'numero' : ['date_picker', 'date_picker_time'].includes(campo.type) ? 'fecha' : 'texto'
  }))
}
