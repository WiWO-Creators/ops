/**
 * Mock del servidor MCP externo: integraciones, sistemas MCP, últimas llamadas y propuestas.
 *
 * Sirve lo que dice `docs/contrato-api.md` § «Servidor MCP externo». El estado vive en memoria, igual
 * que el resto del mock: así la pantalla de Integraciones y la bandeja de Propuestas se pueden usar
 * enteras sin backend (alta, llave visible una vez, claves, interruptores, confirmar y rechazar).
 */
import { ErrorApi } from './consulta.js'

const DOMINIOS = ['nucleo', 'espacios', 'personales', 'procesos', 'jornadas']
const EVENTOS = [
  'propuesta.aprobada', 'propuesta.rechazada', 'propuesta.fallida', 'propuesta.expirada', 'tarea.estado_cambiado', 'tarea.completada',
  'persona.acceso_revocado', 'persona.permisos_cambiados', 'espacio.acceso_perdido', 'espacio.archivado', 'espacio.eliminado',
  'tarea.inaccesible', 'sistema.catalogo_cambiado'
]
const DECISION_HERRAMIENTAS = ['comentar_tarea', 'cambiar_estado_de_tarea', 'registrar_horas']
const PROPOSITOS = ['mcp', 'decision']
const PATRON_SLUG = /^[a-z0-9][a-z0-9-]{1,30}$/
const PATRON_DOMINIO = /^(\*\.)?(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/

const RPM_MAXIMO = 100000
const TOPE_VIVAS_MAXIMO = 1000
const DOMINIOS_VINCULO_MAXIMO = 20
const CLAVES_MAXIMO = 6
const VIGENTES_MAXIMO = 2
/** Días antes del vencimiento desde los que una clave se marca `expiring` (`MCP_CLAVE_AVISO_DIAS`). */
const AVISO_DE_CLAVE_DIAS = 14
/** Minutos que la llave anterior de un sistema MCP sigue valiendo tras regenerarla (`MCP_LLAVE_GRACIA_MIN`). */
const GRACIA_DE_LLAVE_MIN = 15
/** Cuotas por defecto del entorno (`MCP_RPM_PERSONA`, `MCP_RPM_SISTEMA`, `MCP_TOPE_VIVAS`). */
const CUOTAS_POR_DEFECTO = { rpm_persona: 60, rpm_sistema: 300, tope_vivas: 25 }
const DIA_MS = 86400000

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
    origin: { system: 'metriq', name: 'Metriq' }, link: { external_id: 'm-9', url: 'https://metriq.wiwo.me/alertas/9' },
    args_hash: 'a3f1c9d27b6e4a08', url_ops: 'https://ops.wiwo.me/propuestas/9001', visible_to_client: true,
    provenance: { trusted: false, data: { alerta: 'Caída de inversión en octubre', fuente: 'Panel de campañas' } }
  },
  {
    id: 9002, tool: 'comentar_tarea', summary: 'Comentar en NES-013-123: «El informe quedó listo»',
    detail: ['Tarea: NES-013-123'], assumptions: [],
    state: 'pendiente', result: null, expires_at: '2099-10-09T12:00:00Z', created_at: '2026-10-07T10:00:00Z',
    origin: { system: 'wiwolab', name: 'WiwoLab' }, link: { external_id: 'l-4', url: 'javascript:alert(1)' },
    args_hash: '5be08d1f93c7a246', url_ops: 'https://ops.wiwo.me/propuestas/9002', visible_to_client: false,
    provenance: { trusted: false, data: { nota: '<b>Texto con marcas</b> que debe verse tal cual' } }
  },
  {
    id: 9003, tool: 'registrar_horas', summary: 'Registrar 2 h en «Campañas»',
    detail: [], assumptions: [],
    state: 'ejecutada', result: 'Horas registradas.', expires_at: '2026-10-05T12:00:00Z', created_at: '2026-10-04T12:00:00Z',
    origin: { system: 'metriq', name: 'Metriq' }, link: null,
    args_hash: null, url_ops: 'https://ops.wiwo.me/propuestas/9003', visible_to_client: false, provenance: null
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

function validacion (mensaje, campo, regla = 'invalid') {
  return new ErrorApi(422, 'validation_failed', mensaje, { [campo]: [regla] })
}

/** Lista blanca de un campo de texto-lista, como la de la API. */
function listaPermitida (valor, permitidos, campo) {
  if (!Array.isArray(valor) || valor.some((v) => typeof v !== 'string' || !permitidos.includes(v))) {
    throw validacion(`\`${campo}\` solo admite: ${permitidos.join(', ')}.`, campo)
  }

  return permitidos.filter((p) => valor.includes(p))
}

/** Una cuota por sistema: entero de 1 al techo, o `null` para volver al valor del entorno. */
function cuotaValida (valor, campo, maximo) {
  if (valor === null) return null

  if (!Number.isInteger(valor) || valor < 1 || valor > maximo) {
    throw validacion(`\`${campo}\` va de 1 a ${maximo}, o null para usar el valor del entorno.`, campo)
  }

  return valor
}

/** La lista blanca de dominios de `vinculo.url`: exactos o `*.dominio`, hasta veinte, en minúsculas y sin repetidos. */
function dominiosDeVinculoValidos (valor) {
  const limpia = Array.isArray(valor) ? valor.map((d) => typeof d === 'string' ? d.trim().toLowerCase() : d) : null

  if (limpia === null || limpia.length > DOMINIOS_VINCULO_MAXIMO || limpia.some((d) => typeof d !== 'string' || d.length > 253 || !PATRON_DOMINIO.test(d))) {
    throw validacion(`\`dominios_vinculo\` es una lista de hasta ${DOMINIOS_VINCULO_MAXIMO} dominios (\`metriq.example\` o \`*.metriq.example\`).`, 'dominios_vinculo')
  }

  return [...new Set(limpia)]
}

/** Reemplaza las claves: una con un `kid` ya registrado y sin `pem` conserva su clave y su propósito. */
function clavesValidas (sistema, claves) {
  if (!Array.isArray(claves) || claves.length > CLAVES_MAXIMO) throw validacion(`\`claves\` es una lista de hasta ${CLAVES_MAXIMO} claves.`, 'claves')

  const previas = new Map(sistema.keys.map((k) => [k.kid, k]))
  const vistos = new Set()

  const limpias = claves.map((clave) => {
    const previa = previas.get(clave?.kid)

    if (previa !== undefined && clave.proposito !== undefined && clave.proposito !== previa.proposito && (clave.pem === undefined || clave.pem.trim() === previa.pem.trim())) {
      throw validacion('Una clave registrada no cambia de propósito: registra una clave nueva con otro `kid`.', 'claves', 'proposito_inmutable')
    }

    if (previa !== undefined && clave.pem === undefined) {
      return { ...previa, since: clave.desde ?? previa.since, until: clave.hasta ?? previa.until }
    }

    if (typeof clave?.kid !== 'string' || typeof clave.pem !== 'string' || !/BEGIN PUBLIC KEY/.test(clave.pem)) {
      throw validacion('Cada clave lleva `kid` y `pem` de una clave pública EC P-256 (ES256).', 'claves')
    }

    const proposito = clave.proposito ?? 'mcp'

    if (!PROPOSITOS.includes(proposito)) throw validacion('El propósito de una clave es `mcp` o `decision`.', 'claves')

    return { kid: clave.kid, proposito, since: clave.desde ?? new Date().toISOString(), until: clave.hasta ?? null, pem: clave.pem.trim() }
  })

  const propositoPorPem = new Map()

  for (const clave of limpias) {
    if (propositoPorPem.has(clave.pem) && propositoPorPem.get(clave.pem) !== clave.proposito) {
      throw validacion('La misma clave no puede servir para llamadas MCP y para decisiones.', 'claves', 'clave_repetida_entre_propositos')
    }

    propositoPorPem.set(clave.pem, clave.proposito)
  }

  for (const clave of limpias) {
    if (vistos.has(clave.kid)) throw validacion('Hay dos claves con el mismo `kid`.', 'claves')

    vistos.add(clave.kid)
  }

  for (const proposito of PROPOSITOS) {
    const vigentes = limpias.filter((c) => c.proposito === proposito && (c.until === null || Date.parse(c.until) > Date.now()))

    if (vigentes.length > VIGENTES_MAXIMO) {
      throw validacion(`No puede haber más de ${VIGENTES_MAXIMO} claves vigentes a la vez para el mismo propósito.`, 'claves')
    }
  }

  return limpias
}

/**
 * Aplica el `PUT` parcial de un sistema.
 *
 * Todo se valida antes de tocar nada: un `422` no deja el sistema a medio guardar.
 */
function guardarSistema (sistema, datos) {
  const cambios = {}

  if (datos.dominios !== undefined) cambios.domains = listaPermitida(datos.dominios, DOMINIOS, 'dominios')
  if (datos.eventos !== undefined) cambios.events = listaPermitida(datos.eventos, EVENTOS, 'eventos')
  if (datos.decision_herramientas !== undefined) cambios.decision_tools = listaPermitida(datos.decision_herramientas, DECISION_HERRAMIENTAS, 'decision_herramientas')
  if (datos.dominios_vinculo !== undefined) cambios.link_domains = dominiosDeVinculoValidos(datos.dominios_vinculo)

  if (datos.ttl_propuesta_horas !== undefined) {
    const horas = datos.ttl_propuesta_horas

    if (!Number.isInteger(horas) || horas < 1 || horas > 720) throw validacion('`ttl_propuesta_horas` va de 1 a 720.', 'ttl_propuesta_horas')

    cambios.proposal_ttl_hours = horas
  }

  for (const [campo, maximo] of [['rpm_persona', RPM_MAXIMO], ['rpm_sistema', RPM_MAXIMO], ['tope_vivas', TOPE_VIVAS_MAXIMO]]) {
    if (datos[campo] !== undefined) cambios[campo] = cuotaValida(datos[campo], campo, maximo)
  }

  if (datos.claves !== undefined) cambios.keys = clavesValidas(sistema, datos.claves)

  Object.assign(sistema, cambios, { updated_at: new Date().toISOString() })
}

/** Cómo está una clave según sus fechas, como `SistemasMcp::estadoDeClave`. */
function estadoDeClave (clave, ahora) {
  if (Date.parse(clave.since) > ahora) return 'scheduled'
  if (clave.until === null) return 'active'

  const hasta = Date.parse(clave.until)

  if (hasta <= ahora) return 'expired'

  return hasta - ahora <= AVISO_DE_CLAVE_DIAS * DIA_MS ? 'expiring' : 'active'
}

/** La forma que ve el panel: de cada clave su estado y huella, nunca el PEM. */
function presentarSistema (sistema) {
  const ahora = Date.now()

  const keys = sistema.keys.map((c) => {
    const hasta = c.until === null ? null : Date.parse(c.until)

    return {
      kid: c.kid,
      purpose: c.proposito,
      since: c.since,
      until: c.until,
      status: estadoDeClave(c, ahora),
      expires_in_days: hasta === null || hasta <= ahora ? null : Math.ceil((hasta - ahora) / DIA_MS),
      fingerprint: c.pem === undefined ? '' : `sha256:${Buffer.from(c.pem).toString('hex').slice(-16)}`
    }
  })

  const configurada = (v) => v ?? null

  return {
    id: sistema.id,
    system: sistema.system,
    keys,
    active_keys: keys.filter((k) => k.status === 'active' || k.status === 'expiring').length,
    keys_expiring_soon: keys.some((k) => k.status === 'expiring'),
    domains: sistema.domains,
    events: sistema.events,
    proposal_ttl_hours: sistema.proposal_ttl_hours,
    link_domains: sistema.link_domains,
    decision_tools: sistema.decision_tools,
    limits: {
      rpm_person: configurada(sistema.rpm_persona),
      rpm_system: configurada(sistema.rpm_sistema),
      max_pending: configurada(sistema.tope_vivas),
      effective: {
        rpm_person: sistema.rpm_persona ?? CUOTAS_POR_DEFECTO.rpm_persona,
        rpm_system: sistema.rpm_sistema ?? CUOTAS_POR_DEFECTO.rpm_sistema,
        max_pending: sistema.tope_vivas ?? CUOTAS_POR_DEFECTO.tope_vivas
      }
    },
    updated_at: sistema.updated_at
  }
}

/**
 * Lee `sin_gracia` del cuerpo (opcional) de regenerar una llave. Tiene que ser un booleano.
 *
 * @param {() => Promise<object>} cuerpo
 * @returns {Promise<boolean>} `true` si la anterior debe morir al instante
 */
async function sinGraciaDe (cuerpo) {
  const datos = await cuerpo()

  if (datos.sin_gracia === undefined) return false
  if (typeof datos.sin_gracia !== 'boolean') throw validacion('`sin_gracia` es verdadero o falso.', 'sin_gracia', 'boolean')

  return datos.sin_gracia
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

        SISTEMAS.set(id, {
          id, system: datos.sistema, keys: [], domains: [], events: [], proposal_ttl_hours: 72, link_domains: [], decision_tools: [],
          rpm_persona: null, rpm_sistema: null, tope_vivas: null, updated_at: new Date().toISOString()
        })
      }

      INTEGRACIONES.set(id, fila)

      return { estado: 201, cuerpo: conDatos({ ...(SISTEMAS.has(id) ? presentarSistema(SISTEMAS.get(id)) : fila), id, key: llave }) }
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
    const sinGracia = await sinGraciaDe(cuerpo)
    const llave = llaveDe(id + 50)

    Object.assign(INTEGRACIONES.get(id), { key_start: llave.slice(0, 8), key_issued_at: new Date().toISOString(), last_used_at: null })

    const vigenteHasta = SISTEMAS.has(id) && !sinGracia ? new Date(Date.now() + GRACIA_DE_LLAVE_MIN * 60000).toISOString() : null

    return { estado: 201, cuerpo: conDatos({ ...INTEGRACIONES.get(id), key: llave, previous_key_valid_until: vigenteHasta }) }
  }

  if (sub === 'webhook') return webhookRuta(metodo, id, mas, metodo === 'PUT' ? await cuerpo() : {})

  if (sub === 'mcp') {
    const sistema = exigirSistema(id)

    if (mas[0] === 'llamadas' && metodo === 'GET') {
      return {
        estado: 200,
        cuerpo: conDatos([
          { id: 6, staff_id: 1, method: 'decision', tool: 'comentar_tarea', code: 'ok', reason: 'confirmar', request_id: 'req-7f3a', sid: 'ses-21', ms: 120, created_at: '2026-10-07T15:04:00Z' },
          { id: 5, staff_id: 1, method: 'rechazo', tool: null, code: '429', reason: 'cuota_persona', request_id: 'req-7f39', sid: null, ms: 2, created_at: '2026-10-07T15:03:00Z' },
          { id: 7, staff_id: null, method: 'rechazo', tool: null, code: '401', reason: 'proposito_equivocado', request_id: 'req-7f3b', sid: null, ms: 2, created_at: '2026-10-07T15:05:00Z' },
          { id: 4, staff_id: null, method: 'rechazo', tool: null, code: '401', reason: 'firma_invalida', request_id: null, sid: null, ms: 3, created_at: '2026-10-07T15:02:00Z' },
          { id: 3, staff_id: 1, method: 'tools/call', tool: 'crear_tarea', code: 'proposed', reason: null, request_id: 'req-7f30', sid: 'ses-21', ms: 61, created_at: '2026-10-07T15:00:00Z' },
          { id: 2, staff_id: 1, method: 'tools/call', tool: 'mis_tareas', code: 'ok', reason: null, request_id: 'req-7f2e', sid: 'ses-21', ms: 38, created_at: '2026-10-07T14:58:00Z' },
          { id: 1, staff_id: null, method: 'initialize', tool: null, code: 'ok', reason: null, request_id: null, sid: null, ms: 4, created_at: '2026-10-07T14:57:00Z' }
        ])
      }
    }

    if (metodo === 'GET') return { estado: 200, cuerpo: conDatos(presentarSistema(sistema)) }

    if (metodo === 'PUT') {
      guardarSistema(sistema, await cuerpo())

      return { estado: 200, cuerpo: conDatos(presentarSistema(sistema)) }
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
