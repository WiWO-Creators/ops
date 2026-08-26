import type { Metadata } from 'next'
import { formatearImporte } from '@/componentes/proyecto/formatos'
import { formatearFecha } from '@/lib/fechas'
import { Insignia } from '@/componentes/presentadores/Insignia'
import type { ContratoPortalDetalle } from '@/datos/portal'
import { ErrorApi } from '@/datos/errores'
import { Bloque, cargarDetalle, Datos, EstadoDeError, Volver } from '../../detalle'
import { ContenidoDeDocumento } from '../../ContenidoDeDocumento'

export const metadata: Metadata = { title: 'Contrato · Portal de clientes' }

export default async function ContratoPagina (props: PageProps<'/portal/contratos/[id]'>) {
  const { id } = await props.params
  const sobre = await cargarDetalle<ContratoPortalDetalle>(`/portal/contracts/${id}`)

  if (sobre instanceof ErrorApi) {
    return <EstadoDeError error={sobre} volverA="/portal/contratos" etiqueta="Contratos" />
  }

  const contrato = sobre.data

  return (
    <div className="flex flex-col gap-4">
      <Volver href="/portal/contratos">Contratos</Volver>

      <header className="flex flex-wrap items-center gap-3">
        <h1 className="text-texto text-xl font-semibold">{contrato.subject}</h1>
        <Insignia tono={contrato.signed ? 'exito' : 'neutro'}>
          {contrato.signed ? 'Firmado' : 'Sin firmar'}
        </Insignia>
      </header>

      <Bloque>
        <Datos
          filas={[
            ['Tipo', contrato.type?.name ?? ''],
            ['Desde', formatearFecha(contrato.date_start)],
            ['Hasta', formatearFecha(contrato.date_end)],
            ['Valor', contrato.value > 0 ? formatearImporte(contrato.value, null) : '']
          ]}
        />
      </Bloque>

      {contrato.description !== '' && <Bloque titulo="Descripción">{contrato.description}</Bloque>}

      {contrato.content !== '' && (
        <Bloque titulo="Contenido">
          <ContenidoDeDocumento html={contrato.content} />
        </Bloque>
      )}
    </div>
  )
}
