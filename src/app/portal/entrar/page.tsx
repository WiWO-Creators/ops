import type { Metadata } from 'next'
import { FormularioEntrarPortal } from './FormularioEntrarPortal'

export const metadata: Metadata = { title: 'Entrar · Portal de clientes' }

export default function EntrarPortalPagina () {
  return <FormularioEntrarPortal />
}
