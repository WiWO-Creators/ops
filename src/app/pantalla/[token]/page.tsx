import type { ReactElement } from 'react'
import { notFound } from 'next/navigation'
import { llamarApiTipado } from '@/datos/api'
import { ErrorApi } from '@/datos/errores'
import { leerParametrosDePantalla } from '@/dominio/pantalla-area'
import { Escenario } from './Escenario'
import type { MetaDePantalla, PaqueteDePantalla } from '@/datos/pantalla-area'
import './pantalla.css'

/**
 * El nombre del area **no** va en el titulo.
 *
 * El titulo viaja a la barra del navegador, al historial del aparato y a la interfaz de casting del
 * televisor, donde lo ve cualquiera que este en la misma red. El nombre del area se muestra en la
 * pantalla, que es donde tiene sentido.
 */
export const metadata = { title: 'Pantalla · WiWO Ops' }

/**
 * `force-dynamic`: el paquete cambia cada treinta segundos y no hay nada que prerenderizar.
 */
export const dynamic = 'force-dynamic'

/**
 * La pantalla de un area, para el televisor colgado en su pared.
 *
 * Cuarta ruta sin sesion del proyecto, junto a `/sala/<token>`, `/clave/<token>` y `/tarea/<token>`:
 * queda fuera del armazon del panel —sin barra lateral y sin scroll suave— porque quien la abre es un
 * aparato, no una persona logueada.
 *
 * Por eso **no usa `pedir()`**, que exige sesion y redirige a `/colab`, ni pasa por el BFF, que solo
 * sabe reenviar con el token de una persona adosado: llama a la API desde el servidor, igual que
 * `sala/[token]` y `tarea/[token]`.
 *
 * === EN QUE SE APARTA DE `tarea/[token]`, Y POR QUE ===
 *
 * Alla, cualquier error que no sea un 404 se relanza y sube a `error.tsx`. Aca NO: un fallo de la API
 * a las tres de la maniana dejaria el televisor mostrando una pantalla de error hasta que alguien
 * suba a una escalera. Se atrapa, se arranca en modo espera con el reloj y el aviso de reconexion, y
 * el cliente sigue sondeando solo. El 404 sigue siendo 404, porque un token revocado no se arregla
 * esperando.
 *
 * Se muestra exactamente lo que manda la API y ni un dato mas: cada campo que apareciera aca sin
 * estar en la lista blanca de `Recursos\PantallaDeArea` seria una fuga hacia internet abierto.
 */
export default async function PantallaDeArea (
  props: PageProps<'/pantalla/[token]'>
): Promise<ReactElement> {
  const { token } = await props.params
  const parametros = leerParametrosDePantalla(await props.searchParams)

  let inicial: PaqueteDePantalla | null = null
  let meta: MetaDePantalla | null = null

  try {
    const sobre = await llamarApiTipado<PaqueteDePantalla>(
      `/public/display/${encodeURIComponent(token)}`
    )

    inicial = sobre.data
    meta = (sobre as { meta?: MetaDePantalla }).meta ?? null
  } catch (error) {
    // Inventado, revocado o el area borrada: la API responde el mismo 404 a proposito, y la pantalla
    // no puede deshacer eso distinguiendolos.
    if (error instanceof ErrorApi && error.estado === 404) notFound()

    // Cualquier otra cosa se traga: `inicial` queda en null y el Escenario arranca esperando.
  }

  return (
    <Escenario
      token={token}
      inicial={inicial}
      metaInicial={meta}
      parametros={parametros}
    />
  )
}
