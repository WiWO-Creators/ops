import type { ReactElement } from 'react'
import { BandejaDePropuestas } from '@/componentes/propuestas/BandejaDePropuestas'
import { ErrorEstado } from '@/componentes/estado/Estados'
import { Segmentado, type OpcionSegmentada } from '@/componentes/formularios/Segmentado'
import { TituloModulo } from '@/componentes/estructura/TituloModulo'
import type { FiltroDePropuestas } from '@/datos/propuestas'
import { cargarPropuestas } from '@/datos/propuestas-servidor'
import { ErrorApi } from '@/datos/errores'

export const metadata = { title: 'Propuestas · WiWO Ops' }

const OPCIONES: OpcionSegmentada[] = [
  { valor: 'pendiente', etiqueta: 'Por responder', href: '/propuestas' },
  { valor: 'todas', etiqueta: 'Todas', href: '/propuestas?estado=todas' }
]

/**
 * Las propuestas que otros sistemas de WiWO dejaron para que la persona las apruebe.
 *
 * Nada de lo que proponen se hace hasta que se confirma acá: Ops guarda lo que se va a hacer, congelado,
 * y la persona lo ve tal cual antes de decidir. Es la misma tarjeta que en el chat de Thinking Orb.
 * Cada una es de quien mira: la API solo devuelve las propias.
 */
export default async function PropuestasPage (props: PageProps<'/propuestas'>): Promise<ReactElement> {
  const { estado } = await props.searchParams
  const filtro: FiltroDePropuestas = estado === 'todas' ? 'todas' : 'pendiente'
  const cargado = await cargarPropuestas(filtro)

  return (
    <section className="flex flex-col gap-4">
      <TituloModulo
        titulo="Propuestas"
        descripcion="Lo que Metriq, WiwoLab y otros sistemas te dejaron preparado. No se hace nada hasta que lo confirmes."
      />

      <Segmentado etiqueta="Qué propuestas ver" opciones={OPCIONES} activo={filtro} />

      {cargado instanceof ErrorApi
        ? <ErrorEstado detalle={cargado.message} />
        : <BandejaDePropuestas key={filtro} inicial={cargado} filtro={filtro} />}
    </section>
  )
}
