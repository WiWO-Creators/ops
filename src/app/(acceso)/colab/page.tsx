import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { llamarApiTipado } from '@/datos/api'
import { leerSesion } from '@/datos/sesion'
import type { AccesoGoogle } from '@/datos/tipos'
import { FormularioEntrar } from './FormularioEntrar'

export const metadata: Metadata = { title: 'Entrar · WiWO Ops' }

/** Lo que se asume cuando la API no contesta: la pantalla de siempre, sin boton de Google. */
const SIN_GOOGLE: AccesoGoogle = { enabled: false, client_id: null }

/**
 * Acceso del equipo.
 *
 * Vive en `/colab` y no en la raiz porque la raiz es del cliente. Igual que la del portal, la ruta
 * queda fuera del guardia y mira la cookie por su cuenta para no mostrarle el formulario a quien ya
 * tiene sesion.
 */
export default async function EntrarPage () {
  if (await leerSesion('staff') !== null) redirect('/inicio')

  return <FormularioEntrar google={await accesoGoogle()} />
}

/**
 * Pregunta a la API si la entrada con Google esta habilitada.
 *
 * Se consulta aca y no en el cliente porque `/auth/*` esta fuera de la lista blanca del BFF: el
 * unico que puede tocar esa familia de rutas es este archivo —sin token, el endpoint es publico— y
 * `/api/sesion`.
 *
 * Cualquier fallo cae a `SIN_GOOGLE` en vez de propagarse: si la API esta caida o el endpoint
 * todavia no se desplego, la pantalla tiene que seguir dejando entrar con correo y contraseña. Un
 * boton de mas nunca puede costar el formulario entero.
 *
 * @returns el acceso ya normalizado — `enabled` solo queda en `true` si ademas vino un `client_id`,
 *          asi el componente no tiene que desconfiar de la combinacion imposible.
 */
async function accesoGoogle (): Promise<AccesoGoogle> {
  try {
    const { data } = await llamarApiTipado<AccesoGoogle>('/auth/google')

    return data.enabled && typeof data.client_id === 'string' && data.client_id !== ''
      ? data
      : SIN_GOOGLE
  } catch {
    return SIN_GOOGLE
  }
}
