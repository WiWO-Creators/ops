/**
 * Mock de la API v1 de wiwo-board.
 *
 * Sirve exactamente las respuestas de `docs/contrato-api.md` para que `ops-v2` avance en paralelo con
 * la construccion del modulo real en Perfex. Cuando la API exista, la integracion es cambiar
 * `API_BASE`; si eso duele, es señal de que el contrato se congelo mal.
 *
 * Sin dependencias a proposito: `json-server` no hace envelope, ni Bearer, ni 2FA, ni `filter[]`.
 *
 *   node mock/servidor.js            # escucha en :3001
 *   PORT=4000 node mock/servidor.js
 */

import { createServer } from 'node:http'
import { ErrorApi, aplicarConsulta, coincideEnLista, leerIncludes } from './consulta.js'
import * as sesion from './sesion.js'
import {
  ARCHIVOS, CAMPOS_PERSONALIZADOS, CHECKLIST, CLIENTES, COMENTARIOS, CRONOMETROS,
  DEPARTAMENTOS, ESPACIOS, ESTADOS_ESPACIO, ESTADOS_PROCESO, ETIQUETAS, HITOS,
  PRIORIDADES, PROCESOS, ROLES, STAFF, VALORES_CAMPOS
} from './datos.js'

const PUERTO = Number(process.env.PORT ?? 3001)
const ORIGENES = (process.env.ORIGENES ?? 'http://localhost:3000').split(',').map((o) => o.trim())

/** Recursos sobre los que se declaran permisos, con las acciones posibles. */
const ACCIONES = ['view', 'create', 'edit', 'delete']
const RECURSOS_CON_PERMISO = ['tasks', 'projects', 'customers', 'staff', 'invoices']

// ---------------------------------------------------------------------------
// Respuestas
// ---------------------------------------------------------------------------

/**
 * Emite las cabeceras CORS. Solo para origenes de la whitelist: nunca `*`.
 *
 * Sin `Access-Control-Allow-Credentials`, porque la autenticacion es Bearer y no cookies. Eso vuelve
 * irrelevante toda la discusion de `SameSite` en produccion, donde ademas el navegador habla con el
 * BFF de Next y no con esta API.
 */
function cabecerasCors (respuesta, origen) {
  if (!origen || !ORIGENES.includes(origen)) return
  respuesta.setHeader('Access-Control-Allow-Origin', origen)
  respuesta.setHeader('Vary', 'Origin')
  respuesta.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, PUT, DELETE, OPTIONS')
  respuesta.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type, X-Requested-With')
  respuesta.setHeader('Access-Control-Max-Age', '86400')
}

/**
 * Escribe una respuesta JSON con el envelope del contrato.
 * @param {import('node:http').ServerResponse} respuesta
 * @param {number} estado
 * @param {object|null} cuerpo
 */
function responder (respuesta, estado, cuerpo) {
  if (estado === 204 || cuerpo === null) {
    respuesta.writeHead(204)
    respuesta.end()
    return
  }
  const texto = JSON.stringify(cuerpo, null, 2)
  respuesta.writeHead(estado, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(texto)
  })
  respuesta.end(texto)
}

const conDatos = (data, meta) => (meta ? { data, meta } : { data })

/**
 * Lee y parsea el cuerpo JSON de la peticion.
 * @param {import('node:http').IncomingMessage} peticion
 * @returns {Promise<object>}
 * @throws {ErrorApi} 400 si el JSON es invalido
 */
async function leerCuerpo (peticion) {
  const trozos = []
  for await (const trozo of peticion) trozos.push(trozo)
  const crudo = Buffer.concat(trozos).toString('utf8').trim()
  if (crudo === '') return {}
  try {
    return JSON.parse(crudo)
  } catch {
    throw new ErrorApi(400, 'bad_request', 'El cuerpo no es JSON válido.')
  }
}

// ---------------------------------------------------------------------------
// Presentacion
// ---------------------------------------------------------------------------

/** Quita del staff los campos que la API nunca expone. */
function presentarStaff (staff) {
  const { password, two_factor: dosFactores, ...publico } = staff
  return publico
}

/**
 * Arma el mapa de permisos que el frontend usa para podar columnas y acciones.
 *
 * Un admin puede todo. El resto trabaja sus Procesos pero NO ve clientes ni facturas: es un recorte
 * realista en Perfex, y es lo que hace que el 403 sea alcanzable desde el mock. Sin un permiso
 * denegado de verdad, la rama de "sin permiso" del frontend nunca se ejercita hasta produccion.
 */
function permisosDe (staff) {
  if (staff.is_admin) {
    return Object.fromEntries(RECURSOS_CON_PERMISO.map((r) => [r, [...ACCIONES]]))
  }
  return {
    tasks: ['view', 'create', 'edit'],
    projects: ['view'],
    customers: [],
    staff: ['view'],
    invoices: []
  }
}

/** Adjunta `custom_fields` a una fila si el cliente lo pidio con `include`. */
function conCamposPersonalizados (fila, entidad, includes) {
  if (!includes.includes('custom_fields')) return fila
  return { ...fila, custom_fields: VALORES_CAMPOS[`${entidad}:${fila.id}`] ?? [] }
}

// ---------------------------------------------------------------------------
// Whitelists por recurso
// ---------------------------------------------------------------------------

const CONSULTA_PROCESOS = {
  filtros: {
    status: coincideEnLista((p) => p.status),
    priority: coincideEnLista((p) => p.priority),
    project_id: coincideEnLista((p) => p.project?.id ?? null),
    milestone_id: coincideEnLista((p) => p.milestone?.id ?? null),
    assignee: coincideEnLista((p) => p.assignees.map((a) => a.id)),
    follower: coincideEnLista((p) => p.followers.map((f) => f.id)),
    tag: coincideEnLista((p) => p.tags.map((t) => t.id)),
    billable: (p, v) => String(p.billable) === v,
    date_from: (p, v) => p.due_date >= v,
    date_to: (p, v) => p.due_date <= v
  },
  orden: ['name', 'due_date', 'start_date', 'date_added', 'priority', 'status'],
  busqueda: ['name']
}

const CONSULTA_ESPACIOS = {
  filtros: {
    status: coincideEnLista((e) => e.status),
    clientid: coincideEnLista((e) => e.clientid),
    date_from: (e, v) => e.start_date >= v,
    date_to: (e, v) => e.start_date <= v
  },
  orden: ['name', 'start_date', 'deadline', 'progress'],
  busqueda: ['name']
}

const CONSULTA_CLIENTES = {
  filtros: {
    active: (c, v) => String(c.active) === v,
    country_id: coincideEnLista((c) => c.country_id)
  },
  orden: ['company', 'datecreated'],
  busqueda: ['company']
}

const CONSULTA_STAFF = {
  filtros: {
    active: (s, v) => String(s.active) === v,
    role_id: coincideEnLista((s) => s.role_id)
  },
  orden: ['firstname', 'lastname', 'last_login'],
  busqueda: ['full_name', 'email']
}

// ---------------------------------------------------------------------------
// Rutas
// ---------------------------------------------------------------------------

/**
 * Presenta un Espacio con sus contadores. Los `counts` viajan siempre: sin ellos, la lista tendria
 * que hacer una consulta por fila.
 */
function presentarEspacio (espacio) {
  const cliente = CLIENTES.find((c) => c.id === espacio.clientid)
  const suyos = PROCESOS.filter((p) => p.project?.id === espacio.id)
  const { clientid, ...resto } = espacio
  return {
    ...resto,
    client: cliente ? { id: cliente.id, company: cliente.company } : null,
    counts: {
      tasks: suyos.length,
      tasks_open: suyos.filter((p) => p.status !== 5).length,
      milestones: HITOS.filter((h) => h.project_id === espacio.id).length
    }
  }
}

/** En listas se omite `description`: son `longtext` y nadie los lee desde una tabla. */
function presentarProcesoEnLista (proceso) {
  const { description, ...resto } = proceso
  return resto
}

/** Busca una fila por id o lanza 404. */
function buscarO404 (filas, id, que) {
  const fila = filas.find((f) => f.id === id)
  if (!fila) throw new ErrorApi(404, 'not_found', `No existe ${que} con id ${id}.`)
  return fila
}

/** Exige que el staff tenga una accion sobre un recurso, o lanza 403. */
function exigirPermiso (staff, recurso, accion) {
  const permisos = permisosDe(staff)
  if (!(permisos[recurso] ?? []).includes(accion)) {
    throw new ErrorApi(403, 'forbidden', `Sin permiso para ${accion} sobre ${recurso}.`)
  }
}

/**
 * Resuelve una peticion ya enrutada.
 *
 * @param {string} metodo
 * @param {string[]} segmentos ruta bajo `/api/v1`, ya partida
 * @param {URLSearchParams} parametros
 * @param {string|null} token
 * @param {() => Promise<object>} cuerpo
 * @returns {Promise<{estado: number, cuerpo: object|null}>}
 */
async function resolverRuta (metodo, segmentos, parametros, token, cuerpo) {
  const [recurso, ...resto] = segmentos

  // --- Publicas -----------------------------------------------------------
  if (recurso === 'health') {
    return {
      estado: 200,
      cuerpo: conDatos({ ok: true, version: 'mock-1.0.0', auth_header_visible: true })
    }
  }

  if (recurso === 'auth') {
    const [accion] = resto
    const datos = await cuerpo()

    if (accion === 'login' && metodo === 'POST') {
      const staff = sesion.autenticar(datos.email, datos.password)
      if (staff.two_factor) {
        return {
          estado: 200,
          cuerpo: conDatos({
            two_factor_required: true,
            challenge_token: sesion.emitirDesafio(staff.id),
            method: staff.two_factor
          })
        }
      }
      return { estado: 201, cuerpo: conDatos({ ...sesion.emitirSesion(staff.id), staff: presentarStaff(staff) }) }
    }

    if (accion === '2fa' && metodo === 'POST') {
      const staff = sesion.resolver(datos.challenge_token ?? null, 'desafio')
      // En el mock cualquier codigo de 6 digitos sirve: validar un TOTP real no aporta nada acá, pero
      // rechazar un codigo con forma invalida sí, porque es el error que el frontend debe mostrar.
      if (!/^\d{6}$/.test(String(datos.code ?? ''))) {
        throw new ErrorApi(401, 'unauthenticated', 'Código de verificación inválido.')
      }
      sesion.revocar(datos.challenge_token)
      return { estado: 201, cuerpo: conDatos({ ...sesion.emitirSesion(staff.id), staff: presentarStaff(staff) }) }
    }

    if (accion === 'refresh' && metodo === 'POST') {
      return { estado: 200, cuerpo: conDatos(sesion.rotar(datos.refresh_token ?? null)) }
    }

    if (accion === 'logout' && metodo === 'POST') {
      const staff = sesion.resolver(token, 'acceso')
      if (parametros.get('all') === '1') sesion.revocarTodo(staff.id)
      else sesion.revocar(token)
      return { estado: 204, cuerpo: null }
    }

    throw new ErrorApi(404, 'not_found', 'Acción de autenticación desconocida.')
  }

  // --- A partir de acá, todo exige token ----------------------------------
  const actual = sesion.resolver(token, 'acceso')

  if (recurso === 'me' && metodo === 'GET') {
    return {
      estado: 200,
      cuerpo: conDatos({
        ...presentarStaff(actual),
        permissions: permisosDe(actual),
        secciones_habilitadas: ['procesos', 'espacios'],
        locale: 'es'
      })
    }
  }

  if (recurso === 'config' && resto[0] === 'realtime') {
    return {
      estado: 200,
      cuerpo: conDatos({ enabled: false, key: null, cluster: null })
    }
  }

  if (recurso === 'lookups' && metodo === 'GET') {
    return {
      estado: 200,
      cuerpo: conDatos({
        task_statuses: ESTADOS_PROCESO,
        task_priorities: PRIORIDADES,
        project_statuses: ESTADOS_ESPACIO,
        tags: ETIQUETAS,
        roles: ROLES,
        departments: DEPARTAMENTOS
      })
    }
  }

  if (recurso === 'custom-fields' && metodo === 'GET') {
    const para = parametros.get('para') ?? ''
    const definiciones = CAMPOS_PERSONALIZADOS[para]
    if (!definiciones) {
      throw new ErrorApi(422, 'validation_failed', `Entidad desconocida: "${para}".`, { para: ['unknown'] })
    }
    // `only_admin` lo decide el backend, no el frontend: si el filtro viviera en la interfaz, bastaria
    // con abrir DevTools para ver los campos reservados.
    return { estado: 200, cuerpo: conDatos(definiciones.filter((d) => !d.only_admin || actual.is_admin)) }
  }

  if (recurso === 'staff' && metodo === 'GET') {
    exigirPermiso(actual, 'staff', 'view')
    if (resto.length === 0) {
      const { filas, paginacion } = aplicarConsulta(STAFF.map(presentarStaff), parametros, CONSULTA_STAFF)
      return { estado: 200, cuerpo: conDatos(filas, { pagination: paginacion }) }
    }
    return { estado: 200, cuerpo: conDatos(presentarStaff(buscarO404(STAFF, Number(resto[0]), 'staff'))) }
  }

  if (recurso === 'clients' && metodo === 'GET') {
    exigirPermiso(actual, 'customers', 'view')
    const includes = leerIncludes(parametros, ['custom_fields', 'contacts'])
    if (resto.length === 0) {
      const { filas, paginacion } = aplicarConsulta(CLIENTES, parametros, CONSULTA_CLIENTES)
      return {
        estado: 200,
        cuerpo: conDatos(filas.map((c) => conCamposPersonalizados(c, 'clients', includes)), { pagination: paginacion })
      }
    }
    const cliente = buscarO404(CLIENTES, Number(resto[0]), 'cliente')
    return { estado: 200, cuerpo: conDatos(conCamposPersonalizados(cliente, 'clients', includes)) }
  }

  if (recurso === 'projects' && metodo === 'GET') {
    exigirPermiso(actual, 'projects', 'view')
    const includes = leerIncludes(parametros, ['custom_fields', 'members'])

    if (resto.length === 0) {
      const { filas, paginacion } = aplicarConsulta(ESPACIOS, parametros, CONSULTA_ESPACIOS)
      return {
        estado: 200,
        cuerpo: conDatos(filas.map((e) => conCamposPersonalizados(presentarEspacio(e), 'projects', includes)), {
          pagination: paginacion
        })
      }
    }

    const espacio = buscarO404(ESPACIOS, Number(resto[0]), 'espacio')
    const [, subrecurso] = resto

    if (!subrecurso) {
      return { estado: 200, cuerpo: conDatos(conCamposPersonalizados(presentarEspacio(espacio), 'projects', includes)) }
    }
    if (subrecurso === 'tasks') {
      const suyos = PROCESOS.filter((p) => p.project?.id === espacio.id)
      const { filas, paginacion } = aplicarConsulta(suyos, parametros, CONSULTA_PROCESOS)
      return { estado: 200, cuerpo: conDatos(filas.map(presentarProcesoEnLista), { pagination: paginacion }) }
    }
    if (subrecurso === 'milestones') {
      return { estado: 200, cuerpo: conDatos(HITOS.filter((h) => h.project_id === espacio.id)) }
    }
    if (subrecurso === 'members') {
      return { estado: 200, cuerpo: conDatos(STAFF.slice(0, 3).map(presentarStaff)) }
    }
    if (subrecurso === 'files') {
      const suyos = PROCESOS.filter((p) => p.project?.id === espacio.id).map((p) => p.id)
      return { estado: 200, cuerpo: conDatos(ARCHIVOS.filter((a) => suyos.includes(a.rel_id))) }
    }
    throw new ErrorApi(404, 'not_found', `Subrecurso desconocido: "${subrecurso}".`)
  }

  if (recurso === 'tasks') {
    const includes = leerIncludes(parametros, ['custom_fields', 'description'])

    if (metodo === 'GET' && resto.length === 0) {
      exigirPermiso(actual, 'tasks', 'view')

      if (parametros.get('vista') === 'tablero') {
        // Las columnas salen de `lookups`, ordenadas por `order` y no por `id`: los ids de estado de
        // Perfex no siguen el orden de visualizacion.
        const columnas = [...ESTADOS_PROCESO].sort((a, b) => a.order - b.order)
        return {
          estado: 200,
          cuerpo: conDatos(columnas.map((columna) => {
            const parametrosColumna = new URLSearchParams(parametros)
            parametrosColumna.set('filter[status]', String(columna.id))
            const { filas, paginacion } = aplicarConsulta(PROCESOS, parametrosColumna, CONSULTA_PROCESOS)
            return {
              columna: { id: columna.id, name: columna.name, color: columna.color, order: columna.order },
              tarjetas: filas.map(presentarProcesoEnLista),
              pagination: paginacion
            }
          }))
        }
      }

      const { filas, paginacion } = aplicarConsulta(PROCESOS, parametros, CONSULTA_PROCESOS)
      return { estado: 200, cuerpo: conDatos(filas.map(presentarProcesoEnLista), { pagination: paginacion }) }
    }

    const proceso = buscarO404(PROCESOS, Number(resto[0]), 'proceso')
    const [, subrecurso, extra] = resto

    if (metodo === 'GET' && !subrecurso) {
      exigirPermiso(actual, 'tasks', 'view')
      return { estado: 200, cuerpo: conDatos(conCamposPersonalizados(proceso, 'tasks', includes)) }
    }
    if (metodo === 'GET' && subrecurso === 'comments') {
      return { estado: 200, cuerpo: conDatos(COMENTARIOS.filter((c) => c.task_id === proceso.id)) }
    }
    if (metodo === 'GET' && subrecurso === 'checklist') {
      return { estado: 200, cuerpo: conDatos(CHECKLIST.filter((c) => c.task_id === proceso.id)) }
    }
    if (metodo === 'GET' && subrecurso === 'timers') {
      return { estado: 200, cuerpo: conDatos(CRONOMETROS.filter((c) => c.task_id === proceso.id)) }
    }
    if (metodo === 'GET' && subrecurso === 'files') {
      return { estado: 200, cuerpo: conDatos(ARCHIVOS.filter((a) => a.rel_type === 'task' && a.rel_id === proceso.id)) }
    }

    if (metodo === 'PATCH' && !subrecurso) {
      exigirPermiso(actual, 'tasks', 'edit')
      // Parche parcial: el detalle edita bloque a bloque, nunca envia 200 campos de una.
      Object.assign(proceso, await cuerpo())
      return { estado: 200, cuerpo: conDatos(proceso) }
    }

    if (metodo === 'POST' && subrecurso === 'actions') {
      exigirPermiso(actual, 'tasks', 'edit')
      if (extra === 'mark-complete') {
        proceso.status = 5
        proceso.date_finished = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z')
        return { estado: 200, cuerpo: conDatos(proceso) }
      }
      if (extra === 'reopen') {
        proceso.status = 4
        proceso.date_finished = null
        return { estado: 200, cuerpo: conDatos(proceso) }
      }
      throw new ErrorApi(404, 'not_found', `Acción desconocida: "${extra}".`)
    }

    if (metodo === 'POST' && subrecurso === 'mover') {
      exigirPermiso(actual, 'tasks', 'edit')
      const { columna, posicion } = await cuerpo()
      if (!ESTADOS_PROCESO.some((e) => e.id === columna)) {
        throw new ErrorApi(409, 'conflict', `La columna ${columna} no existe.`)
      }
      proceso.status = columna
      proceso.kanban_order = Number(posicion ?? 1)
      return { estado: 200, cuerpo: conDatos(proceso) }
    }

    if (subrecurso === 'timer') {
      exigirPermiso(actual, 'tasks', 'edit')
      if (metodo === 'POST') {
        if (proceso.timer_activo) {
          throw new ErrorApi(409, 'conflict', 'Ya hay un cronómetro activo en este proceso.')
        }
        proceso.timer_activo = {
          id: 900 + proceso.id,
          staff_id: actual.id,
          start_time: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z')
        }
        return { estado: 201, cuerpo: conDatos(proceso.timer_activo) }
      }
      if (metodo === 'DELETE') {
        if (!proceso.timer_activo) {
          throw new ErrorApi(409, 'conflict', 'No hay ningún cronómetro activo.')
        }
        proceso.timer_activo = null
        return { estado: 204, cuerpo: null }
      }
    }

    throw new ErrorApi(404, 'not_found', 'Ruta de proceso desconocida.')
  }

  if (recurso === 'files' && metodo === 'GET' && resto[1] === 'download') {
    const archivo = buscarO404(ARCHIVOS, Number(resto[0]), 'archivo')
    // El mock no sirve binarios: devuelve la metadata para que el frontend pueda armar la interfaz
    // sin depender de un archivo real. Lo que sí replica es el 404 y el permiso.
    return { estado: 200, cuerpo: conDatos({ ...archivo, mock: true }) }
  }

  throw new ErrorApi(404, 'not_found', `Recurso desconocido: "${recurso ?? ''}".`)
}

// ---------------------------------------------------------------------------
// Servidor
// ---------------------------------------------------------------------------

export const servidor = createServer((peticion, respuesta) => {
  const url = new URL(peticion.url, `http://localhost:${PUERTO}`)
  cabecerasCors(respuesta, peticion.headers.origin ?? null)

  // El preflight nunca lleva credenciales ni cuerpo: se contesta antes de cualquier chequeo de token.
  if (peticion.method === 'OPTIONS') {
    respuesta.writeHead(204)
    respuesta.end()
    return
  }

  const partes = url.pathname.split('/').filter(Boolean)
  if (partes[0] !== 'api' || partes[1] !== 'v1') {
    responder(respuesta, 404, { error: { code: 'not_found', message: 'La base de la API es /api/v1.' } })
    return
  }

  const token = (peticion.headers.authorization ?? '').replace(/^Bearer\s+/i, '') || null

  resolverRuta(peticion.method, partes.slice(2), url.searchParams, token, () => leerCuerpo(peticion))
    .then(({ estado, cuerpo }) => responder(respuesta, estado, cuerpo))
    .catch((error) => {
      if (error instanceof ErrorApi) {
        const cuerpo = { error: { code: error.codigo, message: error.message } }
        if (error.detalles) cuerpo.error.details = error.detalles
        responder(respuesta, error.estado, cuerpo)
        return
      }
      // Nunca se filtra el stack al cliente, ni siquiera en el mock: el frontend debe programarse
      // contra la forma real del error, no contra una que solo existe en desarrollo.
      console.error('[mock] error no controlado:', error)
      responder(respuesta, 500, { error: { code: 'server_error', message: 'Error interno del mock.' } })
    })
})

// Solo escucha si se ejecuta directamente: las pruebas lo importan y eligen su propio puerto.
if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop())) {
  servidor.listen(PUERTO, () => {
    console.log(`[mock] API v1 en http://localhost:${PUERTO}/api/v1`)
    console.log(`[mock] origenes permitidos: ${ORIGENES.join(', ')}`)
    console.log('[mock] acceso: ana@wiwo.me / mock1234 (admin) · bruno@wiwo.me / mock1234 (con 2FA)')
  })
}
