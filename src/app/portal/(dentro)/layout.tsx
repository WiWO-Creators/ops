import Link from 'next/link'
import { SelectorTema } from '@/componentes/estructura/SelectorTema'
import { Avatar } from '@/componentes/presentadores/Avatar'
import { Logo } from '@/componentes/estructura/Logo'
import { pedirOpcional, pedirPortal, proyectoUnicoDelPortal } from '@/datos/servidor'
import type { YoPortal } from '@/datos/tipos'
import { navegacionDelPortal } from '@/dominio/portal'
import { BotonSalirPortal } from '../BotonSalirPortal'
import { NavegacionPortal } from '../NavegacionPortal'
import { ScrollSuave } from '@/componentes/estructura/ScrollSuave'
import { OrbeChatIA } from '@/componentes/ia/OrbeChatIA'

/**
 * Armazon del portal del cliente.
 *
 * Hermano de `(panel)/layout.tsx`, no una variante suya: comparten el sistema de diseño y nada mas.
 * La navegacion va horizontal en el encabezado porque el portal tiene cinco destinos y no cuarenta —
 * una barra lateral de 220px seria peso muerto en la pantalla de alguien que entra a mirar el avance
 * de su proyecto y se va.
 *
 * Server Component: resuelve `/portal/me` una sola vez por navegacion y arma la navegacion con lo
 * que la API dijo que este contacto puede ver.
 *
 * Tambien decide si monta el Thinking Orb del cliente: solo con `GET /portal/ia/capacidades` en
 * `habilitado: true` (`ia_habilitada` y `wiwo_portal_ia_chat` encendidas). Cualquier fallo de esa
 * consulta lo deja sin orbe: es una comodidad, y el portal no se cae por ella.
 */
export default async function PortalLayout ({ children }: { children: React.ReactNode }) {
  const [{ data: yo }, capacidades] = await Promise.all([
    pedirPortal<YoPortal>('/portal/me'),
    pedirOpcional<{ habilitado?: boolean }>('/portal/ia/capacidades', 'contacto')
  ])
  const conOrbe = capacidades.datos?.habilitado === true
  const unico = yo.secciones_habilitadas.includes('projects') ? await proyectoUnicoDelPortal() : null
  const secciones = navegacionDelPortal(yo.secciones_habilitadas, unico)

  return (
    <div className="flex h-dvh flex-col overflow-hidden">
      <header className="border-linea flex h-14 shrink-0 items-center gap-3 border-b px-4">
        {/* El perfil no esta en la navegacion: no es una seccion que la API habilite, sino los datos
            del propio contacto. El avatar es el lugar donde se lo busca, y lleva la marca de la
            empresa y no la cara de la persona: el portal es del cliente. */}
        <Link
          href="/portal/perfil"
          title="Mi perfil"
          aria-label="Mi perfil"
          className="shrink-0"
        >
          <Avatar nombre={yo.client?.company ?? yo.full_name} imagen={yo.client?.image_url ?? null} />
        </Link>
        <Link href="/portal" aria-label="Inicio del portal" className="shrink-0">
          <Logo tamano="medio" />
        </Link>
        <NavegacionPortal secciones={secciones} className="hidden md:flex" />
        <SelectorTema className="ml-auto" />
        <BotonSalirPortal />
      </header>

      {/* En pantallas angostas la navegacion baja a su propia fila y se desplaza en horizontal:
          esconderla detras de un menu obliga a dos toques para lo unico que el portal ofrece. */}
      <NavegacionPortal
        secciones={secciones}
        className="border-linea flex shrink-0 gap-1 overflow-x-auto border-b px-4 py-2 md:hidden"
      />

      <ScrollSuave className="min-h-0 min-w-0 flex-1 p-4">{children}</ScrollSuave>

      {conOrbe && <OrbeChatIA sujeto="contacto" />}
    </div>
  )
}
