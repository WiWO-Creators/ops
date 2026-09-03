import { NextResponse, type NextRequest } from 'next/server'
import { llamarApi } from '@/datos/api'
import { ErrorApi } from '@/datos/errores'
import { rutaCompartida, rutaPermitida } from '@/datos/rutas'
import { borrarSesion, guardarSesion, leerSesion } from '@/datos/sesion'
import { refrescar } from '@/datos/refresco'
import type { Sesion, Sujeto } from '@/datos/sobre-sesion'

/**
 * Proxy unico entre el navegador y la API v1.
 *
 * Existe por tres razones, en este orden:
 *
 *  1. El token nunca llega al navegador. Vive cifrado en una cookie `httpOnly` que solo el servidor
 *     abre.
 *  2. Al estar en el mismo origen, no hay CORS en produccion. La API igual lo implementa, pero para
 *     desarrollo local.
 *  3. Es el unico punto donde el refresco puede escribir la cookie nueva, porque un Server Component
 *     no puede.
 *
 * Reenvia la respuesta de la API **tal cual**: mismo estado, mismo cuerpo, mismo `content-type`. El
 * cliente ve el contrato sin capas intermedias que reinterpreten sus errores.
 */

const METODOS_CON_CUERPO = new Set(['POST', 'PATCH', 'PUT', 'DELETE'])

export async function GET (peticion: NextRequest, ctx: RouteContext<'/api/bff/[...ruta]'>): Promise<Response> {
  return await reenviar(peticion, ctx)
}

export async function POST (peticion: NextRequest, ctx: RouteContext<'/api/bff/[...ruta]'>): Promise<Response> {
  return await reenviar(peticion, ctx)
}

export async function PATCH (peticion: NextRequest, ctx: RouteContext<'/api/bff/[...ruta]'>): Promise<Response> {
  return await reenviar(peticion, ctx)
}

export async function PUT (peticion: NextRequest, ctx: RouteContext<'/api/bff/[...ruta]'>): Promise<Response> {
  return await reenviar(peticion, ctx)
}

export async function DELETE (peticion: NextRequest, ctx: RouteContext<'/api/bff/[...ruta]'>): Promise<Response> {
  return await reenviar(peticion, ctx)
}

/**
 * Reenvia la peticion a la API con el token de la sesion.
 *
 * Ante `401 token_expired` refresca una vez, guarda la cookie nueva y reintenta. Si el refresco
 * falla, borra la sesion y devuelve `401` para que el navegador vaya a entrar.
 */
async function reenviar (peticion: NextRequest, ctx: RouteContext<'/api/bff/[...ruta]'>): Promise<Response> {
  const { ruta } = await ctx.params

  // El prefijo decide de que sujeto es la peticion, y con eso que cookie leer y contra que lista
  // blanca validar. Un contacto no puede pedir `clients` ni un staff pedir `portal`, y el pedido ni
  // siquiera sale hacia la API.
  //
  // La descarga de adjuntos es la excepcion: vive fuera de `/portal` y sirve a los dos, asi que el
  // prefijo no alcanza y hay que mirar que sesion existe. Se prueba primero la del panel, igual que
  // hace la API, para que alguien del equipo con las dos sesiones abiertas siga descargando como
  // staff y no como el cliente que estaba mirando.
  const sujeto: Sujeto = ruta[0] === 'portal'
    ? 'contacto'
    : rutaCompartida(ruta) && await leerSesion('staff') === null
      ? 'contacto'
      : 'staff'

  if (!rutaPermitida(ruta, sujeto)) {
    return NextResponse.json(
      { error: { code: 'not_found', message: 'Ruta no disponible' } },
      { status: 404 }
    )
  }

  const sesion = await leerSesion(sujeto)

  if (sesion === null) {
    return NextResponse.json(
      { error: { code: 'unauthenticated', message: 'No hay sesion' } },
      { status: 401 }
    )
  }

  const consulta = peticion.nextUrl.search
  const destino = `/${ruta.join('/')}${consulta}`
  const cuerpo = await leerCuerpo(peticion)

  let respuesta = await llamarApi(destino, {
    metodo: peticion.method as 'GET',
    cuerpo,
    token: sesion.acceso
  })

  if (respuesta.status === 401 && await esTokenVencido(respuesta)) {
    const renovada = await intentarRefrescar(sesion)

    if (renovada === null) {
      await borrarSesion(sujeto)

      return NextResponse.json(
        { error: { code: 'token_revoked', message: 'La sesion se cerro' } },
        { status: 401 }
      )
    }

    await guardarSesion(renovada)

    respuesta = await llamarApi(destino, {
      metodo: peticion.method as 'GET',
      cuerpo,
      token: renovada.acceso
    })
  }

  return new NextResponse(respuesta.body, {
    status: respuesta.status,
    headers: { 'content-type': respuesta.headers.get('content-type') ?? 'application/json' }
  })
}

/** Lee JSON o multipart de los metodos que llevan cuerpo. Un cuerpo ausente o ilegible es `undefined`. */
async function leerCuerpo (peticion: NextRequest): Promise<unknown> {
  if (!METODOS_CON_CUERPO.has(peticion.method)) return undefined

  try {
    if (peticion.headers.get('content-type')?.startsWith('multipart/form-data')) {
      return await peticion.formData()
    }

    const texto = await peticion.text()

    return texto === '' ? undefined : JSON.parse(texto) as unknown
  } catch {
    return undefined
  }
}

/**
 * Distingue el `401` que se arregla refrescando de los que no.
 *
 * Consume el cuerpo de la respuesta, asi que solo se llama cuando esa respuesta ya se va a descartar.
 */
async function esTokenVencido (respuesta: Response): Promise<boolean> {
  try {
    const cuerpo = await respuesta.clone().json() as { error?: { code?: string } }

    return cuerpo.error?.code === 'token_expired'
  } catch {
    return false
  }
}

/**
 * Refresca, distinguiendo el rechazo esperable del error de programacion.
 *
 * Solo un `ErrorApi` significa "hay que volver a entrar". Cualquier otra excepcion —un campo que la
 * respuesta no trae, una red caida— es un problema nuestro, y tragarla la disfrazaria de sesion
 * vencida: el sintoma seria gente expulsada sin motivo y sin rastro en ningun log.
 *
 * @returns La sesion nueva, o `null` si la API rechazo el refresco.
 * @throws Cualquier error que no venga de la API.
 */
async function intentarRefrescar (sesion: Sesion): Promise<Sesion | null> {
  try {
    return await refrescar(sesion)
  } catch (error) {
    if (error instanceof ErrorApi) {
      // Queda registrado: una sesion que se cierra sola es lo primero que se pregunta cuando alguien
      // reporta que "lo saco del sistema", y sin esta linea no hay nada que mirar.
      console.error(`[bff] refresco rechazado: ${error.codigo} — ${error.message}`)

      return null
    }

    throw error
  }
}
