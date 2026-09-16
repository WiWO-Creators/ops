import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { leerSesion } from '@/datos/sesion'
import { avisoDeSesion, PARAMETRO_SESION, vieneDeSesionRechazada } from '@/dominio/entrada'
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
 */
export default async function EntrarPortalPagina (
  { searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }
) {
  const motivo = (await searchParams)[PARAMETRO_SESION]

  if (!vieneDeSesionRechazada(motivo) && await leerSesion('contacto') !== null) redirect('/portal')

  return <FormularioEntrarPortal aviso={avisoDeSesion(motivo)} />
}
