import type { Metadata } from 'next'
import { PORTAL_CONTRATOS } from '@/definiciones/portal-ventas'
import { SeccionDePortal } from '../seccion'

export const metadata: Metadata = { title: 'Contratos · Portal de clientes' }

export default async function ContratosPagina (props: PageProps<'/portal/contratos'>) {
  return (
    <SeccionDePortal
      seccion="contratos"
      definicion={PORTAL_CONTRATOS}
      parametrosDeUrl={await props.searchParams}
    />
  )
}
