import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { leerSesion } from '@/datos/sesion'
import { FormularioEntrarPortal } from './FormularioEntrarPortal'

export const metadata: Metadata = { title: 'Entrar · Portal de clientes' }

/**
 * La raiz del sitio es la puerta del cliente.
 *
 * El equipo entra por `/colab`: quien llega a un dominio de WiWO sin saber nada mas es un cliente, y
 * el enlace que se le manda es este. La ruta esta fuera del guardia (`src/proxy.ts`), asi que hay que
 * mirar la cookie aca: sin esto, quien ya entro vuelve a ver el formulario de acceso.
 */
export default async function EntrarPortalPagina () {
  if (await leerSesion('contacto') !== null) redirect('/portal')

  return <FormularioEntrarPortal />
}
