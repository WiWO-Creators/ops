import Link from 'next/link'
import { pedir } from '@/datos/servidor'
import type { Yo } from '@/datos/tipos'
import { GLOSARIO } from '@/dominio/glosario'
import { SelectorTema } from '@/componentes/estructura/SelectorTema'
import { Avatar } from '@/componentes/presentadores/Avatar'
import { BotonSalir } from './BotonSalir'

/**
 * Armazon del panel.
 *
 * Resuelve `GET /me` una sola vez por navegacion y lo usa para dos cosas: saludar a quien mira y
 * decidir que secciones se muestran. Los permisos aca solo **ocultan controles** — la API filtra
 * igual, y un boton escondido no es seguridad.
 */
export default async function PanelLayout ({ children }: { children: React.ReactNode }) {
  const { data: yo } = await pedir<Yo>('/me')

  return (
    <div className="flex min-h-dvh">
      <nav aria-label="Secciones" className="hidden w-56 shrink-0 flex-col gap-1 border-r border-linea p-3 md:flex">
        <Link href="/" className="mb-4 px-2 text-sm font-semibold text-texto">WiWO Ops</Link>
        {seccionesDe(yo).map((seccion) => (
          <Link
            key={seccion.href}
            href={seccion.href}
            className="rounded-chico px-2 py-1.5 text-sm text-texto-tenue transition-colors hover:bg-hover hover:text-texto"
          >
            {seccion.etiqueta}
          </Link>
        ))}
      </nav>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center justify-end gap-3 border-b border-linea px-4">
          <SelectorTema />
          <Avatar nombre={yo.full_name} imagen={yo.profile_image_url} />
          <BotonSalir />
        </header>
        <main className="min-w-0 flex-1 p-4">{children}</main>
      </div>
    </div>
  )
}

interface Seccion {
  href: string
  etiqueta: string
}

/**
 * Arma la navegacion segun los permisos de quien mira.
 *
 * `secciones_habilitadas` decide que modulos existen para esta instalacion; `permissions`, cuales
 * puede ver esta persona. Un modulo sin `view` no se muestra: su pantalla daria 403 igual.
 */
function seccionesDe (yo: Yo): Seccion[] {
  const secciones: Seccion[] = []

  if (yo.permissions.tasks.includes('view')) {
    secciones.push({ href: '/procesos', etiqueta: GLOSARIO.proceso.plural })
  }

  if (yo.permissions.projects.includes('view')) {
    secciones.push({ href: '/espacios', etiqueta: GLOSARIO.espacio.plural })
  }

  if (yo.permissions.customers.includes('view')) {
    secciones.push({ href: '/clientes', etiqueta: 'Clientes' })
  }

  if (yo.permissions.staff.includes('view')) {
    secciones.push({ href: '/equipo', etiqueta: 'Equipo' })
  }

  return secciones
}
