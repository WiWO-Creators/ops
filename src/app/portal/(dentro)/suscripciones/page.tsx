import type { Metadata } from 'next'
import { PORTAL_SUSCRIPCIONES } from '@/definiciones/portal-ventas'
import { SeccionDePortal } from '../seccion'

export const metadata: Metadata = { title: 'Suscripciones · Portal de clientes' }

export default async function SuscripcionesPagina (props: PageProps<'/portal/suscripciones'>) {
  return (
    <SeccionDePortal
      seccion="suscripciones"
      definicion={PORTAL_SUSCRIPCIONES}
      parametrosDeUrl={await props.searchParams}
    />
  )
}
