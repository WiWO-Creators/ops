import type { Metadata } from 'next'
import { DetalleDocumento } from '../../DetalleDocumento'

export const metadata: Metadata = { title: 'Presupuesto · Portal de clientes' }

export default async function PresupuestoPagina (props: PageProps<'/portal/presupuestos/[id]'>) {
  const { id } = await props.params

  return <DetalleDocumento id={id} kind="estimate" />
}
