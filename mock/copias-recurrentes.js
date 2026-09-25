/**
 * Las copias de cada recurrencia en el mock: `GET /tasks/recurrentes/{id}/copias`, el `usage` de cada
 * regla y `POST /tasks/recurrentes/{id}/limpiar`.
 *
 * Espejo de `Recursos/RecursoCopiasRecurrentes.php` y `Escritura/LimpiarCopias.php`. Vive aparte de
 * `recurrentes.js` porque tiene estado propio —el estado con que nacio cada copia, las que se
 * editaron y la papelera— que no conviene colgar de los objetos de Tarea: `GET /tasks/{id}` devuelve
 * el objeto entero, y lo que el mock guarde ahi se publicaria como si fuera del contrato.
 */

import { ErrorApi } from './consulta.js'

/** Copias seguidas sin movimiento a partir de las cuales la regla esta "sin uso". */
export const UMBRAL_SIN_USO = 3
/** Tope de filas de `/copias`, el mismo que la API. */
const MAXIMO_COPIAS = 200
/** Orden fijo de los motivos, el de `touched_reasons` en la API. */
const MOTIVOS = ['estado', 'comentario', 'tiempo', 'archivo', 'checklist', 'edicion']
const DETENCIONES = ['pausar', 'dejar_de_repetir']

/** Estado con que nacio cada copia: cambiarlo es "estado". */
const ESTADO_INICIAL = new Map()
/** Copias que alguien edito por `PATCH`: "edicion". */
const EDITADAS = new Set()
/** Copias mandadas a la papelera, con la fecha en que se borraron. */
const PAPELERA = []
/** Cuando se aviso a los administradores de cada regla sin uso. */
const AVISADAS = new Map()

/** Suma dias a una fecha `YYYY-MM-DD`. */
function sumarDias (fecha, dias) {
  const dia = new Date(`${fecha}T00:00:00Z`)
  dia.setUTCDate(dia.getUTCDate() + dias)

  return dia.toISOString().slice(0, 10)
}

/**
 * Una copia nueva de la madre, como la que deja el cron: mismo nombre, Proyecto y asignados, sin
 * recurrencia propia y sin actividad.
 */
function copiaDe (madre, id, inicio, vence, estado) {
  return {
    ...madre,
    id,
    patente: null,
    status: estado,
    start_date: inicio,
    due_date: vence,
    date_added: `${inicio}T09:00:00Z`,
    date_finished: estado === 5 ? `${inicio}T18:00:00Z` : null,
    recurring: false,
    repeat_every: 0,
    recurring_type: null,
    cycles: 0,
    total_cycles: 0,
    recurring_until: null,
    last_recurring_date: null,
    skip_weekdays: [],
    recurring_paused: false,
    recurring_paused_at: null,
    is_recurring_from: madre.id,
    recurring_from_id: madre.id,
    counts: { comments: 0, checklist: 0, checklist_done: 0, attachments: 0 },
    timer_activo: null
  }
}

/**
 * Siembra dos historiales: la 502 con cuatro copias vencidas sin tocar (sin uso, ya avisada) y una
 * en la papelera, y la 503 con copias mixtas: una tocada por el fixture, una que cambio de estado,
 * una sin tocar y la vigente, que aun no vence.
 *
 * Tambien registra el estado inicial de las copias que ya traia el fixture y pone `recurring_from_id`
 * en todas las Tareas, como el listado de la API.
 *
 * @param {object[]} procesos la lista viva del mock, que se modifica en el lugar
 * @param {string} hoy `YYYY-MM-DD`
 */
export function sembrarCopias (procesos, hoy) {
  const madre = (id) => procesos.find((p) => p.id === id)
  const nuevas = []
  const sinUso = madre(502)
  if (sinUso) {
    Object.assign(sinUso, { total_cycles: 5 })
    for (const [id, atras] of [[9001, 100], [9002, 70], [9003, 40], [9004, 10]]) {
      nuevas.push(copiaDe(sinUso, id, sumarDias(hoy, -atras), sumarDias(hoy, -atras + 5), 1))
    }
    PAPELERA.push({ ...copiaDe(sinUso, 9005, sumarDias(hoy, -130), sumarDias(hoy, -125), 1), borrada_en: `${sumarDias(hoy, -20)}T12:00:00Z` })
    AVISADAS.set(502, `${sumarDias(hoy, -2)}T09:00:00Z`)
  }
  const mixta = madre(503)
  if (mixta) {
    nuevas.push(copiaDe(mixta, 9011, sumarDias(hoy, -44), sumarDias(hoy, -40), 1))
    nuevas.push(copiaDe(mixta, 9012, sumarDias(hoy, -30), sumarDias(hoy, -26), 5))
    nuevas.push(copiaDe(mixta, 9013, sumarDias(hoy, -2), sumarDias(hoy, 10), 1))
  }

  // El estado inicial de las copias sembradas es "Por iniciar"; la 9012 ya se completo.
  for (const copia of nuevas) ESTADO_INICIAL.set(copia.id, 1)
  for (const copia of PAPELERA) ESTADO_INICIAL.set(copia.id, 1)
  for (const tarea of procesos) {
    if (tarea.is_recurring_from != null && !ESTADO_INICIAL.has(tarea.id)) ESTADO_INICIAL.set(tarea.id, 1)
  }
  procesos.push(...nuevas)
  for (const tarea of procesos) tarea.recurring_from_id = tarea.is_recurring_from ?? null
}

/**
 * Cuantas copias genero una madre, contando las que estan en la papelera: es lo que publica
 * `recurring_copies_count`.
 */
export function contarCopias (madreId, procesos) {
  return procesos.filter((p) => p.is_recurring_from === madreId).length + PAPELERA.filter((p) => p.is_recurring_from === madreId).length
}

/** Marca una copia como editada por `PATCH`. No hace nada con una Tarea que no es copia. */
export function marcarEditada (tarea) {
  if (tarea.is_recurring_from != null) EDITADAS.add(tarea.id)
}

/**
 * Por que una copia cuenta como tocada, en el orden del contrato. Vacio = sin movimiento.
 *
 * @param {object} copia
 * @param {{ comentarios: object[], cronometros: object[], archivos: object[], checklist: object[] }} fuentes
 * @returns {string[]}
 */
export function motivosDeCopia (copia, { comentarios, cronometros, archivos, checklist }) {
  const hay = {
    estado: copia.status !== (ESTADO_INICIAL.get(copia.id) ?? copia.status),
    comentario: comentarios.some((c) => c.task_id === copia.id),
    tiempo: cronometros.some((c) => c.task_id === copia.id),
    archivo: archivos.some((a) => a.rel_type === 'task' && a.rel_id === copia.id),
    checklist: checklist.some((c) => c.task_id === copia.id && c.finished === true),
    edicion: EDITADAS.has(copia.id)
  }

  return MOTIVOS.filter((motivo) => hay[motivo])
}

/**
 * Las copias de una madre, vivas y en papelera, de la mas nueva a la mas vieja, con lo que calcula
 * la API para cada una.
 *
 * @param {number} madreId
 * @param {{ procesos: object[], fuentes: object, hoy: string }} contexto
 */
function copiasDe (madreId, { procesos, fuentes, hoy }) {
  const vivas = procesos.filter((p) => p.is_recurring_from === madreId).map((p) => ({ tarea: p, borrada: false }))
  const borradas = PAPELERA.filter((p) => p.is_recurring_from === madreId).map((p) => ({ tarea: p, borrada: true }))
  const todas = [...vivas, ...borradas].sort((a, b) =>
    String(b.tarea.date_added).localeCompare(String(a.tarea.date_added)) || b.tarea.id - a.tarea.id)

  return todas.map(({ tarea, borrada }, posicion) => {
    const motivos = motivosDeCopia(tarea, fuentes)

    return {
      tarea,
      borrada,
      // Su ciclo termino: ya nacio una mas nueva, o vencio.
      evaluable: posicion > 0 || (tarea.due_date != null && tarea.due_date < hoy),
      motivos
    }
  })
}

/**
 * `GET /tasks/recurrentes/{id}/copias`.
 *
 * @param {object} madre la Tarea madre, ya resuelta y visible
 * @param {{ procesos: object[], fuentes: object, hoy: string }} contexto
 */
export function listarCopias (madre, contexto) {
  const copias = copiasDe(madre.id, contexto)

  return {
    filas: copias.slice(0, MAXIMO_COPIAS).map(({ tarea, borrada, evaluable, motivos }) => ({
      id: tarea.id,
      name: tarea.name,
      start_date: tarea.start_date ?? null,
      due_date: tarea.due_date ?? null,
      status: tarea.status,
      created_at: String(tarea.date_added).replace('T', ' ').replace('Z', ''),
      deleted: borrada,
      evaluable,
      touched: motivos.length > 0,
      touched_reasons: motivos
    })),
    total: copias.length
  }
}

/**
 * El `usage` de una regla: la racha de copias evaluables sin tocar desde la mas reciente, cuantas
 * evaluables sin tocar quedan vivas, si esta sin uso y cuando se aviso.
 *
 * Las borradas no cuentan ni cortan la racha: limpiar una regla la deja en cero, que es lo que se
 * espera de haberla limpiado.
 */
export function usoDe (madre, contexto) {
  const evaluables = copiasDe(madre.id, contexto).filter((c) => c.evaluable && !c.borrada)
  let racha = 0
  for (const copia of evaluables) {
    if (copia.motivos.length > 0) break
    racha++
  }

  return {
    streak: racha,
    untouched_count: evaluables.filter((c) => c.motivos.length === 0).length,
    unused: racha >= UMBRAL_SIN_USO,
    alerted_at: AVISADAS.get(madre.id) ?? null
  }
}

/**
 * `POST /tasks/recurrentes/{id}/limpiar`.
 *
 * `validar` separa las copias vivas en candidatas (sin movimiento; la vigente marcada) y conservadas
 * (con sus motivos). `aplicar` vuelve a mirar cada id justo antes de borrar: la que alguien toco en
 * el intermedio queda en `omitidas` con `tocada`, y la que otro ya mando a la papelera, con
 * `ya_no_disponible`. Un id que nunca fue copia de esta regla es `422` `{"ids": ["no_candidata"]}`, y
 * en ese caso no se borra ninguna. `ids: []` (o ausente) es valido: sirve para solo detener la regla,
 * y sin `detener` no hace nada. `detener` sobre una madre que ya no recurre es
 * `{"detener": ["sin_recurrencia"]}`.
 *
 * @param {object} madre la Tarea madre
 * @param {unknown} cuerpo
 * @param {{ procesos: object[], fuentes: object, hoy: string, esAdmin: boolean, detener: (accion: string) => void }} contexto
 */
export function limpiarCopias (madre, cuerpo, contexto) {
  if (!contexto.esAdmin) {
    throw new ErrorApi(403, 'solo_administradores', 'Solo un administrador puede limpiar las copias de una recurrencia.')
  }
  if (cuerpo === null || typeof cuerpo !== 'object' || Array.isArray(cuerpo)) {
    throw new ErrorApi(422, 'validation_failed', 'El cuerpo debe ser un objeto.')
  }

  const detalles = {}
  if (!['validar', 'aplicar'].includes(cuerpo.modo)) detalles.modo = ['invalid']
  const detener = cuerpo.detener ?? null
  if (detener !== null && !DETENCIONES.includes(detener)) detalles.detener = ['invalid']
  else if (detener !== null && madre.recurring !== true) detalles.detener = ['sin_recurrencia']

  const todas = copiasDe(madre.id, contexto)
  const vivas = todas.filter((c) => !c.borrada)
  const ids = cuerpo.ids ?? []

  if (cuerpo.modo === 'aplicar') {
    if (!Array.isArray(ids) || ids.some((id) => !Number.isInteger(id))) detalles.ids = ['invalid']
    else if (ids.some((id) => !todas.some((c) => c.tarea.id === id))) detalles.ids = ['no_candidata']
  }
  if (Object.keys(detalles).length > 0) throw new ErrorApi(422, 'validation_failed', 'La limpieza no es válida.', detalles)

  if (cuerpo.modo === 'validar') {
    return {
      candidatas: vivas.filter((c) => c.motivos.length === 0).map(({ tarea, evaluable }) => ({
        id: tarea.id, name: tarea.name, start_date: tarea.start_date ?? null, status: tarea.status, ...(evaluable ? {} : { vigente: true })
      })),
      conservadas: vivas.filter((c) => c.motivos.length > 0).map(({ tarea, motivos }) => ({ id: tarea.id, name: tarea.name, touched_reasons: motivos }))
    }
  }

  const eliminadas = []
  const omitidas = []
  for (const id of [...new Set(ids)]) {
    const copia = vivas.find((c) => c.tarea.id === id)
    // Revalidacion: se vuelve a calcular ahora, no se confia en lo que vio el `validar`.
    if (copia === undefined) {
      omitidas.push({ id, motivo: 'ya_no_disponible' })
      continue
    }
    if (motivosDeCopia(copia.tarea, contexto.fuentes).length > 0) {
      omitidas.push({ id, motivo: 'tocada' })
      continue
    }
    const indice = contexto.procesos.indexOf(copia.tarea)
    contexto.procesos.splice(indice, 1)
    PAPELERA.push({ ...copia.tarea, borrada_en: new Date().toISOString() })
    eliminadas.push(id)
  }

  if (detener !== null) contexto.detener(detener)

  return { eliminadas, omitidas, detenida: detener }
}
