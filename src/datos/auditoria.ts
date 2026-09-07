/**
 * Tipos del centro de auditoría (`/auditoria`).
 *
 * Viven en su propio archivo y no en `datos/recursos.ts` porque no son recursos de negocio: nadie
 * crea ni edita una sesión ni un latido. Son las tres lecturas que sostienen una sola pantalla.
 *
 * Los nombres de campo son los que devuelve la API, sin traducir, igual que en el resto del proyecto:
 * la traducción ocurre una sola vez, al presentar.
 */

/** Persona, en la forma reducida que devuelven los tres endpoints. */
export interface PersonaAuditoria {
  id: number
  full_name: string
  profile_image_url: string | null
}

/**
 * Una persona conectada ahora mismo (`GET /presence`).
 *
 * `activity` y `location` llegan **ya redactadas por el servidor**: el navegador manda la ruta y
 * nunca el texto. Por eso esta pantalla no tiene ningún mapa de rutas a frases — si lo tuviera,
 * habría dos versiones de la misma tabla y la que se equivocaría sería ésta.
 */
export interface PersonaConectada {
  staff: PersonaAuditoria
  /** Qué está haciendo: la acción en curso si hay una, si no dónde está. Ej: "creando una tarea". */
  activity: string
  /** Dónde está, siempre. Ej: "viendo el espacio DELCO". */
  location: string
  /** Ruta cruda del panel, para poder auditar la frase. */
  route: string
  /** Acción del catálogo cerrado del servidor, o `null` si sólo está mirando. */
  action: string | null
  last_seen: string
  /** Antigüedad del último latido, ya calculada por el servidor. */
  seconds_ago: number | null
  ip: string | null
  /** Quién abrió esta sesión en nombre de esta persona, si es una suplantación viva. */
  impersonated_by: PersonaAuditoria | null
}

/** Meta de `GET /presence`: cuánto vale "ahora" en esta respuesta. */
export interface MetaPresencia {
  window_seconds: number
  total: number
}

/**
 * Una sesión abierta (`GET /sessions`).
 *
 * Una fila es un **token**, no una jornada: la API rota el par cada hora, así que una persona que
 * trabaja toda la tarde deja varias filas. Está documentado en `RecursoSesiones` y la pantalla lo
 * dice con todas las letras en vez de fingir que cuenta jornadas.
 *
 * `ip` y `user_agent` son los de quien **llamó a la API**. Como ops-v2 llama desde su servidor, hoy
 * son los del servidor de Ops (`node`) y no los del navegador de la persona. La pantalla los rotula
 * como "origen de la llamada" justamente por eso.
 */
export interface SesionAbierta {
  id: number
  staff: PersonaAuditoria | null
  started_at: string | null
  last_used_at: string | null
  expires_at: string | null
  revoked_at: string | null
  active: boolean
  ip: string | null
  user_agent: string | null
  impersonated_by: PersonaAuditoria | null
}

/** Una suplantación viva (`GET /sessions/impersonations`). */
export interface SuplantacionViva {
  session_id: number
  /** Quien abrió la sesión. */
  admin: PersonaAuditoria | null
  /** En cuya cuenta se entró. */
  target: PersonaAuditoria | null
  started_at: string | null
  expires_at: string | null
  ip: string | null
}

/** Una fila del historial de acciones (`GET /audit`). */
export interface RegistroAuditoria {
  id: number
  date: string | null
  /**
   * Nombre escrito, no una referencia de persona: `tblactivity_log.staffid` es un `varchar` con el
   * nombre y no un id, así que no hay ficha que abrir ni foto que buscar. Es `null` en las filas del
   * cron y en los intentos de acceso de gente que no existe.
   */
  actor: string | null
  type: TipoAuditoria
  description: string
}

/** Tipos que deriva `RecursoAuditoria` del texto de la fila. */
export type TipoAuditoria =
  | 'suplantacion'
  | 'portal'
  | 'login'
  | 'login_fallido'
  | 'api'
  | 'email'
  | 'denegado'
  | 'cron'
  | 'otro'

/** Catálogo de `GET /audit/filters`, para poblar los selectores sin adivinar. */
export interface CatalogoAuditoria {
  types: Array<{ type: TipoAuditoria, count: number }>
  actors: Array<{ actor: string | null, count: number }>
}

/** Valor por defecto del intervalo del latido, en segundos. */
const LATIDO_POR_DEFECTO = 45

/** Piso y techo del intervalo. Menos de 15 s martilla la API; más de 10 min ya no es "ahora". */
const LATIDO_MINIMO = 15
const LATIDO_MAXIMO = 600

/**
 * Cada cuántos segundos late el panel y se refresca el bloque "Ahora mismo".
 *
 * Configurable con `PRESENCIA_INTERVALO_SEGUNDOS` porque el costo de esto es una petición por
 * persona conectada por intervalo: con 60 personas a 45 s son ~80 peticiones por minuto, y quien
 * opere la instalación tiene que poder bajarlo sin tocar el código.
 *
 * **No es `NEXT_PUBLIC_`**: la lee el servidor y viaja al navegador como una prop, igual que las
 * secciones de la barra lateral. Una variable pública sería una tercera forma de configurar lo
 * mismo, editable desde el `.env` del build y no desde el del servidor.
 *
 * Se acota en vez de fallar: un valor mal escrito no puede dejar el panel sin latir ni convertirlo
 * en un martillo contra la API.
 */
export function intervaloDeLatido (): number {
  const crudo = Number(process.env.PRESENCIA_INTERVALO_SEGUNDOS)

  if (!Number.isFinite(crudo) || crudo <= 0) return LATIDO_POR_DEFECTO

  return Math.min(Math.max(Math.round(crudo), LATIDO_MINIMO), LATIDO_MAXIMO)
}

/**
 * Cómo se lee cada tipo y con qué tono se pinta.
 *
 * `suplantacion`, `login_fallido` y `denegado` van en tono de peligro: son las tres filas que uno
 * busca cuando abre esta pantalla por un motivo. El resto es tráfico normal y no debe gritar.
 */
export const TIPOS_AUDITORIA: Record<TipoAuditoria, { etiqueta: string, tono: 'neutro' | 'acento' | 'aviso' | 'peligro' | 'contorno' }> = {
  suplantacion: { etiqueta: 'Suplantación', tono: 'peligro' },
  login_fallido: { etiqueta: 'Acceso fallido', tono: 'peligro' },
  denegado: { etiqueta: 'Acceso denegado', tono: 'peligro' },
  login: { etiqueta: 'Ingreso', tono: 'acento' },
  portal: { etiqueta: 'Portal del cliente', tono: 'aviso' },
  api: { etiqueta: 'Acción en Ops', tono: 'neutro' },
  email: { etiqueta: 'Correo enviado', tono: 'contorno' },
  cron: { etiqueta: 'Tarea programada', tono: 'contorno' },
  otro: { etiqueta: 'Otro', tono: 'contorno' }
}
