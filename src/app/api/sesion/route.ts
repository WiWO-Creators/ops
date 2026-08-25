import { NextResponse, type NextRequest } from 'next/server'
import { llamarApiTipado } from '@/datos/api'
import { ErrorApi } from '@/datos/errores'
import { borrarSesion, guardarSesion, leerSesion } from '@/datos/sesion'
import { sesionDesdeTokens } from '@/datos/sobre-sesion'
import { esDesafio, type DesafioSegundoFactor, type ParDeTokensConStaff } from '@/datos/tipos'

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
}

/**
 * Entra al sistema.
 *
 * Con `email` y `password` llama a `/auth/login`; con `challenge_token` y `code`, a `/auth/2fa`.
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
    const respuesta = codigo === ''
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
  const sesion = await leerSesion()
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

  await borrarSesion()

  return NextResponse.json({ ok: true })
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

  await guardarSesion(sesionDesdeTokens(data, data.staff.id))

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

  await guardarSesion(sesionDesdeTokens(data, data.staff.id))

  const respuesta = NextResponse.json({ ok: true })
  respuesta.cookies.delete(COOKIE_DESAFIO)

  return respuesta
}

const COOKIE_DESAFIO = 'ops_desafio'
