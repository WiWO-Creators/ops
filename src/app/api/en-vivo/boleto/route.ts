import { NextResponse, type NextRequest } from 'next/server'
import { estadoEnVivo } from '@/datos/ajustes'
import { llamarApi } from '@/datos/api'
import { secretoDeBoletoEnVivo, tiempoDeApiMs } from '@/datos/config'
import { ErrorApi } from '@/datos/errores'
import { cabecerasDeOrigen } from '@/datos/origen'
import { llamarConRefresco } from '@/datos/proxy-bff'
import { refrescar } from '@/datos/refresco'
import { guardarSesion, borrarSesion, leerSesion } from '@/datos/sesion'
import type { Sesion } from '@/datos/sobre-sesion'
import {
  funcionDeDocumento,
  leerNombreDeDocumento,
  leerPedidoDeBoleto,
  rutaDeAvalDelDocumento,
  salasPermitidasPorDefecto,
  validacionDeSala
} from '@/dominio/en-vivo'
import { emitirBoleto } from '@/lib/en-vivo/boleto'

/**
 * Entrega un boleto para abrir el socket del bus o un documento colaborativo.
 *
 * El navegador no puede mandar la cookie de sesión al servicio de «Ops en vivo» (otro origen, otro
 * proceso), así que este BFF —que sí la tiene— comprueba contra la API, con el token de la persona,
 * que puede ver cada sala o documento que pide, y firma un boleto de 120 s que el servicio solo
 * verifica. Una sala que la API no deja leer no entra al boleto.
 *
 * Responde `{data:{boleto, expira_en, url, staff_id}}` (`staff_id` es quien pide: la presencia lo usa
 * para no mostrarle a nadie su propio avatar); 401 sin sesión; 503 `en_vivo_apagado` con el maestro
 * apagado, sin URL o sin secreto; 400 si el cuerpo es inválido; 403 `sala_no_permitida` si la API
 * niega algo (403/404); 502 si la API no contesta.
 */

export const dynamic = 'force-dynamic'

const SIN_CACHE = { 'cache-control': 'no-store' }

function error (estado: number, code: string): NextResponse {
  return NextResponse.json({ error: { code } }, { status: estado, headers: SIN_CACHE })
}

/** La sesión de quien pide, que se reemplaza si hay que renovarla, y de dónde viene (para la auditoría). */
interface SesionVigente {
  sesion: Sesion
  origen: Record<string, string>
}

/** La API no contestó o falló por su cuenta: no es una negativa de permiso. */
class ApiNoDisponible extends Error {}

/** La sesión no se pudo renovar: hay que volver a entrar. */
class SesionCerrada extends Error {}

/**
 * Pregunta a la API si la persona puede leer un recurso, renovando la sesión si hace falta.
 *
 * @param actual la sesión vigente; se reemplaza si hubo refresco
 * @param ruta ruta de la API a leer (`/projects/3`)
 * @returns `true` si la lectura dio 2xx, `false` si la API contestó 403 o 404
 * @throws ApiNoDisponible si la API falló o no contestó a tiempo
 * @throws SesionCerrada si la sesión venció y no se pudo renovar
 */
async function puedeLeer (actual: SesionVigente, ruta: string): Promise<boolean> {
  let llamada: Awaited<ReturnType<typeof llamarConRefresco>>

  try {
    llamada = await llamarConRefresco(actual.sesion, {
      llamar: async (token) => await llamarApi(ruta, { token, senal: AbortSignal.timeout(tiempoDeApiMs()) }),
      refrescar: async () => {
        try {
          return await refrescar(actual.sesion, actual.origen)
        } catch (fallo) {
          if (fallo instanceof ErrorApi) return null
          throw fallo
        }
      },
      guardar: async (renovada) => {
        actual.sesion = renovada
        await guardarSesion(renovada)
      },
      borrar: async () => { await borrarSesion('staff') }
    })
  } catch (fallo) {
    // Red caída o tiempo agotado no son un «no»: se avisa distinto. Cualquier otra cosa es un bug.
    if (fallo instanceof TypeError || (fallo instanceof DOMException && fallo.name === 'TimeoutError')) {
      throw new ApiNoDisponible()
    }

    throw fallo
  }

  if ('sesionCerrada' in llamada) throw new SesionCerrada()

  const { status } = llamada.respuesta

  await llamada.respuesta.body?.cancel()

  if (status >= 200 && status < 300) return true
  if (status === 403 || status === 404) return false

  throw new ApiNoDisponible()
}

/**
 * Comprueba, una por una, las rutas de la API que avalan las salas y el documento.
 *
 * En serie a propósito: si la primera renueva la sesión, las siguientes ya usan el token nuevo.
 * Con varias en paralelo, una segunda renovación gastaría un refresco ya consumido y la API
 * cerraría todas las sesiones de la persona.
 */
async function todasLegibles (actual: SesionVigente, rutas: string[]): Promise<boolean> {
  for (const ruta of rutas) {
    if (!await puedeLeer(actual, ruta)) return false
  }

  return true
}

async function leerCuerpo (peticion: NextRequest): Promise<unknown> {
  try {
    return await peticion.json()
  } catch {
    return null
  }
}

/**
 * `POST /api/en-vivo/boleto`: valida las salas pedidas contra la API y emite el boleto.
 *
 * Cuerpo: `{salas?, documento?, espacio_id?}`. Sin `salas` se piden las de por defecto (la propia y
 * la del equipo). Con `documento: 'acta:{id}'` hace falta `espacio_id` y la edición conjunta de
 * actas encendida; con `tarea:{id}` o `ticket-borrador:{id}`, la edición conjunta de textos, y el
 * permiso se avala leyendo la propia tarea (`/tasks/{id}`) o ticket (`/tickets/{id}`).
 */
export async function POST (peticion: NextRequest): Promise<Response> {
  const sesion = await leerSesion('staff')

  if (sesion === null) return error(401, 'unauthenticated')

  const config = await estadoEnVivo()
  const secreto = secretoDeBoletoEnVivo()

  if (!config.activo || secreto === null) return error(503, 'en_vivo_apagado')

  const pedido = leerPedidoDeBoleto(await leerCuerpo(peticion))

  if (pedido === null) return error(400, 'invalid_body')

  const documento = pedido.documento === null ? null : leerNombreDeDocumento(pedido.documento)

  // Cada clase de documento tiene su propio interruptor: el acta, `actas`; la tarea y el borrador, `textos`.
  if (documento !== null && !config[funcionDeDocumento(documento.clase)]) return error(403, 'sala_no_permitida')

  const salas = [...new Set(pedido.salas ?? salasPermitidasPorDefecto({ suj: 'staff', id: sesion.sujetoId }))]
  const rutas = new Set<string>()

  for (const sala of salas) {
    const validacion = validacionDeSala(sala, sesion.sujetoId)

    if (validacion.via === 'denegada') return error(403, 'sala_no_permitida')
    if (validacion.via === 'api') rutas.add(validacion.ruta)
  }

  if (pedido.documento !== null) {
    const aval = rutaDeAvalDelDocumento(pedido.documento, pedido.espacioId)

    if (aval === null) return error(400, 'invalid_body')
    rutas.add(aval)
  }

  try {
    const vigente: SesionVigente = { sesion, origen: cabecerasDeOrigen(peticion.headers) }

    if (!await todasLegibles(vigente, [...rutas])) return error(403, 'sala_no_permitida')
  } catch (fallo) {
    if (fallo instanceof SesionCerrada) return error(401, 'token_revoked')
    if (fallo instanceof ApiNoDisponible) return error(502, 'upstream_error')
    throw fallo
  }

  const { boleto, exp } = emitirBoleto(
    { suj: 'staff', id: sesion.sujetoId, salas, doc: pedido.documento, esp: pedido.espacioId },
    secreto
  )

  return NextResponse.json({ data: { boleto, expira_en: exp, url: config.url, staff_id: sesion.sujetoId } }, { headers: SIN_CACHE })
}
