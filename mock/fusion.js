/**
 * "Fusionar entidades" en el mock: la vista previa, la fusion, el historial, el "Deshacer" y el
 * reintento de archivos.
 *
 * Sigue las formas de `modules/api/Escritura/Fusion.php` del board (`GET /{entidad}/{id}/merge-preview?into=`,
 * `POST /{entidad}/{id}/actions/merge`, `GET /merges`, `GET /merges/{id}`, `POST /merges/{id}/actions/revert` y
 * `.../retry-files`). No toca los arreglos de `datos.js`: la fusion solo deja constancia en su propio
 * historial, que es lo que el dialogo y la pantalla de Fusiones necesitan para ejercitarse.
 *
 * Los proyectos de clientes distintos devuelven un bloqueo, para ejercitar el boton deshabilitado.
 * `MOCK_FUSION_APAGADA=1` simula el interruptor `wiwo_fusion_habilitada` apagado.
 */

import { ErrorApi } from './consulta.js'
import { CLIENTES, ESPACIOS, PROSPECTOS } from './datos.js'

const DIAS_PARA_DESHACER = 30
const PALABRA = 'FUSIONAR'

/** Las tres entidades: su ruta en la API, su slug en el historial y de donde sale el nombre. */
const ENTIDADES = {
  projects: { slug: 'projects', filas: ESPACIOS, nombre: (f) => f.name },
  clients: { slug: 'clients', filas: CLIENTES, nombre: (f) => f.company },
  prospectos: { slug: 'prospects', filas: PROSPECTOS, nombre: (f) => f.empresa }
}

/** @type {Array<Record<string, unknown>>} */
const HISTORIAL = [
  fusionDeEjemplo(9001, 'clients', 'Cliente duplicado', 'Cliente principal', 3, 'aplicada'),
  fusionDeEjemplo(9002, 'projects', 'Campaña Q3 (copia)', 'Campaña Q3', 29, 'aplicada'),
  fusionDeEjemplo(9003, 'prospects', 'Colbun S.A.', 'Colbún', 12, 'revertida'),
  fusionDeEjemplo(9004, 'projects', 'Migración de datos (2)', 'Migración de datos', 1, 'pendiente_archivos')
]

let proximoId = 9100

/** Una fusion ya hecha, `diasAtras` dias atras, para que el historial tenga con que mostrarse. */
function fusionDeEjemplo (id, entidad, origen, destino, diasAtras, estado) {
  return presentar({
    id,
    entidad,
    origen: { id: id * 10, nombre: origen },
    destino: { id: id * 10 + 1, nombre: destino },
    estado,
    staff: { id: 1, full_name: 'Ana Ríos' },
    fecha: new Date(Date.now() - diasAtras * 86400000)
  })
}

/** La fila del historial con la forma de `Fusion::presentar()`. */
function presentar (fusion) {
  const limite = new Date(fusion.fecha.getTime() + DIAS_PARA_DESHACER * 86400000)

  return {
    ...fusion,
    fecha: fusion.fecha.toISOString(),
    revertida_en: fusion.estado === 'revertida' ? new Date(fusion.fecha.getTime() + 3600000).toISOString() : null,
    puede_revertir: fusion.estado !== 'revertida' && limite.getTime() >= Date.now(),
    revertible_hasta: limite.toISOString()
  }
}

/** Si quien pide puede fusionar: administracion o coordinacion multiarea. */
function puedeFusionar (staff) {
  return staff.is_admin === true || staff.is_superadmin === true || staff.is_coordinador_multiarea === true
}

/** Corta con 403 a quien no puede fusionar. */
function exigirRol (actual) {
  if (!puedeFusionar(actual)) throw new ErrorApi(403, 'forbidden', 'Sólo un administrador o un coordinador multiárea puede fusionar.')
}

/** Corta con 403 cuando el interruptor esta apagado. */
function exigirHabilitada () {
  if (process.env.MOCK_FUSION_APAGADA === '1') {
    throw new ErrorApi(403, 'forbidden', 'La fusión de entidades está deshabilitada en esta instalación (opción wiwo_fusion_habilitada).')
  }
}

/** La fila de una entidad, o 404. */
function buscar (entidad, id) {
  const fila = entidad.filas.find((f) => f.id === Number(id))

  if (!fila) throw new ErrorApi(404, 'not_found', 'No existe ese elemento.')

  return fila
}

/** Los bloqueos del par: dos Proyectos de clientes distintos no se fusionan. */
function bloqueosDe (clave, origen, destino) {
  if (clave === 'projects' && origen.clientid !== destino.clientid) {
    return [`Los proyectos pertenecen a clientes distintos (#${origen.clientid} y #${destino.clientid}). Fusiona primero los clientes.`]
  }

  return []
}

/** La vista previa del par, con conteos, conflictos y duplicados de ejemplo. */
function previa (clave, origen, destino) {
  const entidad = ENTIDADES[clave]

  return {
    habilitada: process.env.MOCK_FUSION_APAGADA !== '1',
    palabra: PALABRA,
    entidad: entidad.slug,
    origen: { id: origen.id, nombre: entidad.nombre(origen) },
    destino: { id: destino.id, nombre: entidad.nombre(destino) },
    bloqueos: bloqueosDe(clave, origen, destino),
    conteos: clave === 'projects'
      ? [
          { tabla: 'tasks', etiqueta: 'Tareas', filas: 24, accion: 'mover' },
          { tabla: 'milestones', etiqueta: 'Hitos', filas: 3, accion: 'deduplicar' },
          { tabla: 'taskstimers', etiqueta: 'Horas registradas', filas: 41, accion: 'mover' },
          { tabla: 'project_members', etiqueta: 'Miembros del equipo', filas: 5, accion: 'deduplicar' },
          { tabla: 'wiwo_deletion_requests', etiqueta: 'Solicitudes de eliminación', filas: 1, accion: 'cancelar' }
        ]
      : [
          { tabla: 'projects', etiqueta: 'Proyectos', filas: 4, accion: 'mover' },
          { tabla: 'contacts', etiqueta: 'Contactos', filas: 6, accion: 'deduplicar' },
          { tabla: 'notes', etiqueta: 'Notas', filas: 2, accion: 'mover' },
          { tabla: 'wiwo_client_scores', etiqueta: 'Semáforo', filas: 1, accion: 'recalcular' }
        ],
    conflictos: [
      { campo: clave === 'prospectos' ? 'empresa' : clave === 'clients' ? 'company' : 'name', etiqueta: clave === 'clients' ? 'Empresa' : 'Nombre', valor_origen: entidad.nombre(origen), valor_destino: entidad.nombre(destino) },
      { campo: 'phonenumber', etiqueta: 'Teléfono', valor_origen: '+56 2 2345 6789', valor_destino: null }
    ],
    duplicados: [{ etiqueta: 'Contactos', cantidad: 2 }],
    archivos: { cantidad: 7 },
    drive: { carpetas: 1, accion: 'mover_contenido' }
  }
}

/**
 * Atiende lo de fusion. Devuelve `null` si la ruta no es de este modulo.
 *
 * @param {string} metodo
 * @param {string} recurso primer segmento de la ruta
 * @param {string[]} resto segmentos siguientes
 * @param {URLSearchParams} parametros
 * @param {object} actual quien pide
 * @param {() => Promise<any>} cuerpo lector perezoso del cuerpo
 * @returns {Promise<{estado: number, cuerpo: unknown} | null>}
 */
export async function fusionRuta (metodo, recurso, resto, parametros, actual, cuerpo) {
  if (recurso === 'merges') return historialRuta(metodo, resto, parametros, actual)

  const entidad = ENTIDADES[recurso]
  const esPrevia = resto[1] === 'merge-preview' && resto.length === 2 && metodo === 'GET'
  const esFusion = resto[1] === 'actions' && resto[2] === 'merge' && resto.length === 3 && metodo === 'POST'

  if (entidad === undefined || !(esPrevia || esFusion)) return null

  const origen = buscar(entidad, resto[0])
  exigirRol(actual)

  if (esPrevia) {
    const destino = buscar(entidad, parametros.get('into'))

    return { estado: 200, cuerpo: { data: previa(recurso, origen, destino) } }
  }

  exigirHabilitada()

  const datos = await cuerpo()
  const destino = buscar(entidad, datos?.into)

  if (datos?.confirmacion !== PALABRA) {
    throw new ErrorApi(422, 'validation_failed', `Para fusionar hay que escribir exactamente la palabra ${PALABRA}.`)
  }

  const bloqueos = bloqueosDe(recurso, origen, destino)

  if (bloqueos.length > 0) throw new ErrorApi(409, 'conflict', bloqueos[0])

  const fusion = presentar({
    id: proximoId++,
    entidad: entidad.slug,
    origen: { id: origen.id, nombre: entidad.nombre(origen) },
    destino: { id: destino.id, nombre: entidad.nombre(destino) },
    estado: 'aplicada',
    staff: { id: actual.id, full_name: actual.full_name },
    fecha: new Date()
  })

  HISTORIAL.unshift(fusion)

  return { estado: 200, cuerpo: { data: { fusion_id: fusion.id, estado: fusion.estado } } }
}

/** `GET /merges`, `GET /merges/{id}`, `POST /merges/{id}/actions/revert` y `POST /merges/{id}/actions/retry-files`. */
function historialRuta (metodo, resto, parametros, actual) {
  exigirRol(actual)

  if (metodo === 'GET' && resto.length === 0) {
    const entidad = parametros.get('filter[entidad]')
    const filas = HISTORIAL.filter((f) => entidad === null || f.entidad === entidad)

    return { estado: 200, cuerpo: { data: filas, meta: { pagination: { page: 1, per_page: 25, total: filas.length, total_pages: 1 } } } }
  }

  const fusion = HISTORIAL.find((f) => f.id === Number(resto[0]))

  if (metodo === 'GET' && resto.length === 1) {
    if (!fusion) throw new ErrorApi(404, 'not_found', 'No existe esa fusión.')

    return { estado: 200, cuerpo: { data: { ...fusion, resumen: {} } } }
  }

  if (metodo !== 'POST' || resto[1] !== 'actions' || resto.length !== 3) throw new ErrorApi(404, 'not_found', 'Subrecurso desconocido.')
  if (!fusion) throw new ErrorApi(404, 'not_found', 'No existe esa fusión.')

  exigirHabilitada()

  if (resto[2] === 'revert') {
    if (!fusion.puede_revertir) throw new ErrorApi(409, 'conflict', 'Esa fusión ya no se puede revertir.')

    fusion.estado = 'revertida'
    fusion.puede_revertir = false
    fusion.revertida_en = new Date().toISOString()

    const omitidas = fusion.id === 9002 ? [{ tabla: 'taskstimers', pk: 18, columna: 'task_id', motivo: 'La fila cambió después de la fusión.' }] : []

    return { estado: 200, cuerpo: { data: { fusion_id: fusion.id, estado: fusion.estado, omitidas } } }
  }

  if (resto[2] === 'retry-files') {
    if (fusion.estado !== 'pendiente_archivos') throw new ErrorApi(409, 'conflict', 'Esa fusión no tiene archivos pendientes.')

    fusion.estado = 'aplicada'

    return { estado: 200, cuerpo: { data: { fusion_id: fusion.id, estado: fusion.estado } } }
  }

  throw new ErrorApi(404, 'not_found', 'Subrecurso desconocido.')
}
