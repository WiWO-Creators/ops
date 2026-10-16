import type { Metadata } from 'next'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { llamarApiTipado } from '@/datos/api'
import { cabecerasDeOrigen } from '@/datos/origen'
import { leerSesionSiSePuede } from '@/datos/sesion'
import { avisoDeSesion, PARAMETRO_SESION, vieneDeSesionRechazada } from '@/dominio/entrada'
import { accesoGoogleDelPortal } from '@/dominio/portal-google'
import { FormularioEntrarPortal } from './FormularioEntrarPortal'

export const metadata: Metadata = { title: 'Entrar · Portal de clientes' }

/**
 * La raiz del sitio es la puerta del cliente.
 *
 * El equipo entra por `/colab`: quien llega a un dominio de WiWO sin saber nada mas es un cliente, y
 * el enlace que se le manda es este. La ruta esta fuera del guardia (`src/proxy.ts`), asi que hay que
 * mirar la cookie aca: sin esto, quien ya entro vuelve a ver el formulario de acceso.
 *
 * Con `?sesion=caducada` no rebota, por el mismo motivo que `/colab`: es la marca de que la API
 * rechazo el token, y rebotar a `/portal` con una cookie que ya no sirve es un ida y vuelta sin fin.
 *
 * La cookie se lee con `leerSesionSiSePuede()` y no con `leerSesion()`: si la lectura falla —una
 * `SESION_CLAVE` mal puesta hace lanzar a `claveSesion()`— esta pantalla tiene que seguir en pie,
 * porque es la unica salida que le queda a la persona. El fallo se escribe en el log del servidor,
 * no se esconde.
 */
export default async function EntrarPortalPagina (
  { searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }
) {
  const motivo = (await searchParams)[PARAMETRO_SESION]

  if (!vieneDeSesionRechazada(motivo) && await leerSesionSiSePuede('contacto') !== null) redirect('/portal')

  return <FormularioEntrarPortal aviso={avisoDeSesion(motivo)} googleActivo={await googleActivoEnElPortal()} />
}

/**
 * Pregunta a la API si el acceso con Google al portal esta encendido (el interruptor global).
 *
 * Se consulta aca y no en el cliente por lo mismo que en `/colab`: `/auth/*` esta fuera de la lista
 * blanca del BFF. Cualquier fallo cae a `false` —el portal de siempre, correo y contraseña—, porque un
 * paso de mas nunca puede costar el formulario entero: la API caida, el endpoint sin desplegar o un
 * freno de intentos dejan la pantalla exactamente como estaba antes de esta funcion.
 */
async function googleActivoEnElPortal (): Promise<boolean> {
  try {
    const { data } = await llamarApiTipado<unknown>('/auth/portal/google', {
      cabeceras: cabecerasDeOrigen(await headers())
    })

    return accesoGoogleDelPortal(data).enabled
  } catch {
    return false
  }
}
