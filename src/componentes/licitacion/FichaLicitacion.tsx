import Link from 'next/link'
import { Filas, Seccion, type Dato } from '@/componentes/presentadores/Ficha'
import type { Licitacion } from '@/datos/recursos'
import { etiquetaDeEstado } from '@/definiciones/licitaciones'
import { formatearFecha } from '@/lib/fechas'

/**
 * Pestaña Ficha de una Licitacion: de quien es y en que quedo.
 *
 * **Ya no repite el legajo de la empresa.** Desde `0320` la empresa y sus personas de contacto viven
 * en el Prospecto, que es uno solo para todas sus licitaciones; copiarlo acá garantizaba que el
 * listado y la ficha mostraran datos distintos el dia que alguien editara uno de los dos. Lo que
 * queda es el enlace a la ficha donde eso se lee y se edita.
 *
 * Lo del Espacio —descripcion, plazos, montos— tampoco se repite: lo muestra `PanelDescripcion`, que
 * es el mismo panel del detalle de un Espacio y va debajo de esta ficha.
 *
 * @param licitacion La licitacion ya cargada.
 * @returns Las dos secciones de la ficha.
 */
export function FichaLicitacion ({ licitacion }: { licitacion: Licitacion }) {
  const seguimiento = conValor([
    { etiqueta: 'Estado', valor: etiquetaDeEstado(licitacion.estado) },
    { etiqueta: 'Alta', valor: formatearFecha(licitacion.creada_en, true) },
    {
      etiqueta: licitacion.estado === 'perdida' ? 'Perdida el' : 'Ganada el',
      valor: licitacion.resultado_en === null ? null : formatearFecha(licitacion.resultado_en, true)
    }
  ])

  return (
    <div className="grid max-w-5xl gap-x-8 gap-y-6 sm:grid-cols-2">
      <Seccion titulo="Empresa candidata">
        <dl className="flex flex-col gap-2 text-sm">
          <div className="flex flex-col gap-0.5">
            <dt className="text-texto-sutil text-xs">Prospecto</dt>
            <dd>
              <Link
                href={`/prospectos/${licitacion.prospecto_id}`}
                className="text-acento font-medium underline-offset-4 hover:underline"
              >
                {licitacion.prospecto.empresa}
              </Link>
            </dd>
          </div>

          {licitacion.client_id !== null && (
            <div className="flex flex-col gap-0.5">
              <dt className="text-texto-sutil text-xs">Cliente</dt>
              <dd>
                <Link
                  href={`/clientes/${licitacion.client_id}`}
                  className="text-acento font-medium underline-offset-4 hover:underline"
                >
                  {licitacion.client?.company ?? `Cliente #${licitacion.client_id}`}
                </Link>
              </dd>
            </div>
          )}

          <p className="text-texto-tenue text-xs">
            El RUT, la dirección y las personas de contacto se leen y se editan en el prospecto.
          </p>
        </dl>
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
