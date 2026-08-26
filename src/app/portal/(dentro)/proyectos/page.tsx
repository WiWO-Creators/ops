import type { Metadata } from 'next'
import { PORTAL_PROYECTOS } from '@/definiciones/portal-proyectos'
import { SeccionDePortal } from '../seccion'

export const metadata: Metadata = { title: 'Proyectos · Portal de clientes' }

export default async function ProyectosPagina (props: PageProps<'/portal/proyectos'>) {
  return (
    <SeccionDePortal
      seccion="proyectos"
      definicion={PORTAL_PROYECTOS}
      parametrosDeUrl={await props.searchParams}
    />
  )
}
