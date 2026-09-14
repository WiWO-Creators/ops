import { horasDeTexto } from './tiempo-estimado.ts'
import { enFormatoTitulo } from '../lib/titulo.ts'
import type { StaffReferencia } from '@/datos/tipos'
import type { Etiqueta, Proceso } from '@/datos/recursos'

/**
 * Lo que se edita de una Tarea desde el detalle, en la forma que usa el formulario.
 *
 * Todo texto, incluidas las listas de ids: el estado de un formulario controlado son cadenas, y
 * convertir a numero recien al armar el cuerpo evita el `NaN` intermedio que aparece cuando alguien
 * borra el contenido de un campo.
 */
export interface CamposEdicion {
  nombre: string
  relacion: string
  relacionId: string
  tipo: string
  facturable: boolean
  tarifaHora: string
  publica: boolean
  visibleCliente: boolean
  recurrente: boolean
  repetirCada: string
  unidadRecurrencia: string
  ciclos: string
  prioridad: string
  inicio: string
  vencimiento: string
  /** Id del hito, o `''` para "sin hito". */
  hito: string
  asignados: number[]
  seguidores: number[]
  /**
   * Etiquetas elegidas: un numero es un id del catalogo, una cadena es una etiqueta escrita a mano
   * que todavia no existe. La API acepta las dos formas y crea la que falta.
   */
  etiquetas: Array<number | string>
  descripcion: string
  /** Horas estimadas, decimales. `''` es "sin estimacion"; `'0'` es una estimacion de cero. */
  horasEstimadas: string
}

/** El cuerpo del `PATCH /tasks/{id}`, con solo las claves que cambiaron. */
export interface ParcheTarea {
  name?: string
  rel_type?: string | null
  rel_id?: number | null
  task_type?: number | null
  billable?: boolean
  hourly_rate?: number
  is_public?: boolean
  visible_to_client?: boolean
  recurring?: boolean
  repeat_every?: number
  recurring_type?: string
  cycles?: number
  priority?: number
  start_date?: string | null
  due_date?: string | null
  milestone?: number
  assignees?: number[]
  followers?: number[]
  tags?: Array<number | string>
  description?: string | null
  estimated_hours?: number | null
}

/**
 * Arma el estado inicial del formulario a partir de la Tarea que devolvio la API.
 *
 * Las fechas llegan como `YYYY-MM-DD` o `null`, que es justo lo que espera un `<input type="date">`
 * con cadena vacia por ausencia. No se reformatean: hacerlo obligaria a volver a parsear al guardar.
 *
 * @param tarea la Tarea tal como la trae `GET /tasks/{id}`
 * @param descripcion el texto plano ya extraido del HTML de Perfex, que la Tarea trae como marcado
 */
export function camposDeTarea (tarea: Proceso, descripcion: string): CamposEdicion {
  return {
    nombre: tarea.name,
    relacion: tarea.rel_type ?? '',
    relacionId: tarea.rel_id == null ? '' : String(tarea.rel_id),
    tipo: tarea.task_type == null ? '' : String(tarea.task_type.id),
    facturable: tarea.billable ?? false,
    tarifaHora: String(tarea.hourly_rate ?? 0),
    publica: tarea.is_public ?? false,
    visibleCliente: tarea.visible_to_client ?? false,
    recurrente: tarea.recurring ?? false,
    repetirCada: String(tarea.repeat_every || 1),
    unidadRecurrencia: tarea.recurring_type || 'month',
    ciclos: String(tarea.cycles ?? 0),
    prioridad: String(tarea.priority),
    inicio: tarea.start_date ?? '',
    vencimiento: tarea.due_date ?? '',
    hito: tarea.milestone == null ? '' : String(tarea.milestone.id),
    asignados: tarea.assignees.map((persona) => persona.id),
    seguidores: tarea.followers.map((persona) => persona.id),
    etiquetas: tarea.tags.map((etiqueta) => etiqueta.id),
    descripcion,
    horasEstimadas: typeof tarea.estimated_hours === 'number' ? String(tarea.estimated_hours) : ''
  }
}

/**
 * Arma el cuerpo del parche con lo que cambio, y nada mas.
 *
 * Mandar el formulario entero seria mas corto y esta mal por dos razones concretas, no por estilo:
 *
 *   1. `milestone` y `task_type` se validan contra el Espacio de la Tarea (`ParcheProceso`), asi que
 *      reenviar un hito heredado de otro Espacio devuelve `422` en un guardado donde nadie toco el
 *      hito.
 *   2. `assignees` **reemplaza** la lista y cierra los cronometros de quien sale. Reenviar la misma
 *      lista es una escritura de mas sobre `task_assigned` en cada guardado.
 *
 * Las listas se comparan como conjuntos: reordenar los chips del selector no es un cambio.
 *
 * El vacio de un campo opcional viaja como `null` y no como `''`: la API borra con `null` y rechaza
 * la cadena vacia en las fechas. Lo mismo con `estimated_hours`, que ademas no se puede mandar como
 * `''`: la API lo leeria como cero, y cero horas estimadas no es no haber estimado. `milestone` es
 * la excepcion que documenta el contrato — se quita con `0`, porque el campo es un entero en la base.
 *
 * @param inicial los campos tal como se abrieron
 * @param actual los campos tal como quedaron
 * @returns el cuerpo del `PATCH`, vacio si no cambio nada
 */
export function cuerpoDeParche (inicial: CamposEdicion, actual: CamposEdicion): ParcheTarea {
  const parche: ParcheTarea = {}

  // La comparacion sigue siendo contra el texto crudo: `enFormatoTitulo` solo decide como se
  // guarda lo que cambio, no si cambio. Asi abrir y cerrar la edicion sin tocar el nombre no
  // manda un parche con el nombre reformateado.
  if (actual.nombre.trim() !== inicial.nombre.trim()) parche.name = enFormatoTitulo(actual.nombre)
  if (actual.prioridad !== inicial.prioridad) parche.priority = Number(actual.prioridad)
  if (actual.inicio !== inicial.inicio) parche.start_date = actual.inicio === '' ? null : actual.inicio
  if (actual.vencimiento !== inicial.vencimiento) {
    parche.due_date = actual.vencimiento === '' ? null : actual.vencimiento
  }
  const relacionInicial = inicial.relacion === 'project' && inicial.relacionId === '' ? '' : inicial.relacion
  const relacionActual = actual.relacion === 'project' && actual.relacionId === '' ? '' : actual.relacion
  const cambiaRelacion = relacionActual !== relacionInicial || (relacionActual !== '' && actual.relacionId !== inicial.relacionId)
  if (cambiaRelacion) {
    parche.rel_type = relacionActual === '' ? null : relacionActual
    parche.rel_id = relacionActual === '' ? null : Number(actual.relacionId)
    parche.milestone = relacionActual === 'project' && actual.hito !== ''
      ? Number(actual.hito) : 0
    parche.task_type = relacionActual === 'project' && actual.tipo !== ''
      ? Number(actual.tipo) : null
  } else {
    if (actual.hito !== inicial.hito) parche.milestone = actual.hito === '' ? 0 : Number(actual.hito)
    if (actual.tipo !== inicial.tipo) parche.task_type = actual.tipo === '' ? null : Number(actual.tipo)
  }
  if (actual.facturable !== inicial.facturable) parche.billable = actual.facturable
  if (actual.tarifaHora.trim() !== inicial.tarifaHora.trim()) parche.hourly_rate = Number(actual.tarifaHora)
  if (actual.publica !== inicial.publica) parche.is_public = actual.publica
  if (actual.visibleCliente !== inicial.visibleCliente) parche.visible_to_client = actual.visibleCliente
  const cambiaRecurrencia = actual.recurrente !== inicial.recurrente || (actual.recurrente && (
    actual.repetirCada !== inicial.repetirCada || actual.unidadRecurrencia !== inicial.unidadRecurrencia ||
    actual.ciclos !== inicial.ciclos
  ))
  if (cambiaRecurrencia) {
    parche.recurring = actual.recurrente
    if (actual.recurrente) {
      parche.repeat_every = Number(actual.repetirCada)
      parche.recurring_type = actual.unidadRecurrencia
      parche.cycles = Number(actual.ciclos)
    }
  }
  if (!mismosIds(actual.asignados, inicial.asignados)) parche.assignees = actual.asignados
  if (!mismosIds(actual.seguidores, inicial.seguidores)) parche.followers = actual.seguidores
  if (!mismosIds(actual.etiquetas, inicial.etiquetas)) parche.tags = actual.etiquetas
  if (actual.descripcion.trim() !== inicial.descripcion.trim()) {
    parche.description = actual.descripcion.trim() === '' ? null : actual.descripcion.trim()
  }
  if (actual.horasEstimadas.trim() !== inicial.horasEstimadas.trim()) {
    parche.estimated_hours = horasDeTexto(actual.horasEstimadas)
  }

  return parche
}

/**
 * Valida los campos dependientes antes de enviar el formulario.
 * @param campos valores actuales del formulario
 * @returns el primer error o null si son válidos
 */
export function errorDeCamposEdicion (campos: CamposEdicion): string | null {
  const sinProyecto = campos.relacion === 'project' && campos.relacionId === ''
  if (campos.relacion !== '' && !sinProyecto && (!Number.isSafeInteger(Number(campos.relacionId)) || Number(campos.relacionId) <= 0)) {
    return 'Selecciona una relación válida.'
  }
  if (campos.tarifaHora.trim() === '' || !Number.isFinite(Number(campos.tarifaHora)) || Number(campos.tarifaHora) < 0 || Number(campos.tarifaHora) > 999999999.99) {
    return 'La tarifa por hora debe ser un número entre 0 y 999999999.99.'
  }
  if (campos.inicio !== '' && campos.vencimiento !== '' && campos.vencimiento < campos.inicio) {
    return 'El vencimiento no puede ser anterior al inicio.'
  }
  if (!campos.recurrente) return null
  const cada = Number(campos.repetirCada)
  const ciclos = Number(campos.ciclos)
  if (!Number.isInteger(cada) || cada < 1 || cada > 365) return 'La repetición debe ser un entero entre 1 y 365.'
  if (!['day', 'week', 'month', 'year'].includes(campos.unidadRecurrencia)) return 'Selecciona una unidad de recurrencia válida.'
  if (campos.ciclos.trim() === '' || !Number.isInteger(ciclos) || ciclos < 0 || ciclos > 365) {
    return 'Los ciclos deben ser un entero entre 0 y 365.'
  }
  return null
}

/** True si las dos listas tienen los mismos elementos, sin importar el orden ni las repeticiones. */
function mismosIds (unos: Array<number | string>, otros: Array<number | string>): boolean {
  const conjunto = new Set(otros)

  return new Set(unos).size === conjunto.size && unos.every((id) => conjunto.has(id))
}

/**
 * La lista de personas que puede ofrecer el selector.
 *
 * **Son todas las asignables de la instalacion, no los miembros del Espacio.** Recortar por membresia
 * era lo que hacia que alguien no apareciera al buscarlo: el backend agrega solo al Espacio a quien
 * se asigna (`CrearProceso::asegurarMiembrosDelEspacio()`), asi que exigir que ya sea miembro para
 * poder elegirlo invierte el orden real de las cosas.
 *
 * Aun con la lista completa hace falta la union: `GET /staff/asignables` devuelve solo a las personas
 * activas, y una Tarea puede tener asignado a alguien que despues se dio de baja. Sin el, el selector
 * no dibuja su chip y el proximo guardado lo borra sin que nadie lo haya pedido.
 *
 * @param asignables las de `GET /staff/asignables`, en el orden en que las devolvio la API
 * @param yaEnLaTarea asignados y seguidores actuales
 * @returns la union sin repetidos, con las asignables primero
 */
export function personasElegibles (
  asignables: StaffReferencia[],
  yaEnLaTarea: StaffReferencia[]
): StaffReferencia[] {
  const vistos = new Set(asignables.map((persona) => persona.id))

  return [...asignables, ...yaEnLaTarea.filter((persona) => {
    if (vistos.has(persona.id)) return false
    vistos.add(persona.id)

    return true
  })]
}

/**
 * Nombres de las etiquetas elegidas, para pintarlas como chips sin volver a pedir el catalogo.
 *
 * Un id que ya no esta en el catalogo se omite en vez de mostrarse como un numero suelto: es el caso
 * de la etiqueta que borraron mientras el dialogo estaba abierto. Una etiqueta escrita a mano viaja
 * como su propio nombre y se muestra tal cual: todavia no tiene id porque la crea la API al guardar.
 */
export function nombresDeEtiquetas (catalogo: Etiqueta[], elegidas: Array<number | string>): string[] {
  return elegidas.flatMap((elegida) => {
    if (typeof elegida === 'string') return [elegida]

    const delCatalogo = catalogo.find((etiqueta) => etiqueta.id === elegida)

    return delCatalogo === undefined ? [] : [delCatalogo.name]
  })
}
