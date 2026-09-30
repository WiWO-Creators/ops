'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Pencil } from 'lucide-react'
import { Boton } from '@/componentes/formularios/Boton'
import { BotonVolver } from '@/componentes/estructura/BotonVolver'
import { TituloModulo } from '@/componentes/estructura/TituloModulo'
import { FormularioRecurso } from '@/componentes/proyecto/FormularioRecurso'
import type { OpcionCampo } from '@/componentes/proyecto/formulario'
import { EnlaceCliente } from '@/componentes/presentadores/EnlaceCliente'
import { EnlaceProyecto } from '@/componentes/presentadores/EnlaceProyecto'
import { ContenidoHtml } from '@/componentes/presentadores/ContenidoHtml'
import { Filas, Seccion, type Dato } from '@/componentes/presentadores/Ficha'
import type { EstadoIa } from '@/dominio/ajustes'
import type { Contrato } from '@/datos/recursos'
import { formatearValorDeContrato } from '@/definiciones/contratos'
import { GLOSARIO } from '@/dominio/glosario'
import { formatearFecha } from '@/lib/fechas'
import { camposDeContrato, registroDeContrato } from './campos'
import { PanelScopeContrato } from './PanelScopeContrato'

interface PropsFichaContrato {
  contrato: Contrato
  clientes: OpcionCampo[]
  tipos: OpcionCampo[]
  ia: EstadoIa
}

/**
 * Ficha de un contrato: datos comerciales, vigencia, alcance y, si el panel lo redacto, el texto.
 *
 * El texto (`content`) se muestra en solo lectura dentro de `ContenidoHtml`, que lo aisla del resto
 * de la pagina; se sigue editando y firmando en el panel.
 *
 * El scope principal (`PanelScopeContrato`) es el que heredan los Proyectos creados dentro de el.
 *
 * @param props el contrato, las opciones del formulario de edicion y el estado de la IA
 * @returns la cabecera con «Editar» y las secciones de la ficha
 */
export function FichaContrato ({ contrato, clientes, tipos, ia }: PropsFichaContrato) {
  const router = useRouter()
  const [editando, setEditando] = useState(false)

  const comercial = conValor([
    { etiqueta: 'Tipo', valor: contrato.contract_type?.name ?? '' },
    { etiqueta: 'Valor', valor: formatearValorDeContrato(contrato.contract_value) },
    { etiqueta: 'Firmado', valor: contrato.signed ? 'Sí' : 'No' },
    { etiqueta: 'Portal del cliente', valor: contrato.visible_to_client ? 'Visible' : 'Oculto' }
  ])

  const vigencia = conValor([
    { etiqueta: 'Inicio', valor: formatearFecha(contrato.datestart) },
    { etiqueta: 'Término', valor: contrato.dateend === null ? 'Sin término' : formatearFecha(contrato.dateend) },
    { etiqueta: 'Creado', valor: formatearFecha(contrato.dateadded, true) },
    { etiqueta: 'Creado por', valor: contrato.addedfrom?.full_name ?? '' }
  ])

  return (
    <section className="flex flex-col gap-6">
      {/* El regreso comparte bloque con el titulo: suelto seria el primer hijo de la seccion y la
          entrada de pagina lo animaria como un grupo de contenido, desfasado del titulo. */}
      <div className="flex flex-col gap-3">
        <BotonVolver href="/contratos" etiqueta={GLOSARIO.contrato.plural} />
        <TituloModulo
          titulo={contrato.subject === '' ? `Contrato #${contrato.id}` : contrato.subject}
          acciones={
            <Boton variante="secundario" tamano="chico" onClick={() => { setEditando(true) }}>
              <Pencil aria-hidden className="size-4" />
              Editar
            </Boton>
          }
        />
      </div>

      {contrato.trash && (
        <p className="text-texto-tenue text-sm">Este contrato está en la papelera del panel: no aparece en el listado.</p>
      )}

      <div className="grid max-w-5xl gap-x-8 gap-y-6 sm:grid-cols-2 lg:grid-cols-3">
        <Seccion titulo={GLOSARIO.cliente.singular}>
          <dl className="flex flex-col gap-2 text-sm">
            <div className="flex flex-col gap-0.5">
              <dt className="text-texto-sutil text-xs">{GLOSARIO.cliente.singular}</dt>
              <dd>
                <EnlaceCliente
                  id={contrato.client_id}
                  nombre={contrato.client?.company ?? `Cliente #${contrato.client_id}`}
                  className="text-acento underline-offset-4 hover:underline"
                />
              </dd>
            </div>
            {contrato.project !== null && (
              <div className="flex flex-col gap-0.5">
                <dt className="text-texto-sutil text-xs">{GLOSARIO.espacio.singular}</dt>
                <dd>
                  <EnlaceProyecto
                    id={contrato.project.id}
                    nombre={contrato.project.name}
                    className="text-acento underline-offset-4 hover:underline"
                  />
                </dd>
              </div>
            )}
          </dl>
        </Seccion>

        <Seccion titulo="Condiciones">
          <Filas datos={comercial} />
        </Seccion>

        <Seccion titulo="Vigencia">
          <Filas datos={vigencia} />
        </Seccion>
      </div>

      <div className="max-w-5xl">
        <Seccion titulo="Alcance">
          {contrato.description === null
            ? <p className="text-texto-tenue text-sm">Sin alcance cargado.</p>
            : <p className="text-texto text-sm whitespace-pre-line">{contrato.description}</p>}
        </Seccion>
      </div>

      <div className="max-w-5xl">
        <Seccion titulo={`${GLOSARIO.scope.singular} principal`}>
          <PanelScopeContrato contratoId={contrato.id} ia={ia} />
        </Seccion>
      </div>

      {contrato.content !== null && contrato.content !== undefined && (
        <div className="max-w-5xl">
          <Seccion titulo="Texto del contrato">
            <ContenidoHtml html={contrato.content} titulo="Texto del contrato" />
          </Seccion>
        </div>
      )}

      {editando && (
        <FormularioRecurso
          abierto
          onAbiertoCambia={setEditando}
          titulo="Editar contrato"
          campos={camposDeContrato(clientes, tipos)}
          ruta={`contratos/${contrato.id}`}
          metodo="PATCH"
          registro={registroDeContrato(contrato)}
          avisoExito="Contrato actualizado."
          onGuardado={() => { router.refresh() }}
          columnas={2}
          ancho="grande"
        />
      )}
    </section>
  )
}

/**
 * Descarta los datos vacios: una fila «Valor:» sin nada al lado no dice nada.
 *
 * @param datos los datos candidatos
 * @returns solo los que tienen valor
 */
function conValor (datos: Dato[]): Dato[] {
  return datos.filter((dato) => dato.valor !== '')
}
