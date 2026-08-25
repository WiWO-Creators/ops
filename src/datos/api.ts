import 'server-only'

import { baseApi, cabeceraToken } from './config'
import { errorDesdeRespuesta } from './errores'
import type { Sobre } from './tipos'

export interface OpcionesLlamada {
  metodo?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE'
  cuerpo?: unknown
  token?: string
  /** Cabeceras extra a reenviar. Se usa desde el BFF para pasar la consulta tal cual. */
  cabeceras?: Record<string, string>
  senal?: AbortSignal
}

/**
 * Llama a la API v1. Es el unico punto del proyecto que conoce su URL.
 *
 * Devuelve la respuesta cruda para que el BFF pueda reenviarla sin volver a serializar. Quien quiera
 * el dato ya tipado usa `pedir()` de `servidor.ts`.
 *
 * @throws nunca por codigo de estado — eso lo decide el llamador leyendo `respuesta.ok`.
 */
export async function llamarApi (ruta: string, opciones: OpcionesLlamada = {}): Promise<Response> {
  const { metodo = 'GET', cuerpo, token, cabeceras = {}, senal } = opciones

  const enviar: Record<string, string> = { accept: 'application/json', ...cabeceras }

  if (token !== undefined) {
    enviar[cabeceraToken()] = cabeceraToken() === 'authorization' ? `Bearer ${token}` : token
  }

  if (cuerpo !== undefined) {
    enviar['content-type'] = 'application/json'
  }

  return await fetch(`${baseApi()}${ruta}`, {
    method: metodo,
    headers: enviar,
    body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
    // Datos siempre frescos: el cache lo decide cada pantalla, no el transporte.
    cache: 'no-store',
    signal: senal
  })
}

/**
 * Llama a la API y devuelve `data` ya tipado.
 *
 * @throws ErrorApi si la API responde con error, con el codigo del contrato intacto.
 */
export async function llamarApiTipado<T> (ruta: string, opciones: OpcionesLlamada = {}): Promise<Sobre<T>> {
  const respuesta = await llamarApi(ruta, opciones)

  if (!respuesta.ok) {
    throw await errorDesdeRespuesta(respuesta, ruta)
  }

  // 204 sin cuerpo: logout y detener cronometro.
  if (respuesta.status === 204) {
    return { data: undefined as T }
  }

  return await respuesta.json() as Sobre<T>
}
