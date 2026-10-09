import { NextResponse, type NextRequest } from 'next/server'
import { MARGEN_REFRESCO_SEGUNDOS } from '@/datos/config'
import { llamarApiTipado } from '@/datos/api'
import { ErrorApi } from '@/datos/errores'
import { cabecerasDeOrigen } from '@/datos/origen'
import { refrescar } from '@/datos/refresco'
import { borrarSesion, guardarSesion, leerSesion, leerSuplantador } from '@/datos/sesion'
import { porVencer, type Sesion } from '@/datos/sobre-sesion'
import type { Sobre } from '@/datos/tipos'
import { esAppNativa } from '@/lib/app-nativa'

/**
 * Vincular el teléfono: pide a la API el código de un solo uso con el que la app canjea su propia
 * credencial de dispositivo.
 *
 * Es una ruta de servidor y no una llamada del BFF por la misma razón que `suplantar`: lo que la API
 * entrega es una credencial, y el token de acceso de la persona no sale de este proceso. `mobile` NO
 * está en la lista blanca del BFF (`datos/rutas.ts`) a propósito: el JavaScript de la página no tiene
 * forma de pedir nada de `/mobile/*` por su cuenta, solo esta ruta, y esta ruta exige ser la app.
 *
 * Qué entrega y qué no: el código dura 60 segundos, sirve una vez y solo lo canjea quien conozca el
 * `verifier` del que sale el `reto` (PKCE). El `verifier` nunca llega a la página ni a este servidor.
 */

/** El reto PKCE: SHA-256 en base64url sin relleno, o sea 43 caracteres. */
const PATRON_RETO = /^[A-Za-z0-9_-]{43}$/

interface CuerpoVinculo {
  reto?: unknown
}

/** Lo que la API responde al emitir el código (`POST /mobile/link-codes`). */
interface CodigoDeVinculo {
  code: string
  expires_in: number
}

/**
 * Pide el código de vínculo para el reto indicado.
 *
 * @returns `{ codigo, expiraEn }` (segundos de vida), sin caché; o el error de la API tal cual llega.
 */
export async function POST (peticion: NextRequest): Promise<NextResponse> {
  const sesion = await leerSesion()

  if (sesion === null) {
    return responder({ mensaje: 'No hay sesión.' }, 401)
  }

  // La vinculación entrega una credencial propia de la persona: con una sesión prestada saldría una
  // a nombre de quien se está mirando, y la fila de auditoría diría lo contrario.
  if (await leerSuplantador() !== null) {
    return responder({ mensaje: 'No se puede vincular el teléfono mientras ves el panel como otra persona.' }, 409)
  }

  // Defensa en profundidad: la API ya exige el `verifier`, pero un navegador normal no tiene motivo
  // para pedir esto, y cortarlo acá lo deja fuera de cualquier abuso de la ruta.
  if (!esAppNativa(peticion.headers.get('user-agent'))) {
    return responder({ mensaje: 'Solo se puede vincular desde la app de Ops.' }, 403)
  }

  let cuerpo: CuerpoVinculo

  try {
    cuerpo = await peticion.json() as CuerpoVinculo
  } catch {
    return responder({ mensaje: 'Cuerpo inválido' }, 400)
  }

  if (typeof cuerpo.reto !== 'string' || !PATRON_RETO.test(cuerpo.reto)) {
    return responder({ mensaje: 'El reto no es válido.' }, 400)
  }

  const origen = cabecerasDeOrigen(peticion.headers)

  try {
    const vigente = await sesionVigente(sesion, origen)

    if (vigente === null) {
      await borrarSesion('staff')

      return responder({ mensaje: 'La sesión se cerró.' }, 401)
    }

    const { data } = await pedirCodigo(vigente, cuerpo.reto, origen)

    return responder({ codigo: data.code, expiraEn: data.expires_in }, 200)
  } catch (error) {
    if (error instanceof ErrorApi) {
      return responder({ codigo: error.codigo, mensaje: error.message }, error.estado)
    }

    throw error
  }
}

/**
 * La sesión con el token de acceso vigente, refrescándola si le queda poco.
 *
 * Las rutas bajo `/api` no pasan por el `proxy` que renueva por adelantado, así que acá se hace la
 * misma comprobación que él.
 *
 * @returns la sesión a usar, o `null` si la API rechazó el refresco y hay que volver a entrar
 */
async function sesionVigente (sesion: Sesion, origen: Record<string, string>): Promise<Sesion | null> {
  if (!porVencer(sesion, MARGEN_REFRESCO_SEGUNDOS)) return sesion

  return await refrescarGuardando(sesion, origen)
}

/**
 * Refresca la sesión y deja la nueva en la cookie.
 *
 * @returns la sesión nueva, o `null` si la API rechazó el refresco
 */
async function refrescarGuardando (sesion: Sesion, origen: Record<string, string>): Promise<Sesion | null> {
  try {
    const renovada = await refrescar(sesion, origen)

    await guardarSesion(renovada)

    return renovada
  } catch (error) {
    if (error instanceof ErrorApi) return null

    throw error
  }
}

/**
 * Llama a `POST /mobile/link-codes`. Si el token venció justo en el camino, refresca una vez y
 * reintenta.
 *
 * @throws ErrorApi con el error de la API (`impersonation_forbidden`, `429`, `422`…)
 */
async function pedirCodigo (
  sesion: Sesion,
  reto: string,
  origen: Record<string, string>
): Promise<Sobre<CodigoDeVinculo>> {
  const llamar = async (acceso: string): Promise<Sobre<CodigoDeVinculo>> => await llamarApiTipado<CodigoDeVinculo>('/mobile/link-codes', {
    metodo: 'POST',
    token: acceso,
    cuerpo: { reto },
    cabeceras: origen
  })

  try {
    return await llamar(sesion.acceso)
  } catch (error) {
    if (!(error instanceof ErrorApi) || !error.esRefrescable) throw error

    const renovada = await refrescarGuardando(sesion, origen)

    if (renovada === null) throw error

    return await llamar(renovada.acceso)
  }
}

/** Respuesta JSON que nunca se cachea: lleva una credencial de un solo uso. */
function responder (cuerpo: Record<string, unknown>, estado: number): NextResponse {
  return NextResponse.json(cuerpo, { status: estado, headers: { 'Cache-Control': 'no-store' } })
}
