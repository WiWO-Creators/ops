import Link from 'next/link'
import { SelectorTema } from '@/componentes/estructura/SelectorTema'
import { ScrollSuave } from '@/componentes/estructura/ScrollSuave'

export const metadata = { title: 'Taller · WiWO Ops' }

/**
 * Marco del taller de componentes.
 *
 * El taller es donde se construye un componente ANTES de que exista la pantalla que lo usa. Es lo que
 * permite que el sistema de diseño avance sin depender de la API ni de las definiciones de tabla.
 */
export default function TallerLayout ({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-dvh flex-col">
      <header className="border-linea bg-superficie-elevada flex shrink-0 items-center justify-between gap-4 border-b px-6 py-3">
        <div className="flex items-baseline gap-3">
          <Link href="/taller" className="font-titular text-lg font-extrabold">
            Taller
          </Link>
          <span className="text-texto-sutil text-xs">Sistema de diseño de ops-v2</span>
        </div>
        <SelectorTema />
      </header>
      <ScrollSuave className="min-h-0 flex-1 px-6 py-8">
        <div className="mx-auto flex max-w-5xl flex-col gap-12">{children}</div>
      </ScrollSuave>
    </div>
  )
}
