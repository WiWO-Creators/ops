import type { DefinicionRecurso, Filtro, OpcionFiltro } from '../../definiciones/tipos.ts'
import type { TableroDePreset } from '../../datos/recursos.ts'
import { operadoresCampo } from '../../definiciones/filtros.ts'

export const TOPE_PRESET = 16384
const TABLEROS: TableroDePreset[] = ['tasks', 'milestones', 'milestones-tabla', 'projects', 'timesheets', 'clients', 'staff', 'tickets', 'discussions', 'notes', 'activity', 'mail-queue', 'files', 'project-templates', 'audit']
export interface PresetPortable { version: 1, board: TableroDePreset, name: string, filters: Record<string, string[]> }
export interface ConflictoFiltro { clave: string, etiqueta: string, motivo: string, opciones: OpcionFiltro[] }

/**
 * Identifica el recurso sin mezclar el portal del cliente con presets del equipo.
 * @param ruta Ruta relativa del recurso.
 * @returns Identidad de presets o null si no corresponde al panel interno.
 */
export function tableroDePresets (ruta: string): TableroDePreset | null {
  if (ruta.startsWith('portal/')) return null
  const ultimo = ruta.split('/').at(-1) as TableroDePreset
  if (ultimo === 'milestones') return 'milestones-tabla'
  return TABLEROS.includes(ultimo) ? ultimo : null
}

/**
 * Valida un archivo antes de usar sus datos o enviarlos al servidor.
 * @param texto Contenido JSON acotado.
 * @param board Recurso de destino.
 * @returns Preset portable validado.
 * @throws Error legible si el contenido o el recurso son incompatibles.
 */
export function leerPreset (texto: string, board: TableroDePreset): PresetPortable {
  if (new TextEncoder().encode(texto).length > TOPE_PRESET) throw new Error('El preset supera los 16 KB.')
  let dato: unknown
  try { dato = JSON.parse(texto) } catch { throw new Error('El archivo no contiene un JSON válido.') }
  if (dato === null || typeof dato !== 'object' || Array.isArray(dato)) throw new Error('El archivo no contiene un preset.')
  const preset = dato as Partial<PresetPortable>
  if (preset.version !== 1 || preset.board !== board) throw new Error('El preset pertenece a otro recurso o a una versión incompatible.')
  if (typeof preset.name !== 'string' || preset.name.trim() === '' || preset.name.length > 80) throw new Error('El preset necesita un nombre de hasta 80 caracteres.')
  if (preset.filters === null || typeof preset.filters !== 'object' || Array.isArray(preset.filters)) throw new Error('Los filtros del preset no son válidos.')
  for (const [clave, valores] of Object.entries(preset.filters)) {
    if ((clave !== '__q' && !/^[a-zA-Z][\w-]*$/.test(clave)) || ['constructor', 'prototype', '__proto__'].includes(clave)) throw new Error('El preset contiene una clave inválida.')
    if (!Array.isArray(valores) || valores.some((valor) => typeof valor !== 'string') || (clave === '__q' && valores.length > 1)) throw new Error('Los valores del preset no son válidos.')
  }
  return preset as PresetPortable
}

/**
 * Detecta condiciones incompatibles sin eliminarlas al importar.
 * @param filters Condiciones del preset.
 * @param definicion Configuración de la vista de destino.
 * @param opciones Catálogos disponibles en el destino.
 * @returns Condiciones que requieren una decisión del usuario.
 */
export function conflictosDePreset<T> (filters: Record<string, string[]>, definicion: DefinicionRecurso<T>, opciones: Record<string, OpcionFiltro[]>): ConflictoFiltro[] {
  const conflictos: ConflictoFiltro[] = []
  for (const [clave, valores] of Object.entries(filters)) {
    if (valores.length === 0) continue
    if (clave === '__q') {
      if (!definicion.busqueda) conflictos.push({ clave, etiqueta: 'Búsqueda', motivo: 'Esta vista no permite búsqueda.', opciones: [] })
      continue
    }
    const filtro = definicion.filtros.find((item) => item.clave === clave)
    const catalogo = filtro?.opciones ?? opciones[filtro?.desdeLookup ?? ''] ?? []
    const motivo = filtro === undefined ? 'El campo no está disponible en esta vista o está fijado por el proyecto.' : filtro.noDisponible ?? motivoIncompatible(filtro, valores, catalogo)
    if (motivo !== null) conflictos.push({ clave, etiqueta: filtro?.etiqueta ?? clave, motivo, opciones: catalogo })
  }
  return conflictos
}

/**
 * Verifica operadores, rangos y referencias contra el destino.
 * @param filtro Configuración del campo.
 * @param valores Condición guardada.
 * @param opciones Catálogo de destino.
 * @returns Motivo de incompatibilidad o null.
 */
function motivoIncompatible (filtro: Filtro, valores: string[], opciones: OpcionFiltro[]): string | null {
  if (filtro.tipo === 'campo') {
    const operador = valores[0] ?? ''
    const valor = valores[1] ?? ''
    if (!operadoresCampo(filtro).includes(operador) || valores.length !== 2) return 'La condición tiene un operador o formato incompatible.'
    if (['empty', 'not_empty'].includes(operador)) return null
    if (valor.trim() === '') return 'La condición necesita un valor.'
    if (filtro.tipoDato === 'numero' && !Number.isFinite(Number(valor))) return 'El valor debe ser un número.'
    if (filtro.tipoDato === 'booleano' && !['0', '1'].includes(valor)) return 'El valor debe ser Sí o No.'
    if (filtro.tipoDato === 'fecha' && !fechaValida(valor)) return 'La fecha no es válida.'
    return null
  }
  if (filtro.tipo === 'rangoFechas') {
    if (valores.length > 2 || valores.some((valor) => valor !== '' && !fechaValida(valor))) return 'El rango contiene una fecha inválida.'
    if (valores[0] && valores[1] && valores[0] > valores[1]) return 'El inicio del rango es posterior al final.'
    return null
  }
  if (filtro.tipo === 'booleano') return valores.some((valor) => !['0', '1'].includes(valor)) ? 'El valor debe ser Sí o No.' : null
  if (filtro.tipo === 'seleccion' && valores.length > 1) return 'Este campo permite solo una selección.'
  return valores.some((valor) => !opciones.some((opcion) => opcion.valor === valor)) ? 'El valor no existe en el catálogo de destino. Elige un reemplazo o quita la condición.' : null
}

/**
 * Valida fechas de calendario, incluidos días inexistentes y años bisiestos.
 * @param valor Fecha ISO sin hora.
 * @returns Si la fecha existe.
 */
function fechaValida (valor: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(valor) && !Number.isNaN(Date.parse(valor)) && new Date(valor).toISOString().slice(0, 10) === valor
}

/**
 * Describe condiciones con etiquetas y nombres del catálogo.
 * @param clave Campo de la condición.
 * @param valores Operador y valor o selecciones guardadas.
 * @param filtros Configuración de los campos.
 * @param opciones Catálogos de la vista.
 * @returns Descripción legible de la condición.
 */
export function descripcionDeCondicion (clave: string, valores: string[], filtros: Filtro[], opciones: Record<string, OpcionFiltro[]>): string {
  const filtro = filtros.find((item) => item.clave === clave)
  if (clave === '__q') return valores[0] ?? ''
  if (filtro?.tipo === 'campo') {
    const etiquetas: Record<string, string> = { eq: 'igual a', ne: 'distinto de', contains: 'contiene', gt: 'mayor que', gte: 'mayor o igual a', lt: 'menor que', lte: 'menor o igual a', empty: 'está vacío', not_empty: 'no está vacío' }
    const operador = valores[0] ?? ''
    return [etiquetas[operador] ?? operador, ['empty', 'not_empty'].includes(operador) ? '' : valores[1] ?? ''].filter(Boolean).join(' ')
  }
  if (filtro?.tipo === 'rangoFechas') return `${valores[0] || 'Sin inicio'} → ${valores[1] || 'Sin final'}`
  if (filtro?.tipo === 'booleano') return valores.map((valor) => valor === '1' ? 'Sí' : 'No').join(', ')
  const catalogo = filtro?.opciones ?? opciones[filtro?.desdeLookup ?? ''] ?? []
  return valores.map((valor) => catalogo.find((opcion) => opcion.valor === valor)?.etiqueta ?? valor).join(', ')
}
