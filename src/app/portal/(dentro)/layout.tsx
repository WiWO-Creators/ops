import { redirect } from 'next/navigation'
import Link from 'next/link'
import { SelectorTema } from '@/componentes/estructura/SelectorTema'
import { Avatar } from '@/componentes/presentadores/Avatar'
import { pedirPortal } from '@/datos/servidor'
import type { EmpresaPortal, YoPortal } from '@/datos/tipos'
import { seccionesDelPortal } from '@/dominio/portal'
import { BotonSalirPortal } from '../BotonSalirPortal'
import { NavegacionPortal } from '../NavegacionPortal'

/**
 * Armazon del portal del cliente.
 *
 * Hermano de `(panel)/layout.tsx`, no una variante suya: comparten el sistema de diseño y nada mas.
 * La navegacion va horizontal en el encabezado porque el portal tiene diez destinos y no cuarenta —
 * una barra lateral de 220px seria peso muerto en la pantalla de alguien que entra a mirar el avance
 * de su proyecto y se va.
 *
 * Server Component: resuelve `/portal/me` y `/portal/company` una sola vez por navegacion y arma la
 * navegacion con lo que la API dijo que este contacto puede ver.
 */
export default async function PortalLayout ({ children }: { children: React.ReactNode }) {
  const { data: yo } = await pedirPortal<YoPortal>('/portal/me')

  // Sin correo verificado la API responde 403 en todo lo demas, asi que no hay portal que dibujar:
  // se manda a la pantalla que explica que hacer.
  if (!yo.email_verified) redirect('/portal/verificar')

  const { data: empresa } = await pedirPortal<EmpresaPortal>('/portal/company')
  const secciones = seccionesDelPortal(yo.secciones_habilitadas)

  return (
    <div className="flex h-dvh flex-col overflow-hidden">
      <header className="border-linea flex h-14 shrink-0 items-center gap-3 border-b px-4">
        <Link href="/portal" className="font-titular text-texto truncate font-semibold">
          {empresa.company}
        </Link>
        <NavegacionPortal secciones={secciones} className="hidden md:flex" />
        <SelectorTema className="ml-auto" />
        <Avatar nombre={yo.full_name} />
        <BotonSalirPortal />
      </header>

      {/* En pantallas angostas la navegacion baja a su propia fila y se desplaza en horizontal:
          esconderla detras de un menu obliga a dos toques para lo unico que el portal ofrece. */}
      <NavegacionPortal
        secciones={secciones}
        className="border-linea flex shrink-0 gap-1 overflow-x-auto border-b px-4 py-2 md:hidden"
      />

      <main className="min-h-0 min-w-0 flex-1 overflow-y-auto p-4">{children}</main>
    </div>
  )
}
