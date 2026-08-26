import type { Metadata } from 'next'
import { DetalleDocumento } from '../../DetalleDocumento'

export const metadata: Metadata = { title: 'Factura · Portal de clientes' }

export default async function FacturaPagina (props: PageProps<'/portal/facturas/[id]'>) {
  const { id } = await props.params

  return <DetalleDocumento id={id} kind="invoice" />
}
