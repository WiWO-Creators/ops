/**
 * Presets de filtros guardados (`/filter-presets`) en el mock.
 *
 * Existe para que las tablas que ofrecen presets —toda tabla del equipo cuyo recurso tiene tablero,
 * incluidas las de tickets— no muestren el aviso "Recurso desconocido" al abrirse contra el mock. Es
 * memoria del proceso: los presets viven hasta que el mock se reinicia, privados por persona como en
 * la API.
 */

import { ErrorApi } from './consulta.js'

/** Tableros que la API acepta, los mismos de `TableroDePreset`. */
const TABLEROS = [
  'tasks', 'milestones', 'milestones-tabla', 'projects', 'timesheets', 'clients', 'staff', 'tickets',
  'notes', 'activity', 'mail-queue', 'files', 'project-templates', 'audit'
]

/** @type {Array<{ id: number, staff_id: number, board: string, name: string, filters: Record<string, string[]>, date_created: string }>} */
const PRESETS = []

/** Lo que viaja: sin el dueño, que es siempre quien pregunta. */
function presentar (preset) {
  return { id: preset.id, board: preset.board, name: preset.name, filters: preset.filters, date_created: preset.date_created }
}

/**
 * Valida el cuerpo de un alta y devuelve sus campos, o lanza 422.
 *
 * @param {Record<string, unknown>} datos
 */
function altaValida (datos) {
  const errores = {}
  if (!TABLEROS.includes(datos.board)) errores.board = ['invalid']
  if (typeof datos.name !== 'string' || datos.name.trim() === '' || datos.name.length > 80) errores.name = ['invalid']
  if (datos.filters === null || typeof datos.filters !== 'object' || Array.isArray(datos.filters)) errores.filters = ['invalid']
  if (Object.keys(errores).length > 0) throw new ErrorApi(422, 'validation_failed', 'Revisa el filtro guardado.', errores)

  return { board: datos.board, name: datos.name.trim(), filters: datos.filters }
}

/**
 * Rutas de `/filter-presets`. Devuelve `null` para lo que no es suyo.
 *
 * @param {{ metodo: string, recurso: string, resto: string[], parametros: URLSearchParams, cuerpo: () => Promise<Record<string, unknown>>, actual: { id: number } }} peticion
 */
export async function filtrosGuardados ({ metodo, recurso, resto, parametros, cuerpo, actual }) {
  if (recurso !== 'filter-presets') return null

  if (resto.length === 0 && metodo === 'GET') {
    const tablero = parametros.get('board')
    if (!TABLEROS.includes(tablero)) {
      throw new ErrorApi(422, 'validation_failed', 'Tablero desconocido.', { board: ['invalid'] })
    }
    const propios = PRESETS.filter((p) => p.staff_id === actual.id && p.board === tablero)
    return { estado: 200, cuerpo: { data: propios.map(presentar) } }
  }

  if (resto.length === 0 && metodo === 'POST') {
    // `cuerpo` es un thunk: sin el `await` se validaria una funcion.
    const alta = altaValida((await cuerpo()) ?? {})
    const preset = {
      id: Math.max(0, ...PRESETS.map((p) => p.id)) + 1,
      staff_id: actual.id,
      ...alta,
      date_created: new Date().toISOString()
    }
    PRESETS.push(preset)
    return { estado: 201, cuerpo: { data: presentar(preset) } }
  }

  if (resto.length === 1 && metodo === 'DELETE') {
    const indice = PRESETS.findIndex((p) => p.id === Number(resto[0]) && p.staff_id === actual.id)
    if (indice === -1) throw new ErrorApi(404, 'not_found', 'Filtro guardado inexistente.')
    PRESETS.splice(indice, 1)
    return { estado: 204, cuerpo: null }
  }

  throw new ErrorApi(404, 'not_found', 'Recurso desconocido.')
}
