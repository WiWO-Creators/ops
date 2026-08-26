import type { Metadata } from 'next'
import Link from 'next/link'
import { pedirPortal } from '@/datos/servidor'
import type { YoPortal } from '@/datos/tipos'
import { seccionesDelPortal } from '@/dominio/portal'

export const metadata: Metadata = { title: 'Inicio · Portal de clientes' }

/**
 * Inicio del portal.
 *
 * Por ahora es la puerta de entrada a las secciones habilitadas. Cuando existan los datos —facturas
 * impagas, tickets abiertos, avance de proyectos— este es el lugar donde se resumen.
 */
export default async function PortalInicio () {
  const { data: yo } = await pedirPortal<YoPortal>('/portal/me')
  const secciones = seccionesDelPortal(yo.secciones_habilitadas)

  return (
    <section className="flex flex-col gap-4">
      <div>
        <h1 className="text-texto text-xl font-semibold">Hola, {yo.firstname.trim()}</h1>
        <p className="text-texto-tenue mt-1 text-sm">
          Acá vas a encontrar todo lo que compartimos con vos.
        </p>
      </div>

      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {secciones.map((seccion) => (
          <li key={seccion.clave}>
            <Link
              href={seccion.href}
              className="rounded-tarjeta border-linea bg-superficie-elevada shadow-1 hover:border-acento block border p-5 transition-colors"
            >
              <span className="font-titular text-texto font-semibold">{seccion.etiqueta}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}
