import { NextResponse, type NextRequest } from 'next/server'
import { llamarApi } from '@/datos/api'
import { ErrorApi, incidenteDe } from '@/datos/errores'
import { registrarIncidente } from '@/datos/incidentes'
import { cabecerasDeOrigen } from '@/datos/origen'
import { rutaCompartida, rutaPermitida } from '@/datos/rutas'
import { borrarSesion, guardarSesion, leerSesion } from '@/datos/sesion'
import { refrescar } from '@/datos/refresco'
import type { Sesion, Sujeto } from '@/datos/sobre-sesion'
import type { SobreError } from '@/datos/tipos'

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

  // De que maquina es esta persona. Va en toda llamada porque la API lo necesita en dos momentos
  // distintos: al emitir o rotar una sesion, y en cada latido de presencia.
  const origen = cabecerasDeOrigen(peticion.headers)
  const cabeceras = { ...origen, ...cabecerasDeEntrada(peticion) }

  let respuesta = await llamarApi(destino, {
    metodo: peticion.method as 'GET',
    cuerpo,
    cabeceras,
    token: sesion.acceso
  })

  if (respuesta.status === 401 && await esTokenVencido(respuesta)) {
    const renovada = await intentarRefrescar(sesion, origen)

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
      cabeceras,
      token: renovada.acceso
    })
  }

  if (!respuesta.ok) {
    return await conIncidente(respuesta, destino, peticion.method, sujeto)
  }

  return new NextResponse(respuesta.body, {
    status: respuesta.status,
    headers: cabecerasDeSalida(respuesta)
  })
}

/**
 * Estados que NO se registran como incidente.
 *
 * Ninguno de estos es una falla del sistema: el `401` es la sesion, el `409` es un choque que la
 * pantalla explica —«ya existe una tarea con ese nombre»—, el `422` es el formulario incompleto y el
 * `429` es el freno pisado a proposito. Registrarlos llenaria la pantalla de Incidentes de cosas que
 * funcionaron como tenian que funcionar, y con eso dejaria de servir para encontrar las que no.
 */
const ESTADOS_ESPERADOS = new Set([401, 409, 422, 429])

/**
 * Reenvia un error de la API asegurandose de que lleve numero de incidente.
 *
 * Es la unica excepcion al «reenvia tal cual» del resto del proxy, y tiene un motivo: hasta ahora
 * un `403` inesperado o un `502` del proxy de la API no dejaban rastro en ninguna parte, y quien lo
 * sufria solo podia reportar «me dio error». La API ya registra sus propios `500` y devuelve el
 * codigo en `details.incidente`; esos pasan intactos y no se registran de nuevo. Los demas se
 * registran aca —contra la misma API, con la sesion de quien sufrio el error— y el codigo se agrega
 * al cuerpo, que es de donde lo lee el aviso flotante del navegador.
 *
 * Si el registro falla, el error original se devuelve igual: un incidente que no se pudo guardar no
 * puede convertir un `403` en una pantalla en blanco.
 *
 * @param respuesta la respuesta con error de la API
 * @param destino la ruta de la API que se llamo, con su consulta
 * @param metodo el metodo de la peticion que fallo
 * @param sujeto de quien era la sesion, para que el incidente diga a quien le paso
 */
async function conIncidente (
  respuesta: Response,
  destino: string,
  metodo: string,
  sujeto: Sujeto
): Promise<NextResponse> {
  const cabeceras = cabecerasDeSalida(respuesta)

  if (ESTADOS_ESPERADOS.has(respuesta.status)) {
    return new NextResponse(respuesta.body, { status: respuesta.status, headers: cabeceras })
  }

  const crudo = await respuesta.text()
  const sobre = sobreDeError(crudo)

  // La API ya lo guardo: su `details.incidente` es el del incidente con la traza real del servidor,
  // que vale mas que uno nuevo hecho desde aca.
  if (incidenteDe(sobre?.error?.details) !== undefined) {
    return new NextResponse(crudo, { status: respuesta.status, headers: cabeceras })
  }

  const incidente = await registrarIncidente(
    {
      tipo: 'RespuestaDeApi',
      mensaje: `${respuesta.status} ${sobre?.error?.code ?? 'sin_codigo'}: ${sobre?.error?.message ?? recorteDelCuerpo(crudo)}`,
      uri: destino,
      metodo
    },
    sujeto
  )

  if (incidente === null) {
    return new NextResponse(crudo, { status: respuesta.status, headers: cabeceras })
  }

  // Un cuerpo que no era el envelope —el HTML de un 502 de Apache, una respuesta vacia— se
  // reemplaza por uno que si lo es. El navegador ya no podia sacar nada de ese HTML, y asi al menos
  // se lleva el codigo del incidente.
  const cuerpo = sobre === null
    ? { error: { code: 'server_error', message: `El servidor respondió ${respuesta.status}`, details: { incidente } } }
    : { ...sobre, error: { ...sobre.error, details: { ...sobre.error.details, incidente } } }

  return NextResponse.json(cuerpo, { status: respuesta.status })
}

/** El cuerpo como envelope de error del contrato, o `null` si no lo era. */
function sobreDeError (crudo: string): SobreError | null {
  try {
    const cuerpo = JSON.parse(crudo) as SobreError

    return cuerpo.error?.code === undefined ? null : cuerpo
  } catch {
    return null
  }
}

/** Un trozo del cuerpo que no era JSON, para que el incidente diga algo del HTML que llego. */
function recorteDelCuerpo (crudo: string): string {
  const limpio = crudo.replace(/\s+/g, ' ').trim()

  return limpio === '' ? 'cuerpo vacío' : limpio.slice(0, 300)
}

/**
 * Deja pasar el `Accept: text/event-stream` del navegador, y solo ese.
 *
 * `llamarApi()` fija `accept: application/json` porque es lo que pide el 99% del panel. La API
 * decide si transmite mirando esa cabecera, asi que sin este reenvio un `POST /ia/inicio` pedido
 * como stream llegaria pidiendo JSON y volveria entero al final: el streaming no fallaria, no
 * existiria.
 *
 * Se reenvia solo ese valor y no el `Accept` crudo del navegador porque una navegacion manda
 * `text/html,...` y eso cambiaria la respuesta de cualquier ruta del BFF abierta en una pestaña.
 *
 * @param peticion la peticion del navegador
 * @returns las cabeceras extra para `llamarApi()`, vacio si no se pidio un stream
 */
function cabecerasDeEntrada (peticion: NextRequest): Record<string, string> {
  const acepta = peticion.headers.get('accept') ?? ''

  return acepta.startsWith('text/event-stream') ? { accept: 'text/event-stream' } : {}
}

/**
 * Cabeceras que el BFF copia de la API, ademas del `content-type`.
 *
 * `cache-control` porque un `no-cache, no-transform` que se pierde deja la respuesta a merced de
 * cualquier cache intermedia. `x-accel-buffering` porque es la unica forma de decirle a Nginx que
 * no acumule un `text/event-stream`: sin ella el proxy junta la respuesta entera y la entrega de
 * una sola vez, asi que el streaming desaparece **sin dar ningun error** — el front recibe todo el
 * texto junto al final y parece un backend lento.
 *
 * Es una lista corta y explicita, no un reenvio de todo: `content-length` y `content-encoding`
 * describen el cuerpo que Node ya recodifico, y copiarlos rompe la respuesta.
 */
const CABECERAS_REENVIADAS = ['cache-control', 'x-accel-buffering'] as const

/**
 * Arma las cabeceras de la respuesta del BFF a partir de las de la API.
 *
 * @param respuesta la respuesta de la API v1
 * @returns el `content-type` mas las cabeceras de la lista que la API haya emitido
 */
function cabecerasDeSalida (respuesta: Response): Headers {
  const salida = new Headers({
    'content-type': respuesta.headers.get('content-type') ?? 'application/json'
  })

  for (const nombre of CABECERAS_REENVIADAS) {
    const valor = respuesta.headers.get(nombre)

    if (valor !== null) salida.set(nombre, valor)
  }

  return salida
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
async function intentarRefrescar (sesion: Sesion, origen: Record<string, string>): Promise<Sesion | null> {
  try {
    return await refrescar(sesion, origen)
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
