import type { Metadata } from 'next'
import { PORTAL_TICKETS } from '@/definiciones/portal-soporte'
import { SeccionDePortal } from '../seccion'

export const metadata: Metadata = { title: 'Soporte · Portal de clientes' }

export default async function SoportePagina (props: PageProps<'/portal/soporte'>) {
  return (
    <SeccionDePortal
      seccion="soporte"
      definicion={PORTAL_TICKETS}
      parametrosDeUrl={await props.searchParams}
    />
  )
}
