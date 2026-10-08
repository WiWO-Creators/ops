/**
 * Reglas del servidor MCP externo que viven en el navegador: qué dominios y eventos existen, cómo se
 * valida lo que se escribe antes de mandarlo y cómo se lee lo que vuelve.
 *
 * La API vuelve a validar todo; esto existe para que el error salga junto al campo y no después de
 * guardar. Las listas de dominios y eventos son las mismas que `SistemasMcp::DOMINIOS` y `::EVENTOS`
 * del board: si una cambia allá, cambia acá.
 */
import { LOCALE } from '../lib/fechas.ts'
import type { ClaveJwtDeSistema, CuotasDeSistema, EstadoDeClave, LlamadaMcp, PropositoDeClave, SistemaMcp } from '../datos/accesos.ts'

/** Los dominios de herramientas que un sistema puede tener encendidos, con su explicación. */
export const DOMINIOS_MCP: ReadonlyArray<{ clave: string, nombre: string, descripcion: string }> = [
  { clave: 'nucleo', nombre: 'Búsqueda', descripcion: 'Buscar tareas, proyectos y personas.' },
  { clave: 'espacios', nombre: 'Lectura de proyectos', descripcion: 'Resumen, tareas, detalle y horas de un proyecto.' },
  { clave: 'personales', nombre: 'Datos de la persona', descripcion: 'Sus tareas, sus horas, comentarios y propuestas.' },
  { clave: 'procesos', nombre: 'Tareas (propuestas)', descripcion: 'Crear, comentar y cambiar el estado de una tarea. Siempre como propuesta.' },
  { clave: 'jornadas', nombre: 'Horas (propuestas)', descripcion: 'Registrar horas propias. Siempre como propuesta.' }
]

/** Los eventos a los que un sistema se puede suscribir, con cómo se leen. */
export const EVENTOS_MCP: ReadonlyArray<{ clave: string, nombre: string }> = [
  { clave: 'propuesta.aprobada', nombre: 'Una propuesta se aprobó' },
  { clave: 'propuesta.rechazada', nombre: 'Una propuesta se rechazó' },
  { clave: 'propuesta.fallida', nombre: 'Una propuesta aprobada no se pudo ejecutar' },
  { clave: 'propuesta.expirada', nombre: 'Una propuesta venció sin respuesta' },
  { clave: 'tarea.estado_cambiado', nombre: 'Una tarea vinculada cambió de estado' },
  { clave: 'tarea.completada', nombre: 'Una tarea vinculada se completó' },
  { clave: 'persona.acceso_revocado', nombre: 'Una persona perdió el acceso al sistema' },
  { clave: 'persona.permisos_cambiados', nombre: 'Cambiaron los permisos de una persona' },
  { clave: 'espacio.acceso_perdido', nombre: 'Una persona perdió el acceso a un proyecto' },
  { clave: 'espacio.archivado', nombre: 'Un proyecto se archivó' },
  { clave: 'espacio.eliminado', nombre: 'Un proyecto se eliminó' },
  { clave: 'tarea.inaccesible', nombre: 'Una tarea dejó de ser accesible' },
  { clave: 'sistema.catalogo_cambiado', nombre: 'Cambiaron las herramientas disponibles para el sistema' }
]

/**
 * Las herramientas que un sistema puede aprobar de forma remota. Son las de bajo riesgo: el techo lo
 * pone el código del board (`SistemasMcp::DECISION_HERRAMIENTAS`), no la configuración.
 */
export const DECISION_HERRAMIENTAS_MCP: ReadonlyArray<{ clave: string, nombre: string, descripcion: string }> = [
  { clave: 'comentar_tarea', nombre: 'Comentar una tarea', descripcion: 'Aprobar comentarios que el sistema propuso.' },
  { clave: 'cambiar_estado_de_tarea', nombre: 'Cambiar el estado de una tarea', descripcion: 'Aprobar cambios de estado que el sistema propuso.' },
  { clave: 'registrar_horas', nombre: 'Registrar horas', descripcion: 'Aprobar horas que el sistema propuso.' }
]

/** Para qué se usa cada clave pública. */
export const PROPOSITOS_CLAVE: ReadonlyArray<{ valor: PropositoDeClave, etiqueta: string, descripcion: string }> = [
  { valor: 'mcp', etiqueta: 'Llamadas', descripcion: 'Verifica quién llama al servidor MCP.' },
  { valor: 'decision', etiqueta: 'Decisión remota', descripcion: 'Verifica las aprobaciones hechas desde otro sistema.' }
]

/** Duración de una propuesta externa: de una hora a treinta días. */
export const TTL_PROPUESTA_MINIMO_HORAS = 1
export const TTL_PROPUESTA_MAXIMO_HORAS = 720

/** Techos de las cuotas por sistema, los mismos que valida la API (`SistemasMcp::RPM_MAXIMO` y `::TOPE_VIVAS_MAXIMO`). */
export const RPM_MAXIMO = 100000
export const TOPE_VIVAS_MAXIMO = 1000

/** Cuántos dominios admite la lista de vínculos y cuántas claves y vigentes por propósito el sistema. */
export const DOMINIOS_VINCULO_MAXIMO = 20
export const CLAVES_MAXIMO = 6
export const CLAVES_VIGENTES_MAXIMO = 2

const PATRON_SLUG = /^[a-z0-9][a-z0-9-]{1,30}$/
const PATRON_KID = /^[A-Za-z0-9._-]{1,64}$/
const PATRON_DOMINIO = /^(\*\.)?(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/
const ESTADOS_DE_CLAVE: readonly EstadoDeClave[] = ['active', 'expiring', 'expired', 'scheduled']

/**
 * Por qué un identificador de sistema no sirve, o `null` si sirve.
 *
 * @param slug lo escrito
 */
export function motivoDeSlugInvalido (slug: string): string | null {
  return PATRON_SLUG.test(slug)
    ? null
    : 'Usa minúsculas, números y guiones (de 2 a 31 caracteres), por ejemplo «metriq».'
}

/**
 * Por qué una clave pública no sirve, o `null` si sirve.
 *
 * Solo revisa la forma —encabezado PEM de clave pública y un `kid` razonable—: que sea una curva
 * P-256 lo comprueba la API, que es quien puede abrir la clave. Una clave privada se rechaza acá
 * por nombre: pegarla por error es el descuido que más importa atajar.
 *
 * @param kid identificador de la clave
 * @param pem la clave pública en PEM
 */
export function motivoDeClaveInvalida (kid: string, pem: string): string | null {
  if (!PATRON_KID.test(kid.trim())) return 'El identificador (kid) usa letras, números, punto, guion y guion bajo.'
  if (/PRIVATE KEY/.test(pem)) return 'Esa es una clave privada. Pega solo la clave pública y guarda la privada en el otro sistema.'
  if (!/-----BEGIN PUBLIC KEY-----[\s\S]+-----END PUBLIC KEY-----/.test(pem)) return 'Pega la clave pública completa, con sus líneas BEGIN y END PUBLIC KEY.'

  return null
}

/**
 * Por qué una duración de propuestas no sirve, o `null` si sirve.
 *
 * @param horas lo escrito, ya como número
 */
export function motivoDeTtlInvalido (horas: number): string | null {
  return Number.isInteger(horas) && horas >= TTL_PROPUESTA_MINIMO_HORAS && horas <= TTL_PROPUESTA_MAXIMO_HORAS
    ? null
    : `Va de ${TTL_PROPUESTA_MINIMO_HORAS} a ${TTL_PROPUESTA_MAXIMO_HORAS} horas.`
}

/** `true` si el valor es un objeto JSON plano. */
function esObjeto (valor: unknown): valor is Record<string, unknown> {
  return typeof valor === 'object' && valor !== null && !Array.isArray(valor)
}

function textoOpcional (valor: unknown): string | null {
  return typeof valor === 'string' && valor !== '' ? valor : null
}

function listaDeTextos (valor: unknown): string[] {
  return Array.isArray(valor) ? valor.filter((v): v is string => typeof v === 'string') : []
}

/** Un entero no negativo, o `null` si el valor no lo es. */
function enteroOpcional (valor: unknown): number | null {
  return typeof valor === 'number' && Number.isInteger(valor) && valor >= 0 ? valor : null
}

/**
 * Lee una clave del sobre. Una clave sin `purpose` es de llamadas y sin `status` se tiene por vigente:
 * así un backend anterior al cambio sigue pintándose.
 */
function leerClave (valor: Record<string, unknown>): ClaveJwtDeSistema {
  return {
    kid: String(valor.kid),
    purpose: valor.purpose === 'decision' ? 'decision' : 'mcp',
    since: textoOpcional(valor.since),
    until: textoOpcional(valor.until),
    status: ESTADOS_DE_CLAVE.find((e) => e === valor.status) ?? 'active',
    expires_in_days: enteroOpcional(valor.expires_in_days),
    fingerprint: typeof valor.fingerprint === 'string' ? valor.fingerprint : ''
  }
}

/** Lee las cuotas; lo que falta queda en `null` (= valor por defecto). */
function leerCuotas (valor: unknown): CuotasDeSistema {
  const limites = esObjeto(valor) ? valor : {}
  const efectivos = esObjeto(limites.effective) ? limites.effective : {}

  return {
    rpm_person: enteroOpcional(limites.rpm_person),
    rpm_system: enteroOpcional(limites.rpm_system),
    max_pending: enteroOpcional(limites.max_pending),
    effective: {
      rpm_person: enteroOpcional(efectivos.rpm_person),
      rpm_system: enteroOpcional(efectivos.rpm_system),
      max_pending: enteroOpcional(efectivos.max_pending)
    }
  }
}

/**
 * Lee un sistema MCP del sobre, tolerando campos ausentes mientras el backend llega.
 *
 * @param valor el `data` de la respuesta
 * @returns el sistema, o `null` si no trae ni siquiera su identificador
 */
export function leerSistemaMcp (valor: unknown): SistemaMcp | null {
  if (!esObjeto(valor) || typeof valor.id !== 'number' || typeof valor.system !== 'string') return null

  const claves = (Array.isArray(valor.keys) ? valor.keys : [])
    .filter(esObjeto)
    .filter((c) => typeof c.kid === 'string')
    .map(leerClave)

  return {
    id: valor.id,
    system: valor.system,
    keys: claves,
    active_keys: enteroOpcional(valor.active_keys) ?? claves.filter(estaVigente).length,
    keys_expiring_soon: typeof valor.keys_expiring_soon === 'boolean' ? valor.keys_expiring_soon : claves.some((c) => c.status === 'expiring'),
    domains: listaDeTextos(valor.domains),
    events: listaDeTextos(valor.events),
    proposal_ttl_hours: typeof valor.proposal_ttl_hours === 'number' ? valor.proposal_ttl_hours : 72,
    link_domains: listaDeTextos(valor.link_domains),
    decision_tools: listaDeTextos(valor.decision_tools),
    limits: leerCuotas(valor.limits),
    updated_at: textoOpcional(valor.updated_at)
  }
}

/**
 * Lee las últimas llamadas, descartando las filas sin forma.
 *
 * @param valor el `data` de la respuesta
 */
export function leerLlamadas (valor: unknown): LlamadaMcp[] {
  if (!Array.isArray(valor)) return []

  return valor.filter(esObjeto).filter((f) => typeof f.id === 'number').map((f) => ({
    id: Number(f.id),
    staff_id: typeof f.staff_id === 'number' ? f.staff_id : null,
    method: typeof f.method === 'string' ? f.method : '',
    tool: textoOpcional(f.tool),
    code: typeof f.code === 'string' ? f.code : '',
    reason: textoOpcional(f.reason),
    request_id: textoOpcional(f.request_id),
    sid: textoOpcional(f.sid),
    ms: typeof f.ms === 'number' ? f.ms : 0,
    created_at: textoOpcional(f.created_at)
  }))
}

/**
 * Lee `previous_key_valid_until` de la respuesta de regenerar una llave.
 *
 * @param valor el `data` de la respuesta
 * @returns el instante hasta el que la llave anterior sigue sirviendo, o `null` si dejó de servir ya
 */
export function leerLlaveAnteriorVigenteHasta (valor: unknown): string | null {
  return esObjeto(valor) ? textoOpcional(valor.previous_key_valid_until) : null
}

/** `true` si la clave verifica hoy o va a verificar (no venció). */
function estaVigente (clave: Pick<ClaveJwtDeSistema, 'status'>): boolean {
  return clave.status === 'active' || clave.status === 'expiring'
}

/**
 * Por qué una cuota escrita no sirve, o `null` si sirve. Vacía vale: significa «usa el valor por defecto».
 *
 * @param texto lo escrito en el campo
 * @param maximo el techo que acepta la API
 */
export function motivoDeCuotaInvalida (texto: string, maximo: number): string | null {
  const limpio = texto.trim()

  if (limpio === '') return null
  if (!/^\d+$/.test(limpio)) return 'Escribe un número entero, o déjalo vacío para usar el valor por defecto.'

  const valor = Number(limpio)

  return valor >= 1 && valor <= maximo ? null : `Va de 1 a ${maximo.toLocaleString(LOCALE)}.`
}

/**
 * La cuota que se manda a la API: el entero escrito, o `null` si el campo está vacío.
 *
 * @param texto lo escrito, ya validado con `motivoDeCuotaInvalida`
 */
export function cuotaDeTexto (texto: string): number | null {
  const limpio = texto.trim()

  return limpio === '' ? null : Number(limpio)
}

/**
 * Parte lo escrito en un dominio por entrada: separa por saltos de línea, espacios, comas o punto y coma,
 * pasa a minúsculas y quita repetidos.
 *
 * @param texto lo escrito en el campo
 */
export function dominiosDeTexto (texto: string): string[] {
  const dominios = texto.toLowerCase().split(/[\s,;]+/).filter((d) => d !== '')

  return [...new Set(dominios)]
}

/**
 * Por qué la lista de dominios de vínculo no sirve, o `null` si sirve.
 *
 * Cada entrada es un dominio con al menos dos etiquetas («metriq.example») o un comodín de subdominios
 * («*.metriq.example»). Una dirección IP, un esquema o una ruta no valen: la API las rechazaría igual.
 *
 * @param dominios la lista ya partida con `dominiosDeTexto`
 */
export function motivoDeDominiosInvalidos (dominios: readonly string[]): string | null {
  if (dominios.length > DOMINIOS_VINCULO_MAXIMO) return `Admite hasta ${DOMINIOS_VINCULO_MAXIMO} dominios.`

  const malo = dominios.find((d) => d.length > 253 || !PATRON_DOMINIO.test(d))

  return malo === undefined
    ? null
    : `«${malo}» no sirve. Usa «dominio.com» o «*.dominio.com», sin https:// ni rutas.`
}

/**
 * Por qué una lista de herramientas de decisión no sirve, o `null` si sirve. Solo existen las del catálogo.
 *
 * @param herramientas lo que se va a guardar
 */
export function motivoDeDecisionInvalida (herramientas: readonly string[]): string | null {
  const fuera = herramientas.find((h) => !DECISION_HERRAMIENTAS_MCP.some((d) => d.clave === h))

  return fuera === undefined ? null : `«${fuera}» no se puede aprobar de forma remota.`
}

/** Cómo está la aprobación remota de un sistema. */
export type EstadoDeDecisionRemota = 'desactivada' | 'sin_clave' | 'activa'

/**
 * Si el sistema puede aprobar desde fuera: sin herramientas la ruta está desactivada, y con herramientas
 * pero sin una clave de decisión vigente tampoco puede firmar nada.
 *
 * @param sistema el sistema leído
 */
export function estadoDeDecisionRemota (sistema: Pick<SistemaMcp, 'decision_tools' | 'keys'>): EstadoDeDecisionRemota {
  if (sistema.decision_tools.length === 0) return 'desactivada'

  return sistema.keys.some((c) => c.purpose === 'decision' && estaVigente(c)) ? 'activa' : 'sin_clave'
}

/** Una clave tal como viaja en `PUT claves`: sin `pem` conserva la registrada bajo ese `kid`. */
export interface ClaveParaGuardar {
  kid: string
  proposito: PropositoDeClave
  desde: string | null
  hasta: string | null
  pem?: string
}

/**
 * La lista completa de claves para `PUT claves`, que reemplaza la lista entera.
 *
 * Lo que ya estaba viaja sin `pem`. Si hay `nueva`, se agrega comprobando antes lo que la API rechazaría
 * (`kid` repetido, más de dos vigentes del mismo propósito, más de seis claves). Las vencidas no hacen
 * falta para verificar nada: solo se descartan cuando estorban para llegar al tope.
 *
 * @param existentes las claves que devolvió el `GET`
 * @param nueva la clave que se quiere registrar, si se registra una
 * @returns la lista a mandar, o el motivo por el que no se puede
 */
export function armarClaves (
  existentes: readonly ClaveJwtDeSistema[],
  nueva?: { kid: string, pem: string, proposito: PropositoDeClave }
): { claves: ClaveParaGuardar[] } | { motivo: string } {
  const conservadas = existentes.map((c): ClaveParaGuardar => ({ kid: c.kid, proposito: c.purpose, desde: c.since, hasta: c.until }))

  if (nueva === undefined) return { claves: conservadas }

  const kid = nueva.kid.trim()

  if (existentes.some((c) => c.kid === kid)) return { motivo: 'Ya hay una clave con ese identificador.' }

  const vigentes = existentes.filter((c) => c.purpose === nueva.proposito && c.status !== 'expired').length

  if (vigentes >= CLAVES_VIGENTES_MAXIMO) {
    return { motivo: `Ya hay ${CLAVES_VIGENTES_MAXIMO} claves vigentes para este propósito. Retira una antes de registrar otra.` }
  }

  const agregada: ClaveParaGuardar = { kid, proposito: nueva.proposito, desde: null, hasta: null, pem: nueva.pem.trim() }
  const todas = [...conservadas, agregada]

  if (todas.length <= CLAVES_MAXIMO) return { claves: todas }

  const sinVencidas = todas.filter((c) => !existentes.some((e) => e.kid === c.kid && e.status === 'expired'))

  return sinVencidas.length <= CLAVES_MAXIMO
    ? { claves: sinVencidas }
    : { motivo: `El sistema admite hasta ${CLAVES_MAXIMO} claves. Retira alguna antes de registrar otra.` }
}

/** Los 422 de `PUT claves` que tienen una explicación propia, por el código que viaja en `details.claves`. */
const MENSAJES_DE_CLAVES: Readonly<Record<string, string>> = {
  proposito_inmutable: 'Una clave registrada no cambia de propósito. Registra una clave nueva, con otro identificador, para el otro propósito.',
  clave_repetida_entre_propositos: 'La misma clave no puede servir a la vez para llamadas y para decisiones remotas. Genera un par de claves distinto para cada propósito.',
  max_active: 'No puede haber más de dos claves vigentes para el mismo propósito. Retira una antes.',
  unique: 'Hay dos claves con el mismo identificador.'
}

/**
 * El mensaje, en español claro, de un rechazo al guardar claves; si la API no dio un código conocido,
 * el mensaje que trajo.
 *
 * @param detalles el `details` del error, donde la API pone los códigos por campo (`{ claves: ['proposito_inmutable'] }`)
 * @param codigo el `code` del error, por si el código viaja ahí
 * @param mensaje lo que dijo la API, para cuando no hay nada mejor
 */
export function mensajeDeErrorDeClaves (detalles: Record<string, unknown> | undefined, codigo: string | undefined, mensaje: string): string {
  const reglas = detalles?.claves
  const candidatos = [...(Array.isArray(reglas) ? reglas : []), codigo]
  const conocido = candidatos.find((c): c is string => typeof c === 'string' && Object.hasOwn(MENSAJES_DE_CLAVES, c))

  return (conocido === undefined ? undefined : MENSAJES_DE_CLAVES[conocido]) ?? mensaje
}

/**
 * El cuerpo opcional de `POST …/llave`: con `sin_gracia` la llave anterior deja de servir al instante;
 * sin cuerpo rige el periodo de gracia del servidor.
 *
 * @param invalidarLaAnterior `true` si la persona pidió cortar la anterior ya
 */
export function cuerpoDeRegenerarLlave (invalidarLaAnterior: boolean): { sin_gracia: true } | undefined {
  return invalidarLaAnterior ? { sin_gracia: true } : undefined
}

/**
 * Cómo se dice el estado de una clave, con el tono de su insignia.
 *
 * @param clave la clave leída
 */
export function describirEstadoDeClave (clave: Pick<ClaveJwtDeSistema, 'status' | 'expires_in_days'>): { texto: string, tono: 'exito' | 'aviso' | 'neutro' | 'acento' } {
  switch (clave.status) {
    case 'active': return { texto: 'Vigente', tono: 'exito' }
    case 'expiring': {
      const dias = clave.expires_in_days

      return { texto: dias === null ? 'Vence pronto' : dias === 1 ? 'Vence en 1 día' : `Vence en ${dias} días`, tono: 'aviso' }
    }
    case 'scheduled': return { texto: 'Aún no rige', tono: 'acento' }
    case 'expired': return { texto: 'Vencida', tono: 'neutro' }
  }
}

/** Cómo se lee el método de una llamada; los desconocidos se muestran tal cual. */
const ETIQUETAS_DE_METODO: Readonly<Record<string, string>> = {
  rechazo: 'Rechazo',
  decision: 'Decisión remota',
  'tools/call': 'Herramienta',
  'tools/list': 'Catálogo',
  initialize: 'Inicio'
}

/**
 * El nombre legible del método de una llamada.
 *
 * @param metodo `method` de la fila
 */
export function etiquetaDeMetodo (metodo: string): string {
  return ETIQUETAS_DE_METODO[metodo] ?? (metodo === '' ? '—' : metodo)
}

/** Los filtros de método de las llamadas: `todas` o un método concreto. */
export const FILTROS_DE_METODO: ReadonlyArray<{ valor: string, etiqueta: string }> = [
  { valor: 'todas', etiqueta: 'Todas' },
  { valor: 'rechazo', etiqueta: 'Rechazos' },
  { valor: 'decision', etiqueta: 'Decisiones' },
  { valor: 'tools/call', etiqueta: 'Herramientas' }
]

/**
 * Filtra las llamadas por método y por un texto que busca en herramienta, motivo, `request_id` y `sid`.
 *
 * @param llamadas todas las filas
 * @param metodo `todas` o el método a mostrar
 * @param busqueda texto libre; vacío no filtra
 */
export function filtrarLlamadas (llamadas: readonly LlamadaMcp[], metodo: string, busqueda: string): LlamadaMcp[] {
  const aguja = busqueda.trim().toLowerCase()

  return llamadas.filter((l) => {
    if (metodo !== 'todas' && l.method !== metodo) return false
    if (aguja === '') return true

    return [l.tool, l.reason, l.request_id, l.sid].some((campo) => campo !== null && campo.toLowerCase().includes(aguja))
  })
}

/**
 * Alterna un valor dentro de una lista conservando el orden del catálogo.
 *
 * @param actuales lo que está encendido
 * @param clave lo que se alterna
 * @param catalogo el orden canónico
 */
export function alternarEnLista (actuales: readonly string[], clave: string, catalogo: ReadonlyArray<{ clave: string }>): string[] {
  const conjunto = new Set(actuales)

  if (conjunto.has(clave)) conjunto.delete(clave)
  else conjunto.add(clave)

  return catalogo.map((c) => c.clave).filter((c) => conjunto.has(c))
}
