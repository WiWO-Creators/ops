import { NextResponse, type NextRequest } from 'next/server'
import { llamarApiTipado } from '@/datos/api'
import { ErrorApi } from '@/datos/errores'
import { cabecerasDeOrigen } from '@/datos/origen'
import { guardarSesion, leerSesion } from '@/datos/sesion'
import { sesionDesdeTokens } from '@/datos/sobre-sesion'
import type { ParDeTokensConContacto } from '@/datos/tipos'

/**
 * Ver el portal como un contacto del cliente ("ver como cliente").
 *
 * Hermana de `/api/sesion/suplantar`, pero mas simple: la sesion prestada va en la cookie del portal
 * (`ops_portal`) y la del panel no se toca, asi que no hay sesion real que guardar para la vuelta.
 * Terminar es salir del portal (`DELETE /api/sesion?portal=1`), y quien suplanta sigue en su panel.
 *
 * Es ruta de servidor por la misma razon que la suplantacion del panel: `POST /impersonate` responde
 * un par de tokens, y los tokens no salen de este proceso. Quien decide si se puede es la API —exige
 * que el cliente del contacto sea visible para quien pide—, no esta ruta.
 */

interface CuerpoVerComoCliente {
  contactoId?: unknown
}

/**
 * Abre el portal con la sesion del contacto indicado.
 *
 * Si ya habia una sesion de portal en esta maquina (otra suplantacion, o el portal propio de un
 * contacto), se revoca antes de pisarla: la cookie se reemplaza igual, y dejar su token vivo sin
 * cookie que lo use es un token que sobra.
 *
 * @returns `{ ok: true, destino }` con la cookie ya escrita, o el error de la API tal cual llega.
 */
export async function POST (peticion: NextRequest): Promise<NextResponse> {
  const sesion = await leerSesion()

  if (sesion === null) {
    return NextResponse.json({ mensaje: 'No hay sesión.' }, { status: 401 })
  }

  let cuerpo: CuerpoVerComoCliente

  try {
    cuerpo = await peticion.json() as CuerpoVerComoCliente
  } catch {
    return NextResponse.json({ mensaje: 'Cuerpo inválido' }, { status: 400 })
  }

  const contactoId = Number(cuerpo.contactoId)

  if (!Number.isInteger(contactoId) || contactoId <= 0) {
    return NextResponse.json({ mensaje: 'Falta qué contacto ver.' }, { status: 400 })
  }

  try {
    const { data } = await llamarApiTipado<ParDeTokensConContacto>('/impersonate', {
      metodo: 'POST',
      token: sesion.acceso,
      cuerpo: { contact_id: contactoId },
      cabeceras: cabecerasDeOrigen(peticion.headers)
    })

    await revocarPortalAnterior()
    await guardarSesion(sesionDesdeTokens(data, data.contact.id, 'contacto'))

    return NextResponse.json({ ok: true, destino: '/portal' })
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
 * Revoca en la API la sesion de portal que esta maquina tenia abierta, si habia una.
 *
 * Un rechazo de la API (token ya vencido o revocado) no impide seguir: la cookie se reemplaza igual.
 */
async function revocarPortalAnterior (): Promise<void> {
  const anterior = await leerSesion('contacto')

  if (anterior === null) return

  try {
    await llamarApiTipado('/auth/logout', { metodo: 'POST', token: anterior.acceso })
  } catch (error) {
    if (!(error instanceof ErrorApi)) throw error
  }
}
