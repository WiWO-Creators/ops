import Link from 'next/link'
import { Filas, Seccion, type Dato } from '@/componentes/presentadores/Ficha'
import { nombreDe } from '@/datos/catalogos'
import type { EstadoLookup, Upsell } from '@/datos/recursos'
import { etiquetaDeEstado } from '@/definiciones/licitaciones'
import { formatearFecha } from '@/lib/fechas'

/**
 * Pestaña Ficha de un Upsell: de quien es la oportunidad, cuanto vale y en que quedo.
 *
 * Lo del Espacio —descripcion, plazos, montos del proyecto— no se repite acá: lo muestra
 * `PanelDescripcion`, que es el mismo panel del detalle de un Espacio y va debajo de esta ficha. El
 * `monto_estimado` de la oportunidad **no es** el `project_cost` del Espacio: uno es lo que se
 * espera vender, el otro lo que se factura si se gana.
 *
 * Las filas sin valor no se dibujan. Una ficha en guiones no dice "no hay monto", dice "esta
 * pantalla no funciona"; se muestra lo que hay.
 *
 * @param upsell El upsell ya cargado.
 * @param monedas Catalogo `currencies` de `GET /lookups`, para resolver `moneda_id`.
 * @returns Las dos secciones de la ficha.
 */
export function FichaUpsell ({
  upsell,
  monedas
}: {
  upsell: Upsell
  monedas: EstadoLookup[]
}) {
  const oportunidad = conValor([
    {
      etiqueta: 'Monto estimado',
      valor: upsell.monto_estimado === null ? null : upsell.monto_estimado.toLocaleString('es-CL')
    },
    {
      etiqueta: 'Moneda',
      valor: upsell.moneda_id === null || upsell.moneda_id === 0 ? null : nombreDe(monedas, upsell.moneda_id)
    },
    { etiqueta: 'Probabilidad', valor: upsell.probabilidad === null ? null : `${upsell.probabilidad}%` }
  ])

  const seguimiento = conValor([
    { etiqueta: 'Estado', valor: etiquetaDeEstado(upsell.estado) },
    { etiqueta: 'Alta', valor: formatearFecha(upsell.creada_en, true) },
    {
      etiqueta: upsell.estado === 'perdida' ? 'Perdida el' : 'Ganada el',
      valor: upsell.resultado_en === null ? null : formatearFecha(upsell.resultado_en, true)
    },
    { etiqueta: 'Notas del resultado', valor: upsell.motivo }
  ])

  return (
    <div className="grid max-w-5xl gap-x-8 gap-y-6 sm:grid-cols-2 lg:grid-cols-3">
      <Seccion titulo="Cliente">
        <dl className="flex flex-col gap-2 text-sm">
          <div className="flex flex-col gap-0.5">
            <dt className="text-texto-sutil text-xs">Cliente</dt>
            <dd>
              {upsell.client_id === null
                ? <span className="text-texto-tenue">Sin cliente</span>
                : (
                  <Link
                    href={`/clientes/${upsell.client_id}`}
                    className="text-acento font-medium underline-offset-4 hover:underline"
                  >
                    {upsell.client?.company ?? `Cliente #${upsell.client_id}`}
                  </Link>
                  )}
            </dd>
          </div>

          {upsell.estado === 'abierta' && (
            <p className="text-texto-tenue text-xs">
              Mientras la oportunidad siga abierta, este proyecto no aparece entre los del cliente ni
              en su portal.
            </p>
          )}
        </dl>
      </Seccion>

      <Seccion titulo="Oportunidad">
        <Filas datos={oportunidad} />
      </Seccion>

      <Seccion titulo="Seguimiento">
        <Filas datos={seguimiento} />
      </Seccion>
    </div>
  )
}

/**
 * Deja solo las filas que tienen algo escrito.
 *
 * @param filas Rotulos con su valor crudo; ausente, `null` o vacio significa "la API no trajo nada".
 * @returns Las filas con valor, en el mismo orden.
 */
function conValor (filas: Array<{ etiqueta: string, valor: string | null | undefined }>): Dato[] {
  return filas.filter((fila): fila is Dato => typeof fila.valor === 'string' && fila.valor.trim() !== '')
}
