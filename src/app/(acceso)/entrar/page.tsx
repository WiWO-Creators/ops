import type { Metadata } from 'next'
import { FormularioEntrar } from './FormularioEntrar'

export const metadata: Metadata = { title: 'Entrar · WiWO Ops' }

export default function EntrarPage () {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-8 p-6">
      <header className="text-center">
        <h1 className="text-2xl font-semibold text-texto">WiWO Ops</h1>
        <p className="mt-1 text-sm text-texto-tenue">Entrá con tu cuenta del board.</p>
      </header>
      <FormularioEntrar />
    </main>
  )
}
