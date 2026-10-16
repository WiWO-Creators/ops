/**
 * Acceso con Google al portal de clientes en el mock: `GET|POST /auth/portal/google`,
 * `GET|PUT /clients/{id}/portal-google`, el interruptor global `wiwo_portal_google_enabled` y el
 * bloqueo `google_required` del login con contraseña.
 *
 * Vive aparte de `servidor.js` por lo mismo que `tareas-del-portal.js`: es un bloque con estado y
 * reglas propias, y el servidor solo lo cablea. Replica del contrato (`docs/contrato-api.md`):
 *
 *   - **Dos interruptores.** El global (`wiwo_portal_google_enabled`, nace apagado) y el del cliente
 *     (tener su configuracion). Con el global apagado todo es como antes: `GET` dice
 *     `enabled: false`, `POST` es 404 y `exigir_google` no bloquea nada.
 *   - **Resolucion de dominios**: gana el exacto; si no, el padre mas cercano con comodin.
 *   - **Conflictos entre clientes**: 409 ante cualquier solapamiento, comodines incluidos.
 *   - **Sin comodin sobre sufijos publicos**, y sin correos gratuitos nunca: 422.
 *   - **Token en tres pasos**: se lee el email sin confiar en el para elegir un cliente candidato, se
 *     verifica `aud` y `hd` contra ESE cliente y se resuelve otra vez con el email ya verificado.
 *
 * El mock no verifica firmas: la credencial es un JWT cualquiera (se lee su payload) o el atajo
 * `mock:correo@dominio` que usan las pruebas. Lo que importa aca es la logica de dominios y de cliente.
 */

import { ErrorApi } from './consulta.js'
import { CLIENTES, CONTACTOS } from './datos.js'

/** Tope de dominios por cliente (`ClienteGooglePortal::MAX_DOMINIOS`). */
export const MAX_DOMINIOS = 20

/** Sufijos publicos sobre los que no se permite comodin. En la API real vive en una opcion editable. */
const SUFIJOS_PUBLICOS = new Set([
  'cl', 'com', 'net', 'org', 'com.cl', 'gob.cl', 'co.uk', 'com.ar', 'com.mx', 'edu.cl', 'org.cl'
])

/** Correo gratuito: nunca puede registrarse, con o sin comodin. */
const CORREO_GRATUITO = new Set([
  'gmail.com', 'googlemail.com', 'outlook.com', 'hotmail.com', 'live.com', 'yahoo.com', 'icloud.com', 'protonmail.com'
])

const PATRON_CLIENT_ID = /^[A-Za-z0-9._-]+\.apps\.googleusercontent\.com$/
const PATRON_DOMINIO = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/

/** El estado: el interruptor global y la configuracion de cada cliente (`client_id` → fila). */
export const PORTAL_GOOGLE = { global: false, clientes: new Map() }

/**
 * Deja el estado como nace la instalacion, o como lo precarga `MOCK_PORTAL_GOOGLE=1` para probar a mano:
 * global encendido y el cliente 1 (Acme) con `acme.com` y sus subdominios.
 *
 * @param {boolean} [precargado] encender el global y sembrar a Acme
 */
export function reiniciarPortalGoogle (precargado = false) {
  PORTAL_GOOGLE.global = precargado
  PORTAL_GOOGLE.clientes.clear()

  if (precargado) {
    PORTAL_GOOGLE.clientes.set(1, {
      google_client_id: 'mock-1234567890-abc.apps.googleusercontent.com',
      exigir_google: false,
      dominios: [{ dominio: 'acme.com', incluir_subdominios: true }]
    })
  }
}

reiniciarPortalGoogle(process.env.MOCK_PORTAL_GOOGLE === '1')

/** El dominio de un correo, en minusculas, o `''` si no tiene arroba. */
function dominioDe (email) {
  const texto = String(email ?? '').trim().toLowerCase()
  const arroba = texto.lastIndexOf('@')

  return arroba === -1 ? '' : texto.slice(arroba + 1)
}

/** El dominio sin su primera etiqueta, o `null` si ya no quedan dos. */
function padreDe (dominio) {
  const partes = dominio.split('.')

  return partes.length > 2 ? partes.slice(1).join('.') : null
}

/** Todas las filas de dominio de todos los clientes, planas. */
function filasDeDominio () {
  return [...PORTAL_GOOGLE.clientes.entries()].flatMap(([clientId, config]) =>
    config.dominios.map((d) => ({ dominio: d.dominio, clientId, comodin: d.incluir_subdominios })))
}

/**
 * El cliente al que pertenece un dominio: el exacto gana; si no, el padre mas cercano con comodin.
 *
 * @param {string} dominio
 * @returns {number|null}
 */
export function resolverDominio (dominio) {
  const todas = filasDeDominio()
  const exacto = todas.find((f) => f.dominio === dominio)

  if (exacto) return exacto.clientId

  for (let padre = padreDe(dominio); padre !== null; padre = padreDe(padre)) {
    const fila = todas.find((f) => f.dominio === padre && f.comodin)

    if (fila) return fila.clientId
  }

  return null
}

/** `true` si `hd` es igual a un dominio del cliente o subdominio de uno. */
export function hdValido (hd, dominios) {
  return dominios.some((d) => hd === d.dominio || hd.endsWith(`.${d.dominio}`))
}

/**
 * El primer dominio de la lista pedida que choca con el de otro cliente, o `null`.
 *
 * Choca si otro cliente lo tiene exacto, si tiene un ancestro con comodin, o si el pedido lleva
 * comodin y otro cliente tiene un dominio por debajo.
 */
function conflictoCon (clienteId, dominios) {
  const ajenas = filasDeDominio().filter((f) => f.clientId !== clienteId)

  for (const d of dominios) {
    if (ajenas.some((f) => f.dominio === d.dominio)) return d.dominio

    for (let padre = padreDe(d.dominio); padre !== null; padre = padreDe(padre)) {
      if (ajenas.some((f) => f.dominio === padre && f.comodin)) return d.dominio
    }

    if (d.incluir_subdominios && ajenas.some((f) => f.dominio.endsWith(`.${d.dominio}`))) return d.dominio
  }

  return null
}

function invalido (campo, codigo, mensaje) {
  return new ErrorApi(422, 'validation_failed', mensaje, { [campo]: [codigo] })
}

/** Valida el cuerpo del `PUT` como la API: 422 por forma y por reglas de dominio. */
function validarCuerpo (cuerpo) {
  const clientId = typeof cuerpo?.google_client_id === 'string' ? cuerpo.google_client_id.trim() : null

  if (clientId === null) throw invalido('google_client_id', 'required', 'Falta el Client ID de Google.')
  if (typeof cuerpo.exigir_google !== 'boolean') {
    throw invalido('exigir_google', 'invalid', 'Falta decir si se exige Google.')
  }
  if (!Array.isArray(cuerpo.dominios)) throw invalido('dominios', 'required', 'Falta la lista de dominios.')
  if (cuerpo.dominios.length > MAX_DOMINIOS) {
    throw invalido('dominios', 'too_many', `Se pueden registrar hasta ${MAX_DOMINIOS} dominios por cliente.`)
  }
  if (clientId !== '' && !PATRON_CLIENT_ID.test(clientId)) {
    throw invalido('google_client_id', 'invalid', 'El Client ID de Google no tiene un formato válido.')
  }

  const vistos = new Set()
  const dominios = cuerpo.dominios.map((d, i) => {
    const dominio = String(d?.dominio ?? '').trim().toLowerCase()
    const comodin = d?.incluir_subdominios === true
    const campo = `dominios.${i}.dominio`

    if (!PATRON_DOMINIO.test(dominio)) throw invalido(campo, 'invalid', `«${dominio}» no es un dominio válido.`)
    if (vistos.has(dominio)) throw invalido(campo, 'duplicate', `«${dominio}» está repetido.`)
    if (CORREO_GRATUITO.has(dominio)) {
      throw invalido(campo, 'free_mail', `«${dominio}» es un correo gratuito y no puede registrarse.`)
    }
    if (comodin && SUFIJOS_PUBLICOS.has(dominio)) {
      throw invalido(`dominios.${i}.incluir_subdominios`, 'public_suffix', `«${dominio}» es un sufijo público: no admite subdominios.`)
    }
    vistos.add(dominio)

    return { dominio, incluir_subdominios: comodin }
  })

  if ((clientId === '') !== (dominios.length === 0)) {
    throw invalido(clientId === '' ? 'google_client_id' : 'dominios', 'required', 'El Client ID y los dominios van juntos: o están los dos o ninguno.')
  }
  if (cuerpo.exigir_google && dominios.length === 0) {
    throw invalido('exigir_google', 'requires_domains', 'Para exigir Google hace falta al menos un dominio.')
  }

  return { clientId, dominios, exigir: cuerpo.exigir_google }
}

/** Contactos activos del cliente cuyo correo no cae en ningun dominio suyo. */
function contactosSinCobertura (clienteId, dominios) {
  if (dominios.length === 0) return 0

  return CONTACTOS.filter((c) => c.client_id === clienteId && c.active)
    .filter((c) => resolverDominio(dominioDe(c.email)) !== clienteId).length
}

/**
 * `GET /clients/{id}/portal-google`: la configuracion del cliente, vacia si nunca la tuvo.
 *
 * @param {number} clienteId
 */
export function leerConfiguracion (clienteId) {
  const fila = PORTAL_GOOGLE.clientes.get(clienteId)

  return {
    configurado: fila !== undefined,
    google_client_id: fila?.google_client_id ?? '',
    exigir_google: fila?.exigir_google ?? false,
    dominios: fila?.dominios ?? [],
    global_habilitado: PORTAL_GOOGLE.global,
    contactos_sin_cobertura: contactosSinCobertura(clienteId, fila?.dominios ?? [])
  }
}

/**
 * `PUT /clients/{id}/portal-google`: valida, detecta solapamientos y reemplaza la configuracion.
 *
 * @param {number} clienteId
 * @param {unknown} cuerpo lo que manda el panel
 * @throws {ErrorApi} 422 por forma o reglas de dominio; 409 si choca con otro cliente
 */
export function guardarConfiguracion (clienteId, cuerpo) {
  const { clientId, dominios, exigir } = validarCuerpo(cuerpo)

  if (clientId === '') {
    PORTAL_GOOGLE.clientes.delete(clienteId)

    return leerConfiguracion(clienteId)
  }

  const choque = conflictoCon(clienteId, dominios)

  if (choque !== null) {
    throw new ErrorApi(409, 'conflict', `El dominio «${choque}» ya lo usa otro cliente.`)
  }

  PORTAL_GOOGLE.clientes.set(clienteId, { google_client_id: clientId, exigir_google: exigir, dominios })

  return leerConfiguracion(clienteId)
}

/**
 * `GET /auth/portal/google[?email=]`: la respuesta publica. Nunca revela si la cuenta existe.
 *
 * @param {string|null} email
 */
export function accesoPublico (email) {
  if (!PORTAL_GOOGLE.global) return { enabled: false, client_id: null, required: false }

  const clienteId = email ? resolverDominio(dominioDe(email)) : null
  const fila = clienteId === null ? undefined : PORTAL_GOOGLE.clientes.get(clienteId)

  return fila
    ? { enabled: true, client_id: fila.google_client_id, required: fila.exigir_google }
    : { enabled: true, client_id: null, required: false }
}

/** `true` si el global esta encendido y el cliente de este contacto exige Google. */
export function exigeGoogle (clienteId) {
  return PORTAL_GOOGLE.global && PORTAL_GOOGLE.clientes.get(clienteId)?.exigir_google === true
}

/** Lee el payload de la credencial: un JWT (sin verificar firma) o el atajo `mock:correo`. */
function payloadDe (credencial) {
  if (credencial.startsWith('mock:')) {
    const email = credencial.slice(5).toLowerCase()
    const cliente = PORTAL_GOOGLE.clientes.get(resolverDominio(dominioDe(email)))

    return { email, hd: dominioDe(email), email_verified: true, aud: cliente?.google_client_id }
  }

  const partes = credencial.split('.')

  if (partes.length !== 3) throw new ErrorApi(401, 'unauthenticated', 'La credencial de Google no es válida.')

  try {
    return JSON.parse(Buffer.from(partes[1], 'base64url').toString('utf8'))
  } catch {
    throw new ErrorApi(401, 'unauthenticated', 'La credencial de Google no es válida.')
  }
}

/**
 * `POST /auth/portal/google`: el contacto al que corresponde la credencial.
 *
 * @param {unknown} cuerpo `{ credential }`
 * @returns el contacto autenticado; el servidor arma la sesion igual que el login con contraseña
 * @throws {ErrorApi} 404 con el global apagado; 422 sin credencial; 401 por token, `aud`, `hd` o
 *         contacto; 403 por contacto o cliente inactivos
 */
export function autenticarConGoogle (cuerpo) {
  if (!PORTAL_GOOGLE.global) throw new ErrorApi(404, 'not_found', 'Recurso desconocido.')

  const credencial = typeof cuerpo?.credential === 'string' ? cuerpo.credential.trim() : ''

  if (credencial === '') throw invalido('credential', 'required', 'Falta la credencial de Google.')

  const payload = payloadDe(credencial)
  const rechazo = () => new ErrorApi(401, 'unauthenticated', 'No pudimos validar tu cuenta de Google.')
  const email = typeof payload.email === 'string' ? payload.email.trim().toLowerCase() : ''

  // (a) El email sin verificar solo sirve para elegir un cliente candidato.
  const candidato = resolverDominio(dominioDe(email))
  const config = candidato === null ? undefined : PORTAL_GOOGLE.clientes.get(candidato)

  if (!config) throw rechazo()
  // (b) El token se verifica contra el client_id de ESE candidato, con `hd` obligatorio.
  if (payload.aud !== config.google_client_id || payload.email_verified !== true) throw rechazo()
  if (typeof payload.hd !== 'string' || !hdValido(payload.hd.toLowerCase(), config.dominios)) throw rechazo()
  // (c) Con el email ya verificado, el cliente tiene que ser el mismo.
  if (resolverDominio(dominioDe(email)) !== candidato) throw rechazo()

  const coincidentes = CONTACTOS.filter((c) => c.client_id === candidato && c.email.toLowerCase() === email)

  if (coincidentes.length !== 1) throw rechazo()

  const [contacto] = coincidentes
  const cliente = CLIENTES.find((c) => c.id === candidato)

  if (!contacto.active || cliente?.active === false) throw new ErrorApi(403, 'forbidden', 'La cuenta está desactivada.')

  return contacto
}

/**
 * Aplica `wiwo_portal_google_enabled` de un `PATCH /settings`, con las reglas de `Escritura\Ajuste`.
 *
 * @param {Record<string, unknown>} cambios
 */
export function escribirAjusteGlobal (cambios) {
  if (!('wiwo_portal_google_enabled' in cambios)) return

  const valor = cambios.wiwo_portal_google_enabled

  if (typeof valor !== 'boolean' && valor !== '0' && valor !== '1') {
    throw new ErrorApi(422, 'validation_failed', 'Hay ajustes que no se pueden escribir.', { wiwo_portal_google_enabled: ['invalid'] })
  }

  PORTAL_GOOGLE.global = valor === true || valor === '1'
}

/** La entrada del interruptor global para `GET /settings` (`group: acceso`, `type: bool`). */
export function opcionPortalGoogle () {
  return { wiwo_portal_google_enabled: { group: 'acceso', type: 'bool', value: PORTAL_GOOGLE.global } }
}
