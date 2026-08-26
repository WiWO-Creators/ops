import type { Metadata } from 'next'
import { cache } from 'react'
import { ErrorApi } from '@/datos/errores'
import type { ArticuloAyudaPortal } from '@/datos/portal'
import { cargarDetalle, EstadoDeError, Volver } from '../../detalle'
import { ContenidoDeDocumento } from '../../ContenidoDeDocumento'

const cargarArticulo = cache(
  async (slug: string) => await cargarDetalle<ArticuloAyudaPortal>(`/portal/kb/${encodeURIComponent(slug)}`)
)

export async function generateMetadata (props: PageProps<'/portal/ayuda/[slug]'>): Promise<Metadata> {
  const { slug } = await props.params
  const sobre = await cargarArticulo(slug)

  return { title: `${sobre instanceof ErrorApi ? 'Ayuda' : sobre.data.subject} · Portal de clientes` }
}

export default async function ArticuloPagina (props: PageProps<'/portal/ayuda/[slug]'>) {
  const { slug } = await props.params
  const sobre = await cargarArticulo(slug)

  if (sobre instanceof ErrorApi) {
    return <EstadoDeError error={sobre} volverA="/portal/ayuda" etiqueta="Ayuda" />
  }

  const articulo = sobre.data

  return (
    <div className="flex flex-col gap-4">
      <Volver href="/portal/ayuda">Ayuda</Volver>

      <header>
        <p className="text-texto-sutil text-xs tracking-wide uppercase">{articulo.group.name}</p>
        <h1 className="text-texto mt-1 text-xl font-semibold">{articulo.subject}</h1>
      </header>

      <ContenidoDeDocumento html={articulo.description} />
    </div>
  )
}
