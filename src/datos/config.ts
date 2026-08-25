/**
 * Configuracion del acceso a la API, leida del entorno.
 *
 * Falla al arrancar si falta algo: una variable ausente que se descubre en la primera peticion de
 * un usuario es peor que un arranque que no ocurre.
 */

function requerida (nombre: string): string {
  const valor = process.env[nombre]

  if (valor === undefined || valor.trim() === '') {
    throw new Error(`[config] Falta la variable de entorno ${nombre}`)
  }

  return valor.trim()
}

/** Base de la API v1, sin barra final. Ej: `http://localhost:8091/api/v1`. */
export function baseApi (): string {
  return requerida('API_BASE').replace(/\/+$/, '')
}

/**
 * Clave de 32 bytes en hexadecimal para cifrar la cookie de sesion.
 * Se genera con `openssl rand -hex 32`.
 */
export function claveSesion (): Buffer {
  const clave = Buffer.from(requerida('SESION_CLAVE'), 'hex')

  if (clave.length !== 32) {
    throw new Error('[config] SESION_CLAVE debe ser de 32 bytes en hexadecimal (64 caracteres)')
  }

  return clave
}

/**
 * Que cabecera usa la API para el token.
 *
 * Bajo CGI/FastCGI —como corre PHP detras de cPanel— Apache no propaga `Authorization`, y la API
 * acepta `X-Api-Key` con el mismo token. `GET /health` informa cual llega; esto se configura una vez
 * al desplegar en vez de descubrirse cuando nadie puede entrar.
 */
export function cabeceraToken (): 'authorization' | 'x-api-key' {
  return process.env.API_CABECERA_TOKEN === 'x-api-key' ? 'x-api-key' : 'authorization'
}

/** Segundos antes del vencimiento en los que el proxy refresca por adelantado. */
export const MARGEN_REFRESCO_SEGUNDOS = 60
