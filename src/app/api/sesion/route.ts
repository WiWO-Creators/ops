import { NextResponse, type NextRequest } from 'next/server'
import { llamarApiTipado } from '@/datos/api'
import { claveSesion } from '@/datos/config'
import { ErrorApi } from '@/datos/errores'
import { cabecerasDeOrigen } from '@/datos/origen'
import { borrarSesion, borrarSuplantador, guardarSesion, leerSesion } from '@/datos/sesion'
import { sesionDesdeTokens } from '@/datos/sobre-sesion'
import { abrirTraspaso, claveTraspaso } from '@/datos/traspaso'
import { esAppNativa } from '@/lib/app-nativa'
import {
  esDesafio,
  esDesafioPortal,
  type DesafioPortal,
  type DesafioSegundoFactor,
  type ParDeTokensConContacto,
  type ParDeTokensConStaff,
  type YoPortal
} from '@/datos/tipos'

/**
 * El unico lugar del proyecto que ve los tokens de la API.
 *
 * `POST` entra (con o sin segundo factor) y `DELETE` sale. En ningun caso el token viaja al
 * navegador: se cifra dentro de la cookie de sesion.
 */

/**
 * Las cabeceras que le dicen a la API de que maquina es quien entra (`datos/origen.ts`).
 *
 * Viajan por parametro y no se recalculan en cada rama: la peticion es una sola, y recalcularlas
 * seria la forma de que una rama se olvide y esa sesion quede con la IP del servidor.
 */
type Cabeceras = Record<string, string>

interface CuerpoEntrar {
  email?: unknown
  password?: unknown
  challenge_token?: unknown
  code?: unknown
  /** `true` cuando quien entra es un contacto de cliente y no alguien del equipo. */
  portal?: unknown
  /** El token del enlace de un solo uso. Su presencia elige la rama de canje. */
  enlace?: unknown
  /** `true` junto a `portal` pide otro codigo del segundo factor del contacto. */
  reenviar?: unknown
  /**
   * El ID token (un JWT) que Google Identity Services entrega en el callback del boton.
   *
   * Es una credencial: entra, se reenvia a la API y muere aca. Nunca vuelve al navegador ni se
   * escribe en un log, igual que la contraseña.
   */
  google?: unknown
  /** El código sellado con que la app nativa trae su login de Google desde Chrome (`datos/traspaso.ts`). */
  traspaso?: unknown
  /** El verifier PKCE que acompaña a `traspaso`. */
  verifier?: unknown
}

/**
 * Entra al sistema.
 *
 * Con `email` y `password` llama a `/auth/login`; con `google`, a `/auth/google`; con el codigo
 * guardado y `code`, a `/auth/2fa`.
 *
 * @returns `{ segundoFactor: true, method }` cuando falta el codigo, o `{ ok: true }` cuando la
 *          sesion quedo abierta. El `challenge_token` **no** se devuelve al navegador: se guarda en
 *          su propia cookie de corta vida.
 */
export async function POST (peticion: NextRequest): Promise<NextResponse> {
  let cuerpo: CuerpoEntrar

  try {
    cuerpo = await peticion.json() as CuerpoEntrar
  } catch {
    return NextResponse.json({ error: 'Cuerpo invalido' }, { status: 400 })
  }

  const codigo = typeof cuerpo.code === 'string' ? cuerpo.code.trim() : ''
  // Entrar es lo que CREA la fila de sesion que despues se lee en /auditoria: si el origen no viaja
  // en esta llamada, la auditoria guarda la IP de este servidor y ya no hay donde recuperarla.
  const origen = cabecerasDeOrigen(peticion.headers)

  try {
    // El canje va primero: es la unica rama que no tiene credenciales que mirar. Despues el portal,
    // que lleva su propio segundo factor (por correo, solo si su cliente lo enciende) y por eso se
    // decide antes que el codigo del equipo. Google va tercero: es del
    // equipo, asi que nunca compite con el portal, y trae su propia credencial en vez de correo mas
    // contraseña, asi que tiene que decidirse antes que la rama de clave —que exige los dos campos y
    // rechazaria la peticion por vacia. El traspaso de la app es Google por otra puerta y va justo antes.
    const respuesta = typeof cuerpo.enlace === 'string'
      ? await canjearEnlace(cuerpo, origen)
      : cuerpo.portal === true
        ? await entrarAlPortal(peticion, cuerpo, codigo, origen)
        : typeof cuerpo.traspaso === 'string'
          ? await entrarConTraspaso(peticion, cuerpo, origen)
          : typeof cuerpo.google === 'string'
            ? await entrarConGoogle(cuerpo.google, origen)
            : codigo === ''
              ? await entrarConClave(cuerpo, origen)
              : await entrarConCodigo(peticion, codigo, origen)

    return respuesta
  } catch (error) {
    if (error instanceof ErrorApi) {
      return NextResponse.json(
        { codigo: error.codigo, mensaje: error.message },
        { status: error.estado }
      )
    }

    throw error
  }
}

/** Sale. Revoca el token en la API y borra la cookie pase lo que pase. */
export async function DELETE (peticion: NextRequest): Promise<NextResponse> {
  const sujeto = peticion.nextUrl.searchParams.get('portal') === '1' ? 'contacto' : 'staff'
  const sesion = await leerSesion(sujeto)
  const todas = peticion.nextUrl.searchParams.get('todas') === '1'

  if (sesion !== null) {
    try {
      await llamarApiTipado(`/auth/logout${todas ? '?all=1' : ''}`, {
        metodo: 'POST',
        token: sesion.acceso
      })
    } catch (error) {
      // Que la API rechace el logout (token ya vencido, por ejemplo) no puede impedir salir: lo que
      // decide si la persona sigue adentro es la cookie, y esa se borra igual.
      if (!(error instanceof ErrorApi)) throw error
    }
  }

  await borrarSesion(sujeto)

  // Salir mientras se mira el panel como otra persona sale de las DOS: dejar la cookie de la sesion
  // real viva significaria que el proximo que entre en esa maquina vea el aviso de suplantacion sobre
  // una sesion que no es la suya.
  if (sujeto === 'staff') await borrarSuplantador()

  return NextResponse.json({ ok: true })
}

/**
 * Canjea el enlace de un solo uso: el contacto fija su clave y queda adentro.
 *
 * Es el reemplazo de la contraseña dictada por WhatsApp. Va acá y no en una ruta propia del BFF
 * porque `/auth/*` esta fuera de su lista blanca a proposito: los tokens de la API no pueden pasar
 * por el proxy generico, y este archivo es el unico del proyecto que los ve.
 *
 * La API responde exactamente lo mismo que `/auth/portal/login`, asi que la sesion se guarda igual:
 * cookie del contacto, no la del equipo. Si el cliente del contacto exige el segundo factor, la clave
 * queda fijada pero la sesion no se abre: la respuesta es el desafio del codigo por correo.
 */
async function canjearEnlace (cuerpo: CuerpoEntrar, origen: Cabeceras): Promise<NextResponse> {
  const enlace = typeof cuerpo.enlace === 'string' ? cuerpo.enlace.trim() : ''
  const password = typeof cuerpo.password === 'string' ? cuerpo.password : ''

  if (enlace === '' || password === '') {
    return NextResponse.json({ mensaje: 'Falta el enlace o la contraseña' }, { status: 400 })
  }

  const { data } = await llamarApiTipado<ParDeTokensConContacto | DesafioPortal>('/auth/portal/access-link', {
    metodo: 'POST',
    cuerpo: { token: enlace, password },
    cabeceras: origen
  })

  return await abrirSesionDeContacto(data)
}

/**
 * Entra al portal del cliente.
 *
 * Elige entre las llamadas del portal: clave (primer paso), Google (credencial en `google`), codigo
 * (segundo paso) o reenvio del codigo. Escribe la cookie `ops_portal`, distinta de la del panel, asi que alguien del equipo puede
 * tener las dos sesiones abiertas a la vez sin que una pise a la otra.
 */
async function entrarAlPortal (
  peticion: NextRequest,
  cuerpo: CuerpoEntrar,
  codigo: string,
  origen: Cabeceras
): Promise<NextResponse> {
  if (cuerpo.reenviar === true) return await reenviarCodigoDelPortal(peticion, origen)
  if (codigo !== '') return await entrarAlPortalConCodigo(peticion, codigo, origen)
  if (typeof cuerpo.google === 'string') return await entrarAlPortalConGoogle(cuerpo.google, origen)

  return await entrarAlPortalConClave(cuerpo, origen)
}

/**
 * Entra al portal con la cuenta de Google del contacto.
 *
 * `/auth/portal/google` responde igual que `/auth/portal/login`, asi que el cierre es el mismo
 * (`abrirSesionDeContacto`) y no se duplica. No trae segundo factor: el que pone la organizacion en
 * Google reemplaza al codigo por correo. Quien decide si la cuenta entra —firma, dominio, cliente,
 * estado del contacto— es la API; con el interruptor global apagado contesta `404`, y esa respuesta
 * llega a la pantalla tal cual para que ofrezca la contraseña.
 *
 * @param credential el ID token de Google. Se reenvia tal cual y no se registra en ningun lado.
 */
async function entrarAlPortalConGoogle (credential: string, origen: Cabeceras): Promise<NextResponse> {
  if (credential.trim() === '') {
    return NextResponse.json({ mensaje: 'Falta la credencial de Google' }, { status: 400 })
  }

  const { data } = await llamarApiTipado<ParDeTokensConContacto | DesafioPortal>('/auth/portal/google', {
    metodo: 'POST',
    cuerpo: { credential },
    cabeceras: origen
  })

  return await abrirSesionDeContacto(data)
}

/**
 * Primer paso del portal: correo y contraseña.
 *
 * Un solo paso, salvo que el cliente del contacto tenga encendido el segundo factor por correo: en
 * ese caso la API no abre sesion y devuelve el desafio, que se guarda en su cookie.
 */
async function entrarAlPortalConClave (cuerpo: CuerpoEntrar, origen: Cabeceras): Promise<NextResponse> {
  const email = typeof cuerpo.email === 'string' ? cuerpo.email.trim() : ''
  const password = typeof cuerpo.password === 'string' ? cuerpo.password : ''

  if (email === '' || password === '') {
    return NextResponse.json({ mensaje: 'Correo y contraseña son obligatorios' }, { status: 400 })
  }

  const { data } = await llamarApiTipado<ParDeTokensConContacto | DesafioPortal>('/auth/portal/login', {
    metodo: 'POST',
    cuerpo: { email, password },
    cabeceras: origen
  })

  return await abrirSesionDeContacto(data)
}

/**
 * Segundo paso del portal: canjea el codigo del correo por la sesion del contacto.
 *
 * El desafio vive solo en su cookie `httpOnly`, igual que el del equipo. Si falta, el unico camino es
 * volver a poner la contraseña.
 */
async function entrarAlPortalConCodigo (
  peticion: NextRequest,
  codigo: string,
  origen: Cabeceras
): Promise<NextResponse> {
  const desafio = peticion.cookies.get(COOKIE_DESAFIO_PORTAL)?.value

  if (desafio === undefined) return desafioVencido()

  const { data } = await llamarApiTipado<ParDeTokensConContacto>('/auth/portal/2fa', {
    metodo: 'POST',
    cuerpo: { challenge_token: desafio, code: codigo },
    cabeceras: origen
  })

  await guardarSesion(sesionDesdeTokens(data, data.contact.id, 'contacto'))

  const respuesta = NextResponse.json({ ok: true, destino: await destinoDelContacto(data.access_token) })
  respuesta.cookies.delete(COOKIE_DESAFIO_PORTAL)

  return respuesta
}

/** Pide otro codigo para el desafio en curso. No abre sesion ni cambia el desafio. */
async function reenviarCodigoDelPortal (peticion: NextRequest, origen: Cabeceras): Promise<NextResponse> {
  const desafio = peticion.cookies.get(COOKIE_DESAFIO_PORTAL)?.value

  if (desafio === undefined) return desafioVencido()

  const { data } = await llamarApiTipado<ReenvioDelPortal>('/auth/portal/2fa/resend', {
    metodo: 'POST',
    cuerpo: { challenge_token: desafio },
    cabeceras: origen
  })

  return NextResponse.json({
    ok: true,
    pista: data.email_hint,
    venceEn: data.code_expires_in,
    espera: data.resend_in,
    reenvios: data.resends_left,
    entrega: data.delivery
  })
}

/**
 * Cierra el primer paso del portal, venga de la clave o del enlace de acceso.
 *
 * Las dos puertas comparten el final porque comparten la respuesta de la API, y tenerlo una sola vez
 * es lo que garantiza que el segundo factor no se pueda saltear por la puerta del enlace.
 *
 * @returns `{ segundoFactor: true, ... }` con el desafio guardado en su cookie (el token NO viaja al
 *          navegador), o `{ ok: true, destino }` con la sesion ya abierta.
 */
async function abrirSesionDeContacto (data: ParDeTokensConContacto | DesafioPortal): Promise<NextResponse> {
  if (esDesafioPortal(data)) {
    const respuesta = NextResponse.json({
      segundoFactor: true,
      pista: data.email_hint,
      venceEn: data.code_expires_in,
      espera: data.resend_in,
      reenvios: data.resends_left,
      entrega: data.delivery
    })

    // Dura lo mismo que el desafio en la API (15 minutos): da margen para pedir otro codigo.
    respuesta.cookies.set(COOKIE_DESAFIO_PORTAL, data.challenge_token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: 900
    })

    return respuesta
  }

  await guardarSesion(sesionDesdeTokens(data, data.contact.id, 'contacto'))

  return NextResponse.json({ ok: true, destino: await destinoDelContacto(data.access_token) })
}

/** El desafio del portal no esta (vencio la cookie o nunca hubo): hay que empezar de nuevo. */
function desafioVencido (): NextResponse {
  return NextResponse.json(
    { codigo: 'challenge_exhausted', mensaje: 'El código venció. Vuelve a entrar con tu correo y contraseña.' },
    { status: 401 }
  )
}

/**
 * A que pantalla del portal mandar a este contacto recien entrado.
 *
 * === POR QUE SE DECIDE ACA Y NO EN LA PORTADA DEL PORTAL ===
 *
 * Porque «abrir un Proyecto al entrar» es una cosa que pasa AL ENTRAR, una vez. Resolverlo en
 * `/portal` —rebotando cada visita a la portada— le sacaria al contacto el Inicio de su portal para
 * siempre: el enlace «Inicio» de su propia navegacion dejaria de llevarlo a ninguna parte, y
 * recuperarlo pediria un parametro de escape que nadie sabria que existe. Decidido aca, el
 * contacto cae adentro de su Proyecto al entrar y despues navega su portal entero como siempre.
 *
 * === POR QUE UN VIAJE MAS Y NO UN CAMPO EN LA RESPUESTA DEL LOGIN ===
 *
 * Porque `proyecto_de_entrada` ya vive en `/portal/me`, que es donde vive todo lo que el portal
 * sabe de su contacto, y duplicarlo en la respuesta del login serian dos lugares que se pueden
 * contradecir. El viaje extra ocurre una vez por sesion, en la pantalla de entrar, que es la unica
 * del portal donde nadie esta esperando datos.
 *
 * Si ese viaje falla, el contacto entra igual: ya tiene su cookie, y la portada es un destino
 * perfectamente valido. Un login que se cae por no poder resolver un atajo seria mucho peor que el
 * atajo que no se aplico.
 *
 * @param token el token de acceso recien emitido, que todavia no esta en ninguna cookie legible
 * @returns la ruta a la que ir, o `null` para que el navegador use la que ya usaba
 */
async function destinoDelContacto (token: string): Promise<string | null> {
  try {
    const { data: yo } = await llamarApiTipado<YoPortal>('/portal/me', { token })

    return yo.proyecto_de_entrada === null ? null : `/portal/proyectos/${yo.proyecto_de_entrada.id}`
  } catch {
    return null
  }
}


async function entrarConClave (cuerpo: CuerpoEntrar, origen: Cabeceras): Promise<NextResponse> {
  const email = typeof cuerpo.email === 'string' ? cuerpo.email.trim() : ''
  const password = typeof cuerpo.password === 'string' ? cuerpo.password : ''

  if (email === '' || password === '') {
    return NextResponse.json({ mensaje: 'Correo y contraseña son obligatorios' }, { status: 400 })
  }

  const { data } = await llamarApiTipado<ParDeTokensConStaff | DesafioSegundoFactor>('/auth/login', {
    metodo: 'POST',
    cuerpo: { email, password },
    cabeceras: origen
  })

  return await abrirSesionDeStaff(data)
}

/**
 * Entra con la cuenta de Google del equipo.
 *
 * `/auth/google` responde exactamente igual que `/auth/login` —los mismos tokens o el mismo desafio
 * de segundo factor—, asi que el cierre es el mismo y no se duplica: quien decide si la cuenta puede
 * entrar y si su dominio esta permitido es la API, no esta ruta.
 *
 * @param credential el ID token de Google. Se reenvia tal cual y no se registra en ningun lado.
 */
async function entrarConGoogle (credential: string, origen: Cabeceras): Promise<NextResponse> {
  if (credential.trim() === '') {
    return NextResponse.json({ mensaje: 'Falta la credencial de Google' }, { status: 400 })
  }

  const { data } = await llamarApiTipado<ParDeTokensConStaff | DesafioSegundoFactor>('/auth/google', {
    metodo: 'POST',
    cuerpo: { credential },
    cabeceras: origen
  })

  return await abrirSesionDeStaff(data)
}

/**
 * Entra con el login de Google que la app nativa hizo en Chrome.
 *
 * Abre el código con el verifier y sigue exactamente como el botón de Google: misma llamada a
 * `/auth/google`, mismo segundo factor. Solo la app tiene motivo para pedirlo.
 */
async function entrarConTraspaso (peticion: NextRequest, cuerpo: CuerpoEntrar, origen: Cabeceras): Promise<NextResponse> {
  if (!esAppNativa(peticion.headers.get('user-agent'))) {
    return NextResponse.json({ mensaje: 'Solo la app de Ops entra por esta vía.' }, { status: 403 })
  }

  const verifier = typeof cuerpo.verifier === 'string' ? cuerpo.verifier : ''
  const credencial = abrirTraspaso(String(cuerpo.traspaso), verifier, claveTraspaso(claveSesion()))

  if (credencial === null) {
    return NextResponse.json(
      { mensaje: 'El acceso con Google venció o no es válido. Vuelve a intentarlo.' },
      { status: 400 }
    )
  }

  return await entrarConGoogle(credencial, origen)
}

/**
 * Cierra el acceso del equipo, venga de la clave o de Google.
 *
 * Las dos vias comparten el mismo final porque comparten la misma respuesta de la API, y tenerlo una
 * sola vez es lo que garantiza que el segundo factor no se pueda saltear por la puerta nueva.
 *
 * @returns `{ segundoFactor: true, method }` con el desafio guardado en su cookie, o `{ ok: true }`
 *          con la sesion ya abierta.
 */
async function abrirSesionDeStaff (
  data: ParDeTokensConStaff | DesafioSegundoFactor
): Promise<NextResponse> {
  if (esDesafio(data)) {
    const respuesta = NextResponse.json({ segundoFactor: true, method: data.method })

    // Vive 5 minutos, igual que el desafio en la API. Tampoco este llega al JavaScript de la pagina.
    respuesta.cookies.set(COOKIE_DESAFIO, data.challenge_token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: 300
    })

    return respuesta
  }

  await guardarSesion(sesionDesdeTokens(data, data.staff.id, 'staff'))

  return NextResponse.json({ ok: true })
}

async function entrarConCodigo (peticion: NextRequest, codigo: string, origen: Cabeceras): Promise<NextResponse> {
  const desafio = peticion.cookies.get(COOKIE_DESAFIO)?.value

  if (desafio === undefined) {
    return NextResponse.json(
      { mensaje: 'El desafio vencio. Vuelve a entrar con tu correo y contraseña.' },
      { status: 400 }
    )
  }

  const { data } = await llamarApiTipado<ParDeTokensConStaff>('/auth/2fa', {
    metodo: 'POST',
    cuerpo: { challenge_token: desafio, code: codigo },
    cabeceras: origen
  })

  await guardarSesion(sesionDesdeTokens(data, data.staff.id, 'staff'))

  const respuesta = NextResponse.json({ ok: true })
  respuesta.cookies.delete(COOKIE_DESAFIO)

  return respuesta
}

const COOKIE_DESAFIO = 'ops_desafio'

/** Cookie propia del desafio del portal: el del equipo y el del contacto pueden convivir en un navegador. */
const COOKIE_DESAFIO_PORTAL = 'ops_desafio_portal'

/** Lo que responde `POST /auth/portal/2fa/resend`. */
interface ReenvioDelPortal {
  code_expires_in: number
  resend_in: number
  resends_left: number
  email_hint: string
  delivery: 'real' | 'prueba'
}
