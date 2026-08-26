import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { leerSesion } from '@/datos/sesion'
import { FormularioEntrar } from './FormularioEntrar'

export const metadata: Metadata = { title: 'Entrar · WiWO Ops' }

/**
 * Acceso del equipo.
 *
 * Vive en `/colab` y no en la raiz porque la raiz es del cliente. Igual que la del portal, la ruta
 * queda fuera del guardia y mira la cookie por su cuenta para no mostrarle el formulario a quien ya
 * tiene sesion.
 */
export default async function EntrarPage () {
  if (await leerSesion('staff') !== null) redirect('/inicio')

  return <FormularioEntrar />
}
