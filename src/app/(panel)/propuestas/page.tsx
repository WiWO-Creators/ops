import type { ReactElement } from 'react'
import { BandejaDePropuestas } from '@/componentes/propuestas/BandejaDePropuestas'
import { ErrorEstado } from '@/componentes/estado/Estados'
import { Segmentado, type OpcionSegmentada } from '@/componentes/formularios/Segmentado'
import { TituloModulo } from '@/componentes/estructura/TituloModulo'
import type { FiltroDePropuestas } from '@/datos/propuestas'
import { cargarPropuestas } from '@/datos/propuestas-servidor'
import { esDeWiwoCenter, filtrarPorOrigen, type FiltroDeOrigen } from '@/dominio/propuestas'
import { ErrorApi } from '@/datos/errores'

export const metadata = { title: 'Propuestas · WiWO Ops' }

/**
 * Los enlaces del control de estado, que conservan el origen elegido (y al revés): son dos controles de
 * la misma pantalla y cambiar uno no puede deshacer el otro.
 */
function rutaDe (estado: FiltroDePropuestas, origen: FiltroDeOrigen): string {
  const params = new URLSearchParams()

  if (estado === 'todas') params.set('estado', 'todas')
  if (origen === 'wiwo_center') params.set('origen', 'wiwo_center')

  const consulta = params.toString()

  return consulta === '' ? '/propuestas' : `/propuestas?${consulta}`
}

/**
 * Las propuestas que otros sistemas de WiWO dejaron para que la persona las apruebe.
 *
 * Nada de lo que proponen se hace hasta que se confirma acá: Ops guarda lo que se va a hacer, congelado,
 * y la persona lo ve tal cual antes de decidir. Es la misma tarjeta que en el chat de Thinking Orb.
 * Cada una es de quien mira: la API solo devuelve las propias, salvo las altas que piden los tickets de
 * wiwo.center, que ve y decide cualquier superadministrador.
 */
export default async function PropuestasPage (props: PageProps<'/propuestas'>): Promise<ReactElement> {
  const { estado, origen: origenPedido } = await props.searchParams
  const filtro: FiltroDePropuestas = estado === 'todas' ? 'todas' : 'pendiente'
  const origen: FiltroDeOrigen = origenPedido === 'wiwo_center' ? 'wiwo_center' : 'todas'
  const cargado = await cargarPropuestas(filtro)
  const deCenter = cargado instanceof ErrorApi ? 0 : cargado.filter(esDeWiwoCenter).length

  const opcionesDeEstado: OpcionSegmentada[] = [
    { valor: 'pendiente', etiqueta: 'Por responder', href: rutaDe('pendiente', origen) },
    { valor: 'todas', etiqueta: 'Todas', href: rutaDe('todas', origen) }
  ]
  const opcionesDeOrigen: OpcionSegmentada[] = [
    { valor: 'todas', etiqueta: 'Todo origen', href: rutaDe(filtro, 'todas') },
    { valor: 'wiwo_center', etiqueta: deCenter === 0 ? 'De wiwo.center' : `De wiwo.center (${deCenter})`, href: rutaDe(filtro, 'wiwo_center') }
  ]

  return (
    <section className="flex flex-col gap-4">
      <TituloModulo
        titulo="Propuestas"
        descripcion="Lo que Metriq, WiwoLab y otros sistemas te dejaron preparado. No se hace nada hasta que lo confirmes."
      />

      <div className="flex flex-wrap items-center gap-3">
        <Segmentado etiqueta="Qué propuestas ver" opciones={opcionesDeEstado} activo={filtro} />
        <Segmentado etiqueta="De dónde vienen" opciones={opcionesDeOrigen} activo={origen} />
      </div>

      {cargado instanceof ErrorApi
        ? <ErrorEstado detalle={cargado.message} />
        : <BandejaDePropuestas key={`${filtro}-${origen}`} inicial={filtrarPorOrigen(cargado, origen)} filtro={filtro} origen={origen} />}
    </section>
  )
}
