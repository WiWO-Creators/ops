/**
 * Reglas del servidor MCP externo que viven en el navegador: qué dominios y eventos existen, cómo se
 * valida lo que se escribe antes de mandarlo y cómo se lee lo que vuelve.
 *
 * La API vuelve a validar todo; esto existe para que el error salga junto al campo y no después de
 * guardar. Las listas de dominios y eventos son las mismas que `SistemasMcp::DOMINIOS` y `::EVENTOS`
 * del board: si una cambia allá, cambia acá.
 */
import type { ClaveJwtDeSistema, LlamadaMcp, SistemaMcp } from '../datos/accesos.ts'

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
  { clave: 'tarea.completada', nombre: 'Una tarea vinculada se completó' }
]

/** Duración de una propuesta externa: de una hora a treinta días. */
export const TTL_PROPUESTA_MINIMO_HORAS = 1
export const TTL_PROPUESTA_MAXIMO_HORAS = 720

const PATRON_SLUG = /^[a-z0-9][a-z0-9-]{1,30}$/
const PATRON_KID = /^[A-Za-z0-9._-]{1,64}$/

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

/**
 * Lee un sistema MCP del sobre, tolerando campos ausentes mientras el backend llega.
 *
 * @param valor el `data` de la respuesta
 * @returns el sistema, o `null` si no trae ni siquiera su identificador
 */
export function leerSistemaMcp (valor: unknown): SistemaMcp | null {
  if (!esObjeto(valor) || typeof valor.id !== 'number' || typeof valor.system !== 'string') return null

  const claves: ClaveJwtDeSistema[] = (Array.isArray(valor.keys) ? valor.keys : [])
    .filter(esObjeto)
    .filter((c) => typeof c.kid === 'string')
    .map((c) => ({ kid: String(c.kid), since: textoOpcional(c.since), until: textoOpcional(c.until) }))

  return {
    id: valor.id,
    system: valor.system,
    keys: claves,
    domains: listaDeTextos(valor.domains),
    events: listaDeTextos(valor.events),
    proposal_ttl_hours: typeof valor.proposal_ttl_hours === 'number' ? valor.proposal_ttl_hours : 72,
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
    ms: typeof f.ms === 'number' ? f.ms : 0,
    created_at: textoOpcional(f.created_at)
  }))
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
