import 'server-only'

import { secretoProxy } from './config'

/**
 * Le cuenta a la API desde qué máquina se hizo cada cosa.
 *
 * === POR QUÉ HACE FALTA ===
 *
 * El navegador no habla con la API: habla con este servidor, y este servidor habla con la API. Es lo
 * que mantiene el token fuera del JavaScript de la página, y tiene un costo: para la API todas las
 * peticiones vienen del mismo lugar, así que la tabla de sesiones de `/auditoria` guardaba la IP del
 * servidor de Ops y el `User-Agent` `node` en vez de la IP y el navegador de la persona.
 *
 * === POR QUÉ VA CON UN SECRETO ===
 *
 * Porque `X-Forwarded-For` la puede mandar cualquiera. Sin nada que distinga al BFF de un cliente
 * suelto, quien tenga un token podría escribir la IP que quiera en la auditoría: el registro pasaría
 * de incompleto a falsificable. La API sólo lee estas cabeceras si vienen con `X-Proxy-Secreto`
 * igual a su `WIWO_PROXY_SECRETO` (ver `Nucleo\Origen` en wiwo-board).
 *
 * Sin `PROXY_SECRETO` configurado acá no se manda nada y la auditoría sigue mostrando el servidor,
 * que es la verdad de esa instalación. `GET /health` de la API responde `origen_confiable` para
 * comprobar de qué lado está un despliegue.
 *
 * === QUÉ SE MANDA ===
 *
 * IP y `User-Agent`. Nada más: ni idioma, ni resolución, ni identificador nuevo. Es una pantalla de
 * auditoría del equipo, no un perfil de la persona.
 */

/** Tope de la columna `user_agent` de la API. Recortar acá evita mandar 4 KB para guardar 255. */
const AGENTE_MAXIMO = 255

/**
 * Cabeceras de reenvío para una petición que llegó del navegador.
 *
 * @param cabeceras las de la petición entrante (`peticion.headers`)
 * @returns las cabeceras a sumar a `llamarApi()`, o `{}` si no hay secreto configurado
 */
export function cabecerasDeOrigen (cabeceras: Headers): Record<string, string> {
  const secreto = secretoProxy()

  if (secreto === null) return {}

  const salida: Record<string, string> = { 'x-proxy-secreto': secreto }
  const ip = ipDelNavegador(cabeceras)
  const agente = cabeceras.get('user-agent')?.trim() ?? ''

  if (ip !== null) salida['x-forwarded-for'] = ip
  if (agente !== '') salida['x-forwarded-user-agent'] = agente.slice(0, AGENTE_MAXIMO)

  return salida
}

/**
 * La IP de quien abrió el navegador.
 *
 * De `X-Forwarded-For` se toma la **primera** entrada: las siguientes son los proxies que la
 * petición atravesó. En producción la escribe el Apache que tiene delante; en desarrollo la escribe
 * el propio servidor de Next. Si no hay ninguna de las dos cabeceras se devuelve `null` y la API se
 * queda con la IP de quien la llamó, que es lo que hacía antes.
 */
function ipDelNavegador (cabeceras: Headers): string | null {
  const reenviada = cabeceras.get('x-forwarded-for')?.split(',')[0]?.trim() ?? ''

  if (reenviada !== '') return reenviada

  const real = cabeceras.get('x-real-ip')?.trim() ?? ''

  return real === '' ? null : real
}
