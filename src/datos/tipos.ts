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
