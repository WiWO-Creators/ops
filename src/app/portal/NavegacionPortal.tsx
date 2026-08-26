'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/clases'
import type { SeccionPortal } from '@/dominio/portal'

/**
 * Navegacion horizontal del portal.
 *
 * Cliente solo por `usePathname`: marcar donde esta parado el visitante es la unica pieza de estado
 * que necesita. Las secciones ya vienen filtradas del servidor.
 */
export function NavegacionPortal (
  { secciones, className }: { secciones: SeccionPortal[], className?: string }
) {
  const ruta = usePathname()

  return (
    <nav className={cn('items-center gap-1', className)} aria-label="Secciones">
      {secciones.map((seccion) => {
        // Coincidencia por prefijo para que el detalle de un proyecto siga marcando "Proyectos".
        const activa = ruta === seccion.href || ruta.startsWith(`${seccion.href}/`)

        return (
          <Link
            key={seccion.clave}
            href={seccion.href}
            aria-current={activa ? 'page' : undefined}
            className={cn(
              'rounded-control px-3 py-1.5 text-sm whitespace-nowrap transition-colors',
              activa
                ? 'bg-superficie-elevada text-texto font-semibold'
                : 'text-texto-tenue hover:text-texto'
            )}
          >
            {seccion.etiqueta}
          </Link>
        )
      })}
    </nav>
  )
}
