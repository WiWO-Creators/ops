/**
 * `GET /tasks/recurrentes` y `POST /tasks/recurrentes/importar` del mock.
 *
 * Espejo de `modules/api/Recursos/RecursoRecurrentes.php`, `Automatizacion/Frecuencia.php` y
 * `Escritura/ImportarRecurrentes.php`. Publica EXACTAMENTE las claves que publica la API —ni una
 * mas, ni en cero—: si el mock manda de mas, la pantalla pasa en local y se cae en produccion.
 *
 * Vive en su propio archivo para no engordar `servidor.js` y para poder probar la aritmetica de
 * fechas sin levantar el servidor.
 */

import { ErrorApi } from './consulta.js'

/** Palabras de planilla con nombre propio. Mismo listado que `Frecuencia::NOMBRADAS`. */
const NOMBRADAS = {
  diaria: [1, 'day'],
  diario: [1, 'day'],
  semanal: [1, 'week'],
  quincenal: [2, 'week'],
  mensual: [1, 'month'],
  bimestral: [2, 'month'],
  trimestral: [3, 'month'],
  semestral: [6, 'month'],
  anual: [1, 'year']
}

const UNIDADES = { dia: 'day', dias: 'day', semana: 'week', semanas: 'week', mes: 'month', meses: 'month', ano: 'year', anos: 'year' }
const NOMBRES = { day: ['día', 'días'], week: ['semana', 'semanas'], month: ['mes', 'meses'], year: ['año', 'años'] }
const PRIORIDAD = { sin_calcular: 0, atrasada: 1, activa: 2, terminada: 3, suspendida: 4 }
const COLUMNAS = ['tarea', 'frecuencia', 'responsable', 'proyecto_id', 'fecha_inicio', 'vencimiento_dias', 'fin']
const MAXIMO_FILAS = 200

/** Minusculas, sin tildes y con un solo espacio. */
function normalizar (texto) {
  return texto.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim().replace(/\s+/g, ' ')
}

/**
 * `[repeat_every, recurring_type]` de lo que se escribio en la planilla, o null.
 *
 * @param {unknown} texto
 * @returns {[number, string] | null}
 */
export function interpretarFrecuencia (texto) {
  if (typeof texto !== 'string') return null

  const limpio = normalizar(texto)
  if (NOMBRADAS[limpio]) return NOMBRADAS[limpio]

  const partes = /^cada\s+(?:(\d{1,3})\s+)?([a-z]+)$/.exec(limpio)
  const unidad = partes ? UNIDADES[partes[2]] : undefined
  const cada = partes?.[1] ? Number(partes[1]) : 1

  return unidad && cada >= 1 && cada <= 365 ? [cada, unidad] : null
}

/** "Cada mes", "Cada 2 semanas", o null con una unidad desconocida. */
export function textoDeFrecuencia (cada, unidad) {
  const nombres = NOMBRES[unidad]
  if (!nombres || cada < 1) return null

  return cada === 1 ? `Cada ${nombres[0]}` : `Cada ${cada} ${nombres[1]}`
}

/**
 * Suma N unidades a una fecha `YYYY-MM-DD` como `strtotime('+N UNIDAD')`: el 31 de enero mas un mes
 * es el 3 de marzo, igual que en el core.
 */
function sumar (fecha, cada, unidad) {
  const dia = new Date(`${fecha}T00:00:00Z`)
  if (unidad === 'day') dia.setUTCDate(dia.getUTCDate() + cada)
  if (unidad === 'week') dia.setUTCDate(dia.getUTCDate() + cada * 7)
  if (unidad === 'month') dia.setUTCMonth(dia.getUTCMonth() + cada)
  if (unidad === 'year') dia.setUTCFullYear(dia.getUTCFullYear() + cada)

  return dia.toISOString().slice(0, 10)
}

/** `Recurrencia::estaSuspendida()`: completada o con los ciclos cumplidos. */
function suspendida (tarea) {
  return tarea.status === 5 || (tarea.cycles > 0 && (tarea.total_cycles ?? 0) >= tarea.cycles)
}

/**
 * `Recurrencia::proximaCopia()`: la vigente sin copiar si hay una vencida, si no la siguiente.
 *
 * @returns {string | null}
 */
export function proximaCopia (tarea, hoy) {
  const base = tarea.last_recurring_date ?? tarea.start_date
  if (!NOMBRES[tarea.recurring_type] || !base || suspendida(tarea)) return null

  const cada = Math.max(1, tarea.repeat_every ?? 1)
  let actual = base
  let vencidas = 0
  for (let siguiente = sumar(actual, cada, tarea.recurring_type); siguiente <= hoy && vencidas < 5000; siguiente = sumar(actual, cada, tarea.recurring_type)) {
    actual = siguiente
    vencidas++
  }
  const proxima = vencidas > 0 ? actual : sumar(base, cada, tarea.recurring_type)

  return tarea.recurring_until && proxima > tarea.recurring_until ? null : proxima
}

/** `RecursoRecurrentes::estado()`. */
function estadoDe (tarea, proxima, hoy) {
  if (!NOMBRES[tarea.recurring_type] || !(tarea.last_recurring_date ?? tarea.start_date)) return 'sin_calcular'
  if (tarea.status === 5) return 'suspendida'
  if (proxima === null) return 'terminada'

  return proxima < hoy ? 'atrasada' : 'activa'
}

/**
 * Marca unas cuantas Tareas del fixture como recurrentes, una por estado posible.
 *
 * El fixture nacia sin ninguna, y la pantalla de recurrentes no tenia que mostrar. Se cuelga de la
 * fecha real para que "atrasada" y "activa" sigan siendo lo que dicen el dia que se mire.
 *
 * @param {object[]} procesos la lista viva del mock, que se modifica en el lugar
 * @param {string} hoy `YYYY-MM-DD`
 */
export function sembrarRecurrentes (procesos, hoy) {
  const hace = (dias) => sumar(hoy, -dias, 'day')
  const reglas = {
    501: { repeat_every: 1, recurring_type: 'week', cycles: 0, total_cycles: 6, last_recurring_date: hace(2), recurring_until: null },
    502: { repeat_every: 1, recurring_type: 'month', cycles: 12, total_cycles: 3, last_recurring_date: hace(10), recurring_until: null },
    503: { repeat_every: 2, recurring_type: 'week', cycles: 0, total_cycles: 4, last_recurring_date: hace(30), recurring_until: null },
    506: { repeat_every: 1, recurring_type: 'day', cycles: 0, total_cycles: 20, last_recurring_date: hace(1), recurring_until: sumar(hoy, 40, 'day') },
    510: { repeat_every: 3, recurring_type: 'month', cycles: 4, total_cycles: 4, last_recurring_date: hace(60), recurring_until: null },
    512: { repeat_every: 1, recurring_type: null, cycles: 0, total_cycles: 0, last_recurring_date: null, recurring_until: null }
  }

  for (const tarea of procesos) {
    const regla = reglas[tarea.id]
    if (regla) Object.assign(tarea, { recurring: true, ...regla })
  }

  // Las copias ya generadas, para que "ultima copia" tenga algo que mostrar.
  for (const [madre, copia] of [[501, 520], [503, 522], [506, 524]]) {
    const hija = procesos.find((p) => p.id === copia)
    if (hija) hija.is_recurring_from = madre
  }
}

/** Un filtro entero de `filter[...]`, o null; 422 con cualquier otra cosa, como la API. */
function filtroEntero (parametros, clave) {
  const valor = (parametros.get(`filter[${clave}]`) ?? '').trim()
  if (valor === '') return null
  if (!/^\d+$/.test(valor)) {
    throw new ErrorApi(422, 'validation_failed', `El parámetro "filter[${clave}]" debe ser un entero.`, { [clave]: ['integer'] })
  }

  return Number(valor)
}

/**
 * Las reglas, en la forma de `GET /tasks/recurrentes`.
 *
 * @param {object[]} procesos
 * @param {URLSearchParams} parametros
 * @param {{ staff: object[], espacios: object[], clientes: object[], hoy: string }} contexto
 */
export function listarRecurrentes (procesos, parametros, { staff, espacios, clientes, hoy }) {
  const proyecto = filtroEntero(parametros, 'project_id')
  const persona = filtroEntero(parametros, 'assignee')
  const area = filtroEntero(parametros, 'area')

  const reglas = procesos
    .filter((p) => p.recurring === true)
    .filter((p) => proyecto === null || (p.rel_type === 'project' && p.rel_id === proyecto))
    .filter((p) => persona === null || p.assignees.some((a) => a.id === persona))
    .filter((p) => area === null || p.assignees.some((a) => staff.find((s) => s.id === a.id)?.area_id === area))
    .map((p) => {
      const proxima = proximaCopia(p, hoy)
      const copias = procesos.filter((c) => c.is_recurring_from === p.id)
      const ultima = copias.reduce((mayor, c) => (mayor === null || c.id > mayor.id ? c : mayor), null)
      const espacio = p.rel_type === 'project' ? espacios.find((e) => e.id === p.rel_id) : null
      const clienteId = espacio ? espacio.clientid : (p.rel_type === 'customer' ? p.rel_id : 0)
      const cliente = clientes.find((c) => c.id === clienteId)

      return {
        id: p.id,
        name: p.name,
        status: p.status,
        start_date: p.start_date,
        project: espacio ? { id: espacio.id, name: espacio.name } : null,
        client: cliente ? { id: cliente.id, name: cliente.company } : null,
        repeat_every: p.repeat_every ?? 0,
        recurring_type: p.recurring_type ?? null,
        frequency_label: textoDeFrecuencia(p.repeat_every ?? 0, p.recurring_type ?? ''),
        cycles: p.cycles ?? 0,
        total_cycles: p.total_cycles ?? 0,
        recurring_until: p.recurring_until ?? null,
        next_date: proxima,
        state: estadoDe(p, proxima, hoy),
        last_copy: ultima === null
          ? null
          : { id: ultima.id, created_at: ultima.date_added.replace('T', ' ').replace('Z', ''), start_date: ultima.start_date, status: ultima.status },
        copies_count: copias.length,
        assignees: p.assignees.map((a) => ({ id: a.id, full_name: a.full_name, profile_image_url: a.profile_image_url ?? null }))
      }
    })

  return reglas.sort((a, b) => (PRIORIDAD[a.state] - PRIORIDAD[b.state]) || String(a.next_date ?? '').localeCompare(String(b.next_date ?? '')))
}

/** Una fecha de planilla (`AAAA-MM-DD` o `DD/MM/AAAA`) normalizada, `null` si viene vacia, `false` si no sirve. */
function fechaDePlanilla (valor) {
  if (valor === undefined || valor === null) return null
  if (typeof valor !== 'string') return false

  const texto = valor.trim()
  if (texto === '') return null

  const local = /^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/.exec(texto)
  const iso = local ? `${local[3]}-${local[2].padStart(2, '0')}-${local[1].padStart(2, '0')}` : texto
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return false

  const dia = new Date(`${iso}T00:00:00Z`)

  return Number.isNaN(dia.getTime()) || dia.toISOString().slice(0, 10) !== iso ? false : iso
}

/** Texto de una celda que puede venir como numero. */
const textoDe = (valor) => (typeof valor === 'number' ? String(valor) : typeof valor === 'string' ? valor.trim() : '')

/**
 * Revisa una fila como `ImportarRecurrentes::revisar()`.
 *
 * @returns {{ indice: number, errores: object, avisos: object, alta: object | null, vista: object | null }}
 */
function revisarFila (fila, indice, { staff, espacios, procesos, validarAlta }) {
  const revisada = { indice, errores: {}, avisos: {}, alta: null, vista: null }

  if (fila === null || typeof fila !== 'object' || Array.isArray(fila)) {
    revisada.errores = { fila: ['invalid'] }
    return revisada
  }

  const errores = {}
  for (const clave of Object.keys(fila)) if (!COLUMNAS.includes(clave)) errores[clave] = ['no_editable']

  if (Object.values(fila).every((valor) => typeof valor !== 'object' && textoDe(valor) === '')) {
    revisada.errores = { fila: ['vacia'] }
    return revisada
  }

  const nombre = typeof fila.tarea === 'string' ? fila.tarea.trim() : ''
  if (nombre === '') errores.tarea = ['requerido']

  const frecuenciaCruda = textoDe(fila.frecuencia)
  const frecuencia = interpretarFrecuencia(frecuenciaCruda)
  if (frecuenciaCruda === '') errores.frecuencia = ['requerido']
  else if (frecuencia === null) errores.frecuencia = ['no_soportada']

  const responsableCrudo = textoDe(fila.responsable)
  let responsable = null
  if (responsableCrudo === '') errores.responsable = ['requerido']
  else if (/^\d+$/.test(responsableCrudo)) responsable = Number(responsableCrudo)
  else {
    responsable = responsableCrudo.includes('@')
      ? staff.find((s) => s.active && s.email.toLowerCase() === responsableCrudo.toLowerCase())?.id ?? null
      : null
    if (responsable === null) errores.responsable = ['no_existe']
  }

  const proyectoCrudo = textoDe(fila.proyecto_id)
  let proyecto = null
  if (proyectoCrudo === '') errores.proyecto_id = ['requerido']
  else if (!/^\d+$/.test(proyectoCrudo) || Number(proyectoCrudo) < 1) errores.proyecto_id = ['invalid']
  else if (!espacios.some((e) => e.id === Number(proyectoCrudo))) errores.proyecto_id = ['sin_acceso']
  else proyecto = Number(proyectoCrudo)

  const inicioLeido = fechaDePlanilla(fila.fecha_inicio)
  if (inicioLeido === false) errores.fecha_inicio = ['invalid']
  const inicio = inicioLeido || new Date().toISOString().slice(0, 10)

  const plazo = textoDe(fila.vencimiento_dias)
  let vence = null
  if (plazo !== '') {
    if (!/^\d+$/.test(plazo) || Number(plazo) > 365) errores.vencimiento_dias = ['fuera_de_rango']
    else vence = sumar(inicio, Number(plazo), 'day')
  }

  const finCrudo = textoDe(fila.fin).toLowerCase()
  let fin = {}
  if (finCrudo !== '' && finCrudo !== 'nunca') {
    const veces = /^(\d{1,3})(?:\s+veces?)?$/.exec(finCrudo)
    const hasta = veces ? null : fechaDePlanilla(finCrudo)
    if (veces) fin = { cycles: Number(veces[1]) }
    else if (hasta) fin = { recurring_until: hasta }
    else errores.fin = ['invalid']
  }

  if (Object.keys(errores).length > 0) {
    revisada.errores = errores
    return revisada
  }

  const alta = {
    name: nombre,
    rel_type: 'project',
    rel_id: proyecto,
    assignees: [responsable],
    start_date: inicio,
    recurring: true,
    repeat_every: frecuencia[0],
    recurring_type: frecuencia[1],
    ...(vence === null ? {} : { due_date: vence }),
    ...fin
  }

  const rechazo = validarAlta(alta)
  if (rechazo !== null) {
    revisada.errores = rechazo
    return revisada
  }

  revisada.alta = alta
  revisada.vista = {
    tarea: nombre,
    frecuencia: textoDeFrecuencia(frecuencia[0], frecuencia[1]),
    responsable_id: responsable,
    proyecto_id: proyecto,
    fecha_inicio: inicio,
    vencimiento: vence,
    ciclos: fin.cycles ?? 0,
    hasta: fin.recurring_until ?? null
  }
  if (procesos.some((p) => p.recurring === true && p.rel_type === 'project' && p.rel_id === proyecto && p.name === nombre)) {
    revisada.avisos = { tarea: ['ya_existe'] }
  }

  return revisada
}

/**
 * `POST /tasks/recurrentes/importar`.
 *
 * @param {unknown} cuerpo lo que mando el navegador
 * @param {{ staff: object[], espacios: object[], procesos: object[], encendida: boolean,
 *           validarAlta: (alta: object) => object | null, crear: (alta: object) => number }} contexto
 * @returns {{ estado: number, datos: object }}
 */
export function importarRecurrentes (cuerpo, contexto) {
  if (!contexto.encendida) {
    throw new ErrorApi(422, 'recurrencia_apagada', 'Las tareas recurrentes están apagadas en esta instalación.', { recurring: ['recurrencia_apagada'] })
  }

  const modo = cuerpo?.modo ?? 'validar'
  if (!['validar', 'aplicar'].includes(modo)) {
    throw new ErrorApi(422, 'validation_failed', 'El modo debe ser "validar" o "aplicar".', { modo: ['invalid'] })
  }

  const filas = cuerpo?.filas
  if (filas === undefined || filas === null || (Array.isArray(filas) && filas.length === 0)) {
    throw new ErrorApi(422, 'validation_failed', 'No llegó ninguna fila.', { filas: ['requerido'] })
  }
  if (!Array.isArray(filas)) throw new ErrorApi(422, 'validation_failed', 'Las filas deben ser una lista.', { filas: ['no_es_lista'] })
  if (filas.length > MAXIMO_FILAS) {
    throw new ErrorApi(422, 'validation_failed', `Una importación admite hasta ${MAXIMO_FILAS} filas.`, { filas: ['demasiadas'] })
  }

  const revisadas = filas.map((fila, indice) => revisarFila(fila, indice, contexto))

  const vistas = new Map()
  for (const revisada of revisadas.filter((r) => r.alta !== null)) {
    const clave = `${revisada.alta.name.toLowerCase()}|${revisada.alta.rel_id}`
    vistas.set(clave, [...(vistas.get(clave) ?? []), revisada])
  }
  for (const repetidas of vistas.values()) {
    if (repetidas.length < 2) continue
    for (const revisada of repetidas) revisada.avisos.tarea = [...new Set([...(revisada.avisos.tarea ?? []), 'repetida'])]
  }

  const vacio = (objeto) => Object.keys(objeto).length === 0

  if (modo === 'validar') {
    const validas = revisadas.filter((r) => vacio(r.errores)).length

    return {
      estado: 200,
      datos: {
        modo: 'validar',
        filas: revisadas.map((r) => ({
          indice: r.indice,
          valida: vacio(r.errores),
          errores: vacio(r.errores) ? null : r.errores,
          avisos: vacio(r.avisos) ? null : r.avisos,
          vista: r.vista
        })),
        validas,
        invalidas: revisadas.length - validas
      }
    }
  }

  const errores = {}
  for (const revisada of revisadas) {
    for (const [columna, codigos] of Object.entries(revisada.errores)) errores[`filas.${revisada.indice}.${columna}`] = codigos
  }
  if (!vacio(errores)) throw new ErrorApi(422, 'validation_failed', 'Hay filas con errores; no se creó ninguna tarea.', errores)

  return {
    estado: 201,
    datos: { modo: 'aplicar', creadas: revisadas.map((r) => ({ indice: r.indice, task_id: contexto.crear(r.alta) })) }
  }
}
