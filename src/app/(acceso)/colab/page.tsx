import type { Metadata } from 'next'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { llamarApiTipado } from '@/datos/api'
import { leerSesionSiSePuede } from '@/datos/sesion'
import type { AccesoGoogle } from '@/datos/tipos'
import { PATRON_PKCE } from '@/datos/traspaso'
import { avisoDeSesion, PARAMETRO_SESION, vieneDeSesionRechazada } from '@/dominio/entrada'
import { esAppNativa } from '@/lib/app-nativa'
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
 *
 * El rebote a `/inicio` tiene una excepcion, y es la que corta el bucle: quien llega con
 * `?sesion=caducada` viene de que la API rechazo su token, asi que ve el formulario aunque la cookie
 * siga en su navegador. Sin esa excepcion, una cookie que se abre bien pero que la API ya no acepta
 * rebota de aca a `/inicio` y de `/inicio` para aca, sin fin y sin forma de entrar. Ver
 * `dominio/entrada.ts`.
 *
 * La cookie se lee con `leerSesionSiSePuede()` y no con `leerSesion()`: si la lectura falla —una
 * `SESION_CLAVE` mal puesta hace lanzar a `claveSesion()`— esta pantalla tiene que seguir en pie,
 * porque es la unica salida que le queda a la persona. El fallo se escribe en el log del servidor,
 * no se esconde.
 */
export default async function EntrarPage (
  { searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }
) {
  const parametros = await searchParams
  const motivo = parametros[PARAMETRO_SESION]
  const retoApp = retoDeLaApp(parametros[PARAMETRO_RETO_APP])

  // En el traspaso la sesión que importa es la de la app, no la de este Chrome: tener una abierta aquí
  // no es motivo para mandar a `/inicio` a quien vino a entrar en el teléfono.
  if (retoApp === null && !vieneDeSesionRechazada(motivo) && await leerSesionSiSePuede('staff') !== null) {
    redirect('/inicio')
  }

  return (
    <FormularioEntrar
      google={await accesoGoogle()}
      aviso={avisoDeSesion(motivo)}
      enApp={esAppNativa((await headers()).get('user-agent'))}
      retoApp={retoApp}
    />
  )
}

/** Parámetro con que la app nativa abre esta pantalla en Chrome para traer su login de Google. */
const PARAMETRO_RETO_APP = 'app'

/**
 * El reto PKCE de la app, si vino uno bien formado.
 *
 * @returns el reto, o `null` si no hay o no tiene la forma PKCE (la pantalla queda la de siempre)
 */
function retoDeLaApp (valor: string | string[] | undefined): string | null {
  return typeof valor === 'string' && PATRON_PKCE.test(valor) ? valor : null
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
