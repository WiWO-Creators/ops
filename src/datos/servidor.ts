import 'server-only'

import { redirect } from 'next/navigation'
import { llamarApiTipado } from './api'
import { ErrorApi } from './errores'
import { leerSesion } from './sesion'
import type { Sujeto } from './sobre-sesion'
import type { Sobre } from './tipos'

/** A donde mandar a quien no tenga sesion. Cada sujeto tiene su pantalla de acceso. */
const ENTRADA: Record<Sujeto, string> = {
  staff: '/colab',
  contacto: '/'
}

/**
 * Pide un recurso a la API desde el servidor, con el token de quien mira.
 *
 * Pensado para Server Components. **No refresca**: un Server Component no puede escribir cookies, asi
 * que el token que recibe ya viene fresco desde `proxy.ts`, que lo renueva por adelantado. Si aun asi
 * llega vencido —una pestaña que estuvo dormida mas que la ventana del proxy— manda a entrar.
 *
 * @param ruta Ruta relativa a la base de la API. Ej: `/tasks?per_page=25`.
 * @param sujeto De quien es la sesion con la que pedir. Por defecto la del panel.
 * @returns El sobre completo: `data` y, en los listados, `meta.pagination`.
 * @throws ErrorApi en cualquier error que no sea de autenticacion.
 */
export async function pedir<T> (ruta: string, sujeto: Sujeto = 'staff'): Promise<Sobre<T>> {
  const sesion = await leerSesion(sujeto)
  const entrada = ENTRADA[sujeto]

  if (sesion === null) redirect(entrada)

  try {
    return await llamarApiTipado<T>(ruta, { token: sesion.acceso })
  } catch (error) {
    if (error instanceof ErrorApi && (error.esRefrescable || error.exigeEntrar)) {
      redirect(entrada)
    }

    throw error
  }
}

/**
 * Lo mismo, con la sesion del portal.
 *
 * Existe para que ninguna pantalla del portal tenga que acordarse de pasar el sujeto: olvidarselo
 * seria pedir datos de cliente con el token del staff, y eso responderia 401 en el mejor caso y
 * datos ajenos en el peor.
 */
export async function pedirPortal<T> (ruta: string): Promise<Sobre<T>> {
  return await pedir<T>(ruta, 'contacto')
}
