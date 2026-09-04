import { NextResponse, type NextRequest } from 'next/server'
import { llamarApiTipado } from '@/datos/api'
import { ErrorApi } from '@/datos/errores'
import { borrarSesion, guardarSesion, leerSesion } from '@/datos/sesion'
import { sesionDesdeTokens } from '@/datos/sobre-sesion'
import {
  esDesafio,
  type ContactoPortal,
  type DesafioSegundoFactor,
  type ParDeTokensConContacto,
  type ParDeTokensConStaff
} from '@/datos/tipos'

/**
 * El unico lugar del proyecto que ve los tokens de la API.
 *
 * `POST` entra (con o sin segundo factor) y `DELETE` sale. En ningun caso el token viaja al
 * navegador: se cifra dentro de la cookie de sesion.
 */

interface CuerpoEntrar {
  email?: unknown
  password?: unknown
  challenge_token?: unknown
  code?: unknown
  /** `true` cuando quien entra es un contacto de cliente y no alguien del equipo. */
  portal?: unknown
  /** El token del enlace de un solo uso. Su presencia elige la rama de canje. */
  enlace?: unknown
  /**
   * El ID token (un JWT) que Google Identity Services entrega en el callback del boton.
   *
   * Es una credencial: entra, se reenvia a la API y muere aca. Nunca vuelve al navegador ni se
   * escribe en un log, igual que la contraseña.
   */
  google?: unknown
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

  try {
    // El canje va primero: es la unica rama que no tiene credenciales que mirar. Despues el portal,
    // que no tiene segundo factor y por eso se decide antes que el codigo. Google va tercero: es del
    // equipo, asi que nunca compite con el portal, y trae su propia credencial en vez de correo mas
    // contraseña, asi que tiene que decidirse antes que la rama de clave —que exige los dos campos y
    // rechazaria la peticion por vacia.
    const respuesta = typeof cuerpo.enlace === 'string'
      ? await canjearEnlace(cuerpo)
      : cuerpo.portal === true
        ? await entrarAlPortal(cuerpo)
        : typeof cuerpo.google === 'string'
          ? await entrarConGoogle(cuerpo.google)
          : codigo === ''
            ? await entrarConClave(cuerpo)
            : await entrarConCodigo(peticion, codigo)

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
 * cookie del contacto, no la del equipo.
 */
async function canjearEnlace (cuerpo: CuerpoEntrar): Promise<NextResponse> {
  const enlace = typeof cuerpo.enlace === 'string' ? cuerpo.enlace.trim() : ''
  const password = typeof cuerpo.password === 'string' ? cuerpo.password : ''

  if (enlace === '' || password === '') {
    return NextResponse.json({ mensaje: 'Falta el enlace o la contraseña' }, { status: 400 })
  }

  const { data } = await llamarApiTipado<ParDeTokensConContacto>('/auth/portal/access-link', {
    metodo: 'POST',
    cuerpo: { token: enlace, password }
  })

  await guardarSesion(sesionDesdeTokens(data, data.contact.id, 'contacto'))

  return NextResponse.json({ ok: true, contacto: contactoResumido(data.contact) })
}

/**
 * Entra al portal del cliente.
 *
 * Un solo paso: los contactos no tienen segundo factor. Escribe la cookie `ops_portal`, distinta de
 * la del panel, asi que alguien del equipo puede tener las dos sesiones abiertas a la vez sin que
 * una pise a la otra.
 */
async function entrarAlPortal (cuerpo: CuerpoEntrar): Promise<NextResponse> {
  const email = typeof cuerpo.email === 'string' ? cuerpo.email.trim() : ''
  const password = typeof cuerpo.password === 'string' ? cuerpo.password : ''

  if (email === '' || password === '') {
    return NextResponse.json({ mensaje: 'Correo y contraseña son obligatorios' }, { status: 400 })
  }

  const { data } = await llamarApiTipado<ParDeTokensConContacto>('/auth/portal/login', {
    metodo: 'POST',
    cuerpo: { email, password }
  })

  await guardarSesion(sesionDesdeTokens(data, data.contact.id, 'contacto'))

  return NextResponse.json({ ok: true, contacto: contactoResumido(data.contact) })
}

/** Lo minimo que la pantalla de entrar necesita saber para decidir a donde mandar. */
function contactoResumido (contacto: ContactoPortal): { verificado: boolean } {
  return { verificado: contacto.email_verified }
}

async function entrarConClave (cuerpo: CuerpoEntrar): Promise<NextResponse> {
  const email = typeof cuerpo.email === 'string' ? cuerpo.email.trim() : ''
  const password = typeof cuerpo.password === 'string' ? cuerpo.password : ''

  if (email === '' || password === '') {
    return NextResponse.json({ mensaje: 'Correo y contraseña son obligatorios' }, { status: 400 })
  }

  const { data } = await llamarApiTipado<ParDeTokensConStaff | DesafioSegundoFactor>('/auth/login', {
    metodo: 'POST',
    cuerpo: { email, password }
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
async function entrarConGoogle (credential: string): Promise<NextResponse> {
  if (credential.trim() === '') {
    return NextResponse.json({ mensaje: 'Falta la credencial de Google' }, { status: 400 })
  }

  const { data } = await llamarApiTipado<ParDeTokensConStaff | DesafioSegundoFactor>('/auth/google', {
    metodo: 'POST',
    cuerpo: { credential }
  })

  return await abrirSesionDeStaff(data)
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

async function entrarConCodigo (peticion: NextRequest, codigo: string): Promise<NextResponse> {
  const desafio = peticion.cookies.get(COOKIE_DESAFIO)?.value

  if (desafio === undefined) {
    return NextResponse.json(
      { mensaje: 'El desafio vencio. Volvé a entrar con tu correo y contraseña.' },
      { status: 400 }
    )
  }

  const { data } = await llamarApiTipado<ParDeTokensConStaff>('/auth/2fa', {
    metodo: 'POST',
    cuerpo: { challenge_token: desafio, code: codigo }
  })

  await guardarSesion(sesionDesdeTokens(data, data.staff.id, 'staff'))

  const respuesta = NextResponse.json({ ok: true })
  respuesta.cookies.delete(COOKIE_DESAFIO)

  return respuesta
}

const COOKIE_DESAFIO = 'ops_desafio'
