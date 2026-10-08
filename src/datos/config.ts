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

/**
 * Secreto compartido con la API para que crea el origen que el BFF le reenvia.
 *
 * Opcional a proposito: sin ella el BFF no manda `X-Forwarded-For` ni el `User-Agent` del navegador,
 * la API se queda con los datos de quien la llamo y la auditoria muestra el servidor de Ops. Es la
 * unica variable de este archivo que no hace fallar el arranque, porque su ausencia no rompe nada:
 * apaga una columna, no una pantalla. Ver `datos/origen.ts`.
 */
export function secretoProxy (): string | null {
  const valor = process.env.PROXY_SECRETO?.trim() ?? ''

  return valor === '' ? null : valor
}

/** Segundos antes del vencimiento en los que el proxy refresca por adelantado. */
export const MARGEN_REFRESCO_SEGUNDOS = 60

/**
 * Cuanto se espera, como maximo, a `GET /public/modo` desde el layout raiz.
 *
 * Esa lectura corre en cada pagina nueva y no puede retrasarla: pasado este tiempo la pagina sale
 * sin modo especial. `MODO_ESPERA_MS` lo cambia sin tocar codigo.
 */
export function esperaDeModoEspecial (): number {
  const configurada = Number(process.env.MODO_ESPERA_MS)

  return Number.isInteger(configurada) && configurada > 0 ? configurada : 1500
}

/**
 * Espera maxima del BFF a la API en una peticion corriente, en milisegundos.
 *
 * Sin limite, una API lenta deja la peticion del navegador colgada hasta que algun intermediario la
 * corte, y la persona no sabe si lo que hizo se guardo. `API_TIEMPO_MS` lo cambia sin tocar codigo.
 */
export function tiempoDeApiMs (): number {
  const configurado = Number(process.env.API_TIEMPO_MS)

  return Number.isInteger(configurado) && configurado > 0 ? configurado : 25_000
}
