/**
 * Tipos del contrato de la API v1.
 *
 * Los nombres de campo son los de Perfex, sin traducir: la traduccion ocurre una sola vez, al
 * presentar (ver `src/dominio/glosario.ts`). Este archivo describe la *forma* de las respuestas,
 * no los recursos de negocio — esos llegan con sus modulos.
 */

/** Envelope de exito. `meta` se omite cuando esta vacio. */
export interface Sobre<T> {
  data: T
  meta?: Meta
}

export interface Meta {
  pagination?: Paginacion
}

export interface Paginacion {
  page: number
  per_page: number
  total: number
  total_pages: number
  /**
   * Resumen agregado, cuando el recurso lo trae. Hoy solo `GET /notifications/mail-queue`: cuenta la
   * cola entera (`total`, `pending`, `sending`, `sent`, `failed`), sin los filtros de la vista. Va
   * DENTRO de `pagination` y no como hermano en `meta` — así responde la API real, aunque el
   * contrato lo documentó como hermano; se corrigió el documento para que diga lo que se mide.
   */
  summary?: ResumenColaCorreo
}

/** El resumen que viaja en `meta.pagination.summary` de `GET /notifications/mail-queue`. */
export interface ResumenColaCorreo {
  total: number
  pending: number
  sending: number
  sent: number
  failed: number
}

/** Envelope de error. `details` solo viene en 422. */
export interface SobreError {
  error: {
    code: CodigoError
    message: string
    details?: Record<string, string[]>
  }
}

/**
 * Codigos del contrato. Los tres primeros son 401 y significan cosas distintas:
 * `token_expired` se resuelve refrescando, los otros dos obligan a entrar de nuevo.
 */
export type CodigoError =
  | 'unauthenticated'
  | 'token_expired'
  | 'token_revoked'
  | 'forbidden'
  | 'not_found'
  | 'validation_failed'
  | 'conflict'
  | 'rate_limited'
  | 'bad_request'
  | 'server_error'

export interface Staff {
  id: number
  email: string
  firstname: string
  lastname: string
  full_name: string
  profile_image_url: string | null
  is_admin: boolean
  role_id: number | null
  active: boolean
}

/** Forma reducida que viaja embebida en `assignees`, `followers` y `members`. */
export interface StaffReferencia {
  id: number
  full_name: string
  profile_image_url: string | null
}

export type Capacidad = 'view' | 'create' | 'edit' | 'delete'
export type AreaPermiso = 'tasks' | 'projects' | 'customers' | 'staff'

/** Respuesta de `GET /me`. */
export interface Yo extends Staff {
  permissions: Record<AreaPermiso, Capacidad[]>
  secciones_habilitadas: string[]
  locale: string
}

/**
 * El par de tokens.
 *
 * `staff` viene en login y en 2fa, pero **no en refresh**: ahi la API devuelve solo los tokens,
 * porque quien refresca ya sabe de quien es la sesion. Por eso es opcional, y por eso el staffId se
 * pasa aparte al armar la sesion.
 */
export interface ParDeTokens {
  access_token: string
  expires_in: number
  refresh_token: string
  refresh_expires_in: number
  staff?: Staff
}

/** Lo que devuelven login y 2fa: el par mas el staff. */
export interface ParDeTokensConStaff extends ParDeTokens {
  staff: Staff
}

/** Respuesta de login cuando la cuenta tiene segundo factor. */
export interface DesafioSegundoFactor {
  two_factor_required: true
  challenge_token: string
  method: 'email' | 'app'
}

export function esDesafio (dato: ParDeTokensConStaff | DesafioSegundoFactor): dato is DesafioSegundoFactor {
  return 'two_factor_required' in dato
}

/**
 * Permisos del portal del cliente.
 *
 * No son los del panel: un contacto no tiene capacidades (`view`/`edit`/...) sino secciones enteras
 * habilitadas o no. El mapa vive en `tblcontact_permissions` y lo fija Perfex en codigo.
 */
export type PermisoPortal =
  | 'invoices'
  | 'estimates'
  | 'contracts'
  | 'proposals'
  | 'support'
  | 'projects'

/** El contacto de cliente autenticado, tal como lo devuelve `/auth/portal/login`. */
export interface ContactoPortal {
  id: number
  client_id: number
  firstname: string
  lastname: string
  full_name: string
  email: string
  phonenumber: string | null
  title: string | null
  is_primary: boolean
  /** `false` obliga a mandar a verificar: la API responde 403 en todo lo demas. */
  email_verified: boolean
  last_login: string | null
  direction: string | null
}

/** Lo que devuelve el login del portal: el par mas el contacto. */
export interface ParDeTokensConContacto extends ParDeTokens {
  contact: ContactoPortal
}

/** `/portal/me`: el contacto mas lo que puede ver. */
export interface YoPortal extends ContactoPortal {
  permissions: PermisoPortal[]
  /** Secciones vivas para este contacto. El portal arma su navegacion con esto, no adivinando. */
  secciones_habilitadas: string[]
  locale: string
}

/** `/portal/company`: los datos de la empresa del contacto. */
export interface EmpresaPortal {
  id: number
  company: string
  vat: string | null
  phonenumber: string | null
  website: string | null
  address: string | null
  city: string | null
  state: string | null
  zip: string | null
  country_id: number
  default_language: string | null
  date_created: string | null
  /** Solo presentes si el contacto es primario y la opcion esta habilitada en Perfex. */
  billing?: DireccionPortal
  shipping?: DireccionPortal
}

export interface DireccionPortal {
  street: string | null
  city: string | null
  state: string | null
  zip: string | null
  country: string | null
}
