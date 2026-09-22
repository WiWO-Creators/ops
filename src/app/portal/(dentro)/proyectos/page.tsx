import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { PORTAL_PROYECTOS } from '@/definiciones/portal-proyectos'
import { proyectoUnicoDelPortal } from '@/datos/servidor'
import { SeccionDePortal } from '../seccion'

export const metadata: Metadata = { title: 'Proyectos · Portal de clientes' }

export default async function ProyectosPagina (props: PageProps<'/portal/proyectos'>) {
  // Una lista de un solo renglon es un clic de mas: con un unico Proyecto se abre directamente.
  const unico = await proyectoUnicoDelPortal()
  if (unico !== null) redirect(`/portal/proyectos/${unico}`)

  return (
    <SeccionDePortal
      seccion="proyectos"
      definicion={PORTAL_PROYECTOS}
      parametrosDeUrl={await props.searchParams}
    />
  )
}
