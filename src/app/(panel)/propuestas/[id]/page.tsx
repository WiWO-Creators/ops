import Link from 'next/link'
import type { ReactElement } from 'react'
import { BandejaDePropuestas } from '@/componentes/propuestas/BandejaDePropuestas'
import { ErrorEstado, Vacio } from '@/componentes/estado/Estados'
import { TituloModulo } from '@/componentes/estructura/TituloModulo'
import { cargarPropuestas } from '@/datos/propuestas-servidor'
import { ErrorApi } from '@/datos/errores'

export const metadata = { title: 'Propuesta · WiWO Ops' }

/**
 * Enlace profundo a una propuesta (`/propuestas/{id}`), el que traen `url_ops` y los avisos de otros
 * sistemas.
 *
 * Muestra la bandeja completa con esa propuesta resaltada y a la vista, no una ficha aparte: es la
 * misma tarjeta de siempre, con su decisión. La API solo devuelve las propuestas de quien mira, así
 * que un id ajeno o de hace mucho no se distingue de uno inexistente: ambos dicen que no se encontró.
 */
export default async function PropuestaPage (props: PageProps<'/propuestas/[id]'>): Promise<ReactElement> {
  const { id: texto } = await props.params
  const id = /^\d+$/.test(texto) ? Number(texto) : null
  const cargado = await cargarPropuestas('todas')
  const encontrada = !(cargado instanceof ErrorApi) && cargado.some((p) => p.id === id)

  return (
    <section className="flex flex-col gap-4">
      <TituloModulo
        titulo="Propuesta"
        descripcion="Lo que otro sistema te dejó preparado. No se hace nada hasta que lo confirmes."
      />

      {cargado instanceof ErrorApi
        ? <ErrorEstado detalle={cargado.message} />
        : encontrada
          ? <BandejaDePropuestas inicial={cargado} filtro="todas" resaltarId={id ?? undefined} />
          : (
            <div className="flex flex-col items-start gap-3">
              <Vacio titulo="No encontramos esa propuesta" descripcion="Puede ser de otra persona, haber caducado hace tiempo o el enlace estar incompleto." />
              <Link href="/propuestas" className="text-acento text-sm underline">Ver las propuestas por responder</Link>
            </div>
            )}
    </section>
  )
}
