import type { Metadata } from 'next'
import { PORTAL_PROPUESTAS } from '@/definiciones/portal-ventas'
import { SeccionDePortal } from '../seccion'

export const metadata: Metadata = { title: 'Propuestas · Portal de clientes' }

export default async function PropuestasPagina (props: PageProps<'/portal/propuestas'>) {
  return (
    <SeccionDePortal
      seccion="propuestas"
      definicion={PORTAL_PROPUESTAS}
      parametrosDeUrl={await props.searchParams}
    />
  )
}
