import { Bloque } from '@/app/portal/(dentro)/detalle'
import { GLOSARIO } from '@/dominio/glosario'
import { BarraProgreso } from '@/componentes/proyecto/CabeceraProyecto'
import { formatearNumero } from '@/componentes/proyecto/ResumenProyecto'
import { Cifra, Nota } from './piezas'
import { SIN_DATO, formatearPorcentaje, tonoDePorcentaje } from '@/dominio/gestion'
import type { CalidadGestion, HitoGestion } from '@/datos/portal'

/**
 * Cuánto salió bien a la primera, y cómo se reparte por {hito}.
 *
 * `porcentaje_primera_ronda` y `rondas_promedio` llegan en `null` cuando el mes no tuvo ninguna
 * aprobación resuelta. Es el caso donde el cero es más caro de todo el tablero: «0% a la primera» se
 * lee como un mes entero de retrabajo, y lo que pasó es que no hubo nada que aprobar.
 */
export function CalidadYRetrabajo (
  { calidad, porHito }: { calidad: CalidadGestion, porHito: HitoGestion[] }
) {
  const sinAprobaciones = calidad.resueltas === 0

  return (
    <Bloque titulo="Calidad y retrabajo">
      <div className="flex flex-col gap-6">
        <div className="grid gap-5 sm:grid-cols-3">
          <div className="flex flex-col gap-2">
            <Cifra
              etiqueta="Aprobado a la primera"
              valor={formatearPorcentaje(calidad.porcentaje_primera_ronda)}
              tono={tonoDePorcentaje(calidad.porcentaje_primera_ronda)}
              detalle={
                sinAprobaciones
                  ? 'Todavía no hay datos'
                  : `${calidad.aprobadas_primera_ronda} de ${calidad.resueltas} aprobaciones`
              }
            />
            {calidad.porcentaje_primera_ronda !== null && (
              <BarraProgreso porcentaje={calidad.porcentaje_primera_ronda} />
            )}
          </div>

          <Cifra
            etiqueta="Aprobaciones resueltas"
            valor={formatearNumero(calidad.resueltas)}
            detalle="Se cerraron en el mes"
          />

          <Cifra
            etiqueta="Rondas por aprobación"
            valor={calidad.rondas_promedio === null ? SIN_DATO : formatearNumero(calidad.rondas_promedio)}
            detalle={sinAprobaciones ? 'Todavía no hay datos' : 'Promedio de idas y vueltas'}
          />
        </div>

        {sinAprobaciones && (
          <Nota tono="aviso">
            Este mes no se resolvió ninguna aprobación, así que no hay porcentaje ni promedio que
            calcular. No es 0%: es que no hubo aprobaciones.
          </Nota>
        )}

        <PorHito hitos={porHito} />
      </div>
    </Bloque>
  )
}

/**
 * El cumplimiento repartido por {hito}.
 *
 * Es una tabla y no cinco tarjetas: son conteos comparables entre filas, y una tabla es la forma en
 * la que se comparan columnas de números sin que nadie tenga que saltar de caja en caja. Va en su
 * propio desplazador horizontal para que el cuerpo de la página nunca scrollee en horizontal.
 */
function PorHito ({ hitos }: { hitos: HitoGestion[] }) {
  if (hitos.length === 0) return null

  return (
    <section aria-label={`Cumplimiento por ${GLOSARIO.hito.singular}`}>
      <h3 className="text-texto text-sm font-semibold">Por {GLOSARIO.hito.singular}</h3>

      <div data-lenis-prevent className="mt-2 overflow-x-auto">
        <table className="w-full min-w-[30rem] border-collapse text-sm">
          <thead>
            <tr className="border-linea border-b">
              <th scope="col" className="text-texto-tenue px-2 py-2 text-left text-xs font-medium">
                {GLOSARIO.hito.singular}
              </th>
              <th scope="col" className="text-texto-tenue px-2 py-2 text-right text-xs font-medium">
                Comprometidas
              </th>
              <th scope="col" className="text-texto-tenue px-2 py-2 text-right text-xs font-medium">
                En plazo
              </th>
              <th scope="col" className="text-texto-tenue px-2 py-2 text-right text-xs font-medium">
                Cerradas
              </th>
              <th scope="col" className="text-texto-tenue px-2 py-2 text-right text-xs font-medium">
                Abiertas al cierre
              </th>
            </tr>
          </thead>
          <tbody>
            {hitos.map((hito) => (
              <tr key={hito.id ?? 'sin-hito'} className="border-linea-suave border-b last:border-b-0">
                <th scope="row" className="text-texto px-2 py-2 text-left font-normal">
                  {hito.name ?? `Sin ${GLOSARIO.hito.singular}`}
                </th>
                <td className="text-texto-tenue px-2 py-2 text-right tabular-nums">{hito.comprometidas}</td>
                <td className="text-texto px-2 py-2 text-right font-semibold tabular-nums">{hito.en_plazo}</td>
                <td className="text-texto-tenue px-2 py-2 text-right tabular-nums">{hito.cerradas}</td>
                <td className="text-texto-tenue px-2 py-2 text-right tabular-nums">{hito.abiertas_al_cierre}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-3">
        <Nota>
          La fila sin {GLOSARIO.hito.singular} agrupa lo que no cuelga de ninguno. No lleva porcentaje
          propio: con dos o tres {GLOSARIO.proceso.plural.toLowerCase()} por fila, un porcentaje salta
          de 0 a 100 con un solo caso y se lee como una tendencia.
        </Nota>
      </div>
    </section>
  )
}
