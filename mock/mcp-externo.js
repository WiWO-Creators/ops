/**
 * Mock del servidor MCP externo: integraciones, sistemas MCP, últimas llamadas y propuestas.
 *
 * Sirve lo que dice `docs/contrato-api.md` § «Servidor MCP externo». El estado vive en memoria, igual
 * que el resto del mock: así la pantalla de Integraciones y la bandeja de Propuestas se pueden usar
 * enteras sin backend (alta, llave visible una vez, claves, interruptores, confirmar y rechazar).
 */
import { ErrorApi } from './consulta.js'

const DOMINIOS = ['nucleo', 'espacios', 'personales', 'procesos', 'jornadas']
const EVENTOS = ['propuesta.aprobada', 'propuesta.rechazada', 'propuesta.fallida', 'propuesta.expirada', 'tarea.estado_cambiado', 'tarea.completada']
const PATRON_SLUG = /^[a-z0-9][a-z0-9-]{1,30}$/

const conDatos = (data) => ({ data })

/** @type {Map<number, object>} */
const INTEGRACIONES = new Map([
  [1, { id: 1, name: 'BI de gerencia', scope: 'pantallas', key_start: 'a1b2c3d4', created_at: '2026-09-01T12:00:00Z', created_by: 1, key_issued_at: '2026-09-01T12:00:00Z', last_used_at: '2026-10-06T09:00:00Z' }]
])
const SISTEMAS = new Map()
const WEBHOOKS = new Map()
let siguiente = 2

const PROPUESTAS = [
  {
    id: 9001, tool: 'crear_tarea', summary: 'Crear la tarea «Revisar métricas de octubre» en Nestlé',
    detail: ['Proyecto: Nestlé · Campañas', 'Responsable: Ana'], assumptions: ['Vence: viernes'],
    state: 'pendiente', result: null, expires_at: '2099-10-10T12:00:00Z', created_at: '2026-10-07T12:00:00Z',
    origin: { system: 'metriq', name: 'Metriq' }, link: { external_id: 'm-9', url: 'https://metriq.wiwo.me/alertas/9' }
  },
  {
    id: 9002, tool: 'comentar_tarea', summary: 'Comentar en NES-013-123: «El informe quedó listo»',
    detail: ['Tarea: NES-013-123'], assumptions: [],
    state: 'pendiente', result: null, expires_at: '2099-10-09T12:00:00Z', created_at: '2026-10-07T10:00:00Z',
    origin: { system: 'wiwolab', name: 'WiwoLab' }, link: { external_id: 'l-4', url: 'javascript:alert(1)' }
  },
  {
    id: 9003, tool: 'registrar_horas', summary: 'Registrar 2 h en «Campañas»',
    detail: [], assumptions: [],
    state: 'ejecutada', result: 'Horas registradas.', expires_at: '2026-10-05T12:00:00Z', created_at: '2026-10-04T12:00:00Z',
    origin: { system: 'metriq', name: 'Metriq' }, link: null
  }
]

/** Una clave de 64 hexadecimales, como la de la API. Determinista por id para que las pruebas no fluctúen. */
function llaveDe (id) {
  return String(id).padStart(2, '0').repeat(32).slice(0, 64)
}

function exigirIntegracion (id) {
  const fila = INTEGRACIONES.get(id)

  if (fila === undefined) throw new ErrorApi(404, 'not_found', 'No existe esa integración.')

  return fila
}

function exigirSistema (id) {
  const sistema = SISTEMAS.get(id)

  if (sistema === undefined) throw new ErrorApi(404, 'not_found', 'No existe ese sistema MCP.')

  return sistema
}

function validacion (mensaje, campo) {
  return new ErrorApi(422, 'validation_failed', mensaje, { [campo]: ['invalid'] })
}

/** Lista blanca de un campo de texto-lista, como la de la API. */
function listaPermitida (valor, permitidos, campo) {
  if (!Array.isArray(valor) || valor.some((v) => typeof v !== 'string' || !permitidos.includes(v))) {
    throw validacion(`\`${campo}\` solo admite: ${permitidos.join(', ')}.`, campo)
  }

  return permitidos.filter((p) => valor.includes(p))
}

/**
 * Aplica el `PUT` parcial de un sistema.
 *
 * `claves` reemplaza la lista; una entrada con un `kid` ya registrado y sin `pem` conserva su clave.
 */
function guardarSistema (sistema, datos) {
  if (datos.dominios !== undefined) sistema.domains = listaPermitida(datos.dominios, DOMINIOS, 'dominios')
  if (datos.eventos !== undefined) sistema.events = listaPermitida(datos.eventos, EVENTOS, 'eventos')

  if (datos.ttl_propuesta_horas !== undefined) {
    const horas = datos.ttl_propuesta_horas

    if (!Number.isInteger(horas) || horas < 1 || horas > 720) throw validacion('`ttl_propuesta_horas` va de 1 a 720.', 'ttl_propuesta_horas')

    sistema.proposal_ttl_hours = horas
  }

  if (datos.claves !== undefined) {
    if (!Array.isArray(datos.claves) || datos.claves.length > 6) throw validacion('`claves` es una lista de hasta 6 claves.', 'claves')

    const previas = new Map(sistema.keys.map((k) => [k.kid, k]))

    sistema.keys = datos.claves.map((clave) => {
      const previa = previas.get(clave?.kid)

      if (previa !== undefined && clave.pem === undefined) {
        return { kid: previa.kid, since: clave.desde ?? previa.since, until: clave.hasta ?? previa.until }
      }

      if (typeof clave?.kid !== 'string' || typeof clave.pem !== 'string' || !/BEGIN PUBLIC KEY/.test(clave.pem)) {
        throw validacion('Cada clave lleva `kid` y `pem` de una clave pública EC P-256 (ES256).', 'claves')
      }

      return { kid: clave.kid, since: clave.desde ?? new Date().toISOString(), until: clave.hasta ?? null }
    })
  }

  sistema.updated_at = new Date().toISOString()
}

function webhookRuta (metodo, id, sub, datos) {
  const actual = WEBHOOKS.get(id)

  if (sub.length === 0 && metodo === 'GET') {
    if (actual === undefined) throw new ErrorApi(404, 'not_found', 'Esa integración no tiene webhook.')

    return { estado: 200, cuerpo: conDatos(actual) }
  }

  if (sub.length === 0 && metodo === 'PUT') {
    if (typeof datos.url !== 'string' || !datos.url.startsWith('https://')) throw validacion('La URL tiene que ser https.', 'url')

    const creado = actual === undefined
    const fila = { integration_id: id, url: datos.url, secret_start: 'ab12cd34', last_attempt_at: null, last_status: null, last_error: null, last_success_at: null, consecutive_failures: 0, enabled: false }

    WEBHOOKS.set(id, { ...(actual ?? fila), url: datos.url })

    return { estado: creado ? 201 : 200, cuerpo: conDatos(creado ? { ...WEBHOOKS.get(id), secret: 'f'.repeat(64) } : WEBHOOKS.get(id)) }
  }

  if (actual === undefined) throw new ErrorApi(404, 'not_found', 'Esa integración no tiene webhook.')

  if (sub.length === 0 && metodo === 'DELETE') {
    WEBHOOKS.delete(id)

    return { estado: 204, cuerpo: null }
  }

  if (sub[0] === 'secreto' && metodo === 'POST') return { estado: 201, cuerpo: conDatos({ ...actual, secret: 'e'.repeat(64) }) }

  if (sub[0] === 'prueba' && metodo === 'POST') {
    actual.last_attempt_at = new Date().toISOString()
    actual.last_status = 200

    return { estado: 200, cuerpo: conDatos(actual) }
  }

  throw new ErrorApi(404, 'not_found', 'Subrecurso desconocido.')
}

/**
 * `/accesos/integraciones/*`. El superadmin ya se comprobó en `accesosRuta`.
 *
 * @param {string} metodo
 * @param {string[]} resto segmentos después de `integraciones`
 * @param {() => Promise<object>} cuerpo
 */
export async function integracionesRuta (metodo, resto, cuerpo) {
  const [idTexto, sub, ...mas] = resto

  if (idTexto === undefined) {
    if (metodo === 'GET') return { estado: 200, cuerpo: conDatos([...INTEGRACIONES.values()].reverse()) }

    if (metodo === 'POST') {
      const datos = await cuerpo()

      if (typeof datos.nombre !== 'string' || datos.nombre.trim() === '') throw validacion('Hace falta el nombre.', 'nombre')

      const id = siguiente++
      const llave = llaveDe(id)
      const fila = { id, name: datos.nombre.trim(), scope: datos.alcance === 'mcp' ? 'mcp' : 'pantallas', key_start: llave.slice(0, 8), created_at: new Date().toISOString(), created_by: 1, key_issued_at: new Date().toISOString(), last_used_at: null }

      if (datos.alcance === 'mcp') {
        if (!PATRON_SLUG.test(String(datos.sistema ?? ''))) throw validacion('El identificador del sistema no sirve.', 'sistema')
        if ([...SISTEMAS.values()].some((s) => s.system === datos.sistema)) throw new ErrorApi(409, 'conflict', 'Ya existe un sistema con ese identificador.')

        SISTEMAS.set(id, { id, system: datos.sistema, keys: [], domains: [], events: [], proposal_ttl_hours: 72, updated_at: new Date().toISOString() })
      }

      INTEGRACIONES.set(id, fila)

      return { estado: 201, cuerpo: conDatos({ ...(SISTEMAS.get(id) ?? fila), id, key: llave }) }
    }

    throw new ErrorApi(404, 'not_found', 'Usa GET para listar y POST para crear.')
  }

  const id = Number(idTexto)

  if (!Number.isInteger(id)) throw new ErrorApi(404, 'not_found', 'Recurso desconocido.')

  if (sub === undefined) {
    if (metodo !== 'DELETE') throw new ErrorApi(404, 'not_found', 'Usa DELETE para revocarla.')

    INTEGRACIONES.delete(id)
    SISTEMAS.delete(id)
    WEBHOOKS.delete(id)

    return { estado: 204, cuerpo: null }
  }

  exigirIntegracion(id)

  if (sub === 'llave' && metodo === 'POST') {
    const llave = llaveDe(id + 50)

    Object.assign(INTEGRACIONES.get(id), { key_start: llave.slice(0, 8), key_issued_at: new Date().toISOString(), last_used_at: null })

    return { estado: 201, cuerpo: conDatos({ ...INTEGRACIONES.get(id), key: llave }) }
  }

  if (sub === 'webhook') return webhookRuta(metodo, id, mas, metodo === 'PUT' ? await cuerpo() : {})

  if (sub === 'mcp') {
    const sistema = exigirSistema(id)

    if (mas[0] === 'llamadas' && metodo === 'GET') {
      return {
        estado: 200,
        cuerpo: conDatos([
          { id: 3, staff_id: 1, method: 'tools/call', tool: 'crear_tarea', code: 'proposed', ms: 61, created_at: '2026-10-07T15:00:00Z' },
          { id: 2, staff_id: 1, method: 'tools/call', tool: 'mis_tareas', code: 'ok', ms: 38, created_at: '2026-10-07T14:58:00Z' },
          { id: 1, staff_id: null, method: 'initialize', tool: null, code: 'ok', ms: 4, created_at: '2026-10-07T14:57:00Z' }
        ])
      }
    }

    if (metodo === 'GET') return { estado: 200, cuerpo: conDatos(sistema) }

    if (metodo === 'PUT') {
      guardarSistema(sistema, await cuerpo())

      return { estado: 200, cuerpo: conDatos(sistema) }
    }
  }

  throw new ErrorApi(404, 'not_found', 'Subrecurso desconocido.')
}

/**
 * `GET /ia/propuestas` y la resolución por `POST /ia/acciones/{id}`.
 *
 * @returns la respuesta, o `null` si la ruta no es de este módulo
 */
export async function propuestasRuta (metodo, resto, parametros, cuerpo) {
  const [seccion, id] = resto

  if (seccion === 'propuestas' && metodo === 'GET') {
    const todas = parametros.get('estado') === 'todas'
    const ahora = Date.now()
    const filas = PROPUESTAS.filter((p) => todas || (p.state === 'pendiente' && Date.parse(p.expires_at) > ahora))

    return { estado: 200, cuerpo: conDatos(filas) }
  }

  if (seccion === 'acciones' && metodo === 'POST' && id !== undefined) {
    const propuesta = PROPUESTAS.find((p) => p.id === Number(id))

    if (propuesta === undefined) return null

    const { decision } = await cuerpo()

    if (propuesta.state !== 'pendiente') throw new ErrorApi(409, 'conflict', 'Esa acción ya se resolvió.')
    if (decision !== 'confirmar' && decision !== 'rechazar') throw validacion('La decisión tiene que ser "confirmar" o "rechazar".', 'decision')

    propuesta.state = decision === 'confirmar' ? 'ejecutada' : 'rechazada'
    propuesta.result = decision === 'confirmar' ? 'Hecho.' : null

    return {
      estado: 200,
      cuerpo: conDatos({
        id: propuesta.id, herramienta: propuesta.tool, resumen: propuesta.summary, detalle: propuesta.detail,
        supuestos: propuesta.assumptions, estado: propuesta.state, resultado: propuesta.result, expira_en: propuesta.expires_at
      })
    }
  }

  return null
}
