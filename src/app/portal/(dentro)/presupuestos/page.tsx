import type { Metadata } from 'next'
import { PORTAL_PRESUPUESTOS } from '@/definiciones/portal-ventas'
import { SeccionDePortal } from '../seccion'

export const metadata: Metadata = { title: 'Presupuestos · Portal de clientes' }

export default async function PresupuestosPagina (props: PageProps<'/portal/presupuestos'>) {
  return (
    <SeccionDePortal
      seccion="presupuestos"
      definicion={PORTAL_PRESUPUESTOS}
      parametrosDeUrl={await props.searchParams}
    />
  )
}
