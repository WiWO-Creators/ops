import type { Metadata } from 'next'
import { FormularioEntrar } from './FormularioEntrar'

export const metadata: Metadata = { title: 'Entrar · WiWO Ops' }

export default function EntrarPage () {
  return <FormularioEntrar />
}
