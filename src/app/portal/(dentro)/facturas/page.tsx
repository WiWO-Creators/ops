import type { Metadata } from 'next'
import { PORTAL_FACTURAS } from '@/definiciones/portal-ventas'
import { SeccionDePortal } from '../seccion'

export const metadata: Metadata = { title: 'Facturas · Portal de clientes' }

export default async function FacturasPagina (props: PageProps<'/portal/facturas'>) {
  return (
    <SeccionDePortal
      seccion="facturas"
      definicion={PORTAL_FACTURAS}
      parametrosDeUrl={await props.searchParams}
    />
  )
}
