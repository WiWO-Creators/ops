import { NextResponse, type NextRequest } from 'next/server'
import { llamarApi } from '@/datos/api'
import { secretoDeBoletoEnVivo, tiempoDeApiMs, urlDeEnVivo } from '@/datos/config'
import { ErrorApi } from '@/datos/errores'
import { cabecerasDeOrigen } from '@/datos/origen'
import { llamarConRefresco } from '@/datos/proxy-bff'
import { refrescar } from '@/datos/refresco'
import { borrarSesion, guardarSesion, leerSesion } from '@/datos/sesion'
import type { Sesion } from '@/datos/sobre-sesion'
import { resolverBoletoDePortal, type YoParaBoletoDePortal } from '@/lib/en-vivo/boleto-portal'
import { falloDeBoleto } from '@/lib/en-vivo/resultado-de-boleto'

/**
 * `POST /api/en-vivo/boleto-portal`: el boleto con el que un contacto del portal abre el bus.
 *
 * El contacto no elige salas: la única que recibe es `cliente:{client_id}`, tomada de su propio
 * `/portal/me` (con su token, renovado si hace falta). La sala del cliente solo transmite «algo
 * cambió», sin ids: el portal vuelve a pedir sus páginas con su propio permiso. Responde
 * `{data:{boleto, expira_en, url}}`; 401 sin sesión; 503 `en_vivo_apagado` si «en vivo» no está
 * encendido para su cliente (`en_vivo` de `/portal/me`), sin URL o sin secreto; 403 si la ficha no
 * trae `client_id`; 502 si la API no contesta.
 */

export const dynamic = 'force-dynamic'

const SIN_CACHE = { 'cache-control': 'no-store' }

/** La sesión no se pudo renovar: hay que volver a entrar. */
class SesionCerrada extends Error {}

/**
 * Lee `/portal/me` con el token del contacto, renovando la sesión si venció.
 *
 * @param actual la sesión del contacto
 * @param origen cabeceras de origen para la auditoría del refresco
 * @returns la ficha, o `null` si la API contestó algo que no es una ficha
 * @throws SesionCerrada si la sesión venció y no se pudo renovar
 * @throws TypeError / DOMException si la API no contestó a tiempo (el llamador responde 502)
 */
async function leerYoDelPortal (actual: Sesion, origen: Record<string, string>): Promise<YoParaBoletoDePortal | null> {
  let sesion = actual
  const llamada = await llamarConRefresco(sesion, {
    llamar: async (token) => await llamarApi('/portal/me', { token, senal: AbortSignal.timeout(tiempoDeApiMs()) }),
    refrescar: async () => {
      try {
        return await refrescar(sesion, origen)
      } catch (fallo) {
        if (fallo instanceof ErrorApi) return null
        throw fallo
      }
    },
    guardar: async (renovada) => {
      sesion = renovada
      await guardarSesion(renovada)
    },
    borrar: async () => { await borrarSesion('contacto') }
  })

  if ('sesionCerrada' in llamada) throw new SesionCerrada()
  if (!llamada.respuesta.ok) {
    await llamada.respuesta.body?.cancel()

    return null
  }

  const sobre = await llamada.respuesta.json() as { data?: YoParaBoletoDePortal }

  return sobre.data ?? null
}

/** Emite el boleto del contacto; ver el docblock del archivo. */
export async function POST (peticion: NextRequest): Promise<Response> {
  const sesion = await leerSesion('contacto')

  if (sesion === null) {
    const { estado, cuerpo } = resolverBoletoDePortal({ yo: null, url: '', secreto: null })

    return NextResponse.json(cuerpo, { status: estado, headers: SIN_CACHE })
  }

  let yo: YoParaBoletoDePortal | null

  try {
    yo = await leerYoDelPortal(sesion, cabecerasDeOrigen(peticion.headers))
  } catch (fallo) {
    if (fallo instanceof SesionCerrada) {
      return NextResponse.json(falloDeBoleto(401, 'token_revoked').cuerpo, { status: 401, headers: SIN_CACHE })
    }
    // Red caída o tiempo agotado no son un «no»: se avisa distinto. Cualquier otra cosa es un bug.
    if (fallo instanceof TypeError || (fallo instanceof DOMException && fallo.name === 'TimeoutError')) {
      return NextResponse.json(falloDeBoleto(502, 'upstream_error').cuerpo, { status: 502, headers: SIN_CACHE })
    }

    throw fallo
  }

  if (yo === null) {
    return NextResponse.json(falloDeBoleto(502, 'upstream_error').cuerpo, { status: 502, headers: SIN_CACHE })
  }

  const { estado, cuerpo } = resolverBoletoDePortal({ yo, url: urlDeEnVivo(), secreto: secretoDeBoletoEnVivo() })

  return NextResponse.json(cuerpo, { status: estado, headers: SIN_CACHE })
}
