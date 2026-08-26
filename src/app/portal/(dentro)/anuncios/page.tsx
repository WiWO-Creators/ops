import type { Metadata } from 'next'
import { Vacio } from '@/componentes/estado/Estados'
import { formatearFecha } from '@/lib/fechas'
import { cn } from '@/lib/clases'
import { pedirPortal } from '@/datos/servidor'
import type { AnuncioPortal } from '@/datos/portal'
import { ContenidoDeDocumento } from '../ContenidoDeDocumento'

export const metadata: Metadata = { title: 'Anuncios · Portal de clientes' }

/**
 * Anuncios del equipo.
 *
 * Los ya descartados se muestran igual, atenuados: descartar es una escritura y este portal no
 * escribe, asi que ocultarlos aca haria desaparecer un aviso sin que nadie pueda recuperarlo.
 */
export default async function AnunciosPagina () {
  const { data } = await pedirPortal<AnuncioPortal[]>('/portal/announcements')

  if (data.length === 0) {
    return (
      <section className="flex flex-col gap-4">
        <h1 className="text-texto text-xl font-semibold">Anuncios</h1>
        <Vacio titulo="Sin anuncios" descripcion="Cuando tengamos algo que contarte, va a aparecer acá." />
      </section>
    )
  }

  return (
    <section className="flex flex-col gap-4">
      <h1 className="text-texto text-xl font-semibold">Anuncios</h1>

      <ul className="flex flex-col gap-3">
        {data.map((anuncio) => (
          <li
            key={anuncio.id}
            className={cn(
              'rounded-tarjeta border-linea bg-superficie-elevada shadow-1 border p-5',
              anuncio.dismissed && 'opacity-60'
            )}
          >
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="font-titular text-texto font-semibold">{anuncio.name}</h2>
              <span className="text-texto-tenue text-sm">{formatearFecha(anuncio.date_added)}</span>
            </div>
            {/* El mensaje se redacta en el panel y puede traer HTML: se muestra aislado, igual que
                el contenido de contratos y propuestas. */}
            <div className="mt-3">
              <ContenidoDeDocumento html={anuncio.message} alto="h-48" />
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}
