import 'server-only'

import { redirect } from 'next/navigation'
import { llamarApiTipado } from './api'
import { ErrorApi } from './errores'
import { leerSesion } from './sesion'
import type { Sobre } from './tipos'

/**
 * Pide un recurso a la API desde el servidor, con el token de quien mira.
 *
 * Pensado para Server Components. **No refresca**: un Server Component no puede escribir cookies, asi
 * que el token que recibe ya viene fresco desde `proxy.ts`, que lo renueva por adelantado. Si aun asi
 * llega vencido —una pestaña que estuvo dormida mas que la ventana del proxy— manda a entrar.
 *
 * @param ruta Ruta relativa a la base de la API. Ej: `/tasks?per_page=25`.
 * @returns El sobre completo: `data` y, en los listados, `meta.pagination`.
 * @throws ErrorApi en cualquier error que no sea de autenticacion.
 */
export async function pedir<T> (ruta: string): Promise<Sobre<T>> {
  const sesion = await leerSesion()

  if (sesion === null) redirect('/entrar')

  try {
    return await llamarApiTipado<T>(ruta, { token: sesion.acceso })
  } catch (error) {
    if (error instanceof ErrorApi && (error.esRefrescable || error.exigeEntrar)) {
      redirect('/entrar')
    }

    throw error
  }
}
