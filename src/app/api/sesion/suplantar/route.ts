import { NextResponse, type NextRequest } from 'next/server'
import { llamarApiTipado } from '@/datos/api'
import { ErrorApi } from '@/datos/errores'
import {
  borrarSuplantador,
  guardarSesion,
  guardarSuplantador,
  leerSesion,
  leerSuplantador
} from '@/datos/sesion'
import { sesionDesdeTokens } from '@/datos/sobre-sesion'
import type { ParDeTokensConStaff } from '@/datos/tipos'

/**
 * Ver el panel como otra persona, y volver.
 *
 * Es una ruta de servidor y no una llamada del BFF por la misma razon que `/api/sesion`: la respuesta
 * de `POST /impersonate` es un par de tokens, y los tokens no salen de este proceso. `impersonate`
 * tampoco esta en la lista blanca del BFF (`datos/rutas.ts`), asi que el navegador no tiene forma de
 * pedirlo por su cuenta ni aunque alguien lo intente a mano.
 *
 * Quien decide si esto se puede hacer es la API —exige superadministrador— y no esta ruta. Acá solo
 * se administran las dos cookies: la de la sesion en uso y la de la sesion real que espera la vuelta.
 */

interface CuerpoSuplantar {
  staffId?: unknown
}

/**
 * Entra como la persona indicada.
 *
 * @returns `{ ok: true }` con las cookies ya cambiadas, o el error de la API tal cual llega.
 */
export async function POST (peticion: NextRequest): Promise<NextResponse> {
  const sesion = await leerSesion()

  if (sesion === null) {
    return NextResponse.json({ mensaje: 'No hay sesión.' }, { status: 401 })
  }

  // Suplantar mientras se suplanta pisaria la sesion real guardada con una prestada, y la vuelta
  // terminaria en la cuenta equivocada. Se corta acá en vez de anidar: nadie necesita dos saltos.
  if (await leerSuplantador() !== null) {
    return NextResponse.json(
      { mensaje: 'Ya estás viendo el panel como otra persona. Volvé a tu cuenta primero.' },
      { status: 409 }
    )
  }

  let cuerpo: CuerpoSuplantar

  try {
    cuerpo = await peticion.json() as CuerpoSuplantar
  } catch {
    return NextResponse.json({ mensaje: 'Cuerpo inválido' }, { status: 400 })
  }

  const staffId = Number(cuerpo.staffId)

  if (!Number.isInteger(staffId) || staffId <= 0) {
    return NextResponse.json({ mensaje: 'Falta a quién suplantar.' }, { status: 400 })
  }

  try {
    const { data } = await llamarApiTipado<ParDeTokensConStaff>('/impersonate', {
      metodo: 'POST',
      token: sesion.acceso,
      cuerpo: { staff_id: staffId }
    })

    // La real primero: si el proceso se cortara entre las dos escrituras, es preferible tener la
    // vuelta guardada de mas que la sesion cambiada sin vuelta.
    await guardarSuplantador(sesion)
    await guardarSesion(sesionDesdeTokens(data, data.staff.id, 'staff'))

    return NextResponse.json({ ok: true, nombre: data.staff.full_name })
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

/**
 * Vuelve a la cuenta propia.
 *
 * Revoca antes la sesion prestada: si no, quedaria viva una hora (y su refresco, treinta dias) sin
 * que nadie la use, que es exactamente la clase de token que sobra.
 */
export async function DELETE (): Promise<NextResponse> {
  const real = await leerSuplantador()

  if (real === null) {
    return NextResponse.json({ mensaje: 'No estás suplantando a nadie.' }, { status: 400 })
  }

  const prestada = await leerSesion()

  if (prestada !== null) {
    try {
      await llamarApiTipado('/auth/logout', { metodo: 'POST', token: prestada.acceso })
    } catch (error) {
      // Que la API no pueda revocar (token ya vencido, por ejemplo) no puede dejar a nadie atrapado
      // en la cuenta de otro: la vuelta la decide la cookie, y esa se reescribe igual.
      if (!(error instanceof ErrorApi)) throw error
    }
  }

  await guardarSesion(real)
  await borrarSuplantador()

  return NextResponse.json({ ok: true })
}
