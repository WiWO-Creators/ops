import type { Metadata } from 'next'
import Link from 'next/link'
import { ErrorApi } from '@/datos/errores'
import type { GrupoAyudaPortal } from '@/datos/portal'
import { Vacio } from '@/componentes/estado/Estados'
import { cargarDetalle, EstadoDeError } from '../detalle'

export const metadata: Metadata = { title: 'Ayuda · Portal de clientes' }

/**
 * Base de conocimiento.
 *
 * Se pide con `cargarDetalle` y no con `pedirPortal` a secas porque la seccion se puede apagar
 * entera desde el panel, y entonces la API responde 404: eso es una pantalla, no un error.
 */
export default async function AyudaPagina () {
  const sobre = await cargarDetalle<GrupoAyudaPortal[]>('/portal/kb')

  if (sobre instanceof ErrorApi) {
    return <EstadoDeError error={sobre} volverA="/portal" etiqueta="el inicio" />
  }

  if (sobre.data.length === 0) {
    return (
      <section className="flex flex-col gap-4">
        <h1 className="text-texto text-xl font-semibold">Ayuda</h1>
        <Vacio titulo="Sin artículos" descripcion="Todavía no publicamos guías acá." />
      </section>
    )
  }

  return (
    <section className="flex flex-col gap-4">
      <h1 className="text-texto text-xl font-semibold">Ayuda</h1>

      <div className="grid gap-4 md:grid-cols-2">
        {sobre.data.map((grupo) => (
          <section
            key={grupo.id}
            className="rounded-tarjeta border-linea bg-superficie-elevada shadow-1 border p-5"
          >
            <h2 className="font-titular text-texto flex items-center gap-2 font-semibold">
              {grupo.color !== null && (
                <span aria-hidden="true" className="size-2 rounded-full" style={{ backgroundColor: grupo.color }} />
              )}
              {grupo.name}
            </h2>
            {grupo.description !== null && grupo.description !== '' && (
              <p className="text-texto-tenue mt-1 text-sm">{grupo.description}</p>
            )}

            <ul className="mt-3 flex flex-col gap-1">
              {grupo.articles.map((articulo) => (
                <li key={articulo.id}>
                  <Link
                    href={`/portal/ayuda/${articulo.slug}`}
                    className="text-texto hover:text-acento text-sm underline-offset-4 hover:underline"
                  >
                    {articulo.subject}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </section>
  )
}
